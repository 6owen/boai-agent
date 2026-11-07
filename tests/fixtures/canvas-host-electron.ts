/*
 * [INPUT]: Dedicated renderer/preload builds and a new attempt directory supplied by test-canvas-host.mjs.
 * [OUTPUT]: Real hidden Electron canvas edits, image/font exports, cancellation, backup restore and source cleanup receipts.
 * [POS]: WT4 host acceptance fixture; no personal profile, visible window, arbitrary script or model request.
 * [PROTOCOL]: Update Header and fixtures/.folder.md when this file changes.
 */
import { app, BrowserWindow, nativeImage } from 'electron'
import { join, resolve } from 'node:path'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { strict as assert } from 'node:assert'
import { ElectronCanvasHost } from '../../apps/electron/src/main/canvas-host'
import type { CanvasBoard, CanvasMutationResult, CanvasExportResult, CanvasScope } from '../../packages/canvas-plugin/src/protocol'

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required; use scripts/test-canvas-host.mjs`); return resolve(value) }
const root = required('BOAI_CANVAS_HOST_ATTEMPT'), preloadPath = required('BOAI_CANVAS_HOST_PRELOAD'), rendererFile = required('BOAI_CANVAS_HOST_RENDERER')
app.setPath('userData', join(root, 'electron-profile'))
app.commandLine.appendSwitch('disable-gpu')
app.on('window-all-closed', () => {})
const checks: { name: string; elapsedMs: number }[] = [], artifacts: { format: string; path: string; bytes: number; sha256: string }[] = []
const windowFacts: { id: number; visible: boolean; focusable: boolean; destroyed: boolean }[] = []
app.on('browser-window-created', (_event, window) => {
  const fact = { id: window.id, visible: window.isVisible(), focusable: window.isFocusable(), destroyed: false }
  windowFacts.push(fact)
  window.on('show', () => { fact.visible = true })
  window.once('closed', () => { fact.destroyed = true })
})
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const richText = (value: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] })
async function check<T>(name: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now(), result = await run()
  checks.push({ name, elapsedMs: Math.round(performance.now() - start) }); process.stdout.write(`PASS ${name}\n`)
  return result
}

void app.whenReady().then(async () => {
  app.dock?.hide()
  await mkdir(join(root, 'artifacts'), { recursive: true })
  let enabled = true
  const scope: CanvasScope = { employeeId: 'canvas-test-employee', conversationId: 'canvas-test-conversation' }
  const options = { rootDirectory: join(root, 'documents'), preloadPath, rendererFile, enabled: () => enabled, authorize: async (current: CanvasScope) => { assert.deepEqual(current, scope) }, mainWindow: () => undefined }
  let host = new ElectronCanvasHost(options)
  try {
    let board = await check('hidden-create', async () => (await host.request({ scope, command: { action: 'create', operationId: 'create-board-1', title: '员工协作画板' } }) as CanvasMutationResult).board)
    const initial = { action: 'edit' as const, boardId: board.boardId, expectedRevision: board.revision, operationId: 'edit-initial', operations: [
      { type: 'create' as const, shapes: [{ id: 'shape:a', type: 'geo' as const, x: 80, y: 80, props: { w: 200, h: 120, geo: 'rectangle', richText: richText('Start 开始') } }, { id: 'shape:b', type: 'geo' as const, x: 480, y: 80, props: { w: 200, h: 120, geo: 'ellipse', richText: richText('Finish 完成') } }] },
      { type: 'connect' as const, arrowId: 'shape:arrow', fromShapeId: 'shape:a', toShapeId: 'shape:b' },
    ] }
    board = await check('hidden-employee-edit-bindings', async () => {
      const value = (await host.call({ type: 'call', executionId: 'agent-edit-1', scope, command: initial }) as CanvasMutationResult).board
      assert.equal(value.document.store['shape:a']?.type, 'geo'); assert.equal(Object.values(value.document.store).filter(record => record.typeName === 'binding').length, 2)
      return value
    })
    await check('durable-idempotency', async () => {
      const value = await host.call({ type: 'call', executionId: 'agent-edit-replay', scope, command: initial }) as CanvasMutationResult
      assert.equal(value.replayed, true); assert.equal(value.board.revision, board.revision)
    })
    await check('revision-conflict', () => assert.rejects(host.call({ type: 'call', executionId: 'agent-conflict', scope, command: { ...initial, operationId: 'different-operation' } }), /版本|revision|变化|冲突|更新/))
    const bitmap = Buffer.alloc(32 * 24 * 4)
    for (let offset = 0; offset < bitmap.length; offset += 4) { bitmap[offset] = 240; bitmap[offset + 1] = 30; bitmap[offset + 2] = 230; bitmap[offset + 3] = 255 }
    const imageBytes = nativeImage.createFromBitmap(bitmap, { width: 32, height: 24, scaleFactor: 1 }).toPNG(), src = `data:image/png;base64,${imageBytes.toString('base64')}`
    await writeFile(join(root, 'artifacts', 'source-image.png'), imageBytes)
    board = await check('actual-raster-image-add-and-edit', async () => {
      const inserted = (await host.call({ type: 'call', executionId: 'agent-image', scope, command: { action: 'edit', boardId: board.boardId, expectedRevision: board.revision, operationId: 'insert-image', operations: [{ type: 'image', id: 'shape:image', assetId: 'asset:image', src, width: 32, height: 24, x: 320, y: 280 }] } }) as CanvasMutationResult).board
      assert.equal((inserted.document.store['asset:image']!.props as { src: string }).src, src)
      const updated = (await host.call({ type: 'call', executionId: 'agent-image-edit', scope, command: { action: 'edit', boardId: inserted.boardId, expectedRevision: inserted.revision, operationId: 'move-image', operations: [{ type: 'update', shapes: [{ id: 'shape:image', x: 360, y: 250, props: { w: 96, h: 72 } }] }] } }) as CanvasMutationResult).board
      assert.equal(updated.document.store['shape:image']!.x, 360); assert.equal((updated.document.store['shape:image']!.props as { w: number }).w, 96)
      return updated
    })
    let imported!: CanvasBoard
    for (const format of ['png', 'svg', 'tldr'] as const) {
      const file = await check(`real-${format}-export`, async () => {
        const result = await host.request({ scope, command: { action: 'export', boardId: board.boardId, revision: board.revision, format } }) as CanvasExportResult
        const bytes = Buffer.from(result.base64, 'base64'), path = join(root, 'artifacts', `board.${format}`)
        assert.equal(bytes.length, result.bytes); assert.equal(hash(bytes), result.sha256); assert.deepEqual(await readFile(result.path), bytes); assert.ok(result.bytes > 100)
        await writeFile(path, bytes); artifacts.push({ format, path, bytes: bytes.length, sha256: result.sha256 })
        if (format === 'svg') { const svg = bytes.toString(); assert.match(svg, /@font-face/); assert.match(svg, /data:(?:font|application)\//); assert.match(svg, /data:image\/png;base64,/); assert.match(svg, /Start/); assert.match(svg, /Finish/) }
        if (format === 'png') {
          const decoded = nativeImage.createFromBuffer(bytes), size = decoded.getSize(), pixels = decoded.toBitmap()
          assert.ok(size.width > 600 && size.height > 200)
          let magenta = 0
          for (let offset = 0; offset < pixels.length; offset += 4) if (pixels[offset]! > 180 && pixels[offset + 1]! < 80 && pixels[offset + 2]! > 180 && pixels[offset + 3]! > 240) magenta++
          assert.ok(magenta > 100, `Exported PNG must contain the actual raster image; found ${magenta} magenta pixels`)
        }
        return result
      })
      if (format === 'tldr') imported = await check('official-tldr-roundtrip', async () => {
        const value = (await host.request({ scope, command: { action: 'import', operationId: 'roundtrip', title: '重开画板', file: Buffer.from(file.base64, 'base64').toString('utf8') } }) as CanvasMutationResult).board
        assert.deepEqual(Object.keys(value.document.store).sort(), Object.keys(board.document.store).sort())
        assert.equal((value.document.store['asset:image']!.props as { src: string }).src, src)
        assert.equal(value.document.store['shape:image']!.x, 360)
        return value
      })
    }
    await check('renderer-release-no-visible-window', async () => { assert.equal(BrowserWindow.getAllWindows().length, 0); assert.ok(windowFacts.length > 0); assert.ok(windowFacts.every(value => !value.visible && !value.focusable && value.destroyed)) })
    await check('actual-renderer-cancel-waits-for-destruction', async () => {
      let rendered: BrowserWindow | undefined, cancelled: Promise<unknown> | undefined
      const opened = (_event: Electron.Event, window: BrowserWindow) => {
        rendered = window
        window.webContents.once('dom-ready', () => { cancelled = host.call({ type: 'cancel', executionId: 'cancel-live-renderer', scope }) })
      }
      app.once('browser-window-created', opened)
      try {
        await assert.rejects(host.call({ type: 'call', executionId: 'cancel-live-renderer', scope, command: { action: 'edit', boardId: board.boardId, expectedRevision: board.revision, operationId: 'cancelled-edit', operations: [{ type: 'update', shapes: [{ id: 'shape:a', x: 100 }] }] } }), /取消|abort/i)
        assert.ok(rendered, 'An actual hidden renderer must have opened'); assert.ok(cancelled, 'Cancellation must occur after DOM readiness')
        await cancelled
        assert.equal(rendered.isDestroyed(), true); assert.equal(BrowserWindow.getAllWindows().length, 0); assert.equal(host.busy, false)
        assert.equal(await host.request({ scope, command: { action: 'receipt', boardId: board.boardId, operationId: 'cancelled-edit' } }), null)
      } finally { app.removeListener('browser-window-created', opened) }
    })
    await check('disable-restart-preserves-document', async () => {
      enabled = false; await host.refresh()
      await assert.rejects(host.request({ scope, command: { action: 'open', boardId: board.boardId } }), /停用/)
      await host.close(); enabled = true; host = new ElectronCanvasHost(options)
      assert.equal((await host.request({ scope, command: { action: 'open', boardId: board.boardId } }) as CanvasBoard).documentHash, board.documentHash)
    })
    await check('coordinated-backup-root-relocation', async () => {
      const restored = join(root, 'restored-documents')
      await host.coordinatedBackup(() => cp(options.rootDirectory, restored, { recursive: true, dereference: false }))
      await host.close(); host = new ElectronCanvasHost({ ...options, rootDirectory: restored })
      assert.deepEqual(await host.request({ scope, command: { action: 'open', boardId: board.boardId } }), board)
      assert.deepEqual(await host.request({ scope, command: { action: 'open', boardId: imported.boardId } }), imported)
    })
    await check('explicit-source-discard-and-idempotent-retry', async () => {
      const command = { type: 'discard' as const, filter: scope, cleanupId: 'source-cleanup' }
      const result = await host.call(command)
      assert.ok(result && typeof result === 'object' && 'preserved' in result); assert.deepEqual(result.preserved, [])
      await assert.rejects(host.request({ scope, command: { action: 'open', boardId: board.boardId } }), { code: 'NOT_FOUND' })
      assert.deepEqual(await host.call(command), result)
      assert.deepEqual(await host.request({ scope, command: { action: 'list' } }), [])
    })
    await host.close()
    assert.ok(windowFacts.every(value => !value.visible && !value.focusable && value.destroyed)); assert.equal(BrowserWindow.getAllWindows().length, 0)
    await writeFile(join(root, 'result.json'), JSON.stringify({ ok: true, checks, artifacts, windows: windowFacts, actualElectron: process.versions.electron, finishedAt: new Date().toISOString() }, null, 2) + '\n')
    app.exit(0)
  } catch (error) {
    await host.close().catch(() => {})
    await writeFile(join(root, 'result.json'), JSON.stringify({ ok: false, checks, artifacts, windows: windowFacts, error: String(error), stack: error instanceof Error ? error.stack : null, actualElectron: process.versions.electron, finishedAt: new Date().toISOString() }, null, 2) + '\n')
    process.stderr.write(String(error instanceof Error ? error.stack : error) + '\n'); app.exit(1)
  }
}).catch(async error => { await mkdir(root, { recursive: true }); await writeFile(join(root, 'result.json'), JSON.stringify({ ok: false, checks, error: String(error) }, null, 2)); process.stderr.write(String(error) + '\n'); app.exit(1) })
