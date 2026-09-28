/*
 * [INPUT]: 显式工作意图、运行身份、当前权限校验后的上下文与 SQLite 事务。
 * [OUTPUT]: 父子工作、原子认领/接续、共享预算、依赖通知与持有者比较。
 * [POS]: collaboration 的持久工作控制；不选举发言人、不重放工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { ModelUsage, WorkBudget, WorkExecution, WorkIntent, WorkItem, WorkOutcome, WorkDelegation, WorkWait, WorkWake } from '../../../shared/domain'
import { ProductStore, type RecordTransaction, type StoredRecord } from '../../adapters/storage/product-store'

import { queueWorkWake, refreshWaiters, validateDependencies } from './work-dependencies'
import { workDelegationSchema, workWaitSchema, workEvidenceError } from './work-protocol'

const limits = { workItems: 0, retries: 0, reportRefreshes: 0, noProgress: 0, maxWorkItems: 8, maxRetries: 3, maxReportRefreshes: 4, maxNoProgress: 3 }
const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const timestamp = () => new Date().toISOString()
const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
const callLimit = 24, runLimit = 8, outputLimit = 16000, durationLimit = 5 * 60_000
export class WorkUnavailableError extends Error {}

export class WorkRepository {
  constructor(private store: ProductStore) {}

  async init() {
    await this.store.transaction(async tx => {
      const format = await tx.get<{ id: string; version: number }>('collaborationSchema', 'work')
      if (format && ![1, 2].includes(format.version)) throw new Error('工作数据版本高于当前应用支持范围')
      const executions = await tx.list<WorkExecution>('workExecutions')
      for (const work of await tx.list<WorkItem>('workItems')) {
        if (![1, 2].includes(work.schemaVersion)) throw new Error('不能读取未知版本的工作记录')
        if (Number(work.schemaVersion) === 1) Object.assign(work, { rootWorkId: work.id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, schemaVersion: 2 })
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
        const migrated = { ...limits, ...budget }
        migrated.workItems = (await tx.list<WorkItem>('workItems')).filter(work => work.budgetId === budget.id).length
        await tx.put(row('workBudgets', migrated))
      }
      for (const wake of await tx.list<WorkWake>('workWakes')) if (['pending', 'scheduled'].includes(wake.status)) {
        wake.status = 'interrupted'; wake.reason = '应用重启，接续需要明确恢复'; await tx.put(row('workWakes', wake))
      }
      // Historical Contribution records intentionally retain their original meaning.
      await tx.put(row('collaborationSchema', { id: 'work', version: 2 }))
    })
  }

  async view(conversationId: string) {
    const workItems = (await this.store.load<WorkItem>('workItems')).filter(work => work.conversationId === conversationId)
    const ids = new Set(workItems.map(work => work.budgetId))
    const workBudgets = (await this.store.load<WorkBudget>('workBudgets')).filter(budget => ids.has(budget.id))
    const workWakes = (await this.store.load<WorkWake>('workWakes')).filter(wake => wake.conversationId === conversationId)
    return { workItems, workBudgets, workWakes }
  }

  claim(input: { conversationId: string; sourceMessageId: string; agentId: string; runId: string; intent: WorkIntent; wakeId?: string }) {
    return this.store.transaction(async tx => {
      const id = input.intent.workId ?? `work-${identity(input.conversationId, input.sourceMessageId, input.intent.key)}`
      let work = await tx.get<WorkItem>('workItems', id)
      if (input.intent.workId && !work) throw new WorkUnavailableError('工作不存在，不能认领未知 ID')
      const isNew = !work
      if (!work) {
        work = { schemaVersion: 2, id, conversationId: input.conversationId, sourceMessageId: input.sourceMessageId,
          key: input.intent.key, scope: input.intent.scope, deliverable: input.intent.deliverable, ownerAgentId: input.agentId,
          version: 1, status: 'ready', budgetId: `budget-${identity(input.conversationId, input.sourceMessageId)}`,
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
      budget ??= { ...limits, id: work.budgetId, schemaVersion: 1, modelCalls: 0, runs: 0, maxModelCalls: callLimit, maxRuns: runLimit,
        maxOutputTokens: outputLimit, deadlineAt: new Date(Date.now() + durationLimit).toISOString(), usage: {}, usageIncomplete: false }
      this.checkBudget(budget)
      if (budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的运行次数上限')
      if (isNew) {
        if (budget.workItems >= budget.maxWorkItems) throw new WorkUnavailableError('达到原始工作的拆分上限')
        budget.workItems++
      }
      if (wake) { wake.status = 'consumed'; await tx.put(row('workWakes', wake)); delete work.wakeId }
      budget.modelCalls++; budget.runs++; budget.usageIncomplete = true
      work.activeRunId = input.runId; work.status = 'running'; work.version++; work.updatedAt = timestamp()
      const execution: WorkExecution = { id: input.runId, workId: work.id, budgetId: work.budgetId, agentId: input.agentId, claimVersion: work.version, modelCalls: 1, usage: {}, status: 'active' }
      await tx.put(row('workItems', work)); await tx.put(row('workBudgets', budget)); await tx.put(row('workExecutions', execution))
      return work
    })
  }

  private checkBudget(budget: WorkBudget) {
    if (budget.noProgress >= budget.maxNoProgress) throw new WorkUnavailableError('达到原始工作的无进展接续上限')
    if (budget.modelCalls >= budget.maxModelCalls || (budget.usage.outputTokens ?? 0) >= budget.maxOutputTokens || Date.now() >= Date.parse(budget.deadlineAt)) throw new WorkUnavailableError('达到原始工作的调用、用量或时间上限')
  }
  private async holder(tx: RecordTransaction, runId: string) {
    const execution = await tx.get<WorkExecution>('workExecutions', runId)
    const work = execution && await tx.get<WorkItem>('workItems', execution.workId)
    if (!execution || !work || execution.status !== 'active' || work.activeRunId !== runId || work.ownerAgentId !== execution.agentId || work.version !== execution.claimVersion) throw new WorkUnavailableError('运行已不再持有当前工作的执行权')
    return { execution, work }
  }
  reserveCall(runId: string) {
    return this.store.transaction(async tx => {
      const { execution } = await this.holder(tx, runId)
      const budget = (await tx.get<WorkBudget>('workBudgets', execution.budgetId))!
      this.checkBudget(budget); budget.modelCalls++; execution.modelCalls++
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
  settle(runId: string, outcome: WorkOutcome, receipt: { messageId: string; content: string; artifactIds: string[] }, records: StoredRecord[] = []) {
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
      work.status = outcome.disposition === 'delivered' ? 'delivered' : outcome.disposition === 'waiting' ? 'waiting' : 'blocked'
      delete work.activeRunId; execution.status = 'released'
      if (budget.noProgress >= budget.maxNoProgress && work.status !== 'delivered') { work.status = 'blocked'; work.outcome = { disposition: 'blocked', summary: '达到原始工作的无进展接续上限' } }
      await tx.put(row('workBudgets', budget))
      await tx.put(row('workItems', work)); await tx.put(row('workExecutions', execution))
      await refreshWaiters(tx, work.conversationId, { runId, agentId: execution.agentId })
      for (const item of records) await tx.put(item)
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
      this.checkBudget(budget)
      if (budget.reportRefreshes >= budget.maxReportRefreshes) throw new WorkUnavailableError('达到原始工作的重新汇报上限')
      budget.reportRefreshes++; await tx.put(row('workBudgets', budget))
    })
  }
  delegate(runId: string, input: WorkDelegation) {
    const proposal = workDelegationSchema.parse(input)
    return this.store.transaction(async tx => {
      const { work: parent, execution } = await this.holder(tx, runId)
      const id = `work-${identity(parent.id, proposal.key)}`
      const previous = await tx.get<WorkItem>('workItems', id)
      if (previous) {
        if (previous.ownerAgentId !== proposal.ownerAgentId || previous.scope !== proposal.scope || previous.deliverable !== proposal.deliverable || JSON.stringify(previous.requiredResults) !== JSON.stringify(proposal.dependencies ?? [])) throw new WorkUnavailableError('同一拆分标识已用于不同工作')
        return previous
      }
      const budget = (await tx.get<WorkBudget>('workBudgets', parent.budgetId))!
      this.checkBudget(budget)
      if (budget.workItems >= budget.maxWorkItems || budget.runs >= budget.maxRuns) throw new WorkUnavailableError('达到原始工作的拆分或运行上限')
      const dependencies = proposal.dependencies ?? []
      const work: WorkItem = { schemaVersion: 2, id, conversationId: parent.conversationId, sourceMessageId: parent.sourceMessageId,
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
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      try {
        this.checkBudget(budget)
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
  cancelTree(workId: string, reason: string) {
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
        work.status = 'cancelled'; work.version++; work.updatedAt = timestamp(); delete work.activeRunId
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
      if (work.requiresReview) throw new WorkUnavailableError('已有工具操作需要核对，请确认现有结果后发起明确的新请求')
      const budget = (await tx.get<WorkBudget>('workBudgets', work.budgetId))!
      this.checkBudget(budget)
      if (budget.retries >= budget.maxRetries) throw new WorkUnavailableError('达到原始工作的重试上限')
      for (const result of work.requiredResults) {
        const dependency = await tx.get<WorkItem>('workItems', result.workId)
        if (dependency?.status !== 'delivered' || dependency.resultVersion < result.resultVersion) throw new WorkUnavailableError('所需依赖尚未交付，不能重试执行')
      }
      if (work.parentWorkId) {
        const parent = await tx.get<WorkItem>('workItems', work.parentWorkId)
        if (parent?.status === 'cancelled' || parent?.status === 'interrupted') throw new WorkUnavailableError('父工作已停止，不能单独重试子工作')
      }
      delete work.wakeId
      budget.retries++; await tx.put(row('workBudgets', budget))
      work.status = 'ready'; work.version++; work.updatedAt = timestamp()
      await tx.put(row('workItems', work))
      for (const record of records) await tx.put(record)
    })
  }
}
