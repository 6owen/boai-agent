/*
 * [INPUT]: Natural-minute schedules, actual task-scoped SDK tools and isolated Electron UI.
 * [OUTPUT]: Bobo once creation/recovery, real clock and trial isolation, task UI acceptance/revision, cleanup and restart checks.
 * [POS]: Complete once/periodic employee-task workflow with a controlled provider and actual application/clock/storage.
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
import type { Desktop } from '../support/desktop'

type State = { fixture?: Awaited<ReturnType<typeof scheduledTaskWorker>>; planId?: string; mainId?: string; occurrence?: AutomationOccurrence; task?: EmployeeTaskDetail['task']; dueAt?: string; second?: AutomationOccurrence; trial?: AutomationOccurrence; once?: boolean; file?: string }
export const test = base.extend<{ scheduledTask: State }>({ scheduledTask: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function openTaskPanel(runtime: Desktop) {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  if (!await page.locator('[data-employee-tasks="researcher"]').isVisible()) await page.getByRole('button', { name: '任务', exact: true }).click()
  await expect(page.locator('[data-employee-tasks="researcher"]')).toBeVisible()
}
Given('Bobo会话已创建并核对一个即将到期的单次计划', async ({ runtime, scheduledTask: state }) => {
  test.setTimeout(240_000); state.once = true
  state.fixture = await scheduledTaskWorker(runtime); await runtime.start()
  state.mainId = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '单次完整流程模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'task-panel-fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, modelId: 'task-panel-fixture', executionPermission: 'full-access', expectedConfigVersion: configVersion })
    return (await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })).id
  }, state.fixture.url)
  state.dueAt = new Date(Math.ceil((Date.now() + 35_000) / 60_000) * 60_000).toISOString()
  state.fixture.setOnceAt(state.dueAt)
  const page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '新建定时任务', exact: true }).click()
  await page.getByRole('menuitem', { name: '对话创建', exact: true }).click()
  const composer = page.locator('.conversation-stage [aria-label="消息内容"]')
  await composer.press('End')
  await composer.pressSequentially(` E2E_ONCE_FULL_FLOW：请让研究员在${state.dueAt.slice(0, 10)} ${state.dueAt.slice(11, 16)} UTC执行一次文件任务，写panel-receipt.txt并发布供我验收。请核对原请求，不要重复建计划。`)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.conversation-stage .messages')).toContainText('E2E_ONCE_READY', { timeout: 35_000 })
  const view = await page.evaluate(() => window.boai.request('listAutomations', undefined))
  expect(view.definitions).toHaveLength(1)
  const plan = view.definitions[0]; state.planId = plan.id
  expect(plan).toMatchObject({ frequency: 'once', onceAt: state.dueAt, sync: 'synced' })
  expect(state.fixture.creationIssued).toEqual(['boai_catalog', 'boai_call', 'boai_receipt', 'boai_call'])
  expect(state.fixture.creationResults()).toHaveLength(3)
  expect(state.fixture.creationResults().every(r => r.status === 'succeeded' && (r.data as { id: string }).id === plan.id)).toBe(true)
  const trial = await page.evaluate(id => window.boai.request('executeApplicationOperation', { operation: 'automations.run', requestId: 'once-trial-before-due', input: { id } }), plan.id)
  expect(trial.status).toBe('succeeded'); state.trial = trial.data as AutomationOccurrence
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.trial!.id)).status, { timeout: 30_000 }).toBe('completed')
  expect((await page.evaluate(id => window.boai.request('getAutomation', { id }), plan.id))?.onceConsumedAt).toBeUndefined()
  expect(Date.now()).toBeLessThan(Date.parse(state.dueAt))
  await openTaskPanel(runtime)
  await runtime.reviewData('Bobo创建、原回执核对、同请求重试及到期前试跑', { plan, creationIssued: state.fixture.creationIssued, creationResults: state.fixture.creationResults(), trial: state.trial, fakeClock: false, externalProvider: false })
})
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
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.filter(o => o.source === 'schedule').length, { timeout: state.once ? 120_000 : 100_000 }).toBe(1)
  state.occurrence = (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.find(o => o.source === 'schedule')!
  expect(state.occurrence.source).toBe('schedule'); expect(state.occurrence.scheduledFor).toBe(state.dueAt)
  expect(state.occurrence.nativeRunId).toBe(`sched_schedule_boai-${state.planId}_${Date.parse(state.dueAt!)}`)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)).status, { timeout: 30_000 }).toBe('completed')
  const detail = await runtime.page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.occurrence.taskId!)
  state.task = detail.task
  expect(state.task).toMatchObject({ kind: 'assignment', sourceKind: 'schedule', status: 'in_review', statusSource: 'employee', sessionConversationId: state.occurrence.conversationId })
  const view = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.occurrence.conversationId)
  const run = view.runs.find(run => run.phase === 'execution')!
  state.file = join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', view.conversation.id, 'runs', run.id, 'panel-receipt.txt')
  expect(await readFile(state.file, 'utf8')).toBe('SCHEDULE_PANEL_DELIVERED\n')
  const plan = await runtime.page.evaluate(id => window.boai.request('getAutomation', { id }), state.planId!)
  if (!plan) throw Error('自然触发后的原计划不存在')
  if (state.once) {
    expect(plan).toMatchObject({ onceConsumedAt: expect.any(String), onceOccurrenceId: state.occurrence.id, enabled: true, sync: 'synced' })
    expect(await runtime.page.evaluate(id => window.boai.request('executeApplicationOperation', { operation: 'automations.get', input: { id } }), state.planId!)).toMatchObject({ status: 'succeeded', data: { state: 'finished', nextTimes: [] } })
    expect(state.task.id).not.toBe(state.trial!.taskId); expect(state.occurrence.conversationId).not.toBe(state.trial!.conversationId)
  } else expect(await runtime.page.evaluate(plan => window.boai.request('executeApplicationOperation', { operation: 'automations.pause', requestId: 'pause-after-first-fire', input: { id: plan.id, expectedRevision: plan.revision } }), plan)).toMatchObject({ status: 'succeeded' })
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
    expect(tasks.items.map(t => t.id).sort()).toEqual([state.task!.id, state.second.taskId!, ...(state.trial ? [state.trial.taskId!] : [])].sort())
    expect((await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences).toHaveLength(state.trial ? 3 : 2)
    expect((await runtime.page.evaluate(id => window.boai.request('getEmployeeTask', { employeeId: 'researcher', id }), state.task!.id)).executions.occurrences).toHaveLength(2)
  }
  expect(state.fixture!.requests.length).toBe(calls); expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('同一计划不同任务及两次重启零重放', { firstTask: state.task, secondExecution: state.second, issued: state.fixture!.issued, modelRequests: calls })
})
Then('清理任务与计划后历史保留且重启不复活', async ({ runtime, scheduledTask: state }) => {
  await openTaskPanel(runtime)
  const page = runtime.page, card = page.locator(`[data-employee-task-id="${state.task!.id}"]`)
  await card.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除任务', exact: true }).click()
  await page.getByRole('menuitem', { name: '确认删除', exact: true }).click()
  await expect(card).toHaveCount(0)
  expect((await page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))).items.map(t => t.id)).toContain(state.second!.taskId)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-item').filter({ hasText: '面板中的定时任务' }).click()
  await page.getByRole('group', { name: '定时任务操作', exact: true }).getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.schedule-item').filter({ hasText: '面板中的定时任务' })).toHaveCount(0)
  const before = await page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)
  expect(before.occurrences.map(o => o.id)).toContain(state.occurrence!.id)
  expect(await readFile(state.file!, 'utf8')).toBe('SCHEDULE_PANEL_DELIVERED\n')
  const calls = state.fixture!.requests.length
  await runtime.restart()
  expect((await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions).toEqual([])
  const tasks = await runtime.page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))
  expect(tasks.items.some(t => t.id === state.task!.id)).toBe(false); expect(tasks.items.map(t => t.id)).toContain(state.second!.taskId)
  expect((await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.map(o => o.id).sort()).toEqual(before.occurrences.map(o => o.id).sort())
  expect(state.fixture!.requests.length).toBe(calls)
  expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('任务和计划分别清理，历史保留且重启不复活', { deletedTaskId: state.task!.id, retainedTaskId: state.second!.taskId, history: before, modelRequests: calls })
})
