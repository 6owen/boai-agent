/*
 * [INPUT]: Real AppearanceStore, ProductStore/ApplicationService and controlled host wire serialization.
 * [OUTPUT]: Current/legacy command discovery, strict action CAS, durable known rejection/unknown boundaries and independent icon/config reads.
 * [POS]: Focused backend integration; no Electron process, personal profile or model invocation.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppearanceStore } from '../apps/electron/src/main/appearance'
import { appearanceHostRequest } from '../apps/electron/src/main/appearance-host'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { appearanceOperations } from '../packages/runtime/src/modules/application/appearance-operations'
import type { ApplicationPort } from '../packages/runtime/src/modules/application/operations'
import { ApplicationHostError, decodeApplicationHostError, type ApplicationHostPort } from '../packages/shared/src/ipc/application-host'
import { defaultAppIconId, type AppIconStatus } from '../packages/shared/src/appearance'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })

async function fixture(input: { future?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-appearance-application-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const appearanceRoot = join(root, 'appearance')
  if (input.future) { await mkdir(appearanceRoot); await writeFile(join(appearanceRoot, 'settings.json'), JSON.stringify({ preferences: { schemaVersion: 99 } })) }
  let disabled: string[] = [], available = true, loseReply = false
  const appearance = new AppearanceStore(appearanceRoot, () => false, () => {}, () => ({ width: 1, height: 1 }), () => disabled)
  await appearance.init()
  let store = new ProductStore(join(root, 'boai.sqlite')); await store.init()
  cleanup.push(() => store.close())
  let icons: AppIconStatus = {
    sequence: 0, platform: 'macos', environment: 'development', requestedId: defaultAppIconId, pending: false,
    dock: { appliedId: defaultAppIconId, error: null },
    tray: { supported: true, available: true, state: 'applied', appliedId: defaultAppIconId, fallback: null, error: null },
    installed: { appliedId: null, error: null, available: false },
  }
  const request = vi.fn(async (method: string, value: unknown) => {
    try {
      if (method === 'getPluginSettings') return { revision: 0, disabledIds: disabled }
      if (method === 'getAppIconStatus') return structuredClone(icons)
      if (!['getAppearance', 'updateAppearance', 'removeAppearanceBackground', 'resetAppearance'].includes(method)) throw new Error('Unexpected host method')
      const result = await appearanceHostRequest(appearance, method as Parameters<typeof appearanceHostRequest>[1], value)
      if (loseReply && method === 'updateAppearance') throw new Error('Disconnected after host commit')
      return result
    } catch (error) {
      // Exercise the actual shared error decoder after a JSON wire loses the Error prototype.
      const wire = JSON.parse(JSON.stringify({ message: error instanceof Error ? error.message : String(error), ...(error instanceof ApplicationHostError ? { code: error.code } : {}) }))
      throw decodeApplicationHostError(wire.message, wire.code)
    }
  })
  const host = { get available() { return available }, request } as unknown as ApplicationHostPort
  const port = { request } as unknown as ApplicationPort
  let service = new ApplicationService(store, appearanceOperations(port, host), async () => {})
  const call = (operation: string, input: Record<string, unknown> = {}, requestId?: string, contractVersion?: number) => service.call({ operation: `appearance.${operation}`, input, requestId, contractVersion })
  return {
    root, appearance, request, call, get store() { return store }, get service() { return service },
    setDisabled(ids: string[]) { disabled = ids }, setAvailable(value: boolean) { available = value }, setLoseReply() { loseReply = true }, setIcons(value: AppIconStatus) { icons = value },
    async restart() { await service.drain(); await store.close(); store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); service = new ApplicationService(store, appearanceOperations(port, host), async () => {}) },
  }
}

it('advertises only current schemas while explicit v1 keeps the original merge and durable receipt', async () => {
  const f = await fixture()
  const catalog = await f.service.catalog({ domain: 'appearance', includeSchemas: true })
  expect(catalog.operations.filter(operation => operation.effect === 'write').map(operation => [operation.name, operation.contractVersion])).toEqual([
    ['appearance.update', 2], ['appearance.reset', 2], ['appearance.removeBackground', 2],
  ])
  for (const operation of catalog.operations.filter(operation => operation.effect === 'write')) expect(operation.inputSchema?.required).toContain('expectedRevision')
  await f.appearance.update({ customColors: { dark: { accent: '#123456' } }, typography: { content: { sizePx: 19 } } }, 0)
  const input = { patch: { themeIds: { dark: 'nord' }, typography: { ui: { sizePx: 15 } } }, expectedRevision: 1 }
  const legacy = await f.call('update', input, 'legacy-update', 1)
  expect(legacy).toMatchObject({ status: 'succeeded', data: { revision: 2, preferences: { customColors: { dark: { accent: '#123456' } }, typography: { ui: { sizePx: 15 }, content: { sizePx: 19 } } } } })
  const current = await f.call('update', { ...input, expectedRevision: 2 }, 'current-update')
  expect(current).toMatchObject({ status: 'succeeded', data: { revision: 3, preferences: { customColors: { dark: { accent: null } }, typography: { ui: { sizePx: 15 }, content: { sizePx: 15 } } } } })
  expect(f.request.mock.calls.filter(([method]) => method === 'updateAppearance').map(([, input]) => (input as { contractVersion: number }).contractVersion)).toEqual([1, 2])
  await f.restart()
  expect(await f.call('update', input, 'legacy-update', 1)).toEqual(legacy)
  expect(await f.service.receipt('legacy-update')).toEqual(legacy)
  expect(f.appearance.snapshot().revision).toBe(3)
})

it.each(['reset', 'removeBackground'])('%s requires a current CAS and has no legacy employee bypass', async action => {
  const f = await fixture()
  await f.appearance.updateCommand({ mode: 'dark' }, 0)
  expect(await f.call(action, {}, 'missing-revision')).toMatchObject({ status: 'rejected' })
  expect(await f.call(action, {}, 'legacy-bypass', 1)).toMatchObject({ status: 'rejected', error: { code: 'UNSUPPORTED_CONTRACT_VERSION' } })
  expect(await f.call(action, { expectedRevision: 1, force: true }, 'unexpected-field')).toMatchObject({ status: 'rejected' })
  expect(f.request).not.toHaveBeenCalled()
  const rejected = await f.call(action, { expectedRevision: 0 }, 'stale-action')
  expect(rejected).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  expect(await f.service.receipt('stale-action')).toEqual(rejected)
  expect(f.appearance.snapshot().revision).toBe(1)
  expect(await f.call(action, { expectedRevision: 1 }, 'current-action')).toMatchObject({ status: 'succeeded', data: { revision: 2 } })
})

it('preserves known invalid-theme and read-only errors through the host wire as definite rejections', async () => {
  const f = await fixture()
  f.setDisabled(['boai.theme.base46'])
  for (const [requestId, patch] of Object.entries({ unknown: { themeIds: { dark: 'missing' } }, mode: { themeIds: { dark: 'boai-light' } }, disabled: { themeIds: { dark: 'nord' } } })) {
    expect(await f.call('update', { patch, expectedRevision: 0 }, requestId)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  }
  expect(f.appearance.snapshot().revision).toBe(0)
  await expect(appearanceHostRequest(f.appearance, 'updateAppearance', { patch: { mode: 'dark' }, expectedRevision: 0, contractVersion: 3 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const future = await fixture({ future: true })
  expect(await future.call('update', { patch: { mode: 'dark' }, expectedRevision: 0 }, 'read-only')).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  expect(future.appearance.snapshot().revision).toBe(0)
})

it('keeps a post-commit disconnect unknown and never replays its stable request across restart', async () => {
  const f = await fixture()
  f.setLoseReply()
  const input = { patch: { mode: 'dark' }, expectedRevision: 0 }
  const unknown = await f.call('update', input, 'lost-reply')
  expect(unknown).toMatchObject({ status: 'unknown', error: { code: 'OUTCOME_UNKNOWN' } })
  expect(f.appearance.snapshot()).toMatchObject({ revision: 1, preferences: { mode: 'dark' } })
  expect(await f.call('get')).toMatchObject({ status: 'succeeded', data: { preferences: { mode: 'dark' } } })
  expect(await f.service.receipt('lost-reply')).toEqual(unknown)
  await f.restart()
  expect(await f.call('update', input, 'lost-reply')).toEqual(unknown)
  expect(f.request.mock.calls.filter(([method]) => method === 'updateAppearance')).toHaveLength(1)
  expect(await f.store.load('applicationOperations')).toHaveLength(1)
})

it('reads current bounded options and icon outcomes without equating saved preference to applied targets', async () => {
  const f = await fixture()
  f.setDisabled(['boai.theme.base46'])
  const options = await f.call('options')
  expect(options.status).toBe('succeeded')
  const data = options.data as { themes: { id: string }[]; fields: { path: string; active?: boolean; supported?: boolean }[] }
  expect(data.themes.some(theme => theme.id === 'nord')).toBe(false)
  expect(data.fields.find(field => field.path === 'appIconId')?.supported).toBe(process.platform === 'darwin')
  expect(data.fields.find(field => field.path === 'background.blurRadius')?.active).toBe(false)
  expect(await f.store.load('applicationOperations')).toEqual([])
  const selected = 'avatar-mint-ring'
  expect(await f.call('update', { patch: { appIconId: selected }, expectedRevision: 0 }, 'icon-choice')).toMatchObject({ status: 'succeeded', data: { preferences: { appIconId: selected } } })
  f.setIcons({ sequence: 2, platform: 'macos', environment: 'installed', requestedId: selected, pending: false,
    dock: { appliedId: selected, error: null }, tray: { supported: true, available: true, state: 'applied', appliedId: selected, fallback: null, error: null }, installed: { appliedId: defaultAppIconId, error: 'helper failed', available: true } })
  expect(await f.call('iconStatus')).toMatchObject({ status: 'succeeded', data: { requestedId: selected, pending: false, dock: { appliedId: selected }, installed: { appliedId: defaultAppIconId, error: 'helper failed' } } })
  expect(await f.store.load('applicationOperations')).toHaveLength(1)
  f.setAvailable(false)
  expect((await f.service.catalog({ domain: 'appearance' })).operations.every(operation => !operation.available)).toBe(true)
  expect(await f.call('options')).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(await f.call('update', { patch: { mode: 'light' }, expectedRevision: 1 }, 'no-host')).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  expect(f.appearance.snapshot().revision).toBe(1)
})


it('rejects background behavior before config discovery or either write contract can reach the host', async () => {
  const f = await fixture()
  const actor = { kind: 'behavior' as const, employeeId: 'bobo', conversationId: 'room', behaviorRunId: 'background' }
  for (const operation of ['appearance.options', 'appearance.iconStatus']) {
    expect(await f.service.call({ operation, input: {} }, actor)).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  }
  for (const contractVersion of [1, 2]) {
    expect(await f.service.call({ operation: 'appearance.update', contractVersion, input: { patch: { mode: 'dark' }, expectedRevision: 0 }, requestId: `behavior-${contractVersion}` }, actor)).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  }
  for (const operation of ['appearance.reset', 'appearance.removeBackground']) {
    expect(await f.service.call({ operation, input: { expectedRevision: 0 }, requestId: operation }, actor)).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  }
  expect(f.request).not.toHaveBeenCalled()
  expect(await f.store.load('applicationOperations')).toEqual([])
  expect(f.appearance.snapshot().revision).toBe(0)
})
