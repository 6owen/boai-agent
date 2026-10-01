/*
 * [INPUT]: 显式工作意图、运行身份、当前权限校验后的上下文与 SQLite 事务。
 * [OUTPUT]: settle 可组合原事务消息完成 hook；工作结果/消息/完成身份任一失败同事务回滚，不按运行结束推断公开完成。
 * [OUTPUT]: 公开 task 用户问题同结果事务保存；补充原工作版本/执行/副作用/预算/依赖门禁同回答消息复核，不新建预算；用户修订请求/目标员工与唯一新根预算同事务绑定，重试/唤醒/子工作保留修订身份但不继承原成果工作或 occurrence；材料来源随认领/父子继承及持有者条件事务追加；显式额度追加/工作接续/消息/容量同事务；原工作身份与已交付结果保留；共享预算、执行权、父子/依赖和停止门禁。
 * [POS]: collaboration 的持久工作控制；不选举发言人、不重放工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { AgentRun, AutomationBudgetRenewalInput, BudgetModelCall, ModelUsage, WorkBudget, WorkExecution, WorkIntent, WorkItem, WorkOutcome, WorkDelegation, WorkWait, WorkWake, Message, AutomationOrigin, MaterialReadRef, Conversation, DigitalAgent, ConversationMaterial } from '../../../shared/domain'
import type { ArtifactRevisionRequest, ArtifactVersion } from '../../../shared/domain/artifacts'
import { renewAutomationWork } from './work-renewal'
import { assertAutomationExecution, activateAutomationExecution, resumeAutomationExecution } from '../automations/automation-repository'
import { ProductStore, type RecordTransaction, type StoredRecord } from '../../adapters/storage/product-store'

import { queueWorkWake, refreshWaiters, validateDependencies } from './work-dependencies'
import { checkWorkBudget, newWorkBudget, reserveBudgetCall, settleBudgetCall, workBudgetExhausted, workLimits, WorkUnavailableError } from './work-budget'
export { WorkUnavailableError } from './work-budget'

import { workDelegationSchema, workWaitSchema, workEvidenceError } from './work-protocol'

const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const timestamp = () => new Date().toISOString()
const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
interface WorkClaimInput {
  conversationId: string; sourceMessageId: string; agentId: string; runId: string; intent: WorkIntent
  wakeId?: string; origin?: AutomationOrigin; materialSources?: MaterialReadRef[]; revisionRequestId?: string
}

export class WorkRepository {
  constructor(private store: ProductStore) {}

  /** Admission is checked again inside the message transaction; no new work or allowance is created. */
  async questionContinuation(tx: RecordTransaction, workId: string, questionId: string, revision: number) {
    const work = await tx.get<WorkItem>('workItems', workId)
    if (!work || work.origin || work.userQuestion?.id !== questionId || work.userQuestion.revision !== revision || work.userQuestion.answeredMessageId) throw new WorkUnavailableError('原工作问题已经变化、回答或不存在，请刷新')
    if (work.status !== 'waiting' || work.activeRunId || work.requiresReview || work.cancellationCause || work.dependsOnWorkIds.length || work.requiredResults.length) throw new WorkUnavailableError('原工作已停止、中断、待核对或依赖等待，不能用补充信息接续')
    if (work.version !== revision) throw new WorkUnavailableError('原工作版本已变化，请刷新')
    if ((await tx.list<WorkExecution>('workExecutions')).some(execution => execution.workId === work.id && (execution.status === 'active' || (execution.pendingEffects ?? 0) > 0))) throw new WorkUnavailableError('原工作仍有执行或待核对副作用，不能接续')
    const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
    if (!budget) throw new WorkUnavailableError('原工作预算缺失，不能创建新预算替代')
    checkWorkBudget(budget)
    if (budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
    if (work.parentWorkId) {
      const parent = await tx.get<WorkItem>('workItems', work.parentWorkId)
      if (!parent || ['cancelled', 'interrupted'].includes(parent.status)) throw new WorkUnavailableError('原工作所属任务已停止或中断')
    }
    return work
  }

  async answerQuestion(tx: RecordTransaction, workId: string, questionId: string, revision: number, message: Message) {
    const work = await this.questionContinuation(tx, workId, questionId, revision)
    work.userQuestion!.answeredMessageId = message.id
    work.status = 'ready'; work.version++; work.updatedAt = timestamp()
    await tx.put(row('workItems', work))
    return work
  }

  renewAutomation(origin: AutomationOrigin, conversationId: string, input: AutomationBudgetRenewalInput, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      await renewAutomationWork(tx, origin, conversationId, input, records)
      const next = await resumeAutomationExecution(tx, origin, conversationId)
      for (const record of records) await tx.put(record)
      return next
    })
  }

  async init() {
    await this.store.transaction(async tx => {
      const format = await tx.get<{ id: string; version: number }>('collaborationSchema', 'work')
      if (format && ![1, 2].includes(format.version)) throw new Error('工作数据版本高于当前应用支持范围')
      const executions = await tx.list<WorkExecution>('workExecutions')
      const messages = new Map((await tx.list<Message>('messages')).map(message => [message.id, message]))
      for (const work of await tx.list<WorkItem>('workItems')) {
        if (![1, 2].includes(work.schemaVersion)) throw new Error('不能读取未知版本的工作记录')
        if (Number(work.schemaVersion) === 1) Object.assign(work, { rootWorkId: work.id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, schemaVersion: 2 })
        const origin = work.origin ?? messages.get(work.sourceMessageId)?.origin
        if (origin) {
          work.origin = origin
          for (const execution of executions) if (execution.workId === work.id) { execution.origin = origin; await tx.put(row('workExecutions', execution)) }
        }
        if (work.activeRunId || ['ready', 'waiting'].includes(work.status)) {
          const execution = executions.find(run => run.id === work.activeRunId)
          if (execution) { execution.status = 'released'; await tx.put(row('workExecutions', execution)) }
          delete work.activeRunId; work.status = 'interrupted'; work.requiresReview = true
          work.version++; work.updatedAt = timestamp()
        }
        await tx.put(row('workItems', work))
      }
      for (const budget of await tx.list<WorkBudget>('workBudgets')) {
        if (budget.schemaVersion !== 1) throw new Error('不能读取未知版本的工作预算')
        const migrated = { ...workLimits, ...budget }
        migrated.workItems = (await tx.list<WorkItem>('workItems')).filter(work => work.budgetId === budget.id).length
        await tx.put(row('workBudgets', migrated))
      }
      for (const wake of await tx.list<WorkWake>('workWakes')) {
        const work = await tx.get<WorkItem>('workItems', wake.workId)
        if (work?.origin && !wake.origin) { wake.origin = work.origin; await tx.put(row('workWakes', wake)) }
        if (!['pending', 'scheduled'].includes(wake.status)) continue
        wake.status = 'interrupted'; wake.reason = '应用重启，接续需要明确恢复'; await tx.put(row('workWakes', wake))
      }
      // Historical Contribution records intentionally retain their original meaning.
      await tx.put(row('collaborationSchema', { id: 'work', version: 2 }))
    })
  }

  async view(conversationId: string) {
    const workItems = (await this.store.load<WorkItem>('workItems')).filter(work => work.conversationId === conversationId)
    const ids = new Set(workItems.map(work => work.budgetId))
    const workBudgets = (await this.store.load<WorkBudget>('workBudgets')).filter(budget => ids.has(budget.id) || budget.conversationId === conversationId)
    const workWakes = (await this.store.load<WorkWake>('workWakes')).filter(wake => wake.conversationId === conversationId)
    return { workItems, workBudgets, workWakes }
  }

  private async revisionScope(tx: RecordTransaction, requestId: string, conversationId: string, agentId: string) {
    const request = await tx.get<ArtifactRevisionRequest>('artifactRevisionRequests', requestId)
    if (!request || request.conversationId !== conversationId) throw new WorkUnavailableError('修订请求已清理或不属于当前会话')
    const message = await tx.get<Message>('messages', request.messageId)
    if (!message || message.conversationId !== conversationId || message.senderType !== 'user' || message.senderId !== 'user' || message.origin || message.status !== 'completed' || message.content.trim() !== request.content) throw new WorkUnavailableError('修订必须来源于一致的本人新用户消息，不能继承自动化请求')
    const conversation = await tx.get<Conversation>('conversations', conversationId)
    if (!conversation || await tx.get('conversationCleanup', conversationId)) throw new WorkUnavailableError('修订所属会话已清理或不存在')
    for (const id of new Set([request.targetAgentId, agentId])) {
      const agent = await tx.get<DigitalAgent>('agents', id)
      if (!agent?.active || !conversation.agentIds.includes(id) || agent.executionBackend?.kind === 'acp-local') throw new WorkUnavailableError('修订目标或执行员工不是当前有效的内置成员')
    }
    const artifact = await tx.get<ArtifactVersion>('artifacts', request.artifactId)
    if (!artifact || artifact.conversationId !== conversationId || artifact.contentHash !== request.contentHash || artifact.logicalArtifactId !== request.logicalArtifactId || artifact.contentStatus !== 'ready') throw new WorkUnavailableError('修订原版的内容身份已失效')
    for (const ref of artifact.materialSources ?? []) {
      const material = await tx.get<ConversationMaterial>('materials', ref.id)
      if (ref.conversationId !== conversationId || !material || material.conversationId !== conversationId || material.status !== 'ready' || !material.messageId || material.revision !== ref.revision || material.contentHash !== ref.contentHash || material.parseVersion !== ref.parseVersion || !material.authorizedAgentIds.includes(agentId)) throw new WorkUnavailableError('修订原版的材料来源或执行授权已失效')
    }
    return request
  }

  private async revisionWork(tx: RecordTransaction, work: WorkItem) {
    if (!work.revisionRequestId) return
    const request = await this.revisionScope(tx, work.revisionRequestId, work.conversationId, work.ownerAgentId)
    const root = request.rootWorkId && await tx.get<WorkItem>('workItems', request.rootWorkId)
    const budgetId = `budget-${identity(work.conversationId, request.messageId)}`
    if (!root || root.parentWorkId || root.id !== root.rootWorkId || root.revisionRequestId !== request.id || root.ownerAgentId !== request.targetAgentId || root.sourceMessageId !== request.messageId || root.origin || root.budgetId !== budgetId || work.origin || work.rootWorkId !== root.id || work.sourceMessageId !== request.messageId || work.budgetId !== root.budgetId) throw new WorkUnavailableError('修订工作不能改绑原工作、根预算或自动化来源')
    return request
  }

  claim(input: WorkClaimInput) {
    return this.store.transaction(async tx => {
      const referenced = input.intent.workId ? await tx.get<WorkItem>('workItems', input.intent.workId) : undefined
      if (input.intent.workId && !referenced) throw new WorkUnavailableError('工作不存在，不能认领未知 ID')
      const sourceRevision = !input.revisionRequestId && !referenced?.revisionRequestId && !input.wakeId
        ? (await tx.list<ArtifactRevisionRequest>('artifactRevisionRequests')).find(request => request.messageId === input.sourceMessageId)
        : undefined
      const revisionId = input.revisionRequestId ?? referenced?.revisionRequestId ?? sourceRevision?.id
      const revision = revisionId ? await this.revisionScope(tx, revisionId, input.conversationId, input.agentId) : undefined
      if (revision) {
        if (input.origin || (referenced && referenced.revisionRequestId !== revision.id)) throw new WorkUnavailableError('新的修订请求不能认领原工作或继承自动化 occurrence')
        if (!referenced && input.sourceMessageId !== revision.messageId) throw new WorkUnavailableError('修订认领必须使用已受理的新用户消息')
        if (!revision.rootWorkId && (input.intent.workId || input.intent.expectedVersion !== undefined || input.wakeId)) throw new WorkUnavailableError('首次修订认领必须建立新根工作')
        if (!input.intent.workId && input.wakeId) throw new WorkUnavailableError('修订唤醒必须引用当前修订工作')
        if (!referenced && input.agentId !== revision.targetAgentId) throw new WorkUnavailableError('修订只能由明确选择的目标员工认领')
      }
      const sourceOrigin = revision ? undefined : (await tx.get<Message>('messages', input.sourceMessageId))?.origin
      const sourceOccurrence = sourceOrigin ? await assertAutomationExecution(tx, sourceOrigin, input.conversationId) : undefined
      const sourceMessageId = revision?.messageId ?? sourceOccurrence?.messageId ?? input.sourceMessageId
      const key = revision ? 'artifact-revision' : input.intent.key
      const id = input.intent.workId ?? revision?.rootWorkId ?? `work-${identity(input.conversationId, sourceMessageId, key)}`
      let work = referenced ?? await tx.get<WorkItem>('workItems', id)
      if (revision?.rootWorkId && !work) throw new WorkUnavailableError('修订根工作已清理，不能重新建立预算')
      if (revision && work) {
        if (work.revisionRequestId !== revision.id) throw new WorkUnavailableError('修订不能复用已有的其他工作')
        await this.revisionWork(tx, work)
      }
      const incomingOrigin = input.intent.workId ? input.origin : input.origin ?? sourceOrigin
      if (work && work.origin?.occurrenceId !== incomingOrigin?.occurrenceId) throw new WorkUnavailableError('不能把已有工作改绑到另一自动化或普通聊天')
      const origin = work ? work.origin : sourceOrigin
      if (input.origin && (!origin || origin.occurrenceId !== input.origin.occurrenceId || origin.automationId !== input.origin.automationId || origin.authorizedFingerprint !== input.origin.authorizedFingerprint)) throw new WorkUnavailableError('自动化工作缺少可信原始来源')
      const automation = origin ? await assertAutomationExecution(tx, origin, input.conversationId) : undefined
      const isNew = !work
      if (!work) {
        work = { schemaVersion: 2, id, conversationId: input.conversationId, sourceMessageId, ...(origin ? { origin } : {}),
          ...(revision ? { revisionRequestId: revision.id } : {}),
          key, scope: input.intent.scope, deliverable: input.intent.deliverable, ownerAgentId: input.agentId,
          version: 1, status: 'ready', budgetId: automation?.budgetId ?? `budget-${identity(input.conversationId, revision?.messageId ?? input.sourceMessageId)}`,
          rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0,
          resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: timestamp(), updatedAt: timestamp() }
      }
      if (work.conversationId !== input.conversationId) throw new WorkUnavailableError('工作不属于当前会话')
      if (work.ownerAgentId !== input.agentId) throw new WorkUnavailableError('工作已有负责人，请等待结果或提出独立工作')
      if (work.activeRunId === input.runId) return work
      if (work.activeRunId) throw new WorkUnavailableError('工作已有运行持有执行权')
      if (input.intent.workId && input.intent.expectedVersion === undefined) throw new WorkUnavailableError('引用已有工作必须声明观察到的版本')
      if (input.intent.expectedVersion !== undefined && input.intent.expectedVersion !== work.version) throw new WorkUnavailableError('工作版本已变化，请重新读取当前结果')
      if (work.status !== 'ready') throw new WorkUnavailableError(`工作当前为 ${work.status}，不能重复执行`)
      if (work.wakeId && work.wakeId !== input.wakeId) throw new WorkUnavailableError('该工作只能由定向接续认领')
      const wake = input.wakeId ? await tx.get<WorkWake>('workWakes', input.wakeId) : undefined
      if (input.wakeId && (!wake || wake.workId !== work.id || wake.waitRevision !== work.waitRevision || wake.status !== 'scheduled' || wake.kind === 'blocked')) throw new WorkUnavailableError('接续已经消费或失效')
      if (work.requiresReview) throw new WorkUnavailableError('已有操作需要核对，不能自动重放')
      if (await tx.get<WorkExecution>('workExecutions', input.runId)) throw new WorkUnavailableError('该运行已释放执行权，不能再次执行')
      let budget = await tx.get<WorkBudget>('workBudgets', work.budgetId)
      budget ??= newWorkBudget(work.budgetId)
      checkWorkBudget(budget)
      if (budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
      if (isNew) {
        if (budget.workItems >= budget.maxWorkItems) throw new WorkUnavailableError('达到原始工作的拆分上限')
        budget.workItems++
      }
      if (wake) { wake.status = 'consumed'; await tx.put(row('workWakes', wake)); delete work.wakeId }
      if (!budget.accounting) { budget.modelCalls++; budget.usageIncomplete = true }
      budget.runs++
      if (input.materialSources?.length) work.materialSources = structuredClone([...new Map([...(work.materialSources ?? []), ...input.materialSources].map(ref => [`${ref.id}:${ref.revision}`, ref])).values()])
      work.activeRunId = input.runId; work.status = 'running'; work.version++; work.updatedAt = timestamp()
      const execution: WorkExecution = { ...(work.origin ? { origin: work.origin } : {}), id: input.runId, workId: work.id, budgetId: work.budgetId, agentId: input.agentId, claimVersion: work.version, modelCalls: budget.accounting ? 0 : 1, usage: {}, status: 'active' }
      if (revision && !revision.rootWorkId) { revision.rootWorkId = work.id; await tx.put(row('artifactRevisionRequests', revision)) }
      await tx.put(row('workItems', work)); await tx.put(row('workBudgets', budget)); await tx.put(row('workExecutions', execution))
      return work
    })
  }

  private async holder(tx: RecordTransaction, runId: string) {
    const execution = await tx.get<WorkExecution>('workExecutions', runId)
    const work = execution && await tx.get<WorkItem>('workItems', execution.workId)
    if (!execution || !work || execution.status !== 'active' || work.activeRunId !== runId || work.ownerAgentId !== execution.agentId || work.version !== execution.claimVersion) throw new WorkUnavailableError('运行已不再持有当前工作的执行权')
    await this.revisionWork(tx, work)
    if (work.origin) await assertAutomationExecution(tx, work.origin, work.conversationId)
    return { execution, work }
  }
  recordMaterialSources(runId: string, sources: MaterialReadRef[]) {
    return this.store.transaction(async tx => {
      const { work } = await this.holder(tx, runId)
      work.materialSources = structuredClone([...new Map([...(work.materialSources ?? []), ...sources].map(ref => [`${ref.id}:${ref.revision}`, ref])).values()])
      await tx.put(row('workItems', work)); return work
    })
  }
  reserveAutomationCall(run: AgentRun, callId: string, phase: BudgetModelCall['phase']) {
    return this.store.transaction(async tx => {
      if (!run.origin || !run.turnId) throw new Error('自动化模型调用缺少来源或轮次')
      const o = await activateAutomationExecution(tx, run.origin, run.conversationId)
      const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
      if (!budget) throw new Error('本次自动化没有可信的原始预算，请发起新一轮')
      const execution = run.workId ? (await this.holder(tx, run.id)).execution : undefined
      const existing = await tx.get<BudgetModelCall>('budgetModelCalls', callId)
      await reserveBudgetCall(tx, budget, { id: callId, runId: run.id, turnId: run.turnId, conversationId: run.conversationId, origin: run.origin, phase })
      if (execution && !existing) { execution.modelCalls++; await tx.put(row('workExecutions', execution)) }
      return callId
    })
  }
  settleAutomationCall(runId: string, callId: string, usage: ModelUsage) {
    return this.store.transaction(async tx => {
      await settleBudgetCall(tx, callId, runId, usage)
      const call = await tx.get<BudgetModelCall>('budgetModelCalls', callId)
      return call ? tx.get<WorkBudget>('workBudgets', call.budgetId) : undefined
    })
  }
  reserveCall(runId: string) {
    return this.store.transaction(async tx => {
      const { execution } = await this.holder(tx, runId)
      const budget = (await tx.get<WorkBudget>('workBudgets', execution.budgetId))!
      checkWorkBudget(budget); budget.modelCalls++; execution.modelCalls++
      await tx.put(row('workExecutions', execution)); await tx.put(row('workBudgets', budget))
    })
  }
  usage(runId: string, usage: ModelUsage) {
    return this.store.transaction(async tx => {
      const { execution } = await this.holder(tx, runId)
      const budget = (await tx.get<WorkBudget>('workBudgets', execution.budgetId))!
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[key] !== undefined) {
        if (!Number.isFinite(usage[key]) || usage[key]! < 0) throw new Error('工作用量必须是已知的非负数')
        const next = Math.max(execution.usage[key] ?? 0, usage[key]!)
        budget.usage[key] = (budget.usage[key] ?? 0) + next - (execution.usage[key] ?? 0)
        execution.usage[key] = next
      }
      await tx.put(row('workExecutions', execution)); await tx.put(row('workBudgets', budget))
    })
  }
  markEffect(runId: string) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      execution.pendingEffects = (execution.pendingEffects ?? 0) + 1
      work.requiresReview = true; await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
    })
  }

  /** The receipt and all publication records commit with the ownership check. */
  settle(runId: string, outcome: WorkOutcome, receipt: { messageId: string; content: string; artifactIds: string[] }, records: StoredRecord[] = [], committedMessage?: (tx: RecordTransaction) => Promise<unknown>) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      const evidenceError = workEvidenceError(outcome, receipt, !!execution.pendingWait)
      if (evidenceError) throw new Error(evidenceError)
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      const newResult = outcome.disposition === 'delivered' || receipt.artifactIds.some(id => !work.artifactIds.includes(id))
      const wait = execution.pendingWait
      const newDependency = wait?.dependencies.some(result => (work.observedResults.find(item => item.workId === result.workId)?.resultVersion ?? 0) < result.resultVersion)
      if (!newResult && !newDependency) budget.noProgress++
      if (wait) {
        work.dependsOnWorkIds = wait.dependencies.map(result => result.workId); work.requiredResults = wait.dependencies
        work.nextStep = wait.nextStep; work.waitRevision++
      }
      work.observedResults = [...work.requiredResults]
      if (!(execution.pendingEffects ?? 0)) work.requiresReview = false
      work.outcome = outcome; work.resultMessageIds.push(receipt.messageId)
      work.artifactIds = [...new Set([...work.artifactIds, ...receipt.artifactIds])]
      work.resultVersion++; work.version++; work.updatedAt = timestamp()
      if (outcome.userQuestion) work.userQuestion = { id: `work:${work.id}:${work.resultVersion}`, messageId: receipt.messageId, content: outcome.userQuestion, revision: work.version }
      work.status = outcome.disposition === 'delivered' ? 'delivered' : outcome.disposition === 'waiting' ? 'waiting' : 'blocked'
      delete work.activeRunId; execution.status = 'released'
      if (budget.noProgress >= budget.maxNoProgress && work.status !== 'delivered') { work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: '达到原始工作的无进展接续上限' } }
      await tx.put(row('workBudgets', budget))
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      for (const item of records) await tx.put(item)
      await committedMessage?.(tx)
      return (await tx.get<WorkItem>('workItems', work.id))!
    })
  }
  withhold(runId: string, reason: string, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      work.outcome = { disposition: 'blocked', summary: reason }; work.status = 'blocked'
      work.version++; work.updatedAt = timestamp(); delete work.activeRunId; execution.status = 'released'
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      for (const item of records) await tx.put(item)
    })
  }
  release(runId: string, status: 'failed' | 'cancelled' | 'interrupted') {
    return this.store.transaction(async tx => {
      const execution = await tx.get<WorkExecution>('workExecutions', runId)
      if (!execution) return
      const work = await tx.get<WorkItem>('workItems', execution.workId)
      if (!work || work.activeRunId !== runId || work.version !== execution.claimVersion) return
      delete work.activeRunId; work.status = status; work.version++; work.updatedAt = timestamp(); execution.status = 'released'
      if (status === 'cancelled') { const budget = await tx.get<WorkBudget>('workBudgets', work.budgetId); work.cancellationCause = budget && workBudgetExhausted(budget) ? 'budget' : 'user' }
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
    })
  }
  confirmEffect(runId: string) {
    return this.store.transaction(async tx => {
      const { execution } = await this.holder(tx, runId)
      if (!execution.pendingEffects) throw new Error('没有可确认的工具操作')
      execution.pendingEffects--; await tx.put(row('workExecutions', execution))
    })
  }
  reserveReport(runId: string) {
    return this.store.transaction(async tx => {
      const { work } = await this.holder(tx, runId)
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      checkWorkBudget(budget)
      if (budget.reportRefreshes >= budget.maxReportRefreshes) throw new WorkUnavailableError('达到原始工作的重新汇报上限')
      budget.reportRefreshes++; await tx.put(row('workBudgets', budget))
    })
  }
  delegate(runId: string, input: WorkDelegation) {
    const proposal = workDelegationSchema.parse(input)
    return this.store.transaction(async tx => {
      const { work: parent, execution } = await this.holder(tx, runId)
      if (parent.revisionRequestId) await this.revisionScope(tx, parent.revisionRequestId, parent.conversationId, proposal.ownerAgentId)
      const id = `work-${identity(parent.id, proposal.key)}`
      const previous = await tx.get<WorkItem>('workItems', id)
      if (previous) {
        if (previous.ownerAgentId !== proposal.ownerAgentId || previous.scope !== proposal.scope || previous.deliverable !== proposal.deliverable || JSON.stringify(previous.requiredResults) !== JSON.stringify(proposal.dependencies ?? [])) throw new WorkUnavailableError('同一拆分标识已用于不同工作')
        return previous
      }
      const budget = (await tx.get<WorkBudget>('workBudgets', parent.budgetId))!
      checkWorkBudget(budget)
      if (budget.workItems >= budget.maxWorkItems || budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的拆分或运行上限')
      const dependencies = proposal.dependencies ?? []
      const work: WorkItem = { schemaVersion: 2, id, conversationId: parent.conversationId, sourceMessageId: parent.sourceMessageId, ...(parent.origin ? { origin: parent.origin } : {}),
        ...(parent.revisionRequestId ? { revisionRequestId: parent.revisionRequestId } : {}),
        ...(parent.materialSources?.length ? { materialSources: structuredClone(parent.materialSources) } : {}),
        key: proposal.key, scope: proposal.scope, deliverable: proposal.deliverable, ownerAgentId: proposal.ownerAgentId,
        rootWorkId: parent.rootWorkId, parentWorkId: parent.id, budgetId: parent.budgetId, version: 1,
        dependsOnWorkIds: dependencies.map(item => item.workId), requiredResults: dependencies, observedResults: [], waitRevision: dependencies.length ? 1 : 0,
        status: dependencies.length ? 'waiting' : 'ready', resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: timestamp(), updatedAt: timestamp() }
      await validateDependencies(tx, work, dependencies)
      budget.workItems++; await tx.put(row('workBudgets', budget)); await tx.put(row('workItems', work))
      const source = { runId, agentId: execution.agentId }
      if (!dependencies.length) await queueWorkWake(tx, work, 'assigned', source)
      else await refreshWaiters(tx, work.conversationId, source)
      return (await tx.get<WorkItem>('workItems', id))!
    })
  }
  waitFor(runId: string, input: WorkWait) {
    const plan = workWaitSchema.parse(input)
    return this.store.transaction(async tx => {
      const { work, execution } = await this.holder(tx, runId)
      await validateDependencies(tx, work, plan.dependencies)
      // Save the graph edge now so concurrent wait registrations cannot form a cycle.
      work.dependsOnWorkIds = plan.dependencies.map(item => item.workId)
      execution.pendingWait = plan
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
    })
  }
  /** Admission and the scheduler records are committed together; execution consumes separately. */
  scheduleWake(wakeId: string, turnId: string, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      const wake = await tx.get<WorkWake>('workWakes', wakeId)
      if (!wake || wake.kind === 'blocked' || wake.status !== 'pending') return false
      const work = await tx.get<WorkItem>('workItems', wake.workId)
      if (!work || work.wakeId !== wake.id || work.status !== 'ready' || work.requiresReview) return false
      if (work.origin) { try { await activateAutomationExecution(tx, work.origin, work.conversationId) } catch (error) { if (!(error instanceof WorkUnavailableError)) throw error; return false } }
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      try {
        checkWorkBudget(budget)
        if (budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
      } catch (error) {
        work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: (error as Error).message }; work.version++
        wake.status = 'cancelled'; wake.reason = work.outcome.summary
        await tx.put(row('workItems', work)); await tx.put(row('workWakes', wake))
        await refreshWaiters(tx, work.conversationId, { runId: 'host', agentId: 'host' }); return false
      }
      wake.status = 'scheduled'; wake.turnId = turnId
      await tx.put(row('workWakes', wake))
      for (const record of records) await tx.put(record)
      return true
    })
  }
  deferWake(wakeId: string, turnId: string) {
    return this.store.transaction(async tx => {
      const wake = await tx.get<WorkWake>('workWakes', wakeId)
      if (!wake || wake.turnId !== turnId || wake.status !== 'scheduled') return
      const work = await tx.get<WorkItem>('workItems', wake.workId)
      if (work?.status !== 'ready' || work.wakeId !== wake.id) return
      wake.status = 'pending'; delete wake.turnId; await tx.put(row('workWakes', wake))
    })
  }
  cancelTree(workId: string, reason: string, cause: 'user' | 'budget' = 'user') {
    return this.store.transaction(async tx => {
      const items = await tx.list<WorkItem>('workItems'), root = items.find(work => work.id === workId)
      if (!root) return []
      const ids = new Set([root.id])
      for (let pass = 0; pass < items.length; pass++) for (const work of items) if (work.parentWorkId && ids.has(work.parentWorkId)) ids.add(work.id)
      for (const work of items) if (ids.has(work.id) && !['delivered', 'cancelled', 'failed'].includes(work.status)) {
        if (work.activeRunId) {
          const execution = await tx.get<WorkExecution>('workExecutions', work.activeRunId)
          if (execution) { execution.status = 'released'; await tx.put(row('workExecutions', execution)) }
        }
        work.status = 'cancelled'; work.cancellationCause = cause; work.version++; work.updatedAt = timestamp(); delete work.activeRunId
        work.outcome = { disposition: 'blocked', summary: reason }; await tx.put(row('workItems', work))
      }
      for (const wake of await tx.list<WorkWake>('workWakes')) if (ids.has(wake.workId) && ['pending', 'scheduled'].includes(wake.status)) {
        wake.status = 'cancelled'; wake.reason = reason; await tx.put(row('workWakes', wake))
      }
      await refreshWaiters(tx, root.conversationId, { runId: 'host', agentId: 'user' })
      return [...ids]
    })
  }
  expire(conversationId: string) {
    return this.store.transaction(async tx => {
      const budgets = new Map((await tx.list<WorkBudget>('workBudgets')).map(budget => [budget.id, budget]))
      for (const work of await tx.list<WorkItem>('workItems')) if (work.conversationId === conversationId && ['ready', 'waiting'].includes(work.status) && !work.activeRunId && Date.now() >= Date.parse(budgets.get(work.budgetId)!.deadlineAt)) {
        work.status = 'blocked'; work.version++; work.outcome = { disposition: 'blocked', summary: '等待已超过原始工作的时间上限' }
        await tx.put(row('workItems', work))
        if (work.wakeId) {
          const wake = await tx.get<WorkWake>('workWakes', work.wakeId)
          if (wake && ['pending', 'scheduled'].includes(wake.status)) { wake.status = 'cancelled'; wake.reason = work.outcome.summary; await tx.put(row('workWakes', wake)) }
        }
      }
      await refreshWaiters(tx, conversationId, { runId: 'host', agentId: 'host' })
    })
  }
  authorizeRetry(workId: string, agentId: string, records: StoredRecord[] = []) {
    return this.store.transaction(async tx => {
      const work = await tx.get<WorkItem>('workItems', workId)
      if (!work || work.ownerAgentId !== agentId || work.activeRunId || !['failed', 'cancelled'].includes(work.status)) throw new WorkUnavailableError('当前工作不能重试')
      await this.revisionWork(tx, work)
      if (work.requiresReview) throw new WorkUnavailableError('已有工具操作需要核对，请确认现有结果后发起明确的新请求')
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      checkWorkBudget(budget)
      if (budget.retries >= budget.maxRetries) throw new WorkUnavailableError('达到原始工作的重试上限')
      for (const result of work.requiredResults) {
        const dependency = await tx.get<WorkItem>('workItems', result.workId)
        if (dependency?.status !== 'delivered' || dependency.resultVersion < result.resultVersion) throw new WorkUnavailableError('所需依赖尚未交付，不能重试执行')
      }
      if (work.parentWorkId) {
        const parent = await tx.get<WorkItem>('workItems', work.parentWorkId)
        if (parent?.status === 'cancelled' || parent?.status === 'interrupted') throw new WorkUnavailableError('父工作已停止，不能单独重试子工作')
      }
      if (work.origin) await resumeAutomationExecution(tx, work.origin, work.conversationId)
      delete work.wakeId
      budget.retries++; await tx.put(row('workBudgets', budget))
      work.status = 'ready'; work.version++; work.updatedAt = timestamp()
      await tx.put(row('workItems', work))
      for (const record of records) await tx.put(record)
    })
  }
}
