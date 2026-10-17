/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 详情回归沿现行员工职责字段和有效隔离模型配置，实际缩窗/缩放保证可滚动；选中标签悬停保持独立选中层，多草稿/滚动/定向保存关闭意图保持。
 * [OUTPUT]: 窗口滑动层覆盖关闭按钮所在整项，切换/键盘排序/关闭/缩放后与真实选中项对齐。
 * [INPUT]: 多标签中文场景、Electron fixture 和真实本地数据。
 * [OUTPUT]: T2 来源聊天筛选跨会话保持；按 Base UI 选中标签读取当前员工记忆；会话菜单入口、浏览器式标签浅深色悬停、去重、草稿/滚动保留、独立表单保存、拖拽/键盘排序、会话范围和窄窗验证。
 * [POS]: tests/e2e/steps/detail-tabs.steps.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'

const { Given, When, Then } = createBdd(test)

async function openMember(page: Page, name: string) {
  const group = await page.locator('.chat-title').innerText()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await page.getByRole('button', { name: `查看 ${name}`, exact: true }).click()
  // Keep the tested activity/employee tabs; the group is just the new member entry point.
  await page.getByRole('tablist', { name: '详情标签' }).getByRole('button', { name: `关闭 ${group}`, exact: true }).click()
}


Given('已打开群聊的任务与产物和员工配置标签', async ({ runtime }) => {
  await runtime.start()
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1340, 640))
  const page = runtime.page
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(async () => {
    // Saving a draft requires a valid configuration; this fixture never calls a model.
    const connection = await window.boai.request('saveConnection', { name: '详情配置验收', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' })
    for (const agent of (await window.boai.request('snapshot', undefined)).agents.filter(agent => ['researcher', 'writer', 'reviewer'].includes(agent.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture', expectedConfigVersion: configVersion })
    }
    await window.boai.request('createConversation', { title: '设计群', kind: 'group', agentIds: ['researcher', 'writer', 'reviewer'] })
    await window.boai.request('createConversation', { title: '另一组工作', kind: 'group', agentIds: ['researcher', 'writer'] })
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light', zoomFactor: 1.25 }, expectedRevision: state.revision })
  })
  await page.locator('.conversation-item').filter({ hasText: '设计群' }).click()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
  await openMember(page, '研究员')
  const tabs = page.getByRole('tablist', { name: '详情标签' })
  await expect(tabs.getByRole('tab')).toHaveText(['任务与产物', '研究员'])
  await expect(tabs.getByRole('tab', { name: '研究员', exact: true })).toHaveAttribute('aria-selected', 'true')
  const inactive = tabs.locator('.detail-tab[data-selected=false]').first()
  const background = await inactive.evaluate(element => getComputedStyle(element).backgroundColor)
  await inactive.hover()
  await expect(inactive).not.toHaveCSS('background-color', background)
  await page.screenshot({ path: 'test-results/detail-tabs-light.png', animations: 'disabled' })
  await page.mouse.move(700, 200)
  await expect(inactive).toHaveCSS('background-color', background)
})

When('重复打开并切换标签以及收起右侧面板', async ({ runtime }) => {
  const page = runtime.page, tabs = page.getByRole('tablist', { name: '详情标签' })
  await page.getByRole('textbox', { name: '员工职责', exact: true }).fill('研究员未保存草稿')
  await page.locator('.detail-content:visible .editor-scroll').evaluate(element => { element.scrollTop = 180 })
  const scroll = await page.locator('.detail-content:visible .editor-scroll').evaluate(element => element.scrollTop)
  expect(scroll, 'zoomed compact window must exercise real scrolling').toBeGreaterThan(0)
  const source = tabs.getByRole('tab', { name: '研究员', exact: true }), target = tabs.getByRole('tab', { name: '任务与产物', exact: true })
  const from = (await source.boundingBox())!, to = (await target.boundingBox())!
  await page.mouse.move(from.x + 30, from.y + 14)
  await page.mouse.down()
  await page.mouse.move(to.x + 5, to.y + 14, { steps: 12 })
  await page.mouse.move(to.x + 6, to.y + 14)
  await expect(tabs.locator('[data-drop=before]')).toBeVisible()
  await page.mouse.up()
  await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-label', '研究员')
  await expect(source).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('研究员未保存草稿')
  expect(await page.locator('.detail-content:visible .editor-scroll').evaluate(element => element.scrollTop), 'after drag').toBe(scroll)
  await source.press('Alt+ArrowRight')
  await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-label', '任务与产物')

  expect(await page.locator('.detail-content:visible .editor-scroll').evaluate(element => element.scrollTop), 'after keyboard reorder').toBe(scroll)
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await expect(page.locator('.detail-content:visible')).toContainText('会话全部产物')
  await openMember(page, '研究员')
  await expect(tabs.getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('研究员未保存草稿')
  expect(await page.locator('.detail-content:visible .editor-scroll').evaluate(element => element.scrollTop)).toBe(scroll)
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect(page.locator('.detail-panel')).toBeHidden()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(2)
})

Then('员工草稿和滚动位置保留且关闭仅影响对应标签', async ({ runtime }) => {
  const page = runtime.page, tabs = page.getByRole('tablist', { name: '详情标签' })
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('研究员未保存草稿')
  await tabs.getByRole('button', { name: '关闭 任务与产物', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('研究员未保存草稿')
})

Then('多份员工草稿只保存指定标签的内容', async ({ runtime }) => {
  const page = runtime.page, tabs = page.getByRole('tablist', { name: '详情标签' })
  await openMember(page, '写手')
  await page.getByRole('textbox', { name: '员工职责', exact: true }).fill('只保存写手的新职责')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(1)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === 'writer')?.role).toBe('只保存写手的新职责')
  expect(snapshot.agents.find(agent => agent.id === 'researcher')?.role).not.toBe('研究员未保存草稿')
  await expect(page.getByRole('textbox', { name: '员工职责', exact: true })).toHaveValue('研究员未保存草稿')
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
  // Closing a dirty background tab activates it; cancel and save its own form.
  await tabs.getByRole('button', { name: '关闭 研究员', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveText(['任务与产物'])
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.role).toBe('研究员未保存草稿')
})

Then('跨会话和窄窗口中的详情标签仍保持独立', async ({ runtime }) => {
  const page = runtime.page, tabs = page.getByRole('tablist', { name: '详情标签' })
  await openMember(page, '研究员')
  await page.locator('.employee-detail').getByRole('tab', { name: '记忆', exact: true }).click()
  const scope = await page.getByRole('combobox', { name: '来源聊天', exact: true }).innerText()
  await page.locator('.conversation-item').filter({ hasText: '另一组工作' }).click()
  expect(await page.getByRole('combobox', { name: '来源聊天', exact: true }).innerText()).toBe(scope)
  await tabs.getByRole('tab', { name: '任务与产物', exact: true }).click()
  await expect(page.locator('.detail-content:visible')).toContainText('会话全部产物')
  await expect(page.locator('.detail-content:visible')).not.toContainText('请先打开对应会话')
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '任务与产物', exact: true }).click()
  await openMember(page, '写手')
  await page.getByRole('textbox', { name: '员工职责', exact: true }).fill('稍后放弃的草稿')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.evaluate(async () => {
    const state = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: state.revision })
  })
  await expect(tabs.getByRole('tab')).toHaveCount(4)
  await expect(tabs.getByRole('tab', { name: '写手', exact: true })).toBeInViewport()
  await expect(tabs.getByRole('button', { name: '关闭详情', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const activeWindow = tabs.locator('.detail-tab[data-selected=true]')
  await page.mouse.move(100, 100)
  const background = await activeWindow.evaluate(element => getComputedStyle(element).backgroundColor)
  await activeWindow.hover()
  // The selected tab keeps its shared indicator; hover only paints inactive tabs.
  await expect(activeWindow).toHaveCSS('background-color', background)
  await expect(tabs.locator('[data-slot=tabs-indicator]')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.screenshot({ path: 'test-results/detail-tabs-dark.png', animations: 'disabled' })
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveCount(3)
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'writer')?.role).toBe('只保存写手的新职责')
  const active = tabs.getByRole('tab', { selected: true })
  await active.focus(); await active.press('ArrowLeft'); await page.keyboard.press('Enter')
  await expect(tabs.getByRole('tab', { name: '研究员', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect(runtime.errors).toEqual([])
})

Then('窗口滑动层在切换排序关闭和缩放后对齐', async ({ runtime }) => {
  const page = runtime.page
  const tabs = page.getByRole('tablist', { name: '详情标签' })
  const aligned = () => tabs.evaluate(element => {
    const selected = element.querySelector('.detail-tab[data-selected=true]')!.getBoundingClientRect()
    const pill = element.querySelector('[data-slot=tabs-indicator]')!.getBoundingClientRect()
    return Math.max(Math.abs(pill.x - selected.x), Math.abs(pill.y - selected.y), Math.abs(pill.width - selected.width), Math.abs(pill.height - selected.height)) < 1
  })
  await expect.poll(aligned).toBe(true)
  await tabs.getByRole('tab', { name: '任务与产物', exact: true }).click()
  await expect.poll(aligned).toBe(true)
  await tabs.getByRole('tab', { name: '研究员', exact: true }).click()
  await tabs.getByRole('tab', { name: '研究员', exact: true }).press('Alt+ArrowLeft')
  await expect(tabs.getByRole('tab')).toHaveText(['研究员', '任务与产物'])
  await expect.poll(aligned).toBe(true)
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await expect.poll(aligned).toBe(true)
  await tabs.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(tabs.getByRole('tab')).toHaveText(['任务与产物'])
  await expect.poll(aligned).toBe(true)
  expect(runtime.errors).toEqual([])
})
