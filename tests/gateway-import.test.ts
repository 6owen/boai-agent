/*
 * [INPUT]: Untrusted import links, actual SQLite transactions, OS startup queue and isolated AppService.
 * [OUTPUT]: No-save-before-confirmation, conflict/rollback/idempotency/restart receipts and private host delivery coverage.
 * [POS]: Gateway import boundary tests; no user configuration, OS association or model calls are used.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing coverage.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseGatewayImport, gatewayImportUrl, GATEWAY_IMPORT_LIMIT, type GatewayImportPayload } from '../src/shared/domain/gateway-import'
import { GatewayImports } from '../src/runtime/modules/backends/gateway-imports'
import { GatewayImportInbox } from '../src/main/gateway-import-inbox'
import { isPublicMethod } from '../src/main/public-methods'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { AppService } from '../src/runtime/service'
import type { Connection, Snapshot } from '../src/shared/domain'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const fn of cleanup.splice(0).reverse()) await fn() })
const payload: GatewayImportPayload = { version: 1, kind: 'magpie', name: 'Magpie 测试', baseUrl: 'http://127.0.0.1:3425/proxy', protocol: 'responses', modelId: 'provider/family/model' }
const link = (changes: Partial<GatewayImportPayload> = {}) => gatewayImportUrl({ ...payload, ...changes })
const delivery = (url = link()) => ({ eventId: randomUUID(), url })
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'boai-gateway-import-'))
  cleanup.push(() => rm(path, { recursive: true, force: true }))
  let store = new ProductStore(join(path, 'product.sqlite')); await store.init()
  cleanup.push(() => store.close())
  return { path, store, imports: new GatewayImports(store), restart: async () => { await store.close(); store = new ProductStore(join(path, 'product.sqlite')); await store.init(); return new GatewayImports(store) } }
}

test('versioned URLs preserve exact IDs and reject secrets, remote sources, ambiguous fields and executable payloads', () => {
  expect(parseGatewayImport(link())).toEqual(payload)
  expect(parseGatewayImport(link({ baseUrl: 'http://[::1]:3425/', protocol: 'messages' }))).toMatchObject({ baseUrl: 'http://[::1]:3425', protocol: 'messages' })
  for (const url of [link() + '&key=private-secret', link() + '&requestId=forged', link() + '&path=/etc/passwd', link() + '&command=echo', link() + '&model=other', link() + '#fragment', link().replace('version=1', 'version=2'), link().replace('provider=magpie', 'provider=other'), link({ baseUrl: 'https://remote.test' }), link({ baseUrl: 'http://name:secret@localhost:3425' }), link({ modelId: 'x\nsecret' }), link().replace('boai://provider', 'boai://user@provider'), link() + '&broken=%QQ', 'x'.repeat(8193)]) {
    expect(() => parseGatewayImport(url)).toThrow('无法导入')
    try { parseGatewayImport(url) } catch (error) { expect(String(error)).not.toContain('private-secret') }
  }
  expect(parseGatewayImport(link() + '&key=magpie-boai')).toEqual(payload)
  expect(isPublicMethod('__receiveGatewayImport')).toBe(false)
  expect(isPublicMethod('confirmGatewayImport')).toBe(true)
})

test('OS links coalesce into a draft, cancel creates no connection and a new explicit delivery can reopen', async () => {
  const f = await fixture(), event = delivery()
  const drafts = await Promise.all([f.imports.receive(event), f.imports.receive(delivery())])
  expect(drafts[0].id).toBe(drafts[1].id)
  expect(await f.imports.list()).toHaveLength(1)
  expect(await f.store.load('connections')).toEqual([])
  await f.imports.cancel(drafts[0].id)
  expect(await f.imports.list()).toEqual([])
  expect((await f.imports.receive(event)).status).toBe('cancelled')
  const next = await f.imports.receive(delivery())
  expect(next.id).not.toBe(drafts[0].id)
  expect(await f.store.load('connections')).toEqual([])
  await expect(f.imports.receive({ ...event, url: link({ modelId: 'other' }) })).rejects.toThrow('身份')
})

test('a confirmation commits one connection with its receipt; lost replies and restarts cannot duplicate or resurrect it', async () => {
  const f = await fixture(), draft = await f.imports.receive(delivery())
  const input = { draftId: draft.id, requestId: randomUUID() }
  const [first, second] = await Promise.all([f.imports.confirm(input), f.imports.confirm(input)])
  expect(second).toEqual(first); expect(first.connection).toMatchObject({ defaultModel: payload.modelId, revision: 1, hasApiKey: false, api: 'responses', gateway: { auth: 'local' } })
  expect(await f.store.load('connections')).toHaveLength(1)
  expect((await f.imports.receive(delivery())).status).toBe('committed')
  await expect(f.imports.cancel(draft.id)).rejects.toThrow('已保存')
  await expect(f.imports.confirm({ ...input, target: { id: 'different', revision: 1 } })).rejects.toThrow('不一致')
  const restarted = await f.restart()
  expect(await restarted.receipt(input.requestId)).toEqual(first)
  expect(await restarted.confirm(input)).toEqual(first)
  expect(await restarted.list()).toEqual([])
})

test('conflict review requires the exact source/revision; updates do not replace another source or silently choose a model', async () => {
  const f = await fixture(), initial = await f.imports.receive(delivery())
  const original = (await f.imports.confirm({ draftId: initial.id, requestId: randomUUID() })).connection
  const draft = await f.imports.receive(delivery(link({ protocol: 'messages', modelId: 'group/work' })))
  expect((await f.imports.list())[0].matches).toEqual([original])
  const input = { draftId: draft.id, requestId: randomUUID(), target: { id: original.id, revision: original.revision! } }
  await f.store.write([{ collection: 'connections', id: original.id, value: { ...original, revision: 2, name: 'Edited elsewhere' } }])
  await expect(f.imports.confirm(input)).rejects.toThrow('已变化')
  expect(await f.imports.receipt(input.requestId)).toBeNull()
  const saved = await f.imports.confirm({ ...input, target: { ...input.target, revision: 2 } })
  expect(saved).toMatchObject({ outcome: 'updated', connection: { id: original.id, revision: 3, defaultModel: 'group/work', provider: 'anthropic' } })
  expect(saved.connection.api).toBeUndefined()
  const other = await f.imports.receive(delivery(link({ baseUrl: 'http://localhost:9999' })))
  await expect(f.imports.confirm({ draftId: other.id, requestId: randomUUID(), target: { id: original.id, revision: 3 } })).rejects.toThrow('同一本机')
})

test('connection and receipt roll back together when persistence fails after the connection write', async () => {
  const f = await fixture(), draft = await f.imports.receive(delivery())
  const input = { draftId: draft.id, requestId: randomUUID() }, transaction = f.store.transaction.bind(f.store)
  const spy = vi.spyOn(f.store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: record => {
    if (record.collection === 'gatewayImportReceipts') throw new Error('injected disk failure')
    return tx.put(record)
  } })))
  await expect(f.imports.confirm(input)).rejects.toThrow('disk failure'); spy.mockRestore()
  expect(await f.store.load('connections')).toEqual([])
  expect(await f.imports.receipt(input.requestId)).toBeNull()
  expect((await f.imports.list())[0].draft.status).toBe('pending')
  expect((await f.imports.confirm(input)).outcome).toBe('created')
})

test('pending drafts are bounded and persisted across runtime restart', async () => {
  const f = await fixture()
  for (let i = 0; i < GATEWAY_IMPORT_LIMIT; i++) await f.imports.receive(delivery(link({ modelId: `model/${i}` })))
  await expect(f.imports.receive(delivery(link({ modelId: 'overflow' })))).rejects.toThrow('过多')
  const before = await f.imports.list(), restarted = await f.restart()
  expect(await restarted.list()).toEqual(before)
})

test('cold startup queues without delivery, coalesces in-flight events and reports failure once without replay', async () => {
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve }), sent: string[] = [], errors: string[] = []
  const inbox = new GatewayImportInbox(async input => { sent.push(input.url); await waiting; if (sent.length === 1) throw new Error('unknown') }, error => errors.push(error))
  inbox.receive(link()); inbox.receive(link())
  expect(sent).toEqual([])
  const running = inbox.start(); expect(sent).toHaveLength(1)
  inbox.receive(link()); inbox.receive(link({ modelId: 'second' })); release(); await running
  expect(sent).toHaveLength(2); expect(errors).toHaveLength(1)
  await inbox.start(); expect(sent).toHaveLength(2)
  inbox.receive(link() + '&key=secret'); expect(errors).toHaveLength(2); expect(sent).toHaveLength(2)
})

test('AppService installs imports without models or credentials; old receipt replay never reinstalls a deleted connection', async () => {
  const path = await mkdtemp(join(tmpdir(), 'boai-import-service-')); cleanup.push(() => rm(path, { recursive: true, force: true }))
  const model = vi.fn(async () => { throw new Error('unexpected model') }), secrets = { get: vi.fn(async (_id: string) => undefined), set: vi.fn(async () => {}), delete: vi.fn(async () => {}) }
  const service = new AppService({ dataPath: path, engine: { run: model, test: model }, secrets, emit: () => {} })
  await service.init(); cleanup.push(() => service.close()); secrets.get.mockClear()
  const draft = await service.receiveGatewayImport(delivery()), input = { draftId: draft.id, requestId: randomUUID() }
  expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
  const saved = await service.handle('confirmGatewayImport', input) as { connection: Connection }
  expect(model).not.toHaveBeenCalled(); expect(secrets.set).not.toHaveBeenCalled(); expect(secrets.get).not.toHaveBeenCalled()
  expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([saved.connection])
  expect(secrets.get.mock.calls.map(call => call[0])).toEqual([saved.connection.id])
  await service.handle('deleteConnection', { id: saved.connection.id })
  await service.handle('confirmGatewayImport', input)
  expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
  expect((await service.receiveGatewayImport(delivery())).status).toBe('pending')
})
