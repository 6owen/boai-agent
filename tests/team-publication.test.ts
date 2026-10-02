/*
 * [INPUT]: 真实宿主/SQLite/文件系统、确定方案与精确初始化断点。
 * [OUTPUT]: 旧 team-planner 来源显式判别后保留原 plannerVersion 断言，与独立 bobo 协作来源区分。
 * [OUTPUT]: 员工/群/分类同事务发布，分类重名避让与用户后续整理不重放；有界等待及原重复受理、事务失败、取消清理、目录缺失/外改和备份恢复断言。
 * [POS]: T1.3 一致性测试；不使用真实收费模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { Method, Methods } from '../src/shared/ipc'
import type { TeamCreationOperation, TeamDraft } from '../src/shared/domain/team-creation'
import type { TeamFileCheckpoint } from '../src/runtime/modules/teams/team-files'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { TeamRepository } from '../src/runtime/modules/teams/team-repository'
import { TeamCreationService } from '../src/runtime/modules/teams/team-creation'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { writingPlan } from './fixtures/team-planner'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
async function root() { const path = await mkdtemp(join(tmpdir(), 'boai-team-publish-')); cleanup.push(() => rm(path, { recursive: true, force: true })); return path }
async function start(dataPath: string, checkpoint?: TeamFileCheckpoint) {
  const service = new AppService({ dataPath, teamFileCheckpoint: checkpoint, teamPlanner: async () => writingPlan, engine: { run: async () => { throw new Error('no employee calls') }, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  return { service, api: <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']> }
}
async function setup(checkpoint?: TeamFileCheckpoint, group = true) {
  const dataPath = await root(), app = await start(dataPath, checkpoint), { api } = app
  const connection = await api('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' })
  let draft = await api('openTeamDraft', undefined)
  draft = await api('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '四人写作', selectedConnectionId: connection.id, selectedModelId: '', createGroup: group, groupTitle: '讨论' } })
  await api('generateTeamPlan', { draftId: draft.id, expectedVersion: draft.version, requestId: 'generate' })
  await vi.waitFor(async () => { draft = (await api('getTeamDraft', { draftId: draft.id })).draft; expect(draft.generationStatus).toBe('succeeded') })
  const request = { draftId: draft.id, expectedVersion: draft.version, planHash: draft.planHash!, requestId: 'create' }
  const before = await api('snapshot', undefined)
  const settle = async (id: string, status: TeamCreationOperation['status']) => { let operation!: TeamCreationOperation; await vi.waitFor(async () => { operation = await api('getTeamCreation', { operationId: id }); expect(operation.status).toBe(status) }, { timeout: 5000 }); return operation }
  return { ...app, dataPath, connection, draft, request, before, settle }
}

test.each([true, false])('publish all employees together, optional group=%s, stable identities and no implicit direct chats/messages/Work', async group => {
  const { api, request, before, settle, dataPath } = await setup(undefined, group)
  const results = await Promise.all(Array.from({ length: 5 }, () => api('acceptTeamCreation', request)))
  expect(new Set(results.map(value => value.id)).size).toBe(1)
  const operation = await settle(results[0].id, 'committed'), after = await api('snapshot', undefined)
  expect(after.agents).toHaveLength(before.agents.length + 4); expect(after.conversations).toHaveLength(group ? 1 : 0)
  expect(await api('acceptTeamCreation', request)).toMatchObject({ id: operation.id, status: 'committed' })
  await expect(api('acceptTeamCreation', { ...request, planHash: '0'.repeat(64) })).rejects.toThrow('REQUEST_CONFLICT')
  const agents = after.agents.filter(agent => agent.creationSource?.operationId === operation.id)
  const contacts = await api('getContactList', undefined)
  expect(contacts.categories).toEqual([{ id: operation.id, name: writingPlan.name }])
  expect(contacts.categoryByAgentId).toEqual(Object.fromEntries(agents.map(agent => [agent.id, operation.id])))
  expect(contacts.revision).toBe(1)
  for (const agent of agents) {
    expect(agent.allowCommands).toBe(false); expect(agent.skillIds).toEqual([]); expect(agent.knowledgeIds).toEqual([])
    expect(await readFile(join(dataPath, agent.workspaceRef!, 'AGENTS.md'), 'utf8')).toBe(agent.instructions)
    expect((await api('getAgentHome', { agentId: agent.id })).files.every(file => file.status === 'current')).toBe(true)
  }
  if (group) { expect(after.conversations[0].agentIds).toEqual(operation.memberIds.map(value => value.agentId)); expect(after.conversations[0].teamSetup?.purpose).toBe(writingPlan.purpose) }
  expect(after.agents.filter(agent => !agent.creationSource)).toEqual(before.agents)
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  for (const collection of ['messages', 'workItems', 'runs']) expect(await store.load(collection)).toEqual([])
  const direct = await api('createConversation', { kind: 'direct', title: agents[0].name, agentIds: [agents[0].id] })
  expect(direct.agentIds[0]).toBe(operation.memberIds[0].agentId)
})

test('partial files stay invisible and resume uses the original IDs without repeating generation', async () => {
  let failed = false
  const a = await setup(async (phase, operation, path) => { if (phase === 'after-write' && path?.includes(operation.memberIds[1].agentId) && !failed) { failed = true; throw new Error('injected second member interruption') } })
  const accepted = await a.api('acceptTeamCreation', a.request), broken = await a.settle(accepted.id, 'needs_attention')
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
  await a.service.close(); const b = await start(a.dataPath)
  const recovered = await b.api('getTeamCreation', { operationId: accepted.id }); expect(recovered.status).toBe('interrupted')
  expect(recovered.memberIds).toEqual(broken.memberIds); expect((await b.api('snapshot', undefined)).agents).toEqual(a.before.agents)
  await b.api('resumeTeamCreation', { operationId: accepted.id, expectedVersion: recovered.version })
  await vi.waitFor(async () => expect((await b.api('getTeamCreation', { operationId: accepted.id })).status).toBe('committed'))
  expect((await b.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 4)
})

test('connection change after preparation prevents publication, and restoring the original config permits explicit resume', async () => {
  let breakOnce = true
  const a = await setup(async phase => { if (phase === 'before-commit' && breakOnce) { breakOnce = false; throw new Error('pause before commit') } })
  const operation = await a.api('acceptTeamCreation', a.request); await a.settle(operation.id, 'needs_attention')
  await a.api('saveConnection', { id: a.connection.id, name: 'fixture', provider: 'openai-compatible', baseUrl: a.connection.baseUrl, defaultModel: 'changed' })
  let current = await a.api('getTeamCreation', { operationId: operation.id })
  await a.api('resumeTeamCreation', { operationId: current.id, expectedVersion: current.version }); await a.settle(current.id, 'needs_attention')
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
  await a.api('saveConnection', { id: a.connection.id, name: 'fixture', provider: 'openai-compatible', baseUrl: a.connection.baseUrl, defaultModel: 'fixture' })
  current = await a.api('getTeamCreation', { operationId: operation.id })
  await a.api('resumeTeamCreation', { operationId: current.id, expectedVersion: current.version }); await a.settle(current.id, 'committed')
})

test.each(['conversations', 'teamDrafts'])('a failed %s publication write rolls back employees and category and keeps owned files for resume', async faultCollection => {
  const a = await setup(), store = (a.service as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
  let inject = true
  vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => { if (inject && record.collection === faultCollection && (faultCollection !== 'teamDrafts' || (record.value as TeamDraft).status === 'committed')) { inject = false; throw new Error('commit fault') }; await tx.put(record) } })))
  const accepted = await a.api('acceptTeamCreation', a.request), failed = await a.settle(accepted.id, 'needs_attention')
  expect((await store.load('agents')).length).toBe(a.before.agents.length); expect(await store.load('conversations')).toEqual([])
  expect((await a.api('getContactList', undefined)).categories).toEqual([])
  expect((await a.api('getContactList', undefined)).categoryByAgentId).toEqual({})
  await a.api('resumeTeamCreation', { operationId: failed.id, expectedVersion: failed.version }); await a.settle(failed.id, 'committed')
  expect((await a.api('getContactList', undefined)).categories).toEqual([{ id: failed.id, name: writingPlan.name }])
})

test('a team gets a separate category without changing existing classification; later user moves and deletion are not recreated', async () => {
  const a = await setup(), teamName = '中文创作'.repeat(15)
  const created = await a.api('updateContactList', { expectedRevision: 0, action: { kind: 'create-category', name: teamName.slice(0, 40) } })
  const previous = await a.api('updateContactList', { expectedRevision: created.revision, action: { kind: 'assign-category', agentId: a.before.agents[0].id, categoryId: created.categories[0].id } })
  const draft = await a.api('saveTeamDraft', { draftId: a.draft.id, expectedVersion: a.draft.version, editableFields: { prompt: a.draft.prompt, selectedConnectionId: a.draft.selectedConnectionId, selectedModelId: a.draft.selectedModelId, createGroup: a.draft.createGroup, groupTitle: a.draft.groupTitle, plan: { ...a.draft.plan!, name: teamName } } })
  const request = { ...a.request, expectedVersion: draft.version, planHash: draft.planHash! }
  const operation = await a.api('acceptTeamCreation', request); await a.settle(operation.id, 'committed')
  const contacts = await a.api('getContactList', undefined)
  expect(contacts.categories).toEqual([...previous.categories, { id: operation.id, name: teamName.slice(0, 37) + '（2）' }])
  expect(contacts.categoryByAgentId[a.before.agents[0].id]).toBe(previous.categories[0].id)
  expect(contacts.agentOrder).toEqual(previous.agentOrder); expect(contacts.groupOrder).toEqual(previous.groupOrder)
  const moved = await a.api('updateContactList', { expectedRevision: contacts.revision, action: { kind: 'assign-category', agentId: operation.memberIds[0].agentId, categoryId: previous.categories[0].id } })
  const deleted = await a.api('updateContactList', { expectedRevision: moved.revision, action: { kind: 'delete-category', categoryId: operation.id } })
  await a.service.close(); const b = await start(a.dataPath)
  await b.api('acceptTeamCreation', request)
  await b.api('resumeTeamCreation', { operationId: operation.id, expectedVersion: 1 })
  expect(await b.api('getContactList', undefined)).toEqual(deleted)
  expect((await b.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 4)
})

test('after-commit installation failure reloads all objects and later retries return the receipt', async () => {
  const a = await setup(async phase => { if (phase === 'after-commit') throw new Error('lost installation') })
  const operation = await a.api('acceptTeamCreation', a.request); await a.settle(operation.id, 'committed')
  expect((await a.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 4)
  await a.service.close(); const b = await start(a.dataPath)
  expect(await b.api('acceptTeamCreation', a.request)).toMatchObject({ id: operation.id, status: 'committed' })
  const draft = (await b.api('getTeamDraft', { draftId: a.draft.id })).draft
  await b.api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })
  expect((await b.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 4)
})

test('external modification blocks resume and cleanup; repairing exactly owned content permits cleanup without touching existing staff', async () => {
  const a = await setup(async phase => { if (phase === 'before-commit') throw new Error('pause') })
  const operation = await a.api('acceptTeamCreation', a.request); const failed = await a.settle(operation.id, 'needs_attention')
  const path = join(a.dataPath, 'agents', operation.memberIds[0].agentId, 'workspace', 'AGENTS.md'), original = await readFile(path, 'utf8')
  await writeFile(path, 'user-edited data')
  await a.api('resumeTeamCreation', { operationId: failed.id, expectedVersion: failed.version }); const conflict = await a.settle(failed.id, 'needs_attention'); expect(conflict.error).toContain('FILES_CONFLICT')
  const draft = (await a.api('getTeamDraft', { draftId: a.draft.id })).draft
  await expect(a.api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })).rejects.toThrow('FILES_CONFLICT')
  expect((await a.api('getTeamCreation', { operationId: failed.id })).error).toContain('CLEANUP_REQUIRED'); expect(await readFile(path, 'utf8')).toBe('user-edited data')
  await writeFile(path, original)
  await a.api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })
  expect((await a.api('getTeamCreation', { operationId: failed.id })).status).toBe('cancelled')
  expect((await a.api('getTeamDraft', { draftId: draft.id })).draft.prompt).toBe('')
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
  expect((await a.api('acceptTeamCreation', a.request)).status).toBe('cancelled')
})

test('backup refuses unfinished creation; committed backup restores objects and receipts without recreating deleted employees', async () => {
  let pause = true
  const a = await setup(async phase => { if (phase === 'before-commit' && pause) throw new Error('pause') })
  const operation = await a.api('acceptTeamCreation', a.request), failed = await a.settle(operation.id, 'needs_attention'), destination = join(await root(), 'backup')
  await expect(a.service.backup(destination)).rejects.toThrow('团队创建')
  pause = false; await a.api('resumeTeamCreation', { operationId: failed.id, expectedVersion: failed.version }); await a.settle(failed.id, 'committed')
  await a.service.backup(destination)
  const b = await start(destination)
  expect((await b.api('getTeamCreation', { operationId: failed.id })).status).toBe('committed')
  expect((await b.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 4)
  await b.service.close()
  const store = new ProductStore(join(destination, 'boai.sqlite')); await store.init(); await store.write([], [{ collection: 'agents', id: operation.memberIds[0].agentId }]); await store.close()
  const c = await start(destination)
  expect((await c.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + 3)
  expect((await c.api('acceptTeamCreation', a.request)).status).toBe('committed')
})

test('independent SQLite connections cannot accept two different requests for one draft', async () => {
  const a = await setup(), second = new ProductStore(join(a.dataPath, 'boai.sqlite')); await second.init(); cleanup.push(() => second.close())
  const service = new TeamCreationService(new TeamRepository(second), a.dataPath, new WorkspaceService(a.dataPath), { critical: async () => { throw new Error('test prevents file launch') }, install: () => {}, reload: async () => {}, changed: () => {} }); cleanup.push(() => service.close())
  const results = await Promise.allSettled([a.api('acceptTeamCreation', a.request), service.accept({ ...a.request, requestId: 'different' })])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(await second.load('teamCreations')).toHaveLength(1)
})

test('cancellation wins before publication, waits for preparation to exit and then removes only owned files', async () => {
  let reached!: () => void, release!: () => void
  const ready = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  const a = await setup(async phase => { if (phase === 'before-commit') { reached(); await gate } })
  const operation = await a.api('acceptTeamCreation', a.request); await ready
  const draft = (await a.api('getTeamDraft', { draftId: a.draft.id })).draft
  const cancelling = a.api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })
  await vi.waitFor(async () => expect((await a.api('getTeamCreation', { operationId: operation.id })).cancelRequested).toBe(true))
  release(); await cancelling
  expect((await a.api('getTeamCreation', { operationId: operation.id })).status).toBe('cancelled')
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
  await expect(readFile(join(a.dataPath, 'agents', operation.memberIds[0].agentId, 'workspace', 'AGENTS.md'))).rejects.toThrow()
})

test.each(['directory', 'symlink'])('a foreign %s at the final target is never overwritten or cleaned', async kind => {
  let target = '', original = ''
  const a = await setup(async (phase, operation) => {
    if (phase !== 'before-write' || target) return
    target = join(a.dataPath, 'agents', operation.memberIds[0].agentId)
    if (kind === 'symlink') { original = join(a.dataPath, 'agents', 'writer'); await symlink(original, target) }
    else { await mkdir(target); await writeFile(join(target, 'foreign.txt'), 'keep me') }
  })
  const operation = await a.api('acceptTeamCreation', a.request), failed = await a.settle(operation.id, 'needs_attention')
  expect(failed.error).toContain('FILES_CONFLICT')
  const draft = (await a.api('getTeamDraft', { draftId: a.draft.id })).draft
  await expect(a.api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })).rejects.toThrow('FILES_CONFLICT')
  if (kind === 'directory') expect(await readFile(join(target, 'foreign.txt'), 'utf8')).toBe('keep me')
  else expect(await readFile(join(original, 'workspace', 'AGENTS.md'), 'utf8')).toBe(a.before.agents.find(agent => agent.id === 'writer')!.instructions)
})

test.each([1, 12])('editable boundary of %i members publishes all members with unique host identities', async count => {
  const a = await setup(), plan = a.draft.plan!
  const members = Array.from({ length: count }, (_, i) => ({ ...plan.members[0], memberKey: i === 0 ? plan.members[0].memberKey : undefined, name: `员工 ${i + 1}` }))
  const saved = await a.api('saveTeamDraft', { draftId: a.draft.id, expectedVersion: a.draft.version, editableFields: { prompt: a.draft.prompt, selectedConnectionId: a.draft.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: '边界', plan: { ...plan, members } } })
  const operation = await a.api('acceptTeamCreation', { ...a.request, expectedVersion: saved.version, planHash: saved.planHash! }); await a.settle(operation.id, 'committed')
  expect(operation.memberIds).toHaveLength(count); expect(new Set(operation.memberIds.map(m => m.agentId)).size).toBe(count)
  expect((await a.api('snapshot', undefined)).agents).toHaveLength(a.before.agents.length + count)
})

test('group background edits use config versions, preserve source, can be removed and cannot attach to a private chat', async () => {
  const a = await setup(), operation = await a.api('acceptTeamCreation', a.request); await a.settle(operation.id, 'committed')
  const group = (await a.api('snapshot', undefined)).conversations[0]
  const request = { id: group.id, expectedConfigVersion: group.configVersion, kind: 'group' as const, title: group.title, agentIds: group.agentIds, teamSetup: { ...group.teamSetup!, purpose: '只讨论用户提供的材料', collaborationGuide: '不自动启动任务' } }
  const changed = await a.api('createConversation', request)
  expect(changed.teamSetup).toEqual(request.teamSetup); expect(changed.creationSource).toEqual(group.creationSource)
  await expect(a.api('createConversation', request)).rejects.toThrow()
  const removed = await a.api('createConversation', { ...request, expectedConfigVersion: changed.configVersion, teamSetup: null })
  expect(removed.teamSetup).toBeUndefined()
  await expect(a.api('createConversation', { kind: 'direct', title: 'private', agentIds: [group.agentIds[0]], teamSetup: request.teamSetup })).rejects.toThrow('仅用于群聊')
})

test('changing the prompt invalidates a prior plan instead of publishing stale members', async () => {
  const a = await setup()
  const saved = await a.api('saveTeamDraft', { draftId: a.draft.id, expectedVersion: a.draft.version, editableFields: { prompt: '另一项完全不同的需求', selectedConnectionId: a.draft.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: a.draft.groupTitle, plan: a.draft.plan } })
  expect(saved.planHash).toBeUndefined(); expect(saved.plan).toEqual(a.draft.plan)
  await expect(a.api('acceptTeamCreation', { ...a.request, expectedVersion: saved.version })).rejects.toThrow()
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
})

test('an externally removed prepared root prevents the final transaction from publishing missing workspaces', async () => {
  const a = await setup(async (phase, operation) => { if (phase === 'before-commit') await rm(join(aData(), 'agents', operation.memberIds[0].agentId), { recursive: true }) })
  function aData() { return a.dataPath }
  const operation = await a.api('acceptTeamCreation', a.request), failed = await a.settle(operation.id, 'needs_attention')
  expect(failed.error).toContain('已准备目录被移除'); expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
})
test('external changes during preparation are checked again before an interrupted file is replaced', async () => {
  let changed = ''
  const a = await setup(async (phase, _operation, path) => { if (phase === 'before-write' && !changed) { changed = path!; await writeFile(path!, '外部文件，不得覆盖') } })
  const operation = await a.api('acceptTeamCreation', a.request), failed = await a.settle(operation.id, 'needs_attention')
  expect(failed.error).toContain('写入前文件已变化'); expect(await readFile(changed, 'utf8')).toBe('外部文件，不得覆盖')
  expect((await a.api('snapshot', undefined)).agents).toEqual(a.before.agents)
})

test('an older planner version remains editable and publishable without allowing renderer provenance changes', async () => {
  const a = await setup(), store = new ProductStore(join(a.dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const original = { ...a.draft, plan: { ...a.draft.plan!, plannerVersion: 'team-planner-v1' } }
  await store.write([{ collection: 'teamDrafts', id: original.id, value: original }])
  const fields = { prompt: original.prompt, selectedConnectionId: original.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: original.groupTitle, plan: { ...original.plan, purpose: '保留早期草稿修改' } }
  await expect(a.api('saveTeamDraft', { draftId: original.id, expectedVersion: original.version, editableFields: { ...fields, plan: { ...fields.plan, plannerVersion: 'forged' } } })).rejects.toThrow('身份不属于本草稿')
  const saved = await a.api('saveTeamDraft', { draftId: original.id, expectedVersion: original.version, editableFields: fields })
  const operation = await a.api('acceptTeamCreation', { ...a.request, expectedVersion: saved.version, planHash: saved.planHash! }); await a.settle(operation.id, 'committed')
  expect((await a.api('snapshot', undefined)).agents.filter(agent => agent.creationSource).every(agent => agent.creationSource?.kind === 'team-planner' && agent.creationSource.plannerVersion === 'team-planner-v1')).toBe(true)
})
