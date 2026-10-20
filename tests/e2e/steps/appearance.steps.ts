/*
 * [INPUT]: 外观即时生效与原生窗口持久化的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 三组字体字号与开发版 Dock 图标的实际窗口切换/重启/重置；Craft Scenic 选图与原外观回归。
 * [OUTPUT]: 本人菜单进入设置并保留外观/原生窗口完整断言； 使用现有 Base UI 下拉选项验证；外观即时生效与原生窗口持久化的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/appearance.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type ElectronApplication } from '@playwright/test'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { nextMaterialDialog } from '../support/materials'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  scenicAsset?: string
  prepareAppearance?: Awaited<ReturnType<typeof prepareAppearance>>
  resizeAndZoom?: Awaited<ReturnType<typeof resizeAndZoom>>
  customizeAppearance?: Awaited<ReturnType<typeof customizeAppearance>>
  typography?: { ui: number; content: number; code: number }
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
    await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
    await runtime.page.getByRole('button', { name: '外观', exact: true }).click()
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
  await selectAppearance(page!, '界面字体', '系统默认')
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
  await expect(page!.getByLabel('界面字体', { exact: true })).toContainText('系统默认')
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
  await page!.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(page!.getByLabel('界面字体', { exact: true })).toContainText('Geist')
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

When('修改三组字体字号和应用图标', async ({ runtime, scenario }) => {
  await scenario.prepareAppearance!.open()
  const page = runtime.page
  await selectAppearance(page, '界面字体', '系统默认')
  await selectAppearance(page, '内容字体', '系统衬线')
  await selectAppearance(page, '代码字体', 'Menlo')
  for (const [name, size] of [['界面', 17], ['内容', 19], ['代码', 16]] as const) {
    await page.getByRole('spinbutton', { name: `${name}字号（像素）` }).fill(String(size))
  }
  await page.getByRole('group', { name: '选择应用图标' }).getByRole('button', { name: '小龙' }).click()
  scenario.typography = { ui: 17, content: 19, code: 16 }
})

Then('三组排版独立生效且 Dock 图标切换', async ({ runtime, scenario }) => {
  const page = runtime.page
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppearance', undefined)))
    .toMatchObject({ preferences: { typography: {
      ui: { family: 'system', sizePx: 17 }, content: { family: 'serif', sizePx: 19 }, code: { family: 'menlo', sizePx: 16 },
    }, appIconId: 'avatar-bear' } })
  const root = await page.locator('html').evaluate(element => {
    const style = getComputedStyle(element)
    return {
      ui: style.getPropertyValue('--text-ui-body').trim(),
      content: style.getPropertyValue('--text-content-body').trim(),
      code: style.getPropertyValue('--text-code-body').trim(),
      uiFamily: style.getPropertyValue('--font-ui-family').trim(),
      contentFamily: style.getPropertyValue('--font-content-family').trim(),
      codeFamily: style.getPropertyValue('--font-code-family').trim(),
    }
  })
  expect(root).toMatchObject({ ui: '17px', content: '19px', code: '16px' })
  expect(root.uiFamily).not.toContain('Geist')
  expect(root.contentFamily).toContain('Georgia')
  expect(root.codeFamily).toContain('Menlo')
  await expect(page.getByText('const bobo = "你好"')).toHaveCSS('font-size', '16px')
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppIconStatus', undefined)))
    .toMatchObject({ environment: 'development', requestedId: 'avatar-bear', pending: false,
      dock: { appliedId: 'avatar-bear', error: null }, installed: { available: false } })
  expect(scenario.typography).toEqual({ ui: 17, content: 19, code: 16 })
  expect(runtime.errors).toEqual([])
})

Then('重启后字体字号和 Dock 图标保持且可重置', async ({ runtime, scenario }) => {
  await runtime.close()
  await scenario.prepareAppearance!.launch()
  await scenario.prepareAppearance!.open()
  const page = runtime.page
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppearance', undefined)))
    .toMatchObject({ preferences: { typography: {
      ui: { family: 'system', sizePx: 17 }, content: { family: 'serif', sizePx: 19 }, code: { family: 'menlo', sizePx: 16 },
    }, appIconId: 'avatar-bear' } })
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppIconStatus', undefined)))
    .toMatchObject({ requestedId: 'avatar-bear', pending: false, dock: { appliedId: 'avatar-bear', error: null } })
  await page.getByRole('button', { name: '重置字体' }).click()
  await page.getByRole('button', { name: '恢复默认图标' }).click()
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppearance', undefined)))
    .toMatchObject({ preferences: { typography: {
      ui: { family: 'geist', sizePx: 13 }, content: { family: 'ui', sizePx: 13 }, code: { family: 'system', sizePx: 13 },
    }, appIconId: 'avatar-cat' } })
  expect(runtime.errors).toEqual([])
})

When('选择本地背景图片启用玻璃换肤', async ({ runtime, scenario }) => {
  await scenario.prepareAppearance!.open()
  const page = runtime.page
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await page.getByLabel('背景色', { exact: true }).fill('#f8fafc')
  // Deterministic scenery fixture: exercise real PNG import/decoder, no external image dependency.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    const sky = ctx.createLinearGradient(0, 0, 1400, 1000)
    sky.addColorStop(0, '#9ac6df'); sky.addColorStop(0.45, '#e6c3a9'); sky.addColorStop(1, '#407e94')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1600, 1000)
    ctx.fillStyle = '#fff1bd'; ctx.beginPath(); ctx.arc(1180, 230, 110, 0, Math.PI * 2); ctx.fill()
    for (const [y, color] of [[500, '#507f8c'], [690, '#315d6a'], [870, '#183e4c']] as const) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, y)
      ctx.bezierCurveTo(400, y - 380, 700, y + 200, 1600, y - 150)
      ctx.lineTo(1600, 1000); ctx.lineTo(0, 1000); ctx.fill()
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const file = join(runtime.root, 'scenery.png')
  await writeFile(file, Buffer.from(png, 'base64'))
  await runtime.reviewNativeCheckpoint('图片换肤前的浅色设置')
  await nextMaterialDialog(runtime, { path: file })
  await page.getByRole('button', { name: '选择图片', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-scenic', 'true')
  await expect(page.getByAltText('当前背景图片')).toBeVisible()
  expect(await page.getByAltText('当前背景图片').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1600)).toBe(true)
  const snapshot = await page.evaluate(() => window.boai.request('getAppearance', undefined))
  scenario.scenicAsset = snapshot.preferences.background.assetId!
  expect(snapshot).toMatchObject({ resolvedMode: 'light', preferences: { mode: 'light' } })
  await rm(file)
})
Then('背景覆盖窗口且聊天与设置保持可操作', async ({ runtime, scenario }) => {
  const page = runtime.page
  const css = await page.evaluate(() => {
    const root = document.documentElement
    const image = getComputedStyle(root, '::before'), overlay = getComputedStyle(root, '::after')
    return { image: image.backgroundImage, size: image.backgroundSize, opacity: image.opacity,
      pointerEvents: image.pointerEvents, position: image.position, overlay: overlay.backgroundImage,
      blur: getComputedStyle(document.querySelector('.content-frame')!).backdropFilter }
  })
  expect(css).toMatchObject({ size: 'cover', opacity: '1', pointerEvents: 'none', position: 'fixed', blur: 'blur(8px)' })
  expect(css.image).toContain(scenario.scenicAsset)
  expect(css.overlay).toContain('0.4')
  await expect(page.getByRole('button', { name: '浅色', exact: true })).toBeEnabled()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('combobox', { name: '深色配色', exact: true }).click()
  await expect(page.getByRole('option', { name: 'Nord', exact: true })).toBeVisible()
  await expect(page.locator('[data-slot=select-content]')).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-slot=select-content]')).toHaveCSS('background-color', 'rgb(33, 33, 33)')
  await runtime.reviewNativeCheckpoint('图片玻璃设置与可读菜单')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  // Cancel and invalid input preserve the active image.
  await runtime.app.evaluate(({ dialog }) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = (async () => { dialog.showOpenDialog = original; return { canceled: true, filePaths: [] } }) as typeof dialog.showOpenDialog
  })
  await page.getByRole('button', { name: '更换图片', exact: true }).click()
  await expect(page.getByRole('button', { name: '更换图片', exact: true })).toBeEnabled()
  const invalid = join(runtime.root, 'broken.png'); await writeFile(invalid, 'broken image')
  await nextMaterialDialog(runtime, { path: invalid })
  await page.getByRole('button', { name: '更换图片', exact: true }).click()
  await expect(page.getByText('请选择 PNG、JPEG 或 WebP 图片。', { exact: false })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('getAppearance', undefined))).preferences.background.assetId).toBe(scenario.scenicAsset)
  await page.locator('.navigation-rail').getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
  await expect(page.locator('.chat-composer')).toBeVisible()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('背景换肤验收：输入框仍可编辑。')
  await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveText('背景换肤验收：输入框仍可编辑。')
  await runtime.reviewNativeCheckpoint('图片玻璃聊天与全局导航')
})
Then('重启仍显示托管背景且移除恢复原主题', async ({ runtime, scenario }) => {
  await runtime.close()
  await scenario.prepareAppearance!.launch()
  await scenario.prepareAppearance!.open()
  const page = runtime.page
  await expect(page.locator('html')).toHaveAttribute('data-scenic', 'true')
  await expect(page.getByAltText('当前背景图片')).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('getAppearance', undefined))).preferences.background.assetId).toBe(scenario.scenicAsset)
  expect(await page.getByAltText('当前背景图片').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1600)).toBe(true)
  await runtime.reviewNativeCheckpoint('重启后原图删除仍保留换肤')
  await page.getByRole('button', { name: '移除图片', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-scenic')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.getByLabel('背景色', { exact: true })).toHaveValue('#f8fafc')
  await expect(page.locator('.content-frame')).toHaveCSS('backdrop-filter', 'none')
  await expect(page.getByAltText('当前背景图片')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('移除图片恢复原浅色及自定义颜色')
  expect(runtime.errors).toEqual([])
})
