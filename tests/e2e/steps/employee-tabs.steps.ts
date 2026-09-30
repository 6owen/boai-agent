/*
 * [INPUT]: 员工共享标签页中文场景、Electron fixture 与产品 API。
 * [OUTPUT]: 选择员工采用现有 Base UI option；会话菜单入口、分类面板语义、草稿保护、键盘切换、资料库筛选及跨页面/主题/窄窗的视觉验收。
 * [POS]: tests/e2e/steps/employee-tabs.steps.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'

const { Given, When, Then } = createBdd(test)
const tabStyle = (tab: Locator) => tab.evaluate(element => {
  const style = getComputedStyle(element)
  return { height: element.getBoundingClientRect().height, fontSize: style.fontSize, radius: style.borderRadius, background: style.backgroundColor, shadow: style.boxShadow }
})

Given('在通讯录中编辑研究员配置', async ({ runtime }) => {
  await runtime.start()
  const page = runtime.page
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: appearance.revision })
  })
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('tablist', { name: '员工详情分类' })).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveText('配置')
  await expect(page.getByRole('tabpanel', { name: '配置', exact: true })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
})

When('切换员工标签时继续编辑或放弃修改', async ({ runtime }) => {
  const page = runtime.page
  const role = page.getByRole('textbox', { name: '职责简介', exact: true })
  const original = await role.inputValue()
  await role.fill('尚未保存的职责')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.getByRole('tab', { name: '配置', exact: true, includeHidden: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(role).toHaveValue('尚未保存的职责')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '系统文件', exact: true })).toBeVisible()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(role).toHaveValue(original)

  // Unsaved system-file drafts must also be unmounted without losing the chosen tab.
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await page.getByRole('button', { name: /SOUL.md/ }).click()
  const content = page.getByRole('textbox', { name: 'SOUL.md 内容', exact: true })
  const savedContent = await content.inputValue()
  await content.fill('这份文件草稿不应该保存')
  await page.getByRole('tab', { name: '工作区', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '工作区', exact: true })).toContainText('独立工作区')
  expect((await page.evaluate(() => window.boai.request('readAgentFile', { agentId: 'researcher', name: 'SOUL.md' }))).content).toBe(savedContent)
})

Then('保存配置后进入目标标签且键盘可以访问其他分类', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await page.getByRole('textbox', { name: '职责简介', exact: true }).fill('核对每条来源')
  await page.getByRole('tab', { name: '记忆', exact: true }).click()
  await page.getByRole('button', { name: '保存并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '记忆', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.role).toBe('核对每条来源')
  const memory = page.getByRole('tab', { name: '记忆', exact: true })
  await memory.focus()
  await memory.press('ArrowLeft')
  const workspace = page.getByRole('tab', { name: '工作区', exact: true })
  await expect(workspace).toBeFocused()
  await expect(memory).toHaveAttribute('aria-selected', 'true')
  await workspace.press('Enter')
  await expect(workspace).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await page.getByRole('tab', { name: '配置', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '职责简介', exact: true })).toHaveValue('核对每条来源')
})

Then('会话侧栏使用相同标签样式且深色窄窗口完整显示', async ({ runtime }) => {
  const page = runtime.page
  const profile = page.getByRole('tab', { name: '配置', exact: true })
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)))
  const contactStyle = await tabStyle(profile)
  expect(contactStyle.fontSize).toBe('13px')
  expect(contactStyle.height).toBeLessThanOrEqual(32)
  const list = page.getByRole('tablist', { name: '员工详情分类' })
  await expect(list).toHaveCSS('height', '32px')
  expect((await list.boundingBox())!.width).toBeLessThan(300)
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  expect(await tabStyle(profile)).toEqual(contactStyle)
  await page.mouse.move(400, 300)
  await page.screenshot({ path: 'test-results/employee-tabs-light.png', animations: 'disabled' })
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision })
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  const panel = page.locator('.detail-panel')
  await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  for (const name of ['配置', '系统文件', '工作区', '记忆']) await expect(list.getByRole('tab', { name, exact: true })).toBeInViewport()
  await page.screenshot({ path: 'test-results/employee-tabs-dark.png', animations: 'disabled' })
  expect(runtime.errors).toEqual([])
})

Then('资料库分类共用标签样式并保留筛选内容', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  const tabs = page.getByRole('tablist', { name: '资料库分类' })
  await expect(tabs).toHaveCSS('height', '32px')
  await page.getByRole('textbox', { name: '搜索资源', exact: true }).fill('保留筛选')
  await tabs.getByRole('tab', { name: '员工已绑定', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '员工已绑定', exact: true })).toContainText('选择一位员工')
  await page.getByRole('combobox', { name: '选择员工', exact: true }).click()
  await page.getByRole('option', { name: '研究员', exact: true }).click()
  await expect(page.getByRole('button', { name: /研究员 的资源配置/ })).toBeVisible()
  await tabs.getByRole('tab', { name: '公共资源', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '公共资源', exact: true })).toContainText('公共资源表示可供绑定')
  await expect(page.getByRole('textbox', { name: '搜索资源', exact: true })).toHaveValue('保留筛选')
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  expect(runtime.errors).toEqual([])
})
