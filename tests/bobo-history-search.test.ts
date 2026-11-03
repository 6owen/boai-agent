/*
 * [INPUT]: Real product SQLite/FTS5, authorized transcripts, AppService and a controlled Mastra HTTP provider.
 * [OUTPUT]: One-call evidence/late-match windows, Chinese short queries, index/backup lifecycle, source/forget fences and real SDK transport.
 * [POS]: Protocol/storage regressions; real-model latency comparisons are separate.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message, Conversation, Connection, ConversationDetail, Snapshot } from '../packages/shared/src/domain'
import type { EngineContext, AgentEngine } from '../packages/runtime/src/contracts'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createHistorySearchOperations, searchAuthorizedHistory, historySearchGuidance } from '../packages/runtime/src/modules/conversations/history-search'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { teamEndpoint, sendTeamOutput } from './fixtures/team-planner'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const message = (id: string, sequence: number, content: string, conversationId = 'old'): Message => ({ id, sequence, content, conversationId, senderType: 'user', senderId: 'user', senderName: '我', status: 'completed', createdAt: `2026-11-03T01:00:0${sequence}.000Z` })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-history-search-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const messages = [message('before', 1, '周二准备早点休息。'), message('fact', 2, '我周三去体检。'), message('after', 3, '报告出来再跟你说。')]
  const context: EngineContext = {
    agent: { id: 'bobo', configVersion: 1, systemRole: 'core', name: 'Bobo', role: '助手', instructions: '', color: '#123456', connectionId: 'test', modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true },
    conversation: { id: 'new', kind: 'direct', purpose: 'core', title: '新会话', agentIds: ['bobo'], mode: 'natural', workspacePath: root, sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    connection: { id: 'test', name: 'test', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test', hasApiKey: false }, apiKey: '', resources: [],
    messages: [message('question', 1, '我什么时候体检？', 'new')], triggerMessageId: 'question', runId: 'run', signal: new AbortController().signal,
    workspace: { root, workPath: root, runPath: root, sharedPath: root }, onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false, onAdditionalModelCall: async () => crypto.randomUUID(),
  }
  const sources = { resourceId: 'employee:bobo:private', threads: [{ conversationId: 'old', title: '生活安排', messages }, { conversationId: 'new', title: '当前', messages: context.messages }] }
  await store.write([...messages, ...context.messages, message('foreign', 4, '我周五去体检。', 'another-employee')].map(value => ({ collection: 'messages', id: value.id, value })))
  context.memorySources = async () => sources
  context.searchHistory = input => searchAuthorizedHistory(context, sources, input, (query, ids) => store.searchRawHistory(query, ids))
  return { root, store, messages, context, sources }
}

it('returns original dates and neighbors in one search, with FTS5 and two-character Chinese matching', async () => {
  const f = await fixture()
  for (const [query, matching] of [['体检', 'literal'], ['去体检', 'fts5-trigram']] as const) {
    const result = await f.context.searchHistory!({ query })
    expect(result.matching).toBe(matching); expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toMatchObject({ conversationId: 'old', conversationTitle: '生活安排', evidence: { messageId: 'fact', content: '我周三去体检。', createdAt: '2026-11-03T01:00:02.000Z', truncated: false } })
    expect(result.hits[0].before[0].content).toBe('周二准备早点休息。')
    expect(result.hits[0].after[0].content).toBe('报告出来再跟你说。')
    expect(JSON.stringify(result)).not.toContain('周五')
  }
  expect((await f.context.searchHistory!({ query: '体检', from: '2026-11-04' })).hits).toEqual([])
  await expect(f.context.searchHistory!({ query: '体检', from: '2026-11-04', to: '2026-11-01' })).rejects.toThrow('from')
})

it('filters authorized IDs before LIMIT and handles quoted or wildcard text literally', async () => {
  const f = await fixture()
  await f.store.write(Array.from({ length: 20 }, (_, n) => { const value = message(`foreign-${n}`, 4, '我周五去体检。', 'foreign'); return { collection: 'messages', id: value.id, value } }))
  expect((await f.store.searchRawHistory({ query: '去体检', limit: 1 }, ['fact'])).matches.map(item => item.id)).toEqual(['fact'])
  for (const query of ['%', "' OR 1=1 --", '"体检"']) expect((await f.context.searchHistory!({ query })).hits).toEqual([])
})

it('returns evidence around a late match instead of losing it at the beginning of a long message', async () => {
  const f = await fixture(), content = '无关背景。'.repeat(1500) + '周三去体检。'
  f.messages[1].content = content
  await f.store.write([{ collection: 'messages', id: 'fact', value: f.messages[1] }])
  const result = await f.context.searchHistory!({ query: '体检' }), evidence = result.hits[0].evidence
  expect(evidence.content).toContain('周三去体检')
  expect(evidence.truncated).toBe(true); expect(evidence.charOffset).toBeGreaterThan(0)
  expect(evidence.content).toBe(content.slice(evidence.charOffset, evidence.charOffset! + 4000))
})

it('keeps insert, edit, delete and restart consistent without extracting memories', async () => {
  const f = await fixture()
  expect((await f.store.searchRawHistory({ query: '去体检' }, ['fact'])).matches).toHaveLength(1)
  await f.store.write([{ collection: 'messages', id: 'fact', value: { ...f.messages[1], content: '我周四去复查。' } }])
  expect((await f.store.searchRawHistory({ query: '去体检' }, ['fact'])).matches).toEqual([])
  expect((await f.store.searchRawHistory({ query: '去复查' }, ['fact'])).matches).toHaveLength(1)
  await f.store.write([{ collection: 'messages', id: 'fact', value: { ...f.messages[1], content: '我周四去复查。', status: 'failed' } }])
  expect((await f.store.searchRawHistory({ query: '去复查' }, ['fact'])).matches).toEqual([])
  await f.store.write([{ collection: 'messages', id: 'fact', value: { ...f.messages[1], content: '我周四去复查。' } }])
  expect((await f.store.searchRawHistory({ query: '去复查' }, ['fact'])).matches).toHaveLength(1)
  // The product source changed after the authorized snapshot; stale text is never returned.
  expect((await f.context.searchHistory!({ query: '去复查' })).hits).toEqual([])
  await f.store.transaction(tx => tx.remove('messages', 'fact'))
  expect((await f.store.searchRawHistory({ query: '去复查' }, ['fact'])).matches).toEqual([])
  await f.store.close(); cleanup.pop()
  const reopened = new ProductStore(join(f.root, 'boai.sqlite')); await reopened.init(); cleanup.push(() => reopened.close())
  const value = message('new-fact', 1, '下周二去体检。')
  await reopened.write([{ collection: 'messages', id: value.id, value }])
  expect((await reopened.searchRawHistory({ query: '去体检' }, [value.id])).matches[0].id).toBe(value.id)
})

it('exposes the tool only to eligible Bobo API conversations, including clarification', async () => {
  const f = await fixture()
  expect(createHistorySearchOperations(f.context)).toHaveLength(1)
  expect(createHistorySearchOperations({ ...f.context, decision: { action: 'ask', observedThroughSequence: 1 } })).toHaveLength(1)
  expect(createHistorySearchOperations({ ...f.context, searchHistory: undefined })).toEqual([])
  expect(createHistorySearchOperations({ ...f.context, agent: { ...f.context.agent, id: 'writer', systemRole: undefined } })).toEqual([])
  expect(createHistorySearchOperations({ ...f.context, conversation: { ...f.context.conversation, kind: 'group' } })).toEqual([])
  expect(createHistorySearchOperations({ ...f.context, decision: { action: 'request_handoff', observedThroughSequence: 1 } })).toEqual([])
})

it('preserves original message identity through the actual SQLite backup/restore path', async () => {
  const f = await fixture(), backup = join(f.root, 'backup.sqlite')
  expect((await f.store.searchRawHistory({ query: '去体检' }, ['fact'])).matches[0].content).toBe('我周三去体检。')
  await f.store.backup(backup)
  const restored = new ProductStore(backup); await restored.init(); cleanup.push(() => restored.close())
  expect((await restored.searchRawHistory({ query: '去体检' }, ['fact'])).matches).toEqual([{ id: 'fact', content: '我周三去体检。' }])
})

it('runs the new tool through the actual Mastra SDK in two autonomous model steps', async () => {
  const f = await fixture(), events: { name: string; status: string }[] = [], answers: string[] = []
  const endpoint = await teamEndpoint((body, response) => {
    expect(body.tool_choice === undefined || body.tool_choice === 'auto').toBe(true)
    const messages = body.messages as { role: string; content: string }[]
    expect(messages.filter(message => message.role === 'system').map(message => message.content).join('\n')).toContain(historySearchGuidance)
    const results = messages.filter(message => message.role === 'tool')
    if (results.length) {
      expect(results[0].content).toContain('我周三去体检。'); expect(results[0].content).toContain('周二准备早点休息。')
      return sendTeamOutput(response, '你之前说周三去体检。')
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ id: 'call', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'search-1', type: 'function', function: { name: 'search_history', arguments: JSON.stringify({ query: '体检', context: 1, limit: 3 }) } }] }, finish_reason: null }] })}\n\n`)
    response.end(`data: ${JSON.stringify({ id: 'call', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`)
  }); cleanup.push(() => endpoint.close())
  f.context.connection!.baseUrl = endpoint.url; f.context.onTool = async event => { events.push(event) }; f.context.onDelta = async text => { answers.push(text) }
  const engine = new MastraEngine({ memoryPath: join(f.root, 'memory.db') }); cleanup.push(() => engine.closeMemory())
  await engine.run(f.context)
  expect(endpoint.requests).toHaveLength(2)
  expect(events.filter(event => event.status === 'completed').map(event => event.name)).toEqual(['search_history'])
  expect(answers.join('')).toContain('周三')
})

it('uses the real service source/forget fence for Bobo and never grants the tool to an ordinary employee', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-history-service-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const seen: EngineContext[] = [], results: unknown[] = []
  const engine: AgentEngine = { memoryOwner: 'mastra', test: async () => 'ok', decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }), run: async context => { seen.push(context); if (context.searchHistory) results.push(await context.searchHistory({ query: '体检' })); await context.onDelta('收到。') } }
  const service = new AppService({ dataPath: root, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test' }) as Connection
  for (const agent of (await service.handle('snapshot', undefined) as Snapshot).agents) { const { workspaceRef: _w, configVersion: _v, memoryNamespace: _n, policyVersion: _p, ...input } = agent; await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test' }) }
  const send = async (room: Conversation, content: string) => {
    await service.handle('sendMessage', { conversationId: room.id, content, mentionIds: [], requestId: crypto.randomUUID() })
    await vi.waitFor(async () => { const detail = await service.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.runs.length).toBeGreaterThan(0); expect(detail.runs.every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status))).toBe(true) })
  }
  const old = await service.handle('startCoreConversation', { content: '我周三去体检。', requestId: 'old-source' }) as Conversation
  await vi.waitFor(async () => expect((await service.handle('getConversation', { id: old.id }) as ConversationDetail).runs.some(run => run.phase === 'execution' && run.status === 'completed')).toBe(true))
  const next = await service.handle('startCoreConversation', { content: '最近有什么安排？', requestId: 'new-room' }) as Conversation
  await vi.waitFor(async () => expect((await service.handle('getConversation', { id: next.id }) as ConversationDetail).runs.some(run => run.phase === 'execution' && run.status === 'completed')).toBe(true))
  expect(JSON.stringify(results.at(-1))).toContain('我周三去体检。')
  const researcher = await service.handle('createConversation', { kind: 'direct', title: '私聊', agentIds: ['researcher'] }) as Conversation
  await send(researcher, '体检工具测试')
  expect(seen.at(-1)!.searchHistory).toBeUndefined()
  const query = { agentId: 'bobo', scope: 'employee' as const }, view = await service.handle('getMemory', query) as import('../packages/shared/src/domain').MemoryView
  await service.handle('clearMemory', { ...query, expectedEpoch: view.epoch, requestId: 'forget-history' })
  await send(next, '过去的安排呢？')
  expect(JSON.stringify(results.at(-1))).not.toContain('我周三去体检。')
})
