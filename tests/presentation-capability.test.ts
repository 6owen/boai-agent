/*
 * [OUTPUT]: Actual employee Run verifies dedicated-source receipts, cumulative usage, cancellation and expired leases.
 * [INPUT]: Actual SQLite/application settings, Mastra SDK and local three-protocol provider fixtures.
 * [OUTPUT]: Explicit source/renderer selection, native PNG transport, receipts, revocation and no replay on restart/failure.
 * [POS]: Controlled capability integration; no remote model or real slide-quality certification.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chmod, mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { Connection, ModelUsage, Conversation, ConversationDetail, DigitalAgent } from '../packages/shared/src/domain'
import type { ProfileModelCall } from '../packages/runtime/src/modules/profile/profile-activity'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { GatewayRouteEvidence, ModelProtocol } from '../packages/shared/src/domain/model-gateway'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { PresentationService, type PresentationReviewObserver, type PresentationReviewSource } from '../packages/runtime/src/modules/presentations/presentation-service'
import { generatePresentationReview } from '../packages/runtime/src/adapters/mastra/presentation-review-model'
import { streamText } from './fixtures/gateway-stream'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import { mastraCliTools } from '../packages/runtime/src/adapters/mastra/cli-tools'
import { nativeFixture } from './fixtures/native-product'
import { RunModelUsage } from '../packages/runtime/src/modules/profile/run-model-usage'

const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
async function directory() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-presentation-capability-'))); clean.push(() => rm(root, { recursive: true, force: true })); return root }
const png = gatewayVisionImage(), images = [{ slideId: 's1', bytes: png, sha256: createHash('sha256').update(png).digest('hex') }]
const answer = JSON.stringify({ slides: [{ slideId: 's1', score: 90, issues: [] }], deckIssues: [] })

test('serializes late main totals and supplemental receipts without duplicate tokens or invented unknown values', async () => {
  const writes: ModelUsage[] = []; let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const usage = new RunModelUsage(async value => { if (!writes.length) await gate; writes.push(value) })
  const pending = [usage.supplement('review-one', { outputTokens: 2 }), usage.main({ inputTokens: 10, outputTokens: 3 }), usage.supplement('review-one', { outputTokens: 2 }), usage.supplement('review-two', {}), usage.main({ inputTokens: 15, outputTokens: 5 })]
  expect(writes).toEqual([]); release(); await Promise.all(pending)
  expect(writes).toEqual([{ outputTokens: 2 }, { inputTokens: 10, outputTokens: 5 }, { inputTokens: 10, outputTokens: 5 }, { inputTokens: 10, outputTokens: 5 }, { inputTokens: 15, outputTokens: 7 }])
  expect(() => usage.supplement('', { totalTokens: 0 })).toThrow('request ID')
})
async function fixture(protocol: ModelProtocol = 'chat') {
  const root = await directory(), renderer = join(root, 'renderer')
  await writeFile(renderer, '#!/bin/sh\nexit 9\n'); await chmod(renderer, 0o700)
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); clean.push(() => store.close())
  const requests: { body: any; headers: IncomingMessage['headers']; url: string; closed: boolean }[] = []
  let respond = (response: ServerResponse) => streamText(response, protocol, answer, 'complete')
  const server = createServer((request, response) => { void (async () => {
    let raw = ''; for await (const bytes of request) raw += bytes
    const row = { body: JSON.parse(raw), headers: request.headers, url: request.url!, closed: false }; requests.push(row)
    response.on('close', () => { row.closed = true }); respond(response)
  })().catch(error => response.destroy(error)) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  clean.push(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }))
  let connection: Connection | undefined = { id: 'vision-source', revision: 1, name: 'Explicit vision', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, defaultModel: 'chat-must-not-be-used', hasApiKey: true, gateway: { kind: 'magpie', protocol, auth: 'key' } }
  let lock: Promise<unknown> = Promise.resolve(), credentials = 0
  const host = { connection: async () => connection, credential: async () => { credentials++; return 'fixture-private-credential' }, critical: <T>(action: () => Promise<T>) => { const next = lock.catch(() => {}).then(action); lock = next; return next }, changed: () => {}, generate: generatePresentationReview }
  const presentations = new PresentationService(store, host), application = new ApplicationService(store, presentations.operations(), async () => {})
  let serial = 0
  const call = (input: unknown, requestId = `configure-${++serial}`) => application.call({ operation: 'presentations.configure', input: input as Record<string, unknown>, requestId })
  const selected = { connectionId: connection.id, connectionRevision: 1, model: 'selected/vision' }
  const configure = () => call({ expectedRevision: 0, rendererPath: renderer, vision: selected })
  const starts: PresentationReviewSource[] = [], settles: { requestId: string; usage: ModelUsage; completed: boolean }[] = [], routes: GatewayRouteEvidence[] = []
  const observer: PresentationReviewObserver = { begin: async source => { starts.push(source); return `call-${starts.length}` }, settle: async (requestId, usage, completed) => { settles.push({ requestId, usage, completed }) }, route: async (_, evidence) => { routes.push(evidence) } }
  const lease = (signal = new AbortController().signal, validate = async () => {}, events = observer) => presentations.lease(signal, validate, events)
  return { root, renderer, store, host, presentations, application, call, configure, selected, requests, lease, starts, settles, routes, observer, get credentials() { return credentials }, get connection() { return connection }, setConnection(value?: Connection) { connection = value }, respond(value: typeof respond) { respond = value } }
}

test('persists only explicit settings, preserves omitted values, serializes CAS and never invokes the renderer/model while saving', async () => {
  const f = await fixture()
  expect(await f.presentations.settings()).toMatchObject({ revision: 0, configured: false, renderer: null, vision: null, verified: false })
  expect(await f.call({ expectedRevision: 0, rendererPath: join(f.root, 'missing') })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect((await f.presentations.settings()).revision).toBe(0)
  await expect(f.lease()).rejects.toThrow('尚未配置 PPT 渲染器')
  const first = await f.call({ expectedRevision: 0, rendererPath: f.renderer }, 'renderer-only')
  expect(first.status).toBe('succeeded')
  await expect(f.lease()).rejects.toThrow('尚未选择 PPT 专用视觉模型')
  const outcomes = await Promise.all([f.call({ expectedRevision: 1, vision: f.selected }), f.call({ expectedRevision: 1, vision: f.selected })])
  expect(outcomes.map(value => value.status).sort()).toEqual(['rejected', 'succeeded'])
  expect(outcomes.find(value => value.status === 'rejected')?.error?.code).toBe('REVISION_CONFLICT')
  expect(await f.presentations.settings()).toMatchObject({ revision: 2, configured: true, verified: false, vision: f.selected, renderer: { path: f.renderer } })
  const restarted = new PresentationService(f.store, f.host)
  expect(await restarted.settings()).toEqual(await f.presentations.settings())
  expect(await f.call({ expectedRevision: 0, rendererPath: f.renderer }, 'renderer-only')).toEqual(first)
  await f.call({ expectedRevision: 2, vision: null })
  expect(await restarted.settings()).toMatchObject({ revision: 3, configured: false, vision: null, renderer: { path: f.renderer } })
  expect(f.connection?.defaultModel).toBe('chat-must-not-be-used'); expect(f.requests).toHaveLength(0); expect(f.credentials).toBe(0)
})

test.each(['chat', 'responses', 'messages'] as const)('sends exact PNG bytes over %s with the selected source and one actual request receipt', async protocol => {
  const f = await fixture(protocol); expect((await f.configure()).status).toBe('succeeded')
  const lease = await f.lease(), result = await lease.reviewer.generate({ prompt: 'Review the actual pixels. Slide s1.', images })
  expect(result).toEqual({ text: answer, requestId: 'call-1' }); expect(f.requests).toHaveLength(1)
  const row = f.requests[0], body = row.body
  expect(body.model).toBe('selected/vision'); expect(body.tools ?? []).toHaveLength(0)
  expect(row.url).toBe(protocol === 'chat' ? '/v1/chat/completions' : `/v1/${protocol}`)
  if (protocol === 'chat') expect(body.messages.find((m: any) => m.role === 'user').content.find((p: any) => p.type === 'image_url').image_url.url).toBe(`data:image/png;base64,${png.toString('base64')}`)
  if (protocol === 'responses') expect(body.input.find((m: any) => m.role === 'user').content.find((p: any) => p.type === 'input_image').image_url).toBe(`data:image/png;base64,${png.toString('base64')}`)
  if (protocol === 'messages') expect(body.messages.find((m: any) => m.role === 'user').content.find((p: any) => p.type === 'image').source).toEqual({ type: 'base64', media_type: 'image/png', data: png.toString('base64') })
  expect(f.starts).toEqual([{ settingsRevision: 1, connectionId: 'vision-source', connectionRevision: 1, model: 'selected/vision', protocol }])
  expect(f.settles).toEqual([{ requestId: 'call-1', usage: protocol === 'chat' ? {} : { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, completed: true }])
  expect(f.routes).toMatchObject([{ actualModelId: 'provider/actual', actualProvider: 'provider' }])
  expect(JSON.stringify([result, f.starts, f.routes, f.settles, await f.store.load('presentationSettings'), await f.store.load('applicationOperations')])).not.toContain('fixture-private-credential')
})

test.each(['chat', 'responses', 'messages'] as const)('rejects %s EOF without treating partial JSON as reviewed or replaying the request', async protocol => {
  const f = await fixture(protocol); await f.configure(); f.respond(response => streamText(response, protocol, answer, 'eof'))
  const lease = await f.lease()
  await expect(lease.reviewer.generate({ prompt: 'Review', images })).rejects.toThrow('未确认正常完成')
  expect(f.requests).toHaveLength(1); expect(f.settles).toHaveLength(1); expect(f.settles[0].completed).toBe(false)
})

test.each(['chat', 'responses', 'messages'] as const)('does not retry a %s provider failure or expose its private error body', async protocol => {
  const f = await fixture(protocol); await f.configure()
  f.respond(response => { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'fixture-private-credential' } })) })
  const lease = await f.lease(), error = await lease.reviewer.generate({ prompt: 'Review', images }).then(() => 'unexpected success', error => String(error))
  expect(error).toContain('未重试或切换模型'); expect(error).not.toContain('fixture-private-credential')
  expect(f.requests).toHaveLength(1); expect(f.settles).toEqual([{ requestId: 'call-1', usage: {}, completed: false }])
})

test('refuses tampered PNG bytes before sending any image to a provider', async () => {
  const f = await fixture(); await f.configure()
  const lease = await f.lease()
  await expect(lease.reviewer.generate({ prompt: 'Review', images: [{ ...images[0], bytes: Buffer.from('not a PNG') }] })).rejects.toThrow('图片格式或内容校验失败')
  expect(f.requests).toHaveLength(0); expect(f.settles).toEqual([{ requestId: 'call-1', usage: {}, completed: false }])
})

test.each(['settings', 'connection', 'cancel'] as const)('cancels an active vision request after %s changes and retains one unknown receipt', async change => {
  const f = await fixture(); await f.configure(); f.respond(response => streamText(response, 'chat', answer, 'hold'))
  const controller = new AbortController(), lease = await f.lease(controller.signal)
  const task = lease.reviewer.generate({ prompt: 'Review', images }), outcome = task.then(() => 'unexpected success', error => String(error))
  await expect.poll(() => f.requests.length).toBe(1)
  if (change === 'settings') await f.call({ expectedRevision: 1, vision: null })
  else if (change === 'connection') { f.setConnection({ ...f.connection!, revision: 2 }); f.presentations.cancelConnection('vision-source') }
  else controller.abort()
  expect(await outcome).toContain('已停止')
  await expect.poll(() => f.requests[0].closed).toBe(true)
  expect(f.requests).toHaveLength(1); expect(f.settles).toMatchObject([{ requestId: 'call-1', completed: false }])
})

test('rejects revoked access, stale executable, empty receipts and exhausted request budgets before any provider call', async () => {
  const f = await fixture(); await f.configure()
  let allowed = true
  const lease = await f.lease(undefined, async () => { if (!allowed) throw new Error('scope revoked') })
  allowed = false; await expect(lease.reviewer.generate({ prompt: 'Review', images })).rejects.toThrow('scope revoked')
  await writeFile(f.renderer, '#!/bin/sh\nexit 8\n')
  await expect(f.lease()).rejects.toThrow('渲染器已改变')
  expect((await f.presentations.settings()).configured).toBe(false)
  await f.call({ expectedRevision: 1, rendererPath: f.renderer })
  const empty = await f.lease(undefined, undefined, { ...f.observer, begin: async () => '' })
  await expect(empty.reviewer.generate({ prompt: 'Review', images })).rejects.toThrow('调用回执')
  const denied = await f.lease(undefined, undefined, { ...f.observer, begin: async () => { throw new Error('budget exhausted') } })
  await expect(denied.reviewer.generate({ prompt: 'Review', images })).rejects.toThrow('budget exhausted')
  expect(f.requests).toHaveLength(0); expect(f.settles).toHaveLength(0)
})

test('settles actual completed usage but rejects the result if authorization is revoked after the response', async () => {
  const f = await fixture('responses'); await f.configure()
  let allowed = true
  const host = { ...f.host, generate: async (input: Parameters<typeof generatePresentationReview>[0]) => { const text = await generatePresentationReview(input); allowed = false; return text } }
  const service = new PresentationService(f.store, host)
  const lease = await service.lease(new AbortController().signal, async () => { if (!allowed) throw new Error('scope revoked') }, f.observer)
  await expect(lease.reviewer.generate({ prompt: 'Review', images })).rejects.toThrow('scope revoked')
  expect(f.settles).toEqual([{ requestId: 'call-1', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, completed: true }]); expect(f.requests).toHaveLength(1)
})

test('exposes the settings through the actual application protocol and restores them without running a model', async () => {
  const root = await directory(); let calls = 0
  const options = { dataPath: root, engine: { run: async () => { calls++ }, test: async () => { calls++; return '' } }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options); clean.push(() => service.close()); await service.init()
  expect(await service.handle('getApplicationCatalog', { domain: 'presentations' })).toMatchObject({ operations: [{ name: 'presentations.settings' }, { name: 'presentations.configure' }] })
  expect(await service.handle('executeApplicationOperation', { operation: 'application.guide', input: { topic: 'presentations' } })).toMatchObject({ status: 'succeeded', data: { topic: 'presentations', instructions: expect.stringContaining('不自动借用聊天模型') } })
  const connection = await service.handle('saveConnection', { name: 'Vision', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'chat' }) as Connection
  const request = { operation: 'presentations.configure', requestId: 'save-selected-vision', input: { expectedRevision: 0, vision: { connectionId: connection.id, connectionRevision: connection.revision!, model: 'chosen-vision' } } }
  const saved = await service.handle('executeApplicationOperation', request) as ApplicationResult
  expect(saved.status).toBe('succeeded'); await service.close(); service = new AppService(options); await service.init()
  expect(await service.handle('executeApplicationOperation', request)).toEqual(saved)
  expect(await service.handle('executeApplicationOperation', { operation: 'presentations.settings', input: {} })).toMatchObject({ data: { revision: 1, vision: request.input.vision, configured: false } })
  expect(calls).toBe(0)
  const store = await ProductStore.openReadOnly(join(root, 'boai.sqlite'))
  try { for (const collection of ['runs', 'messages', 'workItems']) expect(await store.load(collection)).toEqual([]) } finally { await store.close() }
})

async function employeeFixture(protocol: ModelProtocol, handler: (context: EngineContext) => Promise<void>) {
  const f = await fixture(protocol), dataPath = join(f.root, 'employee')
  const engine: AgentEngine = {
    test: async () => 'fixture', run: handler,
    decide: async context => ({ action: 'reply', responseKind: 'task', work: { key: 'review', scope: '审阅当前幻灯片', deliverable: '审阅结果' }, observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) }),
    report: async (_, draft) => ({ action: 'publish', text: draft.text }),
  }
  const service = new AppService({ dataPath, engine, secrets: { get: async () => 'fixture-private-credential', set: async () => {}, delete: async () => {} }, emit: () => {} })
  clean.push(() => service.close()); await service.init()
  const main = await service.handle('saveConnection', { name: 'Chat source', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', gateway: { kind: 'magpie', protocol: 'responses', auth: 'key' }, defaultModel: 'chat-only', apiKey: 'fixture-private-credential' }) as Connection
  const vision = await service.handle('saveConnection', { name: 'Vision source', provider: 'openai-compatible', baseUrl: f.connection!.baseUrl, gateway: f.connection!.gateway, defaultModel: 'wrong-default', apiKey: 'fixture-private-credential' }) as Connection
  expect(await service.handle('executeApplicationOperation', { operation: 'presentations.configure', requestId: 'vision', input: { expectedRevision: 0, rendererPath: f.renderer, vision: { connectionId: vision.id, connectionRevision: vision.revision!, model: 'selected/vision' } } })).toMatchObject({ status: 'succeeded' })
  const agent = await service.handle('saveAgent', { name: 'PPT employee', role: '制作演示文稿', instructions: '按原任务执行', color: '#0077BB', connectionId: main.id, modelId: 'chat-only', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, executionBackend: { kind: 'mastra-model' } }) as DigitalAgent
  const conversation = await service.handle('createConversation', { kind: 'direct', title: 'PPT review', agentIds: [agent.id] }) as Conversation
  const detail = () => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
  const send = () => service.handle('sendMessage', { conversationId: conversation.id, content: '审阅幻灯片', mentionIds: [], requestId: 'review' })
  const idle = async () => { await expect.poll(async () => { const d = await detail(); return d.runs.some(run => run.phase === 'execution') && d.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) }, { timeout: 10000 }).toBe(true); return detail() }
  const calls = async () => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return await store.load<ProfileModelCall>('profileModelCalls') } finally { await store.close() } }
  return { ...f, service, main, vision, conversation, agent, send, detail, idle, calls }
}

test.each(['responses', 'chat'] as const)('keeps the dedicated %s request in the original employee ledger without overwriting chat source or cumulative usage', async protocol => {
  let current: EngineContext, requestId: string
  const finalMain = { inputTokens: 16, outputTokens: 24, totalTokens: 40 }
  const f = await employeeFixture(protocol, async context => {
    current = context
    await context.onModelCallStarted!(context.modelCallId!, 'task')
    await context.onUsage!({ inputTokens: 10, outputTokens: 20, totalTokens: 30 })
    const lease = await context.presentations!.lease()
    requestId = (await lease.reviewer.generate({ prompt: 'Review', images })).requestId
    await context.onModelCallUsage!(context.modelCallId!, finalMain, true)
    await context.onUsage!(finalMain); await context.onUsage!(finalMain)
    await context.onDelta('审阅结束')
    await context.onWorkOutcome!({ disposition: 'delivered', summary: '审阅结束', evidence: [{ kind: 'answer', reference: '审阅结束' }] })
  })
  await f.send(); const detail = await f.idle(), run = detail.runs.find(run => run.id === current!.runId)!
  expect(run.status).toBe('completed')
  expect(run.usage).toEqual(protocol === 'responses' ? { inputTokens: 17, outputTokens: 25, totalTokens: 42 } : finalMain)
  expect(run.modelCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({ callId: current!.modelCallId, connectionId: f.main.id, selectedModelId: 'chat-only' }),
    expect.objectContaining({ callId: requestId!, connectionId: f.vision.id, connectionRevision: f.vision.revision, selectedModelId: 'selected/vision', protocol, capability: 'presentation-review', route: expect.objectContaining({ reportedModelId: 'provider/actual' }) }),
  ]))
  const calls = await f.calls(), visionCalls = calls.filter(call => call.id === requestId!)
  expect(visionCalls).toHaveLength(1)
  expect(visionCalls[0]).toMatchObject({ runId: run.id, phase: 'report', usage: protocol === 'responses' ? { inputTokens: 1, outputTokens: 1, totalTokens: 2 } : {}, finishedAt: expect.any(String) })
  expect(detail.workBudgets!.find(budget => budget.id === current!.workBudget!.id)).toMatchObject({ modelCalls: 2, usage: run.usage })
  expect(f.requests).toHaveLength(1)
  const sent = JSON.stringify(f.requests[0].body)
  expect(sent).toContain('selected/vision'); expect(sent).not.toContain('chat-only')
  await expect(current!.presentations!.lease()).rejects.toThrow()
  expect(f.requests).toHaveLength(1)
})

test.each(['settings', 'stop'] as const)('retains one incomplete employee receipt after %s cancels an actual vision request', async change => {
  let current: EngineContext
  const f = await employeeFixture('responses', async context => {
    current = context
    const lease = await context.presentations!.lease()
    await lease.reviewer.generate({ prompt: 'Review', images })
    throw new Error('Cancellation must prevent accepting the review')
  })
  f.respond(response => streamText(response, 'responses', answer, 'hold'))
  await f.send(); await expect.poll(() => f.requests.length).toBe(1)
  if (change === 'settings') expect(await f.service.handle('executeApplicationOperation', { operation: 'presentations.configure', requestId: 'cancel-vision', input: { expectedRevision: 1, vision: null } })).toMatchObject({ status: 'succeeded' })
  else await f.service.handle('cancelRun', { conversationId: f.conversation.id, workId: current!.work!.id })
  const detail = await f.idle(), run = detail.runs.find(run => run.id === current!.runId)!
  expect(['failed', 'cancelled']).toContain(run.status)
  await expect.poll(() => f.requests[0].closed).toBe(true)
  const callId = run.modelCalls!.find(call => call.capability === 'presentation-review')!.callId
  expect((await f.calls()).filter(call => call.id === callId)).toMatchObject([{ phase: 'report', finishedAt: expect.any(String), usage: {} }])
  expect(f.requests).toHaveLength(1)
  await expect(current!.presentations!.lease()).rejects.toThrow()
  expect(f.requests).toHaveLength(1)
})

test.skipIf(!process.env.BOAI_PPT_RENDERER)('actual employee tools render, review through the selected SDK, export and publish the exact approved editable PPTX', async () => {
  let reviewed: any, exported: any, artifact: any, current: EngineContext
  const f = await employeeFixture('responses', async context => {
    current = context
    await context.onModelCallStarted!(context.modelCallId!, 'task')
    const runtime = await createTaskRuntime(context), cli = mastraCliTools(context, runtime.tools)
    let sequence = 0
    const call = async (name: string, input: Record<string, unknown>): Promise<any> => cli.find(tool => tool.name === name)!.execute(input, `tool-${++sequence}`)
    try {
      await call('write_file', { path: `self:/runs/${context.runId}/facts.md`, content: '原始记录：甲 7，乙 11。' })
      await call('presentation_extract_material', { path: `self:/runs/${context.runId}/facts.md` })
      const created = await call('presentation_create', { title: '实际员工工具验证', theme: { name: 'Proof', headFontFace: 'Arial', bodyFontFace: 'Arial' }, story: { audience: '项目成员', purpose: '验证完整文件流程', coreMessage: '保留原始数字', narrative: ['证据'] }, design: { visualDirection: 'Simple typography', imageDirection: 'Native data', density: 'balanced' } })
      const slide = { id: 's1', role: 'supporting', layoutKey: 'proof', speakerNotes: '受控事实：甲 7，乙 11。', elements: [{ id: 'title', type: 'text', text: '原始记录：甲 7，乙 11', x: 1, y: 1, w: 10, h: 1, fontSize: 36 }] }
      await call('presentation_upsert_slide', { presentationId: created.id, expectedRevision: 0, slide })
      expect(await call('presentation_validate', { presentationId: created.id })).toMatchObject({ valid: true })
      await expect(call('presentation_export', { presentationId: created.id, path: `self:/runs/${context.runId}/unreviewed.pptx` })).rejects.toThrow()
      reviewed = await call('presentation_review', { presentationId: created.id }); expect(reviewed.passed).toBe(true)
      const preview = await call('presentation_render', { presentationId: created.id, outputDirectory: `self:/runs/${context.runId}/previews` })
      expect(preview.reviewed).toBe(false); expect(preview.images).toHaveLength(1)
      expect(createHash('sha256').update(await readFile(join(context.workspace!.runPath, 'previews/slide-01.png'))).digest('hex')).toBe(preview.images[0].sha256)
      exported = await call('presentation_export', { presentationId: created.id, path: `self:/runs/${context.runId}/approved.pptx` })
      artifact = (await call('publish_artifact', { path: exported.path })).artifact
      expect(createHash('sha256').update(await readFile(artifact.path)).digest('hex')).toBe(reviewed.fileHash)
      // A valid later edit invalidates the previous approval; it cannot authorize another export.
      await call('presentation_upsert_slide', { presentationId: created.id, expectedRevision: 1, slide: { ...slide, speakerNotes: '后续修订仍需重新审阅' } })
      await expect(call('presentation_export', { presentationId: created.id, path: `self:/runs/${context.runId}/stale.pptx` })).rejects.toThrow('has not passed')
      await context.onUsage!({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })
      await context.onDelta('已交付审阅通过的文件。')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已交付审阅通过的文件。', evidence: [{ kind: 'artifact', reference: artifact.id }] })
    } finally { await runtime.dispose() }
  })
  expect(await f.service.handle('executeApplicationOperation', { operation: 'presentations.configure', requestId: 'actual-renderer', input: { expectedRevision: 1, rendererPath: process.env.BOAI_PPT_RENDERER! } })).toMatchObject({ status: 'succeeded' })
  await f.send()
  await expect.poll(async () => (await f.detail()).runs.some(run => run.phase === 'execution' && ['completed', 'failed', 'cancelled'].includes(run.status)), { timeout: 90000 }).toBe(true)
  const detail = await f.detail(), run = detail.runs.find(run => run.id === current!.runId)!
  expect(run.status, run.error).toBe('completed'); expect(run.usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 })
  expect(f.requests).toHaveLength(1); expect(reviewed.requests).toEqual([run.modelCalls!.find(call => call.capability === 'presentation-review')!.callId])
  expect(exported).toMatchObject({ passed: true, published: false, fileHash: reviewed.fileHash })
  expect(detail.artifacts.some(value => value.id === artifact.id)).toBe(true)
  const cache = join(current!.workspace!.root, '.presentations')
  expect(await realpath(cache)).toBe(cache)
  await f.service.handle('clearConversationHistory', { id: f.conversation.id, hide: false })
  await expect(realpath(cache)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.requests).toHaveLength(1)
}, 120000)

test.skipIf(!process.env.BOAI_PPT_RENDERER).each(['codex', 'claude'] as const)('actual %s protocol tools keep vision calls separate from native invocations and BOAI budgets', async backend => {
  const provider = await fixture('responses'), disposals: (() => Promise<void>)[] = []
  clean.push(async () => { for (const action of disposals.reverse()) await action() })
  const native = await nativeFixture(backend, disposals)
  const connection = await native.service.handle('saveConnection', { name: 'Dedicated vision', provider: 'openai-compatible', baseUrl: provider.connection!.baseUrl, gateway: { kind: 'magpie', protocol: 'responses', auth: 'local' }, defaultModel: 'wrong-default' }) as Connection
  expect(await native.service.handle('executeApplicationOperation', { operation: 'presentations.configure', requestId: 'native-ppt', input: { expectedRevision: 0, rendererPath: process.env.BOAI_PPT_RENDERER!, vision: { connectionId: connection.id, connectionRevision: connection.revision!, model: 'selected/vision' } } })).toMatchObject({ status: 'succeeded' })
  const message = await native.send('NATIVE_PPT')
  await expect.poll(async () => (await native.detail()).runs.some(run => run.triggerMessageId === message.id && ['completed', 'failed', 'cancelled'].includes(run.status)), { timeout: 90000 }).toBe(true)
  const detail = await native.detail(), run = detail.runs.find(run => run.triggerMessageId === message.id && run.phase === 'execution')!
  expect(run.status, run.error).toBe('completed'); expect(run.backend).toMatchObject({ externalInvocations: 1 })
  expect(run.usage).toBeUndefined(); expect(provider.requests).toHaveLength(1)
  const vision = run.modelCalls!.filter(call => call.capability === 'presentation-review')
  expect(vision).toHaveLength(1); expect(vision[0]).toMatchObject({ connectionId: connection.id, selectedModelId: 'selected/vision', route: { actualModelId: 'provider/actual' } })
  const reply = detail.messages.find(value => value.runId === run.id && value.senderType === 'agent')!
  const result = JSON.parse(reply.content.split('NATIVE_PPT_RESULT ')[1])
  const artifact = detail.artifacts.find(value => value.id === result.artifactId)!
  expect(createHash('sha256').update(await readFile(artifact.path)).digest('hex')).toBe(result.fileHash)
  expect(result.requests).toEqual([vision[0].callId])
  const store = await ProductStore.openReadOnly(join(native.root, 'boai.sqlite'))
  try {
    expect(await store.load('budgetModelCalls')).toEqual([]); expect(await store.load('profileModelCalls')).toEqual([])
    expect((await store.load<{ modelCalls: number; usage: ModelUsage }>('workBudgets')).every(budget => budget.modelCalls === 0 && !Object.keys(budget.usage).length)).toBe(true)
  } finally { await store.close() }
}, 120000)
