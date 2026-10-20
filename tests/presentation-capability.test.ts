/*
 * [INPUT]: Actual SQLite/application settings, Mastra SDK and local three-protocol provider fixtures.
 * [OUTPUT]: Explicit source/renderer selection, native PNG transport, receipts, revocation and no replay on restart/failure.
 * [POS]: Controlled capability integration; no remote model or real slide-quality certification.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { Connection, ModelUsage } from '../src/shared/domain'
import type { ApplicationResult } from '../src/shared/domain/application-protocol'
import type { GatewayRouteEvidence, ModelProtocol } from '../src/shared/domain/model-gateway'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import { PresentationService, type PresentationReviewObserver, type PresentationReviewSource } from '../src/runtime/modules/presentations/presentation-service'
import { generatePresentationReview } from '../src/runtime/adapters/mastra/presentation-review-model'
import { streamText } from './fixtures/gateway-stream'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'

const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
async function directory() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-presentation-capability-'))); clean.push(() => rm(root, { recursive: true, force: true })); return root }
const png = gatewayVisionImage(), images = [{ slideId: 's1', bytes: png, sha256: createHash('sha256').update(png).digest('hex') }]
const answer = JSON.stringify({ slides: [{ slideId: 's1', score: 90, issues: [] }], deckIssues: [] })
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
