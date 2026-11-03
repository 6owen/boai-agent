/*
 * [INPUT]: Natural-minute schedules, actual task-scoped SDK tools and isolated Electron UI.
 * [OUTPUT]: Visible task cards, private task chat, peer-status acceptance/revision, new execution tasks and two restart checks.
 * [POS]: Employee-task panel acceptance; hourly clock isolates the separately recorded once-clock defect.
 * [PROTOCOL]: Changes update Header and owning .folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationOccurrence, ConversationDetail } from '../../../packages/shared/src/domain'
import type { EmployeeTaskDetail } from '../../../packages/shared/src/domain/employee-tasks'
import { test as base } from '../support/test'
import { scheduledTaskWorker } from '../support/scheduled-task-worker'

type State = { fixture?: Awaited<ReturnType<typeof scheduledTaskWorker>>; planId?: string; mainId?: string; occurrence?: AutomationOccurrence; task?: EmployeeTaskDetail['task']; dueAt?: string; second?: AutomationOccurrence }
export const test = base.extend<{ scheduledTask: State }>({ scheduledTask: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('员工任务面板已有一个即将自然到期的计划', async ({ runtime, scheduledTask: state }) => {
  test.setTimeout(210_000)
  state.fixture = await scheduledTaskWorker(runtime); await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '员工任务面板验收', provider: 'openai-compatible', baseUrl: url, defaultModel: 'task-panel-fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, modelId: 'task-panel-fixture', executionPermission: 'full-access', expectedConfigVersion: configVersion })
    const main = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    await window.boai.request('executeApplicationOperation', { operation: 'tasks.create', requestId: 'internal-progress', input: { agentId: 'researcher', title: '内部步骤不能进入看板' } })
    const dueAt = new Date(Math.ceil((Date.now() + 15_000) / 60_000) * 60_000).toISOString()
    const result = await window.boai.request('executeApplicationOperation', { operation: 'automations.create', requestId: 'panel-periodic-plan', input: { name: '面板中的定时任务', employeeId: 'researcher', instruction: '写出panel-receipt.txt，交付后设为待确认，供用户验收。', trigger: { kind: 'hourly', minute: Number(dueAt.slice(14, 16)), timezone: 'UTC' }, notification: 'muted' } })
    if (result.status !== 'succeeded') throw Error(JSON.stringify(result))
    return { plan: result.data as { id: string; nextTriggerAt: string }, mainId: main.id, dueAt }
  }, state.fixture.url)
  state.planId = setup.plan.id; state.mainId = setup.mainId; state.dueAt = setup.dueAt
  expect(setup.plan.nextTriggerAt).toBe(setup.dueAt)
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '任务', exact: true }).click()
  await expect(page.locator('[data-employee-tasks="researcher"]')).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))).items).toEqual([])
  await runtime.reviewData('计划真实分钟到期之前', { ...setup, fakeClock: false, manualTrigger: false, externalProvider: false })
})
When('计划自然触发并由员工交付任务文件', async ({ runtime, scheduledTask: state }) => {
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.length, { timeout: 100_000 }).toBe(1)
  state.occurrence = (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences[0]
  expect(state.occurrence.source).toBe('schedule'); expect(state.occurrence.scheduledFor).toBe(state.dueAt)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)).status, { timeout: 30_000 }).toBe('completed')
  const detail = await runtime.page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.occurrence.taskId!)
  state.task = detail.task
  expect(state.task).toMatchObject({ kind: 'assignment', sourceKind: 'schedule', status: 'in_review', statusSource: 'employee', sessionConversationId: state.occurrence.conversationId })
  const view = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.occurrence.conversationId)
  const run = view.runs.find(run => run.phase === 'execution')!
  expect(await readFile(join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', view.conversation.id, 'runs', run.id, 'panel-receipt.txt'), 'utf8')).toBe('SCHEDULE_PANEL_DELIVERED\n')
  const plan = await runtime.page.evaluate(id => window.boai.request('getAutomation', { id }), state.planId!)
  if (!plan) throw Error('自然触发后的原计划不存在')
  expect(await runtime.page.evaluate(plan => window.boai.request('executeApplicationOperation', { operation: 'automations.pause', requestId: 'pause-after-first-fire', input: { id: plan.id, expectedRevision: plan.revision } }), plan)).toMatchObject({ status: 'succeeded' })
  await expect(runtime.page.locator(`[data-employee-task-id="${state.task.id}"]`)).toBeVisible()
  await runtime.reviewNativeCheckpoint('自然触发后任务卡片进入待确认列')
})
Then('我能在任务面板打开该任务继续修改和验收', async ({ runtime, scheduledTask: state }) => {
  const page = runtime.page
  await page.locator(`[data-employee-task-id="${state.task!.id}"]`).getByRole('button', { name: '打开任务：面板中的定时任务', exact: true }).click()
  const dialog = page.locator(`[data-employee-task-dialog="${state.task!.id}"]`)
  await expect(dialog).toBeVisible(); await expect(dialog.locator('[aria-label="任务会话"]')).toContainText('SCHEDULE_PANEL_DELIVERED')
  await dialog.getByRole('button', { name: '任务状态', exact: true }).click()
  await page.getByRole('option', { name: '完成', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.task!.id)).task.status).toBe('done')
  await dialog.locator('[aria-label="消息内容"]').fill('请在这个任务里继续修改并交付下一版文件。')
  await dialog.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.task!.id)).executions.occurrences.filter(o => o.status === 'completed').length, { timeout: 30_000 }).toBe(2)
  const current = await page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.task!.id)
  expect(current.task).toMatchObject({ id: state.task!.id, sessionConversationId: state.occurrence!.conversationId, status: 'in_review' })
  expect(new Set(current.executions.occurrences.map(o => o.conversationId)).size).toBe(1)
  await runtime.reviewData('完成后直接在原任务会话续改', current)
  await runtime.reviewNativeCheckpoint('员工任务Dialog中的独立对话和待确认状态')
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
})
Then('再次运行产生独立任务且两次重启不重放', async ({ runtime, scheduledTask: state }) => {
  const result = await runtime.page.evaluate(id => window.boai.request('executeApplicationOperation', { operation: 'automations.run', requestId: 'second-explicit-employee-task', input: { id } }), state.planId!)
  expect(result.status).toBe('succeeded'); state.second = result.data as AutomationOccurrence
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.second!.id)).status, { timeout: 30_000 }).toBe('completed')
  expect(state.second.taskId).not.toBe(state.task!.id); expect(state.second.conversationId).not.toBe(state.occurrence!.conversationId)
  await expect(runtime.page.locator(`[data-employee-task-id="${state.second.taskId}"]`)).toBeVisible()
  const main = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.mainId!) as ConversationDetail
  expect(main.messages.some(m => m.content.includes('SCHEDULE_PANEL_DELIVERED'))).toBe(false)
  const calls = state.fixture!.requests.length
  for (let i = 0; i < 2; i++) {
    await runtime.restart()
    const tasks = await runtime.page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))
    expect(tasks.items.map(t => t.id).sort()).toEqual([state.task!.id, state.second.taskId!].sort())
    expect((await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences).toHaveLength(2)
    expect((await runtime.page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.task!.id)).executions.occurrences).toHaveLength(2)
  }
  expect(state.fixture!.requests.length).toBe(calls); expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('同一计划不同任务及两次重启零重放', { firstTask: state.task, secondExecution: state.second, issued: state.fixture!.issued, modelRequests: calls })
})
