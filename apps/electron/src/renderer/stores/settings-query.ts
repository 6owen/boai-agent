/*
 * [INPUT]: API-scoped settings reads, authoritative events and active page subscriptions.
 * [OUTPUT]: Zustand memory snapshots with freshness, deduplicated reads and inactive invalidation; soft changes keep coherent results visible, while explicit refresh/writes/disposal isolate superseded responses.
 * [POS]: Renderer settings read cache; writes and persistent truth remain with the existing host APIs.
 * [PROTOCOL]: Update Header and stores/.folder.md when changed.
 */
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import type { AppEvent, DesktopApi } from '@boai/shared/ipc'

export interface SettingsQueryState<T> { data?: T; loading: boolean; error?: string; updatedAt: number }
export interface SettingsQueryOptions<T> {
  read: () => Promise<T>
  staleTime: number
  onEvent?: (event: AppEvent, query: SettingsQuery<T>) => void
  refreshOnFocus?: boolean
  merge?: (previous: T | undefined, next: T) => T
}
type ReadOptions = { silent?: boolean }
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:)?\s*/, '')

export class SettingsQuery<T> {
  readonly store = createStore<SettingsQueryState<T>>(() => ({ loading: false, updatedAt: 0 }))
  private dirty = true
  private epoch = 0
  private lifetime = 0
  private observers = 0
  private timer?: ReturnType<typeof setTimeout>
  private flight?: { promise: Promise<void>; discard: boolean }

  constructor(private readonly options: SettingsQueryOptions<T>) {}

  ensure = (options: ReadOptions = {}): Promise<void> => {
    if (this.flight) return this.flight.promise
    const state = this.store.getState()
    if (!this.dirty && state.data !== undefined && Date.now() - state.updatedAt < this.options.staleTime) return Promise.resolve()
    return this.read(options)
  }

  refresh = (options: ReadOptions = {}): Promise<void> => {
    this.markDirty()
    this.clearTimer()
    if (this.flight) {
      this.flight.discard = true
      const lifetime = this.lifetime
      return this.flight.promise.then(() => lifetime === this.lifetime ? this.flight?.promise ?? (this.dirty ? this.ensure(options) : undefined) : undefined)
    }
    return this.read(options)
  }

  invalidate = () => { this.markDirty(); this.schedule() }

  accept = (value: T) => {
    this.cancelRead()
    this.clearTimer()
    this.dirty = false
    this.store.setState(state => ({ data: this.options.merge?.(state.data, value) ?? value, loading: false, error: undefined, updatedAt: Date.now() }))
  }

  retain = () => {
    this.observers++
    void this.ensure()
    let released = false
    return () => {
      if (released) return
      released = true
      if (--this.observers === 0) {
        this.clearTimer()
        // A detached read is no longer authoritative for a later mount.
        // Keep already confirmed values, but never cache this late response.
        if (this.flight) { this.cancelRead(); this.dirty = true }
      }
    }
  }

  handleEvent(event: AppEvent) { this.options.onEvent?.(event, this) }
  focus() { if (this.options.refreshOnFocus) this.invalidate() }
  suspend() { this.clearTimer(); this.cancelRead(); this.dirty = true }
  get inactive() { return this.observers === 0 && !this.flight }

  private markDirty() {
    if (!this.dirty) this.epoch++
    this.dirty = true
  }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined }
  private cancelRead() { this.epoch++; this.lifetime++; this.flight = undefined; this.store.setState({ loading: false }) }
  private schedule() {
    if (!this.observers || this.timer || this.flight) return
    this.timer = setTimeout(() => { this.timer = undefined; void this.ensure() }, 400)
  }
  private read(options: ReadOptions): Promise<void> {
    this.clearTimer()
    const epoch = this.epoch
    this.dirty = false
    this.store.setState({ loading: true, error: undefined })
    const flight = { promise: Promise.resolve(), discard: false }
    this.flight = flight
    flight.promise = Promise.resolve().then(this.options.read).then(value => {
      if (flight.discard || this.flight !== flight) return
      // Continuous activity notifications must not starve the first visible result.
      // A coherent read may be shown after soft invalidation, but remains stale until the follow-up confirms it.
      this.store.setState(state => ({ data: this.options.merge?.(state.data, value) ?? value, error: undefined, updatedAt: epoch === this.epoch ? Date.now() : state.updatedAt }))
    }).catch(error => {
      if (epoch !== this.epoch || this.flight !== flight) return
      this.dirty = true
      const message = errorText(error)
      this.store.setState({ error: message })
      if (!options.silent) toast.error(message)
    }).finally(() => {
      if (this.flight !== flight) return
      this.flight = undefined
      this.store.setState({ loading: false })
      // Only a newer invalidation warrants a follow-up; failed reads do not retry themselves.
      if (epoch !== this.epoch && this.dirty) this.schedule()
    })
    return flight.promise
  }
}

type RegisteredQuery = Pick<SettingsQuery<unknown>, 'handleEvent' | 'focus' | 'suspend' | 'inactive'>
type Registry = { queries: Map<string, RegisteredQuery>; owners: number; cleanup?: () => void }
const registries = new WeakMap<DesktopApi, Registry>()
function registry(api: DesktopApi): Registry {
  let value = registries.get(api)
  if (!value) { value = { queries: new Map(), owners: 0 }; registries.set(api, value) }
  return value
}
export function getSettingsQuery<T>(api: DesktopApi, key: string, options: SettingsQueryOptions<T>): SettingsQuery<T> {
  const queries = registry(api).queries
  let query = queries.get(key) as SettingsQuery<T> | undefined
  if (!query) { query = new SettingsQuery(options); queries.set(key, query) }
  return query
}

/** Only parameterized date resources opt into bounded historical retention. */
export function pruneSettingsQueries(api: DesktopApi, prefix: string, keep: number) {
  const queries = registry(api).queries, matches = [...queries].filter(([key]) => key.startsWith(prefix))
  for (const [key, query] of matches.slice(0, Math.max(0, matches.length - keep))) if (query.inactive) queries.delete(key)
}

/** The shell owns one listener even while every settings page is unmounted. */
export function initializeSettingsQueries(api: DesktopApi): () => void {
  const owner = registry(api)
  if (owner.owners++ === 0) {
    const focus = () => { for (const query of owner.queries.values()) query.focus() }
    const unsubscribe = api.subscribe(event => {
      for (const query of owner.queries.values()) query.handleEvent(event)
      if (event.type === 'desktop:lifecycle' && event.state.power === 'awake' && !event.state.locked) focus()
    })
    if (typeof window !== 'undefined') window.addEventListener('focus', focus)
    owner.cleanup = () => {
      unsubscribe()
      if (typeof window !== 'undefined') window.removeEventListener('focus', focus)
      for (const query of owner.queries.values()) query.suspend()
    }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--owner.owners === 0) { owner.cleanup?.(); owner.cleanup = undefined }
  }
}

const emptyStore = createStore<SettingsQueryState<never>>(() => ({ loading: false, updatedAt: 0 }))
export function useSettingsQuery<T>(query: SettingsQuery<T> | undefined, active = true): SettingsQueryState<T> {
  const state = useStore(query?.store ?? emptyStore as SettingsQuery<T>['store'])
  useEffect(() => { if (active) return query?.retain() }, [query, active])
  return state
}
