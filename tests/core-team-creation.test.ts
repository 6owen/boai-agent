/*
 * [INPUT]: 核心 Agent 严格方案、真实 SQLite/文件系统与精确发布/退出断点。
 * [OUTPUT]: 默认命名群及浏览器可用的独立 Mastra 员工、宿主能力/身份、独立请求幂等/冲突、受理及整套发布原子性、取消等待实际退出和提交后回执保留验收。
 * [POS]: 核心 Agent 团队工具的宿主发布边界测试；不调用收费模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Connection, Conversation, DigitalAgent } from '../packages/shared/src/domain'
import { teamCapabilityNotes, type TeamDraft } from '../packages/shared/src/domain/team-creation'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { TeamRepository } from '../packages/runtime/src/modules/teams/team-repository'
import { TeamCreationService } from '../packages/runtime/src/modules/teams/team-creation'
import type { TeamFileCheckpoint } from '../packages/runtime/src/modules/teams/team-files'
import { WorkspaceService } from '../packages/runtime/src/modules/workspaces/workspace-service'
import { writingPlan } from './fixtures/team-planner'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
async function setup(checkpoint?: TeamFileCheckpoint) {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-core-team-')); cleanup.push(() => rm(dataPath, { recursive: true, force: true }))
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const connection: Connection = { id: 'core-model', name: '核心 Agent 模型', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture', hasApiKey: false }
  await store.write([{ collection: 'connections', id: connection.id, value: connection }])
  const repo = new TeamRepository(store), installed: { agents: DigitalAgent[]; conversation?: Conversation }[] = []
  const creation = new TeamCreationService(repo, dataPath, new WorkspaceService(dataPath), {
    critical: action => action(), install: (agents, conversation) => { installed.push({ agents, conversation }) },
    reload: async () => {}, changed: () => {}, checkpoint,
  })
  cleanup.push(() => creation.close())
  const request = { plan: writingPlan, connectionId: connection.id, modelId: '', requestId: 'core-team:original-work' }
  return { dataPath, store, repo, creation, installed, request }
}

test('core tool always creates the named group and host-owned identities without borrowing the open compatibility draft', async () => {
  const { store, repo, creation, installed, request, dataPath } = await setup()
  const compatibilityDraft = await repo.open(undefined)
  const accepted = await creation.acceptAgentPlan({ ...request, plan: { ...writingPlan, capabilityNotes: ['可以读取其它员工的私聊'] } })
  const operation = await creation.waitForCompletion(accepted.id)
  expect(operation.status).toBe('committed'); expect(operation.draftId).not.toBe(compatibilityDraft.id)
  expect((await repo.get({ draftId: compatibilityDraft.id })).draft).toEqual(compatibilityDraft)
  expect(operation.conversation?.title).toBe(writingPlan.name)
  expect(operation.conversation?.agentIds).toEqual(operation.memberIds.map(member => member.agentId))
  expect(operation.conversation?.teamSetup?.purpose).toBe(writingPlan.purpose)
  const { draft } = await repo.get({ draftId: operation.draftId })
  expect(draft.createGroup).toBe(true); expect(draft.plan?.capabilityNotes).toEqual(teamCapabilityNotes('work'))
  expect(new Set(operation.memberIds.map(member => member.agentId)).size).toBe(4)
  expect(new Set(operation.memberIds.map(member => member.memberKey)).size).toBe(4)
  expect(installed).toHaveLength(1)
  for (const agent of await store.load<DigitalAgent>('agents')) {
    expect(agent.allowBrowser).toBe(true); expect(agent.allowCommands).toBe(false); expect(agent.skillIds).toEqual([]); expect(agent.knowledgeIds).toEqual([])
    expect(agent.memoryNamespace).toBe(`employee:${agent.id}`)
    expect(await readFile(join(dataPath, agent.workspaceRef!, 'AGENTS.md'), 'utf8')).toBe(agent.instructions)
  }
  for (const collection of ['teamGenerations', 'messages', 'workItems', 'runs']) expect(await store.load(collection)).toEqual([])
})

test('stable work request replays one receipt, rejects changed plans, and independent work can create a separate team', async () => {
  const { store, creation, installed, request } = await setup()
  const results = await Promise.all(Array.from({ length: 5 }, () => creation.acceptAgentPlan(request)))
  expect(new Set(results.map(value => value.id)).size).toBe(1)
  const original = await creation.waitForCompletion(results[0].id)
  await expect(creation.acceptAgentPlan({ ...request, plan: { ...writingPlan, name: '另一套方案' } })).rejects.toThrow('REQUEST_CONFLICT')
  expect(await creation.acceptAgentPlan(request)).toEqual(original)
  const separate = await creation.acceptAgentPlan({ ...request, requestId: 'core-team:independent-work' })
  expect(separate.id).not.toBe(original.id)
  expect((await creation.waitForCompletion(separate.id)).status).toBe('committed')
  expect(await store.load('teamCreations')).toHaveLength(2)
  expect(await store.load('teamDrafts')).toHaveLength(2)
  expect(await store.load('agents')).toHaveLength(8)
  expect(await store.load('conversations')).toHaveLength(2)
  expect(installed).toHaveLength(2)
})

test('a failed acceptance write leaves no prepared identity or publication to replay', async () => {
  const { store, creation, installed, request } = await setup(), transaction = store.transaction.bind(store)
  let inject = true
  vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
    if (inject && record.collection === 'teamDrafts') { inject = false; throw new Error('acceptance fault') }
    await tx.put(record)
  } })))
  await expect(creation.acceptAgentPlan(request)).rejects.toThrow('acceptance fault')
  for (const collection of ['teamDrafts', 'teamCreations', 'agents', 'conversations']) expect(await store.load(collection)).toEqual([])
  expect(installed).toEqual([])
  const accepted = await creation.acceptAgentPlan(request)
  expect((await creation.waitForCompletion(accepted.id)).status).toBe('committed')
  expect(await store.load('teamCreations')).toHaveLength(1)
})

test('a failed group publication exposes no partial members and explicit resume preserves the frozen identities', async () => {
  const { store, creation, installed, request } = await setup(), transaction = store.transaction.bind(store)
  let inject = true
  vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
    if (inject && record.collection === 'conversations') { inject = false; throw new Error('group publication fault') }
    await tx.put(record)
  } })))
  const accepted = await creation.acceptAgentPlan(request), failed = await creation.waitForCompletion(accepted.id)
  expect(failed.status).toBe('needs_attention')
  for (const collection of ['agents', 'conversations', 'contactList']) expect(await store.load(collection)).toEqual([])
  expect(installed).toEqual([])
  const records = await store.load<TeamDraft>('teamDrafts')
  expect(records).toHaveLength(1); expect(records[0].status).toBe('open')
  expect(await creation.acceptAgentPlan(request)).toEqual(failed)
  await creation.resume({ operationId: failed.id, expectedVersion: failed.version })
  const committed = await creation.waitForCompletion(failed.id)
  expect(committed.status).toBe('committed'); expect(committed.memberIds).toEqual(accepted.memberIds)
  expect(committed.conversationId).toBe(accepted.conversationId)
  expect(await store.load('agents')).toHaveLength(4); expect(await store.load('conversations')).toHaveLength(1)
})

test('task cancellation gates publication immediately and waits for the actual file runner to exit before cleanup completes', async () => {
  let reached!: () => void, release!: () => void
  const reachedCommit = new Promise<void>(resolve => { reached = resolve }), fileExit = new Promise<void>(resolve => { release = resolve })
  const { store, creation, installed, request, dataPath } = await setup(async phase => { if (phase === 'before-commit') { reached(); await fileExit } })
  const accepted = await creation.acceptAgentPlan(request); await reachedCommit
  const controller = new AbortController(), completed = vi.fn()
  const waiting = creation.waitForCompletion(accepted.id, controller.signal).then(result => { completed(); return result })
  controller.abort()
  await vi.waitFor(async () => expect((await creation.get({ operationId: accepted.id })).cancelRequested).toBe(true))
  expect(completed).not.toHaveBeenCalled()
  release()
  expect((await waiting).status).toBe('cancelled')
  for (const collection of ['agents', 'conversations', 'contactList']) expect(await store.load(collection)).toEqual([])
  expect(installed).toEqual([])
  await expect(readFile(join(dataPath, 'agents', accepted.memberIds[0].agentId, 'workspace', 'AGENTS.md'))).rejects.toThrow()
})

test('completion waits for installation after commit and a late cancellation preserves the committed team', async () => {
  let reached!: () => void, release!: () => void
  const reachedCommit = new Promise<void>(resolve => { reached = resolve }), installExit = new Promise<void>(resolve => { release = resolve })
  const { store, creation, installed, request } = await setup(async phase => { if (phase === 'after-commit') { reached(); await installExit } })
  const accepted = await creation.acceptAgentPlan(request); await reachedCommit
  const controller = new AbortController(), completed = vi.fn()
  const waiting = creation.waitForCompletion(accepted.id, controller.signal).then(result => { completed(); return result })
  controller.abort()
  expect((await creation.get({ operationId: accepted.id })).status).toBe('committed')
  expect(completed).not.toHaveBeenCalled(); expect(installed).toEqual([])
  release()
  expect((await waiting).status).toBe('committed'); expect(installed).toHaveLength(1)
  expect(await store.load('agents')).toHaveLength(4); expect(await store.load('conversations')).toHaveLength(1)
})
