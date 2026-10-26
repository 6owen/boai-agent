/*
 * [INPUT]: Main 快捷键快照/回执、设置录入与导航/窗口结束事件。
 * [OUTPUT]: 页外草稿、单写入队列、捕获租约和未知结果核对；只执行已保存绑定，真实保存或回执核对确认提交后使用Sonner成功提示。
 * [POS]: Renderer 快捷键状态所有者；页面卸载不丢待处理修改。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import { sameShortcut, shortcutDefaults, shortcutIds, shortcutLabels, validateShortcuts, type ShortcutBinding, type ShortcutEntry, type ShortcutId, type ShortcutSnapshot, type ShortcutUpdate } from '@boai/shared/shortcuts'
import { getDesktopClient } from '@/services/request/desktop-client'

type Draft = { value: ShortcutEntry; base: ShortcutEntry; version: number; invalid?: string; error?: string; changedElsewhere?: boolean }
type Pending = { input: ShortcutUpdate; versions: Partial<Record<ShortcutId, number>> }
type State = { snapshot?: ShortcutSnapshot; drafts: Partial<Record<ShortcutId, Draft>>; capturing?: ShortcutId; captureReady: boolean; busy: ShortcutId[]; unknown: boolean; error?: string }
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:)?\s*/, '')
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('快捷键保存回执尚未确认。')), 10_000) })]) }
  finally { clearTimeout(timer) }
}

export class ShortcutController {
  readonly store = createStore<State>(() => ({ drafts: {}, busy: [], captureReady: false, unknown: false }))
  private api?: DesktopApi
  private unsubscribe?: () => void
  private unsubscribeDirty?: () => void
  private queue: Promise<void> = Promise.resolve()
  private pending?: Pending
  private captureToken?: string
  private version = 0
  private loading?: Promise<void>

  initialize(api: DesktopApi) {
    if (this.api === api) return
    this.dispose()
    this.api = api
    this.unsubscribe = api.subscribe(event => {
      if (event.type === 'shortcuts:changed') this.accept(event.settings)
      if (event.type === 'shortcuts:flush') void (async () => {
        const clean = event.discard ? await this.discard() : await this.flush()
        await api.request('completeShortcutFlush', { requestId: event.requestId, clean, settled: !this.store.getState().unknown && !this.store.getState().busy.length }).catch(() => {})
      })()
      if (event.type === 'shortcuts:capture-ended') this.finish()
    })
    let previous = false
    this.unsubscribeDirty = this.store.subscribe(() => {
      const dirty = this.hasWork()
      if (dirty !== previous) { previous = dirty; void api.request('setUnsavedChanges', { source: 'shortcuts', dirty }).catch(() => {}) }
    })
    void this.reload()
  }
  dispose() { this.releaseCapture(); this.unsubscribe?.(); this.unsubscribeDirty?.(); this.unsubscribe = undefined; this.unsubscribeDirty = undefined }
  reload(): Promise<void> {
    if (!this.api) return Promise.resolve()
    if (!this.loading) this.loading = bounded(this.api.request('getShortcutSettings', undefined)).then(value => { this.accept(value); this.store.setState({ error: value.error }); if (value.error) toast.error(value.error) }).catch(error => { this.store.setState({ error: message(error) }); toast.error(message(error)) }).finally(() => { this.loading = undefined })
    return this.loading
  }
  private accept(snapshot: ShortcutSnapshot) {
    const state = this.store.getState()
    if (state.snapshot && snapshot.revision < state.snapshot.revision) return
    const drafts = { ...state.drafts }
    for (const id of shortcutIds) {
      const draft = drafts[id]
      if (draft && !sameShortcut(snapshot.preferences[id], draft.base) && !sameShortcut(snapshot.preferences[id], draft.value)) drafts[id] = { ...draft, changedElsewhere: true }
    }
    this.store.setState({ snapshot, drafts })
  }
  hasWork() { const state = this.store.getState(); return Boolean(state.capturing || state.busy.length || state.unknown || Object.keys(state.drafts).length) }
  async begin(id: ShortcutId) {
    if (this.store.getState().unknown && await this.resolvePending() === 'unknown') { toast.error('保存结果尚未确认，请稍后核对。'); return }
    const state = this.store.getState()
    if (!state.snapshot || state.snapshot.error || state.busy.includes(id)) return
    if (state.capturing === id) return
    if (state.capturing) this.finish()
    const token = crypto.randomUUID()
    this.captureToken = token
    this.store.setState({ capturing: id, captureReady: false })
    try {
      const ready = await bounded(this.api!.request('setShortcutCapture', { token, active: true }))
      if (this.captureToken !== token) return
      if (!ready) throw new Error('窗口未获得焦点，请重新点击组合键。')
      this.store.setState({ captureReady: true })
    } catch (error) { if (this.captureToken === token) { this.releaseCapture(); toast.error(message(error)) } }
  }
  record(binding: ShortcutBinding | null, invalid?: string) {
    const state = this.store.getState(), id = state.capturing
    if (!id || !state.captureReady || !state.snapshot) return
    const old = state.drafts[id], base = state.snapshot.preferences[id]
    const value = { enabled: old?.value.enabled ?? base.enabled, binding }
    this.store.setState({ drafts: { ...state.drafts, [id]: { value, base, version: ++this.version, invalid } } })
  }
  cancel() {
    const id = this.store.getState().capturing
    this.releaseCapture()
    if (id && !this.store.getState().busy.includes(id)) { const drafts = { ...this.store.getState().drafts }; delete drafts[id]; this.store.setState({ drafts }) }
  }
  private releaseCapture() {
    const token = this.captureToken
    this.captureToken = undefined
    this.store.setState({ capturing: undefined, captureReady: false })
    if (token) void this.api?.request('setShortcutCapture', { token, active: false }).catch(() => {})
  }
  finish() {
    const id = this.store.getState().capturing
    this.releaseCapture()
    if (id) this.submit(id)
  }
  toggle(id: ShortcutId, enabled: boolean) {
    const state = this.store.getState()
    if (!state.snapshot || state.snapshot.error || state.busy.includes(id) || state.unknown) return
    if (state.capturing && state.capturing !== id) this.finish()
    else if (state.capturing === id) this.releaseCapture()
    const draft = this.store.getState().drafts[id], base = state.snapshot.preferences[id]
    if (draft?.invalid) { toast.error(draft.invalid); return }
    const value = { ...(draft?.value ?? base), enabled }
    this.store.setState({ drafts: { ...this.store.getState().drafts, [id]: { ...draft, value, base: draft?.base ?? base, version: ++this.version } } })
    this.submit(id)
  }
  private fail(ids: ShortcutId[], error: unknown) {
    const text = message(error), drafts = { ...this.store.getState().drafts }
    for (const id of ids) if (drafts[id]) drafts[id] = { ...drafts[id]!, error: text }
    this.store.setState({ drafts }); toast.error(text)
  }
  private submit(id: ShortcutId) {
    const state = this.store.getState(), draft = state.drafts[id]
    if (!draft || state.busy.includes(id) || state.unknown) return
    if (draft.invalid) { this.fail([id], draft.invalid); return }
    this.enqueue([id])
  }
  private enqueue(ids: ShortcutId[]) {
    this.store.setState(state => ({ busy: [...state.busy, ...ids] }))
    const work = this.queue.then(async () => {
      const state = this.store.getState(), snapshot = state.snapshot
      if (!snapshot || !this.api || state.unknown) return
      const patch: ShortcutUpdate['patch'] = {}, versions: Pending['versions'] = {}
      for (const id of ids) {
        const draft = state.drafts[id]
        if (!draft) continue
        if (draft.invalid) throw new Error(draft.invalid)
        if (!sameShortcut(snapshot.preferences[id], draft.base) && !sameShortcut(snapshot.preferences[id], draft.value)) throw new Error(`“${shortcutLabels[id]}”已在其他位置修改，请重新录入或按 Esc 使用最新设置。`)
        patch[id] = draft.value; versions[id] = draft.version
      }
      if (!Object.keys(patch).length) return
      validateShortcuts({ ...snapshot.preferences, ...patch }, snapshot.reserved)
      if (ids.every(id => !patch[id] || sameShortcut(snapshot.preferences[id], patch[id]!))) { this.clearVersions(versions); return }
      // One retry is safe only if a CAS conflict left every touched action unchanged.
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = this.store.getState().snapshot!
        const input: ShortcutUpdate = { patch, expectedRevision: current.revision, requestId: crypto.randomUUID() }
        const pending = { input, versions }
        this.pending = pending
        try {
          this.accept(await bounded(this.api.request('updateShortcutSettings', input)))
          this.pending = undefined; this.clearVersions(versions); toast.success('快捷键已保存'); return
        } catch (error) {
          const result = await this.resolvePending()
          if (result === 'committed') return
          if (result === 'unknown') throw new Error('快捷键保存结果尚未确认，请保持应用打开，重新进入录入或离页时会再次核对。')
          const fresh = this.store.getState().snapshot!
          if (attempt === 0 && message(error).includes('SHORTCUT_CONFLICT') && ids.every(id => sameShortcut(fresh.preferences[id], state.drafts[id]!.base))) {
            validateShortcuts({ ...fresh.preferences, ...patch }, fresh.reserved); continue
          }
          throw error
        }
      }
    }).catch(error => this.fail(ids, error)).finally(() => { this.store.setState(state => ({ busy: state.busy.filter(id => !ids.includes(id)) })) })
    this.queue = work
  }
  private clearVersions(versions: Pending['versions']) {
    const drafts = { ...this.store.getState().drafts }
    for (const id of shortcutIds) if (drafts[id]?.version === versions[id]) delete drafts[id]
    this.store.setState({ drafts })
  }
  private async resolvePending(): Promise<'committed' | 'absent' | 'unknown'> {
    const pending = this.pending
    if (!pending || !this.api) return 'absent'
    try {
      const result = await bounded(this.api.request('getShortcutReceipt', { requestId: pending.input.requestId, expectedRevision: pending.input.expectedRevision }))
      this.accept(result.snapshot)
      if (result.state !== 'unknown') {
        this.pending = undefined
        if (result.state === 'committed') { this.clearVersions(pending.versions); toast.success('快捷键已保存') }
      }
      this.store.setState({ unknown: result.state === 'unknown' }); return result.state
    } catch { this.store.setState({ unknown: true }); return 'unknown' }
  }
  async flush(): Promise<boolean> {
    this.finish()
    await this.queue
    if (this.pending) await this.resolvePending()
    return !this.hasWork()
  }
  async discard(): Promise<boolean> {
    this.releaseCapture()
    await this.queue
    if (this.pending && await this.resolvePending() === 'unknown') { toast.error('保存结果尚未确认，请稍后核对后再退出。'); return false }
    this.store.setState({ drafts: {}, unknown: false }); return true
  }
  async reset() {
    if (!await this.flush()) { toast.error('请先处理尚未保存的快捷键，再恢复默认。'); return }
    const state = this.store.getState()
    if (!state.snapshot || state.snapshot.error) return
    const defaults = shortcutDefaults(), drafts: State['drafts'] = {}
    for (const id of shortcutIds) drafts[id] = { base: state.snapshot.preferences[id], value: defaults[id], version: ++this.version }
    this.store.setState({ drafts }); this.enqueue([...shortcutIds])
  }
}

export const shortcuts = new ShortcutController()
export const useShortcuts = <T,>(selector: (state: State) => T) => useStore(shortcuts.store, selector)
export function initializeShortcuts() { const api = getDesktopClient(); if (api) shortcuts.initialize(api) }
