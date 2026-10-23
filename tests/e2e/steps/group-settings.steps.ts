/*
 * [INPUT]: 群设置中文场景、Electron fixture 与本地产品 API。
 * [OUTPUT]: 会话菜单入口、无重复介绍的成员网格、16px 移除按钮、取消/确认、保存持久化与两种页脚布局验证。
 * [POS]: tests/e2e/steps/group-settings.steps.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
const { Given, When, Then } = createBdd(test)

Given('打开包含两位员工的群聊设置', async ({ runtime }) => {
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(async () => {
    await window.boai.request('createConversation', { title: '成员布局验收', kind: 'group', agentIds: ['researcher', 'writer'] })
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: state.revision })
  })
  await runtime.page.locator('.conversation-item').filter({ hasText: '成员布局验收' }).click()
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '配置', exact: true }).click()
})
When('在末尾添加员工并确认移除原成员', async ({ runtime }) => {
  const page = runtime.page, panel = page.locator('.detail-panel')
  const grid = panel.locator('.group-member-grid')
  await expect(panel.locator('.editor-intro')).toHaveCount(0)
  await expect(grid.locator(':scope > *').last()).toHaveAttribute('aria-label', '添加群成员')
  const widths = await grid.locator('.group-member').evaluateAll(items => items.map(item => item.getBoundingClientRect().width))
  expect(widths.every(width => width <= 64)).toBe(true)
  await panel.getByRole('button', { name: '添加群成员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加群成员', exact: true })
  await dialog.getByRole('checkbox', { name: /审核员/ }).check()
  await dialog.getByRole('button', { name: '添加', exact: true }).click()
  await expect(grid.locator('.group-member')).toHaveCount(3)
  await grid.getByRole('button', { name: '查看 写手', exact: true }).hover()
  const remove = grid.getByRole('button', { name: '从群中移除 写手', exact: true })
  await expect(remove).toHaveCSS('opacity', '1')
  await expect(remove).toHaveCSS('width', '16px')
  await expect(remove).toHaveCSS('height', '16px')
  await expect(remove.locator('.app-icon')).toHaveCSS('width', '10px')
  await page.screenshot({ path: 'test-results/group-member-remove.png', animations: 'disabled' })
  await remove.click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(grid.locator('.group-member')).toHaveCount(3)
  await grid.getByRole('button', { name: '查看 写手', exact: true }).hover()
  await remove.click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(grid.locator('.group-member')).toHaveCount(2)
  await expect(grid.getByRole('button', { name: '查看 写手', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/group-settings-light.png', animations: 'disabled' })
  await panel.getByRole('button', { name: '保存设置', exact: true }).click()
})
Then('保存后的群成员和头像一致', async ({ runtime }) => {
  const group = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).conversations.find(item => item.title === '成员布局验收')!)
  expect(group.agentIds).toEqual(['researcher', 'reviewer'])
  await expect(runtime.page.locator('.conversation-item.selected .group-avatar img')).toHaveCount(2)
  await runtime.restart()
  await runtime.page.locator('.conversation-item').filter({ hasText: '成员布局验收' }).click()
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await expect(runtime.page.locator('.group-member-grid .group-member')).toHaveCount(2)
})
Then('右侧页脚在滚动和窗口缩放时固定在底部', async ({ runtime }) => {
  const page = runtime.page, panel = page.locator('.detail-panel'), footer = panel.locator('.editor-footer')
  for (const [width, height] of [[1200, 800], [920, 600]]) {
    await runtime.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]), [width, height])
    const before = (await footer.boundingBox())!
    expect(before.height).toBe(58)
    await panel.locator('.editor-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
    const after = (await footer.boundingBox())!, bounds = (await panel.boundingBox())!
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
    expect(Math.abs(after.y + after.height - bounds.y - bounds.height)).toBeLessThan(1)
  }
  await page.evaluate(async () => { const a = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: a.revision }) })
  await page.screenshot({ path: 'test-results/group-settings-dark.png', animations: 'disabled' })
  await page.getByRole('tablist', { name: '详情标签' }).getByRole('button', { name: '关闭详情', exact: true }).click()
})
Then('通讯录编辑页脚跟随表单自然滚动', async ({ runtime }) => {
  const page = runtime.page
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 700))
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  const footer = page.locator('.contact-editor .editor-footer'), scroll = page.locator('.contacts-detail')
  await expect(footer).toHaveCSS('position', 'static')
  const before = (await footer.boundingBox())!
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
  const after = (await footer.boundingBox())!
  expect(before.y - after.y).toBeGreaterThan(100)
  await expect(footer.getByRole('button', { name: '保存修改', exact: true })).toBeInViewport()
  expect(runtime.errors).toEqual([])
})
