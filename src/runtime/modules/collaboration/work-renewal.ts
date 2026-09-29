/*
 * [INPUT]: WorkRepository 事务、明确预算授权、原始自动化及新的人类消息/轮次。
 * [OUTPUT]: 不清零的额度回执、安全未完成工作的定向接续、原始身份和已交付结果保留。
 * [POS]: 工作预算续行事务规则；不调用模型，不重放待核对操作或外部独立依赖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import type { AgentRun, AutomationBudgetRenewalInput, AutomationOccurrence, AutomationOrigin, BudgetRenewal, DiscussionTurn, Message, WorkBudget, WorkBudgetLimits, WorkExecution, WorkItem, WorkWake } from '../../../shared/domain'
import { WORK_BUDGET_ALLOWANCE as allowance } from '../../../shared/domain/work'
import type { RecordTransaction, StoredRecord } from '../../adapters/storage/product-store'
import { belongsToOccurrence, unansweredAutomationTurns } from '../automations/automation-results'
import { workBudgetExhausted } from './work-budget'
import { queueWorkWake, refreshWaiters } from './work-dependencies'

const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const limits = (b: WorkBudget): WorkBudgetLimits => ({ maxModelCalls: b.maxModelCalls, maxRuns: b.maxRuns, maxOutputTokens: b.maxOutputTokens, maxWorkItems: b.maxWorkItems, maxRetries: b.maxRetries, maxReportRefreshes: b.maxReportRefreshes, maxNoProgress: b.maxNoProgress, deadlineAt: b.deadlineAt })

/** Caller commits admission and the human message in this same transaction. */
export async function renewAutomationWork(tx: RecordTransaction, origin: AutomationOrigin, conversationId: string, input: AutomationBudgetRenewalInput, records: StoredRecord[]) {
  const o = await tx.get<AutomationOccurrence>('automationOccurrences', origin.occurrenceId)
  if (!o || !belongsToOccurrence(origin, o) || o.conversationId !== conversationId || o.stateVersion !== input.expectedVersion) throw new Error('运行记录已变化，请刷新后确认追加额度')
  if (input.allowance !== 'standard-v1' || !['waiting_user', 'waiting_work', 'failed', 'cancelled', 'completed'].includes(o.status) || o.deliveryStatus === 'delivered' || o.cancellationRequestedAt && o.cancellationCause !== 'budget' || o.status === 'cancelled' && o.cancellationCause !== 'budget') throw new Error('本次运行不能追加续行；已停止、重启中断或已交付的工作需要分别处理')
  const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
  if (!budget || budget.accounting !== 'model-calls-v1' || budget.conversationId !== conversationId || !belongsToOccurrence(budget.origin, o)) throw new Error('本次没有可信的原始预算，不能追加额度')
  if (!workBudgetExhausted(budget)) throw new Error('原预算尚未用尽，请使用原预算继续')
  const original = o.messageId ? await tx.get<Message>('messages', o.messageId) : undefined
  if (original?.origin?.authorizedFingerprint !== origin.authorizedFingerprint) throw new Error('原始授权来源不匹配')
  const turn = records.find(r => r.collection === 'turns')?.value as DiscussionTurn | undefined
  const message = records.find(r => r.collection === 'messages')?.value as Message | undefined
  const request = records.find(r => r.collection === 'requests')
  if (!turn || !message || !request || !belongsToOccurrence(turn.origin, o) || !belongsToOccurrence(message.origin, o) || turn.triggerMessageId !== message.id || message.turnId !== turn.id || turn.conversationId !== conversationId || message.senderId !== 'user') throw new Error('追加额度缺少明确的人类消息与本次轮次')
  if (await tx.get('requests', request.id)) throw new Error('追加额度请求已提交，请读取原请求结果')
  const turns = (await tx.list<DiscussionTurn>('turns')).filter(t => t.conversationId === conversationId && belongsToOccurrence(t.origin, o))
  const works = (await tx.list<WorkItem>('workItems')).filter(w => w.conversationId === conversationId && belongsToOccurrence(w.origin, o))
  const workIds = new Set(works.map(w => w.id))
  if ((await tx.list<AgentRun>('runs')).some(r => belongsToOccurrence(r.origin, o) && !['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status)) || turns.some(t => !['completed', 'failed', 'cancelled', 'budget_exhausted', 'waiting_user'].includes(t.status)) || (await tx.list<WorkExecution>('workExecutions')).some(e => workIds.has(e.workId) && e.status === 'active')) throw new Error('本次运行尚未完全结束，不能追加续行')
  const unfinished = works.filter(w => w.status !== 'delivered')
  if (unfinished.some(w => w.activeRunId || w.requiresReview || w.status === 'interrupted' || w.status === 'cancelled' && w.cancellationCause !== 'budget')) throw new Error('已有工具操作、人工停止或中断工作需要核对，追加预算不会重放这些操作')
  const before = limits(budget), createdAt = new Date().toISOString()
  const grant: BudgetRenewal = { id: randomUUID(), previousId: budget.renewals?.at(-1)?.id, requestId: request.id, messageId: message.id, turnId: turn.id, createdAt, before, after: before,
    used: { modelCalls: budget.modelCalls, runs: budget.runs, usage: structuredClone(budget.usage), usageIncomplete: budget.usageIncomplete, unknownCalls: budget.unknownCalls, workItems: budget.workItems, retries: budget.retries, reportRefreshes: budget.reportRefreshes, noProgress: budget.noProgress },
    previousStatus: o.status, previousReason: o.reason, cancellationRequestedAt: o.cancellationRequestedAt, workVersions: unfinished.map(w => ({ id: w.id, version: w.version, status: w.status })) }
  budget.maxModelCalls += allowance.modelCalls; budget.maxRuns += allowance.runs; budget.maxOutputTokens += allowance.outputTokens
  budget.maxWorkItems += allowance.workItems; budget.maxRetries += allowance.retries; budget.maxReportRefreshes += allowance.reportRefreshes; budget.maxNoProgress += allowance.noProgress
  budget.deadlineAt = new Date(Date.now() + allowance.durationMs).toISOString()
  grant.after = limits(budget); budget.renewals = [...(budget.renewals ?? []), grant]
  await tx.put(row('workBudgets', budget))
  turn.replyToTurnIds = unansweredAutomationTurns(o, turns).map(t => t.id)
  turn.resumesTurnIds = turns.filter(t => ['failed', 'cancelled', 'budget_exhausted'].includes(t.status)).map(t => t.id)
  // Old attempts and their evidence remain readable. Only a new wake may claim unfinished work.
  for (const wake of await tx.list<WorkWake>('workWakes')) if (workIds.has(wake.workId) && ['pending', 'scheduled'].includes(wake.status)) { wake.status = 'cancelled'; wake.reason = '用户明确追加额度，改由新的接续负责'; await tx.put(row('workWakes', wake)) }
  for (const work of unfinished) {
    delete work.wakeId; delete work.cancellationCause; work.version++; work.waitRevision++; work.updatedAt = createdAt
    work.status = work.requiredResults.length ? 'waiting' : 'ready'
    await tx.put(row('workItems', work))
    if (work.status === 'ready') await queueWorkWake(tx, work, 'ready', { runId: 'host', agentId: 'user' })
  }
  await refreshWaiters(tx, conversationId, { runId: 'host', agentId: 'user' })
  delete o.cancellationRequestedAt; delete o.cancellationCause; o.waitingTurnIds = []
  o.status = 'failed' // resumeAutomationExecution must still acquire a computation slot atomically.
  o.budget = { maxModelCalls: budget.maxModelCalls, maxRuns: budget.maxRuns, maxOutputTokens: budget.maxOutputTokens, deadlineAt: budget.deadlineAt, runs: budget.runs, exhausted: false, renewals: budget.renewals }
  await tx.put(row('automationOccurrences', o))
}
