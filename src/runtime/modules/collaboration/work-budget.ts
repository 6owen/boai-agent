/*
 * [INPUT]: 工作/自动化预算、唯一模型请求身份、供应商逐调用用量和 SQLite 事务。
 * [OUTPUT]: 共用预算限制/耗尽判断、执行前幂等预留、逐调用幂等结算及未知用量标记。
 * [POS]: WorkRepository 与自动化受理复用的预算规则；不创建工作、不执行模型或重试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationOrigin, BudgetModelCall, ModelUsage, WorkBudget } from '../../../shared/domain'
import { WORK_BUDGET_ALLOWANCE as allowance } from '../../../shared/domain/work'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const workLimits = { workItems: 0, retries: 0, reportRefreshes: 0, noProgress: 0, maxWorkItems: allowance.workItems, maxRetries: allowance.retries, maxReportRefreshes: allowance.reportRefreshes, maxNoProgress: allowance.noProgress }
export const WORK_DURATION_MS = allowance.durationMs
export class WorkUnavailableError extends Error {}
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
export function newWorkBudget(id: string, automation?: { origin: AutomationOrigin; conversationId: string }) : WorkBudget {
  return { ...workLimits, id, schemaVersion: 1, modelCalls: 0, runs: 0, maxModelCalls: allowance.modelCalls, maxRuns: allowance.runs, maxOutputTokens: allowance.outputTokens,
    deadlineAt: new Date(Date.now() + WORK_DURATION_MS).toISOString(), usage: {}, usageIncomplete: false,
    ...(automation ? { ...automation, accounting: 'model-calls-v1', unknownCalls: 0 } : {}) }
}
export function workBudgetExhausted(budget: WorkBudget) {
  return Date.now() >= Date.parse(budget.deadlineAt) || budget.modelCalls >= budget.maxModelCalls || budget.runs >= budget.maxRuns || (budget.usage.outputTokens ?? 0) >= budget.maxOutputTokens || budget.workItems >= budget.maxWorkItems || budget.retries >= budget.maxRetries || budget.reportRefreshes >= budget.maxReportRefreshes || budget.noProgress >= budget.maxNoProgress
}
export function checkWorkBudget(budget: WorkBudget) {
  if (budget.noProgress >= budget.maxNoProgress) throw new WorkUnavailableError('达到原始工作的无进展接续上限')
  if (budget.modelCalls >= budget.maxModelCalls || (budget.usage.outputTokens ?? 0) >= budget.maxOutputTokens || Date.now() >= Date.parse(budget.deadlineAt)) throw new WorkUnavailableError('达到原始工作的调用、用量或时间上限')
}
export async function reserveBudgetCall(tx: RecordTransaction, budget: WorkBudget, input: Omit<BudgetModelCall, 'budgetId' | 'usage' | 'usageComplete' | 'reservedAt'>) {
  if (budget.accounting !== 'model-calls-v1' || budget.origin?.occurrenceId !== input.origin.occurrenceId || budget.conversationId !== input.conversationId) throw new Error('模型请求没有匹配的自动化预算')
  const previous = await tx.get<BudgetModelCall>('budgetModelCalls', input.id)
  if (previous) {
    if (previous.budgetId !== budget.id || previous.runId !== input.runId || previous.turnId !== input.turnId || previous.phase !== input.phase) throw new Error('模型调用标识已用于另一请求')
    return previous
  }
  checkWorkBudget(budget)
  const call: BudgetModelCall = { ...input, budgetId: budget.id, usage: {}, usageComplete: false, reservedAt: new Date().toISOString() }
  budget.modelCalls++; budget.unknownCalls = (budget.unknownCalls ?? 0) + 1; budget.usageIncomplete = true
  await tx.put(row('workBudgets', budget)); await tx.put(row('budgetModelCalls', call)); return call
}
/** A repeated receipt updates only positive deltas. Missing fields stay unknown, including after stop/restart. */
export async function settleBudgetCall(tx: RecordTransaction, id: string, runId: string, usage: ModelUsage) {
  const call = await tx.get<BudgetModelCall>('budgetModelCalls', id)
  if (!call) return // History cleanup removed this receipt; never recreate its private references.
  if (call.runId !== runId) throw new Error('模型用量不属于该运行')
  const budget = await tx.get<WorkBudget>('workBudgets', call.budgetId)
  if (!budget) throw new Error('模型调用预算缺失')
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[key] !== undefined) {
    if (!Number.isFinite(usage[key]) || usage[key]! < 0) throw new Error('模型用量必须是已知的非负数')
    const value = Math.max(call.usage[key] ?? 0, usage[key]!)
    budget.usage[key] = (budget.usage[key] ?? 0) + value - (call.usage[key] ?? 0); call.usage[key] = value
  }
  const complete = ['inputTokens', 'outputTokens', 'totalTokens'].every(key => call.usage[key as keyof ModelUsage] !== undefined)
  if (!call.usageComplete && complete) budget.unknownCalls = Math.max(0, (budget.unknownCalls ?? 0) - 1)
  call.usageComplete = complete; call.settledAt ??= new Date().toISOString(); budget.usageIncomplete = (budget.unknownCalls ?? 0) > 0
  await tx.put(row('budgetModelCalls', call)); await tx.put(row('workBudgets', budget))
}
