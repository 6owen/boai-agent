/*
 * [INPUT]: A board identity and the host's authenticated command transport.
 * [OUTPUT]: One optimistic document queue, gesture-sized undo, persistent operation identities and independent view sessions.
 * [POS]: Renderer document coordinator; views never replace the authoritative document with a snapshot.
 * [PROTOCOL]: Update Header and src/.folder.md when this file changes.
 */
import { getSnapshot, loadSnapshot, type Editor, type TLRecord, type RecordsDiff, type TLSessionStateSnapshot, type TLEventInfo } from 'tldraw'
import { CanvasError, type CanvasBoard, type CanvasChanges, type CanvasDocument, type CanvasMutationResult, type CanvasRequest, type CanvasResponse, type CanvasScope } from './protocol'

export interface CanvasSelectionReference { boardId: string; viewId: string; pageId: string; shapeIds: string[]; revision: number }
export interface CanvasControllerState { board: CanvasBoard | null; dirty: boolean; error?: unknown }
export interface CanvasControllerOptions {
  boardId: string; scope: CanvasScope
  request: (command: CanvasRequest) => Promise<CanvasResponse>
}
interface View { editor: Editor; document: CanvasDocument; stop: () => void; gesture?: string }
interface HistoryStep { changes: CanvasChanges; key: string }
interface Pending { changes: CanvasChanges; operationId: string; expectedRevision?: number; historyKey?: string }
interface Draft { before: CanvasDocument; after: CanvasDocument; error: unknown }
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key]))
}
export function documentChanges(before: CanvasDocument, after: CanvasDocument): CanvasChanges {
  const changes: CanvasChanges = { added: {}, updated: {}, removed: {} }
  for (const [id, record] of Object.entries(after.store)) {
    const previous = before.store[id]
    if (!previous) changes.added[id] = record
    else if (!same(previous, record)) changes.updated[id] = [previous, record]
  }
  for (const [id, record] of Object.entries(before.store)) if (!after.store[id]) changes.removed[id] = record
  return changes
}
const hasChanges = (changes: CanvasChanges) => Object.values(changes).some(records => Object.keys(records).length > 0)
function applyChanges(document: CanvasDocument, changes: CanvasChanges): CanvasDocument {
  const store = { ...document.store }
  for (const [id, record] of Object.entries(changes.added)) {
    if (store[id]) throw new CanvasError('CONFLICT', '另一视图已经创建此图形，草稿已保留')
    store[id] = record
  }
  for (const [id, [before, after]] of Object.entries(changes.updated)) {
    if (!same(store[id], before)) throw new CanvasError('CONFLICT', '图形已被修改，草稿已保留')
    store[id] = after
  }
  for (const [id, record] of Object.entries(changes.removed)) {
    if (!same(store[id], record)) throw new CanvasError('CONFLICT', '图形已被修改，不能覆盖后续编辑')
    delete store[id]
  }
  return { ...document, store }
}
function mergeValue(before: unknown, after: unknown, current: unknown): unknown {
  if (same(before, current) || same(after, current)) return after
  if (same(before, after)) return current
  if (before && after && current && typeof before === 'object' && typeof after === 'object' && typeof current === 'object' && !Array.isArray(before) && !Array.isArray(after) && !Array.isArray(current)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>, c = current as Record<string, unknown>
    const merged: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
      const value = mergeValue(a[key], b[key], c[key])
      if (value !== undefined) merged[key] = value
    }
    return merged
  }
  throw new CanvasError('CONFLICT', '另一视图修改了同一属性，当前视图草稿已保留；请核对或放弃草稿后重载')
}
/** Rebase only disjoint local fields; overlapping edits never choose a silent winner. */
function rebaseChanges(current: CanvasDocument, changes: CanvasChanges): CanvasChanges {
  const store = { ...current.store }
  for (const [id, after] of Object.entries(changes.added)) store[id] = mergeValue(undefined, after, store[id]) as CanvasDocument['store'][string]
  for (const [id, [before, after]] of Object.entries(changes.updated)) store[id] = mergeValue(before, after, store[id]) as CanvasDocument['store'][string]
  for (const [id, before] of Object.entries(changes.removed)) {
    const value = mergeValue(before, undefined, store[id])
    if (value === undefined) delete store[id]
  }
  return documentChanges(current, { ...current, store })
}
function reverse(changes: CanvasChanges): CanvasChanges {
  return { added: changes.removed, removed: changes.added, updated: Object.fromEntries(Object.entries(changes.updated).map(([id, [before, after]]) => [id, [after, before]])) }
}
/** Consecutive frames of one gesture preserve the first before and final after record. */
function combine(first: CanvasChanges, last: CanvasChanges): CanvasChanges {
  const records = new Map<string, [CanvasDocument['store'][string] | undefined, CanvasDocument['store'][string] | undefined]>()
  for (const changes of [first, last]) {
    const pairs = [
      ...Object.entries(changes.added).map(([id, after]) => [id, undefined, after] as const),
      ...Object.entries(changes.updated).map(([id, [before, after]]) => [id, before, after] as const),
      ...Object.entries(changes.removed).map(([id, before]) => [id, before, undefined] as const),
    ]
    for (const [id, before, after] of pairs) records.set(id, [records.has(id) ? records.get(id)![0] : before, after])
  }
  const changes: CanvasChanges = { added: {}, updated: {}, removed: {} }
  for (const [id, [before, after]] of records) {
    if (same(before, after)) continue
    if (!before && after) changes.added[id] = after
    else if (before && !after) changes.removed[id] = before
    else if (before && after) changes.updated[id] = [before, after]
  }
  return changes
}

export class CanvasController {
  private state: CanvasControllerState = { board: null, dirty: false }
  private listeners = new Set<() => void>()
  private views = new Map<string, View>()
  private sessions = new Map<string, TLSessionStateSnapshot>()
  private pending: Pending[] = []
  private drafts = new Map<string, Draft>()
  private capturing = false
  private optimistic?: CanvasDocument
  private draining?: Promise<void>
  private loading?: Promise<void>
  private polling?: ReturnType<typeof setInterval>
  private disposed = false
  private undoStack: HistoryStep[] = []
  private redoStack: HistoryStep[] = []
  constructor(readonly options: CanvasControllerOptions) {}
  getState = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<CanvasControllerState>) { this.state = { ...this.state, ...patch, dirty: this.pending.length > 0 || this.drafts.size > 0 }; for (const listener of this.listeners) listener() }
  async load() {
    if (this.state.board) return
    if (!this.loading) this.loading = this.refresh().finally(() => { this.loading = undefined })
    return this.loading
  }
  async refresh() {
    this.capture()
    if (this.disposed || this.pending.length || this.drafts.size || this.draining) return
    const board = await this.options.request({ action: 'open', boardId: this.options.boardId }) as CanvasBoard
    this.capture()
    // An asynchronous read cannot overtake a gesture queued while it was in flight.
    if (this.disposed || this.pending.length || this.drafts.size || this.draining) return
    if (this.state.board && board.revision === this.state.board.revision) return
    if (this.state.board) {
      // A remote batch becomes the latest undo step; an undo can never skip over later edits.
      const changes = documentChanges(this.state.board.document, board.document)
      if (hasChanges(changes)) this.undoStack.push({ changes, key: crypto.randomUUID() })
      this.redoStack = []
    }
    this.optimistic = board.document
    this.syncViews(board.document)
    this.update({ board, error: undefined })
  }
  private capture() {
    if (this.capturing || !this.optimistic || this.disposed) return
    this.capturing = true
    let captured = false
    try {
      // Store listeners are batched by the SDK. Collect every view before broadcasting any diff,
      // otherwise a first listener can overwrite a second view's not-yet-observed pointer edit.
      for (const [id, view] of this.views) {
        const document = getSnapshot(view.editor.store).document as unknown as CanvasDocument
        const local = documentChanges(view.document, document)
        if (!hasChanges(local)) {
          if (this.drafts.delete(id)) captured = true
          continue
        }
        captured = true
        try {
          const changes = rebaseChanges(this.optimistic, local)
          if (hasChanges(changes)) this.enqueue(changes, view.gesture ?? crypto.randomUUID(), false)
          view.document = document
          this.drafts.delete(id)
        } catch (error) { this.drafts.set(id, { before: view.document, after: document, error }) }
      }
      if (captured) {
        this.syncViews(this.optimistic)
        this.update({ error: this.drafts.values().next().value?.error ?? this.state.error })
        if (!this.state.error) void this.drain().catch(() => {})
      }
    } finally { this.capturing = false }
  }
  private syncViews(document: CanvasDocument) {
    for (const [id, view] of this.views) {
      if (this.drafts.has(id)) continue
      const changes = documentChanges(view.document, document)
      if (hasChanges(changes)) view.editor.store.mergeRemoteChanges(() => view.editor.store.applyDiff(changes as unknown as RecordsDiff<TLRecord>))
      view.document = document
      // The SDK needs its current mark to cancel an unfinished pointer gesture with Escape.
      if (!view.gesture) view.editor.clearHistory()
    }
  }
  attach(editor: Editor, viewId: string) {
    if (this.views.has(viewId)) throw new CanvasError('CONFLICT', '同一画板视图已挂载')
    if (!this.optimistic || !this.state.board) throw new CanvasError('NOT_FOUND', '画板尚未读取')
    const session = this.sessions.get(viewId)
    const draft = this.drafts.get(viewId)
    loadSnapshot(editor.store, { document: draft?.after ?? this.optimistic, ...(session ? { session } : {}) } as unknown as Parameters<typeof loadSnapshot>[1])
    const view: View = { editor, document: draft?.before ?? getSnapshot(editor.store).document as unknown as CanvasDocument, stop: () => {} }
    const stopStore = editor.store.listen(() => {
      try { this.capture() } catch (error) { this.update({ error }) }
    }, { source: 'user', scope: 'document' })
    const beforeEvent = (event: TLEventInfo) => {
      if (event.name !== 'pointer_down') return
      try { this.capture() } catch (error) { this.update({ error }) }
      view.gesture = crypto.randomUUID()
    }
    const afterEvent = (event: TLEventInfo) => {
      if (!['pointer_up', 'cancel', 'complete', 'interrupt'].includes(event.name)) return
      try { this.capture() } catch (error) { this.update({ error }) }
      view.gesture = undefined
      editor.clearHistory()
    }
    editor.on('before-event', beforeEvent)
    editor.on('event', afterEvent)
    view.stop = () => { stopStore(); editor.off('before-event', beforeEvent); editor.off('event', afterEvent) }
    this.views.set(viewId, view)
    if (!this.polling) this.polling = setInterval(() => {
      void this.refresh().catch(error => this.update({ error }))
    }, 1000)
    return () => {
      try { this.capture() } catch (error) { this.update({ error }) }
      this.sessions.set(viewId, getSnapshot(editor.store).session)
      view.stop()
      this.views.delete(viewId)
      if (!this.views.size && this.polling) { clearInterval(this.polling); this.polling = undefined }
    }
  }
  private enqueue(changes: CanvasChanges, historyKey?: string, synchronize = true) {
    if (this.disposed || !this.optimistic) throw new CanvasError('DISABLED', '画板控制器已关闭')
    this.optimistic = applyChanges(this.optimistic, changes)
    this.pending.push({ changes, operationId: `view:${crypto.randomUUID()}`, historyKey })
    if (synchronize) {
      this.syncViews(this.optimistic)
      this.update({})
      if (!this.state.error) void this.drain().catch(() => {})
    }
  }
  private drain() {
    if (this.draining) return this.draining
    this.draining = (async () => {
      while (this.pending.length) {
        const item = this.pending[0]!
        item.expectedRevision ??= this.state.board!.revision
        const result = await this.options.request({ action: 'commit', boardId: this.options.boardId, expectedRevision: item.expectedRevision, operationId: item.operationId, changes: item.changes }) as CanvasMutationResult
        this.capture()
        this.pending.shift()
        if (item.historyKey) {
          const previous = this.undoStack.at(-1)
          if (previous?.key === item.historyKey) {
            previous.changes = combine(previous.changes, item.changes)
            if (!hasChanges(previous.changes)) this.undoStack.pop()
          } else this.undoStack.push({ changes: item.changes, key: item.historyKey })
          this.redoStack = []
        }
        if (!this.pending.length) {
          this.optimistic = result.board.document
          this.syncViews(this.optimistic)
          if (result.board.revision !== result.receipt.revision) { this.undoStack = []; this.redoStack = [] }
        }
        this.update({ board: result.board, error: this.drafts.values().next().value?.error })
      }
    })().catch(error => { this.update({ error }); throw error }).finally(() => { this.draining = undefined })
    return this.draining
  }
  async flush() {
    this.capture()
    // Explicit retry keeps the original operation id and expected revision. The host receipt makes
    // a lost response safe; a changed document yields a conflict and retains the local draft.
    if (this.pending.length) await this.drain()
    if (this.drafts.size) throw this.drafts.values().next().value!.error
  }
  async undo() {
    await this.flush()
    await this.refresh()
    const step = this.undoStack.at(-1)
    if (!step || !this.optimistic) return
    const inverse = reverse(step.changes)
    applyChanges(this.optimistic, inverse)
    this.enqueue(inverse)
    await this.flush()
    this.undoStack.pop(); this.redoStack.push(step)
  }
  async redo() {
    await this.flush()
    await this.refresh()
    const step = this.redoStack.at(-1)
    if (!step || !this.optimistic) return
    applyChanges(this.optimistic, step.changes)
    this.enqueue(step.changes)
    await this.flush()
    this.redoStack.pop(); this.undoStack.push(step)
  }
  /** Only the host's explicit discard confirmation may use this recovery path. */
  async reloadDiscardingDrafts() {
    await this.draining?.catch(() => undefined)
    const board = await this.options.request({ action: 'open', boardId: this.options.boardId }) as CanvasBoard
    if (this.disposed) throw new CanvasError('DISABLED', '画板控制器已关闭')
    this.pending = []; this.drafts.clear(); this.undoStack = []; this.redoStack = []
    this.optimistic = board.document
    this.syncViews(board.document)
    this.update({ board, error: undefined })
  }
  /** A failed draft must be explicitly resolved, never silently discarded by closing a container. */
  dispose(options?: { discard?: boolean }) {
    if ((this.pending.length || this.drafts.size) && !options?.discard) throw new CanvasError('CONFLICT', '画板仍有未提交修改，请保存或核对后关闭')
    this.disposed = true
    this.pending = []; this.drafts.clear(); this.optimistic = undefined
    if (this.polling) clearInterval(this.polling)
    for (const view of this.views.values()) view.stop()
    this.views.clear(); this.listeners.clear(); this.sessions.clear()
  }
}
export const createCanvasController = (options: CanvasControllerOptions) => new CanvasController(options)
