// @vitest-environment jsdom
/*
 * [INPUT]: Real ProfileSettings with controlled activity responses and host invalidation events.
 * [OUTPUT]: Tab re-entry retains statistics without another query or skeleton; hidden changes and calendar transitions refresh the correct range.
 * [POS]: Renderer component regression, separate from Electron visual acceptance.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { defaultUserProfile, type ProfileActivity, type ProfileActivityQuery } from '../packages/shared/src/domain/profile'
import { ProfileSettings } from '../apps/electron/src/renderer/pages/settings/profile'
import { initializeSettingsQueries } from '../apps/electron/src/renderer/stores/settings-query'

vi.mock('../apps/electron/src/renderer/pages/settings/profile-activity', async importOriginal => {
  const original = await importOriginal<typeof import('../apps/electron/src/renderer/pages/settings/profile-activity')>()
  return { ...original, ActivityChart: ({ loading }: { loading: boolean }) => h('div', { 'data-chart-loading': loading }) }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
let host: HTMLDivElement, root: Root, api: DesktopApi, dispose: () => void
let listeners: Set<(event: AppEvent) => void>
let request: ReturnType<typeof vi.fn<(method: string, input: ProfileActivityQuery) => Promise<ProfileActivity>>>
const activity = (range: ProfileActivityQuery, tokens = 123): ProfileActivity => ({
  schemaVersion: 1, dataVersion: String(tokens), generatedAt: new Date().toISOString(), scope: 'retained-local', range,
  totalTokens: tokens, peak: null, longestTaskMs: null, currentStreak: 1, longestStreak: 1, days: [], unknownCalls: 0,
  unrecordedRuns: 0, incomplete: false, limitations: [], chats: 3, exploredSkills: 0, skillActivations: 0, thinking: null, skills: [],
})
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 28, 12))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  request = vi.fn(async (_method, input) => activity(input))
  listeners = new Set()
  api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } } as unknown as DesktopApi
  dispose = initializeSettingsQueries(api)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); dispose(); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
const show = (active = true) => act(async () => root.render(h(ProfileSettings, { api, profile: defaultUserProfile, active, refresh: async () => {}, onOpenSkills() {} })))
const tokens = () => host.querySelector('.profile-metric-value')?.textContent
const chartLoading = () => host.querySelector('[data-chart-loading]')?.getAttribute('data-chart-loading')

it('reuses confirmed statistics immediately when returning to the profile tab', async () => {
  await show()
  expect(tokens()).toBe('123'); expect(chartLoading()).toBe('false')
  await act(async () => root.render(null))
  await show()
  expect(tokens()).toBe('123'); expect(chartLoading()).toBe('false')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]![0]).toBe('getProfileActivity')
})

it('invalidates while hidden and keeps existing values during the next background read', async () => {
  await show(); await act(async () => root.render(null))
  let finish!: () => void
  request.mockImplementationOnce((_method, input) => new Promise(resolve => { finish = () => resolve(activity(input, 456)) }))
  for (const listener of listeners) listener({ type: 'changed' })
  await vi.advanceTimersByTimeAsync(1000)
  expect(request).toHaveBeenCalledTimes(1)
  await show()
  expect(request).toHaveBeenCalledTimes(2)
  expect(tokens()).toBe('123'); expect(chartLoading()).toBe('false')
  await act(async () => finish())
  expect(tokens()).toBe('456')
})

it('selects a new date-range cache on the calendar transition', async () => {
  vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 50))
  await show()
  expect(request.mock.calls[0]![1].to).toBe('2026-10-28')
  await act(async () => vi.advanceTimersByTimeAsync(30_000))
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1]![1].to).toBe('2026-10-29')
  expect(chartLoading()).toBe('false')
})
