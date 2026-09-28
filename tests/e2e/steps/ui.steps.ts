/*
 * [INPUT]: 基础组件实际渲染与可访问交互的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 基础组件实际渲染与可访问交互的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/ui.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type ElectronApplication } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { createServer } from 'vite'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

type Scenario = {
  loadComponentFixture?: Awaited<ReturnType<typeof loadComponentFixture>>
  exerciseOverlayFocus?: Awaited<ReturnType<typeof exerciseOverlayFocus>>
  exerciseComponentControls?: Awaited<ReturnType<typeof exerciseComponentControls>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function loadComponentFixture(runtime: Desktop) {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'Development-only component fixture; packaged business flows have separate coverage.')
  const server = await createServer({
    configFile: resolve('vite.config.ts'),
    root: resolve('tests/fixtures/ui'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [resolve('.')] } },
  })
  runtime.defer(() => server.close())
  const root = runtime.root
  let app: ElectronApplication | undefined

  await server.listen()
  const address = server.httpServer!.address() as { port: number }
  app = await runtime.start({ dataDir: root, rendererURL: `http://127.0.0.1:${address.port}` })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  const modules = (await readdir('src/renderer/components/ui')).filter((file) => file.endsWith('.tsx'))
  await expect(page.locator('main')).toHaveAttribute('data-module-count', String(modules.length))
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: state.revision })
  })
  return { app, page, errors }
}

async function exerciseOverlayFocus(previous: Awaited<ReturnType<typeof loadComponentFixture>>) {
  let { app, page, errors } = previous
  const trigger = page.getByRole('button', { name: '打开对话框', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '对话框标题' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(dialog.locator('.app-icon').first()).toHaveCSS('mask-image', /data:image\/svg\+xml/)
  const iconSize = await dialog
    .locator('.app-icon')
    .first()
    .evaluate((element) => element.getBoundingClientRect().width)
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
  await expect(trigger).toHaveCSS('outline-style', 'none')
  await expect(trigger).toHaveCSS('outline-width', '0px')
  return { page, errors, trigger, dialog }
}

async function exerciseComponentControls(previous: Awaited<ReturnType<typeof exerciseOverlayFocus>>) {
  let { page, errors, trigger, dialog } = previous
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
  return { page, errors, trigger, dialog }
}

async function verifyDarkOverlay(previous: Awaited<ReturnType<typeof exerciseComponentControls>>) {
  let { page, errors, trigger, dialog } = previous
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: state.revision })
  })
  await trigger.click()
  await expect(dialog).toHaveCSS('background-color', 'rgb(33, 33, 33)')
  await expect(dialog).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.locator('body>[data-base-ui-portal]')).not.toHaveCount(0)
  expect(errors).toEqual([])
}

Given('基础组件测试页在真实桌面加载所有模块', async ({ runtime, scenario }) => {
  scenario.loadComponentFixture = await loadComponentFixture(runtime)
})

When('打开嵌套浮层再逐层关闭', async ({ scenario }) => {
  scenario.exerciseOverlayFocus = await exerciseOverlayFocus(scenario.loadComponentFixture!)
})

Then('选择开关菜单折叠与提示组件能够交互', async ({ scenario }) => {
  scenario.exerciseComponentControls = await exerciseComponentControls(scenario.exerciseOverlayFocus!)
})

Then('深色对话框正确显示在独立浮层容器', async ({ scenario }) => {
  await verifyDarkOverlay(scenario.exerciseComponentControls!)
})
