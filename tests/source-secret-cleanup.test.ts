/*
 * [INPUT]: Original SourceService/ProductStore, isolated SecretStore faults and controlled OAuth start boundary.
 * [OUTPUT]: Durable staged/retired credential cleanup survives failures and restart; queued management revalidates authority without tying browser consent to a completed run.
 * [POS]: WT2 source secret/authority integration; no external provider, personal secrets, GUI or model calls.
 * [PROTOCOL]: Changes must update this Header and tests/.folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import type { DataSourceConfig, SourcePackageOrigin } from '../packages/shared/src/domain/sources'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const origin: SourcePackageOrigin = { installationId: 'package-a', contributionId: 'source-a', version: 'a'.repeat(64) }
const config: DataSourceConfig = { name: 'Cleanup fixture', description: '', guide: '', enabled: true, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:9/mcp', authType: 'bearer' } }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-source-secret-cleanup-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'sources.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), deleted: string[] = []
  let rejectDelete: (key: string) => boolean = () => false
  const secrets = {
    get: async (key: string) => vault.get(key),
    set: async (key: string, value: string) => { vault.set(key, value) },
    delete: async (key: string) => { deleted.push(key); if (rejectDelete(key)) throw new Error('private-vault-error-do-not-expose'); vault.delete(key) },
  }
  let authority: { validate(): Promise<void>; signal: AbortSignal } | undefined
  const hooks = { authority: () => authority, critical: <T,>(action: () => Promise<T>): Promise<T> => action(), install: () => {}, changed: async () => {} }
  const create = async () => {
    const source = new SourceService(store, secrets, root, hooks)
    await source.init(); cleanups.push(() => source.close()); return source
  }
  const source = await create()
  const save = (credential = 'old-private-secret', identity = origin) => source.saveManaged({ id: randomUUID(), expectedRevision: 0, config, credential }, identity)
  const journal = () => store.load<{ id: string; sourceId: string; credentialId?: string; packageOrigin?: SourcePackageOrigin }>('sourceSecretCleanup')
  return { root, store, vault, deleted, secrets, hooks, source, create, save, journal, setAuthority: (value: typeof authority) => { authority = value }, fail: (predicate: (key: string) => boolean) => { rejectDelete = predicate } }
}

it('keeps the deleted source secret identity until its exact package cleanup actually succeeds', async () => {
  const f = await fixture(), source = await f.save(), other = await f.save('other-private-secret', { ...origin, contributionId: 'source-b' })
  const secretKey = [...f.vault].find(([, value]) => value === 'old-private-secret')![0]
  f.fail(key => key === secretKey)
  await expect(f.source.removeManaged({ id: source.id, expectedRevision: source.revision }, origin)).rejects.toThrow('清理尚未完成')
  expect(f.source.list().map(value => value.id)).toEqual([other.id])
  expect(await f.store.get('dataSources', source.id)).toBeUndefined()
  expect(await f.journal()).toMatchObject([{ sourceId: source.id, credentialId: secretKey, packageOrigin: origin }])
  expect(JSON.stringify(await f.journal())).not.toMatch(/old-private-secret|other-private-secret|private-vault-error/)
  await f.source.reconcileManagedCleanup({ ...origin, version: 'b'.repeat(64) })
  expect(f.vault.has(secretKey)).toBe(true)
  await expect(f.source.reconcileManagedCleanup(origin)).rejects.toThrow('清理尚未完成')
  expect(await f.journal()).toHaveLength(1)
  f.fail(() => false)
  await f.source.reconcileManagedCleanup(origin)
  expect(await f.journal()).toEqual([]); expect(f.vault.has(secretKey)).toBe(false)
  expect([...f.vault.values()]).toEqual(['other-private-secret'])
})

it('does not recover a committed configuration receipt while the rotated old credential remains', async () => {
  const f = await fixture(), source = await f.save(), requestId = randomUUID()
  const oldKey = [...f.vault.keys()][0]
  f.fail(key => key === oldKey)
  await expect(f.source.saveManaged({ id: source.id, expectedRevision: source.revision, config, credential: 'new-private-secret' }, origin, requestId)).rejects.toThrow('清理尚未完成')
  expect(f.source.get(source.id)).toMatchObject({ revision: 2, hasCredential: false })
  expect(await f.source.getCredential({ id: source.id, expectedRevision: 2 })).toBe('new-private-secret')
  await expect(f.source.managedSaveReceipt(requestId)).rejects.toThrow('清理尚未完成')
  await expect(f.source.use(f.source.summaries([source.id], 'employee')[0] ?? { id: source.id, name: source.name, type: source.type, revision: 2, description: '' }, 'blocked', AbortSignal.timeout(1000))).rejects.toThrow('清理尚未完成')
  expect(await f.journal()).toHaveLength(1)
  f.fail(() => false)
  expect(await f.source.managedSaveReceipt(requestId)).toMatchObject({ id: source.id, revision: 2 })
  expect(f.source.get(source.id).hasCredential).toBe(true)
  expect([...f.vault.values()]).toEqual(['new-private-secret']); expect(await f.journal()).toEqual([])
})

it('startup isolates failed source cleanup and leaves unrelated local sources usable until recovery', async () => {
  const f = await fixture(), source = await f.save()
  const file = join(f.root, 'untouched.txt'); await writeFile(file, 'independent source remains usable')
  const local = await f.source.save({ id: randomUUID(), expectedRevision: 0, config: { name: 'Other local', description: '', guide: '', enabled: true, type: 'local', local: { path: f.root } } })
  const oldKey = [...f.vault.keys()][0]
  f.fail(key => key === oldKey)
  await expect(f.source.saveManaged({ id: source.id, expectedRevision: source.revision, config, credential: 'new-private-secret' }, origin)).rejects.toThrow('清理尚未完成')
  await f.source.close()
  const restored = await f.create()
  expect(restored.get(source.id)).toMatchObject({ revision: 2, hasCredential: false })
  expect(await f.journal()).toHaveLength(1)
  const result = await restored.use(restored.summaries([local.id])[0], 'other-source', AbortSignal.timeout(1000), { sourceId: local.id, tool: 'files', arguments: { operation: 'read', path: 'untouched.txt' } })
  expect(JSON.stringify(result)).toContain('independent source remains usable')
  await expect(restored.reconcileManagedCleanup(origin)).rejects.toThrow('清理尚未完成')
  f.fail(() => false); await restored.reconcileManagedCleanup(origin)
  expect(await f.journal()).toEqual([]); expect([...f.vault.values()]).toEqual(['new-private-secret'])
})

it('a rejected source transaction creates no cleanup intent and preserves the original credential', async () => {
  const f = await fixture(), source = await f.save()
  let validations = 0
  await expect(f.source.save({ id: source.id, expectedRevision: source.revision, config, credential: 'uncommitted-private-secret' }, undefined, async () => { if (++validations === 2) throw new Error('controlled rollback') }, origin)).rejects.toThrow('controlled rollback')
  expect(f.source.get(source.id)).toMatchObject({ revision: 1, hasCredential: true })
  expect([...f.vault.values()]).toEqual(['old-private-secret']); expect(await f.journal()).toEqual([])
})

it('blocks replacement OAuth consent behind old cleanup and never deletes the subsequent new grant', async () => {
  const f = await fixture()
  const oauthConfig: DataSourceConfig = { ...config, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:9/mcp', authType: 'oauth' } }
  const source = await f.source.saveManaged({ id: randomUUID(), expectedRevision: 0, config: oauthConfig }, origin)
  // Observe the real adapter's key through a normal disconnect; the test does not duplicate its private key algorithm.
  await f.source.disconnectOAuth(source.id, source.revision)
  const key = f.deleted.find(value => value.startsWith('source-oauth:credential:'))!
  expect(key).toBeTruthy(); f.vault.set(key, 'old-oauth-private-grant')
  f.fail(value => value === key)
  await expect(f.source.saveManaged({ id: source.id, expectedRevision: source.revision, config: { ...oauthConfig, description: 'new configuration' } }, origin)).rejects.toThrow('清理尚未完成')
  const start = vi.spyOn(f.source.oauth, 'start').mockImplementation(async input => {
    expect(f.vault.has(key)).toBe(false)
    f.vault.set(key, 'new-oauth-private-grant')
    return { authorizationId: 'a'.repeat(64), sourceId: input.sourceId, revision: input.revision, status: 'authorizing', expiresAt: new Date(Date.now() + 1000).toISOString(), url: 'https://example.test/authorize' }
  })
  await expect(f.source.startOAuth(source.id, 2, 'new-consent')).rejects.toThrow('清理尚未完成')
  expect(start).not.toHaveBeenCalled(); expect(f.vault.get(key)).toBe('old-oauth-private-grant')
  f.fail(() => false)
  expect((await f.source.startOAuth(source.id, 2, 'new-consent')).status).toBe('authorizing')
  await f.source.reconcileManagedCleanup(origin)
  expect(f.vault.get(key)).toBe('new-oauth-private-grant'); expect(await f.journal()).toEqual([])
})

it('persists the staged key before SecretStore and removes that intent atomically with the committed source', async () => {
  const f = await fixture()
  vi.spyOn(f.secrets, 'set').mockImplementationOnce(async (key, value) => {
    expect(await f.journal()).toMatchObject([{ credentialId: key, packageOrigin: origin }])
    expect(JSON.stringify(await f.journal())).not.toContain(value)
    f.vault.set(key, value)
  })
  const source = await f.save()
  expect(await f.journal()).toEqual([])
  expect((await f.store.get<{ credentialId: string }>('dataSources', source.id))?.credentialId).toBe([...f.vault.keys()][0])
  expect(source.hasCredential).toBe(true)
})

it('retains a staged secret whose set response and compensating delete both fail, then cleans it after restart', async () => {
  const f = await fixture(), sourceId = randomUUID()
  vi.spyOn(f.secrets, 'set').mockImplementationOnce(async (key, value) => { f.vault.set(key, value); throw new Error('private-set-body') })
  f.fail(() => true)
  await expect(f.source.saveManaged({ id: sourceId, expectedRevision: 0, config, credential: 'staged-private-secret' }, origin, 'failed-stage')).rejects.toThrow('清理尚未完成')
  expect(await f.store.get('dataSources', sourceId)).toBeUndefined()
  expect(await f.source.managedSaveReceipt('failed-stage')).toBeUndefined()
  expect(await f.journal()).toMatchObject([{ sourceId, credentialId: [...f.vault.keys()][0] }])
  expect(JSON.stringify(await f.journal())).not.toMatch(/staged-private-secret|private-set-body/)
  await f.source.close(); const restored = await f.create()
  expect(restored.list()).toEqual([]); expect(await f.journal()).toHaveLength(1)
  f.fail(() => false); await restored.reconcileManagedCleanup(origin)
  expect(await f.journal()).toEqual([]); expect(f.vault.size).toBe(0)
})

it('preserves the original grant when precommit validation and staged-secret rollback both fail', async () => {
  const f = await fixture(), source = await f.save()
  f.fail(key => f.vault.get(key) === 'uncommitted-private-secret')
  let validations = 0
  await expect(f.source.saveManaged({ id: source.id, expectedRevision: source.revision, config, credential: 'uncommitted-private-secret' }, origin, undefined, async () => { if (++validations === 2) throw new Error('revoked before commit') })).rejects.toThrow('清理尚未完成')
  expect(f.source.get(source.id)).toMatchObject({ revision: 1, hasCredential: false })
  expect([...f.vault.values()].sort()).toEqual(['old-private-secret', 'uncommitted-private-secret'])
  expect(await f.journal()).toHaveLength(1)
  f.fail(() => false); await f.source.reconcileManagedCleanup(origin)
  expect([...f.vault.values()]).toEqual(['old-private-secret']); expect(f.source.get(source.id).hasCredential).toBe(true)
})

it('does not stage a secret if its cleanup identity cannot be recorded', async () => {
  const f = await fixture(), set = vi.spyOn(f.secrets, 'set')
  vi.spyOn(f.store, 'write').mockRejectedValueOnce(new Error('controlled journal failure'))
  await expect(f.save()).rejects.toThrow('controlled journal failure')
  expect(set).not.toHaveBeenCalled(); expect(f.vault.size).toBe(0); expect(await f.journal()).toEqual([])
})

it.each(['start', 'disconnect'] as const)('OAuth %s captures authority before queueing and rejects its later cancellation', async action => {
  const f = await fixture(), controller = new AbortController()
  const source = await f.source.save({ id: randomUUID(), expectedRevision: 0, config: { ...config, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:9/mcp', authType: 'oauth' } } })
  const start = vi.spyOn(f.source.oauth, 'start'), disconnect = vi.spyOn(f.source.oauth, 'disconnect'), cancel = vi.spyOn(f.source.oauth, 'cancelSource')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  f.hooks.critical = async callback => { await gate; return callback() }
  f.setAuthority({ signal: controller.signal, validate: async () => {} })
  const operation = action === 'start' ? f.source.startOAuth(source.id, source.revision, 'captured') : f.source.disconnectOAuth(source.id, source.revision)
  f.setAuthority(undefined); controller.abort(new Error('captured authority cancelled')); release()
  await expect(operation).rejects.toThrow('captured authority cancelled')
  expect(start).not.toHaveBeenCalled(); expect(disconnect).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled()
})

it('revalidates disconnect authority after draining and before deleting the grant', async () => {
  const f = await fixture(), controller = new AbortController()
  const source = await f.source.save({ id: randomUUID(), expectedRevision: 0, config: { ...config, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:9/mcp', authType: 'oauth' } } })
  f.setAuthority({ signal: controller.signal, validate: async () => {} })
  let criticalCalls = 0
  f.hooks.critical = async callback => { if (++criticalCalls === 2) controller.abort(new Error('revoked after drain')); return callback() }
  const disconnect = vi.spyOn(f.source.oauth, 'disconnect')
  await expect(f.source.disconnectOAuth(source.id, source.revision)).rejects.toThrow('revoked after drain')
  expect(disconnect).not.toHaveBeenCalled(); expect(f.deleted).toEqual([])
})

it('managed save rejects revoked authority before cancelling existing source work', async () => {
  const f = await fixture(), source = await f.save(), cancel = vi.spyOn(f.source.oauth, 'cancelSource')
  await expect(f.source.saveManaged({ id: source.id, expectedRevision: source.revision, config, credential: 'new-private-secret' }, origin, 'revoked-save', async () => { throw new Error('authority revoked') })).rejects.toThrow('authority revoked')
  expect(cancel).not.toHaveBeenCalled(); expect([...f.vault.values()]).toEqual(['old-private-secret'])
  expect(f.source.get(source.id).revision).toBe(1); expect(await f.journal()).toEqual([])
})

it('an accepted OAuth consent remains independent when its initiating employee run later finishes', async () => {
  const f = await fixture(), controller = new AbortController()
  const source = await f.source.save({ id: randomUUID(), expectedRevision: 0, config: { ...config, type: 'mcp', mcp: { transport: 'http', url: 'http://127.0.0.1:9/mcp', authType: 'oauth' } } })
  f.setAuthority({ signal: controller.signal, validate: async () => {} })
  let finish!: () => void, began!: () => void
  const started = new Promise<void>(resolve => { began = resolve })
  vi.spyOn(f.source.oauth, 'start').mockImplementation(async input => {
    began(); await new Promise<void>(resolve => { finish = resolve })
    return { authorizationId: 'b'.repeat(64), sourceId: input.sourceId, revision: input.revision, status: 'authorizing', expiresAt: new Date(Date.now() + 1000).toISOString(), url: 'https://example.test/authorize' }
  })
  const cancel = vi.spyOn(f.source.oauth, 'cancelSource'), operation = f.source.startOAuth(source.id, source.revision, 'accepted')
  await started; controller.abort(new Error('employee run finished')); finish()
  expect((await operation).status).toBe('authorizing'); expect(cancel).not.toHaveBeenCalled()
})
