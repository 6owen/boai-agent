/*
 * [INPUT]: Real canvas/BOAI view fixture, isolated CAS transport and hidden Chromium.
 * [OUTPUT]: Targeted screenshots and machine-readable checks for B-V02/03/04 and failed save lifecycle.
 * [POS]: WT4 view-only acceptance; does not run models, full E2E, personal Electron or host persistence tests.
 * [PROTOCOL]: Update Header and scripts/.folder.md when this file changes.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { workspaceViteAliases } from './workspace-packages.mjs'
import { designTokensPlugin } from './design-packages.mjs'

const output = resolve(process.env.BOAI_CANVAS_VIEW_EVIDENCE ?? '.local/canvas-view-acceptance')
await mkdir(output, { recursive: true })
const report = { status: 'running', checks: [], failures: [], browserErrors: [], externalRequests: [], screenshots: [], startedAt: new Date().toISOString() }
let server, browser, page
async function check(name, action) {
  try { await action(); report.checks.push(name); process.stdout.write(`PASS ${name}\n`) }
  catch (error) { report.failures.push({ name, error: error.stack ?? String(error) }); throw error }
}
async function shot(name) { const path = resolve(output, `${name}.png`); await page.screenshot({ path, fullPage: true, animations: 'disabled' }); report.screenshots.push(path) }
const viewId = placement => `fixture-employee:fixture-chat:board-a:${placement}`
const waitForView = view => expect.poll(() => page.evaluate(view => Boolean(window.canvasFixture?.ready().includes(view)), view), { timeout: 20000 }).toBe(true)
const readShape = async (view, id) => page.evaluate(({ view, id }) => window.canvasFixture.view(view).shapes.find(shape => shape.id === id), { view, id })

try {
  server = await createServer({ configFile: false, root: process.cwd(), cacheDir: resolve('.local/canvas-view-vite-cache'), resolve: { alias: [...workspaceViteAliases(), { find: '@', replacement: resolve('apps/electron/src/renderer') }, { find: '@shared', replacement: resolve('packages/shared/src') }] }, plugins: [react(), tailwindcss(), designTokensPlugin()], server: { host: '127.0.0.1', port: 0, strictPort: false }, optimizeDeps: { include: ['react', 'react-dom/client'], exclude: ['@tldraw/assets/imports.vite'] }, logLevel: 'warn' })
  await server.listen()
  const address = server.httpServer.address(), base = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 940 }, colorScheme: 'light' })
  page.on('pageerror', error => { report.browserErrors.push(error.stack ?? error.message) })
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) report.externalRequests.push(request.url()) })
  await page.goto(`${base}/tests/fixtures/canvas-view.html`)
  await check('StrictMode mounts the actual workspace and accepts a persisted editor change', async () => {
    await waitForView(viewId('right'))
    await page.evaluate(view => window.canvasFixture.add(view, 'shape:first', 80), viewId('right'))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    expect(await page.evaluate(() => window.canvasFixture.board('board-a').document.store['shape:first'].x)).toBe(80)
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(false)
    await shot('right')
  })
  await check('Host backup hold keeps the view inert until the matching resume', async () => {
    await page.evaluate(() => window.canvasFixture.hold('fixture-backup'))
    await expect(page.getByRole('button', { name: '保存画板', exact: true })).toBeDisabled()
    expect(await page.locator('[data-canvas-view]').evaluate(element => Boolean(element.closest('[inert]')))).toBe(true)
    await page.evaluate(() => window.canvasFixture.resume('unrelated'))
    await expect(page.getByRole('button', { name: '保存画板', exact: true })).toBeDisabled()
    await page.evaluate(() => window.canvasFixture.resume('fixture-backup'))
    await expect(page.getByRole('button', { name: '保存画板', exact: true })).toBeEnabled()
  })
  await check('Right center and Dialog reuse one document and restore each view session without replacing chat draft DOM', async () => {
    await page.getByLabel('Fixture chat draft').fill('keep this draft')
    await page.evaluate(view => { window.canvasFixture.camera(view, { x: 10, y: 20, z: 1.2 }); window.canvasFixture.select(view, ['shape:first']) }, viewId('right'))
    await page.getByRole('button', { name: '复制选区引用', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.canvasFixture.clipboard())).not.toBe('')
    expect(JSON.parse(await page.evaluate(() => window.canvasFixture.clipboard()))).toMatchObject({ boardId: 'board-a', viewId: viewId('right'), shapeIds: ['shape:first'] })
    const rightCamera = await page.evaluate(view => window.canvasFixture.view(view).camera, viewId('right'))
    await page.getByRole('button', { name: '画板显示位置', exact: true }).click()
    await page.getByRole('menuitem', { name: '中间区域', exact: true }).click()
    await waitForView(viewId('center'))
    expect(await readShape(viewId('center'), 'shape:first')).toMatchObject({ x: 80 })
    expect(await page.getByLabel('Fixture chat draft').inputValue()).toBe('keep this draft')
    await expect(page.getByLabel('Fixture chat draft')).toBeHidden()
    await page.evaluate(view => window.canvasFixture.camera(view, { x: -40, y: -55, z: 0.8 }), viewId('center'))
    await page.evaluate(view => window.canvasFixture.update(view, 'shape:first', { y: 140 }), viewId('center'))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    await shot('center')
    await page.getByRole('button', { name: '画板显示位置', exact: true }).click()
    await page.getByRole('menuitem', { name: '弹窗', exact: true }).click()
    await waitForView(viewId('dialog'))
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await readShape(viewId('dialog'), 'shape:first')).toMatchObject({ x: 80, y: 140 })
    await shot('dialog')
    await page.getByRole('button', { name: '返回右侧画板', exact: true }).click()
    await waitForView(viewId('right'))
    const restored = await page.evaluate(view => window.canvasFixture.view(view), viewId('right'))
    expect(restored.camera).toEqual(rightCamera)
    expect(restored.selectedIds).toEqual(['shape:first'])
    await expect(page.getByLabel('Fixture chat draft')).toHaveValue('keep this draft')
  })
  await check('A failed save blocks close and a lost acknowledgement retries the original operation only once', async () => {
    await page.evaluate(() => window.canvasFixture.failWrites(true))
    await page.evaluate(view => window.canvasFixture.update(view, 'shape:first', { x: 150 }), viewId('right'))
    await expect.poll(() => page.evaluate(() => Boolean(window.canvasFixture.state('board-a').error))).toBe(true)
    expect(await page.evaluate(() => window.canvasFixture.close())).toBe(false)
    await waitForView(viewId('right'))
    expect(await readShape(viewId('right'), 'shape:first')).toMatchObject({ x: 150 })
    await page.evaluate(() => window.canvasFixture.enabled(false))
    await expect(page.locator('[data-canvas-view]')).toHaveCount(0)
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(true)
    await page.evaluate(() => window.canvasFixture.enabled(true))
    await waitForView(viewId('right'))
    expect(await readShape(viewId('right'), 'shape:first')).toMatchObject({ x: 150 })
    await page.evaluate(() => window.canvasFixture.failWrites(false))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    await page.evaluate(() => window.canvasFixture.loseNextResponse())
    const before = await page.evaluate(() => window.canvasFixture.board('board-a').revision)
    await page.evaluate(view => window.canvasFixture.update(view, 'shape:first', { x: 175 }), viewId('right'))
    await expect.poll(() => page.evaluate(() => Boolean(window.canvasFixture.state('board-a').error))).toBe(true)
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    expect(await page.evaluate(() => window.canvasFixture.board('board-a').revision)).toBe(before + 1)
    const commits = await page.evaluate(() => window.canvasFixture.calls().filter(call => call.action === 'commit'))
    expect(commits.at(-1).operationId).toBe(commits.at(-2).operationId)
    await page.evaluate(() => window.canvasFixture.failWrites(true))
    await page.evaluate(view => window.canvasFixture.update(view, 'shape:first', { x: 195 }), viewId('right'))
    await expect.poll(() => page.evaluate(() => Boolean(window.canvasFixture.state('board-a').error))).toBe(true)
    await page.evaluate(() => window.canvasFixture.failWrites(false))
    await page.getByRole('button', { name: '刷新画板', exact: true }).click()
    await page.getByRole('menuitem', { name: '放弃未保存修改', exact: true }).hover()
    await page.getByRole('menuitem', { name: '确认放弃并重新载入', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(false)
    expect(await readShape(viewId('right'), 'shape:first')).toMatchObject({ x: 175 })
    expect(await page.evaluate(() => window.canvasFixture.close())).toBe(true)
    await expect(page.locator('[data-canvas-view]')).toHaveCount(0)
  })
  await page.evaluate(() => window.canvasFixture.mode('parallel'))
  await check('Two views share document changes while camera and selected shapes remain independent', async () => {
    await Promise.all(['parallel-a', 'parallel-b', 'other-board'].map(waitForView))
    await page.evaluate(() => { window.canvasFixture.camera('parallel-a', { x: 33, y: 44, z: 1.3 }); window.canvasFixture.camera('parallel-b', { x: -90, y: 25, z: 0.6 }); window.canvasFixture.select('parallel-a', ['shape:first']); window.canvasFixture.select('parallel-b', []) })
    const beforeB = await page.evaluate(() => window.canvasFixture.view('parallel-b'))
    await page.evaluate(() => window.canvasFixture.update('parallel-a', 'shape:first', { y: 230 }))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    expect(await readShape('parallel-b', 'shape:first')).toMatchObject({ x: 175, y: 230 })
    const afterB = await page.evaluate(() => window.canvasFixture.view('parallel-b'))
    expect(afterB.camera).toEqual(beforeB.camera); expect(afterB.selectedIds).toEqual([])
    expect(await page.evaluate(() => window.canvasFixture.view('parallel-a').selectedIds)).toEqual(['shape:first'])
    expect(await page.evaluate(() => window.canvasFixture.view('other-board').shapeIds)).toEqual([])
    await shot('independent-views')
  })
  await check('Two views editing different shapes in one turn retain both changes', async () => {
    await page.evaluate(() => { window.canvasFixture.add('parallel-a', 'shape:concurrent-a', 20); window.canvasFixture.add('parallel-b', 'shape:concurrent-b', 220) })
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    for (const view of ['parallel-a', 'parallel-b']) {
      expect(await readShape(view, 'shape:concurrent-a')).toMatchObject({ x: 20 })
      expect(await readShape(view, 'shape:concurrent-b')).toMatchObject({ x: 220 })
    }
  })
  await check('Undo follows committed order and never erases later manual changes or another board', async () => {
    await page.evaluate(() => window.canvasFixture.remoteUpdate('board-a', 'shape:first', { x: 260 }))
    await page.evaluate(() => window.canvasFixture.update('parallel-b', 'shape:first', { y: 330 }))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    await page.evaluate(() => window.canvasFixture.add('other-board', 'shape:separate', 10))
    await page.evaluate(() => window.canvasFixture.flush('board-b'))
    await page.evaluate(() => window.canvasFixture.undo('board-a'))
    expect(await readShape('parallel-a', 'shape:first')).toMatchObject({ x: 260, y: 230 })
    expect(await readShape('other-board', 'shape:separate')).toMatchObject({ x: 10 })
    await page.evaluate(() => window.canvasFixture.redo('board-a'))
    expect(await readShape('parallel-a', 'shape:first')).toMatchObject({ x: 260, y: 330 })
  })
  await check('Real pointer drawing and SDK keyboard shortcuts operate inside a view', async () => {
    await page.evaluate(() => { window.canvasFixture.camera('other-board', { x: 0, y: 0, z: 1 }); window.canvasFixture.tool('other-board', 'geo') })
    const canvas = page.locator('[data-canvas-view="other-board"] [data-testid="canvas"]'), box = await canvas.boundingBox()
    const before = await page.evaluate(() => window.canvasFixture.view('other-board').shapeIds.length)
    await page.mouse.move(box.x + 180, box.y + 260); await page.mouse.down(); await page.mouse.move(box.x + 340, box.y + 350, { steps: 8 }); await page.mouse.up()
    await page.evaluate(() => window.canvasFixture.flush('board-b'))
    expect(await page.evaluate(() => window.canvasFixture.view('other-board').shapeIds.length)).toBe(before + 1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => page.evaluate(() => window.canvasFixture.view('other-board').shapeIds.length)).toBe(before)
    await shot('pointer-and-keyboard')
  })
  await check('Pointer resize and move are one undo step each and Escape restores an unfinished gesture', async () => {
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(() => page.evaluate(() => window.canvasFixture.view('other-board').shapeIds.length)).toBe(2)
    const drawn = await page.evaluate(() => window.canvasFixture.view('other-board').shapes.find(shape => shape.id !== 'shape:separate'))
    await page.evaluate(id => { window.canvasFixture.tool('other-board', 'select'); window.canvasFixture.select('other-board', [id]) }, drawn.id)
    const box = await page.locator('[data-canvas-view="other-board"] [data-testid="canvas"]').boundingBox()
    await page.mouse.move(box.x + drawn.x, box.y + drawn.y + 40); await page.mouse.down(); await page.mouse.move(box.x + drawn.x + 60, box.y + drawn.y + 100, { steps: 8 }); await page.mouse.up()
    await page.evaluate(() => window.canvasFixture.flush('board-b'))
    expect(await readShape('other-board', drawn.id)).toMatchObject({ x: drawn.x + 60, y: drawn.y, props: { w: drawn.props.w - 60, h: drawn.props.h } })
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => readShape('other-board', drawn.id)).toMatchObject({ x: drawn.x, y: drawn.y, props: { w: drawn.props.w, h: drawn.props.h } })
    await page.mouse.move(box.x + drawn.x + 80, box.y + drawn.y + 45); await page.mouse.down(); await page.mouse.move(box.x + drawn.x + 140, box.y + drawn.y + 105, { steps: 8 }); await page.mouse.up()
    await page.evaluate(() => window.canvasFixture.flush('board-b'))
    expect(await readShape('other-board', drawn.id)).toMatchObject({ x: drawn.x + 60, y: drawn.y + 60 })
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => readShape('other-board', drawn.id)).toMatchObject({ x: drawn.x, y: drawn.y })
    await page.mouse.move(box.x + drawn.x + 80, box.y + drawn.y + 45); await page.mouse.down(); await page.mouse.move(box.x + drawn.x + 150, box.y + drawn.y + 115, { steps: 8 })
    await page.keyboard.press('Escape'); await page.mouse.up()
    await page.evaluate(() => window.canvasFixture.flush('board-b'))
    expect(await readShape('other-board', drawn.id)).toMatchObject({ x: drawn.x, y: drawn.y })
  })
  await check('Same-shape edits from two views either preserve both fields or retain an explicit conflict draft', async () => {
    await page.evaluate(() => window.canvasFixture.add('parallel-a', 'shape:shared-test', 400, 400))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').error)).toBeUndefined()
    await page.evaluate(() => { window.canvasFixture.update('parallel-a', 'shape:shared-test', { x: 410 }); window.canvasFixture.update('parallel-b', 'shape:shared-test', { y: 470 }) })
    await page.evaluate(() => window.canvasFixture.flush('board-a').catch(() => {}))
    const a = await readShape('parallel-a', 'shape:shared-test'), b = await readShape('parallel-b', 'shape:shared-test')
    const explicitConflict = await page.evaluate(() => Boolean(window.canvasFixture.state('board-a').error))
    expect(a.x === 410 && a.y === 470 && b.x === 410 && b.y === 470 || explicitConflict && (a.y === 470 || b.y === 470)).toBe(true)
    if (explicitConflict) {
      expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(true)
      await page.evaluate(() => window.canvasFixture.discard('board-a'))
    }
  })
  await check('A same-field conflict stays dirty, rejects flush, and restores the second view draft after remount', async () => {
    await page.evaluate(() => window.canvasFixture.add('parallel-a', 'shape:conflict-test', 600, 500))
    await page.evaluate(() => window.canvasFixture.flush('board-a'))
    await page.evaluate(() => { window.canvasFixture.update('parallel-a', 'shape:conflict-test', { x: 630 }); window.canvasFixture.update('parallel-b', 'shape:conflict-test', { x: 690 }) })
    expect(await page.evaluate(() => window.canvasFixture.flush('board-a').then(() => true, () => false))).toBe(false)
    expect(await page.evaluate(() => Boolean(window.canvasFixture.state('board-a').error))).toBe(true)
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(true)
    await page.evaluate(() => window.canvasFixture.visible(false))
    await expect(page.locator('[data-canvas-view]')).toHaveCount(0)
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(true)
    await page.evaluate(() => window.canvasFixture.visible(true))
    await Promise.all(['parallel-a', 'parallel-b', 'other-board'].map(waitForView))
    expect(await readShape('parallel-b', 'shape:conflict-test')).toMatchObject({ x: 690 })
    expect(await page.evaluate(() => window.canvasFixture.flush('board-a').then(() => true, () => false))).toBe(false)
    await page.evaluate(() => window.canvasFixture.discard('board-a'))
    expect(await page.evaluate(() => window.canvasFixture.state('board-a').dirty)).toBe(false)
    expect(await readShape('parallel-b', 'shape:conflict-test')).toEqual(await readShape('parallel-a', 'shape:conflict-test'))
  })
  await check('View fixture reports no browser runtime error or remote asset request', async () => { expect(report.browserErrors).toEqual([]); expect(report.externalRequests).toEqual([]) })
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  if (!report.failures.length) report.failures.push({ name: 'fixture startup', error: error.stack ?? String(error) })
  if (page) await shot('failure').catch(() => {})
  if (page) await page.evaluate(() => window.canvasFixture?.diagnostic()).then(value => writeFile(resolve(output, 'diagnostic.json'), JSON.stringify(value, null, 2) + '\n')).catch(() => {})
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser?.close(); await server?.close()
  process.stdout.write(`Evidence: ${output}\n`)
}
