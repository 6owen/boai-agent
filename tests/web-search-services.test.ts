/*
 * [INPUT]: Independent search registry, legacy records, plugin settings and synthetic HTTP responses.
 * [OUTPUT]: Atomic credential-preserving migration, independent authorization/defaults and Jina wire/failure checks.
 * [POS]: Retrieval capability contracts; no external requests or model certification.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import { WebSearchService } from '../packages/runtime/src/modules/sources/web-search-service'
import { searchConnection } from '../packages/shared/src/domain/web-search'
import { openJinaSearchSession } from '../packages/runtime/src/modules/sources/jina-search'
import type { DigitalAgent } from '../packages/shared/src/domain'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const fn of cleanups.splice(0).reverse()) await fn() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-search-services-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'v2'), store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), secrets = { get: async (id: string) => vault.get(id), set: async (id: string, value: string) => { vault.set(id, value) }, delete: async (id: string) => { vault.delete(id) } }
  const changed = vi.fn(async () => {}), hooks = { critical: <T>(fn: () => Promise<T>) => fn(), install() {}, changed }
  const legacy = new SourceService(store, secrets, path, hooks); await legacy.init(); cleanups.push(() => legacy.close())
  const create = () => { const service = new WebSearchService(store, secrets, path, hooks); cleanups.push(() => service.connections.close()); return service }
  return { root, store, vault, legacy, create, changed }
}
it('moves only recognized search connections, preserving identity, key, preference and history exactly once', async () => {
  const f = await fixture()
  const source = await f.legacy.save({ id: randomUUID(), expectedRevision: 0, config: searchConnection('deepseek', 'Existing DeepSeek', true), credential: 'private-fixture-key' })
  const business = await f.legacy.save({ id: randomUUID(), expectedRevision: 0, config: { name: 'Business API', description: '', guide: '', enabled: true, type: 'api', api: { baseUrl: 'https://business.example', authType: 'none', testPath: '/' } } })
  const agent = { id: 'employee', configVersion: 3, sourceIds: [source.id, business.id], webSearch: { mode: 'source', sourceId: source.id } } as DigitalAgent
  await f.store.write([{ collection: 'agents', id: agent.id, value: agent }, { collection: 'snapshots', id: 'old-run', value: { id: 'old-run', agent, dataSourceRefs: f.legacy.allSummaries() } }])
  const missingId = randomUUID()
  await f.store.write([{ collection: 'agents', id: 'missing', value: { ...agent, id: 'missing', sourceIds: [], webSearch: { mode: 'source', sourceId: missingId } } }])
  const originalVault = [...f.vault], original = await f.store.get('dataSources', source.id)
  await f.legacy.close()
  const service = f.create(); await service.init()
  expect(await f.store.get('webSearchServices', source.id)).toEqual(original)
  expect(await f.store.get('dataSources', source.id)).toBeUndefined()
  expect(await f.store.get('dataSources', business.id)).toBeDefined()
  expect([...f.vault]).toEqual(originalVault)
  expect(await service.connections.getCredential({ id: source.id, expectedRevision: source.revision })).toBe('private-fixture-key')
  const migrated = await f.store.get<DigitalAgent>('agents', agent.id)
  const missing = await f.store.get<DigitalAgent>('agents', 'missing')
  expect(service.normalizePreference(missing!.webSearch, missing)).toEqual({ mode: 'service', serviceId: missingId })
  expect(migrated).toMatchObject({ configVersion: 4, sourceIds: [business.id], webSearch: { mode: 'service', serviceId: source.id } })
  expect(await f.store.get('snapshots', 'old-run')).toMatchObject({ dataSourceRefs: [{ id: business.id }], webSearchRefs: [{ id: source.id }], agent: { webSearch: migrated!.webSearch } })
  const businessSearchId = randomUUID()
  await f.store.write([{ collection: 'dataSources', id: businessSearchId, value: { ...source, id: businessSearchId } }])
  const again = f.create(); await again.init()
  expect(await f.store.get('dataSources', businessSearchId)).toBeDefined()
  expect(await f.store.get('agents', agent.id)).toEqual(migrated)
  expect((await again.settings()).services.map(item => item.id)).toEqual([source.id])
  expect(JSON.stringify(await again.settings())).not.toContain('private-fixture-key')
})
it('persists global defaults independently, enforces explicit allow-lists and honors plugin disable/re-enable', async () => {
  const f = await fixture(), service = f.create(); await service.init()
  const source = await service.save({ id: randomUUID(), expectedRevision: 0, provider: 'deepseek', name: 'Search', enabled: true, credential: 'fixture' })
  const agent = { id: 'a', sourceIds: [], webSearch: { mode: 'auto' } } as unknown as DigitalAgent
  expect(service.effectivePreference(agent)).toEqual({ mode: 'browser' })
  await service.saveDefault({ expectedRevision: 0, default: { mode: 'service', serviceId: source.id } })
  expect(service.effectivePreference(agent)).toEqual({ mode: 'service', serviceId: source.id })
  expect((await service.summaries(agent)).map(item => item.id)).toEqual([source.id])
  expect(await service.summaries({ ...agent, webSearch: { mode: 'auto', allowedServiceIds: [] } })).toEqual([])
  expect(await service.summaries({ ...agent, webSearch: { mode: 'disabled' } })).toEqual([])
  expect(await f.store.load('dataSources')).toEqual([])
  await expect(service.saveDefault({ expectedRevision: 0, default: { mode: 'browser' } })).rejects.toThrow('已变化')
  const ref = (await service.summaries(agent))[0]
  await writeFile(join(f.root, 'application-plugins.json'), JSON.stringify({ schemaVersion: 1, revision: 1, disabledIds: ['boai.search.deepseek'] }))
  expect((await service.settings()).services[0].pluginEnabled).toBe(false)
  expect(await service.summaries(agent)).toEqual([])
  await expect(service.use(ref, 'run', new AbortController().signal)).rejects.toThrow('停用')
  await writeFile(join(f.root, 'application-plugins.json'), JSON.stringify({ schemaVersion: 1, revision: 2, disabledIds: [] }))
  const again = f.create(); await again.init()
  expect(again.effectivePreference(agent)).toEqual({ mode: 'service', serviceId: source.id })
  expect((await again.summaries(agent)).map(item => item.id)).toEqual([source.id])
})
it('Jina uses authenticated JSON Search and Reader requests, retaining public URLs and bounded content', async () => {
  const url = 'https://example.com/article?q=中文&n=1', key = 'synthetic-private-key', page = { title: 'Page', url, content: key + 'A'.repeat(50000) }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify({ code: 200, data: String(input).startsWith('https://s.jina.ai') ? [page] : page }), { status: 200 }))
  const session = openJinaSearchSession(key), signal = new AbortController().signal
  expect(session.tools.map(tool => [tool.name, tool.readOnly, tool.webCapability?.kind])).toEqual([['jina_search', true, 'search'], ['jina_read', true, 'read-url']])
  const searched = await session.call('jina_search', { query: '中文 & query' }, signal)
  const read = await session.call('jina_read', { url }, signal)
  expect(searched).toMatchObject({ results: [{ url, truncated: true }] }); expect(read).toMatchObject({ url, truncated: true })
  expect(JSON.stringify(read)).not.toContain(key)
  expect(fetch.mock.calls[0][0]).toBe('https://s.jina.ai/?q=%E4%B8%AD%E6%96%87+%26+query')
  expect(fetch.mock.calls[1][0]).toBe('https://r.jina.ai/' + url)
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } })
  await expect(session.call('jina_read', { url: 'file:///etc/hosts' }, signal)).rejects.toThrow()
  await expect(session.call('jina_search', { query: '', method: 'DELETE' }, signal)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('Jina reports empty searches, HTTP errors and missing content honestly without retries', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch'), session = openJinaSearchSession('fixture'), signal = new AbortController().signal
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: [] })))
  expect(await session.call('jina_search', { query: 'empty' }, signal)).toMatchObject({ results: [], returnedResults: 0, truncated: false })
  fetch.mockResolvedValueOnce(new Response('private-key', { status: 429 }))
  await expect(session.call('jina_search', { query: 'limited' }, signal)).rejects.toThrow('HTTP 429')
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { url: 'https://example.com', content: ' ' } })))
  await expect(session.call('jina_read', { url: 'https://example.com' }, signal)).rejects.toThrow('正文')
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(() => openJinaSearchSession('')).toThrow('API Key')
})
it('rejects results arriving after plugin disable and keeps unrelated capabilities readable with malformed plugin settings', async () => {
  const f = await fixture(), service = f.create(); await service.init()
  const saved = await service.save({ id: randomUUID(), expectedRevision: 0, provider: 'jina', name: 'Jina', enabled: true, credential: 'fixture' })
  const agent = { id: 'a', sourceIds: [] } as unknown as DigitalAgent, ref = (await service.summaries(agent))[0]
  const pluginFile = join(f.root, 'application-plugins.json')
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    await writeFile(pluginFile, JSON.stringify({ schemaVersion: 1, revision: 1, disabledIds: ['boai.search.jina'] }))
    return new Response(JSON.stringify({ code: 200, data: [{ url: 'https://example.com', content: 'late result' }] }))
  })
  await expect(service.use(ref, 'run', new AbortController().signal, { sourceId: saved.id, tool: 'jina_search', arguments: { query: 'public' } })).rejects.toThrow('停用')
  expect(fetch).toHaveBeenCalledTimes(1)
  await writeFile(pluginFile, '{broken')
  expect(await service.summaries(agent)).toEqual([])
  expect((await service.settings()).services[0].pluginEnabled).toBe(false)
})
