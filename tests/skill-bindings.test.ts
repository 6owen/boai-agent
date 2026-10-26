/*
 * [OUTPUT]: 本机源更新沿真实检查/原事务同步独立员工副本；冲突、源漂移、回滚、批量与重启覆盖。
 * [OUTPUT]: 备份忙时断言按现行公共资源错误文案，并核对未创建备份目录；原取消/退出/删除与副本断言保持。
 * [INPUT]: 真实 AppService/SQLite、本机发现目录、受管副本和不调用模型的隔离 fixture。
 * [OUTPUT]: D4 来源/hash/员工版本冻结、同事务授权/回执、幂等冲突和未知核对，配置竞争/原子回滚/重启零重放、hash 安全清理与外改保留、删除 tombstone 和备份迁移验收。
 * [POS]: 本机技能到已保存员工绑定的宿主集成回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { strToU8, zipSync } from 'fflate'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SkillBindingFiles, type BindingFiles } from '../packages/runtime/src/modules/resources/skill-binding-files'
import { inspectResourceTree } from '../packages/runtime/src/modules/resources/local-resources'
import { authorizedResources } from '../packages/runtime/src/modules/workspaces/environment-plan'
import type { DigitalAgent, Resource } from '../packages/shared/src/domain'
import type { BindLocalSkillInput, SkillBindingReceipt, SkillInstallation, SkillSource } from '../packages/shared/src/domain/skills'
import type { Method, Methods } from '../packages/shared/src/ipc'
import type { DownloadTransport } from '../packages/runtime/src/adapters/skills/download'

const roots: string[] = [], services: AppService[] = [], stores: ProductStore[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const service of services.splice(0)) await service.close()
  for (const store of stores.splice(0)) await store.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
const agentInput = ({ configVersion, workspaceRef: _, memoryNamespace: _memory, policyVersion: _policy, ...input }: DigitalAgent) => ({ ...input, expectedConfigVersion: configVersion })
async function setup(options: { skillDownloads?: DownloadTransport } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-skill-binding-')); roots.push(root)
  const dataPath = join(root, 'data'), homeDir = join(root, 'home')
  await mkdir(homeDir, { recursive: true })
  const model = vi.fn(async () => {})
  const start = async (path = dataPath) => {
    const service = new AppService({ dataPath: path, skillDiscovery: { homeDir }, engine: { run: model, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, ...options })
    services.push(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    const store = (service as unknown as { store: ProductStore }).store
    return { service, api, store }
  }
  return { root, dataPath, homeDir, model, start, ...await start() }
}
async function skill(home: string, name = 'report-helper', source = '.agents/skills', body = 'Only use approved reports.') {
  const path = join(home, source, name)
  await mkdir(join(path, 'references'), { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: Read approved reports\n---\n${body}`)
  await writeFile(join(path, 'references', 'guide.md'), 'private skill canary')
  return path
}
async function prepare(fixture: Awaited<ReturnType<typeof setup>>, agentId = 'researcher', localPath?: string) {
  const path = localPath ?? await skill(fixture.homeDir)
  const local = (await fixture.api('listLocalSkills', { refresh: true })).skills.find(value => value.path === path)!
  expect(local).toBeDefined()
  const agent = (await fixture.api('snapshot', undefined)).agents.find(value => value.id === agentId)!
  const plan = await fixture.api('prepareLocalSkillBinding', { localSkillId: local.id, agentId, expectedConfigVersion: agent.configVersion })
  const input: BindLocalSkillInput = { requestId: randomUUID(), planId: plan.id, localSkillId: plan.localSkillId, agentId, expectedConfigVersion: plan.expectedConfigVersion, contentHash: plan.contentHash }
  return { plan, input, path, agent }
}
async function binding(fixture: Awaited<ReturnType<typeof setup>>, agentId = 'researcher') {
  const selected = await prepare(fixture, agentId)
  const receipt = await fixture.api('bindLocalSkill', selected.input)
  expect(receipt.status).toBe('completed')
  expect(receipt.resource).toBeDefined(); expect(receipt.agent).toBeDefined()
  return { ...selected, receipt, resource: receipt.resource!, agent: receipt.agent! }
}
/** Inject one actual transaction failure after all preceding writes; SQLite must roll them back. */
function failCompletedTransaction(store: ProductStore) {
  const original = store.transaction.bind(store)
  return vi.spyOn(store, 'transaction').mockImplementation(operation => original(tx => operation({ ...tx, put: async record => {
    if (record.collection === 'skillOperations' && (record.value as { binding?: { receipt: SkillBindingReceipt } }).binding?.receipt.status === 'completed') throw new Error('fixture atomic commit failure')
    await tx.put(record)
  } })))
}

test('prepare and preview grant nothing; explicit bind commits exact source, installation, employee and receipt without executing code', async () => {
  const fixture = await setup(), { plan, input, path, agent } = await prepare(fixture)
  const preview = await fixture.api('getSkillPreview', { scanId: plan.id, candidateId: plan.candidateId })
  expect(preview.content).toContain('Only use approved reports.')
  expect(plan.contentHash).toBe((await inspectResourceTree(path)).hash)
  expect(plan.source).toMatchObject({ kind: 'local', reason: expect.stringContaining('未记录远程来源') })
  expect((await fixture.api('snapshot', undefined)).resources).toEqual([])
  expect(await fixture.store.load('skillOperations')).toEqual([])
  expect(await fixture.store.load('messages')).toEqual([]); expect(await fixture.store.load('workItems')).toEqual([])
  const receipt = await fixture.api('bindLocalSkill', input)
  expect(receipt).toMatchObject({ id: input.requestId, status: 'completed', contentHash: plan.contentHash, agent: { id: agent.id, configVersion: agent.configVersion + 1, skillIds: [receipt.resource!.id], allowCommands: false }, resource: { ownerAgentId: agent.id } })
  expect((await inspectResourceTree(receipt.resource!.path)).hash).toBe(plan.contentHash)
  expect(receipt.resource!.path).toBe(join(fixture.dataPath, 'skills', receipt.resource!.id, receipt.resource!.name))
  expect(await fixture.api('getSkillBindingReceipt', { requestId: input.requestId })).toEqual(receipt)
  expect(await fixture.api('listSkillInstallations', undefined)).toEqual([expect.objectContaining({ resourceId: receipt.resource!.id, localSkillId: plan.localSkillId, source: plan.source, contentHash: plan.contentHash })])
  expect(JSON.stringify(await fixture.api('listSkillInstallations', undefined))).not.toContain('ownership')
  const environment = (await fixture.api('getAgentHome', { agentId: agent.id })).environment
  expect(environment?.skills[0]).toMatchObject({ instructions: 'available', execution: 'disabled' })
  const snapshot = await fixture.api('snapshot', undefined)
  expect(snapshot.agents.filter(value => value.id !== agent.id).every(value => value.skillIds.length === 0)).toBe(true)
  const group = await fixture.api('createConversation', { kind: 'group', title: 'Skills authorization', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [] })
  expect(authorizedResources(receipt.agent!, group, snapshot.resources).map(value => value.id)).toEqual([receipt.resource!.id])
  expect(authorizedResources(snapshot.agents.find(value => value.id === 'writer')!, group, snapshot.resources)).toEqual([])
  const writer = snapshot.agents.find(value => value.id === 'writer')!
  await expect(fixture.api('saveAgent', { ...agentInput(writer), skillIds: [receipt.resource!.id] })).rejects.toThrow('其他员工')
  expect(fixture.model).not.toHaveBeenCalled()
})

test('lost response, duplicate callers and restart inspect the original receipt; changed input cannot reuse the key', async () => {
  const fixture = await setup(), { input, path } = await prepare(fixture)
  const [first, concurrent] = await Promise.all([fixture.api('bindLocalSkill', input), fixture.api('bindLocalSkill', input)])
  expect(['running', 'completed']).toContain(concurrent.status)
  expect(await fixture.api('getSkillBindingReceipt', { requestId: input.requestId })).toEqual(first)
  await expect(fixture.api('bindLocalSkill', { ...input, agentId: 'writer' })).rejects.toThrow('requestId')
  expect(await fixture.api('getSkillBindingReceipt', { requestId: 'never-submitted' })).toBeNull()
  await rm(path, { recursive: true })
  expect(await fixture.api('bindLocalSkill', input)).toEqual(first)
  await fixture.service.close()
  const restarted = await fixture.start()
  expect(await restarted.api('bindLocalSkill', input)).toEqual(first)
  expect(await restarted.api('getSkillBindingReceipt', { requestId: input.requestId })).toEqual(first)
  const snapshot = await restarted.api('snapshot', undefined)
  expect(snapshot.resources).toHaveLength(1)
  expect(snapshot.agents.find(value => value.id === 'researcher')!.configVersion).toBe(input.expectedConfigVersion + 1)
  expect((await inspectResourceTree(snapshot.resources[0].path)).hash).toBe(input.contentHash)
  expect(fixture.model).not.toHaveBeenCalled()
})

test('atomic commit failure rolls back resource, installation, employee version and completion and safely removes only this copy', async () => {
  const fixture = await setup(), { input, agent, path } = await prepare(fixture)
  const fail = failCompletedTransaction(fixture.store)
  const receipt = await fixture.api('bindLocalSkill', input)
  fail.mockRestore()
  expect(receipt).toMatchObject({ status: 'failed', error: 'fixture atomic commit failure' })
  expect(receipt.resource).toBeUndefined(); expect(receipt.agent).toBeUndefined()
  expect(await fixture.store.load('resources')).toEqual([]); expect(await fixture.store.load('skillInstallations')).toEqual([])
  expect((await fixture.api('snapshot', undefined)).agents.find(value => value.id === agent.id)).toEqual(agent)
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  expect((await inspectResourceTree(path)).hash).toBe(input.contentHash)
  expect(await fixture.api('bindLocalSkill', input)).toEqual(receipt)
  expect(fixture.model).not.toHaveBeenCalled()
})

test('a changed source or frozen employee version rejects admission, and a retargeted discovered link never binds a replacement', async () => {
  const fixture = await setup(), selected = await prepare(fixture)
  await writeFile(join(selected.path, 'references', 'guide.md'), 'changed after preview')
  await expect(fixture.api('getSkillPreview', { scanId: selected.plan.id, candidateId: selected.plan.candidateId })).rejects.toThrow('已变更')
  await expect(fixture.api('bindLocalSkill', selected.input)).rejects.toThrow('已变更')
  expect(await fixture.api('getSkillBindingReceipt', { requestId: selected.input.requestId })).toBeNull()
  const fresh = await prepare(fixture, 'researcher', selected.path)
  await fixture.api('saveAgent', { ...agentInput(fresh.agent), name: 'renamed' })
  await expect(fixture.api('bindLocalSkill', fresh.input)).rejects.toThrow('配置已变更')
  const other = await skill(fixture.homeDir, 'other-helper'), linkPath = join(fixture.homeDir, '.claude/skills/linked')
  const standalone = await skill(fixture.root, 'linked-helper', 'external')
  await mkdir(join(fixture.homeDir, '.claude/skills'), { recursive: true }); await symlink(standalone, linkPath)
  const linked = await prepare(fixture, 'writer', linkPath)
  await rm(linkPath); await symlink(other, linkPath)
  await expect(fixture.api('bindLocalSkill', linked.input)).rejects.toThrow('目录已变化')
  expect((await fixture.api('snapshot', undefined)).resources).toEqual([])
})

test('a concurrent configuration committed while files are prepared wins; stale binding rolls back and cleans the real copy', async () => {
  const fixture = await setup(), { input, agent } = await prepare(fixture)
  const copied = deferred(), release = deferred(), original = SkillBindingFiles.prototype.prepare
  const pause = vi.spyOn(SkillBindingFiles.prototype, 'prepare').mockImplementation(async function (this: SkillBindingFiles, ...args) {
    const result = await original.apply(this, args); copied.resolve(); await release.promise; return result
  })
  const pending = fixture.api('bindLocalSkill', input)
  await copied.promise
  const updated = await fixture.api('saveAgent', { ...agentInput(agent), name: 'new authoritative config' }).finally(release.resolve)
  const receipt = await pending; pause.mockRestore()
  expect(receipt).toMatchObject({ status: 'failed', error: expect.stringContaining('配置已变更') })
  expect((await fixture.api('snapshot', undefined)).agents.find(value => value.id === agent.id)).toEqual(updated)
  expect(await fixture.store.load('resources')).toEqual([]); expect(await fixture.store.load('skillInstallations')).toEqual([])
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
})

test('known remote origin is retained, unknown local origin stays local, and same-name different source is never silently reused', async () => {
  const fixture = await setup(), selected = await prepare(fixture)
  const origin: SkillSource = { kind: 'git', identity: 'git:known-repository/report-helper', repository: 'https://github.com/example/known-repository', ref: 'main', skillPath: 'skills/report-helper', resolvedCommit: 'abc123' }
  await fixture.store.write([{ collection: 'skillInstallations', id: selected.plan.localSkillId, value: { resourceId: selected.plan.localSkillId, revision: 2, source: origin, contentHash: selected.plan.contentHash, installedAt: new Date().toISOString() } satisfies SkillInstallation }])
  const known = await prepare(fixture, 'researcher', selected.path)
  expect(known.plan.source).toEqual(origin)
  const receipt = await fixture.api('bindLocalSkill', known.input)
  expect(receipt.source).toEqual(origin)
  const installed = await fixture.api('getSkillDetail', { resourceId: receipt.resource!.id })
  expect(installed.installation?.source).toEqual(origin)
  const second = await skill(fixture.homeDir, 'alternate-source', '.codex/skills')
  await writeFile(join(second, 'SKILL.md'), await readFile(join(selected.path, 'SKILL.md')))
  await expect(prepare(fixture, 'researcher', second)).rejects.toThrow('同名但来源或内容不同')
  const writer = await prepare(fixture, 'writer', second)
  expect(writer.plan.source.kind).toBe('local')
  const other = await fixture.api('bindLocalSkill', writer.input)
  expect(other.resource!.id).not.toBe(receipt.resource!.id)
  expect((await inspectResourceTree(other.resource!.path)).hash).toBe(receipt.contentHash)
  const next = await prepare(fixture, 'researcher', selected.path)
  expect(next.plan.existingResourceId).toBe(receipt.resource!.id)
  const reused = await fixture.api('bindLocalSkill', next.input)
  expect(reused.resource!.id).toBe(receipt.resource!.id)
  expect(reused.agent!.configVersion).toBe(receipt.agent!.configVersion)
  expect((await fixture.api('snapshot', undefined)).resources).toHaveLength(2)
})

test('a second SQLite connection changes the authoritative config after preview; cached employee state cannot commit stale permission', async () => {
  const fixture = await setup(), { input, agent } = await prepare(fixture)
  const other = new ProductStore(fixture.store.filename); stores.push(other); await other.init()
  const updated = { ...agent, configVersion: agent.configVersion + 1, name: 'other connection wins' }
  await other.transaction(tx => tx.put({ collection: 'agents', id: agent.id, value: updated }))
  const receipt = await fixture.api('bindLocalSkill', input)
  expect(receipt).toMatchObject({ status: 'failed', error: expect.stringContaining('配置已变更') })
  expect(await other.transaction(tx => tx.get('agents', agent.id))).toEqual(updated)
  expect(await other.load('resources')).toEqual([]); expect(await other.load('skillInstallations')).toEqual([])
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
})

test('an ACP employee or unsaved employee never receives a preparation, operation or resource', async () => {
  const fixture = await setup(), selected = await prepare(fixture)
  const writer = (await fixture.api('snapshot', undefined)).agents.find(value => value.id === 'writer')!
  const profile = await fixture.api('saveLaunchProfile', { name: 'saved without execution', executable: process.execPath, args: [], useExistingLogin: false, hostAccessAcknowledged: true })
  const acp = await fixture.api('saveAgent', { ...agentInput(writer), executionBackend: { kind: 'acp-local', profileId: profile.id } })
  await expect(fixture.api('prepareLocalSkillBinding', { localSkillId: selected.plan.localSkillId, agentId: acp.id, expectedConfigVersion: acp.configVersion })).rejects.toThrow('外部任务后端')
  await expect(fixture.api('prepareLocalSkillBinding', { localSkillId: selected.plan.localSkillId, agentId: 'not-yet-saved', expectedConfigVersion: 1 })).rejects.toThrow('员工不存在')
  expect(await fixture.store.load('skillOperations')).toEqual([])
  expect((await fixture.api('snapshot', undefined)).resources).toEqual([])
  expect(fixture.model).not.toHaveBeenCalled()
})

async function seedInterrupted(fixture: Awaited<ReturnType<typeof setup>>, external = false, partial = false) {
  const { plan, input, path, agent } = await prepare(fixture)
  const tree = await inspectResourceTree(path)
  const files: BindingFiles = { resourceId: randomUUID(), name: 'report-helper', contentHash: plan.contentHash, files: tree.files, ownership: randomUUID() }
  if (partial) {
    const stage = join(fixture.dataPath, 'skills', `.binding-${files.resourceId}`)
    await mkdir(join(stage, files.name), { recursive: true })
    await writeFile(join(stage, '.boai-binding-owner'), files.ownership)
    await writeFile(join(stage, files.name, 'SKILL.md'), await readFile(join(path, 'SKILL.md')))
  } else {
    const copied = await new SkillBindingFiles(fixture.dataPath).prepare(path, files, 'report skill', new AbortController().signal)
    if (external) await writeFile(join(copied.path, 'references/guide.md'), 'external edit must be preserved')
  }
  const receipt: SkillBindingReceipt = { id: input.requestId, planId: input.planId, localSkillId: input.localSkillId, agentId: input.agentId, expectedConfigVersion: input.expectedConfigVersion, contentHash: input.contentHash, source: plan.source, createdAt: new Date().toISOString(), status: 'running' }
  const fingerprint = createHash('sha256').update(JSON.stringify([input.planId, input.localSkillId, input.agentId, input.expectedConfigVersion, input.contentHash])).digest('hex')
  await fixture.store.write([{ collection: 'skillOperations', id: input.requestId, value: { id: input.requestId, kind: 'binding', scanId: plan.id, fingerprint, status: 'running', ownerAgentId: agent.id, plannedIds: { [plan.candidateId]: files.resourceId }, items: [{ candidateId: plan.candidateId, name: files.name, status: 'pending' }], binding: { receipt, files } } }])
  await rm(path, { recursive: true })
  await fixture.service.close()
  return { input, files, agent }
}
test.each([false, true])('restart only invalidates and safely cleans an uncommitted complete/partial copy (partial=%s), never reads source or replays binding', async partial => {
  const fixture = await setup(), { input, files, agent } = await seedInterrupted(fixture, false, partial)
  const copy = vi.spyOn(SkillBindingFiles.prototype, 'prepare')
  const restarted = await fixture.start()
  const receipt = await restarted.api('getSkillBindingReceipt', { requestId: input.requestId })
  expect(receipt).toMatchObject({ status: 'interrupted', error: expect.stringContaining('未提交') })
  expect(receipt!.cleanupError).toBeUndefined()
  expect(await restarted.api('bindLocalSkill', input)).toEqual(receipt)
  expect(await readdir(join(fixture.dataPath, 'skills'))).not.toContain(files.resourceId)
  expect(await readdir(join(fixture.dataPath, 'skills'))).not.toContain(`.binding-${files.resourceId}`)
  expect((await restarted.api('snapshot', undefined)).agents.find(value => value.id === agent.id)!.configVersion).toBe(agent.configVersion)
  expect(await restarted.store.load('resources')).toEqual([]); expect(await restarted.store.load('skillInstallations')).toEqual([])
  expect(copy).not.toHaveBeenCalled(); expect(fixture.model).not.toHaveBeenCalled()
})
test('restart preserves an externally changed uncommitted copy, exposes the conflict and refuses replay with the old key', async () => {
  const fixture = await setup(), { input, files } = await seedInterrupted(fixture, true)
  const copiedPath = join(fixture.dataPath, 'skills', files.resourceId, files.name)
  const copy = vi.spyOn(SkillBindingFiles.prototype, 'prepare')
  const restarted = await fixture.start()
  const receipt = await restarted.api('getSkillBindingReceipt', { requestId: input.requestId })
  expect(receipt).toMatchObject({ status: 'interrupted', cleanupError: expect.stringContaining('外部修改') })
  expect(await readFile(join(copiedPath, 'references/guide.md'), 'utf8')).toBe('external edit must be preserved')
  expect(await restarted.api('bindLocalSkill', input)).toEqual(receipt)
  expect(await restarted.store.load('resources')).toEqual([])
  expect(copy).not.toHaveBeenCalled(); expect(fixture.model).not.toHaveBeenCalled()
})

test('lost SQLite commit acknowledgement is resolved read-only and never deletes an already committed copy or increments twice', async () => {
  const fixture = await setup(), { input } = await prepare(fixture)
  const original = fixture.store.transaction.bind(fixture.store)
  let lost = false
  const acknowledgement = vi.spyOn(fixture.store, 'transaction').mockImplementation(async operation => {
    let completed = false
    const value = await original(tx => operation({ ...tx, put: async record => {
      if (record.collection === 'skillOperations' && (record.value as { binding?: { receipt: SkillBindingReceipt } }).binding?.receipt.status === 'completed') completed = true
      await tx.put(record)
    } }))
    if (completed && !lost) { lost = true; throw new Error('commit acknowledgement disappeared') }
    return value
  })
  const receipt = await fixture.api('bindLocalSkill', input); acknowledgement.mockRestore()
  expect(lost).toBe(true); expect(receipt.status).toBe('completed')
  expect((await inspectResourceTree(receipt.resource!.path)).hash).toBe(input.contentHash)
  expect(receipt.agent!.configVersion).toBe(input.expectedConfigVersion + 1)
  expect(await fixture.api('bindLocalSkill', input)).toEqual(receipt)
  expect((await fixture.api('snapshot', undefined)).resources).toHaveLength(1)
})

test('resource removal clears private completion snapshots and old keys, while matching copies are actually cleaned', async () => {
  const fixture = await setup(), { input, resource } = await binding(fixture)
  await fixture.api('removeResource', { id: resource.id })
  expect((await fixture.api('snapshot', undefined)).resources).toEqual([])
  expect((await fixture.api('snapshot', undefined)).agents.find(value => value.id === 'researcher')!.skillIds).toEqual([])
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  await expect(fixture.api('getSkillBindingReceipt', { requestId: input.requestId })).rejects.toThrow('已清理')
  await expect(fixture.api('bindLocalSkill', input)).rejects.toThrow('已清理')
  const journal = await fixture.store.load<{ id: string; fingerprint: string; cleared?: boolean }>('skillOperations')
  expect(journal).toEqual([{ id: input.requestId, kind: 'binding', fingerprint: expect.any(String), cleared: true, scanId: '', status: 'interrupted', items: [] }])
  expect(JSON.stringify(journal)).not.toContain(resource.path)
  expect(await fixture.api('listSkillOperations', undefined)).toEqual([])
  expect(fixture.model).not.toHaveBeenCalled()
})

test('resource removal preserves externally modified copy with visible hash cleanup conflict; restart only retries cleanup and never restores authorization', async () => {
  const fixture = await setup(), { input, resource } = await binding(fixture)
  await writeFile(join(resource.path, 'references/guide.md'), 'external modification')
  await expect(fixture.api('removeResource', { id: resource.id })).rejects.toThrow('清理未完成')
  expect(await readFile(join(resource.path, 'references/guide.md'), 'utf8')).toBe('external modification')
  expect(await fixture.api('listResourceCleanups', undefined)).toEqual([expect.objectContaining({ id: resource.id, status: 'failed', error: expect.stringContaining('外部修改') })])
  await fixture.service.close(); const restarted = await fixture.start()
  expect((await restarted.api('snapshot', undefined)).resources).toEqual([])
  await expect(restarted.api('getSkillBindingReceipt', { requestId: input.requestId })).rejects.toThrow('已清理')
  await expect(restarted.api('bindLocalSkill', input)).rejects.toThrow('已清理')
  expect(await readFile(join(resource.path, 'references/guide.md'), 'utf8')).toBe('external modification')
  expect(fixture.model).not.toHaveBeenCalled()
})

test.each([false, true])('employee deletion clears only D4 owned copies by hash, preserves other employees and tombstones receipts (external=%s)', async external => {
  const fixture = await setup(), { input, resource } = await binding(fixture)
  const writer = (await fixture.api('snapshot', undefined)).agents.find(value => value.id === 'writer')!
  if (external) await writeFile(join(resource.path, 'references/guide.md'), 'employee deletion external edit')
  await fixture.api('deleteAgent', { id: 'researcher' })
  const snapshot = await fixture.api('snapshot', undefined)
  expect(snapshot.agents.some(value => value.id === 'researcher')).toBe(false)
  expect(snapshot.agents.find(value => value.id === 'writer')).toEqual(writer)
  expect(snapshot.resources).toEqual([])
  await expect(fixture.api('getSkillBindingReceipt', { requestId: input.requestId })).rejects.toThrow('已清理')
  await expect(fixture.api('bindLocalSkill', input)).rejects.toThrow('已清理')
  if (external) {
    expect(await readFile(join(resource.path, 'references/guide.md'), 'utf8')).toBe('employee deletion external edit')
    expect((await fixture.api('listResourceCleanups', undefined))[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('外部修改') })
  } else expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  await fixture.service.close(); const restarted = await fixture.start()
  expect((await restarted.api('snapshot', undefined)).agents.some(value => value.id === 'researcher')).toBe(false)
  await expect(restarted.api('bindLocalSkill', input)).rejects.toThrow('已清理')
  if (external) expect(await readFile(join(resource.path, 'references/guide.md'), 'utf8')).toBe('employee deletion external edit')
  expect(fixture.model).not.toHaveBeenCalled()
})

test('backup restored at a different root retains committed binding, source and content without source reread; removal uses the relocated owned copy', async () => {
  const fixture = await setup(), { input, resource, receipt } = await binding(fixture)
  const backup = join(fixture.root, 'backup'), restored = join(fixture.root, 'restored')
  await fixture.service.backup(backup)
  await fixture.service.close()
  await rm(fixture.homeDir, { recursive: true })
  await cp(backup, restored, { recursive: true })
  const destination = await fixture.start(restored)
  const snapshot = await destination.api('snapshot', undefined), relocated = snapshot.resources[0]
  expect(relocated.id).toBe(resource.id)
  expect(relocated.path).toBe(join(restored, 'skills', resource.id, resource.name))
  expect((await inspectResourceTree(relocated.path)).hash).toBe(input.contentHash)
  expect((await destination.api('getSkillDetail', { resourceId: relocated.id })).installation?.source).toEqual(receipt.source)
  expect(snapshot.agents.find(value => value.id === 'researcher')!.skillIds).toEqual([resource.id])
  expect(snapshot.agents.find(value => value.id === 'researcher')!.configVersion).toBe(receipt.agent!.configVersion)
  expect((await destination.api('getSkillBindingReceipt', { requestId: input.requestId }))?.resource?.path).toBe(relocated.path)
  expect((await destination.api('bindLocalSkill', input)).resource?.path).toBe(relocated.path)
  await destination.api('removeResource', { id: resource.id })
  expect(await readdir(join(restored, 'skills'))).toEqual([])
  expect((await inspectResourceTree(resource.path)).hash).toBe(input.contentHash)
  await expect(destination.api('bindLocalSkill', input)).rejects.toThrow('已清理')
  expect(fixture.model).not.toHaveBeenCalled()
})

test('changed installation origin invalidates the frozen plan even when local bytes did not change', async () => {
  const fixture = await setup(), { plan, input } = await prepare(fixture)
  await fixture.store.write([{ collection: 'skillInstallations', id: plan.localSkillId, value: { resourceId: plan.localSkillId, revision: 1, contentHash: plan.contentHash, source: { kind: 'git', identity: 'new origin', repository: 'https://github.com/example/new-origin', ref: 'main', skillPath: '.' }, installedAt: new Date().toISOString() } satisfies SkillInstallation }])
  await expect(fixture.api('bindLocalSkill', input)).rejects.toThrow('来源记录已变更')
  expect(await fixture.api('getSkillBindingReceipt', { requestId: input.requestId })).toBeNull()
  expect((await fixture.api('snapshot', undefined)).resources).toEqual([])
})

test('cancel and exit retain ownership until the real file preparation returns; backup/deletion cannot race and cancelled copies never become authorized', async () => {
  const fixture = await setup(), { input } = await prepare(fixture)
  const copied = deferred(), release = deferred(), original = SkillBindingFiles.prototype.prepare
  let actual: Resource | undefined
  const pause = vi.spyOn(SkillBindingFiles.prototype, 'prepare').mockImplementation(async function (this: SkillBindingFiles, ...args) {
    actual = await original.apply(this, args); copied.resolve(); await release.promise; return actual
  })
  const pending = fixture.api('bindLocalSkill', input); await copied.promise
  try {
    await expect(fixture.service.backup(join(fixture.root, 'blocked-backup'))).rejects.toThrow('有任务、材料准备或资源管理操作正在执行或等待修复，请先停止或完成后备份')
    await expect(readdir(join(fixture.root, 'blocked-backup'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fixture.api('deleteAgent', { id: 'researcher' })).rejects.toThrow('技能管理操作')
    await fixture.api('cancelSkillOperation', { id: input.requestId })
    expect((await fixture.api('getSkillBindingReceipt', { requestId: input.requestId }))?.status).toBe('running')
    expect((await inspectResourceTree(actual!.path)).hash).toBe(input.contentHash)
    let closed = false
    const closing = fixture.service.close().then(() => { closed = true })
    await new Promise(done => setTimeout(done, 20))
    expect(closed).toBe(false)
    release.resolve(); await pending; await closing
  } finally { release.resolve(); pause.mockRestore() }
  const restarted = await fixture.start()
  expect((await restarted.api('getSkillBindingReceipt', { requestId: input.requestId }))?.status).toBe('interrupted')
  expect((await restarted.api('snapshot', undefined)).resources).toEqual([])
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  expect(fixture.model).not.toHaveBeenCalled()
})

test.each([false, true])('an explicit remote update synchronizes only D4 copy hash evidence in the final transaction and rollback preserves old evidence (fail=%s)', async fail => {
  let body = 'Original reviewed content'
  const downloads = vi.fn<DownloadTransport>(async () => ({ status: 200, body: Readable.from([zipSync({ 'SKILL.md': strToU8(`---\nname: report-helper\ndescription: Read approved reports\n---\n${body}`), 'references/guide.md': strToU8('versioned reference') })]) }))
  const fixture = await setup({ skillDownloads: downloads })
  const scan = await fixture.api('scanSkillSource', { source: 'https://example.com/report-helper.zip', kind: 'url', target: 'local' })
  const install = await fixture.api('installSkills', { requestId: 'actual-local-install', scanId: scan.id, candidateIds: [scan.candidates[0].id], addToFavorites: false })
  await vi.waitFor(async () => expect((await fixture.api('getSkillOperation', { id: install.id })).status).toBe('completed'))
  const selected = await prepare(fixture, 'researcher', join(fixture.homeDir, '.agents/skills/report-helper'))
  const bound = await fixture.api('bindLocalSkill', selected.input), resource = bound.resource!
  const before = await fixture.store.transaction(tx => tx.get<SkillInstallation & { bindingCopy: BindingFiles }>('skillInstallations', resource.id))
  expect(before!.source.kind).toBe('url')
  body = 'Explicitly reviewed newer content'
  const check = await fixture.api('checkSkillUpdate', { id: resource.id })
  expect(check.status).toBe('available')
  expect((await inspectResourceTree(resource.path)).hash).toBe(before!.contentHash)
  const original = fixture.store.transaction.bind(fixture.store)
  let injected = false
  const failure = fail ? vi.spyOn(fixture.store, 'transaction').mockImplementation(operation => original(tx => operation({ ...tx, put: async record => {
    if (!injected && record.collection === 'skillInstallations' && record.id === resource.id && (record.value as SkillInstallation).revision === before!.revision + 1) { injected = true; throw new Error('fixture update commit rollback') }
    await tx.put(record)
  } }))) : undefined
  const updated = await fixture.api('updateSkill', { requestId: `explicit-update-${fail}`, planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! })
  await vi.waitFor(async () => expect((await fixture.api('getSkillOperation', { id: updated.id })).status).not.toBe('running'))
  failure?.mockRestore()
  const after = await fixture.store.transaction(tx => tx.get<SkillInstallation & { bindingCopy: BindingFiles }>('skillInstallations', resource.id))
  if (fail) {
    expect(injected).toBe(true); expect(after).toEqual(before)
    expect((await inspectResourceTree(resource.path)).hash).toBe(before!.contentHash)
    expect((await fixture.api('getSkillOperation', { id: updated.id })).items[0].status).toBe('failed')
  } else {
    expect(after!.contentHash).not.toBe(before!.contentHash)
    expect(after!.bindingCopy).toMatchObject({ resourceId: before!.bindingCopy.resourceId, ownership: before!.bindingCopy.ownership, contentHash: after!.contentHash })
    expect(after!.bindingCopy.files).toEqual((await inspectResourceTree(resource.path)).files)
    expect((await inspectResourceTree(join(fixture.homeDir, '.agents/skills/report-helper'))).hash).toBe(before!.contentHash)
  }
  await fixture.api('removeResource', { id: resource.id })
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  expect(fixture.model).not.toHaveBeenCalled()
})

async function applyCheckedUpdate(fixture: Awaited<ReturnType<typeof setup>>, resourceId: string, replaceLocalChanges = false) {
  const check = await fixture.api('checkSkillUpdate', { id: resourceId })
  expect(check.status).toBe('available')
  const input = { requestId: randomUUID(), planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash!, replaceLocalChanges }
  const operation = await fixture.api('updateSkill', input)
  await vi.waitFor(async () => expect((await fixture.api('getSkillOperation', { id: operation.id })).status).not.toBe('running'))
  return { check, input, result: await fixture.api('getSkillOperation', { id: operation.id }) }
}

test('local binding update preserves identities, updates one employee only and survives restart with valid cleanup evidence', async () => {
  const fixture = await setup(), first = await binding(fixture)
  const secondPlan = await prepare(fixture, 'writer', first.path)
  const second = await fixture.api('bindLocalSkill', secondPlan.input)
  const oldInstallation = (await fixture.store.load<SkillInstallation & { bindingCopy: BindingFiles }>('skillInstallations')).find(value => value.resourceId === first.resource.id)!
  const installations = await fixture.api('executeApplicationOperation', { operation: 'skills.installations', input: {} })
  expect(installations).toMatchObject({ status: 'succeeded', data: expect.arrayContaining([expect.objectContaining({ resourceId: first.resource.id, localSkillId: first.plan.localSkillId })]) })
  expect(JSON.stringify(installations)).not.toContain('ownership')
  expect(await fixture.api('executeApplicationOperation', { operation: 'skills.boundDetail', input: { id: first.resource.id } })).toMatchObject({ status: 'succeeded', data: { resource: { id: first.resource.id }, contentHash: oldInstallation.contentHash, content: expect.stringContaining('Only use approved reports.') } })
  expect((await fixture.api('checkSkillUpdate', { id: first.resource.id })).status).toBe('current')
  const newBody = '---\nname: report-helper\ndescription: Updated report workflow\n---\nRead evidence, then answer.'
  await writeFile(join(first.path, 'SKILL.md'), newBody)
  await rm(join(first.path, 'references/guide.md'))
  await writeFile(join(first.path, 'references/new.md'), 'new evidence guide')
  const { check, input, result } = await applyCheckedUpdate(fixture, first.resource.id)
  expect(check).toMatchObject({ localModified: false, source: oldInstallation.source, fileChanges: { added: ['references/new.md'], removed: ['references/guide.md'], modified: ['SKILL.md'] }, affectedEmployees: [{ id: 'researcher', name: first.agent.name }] })
  expect(result.status).toBe('completed')
  expect(await fixture.api('updateSkill', input)).toEqual(result)
  const snapshot = await fixture.api('snapshot', undefined)
  expect(snapshot.agents.find(agent => agent.id === 'researcher')).toMatchObject({ skillIds: [first.resource.id], configVersion: first.agent.configVersion + 1 })
  expect(snapshot.agents.find(agent => agent.id === 'writer')).toEqual(second.agent)
  expect(await readFile(join(first.resource.path, 'SKILL.md'), 'utf8')).toBe(newBody)
  expect(await readFile(join(second.resource!.path, 'SKILL.md'), 'utf8')).not.toBe(newBody)
  const installation = (await fixture.store.load<SkillInstallation & { bindingCopy: BindingFiles }>('skillInstallations')).find(value => value.resourceId === first.resource.id)!
  expect(installation).toMatchObject({ localSkillId: oldInstallation.localSkillId, source: oldInstallation.source, revision: oldInstallation.revision + 1, bindingCopy: { resourceId: oldInstallation.bindingCopy.resourceId, ownership: oldInstallation.bindingCopy.ownership } })
  expect(installation.contentHash).toBe((await inspectResourceTree(first.resource.path)).hash)
  expect(installation.bindingCopy.files).toEqual((await inspectResourceTree(first.resource.path)).files)
  await fixture.service.close()
  const restarted = await fixture.start()
  expect((await restarted.api('checkSkillUpdate', { id: first.resource.id })).status).toBe('current')
  expect(await restarted.api('updateSkill', input)).toMatchObject({ status: 'completed' })
  await restarted.api('removeResource', { id: first.resource.id })
  await expect(readFile(join(first.resource.path, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(first.path, 'SKILL.md'), 'utf8')).toBe(newBody)
  expect(await readFile(join(second.resource!.path, 'SKILL.md'), 'utf8')).not.toBe(newBody)
  expect(fixture.model).not.toHaveBeenCalled()
})

test('local binding update preserves custom employee content unless explicitly replaced', async () => {
  const fixture = await setup(), bound = await binding(fixture)
  const source = await readFile(join(bound.path, 'SKILL.md'), 'utf8')
  await writeFile(join(bound.path, 'SKILL.md'), source + '\nSource v2')
  await writeFile(join(bound.resource.path, 'SKILL.md'), source + '\nEmployee customization')
  const check = await fixture.api('checkSkillUpdate', { id: bound.resource.id })
  expect(check).toMatchObject({ status: 'available', localModified: true })
  const input = { requestId: randomUUID(), planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! }
  await expect(fixture.api('updateSkill', input)).rejects.toThrow('本地修改')
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toContain('Employee customization')
  const { result } = await applyCheckedUpdate(fixture, bound.resource.id, true)
  expect(result.status).toBe('completed')
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toBe(source + '\nSource v2')
  expect(fixture.model).not.toHaveBeenCalled()
})

test('changed local source after preview cannot install unreviewed bytes or increment the employee version', async () => {
  const fixture = await setup(), bound = await binding(fixture)
  const original = await readFile(join(bound.path, 'SKILL.md'), 'utf8')
  await writeFile(join(bound.path, 'SKILL.md'), original + '\nReviewed v2')
  const check = await fixture.api('checkSkillUpdate', { id: bound.resource.id })
  expect(check.status).toBe('available')
  await writeFile(join(bound.path, 'SKILL.md'), original + '\nUnreviewed v3')
  const input = { requestId: randomUUID(), planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! }
  // The original update pipeline acquires the preview, copies it and verifies its frozen hash.
  const operation = await fixture.api('updateSkill', input)
  await vi.waitFor(async () => expect((await fixture.api('getSkillOperation', { id: operation.id })).status).not.toBe('running'))
  expect((await fixture.api('getSkillOperation', { id: operation.id })).status).toBe('interrupted')
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toBe(original)
  expect((await fixture.api('snapshot', undefined)).agents.find(agent => agent.id === bound.agent.id)?.configVersion).toBe(bound.agent.configVersion)
})

test.each(['missing', 'renamed'] as const)('local binding update refuses a %s source without changing the usable employee copy', async kind => {
  const fixture = await setup(), bound = await binding(fixture)
  const original = await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')
  if (kind === 'missing') await rm(bound.path, { recursive: true })
  else await writeFile(join(bound.path, 'SKILL.md'), '---\nname: different-skill\ndescription: Different identity\n---\nNew contents')
  const check = await fixture.api('checkSkillUpdate', { id: bound.resource.id })
  expect(check.status).toBe('failed')
  expect(check.planId).toBeUndefined()
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toBe(original)
  expect((await fixture.api('snapshot', undefined)).agents.find(agent => agent.id === bound.agent.id)?.configVersion).toBe(bound.agent.configVersion)
})

test('batch checks include local-bound employee copies but local-only scope never changes their files', async () => {
  const fixture = await setup(), bound = await binding(fixture)
  const original = await readFile(join(bound.path, 'SKILL.md'), 'utf8')
  await writeFile(join(bound.path, 'SKILL.md'), original + '\nNew source')
  const batch = await fixture.api('checkAllSkillUpdates', { requestId: 'check-bound-source' })
  expect(batch.items).toContainEqual(expect.objectContaining({ resourceId: bound.resource.id }))
  await vi.waitFor(async () => expect((await fixture.api('getSkillUpdateBatch', undefined))?.status).toBe('completed'))
  expect((await fixture.api('getSkillUpdateBatch', undefined))?.items).toContainEqual(expect.objectContaining({ resourceId: bound.resource.id, status: 'available' }))
  const local = await fixture.api('checkAllSkillUpdates', { requestId: 'check-local-only', scope: 'local' })
  expect(local.items.some(item => item.resourceId === bound.resource.id)).toBe(false)
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toBe(original)
  expect(fixture.model).not.toHaveBeenCalled()
})

test('matching upstream bytes with a stale installation baseline require explicit adoption and repair cleanup evidence without changing content', async () => {
  const fixture = await setup(), bound = await binding(fixture)
  const content = (await readFile(join(bound.path, 'SKILL.md'), 'utf8')) + '\nManually synchronized source'
  await writeFile(join(bound.path, 'SKILL.md'), content)
  await writeFile(join(bound.resource.path, 'SKILL.md'), content)
  const check = await fixture.api('checkSkillUpdate', { id: bound.resource.id })
  expect(check).toMatchObject({ status: 'available', localModified: true, fileChanges: { added: [], removed: [], modified: [] } })
  expect(check.candidateHash).toBe(check.expectedHash)
  const old = (await fixture.store.load<SkillInstallation>('skillInstallations')).find(item => item.resourceId === bound.resource.id)!
  await expect(fixture.api('updateSkill', { requestId: 'no-adoption', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! })).rejects.toThrow('本地修改')
  const { result } = await applyCheckedUpdate(fixture, bound.resource.id, true)
  expect(result.status).toBe('completed')
  expect(await readFile(join(bound.resource.path, 'SKILL.md'), 'utf8')).toBe(content)
  const current = (await fixture.store.load<SkillInstallation & { bindingCopy: BindingFiles }>('skillInstallations')).find(item => item.resourceId === bound.resource.id)!
  expect(current.revision).toBe(old.revision + 1)
  expect(current.contentHash).toBe(check.candidateHash)
  expect(current.bindingCopy.contentHash).toBe(current.contentHash)
  expect((await fixture.api('checkSkillUpdate', { id: bound.resource.id })).status).toBe('current')
  await fixture.api('removeResource', { id: bound.resource.id })
  expect(await readdir(join(fixture.dataPath, 'skills'))).toEqual([])
  expect(await readFile(join(bound.path, 'SKILL.md'), 'utf8')).toBe(content)
})
