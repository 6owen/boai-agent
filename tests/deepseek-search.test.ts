/*
 * [INPUT]: Official Search/Fetch contracts, real SQLite SourceService and controlled HTTP on loopback.
 * [OUTPUT]: Wire authentication, fixed read-only tools, Unicode limits, honest empty/error/bounded results and in-flight revocation/cancellation.
 * [POS]: Deterministic provider/host checks; no external account or model certification.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webSearchProvider, type DataSourceConfig, type SourceTool } from '../packages/shared/src/domain/sources'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn() })
const config: DataSourceConfig = { name: 'DeepSeek search', description: '', guide: '', enabled: true, type: 'api', api: { baseUrl: 'https://api.deepseek.com', authType: 'bearer', testPath: '/' } }
const page = { rerank_score: 2.4, title: 'Official page', url: 'https://docs.python.org/3/library/pathlib.html', snippet: 'Short summary', summary: 'Long summary', content: '', site_name: null, site_icon: null, date: null, authority: 3 }
async function fixture(respond: (path: string, args: Record<string, unknown>) => Promise<{ status?: number; body: unknown }> = async path => ({ body: path.endsWith('/search') ? { results: [page] } : { title: 'Page', content: 'Actual Markdown' } })) {
  const root = await mkdtemp(join(tmpdir(), 'boai-deepseek-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const calls: { path: string; method?: string; auth?: string; contentType?: string; args: Record<string, unknown> }[] = []
  const server = createServer((req, res) => { void (async () => {
    let text = ''; for await (const part of req) text += part.toString()
    const call = { path: req.url!, method: req.method, auth: req.headers.authorization, contentType: req.headers['content-type'], args: text ? JSON.parse(text) : {} }; calls.push(call)
    const result = await respond(call.path, call.args); res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result.body))
  })().catch(() => { res.writeHead(500); res.end('{}') }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const original = globalThis.fetch, port = (server.address() as { port: number }).port
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input)); if (url.origin !== 'https://api.deepseek.com') throw new Error('Unexpected provider')
    return original(`http://127.0.0.1:${port}${url.pathname}`, init)
  }); cleanups.push(async () => { fetch.mockRestore() })
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), createService = () => new SourceService(store, { get: async id => vault.get(id), set: async (id, value) => { vault.set(id, value) }, delete: async id => { vault.delete(id) } }, root, { critical: action => action(), install() {}, changed: async () => {} })
  const service = createService()
  await service.init(); cleanups.push(() => service.close())
  const source = await service.save({ id: randomUUID(), expectedRevision: 0, config, credential: 'synthetic-source-secret' }), ref = service.summaries([source.id])[0]
  const before = vi.fn(async (_mutating: boolean, _tool: SourceTool) => {}), signal = new AbortController()
  const call = (tool: string, args: Record<string, unknown>) => service.use(ref, 'test-run', signal.signal, { sourceId: source.id, tool, arguments: args }, before, 'web-read')
  return { root, service, createService, store, source, ref, signal, call, calls, before }
}
it.each(['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/v1/tools/'])('recognizes the official API base %s without widening other API authority', baseUrl => {
  expect(webSearchProvider({ ...config, api: { ...config.api, baseUrl } })).toBe('deepseek')
})
it.each(['http://api.deepseek.com', 'https://api.deepseek.com.evil.test', 'https://api.deepseek.com:444', 'https://api.deepseek.com/v1/tools/search', 'https://api.deepseek.com?key=secret', 'https://user@api.deepseek.com', 'https://api.deepseek.com/#x'])('does not confer search authority on %s', baseUrl => {
  expect(webSearchProvider({ ...config, api: { ...config.api, baseUrl } })).toBeUndefined()
})
it('uses only two fixed authenticated POST tools and preserves URLs and employee read-only authorization', async () => {
  const f = await fixture()
  const catalog = await f.service.use(f.ref, 'test-run', f.signal.signal, undefined, undefined, 'web-read') as { tools: SourceTool[] }
  expect(catalog.tools.map(tool => [tool.name, tool.readOnly, tool.webCapability?.provider])).toEqual([['deepseek_search', true, 'deepseek'], ['deepseek_fetch', true, 'deepseek']]); expect(f.calls).toEqual([])
  expect(catalog.tools[0].inputSchema.properties).toMatchObject({ query: { maxLength: 128 } })
  const query = '🌐'.repeat(128)
  expect(await f.call('deepseek_search', { query, count: 1, ori_question: null })).toMatchObject({ results: [page], truncated: false })
  expect(await f.call('deepseek_fetch', { url: page.url })).toEqual({ url: page.url, title: 'Page', content: 'Actual Markdown', characters: 15, truncated: false })
  expect(f.calls).toEqual([
    { path: '/v1/tools/search', method: 'POST', auth: 'Bearer synthetic-source-secret', contentType: 'application/json', args: { query, count: 1, ori_question: null } },
    { path: '/v1/tools/fetch', method: 'POST', auth: 'Bearer synthetic-source-secret', contentType: 'application/json', args: { url: page.url } },
  ]); expect(f.before.mock.calls.map(call => call[0])).toEqual([false, false])
  await expect(f.call('request', { path: '/anything', method: 'POST' })).rejects.toThrow('未核准')
})
it('rejects invalid queries, unknown raw-body overrides and non-web credentials/URLs before any HTTP', async () => {
  const f = await fixture()
  for (const args of [{ query: ' ' }, { query: '🌐'.repeat(129) }, { query: 'test', count: 51 }, { query: 'test', count: 1.5 }, { query: 'test', _rawBody: '{}' }]) await expect(f.call('deepseek_search', args)).rejects.toThrow()
  for (const url of ['file:///etc/hosts', 'https://user:pass@example.com', 'https://']) await expect(f.call('deepseek_fetch', { url })).rejects.toThrow()
  expect(f.calls).toEqual([])
})
it('keeps zero results successful but rejects missing sources, provider error envelopes and blank fetch bodies', async () => {
  let body: unknown = { results: [] }; const f = await fixture(async () => ({ body }))
  expect(await f.call('deepseek_search', { query: 'no matches' })).toMatchObject({ results: [], returnedResults: 0 })
  body = { results: [{ ...page, url: 'file:///etc/hosts' }] }; await expect(f.call('deepseek_search', { query: 'a' })).rejects.toThrow('来源')
  body = { error: { message: 'synthetic-source-secret' } }; await expect(f.call('deepseek_search', { query: 'a' })).rejects.toThrow('格式')
  body = { title: '', content: ' ' }; await expect(f.call('deepseek_fetch', { url: page.url })).rejects.toThrow('正文')
})
it.each([401, 402, 403, 404, 429, 500, 504])('reports HTTP %s without leaking keys or retrying', async status => {
  const f = await fixture(async () => ({ status, body: { error: { message: 'synthetic-source-secret' } } }))
  await expect(f.call('deepseek_fetch', { url: page.url })).rejects.toThrow(`HTTP ${status}`)
  expect(f.calls).toHaveLength(1)
})
it('bounds text as structured excerpts retaining sources and redacts credentials', async () => {
  const f = await fixture(async path => ({ body: path.endsWith('/fetch') ? { title: '', content: 'synthetic-source-secret' + 'X'.repeat(60000) } : { results: Array.from({ length: 50 }, () => ({ ...page, content: 'X'.repeat(20000) })) } }))
  const fetched = await f.call('deepseek_fetch', { url: page.url }); expect(fetched).toMatchObject({ url: page.url, truncated: true, characters: 60023 }); expect(JSON.stringify(fetched)).not.toContain('synthetic-source-secret')
  const result = await f.call('deepseek_search', { query: 'a', count: 50, need_content: true }) as { results: { url: string }[]; truncated: boolean; returnedResults: number }
  expect(result.truncated).toBe(true); expect(result.returnedResults).toBe(50); expect(result.results.length).toBeGreaterThan(0); expect(result.results.length).toBeLessThan(50); expect(result.results.every(item => item.url === page.url)).toBe(true); expect(JSON.stringify(result).length).toBeLessThan(128000)
})
it('tests via one explicit search, with no hidden GET or startup request', async () => {
  const f = await fixture(); expect(f.calls).toEqual([])
  const result = await f.service.test({ id: f.source.id, expectedRevision: f.source.revision })
  expect(result.test).toMatchObject({ status: 'success', message: expect.stringContaining('一次测试查询') })
  expect(f.calls.map(call => [call.path, call.args])).toEqual([['/v1/tools/search', { query: 'DeepSeek', count: 1 }]])
})
it.each(['cancel', 'disable', 'credential'] as const)('rejects late results after %s and does not replay on reopening', async mode => {
  let release!: () => void, received!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { received = resolve })
  const f = await fixture(async () => { received(); await gate; return { body: { results: [page] } } })
  const call = f.call('deepseek_search', { query: 'a' }); const failure = expect(call).rejects.toThrow()
  await entered
  if (mode === 'cancel') f.signal.abort()
  else await f.service.save({ id: f.source.id, expectedRevision: f.source.revision, config: { ...config, enabled: mode !== 'disable' }, ...(mode === 'credential' ? { credential: 'new-secret' } : {}) })
  release(); await failure; await f.service.closeRun('test-run')
  expect(f.calls).toHaveLength(1)
  expect(await f.store.load('workItems')).toEqual([])
  await f.service.close(); const reopened = f.createService(); cleanups.push(() => reopened.close()); await reopened.init(); expect(reopened.list()).toHaveLength(1); expect(f.calls).toHaveLength(1)
})

it('applies a requested excerpt limit locally without changing the upstream Fetch body', async () => {
  const f = await fixture()
  expect(await f.call('deepseek_fetch', { url: page.url, maxCharacters: 6 })).toEqual({ url: page.url, title: 'Page', content: 'Actual', characters: 15, truncated: true })
  expect(f.calls[0].args).toEqual({ url: page.url })
  await expect(f.call('deepseek_fetch', { url: page.url, maxCharacters: 48001 })).rejects.toThrow()
  expect(f.calls).toHaveLength(1)
})

it('retains generic API operations and a configured GET test path without promoting them to web-read', async () => {
  const f = await fixture(async () => ({ body: { models: ['fixture'] } }))
  const source = await f.service.save({ id: f.source.id, expectedRevision: f.source.revision, config: { ...config, api: { ...config.api, testPath: '/v1/models' } } })
  const ref = f.service.summaries([source.id])[0]
  const catalog = await f.service.use(ref, 'generic', f.signal.signal) as { tools: SourceTool[] }
  expect(catalog.tools.map(tool => tool.name)).toContain('request')
  await expect(f.service.use(ref, 'generic', f.signal.signal, { sourceId: source.id, tool: 'request', arguments: { path: '/v1/models' } }, undefined, 'web-read')).rejects.toThrow('未核准')
  await expect(f.service.use(ref, 'generic', f.signal.signal, { sourceId: source.id, tool: 'request', arguments: { path: '/v1/test', method: 'POST' } }, async mutating => { expect(mutating).toBe(true); throw new Error('write denied') })).rejects.toThrow('write denied')
  expect(f.calls).toEqual([])
  const result = await f.service.test({ id: source.id, expectedRevision: source.revision })
  expect(result.test).toMatchObject({ status: 'success', message: '测试端点请求成功' })
  expect(f.calls.map(call => [call.method, call.path])).toEqual([['GET', '/v1/models']])
})
