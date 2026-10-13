/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 普通群/组织/自动化共用工作身份；共享预算只约束API请求，本机持有的Work不受额度和期限限制。
 * [INPUT]: 工作/自动化/本机交互预算、唯一请求身份、供应商用量和 SQLite 事务。
 * [OUTPUT]: 历史本机外部请求回执保留，新请求和晚到计量不再写入API预算；原身份校验保持。
 * [OUTPUT]: 唯一初始工厂仅新完整组织协作固定48次，其余24；不接受模型额度或提升原存储值，16000输出与5分钟绝对期限及其他上限保留。
 * [OUTPUT]: 自动化或真实协作请求的唯一共用账本、执行前幂等预留、逐调用幂等结算/未知用量与已清理请求拒绝；普通交流不创建预算。
 * [POS]: WorkRepository 与自动化受理复用的预算规则；不创建工作、不执行模型或重试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationOrigin, BudgetModelCall, ClearedBudgetModelCall, ModelUsage, WorkBudget, WorkOrganization } from '../../../shared/domain'
import { WORK_BUDGET_ALLOWANCE as allowance, BOBO_COLLABORATION_INITIAL_MODEL_CALLS } from '../../../shared/domain/work'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const workLimits = { workItems: 0, retries: 0, reportRefreshes: 0, noProgress: 0, maxWorkItems: allowance.workItems, maxRetries: allowance.retries, maxReportRefreshes: allowance.reportRefreshes, maxNoProgress: allowance.noProgress }
export const WORK_DURATION_MS = allowance.durationMs
export class WorkUnavailableError extends Error {}
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
export function newWorkBudget(id: string, source?: { origin: AutomationOrigin; conversationId: string } | { collaborationRequestId: string; conversationId: string } | { sourceMessageId: string; conversationId: string; callUnit: 'external-turn' | 'mixed' }, organizationMode?: WorkOrganization['mode']) : WorkBudget {
  return { ...workLimits, id, schemaVersion: 1, modelCalls: 0, runs: 0, maxModelCalls: source && 'collaborationRequestId' in source && organizationMode === 'organize_and_execute' ? BOBO_COLLABORATION_INITIAL_MODEL_CALLS : allowance.modelCalls, maxRuns: allowance.runs, maxOutputTokens: allowance.outputTokens,
    deadlineAt: new Date(Date.now() + WORK_DURATION_MS).toISOString(), usage: {}, usageIncomplete: false,
    ...(source ? { ...source, accounting: 'model-calls-v1', unknownCalls: 0 } : {}) }
}
export function workBudgetExhausted(budget: WorkBudget) {
  return Date.now() >= Date.parse(budget.deadlineAt) || budget.modelCalls >= budget.maxModelCalls || budget.runs >= budget.maxRuns || (budget.usage.outputTokens ?? 0) >= budget.maxOutputTokens || budget.workItems >= budget.maxWorkItems || budget.retries >= budget.maxRetries || budget.reportRefreshes >= budget.maxReportRefreshes || budget.noProgress >= budget.maxNoProgress
}
export function checkWorkBudget(budget: WorkBudget, policy?: 'native') {
  if (policy === 'native') return
  if (budget.noProgress >= budget.maxNoProgress) throw new WorkUnavailableError('达到原始工作的无进展接续上限')
  if (budget.modelCalls >= budget.maxModelCalls || (budget.usage.outputTokens ?? 0) >= budget.maxOutputTokens || Date.now() >= Date.parse(budget.deadlineAt)) throw new WorkUnavailableError('达到原始工作的调用、用量或时间上限')
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
