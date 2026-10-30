/*
 * [OUTPUT]: 2026-10-30 回归更新为Mastra官方记忆/原生归属合同；保留来源、调用预算和业务发布断言。
 * [INPUT]: Installed Mastra Memory/LibSQL and authorized product transcripts.
 * [OUTPUT]: API employee isolation, full history, durable WM, source withdrawal and irreversible forget fences.
 * [POS]: Real storage integration; no external provider calls.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../packages/shared/src/domain'
import type { EngineContext } from '../packages/runtime/src/contracts'
import { EmployeeConversationMemory, memoryResourceId } from '../packages/runtime/src/adapters/mastra/conversation-memory'
const roots: string[] = [], adapters: EmployeeConversationMemory[] = []
afterEach(async () => { await Promise.all(adapters.splice(0).map(adapter => adapter.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const message = (id: string, sequence: number, content: string, conversationId = 'room'): Message => ({ id, sequence, senderType: 'user', senderId: 'user', senderName: '我', content, turnId: `t${sequence}`, conversationId, createdAt: new Date(2026, 0, 1, 0, sequence).toISOString(), status: 'completed' } as Message)
function context(messages: Message[], agentId = 'ds'): EngineContext {
  return { agent: { id: agentId, name: agentId, modelId: 'test', skillIds: [] }, connection: { id: 'api', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test' }, apiKey: '', conversation: { id: 'room', title: 'Room', kind: 'direct', agentIds: [agentId] }, messages, triggerMessageId: messages.at(-1)!.id, turnId: messages.at(-1)!.turnId, signal: new AbortController().signal, runId: 'run', onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false } as unknown as EngineContext
}
async function adapter(threshold?: number) { const root = await mkdtemp(join(tmpdir(), 'boai-mastra-memory-')); roots.push(root); const path = join(root, 'memory.db'); const value = new EmployeeConversationMemory(path, threshold); adapters.push(value); return { path, value } }
const text = (rows: Awaited<ReturnType<import('@mastra/memory').Memory['recall']>>['messages']) => rows.map(row => row.content.parts.filter(part => part.type === 'text').map(part => part.text).join('')).join('\n')

it('persists all authorized history beyond the old 100-message window, with stable employee identities', async () => {
  const { value } = await adapter(50000)
  const messages = Array.from({ length: 121 }, (_, index) => message(`m${index}`, index + 1, index === 0 ? '使用 AgentBrowser' : `note ${index}`))
  const first = await value.prepare(context(messages))
  expect(first.current.map(message => message.id)).toEqual(['m120'])
  expect(first.option.options.readOnly).toBe(true)
  const rows = await first.memory.recall({ threadId: first.option.thread, perPage: false })
  expect(rows.messages).toHaveLength(120)
  expect(text(rows.messages)).toContain('使用 AgentBrowser')
  const repeat = await value.prepare(context(messages))
  expect((await repeat.memory.recall({ threadId: repeat.option.thread, perPage: false })).messages).toHaveLength(120)
  const other = await value.prepare(context([message('private', 1, 'bobo secret'), message('now', 2, 'hello')], 'bobo'))
  expect(text((await other.memory.recall({ threadId: other.option.thread, perPage: false })).messages)).not.toContain('AgentBrowser')
  expect((await value.view('ds')).documents).toHaveLength(1)
})

it('uses Mastra WM as the durable authority and fences old input after explicit editing and clearing', async () => {
  const { value, path } = await adapter(), messages = [message('old', 1, '曾选 MySQL'), message('current', 2, '现在选 PostgreSQL')]
  await value.prepare(context(messages))
  const document = (await value.view('ds')).documents[0]!
  await value.saveWorkingMemory('ds', document.resourceId, '数据库选 PostgreSQL', document.version)
  await expect(value.saveWorkingMemory('ds', document.resourceId, 'wrong', document.version)).rejects.toThrow('已变化')
  await value.close(); adapters.splice(adapters.indexOf(value), 1)
  const restarted = new EmployeeConversationMemory(path); adapters.push(restarted)
  expect((await restarted.view('ds')).documents[0]!.workingMemory).toBe('数据库选 PostgreSQL')
  const afterEdit = await restarted.prepare(context(messages))
  expect(text((await afterEdit.memory.recall({ threadId: afterEdit.option.thread, perPage: false })).messages)).not.toContain('MySQL')
  await restarted.clearEmployee('ds', [{ conversationId: 'room', sequence: 2 }])
  const afterForget = await restarted.prepare(context([...messages, message('new', 3, '新的任务')]))
  expect((await afterForget.memory.recall({ threadId: afterForget.option.thread, perPage: false })).messages).toHaveLength(0)
  expect((await restarted.view('ds')).documents[0]!.workingMemory).toBe('')
})

it('withdraws derived WM when an old source changes, without copying a second employee memory', async () => {
  const { value } = await adapter(), messages = [message('m1', 1, 'old secret'), message('m2', 2, 'current')]
  const ctx = context(messages), resourceId = memoryResourceId('ds')
  ctx.memorySources = async () => ({ resourceId, threads: [{ conversationId: 'room', title: 'Room', messages }], legacy: [{ id: 'legacy1', content: 'old secret' }] })
  await value.prepare(ctx)
  expect((await value.view('ds')).documents[0]!.workingMemory).toContain('old secret')
  ctx.memorySources = async () => ({ resourceId, threads: [{ conversationId: 'room', title: 'Room', messages: [messages[1]!] }], legacy: [] })
  const next = await value.prepare(ctx)
  expect((await value.view('ds')).documents[0]!.workingMemory).not.toContain('old secret')
  expect(text((await next.memory.recall({ threadId: next.option.thread, perPage: false })).messages)).not.toContain('old secret')
})

it('runs the installed OM observer on the selected API model, persists observations and accounts for every request', async () => {
  const { createServer } = await import('node:http')
  const requests: { model: string; messages: unknown[] }[] = [], embeddings: { model: string; input: string[] }[] = []
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    if (request.url?.endsWith('/embeddings')) {
      const input = JSON.parse(body) as { model: string; input: string[] }; embeddings.push(input)
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ object: 'list', model: input.model, data: input.input.map((_, index) => ({ object: 'embedding', index, embedding: [1, 0, 0] })), usage: { prompt_tokens: 3, total_tokens: 3 } })); return
    }
    requests.push(JSON.parse(body))
    const output = '<observations>\n<thread id="employee:ds:thread:room">\n- User selected PostgreSQL and rejected MySQL.\n<working-memory>\n## Database decision\nUse PostgreSQL.\n</working-memory>\n</thread>\n</observations>'
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [delta, finish_reason] of [[{ role: 'assistant', content: output }, null], [{}, 'stop']] as const) response.write(`data: ${JSON.stringify({ id: 'observer', object: 'chat.completion.chunk', model: 'test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ id: 'observer', object: 'chat.completion.chunk', model: 'test', choices: [], usage: { prompt_tokens: 7000, completion_tokens: 50, total_tokens: 7050 } })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { value } = await adapter()
    const messages = [...Array.from({ length: 45 }, (_, i) => message(`history-${i}`, i + 1, `Database decision ${i}: PostgreSQL, not MySQL. ` + 'authorized detail '.repeat(100))), message('now', 46, '数据库定哪种？')]
    const ctx = context(messages), calls: string[] = [], usage: string[] = []
    ctx.connection!.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    ctx.memorySources = async () => ({ resourceId: memoryResourceId('ds'), threads: [{ conversationId: 'room', title: 'Room', messages }], embedding: { connection: ctx.connection!, apiKey: '', modelId: 'embedding-fixture' } })
    ctx.onAdditionalModelCall = async () => { const id = `om-${calls.length + 1}`; calls.push(id); return id }
    ctx.onModelCallUsage = async id => { usage.push(id) }
    const prepared = await value.prepare(ctx)
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every(request => request.model === 'test')).toBe(true)
    expect(calls).toHaveLength(requests.length + embeddings.length)
    expect(usage).toEqual(calls)
    const documents = (await value.view('ds')).documents
    expect(documents[0]!.observations).toContain('PostgreSQL')
    expect(documents[0]!.workingMemory).toContain('PostgreSQL')
    expect((await prepared.memory.getContext({ threadId: prepared.option.thread, resourceId: prepared.option.resource })).hasObservations).toBe(true)
    expect(requests.every(request => !JSON.stringify(request.messages).includes('数据库定哪种'))).toBe(true)
    const recalled = await prepared.memory.searchMessages({ query: '数据库最终定了哪种？', resourceId: prepared.option.resource })
    expect(recalled.results.length).toBeGreaterThan(0)
    expect(embeddings.every(request => request.model === 'embedding-fixture')).toBe(true)
    expect(embeddings.at(-1)!.input.join(' ')).toContain('数据库最终定了哪种')
    expect(calls).toHaveLength(requests.length + embeddings.length)
    await value.clearEmployee('ds', [{ conversationId: 'room', sequence: 46 }])
    const empty = await prepared.memory.searchMessages({ query: '数据库最终定了哪种？', resourceId: prepared.option.resource })
    expect(empty.results).toHaveLength(0)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})


it('keeps forget fences when a conversation changes from an isolated scope to private employee scope', async () => {
  const { value } = await adapter()
  await value.clearEmployee('ds', [{ conversationId: 'room', sequence: 2 }])
  const messages = [message('u1', 1, 'FORGOTTEN_DATABASE'), message('u2', 2, 'OLD_ACK'), message('u3', 3, 'new question')]
  const ctx = context(messages)
  ctx.memorySources = async () => ({ resourceId: memoryResourceId('ds'), threads: [{ conversationId: 'room', title: 'Room', messages }] })
  const prepared = await value.prepare(ctx)
  expect(text((await prepared.memory.recall({ threadId: prepared.option.thread, perPage: false })).messages)).not.toContain('FORGOTTEN_DATABASE')
  expect(text((await prepared.memory.recall({ threadId: prepared.option.thread, perPage: false })).messages)).not.toContain('OLD_ACK')
})

it.each(['withdraw', 'cancel'] as const)('does not retain a late observation after %s', async action => {
  const { createServer } = await import('node:http')
  let release!: () => void, called!: () => void
  const received = new Promise<void>(resolve => { called = resolve })
  const responseReady = new Promise<void>(resolve => { release = resolve })
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the controlled request */ }
    called(); await responseReady
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ id: 'late', choices: [{ index: 0, delta: { content: '<observations><thread id="employee:ds:thread:room">LATE_WITHDRAWN_FACT</thread></observations>' }, finish_reason: null }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ id: 'late', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { value } = await adapter(1), controller = new AbortController()
    const ctx = context([message('old', 1, 'Withdraw this source'), message('now', 2, 'Continue')])
    ctx.signal = controller.signal
    ctx.connection!.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    ctx.onAdditionalModelCall = async () => 'om'
    const pending = value.prepare(ctx)
    const rejected = expect(pending).rejects.toThrow()
    await received
    if (action === 'withdraw') await value.forgetEmployee('ds')
    else controller.abort(new Error('Owner stopped'))
    release(); await rejected
    expect((await value.view('ds')).documents.every(document => !document.observations && !document.workingMemory)).toBe(true)
  } finally { release(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

it('does not promote old conversation-only history or clear an unrelated isolated scope', async () => {
  const { value } = await adapter()
  const messages = [message('private', 1, 'ROOM_ONLY_SECRET'), message('next', 2, 'Next request')]
  const ctx = context(messages)
  await value.prepare(ctx)
  const isolated = (await value.view('ds')).documents[0]!
  await value.saveWorkingMemory('ds', isolated.resourceId, 'ROOM_ONLY_WM', isolated.version)
  const other = context([message('o1', 1, 'Other room', 'other'), message('o2', 2, 'Other request', 'other')]); other.conversation = { ...other.conversation, id: 'other' }
  await value.prepare(other)
  const otherDocument = (await value.view('ds')).documents.find(document => document.conversationIds.includes('other'))!
  await value.saveWorkingMemory('ds', otherDocument.resourceId, 'OTHER_ROOM_WM', otherDocument.version)
  await value.forgetConversation('room')
  expect((await value.view('ds')).documents.find(document => document.conversationIds.includes('other'))!.workingMemory).toBe('OTHER_ROOM_WM')
  ctx.memorySources = async () => ({ resourceId: memoryResourceId('ds'), threads: [{ conversationId: 'room', title: 'Room', messages }] })
  const prepared = await value.prepare(ctx)
  expect(JSON.stringify(await prepared.memory.getContext({ threadId: prepared.option.thread, resourceId: prepared.option.resource }))).not.toContain('ROOM_ONLY_SECRET')
})

it('deletes only the removed employee official history, observations and settings views', async () => {
  const { value } = await adapter()
  await value.prepare(context([message('one', 1, 'Employee secret'), message('two', 2, 'Next')]))
  await value.prepare(context([message('three', 1, 'Bobo data'), message('four', 2, 'Next')], 'bobo'))
  await value.deleteEmployee('ds')
  expect((await value.view('ds')).documents).toHaveLength(0)
  expect((await value.view('bobo')).documents).toHaveLength(1)
})

it('fixes the legacy migration set instead of continuously importing new derived notes', async () => {
  const { value } = await adapter(), messages = [message('old', 1, 'Original message'), message('now', 2, 'Next')]
  const ctx = context(messages), legacy = [{ id: 'old-note', content: 'Original authorized note' }]
  ctx.memorySources = async () => ({ resourceId: memoryResourceId('ds'), threads: [{ conversationId: 'room', title: 'Room', messages }], legacy })
  await value.prepare(ctx)
  legacy.push({ id: 'later-diary', content: 'NEW_DERIVED_DIARY' })
  const next = await value.prepare(ctx)
  expect((await value.view('ds')).documents[0]!.workingMemory).not.toContain('NEW_DERIVED_DIARY')
  expect(JSON.stringify(await next.memory.getContext({ threadId: next.option.thread, resourceId: next.option.resource }))).not.toContain('NEW_DERIVED_DIARY')
})

it.each([401, 503])('preserves official retry classification and redacts credentials for HTTP %s', async status => {
  const { createServer } = await import('node:http')
  const key = 'synthetic-om-secret'
  let requests = 0, reserved = 0
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* controlled request */ }
    requests++
    if (requests === 1) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: `Provider rejected ${key}` } })); return }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ id: 'retry', choices: [{ index: 0, delta: { content: '<observations>\n<thread id="employee:ds:thread:room">\n- Official retry succeeded.\n</thread>\n</observations>' }, finish_reason: null }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ id: 'retry', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const { value } = await adapter(1), ctx = context([message('old', 1, 'Retained source'), message('now', 2, 'Current request')])
    ctx.apiKey = key; ctx.connection!.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    ctx.onAdditionalModelCall = async () => `attempt-${++reserved}`
    if (status === 401) {
      const failure = await value.prepare(ctx).catch(error => error as Error)
      expect(failure).toBeInstanceOf(Error)
      expect(String(failure)).not.toContain(key)
      expect(requests).toBe(1)
    } else { await value.prepare(ctx); expect(requests).toBe(2) }
    expect(reserved).toBe(requests)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
