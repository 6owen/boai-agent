// @vitest-environment jsdom
/*
 * [INPUT]: Deferred host reads, fake time, authoritative events and settings cache observers.
 * [OUTPUT]: Cache reuse, inactive invalidation, deduplication, failures, API isolation and stale-write protection.
 * [POS]: Settings read-controller regressions; no Electron or screenshot execution.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { getSettingsQuery, initializeSettingsQueries, pruneSettingsQueries, SettingsQuery } from '../apps/electron/src/renderer/stores/settings-query'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const cleanups: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T00:00:00Z')); vi.clearAllMocks() })
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers() })
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function client() {
  const listeners = new Set<(event: AppEvent) => void>()
  const subscribe = vi.fn((listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) })
  const api = { subscribe } as unknown as DesktopApi
  cleanups.push(initializeSettingsQueries(api))
  return { api, subscribe, emit: (event: AppEvent) => { for (const listener of listeners) listener(event) }, listeners }
}

it('shares one fresh read across subscribers and remounts, then refreshes after expiry', async () => {
  const read = vi.fn(async () => 7), query = new SettingsQuery({ read, staleTime: 1000 })
  const first = query.retain(), second = query.retain()
  await query.ensure()
  expect(read).toHaveBeenCalledTimes(1)
  first(); second()
  const third = query.retain()
  await query.ensure()
  expect(query.store.getState().data).toBe(7)
  expect(read).toHaveBeenCalledTimes(1)
  third()
  vi.advanceTimersByTime(1000)
  cleanups.push(query.retain())
  await query.ensure()
  expect(read).toHaveBeenCalledTimes(2)
})

it('records changes while hidden and refreshes once on return with confirmed data retained', async () => {
  const { api, emit } = client(), next = deferred<number>()
  const read = vi.fn().mockResolvedValueOnce(1).mockReturnValueOnce(next.promise)
  const query = getSettingsQuery(api, 'settings', { read, staleTime: 60_000, onEvent: (event, current) => { if (event.type === 'changed') current.invalidate() } })
  const leave = query.retain(); await query.ensure(); leave()
  emit({ type: 'changed' }); emit({ type: 'changed' })
  await vi.advanceTimersByTimeAsync(1000)
  expect(read).toHaveBeenCalledTimes(1)
  cleanups.push(query.retain())
  expect(query.store.getState().data).toBe(1)
  await Promise.resolve()
  expect(read).toHaveBeenCalledTimes(2)
  next.resolve(2); await query.ensure()
  expect(query.store.getState().data).toBe(2)
})

it('keeps the first coherent result visible under continuous changes and follows up once', async () => {
  const first = deferred<number>(), read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(2)
  const query = new SettingsQuery({ read, staleTime: 60_000 })
  cleanups.push(query.retain())
  const flight = query.ensure()
  query.invalidate(); query.invalidate()
  first.resolve(1); await flight
  expect(query.store.getState().data).toBe(1)
  expect(query.store.getState().updatedAt).toBe(0)
  query.invalidate(); query.invalidate()
  await vi.advanceTimersByTimeAsync(400)
  expect(read).toHaveBeenCalledTimes(2)
  expect(query.store.getState().data).toBe(2)
  expect(query.store.getState().updatedAt).toBe(Date.now())
  await query.ensure()
  expect(read).toHaveBeenCalledTimes(2)
})

it('does not allow an old read to roll back a saved or event-confirmed value', async () => {
  const old = deferred<{ revision: number }>()
  const query = new SettingsQuery({ read: () => old.promise, staleTime: 60_000, merge: (previous, next) => previous && previous.revision > next.revision ? previous : next })
  const flight = query.ensure()
  query.accept({ revision: 3 })
  old.resolve({ revision: 1 }); await flight
  expect(query.store.getState()).toMatchObject({ data: { revision: 3 }, loading: false })
  query.accept({ revision: 2 })
  expect(query.store.getState().data).toEqual({ revision: 3 })
})

it('keeps confirmed data on failure, reports once and allows a later explicit retry', async () => {
  const read = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(2)
  const query = new SettingsQuery({ read, staleTime: 60_000 })
  cleanups.push(query.retain()); await query.ensure(); await query.refresh()
  expect(query.store.getState()).toMatchObject({ data: 1, error: 'offline', loading: false })
  expect(toast.error).toHaveBeenCalledExactlyOnceWith('offline')
  await vi.advanceTimersByTimeAsync(10_000)
  expect(read).toHaveBeenCalledTimes(2)
  await query.refresh()
  expect(query.store.getState()).toMatchObject({ data: 2, error: undefined })
})

it('keeps periodic failures silent without erasing data', async () => {
  const query = new SettingsQuery<number>({ read: async () => { throw new Error('poll failed') }, staleTime: 5000 })
  query.accept(1)
  await query.refresh({ silent: true })
  expect(query.store.getState()).toMatchObject({ data: 1, error: 'poll failed' })
  expect(toast.error).not.toHaveBeenCalled()
})

it('isolates APIs and date-range keys', async () => {
  const first = client(), second = client(), read = vi.fn(async () => 1)
  const a = getSettingsQuery(first.api, 'day:28', { read, staleTime: 1000 })
  expect(getSettingsQuery(first.api, 'day:28', { read, staleTime: 1000 })).toBe(a)
  await a.ensure()
  expect(getSettingsQuery(second.api, 'day:28', { read, staleTime: 1000 }).store.getState().data).toBeUndefined()
  expect(getSettingsQuery(first.api, 'day:29', { read, staleTime: 1000 }).store.getState().data).toBeUndefined()
})

it('bounds retained date queries without evicting an active or unrelated resource', async () => {
  const { api } = client(), options = { read: async () => 1, staleTime: 60_000 }
  const live = getSettingsQuery(api, 'profile:1', options), unrelated = getSettingsQuery(api, 'desktop', options)
  cleanups.push(live.retain()); await live.ensure()
  const old = getSettingsQuery(api, 'profile:2', options)
  getSettingsQuery(api, 'profile:3', options); getSettingsQuery(api, 'profile:4', options)
  const current = getSettingsQuery(api, 'profile:5', options)
  pruneSettingsQueries(api, 'profile:', 2)
  expect(getSettingsQuery(api, 'profile:1', options)).toBe(live)
  expect(getSettingsQuery(api, 'desktop', options)).toBe(unrelated)
  expect(getSettingsQuery(api, 'profile:5', options)).toBe(current)
  expect(getSettingsQuery(api, 'profile:2', options)).not.toBe(old)
})

it('joins concurrent forced refreshes into one follow-up and waits for its result', async () => {
  const old = deferred<number>(), next = deferred<number>()
  const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const query = new SettingsQuery<number>({ read, staleTime: 60_000 })
  const first = query.refresh()
  const finished = vi.fn(), second = query.refresh().then(finished), third = query.refresh().then(finished)
  query.invalidate(); query.invalidate()
  old.resolve(1); await first; await Promise.resolve()
  expect(read).toHaveBeenCalledTimes(2)
  expect(query.store.getState().data).toBeUndefined()
  expect(finished).not.toHaveBeenCalled()
  next.resolve(2); await Promise.all([second, third])
  expect(finished).toHaveBeenCalledTimes(2)
  expect(query.store.getState().data).toBe(2)
})

it('detaches a pending read so a remount can proceed without waiting for it', async () => {
  const old = deferred<number>(), fresh = deferred<number>()
  const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  const query = new SettingsQuery({ read, staleTime: 60_000 })
  const leave = query.retain(), staleFlight = query.ensure(); await Promise.resolve(); leave()
  cleanups.push(query.retain()); const current = query.ensure(); await Promise.resolve()
  expect(read).toHaveBeenCalledTimes(2)
  old.resolve(1); await staleFlight
  expect(query.store.getState().data).toBeUndefined()
  expect(query.store.getState().loading).toBe(true)
  fresh.resolve(2); await current
  expect(query.store.getState().data).toBe(2)
})

it('does not start a queued forced read after the last page has left', async () => {
  const old = deferred<number>(), read = vi.fn(() => old.promise)
  const query = new SettingsQuery({ read, staleTime: 60_000 })
  const leave = query.retain(), followUp = query.refresh()
  await Promise.resolve(); leave()
  old.resolve(1); await followUp
  await vi.advanceTimersByTimeAsync(1000)
  expect(read).toHaveBeenCalledTimes(1)
  expect(query.store.getState().data).toBeUndefined()
})

it('owns one event/focus listener and releases pending reads on shell disposal', async () => {
  const { api, subscribe, listeners } = client(), finish = deferred<number>()
  const secondOwner = initializeSettingsQueries(api)
  const query = getSettingsQuery(api, 'dynamic', { read: () => finish.promise, staleTime: 60_000, refreshOnFocus: true })
  query.accept(1)
  cleanups.push(query.retain())
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(400)
  const flight = query.ensure()
  expect(query.store.getState().loading).toBe(true)
  expect(subscribe).toHaveBeenCalledTimes(1)
  secondOwner(); cleanups[0]!()
  expect(listeners.size).toBe(0)
  finish.resolve(2); await flight
  expect(query.store.getState().data).toBe(1)
})
