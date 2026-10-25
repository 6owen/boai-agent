/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: Codex/Claude共用外部阶段计量，承接判断时保留明确的未知完整性；回执比较具体kind与profile，不跨运行时借用身份。
 * [INPUT]: 已核对的交互Work、原判断回执、当前运行与SQLite事务。
 * [OUTPUT]: 本机/API共用原请求预算；记忆须有本轮明确delivered公开回执，旧waiting消息不借后来交付取得维护权；父子工作不重建额度或延长期限。
 * [POS]: WorkRepository的交互请求账本授权，执行权仍由原holder核对。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AgentRun, BudgetModelCall, Conversation, DigitalAgent, Message, WorkBudget, WorkItem } from '@boai/shared/domain'
import { isNativeBackend, sameBackendBinding } from '@boai/shared/domain/backends'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import type { ProfileModelCall } from '../profile/profile-activity'
import { reserveBudgetCall, settleBudgetCall, WORK_DURATION_MS, WorkUnavailableError } from './work-budget'

export async function adoptInteractiveDecision(tx: RecordTransaction, work: WorkItem, budget: WorkBudget, sourceMessageId: string, prior: { runId: string; callIds: string[] }) {
  const run = await tx.get<AgentRun>('runs', prior.runId)
  const native = isNativeBackend(run?.backend)
  if (!run || run.status !== 'completed' || run.phase !== 'decision' || run.backend?.kind === 'acp-local' || run.agentId !== work.ownerAgentId || run.conversationId !== work.conversationId || run.triggerMessageId !== sourceMessageId || run.origin || run.collaborationRequestId || !run.turnId || !prior.callIds.length || native && prior.callIds.length !== run.backend!.externalInvocations || new Set(prior.callIds).size !== prior.callIds.length) throw new WorkUnavailableError('交互工作判断缺少匹配的真实请求回执')
  const agent = await tx.get<DigitalAgent>('agents', run.agentId)
  const calls = (await tx.list<ProfileModelCall>('profileModelCalls')).filter(call => call.runId === run.id)
  if (!sameBackendBinding(agent?.executionBackend, run?.backend) || run.activityError || calls.length !== prior.callIds.length || calls.some(call => !prior.callIds.includes(call.id))) throw new WorkUnavailableError('工作判断必须保留全部实际调用与原运行方式')
  // The original decision consumes time too. Adoption can only shorten, never renew.
  if (!Number.isFinite(Date.parse(run.createdAt))) throw new WorkUnavailableError('本机判断缺少可信开始时间')
  if (!native) budget.deadlineAt = new Date(Math.min(Date.parse(budget.deadlineAt), Date.parse(run.createdAt) + WORK_DURATION_MS)).toISOString()
  for (const id of prior.callIds) {
    const call = await tx.get<ProfileModelCall>('profileModelCalls', id)
    if (!call || call.runId !== run.id || call.conversationId !== work.conversationId || call.phase !== 'decision' || !Number.isFinite(Date.parse(call.startedAt)) || (call.callUnit === 'external-turn') !== native) throw new WorkUnavailableError('工作判断缺少匹配计量的唯一请求记录')
    if (native) continue
    const previous = await tx.get<BudgetModelCall>('budgetModelCalls', id)
    if (call.budgetOwned && previous?.budgetId !== budget.id) throw new WorkUnavailableError('本机判断已属于另一预算')
    await reserveBudgetCall(tx, budget, { id, conversationId: work.conversationId, sourceMessageId: work.sourceMessageId, runId: run.id, turnId: run.turnId, phase: 'decision', agentId: run.agentId, workId: work.id, ...(native ? { callUnit: 'external-turn' } : {}) })
    if (call.usage) await settleBudgetCall(tx, id, run.id, call.usage, !native || call.usageComplete !== false)
    Object.assign(budget, (await tx.get<WorkBudget>('workBudgets', budget.id))!)
    await tx.put({ collection: 'profileModelCalls', id, value: { ...call, budgetOwned: true } })
  }
}

export async function interactiveCallAuthority(tx: RecordTransaction, run: AgentRun, phase: BudgetModelCall['phase']) {
  const stored = await tx.get<AgentRun>('runs', run.id)
  const work = run.workId && await tx.get<WorkItem>('workItems', run.workId)
  const budget = work && await tx.get<WorkBudget>('workBudgets', work.budgetId)
  const agent = await tx.get<DigitalAgent>('agents', run.agentId)
  const conversation = await tx.get<Conversation>('conversations', run.conversationId)
  const native = isNativeBackend(agent?.executionBackend)
  if (!stored || stored.status !== 'running' || stored.phase !== run.phase || stored.backend?.kind === 'acp-local' || !sameBackendBinding(agent?.executionBackend, stored.backend) || !sameBackendBinding(stored.backend, run.backend) || stored.workId !== run.workId || stored.agentId !== run.agentId || stored.turnId !== run.turnId || stored.triggerMessageId !== run.triggerMessageId || stored.conversationId !== run.conversationId || !run.turnId || !work || !budget || !['external-turn', 'mixed'].includes(budget.callUnit ?? '') || !native && budget.callUnit !== 'mixed' || budget.accounting !== 'model-calls-v1' || budget.sourceMessageId !== work.sourceMessageId || budget.conversationId !== run.conversationId || work.ownerAgentId !== run.agentId || work.conversationId !== run.conversationId || work.origin || work.collaborationRequestId || run.origin || run.collaborationRequestId || agent?.executionBackend?.kind === 'acp-local' || !agent?.active || !conversation?.agentIds.includes(run.agentId) || await tx.get('conversationCleanup', run.conversationId)) throw new WorkUnavailableError('请求没有匹配的原交互工作与可信预算')
  const root = await tx.get<WorkItem>('workItems', work.rootWorkId)
  const parent = work.parentWorkId ? await tx.get<WorkItem>('workItems', work.parentWorkId) : undefined
  if (!root || root.parentWorkId || root.budgetId !== work.budgetId || root.sourceMessageId !== work.sourceMessageId || root.conversationId !== work.conversationId || work.parentWorkId && (!parent || parent.rootWorkId !== root.id || parent.budgetId !== work.budgetId || parent.sourceMessageId !== work.sourceMessageId || parent.conversationId !== work.conversationId)) throw new WorkUnavailableError('工作父子关系缺少原始预算归属')
  if (phase === 'memory') {
    if (run.phase !== 'memory' || work.status !== 'delivered' || work.activeRunId || work.requiresReview || work.cancellationCause) throw new WorkUnavailableError('只能沿本轮已发布工作维护记忆')
    let published = false
    for (const id of work.resultMessageIds) {
      const message = await tx.get<Message>('messages', id)
      const source = message?.runId && await tx.get<AgentRun>('runs', message.runId)
      if (source && source.status === 'completed' && source.disposition === 'delivered' && source.phase === 'execution' && source.workId === work.id && source.agentId === run.agentId && source.turnId === run.turnId && message?.status === 'completed' && message.id === source.messageId) published = true
    }
    if (!published) throw new WorkUnavailableError('记忆请求没有本轮真实公开交付')
  } else if (run.phase !== 'execution' || !['execution', 'report'].includes(phase)) throw new WorkUnavailableError('本机请求阶段不属于当前工作')
  return { work, budget, native }
}
