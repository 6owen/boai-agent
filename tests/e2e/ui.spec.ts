/*
 * [INPUT]: Electron、Vite 测试入口、实际主题与全部 UI 源码。
 * [OUTPUT]: 新组件与旧样式共存、浮层焦点/层叠、主题、图标与交互的集成回归。
 * [POS]: 基础组件验收；测试入口不进入生产构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { createServer } from 'vite'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication } from '@playwright/test'

test('shadcn foundation compiles all modules and preserves styled accessible overlays', async () => {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'Development-only component fixture; packaged business flows have separate coverage.')
  const server = await createServer({ configFile: resolve('vite.config.ts'), root: resolve('tests/fixtures/ui'), server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [resolve('.')] } } })
  const root = await mkdtemp(join(tmpdir(), 'boai-ui-test-'))
  let app: ElectronApplication | undefined
  try {
    await server.listen()
    const address = server.httpServer!.address() as { port: number }
    app = await electron.launch({ args: [resolve('.')], env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test', BOAI_RENDERER_URL: `http://127.0.0.1:${address.port}` } })
    const page = await app.firstWindow(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const modules = (await readdir('src/renderer/components/ui')).filter(file => file.endsWith('.tsx'))
    await expect(page.locator('main')).toHaveAttribute('data-module-count', String(modules.length))
    await page.evaluate(async () => { const state = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: state.revision }) })
    const trigger = page.getByRole('button', { name: '打开对话框', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '对话框标题' })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(dialog.locator('.app-icon').first()).toHaveCSS('mask-image', /data:image\/svg\+xml/)
    const iconSize = await dialog.locator('.app-icon').first().evaluate(element => element.getBoundingClientRect().width)
    expect(iconSize).toBeGreaterThan(0)
    expect(iconSize).toBeLessThanOrEqual(18)
    await page.getByRole('button', { name: '嵌套浮层', exact: true }).click()
    await expect(page.getByText('嵌套浮层标题', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('嵌套浮层标题', { exact: true })).not.toBeVisible()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await page.getByRole('combobox', { name: '显示模式' }).click()
    await page.getByRole('option', { name: '深色', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '显示模式' })).toContainText('深色')
    await page.getByRole('switch', { name: '通知开关' }).click()
    await expect(page.getByRole('switch', { name: '通知开关' })).toBeChecked()
    await page.getByRole('button', { name: '打开菜单' }).click()
    await page.getByRole('menuitem', { name: '执行操作' }).click()
    await expect(page.getByText('操作完成', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '展开详情' }).click()
    await expect(page.getByText('基础组件支持键盘操作。')).toBeVisible()
    await page.getByRole('button', { name: '查看提示' }).hover()
    await expect(page.locator('[data-slot=tooltip-content]')).toBeVisible()
    await expect(page.locator('[data-slot=tooltip-content]')).toContainText('快捷操作提示')
    await page.mouse.move(0, 0)
    await page.evaluate(async () => { const state = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: state.revision }) })
    await trigger.click()
    await expect(dialog).toHaveCSS('background-color', 'rgb(33, 33, 33)')
    await expect(dialog).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(page.locator('body>[data-base-ui-portal]')).not.toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await app?.close(); await server.close(); await rm(root, { recursive: true, force: true }) }
})
