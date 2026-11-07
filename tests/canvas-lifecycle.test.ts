/*
 * [INPUT]: Real Main canvas host, controlled Electron events, isolated documents and real Runtime/SQLite source state.
 * [OUTPUT]: Backup flush/drain/hold/resume, cleanup lifecycle barriers, source revocation and portable canvas snapshot evidence.
 * [POS]: WT4 Main/Runtime integration acceptance; no browser window, model or personal profile is used.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ElectronCanvasHost } from '../apps/electron/src/main/canvas-host'
import { createCanvasHostBarrier, type CanvasHostEvent } from '../apps/electron/src/renderer/components/canvas/host-barrier'
import { CanvasDocumentRepository, canvasScopeKey } from '../packages/canvas-plugin/src/document'
import type { CanvasBoard, CanvasDocument, CanvasRequest, CanvasScope } from '../packages/canvas-plugin/src/protocol'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { Conversation } from '../packages/shared/src/domain'

const electron = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeListener: vi.fn(), windows: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: electron, BrowserWindow: class { constructor() { electron.windows(); throw new Error('This lifecycle test must not create a window') } } }))
const requireCanvas = createRequire(new URL('../packages/canvas-plugin/package.json', import.meta.url))
const { createTLSchema } = requireCanvas('@tldraw/tlschema') as { createTLSchema(): { serialize(): Record<string, unknown> } }
const disposals: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); vi.restoreAllMocks(); expect(electron.windows).not.toHaveBeenCalled() })
const scope: CanvasScope = { employeeId: 'employee-a', conversationId: 'conversation-a' }
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII='
const document = (): CanvasDocument => ({ schema: createTLSchema().serialize(), store: {
  'document:document': { id: 'document:document', typeName: 'document', name: '', gridSize: 10, meta: {} },
  'page:page': { id: 'page:page', typeName: 'page', name: 'Page', index: 'a1', meta: {} },
  'asset:image': { id: 'asset:image', typeName: 'asset', type: 'image', props: { src: png, name: 'pixel.png', w: 1, h: 1, mimeType: 'image/png', isAnimated: false }, meta: {} },
} })
function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const turn = () => new Promise<void>(resolve => setImmediate(resolve))
async function temp() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-canvas-lifecycle-'))); disposals.push(() => rm(root, { recursive: true, force: true })); return root }
function change(board: CanvasBoard, operationId = 'human-save'): CanvasRequest {
  const before = board.document.store['page:page']!
  return { action: 'commit', boardId: board.boardId, expectedRevision: board.revision, operationId, changes: { added: {}, removed: {}, updated: { [before.id]: [before, { ...before, name: 'Saved before backup' }] } } }
}
async function mainFixture(options: { root?: string; authorize?: (scope: CanvasScope) => Promise<void>; hasWindow?: boolean } = {}) {
  const root = options.root ?? join(await temp(), 'canvases')
  const documents = new CanvasDocumentRepository(root), events: CanvasHostEvent[] = []
  let onEvent: (event: CanvasHostEvent) => void = event => { if (event.type === 'canvas:flush') host.flushed({ id: event.id }) }
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false, webContents: { send: (_channel: string, event: CanvasHostEvent) => { events.push(event); onEvent(event) } } })
  const host = new ElectronCanvasHost({ rootDirectory: root, preloadPath: '/unused', rendererFile: '/unused', enabled: () => true, authorize: options.authorize ?? (async () => {}), mainWindow: () => options.hasWindow === false ? undefined : window as unknown as BrowserWindow })
  disposals.push(() => host.close())
  const create = (owner = scope, operationId = 'create') => documents.create(owner, { operationId, title: operationId, intent: { action: 'create' }, initialize: async () => document() })
  return { root, documents, host, events, window, create, onEvent: (handler: typeof onEvent) => { onEvent = handler } }
}
async function runtimeFixture() {
  const root = await temp(), dataPath = join(root, 'v2')
  const engine = { run: vi.fn(async () => {}), test: vi.fn(async () => 'ok') }
  const open = async (path = dataPath) => {
    const service = new AppService({ dataPath: path, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, skillDiscovery: { homeDir: join(root, 'isolated-home') }, emit: () => {} })
    disposals.push(() => service.close()); await service.init(); return service
  }
  const service = await open()
  const conversation = await service.handle('createConversation', { kind: 'group', title: 'Canvas source', agentIds: ['researcher', 'writer'] }) as Conversation
  return { root, dataPath, service, conversation, engine, open }
}

it('flushes and holds visible edits before backup, blocks new writes and resumes the matching token after the snapshot', async () => {
  const f = await mainFixture(), { board } = await f.create(), flush = deferred(), snapshot = deferred()
  const held = new Set<string>(), resumeHost = vi.fn((id: string) => { held.delete(id) })
  const handle = { flush: async () => {}, resumeHost, flushForHost: async (id?: string) => { if (id) held.add(id); await flush.promise; await f.host.request({ scope, command: change(board) }) } }
  const barrier = createCanvasHostBarrier({ targets: () => [{ scope, boardId: board.boardId, handle }], reply: async value => f.host.flushed(value), errorText: String, onError: error => { throw error } })
  f.onEvent(event => { void barrier.receive(event) })
  let entered = false
  const backup = f.host.coordinatedBackup(async () => { entered = true; expect((await f.documents.open(scope, board.boardId)).revision).toBe(1); await snapshot.promise; return 'snapshot' })
  try {
    expect(held.size).toBe(1); expect(entered).toBe(false)
    await expect(f.host.request({ scope, command: { action: 'create', operationId: 'too-late', title: 'Late' } })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(f.host.call({ type: 'call', executionId: 'late-employee', scope, command: { action: 'list' } })).rejects.toMatchObject({ code: 'CONFLICT' })
    flush.resolve(); await vi.waitFor(() => expect(entered).toBe(true))
    await expect(f.host.request({ scope, command: change(board, 'during-backup') })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await f.host.request({ scope, command: { action: 'list' } })).toHaveLength(1)
    expect(held.size).toBe(1)
    snapshot.resolve(); expect(await backup).toBe('snapshot')
    const event = f.events.find(event => event.type === 'canvas:flush')!
    expect(resumeHost).toHaveBeenCalledExactlyOnceWith(event.id); expect(held.size).toBe(0)
    expect(f.events.at(-1)).toEqual({ type: 'canvas:resume', id: event.id })
  } finally { flush.resolve(); snapshot.resolve(); await backup.catch(() => {}) }
})

it('waits for an already admitted document write to finish before running the backup callback', async () => {
  const gate = deferred(), entered = deferred()
  let wait = true
  const f = await mainFixture({ authorize: async () => { if (wait) { wait = false; entered.resolve(); await gate.promise } } })
  const { board } = await f.create()
  const writing = f.host.request({ scope, command: change(board) }); await entered.promise
  let snapshotRevision: number | undefined
  const backup = f.host.coordinatedBackup(async () => { snapshotRevision = (await f.documents.open(scope, board.boardId)).revision })
  try {
    await turn(); expect(snapshotRevision).toBeUndefined()
    gate.resolve(); await writing; await backup
    expect(snapshotRevision).toBe(1)
  } finally { gate.resolve(); await Promise.allSettled([writing, backup]) }
})

it('releases held views after failed flush or failed snapshot and permits a later backup', async () => {
  const f = await mainFixture(); await f.create()
  const action = vi.fn(async () => {})
  f.onEvent(event => { if (event.type === 'canvas:flush') f.host.flushed({ id: event.id, error: 'unsaved edit conflict' }) })
  await expect(f.host.coordinatedBackup(action)).rejects.toThrow('unsaved edit conflict')
  expect(action).not.toHaveBeenCalled()
  expect(f.events.at(-1)).toMatchObject({ type: 'canvas:resume', id: f.events[0]!.id })
  f.onEvent(event => { if (event.type === 'canvas:flush') f.host.flushed({ id: event.id }) })
  await expect(f.host.coordinatedBackup(async () => { throw new Error('snapshot disk failure') })).rejects.toThrow('snapshot disk failure')
  expect(f.events.at(-1)).toMatchObject({ type: 'canvas:resume', id: f.events.at(-2)!.id })
  expect(await f.host.coordinatedBackup(async () => 'retry')).toBe('retry')
  expect(await f.host.request({ scope, command: { action: 'list' } })).toHaveLength(1)
})

it('rejects source discard while the snapshot is frozen and permits the original cleanup after resume', async () => {
  const f = await mainFixture(), { board } = await f.create(), snapshot = deferred(), entered = deferred()
  const backup = f.host.coordinatedBackup(async () => { entered.resolve(); await snapshot.promise })
  try {
    await entered.promise
    const input = { type: 'discard' as const, filter: { conversationId: scope.conversationId }, cleanupId: 'source-delete' }
    await expect(f.host.call(input)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await f.documents.open(scope, board.boardId)).toEqual(board)
    snapshot.resolve(); await backup
    expect(await f.host.call(input)).toMatchObject({ deletedBoards: [{ scope, boardId: board.boardId }], preserved: [] })
  } finally { snapshot.resolve(); await backup.catch(() => {}) }
})

it.each(['backup', 'close'] as const)('keeps %s waiting for an already admitted source cleanup to exit', async mode => {
  const f = await mainFixture(), { board } = await f.create(), gate = deferred(), entered = deferred()
  const original = CanvasDocumentRepository.prototype.discardScope
  vi.spyOn(CanvasDocumentRepository.prototype, 'discardScope').mockImplementationOnce(async function (this: CanvasDocumentRepository, filter, cleanupId) { entered.resolve(); await gate.promise; return original.call(this, filter, cleanupId) })
  const cleanup = f.host.call({ type: 'discard', filter: scope, cleanupId: 'delete-before-lifecycle' }); await entered.promise
  let completed = false
  const lifecycle = (mode === 'backup' ? f.host.coordinatedBackup(async () => {}) : f.host.close()).then(() => { completed = true })
  try {
    await turn(); expect(f.host.busy).toBe(true); expect(completed).toBe(false)
    gate.resolve(); await cleanup; await lifecycle
    expect(completed).toBe(true); expect(f.host.busy).toBe(false)
    await expect(f.documents.open(scope, board.boardId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  } finally { gate.resolve(); await Promise.allSettled([cleanup, lifecycle]) }
})

it('aborts a pending flush on window close without entering backup and also supports a host with no visible window', async () => {
  const f = await mainFixture(), action = vi.fn(async () => 'backup')
  f.onEvent(() => {})
  const backup = f.host.coordinatedBackup(action), rejected = expect(backup).rejects.toMatchObject({ code: 'CANCELLED' })
  f.window.emit('closed'); await rejected
  expect(action).not.toHaveBeenCalled()
  const hidden = await mainFixture({ hasWindow: false })
  expect(await hidden.host.coordinatedBackup(action)).toBe('backup')
})

it('keeps Main authorization revoked after a real source cleanup conflict and after Runtime restart', async () => {
  const f = await runtimeFixture(), owner = { employeeId: 'researcher', conversationId: f.conversation.id }
  let service = f.service
  const main = await mainFixture({ root: join(f.dataPath, 'canvases'), authorize: async scope => { await service.handle('getWorkspaceRoot', scope) } })
  const { board } = await main.create(owner)
  const file = join(main.root, canvasScopeKey(owner), `${board.boardId}.json`), value = JSON.parse(await readFile(file, 'utf8'))
  value.board.title = 'Outside customized file'; const outside = JSON.stringify(value); await writeFile(file, outside)
  await expect(service.handle('clearConversationHistory', { id: f.conversation.id, hide: false })).rejects.toThrow('保留')
  const store = (service as unknown as { store: ProductStore }).store
  expect(await store.get('conversationCleanup', f.conversation.id)).toMatchObject({ canvasCleanupId: expect.any(String), canvasCleanupError: expect.any(String) })
  await expect(service.handle('getWorkspaceRoot', owner)).rejects.toThrow(/清理|关闭|不可用/)
  await expect(service.handle('validateWorkspaceScope', owner)).rejects.toThrow(/清理|关闭|不可用/)
  await expect(main.host.request({ scope: owner, command: { action: 'list' } })).rejects.toThrow(/清理|关闭|不可用/)
  await service.close(); service = await f.open()
  await expect(main.host.request({ scope: owner, command: { action: 'list' } })).rejects.toThrow(/清理|关闭|不可用/)
  expect(await readFile(file, 'utf8')).toBe(outside)
  expect(f.engine.run).not.toHaveBeenCalled()
})

it('copies exact canvas documents and embedded assets in the real Runtime backup and reopens them under a new data root', async () => {
  const f = await runtimeFixture(), owner = { employeeId: 'researcher', conversationId: f.conversation.id }
  const main = await mainFixture({ root: join(f.dataPath, 'canvases'), authorize: async scope => { await f.service.handle('getWorkspaceRoot', scope) } })
  const { board } = await main.create(owner)
  const relative = join(canvasScopeKey(owner), `${board.boardId}.json`), before = await readFile(join(main.root, relative))
  const backup = join(f.root, 'backup')
  await main.host.coordinatedBackup(() => f.service.backup(backup))
  expect(await readFile(join(backup, 'canvases', relative))).toEqual(before)
  expect(JSON.parse(await readFile(join(backup, 'backup.json'), 'utf8'))).toMatchObject({ canvasAssets: 'embedded-in-canvases' })
  expect(await readFile(join(backup, 'RESTORE.txt'), 'utf8')).toContain('canvases')
  const restored = join(f.root, 'restored'); await cp(backup, restored, { recursive: true })
  const service = await f.open(restored), restoredDocuments = new CanvasDocumentRepository(join(restored, 'canvases'))
  expect(await service.handle('validateWorkspaceScope', owner)).toBeUndefined()
  expect(await restoredDocuments.open(owner, board.boardId)).toEqual(board)
  expect((await restoredDocuments.open(owner, board.boardId)).document.store['asset:image']!.props).toMatchObject({ src: png })
  expect(f.engine.run).not.toHaveBeenCalled()
})
