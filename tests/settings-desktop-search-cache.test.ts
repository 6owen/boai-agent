// @vitest-environment jsdom
/*
 * [INPUT]: Production settings components/hooks, isolated IPC clients and controlled read/write replies.
 * [OUTPUT]: Cached re-entry, inactive event invalidation, revision-safe writes, focus reconciliation and failed-read retention.
 * [POS]: Renderer settings integration regressions; no actual system settings or CLI installation is modified.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement, Fragment, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import type { DesktopSettings } from '../packages/shared/src/ipc/desktop'
import type { CliInstallation } from '../packages/shared/src/ipc/cli-installation'
import type { WebSearchSettings } from '../packages/shared/src/domain/web-search'
import { DesktopSettingsPage } from '../apps/electron/src/renderer/pages/settings/desktop'
import { CliInstallationCard } from '../apps/electron/src/renderer/pages/settings/cli-installation'
import { useWebSearchSettings } from '../apps/electron/src/renderer/hooks/use-web-search'
import { initializeSettingsQueries } from '../apps/electron/src/renderer/stores/settings-query'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
const desktop: DesktopSettings = { revision: 3, preferences: { runInBackground: true, startHidden: false }, trayAvailable: true, login: { supported: true, enabled: true, status: 'enabled' } }
const cli: CliInstallation = { revision: 'cli-1', supported: true, state: 'not-installed', version: '0.2.4', canUninstall: false, connection: { state: 'connected', version: '0.2.4' } }
const search: WebSearchSettings = { revision: 1, default: { mode: 'browser' }, services: [] }
let host: HTMLDivElement, root: Root
const cleanup: (() => void)[] = []
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount()); cleanup.splice(0).reverse().forEach(dispose => dispose())
  host.remove(); vi.useRealTimers(); vi.unstubAllGlobals()
})
const render = (node: ReactNode) => act(async () => root.render(node))
const button = (label: string) => [...host.querySelectorAll('button')].find(value => value.textContent === label)!
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function client(overrides: Record<string, (input: unknown) => unknown> = {}) {
  const listeners = new Set<(event: AppEvent) => void>()
  const handlers: Record<string, (input: unknown) => unknown> = {
    getDesktopSettings: () => desktop, getCliInstallation: () => cli, getWebSearchSettings: () => search, ...overrides,
  }
  const request = vi.fn(async (method: string, input: unknown) => {
    if (!handlers[method]) throw new Error(`Unexpected request: ${method}`)
    return handlers[method](input)
  })
  const api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } } as unknown as DesktopApi
  cleanup.push(initializeSettingsQueries(api))
  return { api, request, emit: (event: AppEvent) => listeners.forEach(listener => listener(event)), reads: (method: string) => request.mock.calls.filter(call => call[0] === method) }
}
function SearchView({ api, active = true }: { api: DesktopApi; active?: boolean }) {
  const { settings, failed, refresh } = useWebSearchSettings(api, active)
  return createElement('div', null, createElement('output', { 'data-search': true }, settings ? String(settings.revision) : 'loading'), failed && createElement('span', null, 'failed'), createElement('button', { onClick: () => void refresh() }, 'refresh search'))
}

it('retains desktop and CLI values on re-entry and accepts inactive desktop events without another read', async () => {
  const f = client(), show = () => render(createElement(DesktopSettingsPage, { api: f.api, active: true }))
  await show(); await render(null); await show()
  expect(f.reads('getDesktopSettings')).toHaveLength(1); expect(f.reads('getCliInstallation')).toHaveLength(1)
  expect(host.querySelector('[aria-label="关闭窗口后继续运行"]')?.getAttribute('aria-checked')).toBe('true')
  await render(null)
  f.emit({ type: 'desktop:changed', settings: { ...desktop, revision: 4, preferences: { ...desktop.preferences, runInBackground: false } } })
  f.emit({ type: 'desktop:changed', settings: desktop })
  await show()
  expect(host.querySelector('[aria-label="关闭窗口后继续运行"]')?.getAttribute('aria-checked')).toBe('false')
  expect(f.reads('getDesktopSettings')).toHaveLength(1)
})

it('saves desktop changes against the confirmed revision and keeps the returned value on re-entry', async () => {
  const f = client({ updateDesktopSettings: () => ({ ...desktop, revision: 4, preferences: { ...desktop.preferences, runInBackground: false } }) })
  await render(createElement(DesktopSettingsPage, { api: f.api, active: true }))
  await act(async () => (host.querySelector('[aria-label="关闭窗口后继续运行"]') as HTMLElement).click())
  expect(f.request).toHaveBeenCalledWith('updateDesktopSettings', { patch: { runInBackground: false }, expectedRevision: 3 })
  await render(null); await render(createElement(DesktopSettingsPage, { api: f.api, active: true }))
  expect(host.querySelector('[aria-label="关闭窗口后继续运行"]')?.getAttribute('aria-checked')).toBe('false')
  expect(f.reads('getDesktopSettings')).toHaveLength(1)
})

it('keeps CLI content visible during focus reconciliation and uses the newly confirmed revision for installation', async () => {
  const pending = deferred<CliInstallation>(); let reads = 0
  const f = client({ getCliInstallation: () => ++reads === 1 ? cli : pending.promise, installCli: () => ({ ...cli, revision: 'cli-3', state: 'installed', canUninstall: true }) })
  await render(createElement(CliInstallationCard, { api: f.api, active: true }))
  await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(450) })
  expect(f.reads('getCliInstallation')).toHaveLength(2)
  expect(host.textContent).toContain('未安装 · CLI 0.2.4'); expect(host.textContent).not.toContain('正在读取安装状态')
  expect(button('安装命令行工具').disabled).toBe(true)
  await act(async () => pending.resolve({ ...cli, revision: 'cli-2' }))
  await act(async () => button('安装命令行工具').click())
  expect(f.request).toHaveBeenCalledWith('installCli', { expectedRevision: 'cli-2' })
  await render(null); await render(createElement(CliInstallationCard, { api: f.api, active: true }))
  expect(host.textContent).toContain('已安装 · CLI 0.2.4'); expect(f.reads('getCliInstallation')).toHaveLength(2)
})

it('reconciles an unknown CLI write once, retains the previous status on read failure and never replays installation', async () => {
  let reads = 0
  const f = client({ getCliInstallation: () => ++reads === 1 ? cli : Promise.reject(new Error('read unavailable')), installCli: () => Promise.reject(new Error('write result unknown')) })
  await render(createElement(CliInstallationCard, { api: f.api, active: true }))
  await act(async () => button('安装命令行工具').click())
  expect(f.reads('installCli')).toHaveLength(1); expect(f.reads('getCliInstallation')).toHaveLength(2)
  expect(host.textContent).toContain('未安装 · CLI 0.2.4'); expect(button('安装命令行工具').disabled).toBe(true)
})

it('rechecks expired CLI status on return while immediately rendering the previous installation value', async () => {
  let reads = 0
  const pending = deferred<CliInstallation>(), f = client({ getCliInstallation: () => ++reads === 1 ? cli : pending.promise })
  await render(createElement(CliInstallationCard, { api: f.api, active: true })); await render(null)
  await vi.advanceTimersByTimeAsync(15_001)
  expect(f.reads('getCliInstallation')).toHaveLength(1)
  await render(createElement(CliInstallationCard, { api: f.api, active: true }))
  expect(f.reads('getCliInstallation')).toHaveLength(2)
  expect(host.textContent).toContain('未安装 · CLI 0.2.4'); expect(host.textContent).not.toContain('正在读取安装状态')
  await act(async () => pending.resolve({ ...cli, revision: 'external-install', state: 'installed', canUninstall: true }))
  expect(host.textContent).toContain('已安装 · CLI 0.2.4')
})

it('deduplicates shared search reads and refreshes inactive invalidation on return without blanking cached content', async () => {
  const pending = deferred<WebSearchSettings>(); let reads = 0
  const f = client({ getWebSearchSettings: () => ++reads === 1 ? search : pending.promise })
  await render(createElement(Fragment, null, createElement(SearchView, { api: f.api }), createElement(SearchView, { api: f.api })))
  expect(f.reads('getWebSearchSettings')).toHaveLength(1)
  await render(null)
  f.emit({ type: 'changed' }); await vi.advanceTimersByTimeAsync(450)
  expect(f.reads('getWebSearchSettings')).toHaveLength(1)
  await render(createElement(SearchView, { api: f.api }))
  expect(f.reads('getWebSearchSettings')).toHaveLength(2); expect(host.querySelector('output')?.textContent).toBe('1')
  await act(async () => pending.resolve({ ...search, revision: 2 }))
  expect(host.querySelector('output')?.textContent).toBe('2')
})

it('isolates search clients and retains confirmed data when manual refresh fails', async () => {
  let reads = 0
  const first = client(), pending = deferred<WebSearchSettings>()
  const second = client({ getWebSearchSettings: () => ++reads === 1 ? pending.promise : Promise.reject(new Error('search unavailable')) })
  await render(createElement(SearchView, { api: first.api }))
  await render(createElement(SearchView, { api: second.api }))
  expect(host.querySelector('output')?.textContent).toBe('loading')
  await act(async () => pending.resolve({ ...search, revision: 8 }))
  await act(async () => button('refresh search').click())
  expect(host.querySelector('output')?.textContent).toBe('8'); expect(host.textContent).toContain('failed')
  expect(first.reads('getWebSearchSettings')).toHaveLength(1); expect(second.reads('getWebSearchSettings')).toHaveLength(2)
})
