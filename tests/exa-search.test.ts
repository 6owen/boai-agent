/*
 * [INPUT]: Captured official Exa 3.5.0 catalog/results, isolated source service and optional explicit live probe.
 * [OUTPUT]: Endpoint/schema/result failures, Markdown excerpt boundaries, real MCP read-only enforcement and closed leases; live calls are separately opt-in and counted.
 * [POS]: Web Search provider compatibility; no autonomous model or native-CLI quality claim.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { SourceService } from '../src/runtime/modules/sources/source-service'
import { verifiedWebCapability, assertWebSearchResult } from '../src/runtime/modules/sources/web-search-profile'
import { webSearchProvider, type DataSource } from '../src/shared/domain/sources'
import { webSearchServer } from './fixtures/web-search-server'

const catalog = JSON.parse(readFileSync(new URL('./fixtures/exa-catalog.json', import.meta.url), 'utf8'))
const results = JSON.parse(readFileSync(new URL('./fixtures/exa-results.json', import.meta.url), 'utf8'))
const config = { name: 'Exa search', description: 'Official keyless MCP', guide: '', enabled: true, type: 'mcp' as const, mcp: { transport: 'http' as const, url: 'https://mcp.exa.ai/mcp', authType: 'none' as const } }
const source: DataSource = { ...config, id: randomUUID(), revision: 1, createdAt: '', updatedAt: '', hasCredential: false }
const capability = (name: string) => verifiedWebCapability(source, catalog.serverInfo, catalog.catalog.tools.find((tool: { name: string }) => tool.name === name))!
const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })

it('recognizes only the captured official search and fetch contract, not other tools or schema changes', () => {
  expect(webSearchProvider(source)).toBe('exa')
  expect(capability('web_search_exa')).toMatchObject({ provider: 'exa', kind: 'search', serverVersion: '3.5.0' })
  expect(capability('web_fetch_exa')).toMatchObject({ provider: 'exa', kind: 'read-url' })
  const tool = catalog.catalog.tools[0]
  expect(verifiedWebCapability(source, { name: 'tavily-mcp', version: '3.5.0' }, tool)).toBeUndefined()
  expect(verifiedWebCapability(source, { name: 'exa-search-server', version: '3.6.0' }, tool)).toBeUndefined()
  expect(verifiedWebCapability(source, catalog.serverInfo, { ...tool, name: 'agent_run' })).toBeUndefined()
  expect(verifiedWebCapability(source, catalog.serverInfo, { ...tool, inputSchema: { ...tool.inputSchema, required: ['query'] } })).toBeUndefined()
  for (const url of ['http://mcp.exa.ai/mcp', 'https://mcp.exa.ai.evil.test/mcp', 'https://mcp.exa.ai:444/mcp', 'https://mcp.exa.ai/other', 'https://mcp.exa.ai/mcp?tools=agent_run', 'https://key@mcp.exa.ai/mcp', 'https://mcp.exa.ai/mcp#other']) expect(webSearchProvider({ ...config, mcp: { ...config.mcp, url } })).toBeUndefined()
})

it('accepts observed bounded content but rejects empty body, quota/error text, invalid URLs and partial fetch errors', () => {
  const search = capability('web_search_exa'), read = capability('web_fetch_exa'), text = (text: string) => ({ content: [{ type: 'text', text }] })
  expect(() => assertWebSearchResult(search, results.search)).not.toThrow()
  expect(() => assertWebSearchResult(read, results.fetch)).not.toThrow()
  expect(() => assertWebSearchResult(read, text('# One\nURL: https://example.com\n\nFirst body\n\n# Two\nURL: https://other.example\n\nSecond body'))).not.toThrow()
  expect(() => assertWebSearchResult(read, text('# One\nURL: https://example.com\n\nFirst body\n\n# Two\nURL: javascript:bad\n\nSecond body'))).toThrow()
  expect(() => assertWebSearchResult(search, text('No search results found. Please try a different query.'))).not.toThrow()
  for (const result of [text('quota exceeded'), { ...results.search, isError: true }, text('Title: Document\nURL: javascript:alert(1)\nPublished: N/A\nAuthor: N/A')]) expect(() => assertWebSearchResult(search, result)).toThrow()
  for (const value of ['No content found for the provided URL(s).', '# Document\nURL: https://example.com\n\n', '# Document\nURL: javascript:alert(1)\n\nBody', '# Document\nURL: https://example.com\n\nBody\n\nError fetching https://other.example: not_found']) expect(() => assertWebSearchResult(read, text(value))).toThrow()
})

it('keeps Markdown separators inside a search excerpt while checking every following result URL', () => {
  const search = capability('web_search_exa')
  const page = (url: string) => `Title: Public documentation\nURL: ${url}\nPublished: N/A\nAuthor: N/A\nHighlights:\nIntroduction\n\n---\n\nFurther public text`
  const result = (text: string) => ({ content: [{ type: 'text', text }] })
  expect(() => assertWebSearchResult(search, result(page('https://example.com/one')))).not.toThrow()
  expect(() => assertWebSearchResult(search, result(page('https://example.com/one') + '\n\n---\n\n' + page('https://example.com/two')))).not.toThrow()
  expect(() => assertWebSearchResult(search, result(page('https://example.com/one') + '\n\n---\n\n' + page('javascript:bad')))).toThrow('来源')
})

async function exercise(live: boolean) {
  const requests: { name: string; arguments: Record<string, unknown> }[] = []
  if (live) {
    const original = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== 'https://mcp.exa.ai') throw new Error('Unexpected live probe destination')
      if (typeof init?.body === 'string') { const body = JSON.parse(init.body); if (body.method === 'tools/call') requests.push(body.params) }
      return original(input, init)
    }); cleanup.push(() => spy.mockRestore())
  } else {
    const server = await webSearchServer(async (name, args) => { requests.push({ name, arguments: args }); return name === 'web_search_exa' ? results.search : results.fetch }, 'exa')
    cleanup.push(() => server.close())
  }
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-exa-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'data.sqlite')); await store.init(); cleanup.push(() => store.close())
  const service = new SourceService(store, { get: async () => '', set: async () => {}, delete: async () => {} }, root, { critical: async action => action(), install: () => {}, changed: async () => {} }); await service.init(); cleanup.push(() => service.close())
  const saved = await service.save({ id: randomUUID(), expectedRevision: 0, config }), ref = service.summaries([saved.id])[0]
  expect(ref.webSearchProvider).toBe('exa')
  expect(service.normalizeSearchPreference({ mode: 'source', sourceId: saved.id }, undefined, [saved.id])).toEqual({ mode: 'source', sourceId: saved.id })
  expect(() => service.normalizeSearchPreference({ mode: 'source', sourceId: saved.id }, undefined, [])).toThrow('当前员工可用')
  const signal = AbortSignal.timeout(45000), runId = randomUUID(), before = vi.fn(async (_mutating: boolean) => {})
  const inspect = await service.use(ref, runId, signal, undefined, undefined, 'web-read') as { tools: { name: string }[] }
  expect(inspect.tools.map(tool => tool.name)).toEqual(['web_search_exa', 'web_fetch_exa'])
  await expect(service.use(ref, runId, signal, { sourceId: ref.id, tool: 'agent_run', arguments: {} }, before, 'web-read')).rejects.toThrow('不提供此工具')
  expect(requests).toEqual([])
  const search = await service.use(ref, runId, signal, { sourceId: ref.id, tool: 'web_search_exa', arguments: { query: 'Official Python documentation pathlib Path objects', objective: 'Find the official docs.python.org pathlib reference, not third-party tutorials.', numResults: 1 } }, before, 'web-read') as { content: { type: string; text?: string }[] }
  const url = search.content.find(row => row.type === 'text')?.text?.match(/^URL: (https:\/\/docs\.python\.org\/[^\s]+)$/m)?.[1]
  expect(url).toBeTruthy()
  const body = await service.use(ref, runId, signal, { sourceId: ref.id, tool: 'web_fetch_exa', arguments: { urls: [url!], maxCharacters: 3000 } }, before, 'web-read')
  expect(JSON.stringify(body)).toContain('pathlib'); expect(before.mock.calls.map(([mutating]) => mutating)).toEqual([false, false])
  expect(requests.map(row => row.name)).toEqual(['web_search_exa', 'web_fetch_exa'])
  await service.closeRun(runId); expect(service.busy).toBe(false)
  if (process.env.BOAI_REVIEW_RUN_DIR) {
    const target = join(process.env.BOAI_REVIEW_RUN_DIR, 'exa'); await mkdir(target, { recursive: true })
    await writeFile(join(target, live ? 'live.json' : 'fixture.json'), JSON.stringify({ recordedAt: new Date().toISOString(), mode: live ? 'actual-official-mcp-through-source-service' : 'controlled-http-replay', source: saved, ref, inspect, requests, search, body, url, mutating: before.mock.calls.map(([value]) => value), leaseClosed: true, externalBusinessCalls: live ? requests.length : 0, modelCalls: 0 }, null, 2))
  }
}
it('uses the existing source service and real MCP transport without exposing research or writes', () => exercise(false))
it.skipIf(process.env.BOAI_LIVE_EXA !== '1')('searches and reads the actual official keyless Exa service through the production source path', () => exercise(true), 60000)
