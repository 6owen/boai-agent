/*
 * [INPUT]: Real CanvasView/CanvasController/BOAI CanvasWorkspace, isolated in-memory CAS and fixed documents.
 * [OUTPUT]: Test-only controls for container migration, independent views, strict effects and failed save retention.
 * [POS]: Headless WT4 view acceptance fixture; no personal data, Electron host, models or remote services.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createTLStore, defaultShapeUtils, defaultBindingUtils, DocumentRecordType, PageRecordType, TLDOCUMENT_ID, getIndexAbove, type Editor, type TLShapeId, type TLCamera } from 'tldraw'
import { CanvasController, CanvasView } from '@boai/canvas-plugin/editor'
import { CanvasError, canvasDocumentSchema, validateCanvasDocument, type CanvasBoard, type CanvasDocument, type CanvasMutationResult, type CanvasRequest, type CanvasResponse } from '@boai/canvas-plugin/protocol'
import type { DesktopApi } from '@boai/shared/ipc'
import { CanvasWorkspace, type CanvasPlacement, type CanvasWorkspaceHandle } from '@/components/canvas/workspace'
import { Toaster } from '@/components/ui/sonner'
import '@/styles/global.css'

const clone = <T,>(value: T): T => structuredClone(value)
const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const scope = { employeeId: 'fixture-employee', conversationId: 'fixture-chat' }
const boards = new Map<string, CanvasBoard>(), receipts = new Map<string, { fingerprint: string; result: CanvasMutationResult }>()
const calls: { action: string; boardId?: string; operationId?: string; expectedRevision?: number }[] = []
const editors = new Map<string, Editor>(), controllers = new Map<string, CanvasController>()
const selections: Record<string, string[]> = {}
const historyCalls: { action: string; boardId: string; before?: number; after?: number; error?: string }[] = []
let failWrites = false, loseResponse = false, clipboard = ''
let diagnostic: unknown = null
let setMode: (mode: 'workspace' | 'parallel') => void = () => {}, setEnabled: (value: boolean) => void = () => {}, setParallelVisible: (value: boolean) => void = () => {}, closeWorkspace: () => Promise<boolean> = async () => false
let holdWorkspace: (id: string) => Promise<void> = async () => {}, resumeWorkspace: (id: string) => void = () => {}
const originalAttach = CanvasController.prototype.attach
CanvasController.prototype.attach = function(editor, viewId) {
  const detach = originalAttach.call(this, editor, viewId)
  editors.set(viewId, editor); controllers.set(this.options.boardId, this)
  return () => { if (editors.get(viewId) === editor) editors.delete(viewId); detach() }
}
for (const action of ['undo', 'redo'] as const) {
  const original = CanvasController.prototype[action]
  CanvasController.prototype[action] = async function() {
    const call: (typeof historyCalls)[number] = { action, boardId: this.options.boardId, before: this.getState().board?.revision }
    historyCalls.push(call)
    try { await original.call(this); call.after = this.getState().board?.revision }
    catch (error) { call.error = String(error); throw error }
  }
}
function initialDocument(): CanvasDocument {
  const store = createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils })
  store.put([DocumentRecordType.create({ id: TLDOCUMENT_ID }), PageRecordType.create({ id: PageRecordType.createId('page'), name: 'Page 1', index: getIndexAbove(null) })])
  return validateCanvasDocument(store.getStoreSnapshot())
}
async function hash(document: CanvasDocument) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(document)))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
for (const boardId of ['board-a', 'board-b']) {
  const document = initialDocument(), now = new Date().toISOString()
  boards.set(boardId, { boardId, owner: scope, title: boardId === 'board-a' ? '设计画板' : '独立画板', revision: 0, documentHash: await hash(document), createdAt: now, updatedAt: now, document })
}
async function request(command: CanvasRequest): Promise<CanvasResponse> {
  calls.push({ action: command.action, ...('boardId' in command ? { boardId: command.boardId } : {}), ...('operationId' in command ? { operationId: command.operationId } : {}), ...('expectedRevision' in command ? { expectedRevision: command.expectedRevision } : {}) })
  if (command.action === 'list') return [...boards.values()].map(({ document: _document, ...board }) => clone(board))
  if (!('boardId' in command)) throw new Error('Fixture request is outside the view test')
  const board = boards.get(command.boardId)
  if (!board) throw new CanvasError('NOT_FOUND', 'Fixture board not found')
  if (command.action === 'open') return clone(board)
  if (command.action === 'receipt') return clone(receipts.get(`${command.boardId}:${command.operationId}`)?.result.receipt ?? null)
  if (command.action !== 'commit') throw new Error(`Fixture does not claim to validate host ${command.action}`)
  if (failWrites) throw new CanvasError('IO_ERROR', 'Fixture injected durable-save failure')
  const key = `${command.boardId}:${command.operationId}`, fingerprint = JSON.stringify(command), saved = receipts.get(key)
  if (saved) {
    if (saved.fingerprint !== fingerprint) throw new CanvasError('OPERATION_CONFLICT', 'Fixture operation changed')
    return { ...clone(saved.result), replayed: true }
  }
  if (command.expectedRevision !== board.revision) throw new CanvasError('CONFLICT', 'Fixture revision conflict')
  const next = clone(board.document), changes = command.changes
  for (const [id, record] of Object.entries(changes.added)) { if (next.store[id]) throw new CanvasError('CONFLICT', 'Fixture duplicate record'); next.store[id] = clone(record) }
  for (const [id, [before, after]] of Object.entries(changes.updated)) { if (canonical(next.store[id]) !== canonical(before)) throw new CanvasError('CONFLICT', 'Fixture changed record'); next.store[id] = clone(after) }
  for (const [id, record] of Object.entries(changes.removed)) { if (canonical(next.store[id]) !== canonical(record)) throw new CanvasError('CONFLICT', 'Fixture removed record'); delete next.store[id] }
  try { validateCanvasDocument(next) } catch (error) { const parsed = canvasDocumentSchema.safeParse(next); diagnostic = { command, next, issues: parsed.success ? [] : parsed.error.issues }; throw error }
  const now = new Date().toISOString(), nextBoard = { ...board, revision: board.revision + 1, updatedAt: now, document: next, documentHash: await hash(next) }
  const result: CanvasMutationResult = { board: nextBoard, replayed: false, receipt: { operationId: command.operationId, boardId: board.boardId, previousRevision: board.revision, revision: nextBoard.revision, documentHash: nextBoard.documentHash, changedRecordIds: [...Object.keys(changes.added), ...Object.keys(changes.updated), ...Object.keys(changes.removed)], committedAt: now } }
  boards.set(board.boardId, nextBoard); receipts.set(key, { fingerprint, result: clone(result) })
  if (loseResponse) { loseResponse = false; throw new Error('Fixture injected lost response after commit') }
  return clone(result)
}
const api: DesktopApi = {
  request: (async (method: string, input: { command: CanvasRequest }) => { if (method === 'canvasCommand') return request(input.command); throw new Error(`Unexpected fixture IPC: ${method}`) }) as DesktopApi['request'],
  subscribe: () => () => {}, writeClipboardText: async value => { clipboard = value },
}
const parallelA = new CanvasController({ boardId: 'board-a', scope, request }), parallelB = new CanvasController({ boardId: 'board-b', scope, request })
await Promise.all([parallelA.load(), parallelB.load()])

function Fixture() {
  const [mode, updateMode] = useState<'workspace' | 'parallel'>('workspace'), [placement, updatePlacement] = useState<CanvasPlacement>('right')
  const [enabled, updateEnabled] = useState(true), [closed, updateClosed] = useState(false), [centerHost, updateCenterHost] = useState<HTMLDivElement | null>(null)
  const [parallelVisible, updateParallelVisible] = useState(true)
  const handle = useRef<CanvasWorkspaceHandle | null>(null)
  setMode = updateMode; setEnabled = updateEnabled; setParallelVisible = updateParallelVisible
  closeWorkspace = async () => { try { await handle.current?.flush(); updateClosed(true); return true } catch { return false } }
  holdWorkspace = async id => { await handle.current?.flushForHost(id) }; resumeWorkspace = id => handle.current?.resumeHost(id)
  return <main style={{ height: '100vh', width: '100vw', display: 'flex', minHeight: 0 }}>
    {mode === 'workspace' ? <>
      <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
        <div data-fixture-chat inert={placement === 'center' || undefined} style={{ display: placement === 'center' ? 'none' : 'block', padding: 24 }}><label>草稿<input aria-label="Fixture chat draft" defaultValue="原聊天草稿" /></label></div>
        <div ref={updateCenterHost} data-fixture-center style={{ flex: 1, minHeight: 0, display: placement === 'center' ? 'flex' : 'none' }} />
      </section>
      {!closed && <aside data-fixture-right style={{ width: placement === 'right' ? 640 : 0, minWidth: 0, minHeight: 0, display: 'flex' }}><CanvasWorkspace ref={handle} api={api} target={{ type: 'canvas', id: 'board-a', name: '设计画板', ...scope }} active enabled={enabled} placement={placement} centerHost={centerHost} onPlacement={updatePlacement} /></aside>}
    </> : parallelVisible && <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', minHeight: 0 }}>
      <CanvasView controller={parallelA} viewId="parallel-a" onSelection={selection => { selections['parallel-a'] = selection.shapeIds }} />
      <CanvasView controller={parallelA} viewId="parallel-b" onSelection={selection => { selections['parallel-b'] = selection.shapeIds }} />
      <CanvasView controller={parallelB} viewId="other-board" onSelection={selection => { selections['other-board'] = selection.shapeIds }} />
    </div>}
    <Toaster />
  </main>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)

const fixture = {
  ready: () => [...editors.keys()],
  async mode(mode: 'workspace' | 'parallel') { await Promise.all([...new Set(controllers.values())].map(controller => controller.flush())); if (mode === 'parallel') await Promise.all([parallelA.refresh(), parallelB.refresh()]); setMode(mode) },
  enabled: (value: boolean) => setEnabled(value),
  visible: (value: boolean) => setParallelVisible(value),
  add(view: string, id: string, x: number, y = 80) { editors.get(view)!.createShape({ id: id as TLShapeId, type: 'geo', x, y, props: { w: 160, h: 90, geo: 'rectangle', color: 'blue' } }) },
  update(view: string, id: string, patch: { x?: number; y?: number }) { editors.get(view)!.updateShape({ id: id as TLShapeId, type: 'geo', ...patch }) },
  tool(view: string, type: string) { editors.get(view)!.setCurrentTool(type) },
  camera(view: string, camera: { x: number; y: number; z: number }) { editors.get(view)!.setCamera(camera) },
  select(view: string, ids: string[]) { editors.get(view)!.select(...ids as TLShapeId[]) },
  view(view: string) { const editor = editors.get(view)!; return { shapeIds: [...editor.getCurrentPageShapeIds()], shapes: editor.getCurrentPageShapes().map(shape => ({ id: shape.id, x: shape.x, y: shape.y, props: shape.props })), camera: clone(editor.getCamera()) as TLCamera, selectedIds: [...editor.getSelectedShapeIds()], focused: editor.getInstanceState().isFocused, editing: editor.getEditingShapeId() } },
  state: (boardId: string) => clone(controllers.get(boardId)?.getState()),
  board: (boardId: string) => clone(boards.get(boardId)),
  flush: (boardId: string) => controllers.get(boardId)!.flush(),
  undo: (boardId: string) => controllers.get(boardId)!.undo(),
  redo: (boardId: string) => controllers.get(boardId)!.redo(),
  discard: (boardId: string) => controllers.get(boardId)!.reloadDiscardingDrafts(),
  async remoteUpdate(boardId: string, id: string, patch: { x?: number; y?: number }) { const board = clone(boards.get(boardId)!); Object.assign(board.document.store[id]!, patch); board.revision++; board.documentHash = await hash(board.document); boards.set(boardId, board); await controllers.get(boardId)!.refresh() },
  failWrites: (value: boolean) => { failWrites = value },
  loseNextResponse: () => { loseResponse = true },
  calls: () => clone(calls),
  close: () => closeWorkspace(),
  hold: (id: string) => holdWorkspace(id),
  resume: (id: string) => resumeWorkspace(id),
  clipboard: () => clipboard,
  diagnostic: (): unknown => clone({ validation: diagnostic, calls, historyCalls, states: [...controllers].map(([id, controller]) => ({ id, state: controller.getState() })), views: [...editors.keys()].map(id => ({ id, ...fixture.view(id) })) }),
}
Object.assign(window, { canvasFixture: fixture })
declare global { interface Window { canvasFixture: typeof fixture } }
