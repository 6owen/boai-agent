/*
 * [OUTPUT]: 取消自动化固定执行时限；旧时间预算取消仅由本人显式继续恢复，原occurrence、预算计账、容量与人工停止门禁保持。
 * [OUTPUT]: 已删除历史保留原触发去重，公开视图排除墓碑；待清理来源不能继续执行。
 * [OUTPUT]: 开始日期和频率变化推进日程代际，过期原生触发不能绕过新规则。
 * [OUTPUT]: 同一群消息由多个员工响应时事务拒绝跨员工重复创建；恢复回执绑定原ID与revision。
 * [OUTPUT]: 旧归属只按持久员工/BOAI群关系补齐，保留原执行策略与时钟；新触发冻结owner/参与者/分工。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 事务受理等待当前运行配置核对，失败先登记跳过，不创建聊天、预算或投递。
 * [INPUT]: 自动化定义/触发、宿主许可判断与 ProductStore 事务。
 * [OUTPUT]: 原自动化问题仅解除固定问题，原Work补充与消息/容量同事务，其他原问题保持等待；旧完成/同伴失败轮次须在同事务以确切已提交Run/Work问题核对，不重写原轮次或恢复业务。
 * [OUTPUT]: 创建请求与计划同事务去重，删除保留创建身份防止重建；监控检查点/比较证据/通知同事务提交与规则变更重建基线；以可信预算当前期限准入续行；结果/通知、聊天/触发、补充/容量/消息同事务；版本化受理、执行许可与无重放恢复。
 * [POS]: 自动化产品账本；内存与 Mastra 日程均为投影，不是认领权威。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend } from '@boai/shared/domain/backends'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { DigitalAgent, Conversation, AgentRun, DiscussionTurn, DecisionRecord, Message, WorkItem, WorkBudget } from '@boai/shared/domain'
import type { AutomationCreationSource, AutomationDefinition, AutomationDispatch, AutomationInput, AutomationOccurrence, AutomationOrigin, AutomationMonitorCheckpoint, AutomationMonitorRead } from '@boai/shared/domain/automations'
import { ProductStore, type RecordTransaction, type StoredRecord } from '../../adapters/storage/product-store'
import { checkWorkBudget, newWorkBudget, WorkUnavailableError } from '../collaboration/work-budget'
import { compareMonitorObservation, monitorPolicyFingerprint, monitorPolicySchema } from './automation-monitor'
import { inferAutomationOwner } from './automation-plan'
import { automationQuestionStates, belongsToOccurrence, unansweredAutomationTurns } from './automation-results'
import { notificationPolicy, queueAutomationNotice, recoverAutomationNotices } from './automation-notifications'
import { activeOccurrence, AUTOMATION_MISFIRE_MS, automationCron, calendarSlot, historicalSlotAlias, manualIdentity, matchesSchedule, MAX_ACTIVE_AUTOMATIONS, nativeAlias, pendingOccurrence, scheduleIdentity, scheduleDays } from './schedule-policy'

const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const timestamp = () => new Date().toISOString()
interface TriggerAlias { id: string; occurrenceId: string }
interface MutationReceipt { id: string; fingerprint: string; definition: AutomationDefinition }
interface AutomationSchema { id: 'automations'; version: 1; ownerVersion?: 1; migratedAt: string; snapshot?: string }
export interface AutomationTrigger {
  automationId: string
  source: 'manual' | 'schedule'
  key: string
  scheduledAt: number
  revision?: number
  executionRevision?: number
  scheduleGeneration?: number
}

/** Shared with work ownership transactions; a stopped occurrence cannot acquire or publish work. */
export async function assertAutomationExecution(tx: RecordTransaction, origin: AutomationOrigin, conversationId: string) {
  const o = await tx.get<AutomationOccurrence>('automationOccurrences', origin.occurrenceId)
  if (o?.deletedAt || await tx.get('automationHistoryCleanups', origin.occurrenceId)) throw new Error('本次执行记录已删除或正在清理')
  if (!o || o.automationId !== origin.automationId || o.conversationId !== conversationId || o.cancellationRequestedAt || !['running', 'waiting_work', 'waiting_user', 'waiting_approval'].includes(o.status)) throw new WorkUnavailableError('本次自动化已停止或未获得执行许可')
  if (o.plan?.owner.kind === 'group') {
    const group = await tx.get<Conversation>('conversations', o.plan.owner.conversationId)
    if (!group || group.kind !== 'group' || group.channel || group.mergedInto || group.purpose && group.purpose !== 'personal' || o.plan.employeeIds.some(id => !group.agentIds.includes(id)) || await tx.get('conversationCleanup', group.id)) throw new WorkUnavailableError('自动化归属群或参与成员已失效')
  }
  return o
}
/** Waiting freed a product slot; reacquire it in the same transaction before scheduling or invoking. */
export async function activateAutomationExecution(tx: RecordTransaction, origin: AutomationOrigin, conversationId: string) {
  const o = await assertAutomationExecution(tx, origin, conversationId)
  if (activeOccurrence.has(o.status)) return o
  const active = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => item.id !== o.id && activeOccurrence.has(item.status))
  if (active.length >= MAX_ACTIVE_AUTOMATIONS || active.some(item => item.conversationId === conversationId)) throw new WorkUnavailableError('等待自动化执行容量')
  o.status = 'running'; o.stateVersion++; delete o.finishedAt
  await tx.put(row('automationOccurrences', o)); return o
}
/** Explicit safe retry shares the existing Work budget; stop/restart requires a separate reviewed request. */
export async function resumeAutomationExecution(tx: RecordTransaction, origin: AutomationOrigin, conversationId: string, continuedByUser = false) {
  const o = await tx.get<AutomationOccurrence>('automationOccurrences', origin.occurrenceId)
  if (o?.deletedAt || await tx.get('automationHistoryCleanups', origin.occurrenceId)) throw new Error('本次执行记录已删除或正在清理')
  const elapsedLimit = continuedByUser && o?.cancellationCause === 'budget' && o.reason === '达到本次自动化的时间预算'
  if (!o || o.automationId !== origin.automationId || o.conversationId !== conversationId || o.cancellationRequestedAt && !elapsedLimit || !['failed', 'running', 'waiting_work', 'waiting_user', 'waiting_approval', ...(continuedByUser ? ['interrupted'] : []), ...(elapsedLimit ? ['cancelled'] : [])].includes(o.status)) throw new Error('本次自动化已停止或需要核对，请从计划明确发起新一轮')
  const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
  if (!budget || budget.accounting !== 'model-calls-v1') throw new Error('旧自动化没有可信的原始调用预算，请明确发起新一轮')
  if (!o.budgetScope) checkWorkBudget(budget)
  const others = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => item.id !== o.id && pendingOccurrence.has(item.status))
  if (others.some(item => item.automationId === o.automationId || item.conversationId === conversationId && activeOccurrence.has(item.status)) || others.filter(item => activeOccurrence.has(item.status)).length >= MAX_ACTIVE_AUTOMATIONS) throw new Error('其他自动化正在执行或等待，不能继续本次运行')
  if (elapsedLimit) { delete o.cancellationRequestedAt; delete o.cancellationCause }
  o.status = 'running'; o.stateVersion++; o.deliveryStatus = o.resultEvidence?.length ? 'partial' : 'pending'
  delete o.finishedAt; delete o.reason
  await tx.put(row('automationOccurrences', o)); return o
}

export class AutomationRepository {
  constructor(private store: ProductStore, private dataPath: string) {}

  async migrate() {
    const format = (await this.store.load<AutomationSchema>('automationSchema'))[0]
    if (format && format.version !== 1) throw new Error('自动化数据版本高于当前应用支持范围')
    const definitions = await this.store.load<AutomationDefinition>('automations'), occurrences = await this.store.load<AutomationOccurrence>('automationOccurrences')
    for (const item of [...definitions, ...occurrences]) if (item.schemaVersion !== undefined && item.schemaVersion !== 1) throw new Error('不能读取未知版本的自动化记录')
    if (format) return
    // Snapshot precedes every migration write; an abandoned snapshot is safe after a crash.
    const snapshot = definitions.length || occurrences.length ? join(this.dataPath, `automation-before-v1-${randomUUID()}.sqlite`) : undefined
    if (snapshot) await this.store.backup(snapshot)
    await this.store.transaction(async tx => {
      const current = await tx.get<AutomationSchema>('automationSchema', 'automations')
      if (current) { if (current.version !== 1) throw new Error('自动化数据版本高于当前应用支持范围'); return }
      const migrated = new Map<string, AutomationDefinition>()
      for (const old of await tx.list<AutomationDefinition>('automations')) {
        if (old.schemaVersion !== undefined && old.schemaVersion !== 1) throw new Error('不能读取未知版本的自动化记录')
        const d: AutomationDefinition = old.schemaVersion ? old : { ...old, schemaVersion: 1, executionRevision: old.revision, scheduleGeneration: 1, legacyRevision: old.revision, scheduleEffectiveAt: old.createdAt, conversationPolicy: 'existing-conversation', notificationPolicy: old.notify ? 'all_results' : 'muted', updatedAt: old.createdAt, sync: 'pending' }
        migrated.set(d.id, d); await tx.put(row('automations', d))
      }
      for (const old of await tx.list<AutomationOccurrence>('automationOccurrences')) {
        if (old.schemaVersion !== undefined && old.schemaVersion !== 1) throw new Error('不能读取未知版本的自动化记录')
        const o: AutomationOccurrence = old.schemaVersion ? old : { ...old, schemaVersion: 1, stateVersion: 1, deliveryStatus: 'unknown', usageIncomplete: true }
        await tx.put(row('automationOccurrences', o))
        if (o.manualRequestId) await this.alias(tx, manualIdentity(o.automationId, o.manualRequestId), o.id)
        if (o.nativeRunId) await this.alias(tx, nativeAlias(o.nativeRunId), o.id)
        const d = migrated.get(o.automationId), time = Date.parse(o.scheduledFor)
        if (d && o.source === 'schedule' && Number.isFinite(time)) {
          // Old records have no timezone/version snapshot. A guard suppresses replay without inventing one.
          await this.alias(tx, historicalSlotAlias(d.id, d.timezone, calendarSlot(time, d.timezone)), o.id)
        }
      }
      await tx.put(row('automationSchema', { id: 'automations', version: 1, migratedAt: timestamp(), ...(snapshot ? { snapshot } : {}) }))
    })
  }

  async migrateOwners() {
    await this.store.transaction(async tx => {
      const format = await tx.get<AutomationSchema>('automationSchema', 'automations')
      if (!format || format.ownerVersion === 1) return
      const conversations = new Map((await tx.list<Conversation>('conversations')).map(item => [item.id, item]))
      const employees = new Set((await tx.list<DigitalAgent>('agents')).map(item => item.id))
      for (const definition of await tx.list<AutomationDefinition>('automations')) {
        if (definition.owner || definition.deletedAt) continue
        const owner = inferAutomationOwner(definition, conversations, employees)
        if (owner) await tx.put(row('automations', { ...definition, owner }))
      }
      await tx.put(row('automationSchema', { ...format, ownerVersion: 1 }))
    })
  }

  private async alias(tx: RecordTransaction, id: string, occurrenceId: string) {
    if (!await tx.get<TriggerAlias>('automationTriggerAliases', id)) await tx.put(row('automationTriggerAliases', { id, occurrenceId }))
  }
  private async existing(tx: RecordTransaction, aliases: string[]) {
    for (const id of aliases) {
      const alias = await tx.get<TriggerAlias>('automationTriggerAliases', id)
      const occurrence = await tx.get<AutomationOccurrence>('automationOccurrences', alias?.occurrenceId ?? id)
      if (occurrence) return occurrence
      if (alias) throw new Error('自动化触发身份存在但记录缺失，需要核对；不会重复执行')
    }
  }
  assertExecutable(origin: AutomationOrigin, conversationId: string) { return this.store.transaction(tx => assertAutomationExecution(tx, origin, conversationId)) }
  reply(origin: AutomationOrigin, conversationId: string, expectedVersion: number, questionMessageId: string, records: StoredRecord[], commitQuestion?: (tx: RecordTransaction) => Promise<void>) {
    return this.store.transaction(async tx => {
      const o = await assertAutomationExecution(tx, origin, conversationId)
      if (o.status !== 'waiting_user' || o.stateVersion !== expectedVersion) throw new Error('等待记录已经变化，请刷新后补充')
      const waiting = unansweredAutomationTurns(o, await tx.list<DiscussionTurn>('turns'), automationQuestionStates(await tx.list<Message>('messages'), await tx.list<WorkItem>('workItems'), await tx.list<DecisionRecord>('decisions'), await tx.list<AgentRun>('runs')))
      const question = await tx.get<Message>('messages', questionMessageId)
      const answered = waiting.find(turn => turn.id === question?.turnId)
      if (!question || !answered || question.conversationId !== conversationId || question.senderType !== 'agent' || question.status !== 'completed' || !belongsToOccurrence(question.origin ?? answered.origin, o)) throw new Error('本次原问题已不可用或不再等待补充')
      await commitQuestion?.(tx)
      const next = await resumeAutomationExecution(tx, origin, conversationId)
      const turn = records.find(record => record.collection === 'turns')?.value as DiscussionTurn | undefined
      if (!turn || turn.origin?.occurrenceId !== o.id || turn.conversationId !== conversationId) throw new Error('补充消息缺少本次自动化来源')
      turn.replyToTurnIds = [answered.id]
      for (const record of records) await tx.put(record)
      next.waitingTurnIds = unansweredAutomationTurns(o, await tx.list<DiscussionTurn>('turns'), automationQuestionStates(await tx.list<Message>('messages'), await tx.list<WorkItem>('workItems'), await tx.list<DecisionRecord>('decisions'), await tx.list<AgentRun>('runs'))).map(turn => turn.id)
      await tx.put(row('automationOccurrences', next))
      return next
    })
  }
  resume(origin: AutomationOrigin, conversationId: string, records: StoredRecord[], continuedByUser = false) {
    return this.store.transaction(async tx => { const o = await resumeAutomationExecution(tx, origin, conversationId, continuedByUser); for (const value of records) await tx.put(value); return o })
  }
  view() {
    return this.store.transaction(async tx => ({ definitions: await tx.list<AutomationDefinition>('automations'), occurrences: (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(o => !o.deletedAt) }))
  }

  creation(requestId?: string): Promise<AutomationDefinition | null> {
    if (!requestId) return Promise.resolve(null)
    return this.store.transaction(async tx => {
      const receipt = await tx.get<{ automationId: string }>('automationCreations', requestId)
      if (!receipt) return null
      const definition = await tx.get<AutomationDefinition>('automations', receipt.automationId)
      if (!definition || definition.deletedAt) throw new Error('此创建请求对应的计划已删除，不会重复创建；请开始新的草稿')
      return definition
    })
  }
  mutation(requestId: string, expected: { id: string; expectedRevision: number }) {
    return this.store.transaction(async tx => {
      const receipt = await tx.get<MutationReceipt>('automationMutations', requestId)
      if (!receipt) return
      const original = JSON.parse(receipt.fingerprint) as Partial<AutomationInput>
      if (original.id !== expected.id || original.expectedRevision !== expected.expectedRevision || original.enabled !== true) throw new Error('此恢复身份已用于不同请求，请核对原回执')
      return receipt.definition
    })
  }
  save(input: AutomationInput, authorizedFingerprint: string, creationSource?: AutomationCreationSource) {
    return this.store.transaction(async tx => {
      const fingerprint = JSON.stringify(input)
      if (input.requestId && input.id) {
        const receipt = await tx.get<MutationReceipt>('automationMutations', input.requestId)
        if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('此修改身份已用于不同内容，请核对原回执'); return receipt.definition }
      }
      if (input.requestId && !input.id) {
        const receipt = await tx.get<{ automationId: string }>('automationCreations', input.requestId)
        if (receipt) {
          const existing = await tx.get<AutomationDefinition>('automations', receipt.automationId)
          if (!existing || existing.deletedAt) throw new Error('此创建请求对应的计划已删除，不会重复创建；请开始新的草稿')
          return existing
        }
      }
      const prior = input.id ? await tx.get<AutomationDefinition>('automations', input.id) : undefined
      if (input.id && (!prior || prior.deletedAt)) throw new Error('定时任务不存在')
      if (prior && prior.revision !== input.expectedRevision) throw new Error('任务配置已变更，请刷新')
      const cron = automationCron(input), scheduleChanged = !!prior && (prior.cron !== cron || prior.timezone !== input.timezone || prior.startsOn !== input.startsOn || prior.frequency !== input.frequency)
      const policy = input.conversationPolicy ?? 'existing-conversation'
      const owner = input.owner ?? inferAutomationOwner(input, new Map((await tx.list<Conversation>('conversations')).map(item => [item.id, item])), new Set((await tx.list<DigitalAgent>('agents')).map(item => item.id)))
      if (!prior && owner?.kind === 'group' && creationSource) {
        const existing = (await tx.list<AutomationDefinition>('automations')).find(d => d.owner?.kind === 'group' && d.owner.conversationId === owner.conversationId && d.creationSource?.messageId === creationSource.messageId && d.creationSource.agentId !== creationSource.agentId)
        if (existing) throw new Error(`本条群消息已由另一员工创建计划 ${existing.id}，请读取原计划，不重复创建`)
      }
      const monitor = input.taskKind === 'monitor' ? monitorPolicySchema.parse(input.monitor) : undefined
      const monitorChanged = !!prior && ((prior.taskKind ?? 'report') !== (input.taskKind ?? 'report') || JSON.stringify(prior.monitor) !== JSON.stringify(monitor))
      const executionChanged = !!prior && (monitorChanged || prior.prompt !== input.prompt || prior.conversationId !== input.conversationId || prior.conversationPolicy !== policy || JSON.stringify(prior.owner) !== JSON.stringify(owner) || JSON.stringify(prior.collaboration) !== JSON.stringify(input.collaboration) || JSON.stringify(prior.employeeIds ?? []) !== JSON.stringify(input.employeeIds ?? []) || prior.authorizedFingerprint !== authorizedFingerprint)
      const { expectedRevision: _, requestId, ...fields } = input, now = timestamp()
      const notifications = notificationPolicy(input, prior)
      const d: AutomationDefinition = { ...prior, ...fields, schemaVersion: 1, id: prior?.id ?? randomUUID(), revision: (prior?.revision ?? 0) + 1,
        creationSource: prior?.creationSource ?? creationSource,
        executionRevision: (prior?.executionRevision ?? 1) + Number(executionChanged), scheduleGeneration: (prior?.scheduleGeneration ?? 1) + Number(scheduleChanged),
        scheduleEffectiveAt: !prior || scheduleChanged || (!prior.enabled && input.enabled) ? now : prior.scheduleEffectiveAt,
        owner, collaboration: input.collaboration, taskKind: input.taskKind ?? 'report', monitor, conversationPolicy: policy, conversationId: input.conversationId, employeeIds: input.employeeIds, daysOfWeek: scheduleDays(input), notificationPolicy: notifications, notify: notifications !== 'muted', cron, authorizedFingerprint,
        sync: 'pending', createdAt: prior?.createdAt ?? now, updatedAt: now }
      if (executionChanged || scheduleChanged || prior?.enabled !== d.enabled) delete d.legacyRevision
      delete d.syncError
      if (monitorChanged || prior && prior.authorizedFingerprint !== authorizedFingerprint) await tx.remove('automationMonitorCheckpoints', d.id)
      await tx.put(row('automations', d))
      if (!prior && requestId) await tx.put(row('automationCreations', { id: requestId, automationId: d.id, createdAt: now }))
      if (prior && requestId) await tx.put(row('automationMutations', { id: requestId, fingerprint, definition: d } satisfies MutationReceipt))
      return d
    })
  }

  pause(id: string, deleted = false, request?: { requestId: string; expectedRevision: number }) {
    return this.store.transaction(async tx => {
      const fingerprint = JSON.stringify({ id, deleted, expectedRevision: request?.expectedRevision })
      if (request) {
        const receipt = await tx.get<MutationReceipt>('automationMutations', request.requestId)
        if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('此操作身份已用于不同请求'); return receipt.definition }
      }
      const d = await tx.get<AutomationDefinition>('automations', id)
      if (!d || d.deletedAt) throw new Error('任务不存在')
      if (request && d.revision !== request.expectedRevision) throw new Error('任务配置已变更，请刷新后操作')
      d.enabled = false; d.revision++; d.updatedAt = timestamp(); d.sync = 'pending'; delete d.legacyRevision; delete d.syncError
      if (deleted) { d.deletedAt = timestamp(); await tx.remove('automationMonitorCheckpoints', d.id) }
      await tx.put(row('automations', d))
      if (request) await tx.put(row('automationMutations', { id: request.requestId, fingerprint, definition: d } satisfies MutationReceipt))
      return d
    })
  }

  acknowledgeSync(id: string, expectedRevision: number, error?: string) {
    return this.store.transaction(async tx => {
      const d = await tx.get<AutomationDefinition>('automations', id)
      if (!d || d.revision !== expectedRevision) return undefined
      d.scheduleId = `schedule_boai-${id}`
      if (error) { d.sync = 'error'; d.syncError = error }
      else { d.sync = 'synced'; d.appliedRevision = expectedRevision; d.syncedAt = timestamp(); delete d.syncError }
      await tx.put(row('automations', d)); return d
    })
  }

  claim(trigger: AutomationTrigger, validate: (definition: AutomationDefinition) => string | { reason: string; attention: 'authorization' } | undefined | Promise<string | { reason: string; attention: 'authorization' } | undefined>, prepareConversation?: (definition: AutomationDefinition, occurrence: AutomationOccurrence) => Promise<StoredRecord[]>) {
    if (!trigger.key || trigger.key.length > 300) throw new Error('无效触发身份')
    if (!Number.isSafeInteger(trigger.scheduledAt) || !Number.isFinite(new Date(trigger.scheduledAt).getTime())) throw new Error('无法验证调度触发时间')
    return this.store.transaction(async tx => {
      const d = await tx.get<AutomationDefinition>('automations', trigger.automationId)
      if (!d) throw new Error('任务不存在')
      const scheduled = trigger.source === 'schedule', slot = scheduled ? calendarSlot(trigger.scheduledAt, d.timezone) : undefined
      const generation = trigger.scheduleGeneration ?? d.scheduleGeneration
      const id = scheduled ? scheduleIdentity(d.id, generation, d.timezone, slot!) : manualIdentity(d.id, trigger.key)
      const aliases = scheduled ? [nativeAlias(trigger.key), id, historicalSlotAlias(d.id, d.timezone, slot!)] : [id]
      const existing = await this.existing(tx, aliases)
      if (existing) {
        if (scheduled) await this.alias(tx, nativeAlias(trigger.key), existing.id)
        return { created: false, occurrence: existing }
      }
      const now = timestamp()
      const o: AutomationOccurrence = { schemaVersion: 1, id, stateVersion: 1, automationId: d.id, revision: d.revision, executionRevision: d.executionRevision, scheduleGeneration: generation, ...(slot ? { logicalSlot: slot } : {}), name: d.name, source: trigger.source, taskKind: d.taskKind ?? 'report', scheduledFor: new Date(trigger.scheduledAt).toISOString(), admittedAt: now, startedAt: now, status: 'admitted', deliveryStatus: 'pending', conversationId: d.conversationPolicy === 'new-conversation' ? randomUUID() : d.conversationId!, runIds: [], resultMessageIds: [], usageIncomplete: true, ...(scheduled ? { nativeRunId: trigger.key } : { manualRequestId: trigger.key }) }
      if (d.owner) o.plan = structuredClone({ owner: d.owner, employeeIds: d.employeeIds ?? (await tx.get<Conversation>('conversations', d.conversationId!))?.agentIds ?? [], collaboration: d.collaboration })
      const stale = scheduled && (trigger.scheduleGeneration !== undefined ? trigger.scheduleGeneration !== d.scheduleGeneration || trigger.executionRevision !== d.executionRevision : trigger.revision !== d.revision && trigger.revision !== d.legacyRevision)
      let reason = d.deletedAt ? '任务已删除' : stale ? '旧版本触发已失效' : scheduled && !d.enabled ? '任务已暂停' : undefined
      if (!reason && scheduled) {
        reason = Date.now() - trigger.scheduledAt > AUTOMATION_MISFIRE_MS ? '超过 10 分钟补跑窗口'
          : trigger.scheduledAt > Date.now() + 60_000 ? '触发时刻在未来，未执行'
          : trigger.scheduledAt < Date.parse(d.scheduleEffectiveAt) ? '日程已修改或恢复；不补跑此前时刻'
          : !matchesSchedule(d, trigger.scheduledAt) ? '日历规则不匹配；夏令时跳过不存在的时间' : undefined
      }
      if (!reason) { const block = await validate(d); reason = typeof block === 'string' ? block : block?.reason; if (block && typeof block !== 'string') o.attentionReason = block.attention }
      const running = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => pendingOccurrence.has(item.status))
      if (!reason && running.some(item => item.automationId === d.id)) reason = '并发或等待上次处理，本次已跳过'
      if (!reason && running.some(item => item.conversationId === o.conversationId && activeOccurrence.has(item.status))) reason = '并发或会话忙碌，本次已跳过'
      if (!reason && running.filter(item => activeOccurrence.has(item.status)).length >= MAX_ACTIVE_AUTOMATIONS) reason = '并发容量已满，本次已跳过'
      if (reason) { o.status = 'skipped'; o.deliveryStatus = 'unknown'; o.reason = reason; o.finishedAt = now }
      if (!reason && d.conversationPolicy === 'new-conversation') {
        let records: StoredRecord[] = []
        try {
          if (!prepareConversation) throw new Error('独立任务聊天初始化不可用')
          records = await prepareConversation(d, o)
          const conversation = records.find(record => record.collection === 'conversations' && record.id === o.conversationId)
          if (!conversation) throw new Error('初始化未返回对应任务聊天')
        } catch (error) { reason = `任务聊天初始化失败：${String(error)}`; o.status = 'failed'; o.deliveryStatus = 'unknown'; o.reason = reason; o.finishedAt = now }
        // Database faults still roll back the whole admission, never commit half an initialized chat.
        if (!reason) for (const record of records) await tx.put(record)
      }
      await tx.put(row('automationOccurrences', o))
      await this.alias(tx, id, o.id)
      if (scheduled) await this.alias(tx, nativeAlias(trigger.key), o.id)
      let dispatch: AutomationDispatch | undefined
      if (!reason) {
        dispatch = { schemaVersion: 1, id, requestId: `automation-${id}`, status: 'pending', definition: structuredClone(d), origin: { kind: 'automation', automationId: d.id, occurrenceId: id, name: d.name, authorizedFingerprint: d.authorizedFingerprint } }
        const conversation = await tx.get<Conversation>('conversations', o.conversationId)
        const members = await Promise.all((conversation?.agentIds ?? []).map(id => tx.get<DigitalAgent>('agents', id)))
        if (members.some(member => isNativeBackend(member?.executionBackend))) o.budgetScope = members.every(member => isNativeBackend(member?.executionBackend)) ? 'native' : 'mixed'
        const budget = newWorkBudget(`automation-budget-${id}`, { origin: dispatch.origin!, conversationId: o.conversationId })
        o.budgetId = budget.id; o.budget = { maxModelCalls: budget.maxModelCalls, maxRuns: budget.maxRuns, maxOutputTokens: budget.maxOutputTokens, runs: budget.runs }
        await tx.put(row('workBudgets', budget)); await tx.put(row('automationOccurrences', o))
        await tx.put(row('automationDispatches', dispatch))
      }
      await queueAutomationNotice(tx, d, o)
      return { created: true, occurrence: o, dispatch }
    })
  }

  commitDispatch(id: string, message: Message, records: StoredRecord[]) {
    return this.store.transaction(async tx => {
      const o = await tx.get<AutomationOccurrence>('automationOccurrences', id), intent = await tx.get<AutomationDispatch>('automationDispatches', id)
      if (!o || o.status !== 'admitted' || intent?.status !== 'pending' || !intent.definition) throw new Error('本次投递已消费或中断，不会重新启动')
      const d = await tx.get<AutomationDefinition>('automations', o.automationId)
      if (!d || d.deletedAt || d.executionRevision !== intent.definition.executionRevision || d.authorizedFingerprint !== intent.definition.authorizedFingerprint) throw new Error('自动化执行配置已变化，请重新发起')
      if (message.origin?.occurrenceId !== id || message.conversationId !== o.conversationId || !message.turnId) throw new Error('自动化消息缺少匹配的来源或轮次')
      for (const value of records) await tx.put(value)
      o.messageId = message.id; o.turnId = message.turnId; o.status = 'running'; o.startedAt = timestamp(); o.stateVersion++
      intent.status = 'started'; intent.messageId = message.id; intent.turnId = message.turnId
      await tx.put(row('automationOccurrences', o)); await tx.put(row('automationDispatches', intent)); return o
    })
  }

  /** A deterministic check consumes its intent before reading, without inventing a model turn. */
  beginMonitor(id: string) {
    return this.store.transaction(async tx => {
      const o = await tx.get<AutomationOccurrence>('automationOccurrences', id), intent = await tx.get<AutomationDispatch>('automationDispatches', id)
      const d = o && await tx.get<AutomationDefinition>('automations', o.automationId)
      if (!o || o.status !== 'admitted' || o.cancellationRequestedAt || intent?.status !== 'pending' || !intent.definition || !d || d.deletedAt || d.taskKind !== 'monitor' || !d.monitor || d.executionRevision !== intent.definition.executionRevision || d.authorizedFingerprint !== intent.definition.authorizedFingerprint) throw new Error('监控未获得当前执行许可')
      const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
      if (!budget) throw new Error('监控缺少原始预算')
      checkWorkBudget(budget)
      o.status = 'running'; o.stateVersion++; o.taskKind = 'monitor'; intent.status = 'started'
      await tx.put(row('automationOccurrences', o)); await tx.put(row('automationDispatches', intent)); return o
    })
  }

  completeMonitor(id: string, stateVersion: number, read: AutomationMonitorRead) {
    return this.store.transaction(async tx => {
      const o = await tx.get<AutomationOccurrence>('automationOccurrences', id), intent = await tx.get<AutomationDispatch>('automationDispatches', id)
      const d = o && await tx.get<AutomationDefinition>('automations', o.automationId), policy = intent?.definition?.monitor
      if (!o || o.stateVersion !== stateVersion || o.status !== 'running' || o.cancellationRequestedAt || intent?.status !== 'started' || !policy || !d || d.deletedAt || d.taskKind !== 'monitor' || !d.monitor || d.executionRevision !== intent.definition!.executionRevision || d.authorizedFingerprint !== intent.definition!.authorizedFingerprint || monitorPolicyFingerprint(d.monitor) !== monitorPolicyFingerprint(policy)) throw new Error('监控配置或运行状态已变化，本次不推进检查点')
      const budget = o.budgetId && await tx.get<WorkBudget>('workBudgets', o.budgetId)
      if (!budget) throw new Error('监控缺少原始预算')
      checkWorkBudget(budget)
      const checkedAt = timestamp(), prior = await tx.get<AutomationMonitorCheckpoint>('automationMonitorCheckpoints', d.id)
      const { result, checkpoint } = compareMonitorObservation(policy, 'observation' in read ? read.observation : undefined, prior, { automationId: d.id, occurrenceId: o.id, checkedAt })
      if ('error' in read) result.reason = read.error.slice(0, 2000)
      else result.evidence = read.evidence
      o.monitor = result; o.status = result.outcome === 'data_error' ? 'failed' : 'completed'
      o.deliveryStatus = result.outcome === 'data_error' ? 'blocked' : result.outcome === 'no_change' ? 'no_change' : 'delivered'
      o.reason = result.reason; o.finishedAt = checkedAt; o.stateVersion++; o.modelCalls = 0; o.usageIncomplete = false
      o.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      intent.status = result.outcome === 'data_error' ? 'failed' : 'completed'
      if (checkpoint) await tx.put(row('automationMonitorCheckpoints', checkpoint))
      await tx.put(row('automationOccurrences', o)); await tx.put(row('automationDispatches', intent))
      await queueAutomationNotice(tx, d, o)
      return o
    })
  }

  updateOccurrence(id: string, stateVersion: number, patch: Partial<AutomationOccurrence>) {
    return this.store.transaction(async tx => {
      const o = await tx.get<AutomationOccurrence>('automationOccurrences', id)
      if (!o || o.stateVersion !== stateVersion) return undefined
      const next = { ...o, ...patch, id: o.id, stateVersion: o.stateVersion + 1 }
      await tx.put(row('automationOccurrences', next))
      await queueAutomationNotice(tx, await tx.get<AutomationDefinition>('automations', o.automationId), next)
      const intent = await tx.get<AutomationDispatch>('automationDispatches', id)
      if (intent?.status === 'pending' && !activeOccurrence.has(next.status)) { intent.status = 'failed'; await tx.put(row('automationDispatches', intent)) }
      return next
    })
  }

  recordUnaccountedTrigger(automationId: string, runId: string, time: number, triggerId?: string) {
    if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new Error('原生历史触发时间无法核对')
    return this.store.transaction(async tx => {
      const existing = await this.existing(tx, [nativeAlias(runId)])
      if (existing) return existing
      const d = await tx.get<AutomationDefinition>('automations', automationId)
      if (!d) return undefined
      const o: AutomationOccurrence = { schemaVersion: 1, id: nativeAlias(runId), stateVersion: 1, automationId, name: d.name, source: 'schedule', scheduledFor: new Date(time).toISOString(), startedAt: timestamp(), status: 'needs_review', deliveryStatus: 'unknown', usageIncomplete: true, conversationId: d.conversationId ?? '', runIds: [], resultMessageIds: [], nativeRunId: runId, ...(triggerId ? { nativeTriggerId: triggerId } : {}), reason: '发现原生触发但没有产品记录；执行版本未知，不会自动重放' }
      await tx.put(row('automationOccurrences', o)); await this.alias(tx, nativeAlias(runId), o.id)
      await queueAutomationNotice(tx, d, o)
      await this.alias(tx, historicalSlotAlias(d.id, d.timezone, calendarSlot(time, d.timezone)), o.id)
      return o
    })
  }

  recover() {
    return this.store.transaction(async tx => {
      const meta = await tx.get<{ id: string; root: string; restorePending?: boolean }>('automationRuntime', 'installation')
      const restored = !!meta && (meta.root !== this.dataPath || meta.restorePending)
      await recoverAutomationNotices(tx, !!restored)
      for (const o of await tx.list<AutomationOccurrence>('automationOccurrences')) if (pendingOccurrence.has(o.status)) {
        o.reason = o.status === 'admitted' ? '产品已受理但未完成投递；需明确继续，不会自动重发任务' : '应用重启；原任务不会自动重放'
        o.status = o.status === 'admitted' ? 'needs_review' : 'interrupted'; o.deliveryStatus = 'unknown'; o.finishedAt = timestamp(); o.stateVersion++
        await tx.put(row('automationOccurrences', o))
        if (!restored) await queueAutomationNotice(tx, await tx.get<AutomationDefinition>('automations', o.automationId), o)
      }
      for (const intent of await tx.list<AutomationDispatch>('automationDispatches')) if (intent.status === 'pending') { intent.status = 'interrupted'; await tx.put(row('automationDispatches', intent)) }
      if (restored) for (const checkpoint of await tx.list<AutomationMonitorCheckpoint>('automationMonitorCheckpoints')) await tx.remove('automationMonitorCheckpoints', checkpoint.id)
      if (restored) for (const d of await tx.list<AutomationDefinition>('automations')) {
        d.enabled = false; d.revision++; d.updatedAt = timestamp(); d.sync = 'pending'; delete d.legacyRevision
        await tx.put(row('automations', d))
      }
      await tx.put(row('automationRuntime', { id: 'installation', root: this.dataPath, restorePending: false }))
    })
  }
}
