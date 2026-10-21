/*
 * [INPUT]: 自然分钟计划、原审批卡/执行记录、真实工具与独立Desktop重启。
 * [OUTPUT]: 四种自然触发终态、原生身份/文件字节/mtime/模型请求与两次重启核对；UI缺口保留真实失败。
 * [POS]: DS11端到端步骤；新场景180秒容纳10–70秒真实分钟等待和三次冷启动，旧期限不变。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationOccurrence, ConversationDetail } from '../../../src/shared/domain'
import type { Desktop } from '../support/desktop'
import { test as base } from '../support/test'
import { openSchedule } from '../support/schedule-controls'
import { naturalAutomationProtocol, naturalFileContent, naturalFileName, type NaturalMode } from '../support/natural-automation'

type State = { mode?: NaturalMode; fixture?: Awaited<ReturnType<typeof naturalAutomationProtocol>>; planId?: string; dueAt?: string; conversationId?: string; occurrence?: AutomationOccurrence; file?: string; mtime?: number; calls?: number }
export const test = base.extend<{ natural: State }>({ natural: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const detail = (runtime: Desktop, state: State) => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId!)
const occurrence = (runtime: Desktop, state: State) => runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'skipped'])
async function awaitTerminal(runtime: Desktop, state: State) {
  await expect.poll(async () => terminal.has((await occurrence(runtime, state)).status), { timeout: 30_000 }).toBe(true)
  const current = await occurrence(runtime, state), view = await detail(runtime, state)
  expect(view.runs.filter(run => run.phase === 'execution')).toHaveLength(1)
  expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
  expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals).toEqual([])
  return { current, view }
}
async function rememberFile(runtime: Desktop, state: State) {
  state.file = join(runtime.root, 'v2', 'agents', 'researcher', 'workspace', 'sessions', state.conversationId!, 'runs', state.fixture!.runId()!, naturalFileName)
  expect(await readFile(state.file, 'utf8')).toBe(naturalFileContent)
  state.mtime = (await stat(state.file)).mtimeMs
}
async function approval(runtime: Desktop) {
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals.length).toBe(1)
  const value = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals[0]
  const card = runtime.page.locator(`[data-approval-id="${value.id}"]`)
  await expect(card).toBeVisible()
  return { value, card }
}
async function reopenTwice(runtime: Desktop, state: State, before: AutomationOccurrence, view: ConversationDetail) {
  state.calls = state.fixture!.endpoint.requests.length
  const executions = view.runs.filter(run => run.phase === 'execution').map(run => ({ id: run.id, status: run.status, toolEvents: run.toolEvents }))
  for (let opening = 1; opening <= 2; opening++) {
    await runtime.restart()
    const current = await occurrence(runtime, state), after = await detail(runtime, state)
    const plans = await runtime.page.evaluate(async () => window.boai.request('listAutomations', undefined))
    expect(plans.occurrences.filter(o => o.automationId === state.planId)).toHaveLength(1)
    expect(plans.definitions.find(d => d.id === state.planId)?.enabled).toBe(true)
    expect(current).toMatchObject({ id: before.id, source: 'schedule', scheduledFor: state.dueAt, nativeRunId: before.nativeRunId, budgetId: before.budgetId, status: before.status, deliveryStatus: before.deliveryStatus, resultEvidence: before.resultEvidence })
    expect(after.messages).toEqual(view.messages)
    expect(after.runs.filter(run => run.phase === 'execution').map(run => ({ id: run.id, status: run.status, toolEvents: run.toolEvents }))).toEqual(executions)
    expect(after.artifacts).toEqual(view.artifacts)
    expect(state.fixture!.endpoint.requests).toHaveLength(state.calls)
    if (state.mode === 'reject') expect(await stat(state.file!).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
    else { expect(await readFile(state.file!, 'utf8')).toBe(naturalFileContent); expect((await stat(state.file!)).mtimeMs).toBe(state.mtime) }
    await runtime.reviewData(`自然定时${state.mode}第${opening}次重启`, { current, runs: executions, calls: state.calls, fileMtime: state.mtime })
  }
  expect(state.fixture!.errors).toEqual([])
  expect(runtime.errors).toEqual([])
}

Given('自然分钟计划以{string}方式等待处理', async ({ runtime, natural: state }, input: string) => {
  test.setTimeout(180_000)
  if (!['approve', 'reject', 'cancel', 'disconnect'].includes(input)) throw Error('未知自然任务模式')
  state.mode = input as NaturalMode
  state.fixture = await naturalAutomationProtocol(runtime, state.mode)
  await runtime.start()
  const setup = await runtime.page.evaluate(async ({ url, mode }) => {
    const connection = await window.boai.request('saveConnection', { name: '自然定时离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'natural-fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    const asks = mode === 'approve' || mode === 'reject'
    await window.boai.request('saveAgent', { ...agent, name: '自然定时验收员', connectionId: connection.id, modelId: 'natural-fixture', allowCommands: asks, executionPermission: asks ? 'ask' : 'full-access', expectedConfigVersion: configVersion })
    const chat = await window.boai.request('createConversation', { kind: 'direct', title: '自然定时验收员', agentIds: [agent.id] })
    const dueAt = new Date(Math.ceil((Date.now() + 10_000) / 60_000) * 60_000).toISOString()
    const plan = await window.boai.request('saveAutomation', { name: `自然处理-${mode}`, prompt: '只执行一次本次文件工作，批准后交付，拒绝或中断如实报告。', conversationId: chat.id, frequency: 'daily', startsOn: dueAt.slice(0, 10), time: dueAt.slice(11, 16), weekday: 1, timezone: 'UTC', enabled: true, notify: false })
    return { plan, dueAt, chat, savedAt: new Date().toISOString(), occurrences: (await window.boai.request('listAutomations', undefined)).occurrences.filter(o => o.automationId === plan.id) }
  }, { url: state.fixture.endpoint.url, mode: state.mode })
  state.planId = setup.plan.id; state.conversationId = setup.chat.id; state.dueAt = setup.dueAt
  expect(Date.parse(setup.savedAt)).toBeLessThan(Date.parse(setup.dueAt)); expect(setup.occurrences).toEqual([])
  await runtime.page.getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '自然定时验收员', exact: true }).click()
  await runtime.reviewData(`自然定时${state.mode}分钟边界前`, { ...setup, manualRunUsed: false, clockModified: false, realProviderCalls: false })
  await expect.poll(async () => (await runtime.page.evaluate(async id => (await window.boai.request('listAutomations', undefined)).occurrences.filter(o => o.automationId === id), state.planId!)).length, { timeout: 85_000 }).toBe(1)
  state.occurrence = (await runtime.page.evaluate(async id => (await window.boai.request('listAutomations', undefined)).occurrences.filter(o => o.automationId === id), state.planId))[0]
  expect(state.occurrence).toMatchObject({ source: 'schedule', scheduledFor: state.dueAt, conversationId: state.conversationId })
  expect(state.occurrence.nativeRunId).toMatch(new RegExp(`^sched_schedule_boai-${state.planId}_`)); expect(state.occurrence.manualRequestId).toBeUndefined()
  if (state.mode === 'approve' || state.mode === 'reject') {
    const pending = await approval(runtime)
    expect(pending.value.kind).toBe('command')
    state.file = join(pending.value.cwd, naturalFileName)
    expect(await stat(state.file).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
    expect((await occurrence(runtime, state)).status).toBe('waiting_approval')
    await runtime.reviewNativeCheckpoint('自然定时命令的真实审批卡')
  } else {
    await expect.poll(() => state.fixture!.held()).toBe(1)
    await expect.poll(async () => (await detail(runtime, state)).runs.some(run => run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed'))).toBe(true)
    await rememberFile(runtime, state)
    expect(state.fixture.issued.filter(t => t.name === 'write_file')).toHaveLength(1)
    await runtime.reviewFile('自然定时实际文件原件', state.file!, { required: true })
  }
})
When('我在原聊天批准本次命令和文件发布', async ({ runtime }) => {
  const command = await approval(runtime)
  await command.card.getByRole('button', { name: '允许这次执行', exact: true }).click()
  await expect(command.card).toHaveCount(0)
  const publication = await approval(runtime)
  expect(publication.value.id).not.toBe(command.value.id); expect(publication.value.kind).toBe('file')
  await publication.card.getByRole('button', { name: '允许这次执行', exact: true }).click()
})
When('我在原聊天拒绝本次命令', async ({ runtime }) => {
  await (await approval(runtime)).card.getByRole('button', { name: '拒绝', exact: true }).click()
})
When('我从定时执行记录停止本次运行', async ({ runtime, natural: state }) => {
  await runtime.page.getByRole('button', { name: '定时任务', exact: true }).click()
  await openSchedule(runtime.page, `自然处理-${state.mode}`)
  await runtime.page.locator(`[data-occurrence-id="${state.occurrence!.id}"]`).click()
  const panel = runtime.page.locator(`[data-occurrence-detail-id="${state.occurrence!.id}"]`)
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '停止本次执行', exact: true }).click()
  await expect.poll(() => state.fixture!.held()).toBe(0)
})
When('实际模型连接在文件工具完成后断开', async ({ natural: state }) => {
  expect(state.fixture!.held()).toBe(1)
  state.fixture!.disconnect()
})
Then('自然定时文件真实交付且两次重启不重放', async ({ runtime, natural: state }) => {
  const { current, view } = await awaitTerminal(runtime, state)
  expect(current).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
  expect(view.artifacts).toHaveLength(1)
  const artifact = view.artifacts[0]
  expect(await readFile(artifact.path, 'utf8')).toBe(naturalFileContent)
  expect(current.resultEvidence).toEqual([expect.objectContaining({ kind: 'artifact', artifactId: artifact.id, reference: artifact.id })])
  expect(view.messages.some(m => m.senderType === 'agent' && m.status === 'completed' && m.content.includes('自然到期文件已交付'))).toBe(true)
  expect(state.fixture!.issued.filter(t => t.name === 'execute_command')).toHaveLength(1)
  expect(state.fixture!.issued.filter(t => t.name === 'publish_artifact')).toHaveLength(1)
  await rememberFile(runtime, state)
  await runtime.reviewNativeCheckpoint('自然触发审批后原聊天真实交付')
  await runtime.reviewFile('自然定时正式交付原件', artifact.path, { required: true })
  await reopenTwice(runtime, state, current, view)
})
Then('自然定时拒绝被如实记录且两次重启不重放', async ({ runtime, natural: state }) => {
  const { current, view } = await awaitTerminal(runtime, state)
  expect(current.deliveryStatus).toBe('blocked'); expect(current.resultEvidence).toEqual([]); expect(view.artifacts).toEqual([])
  expect(view.runs.flatMap(run => run.toolEvents).some(event => event.name === 'execute_command' && /拒绝|declin/i.test(event.detail))).toBe(true)
  expect(state.fixture!.issued.filter(t => t.name === 'execute_command')).toHaveLength(1)
  expect(state.fixture!.issued.some(t => t.name === 'write_file' || t.name === 'publish_artifact')).toBe(false)
  if (current.status === 'completed') expect(view.workItems?.every(work => work.outcome?.disposition === 'blocked')).toBe(true)
  expect(await stat(state.file!).then(() => 'exists', error => (error as NodeJS.ErrnoException).code)).toBe('ENOENT')
  await runtime.reviewData('自然定时命令拒绝实际终态', { current, runs: view.runs, workItems: view.workItems })
  await reopenTwice(runtime, state, current, view)
})
Then('自然定时已停止且已写文件在两次重启后不重做', async ({ runtime, natural: state }) => {
  const { current, view } = await awaitTerminal(runtime, state)
  expect(current).toMatchObject({ status: 'cancelled', cancellationCause: 'user', deliveryStatus: 'blocked', resultEvidence: [] })
  expect(view.runs.find(run => run.phase === 'execution')?.status).toBe('cancelled')
  expect(view.artifacts).toEqual([])
  await runtime.reviewNativeCheckpoint('自然定时单次执行已停止')
  await reopenTwice(runtime, state, current, view)
})
Then('自然定时连接失败如实保留且两次重启不重做文件', async ({ runtime, natural: state }) => {
  const { current, view } = await awaitTerminal(runtime, state)
  expect(current).toMatchObject({ status: 'failed', deliveryStatus: 'blocked', resultEvidence: [] })
  expect(view.runs.find(run => run.phase === 'execution')?.status).toBe('failed')
  expect(state.fixture!.brokenConnections()).toBeGreaterThan(0)
  expect(state.fixture!.issued.filter(t => t.name === 'write_file')).toHaveLength(1)
  expect(view.artifacts).toEqual([])
  await runtime.reviewData('自然定时文件后真实连接中断', { current, runs: view.runs, brokenConnections: state.fixture!.brokenConnections() })
  await reopenTwice(runtime, state, current, view)
})
