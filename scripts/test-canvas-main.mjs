/*
 * [INPUT]: Current verified full build and the real Main/preload/runtime/renderer.
 * [OUTPUT]: Isolated offscreen canvas IPC, nonzero editor layout, drawing/save, three placements and native download evidence.
 * [POS]: Opt-in application integration probe; never displays/focuses windows or calls a model. Run pnpm build first.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { _electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { workspaceRoot } from './workspace-packages.mjs'
import { verifyBuildIdentity } from './build-identity.mjs'
process.chdir(workspaceRoot)
const build = await verifyBuildIdentity(workspaceRoot)
const output = resolve(process.env.BOAI_CANVAS_MAIN_EVIDENCE ?? '.local/canvas-main-acceptance')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, 'attempt-'))
const env = { ...process.env, BOAI_DATA_DIR: join(directory, 'profile'), BOAI_CANVAS_MAIN_ENTRY: resolve('dist/main/main.cjs'), NODE_ENV: 'test' }
delete env.ELECTRON_RUN_AS_NODE; delete env.BOAI_RENDERER_URL
await mkdir(directory, { recursive: true })
await writeFile(join(directory, 'bootstrap.cjs'), `const { app, BrowserWindow, session } = require('electron')
// Suppress presentation only; run the actual compiled Main/preload/runtime and renderer.
BrowserWindow.prototype.show = function () { this.setFocusable(false) }
BrowserWindow.prototype.showInactive = function () { this.setFocusable(false) }
BrowserWindow.prototype.focus = function () {}
app.on('browser-window-created', (_event, window) => { window.setFocusable(false); window.webContents.setBackgroundThrottling(false) })
app.on('ready', () => { if (process.platform === 'darwin') { app.setActivationPolicy('prohibited'); app.dock.hide() } })
app.on('ready', () => {
  globalThis.__canvasSmokeDownloads = []
  session.defaultSession.on('will-download', (_event, item) => {
    const path = require('node:path').join(process.env.BOAI_DATA_DIR, 'ui-export.tldr')
    item.setSavePath(path)
    const record = { path, state: 'started' }; globalThis.__canvasSmokeDownloads.push(record)
    item.once('done', (_event, state) => { record.state = state })
  })
})
require(process.env.BOAI_CANVAS_MAIN_ENTRY)
`)
let app
try {
  app = await _electron.launch({ args: [join(directory, 'bootstrap.cjs')], env, timeout: 30_000 })
  const page = await app.firstWindow(); page.setDefaultTimeout(30_000)
  await page.waitForFunction(() => Boolean(window.boai))
  const result = await page.evaluate(async () => {
    const api = window.boai
    const snapshot = await api.request('snapshot', undefined)
    const employeeId = snapshot.agents.find(agent => agent.id === 'researcher').id
    const room = await api.request('createConversation', { kind: 'direct', title: 'Canvas Main integration', agentIds: [employeeId], mode: 'mention', sharedKnowledgeIds: [] })
    const settings = await api.request('getPluginSettings', undefined)
    await api.request('setPluginEnabled', { id: 'boai.canvas.tldraw', enabled: true, expectedRevision: settings.revision })
    const scope = { employeeId, conversationId: room.id }
    const created = await api.request('canvasCommand', { scope, command: { action: 'create', title: 'Main IPC board', operationId: 'main-smoke-create' } })
    const opened = await api.request('canvasCommand', { scope, command: { action: 'open', boardId: created.board.boardId } })
    await api.request('canvasFlushed', { id: crypto.randomUUID() })
    let privateHostError
    try { await api.request('canvasHost', { type: 'discard', filter: { conversationId: room.id }, cleanupId: 'forbidden' }) }
    catch (error) { privateHostError = String(error) }
    return { scope, roomTitle: room.title, createdId: created.board.boardId, reopenedId: opened.boardId, revision: opened.revision, privateHostError }
  })
  assert.equal(result.createdId, result.reopenedId)
  assert.equal(result.revision, 0)
  assert.match(result.privateHostError, /尚未加载|未公开|不支持/)
  await page.getByRole('button', { name: result.roomTitle, exact: true }).click()
  await page.getByRole('button', { name: '画板', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Main IPC board', exact: true }).click()
  const surface = page.locator('[data-canvas-placement="right"] [data-testid="canvas"]')
  await surface.waitFor()
  const bounds = await surface.boundingBox()
  assert.ok(bounds && bounds.width > 200 && bounds.height > 240, 'The real editor must fill the right panel')
  await page.mouse.click(bounds.x + 60, bounds.y + 120)
  await page.keyboard.press('r')
  await page.mouse.move(bounds.x + 70, bounds.y + 140); await page.mouse.down()
  await page.mouse.move(bounds.x + 210, bounds.y + 250, { steps: 8 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存画板', exact: true }).click()
  await expect.poll(() => page.evaluate(async ({ scope, createdId }) => {
    const board = await window.boai.request('canvasCommand', { scope, command: { action: 'open', boardId: createdId } })
    return Object.values(board.document.store).filter(record => record.typeName === 'shape').length
  }, result)).toBe(1)
  for (const [placement, label] of [['center', '中间区域'], ['dialog', '弹窗'], ['right', '右侧面板']]) {
    await page.getByRole('button', { name: '画板显示位置', exact: true }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.locator(`[data-canvas-placement="${placement}"] [data-testid="canvas"]`).waitFor()
  }
  await page.getByRole('button', { name: '保存画板', exact: true }).click()
  await page.getByRole('button', { name: '导出画板', exact: true }).click()
  await page.getByRole('menuitem', { name: '可编辑 .tldr', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.__canvasSmokeDownloads.at(-1)?.state), { timeout: 20_000 }).toBe('completed')
  const download = await app.evaluate(() => globalThis.__canvasSmokeDownloads.at(-1))
  const exported = JSON.parse(await readFile(download.path, 'utf8'))
  assert.equal(exported.tldrawFileFormatVersion, 1)
  assert.equal(exported.records.filter(record => record.typeName === 'shape').length, 1)
  await page.screenshot({ path: join(directory, 'right.png') })
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), focusable: window.isFocusable(), focused: window.isFocused() })))
  assert.ok(windows.every(window => !window.visible && !window.focusable && !window.focused))
  await writeFile(join(directory, 'result.json'), JSON.stringify({ passed: true, build, result, bounds, download, windows, checks: ['trusted-create', 'trusted-reopen', 'flush-ack', 'private-host-denied', 'no-visible-or-focused-window', 'right-view', 'draw-and-save', 'center-view', 'dialog-view', 'return-right', 'save-ui', 'tldr-download'] }, null, 2))
  console.log(JSON.stringify({ passed: true, directory, checks: 12 }))
} catch (error) {
  if (app) { const p = await app.firstWindow(); await p.screenshot({ path: join(directory, 'failure.png') }).catch(() => {}); console.log(await p.locator('body').innerText().catch(() => '')); }
  await writeFile(join(directory, 'failure.txt'), String(error.stack ?? error)); throw error
} finally { await app?.close() }
