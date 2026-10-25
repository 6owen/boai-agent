/*
 * [OUTPUT]: 安装不授权限按安装前真实员工配置比较，兼容bobo已有高权限预设，不再假定全员禁用命令。
 * [OUTPUT]: 安装中备份阻断沿统一资源管理错误文案，原取消/复制目录清理及之后真实备份断言保持。
 * [INPUT]: 真实 AppService/SQLite、完整 ZIP、受控 HTTPS/GitHub/商店响应与取消信号。
 * [OUTPUT]: 场景独立 home 隔离本机扫描；真实更新写入断点快照恢复与上游名称/路径变更拒绝；安装取消/备份竞争、实际包与来源、更新确认/回滚、批量检查、使用阻断和删除清理验证。
 * [POS]: Skills 多来源安装集成回归；不访问真实网络或执行包内代码。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { Readable } from 'node:stream'
import { strToU8, zipSync } from 'fflate'
import { AppService } from '../packages/runtime/src/service'
import type { Method, Methods } from '../packages/shared/src/ipc'
import type { Resource } from '../packages/shared/src/domain'
import type { SkillScan } from '../packages/shared/src/domain/skills'
import type { DownloadTransport } from '../packages/runtime/src/adapters/skills/download'
import { githubRepository } from '../packages/runtime/src/adapters/skills/source'
import { ProductStore, type RecordTransaction } from '../packages/runtime/src/adapters/storage/product-store'
import { inspectResourceTree } from '../packages/runtime/src/modules/resources/local-resources'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import type { WorkRepository } from '../packages/runtime/src/modules/collaboration/work-repository'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const document = (name = 'report-helper', body = 'Reviewed instructions') => `---\nname: ${name}\ndescription: Read reports\n---\n${body}`
const archive = (files: Record<string, string | Uint8Array>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, typeof value === 'string' ? strToU8(value) : value])), { level: 1 }))
const response = (bytes: Buffer) => ({ status: 200, body: Readable.from([bytes]) })
async function setup(options: { skillDownloads?: DownloadTransport; skillMarketplaceFetch?: typeof fetch; engine?: AgentEngine } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-install-')); roots.push(root)
  const dataPath = join(root, 'data')
  const start = async (location = dataPath) => {
    const service = new AppService({ dataPath: location, skillDiscovery: { homeDir: join(root, 'isolated-home') }, engine: { run: async () => {}, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, ...options })
    services.push(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    return { service, api }
  }
  return { root, dataPath, start, ...await start() }
}
type Api = Awaited<ReturnType<typeof setup>>['api']
async function install(api: Api, scan: SkillScan, requestId: string = crypto.randomUUID()) {
  const operation = await api('installSkills', { requestId, scanId: scan.id, candidateIds: scan.candidates.map(value => value.id), addToFavorites: false })
  let result = operation
  await vi.waitFor(async () => { result = await api('getSkillOperation', { id: operation.id }); expect(result.status).not.toBe('running') })
  return result
}
async function staged(dataPath: string) { return readdir(join(dataPath, 'skill-staging')).catch(error => { if (error.code === 'ENOENT') return []; throw error }) }

test('ZIP preview inspects actual files, installs the frozen package, and keeps bindings and favorites empty', async () => {
  const { root, dataPath, api } = await setup(), path = join(root, 'skills.zip')
  const initialAgents = (await api('snapshot', undefined)).agents
  const files = { 'report-helper/SKILL.md': document(), 'report-helper/assets/sample.bin': Uint8Array.from([0, 255]), 'report-helper/scripts/setup.js': 'throw new Error("MUST NOT EXECUTE")' }
  await writeFile(path, archive(files))
  const scan = await api('scanSkillSource', { kind: 'zip', source: path })
  const candidate = scan.candidates[0]
  expect(scan.candidates).toHaveLength(1)
  expect(candidate.error).toBeUndefined()
  expect((await api('snapshot', undefined)).resources).toEqual([])
  expect(await api('getSkillPreview', { scanId: scan.id, candidateId: candidate.id })).toMatchObject({ content: document(), files: expect.arrayContaining([expect.objectContaining({ path: 'scripts/setup.js' })]) })
  expect(await api('readSkillPreviewFile', { scanId: scan.id, candidateId: candidate.id, path: 'assets/sample.bin' })).toMatchObject({ binary: true, size: 2 })
  await expect(api('readSkillPreviewFile', { scanId: scan.id, candidateId: candidate.id, path: '../outside' })).rejects.toThrow()
  await writeFile(path, archive({ 'report-helper/SKILL.md': document('report-helper', 'Unreviewed replacement') }))
  const result = await install(api, scan)
  expect(result.items[0].status).toBe('installed')
  const snapshot = await api('snapshot', undefined), resource = snapshot.resources[0]
  expect(await readFile(join(resource.path, 'SKILL.md'), 'utf8')).toBe(document())
  expect(await readFile(join(resource.path, 'assets/sample.bin'))).toEqual(Buffer.from([0, 255]))
  expect(snapshot.agents).toEqual(initialAgents)
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([])
  await vi.waitFor(async () => expect(await staged(dataPath)).toEqual([]))
  await expect(api('getSkillPreview', { scanId: scan.id, candidateId: candidate.id })).rejects.toThrow('过期')
})

test('URL identity reuses matching content but distinguishes different sources with the same skill name', async () => {
  const downloads = vi.fn<DownloadTransport>(async () => response(archive({ 'SKILL.md': document() })))
  const { api } = await setup({ skillDownloads: downloads })
  const first = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/one.zip' })
  const installed = await install(api, first)
  const repeated = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/one.zip' })
  expect(repeated.candidates[0].existingResourceId).toBe(installed.items[0].resourceId)
  expect((await install(api, repeated)).items[0].status).toBe('reused')
  const distinct = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/two.zip' })
  expect(distinct.candidates[0].existingResourceId).toBeUndefined()
  await install(api, distinct)
  expect((await api('snapshot', undefined)).resources).toHaveLength(2)
  expect((await api('listSkillInstallations', undefined)).map(value => value.source)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'url', url: 'https://example.com/one.zip', skillPath: '.' })]))
  expect(downloads).toHaveBeenCalledTimes(3)
})

test('temporary credential URLs become snapshots without persisted credentials', async () => {
  const { api, dataPath } = await setup({ skillDownloads: async () => response(archive({ 'SKILL.md': document() })) })
  const scan = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/skill.zip?token=temporary-secret-value' })
  expect(scan.warnings?.join()).toContain('仅保存内容快照')
  await install(api, scan)
  const installations = await api('listSkillInstallations', undefined)
  expect(installations[0].source).toMatchObject({ kind: 'snapshot' })
  expect(JSON.stringify(installations)).not.toContain('temporary-secret-value')
  expect((await readFile(join(dataPath, 'boai.sqlite'))).includes(Buffer.from('temporary-secret-value'))).toBe(false)
})

test('GitHub freezes the resolved commit and preserves repository-relative identity for subdirectory imports', async () => {
  const commit = 'a'.repeat(40), urls: string[] = []
  const downloads: DownloadTransport = async url => {
    urls.push(url.href)
    return response(url.hostname === 'api.github.com' ? Buffer.from(JSON.stringify({ sha: commit })) : archive({ [`repo-${commit}/skills/report-helper/SKILL.md`]: document(), [`repo-${commit}/meta.ts`]: 'throw new Error("NEVER EXECUTE")', [`repo-${commit}/skills/other/SKILL.md`]: document('other') }))
  }
  const { api } = await setup({ skillDownloads: downloads })
  const scan = await api('scanSkillSource', { kind: 'github', source: 'OWNER/Repo.git', ref: 'release/next', subpath: 'skills/report-helper' })
  expect(scan.candidates).toHaveLength(1)
  expect(scan.candidates[0].source).toMatchObject({ kind: 'git', repository: 'https://github.com/owner/repo', ref: 'release/next', resolvedCommit: commit, skillPath: 'skills/report-helper' })
  expect(urls).toEqual(['https://api.github.com/repos/owner/repo/commits/release%2Fnext', `https://codeload.github.com/owner/repo/zip/${commit}`])
  await install(api, scan)
  expect((await api('listSkillInstallations', undefined))[0].source).toEqual(scan.candidates[0].source)
  for (const value of ['https://github.com/owner/repo/tree/main', 'https://user:secret@github.com/owner/repo', 'https://example.com/owner/repo']) expect(() => githubRepository(value)).toThrow()
})

test('marketplace installation refetches details and accepts a unique package despite a different frontmatter name', async () => {
  let detailCalls = 0
  const downloads = vi.fn<DownloadTransport>(async () => response(archive({ 'SKILL.md': document('actual-package-name') })))
  const metadata: typeof fetch = async () => {
    detailCalls++
    return new Response(JSON.stringify({ skill: { slug: 'listing-name', description: 'Listing summary' }, owner: { handle: 'alice' }, moderation: { verdict: 'malicious' } }))
  }
  const { api } = await setup({ skillDownloads: downloads, skillMarketplaceFetch: metadata })
  await api('getSkillMarketplaceDetail', { provider: 'clawhub', id: 'alice/listing-name' })
  const scan = await api('scanSkillSource', { kind: 'marketplace', provider: 'clawhub', source: 'alice/listing-name' })
  expect(detailCalls).toBe(2)
  expect(scan.warnings?.join()).toContain('标记此技能存在风险')
  expect(scan.candidates[0]).toMatchObject({ name: 'actual-package-name', source: { kind: 'marketplace', provider: 'clawhub', providerItemId: 'alice/listing-name' } })
  expect(downloads.mock.calls[0][0].searchParams.get('ownerHandle')).toBe('alice')
  await install(api, scan)
  expect((await api('listSkillInstallations', undefined))[0].source).toMatchObject({ providerItemId: 'alice/listing-name' })
})

test('marketplace packages with an ambiguous target fail without retaining staging or installed records', async () => {
  const metadata: typeof fetch = async () => new Response(JSON.stringify({ skill: { slug: 'missing' }, owner: { handle: 'alice' } }))
  const { api, dataPath } = await setup({ skillMarketplaceFetch: metadata, skillDownloads: async () => response(archive({ 'first/SKILL.md': document('first'), 'second/SKILL.md': document('second') })) })
  await expect(api('scanSkillSource', { kind: 'marketplace', provider: 'clawhub', source: 'alice/missing' })).rejects.toThrow('唯一')
  expect(await staged(dataPath)).toEqual([])
  expect(await api('listSkillInstallations', undefined)).toEqual([])
})

test('a stalled source does not block local operations and cancellation closes its stream', async () => {
  const stream = new Readable({ read() {} }), downloads = vi.fn<DownloadTransport>(async () => ({ status: 200, body: stream }))
  const { api, dataPath } = await setup({ skillDownloads: downloads })
  const pending = api('scanSkillSource', { kind: 'url', source: 'https://example.com/slow.zip', requestId: 'slow-source' })
  const assertion = expect(pending).rejects.toThrow('取消')
  await vi.waitFor(() => expect(downloads).toHaveBeenCalledOnce())
  expect((await api('snapshot', undefined)).resources).toEqual([])
  await api('cancelSkillScan', { id: 'slow-source' }); await assertion
  expect(stream.destroyed).toBe(true)
  expect(await staged(dataPath)).toEqual([])
  expect(await api('listSkillOperations', undefined)).toEqual([])
})

test('completed operations reopen after restart without redownloading or replaying installation', async () => {
  const downloads = vi.fn<DownloadTransport>(async () => response(archive({ 'SKILL.md': document() })))
  const { api, service, start } = await setup({ skillDownloads: downloads })
  const scan = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/skill.zip' })
  const operation = await install(api, scan, 'saved-operation')
  await service.close(); services.splice(services.indexOf(service), 1)
  const restarted = await start()
  expect(await restarted.api('getSkillOperation', { id: operation.id })).toEqual(operation)
  expect(await restarted.api('listSkillOperations', undefined)).toEqual([operation])
  expect((await restarted.api('snapshot', undefined)).resources).toHaveLength(1)
  expect(downloads).toHaveBeenCalledOnce()
})

test('backup refuses an uncommitted installation and cancellation removes the copied package before a valid backup', async () => {
  const { api, service, dataPath, root } = await setup({ skillDownloads: async () => response(archive({ 'SKILL.md': document() })) })
  const scan = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/backup-race.zip' })
  const manager = (service as unknown as { skills: { hooks: { critical<T>(action: () => Promise<T>): Promise<T> }; busy: boolean } }).skills
  const critical = manager.hooks.critical; let calls = 0, entered = false, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  manager.hooks.critical = async action => { if (++calls === 2) { entered = true; await held } return critical(action) }
  try {
    const operation = await api('installSkills', { scanId: scan.id, candidateIds: [scan.candidates[0].id], requestId: 'backup-race', addToFavorites: true })
    await vi.waitFor(() => expect(entered).toBe(true))
    expect((await api('snapshot', undefined)).resources).toEqual([])
    expect(await readdir(join(dataPath, 'skills'))).not.toEqual([])
    const blocked = join(root, 'blocked-backup')
    await expect(service.backup(blocked)).rejects.toThrow('资源管理操作')
    await expect(readdir(blocked)).rejects.toThrow('ENOENT')
    await api('cancelSkillOperation', { id: operation.id }); release()
    await vi.waitFor(() => expect(manager.busy).toBe(false))
    expect(await api('getSkillOperation', { id: operation.id })).toMatchObject({ status: 'cancelled' })
    expect((await api('snapshot', undefined)).resources).toEqual([])
    expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([])
    expect(await readdir(join(dataPath, 'skills'))).toEqual([])
    const backup = join(root, 'valid-backup'); await service.backup(backup)
    expect(await readdir(join(backup, 'skills'))).toEqual([])
  } finally { release(); manager.hooks.critical = critical }
})

test('a backup already taking its snapshot rejects new installation without consuming the reviewed plan', async () => {
  const { api, service, root } = await setup({ skillDownloads: async () => response(archive({ 'SKILL.md': document() })) })
  const scan = await api('scanSkillSource', { kind: 'url', source: 'https://example.com/late-install.zip' })
  const store = (service as unknown as { store: ProductStore }).store
  const backup = store.backup.bind(store); let entered = false, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  store.backup = async destination => { entered = true; await held; return backup(destination) }
  const pending = service.backup(join(root, 'snapshot-first'))
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    const input = { scanId: scan.id, candidateIds: [scan.candidates[0].id], requestId: 'after-backup', addToFavorites: false }
    await expect(api('installSkills', input)).rejects.toThrow('正在生成备份')
    release(); await pending
    expect(await readdir(join(root, 'snapshot-first', 'skills'))).toEqual([])
    expect((await install(api, scan, input.requestId)).items[0].status).toBe('installed')
  } finally { release(); await pending; store.backup = backup }
})

async function updatable(engine?: AgentEngine) {
  let body = 'Original version', failure = false
  const downloads = vi.fn<DownloadTransport>(async () => { if (failure) throw new Error('provider offline'); return response(archive({ 'SKILL.md': document('report-helper', body) })) })
  const setupResult = await setup({ skillDownloads: downloads, ...(engine ? { engine } : {}) }), { api } = setupResult
  const installed = await install(api, await api('scanSkillSource', { kind: 'url', source: 'https://example.com/skill.zip' }))
  const resourceId = installed.items[0].resourceId!
  return { ...setupResult, downloads, resourceId, change: (value: string) => { body = value }, offline: () => { failure = true } }
}
async function update(api: Api, resourceId: string, requestId = 'update-once') {
  const check = await api('checkSkillUpdate', { id: resourceId })
  expect(check.status).toBe('available')
  const input = { requestId, planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! }
  const operation = await api('updateSkill', input)
  let result = operation
  await vi.waitFor(async () => { result = await api('getSkillOperation', { id: operation.id }); expect(result.status).not.toBe('running') })
  return { check, input, result }
}

test('update preserves resource identity, favorites and bindings, advances config and invalidates source memories', async () => {
  const { api, resourceId, change } = await updatable()
  const before = await api('getSkillDetail', { resourceId })
  const agent = (await api('snapshot', undefined)).agents[0]
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = agent
  const bound = await api('saveAgent', { ...definition, skillIds: [resourceId], expectedConfigVersion: configVersion })
  await api('updateSkillCollections', { expectedRevision: 0, action: { kind: 'favorite', resourceId, favorite: true } })
  await api('saveMemory', { agentId: agent.id, scope: 'profile', expectedEpoch: 0, content: 'Old skill guidance', sourceResourceIds: [resourceId] })
  change('Reviewed updated version')
  const { result, check, input } = await update(api, resourceId)
  expect(check.expectedHash).toBe(before.contentHash)
  expect(check.affectedEmployees).toEqual([{ id: agent.id, name: agent.name }])
  expect(check.fileChanges).toMatchObject({ added: [], removed: [], modified: ['SKILL.md'] })
  expect(result.items[0]).toMatchObject({ status: 'updated', resourceId })
  expect(await api('updateSkill', input)).toEqual(result)
  const detail = await api('getSkillDetail', { resourceId })
  expect(detail.content).toContain('Reviewed updated version')
  expect(detail.resource.path).toBe(before.resource.path)
  expect(detail.installation?.revision).toBe(2)
  expect(detail.installation?.installedAt).toBe(before.installation?.installedAt)
  expect((await api('snapshot', undefined)).agents.find(value => value.id === agent.id)).toMatchObject({ skillIds: [resourceId], configVersion: bound.configVersion + 1, allowCommands: false })
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([resourceId])
  expect((await api('getMemory', { agentId: agent.id, scope: 'profile' })).entries).toEqual([])
  expect((await api('checkSkillUpdate', { id: resourceId })).status).toBe('current')
})

test('update checks are read-only; offline and locally modified states are never reported as current', async () => {
  const { api, resourceId, change, offline, downloads } = await updatable()
  const initial = await api('getSkillDetail', { resourceId })
  change('New remote version')
  expect((await api('checkSkillUpdate', { id: resourceId })).status).toBe('available')
  expect((await api('getSkillDetail', { resourceId })).content).toBe(initial.content)
  await writeFile(join(initial.resource.path, 'SKILL.md'), document('report-helper', 'Local edits'))
  const beforeCalls = downloads.mock.calls.length
  const modified = await api('checkSkillUpdate', { id: resourceId })
  expect(modified).toMatchObject({ status: 'available', localModified: true })
  expect(downloads.mock.calls.length).toBe(beforeCalls + 1)
  await expect(api('updateSkill', { requestId: 'unconfirmed', planId: modified.planId!, expectedHash: modified.expectedHash!, expectedRevision: modified.expectedRevision! })).rejects.toThrow('明确确认')
  expect((await api('getSkillDetail', { resourceId })).content).toContain('Local edits')
  await writeFile(join(initial.resource.path, 'SKILL.md'), initial.content)
  offline()
  expect(await api('checkSkillUpdate', { id: resourceId })).toMatchObject({ status: 'failed', error: 'provider offline' })
  expect((await api('getSkillDetail', { resourceId })).installation?.revision).toBe(1)
})

test('a local edit after preview is retained when update aborts', async () => {
  const { api, resourceId, change } = await updatable()
  change('Remote new')
  const check = await api('checkSkillUpdate', { id: resourceId }), initial = await api('getSkillDetail', { resourceId })
  await writeFile(join(initial.resource.path, 'SKILL.md'), document('report-helper', 'Keep my new local edits'))
  const operation = await api('updateSkill', { requestId: 'local-conflict', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! })
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operation.id })).status).not.toBe('running'))
  const detail = await api('getSkillDetail', { resourceId })
  expect(detail.content).toContain('Keep my new local edits')
  expect(detail.installation?.revision).toBe(1)
  expect((await api('getSkillOperation', { id: operation.id })).items[0].status).toBe('failed')
})

test.each(['name', 'path'] as const)('an upstream %s change fails without altering the installed identity or content', async change => {
  const { api, resourceId, dataPath, downloads } = await updatable()
  const before = await api('getSkillDetail', { resourceId })
  downloads.mockImplementation(async () => response(archive(change === 'name' ? { 'SKILL.md': document('different-skill') } : { 'moved/SKILL.md': document('report-helper', 'Unexpected new path') })))
  const check = await api('checkSkillUpdate', { id: resourceId })
  expect(check.status).toBe('failed')
  expect(check.error).toContain(change === 'name' ? 'name 已变化' : '路径已变化')
  expect(check.planId).toBeUndefined()
  expect(await api('getSkillDetail', { resourceId })).toEqual(before)
  expect((await api('snapshot', undefined)).resources.map(resource => resource.id)).toEqual([resourceId])
  expect((await api('listSkillOperations', undefined)).every(operation => operation.kind !== 'update')).toBe(true)
  expect(await staged(dataPath)).toEqual([])
})

test.each([false, true])('a database failure rolls back the actual old package, including local edits: %s', async locallyModified => {
  const { api, service, resourceId, change } = await updatable()
  if (locallyModified) {
    const detail = await api('getSkillDetail', { resourceId })
    await writeFile(join(detail.resource.path, 'SKILL.md'), document('report-helper', 'My local edits must survive rollback'))
  }
  const before = await api('getSkillDetail', { resourceId }), store = (service as unknown as { store: ProductStore }).store
  const transaction = store.transaction.bind(store)
  const injection = vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
    await tx.put(record)
    if (record.collection === 'skillInstallations' && (record.value as { revision: number }).revision === 2) throw new Error('injected update commit failure')
  } })))
  change('Should roll back')
  const check = await api('checkSkillUpdate', { id: resourceId })
  const operation = await api('updateSkill', { requestId: 'rollback', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash!, replaceLocalChanges: locallyModified })
  let result = operation
  await vi.waitFor(async () => { result = await api('getSkillOperation', { id: operation.id }); expect(result.status).not.toBe('running') })
  injection.mockRestore()
  expect(result.items[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('injected') })
  const after = await api('getSkillDetail', { resourceId })
  expect(after.contentHash).toBe(before.contentHash)
  expect(after.installation).toEqual(before.installation)
})

test('explicit replacement updates modified content, but later local edits still invalidate that exact confirmation', async () => {
  const { api, resourceId, change } = await updatable()
  const initial = await api('getSkillDetail', { resourceId })
  await writeFile(join(initial.resource.path, 'SKILL.md'), document('report-helper', 'Reviewed local edit'))
  change('Chosen upstream version')
  const check = await api('checkSkillUpdate', { id: resourceId })
  expect(check.localModified).toBe(true); expect(check.expectedHash).not.toBe(initial.installation!.contentHash)
  const input = { requestId: 'replace-local', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash!, replaceLocalChanges: true }
  const operation = await api('updateSkill', input)
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operation.id })).status).not.toBe('running'))
  expect((await api('getSkillDetail', { resourceId })).content).toContain('Chosen upstream version')
  expect((await api('getSkillDetail', { resourceId })).installation!.revision).toBe(2)
  await writeFile(join(initial.resource.path, 'SKILL.md'), document('report-helper', 'First local edit'))
  const nextCheck = await api('checkSkillUpdate', { id: resourceId })
  await writeFile(join(initial.resource.path, 'SKILL.md'), document('report-helper', 'A newer unreviewed edit'))
  const next = await api('updateSkill', { requestId: 'stale-confirmation', planId: nextCheck.planId!, expectedRevision: nextCheck.expectedRevision!, expectedHash: nextCheck.expectedHash!, replaceLocalChanges: true })
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: next.id })).status).not.toBe('running'))
  expect((await api('getSkillOperation', { id: next.id })).items[0].status).toBe('failed')
  expect((await api('getSkillDetail', { resourceId })).content).toContain('A newer unreviewed edit')
})

test('batch checks report current, available and failed separately without changing any installed files', async () => {
  let changed = false
  const downloads = vi.fn<DownloadTransport>(async url => {
    const name = url.pathname.slice(1).replace('.zip', '')
    if (changed && name === 'offline') throw new Error('Provider temporarily unavailable')
    return response(archive({ 'SKILL.md': document(name, changed && name === 'updated' ? 'new content' : 'old content') }))
  })
  const { root, api, service, start } = await setup({ skillDownloads: downloads })
  for (const name of ['current', 'updated', 'offline']) await install(api, await api('scanSkillSource', { kind: 'url', source: `https://example.com/${name}.zip` }))
  const local = join(root, 'local.zip'); await writeFile(local, archive({ 'SKILL.md': document('local') }))
  await install(api, await api('scanSkillSource', { kind: 'zip', source: local }))
  const before = await api('snapshot', undefined), hashes = await Promise.all(before.resources.map(async resource => (await inspectResourceTree(resource.path)).hash))
  changed = true
  const batch = await api('checkAllSkillUpdates', { requestId: 'batch-1' })
  expect(batch.items).toHaveLength(3)
  await vi.waitFor(async () => expect((await api('getSkillUpdateBatch', undefined))?.status).toBe('completed'))
  const result = (await api('getSkillUpdateBatch', undefined))!
  expect(Object.fromEntries(result.items.map(item => [item.name, item.status]))).toEqual({ current: 'current', updated: 'available', offline: 'failed' })
  expect(await Promise.all(before.resources.map(async resource => (await inspectResourceTree(resource.path)).hash))).toEqual(hashes)
  const calls = downloads.mock.calls.length
  expect(await api('checkAllSkillUpdates', { requestId: 'batch-1' })).toEqual(result)
  await service.close(); const reopened = await start()
  expect(await reopened.api('getSkillUpdateBatch', undefined)).toEqual(result)
  expect(downloads.mock.calls.length).toBe(calls)
})

test('stopping a batch finishes its in-flight read and leaves unchecked items explicit without blocking local actions', async () => {
  let stall = false, release: (() => void) | undefined
  const downloads = vi.fn<DownloadTransport>(async url => {
    if (stall) await new Promise<void>(resolve => { release = resolve })
    return response(archive({ 'SKILL.md': document(url.pathname.includes('one') ? 'one' : 'two') }))
  })
  const { api } = await setup({ skillDownloads: downloads })
  for (const name of ['one', 'two']) await install(api, await api('scanSkillSource', { kind: 'url', source: `https://example.com/${name}.zip` }))
  stall = true
  const batch = await api('checkAllSkillUpdates', { requestId: 'stop-batch' })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  expect((await api('checkAllSkillUpdates', { requestId: 'other-batch' })).id).toBe(batch.id)
  await api('cancelSkillUpdateBatch', undefined)
  expect((await api('snapshot', undefined)).resources).toHaveLength(2)
  release!()
  await vi.waitFor(async () => expect((await api('getSkillUpdateBatch', undefined))?.status).toBe('cancelled'))
  expect((await api('getSkillUpdateBatch', undefined))?.items.map(item => item.status)).toEqual(['current', 'pending'])
  expect(downloads).toHaveBeenCalledTimes(3)
})

test('restart marks an unfinished update check batch interrupted and never claims unchecked content is current', async () => {
  const { api, service, resourceId, downloads, dataPath, start } = await updatable()
  await service.close()
  const calls = downloads.mock.calls.length, store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  await store.write([{ collection: 'skillUpdateBatches', id: 'unfinished-batch', value: { id: 'unfinished-batch', createdAt: new Date().toISOString(), status: 'running', items: [{ resourceId, name: 'report-helper', status: 'pending' }] } }]); await store.close()
  const next = await start()
  expect(await next.api('getSkillUpdateBatch', undefined)).toMatchObject({ status: 'interrupted', items: [{ status: 'pending' }] })
  expect(downloads.mock.calls.length).toBe(calls)
})

test.each(['before-swap', 'before-swap-journal', 'after-swap-journal', 'after-commit'] as const)('recovers the actual files and database captured at %s without redownloading', async stage => {
  const { api, service, resourceId, root, dataPath, start, downloads, change } = await updatable()
  const old = await api('getSkillDetail', { resourceId })
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await api('snapshot', undefined)).agents[0]
  const bound = await api('saveAgent', { ...agent, skillIds: [resourceId], expectedConfigVersion: configVersion })
  await api('updateSkillCollections', { expectedRevision: 0, action: { kind: 'favorite', resourceId, favorite: true } })
  change('New version written by the actual update operation')
  const check = await api('checkSkillUpdate', { id: resourceId }), operationId = `cut-${stage}`
  const internal = service as unknown as { store: ProductStore; skillUpdates: { hooks: {
    invalidateMemory: (id: string) => Promise<void>
    commit: (tx: RecordTransaction, resource: Resource) => Promise<() => Promise<void>>
  } } }
  const { store } = internal, hooks = internal.skillUpdates.hooks
  const originalWrite = store.write.bind(store), originalInvalidate = hooks.invalidateMemory, originalCommit = hooks.commit
  let entered = false, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const stopAtCut = async () => { if (entered) return; entered = true; await held }
  const injection = vi.spyOn(store, 'write').mockImplementation(async (records, removals) => {
    const operation = records.find(record => record.collection === 'skillOperations' && record.id === operationId)?.value as { journal?: { phase: string } } | undefined
    if (operation?.journal?.phase === 'files-swapped' && stage === 'before-swap-journal') await stopAtCut()
    await originalWrite(records, removals)
    if (operation?.journal?.phase === 'files-swapped' && stage === 'after-swap-journal') await stopAtCut()
  })
  hooks.invalidateMemory = async id => { await originalInvalidate(id); if (stage === 'before-swap') await stopAtCut() }
  hooks.commit = async (tx, resource) => {
    const publish = await originalCommit(tx, resource)
    return async () => { if (stage === 'after-commit') await stopAtCut(); await publish() }
  }
  const captured = join(root, 'captured-interruption')
  try {
    await api('updateSkill', { requestId: operationId, planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! })
    await vi.waitFor(() => expect(entered).toBe(true))
    // The actual writer is held at a known boundary. Preserve its DB and files,
    // including uncleaned journals, instead of inventing a recovery record.
    await mkdir(captured)
    await store.backup(join(captured, 'boai.sqlite'))
    for (const folder of ['skills', 'agents']) await cp(join(dataPath, folder), join(captured, folder), { recursive: true })
    const evidence = new ProductStore(join(captured, 'boai.sqlite')); await evidence.init()
    try {
      const saved = (await evidence.load<{ id: string; journal: { phase: string } }>('skillOperations')).find(operation => operation.id === operationId)!
      expect(saved.journal.phase).toBe(stage === 'after-commit' ? 'committed' : stage === 'after-swap-journal' ? 'files-swapped' : 'prepared')
    } finally { await evidence.close() }
  } finally {
    release(); injection.mockRestore(); hooks.invalidateMemory = originalInvalidate; hooks.commit = originalCommit
  }
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operationId })).status).toBe('completed'))
  expect((await api('getSkillOperation', { id: operationId })).items[0].status).toBe('updated')
  const updated = await api('getSkillDetail', { resourceId })
  await service.close(); services.splice(services.indexOf(service), 1)
  await rm(dataPath, { recursive: true })
  const restarted = await start(captured), recovered = await restarted.api('getSkillDetail', { resourceId })
  const committed = stage === 'after-commit'
  expect(recovered.contentHash).toBe(committed ? updated.contentHash : old.contentHash)
  expect(recovered.installation?.revision).toBe(committed ? 2 : 1)
  expect(recovered.resource.path.startsWith(captured)).toBe(true)
  expect((await restarted.api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([resourceId])
  expect((await restarted.api('snapshot', undefined)).agents.find(value => value.id === agent.id)).toMatchObject({ skillIds: [resourceId], configVersion: bound.configVersion + (committed ? 1 : 0) })
  expect((await restarted.api('getSkillOperation', { id: operationId })).items[0].status).toBe(committed ? 'updated' : 'failed')
  expect((await readdir(join(captured, 'skills'))).filter(name => name.startsWith('.update-'))).toEqual([])
  expect(downloads).toHaveBeenCalledTimes(2)
})

test.each([
  ...(['prepared', 'old-moved', 'files-swapped', 'committed', 'ambiguous'] as const).map(stage => [stage, false] as const),
  ['files-swapped', true] as const, ['committed', true] as const,
])('restart repairs a %s update with local edits %s using only local evidence', async (stage, locallyModified) => {
  const { api, service, resourceId, downloads, dataPath, start } = await updatable()
  if (locallyModified) {
    const current = await api('getSkillDetail', { resourceId })
    await writeFile(join(current.resource.path, 'SKILL.md'), document('report-helper', 'Keep edited content during recovery'))
  }
  const before = await api('getSkillDetail', { resourceId })
  await service.close(); services.splice(services.indexOf(service), 1)
  const directory = crypto.randomUUID(), journalRoot = join(dataPath, 'skills', `.update-${directory}`), next = join(journalRoot, 'next'), old = join(journalRoot, 'old')
  await mkdir(journalRoot)
  await cp(before.resource.path, next, { recursive: true })
  await writeFile(join(next, 'SKILL.md'), document('report-helper', 'Recovered new version'))
  const newHash = (await inspectResourceTree(next)).hash
  if (stage !== 'prepared') await rename(before.resource.path, old)
  if (['files-swapped', 'committed', 'ambiguous'].includes(stage)) await rename(next, before.resource.path)
  if (stage === 'ambiguous') await writeFile(join(before.resource.path, 'SKILL.md'), document('report-helper', 'Unexpected edited replacement'))
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  await store.write([{ collection: 'skillOperations', id: 'crash-update', value: { id: 'crash-update', kind: 'update', scanId: 'expired-plan', resourceId, status: 'running', fingerprint: 'fixture', items: [{ candidateId: 'candidate', name: 'report-helper', status: 'pending' }], journal: { directory, target: relative(dataPath, before.resource.path), oldHash: before.contentHash, ...(locallyModified ? { installedHash: before.installation!.contentHash } : {}), newHash, oldRevision: 1, phase: stage === 'old-moved' ? 'prepared' : stage === 'ambiguous' ? 'files-swapped' : stage } } }, ...(stage === 'committed' ? [{ collection: 'skillInstallations', id: resourceId, value: { ...before.installation, revision: 2, contentHash: newHash } }] : [])])
  await store.close()
  const restarted = await start()
  if (stage === 'ambiguous') {
    await expect(restarted.api('getSkillDetail', { resourceId })).rejects.toThrow('需要修复')
    expect(await readFile(join(old, 'SKILL.md'), 'utf8')).toBe(before.content)
    expect(await readFile(join(before.resource.path, 'SKILL.md'), 'utf8')).toContain('Unexpected edited replacement')
    await expect(restarted.service.backup(join(dataPath, '..', 'ambiguous-backup'))).rejects.toThrow('等待修复')
  } else {
    const detail = await restarted.api('getSkillDetail', { resourceId })
    expect(detail.contentHash).toBe(stage === 'committed' ? newHash : before.contentHash)
    expect((await restarted.api('getSkillOperation', { id: 'crash-update' })).items[0].status).toBe(stage === 'committed' ? 'updated' : 'failed')
    await expect(readdir(journalRoot)).rejects.toThrow('ENOENT')
  }
  expect(downloads).toHaveBeenCalledOnce()
})

test('waiting work prevents replacing a bound skill without cancelling its dependency', async () => {
  const { api, service, resourceId, change } = await updatable()
  const agent = (await api('snapshot', undefined)).agents[0]
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = agent
  await api('saveAgent', { ...definition, skillIds: [resourceId], expectedConfigVersion: configVersion })
  const conversation = await api('createConversation', { kind: 'group', title: 'Wait for dependency', agentIds: [agent.id, 'writer'] })
  const works = (service as unknown as { works: WorkRepository }).works
  await works.claim({ conversationId: conversation.id, sourceMessageId: 'request', runId: 'waiting-parent', agentId: agent.id, intent: { key: 'main', scope: 'Read skill after dependency', deliverable: 'Report' } })
  const child = await works.delegate('waiting-parent', { key: 'child', ownerAgentId: 'writer', scope: 'Check facts', deliverable: 'Evidence' })
  await works.waitFor('waiting-parent', { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: 'Read skill and write report' })
  await works.settle('waiting-parent', { disposition: 'waiting', summary: 'Waiting for evidence' }, { messageId: 'waiting', content: 'Waiting for evidence', artifactIds: [] })
  change('Blocked update')
  const check = await api('checkSkillUpdate', { id: resourceId })
  await expect(api('updateSkill', { requestId: 'waiting-update', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! })).rejects.toThrow('等待中的工作')
  expect((await works.view(conversation.id)).workItems.map(work => work.status)).toEqual(['waiting', 'ready'])
  expect((await api('getSkillDetail', { resourceId })).content).toContain('Original version')
})

test('a cancelled run retains its skill until the actual model adapter exits', async () => {
  let entered = false, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const engine: AgentEngine = { test: async () => 'ok', decide: async context => ({ action: 'reply', responseKind: 'task', observedThroughSequence: Math.max(0, ...context.messages.map(value => value.sequence)), work: { key: 'skill-task', scope: 'Read the authorized skill', deliverable: 'Report' } }), run: async () => { entered = true; await held } }
  const { api, service, resourceId, change } = await updatable(engine)
  try {
    const connection = await api('saveConnection', { name: 'test', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test' })
    const agent = (await api('snapshot', undefined)).agents[0]
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = agent
    await api('saveAgent', { ...definition, skillIds: [resourceId], connectionId: connection.id, modelId: 'test', expectedConfigVersion: configVersion })
    const conversation = await api('createConversation', { kind: 'direct', title: 'Skill task', agentIds: [agent.id] })
    change('Available replacement')
    const check = await api('checkSkillUpdate', { id: resourceId })
    const input = { requestId: 'held-update', planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! }
    await api('sendMessage', { conversationId: conversation.id, content: 'Use the skill', requestId: 'run-skill', mentionIds: [] })
    await vi.waitFor(() => expect(entered).toBe(true))
    await expect(api('updateSkill', input)).rejects.toThrow('正在使用')
    await api('cancelRun', { conversationId: conversation.id })
    await expect(api('updateSkill', input)).rejects.toThrow('正在使用')
    expect((await api('getSkillDetail', { resourceId })).content).toContain('Original version')
    release()
    await vi.waitFor(() => expect((service as unknown as { activeAdapters: Set<string> }).activeAdapters.size).toBe(0))
    const operation = await api('updateSkill', input)
    await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operation.id })).items[0].status).toBe('updated'))
  } finally { release() }
})

test.each(['retry', 'restart'] as const)('failed file removal revokes installation immediately and preserves evidence until %s', async action => {
  const { api, service, resourceId, root, start, downloads } = await updatable()
  const detail = await api('getSkillDetail', { resourceId }), managed = dirname(detail.resource.path), outside = join(root, 'outside')
  await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'User source must remain')
  await rm(managed, { recursive: true }); await symlink(outside, managed)
  await expect(api('removeResource', { id: resourceId })).rejects.toThrow('清理未完成')
  expect((await api('snapshot', undefined)).resources).toEqual([])
  expect(await api('listSkillInstallations', undefined)).toEqual([])
  expect(await api('listResourceCleanups', undefined)).toEqual([expect.objectContaining({ id: resourceId, status: 'failed' })])
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('User source must remain')
  await unlink(managed); await mkdir(managed); await writeFile(join(managed, 'leftover.txt'), 'managed remainder')
  let currentApi = api
  if (action === 'retry') await api('retryResourceCleanup', { id: resourceId })
  else { await service.close(); services.splice(services.indexOf(service), 1); currentApi = (await start()).api }
  expect(await currentApi('listResourceCleanups', undefined)).toEqual([])
  await expect(readdir(managed)).rejects.toThrow('ENOENT')
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('User source must remain')
  expect(downloads).toHaveBeenCalledOnce()
})
