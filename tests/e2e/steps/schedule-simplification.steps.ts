/*
 * [OUTPUT]: 对话创建转普通会话并预选管理标签，按原业务协议实际保存/编辑/重启零重放；本次未运行E2E。
 * [OUTPUT]: 手动新建/编辑保持Dialog；bobo对话创建进入会话页，原实际保存/重启零重放断言保持；本次不运行E2E。
 * [OUTPUT]: 详情配置Card沿真实编辑/暂停持久化流程核对；核对操作行实际高度/透明背景，保留宽窗与深色窄窗原生截图。
 * [OUTPUT]: 两行列表与详情三个管理按钮；编辑、暂停/恢复、重启和UI删除后的原历史均核对持久状态。
 * [OUTPUT]: 错误通过Sonner且业务区无报错DOM；草稿、布局与明确重试/核对保持。
 * [INPUT]: 定时任务页中文场景、生产Electron与隔离本地bobo工具协议。
 * [OUTPUT]: 命令权限开关独立保存且员工均可被定时任务选择，六频率同行控件/滚动及原两类创建/回执/历史保持。
 * [POS]: 当前定时任务页面BDD；替代旧总览/七项浮层的界面步骤，保留持久业务断言。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { scheduleAssistant, loseCreationReceipt, rejectFirstScheduleSave } from '../support/schedule-assistant'
type State = { fixture?: Awaited<ReturnType<typeof scheduleAssistant>>; planId?: string }
export const test = base.extend<{ schedule: State }>({ schedule: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const editor = (page: Page) => page.locator('.schedule-editor-dialog .editor-frame')
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.locator('[data-slot=select-content]').evaluateAll(elements => Promise.all(elements.flatMap(element => element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))))
}
async function create(page: Page, mode = '手动创建') {
  await page.getByRole('button', { name: '新建定时任务', exact: true }).click()
  await page.getByRole('menuitem', { name: mode, exact: true }).click()
  if (mode === '手动创建') await expect(page.getByRole('dialog', { name: '新建定时任务', exact: true })).toBeVisible()
  else {
    await expect(page.locator('.core-chat-start')).toBeVisible()
    await expect(page.locator('.core-chat-start .composer-mention-node')).toContainText('$管理定时任务')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
}
async function history(page: Page) {
  await page.getByRole('button', { name: '定时任务选项', exact: true }).click()
  await page.getByRole('menuitem', { name: '执行记录', exact: true }).click()
}
async function fill(page: Page, title: string) {
  await editor(page).getByLabel('名称', { exact: true }).fill(title)
  await editor(page).getByLabel('描述', { exact: true }).fill('跟踪项目进展')
  await editor(page).getByLabel('任务指令', { exact: true }).fill('整理项目的最新进展')
  await choose(page, '执行员工', '研究员')
}
Given('简化任务场景具备旧计划和草稿模型', async ({ runtime, schedule }) => {
  schedule.fixture = await scheduleAssistant(runtime)
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(runtime.page.locator('.schedule-content .illustrated-empty')).toBeVisible()
  await expect(runtime.page.getByRole('group', { name: '全部定时任务', exact: true }).locator('.schedule-item')).toHaveCount(1)
})
Then('两行列表和详情按钮保存编辑暂停恢复状态', async ({ runtime, schedule }) => {
  let page = runtime.page
  const item = page.locator('.schedule-item')
  await expect(item.locator(':scope > strong')).toHaveCount(1)
  await expect(item.locator(':scope > small')).toHaveCount(1)
  await expect(item).not.toContainText('研究员')
  await item.click()
  const actions = page.getByRole('group', { name: '定时任务操作', exact: true })
  expect(await actions.getByRole('button').allTextContents()).toEqual(['编辑', '恢复', '删除'])
  await actions.getByRole('button', { name: '编辑', exact: true }).click()
  await editor(page).getByLabel('名称', { exact: true }).fill('每日天气预报')
  await editor(page).getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByRole('heading', { name: '每日天气预报', exact: true })).toBeVisible()
  await actions.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(actions.getByRole('button', { name: '暂停', exact: true })).toBeEnabled()
  await expect(item).not.toContainText('已暂停')
  expect(await page.evaluate(id => window.boai.request('getAutomation', { id }), schedule.fixture!.pausedId)).toMatchObject({ name: '每日天气预报', enabled: true })
  await expect(page.getByRole('region', { name: '计划摘要', exact: true })).toContainText('每日天气预报')
  await expect(page.getByRole('region', { name: '计划摘要', exact: true })).toContainText('研究员')
  const footer = await page.locator('.automation-detail-actions').evaluate(element => ({ height: element.getBoundingClientRect().height, background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius, buttonHeight: element.querySelector('button')!.getBoundingClientRect().height }))
  expect(footer.height).toBe(40)
  expect(footer.background).toBe('rgba(0, 0, 0, 0)')
  expect(footer.radius).toBe('0px')
  await runtime.reviewData('任务卡片操作行实际尺寸', footer)
  await runtime.reviewNativeCheckpoint('定时任务只读配置卡片')
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(900, 800); w.webContents.setZoomFactor(1.25) })
  await page.evaluate(async () => { const current = await window.boai.request('getAppearance', undefined); return window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: current.revision }) })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.evaluate(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))) })
  await runtime.reviewNativeCheckpoint('深色窄窗定时任务配置卡片')
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1340, 900); w.webContents.setZoomFactor(1) })
  await actions.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(actions.getByRole('button', { name: '恢复', exact: true })).toBeEnabled()
  await expect(item).toContainText('已暂停')
  await runtime.restart(); page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-item').click()
  await expect(page.getByRole('group', { name: '定时任务操作', exact: true }).getByRole('button', { name: '恢复', exact: true })).toBeEnabled()
  const saved = await page.evaluate(id => window.boai.request('getAutomation', { id }), schedule.fixture!.pausedId)
  expect(saved).toMatchObject({ name: '每日天气预报', enabled: false })
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences).toHaveLength(0)
  expect(schedule.fixture!.calls()).toBe(0)
  expect(runtime.errors).toEqual([])
})
When('我在弹窗选择员工并创建工作日任务', async ({ runtime, schedule }) => {
  const page = runtime.page
  await create(page)
  await expect(editor(page).getByLabel('名称', { exact: true })).toBeFocused()
  await expect(page.locator('.detail-panel:visible .automation-editor')).toHaveCount(0)
  await fill(page, '工作日进展')
  await choose(page, '频率', '工作日')
  await expect(editor(page).getByLabel('时区', { exact: true })).toHaveCount(0)
  await expect(editor(page).getByRole('combobox', { name: '通知', exact: true })).toHaveCount(0)
  await expect(editor(page).getByLabel('开始日期', { exact: true })).toHaveCount(0)
  await expect(editor(page).getByText(/下次：|查看后续时间|在此设备运行/)).toHaveCount(0)
  const geometry = await page.locator('.schedule-editor-dialog').evaluate(el => ({ right: el.getBoundingClientRect().right, viewportRight: window.innerWidth, overflow: getComputedStyle(el).overflowY, innerOverflow: getComputedStyle(el.querySelector('.editor-scroll')!).overflowY }))
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportRight)
  expect(geometry.overflow).toBe('auto'); expect(geometry.innerOverflow).toBe('visible')
  await expect(page.locator('.schedule-content .illustrated-empty')).toBeVisible()
  await runtime.reviewNativeCheckpoint('弹窗创建工作日任务')
  // Reduce the viewport to exercise the dialog’s own scroll area and flowing actions.
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1080, 640); w.webContents.setZoomFactor(1.5) })
  await page.evaluate(async () => { const current = await window.boai.request('getAppearance', undefined); return window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: current.revision }) })
  await expect.poll(() => page.locator('.schedule-editor-dialog').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  await page.locator('.schedule-editor-dialog').evaluate(el => { el.scrollTop = 0 })
  const flow = await page.locator('.schedule-editor-dialog').evaluate(el => {
    const footer = el.querySelector('.editor-footer')!, before = footer.getBoundingClientRect().top
    el.scrollTop = 100
    return { moved: before - footer.getBoundingClientRect().top, scroll: el.scrollTop, background: getComputedStyle(footer).backgroundColor }
  })
  expect(flow.scroll).toBeGreaterThan(0); expect(flow.moved).toBeCloseTo(flow.scroll, 0)
  expect(flow.background).toBe('rgba(0, 0, 0, 0)')
  await editor(page).getByRole('button', { name: '创建', exact: true }).scrollIntoViewIfNeeded()
  expect(await page.locator('.schedule-editor-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await runtime.reviewNativeCheckpoint('窄窗深色手动创建')
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作日进展', exact: true })).toBeVisible()
  const created = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).definitions.find(d => d.name === '工作日进展')!)
  schedule.planId = created.id
  expect(created).toMatchObject({ owner: { kind: 'employee', employeeId: 'researcher' }, enabled: true, sync: 'synced', daysOfWeek: [1,2,3,4,5], employeeIds: ['researcher'], conversationPolicy: 'new-conversation', timezone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), notificationPolicy: 'important_only' })
  await runtime.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1340, 900); w.webContents.setZoomFactor(1) })
})
Then('员工查看回到同一计划且暂停编辑保持旧状态', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.locator('.contacts-list').getByRole('button', { name: '研究员', exact: true }).click()
  const owner = page.getByRole('region', { name: '员工定时任务', exact: true })
  await expect(owner.getByRole('button', { name: /工作日进展/ })).toBeVisible()
  await expect(owner.getByRole('button', { name: /新建|编辑|运行/ })).toHaveCount(0)
  await owner.getByRole('button', { name: /工作日进展/ }).click()
  await expect(page.locator('.schedule-content').getByRole('heading', { name: '工作日进展', exact: true })).toBeVisible()
  await expect(page.locator('.schedule-item[aria-current=page]')).toContainText('工作日进展')
  await page.getByRole('group', { name: '全部定时任务', exact: true }).getByRole('button', { name: /暂停的旧日报/ }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor(page).getByRole('combobox', { name: '通知', exact: true })).toHaveCount(0)
  await editor(page).getByLabel('名称', { exact: true }).fill('旧任务改名')
  await editor(page).getByRole('button', { name: '保存修改', exact: true }).click()
  const old = await page.evaluate(id => window.boai.request('getAutomation', { id }), schedule.fixture!.pausedId)
  expect(old).toMatchObject({ enabled: false, timezone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), time: '13:15', conversationId: schedule.fixture!.conversationId, notificationPolicy: 'all_results' })
  await runtime.reviewNativeCheckpoint('全部任务与旧暂停计划')
  expect(runtime.errors).toEqual([])
})
Then('六种频率显示各自配置且只选择单个员工', async ({ runtime, schedule }) => {
  const page = runtime.page
  await create(page)
  await expect(page.getByRole('combobox', { name: '执行员工', exact: true })).toContainText('从通讯录选择员工')
  await page.getByRole('combobox', { name: '执行员工', exact: true }).click()
  await expect(page.getByRole('option', { name: /群|bobo|从通讯录选择员工/ })).toHaveCount(0)
  const employees = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.filter(a => a.id !== 'bobo').map(a => a.name).sort())
  expect((await page.getByRole('option').allTextContents()).sort()).toEqual(employees)
  await page.keyboard.press('Escape')
  await fill(page, '每月简报')
  await editor(page).getByText('频率', { exact: true }).click()
  await expect(editor(page).getByRole('combobox', { name: '频率', exact: true })).toHaveAttribute('aria-expanded', 'false')
  for (const frequency of ['手动', '每小时', '每天', '工作日', '每周', '每月']) {
    await choose(page, '频率', frequency)
    await expect(editor(page).getByLabel('开始日期', { exact: true })).toHaveCount(frequency === '每月' ? 1 : 0)
    await expect(editor(page).getByLabel('执行时间', { exact: true })).toHaveCount(['手动', '每小时'].includes(frequency) ? 0 : 1)
    await expect(editor(page).getByRole('combobox', { name: '每小时的第几分钟', exact: true })).toHaveCount(0)
    await expect(editor(page).getByRole('combobox', { name: '每月日期', exact: true })).toHaveCount(0)
    await expect(editor(page).getByRole('combobox', { name: '星期', exact: true })).toHaveCount(frequency === '每周' ? 1 : 0)
    if (frequency === '每周') { await choose(page, '星期', '星期四'); await expect(editor(page).getByRole('combobox', { name: '星期', exact: true })).toContainText('星期四') }
    const controlRows = await page.locator('.schedule-frequency-controls').evaluate(el => Array.from(el.children).filter(node => node instanceof HTMLElement && node.getBoundingClientRect().height > 10).map(node => Math.round(node.getBoundingClientRect().top)))
    // In the regular desktop window all visible controls occupy one row.
    expect(Math.max(...controlRows) - Math.min(...controlRows)).toBeLessThan(10)
    const controls = await page.locator('.schedule-frequency-controls').evaluate(el => Array.from(el.querySelectorAll('[role=combobox], [data-slot=input]')).map(node => {
      const rect = node.getBoundingClientRect(); return { height: rect.height, left: rect.left, right: rect.right }
    }))
    expect(controls.every(control => Math.abs(control.height - 32) < 1)).toBe(true)
    const title = await editor(page).getByText('频率', { exact: true }).boundingBox()
    expect(controls[0].left - title!.x - title!.width).toBeCloseTo(12, 0)
    const employee = await editor(page).getByRole('combobox', { name: '执行员工', exact: true }).boundingBox()
    const frequencyRow = await page.getByRole('group', { name: '执行频率', exact: true }).boundingBox()
    const instructions = await editor(page).getByLabel('任务指令', { exact: true }).boundingBox()
    await expect(page.getByRole('group', { name: '任务指令与执行员工', exact: true })).toHaveCount(0)
    expect(employee!.y).toBeGreaterThan(instructions!.y + instructions!.height)
    expect(employee!.y).toBeCloseTo(frequencyRow!.y, 0)
    expect(employee!.x).toBeGreaterThan(Math.max(...controls.map(control => control.right)))
    expect(employee!.x + employee!.width).toBeCloseTo(instructions!.x + instructions!.width, 0)
    expect(employee!.height).toBeCloseTo(controls[0].height, 0)
    await runtime.reviewNativeCheckpoint(`${frequency}单行配置`)
  }
  await editor(page).getByLabel('开始日期', { exact: true }).fill('2027-03-31')
  await editor(page).getByLabel('执行时间', { exact: true }).fill('14:45')
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '每月简报', exact: true })).toBeVisible()
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === '每月简报')!
  expect(plan).toMatchObject({ frequency: 'monthly', startsOn: '2027-03-31', dayOfMonth: 31, time: '14:45', employeeIds: ['researcher'] })
  expect(schedule.fixture!.calls()).toBe(0)
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(2)
})
Then('员工命令配置可保存且不改变任务候选', async ({ runtime }) => {
  const page = runtime.page
  for (const allowed of [false, true]) {
    await page.getByRole('button', { name: '通讯录', exact: true }).click()
    await page.locator('.contacts-list').getByRole('button', { name: '研究员', exact: true }).click()
    await page.getByRole('button', { name: '编辑配置', exact: true }).click()
    await choose(page, '命令执行', allowed ? '允许，执行前确认' : '关闭')
    await page.getByRole('button', { name: /^(保存|保存修改)$/ }).click()
    await expect.poll(() => page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!.allowCommands)).toBe(allowed)
    // An unrelated edit must retain the explicitly saved permission.
    await page.getByRole('textbox', { name: '员工职责', exact: true }).fill(allowed ? '允许申请命令的研究员' : '关闭命令的研究员')
    await page.getByRole('button', { name: /^(保存|保存修改)$/ }).click()
    await expect.poll(() => page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!.role)).toBe(allowed ? '允许申请命令的研究员' : '关闭命令的研究员')
    expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!.allowCommands)).toBe(allowed)
    await runtime.reviewNativeCheckpoint(allowed ? '员工命令权限开启' : '员工命令权限关闭')
    await page.getByRole('button', { name: '定时任务', exact: true }).click()
    await create(page)
    await page.getByRole('combobox', { name: '执行员工', exact: true }).click()
    await expect(page.getByRole('option', { name: '研究员', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await editor(page).getByRole('button', { name: '取消', exact: true }).click()
  }
  expect(runtime.errors).toEqual([])
})
When('计划保存后回执暂时丢失并重启应用', async ({ runtime, schedule }) => {
  const page = runtime.page
  await create(page); await fill(page, '回执核对任务'); await choose(page, '频率', '手动')
  await loseCreationReceipt(runtime)
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(editor(page).getByRole('button', { name: '核对创建结果', exact: true })).toBeVisible()
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeDisabled()
  const definitions = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(definitions).toHaveLength(2); schedule.planId = definitions.find(d => d.name === '回执核对任务')!.id
  await runtime.restart()
})
Then('重新打开原草稿可核对同一个计划', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click(); await create(page)
  await expect(editor(page).getByLabel('名称', { exact: true })).toHaveValue('回执核对任务')
  await editor(page).getByRole('button', { name: '核对创建结果', exact: true }).click()
  await expect(page.getByRole('heading', { name: '回执核对任务', exact: true })).toBeVisible()
  const definitions = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(definitions).toHaveLength(2); expect(definitions.find(d => d.name === '回执核对任务')!.id).toBe(schedule.planId)
  expect(await page.evaluate(() => localStorage.getItem('boai:automation:pending-creation'))).toBeNull()
})
When('我搜索最近三百条之外的已结束执行', async ({ runtime, schedule }) => {
  const { seedAutomationHistory } = await import('../support/automation-history')
  const page = runtime.page, dataPath = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedAutomationHistory(dataPath, schedule.fixture!.pausedId, 340); await history(page)
  await page.getByRole('button', { name: '搜索执行记录', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索执行记录', exact: true }).fill('过往记录 0')
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(page.locator('[data-occurrence-id]:visible')).toHaveCount(1)
  await expect(page.locator('[data-occurrence-id]:visible')).toContainText('交付待核对')
  await page.locator('.automation-record-row:visible').click()
  await expect(page.locator('.detail-panel [data-occurrence-detail-id]:visible')).toHaveAttribute('data-occurrence-detail-id', `${schedule.fixture!.pausedId}-0000`)
})
Then('旧计划删除后仍能定位该次结果', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.locator('.schedule-item').filter({ hasText: '暂停的旧日报' }).click()
  await page.getByRole('group', { name: '定时任务操作', exact: true }).getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.schedule-content .illustrated-empty')).toBeVisible()
  await history(page)
  await expect(page.getByRole('textbox', { name: '搜索执行记录', exact: true })).toHaveValue('过往记录 0')
  await expect(page.locator('[data-occurrence-id]:visible')).toHaveCount(1)
  await page.locator('.automation-record-row:visible').click()
  await expect(page.locator('[data-occurrence-id]:visible')).toContainText('过往记录 0')
  expect(await page.locator('.detail-panel [data-occurrence-detail-id]:visible').getAttribute('data-occurrence-detail-id')).toBe(`${schedule.fixture!.pausedId}-0000`)
  await expect(page.locator('.schedule-list').getByText('还没有定时任务', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '全部定时任务', exact: true }).locator('.schedule-item')).toHaveCount(0)
  expect(runtime.errors).toEqual([])
})
When('我与bobo澄清后创建月度任务', async ({ runtime, schedule }) => {
  const page = runtime.page
  await create(page, '对话创建')
  const input = page.locator('.conversation-stage [aria-label="消息内容"]')
  await input.press('End')
  await input.pressSequentially('请帮我安排一个定时任务')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.conversation-stage .messages')).toContainText('请告诉我由哪位员工执行')
  const chats = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(room => room.purpose === 'core')
  expect(chats).toHaveLength(1)
  expect(chats[0].automationCreation).toBeUndefined()
  const firstMessage = (await page.evaluate(id => window.boai.request('getConversation', { id }), chats[0].id)).messages.find(message => message.senderType === 'user')!
  expect(firstMessage.composerReferences).toContainEqual({ kind: 'builtin-skill', id: 'automations', name: '管理定时任务', agentId: 'bobo', version: 1 })
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(1)
  await input.fill('请让研究员每月15日早上九点整理行业进展，从2027年1月开始')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.conversation-stage .messages')).toContainText('已创建「月度行业简报」')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === '月度行业简报')!
  schedule.planId = plan.id
  expect(plan).toMatchObject({ owner: { kind: 'employee', employeeId: 'researcher' }, employeeIds: ['researcher'], description: '每月行业动态', frequency: 'monthly', dayOfMonth: 15, startsOn: '2027-01-01' })
  await runtime.reviewData('bobo真实计划保存回执', plan)
  await runtime.reviewNativeCheckpoint('普通bobo会话与管理定时任务标签')
})
Then('对话任务可在手动表单查看且重启不重复创建', async ({ runtime, schedule }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-item').filter({ hasText: '月度行业简报' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor(page).getByLabel('名称', { exact: true })).toHaveValue('月度行业简报')
  await expect(editor(page).getByLabel('开始日期', { exact: true })).toHaveValue('2027-01-15')
  await expect(editor(page).getByRole('combobox', { name: '执行员工', exact: true })).toContainText('研究员')
  const calls = schedule.fixture!.calls(); await runtime.restart()
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(runtime.page.getByRole('group', { name: '全部定时任务', exact: true }).locator('.schedule-item')).toHaveCount(2)
  expect(schedule.fixture!.calls()).toBe(calls)
  const plans = (await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(plans.filter(d => d.id === schedule.planId)).toHaveLength(1)
  expect(runtime.errors).toEqual([])
})

Then('创建报错只显示Sonner且保留草稿供重试', async ({ runtime, schedule }) => {
  const page = runtime.page
  await create(page); await fill(page, '失败后重试的天气预报'); await choose(page, '频率', '手动')
  await rejectFirstScheduleSave(runtime)
  const before = await editor(page).getByRole('button', { name: '创建', exact: true }).boundingBox()
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: '验收：保存暂不可用' })
  await expect(toast).toHaveCount(1)
  await expect(toast).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
  await expect.poll(async () => { const rect = await toast.boundingBox(); return !!rect && rect.y >= 0 }).toBe(true)
  await toast.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))))
  await expect(page.locator('.schedule-content')).not.toContainText('验收：保存暂不可用')
  await expect(editor(page).locator('[role=alert], .banner.error, [data-slot=field-error]')).toHaveCount(0)
  await expect(editor(page).getByLabel('名称', { exact: true })).toHaveValue('失败后重试的天气预报')
  await expect(editor(page).getByRole('combobox', { name: '执行员工', exact: true })).toContainText('研究员')
  await expect(editor(page).getByRole('button', { name: '创建', exact: true })).toBeEnabled()
  const after = await editor(page).getByRole('button', { name: '创建', exact: true }).boundingBox()
  expect(after!.y).toBeCloseTo(before!.y, 0)
  expect((await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toHaveLength(1)
  await runtime.reviewNativeCheckpoint('创建失败只显示Sonner且表单布局保持')
  await editor(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '失败后重试的天气预报', exact: true })).toBeVisible()
  const plans = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions
  expect(plans.filter(p => p.name === '失败后重试的天气预报')).toHaveLength(1)
  expect(schedule.fixture!.calls()).toBe(0)
  expect(runtime.errors).toEqual([])
})

Then('执行记录保持主区并只展示选中运行的过程', async ({ runtime, schedule }) => {
  const { seedAutomationProcesses } = await import('../support/automation-history')
  let page = runtime.page
  const root = (await page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await seedAutomationProcesses(root, schedule.fixture!.pausedId, schedule.fixture!.conversationId)
  await runtime.restart(); page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-item').click()
  const main = page.locator('.schedule-content'), rows = main.locator('.automation-record-row')
  await expect(rows).toHaveCount(3)
  await expect(main.getByRole('heading', { name: '最新结果', exact: true })).toHaveCount(0)
  expect(await rows.first().locator('.conversation-title').innerText()).toBe('天气记录 3')
  expect(await page.locator('.automation-detail-actions').evaluate(el => el.getBoundingClientRect().height)).toBe(40)
  await main.getByRole('button', { name: '搜索执行记录', exact: true }).click()
  await main.getByRole('textbox', { name: '搜索执行记录', exact: true }).fill('天气记录 1')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  const panel = page.locator('.detail-panel .automation-occurrence-panel:visible')
  await expect(panel).toContainText('南京天气结果 1')
  await expect(panel).not.toContainText('南京天气结果 2')
  await expect(panel).not.toContainText('南京天气结果 3')
  await expect(panel.locator('[data-execution-run-id]')).toHaveCount(1)
  await expect(main.getByRole('heading', { name: '暂停的旧日报', exact: true })).toBeVisible()
  await expect(main.getByRole('textbox', { name: '搜索执行记录', exact: true })).toHaveValue('天气记录 1')
  await panel.getByRole('button', { name: '显示原生记录', exact: true }).click()
  await expect(panel.locator('[data-execution-view=raw]')).toBeVisible()
  await panel.getByRole('button', { name: '显示过程视图', exact: true }).click()
  await expect(panel.locator('[data-execution-run-id]')).toContainText('南京天气结果 1')
  await rows.first().click()
  await expect(page.getByRole('tab', { name: '执行过程', exact: true })).toHaveCount(1)
  await runtime.reviewNativeCheckpoint('任务执行列表检索与右侧本次过程')
  await page.getByRole('button', { name: '会话', exact: true }).first().click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await expect(panel).toContainText('南京天气结果 1')
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await main.getByRole('textbox', { name: '搜索执行记录', exact: true }).fill('天气记录')
  await expect(rows).toHaveCount(3)
  await rows.filter({ hasText: '天气记录 2' }).click()
  await expect(panel).toContainText('南京天气结果 2')
  await expect(panel).not.toContainText('南京天气结果 1')
  await runtime.reviewNativeCheckpoint('切换另一条执行记录')
  expect(schedule.fixture!.calls()).toBe(0)
  expect(runtime.errors).toEqual([])
})
