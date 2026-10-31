/*
 * [INPUT]: Real AppService, Mastra Memory and ProductStore with an isolated API employee.
 * [OUTPUT]: Shared API memory wiring, source isolation, no legacy extraction/injection and management/backup continuity.
 * [POS]: Host integration; the response is controlled and no external model is invoked.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../packages/runtime/src/service'
import { EmployeeConversationMemory } from '../packages/runtime/src/adapters/mastra/conversation-memory'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, MemoryView, Snapshot } from '../packages/shared/src/domain'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-mastra-service-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const memory = new EmployeeConversationMemory(join(root, 'memory', 'bobo-mastra.db'))
  const contexts: EngineContext[] = [], recalled: string[] = []
  const extractMemory = vi.fn(async () => [])
  const engine: AgentEngine = {
    memoryOwner: 'mastra', extractMemory,
    memoryView: id => memory.view(id), saveWorkingMemory: (...args) => memory.saveWorkingMemory(...args), clearEmployeeMemory: (...args) => memory.clearEmployee(...args), forgetEmployeeMemory: id => memory.forgetEmployee(id), forgetConversationMemory: id => memory.forgetConversation(id), closeMemory: () => memory.close(),
    decide: async context => ({ action: context.messages.some(message => message.turnId === context.turnId && message.senderId === context.agent.id) ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      contexts.push(context)
      if (context.continuity) context.messages = (await context.continuity.read()).messages
      const prepared = await memory.prepare(context)
      recalled.push(JSON.stringify({ ...await prepared.memory.getContext({ threadId: prepared.option.thread, resourceId: prepared.option.resource }), workingMemory: await prepared.memory.getWorkingMemory({ threadId: prepared.option.thread, resourceId: prepared.option.resource }) }))
      await context.onDelta('收到。')
    }, test: async () => 'ok',
  }
  const service = new AppService({ dataPath: root, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test' }) as Connection
  for (const agent of (await service.handle('snapshot', undefined) as Snapshot).agents) {
    const { workspaceRef: _, configVersion: _v, memoryNamespace: _n, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test' })
  }
  const direct = await service.handle('createConversation', { kind: 'direct', title: '私聊', agentIds: ['researcher'] }) as Conversation
  return { root, service, engine, memory, contexts, recalled, extractMemory, direct, connection }
}
async function send(service: AppService, room: Conversation, content: string) {
  await service.handle('sendMessage', { conversationId: room.id, content, mentionIds: room.kind === 'group' ? ['researcher'] : [], requestId: crypto.randomUUID() })
  await vi.waitFor(async () => {
    const detail = await service.handle('getConversation', { id: room.id }) as ConversationDetail
    expect(detail.turns?.every(turn => turn.status === 'completed')).toBe(true)
    expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  }, { timeout: 6000, interval: 20 })
}
const query = { agentId: 'researcher', scope: 'employee' as const }
it('routes API employee memory to Mastra and preserves a short adjacent tool reference', async () => {
  const f = await setup()
  await send(f.service, f.direct, '使用 AgentBrowser 查网页')
  await send(f.service, f.direct, '今天南京天气如何？')
  expect(f.recalled.at(-1)).toContain('AgentBrowser')
  expect(f.contexts.every(context => context.memoryOwner === 'mastra' && !context.recallMemory && !context.rememberMemory && context.memory?.entries.length === 0)).toBe(true)
  expect(f.extractMemory).not.toHaveBeenCalled()
  const view = await f.service.handle('getMemory', query) as MemoryView
  expect(view.managed?.backend).toBe('mastra')
  expect(view.entries).toEqual([])
  const group = await f.service.handle('createConversation', { kind: 'group', title: '项目群', agentIds: ['researcher', 'writer'] }) as Conversation
  await send(f.service, group, '群内问题')
  expect(f.recalled.at(-1)).not.toContain('AgentBrowser')
})
it('edits the actual WM, fences old sources, exports it and reopens after backup', async () => {
  const f = await setup()
  await send(f.service, f.direct, '数据库旧方案是 MySQL')
  await send(f.service, f.direct, '收到没有？')
  const view = await f.service.handle('getMemory', query) as MemoryView, document = view.managed!.documents[0]!
  await f.service.handle('saveMemory', { ...query, content: '数据库改用 PostgreSQL', expectedEpoch: view.epoch, managed: { resourceId: document.resourceId, expectedVersion: document.version } })
  await send(f.service, f.direct, '数据库现在是什么？')
  expect(f.recalled.at(-1)).toContain('PostgreSQL')
  expect(f.recalled.at(-1)).not.toContain('MySQL')
  const backup = await mkdtemp(join(tmpdir(), 'boai-mastra-backup-')); cleanup.push(() => rm(backup, { recursive: true, force: true }))
  await f.service.backup(backup)
  await access(join(backup, 'memory', 'bobo-mastra.db'))
  await send(f.service, f.direct, '继续')
  expect(f.recalled.at(-1)).toContain('PostgreSQL')
  const current = await f.service.handle('getMemory', query) as MemoryView
  await f.service.handle('clearMemory', { ...query, expectedEpoch: current.epoch, requestId: 'forget-all' })
  await send(f.service, f.direct, '新的交流')
  expect(f.recalled.at(-1)).not.toContain('PostgreSQL')
  expect(f.recalled.at(-1)).not.toContain('MySQL')
})

it('requires explicit embedding configuration and preserves its revision across memory reads', async () => {
  const f = await setup()
  await send(f.service, f.direct, 'Initial chat')
  let view = await f.service.handle('getMemory', query) as MemoryView
  const document = view.managed!.documents[0]!
  await f.service.handle('saveMemory', { ...query, content: 'KEEP_MANUAL_WM', expectedEpoch: view.epoch, managed: { resourceId: document.resourceId, expectedVersion: document.version } })
  const before = await f.service.handle('getMemory', query) as MemoryView
  expect(before.managed!.semanticRecall).toBe(false)
  const selected = { connectionId: f.connection.id, modelId: 'embedding-fixture' }
  const settings = await f.service.handle('configureMemory', { agentId: query.agentId, expectedRevision: 0, embedding: selected })
  await send(f.service, f.direct, 'Continue after embedding setup')
  view = await f.service.handle('getMemory', query) as MemoryView
  expect(view.managed!.documents[0]!.workingMemory).toBe('KEEP_MANUAL_WM')
  expect(settings).toMatchObject({ revision: 1, embedding: selected })
  await expect(f.service.handle('configureMemory', { agentId: query.agentId, expectedRevision: 0, embedding: null })).rejects.toThrow()
  expect((await f.service.handle('getMemory', query) as MemoryView).managed).toMatchObject({ semanticRecall: true, settings: { revision: 1, embedding: selected } })
  await f.service.handle('configureMemory', { agentId: query.agentId, expectedRevision: 1, embedding: null })
  expect((await f.service.handle('getMemory', query) as MemoryView).managed!.semanticRecall).toBe(false)
})
it.each(['codex', 'claude'] as const)('keeps %s native memory outside Mastra management', async runtime => {
  const { nativeFixture } = await import('./fixtures/native-product')
  const memoryView = vi.fn(async () => { throw new Error('Native must not query API memory') })
  const disposals: (() => Promise<void>)[] = []
  cleanup.push(async () => { for (const dispose of disposals.reverse()) await dispose() })
  const f = await nativeFixture(runtime, disposals, { memoryOwner: 'mastra', memoryView, run: async () => { throw new Error('Native must not call API') }, test: async () => '' })
  const query = { agentId: f.agent.id, scope: 'employee' as const }
  const view = await f.service.handle('getMemory', query) as MemoryView
  expect(view.managed).toMatchObject({ backend: 'native', documents: [] })
  await expect(f.service.handle('clearMemory', { ...query, expectedEpoch: view.epoch })).rejects.toThrow('本机 Agent')
  await expect(f.service.handle('configureMemory', { agentId: f.agent.id, expectedRevision: 0, embedding: null })).rejects.toThrow('本机 Agent')
  expect(memoryView).not.toHaveBeenCalled()
})
