/*
 * [OUTPUT]: 2026-10-27 显式额度来源与未知旧值归档，默认无累计上限且不重置用量。
 * [OUTPUT]: 默认执行不按累计调用、工具步骤、用量或墙钟截断；保留真实用量、取消/权限和明确指定的预算。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 普通群/组织/自动化共用工作身份；共享预算只约束API请求，本机持有的Work不受额度和期限限制。
 * [INPUT]: 工作/自动化/本机交互预算、唯一请求身份、供应商用量和 SQLite 事务。
 * [OUTPUT]: 历史本机外部请求回执保留，新请求和晚到计量不再写入API预算；原身份校验保持。
 * [OUTPUT]: 自动化或真实协作请求的唯一共用账本、执行前幂等预留、逐调用幂等结算/未知用量与已清理请求拒绝；普通交流不创建预算。
 * [POS]: WorkRepository 与自动化受理复用的预算规则；不创建工作、不执行模型或重试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationOrigin, BudgetModelCall, ClearedBudgetModelCall, ModelUsage, WorkBudget, WorkOrganization } from '@boai/shared/domain'
import { WORK_BUDGET_ALLOWANCE as allowance, WORK_EXECUTION_LIMITS } from '@boai/shared/domain/work'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const workLimits = { workItems: 0, retries: 0, reportRefreshes: 0, noProgress: 0, maxWorkItems: null, maxRetries: null, maxReportRefreshes: null, maxNoProgress: null }
export const WORK_DURATION_MS = allowance.durationMs
export class WorkUnavailableError extends Error {}
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
export function newWorkBudget(id: string, source?: { origin: AutomationOrigin; conversationId: string } | { collaborationRequestId: string; conversationId: string } | { sourceMessageId: string; conversationId: string; callUnit: 'external-turn' | 'mixed' }, _organizationMode?: WorkOrganization['mode']) : WorkBudget {
  return { ...workLimits, id, schemaVersion: 1, executionAllowanceVersion: 2, limitAuthority: { kind: 'default' }, modelCalls: 0, runs: 0,
    maxModelCalls: WORK_EXECUTION_LIMITS.modelCalls, maxRuns: null, maxOutputTokens: WORK_EXECUTION_LIMITS.outputTokens,
    deadlineAt: '', usage: {}, usageIncomplete: false,
    ...(source ? { ...source, accounting: 'model-calls-v1', unknownCalls: 0 } : {}) }
}
/** Never infer user intent from a number matching a former default. Startup preserves unverified history. */
export function upgradeWorkExecutionAllowance(budget: WorkBudget, explicitContinuation = false) {
  if (budget.limitAuthority?.kind === 'user' || budget.renewals?.length) return
  if (budget.limitAuthority?.kind !== 'default' && !explicitContinuation) return
  if (!budget.limitAuthority && !budget.legacyLimits) budget.legacyLimits = { limits: {
    maxModelCalls: budget.maxModelCalls, maxRuns: budget.maxRuns, maxOutputTokens: budget.maxOutputTokens,
    maxWorkItems: budget.maxWorkItems, maxRetries: budget.maxRetries, maxReportRefreshes: budget.maxReportRefreshes,
    maxNoProgress: budget.maxNoProgress, deadlineAt: budget.deadlineAt,
  }, retainedAt: new Date().toISOString(), reason: 'unverified-origin' }
  budget.maxModelCalls = null; budget.maxOutputTokens = null; budget.maxRuns = null
  budget.maxWorkItems = null; budget.maxRetries = null; budget.maxReportRefreshes = null; budget.maxNoProgress = null
  budget.deadlineAt = ''; budget.executionAllowanceVersion = 2; budget.limitAuthority = { kind: 'default' }
}
/** A null ceiling means unlimited. Explicit zero limits still reject immediately. */
export function workLimitReached(used: number, limit: number | null) { return limit !== null && used >= limit }
/** Existing automation ledgers keep their counters, but no longer expire by wall clock. */
export function workBudgetDeadline(budget: Pick<WorkBudget, 'origin' | 'deadlineAt'>): number | undefined {
  if (budget.origin || budget.deadlineAt === '') return undefined
  const deadline = Date.parse(budget.deadlineAt ?? '')
  return Number.isFinite(deadline) ? deadline : 0
}
export function workBudgetExhausted(budget: WorkBudget) {
  return Date.now() >= (workBudgetDeadline(budget) ?? Infinity) || workLimitReached(budget.modelCalls, budget.maxModelCalls) || workLimitReached(budget.runs, budget.maxRuns) || workLimitReached(budget.usage.outputTokens ?? 0, budget.maxOutputTokens) || workLimitReached(budget.workItems, budget.maxWorkItems) || workLimitReached(budget.retries, budget.maxRetries) || workLimitReached(budget.reportRefreshes, budget.maxReportRefreshes) || workLimitReached(budget.noProgress, budget.maxNoProgress)
}
export function checkWorkBudget(budget: WorkBudget, policy?: 'native') {
  if (policy === 'native') return
  if (workLimitReached(budget.noProgress, budget.maxNoProgress)) throw new WorkUnavailableError('达到原始工作的无进展接续上限')
  if (workLimitReached(budget.modelCalls, budget.maxModelCalls) || workLimitReached(budget.usage.outputTokens ?? 0, budget.maxOutputTokens) || Date.now() >= (workBudgetDeadline(budget) ?? Infinity)) throw new WorkUnavailableError('达到原始工作的调用、用量或时间上限')
}
export async function reserveBudgetCall(tx: RecordTransaction, budget: WorkBudget, input: Omit<BudgetModelCall, 'budgetId' | 'usage' | 'usageComplete' | 'reservedAt'>) {
  const authorized = budget.origin
    ? budget.origin.occurrenceId === input.origin?.occurrenceId && budget.conversationId === input.conversationId && !input.collaborationRequestId
    : budget.collaborationRequestId
      ? budget.collaborationRequestId === input.collaborationRequestId && !input.origin
      : (budget.callUnit === 'external-turn' || budget.callUnit === 'mixed') && !!budget.sourceMessageId && budget.sourceMessageId === input.sourceMessageId && budget.conversationId === input.conversationId && !!input.workId && !!input.agentId && !input.origin && !input.collaborationRequestId
  if (budget.accounting !== 'model-calls-v1' || !authorized) throw new Error('模型请求没有匹配的原始预算')
  const previous = await tx.get<BudgetModelCall | ClearedBudgetModelCall>('budgetModelCalls', input.id)
  if (previous) {
    if ('status' in previous) throw new Error('模型调用记录已经清理，不能再次预留或执行')
    if (previous.budgetId !== budget.id || previous.runId !== input.runId || previous.turnId !== input.turnId || previous.phase !== input.phase || previous.conversationId !== input.conversationId || previous.collaborationRequestId !== input.collaborationRequestId || previous.sourceMessageId !== input.sourceMessageId || previous.workId !== input.workId || previous.agentId !== input.agentId || previous.callUnit !== (input.callUnit ?? (budget.callUnit === 'external-turn' ? 'external-turn' : undefined))) throw new Error('模型调用标识已用于另一请求')
    return previous
  }
  if (input.callUnit === 'external-turn') return // Native protocol identity is stored on the run/session, not the API ledger.
  checkWorkBudget(budget)
  const call: BudgetModelCall = { ...input, ...(input.callUnit || budget.callUnit === 'external-turn' ? { callUnit: input.callUnit ?? 'external-turn' as const } : {}), budgetId: budget.id, usage: {}, usageComplete: false, reservedAt: new Date().toISOString() }
  budget.modelCalls++; budget.unknownCalls = (budget.unknownCalls ?? 0) + 1; budget.usageIncomplete = true
  await tx.put(row('workBudgets', budget)); await tx.put(row('budgetModelCalls', call)); return call
}
/** A repeated receipt updates only positive deltas. Missing fields stay unknown, including after stop/restart. */
export async function settleBudgetCall(tx: RecordTransaction, id: string, runId: string, usage: ModelUsage, externalComplete = true) {
  const call = await tx.get<BudgetModelCall | ClearedBudgetModelCall>('budgetModelCalls', id)
  if (!call) return // History cleanup removed this receipt; never recreate its private references.
  if ('status' in call || call.callUnit === 'external-turn') return // Shared counters are retained, but cleared private sources never reappear.
  if (call.runId !== runId) throw new Error('模型用量不属于该运行')
  const budget = await tx.get<WorkBudget>('workBudgets', call.budgetId)
  if (!budget) throw new Error('模型调用预算缺失')
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[key] !== undefined) {
    if (!Number.isFinite(usage[key]) || usage[key]! < 0) throw new Error('模型用量必须是已知的非负数')
    const value = Math.max(call.usage[key] ?? 0, usage[key]!)
    budget.usage[key] = (budget.usage[key] ?? 0) + value - (call.usage[key] ?? 0); call.usage[key] = value
  }
  const complete = (call.callUnit !== 'external-turn' || externalComplete) && ['inputTokens', 'outputTokens', 'totalTokens'].every(key => (call.callUnit === 'external-turn' ? usage : call.usage)[key as keyof ModelUsage] !== undefined)
  if (call.usageComplete !== complete) budget.unknownCalls = Math.max(0, (budget.unknownCalls ?? 0) + (complete ? -1 : 1))
  call.usageComplete = complete; call.settledAt ??= new Date().toISOString(); budget.usageIncomplete = (budget.unknownCalls ?? 0) > 0
  await tx.put(row('budgetModelCalls', call)); await tx.put(row('workBudgets', budget))
}
