/*
 * [INPUT]: 外观即时生效与原生窗口持久化的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 使用现有 Base UI 下拉选项验证；外观即时生效与原生窗口持久化的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/appearance.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  prepareAppearance?: Awaited<ReturnType<typeof prepareAppearance>>
  resizeAndZoom?: Awaited<ReturnType<typeof resizeAndZoom>>
  customizeAppearance?: Awaited<ReturnType<typeof customizeAppearance>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function selectAppearance(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function prepareAppearance(runtime: Desktop) {
  const root = runtime.root
  let app: ElectronApplication | undefined
  let page: Page
  const errors: string[] = runtime.errors
  const launch = async () => {
    app = await runtime.start({ dataDir: root })
    page = await app.firstWindow()

    await page.waitForFunction(() => Boolean(window.boai))
    await expect(page.locator('.app-shell')).toBeVisible()
  }
  const open = async () => {
    await runtime.page.getByRole('button', { name: '设置', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '外观', exact: true }).click()
  }
  const zoom = () => runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
  const expectWindowFilled = async () => {
    await expect
      .poll(async () => {
        const native = await runtime.app.evaluate(({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0]
          return { size: window.getContentSize(), zoom: window.webContents.getZoomFactor() }
        })
        const layout = await runtime.page.evaluate(() => {
          const shell = document.querySelector('.app-shell')!.getBoundingClientRect()
          const frame = document.querySelector('.content-frame')!.getBoundingClientRect()
          return {
            width: innerWidth,
            height: innerHeight,
            shellRight: shell.right,
            shellBottom: shell.bottom,
            frameRight: frame.right,
            frameBottom: frame.bottom,
          }
        })
        // Comparing CSS viewport to the native window also catches stale CDP device emulation.
        return Math.max(
          Math.abs(layout.width * native.zoom - native.size[0]),
          Math.abs(layout.height * native.zoom - native.size[1]),
          Math.abs(layout.shellRight - layout.width),
          Math.abs(layout.shellBottom - layout.height),
          Math.abs(layout.width - layout.frameRight - 4),
          Math.abs(layout.height - layout.frameBottom - 4),
        )
      })
      .toBeLessThanOrEqual(1.5)
  }

  await launch()
  app = runtime.app
  page = runtime.page
  return { runtime, app, page, errors, launch, open, zoom, expectWindowFilled }
}

async function resizeAndZoom(previous: Awaited<ReturnType<typeof prepareAppearance>>) {
  let { runtime, app, page, errors, launch, open, zoom, expectWindowFilled } = previous
  for (const [width, height] of [
    [760, 640],
    [1124, 688],
    [1247, 839],
    [1340, 900],
  ]) {
    await app!.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
    await expectWindowFilled()
  }
  await open()
  for (const factor of ['0.75', '1.5', '1']) {
    await selectAppearance(page!, '界面缩放', `${Number(factor) * 100}%${factor === '1' ? '（默认）' : ''}`)
    await expect.poll(zoom).toBeCloseTo(Number(factor))
    await expectWindowFilled()
  }
  return { runtime, app, page, errors, launch, open, zoom, expectWindowFilled }
}

async function customizeAppearance(previous: Awaited<ReturnType<typeof resizeAndZoom>>) {
  let { runtime, app, page, errors, launch, open, zoom, expectWindowFilled } = previous
  await page!.getByLabel('搜索设置').fill('外观')
  await expect(page!.getByRole('button', { name: '模型连接', exact: true })).toHaveCount(0)
  await page!.getByLabel('搜索设置').fill('')
  await page!.getByRole('button', { name: '浅色', exact: true }).click()
  await selectAppearance(page!, '浅色配色', 'VS Code Plus')
  await selectAppearance(page!, '字体', '系统默认')
  await page!.getByLabel('强调色', { exact: true }).fill('#007acc')
  await page!.getByLabel('背景色', { exact: true }).fill('#f8fafc')
  await page!.getByLabel('前景色', { exact: true }).fill('#101010')
  await selectAppearance(page!, '界面缩放', '90%')
  await expect.poll(zoom).toBeCloseTo(0.9)
  await expectWindowFilled()
  await expect(page!.locator('html')).toHaveCSS('--card', '#f8fafc')
  await expect(page!.locator('html')).toHaveCSS('--foreground', '#101010')
  await expect(page!.locator('html')).toHaveCSS('--ring', '#007acc')
  expect(await page!.locator('html').evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain('Geist')
  return { runtime, app, page, errors, launch, open, zoom, expectWindowFilled }
}

async function verifyAppearanceRestart(previous: Awaited<ReturnType<typeof customizeAppearance>>) {
  let { runtime, app, page, errors, launch, open, zoom, expectWindowFilled } = previous
  await runtime.close()
  await launch()
  app = runtime.app
  page = runtime.page
  await open()
  await expect.poll(zoom).toBeCloseTo(0.9)
  await expectWindowFilled()
  await expect(page!.getByLabel('界面缩放', { exact: true })).toContainText('90%')
  await expect(page!.getByLabel('字体', { exact: true })).toContainText('系统默认')
  await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#f8fafc')
  await page!.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#212121')
  await page!.getByRole('button', { name: '浅色', exact: true }).click()
  await expect(page!.getByLabel('背景色', { exact: true })).toHaveValue('#f8fafc')
  await app!.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()!
      .items.find((item) => item.label === '视图')!
      .submenu!.items.find((item) => item.label === '放大')!
    item.click()
  })
  await expect.poll(zoom).toBe(1)
  await expectWindowFilled()
  await expect(page!.getByLabel('界面缩放', { exact: true })).toContainText('100%')
  await expect(page!.getByRole('button', { name: '恢复默认外观' })).toBeEnabled()
  await page!.getByRole('button', { name: '恢复默认外观' }).click()
  await expect(page!.getByLabel('字体', { exact: true })).toContainText('Geist')
  await page!.evaluate(() => document.fonts.ready)
  expect(await page!.evaluate(() => [...document.fonts].some((font) => font.family === 'Geist' && font.status === 'loaded'))).toBe(true)
  await expect
    .poll(() => page!.evaluate(() => window.boai.request('getAppearance', undefined)))
    .toMatchObject({ preferences: { zoomFactor: 1, customColors: { light: { accent: null, background: null, foreground: null } } } })
  expect(errors).toEqual([])
}

Given('外观场景在独立桌面启动', async ({ runtime, scenario }) => {
  scenario.prepareAppearance = await prepareAppearance(runtime)
})

When('调整原生窗口大小和界面缩放', async ({ scenario }) => {
  scenario.resizeAndZoom = await resizeAndZoom(scenario.prepareAppearance!)
})

Then('字体和自定义配色立即生效', async ({ scenario }) => {
  scenario.customizeAppearance = await customizeAppearance(scenario.resizeAndZoom!)
})

Then('重启恢复外观且原生菜单缩放与重置保持同步', async ({ scenario }) => {
  await verifyAppearanceRestart(scenario.customizeAppearance!)
})
