/*
 * [INPUT]: 监控中文场景、真实 Electron/IPC、隔离来源数据与系统通知提交替身。
 * [OUTPUT]: 编辑规则、手动检查、安静/重要/冷却/失败、证据与重启无模型调用的桌面验收。
 * [POS]: 自动化监控业务步骤；数据准备与系统通知替身位于 support。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { publishMonitorSample, monitorCheckpoint } from '../support/automation-monitor'
import { captureAutomationNotifications, notificationCount } from '../support/automation-notifications'
import type { AutomationMonitorCheckpoint, AutomationOccurrence } from '../../../src/shared/domain'

type State = { conversationId: string; planId: string; changed?: AutomationOccurrence; cooling?: AutomationOccurrence; checkpoint?: AutomationMonitorCheckpoint; count?: number }
export const test = base.extend<{ monitor: State }>({ monitor: async ({}, use) => use({ conversationId: '', planId: '' }) })
const { Given, When, Then } = createBdd(test)
async function check(page: Page) {
  const before = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).occurrences.length)
  await page.getByRole('button', { name: '立即运行一次', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).occurrences.filter(o => ['completed', 'failed'].includes(o.status)).length)).toBe(before + 1)
  return page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).occurrences[0])
}
Given('已准备一个聊天发布的结构化指标文件', async ({ runtime, monitor }) => {
  await runtime.start(); await captureAutomationNotifications(runtime.app)
  monitor.conversationId = await runtime.page.evaluate(async () => {
    const connection = await window.boai.request('saveConnection', { name: '隔离来源配置', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'unused' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...a } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...a, connectionId: connection.id, allowCommands: false })
    return (await window.boai.request('createConversation', { kind: 'direct', title: '指标来源', agentIds: ['researcher'] })).id
  })
  await publishMonitorSample(runtime.root, monitor.conversationId, 100)
})
When('我创建只在重要变化时提醒的指标监控', async ({ runtime, monitor }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByLabel('任务名称', { exact: true }).fill('指标变化监控')
  await page.getByLabel('任务类型', { exact: true }).selectOption('monitor')
  await page.getByLabel('任务内容', { exact: true }).fill('计数累计变化十项时提醒我')
  await page.getByLabel('目标会话', { exact: true }).selectOption(monitor.conversationId)
  await page.getByLabel('变化条件 1', { exact: true }).selectOption('numeric_delta')
  await page.getByLabel('变化阈值 1', { exact: true }).fill('10')
  await page.getByLabel('重要变化提醒间隔（秒）', { exact: true }).fill('3600')
  await page.getByRole('checkbox', { name: /启用计划/ }).uncheck()
  await expect(page.getByLabel('系统通知', { exact: true })).toHaveValue('important_only')
  await page.getByRole('button', { name: '保存任务', exact: true }).click()
  await expect(page.getByRole('button', { name: '立即运行一次', exact: true })).toBeVisible()
  const d = await page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).definitions[0])
  monitor.planId = d.id
  expect(d).toMatchObject({ taskKind: 'monitor', monitor: { source: { conversationId: monitor.conversationId, name: 'metrics.json' }, rules: [{ pointer: '/count', mode: 'numeric_delta', threshold: 10 }] } })
})
Then('首次检查建立基线且再次无变化时保持安静', async ({ runtime }) => {
  const first = await check(runtime.page)
  expect(first.monitor?.outcome).toBe('baseline')
  await expect(runtime.page.locator(`[data-occurrence-id="${first.id}"]`)).toContainText('已建立基线')
  await expect(runtime.page.locator(`[data-occurrence-id="${first.id}"]`)).toContainText('数据检查 · 未调用模型')
  await expect(runtime.page.locator(`[data-occurrence-id="${first.id}"]`)).not.toContainText('0 条结果')
  const second = await check(runtime.page)
  expect(second).toMatchObject({ deliveryStatus: 'no_change', modelCalls: 0, monitor: { outcome: 'no_change' } })
  expect(await notificationCount(runtime.app)).toBe(0)
})
When('指标达到变化阈值并在提醒间隔内继续变化', async ({ runtime, monitor }) => {
  await publishMonitorSample(runtime.root, monitor.conversationId, 120)
  monitor.changed = await check(runtime.page)
  await expect.poll(() => notificationCount(runtime.app)).toBe(1)
  await publishMonitorSample(runtime.root, monitor.conversationId, 140)
  monitor.cooling = await check(runtime.page)
  monitor.checkpoint = await monitorCheckpoint(runtime.root, monitor.planId)
})
Then('重要变化有证据且间隔内只保留检查记录', async ({ runtime, monitor }) => {
  expect(monitor.changed?.monitor).toMatchObject({ notification: 'eligible', comparisons: [{ reference: 100, current: 120, delta: 20 }], evidence: { artifactId: expect.any(String) } })
  expect(monitor.cooling?.monitor).toMatchObject({ notification: 'cooldown', comparisons: [{ reference: 120, current: 140 }] })
  await expect(runtime.page.locator(`[data-occurrence-id="${monitor.cooling!.id}"]`)).toContainText('重要变化处于提醒间隔内')
  expect(await notificationCount(runtime.app)).toBe(1)
  await runtime.page.screenshot({ path: test.info().outputPath('monitor-result.png') })
})
When('最新指标文件声明数据不完整', async ({ runtime, monitor }) => {
  await publishMonitorSample(runtime.root, monitor.conversationId, 200, false)
  const failed = await check(runtime.page)
  expect(failed).toMatchObject({ status: 'failed', deliveryStatus: 'blocked', monitor: { outcome: 'data_error' } })
  await expect(runtime.page.locator(`[data-occurrence-id="${failed.id}"]`)).toContainText('数据检查失败')
})
Then('监控显示失败且不推进成功检查点', async ({ runtime, monitor }) => {
  expect(await monitorCheckpoint(runtime.root, monitor.planId)).toEqual(monitor.checkpoint)
  await expect.poll(() => notificationCount(runtime.app)).toBe(2)
  monitor.count = await runtime.page.evaluate(async () => (await window.boai.request('listAutomations', undefined)).occurrences.length)
})
Then('重启后监控证据保留且没有额外模型回复或自动重放', async ({ runtime, monitor }) => {
  await runtime.restart(); await captureAutomationNotifications(runtime.app)
  const state = await runtime.page.evaluate(async ({ conversationId, id }) => ({ detail: await window.boai.request('getConversation', { id: conversationId }), view: await window.boai.request('listAutomations', undefined), result: await window.boai.request('getAutomationOccurrence', { id }) }), { conversationId: monitor.conversationId, id: monitor.changed!.id })
  expect(state.detail.messages).toEqual([]); expect(state.detail.runs).toEqual([])
  expect(state.view.occurrences).toHaveLength(monitor.count!)
  expect(state.result.monitor).toEqual(monitor.changed!.monitor)
  expect(state.view.occurrences.every(o => o.modelCalls === 0 && !o.usageIncomplete)).toBe(true)
  expect(await notificationCount(runtime.app)).toBe(0)
  expect(runtime.errors).toEqual([])
})
