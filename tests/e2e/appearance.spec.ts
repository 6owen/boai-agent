/*
 * [INPUT]: 真实 Electron 应用、外观 UI 与隔离的持久化目录。
 * [OUTPUT]: 字体/颜色/缩放即时生效、重启恢复和重置的跨进程验证。
 * [POS]: 外观个性化回归；同时约束原生菜单与 UI 的缩放值一致。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('appearance controls persist actual font, colors and native window zoom', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-appearance-e2e-'))
  let app: ElectronApplication | undefined
  let page: Page
  const errors: string[] = []
  const launch = async () => {
    app = await electron.launch({ ...(process.env.BOAI_TEST_PACKAGED_PATH ? { executablePath: process.env.BOAI_TEST_PACKAGED_PATH, args: [] } : { args: [resolve('.')] }), env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
    page = await app.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await page.waitForFunction(() => Boolean(window.boai))
  }
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('menuitem', { name: '外观', exact: true }).click()
  }
  const zoom = () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
  try {
    await launch(); await open()
    await page!.getByLabel('搜索设置').fill('外观')
    await expect(page!.getByRole('button', { name: '模型连接', exact: true })).toHaveCount(0)
    await page!.getByLabel('搜索设置').fill('')
    await page!.getByRole('button', { name: '浅色', exact: true }).click()
    await page!.getByLabel('浅色配色', { exact: true }).selectOption('vscode-plus-light')
    await page!.getByLabel('字体', { exact: true }).selectOption('system')
    await page!.getByLabel('强调色', { exact: true }).fill('#007acc')
    await page!.getByLabel('背景色', { exact: true }).fill('#f8fafc')
    await page!.getByLabel('前景色', { exact: true }).fill('#101010')
    await page!.getByLabel('界面缩放', { exact: true }).selectOption('0.9')
    await expect.poll(zoom).toBeCloseTo(0.9)
    await expect(page!.locator('html')).toHaveCSS('--card', '#f8fafc')
    await expect(page!.locator('html')).toHaveCSS('--foreground', '#101010')
    await expect(page!.locator('html')).toHaveCSS('--ring', '#007acc')
    expect(await page!.locator('html').evaluate(element => getComputedStyle(element).fontFamily)).not.toContain('Geist')
    await app!.close(); app = undefined
    await launch(); await open()
    await expect.poll(zoom).toBeCloseTo(0.9)
    await expect(page!.getByLabel('界面缩放', { exact: true })).toHaveValue('0.9')
    await expect(page!.getByLabel('字体', { exact: true })).toHaveValue('system')
    await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#f8fafc')
    await page!.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#212121')
    await page!.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#f8fafc')
    await app!.evaluate(({ Menu }) => { const item = Menu.getApplicationMenu()!.items.find(item => item.label === '视图')!.submenu!.items.find(item => item.label === '放大')!; item.click() })
    await expect.poll(zoom).toBe(1)
    await expect(page!.getByLabel('界面缩放', { exact: true })).toHaveValue('1')
    await expect(page!.getByRole('button', { name: '恢复默认外观' })).toBeEnabled()
    await page!.getByRole('button', { name: '恢复默认外观' }).click()
    await expect(page!.getByLabel('字体', { exact: true })).toHaveValue('geist')
    await page!.evaluate(() => document.fonts.ready)
    expect(await page!.evaluate(() => [...document.fonts].some(font => font.family === 'Geist' && font.status === 'loaded'))).toBe(true)
    await expect.poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { zoomFactor: 1, customColors: { light: { accent: null, background: null, foreground: null } } } })
    expect(errors).toEqual([])
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }) }
})
