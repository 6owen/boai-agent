/*
 * [OUTPUT]: 新增真实自然分钟时钟触发/原生身份/双次重启不重放；仅新场景180秒容纳最多70秒自然等待与三次原启动窗口，原场景期限不变。
 * [INPUT]: 自动化中断恢复场景、真实 Electron/IPC/文件工具和隔离模型响应。
 * [OUTPUT]: 从新版总览进入指定计划，保留中断无重放断言；工具完成后进程退出的可见故障、同数据重启中断记录与无重复模型/文件副作用验证。
 * [POS]: 自动化恢复业务步骤；进程和网络故障注入位于 support。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { openSchedule } from '../support/schedule-controls'
import { createBdd } from 'playwright-bdd'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { crashAutomationRuntime, startInterruptedAutomation } from '../support/automation-recovery'
import type { AutomationOccurrence } from '../../../src/shared/domain'

type State = { fixture?: Awaited<ReturnType<typeof startInterruptedAutomation>>; occurrence?: AutomationOccurrence; file?: string; modifiedAt?: number; calls?: number; scheduled?: { planId: string; dueAt: string } }
export const test = base.extend<{ recovery: State }>({ recovery: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('自动化已实际写出文件但尚未提交结果', async ({ runtime, recovery }) => {
  recovery.fixture = await startInterruptedAutomation(runtime)
  recovery.occurrence = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '中断验收模型', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, allowCommands: false, expectedConfigVersion: configVersion })
    const chat = await window.boai.request('createConversation', { kind: 'direct', title: '自动化中断恢复验收', agentIds: [agent.id] })
    const plan = await window.boai.request('saveAutomation', { name: '写文件后中断', prompt: '写出本次文件后再报告结果', conversationId: chat.id, frequency: 'daily', weekday: 1, time: '09:00', timezone: 'UTC', enabled: false, notify: false })
    return window.boai.request('runAutomation', { id: plan.id, requestId: 'interrupt-once' })
  }, recovery.fixture.port)
  await expect.poll(() => recovery.fixture!.held()).toBe(1)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), recovery.occurrence!.conversationId)).runs.some(run => run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed'))).toBe(true)
  recovery.file = join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', recovery.occurrence.conversationId, 'work', 'interrupted.txt')
  expect(await readFile(recovery.file, 'utf8')).toContain('实际工具已写入')
  recovery.modifiedAt = (await stat(recovery.file)).mtimeMs
  recovery.calls = recovery.fixture.calls()
})

When('本地运行进程意外退出后我重新打开应用', async ({ runtime, recovery }) => {
  await crashAutomationRuntime(runtime)
  await expect(runtime.page.getByText(/本地运行服务已退出/)).toBeVisible()
  await expect.poll(() => recovery.fixture!.held()).toBe(0)
  await runtime.restart()
})

Then('原运行保持中断且已执行的文件操作没有重放', async ({ runtime, recovery }) => {
  const before = recovery.occurrence!
  const state = await runtime.page.evaluate(async o => ({ occurrence: await window.boai.request('getAutomationOccurrence', { id: o.id }), detail: await window.boai.request('getConversation', { id: o.conversationId }), repeated: await window.boai.request('runAutomation', { id: o.automationId, requestId: 'interrupt-once' }) }), before)
  expect(state.occurrence).toMatchObject({ id: before.id, status: 'interrupted', deliveryStatus: 'blocked', budgetId: before.budgetId, resultEvidence: [] })
  expect(state.repeated.id).toBe(before.id)
  expect(state.detail.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect(state.detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
  expect(state.detail.runs.filter(run => run.phase === 'execution')).toHaveLength(1)
  expect(state.detail.runs.find(run => run.phase === 'execution')?.status).toBe('interrupted')
  expect(state.detail.workItems?.every(work => work.status === 'interrupted')).toBe(true)
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(runtime.page, '写文件后中断')
  await expect(runtime.page.locator(`[data-occurrence-id="${before.id}"]`)).toContainText('已中断')
  expect(recovery.fixture!.calls()).toBe(recovery.calls)
  expect((await stat(recovery.file!)).mtimeMs).toBe(recovery.modifiedAt)
  expect(await readFile(recovery.file!, 'utf8')).toBe('实际工具已写入；运行中断后不得自动重做。')
  expect(recovery.fixture!.errors).toEqual([])
  expect(runtime.errors).toEqual([])
})

Given('自然分钟时钟已触发计划并实际写出文件', async ({ runtime, recovery }) => {
  // This NEW scenario observes a real minute boundary (10–70s), then three desktop starts.
  // Existing recovery tests retain their original timeout, assertions and manual receipt check.
  test.setTimeout(180_000)
  recovery.fixture = await startInterruptedAutomation(runtime)
  const setup = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '自然时钟离线协议', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, allowCommands: false, expectedConfigVersion: configVersion })
    const chat = await window.boai.request('createConversation', { kind: 'direct', title: '自然时钟交付恢复', agentIds: [agent.id] })
    const dueAt = new Date(Math.ceil((Date.now() + 10_000) / 60_000) * 60_000).toISOString()
    const plan = await window.boai.request('saveAutomation', { name: '自然到期写文件后中断', prompt: '写出本次文件后再报告结果', conversationId: chat.id, frequency: 'daily', startsOn: dueAt.slice(0, 10), weekday: 1, time: dueAt.slice(11, 16), timezone: 'UTC', enabled: true, notify: false })
    const view = await window.boai.request('listAutomations', undefined)
    return { plan, dueAt, savedAt: new Date().toISOString(), occurrences: view.occurrences.filter(o => o.automationId === plan.id) }
  }, recovery.fixture.port)
  recovery.scheduled = { planId: setup.plan.id, dueAt: setup.dueAt }
  expect(setup.plan.enabled).toBe(true)
  expect(Date.parse(setup.savedAt)).toBeLessThan(Date.parse(setup.dueAt))
  expect(setup.occurrences).toEqual([])
  await runtime.reviewData('自然分钟边界前的实际计划', { ...setup, manualRunUsed: false, clockModified: false, realProvider: false })
  await expect.poll(() => recovery.fixture!.held(), { timeout: 80_000 }).toBe(1)
  const occurrences = await runtime.page.evaluate(async id => (await window.boai.request('listAutomations', undefined)).occurrences.filter(o => o.automationId === id), setup.plan.id)
  expect(occurrences).toHaveLength(1)
  recovery.occurrence = occurrences[0]
  expect(recovery.occurrence).toMatchObject({ automationId: setup.plan.id, source: 'schedule', scheduledFor: setup.dueAt })
  expect(recovery.occurrence.nativeRunId).toMatch(new RegExp(`^sched_schedule_boai-${setup.plan.id}_`))
  expect(recovery.occurrence.manualRequestId).toBeUndefined()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), recovery.occurrence!.conversationId)).runs.some(run => run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed'))).toBe(true)
  recovery.file = join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', recovery.occurrence.conversationId, 'work', 'interrupted.txt')
  expect(await readFile(recovery.file, 'utf8')).toBe('实际工具已写入；运行中断后不得自动重做。')
  recovery.modifiedAt = (await stat(recovery.file)).mtimeMs
  recovery.calls = recovery.fixture.calls()
  await runtime.reviewData('自然触发与原生运行身份', { occurrence: recovery.occurrence, dueAt: setup.dueAt, observedAt: new Date().toISOString(), calls: recovery.calls })
  await runtime.reviewFile('自然时钟实际写出的文件', recovery.file, { required: true })
})

Then('原自然触发保持中断且两次重启没有重做文件', async ({ runtime, recovery }) => {
  const before = recovery.occurrence!, scheduled = recovery.scheduled!
  // The shared When already performed the first restart after the actual utility was killed.
  for (let opening = 1; opening <= 2; opening++) {
    const state = await runtime.page.evaluate(async ({ id, planId }) => ({ occurrence: await window.boai.request('getAutomationOccurrence', { id }), view: await window.boai.request('listAutomations', undefined), plan: await window.boai.request('getAutomation', { id: planId }) }), { id: before.id, planId: scheduled.planId })
    expect(state.view.occurrences.filter(o => o.automationId === scheduled.planId)).toHaveLength(1)
    expect(state.occurrence).toMatchObject({ id: before.id, source: 'schedule', scheduledFor: scheduled.dueAt, status: 'interrupted', deliveryStatus: 'blocked', budgetId: before.budgetId, nativeRunId: before.nativeRunId, resultEvidence: [] })
    expect(state.plan).toMatchObject({ id: scheduled.planId, enabled: true })
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), before.conversationId)
    expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
    expect(detail.runs.filter(run => run.phase === 'execution')).toHaveLength(1)
    expect(detail.runs.find(run => run.phase === 'execution')?.status).toBe('interrupted')
    expect(detail.workItems?.every(work => work.status === 'interrupted')).toBe(true)
    expect(recovery.fixture!.calls()).toBe(recovery.calls)
    expect((await stat(recovery.file!)).mtimeMs).toBe(recovery.modifiedAt)
    expect(await readFile(recovery.file!, 'utf8')).toBe('实际工具已写入；运行中断后不得自动重做。')
    await runtime.reviewData(`自然触发第${opening}次重启核对`, { occurrence: state.occurrence, executions: detail.runs, calls: recovery.fixture!.calls() })
    if (opening === 1) await runtime.restart()
  }
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(runtime.page, '自然到期写文件后中断')
  await expect(runtime.page.locator(`[data-occurrence-id="${before.id}"]`)).toContainText('已中断')
  expect(recovery.fixture!.errors).toEqual([])
  expect(runtime.errors).toEqual([])
})
