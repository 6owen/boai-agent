// @vitest-environment jsdom
/*
 * [INPUT]: Runtime plugin settings component with controlled desktop reads and clock.
 * [OUTPUT]: Confirmed catalog survives remount; polling stops for hidden settings and filtered categories.
 * [POS]: Renderer cache integration regression, without Electron or native plugin execution.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { RuntimePluginCatalog } from '../packages/shared/src/plugins/runtime-catalog'
import { bundledRuntimePlugins } from '../packages/shared/src/plugins/runtime-catalog'
import { RuntimePluginManager } from '../apps/electron/src/renderer/pages/settings/runtime-plugins'
const client = vi.hoisted(() => ({ api: undefined as DesktopApi | undefined }))
vi.mock('../apps/electron/src/renderer/services/request/desktop-client', () => ({ getDesktopClient: () => client.api }))
let host: HTMLDivElement, root: Root
const catalog: RuntimePluginCatalog = { revision: 1, plugins: [{ manifest: bundledRuntimePlugins[0]!, packageHash: 'test', enabled: true, bundled: true, inUse: 0 }] }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.api = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
const show = (active = true, kind = 'all') => act(async () => root.render(createElement(RuntimePluginManager, { query: '', kind, active })))
it('uses the confirmed catalog immediately on remount without fetching again', async () => {
  const request = vi.fn().mockResolvedValue(catalog)
  client.api = { request } as unknown as DesktopApi
  await show()
  expect(host.textContent).toContain('Pi')
  await act(async () => root.render(null))
  await show()
  expect(request).toHaveBeenCalledExactlyOnceWith('listRuntimePlugins', undefined)
  expect(host.textContent).not.toContain('正在读取运行时插件')
})
it('polls current usage only while the runtime catalog is visible', async () => {
  const request = vi.fn().mockResolvedValue(catalog)
  client.api = { request } as unknown as DesktopApi
  await show()
  await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
  expect(request).toHaveBeenCalledTimes(2)
  await show(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(request).toHaveBeenCalledTimes(2)
  await show(true, 'theme')
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(request).toHaveBeenCalledTimes(2)
  await show()
  expect(request).toHaveBeenCalledTimes(3)
  expect(host.textContent).toContain('Pi')
})
it('defers unknown-write reconciliation until returning after the page unmounts', async () => {
  let reject!: (error: Error) => void
  const request = vi.fn((method: string) => method === 'listRuntimePlugins' ? Promise.resolve(catalog) : new Promise<RuntimePluginCatalog>((_, fail) => { reject = fail }))
  client.api = { request } as unknown as DesktopApi
  await show()
  await act(async () => (host.querySelector('[role="switch"][aria-label="Pi运行时"]') as HTMLElement).click())
  expect(request).toHaveBeenCalledTimes(2)
  await act(async () => root.render(null))
  await act(async () => reject(new Error('write receipt lost')))
  expect(request).toHaveBeenCalledTimes(2)
  await show()
  expect(request).toHaveBeenCalledTimes(3)
  expect(request.mock.calls.filter(([method]) => method === 'setRuntimePluginEnabled')).toHaveLength(1)
})
