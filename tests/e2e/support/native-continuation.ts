/*
 * [OUTPUT]: Claude明确问题接续重启使用源码系统钥匙串或应用包原入口，保持原隔离数据/加密配置。
 * [OUTPUT]: 已终结却未登记问题立即留证失败；保留原判断/消息/Trace和全部已登记原件，不把公开问句当等待事实。
 * [INPUT]: 已创建的Codex/Claude员工、原定时表单、固定问题与同一composer。
 * [OUTPUT]: 尚无Work时明确答题重新经过本机判断，首次认领仍归原请求/预算；真实文件/原件/重启零重放，协议与供应商分批留证。
 * [POS]: 两类本机员工共用的建工作前接续BDD支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentRun, Artifact, AutomationOccurrence, BudgetModelCall, WorkBudget } from '../../../packages/shared/src/domain'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { Desktop } from './desktop'
import { scheduleAction, scheduleTarget } from './schedule-controls'
import { systemKeychainLaunch } from './saved-model'

export async function beforeWorkQuestion(runtime: Desktop, state: { kind: 'Codex' | 'Claude'; real: boolean; employeeId: string; employeeName: string; token: string }) {
  const page = runtime.page, title = `${state.kind}先确认标题`
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await expect(editor.locator('[data-schedule-field]')).toHaveCount(7)
  await editor.getByLabel('标题', { exact: true }).fill(title)
  const request = state.real
    ? '我还没有决定让你制作文件，先确认需求。请先向我提问“最终文件标题用什么？”，然后等待我明确回复。这一步不要建立任务、认领工作或制作文件；等我同时确认标题并明确要求制作后，才在默认工作目录新建并正式发布 proof.md，正文仅为我给的标题。不联网、不运行命令、不研究、不记录长期记忆。'
    : 'NATIVE_CONTINUATION_QUESTION empty-memory'
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'employee', state.employeeName)
  await runtime.reviewData('建工作前问题原请求', { request, runtime: state.kind, modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
  await runtime.reviewNativeCheckpoint('原表单请求先确认标题')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  await scheduleAction(page, '立即运行一次')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(p => p.name === title)!
  const occurrence = async () => (await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(o => o.automationId === plan.id)!
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ occurrences: await store.load<AutomationOccurrence>('automationOccurrences'), runs: await store.load<AgentRun>('runs'), turns: await store.load('turns'), decisions: await store.load('decisions'), messages: await store.load('messages'), traces: await store.load('traceSpans'), works: await store.load('workItems'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), budgets: await store.load<WorkBudget>('workBudgets'), sessions: await store.load(state.kind === 'Claude' ? 'claudeSessions' : 'codexSessions'), artifacts: await store.load<Artifact>('artifacts') })
  try {
    await expect.poll(async () => ['waiting_user', 'completed', 'failed', 'cancelled', 'skipped', 'interrupted'].includes((await occurrence())?.status), { timeout: 240000 }).toBe(true)
    const waiting = await occurrence(), before = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId)
    await runtime.reviewData('提问时尚无工作和工具效果', { waiting, detail: before, records: await records() })
    expect(waiting.status).toBe('waiting_user')
    expect(before.workItems).toEqual([]); expect(before.artifacts).toEqual([]); expect(before.workBudgets).toHaveLength(1)
    expect(before.runs.flatMap(run => run.toolEvents)).toEqual([])
    const item = await page.evaluate(id => window.boai.request('getInboxItem', { id: `question:occurrence:${id}` }), waiting.id)
    expect(item?.question).toBeDefined()
    await page.getByRole('button', { name: '补充信息', exact: true }).click()
    await expect(page.locator(`#message-${item!.question!.messageId}`)).toBeVisible()
    await runtime.reviewNativeCheckpoint('原聊天澄清问题尚未开始文件工作')
    await page.locator(`#message-${item!.question!.messageId}`).getByRole('button', { name: '回复此问题', exact: true }).click()
    await expect(page.locator('.reply-preview')).toContainText('正在补充这一次定时任务')
    const answer = `标题用“${state.token}”，请完成原文件。`
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(answer)
    await runtime.reviewNativeCheckpoint('同一输入框明确关联原问题')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect.poll(async () => (await occurrence()).status, { timeout: 300000 }).toBe('completed')
    const result = await occurrence(), detail = await page.evaluate(id => window.boai.request('getConversation', { id }), waiting.conversationId)
    await runtime.reviewData('明确答题后原请求首次交付', { result, detail, records: await records() })
    expect(result).toMatchObject({ id: waiting.id, budgetId: waiting.budgetId, deliveryStatus: 'delivered', usageIncomplete: false })
    expect(detail.workItems).toHaveLength(1); expect(detail.artifacts).toHaveLength(1); expect(detail.workBudgets).toHaveLength(1)
    const work = detail.workItems![0], budget = detail.workBudgets![0], replies = detail.messages.filter(m => m.content === answer)
    expect(replies).toHaveLength(1)
    expect(replies[0].inboxReply).toMatchObject({ questionMessageId: item!.question!.messageId, questionRevision: item!.question!.revision })
    expect(detail.turns!.find(t => t.id === replies[0].turnId)?.replyToTurnIds).toContain(waiting.turnId)
    expect(detail.runs.some(r => r.turnId === replies[0].turnId && r.phase === 'decision' && r.status === 'completed')).toBe(true)
    expect(work).toMatchObject({ ownerAgentId: state.employeeId, status: 'delivered', sourceMessageId: waiting.messageId, budgetId: waiting.budgetId, origin: { occurrenceId: waiting.id } })
    expect(budget).toMatchObject({ deadlineAt: before.workBudgets![0].deadlineAt, callUnit: 'mixed', unknownCalls: 0, usageIncomplete: false })
    expect(budget.renewals).toBeUndefined()
    const calls = await store.load<BudgetModelCall>('budgetModelCalls')
    expect(calls).toHaveLength(budget.modelCalls)
    expect(new Set(calls.map(c => c.id)).size).toBe(calls.length)
    expect(calls.every(c => c.origin?.occurrenceId === waiting.id && c.callUnit === 'external-turn' && c.usageComplete)).toBe(true)
    const artifact = detail.artifacts[0], bytes = await readFile(artifact.path)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.contentHash)
    expect(bytes.toString()).toContain(state.real ? state.token : state.kind === 'Claude' ? '生产工具真实原件' : 'NATIVE_FILE_TASK')
    await runtime.reviewFile('原请求首次交付的实际文件', artifact.path)
    await expect(page.locator(`#message-${work.resultMessageIds.at(-1)}`)).toBeVisible()
    await runtime.reviewNativeCheckpoint('明确补充后首次文件交付')
    const finished = await records()
    await runtime.close()
    await runtime.start(state.real && state.kind === 'Claude' && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
    const restored = await records()
    for (const key of ['runs', 'turns', 'works', 'calls', 'budgets', 'sessions', 'artifacts'] as const) expect(restored[key]).toEqual(finished[key])
    expect(restored.occurrences).toHaveLength(1)
    expect(restored.occurrences[0]).toMatchObject({ id: waiting.id, status: 'completed', budgetId: budget.id })
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: detail.conversation.title, exact: true }).click()
    await expect(runtime.page.locator(`#message-${work.resultMessageIds.at(-1)}`)).toBeVisible()
    await runtime.reviewNativeCheckpoint('重启保留原问题和首次文件交付')
    expect(runtime.errors).toEqual([])
  } finally {
    const final = await records()
    await runtime.reviewData('建工作前明确接续最终状态含失败', final)
    for (const artifact of final.artifacts) await runtime.reviewFile('最终已登记文件含失败场景', artifact.path)
    await store.close()
  }
}
