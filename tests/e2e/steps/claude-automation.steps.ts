/*
 * [OUTPUT]: 真实重启区分源码系统钥匙串入口与应用包原入口，沿初次加密配置，不重读凭据或增加模型请求。
 * [OUTPUT]: 新增建Work前固定问题接续，原判断/请求/预算、首次文件与重启沿共同BDD核验。
 * [OUTPUT]: 原问题提交前经底部准确配置往返，保留正文与固定问题身份；零业务调用核对后继续原完整接续交付和重启断言。
 * [INPUT]: 原Claude员工创建步骤、七项自动化表单、真实原生时钟与SQLite业务账本。
 * [OUTPUT]: 手动/真实日历文件交付、固定问题补充与明确追加原到期额度，核对原工作/预算/准备文件不重写与公开交付可读性；重启零重放，协议与供应商分批留证。
 * [POS]: Claude自动化产品BDD，复用原日程与聊天入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { openSchedule, scheduleAction, scheduleTarget } from '../support/schedule-controls'
import { seedExpiredAutomationBudget } from '../support/automation-history'
import { systemKeychainLaunch } from '../support/saved-model'
import { beforeWorkQuestion } from '../support/native-continuation'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { verifyLocalAgentNavigation } from '../support/local-agent-navigation'
import type { AgentRun, AutomationOccurrence, BudgetModelCall, ConversationDetail, WorkBudget } from '../../../packages/shared/src/domain'

const { Then } = createBdd(test)
function expectReadableDelivery(detail: ConversationDetail) {
  const publicText = detail.messages.filter(m => m.senderType === 'agent' && m.status === 'completed').map(m => m.content).join('\n')
  // Internal evidence remains exact; ordinary public delivery should refer to the actual file card by name.
  for (const artifact of detail.artifacts) {
    expect(publicText).not.toContain(artifact.id)
    expect(publicText).not.toContain(artifact.path)
  }
  expect(publicText).not.toContain('self:/')
}
Then('用户让Claude员工通过{string}完成原定时文件工作并重启核对', async ({ runtime, claudeEmployee: state }, trigger: string) => {
  test.setTimeout(720000)
  const scheduled = trigger === '日历触发', page = runtime.page
  expect(['手动触发', '日历触发']).toContain(trigger)
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill('Claude每日交付')
  const request = state.real
    ? `请用宿主文件工具创建并正式发布 claude-proof.md，正文仅“${state.token}”。这是本次定时任务的文件交付请求，完成后使用实际文件证据报告已交付；不研究、不联网、不运行命令、不记录长期记忆。`
    : '模块文件任务 empty-memory'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Claude 同事')
  const due = scheduled ? new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000) : undefined
  if (due) {
    await editor.getByRole('button', { name: '时间', exact: true }).click()
    await page.getByLabel('执行时间', { exact: true }).fill(due.toISOString().slice(11, 16))
    await page.getByLabel('时区', { exact: true }).fill('UTC')
    await page.keyboard.press('Escape')
  }
  await runtime.reviewData('Claude自动化原请求及实际触发时间', { request, trigger, scheduledFor: due?.toISOString(), modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
  await runtime.reviewNativeCheckpoint('原七项表单选择Claude员工')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Claude每日交付', exact: true })).toBeVisible()
  if (!scheduled) await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(d => d.name === 'Claude每日交付')!
  expect(plan).toMatchObject({ enabled: scheduled, sync: 'synced', employeeIds: [state.employeeId], conversationPolicy: 'new-conversation' })
  if (due) expect(plan.nextTimes[0]).toBe(due.toISOString())
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ plans: await store.load('automations'), occurrences: await store.load<AutomationOccurrence>('automationOccurrences'), runs: await store.load<AgentRun>('runs'), works: await store.load('workItems'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'), sessions: await store.load('claudeSessions'), artifacts: await store.load('artifacts') })
  try {
    expect(await store.load('runs')).toEqual([])
    if (!scheduled) await scheduleAction(page, '立即运行一次')
    await expect.poll(async () => {
      const view = await page.evaluate(() => window.boai.request('listAutomations', undefined))
      return view.occurrences.some(o => o.automationId === plan.id && ['completed', 'failed', 'cancelled', 'skipped', 'interrupted', 'waiting_user'].includes(o.status))
    }, { timeout: 450000 }).toBe(true)
    const occurrence = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(o => o.automationId === plan.id)!
    await runtime.reviewData('Claude自动化终态与原账本', { occurrence, ...await records() })
    expect(occurrence).toMatchObject({ status: 'completed', source: scheduled ? 'schedule' : 'manual', deliveryStatus: 'delivered', usageIncomplete: false })
    if (due) { expect(occurrence.scheduledFor).toBe(due.toISOString()); expect(occurrence.nativeRunId).toBeTruthy() }
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), occurrence.conversationId)
    expect(detail.conversation).toMatchObject({ purpose: 'automation', occurrenceId: occurrence.id, agentIds: [state.employeeId] })
    expect(detail.conversation.id).not.toBe(state.conversationId)
    expect(detail.workItems).toHaveLength(1)
    expect(detail.workItems![0]).toMatchObject({ status: 'delivered', sourceMessageId: occurrence.messageId, budgetId: occurrence.budgetId, origin: { occurrenceId: occurrence.id } })
    expect(detail.runs.every(r => r.backend?.kind === 'claude-local' && r.status === 'completed')).toBe(true)
    const budget = detail.workBudgets![0], calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(budget).toMatchObject({ id: occurrence.budgetId, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false, maxModelCalls: 24 })
    expect(calls).toHaveLength(budget.modelCalls)
    expect(calls.every(c => c.callUnit === 'external-turn' && c.usageComplete && c.origin?.occurrenceId === occurrence.id)).toBe(true)
    expect(calls.some(c => c.phase === 'decision')).toBe(true); expect(calls.some(c => c.phase === 'memory')).toBe(true)
    expect(detail.artifacts).toHaveLength(1)
    const artifact = detail.artifacts[0], bytes = await readFile(artifact.path)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.contentHash)
    expect(bytes.toString()).toContain(state.real ? state.token! : '生产工具真实原件')
    await runtime.reviewFile('Claude自动化实际交付原件', artifact.path)
    await page.locator(`[data-occurrence-id="${occurrence.id}"]`).getByText('运行明细', { exact: true }).click()
    await expect(page.getByText('本机请求按外部回合计数，Agent 内部模型调用次数未知；未完整返回的用量继续标记为未知。', { exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude定时交付与原用量记录')
    const record = page.locator(`[data-occurrence-id="${occurrence.id}"]`)
    await expect(record).not.toContainText(artifact.id!)
    await record.getByRole('button', { name: '查看交付消息', exact: true }).click()
    await expect(page.locator(`#message-${detail.workItems![0].resultMessageIds.at(-1)}`)).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude自动化原任务聊天与成果')
    const before = await records()
    await runtime.close()
    await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
    const after = await records()
    for (const key of ['runs', 'works', 'calls', 'budgets', 'sessions', 'artifacts'] as const) expect(after[key]).toEqual(before[key])
    expect(after.occurrences).toHaveLength(1)
    expect(after.occurrences[0]).toMatchObject({ id: occurrence.id, status: 'completed', budgetId: budget.id })
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: detail.conversation.title, exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('重启后Claude定时任务原结果保持')
    expectReadableDelivery(detail)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('Claude自动化最终状态含失败', await records())
    await store.close()
  }
})

Then('用户以{string}接续Claude定时任务的原问题且保留已完成操作', async ({ runtime, claudeEmployee: state }, continuation: string) => {
  test.setTimeout(900000)
  expect(['回复原问题', '追加到期额度']).toContain(continuation)
  const renewal = continuation === '追加到期额度', page = runtime.page, title = 'Claude等待补充'
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill(title)
  const request = state.real
    ? '这是文件工作，请先用宿主工具在 self:/work/prepared.txt 写入 prepared-once，然后报告等待用户补充，并公开提问“最终文件标题用什么？”。在我明确回复之前不要创建或发布最终文件。收到补充后保留已写好的 prepared.txt，不重写它；只创建并正式发布 claude-proof.md，正文包含我补充的标题，然后用实际文件证据报告交付。不运行命令、不联网、不研究、不记录长期记忆。'
    : '模块文件任务 empty-memory CLAUDE_AUTOMATION_QUESTION'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', '本机 Claude 同事')
  await runtime.reviewData('Claude原问题接续请求', { request, continuation, modelMode: state.real ? 'real-provider' : 'offline-protocol', expiryMode: renewal ? state.real ? 'actual-original-deadline' : 'seeded-expired-state' : 'not-expired', humanReview: 'pending' })
  await runtime.reviewNativeCheckpoint('原七项表单创建Claude等待补充任务')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  await scheduleAction(page, '立即运行一次')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(p => p.name === title)!
  const occurrence = async () => (await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(o => o.automationId === plan.id)!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ occurrences: await store.load('automationOccurrences'), runs: await store.load<AgentRun>('runs'), works: await store.load('workItems'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'), sessions: await store.load('claudeSessions'), artifacts: await store.load('artifacts') })
  try {
    await expect.poll(async () => (await occurrence())?.status, { timeout: 240000 }).toBe('waiting_user')
    const waiting = await occurrence(), before = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId)
    expect(before.workItems).toHaveLength(1); expect(before.workBudgets).toHaveLength(1); expect(before.artifacts).toEqual([])
    const work = before.workItems![0], budget = before.workBudgets![0]
    expect(work).toMatchObject({ status: 'waiting', origin: { occurrenceId: waiting.id } })
    const item = await page.evaluate(id => window.boai.request('getInboxItem', { id: `question:occurrence:${id}` }), waiting.id)
    expect(item?.question).toBeDefined()
    const home = await page.evaluate(input => window.boai.request('getAgentHome', input), { agentId: state.employeeId!, conversationId: waiting.conversationId })
    const prepared = join(home.sessionPath!, 'work', 'prepared.txt'), modified = (await stat(prepared)).mtimeMs
    expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
    await runtime.reviewFile('Claude补充前实际准备文件', prepared)
    await runtime.reviewData('Claude等待时原问题工作预算', { waiting, work, budget, item, records: await records() })
    await page.getByRole('button', { name: '补充信息', exact: true }).click()
    await expect(page.locator(`#message-${item!.question!.messageId}`)).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude原消息等待明确问题补充')
    const answer = state.real ? `标题用“${state.token}”。保留 prepared.txt，完成原 claude-proof.md 文件并正式交付。` : '标题用 Claude proof，完成原文件。'
    if (renewal) {
      if (state.real) {
        // This provider batch waits for the product's original wall-clock deadline, without editing its clock or ledger.
        await expect.poll(async () => (await occurrence()).status, { timeout: 340000, intervals: [1000, 5000] }).toBe('cancelled')
      } else await seedExpiredAutomationBudget(join(runtime.root, 'v2'), waiting.id)
      const stopped = await occurrence()
      expect(stopped).toMatchObject({ cancellationCause: 'budget', budgetId: budget.id })
      await runtime.reviewData('Claude原期限到期边界', { stopped, actualWallClock: !!state.real })
      await page.getByRole('button', { name: '定时任务', exact: true }).click()
      await openSchedule(page, title)
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
      await expect(page.getByText(/累计请求上限将为 48 次/)).toBeVisible()
      await runtime.reviewNativeCheckpoint('Claude原额度到期后的明确追加确认')
      await page.getByRole('button', { name: '取消', exact: true }).click()
      expect((await store.load<WorkBudget>('workBudgets'))[0].renewals).toBeUndefined()
      expect(await store.load('budgetModelCalls')).toHaveLength(budget.modelCalls)
      await page.getByRole('button', { name: '追加预算并继续', exact: true }).click()
      await page.getByLabel('继续未完成工作的说明', { exact: true }).fill(answer)
      await page.getByRole('button', { name: '确认追加额度并继续', exact: true }).click()
    } else {
      await page.locator(`#message-${item!.question!.messageId}`).getByRole('button', { name: '回复此问题', exact: true }).click()
      await expect(page.locator('.reply-preview')).toContainText('正在补充这一次定时任务')
      await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(answer)
      await verifyLocalAgentNavigation(runtime, { employeeId: state.employeeId!, conversationId: waiting.conversationId, label: 'Claude原问题' })
      await runtime.reviewNativeCheckpoint('Claude同一输入框明确补充原问题')
      await page.getByRole('button', { name: '发送消息', exact: true }).click()
    }
    await expect.poll(async () => (await occurrence()).status, { timeout: 300000 }).toBe('completed')
    const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId), result = await occurrence()
    expect(result).toMatchObject({ id: waiting.id, budgetId: budget.id, deliveryStatus: 'delivered' })
    expect(detail.workItems).toHaveLength(1)
    expect(detail.workItems![0]).toMatchObject({ id: work.id, status: 'delivered', budgetId: budget.id, sourceMessageId: work.sourceMessageId, origin: work.origin })
    const spent = detail.workBudgets![0], replies = detail.messages.filter(m => m.content === answer)
    expect(spent).toMatchObject({ id: budget.id, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false, maxModelCalls: renewal ? 48 : 24, runs: 2 })
    expect(spent.modelCalls).toBeGreaterThan(budget.modelCalls)
    expect(replies).toHaveLength(1); expect(replies[0].origin?.occurrenceId).toBe(waiting.id)
    if (renewal) {
      expect(spent.renewals).toHaveLength(1)
      expect(spent.renewals![0]).toMatchObject({ messageId: replies[0].id, used: { modelCalls: budget.modelCalls, usage: budget.usage, unknownCalls: budget.unknownCalls } })
      expect(Date.parse(spent.deadlineAt)).toBeGreaterThan(Date.parse(budget.deadlineAt))
    } else {
      expect(spent.deadlineAt).toBe(budget.deadlineAt)
      expect(replies[0].inboxReply).toMatchObject({ questionId: `occurrence:${waiting.id}`, questionMessageId: item!.question!.messageId, questionRevision: item!.question!.revision })
    }
    expect((await stat(prepared)).mtimeMs).toBe(modified); expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
    expect(detail.runs.flatMap(r => r.toolEvents).filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(2)
    expect(detail.runs.every(r => r.backend?.kind === 'claude-local')).toBe(true)
    expect(detail.artifacts).toHaveLength(1)
    const artifact = detail.artifacts[0], bytes = await readFile(artifact.path)
    expect(work.id).toBe(detail.workItems![0].id); expect(detail.workItems![0].artifactIds).toContain(artifact.id)
    expect(bytes.toString()).toContain(state.real ? state.token! : '生产工具真实原件')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.contentHash)
    await runtime.reviewFile('Claude原问题接续实际成果', artifact.path)
    const calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls).toHaveLength(spent.modelCalls)
    expect(calls.every(c => c.callUnit === 'external-turn' && c.usageComplete && c.origin?.occurrenceId === waiting.id)).toBe(true)
    await runtime.reviewData('Claude接续后的原工作与公开交付', { result, detail, records: await records() })
    if (renewal) {
      await page.getByText('运行明细', { exact: true }).click()
      await page.getByText('额度追加记录（1 次）', { exact: true }).click()
      const grant = page.getByText(/API／本机请求上限 24 → 48/)
      await grant.scrollIntoViewIfNeeded()
      await expect(grant).toBeVisible()
      // details-content can animate outside getAnimations(); verify its actual expanded geometry.
      await expect.poll(() => grant.evaluate(element => {
        const content = element.getBoundingClientRect()
        if (content.height <= 0 || content.top < 0 || content.bottom > innerHeight) return false
        for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && content.bottom > parent.getBoundingClientRect().bottom + 1) return false
        return true
      })).toBe(true)
      await runtime.reviewNativeCheckpoint('Claude明确追加后的累计账本')
      await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    }
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude补充后同一聊天正式交付')
    const settled = await records()
    await runtime.close()
    await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
    const restarted = await records()
    for (const key of ['runs', 'works', 'calls', 'budgets', 'sessions', 'artifacts'] as const) expect(restarted[key]).toEqual(settled[key])
    expect((await stat(prepared)).mtimeMs).toBe(modified)
    expect(restarted.occurrences).toHaveLength(1)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: detail.conversation.title, exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude原问题接续重启零重放')
    expectReadableDelivery(detail)
    expect(runtime.errors).toEqual([])
  } finally {
    await runtime.reviewData('Claude原问题接续最终状态含失败', await records())
    await store.close()
  }
})

Then('用户在建工作前明确回复Claude员工的原定时问题并完成首次文件交付', async ({ runtime, claudeEmployee: state }) => {
  test.setTimeout(660000)
  await beforeWorkQuestion(runtime, { kind: 'Claude', real: !!state.real, employeeId: state.employeeId!, employeeName: '本机 Claude 同事', token: state.token! })
})
