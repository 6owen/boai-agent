/*
 * [INPUT]: 真实 AppService/SQLite、受管技能目录、原员工配置快照和隔离文件 fixture。
 * [OUTPUT]: 分组/技能前后顺序及跨组事务与重启、失败无部分写入； 批量中途失败保留成功项、删除技能清理来源记忆、无技能目录/过大文件拒绝、目标竞争/ACP 拒绝、集合持久化与授权分离验证。
 * [POS]: Skills 本地管理模块与服务集成回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, link, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../packages/runtime/src/service'
import type { Method, Methods } from '../packages/shared/src/ipc'
import { inspectResourceTree, parseSkillDocument } from '../packages/runtime/src/modules/resources/local-resources'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-skills-')); roots.push(root)
  const dataPath = join(root, 'data')
  const start = async () => {
    const service = new AppService({ dataPath, engine: { run: async () => {}, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    services.push(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    return { service, api }
  }
  return { root, dataPath, start, ...await start() }
}
async function skill(root: string, folder = 'first', name = 'report-helper', body = 'Follow the approved task.') {
  const path = join(root, folder); await mkdir(join(path, 'references'), { recursive: true })
  await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: |\n  Read reports\n  with care\nalwaysAllow: [shell]\n---\n${body}`)
  await writeFile(join(path, 'references', 'guide.md'), 'Reference content')
  return path
}
async function install(api: Awaited<ReturnType<typeof setup>>['api'], source: string, favorite = true, ownerAgentId?: string) {
  const scan = await api('scanSkillSource', { source, ownerAgentId })
  const input = { requestId: crypto.randomUUID(), scanId: scan.id, candidateIds: scan.candidates.map(value => value.id), addToFavorites: favorite }
  const operation = await api('installSkills', input)
  let result = operation
  await vi.waitFor(async () => { result = await api('getSkillOperation', { id: operation.id }); expect(result.status).not.toBe('running') })
  return { scan, input, result }
}
test('full YAML preserves multiline descriptions but declarations never grant tools', () => {
  expect(parseSkillDocument('---\nname: report-helper\ndescription: |\n  first\n  second\nalwaysAllow: [shell]\n---\nbody')).toMatchObject({ description: 'first\nsecond', warnings: [expect.stringContaining('不自动改变员工权限')] })
  expect(() => parseSkillDocument('---\nname: first\nname: second\n---')).toThrow('YAML')
  expect(() => parseSkillDocument('---\nname: ../../outside\n---')).toThrow('name')
})
test('preview does not install; batch retains valid results and exposes invalid skills without touching sources', async () => {
  const { root, api } = await setup(), library = join(root, 'library')
  const agentsBefore = (await api('snapshot', undefined)).agents
  const original = await skill(library)
  await skill(library, 'invalid', 'Invalid_Name')
  const scan = await api('scanSkillSource', { source: library })
  expect(scan.candidates).toHaveLength(2)
  expect(scan.candidates.find(candidate => candidate.relativePath === 'invalid')?.error).toContain('name')
  expect((await api('snapshot', undefined)).resources).toEqual([])
  const before = await inspectResourceTree(original)
  const { result, input } = await install(api, library)
  expect(result.items.map(item => item.status)).toEqual(['installed', 'skipped'])
  expect(await api('installSkills', input)).toEqual(result)
  await expect(api('installSkills', { ...input, addToFavorites: false })).rejects.toThrow('requestId')
  const snapshot = await api('snapshot', undefined)
  expect(snapshot.resources).toHaveLength(1)
  expect(snapshot.agents).toEqual(agentsBefore)
  expect((await inspectResourceTree(original)).hash).toBe(before.hash)
  expect((await api('getSkillDetail', { resourceId: snapshot.resources[0].id })).content).toContain('Follow the approved task.')
})
test('source changes invalidate a reviewed plan and leave no partial managed resource', async () => {
  const { root, api, dataPath } = await setup(), source = await skill(root)
  const scan = await api('scanSkillSource', { source })
  await writeFile(join(source, 'references/guide.md'), 'unreviewed replacement')
  const operation = await api('installSkills', { requestId: 'stale', scanId: scan.id, candidateIds: scan.candidates.map(value => value.id), addToFavorites: true })
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: operation.id })).status).toBe('completed'))
  expect((await api('getSkillOperation', { id: operation.id })).items[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('已变更') })
  expect((await api('snapshot', undefined)).resources).toEqual([])
  expect(await readdir(join(dataPath, 'skills'))).toEqual([])
})
test('a later failed batch entry does not roll back an installed entry or replay it on retry', async () => {
  const { root, api, service, start, dataPath } = await setup(), library = join(root, 'batch')
  const first = await skill(library, 'first', 'first-helper'), second = await skill(library, 'second', 'second-helper')
  const originalHash = (await inspectResourceTree(first)).hash
  const scan = await api('scanSkillSource', { source: library })
  await writeFile(join(second, 'references/guide.md'), 'Changed after the user reviewed the batch')
  const input = { requestId: 'partial-batch', scanId: scan.id, candidateIds: ['first-helper', 'second-helper'].map(name => scan.candidates.find(candidate => candidate.name === name)!.id), addToFavorites: true }
  const pending = await api('installSkills', input)
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: pending.id })).status).toBe('completed'))
  const result = await api('getSkillOperation', { id: pending.id })
  expect(result.items.map(item => item.status)).toEqual(['installed', 'failed'])
  expect(result.items[1].error).toContain('已变更')
  const resource = (await api('snapshot', undefined)).resources[0]
  expect((await api('snapshot', undefined)).resources).toHaveLength(1)
  expect(resource.name).toBe('first-helper')
  expect((await inspectResourceTree(resource.path)).hash).toBe(originalHash)
  expect(await readdir(join(dataPath, 'skills'))).toEqual([resource.id])
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([resource.id])
  await service.close()
  const restarted = await start()
  expect(await restarted.api('installSkills', input)).toEqual(result)
  expect((await restarted.api('snapshot', undefined)).resources.map(value => value.id)).toEqual([resource.id])
  expect((await inspectResourceTree(first)).hash).toBe(originalHash)
  expect(await readFile(join(second, 'references/guide.md'), 'utf8')).toBe('Changed after the user reviewed the batch')
})
test('a folder without SKILL.md fails explicitly and leaves no installable preview', async () => {
  const { root, api } = await setup(), source = join(root, 'not-a-skill')
  await mkdir(source); await writeFile(join(source, 'README.md'), 'Ordinary documents are not skills')
  await expect(api('scanSkillSource', { source })).rejects.toThrow('没有找到 SKILL.md')
  expect((await api('snapshot', undefined)).resources).toEqual([])
  expect(await api('listSkillOperations', undefined)).toEqual([])
})
test('a changed target invalidates an old preview instead of adding an unreviewed duplicate', async () => {
  const { root, api } = await setup(), source = await skill(root)
  const stale = await api('scanSkillSource', { source })
  const first = await install(api, source), resourceId = first.result.items[0].resourceId!
  const submitted = await api('installSkills', { requestId: 'old-target', scanId: stale.id, candidateIds: [stale.candidates[0].id], addToFavorites: false })
  await vi.waitFor(async () => expect((await api('getSkillOperation', { id: submitted.id })).status).toBe('completed'))
  expect((await api('getSkillOperation', { id: submitted.id })).items[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('目标资源已变化') })
  expect((await api('snapshot', undefined)).resources.map(resource => resource.id)).toEqual([resourceId])
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([resourceId])
})
test('a supported installed skill cannot be bound through an ACP employee configuration', async () => {
  const { root, api } = await setup()
  const { result } = await install(api, await skill(root)), resourceId = result.items[0].resourceId!
  const profile = await api('saveLaunchProfile', { name: 'Saved only', executable: process.execPath, args: [], useExistingLogin: false, hostAccessAcknowledged: true })
  const { id, configVersion, workspaceRef, memoryNamespace, policyVersion, ...template } = (await api('snapshot', undefined)).agents[0]
  const input = { ...template, name: 'External employee', executionBackend: { kind: 'acp-local' as const, profileId: profile.id } }
  const external = await api('saveAgent', { ...input, skillIds: [] })
  await expect(api('saveAgent', { ...input, id: external.id, skillIds: [resourceId], expectedConfigVersion: external.configVersion })).rejects.toThrow('暂不支持 BoAI 的 Skills')
  const saved = (await api('snapshot', undefined)).agents.find(agent => agent.id === external.id)!
  expect(saved.skillIds).toEqual([]); expect(saved.configVersion).toBe(external.configVersion)
  expect((await api('getSkillDetail', { resourceId })).resource.id).toBe(resourceId)
})
test('same content is reused; equal names with different content remain separate and employee binding rejects ambiguity', async () => {
  const { root, api } = await setup(), first = await skill(root)
  const firstInstall = await install(api, first)
  const again = await install(api, first)
  expect(again.result.items[0]).toMatchObject({ status: 'reused', resourceId: firstInstall.result.items[0].resourceId })
  await install(api, await skill(root, 'second', 'report-helper', 'Different source rules'))
  const snapshot = await api('snapshot', undefined)
  expect(snapshot.resources).toHaveLength(2)
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = snapshot.agents[0]
  await expect(api('saveAgent', { ...agent, skillIds: snapshot.resources.map(resource => resource.id), expectedConfigVersion: configVersion })).rejects.toThrow('名称相同')
})
test('collections survive restart, reject stale writers, and never grant or revoke employee permissions', async () => {
  const { root, api, service, start } = await setup()
  const { result } = await install(api, await skill(root)), resourceId = result.items[0].resourceId!
  let value = await api('getSkillCollections', undefined)
  value = await api('updateSkillCollections', { expectedRevision: value.revision, action: { kind: 'create-group', name: '  报告   整理  ' } })
  expect(value.groups[0].name).toBe('报告 整理')
  const previous = value.revision
  value = await api('updateSkillCollections', { expectedRevision: previous, action: { kind: 'assign-group', resourceId, groupId: value.groups[0].id } })
  await expect(api('updateSkillCollections', { expectedRevision: previous, action: { kind: 'favorite', resourceId, favorite: false } })).rejects.toThrow('其他窗口')
  await service.close()
  const next = await start()
  expect(await next.api('getSkillCollections', undefined)).toEqual(value)
  value = await next.api('updateSkillCollections', { expectedRevision: value.revision, action: { kind: 'delete-group', groupId: value.groups[0].id } })
  expect(value.favoriteResourceIds).toEqual([resourceId]); expect(value.groupByResourceId).toEqual({})
  value = await next.api('updateSkillCollections', { expectedRevision: value.revision, action: { kind: 'favorite', resourceId, favorite: false } })
  expect((await next.api('snapshot', undefined)).resources.map(resource => resource.id)).toEqual([resourceId])
  expect((await next.api('snapshot', undefined)).agents.every(agent => agent.skillIds.length === 0)).toBe(true)
})
test('batch skills sharing a name remain distinct by source; a later scan reuses only its own source', async () => {
  const { root, api } = await setup(), source = join(root, 'library')
  const first = await skill(source, 'first')
  await skill(source, 'second')
  const batch = await install(api, source)
  expect(batch.result.items.map(item => item.status)).toEqual(['installed', 'installed'])
  const again = await install(api, first)
  expect(again.result.items[0]).toMatchObject({ status: 'reused', resourceId: batch.result.items[0].resourceId })
  expect((await api('snapshot', undefined)).resources).toHaveLength(2)
})
test('files cannot escape the selected skill and binary content is not returned as text', async () => {
  const { root, api } = await setup(), source = await skill(root)
  await writeFile(join(source, 'asset.bin'), Buffer.from([0, 1, 255, 4]))
  const { result } = await install(api, source), resourceId = result.items[0].resourceId!
  const binary = await api('readSkillFile', { resourceId, path: 'asset.bin' })
  expect(binary.binary).toBe(true)
  expect(binary).not.toHaveProperty('content')
  expect((await api('readSkillFile', { resourceId, path: 'references/guide.md' })).content).toBe('Reference content')
  await expect(api('readSkillFile', { resourceId, path: '../../boai.sqlite' })).rejects.toThrow('relative')
  await expect(api('readSkillFile', { resourceId, path: 'C:\\outside\\private.txt' })).rejects.toThrow('relative')
  const resource = (await api('snapshot', undefined)).resources[0]
  await symlink(join(source, 'SKILL.md'), join(resource.path, 'escape.md'))
  await expect(api('readSkillFile', { resourceId, path: 'escape.md' })).rejects.toThrow('Symbolic')
})
test('uninstall removes only managed copies and collection references; personal ownership remains explicit', async () => {
  const { root, api } = await setup(), source = await skill(root)
  const { result } = await install(api, source, true, 'researcher'), resourceId = result.items[0].resourceId!
  expect(result.items[0].status).toBe('installed')
  const snapshot = await api('snapshot', undefined), resource = snapshot.resources[0]
  expect(resource.ownerAgentId).toBe('researcher')
  expect(snapshot.agents.find(agent => agent.id === 'researcher')?.skillIds).toEqual([])
  await api('removeResource', { id: resourceId })
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([])
  await expect(readFile(join(resource.path, 'SKILL.md'))).rejects.toThrow()
  expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('report-helper')
})
test('removing a bound skill invalidates its memories but retains unrelated preferences after restart', async () => {
  const { root, api, service, start } = await setup(), source = await skill(root)
  const { result } = await install(api, source), resourceId = result.items[0].resourceId!
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await api('snapshot', undefined)).agents.find(value => value.id === 'researcher')!
  await api('saveAgent', { ...agent, skillIds: [resourceId], expectedConfigVersion: configVersion })
  const conversation = await api('createConversation', { kind: 'direct', title: 'Skill memory', agentIds: [agent.id] })
  const queries = [{ agentId: agent.id, scope: 'profile' as const }, { agentId: agent.id, scope: 'conversation' as const, conversationId: conversation.id }]
  for (const query of queries) {
    await api('saveMemory', { ...query, expectedEpoch: (await api('getMemory', query)).epoch, content: 'Keep my unrelated preference', sourceResourceIds: [] })
    await api('saveMemory', { ...query, expectedEpoch: (await api('getMemory', query)).epoch, content: 'Revoked skill guidance', sourceResourceIds: [resourceId] })
    expect((await api('getMemory', query)).entries).toHaveLength(2)
  }
  await api('removeResource', { id: resourceId })
  for (const query of queries) expect((await api('getMemory', query)).entries.map(entry => entry.content)).toEqual(['Keep my unrelated preference'])
  expect((await api('snapshot', undefined)).agents.find(value => value.id === agent.id)?.skillIds).toEqual([])
  await service.close()
  const restarted = await start()
  for (const query of queries) expect((await restarted.api('getMemory', query)).entries.map(entry => entry.content)).toEqual(['Keep my unrelated preference'])
  await expect(restarted.api('getSkillDetail', { resourceId })).rejects.toThrow('技能不存在')
  expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('report-helper')
})
test('oversized reference files remain listed but cannot be read in preview or installed detail', async () => {
  const { root, api } = await setup(), source = await skill(root)
  await writeFile(join(source, 'references/large.txt'), Buffer.alloc(1024 * 1024 + 1, 'a'))
  const scan = await api('scanSkillSource', { source }), candidateId = scan.candidates[0].id
  expect(scan.candidates[0].error).toBeUndefined()
  await expect(api('readSkillPreviewFile', { scanId: scan.id, candidateId, path: 'references/large.txt' })).rejects.toThrow('at most 1 MiB')
  const { result } = await install(api, source), resourceId = result.items[0].resourceId!
  expect((await api('getSkillDetail', { resourceId })).files).toContainEqual(expect.objectContaining({ path: 'references/large.txt', size: 1024 * 1024 + 1 }))
  await expect(api('readSkillFile', { resourceId, path: 'references/large.txt' })).rejects.toThrow('at most 1 MiB')
  expect((await api('readSkillFile', { resourceId, path: 'references/guide.md' })).content).toBe('Reference content')
})
test('resource validation rejects symbolic and hard links before copying', async () => {
  const { root, api } = await setup(), source = await skill(root)
  await symlink(join(source, 'SKILL.md'), join(source, 'link.md'))
  await expect(api('importResource', { kind: 'skill', path: source })).rejects.toThrow('符号链接')
  await rm(join(source, 'link.md')); await link(join(source, 'SKILL.md'), join(source, 'hard.md'))
  await expect(api('importResource', { kind: 'skill', path: source })).rejects.toThrow('硬链接')
  expect((await api('snapshot', undefined)).resources).toEqual([])
})

test('skill and group ordering persist atomically without changing favorites or employee grants', async () => {
  const { root, api, service, start } = await setup()
  for (const name of ['alpha', 'beta', 'gamma']) await skill(join(root, 'library'), name, name)
  await install(api, join(root, 'library'))
  let value = await api('getSkillCollections', undefined)
  const [alpha, beta, gamma] = value.favoriteResourceIds
  const change = async (action: import('../packages/shared/src/domain/skills').SkillCollectionAction) => {
    value = await api('updateSkillCollections', { expectedRevision: value.revision, action })
  }
  await change({ kind: 'create-group', name: 'A' }); await change({ kind: 'create-group', name: 'B' })
  const [a, b] = value.groups
  await change({ kind: 'move-group', groupId: a.id, targetId: b.id, placement: 'after' })
  expect(value.groups.map(group => group.id)).toEqual([b.id, a.id])
  await change({ kind: 'move-group', groupId: a.id, targetId: b.id })
  expect(value.groups.map(group => group.id)).toEqual([a.id, b.id])
  await change({ kind: 'assign-group', resourceId: alpha, groupId: a.id })
  await change({ kind: 'assign-group', resourceId: beta, groupId: b.id })
  await change({ kind: 'move-skill', resourceId: beta, targetId: alpha, placement: 'before' })
  expect(value.favoriteResourceIds).toEqual([beta, alpha, gamma])
  expect(value.groupByResourceId).toEqual({ [alpha]: a.id, [beta]: a.id })
  await change({ kind: 'move-skill', resourceId: beta, targetId: gamma, placement: 'after' })
  expect(value.favoriteResourceIds).toEqual([alpha, gamma, beta])
  expect(value.groupByResourceId).toEqual({ [alpha]: a.id })
  const saved = structuredClone(value)
  await expect(change({ kind: 'move-skill', resourceId: beta, targetId: 'missing', placement: 'before' })).rejects.toThrow('已收藏')
  await expect(api('updateSkillCollections', { expectedRevision: value.revision - 1, action: { kind: 'move-skill', resourceId: alpha, targetId: beta, placement: 'after' } })).rejects.toThrow('其他窗口')
  expect(await api('getSkillCollections', undefined)).toEqual(saved)
  expect((await api('snapshot', undefined)).agents.every(agent => agent.skillIds.length === 0)).toBe(true)
  await service.close()
  expect(await (await start()).api('getSkillCollections', undefined)).toEqual(saved)
})
