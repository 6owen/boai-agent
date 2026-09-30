/*
 * [INPUT]: 简化任务中文场景、生产 Electron 与隔离草稿模型端点。
 * [OUTPUT]: 七项/上下文选择、总览分类状态、主题窄窗截图、Agent 迟到/缺失/失败及提交前零计划、重启核对同一计划、较早历史/删除后定位断言。
 * [POS]: 定时任务体验简化 BDD 业务步骤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { scheduleAssistant } from '../support/schedule-assistant'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
type State = { fixture?: Awaited<ReturnType<typeof scheduleAssistant>>; planId?: string }
export const test = base.extend<{ schedule: State }>({ schedule: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const editor = (page: Page) => page.locator('.detail-content:visible')
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
async function chooseEmployee(page: Page) {
  await editor(page).getByRole('button', { name: '运行于', exact: true }).click()
  await choose(page, '执行员工', '研究员'); await page.keyboard.press('Escape')
}
async function assist(page: Page) {
  await page.getByRole('button', { name: '更多创建方式', exact: true }).click()
  await page.getByRole('menuitem', { name: '让 Agent 帮我创建', exact: true }).click()
  await choose(page, '草稿助手的模型连接', '草稿验收模型 · fixture')
}
Given('简化任务场景具备旧计划和草稿模型', async ({ runtime, schedule }) => {
  schedule.fixture = await scheduleAssistant(runtime)
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(runtime.page.getByText('安排重复任务，查看执行结果', { exact: true })).toBeVisible()
})
When('我在七项表单选择员工并创建工作日任务', async ({ runtime, schedule }) => {
  const page = runtime.page
  await expect(page.getByRole('group', { name: '即将执行', exact: true }).locator('.schedule-item')).toHaveCount(0)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(editor(page).locator('[data-schedule-field]')).toHaveCount(7)
  await expect(editor(page).getByLabel('标题', { exact: true })).toBeFocused()
  await editor(page).getByLabel('标题', { exact: true }).fill('工作日进展')
  await editor(page).getByLabel('任务描述', { exact: true }).fill('整理项目的最新进展')
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  await chooseEmployee(page)
  await editor(page).getByRole('button', { name: '重复', exact: true }).click()
  await choose(page, '重复规则', '工作日（周一至周五）'); await page.keyboard.press('Escape')
  await editor(page).getByRole('button', { name: '时间', exact: true }).click()
  await page.getByLabel('时区', { exact: true }).fill('Invalid/Zone')
  await expect(editor(page).getByRole('alert')).toContainText('时区')
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  await page.getByLabel('时区', { exact: true }).fill('Asia/Singapore')
  await page.getByText('查看后续时间', { exact: true }).click()
  await expect(page.locator('.automation-setting-popover li')).toHaveCount(5)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.getByRole('tab', { name: '新建定时任务', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(editor(page).getByLabel('标题', { exact: true })).toHaveValue('工作日进展')
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await expect(page.getByRole('tab', { name: '新建定时任务', exact: true })).toHaveCount(1)
  const evidence = resolve('ai-docs/spec/3.前端重构与功能/18-定时任务体验简化/evidence')
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/editor-light.png`, animations: 'disabled' })
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(780, 800); w.webContents.setZoomFactor(1.1) })
  await page.evaluate(async () => { const current = await window.boai.request('getAppearance', undefined); return window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: current.revision }) })
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeInViewport()
  await page.screenshot({ path: `${evidence}/editor-dark-narrow.png`, animations: 'disabled' })
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作日进展', exact: true })).toBeVisible()
  const created = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).definitions.find(d => d.name === '工作日进展')!)
  schedule.planId = created.id
  expect(created).toMatchObject({ enabled: true, sync: 'synced', daysOfWeek: [1,2,3,4,5], employeeIds: ['researcher'], conversationPolicy: 'new-conversation', timezone: 'Asia/Singapore', notificationPolicy: 'important_only' })
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1340, 900); w.webContents.setZoomFactor(1) })
})
Then('总览分类与暂停编辑保持真实计划状态', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '返回全部任务', exact: true }).click()
  await expect(page.getByRole('group', { name: '即将执行', exact: true }).locator('.schedule-item')).toHaveCount(1)
  await page.getByRole('button', { name: '即将执行', exact: true }).click()
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(page.getByRole('button', { name: '即将执行', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('textbox', { name: '搜索定时任务', exact: true }).fill('保留旧规则')
  await expect(page.locator('.schedule-overview-plan:visible')).toHaveCount(1)
  await page.locator('.schedule-overview-plan:visible').click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor(page).getByRole('combobox', { name: '通知', exact: true })).toContainText('每次结果')
  await editor(page).getByLabel('标题', { exact: true }).fill('旧任务改名')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  const old = await page.evaluate(async id => (await window.boai.request('listAutomations', undefined)).definitions.find(d => d.id === id), schedule.fixture!.pausedId)
  expect(old).toMatchObject({ enabled: false, timezone: 'UTC', time: '13:15', conversationId: schedule.fixture!.conversationId, notificationPolicy: 'all_results' })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '返回全部任务', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '搜索定时任务', exact: true })).toHaveValue('保留旧规则')
  await page.getByRole('textbox', { name: '搜索定时任务', exact: true }).fill('不存在')
  await expect(page.getByText('没有符合条件的任务', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索定时任务', exact: true }).fill('')
  await page.screenshot({ path: resolve('ai-docs/spec/3.前端重构与功能/18-定时任务体验简化/evidence/overview-dark.png'), animations: 'disabled' })
  expect(runtime.errors).toEqual([])
})
When('我让 Agent 提取任务并在生成途中修改草稿', async ({ runtime, schedule }) => {
  const page = runtime.page; await assist(page)
  await page.getByLabel('创建要求', { exact: true }).fill('让研究员每个工作日九点整理项目进展，延迟回复')
  await page.getByRole('button', { name: '生成草稿', exact: true }).click()
  await expect.poll(schedule.fixture!.calls).toBe(1)
  await editor(page).getByLabel('标题', { exact: true }).fill('保留我的手写标题')
  schedule.fixture!.release()
  await expect(page.getByText('草稿已经修改，本次生成结果未覆盖你的内容。', { exact: true })).toBeVisible()
  await expect(editor(page).getByLabel('标题', { exact: true })).toHaveValue('保留我的手写标题')
})
Then('迟到内容不覆盖手动输入且确认前没有新计划', async ({ runtime }) => {
  const page = runtime.page
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(1)
  await page.getByLabel('创建要求', { exact: true }).fill('让研究员每个工作日九点整理项目进展')
  await page.getByRole('button', { name: '生成草稿', exact: true }).click()
  await expect(editor(page).getByLabel('标题', { exact: true })).toHaveValue('项目进展日报')
  await expect(editor(page).locator('[data-schedule-field]')).toHaveCount(7)
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(1)
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '项目进展日报', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(2)
})
When('我提出含糊或不支持的要求并遇到生成失败', async ({ runtime }) => {
  const page = runtime.page; await assist(page)
  await page.getByLabel('创建要求', { exact: true }).fill('每个工作日晚上整理项目进展')
  await page.getByRole('button', { name: '生成草稿', exact: true }).click()
  await expect(page.getByRole('region', { name: '让 Agent 帮我创建' }).getByRole('status')).toContainText('请明确几点几分执行')
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  await page.getByLabel('创建要求', { exact: true }).fill('让研究员每月九点整理进展')
  await page.getByRole('button', { name: '生成草稿', exact: true }).click()
  await expect(page.getByRole('region', { name: '让 Agent 帮我创建' }).getByRole('status')).toContainText('暂不支持每月')
  await page.getByLabel('创建要求', { exact: true }).fill('生成失败')
  await page.getByRole('button', { name: '生成草稿', exact: true }).click()
  await expect(page.getByRole('region', { name: '让 Agent 帮我创建' }).getByRole('status')).toContainText('生成失败')
})
Then('我仍可在原七项草稿手动完成创建', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '手动填写', exact: true }).click()
  await editor(page).getByLabel('标题', { exact: true }).fill('手动接续草稿')
  await editor(page).getByLabel('任务描述', { exact: true }).fill('整理资料')
  await chooseEmployee(page)
  await editor(page).getByRole('button', { name: '时间', exact: true }).click()
  await page.getByLabel('执行时间', { exact: true }).fill('18:30'); await page.keyboard.press('Escape')
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '手动接续草稿', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(2)
  expect(runtime.errors).toEqual([])
})

When('计划保存后回执暂时丢失并重启应用', async ({ runtime, schedule }) => {
  const { loseCreationReceipt } = await import('../support/schedule-assistant')
  const page = runtime.page
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await editor(page).getByLabel('标题', { exact: true }).fill('回执核对任务')
  await editor(page).getByLabel('任务描述', { exact: true }).fill('每天整理资料')
  await chooseEmployee(page)
  await loseCreationReceipt(runtime)
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(editor(page).getByRole('button', { name: '核对创建结果', exact: true })).toBeVisible()
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  const definitions = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(definitions).toHaveLength(2)
  schedule.planId = definitions.find(d => d.name === '回执核对任务')!.id
  await runtime.restart()
})
Then('重新打开原草稿可核对同一个计划', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(editor(page).getByLabel('标题', { exact: true })).toHaveValue('回执核对任务')
  await editor(page).getByRole('button', { name: '核对创建结果', exact: true }).click()
  await expect(page.getByRole('heading', { name: '回执核对任务', exact: true })).toBeVisible()
  const definitions = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(definitions).toHaveLength(2)
  expect(definitions.find(d => d.name === '回执核对任务')!.id).toBe(schedule.planId)
  expect(await page.evaluate(() => localStorage.getItem('boai:automation:pending-creation'))).toBeNull()
})
When('我搜索最近三百条之外的已结束执行', async ({ runtime, schedule }) => {
  const { seedAutomationHistory } = await import('../support/automation-history')
  const page = runtime.page
  const dataPath = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedAutomationHistory(dataPath, schedule.fixture!.pausedId, 340)
  await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索执行记录', exact: true }).fill('过往记录 0')
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]:visible')).toHaveCount(1)
  await expect(page.locator('[data-occurrence-id]:visible')).toContainText('交付待核对')
  await page.getByRole('button', { name: '查看本次结果', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]:visible')).toBeFocused()
})
Then('旧计划删除后仍能定位该次结果', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.evaluate(id => window.boai.request('deleteAutomation', { id }), schedule.fixture!.pausedId)
  await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '搜索执行记录', exact: true })).toHaveValue('过往记录 0')
  await expect(page.locator('[data-occurrence-id]:visible')).toHaveCount(1)
  await page.getByRole('button', { name: '查看本次结果', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]:visible')).toContainText('过往记录 0')
  expect(await page.locator('[data-occurrence-id]:visible').getAttribute('data-occurrence-id')).toBe(`${schedule.fixture!.pausedId}-0000`)
  expect(runtime.errors).toEqual([])
})
