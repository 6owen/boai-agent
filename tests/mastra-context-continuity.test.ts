/*
 * [OUTPUT]: DeepSeek自动档内部摘要关闭思考，受控长度耗尽不提交或重试；显式档位保持。
 * [OUTPUT]: 2026-10-27 本轮相关回归合同/源码更新；执行状态另行记录，不以源码存在判通过。
 * [INPUT]: Actual installed Mastra SDK, local streaming HTTP provider, real ProductStore and host-like authorization ports.
 * [OUTPUT]: Public checkpoint/rotation, final-prompt tool compaction, original budgets, Memory pruning, review regressions for provenance, legacy clipping and readonly-step recovery.
 * [POS]: Controlled SDK integration; no external model, GUI or semantic-quality certification.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import type { AutomationDefinition, AutomationOccurrence, Connection, Conversation, ConversationDetail, ConversationMaterial, DigitalAgent, MemoryView, Message, Snapshot } from '../packages/shared/src/domain'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ContextRepository, type ContextPort } from '../packages/runtime/src/modules/contexts/context-repository'
import { RunModelUsage } from '../packages/runtime/src/modules/profile/run-model-usage'
import { summarizeContext, snapshotProviderPrompt } from '../packages/runtime/src/adapters/mastra/context-maintenance'
import { progressBoundary } from '../packages/runtime/src/adapters/mastra/progress-review'
import { ProgressMonitor, ProgressStalledError } from '../packages/runtime/src/modules/contexts/progress-monitor'

interface Body { messages: { role: string; content: unknown }[]; tools?: unknown[] }
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function send(response: ServerResponse, value: string | { tool: string; args: unknown }, index: number, usage = true) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const frame = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `call-${index}`, object: 'chat.completion.chunk', created: 1700000000, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  frame({ role: 'assistant' })
  if (typeof value === 'string') { frame({ content: value }); frame({}, 'stop') }
  else { frame({ tool_calls: [{ index: 0, id: `tool-${index}`, type: 'function', function: { name: value.tool, arguments: JSON.stringify(value.args) } }] }); frame({}, 'tool_calls') }
  if (usage) response.write(`data: ${JSON.stringify({ id: `call-${index}`, object: 'chat.completion.chunk', created: 1700000000, model: 'fixture', choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
async function endpoint(handler: (body: Body, response: ServerResponse, index: number) => void) {
  const requests: Body[] = []
  const server = createServer(async (request, response) => {
    let text = ''; for await (const part of request) text += part
    const body = JSON.parse(text) as Body; requests.push(body); handler(body, response, requests.length - 1)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return { requests, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` }
}
const isSummary = (body: Body) => body.messages.some(message => message.role === 'system' && JSON.stringify(message.content).includes('Distill the supplied historical data'))
const textOf = (body: Body) => JSON.stringify(body.messages)
const message = (sequence: number, content = `Message ${sequence} ` + 'history '.repeat(30)): Message => ({ id: `m-${sequence}`, conversationId: 'dm', sequence, content, senderId: 'owner', senderName: 'Owner', senderType: 'user', status: 'completed', createdAt: '2026-10-24T00:00:00.000Z' })
it('freezes provider media bytes while retaining native URL image values', () => {
  const bytes = new Uint8Array([1, 2, 3]), url = new URL('https://example.test/image.png')
  const copy = snapshotProviderPrompt([{ role: 'user', content: [{ type: 'file', data: bytes, mediaType: 'image/png' }, { type: 'file', data: url, mediaType: 'image/png' }] }])
  bytes[0] = 9; url.pathname = '/changed'
  expect(copy[0]).toMatchObject({ role: 'user', content: [{ data: new Uint8Array([1, 2, 3]) }, { data: new URL('https://example.test/image.png') }] })
})
async function fixture(url: string, initial: Message[], core = false) {
  const root = await mkdtemp(join(tmpdir(), 'boai-context-sdk-')), store = new ProductStore(join(root, 'db.sqlite'))
  await store.init(); cleanup.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  const repository = new ContextRepository(store), owner = { agentId: core ? 'bobo' : 'employee', conversationId: 'dm', scopeVersion: 'fixed-scope' }
  let messages = initial; await store.write(messages.map(value => ({ collection: 'messages', id: value.id, value })))
  const controller = new AbortController(), deltas: string[] = [], started: string[] = [], settled: string[] = [], supplements: string[] = []
  let reserved = 0
  const usage = new RunModelUsage(async () => {})
  const port: ContextPort = {
    read: () => repository.read(owner, messages),
    begin: (view, action) => repository.begin(owner, ctx.runId, view, action),
    commit: (op, summary, refs, metrics) => { controller.signal.throwIfAborted(); return repository.commit(op, summary, refs, messages, metrics) },
    fail: (op, reason) => repository.fail(op, reason),
    recordStep: (summary, tools, metrics) => repository.recordStep(owner, ctx.runId, summary, tools, messages, metrics),
    history: async () => messages.slice(0, 2),
  }
  const ctx: EngineContext = {
    agent: { id: owner.agentId, ...(core ? { systemRole: 'core' } as const : {}), name: 'Alice', role: 'Researcher', instructions: 'Help accurately.', color: '#000000', connectionId: 'connection', modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 } satisfies DigitalAgent,
    connection: { id: 'connection', name: 'Fixture', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture', hasApiKey: true }, apiKey: 'fixture-secret',
    conversation: { id: 'dm', title: 'Alice', kind: 'direct', ...(core ? { purpose: 'core' } as const : {}), agentIds: [owner.agentId], mode: 'mention', sharedKnowledgeIds: [], workspacePath: root, createdAt: '', updatedAt: '' },
    messages: messages.slice(-20), triggerMessageId: messages.at(-1)!.id, resources: [], runId: 'run-1', signal: controller.signal, responseKind: 'chat', continuity: port,
    onAdditionalModelCall: async () => `extra-${++reserved}`, onModelCallStarted: async id => { started.push(id) }, onModelCallUsage: async id => { settled.push(id) }, onSupplementalUsage: async (id, value) => { supplements.push(id); await usage.supplement(id, value) }, onUsage: value => usage.main(value),
    onDelta: async text => { deltas.push(text) }, onTool: async () => {}, approveCommand: async () => false,
  }
  return { ctx, port, repository, store, controller, deltas, started, settled, supplements, root, append: async (next: Message[]) => { messages.push(...next); await store.write(next.map(value => ({ collection: 'messages', id: value.id, value }))); ctx.messages = messages.slice(-20); ctx.triggerMessageId = messages.at(-1)!.id; ctx.runId += '-next' } }
}
it('summarizes history outside the old 100-message window and uses three durable generations in the same visible chat', async () => {
  const model = await endpoint((body, response, index) => send(response, isSummary(body) ? 'The early exact budget is 617 yuan [m-1]. Preserve the latest correction and unfinished work.' : 'Final result.', index))
  const messages = Array.from({ length: 81 }, (_, index) => message(index + 1)); messages[0] = message(1, 'The exact budget is 617 yuan.')
  const f = await fixture(model.url, messages), engine = new MastraEngine()
  for (let round = 0; round < 3; round++) {
    if (round) await f.append(Array.from({ length: 75 }, (_, index) => message(82 + (round - 1) * 75 + index)))
    await engine.run(f.ctx)
  }
  expect(f.deltas).toEqual(['Final result.', 'Final result.', 'Final result.'])
  const main = model.requests.filter(body => !isSummary(body))
  expect(main).toHaveLength(3)
  expect(model.requests.filter(isSummary).some(body => textOf(body).includes('The exact budget is 617 yuan.'))).toBe(true)
  for (const body of main) expect(textOf(body)).toContain('617 yuan')
  expect(model.requests.filter(isSummary).every(body => !body.tools?.length)).toBe(true)
  expect(f.supplements.length).toBeGreaterThanOrEqual(3)
  expect(f.supplements.every(id => f.started.includes(id) && f.settled.includes(id))).toBe(true)
  const state = await f.port.read()
  expect(state.stream.revision).toBe(3)
  expect(await f.store.load('contextSessions')).toHaveLength(3)
  expect(await f.store.load<Message>('messages')).toHaveLength(231)
  expect(f.ctx.conversation.id).toBe('dm')
})
it('compacts completed tool steps at the actual provider boundary without executing a tool twice', async () => {
  let calls = 0
  const model = await endpoint((body, response, index) => {
    if (isSummary(body)) return send(response, 'Completed tool result [tool receipt]; next step remains pending. Never repeat it.', index)
    if (calls++ < 4) return send(response, { tool: 'read_context_history', args: { limit: 1 } }, index)
    send(response, 'Finished after the four actual reads.', index)
  })
  const f = await fixture(model.url, [message(1, 'Read the existing historical results, then answer.')])
  let reads = 0
  f.port.history = async () => { reads++; return [message(1, 'a factual old result '.repeat(1800))] }
  await new MastraEngine().run(f.ctx)
  expect(reads).toBe(4)
  expect(f.deltas).toEqual(['Finished after the four actual reads.'])
  expect(model.requests.some(isSummary)).toBe(true)
  expect(model.requests.filter(isSummary).some(body => textOf(body).includes('tool-0') && textOf(body).includes('a factual old result'))).toBe(true)
  const main = model.requests.filter(body => !isSummary(body))
  expect(main).toHaveLength(5)
  expect(main.some(body => textOf(body).includes('Completed tool result'))).toBe(true)
  expect(f.started.length).toBe(f.settled.length)
  expect((await f.store.load<{ tools: { toolCallId: string }[] }>('contextStepCheckpoints'))[0]!.tools.length).toBeGreaterThan(0)
})
it('cancellation during summary never changes the active pointer or calls the primary model', async () => {
  let cancel = () => {}
  const model = await endpoint((body, response, index) => { expect(isSummary(body)).toBe(true); cancel(); send(response, 'Late summary', index) })
  const f = await fixture(model.url, Array.from({ length: 81 }, (_, index) => message(index + 1)))
  cancel = () => f.controller.abort(new Error('Owner stopped'))
  const before = await f.port.read()
  await expect(new MastraEngine().run(f.ctx)).rejects.toThrow()
  const streams = await f.store.load<{ revision: number; activeSessionId: string }>('contextStreams')
  expect(streams[0]).toMatchObject({ revision: 0, activeSessionId: before.stream.activeSessionId })
  expect(await f.store.load('contextCheckpoints')).toHaveLength(0)
  expect(model.requests).toHaveLength(1)
})
it('rejects required input over a known window without discarding the original request', async () => {
  const model = await endpoint((_body, response, index) => send(response, 'Must not be requested', index))
  const f = await fixture(model.url, [message(1, 'required text '.repeat(800))])
  f.ctx.modelCatalog = { source: 'service-declared', fetchedAt: '', models: [{ id: 'fixture', contextWindow: 4000 }] }
  await expect(new MastraEngine().run(f.ctx)).rejects.toThrow('容量')
  expect(model.requests).toHaveLength(0)
  expect((await f.store.load<Message>('messages'))[0]?.content).toBe(f.ctx.messages[0]!.content)
})
it('does not reload checkpoint-covered history through Bobo Mastra Memory', async () => {
  const marker = 'EARLY_RAW_HISTORY_ONLY_9971'
  const model = await endpoint((body, response, index) => send(response, isSummary(body) ? 'The earlier approved budget is 617 yuan [m-1].' : 'Memory and handoff checked.', index))
  const messages = Array.from({ length: 81 }, (_, index) => message(index + 1)); messages[0] = message(1, marker)
  const f = await fixture(model.url, messages, true)
  await new MastraEngine({ memoryPath: join(f.root, 'bobo.sqlite') }).run(f.ctx)
  const main = model.requests.find(body => !isSummary(body))!
  expect(textOf(main)).toContain('617 yuan')
  expect(textOf(main)).not.toContain(marker)
  expect(textOf(main)).toContain('Message 80')
  expect(f.deltas).toEqual(['Memory and handoff checked.'])
})
it('keeps the pointer unchanged on an unfinished summary stream and does not retry the request', async () => {
  const model = await endpoint((_body, response) => { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.end('data: [DONE]\n\n') })
  const f = await fixture(model.url, Array.from({ length: 81 }, (_, index) => message(index + 1)))
  await expect(new MastraEngine().run(f.ctx)).rejects.toThrow()
  expect(model.requests).toHaveLength(1)
  expect(await f.store.load('contextCheckpoints')).toHaveLength(0)
  expect((await f.store.load<{ revision: number }>('contextStreams'))[0]?.revision).toBe(0)
})
it('connects the actual host authorization port for private, group and Bobo execution with their existing bootstrap', async () => {
  const model = await endpoint((body, response, index) => {
    if (textOf(body).includes('AUTOMATION_CONTEXT_CHECK') && JSON.stringify(body.tools).includes('report_work') && !body.messages.some(message => message.role === 'tool')) return send(response, { tool: 'report_work', args: { disposition: 'delivered', summary: 'Host context checked.', evidence: [{ kind: 'answer', reference: 'Host context checked.' }] } }, index)
    send(response, 'Host context checked.', index)
  })
  const root = await mkdtemp(join(tmpdir(), 'boai-context-host-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const sdk = new MastraEngine({ memoryPath: join(root, 'bobo.sqlite') }), contexts: EngineContext[] = []
  const engine: AgentEngine = { test: async () => 'ok', decide: async context => ({ action: context.messages.some(message => message.turnId === context.turnId && message.senderId === context.agent.id) ? 'pass' : 'reply', responseKind: context.messages.find(message => message.id === context.triggerMessageId)?.origin ? 'task' : 'chat', ...(context.messages.find(message => message.id === context.triggerMessageId)?.origin ? { work: { key: 'auto-context', scope: 'Check context once', deliverable: 'Host context checked.' } } : {}), observedThroughSequence: context.participation!.observedThroughSequence }), run: async context => { expect(context.continuity).toBeDefined(); contexts.push(context); await sdk.run(context) } }
  const service = new AppService({ dataPath: root, engine, secrets: { get: async () => 'fixture', set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init(); cleanup.push(() => service.close())
  const connection = await service.handle('saveConnection', { name: 'Fixture', provider: 'openai-compatible', baseUrl: model.url, defaultModel: 'fixture' }) as Connection
  for (const agent of (await service.handle('snapshot', undefined) as Snapshot).agents) {
    const { workspaceRef: _w, configVersion: _v, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture' })
  }
  for (const kind of ['direct', 'group', 'core'] as const) {
    const before = contexts.length
    const conversation = kind === 'core'
      ? await service.handle('startCoreConversation', { content: '你好，简短回复。', requestId: `core-${Date.now()}` }) as Conversation
      : await service.handle('createConversation', { kind, title: kind, agentIds: kind === 'group' ? ['researcher', 'writer'] : ['researcher'] }) as Conversation
    if (kind !== 'core') await service.handle('sendMessage', { conversationId: conversation.id, content: '你好，简短回复。', requestId: `send-${kind}`, mentionIds: kind === 'group' ? ['researcher'] : [] })
    let last: unknown
    await expect.poll(async () => {
      const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
      last = { kind, contexts: contexts.length, before, runs: detail.runs.map(run => ({ status: run.status, phase: run.phase, error: run.error })), messages: detail.messages.map(message => ({ status: message.status, content: message.content.slice(0, 200) })) }
      return contexts.length > before && detail.runs.some(run => run.status === 'completed') && detail.messages.some(message => message.senderType === 'agent' && message.content === 'Host context checked.')
    }, { timeout: 10000 }).toBe(true).catch(error => { throw new Error(JSON.stringify(last), { cause: error }) })
  }
  expect(new Set(contexts.map(context => context.conversation.id)).size).toBe(3)
  const plan = await service.handle('saveAutomation', { owner: { kind: 'employee', employeeId: 'researcher' }, name: 'Context check', prompt: 'AUTOMATION_CONTEXT_CHECK', frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  const occurrence = await service.handle('runAutomation', { id: plan.id, requestId: 'auto-context-once' }) as AutomationOccurrence
  await expect.poll(async () => (await service.handle('getAutomationOccurrence', { id: occurrence.id }) as AutomationOccurrence).status, { timeout: 10000 }).toBe('completed').catch(async error => {
    const current = await service.handle('getAutomationOccurrence', { id: occurrence.id }) as AutomationOccurrence
    const detail = await service.handle('getConversation', { id: current.conversationId! }) as ConversationDetail
    throw new Error(JSON.stringify({ current, runs: detail.runs.map(run => ({ phase: run.phase, status: run.status, error: run.error })) }), { cause: error })
  })
  expect((await service.handle('runAutomation', { id: plan.id, requestId: 'auto-context-once' }) as AutomationOccurrence).id).toBe(occurrence.id)
  expect(contexts.some(context => context.work?.origin?.occurrenceId === occurrence.id && !!context.continuity)).toBe(true)

  expect(model.requests.length).toBeGreaterThanOrEqual(3)
  await expect(contexts[0]!.continuity!.read()).rejects.toThrow('访问权限')
  const direct = contexts[0]!.conversation.id
  await service.handle('clearConversationHistory', { id: direct, hide: false })
  const reader = await ProductStore.openReadOnly(join(root, 'boai.sqlite'))
  try { expect((await reader.load<{ conversationId: string }>('contextStreams')).some(row => row.conversationId === direct)).toBe(false) }
  finally { await reader.close() }
})

async function hostFixture(engine: AgentEngine, url = 'http://127.0.0.1:9/v1') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-context-regression-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const service = new AppService({ dataPath: root, engine, secrets: { get: async () => 'fixture', set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init(); cleanup.push(() => service.close())
  const connection = await service.handle('saveConnection', { name: 'Fixture', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' }) as Connection
  const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { workspaceRef: _w, configVersion: _v, memoryNamespace: _m, policyVersion: _p, ...input } = agent
  await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture' })
  const conversation = await service.handle('createConversation', { kind: 'direct', title: 'Context regression', agentIds: ['researcher'] }) as Conversation
  return { root, service, conversation }
}
async function seedOldHistory(service: AppService, conversation: Conversation) {
  const messages = Array.from({ length: 110 }, (_, index) => ({ ...message(index + 1, index === 0 ? 'PROVENANCE_617 early fact' : 'filler '.repeat(30)), id: `old-${index + 1}`, conversationId: conversation.id, createdAt: new Date().toISOString() }))
  await service['store'].write(messages.map(value => ({ collection: 'messages', id: value.id, value })))
  for (const message of messages) service['messages'].set(message.id, message)
  return messages
}
it.each([35000, 29000])('preserves a single historical message before the old projector (%s characters)', async characters => {
  const model = await endpoint((body, response, index) => send(response, isSummary(body) ? 'EARLY_FACT_617 [m-1]' : 'Reply', index))
  const f = await fixture(model.url, [message(1, 'EARLY_FACT_617 ' + 'a'.repeat(characters)), message(2, 'b'.repeat(20000))])
  await new MastraEngine().run(f.ctx)
  expect({ summaries: model.requests.filter(isSummary).length, finalIncludesEarly: textOf(model.requests.filter(body => !isSummary(body)).at(-1)!).includes('EARLY_FACT_617') }).toEqual({ summaries: 1, finalIncludesEarly: true })
})
it.each(['summary', 'history'])('registers expanded %s inputs and propagates actual user forgetting', async mode => {
  const model = await endpoint((body, response, index) => send(response, isSummary(body) ? 'The protected early fact is PROVENANCE_617 [old-1].' : 'PROVENANCE_617 is remembered.', index))
  const sdk = new MastraEngine(), contexts: EngineContext[] = []
  const engine: AgentEngine = { test: async () => 'ok', decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }), run: async context => { contexts.push(context); if (mode === 'summary') await sdk.run(context); else { const rows = await context.continuity!.history({ messageId: 'old-1' }); expect(rows[0]?.content).toContain('PROVENANCE_617'); await context.onDelta('PROVENANCE_617 is remembered.') } } }
  const { service, conversation } = await hostFixture(engine, model.url)
  await seedOldHistory(service, conversation)
  await service.handle('sendMessage', { conversationId: conversation.id, content: 'Please continue.', requestId: 'review-provenance', mentionIds: [] })
  await expect.poll(async () => {
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    return detail.runs.some(run => run.phase === 'execution' && run.status === 'completed')
  }, { timeout: 15000 }).toBe(true)
  if (mode === 'summary') expect(model.requests.filter(isSummary).some(body => textOf(body).includes('PROVENANCE_617'))).toBe(true)
  const ctx = contexts[0]!
  const snapshot = service['snapshots'].get(ctx.runId)!
  const observation = (await service['store'].load<{ id: string; sourceMessageIds: string[] }>('memoryObservations')).find(row => row.id === ctx.runId)!
  if (mode === 'history') expect(snapshot.memoryRecall?.recall?.inputMessageIds).not.toContain('old-2')
  const query = { agentId: 'researcher', scope: 'employee' as const }
  const before = await service.handle('getMemory', query) as MemoryView
  const saved = await service.handle('saveMemory', { ...query, content: 'PROVENANCE_617 early fact', sourceMessageIds: ['old-1'], expectedEpoch: before.epoch }) as MemoryView
  const entry = saved.entries.find(entry => entry.content === 'PROVENANCE_617 early fact')!
  await service.handle('deleteMemory', { ...query, id: entry.id, expectedEpoch: saved.epoch, requestId: 'actual-forget' })
  expect(service['snapshots'].get(ctx.runId)?.invalidated).toBe(true)
  const originalRecall = await service['memory'].recallValid(ctx.memory!)
  expect({ inputTracked: snapshot.memoryRecall?.recall?.inputMessageIds?.includes('old-1'), observationTracked: observation.sourceMessageIds.includes('old-1'), acceptsForgottenInput: originalRecall }).toEqual({ inputTracked: true, observationTracked: true, acceptsForgottenInput: false })
})

it('restores completed readonly steps on explicit host continuation', async () => {
  const contexts: EngineContext[] = [], resumed: unknown[] = []
  const engine: AgentEngine = {
    test: async () => 'ok',
    decide: async context => ({ action: 'reply', responseKind: 'task', work: { key: 'read-analysis', scope: 'Read and summarize existing history', deliverable: 'Report' }, observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      contexts.push(context)
      const view = await context.continuity!.read()
      if (contexts.length === 1) {
        await context.onTool({ id: 'already-read-1', name: 'read_context_history', status: 'completed', detail: 'Read original source', createdAt: new Date().toISOString() })
        await context.continuity!.recordStep!('Read original fact RESUME_617; pending: write the report.', [{ toolCallId: 'already-read-1', hash: 'source-unit-hash' }], { basis: 'provider-prompt', estimatedInputTokens: 50000, estimatedRemainingTokens: 1000, windowSource: 'unknown-policy', modelId: 'fixture', inputLimit: 48000 })
        throw new Error('Review: model connection interrupted after successful read')
      }
      resumed.push(...(view.resumedSteps ?? []))
      await context.onDelta('Continued report')
    }
  }
  const { service, conversation } = await hostFixture(engine)
  await service.handle('sendMessage', { conversationId: conversation.id, content: 'Read and summarize previous records.', requestId: 'review-original', mentionIds: [] })
  await expect.poll(async () => {
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    return detail.runs.some(run => run.phase === 'execution' && run.status === 'failed') && detail.turns?.every(turn => !['running','queued'].includes(turn.status))
  }, { timeout: 10000 }).toBe(true)
  const original = (await service.handle('getConversation', { id: conversation.id }) as ConversationDetail).runs.find(run => run.phase === 'execution')!
  expect(original.toolEvents).toContainEqual(expect.objectContaining({ id: 'already-read-1', status: 'completed' }))
  expect(await service['store'].load('contextStepCheckpoints')).toHaveLength(1)
  await service.handle('retryRun', { id: original.id, requestId: 'review-retry', continuation: true })
  await expect.poll(() => contexts.length, { timeout: 10000 }).toBe(2)
  await expect.poll(async () => (await service.handle('getConversation', { id: conversation.id }) as ConversationDetail).runs.some(run => run.phase === 'execution' && run.id !== original.id && run.status === 'completed'), { timeout: 10000 }).toBe(true)
  expect(contexts[1]!.continuation!.resumesRunIds).toContain(original.id)
  expect(contexts[1]!.completedWorkTools?.flatMap(row => row.tools)).toEqual([])
  expect(resumed).toEqual([expect.objectContaining({ runId: original.id, summary: expect.stringContaining('RESUME_617') })])
})

it.each([false, true])('does not discard an unsummarized large recent tail (Bobo=%s)', async core => {
  const model = await endpoint((body, response, index) => send(response, isSummary(body) ? 'Summary of old prefix.' : 'Reply', index))
  const history = Array.from({ length: 32 }, (_, index) => message(index + 1, (index === 24 ? 'TAIL_FACT_617 ' : '') + 'a'.repeat(5500)))
  const f = await fixture(model.url, [...history, message(33, 'b'.repeat(20000))], core)
  await new MastraEngine(core ? { memoryPath: join(f.root, 'bobo.sqlite') } : {}).run(f.ctx)
  const summaries = model.requests.filter(isSummary)
  expect(summaries.length).toBeGreaterThan(0)
  const main = model.requests.filter(body => !isSummary(body)).at(-1)!
  expect({ summarizedTailFact: summaries.some(body => textOf(body).includes('TAIL_FACT_617')), rawTailFact: textOf(main).includes('TAIL_FACT_617') }).not.toEqual({ summarizedTailFact: false, rawTailFact: false })
})

it('rejects a current turn that cannot fit intact before summaries or primary requests', async () => {
  const model = await endpoint((_body, response, index) => send(response, 'Must not be requested', index))
  const messages = [1, 2, 3].map(sequence => ({ ...message(sequence, 'x'.repeat(20000)), turnId: 'current-turn' }))
  const f = await fixture(model.url, messages)
  f.ctx.triggerMessageId = messages[0]!.id; f.ctx.turnId = 'current-turn'
  await expect(new MastraEngine().run(f.ctx)).rejects.toThrow('当前必要输入超过上下文容量')
  expect(model.requests).toHaveLength(0)
  expect(await f.store.load('contextCheckpoints')).toHaveLength(0)
  expect(await f.store.load('messages')).toEqual(messages)
})
it('inherits old material sources into snapshot, reply and Work before data use, and fences revocation', async () => {
  const contexts: EngineContext[] = []
  const engine: AgentEngine = {
    test: async () => 'ok',
    decide: async context => ({ action: 'reply', responseKind: 'task', work: { key: 'material-context', scope: 'Continue material analysis', deliverable: 'Result' }, observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      contexts.push(context)
      expect(context.materialRefs).toHaveLength(0)
      const view = await context.continuity!.read()
      expect(view.messages.some(message => message.id === 'old-1')).toBe(true)
      expect(context.materialRefs).toHaveLength(1)
      await context.onDelta('Material result')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: 'Material result', evidence: [{ kind: 'answer', reference: 'Material result' }] })
    },
  }
  const { root, service, conversation } = await hostFixture(engine)
  const messages = await seedOldHistory(service, conversation), path = join(root, 'source.md')
  await writeFile(path, 'MATERIAL_617')
  const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path, requestId: 'context-material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
  const source = { ...messages[0]!, materialIds: [material.id] }
  await service['store'].transaction(async tx => {
    await service['materials'].attach(tx, conversation.id, source.id, [{ id: material.id, revision: material.revision }])
    await tx.put({ collection: 'messages', id: source.id, value: source })
  })
  service['messages'].set(source.id, source)
  await service.handle('sendMessage', { conversationId: conversation.id, content: 'Continue.', requestId: 'material-context-run', mentionIds: [] })
  await expect.poll(async () => (await service.handle('getConversation', { id: conversation.id }) as ConversationDetail).runs.some(run => run.phase === 'execution' && run.status === 'completed'), { timeout: 10000 }).toBe(true)
  const context = contexts[0]!, detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
  const expected = [expect.objectContaining({ id: material.id, contentHash: material.contentHash })]
  expect(service['snapshots'].get(context.runId)?.materialRefs).toEqual(expected)
  expect(detail.messages.find(message => message.runId === context.runId)?.materialSources).toEqual(expected)
  expect(detail.workItems?.find(work => work.id === context.work?.id)?.materialSources).toEqual(expected)
  await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: [] })
  expect(service['snapshots'].get(context.runId)?.invalidated).toBe(true)
})

for (const state of ['stuck', 'unknown', 'bad-citations', 'changed-source'] as const) it(`reviews repeated evidence through the actual SDK: ${state}`, async () => {
  let current = true
  const model = await endpoint((_body, response, index) => { if (state === 'changed-source') current = false; send(response, JSON.stringify({ state: state === 'bad-citations' || state === 'changed-source' ? 'stuck' : state, sourceIds: state === 'bad-citations' ? ['invented'] : ['tool-1', 'tool-3'], reason: 'Controlled evidence review' }), index) })
  const f = await fixture(model.url, [message(1, 'Read the report and find a new fact.')]), monitor = new ProgressMonitor()
  f.ctx.progressCurrent = async () => current
  const observe = (id: number) => { monitor.start(`tool-${id}`, 'read_file', { path: 'report.txt' }); monitor.finish(`tool-${id}`, 'read_file', { text: 'same fact' }); monitor.endStep() }
  for (let i = 0; i < 3; i++) observe(i)
  expect(await progressBoundary(f.ctx, monitor)).toContain('tool-0')
  expect(model.requests).toHaveLength(0)
  observe(3)
  if (state === 'stuck') await expect(progressBoundary(f.ctx, monitor)).rejects.toBeInstanceOf(ProgressStalledError)
  else { await progressBoundary(f.ctx, monitor); expect(monitor.pauseRequested).toBe(false); observe(4); await progressBoundary(f.ctx, monitor) }
  expect(model.requests).toHaveLength(1)
  expect(model.requests[0]!.tools?.length ?? 0).toBe(0)
  expect(f.started).toEqual(['extra-1']); expect(f.settled).toContain('extra-1'); expect(f.supplements).toContain('extra-1')
})

it.each([undefined, 'auto', 'off', 'high'])('completes bounded DeepSeek maintenance instead of exhausting its budget on default reasoning (%s)', async thinkingLevel => {
 const model=await endpoint((body,response,index)=>{
  const request=body as Body & {thinking?:{type:string}}
  if(request.thinking?.type==='disabled') return send(response,'保留南京天气来源与未完成查询 [weather-source]',index)
  response.writeHead(200,{'Content-Type':'text/event-stream'})
  response.write(`data: ${JSON.stringify({id:'summary-length',choices:[{index:0,delta:{reasoning_content:'Provider reasoning filled the bounded output'},finish_reason:null}]})}\n\n`)
  response.write(`data: ${JSON.stringify({id:'summary-length',choices:[{index:0,delta:{},finish_reason:'length'}],usage:{prompt_tokens:31269,completion_tokens:2000,total_tokens:33269}})}\n\n`)
  response.end('data: [DONE]\n\n')
 })
 const f=await fixture(model.url,[message(1,'查询南京天气')])
 f.ctx.connection={...f.ctx.connection!,baseUrl:'https://api.deepseek.com',defaultModel:'deepseek-flash'}
 f.ctx.agent={...f.ctx.agent,modelId:'',thinkingLevel}
 const nativeFetch=globalThis.fetch
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation((input,init)=>{
  const target=new URL(input instanceof Request?input.url:input.toString())
  if(target.hostname!=='api.deepseek.com') throw new Error('Unexpected external request')
  return nativeFetch(new URL(target.pathname,model.url),init)
 })
 try {
  const request=summarizeContext(f.ctx,{id:'weather-source',result:'南京今日多云，待核对气温'})
  if(thinkingLevel==='high') {
   await expect(request).rejects.toThrow('工作上下文摘要达到输出上限')
   expect(model.requests[0]).toMatchObject({thinking:{type:'enabled'},reasoning_effort:'high'})
  } else await expect(request).resolves.toContain('[weather-source]')
  expect(model.requests).toHaveLength(1)
  expect(f.started).toEqual(['extra-1']);expect(f.settled).toEqual(['extra-1']);expect(f.supplements).toEqual(['extra-1'])
  expect(f.ctx.agent.thinkingLevel).toBe(thinkingLevel)
 } finally {spy.mockRestore()}
})
