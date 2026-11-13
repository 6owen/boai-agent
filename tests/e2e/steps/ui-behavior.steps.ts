/*
 * [INPUT]: 固定中文行为场景、原 Desktop 生命周期和离线员工会话夹具。
 * [OUTPUT]: 真实点击/持久化/草稿断言和可直接查看的结束PNG；零外部模型，不比较 PNG。
 * [POS]: 日常 UI 行为验收，复用现有 Electron BDD。
 * [PROTOCOL]: 变化同步 Header 和所属 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'

export const test = base.extend<{ uiBehavior: { fixture?: Awaited<ReturnType<typeof prepareGroupChat>> } }>({
  uiBehavior: async ({}, use) => use({}),
})
const { Given, Then } = createBdd(test)
const navigation = (page: Page) => page.getByRole('navigation', { name: '主导航', exact: true })
const composer = (page: Page) => page.getByRole('textbox', { name: '消息内容', exact: true })
async function screenshot(page: Page, name: string) {
  const file = test.info().outputPath('ui-behavior.png')
  await page.screenshot({ path: file })
  await test.info().attach(name, { path: file, contentType: 'image/png' })
}
async function appearance(page: Page) {
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '外观', exact: true }).click()
  await expect(page.getByRole('heading', { name: '外观', exact: true })).toBeVisible()
}

Given('UI行为验收已准备隔离员工和会话', async ({ runtime, uiBehavior }) => {
  uiBehavior.fixture = await prepareGroupChat(runtime, { seedBeforeLaunch: true, emulateViewport: false })
  await expect(composer(runtime.page)).toBeVisible()
})

Then('草稿经过页面和会话往返仍属于原会话', async ({ runtime, uiBehavior }) => {
  const page = runtime.page
  await composer(page).fill('未发送的群聊草稿')
  await page.getByRole('button', { name: /与研究员对话/ }).click()
  await expect(composer(page)).toHaveText('')
  await composer(page).fill('未发送的单聊草稿')
  await page.getByRole('button', { name: /产品讨论组/ }).click()
  await expect(composer(page)).toHaveText('未发送的群聊草稿')
  await navigation(page).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '通讯录列表', exact: true })).toBeVisible()
  await navigation(page).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: /产品讨论组/ }).click()
  await expect(composer(page)).toHaveText('未发送的群聊草稿')
  await page.getByRole('button', { name: /与研究员对话/ }).click()
  await expect(composer(page)).toHaveText('未发送的单聊草稿')
  expect(uiBehavior.fixture!.state.calls).toBe(0)
  await screenshot(page, '单聊草稿在页面和会话往返后保留')
})

Then('明暗设置保存后重启仍使用所选模式', async ({ runtime, uiBehavior }) => {
  await appearance(runtime.page)
  for (const mode of ['dark', 'light'] as const) {
    await runtime.page.getByRole('button', { name: mode === 'light' ? '浅色' : '深色', exact: true }).click()
    await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', mode)
    await expect.poll(() => runtime.page.evaluate(async () => (await window.boai.request('getAppearance', undefined)).preferences.mode)).toBe(mode)
  }
  await runtime.restart()
  await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => runtime.page.evaluate(async () => (await window.boai.request('getAppearance', undefined)).preferences.mode)).toBe('light')
  await appearance(runtime.page)
  expect(uiBehavior.fixture!.state.calls).toBe(0)
  await screenshot(runtime.page, '重启后的浅色外观设置')
})

Then('工具开始页可切换任务和知识资料且聊天草稿保留', async ({ runtime, uiBehavior }) => {
  const page = runtime.page
  await page.getByRole('button', { name: /与研究员对话/ }).click()
  await composer(page).fill('查看工具时保留的草稿')
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  const home = page.getByRole('region', { name: '工作区开始', exact: true })
  await expect(home).toBeVisible()
  for (const name of ['任务', '终端', '知识资料', '浏览器']) await expect(home.getByRole('button', { name, exact: true })).toBeEnabled()
  await home.getByRole('button', { name: '任务', exact: true }).click()
  const taskViews = page.getByRole('tablist', { name: '任务视图', exact: true })
  await expect(taskViews).toBeVisible()
  await taskViews.getByRole('tab', { name: '列表', exact: true }).click()
  await expect(taskViews.getByRole('tab', { name: '列表', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '打开工具开始页', exact: true }).click()
  await expect(home).toBeVisible()
  await home.getByRole('button', { name: '知识资料', exact: true }).click()
  await expect(page.getByLabel('员工知识资料', { exact: true })).toBeVisible()
  await expect(composer(page)).toHaveText('查看工具时保留的草稿')
  expect(uiBehavior.fixture!.state.calls).toBe(0)
  await screenshot(page, '知识资料与原会话草稿')
})
