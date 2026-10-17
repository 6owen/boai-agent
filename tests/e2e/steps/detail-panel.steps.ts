/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [INPUT]: 窗口顶栏详情标签与内容对齐的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 会话菜单配置入口、窗口顶栏多标签、内容对齐及独立关闭回到相邻标签的真实桌面断言。
 * [POS]: tests/e2e/steps/detail-panel.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  openGroupDetails?: Awaited<ReturnType<typeof openGroupDetails>>
  resizeDetails?: Awaited<ReturnType<typeof resizeDetails>>
  saveGroupTitle?: Awaited<ReturnType<typeof saveGroupTitle>>
  returnFromEmployee?: Awaited<ReturnType<typeof returnFromEmployee>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function openGroupDetails(runtime: Desktop) {
  const root = runtime.root
  const app = await runtime.start({ dataDir: root })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  await expect(page.locator('.app-shell')).toBeVisible()
  const title = '设计协作群 · 讨论产品体验与界面细节，让每一位数字同事都能清晰协作'
  await page.evaluate(async (title) => {
    await window.boai.request('createConversation', {
      title,
      kind: 'group',
      agentIds: ['researcher', 'writer'],
      mode: 'natural',
      sharedKnowledgeIds: [],
    })
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: appearance.revision })
  }, title)
  await page.locator('.conversation-item').filter({ hasText: title }).click()
  const trigger = page.getByRole('button', { name: '会话操作', exact: true })
  await trigger.click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const header = page.locator('.global-toolbar .detail-header'),
    panel = page.locator('.detail-panel')
  await expect(header.getByRole('tab', { name: title, exact: true })).toBeFocused()
  await expect(panel.locator('.detail-header')).toHaveCount(0)
  const aligned = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document.querySelector('.toolbar-detail')!.getBoundingClientRect()
          const panel = document.querySelector('.detail-panel')!.getBoundingClientRect()
          const content = document.querySelector('.detail-content:not([hidden])')!.getBoundingClientRect()
          const divider = document.querySelector('.detail-resizer')!.getBoundingClientRect()
          const boundary = divider.width ? divider.left : panel.left
          const frameBorder = parseFloat(getComputedStyle(document.querySelector('.content-frame')!).borderTopWidth)
          return Math.max(
            Math.abs(header.left - boundary),
            Math.abs(header.right - panel.right),
            Math.abs(header.bottom + frameBorder - panel.top),
            Math.abs(content.top - panel.top),
          )
        }),
      )
      .toBeLessThanOrEqual(0.1)
    await expect(header.getByRole('button', { name: '关闭详情', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  return { app, page, errors, title, trigger, header, panel, aligned }
}

async function resizeDetails(previous: Awaited<ReturnType<typeof openGroupDetails>>) {
  let { app, page, errors, title, trigger, header, panel, aligned } = previous
  for (const width of [1280, 1124, 1100, 1099, 900, 899, 760]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 720), width)
    await aligned()
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1247, 720))
  for (const zoom of [0.9, 1.25, 1.5, 1]) {
    await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom)
    await aligned()
  }
  await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
  await aligned()
  await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
  await aligned()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
  const divider = page.getByRole('separator', { name: '调整详情宽度', exact: true })
  await divider.focus()
  await divider.press('Shift+ArrowLeft')
  await aligned()
  const edge = await divider.boundingBox()
  await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + edge!.height / 2)
  await page.mouse.down()
  await page.mouse.move(edge!.x - 25, edge!.y + edge!.height / 2)
  await page.mouse.up()
  await aligned()
  return { app, page, errors, title, trigger, header, panel, aligned }
}

async function saveGroupTitle(previous: Awaited<ReturnType<typeof resizeDetails>>) {
  let { app, page, errors, title, trigger, header, panel, aligned } = previous
  const titleBox = header.locator('.detail-tab-title')
  expect(await titleBox.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await panel.getByRole('textbox', { name: '群聊名称', exact: true }).fill('设计协作群')
  await expect(header.locator('[aria-label=未保存]')).toBeVisible()
  await header.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: '群聊名称', exact: true })).toHaveValue('设计协作群')
  await header.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await panel.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await expect(header.getByRole('tab', { selected: true })).toHaveText('设计协作群')
  const tabWidth = (await header.locator('.detail-tab').boundingBox())!.width
  expect(tabWidth).toBeLessThan(180)
  expect((await header.boundingBox())!.width - tabWidth).toBeGreaterThan(100)
  await page.mouse.move(400, 300)
  await page.screenshot({ path: 'test-results/detail-header-light.png', animations: 'disabled' })
  return { app, page, errors, trigger, header, panel, aligned }
}

async function returnFromEmployee(previous: Awaited<ReturnType<typeof saveGroupTitle>>) {
  let { app, page, errors, trigger, header, panel, aligned } = previous
  await panel.locator('.group-member-grid').getByRole('button', { name: '查看 研究员', exact: true }).click()
  await expect(header.getByRole('tab', { name: '研究员', exact: true })).toBeFocused()
  await panel.getByRole('textbox', { name: '职责简介', exact: true }).fill('未保存职责')
  await header.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await expect(header.getByRole('tab', { selected: true })).toHaveText('设计协作群')
  await panel.locator('.group-member-grid').getByRole('button', { name: '查看 研究员', exact: true }).click()
  await expect(panel.getByRole('textbox', { name: '职责简介', exact: true })).not.toHaveValue('未保存职责')
  return { app, page, errors, trigger, header, panel, aligned }
}

async function verifyNarrowDarkDetails(previous: Awaited<ReturnType<typeof returnFromEmployee>>) {
  let { app, page, errors, trigger, header, panel, aligned } = previous
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision })
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await aligned()
  await expect.poll(() => panel.locator('.detail-content:visible').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const before = await header.boundingBox()
  await panel.locator('.detail-content:visible').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await header.boundingBox()).toEqual(before)
  await panel.locator('.detail-content:visible').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)))
  await page.screenshot({ path: 'test-results/detail-header-dark-narrow.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(header.getByRole('tab')).toHaveText(['设计协作群'])
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(header).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
}

Given('群详情以窗口顶栏标签打开', async ({ runtime, scenario }) => {
  scenario.openGroupDetails = await openGroupDetails(runtime)
})

When('改变窗口尺寸缩放并拖动详情分栏', async ({ scenario }) => {
  scenario.resizeDetails = await resizeDetails(scenario.openGroupDetails!)
})

Then('长标题截断且关闭时可保存未保存的群名', async ({ scenario }) => {
  scenario.saveGroupTitle = await saveGroupTitle(scenario.resizeDetails!)
})

When('嵌套员工详情放弃修改后返回群详情', async ({ scenario }) => {
  scenario.returnFromEmployee = await returnFromEmployee(scenario.saveGroupTitle!)
})

Then('深色窄窗口的详情标题固定且关闭后焦点回到入口', async ({ scenario }) => {
  await verifyNarrowDarkDetails(scenario.returnFromEmployee!)
})
