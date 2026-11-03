/*
 * [INPUT]: Real SQLite settings writes and public host configuration requests.
 * [OUTPUT]: Persistent revision conflicts, validation, defaults and API Bobo-only settings.
 * [POS]: Owner configuration contract; no model quality claims.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { configureHistorySettings, readHistorySettings } from '../packages/runtime/src/modules/conversations/history-settings'
import { defaultHistorySettings } from '../packages/shared/src/domain/history-search'
import { AppService } from '../packages/runtime/src/service'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('keeps defaults, CAS revisions and persisted history options independent from Memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'history-settings-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const defaults = defaultHistorySettings('bobo'); expect(await readHistorySettings(store, 'bobo')).toEqual(defaults)
  const input = { agentId: 'bobo', expectedRevision: 0, settings: { mode: 'prefetch', window: { kind: 'time', beforeSeconds: 120, afterSeconds: 120 }, limit: 2, maxCharacters: 8000 } }
  expect(await configureHistorySettings(store, input)).toMatchObject({ ...input.settings, revision: 1 })
  await expect(configureHistorySettings(store, input)).rejects.toThrow('设置已变化')
  await expect(configureHistorySettings(store, { ...input, expectedRevision: 1, settings: { ...input.settings, maxCharacters: 20001 } })).rejects.toThrow()
  await store.close(); cleanup.pop()
  const reopened = new ProductStore(join(root, 'boai.sqlite')); await reopened.init(); cleanup.push(() => reopened.close())
  expect(await readHistorySettings(reopened, 'bobo')).toMatchObject({ ...input.settings, revision: 1 })
  expect(await reopened.load('employeeMemorySettings')).toEqual([])
})
it('exposes configuration only for API Bobo through the real host methods', async () => {
  const root = await mkdtemp(join(tmpdir(), 'history-settings-host-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const service = new AppService({ dataPath: root, engine: { memoryOwner: 'mastra', test: async () => 'ok', decide: async () => ({ action: 'pass', observedThroughSequence: 0 }), run: async () => {} }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  expect(await service.handle('getHistorySearchSettings', { agentId: 'bobo' })).toEqual(defaultHistorySettings('bobo'))
  await expect(service.handle('getHistorySearchSettings', { agentId: 'researcher' })).rejects.toThrow('API Bobo')
  const next = await service.handle('configureHistorySearch', { agentId: 'bobo', expectedRevision: 0, settings: { mode: 'prefetch', window: { kind: 'time', beforeSeconds: 120, afterSeconds: 120 }, limit: 2, maxCharacters: 8000 } })
  expect(next).toMatchObject({ revision: 1 })
})
