/*
 * [OUTPUT]: 2026-11-27 点击执行记录行直接定位原话题，无需打开运行详情。
 * [OUTPUT]: 定时定位后仅显示原话题，不自动挂载会话侧执行过程。
 * [OUTPUT]: 2026-11-25 定时自然触发、历史定位和通知直达员工话题；普通消息续改、原计划删除及重启不重放。
 * [INPUT]: Natural-minute schedules, actual session-scoped SDK tools and isolated Electron UI.
 * [OUTPUT]: Bobo once creation/recovery, real clock and trial isolation, topic navigation/revision, cleanup and restart checks.
 * [POS]: Complete once/periodic employee-task workflow with a controlled provider and actual application/clock/storage.
 * [PROTOCOL]: Changes update Header and owning .folder.md.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationOccurrence, ConversationDetail } from '../../../packages/shared/src/domain'
import { test as base } from '../support/test'
import { scheduledTaskWorker } from '../support/scheduled-task-worker'
import type { Desktop } from '../support/desktop'

type State = { fixture?: Awaited<ReturnType<typeof scheduledTaskWorker>>; planId?: string; mainId?: string; occurrence?: AutomationOccurrence; topic?: ConversationDetail['conversation']; dueAt?: string; second?: AutomationOccurrence; trial?: AutomationOccurrence; once?: boolean; file?: string }
export const test = base.extend<{ scheduledTask: State }>({ scheduledTask: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function openEmployee(runtime: Desktop) {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(page.getByRole('button', { name: '任务', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-employee-tasks]')).toHaveCount(0)
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
  await openEmployee(runtime)
  await runtime.reviewData('Bobo创建、原回执核对、同请求重试及到期前试跑', { plan, creationIssued: state.fixture.creationIssued, creationResults: state.fixture.creationResults(), trial: state.trial, fakeClock: false, externalProvider: false })
})
Given('数字员工已有一个即将自然到期的计划', async ({ runtime, scheduledTask: state }) => {
  test.setTimeout(210_000)
  state.fixture = await scheduledTaskWorker(runtime); await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '员工任务面板验收', provider: 'openai-compatible', baseUrl: url, defaultModel: 'task-panel-fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, modelId: 'task-panel-fixture', executionPermission: 'full-access', expectedConfigVersion: configVersion })
    const main = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    const dueAt = new Date(Math.ceil((Date.now() + 15_000) / 60_000) * 60_000).toISOString()
    const result = await window.boai.request('executeApplicationOperation', { operation: 'automations.create', requestId: 'panel-periodic-plan', input: { name: '面板中的定时任务', employeeId: 'researcher', instruction: '写出panel-receipt.txt，在本话题交付文件。', trigger: { kind: 'hourly', minute: Number(dueAt.slice(14, 16)), timezone: 'UTC' }, notification: 'muted' } })
    if (result.status !== 'succeeded') throw Error(JSON.stringify(result))
    return { plan: result.data as { id: string; nextTriggerAt: string }, mainId: main.id, dueAt }
  }, state.fixture.url)
  state.planId = setup.plan.id; state.mainId = setup.mainId; state.dueAt = setup.dueAt
  expect(setup.plan.nextTriggerAt).toBe(setup.dueAt)
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(page.getByRole('button', { name: '任务', exact: true })).toHaveCount(0)
  expect((await page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))).items).toEqual([])
  await runtime.reviewData('计划真实分钟到期之前', { ...setup, fakeClock: false, manualTrigger: false, externalProvider: false })
})
When('计划自然触发并由员工交付任务文件', async ({ runtime, scheduledTask: state }) => {
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.filter(o => o.source === 'schedule').length, { timeout: state.once ? 120_000 : 100_000 }).toBe(1)
  state.occurrence = (await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.find(o => o.source === 'schedule')!
  expect(state.occurrence.source).toBe('schedule'); expect(state.occurrence.scheduledFor).toBe(state.dueAt)
  expect(state.occurrence.nativeRunId).toBe(`sched_schedule_boai-${state.planId}_${Date.parse(state.dueAt!)}`)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)).status, { timeout: 30_000 }).toBe('completed')
  expect(state.occurrence.taskId).toBeUndefined()
  const view = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.occurrence.conversationId)
  state.topic = view.conversation
  expect(state.topic).toMatchObject({ employeeChat: 'topic', purpose: 'personal', agentIds: ['researcher'] })
  expect(state.topic.employeeTaskId).toBeUndefined()
  expect((await runtime.page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))).items).toEqual([])
  const run = view.runs.find(run => run.phase === 'execution')!
  state.file = join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', view.conversation.id, 'runs', run.id, 'panel-receipt.txt')
  expect(await readFile(state.file, 'utf8')).toBe('SCHEDULE_PANEL_DELIVERED\n')
  const plan = await runtime.page.evaluate(id => window.boai.request('getAutomation', { id }), state.planId!)
  if (!plan) throw Error('自然触发后的原计划不存在')
  if (state.once) {
    expect(plan).toMatchObject({ onceConsumedAt: expect.any(String), onceOccurrenceId: state.occurrence.id, enabled: true, sync: 'synced' })
    expect(await runtime.page.evaluate(id => window.boai.request('executeApplicationOperation', { operation: 'automations.get', input: { id } }), state.planId!)).toMatchObject({ status: 'succeeded', data: { state: 'finished', nextTimes: [] } })
    expect(state.trial!.taskId).toBeUndefined(); expect(state.occurrence.conversationId).not.toBe(state.trial!.conversationId)
  } else expect(await runtime.page.evaluate(plan => window.boai.request('executeApplicationOperation', { operation: 'automations.pause', requestId: 'pause-after-first-fire', input: { id: plan.id, expectedRevision: plan.revision } }), plan)).toMatchObject({ status: 'succeeded' })
  const topics = runtime.page.getByRole('button', { name: '研究员 的话题', exact: true })
  const topicEntry = runtime.page.getByRole('button', { name: state.topic.title, exact: true }).first()
  if (!await topicEntry.isVisible()) await topics.click()
  await expect(topicEntry).toBeVisible()
  await runtime.reviewNativeCheckpoint('自然触发后员工话题可见，看板没有创建任务')
})
Then('我能从定时记录定位员工话题并继续修改', async ({ runtime, scheduledTask: state }) => {
  const page = runtime.page
  const conversations = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.map(c => c.id).sort()
  const calls = state.fixture!.requests.length
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-item').filter({ hasText: '面板中的定时任务' }).click()
  await page.locator(`[data-occurrence-id="${state.occurrence!.id}"]`).click()
  const chat = page.locator(`.conversation-stage [data-conversation-id="${state.occurrence!.conversationId}"]`)
  await expect(chat).toBeVisible(); await expect(chat).toContainText('SCHEDULE_PANEL_DELIVERED')
  await expect(page.locator('.detail-panel:visible [data-occurrence-detail-id], .detail-panel:visible #agent-execution-drawer')).toHaveCount(0)
  await expect(page.locator('[data-employee-tasks], [data-employee-task-dialog]')).toHaveCount(0)
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.map(c => c.id).sort()).toEqual(conversations)
  expect(state.fixture!.requests.length).toBe(calls)
  await runtime.reviewNativeCheckpoint('定时记录直接定位原员工话题')
  if (state.once) {
    await page.getByRole('button', { name: '定时任务', exact: true }).click()
    // Simulate only the OS click's pending target; the renderer and runtime resolve the real persisted topic.
    await runtime.app.evaluate(({ ipcMain, BrowserWindow }, occurrence) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
      const original = handlers.get('boai:request')!
      ipcMain.removeHandler('boai:request')
      ipcMain.handle('boai:request', async (event, payload) => {
        if (payload.method === 'getPendingAutomationNavigation') {
          ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original)
          return { automationId: occurrence.automationId, occurrenceId: occurrence.id, conversationId: occurrence.conversationId, messageId: occurrence.messageId }
        }
        return original(event, payload)
      })
      BrowserWindow.getAllWindows()[0].webContents.send('boai:event', { type: 'automation:navigate' })
    }, await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id))
    await expect(chat).toBeVisible()
    await expect(page.locator('[data-employee-tasks], [data-employee-task-dialog]')).toHaveCount(0)
    expect(state.fixture!.requests.length).toBe(calls)
    await runtime.reviewNativeCheckpoint('系统提醒入口也定位同一员工话题')
  }
  await chat.locator('[aria-label="消息内容"]').fill('请在这个话题里继续修改并交付下一版文件。')
  await chat.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), state.topic!.id)).runs.filter(run => run.phase === 'execution' && run.status === 'completed').length, { timeout: 30_000 }).toBe(2)
  const current = await page.evaluate(id => window.boai.request('getConversation', { id }), state.topic!.id)
  expect(current.conversation.id).toBe(state.occurrence!.conversationId)
  expect(current.conversation.employeeTaskId).toBeUndefined()
  expect((await page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id }), state.planId!)).occurrences).toHaveLength(state.trial ? 2 : 1)
  await runtime.reviewData('原话题普通消息续改，不创建新的看板任务或定时记录', current)
  await runtime.reviewNativeCheckpoint('员工话题中的后续交付')
})

Then('再次运行产生独立话题且两次重启不重放', async ({ runtime, scheduledTask: state }) => {
  const result = await runtime.page.evaluate(id => window.boai.request('executeApplicationOperation', { operation: 'automations.run', requestId: 'second-explicit-employee-task', input: { id } }), state.planId!)
  expect(result.status).toBe('succeeded'); state.second = result.data as AutomationOccurrence
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.second!.id)).status, { timeout: 30_000 }).toBe('completed')
  expect(state.second.taskId).toBeUndefined(); expect(state.second.conversationId).not.toBe(state.occurrence!.conversationId)
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.second.conversationId)).conversation.employeeChat).toBe('topic')
  const main = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.mainId!) as ConversationDetail
  expect(main.messages.some(m => m.content.includes('SCHEDULE_PANEL_DELIVERED'))).toBe(false)
  const calls = state.fixture!.requests.length
  for (let i = 0; i < 2; i++) {
    await runtime.restart()
    const tasks = await runtime.page.evaluate(() => window.boai.request('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }))
    expect(tasks.items).toEqual([])
    expect((await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences).toHaveLength(state.trial ? 3 : 2)
    expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.topic!.id)).runs.filter(run => run.phase === 'execution' && run.status === 'completed')).toHaveLength(2)
  }
  expect(state.fixture!.requests.length).toBe(calls); expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('同一计划不同任务及两次重启零重放', { firstTopic: state.topic, secondExecution: state.second, issued: state.fixture!.issued, modelRequests: calls })
})
Then('删除定时计划后话题和历史保留且重启不重放', async ({ runtime, scheduledTask: state }) => {
  const page = runtime.page
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
  expect(tasks.items).toEqual([])
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.topic!.id)).conversation.employeeChat).toBe('topic')
  expect((await runtime.page.evaluate(id => window.boai.request('listAutomationHistory', { automationId: id, limit: 20 }), state.planId!)).occurrences.map(o => o.id).sort()).toEqual(before.occurrences.map(o => o.id).sort())
  expect(state.fixture!.requests.length).toBe(calls)
  expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('任务和计划分别清理，历史保留且重启不复活', { retainedTopicId: state.topic!.id, secondTopicId: state.second!.conversationId, history: before, modelRequests: calls })
})
