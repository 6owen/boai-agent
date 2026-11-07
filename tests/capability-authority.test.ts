/*
 * [INPUT]: Real package files/SQLite, captured employee run authority and controlled preparation barriers.
 * [OUTPUT]: Cancelled queued writes never prepare; authority loss before commit rolls back inert contributions.
 * [POS]: WT2 package authorization race checks; no model, personal profile or desktop.
 * [PROTOCOL]: Changes must update this Header and tests/.folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { CapabilityPackages } from '../packages/runtime/src/modules/resources/capability-packages'
import type { CapabilityAuthority, CapabilityPackageHost } from '../packages/runtime/src/modules/resources/capability-package-host'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const barrier = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-capability-authority-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'db.sqlite')); await store.init(); cleanups.push(() => store.close())
  let authority: CapabilityAuthority | undefined
  const host: CapabilityPackageHost = {
    authority: () => authority,
    materialize: vi.fn<CapabilityPackageHost['materialize']>(async installation => { await store.write(installation.contributions.map(value => ({ collection: 'prepared', id: value.id, value }))) }),
    retire: vi.fn<CapabilityPackageHost['retire']>(async (_installation, contributions) => { await store.transaction(async tx => { for (const item of contributions) await tx.remove('prepared', item.id) }); return [] }),
    applyBinding: async () => {}, drain: async () => {}, changed: async () => {}, assertOwnership: async () => {},
  }
  const manager = new CapabilityPackages(store, join(root, 'data'), host); await manager.init(); cleanups.push(() => manager.close())
  const request = async () => {
    const path = join(root, randomUUID()); await mkdir(join(path, 'skills', 'method'), { recursive: true })
    await writeFile(join(path, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: `method-${randomUUID()}`, version: '1.0.0' }))
    await writeFile(join(path, 'skills', 'method', 'SKILL.md'), '---\nname: method\ndescription: A controlled method.\n---\nRead the provided input.')
    const inspected = await manager.inspect(path)
    return { path, contentHash: inspected.contentHash, requestId: randomUUID() }
  }
  return { store, manager, host, request, setAuthority: (value?: CapabilityAuthority) => { authority = value } }
}

it('captures each queued caller and never prepares a write cancelled while another install runs', async () => {
  const f = await fixture(), held = barrier(), entered = barrier(), first = await f.request(), second = await f.request()
  vi.mocked(f.host.materialize).mockImplementationOnce(async () => { entered.release(); await held.promise })
  const firstCall = f.manager.install(first); await entered.promise
  const controller = new AbortController()
  f.setAuthority({ signal: controller.signal, validate: async () => {} })
  const secondCall = f.manager.install(second)
  const rejected = expect(secondCall).rejects.toThrow('caller cancelled')
  f.setAuthority(undefined); controller.abort(new Error('caller cancelled')); held.release()
  expect((await firstCall)?.status).toBe('completed'); await rejected
  expect(f.host.materialize).toHaveBeenCalledTimes(1)
  expect(await f.manager.getOperation(second.requestId)).toBeUndefined()
  expect(f.manager.list()).toHaveLength(1)
})

it.each(['signal', 'permission'] as const)('rolls back prepared objects when original %s is revoked before commit', async mode => {
  const f = await fixture(), held = barrier(), entered = barrier(), input = await f.request(), controller = new AbortController()
  let authorized = true
  f.setAuthority({ signal: controller.signal, validate: async () => { if (!authorized) throw new Error('original run no longer authorized') } })
  const materialize = f.host.materialize
  f.host.materialize = async (...args) => { await materialize(...args); entered.release(); await held.promise }
  const install = f.manager.install(input); await entered.promise
  if (mode === 'signal') controller.abort(new Error('original run cancelled')); else authorized = false
  f.setAuthority(undefined); held.release()
  expect(await install).toMatchObject({ status: 'failed', phase: 'rolled-back' })
  expect(f.manager.list()).toEqual([])
  expect(await f.store.load('prepared')).toEqual([])
  expect(f.host.retire).toHaveBeenCalledTimes(1)
})
