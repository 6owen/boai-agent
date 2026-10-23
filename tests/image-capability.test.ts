/*
 * [INPUT]: Real SQLite/application/task runtime and controlled HTTP image provider.
 * [OUTPUT]: Settings CAS, actual generation/edit transport, cancellation, secret and file-boundary regressions.
 * [POS]: Engineering integration; fixture pixels do not certify a real image model or personality quality.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import { ImageService, imageEndpoint } from '../src/runtime/modules/media/image-service'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import type { Connection, DigitalAgent } from '../src/shared/domain'
import type { EngineContext } from '../src/runtime/contracts'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1foAAAAASUVORK5CYII=', 'base64')
const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-image-')); clean.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); clean.push(() => store.close())
  const requests: { url: string; headers: IncomingMessage['headers']; body: Buffer }[] = []
  let respond = (_: IncomingMessage, res: ServerResponse) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], usage: { total_tokens: 6, secret: 'provider-private-field' } })) }
  const server = createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); requests.push({ url: req.url!, headers: req.headers, body: Buffer.concat(chunks) }); respond(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  clean.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }))
  let connection: Connection | undefined = { id: 'image-connection', revision: 1, provider: 'openai-compatible', name: 'Fixture images', baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, defaultModel: 'chat-model-must-not-be-used', hasApiKey: true }
  const images = new ImageService(store, { connection: async () => connection, credential: async () => 'fixture-secret', critical: action => action(), changed: () => {} })
  const application = new ApplicationService(store, images.operations(), async () => {})
  let serial = 0
  const call = (operation: string, input = {}, requestId = `request-${++serial}`) => application.call({ operation: `images.${operation}`, input, requestId })
  const configure = (expectedRevision = 0, changes = {}) => call('configure', { expectedRevision, selection: { protocol: 'openai-images', connectionId: connection!.id, connectionRevision: connection!.revision, model: 'chosen-image-model', ...changes } })
  const generate = (references: any[] = [], signal = new AbortController().signal, validate = async () => {}) => images.generate({ prompt: '测试图' }, references, signal, validate)
  return { root, store, images, application, requests, call, configure, generate, setRespond: (fn: typeof respond) => { respond = fn }, get connection() { return connection }, setConnection: (value?: Connection) => { connection = value } }
}
it('keeps image selection separate, CAS-protects changes and replays only saved configuration receipts', async () => {
  const f = await fixture()
  expect(await f.images.settings()).toMatchObject({ ready: false, revision: 0, selection: null })
  await expect(f.generate()).rejects.toThrow('尚未选择生图模型'); expect(f.requests).toHaveLength(0)
  const input = { expectedRevision: 0, selection: { connectionId: f.connection!.id, connectionRevision: 1, model: 'chosen-image-model', protocol: 'openai-images' } }
  const first = await f.call('configure', input, 'fixed'); expect(first.status).toBe('succeeded')
  expect(await f.call('configure', input, 'fixed')).toEqual(first)
  expect((await f.configure()).error?.code).toBe('REVISION_CONFLICT')
  expect(f.connection!.defaultModel).toBe('chat-model-must-not-be-used')
  expect(await f.images.settings()).toMatchObject({ ready: true, revision: 1 })
  await f.call('configure', { expectedRevision: 1, selection: null })
  expect(await f.call('configure', input, 'fixed')).toEqual(first)
  expect((await f.images.settings()).selection).toBeNull()
})
it('uses the exact selected route and sends one JSON request with no response_format for native base64', async () => {
  const f = await fixture(); await f.configure(0, { defaultSize: '1536x1024' })
  const result = await f.images.generate({ prompt: 'actual prompt', background: 'transparent' }, [], new AbortController().signal, async () => {})
  expect(f.requests).toHaveLength(1)
  expect(f.requests[0].url).toBe('/v1/images/generations')
  expect(f.requests[0].headers.authorization).toBe('Bearer fixture-secret')
  expect(JSON.parse(f.requests[0].body.toString())).toEqual({ model: 'chosen-image-model', prompt: 'actual prompt', n: 1, size: '1536x1024', background: 'transparent' })
  expect(Buffer.from(result.bytes)).toEqual(png); expect(result.contentHash).toBe(createHash('sha256').update(png).digest('hex'))
  expect(result.usage).toEqual({ total_tokens: 6 }); expect(JSON.stringify(result)).not.toContain('fixture-secret')
  expect(JSON.stringify(await f.store.load('applicationOperations'))).not.toContain('fixture-secret')
})
it('uploads original ordered reference bytes through multipart edits, honoring explicit size', async () => {
  const f = await fixture(); await f.configure(0, { defaultSize: '1024x1024' })
  await f.images.generate({ prompt: 'change background', size: '1536x1024' }, [{ bytes: png, mimeType: 'image/png' }, { bytes: png, mimeType: 'image/png' }], new AbortController().signal, async () => {})
  const request = f.requests[0], form = request.body.toString('latin1')
  expect(request.url).toBe('/v1/images/edits'); expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
  expect(form.match(/name="image\[\]"/g)).toHaveLength(2); expect(request.body.includes(png)).toBe(true)
  expect(form).toContain('1536x1024'); expect(form).not.toContain('1024x1024')
})
it('rejects stale/deleted connections and malformed or excess references before making a request', async () => {
  const f = await fixture(); await f.configure()
  for (const refs of [[{ bytes: Buffer.from('not a png'), mimeType: 'image/png' }], Array.from({ length: 5 }, () => ({ bytes: png, mimeType: 'image/png' })), [{ bytes: Buffer.alloc(9 * 1024 * 1024), mimeType: 'image/png' }]]) await expect(f.generate(refs)).rejects.toThrow()
  f.setConnection({ ...f.connection!, revision: 2 }); await expect(f.generate()).rejects.toThrow('重新选择')
  f.setConnection(); expect((await f.images.settings()).ready).toBe(false)
  await expect(f.generate()).rejects.toThrow('重新选择'); expect(f.requests).toHaveLength(0)
})
it('never follows redirects, retries errors, leaks provider errors or fetches returned URLs', async () => {
  const f = await fixture(); await f.configure()
  f.setRespond((_, res) => { res.statusCode = 302; res.setHeader('location', '/other'); res.end() })
  await expect(f.generate()).rejects.toThrow('未重试'); expect(f.requests).toHaveLength(1)
  f.setRespond((_, res) => { res.statusCode = 401; res.end('secret-echo-from-provider') })
  await expect(f.generate()).rejects.toThrow('HTTP 401'); expect(f.requests).toHaveLength(2)
  f.setRespond((_, res) => res.end(JSON.stringify({ data: [{ url: 'http://127.0.0.1/private' }] })))
  await expect(f.generate()).rejects.toThrow('不抓取'); expect(f.requests).toHaveLength(3)
  f.setRespond((_, res) => res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('<script>bad</script>').toString('base64') }] })))
  await expect(f.generate()).rejects.toThrow('栅格'); expect(f.requests).toHaveLength(4)
})
it('cancels pending generation when its connection changes and does not return bytes after revocation', async () => {
  const f = await fixture(); await f.configure()
  let received!: () => void; const started = new Promise<void>(resolve => { received = resolve })
  f.setRespond(() => { received() })
  const promise = f.generate(); const rejected = expect(promise).rejects.toThrow('已停止')
  await started; f.images.cancelConnection(f.connection!.id); await rejected; expect(f.requests).toHaveLength(1)
  f.setRespond((_, res) => { f.setConnection({ ...f.connection!, revision: 2 }); res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })) })
  await expect(f.generate()).rejects.toThrow('重新选择')
})
it('refuses invalid provider roots and exposes no guessed fallback endpoint', () => {
  const connection = { provider: 'openai-compatible', baseUrl: '' } as Connection
  for (const baseUrl of ['file:///tmp/image', 'https://user:secret@example.com/v1', 'https://example.com/v1?key=x', 'https://example.com/v1/chat/completions', 'https://example.com/v1/images/generations']) expect(() => imageEndpoint({ ...connection, baseUrl }, false)).toThrow()
  expect(() => imageEndpoint({ ...connection, provider: 'anthropic', baseUrl: 'https://example.com' }, false)).toThrow()
})
async function task(f: Awaited<ReturnType<typeof fixture>>, overrides: Partial<EngineContext> = {}) {
  const controller = new AbortController(), root = join(f.root, 'agent/session')
  const ctx: EngineContext = {
    agent: { id: 'a', name: 'A', role: 'designer', instructions: '', color: '#112233', connectionId: f.connection!.id, modelId: '', skillIds: [], knowledgeIds: [], active: true, configVersion: 1, executionPermission: 'full-access', allowCommands: false } as DigitalAgent,
    connection: f.connection, apiKey: 'fixture-chat-secret',
    conversation: { id: 'room', kind: 'direct', agentIds: ['a'], title: 'Test', mode: 'mention', workspacePath: join(f.root, 'shared'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    messages: [], resources: [], runId: 'r1', responseKind: 'task', signal: controller.signal,
    workspace: { root, workPath: join(root, 'work'), runPath: join(root, 'runs/r1'), sharedPath: join(f.root, 'shared') },
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false, images: { settings: () => f.images.settings(), generate: (input, refs) => f.images.generate(input, refs, controller.signal, async () => {}), verify: source => f.images.verify(source) }, ...overrides,
  }
  const runtime = await createTaskRuntime(ctx); clean.push(() => runtime.workspace.destroy())
  const invoke = (name: string, input: any) => (runtime.tools as any)[name].execute(input, { requestContext: new RequestContext(), observe: noopObserve })
  return { runtime, ctx, invoke }
}
it('writes original bytes to a new authorized file and publishes via the existing artifact flow', async () => {
  const f = await fixture(); await f.configure(); const artifacts: any[] = []
  const t = await task(f, { onArtifact: async artifact => { artifacts.push(artifact) } })
  const input = { prompt: 'actual picture', path: 'self:/runs/r1/picture.png', references: [] }
  const result = await t.invoke('generate_image', input)
  expect(result.published).toBe(false); expect(await readFile(join(t.ctx.workspace!.runPath, 'picture.png'))).toEqual(png)
  await t.invoke('publish_artifact', { path: input.path, name: 'picture.png' }); expect(artifacts).toHaveLength(1)
  expect(await readFile(artifacts[0].path)).toEqual(png)
  await expect(t.invoke('generate_image', input)).rejects.toThrow('已有生图尝试'); expect(f.requests).toHaveLength(1)
})
it('rejects existing files, read-only permission, source revocation and path escapes before external generation', async () => {
  const f = await fixture(); await f.configure(); const t = await task(f)
  await writeFile(join(t.ctx.workspace!.runPath, 'original.png'), png)
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/original.png' })).rejects.toThrow('已存在')
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/../../escape.png' })).rejects.toThrow()
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/new.png', references: ['self:/SOUL.md'] })).rejects.toThrow()
  t.ctx.agent.executionPermission = 'read-only'
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/denied.png' })).rejects.toThrow('只读')
  expect(f.requests).toHaveLength(0); expect(await readFile(join(t.ctx.workspace!.runPath, 'original.png'))).toEqual(png)
})
it('preserves a file created during generation and refuses a second attempt through a path alias', async () => {
  const f = await fixture(); await f.configure(); const t = await task(f)
  const target = join(t.ctx.workspace!.runPath, 'race.png')
  f.setRespond((_, res) => { void writeFile(target, 'another writer').then(() => res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }))) })
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/race.png' })).rejects.toThrow()
  expect(await readFile(target, 'utf8')).toBe('another writer'); await rm(target)
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/./race.png' })).rejects.toThrow('未重复请求')
  expect(f.requests).toHaveLength(1)
})
it('stops on settings changes during an HTTP request and refuses publication of superseded results', async () => {
  const f = await fixture(); await f.configure()
  const completed = await f.generate()
  let received!: () => void; const started = new Promise<void>(resolve => { received = resolve })
  f.setRespond(() => { received() })
  const pending = expect(f.generate()).rejects.toThrow('已停止')
  await started; expect((await f.call('configure', { expectedRevision: 1, selection: null })).status).toBe('succeeded')
  await pending; await expect(f.images.verify(completed.source)).rejects.toThrow('来源已改变')
  expect(f.requests).toHaveLength(2)
})
it('exposes native image inspection without Work, then uses the same real generation and publication tools', async () => {
  const f = await fixture(); await f.configure(); const artifacts: any[] = []
  const t = await task(f, { onArtifact: async artifact => { artifacts.push(artifact) } })
  let claims = 0
  t.ctx.ensureNativeWork = async () => { claims++; t.ctx.work = { id: 'native-image-work', ownerAgentId: 'a' } as any }
  const native = createNativeProducts(t.ctx); clean.push(() => native.dispose())
  const invoke = (name: string, input: unknown) => native.tools.find(tool => tool.name === name)!.execute(input, `native-${name}`)
  expect(await invoke('inspect_image_generation', {})).toMatchObject({ ready: true }); expect(claims).toBe(0)
  await invoke('generate_image', { prompt: 'native picture', path: 'self:/runs/r1/native.png' }); expect(claims).toBe(1)
  await invoke('publish_artifact', { path: 'self:/runs/r1/native.png' }); expect(artifacts).toHaveLength(1)
  expect(await readFile(artifacts[0].path)).toEqual(png); expect(f.requests).toHaveLength(1)
})
it('requests the explicit file format and never mislabels returned pixels or requests transparent JPEG', async () => {
  const f = await fixture(); await f.configure(); const t = await task(f)
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/picture.webp' })).rejects.toThrow('扩展名不同')
  expect(JSON.parse(f.requests[0].body.toString()).output_format).toBe('webp')
  await expect(readFile(join(t.ctx.workspace!.runPath, 'picture.webp'))).rejects.toThrow()
  await expect(t.invoke('generate_image', { prompt: 'x', path: 'self:/runs/r1/picture.jpg', background: 'transparent' })).rejects.toThrow('JPEG 不支持透明')
  expect(f.requests).toHaveLength(1)
})
