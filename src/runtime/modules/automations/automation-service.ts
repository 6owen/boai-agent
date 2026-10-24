/*
 * [OUTPUT]: 取消自动化固定执行时限；旧时间预算取消仅由本人显式继续恢复，原occurrence、预算计账、容量与人工停止门禁保持。
 * [OUTPUT]: 员工人格行为复用原Mastra时钟与同一日程同步队列，原用户自动化定义和Work保持。
 * [OUTPUT]: 删除历史后移除内存/时限，旧手动请求明确拒绝、原周期触发只核对不重放。
 * [OUTPUT]: 恢复计划保留月日期/开始日期与描述，避免启停改写新日程。
 * [OUTPUT]: 六种创建频率共用保存协议；手动计划不注册周期时钟，旧时钟切手动时暂停。
 * [OUTPUT]: 恢复先核对原修改回执的计划ID和所见版本，旧身份不能用于其他恢复。
 * [OUTPUT]: 明确员工/群归属及分工校验；新归属默认隔离任务上下文，旧计划保留原策略。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 原生时钟与唯一账本保持；异步运行配置核对覆盖保存、受理、执行、监控与明确补充。
 * [INPUT]: 产品事务账本、原生日程适配器与宿主许可/消息投递。
 * [OUTPUT]: 固定原问题消息的接续提交保留其他未答轮次，并与原Work补充共用事务。
 * [OUTPUT]: 通讯录删除在宿主临界区暂停关联计划，定向终结关联等待并异步同步原生日程；稳定创建回执查询/重试与显式恢复；异步监控读取、提交前授权复核、停止待退出与无模型比较；全历史待处理计数与最近结束结果投影；预算追加后的计时器重排与旧期限回调隔离，系统时钟回拨不延长已启动时限；持久通知消费唤醒与预算停止原因；新任务聊天准备/授权、共享规则的纯日程预览和完整分页查询；指定 occurrence 的补充上下文与事务提交入口；原始预算期限与计算槽释放后的接续重查；有界配置同步、事务投递、跨工作结果汇总、停止待退出与重启证据核对；不自动重放业务。
 * [POS]: 自动化用例入口，SQLite 为权威，内存仅供活跃状态查询。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import { z } from 'zod'
import type { AutomationCreationSource, AutomationDefinition, AutomationInput, AutomationListQuery, AutomationOccurrence, AutomationsView, AutomationOrigin, AutomationMonitorRead } from '../../../shared/domain/automations'
import { automationNeedsAttention } from '../../../shared/domain/automations'
import type { Message } from '../../../shared/domain'
import { ProductStore, type RecordTransaction, type StoredRecord } from '../../adapters/storage/product-store'
import { NativeSchedules, AUTOMATION_WORKFLOW, type NativeAutomationVersion } from './native-schedules'
import { monitorPolicySchema } from './automation-monitor'
import { AutomationRepository } from './automation-repository'
import { automationCollaborationSchema, automationOwnerSchema } from './automation-plan'
import { activeOccurrence, pendingOccurrence, nextTimes, scheduleSchema, automationCron } from './schedule-policy'
export { calendarSlot, automationCron, nextTimes } from './schedule-policy'

export const automationInputSchema = scheduleSchema.extend({ owner: automationOwnerSchema.optional(), collaboration: automationCollaborationSchema.optional(), requestId: z.string().min(1).max(200).optional(), id: z.string().max(200).optional(), expectedRevision: z.number().int().positive().optional(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).optional(), prompt: z.string().trim().min(1).max(40000), conversationPolicy: z.enum(['existing-conversation', 'new-conversation']).optional(), conversationId: z.string().min(1).max(200).optional(), employeeIds: z.array(z.string().min(1).max(200)).min(1).max(12).optional(), enabled: z.boolean(), notify: z.boolean(), notificationPolicy: z.enum(['all_results', 'important_only', 'muted']).optional(), taskKind: z.enum(['report', 'monitor']).optional(), monitor: monitorPolicySchema.optional() }).strict()
export const automationSchema = automationInputSchema.transform(value => {
  const conversationPolicy = value.conversationPolicy ?? (value.owner && value.taskKind !== 'monitor' ? 'new-conversation' : 'existing-conversation')
  const employeeIds = value.employeeIds ?? (conversationPolicy === 'new-conversation' ? value.owner?.kind === 'employee' ? [value.owner.employeeId] : value.collaboration?.assignments.map(item => item.employeeId) : undefined)
  return { ...value, conversationPolicy, employeeIds }
}).superRefine((value, ctx) => {
  if (value.taskKind === 'monitor') {
    if (!value.monitor || value.conversationPolicy === 'new-conversation' || value.monitor.source.conversationId !== value.conversationId) ctx.addIssue({ code: 'custom', path: ['monitor'], message: '监控需指定聊天及该聊天已发布的 JSON 文件' })
  } else if (value.monitor) ctx.addIssue({ code: 'custom', path: ['monitor'], message: '报告任务不能包含监控规则' })
  if (value.conversationPolicy === 'new-conversation') {
    if (!value.employeeIds?.length || value.conversationId || !value.collaboration && value.employeeIds.length !== 1) ctx.addIssue({ code: 'custom', path: ['employeeIds'], message: '独立任务需选择一名员工或明确群分工，不能同时指定聊天' })
  } else if (!value.conversationId || value.employeeIds?.length) ctx.addIssue({ code: 'custom', path: ['conversationId'], message: '请选择目标会话；员工沿用会话成员' })
  if (value.employeeIds && new Set(value.employeeIds).size !== value.employeeIds.length) ctx.addIssue({ code: 'custom', path: ['employeeIds'], message: '参与员工不能重复' })
  if (value.owner?.kind === 'employee' && value.conversationPolicy === 'new-conversation' && (value.employeeIds?.length !== 1 || value.employeeIds[0] !== value.owner.employeeId)) ctx.addIssue({ code: 'custom', path: ['owner'], message: '员工计划必须由归属员工执行' })
  if (value.collaboration) {
    const members = value.collaboration.assignments.map(item => item.employeeId)
    if (value.owner?.kind !== 'group' || value.conversationPolicy !== 'new-conversation' || value.taskKind === 'monitor' || members.length !== value.employeeIds?.length || members.some(id => !value.employeeIds?.includes(id))) ctx.addIssue({ code: 'custom', path: ['collaboration'], message: '群分工须归属BOAI群、使用独立任务上下文且参与名单一致' })
  } else if (value.owner?.kind === 'group' && value.conversationPolicy === 'new-conversation') ctx.addIssue({ code: 'custom', path: ['collaboration'], message: '请选择群内参与员工及汇总负责人，保存明确分工' })
})
interface Hooks {
  behaviors?: Pick<import('./agent-behaviors').AgentBehaviorService, 'dispatch' | 'synchronize' | 'hasSchedules'>
  critical<T>(operation: () => Promise<T>): Promise<T>
  validate(target: string | AutomationInput): string | Promise<string>
  busy(conversationId: string): boolean
  prepareConversation?(definition: AutomationDefinition, occurrence: AutomationOccurrence): Promise<StoredRecord[]>
  dispatch(d: AutomationDefinition, o: AutomationOccurrence, origin: AutomationOrigin, commit: (message: Message, records: StoredRecord[]) => Promise<void>): Promise<Message>
  readMonitor?(definition: AutomationDefinition, signal: AbortSignal): Promise<AutomationMonitorRead>
  inspect(o: AutomationOccurrence): Partial<AutomationOccurrence> | undefined | Promise<Partial<AutomationOccurrence> | undefined>
  cancel(o: AutomationOccurrence, options?: { endWaiting: boolean }): Promise<void>
  changed(): void
  notify(): void
  capacityAvailable?(): void
}
const retryDelays = [1000, 3000, 10000]

export class AutomationService {
  private definitions = new Map<string, AutomationDefinition>()
  private occurrences = new Map<string, AutomationOccurrence>()
  private repository: AutomationRepository
  private native?: NativeSchedules
  private tail: Promise<unknown> = Promise.resolve()
  private monitors = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private retryTimer?: ReturnType<typeof setTimeout>
  private retryCount = 0
  private closing = false
  private backingUp = false
  private error?: string
  private observing = false
  private observeAgain = false
  constructor(private store: ProductStore, private dataPath: string, private hooks: Hooks) { this.repository = new AutomationRepository(store, dataPath) }
  hasActiveConversation(id: string) { return [...this.occurrences.values()].some(item => item.conversationId === id && activeOccurrence.has(item.status)) }
  forgetHistory(id: string) { this.occurrences.delete(id) }
  replaceHistory(occurrences: AutomationOccurrence[]) { for (const item of occurrences) this.occurrences.set(item.id, item) }
  private serialize<T>(fn: () => Promise<T>) { const next = this.tail.then(fn); this.tail = next.catch(() => {}); return next }
  private async refresh() {
    const view = await this.repository.view()
    this.definitions = new Map(view.definitions.map(d => [d.id, d])); this.occurrences = new Map(view.occurrences.map(o => [o.id, o]))
    return view
  }
  async init() {
    await this.repository.migrate(); await this.repository.migrateOwners(); await this.repository.recover(); await this.refresh()
    await this.hooks.critical(() => this.reconcile(true))
    if (this.definitions.size || await this.hooks.behaviors?.hasSchedules()) await this.synchronize()
  }
  async assertExecutable(origin: AutomationOrigin, conversationId: string) {
    if (await this.hooks.validate(conversationId) !== origin.authorizedFingerprint) throw new Error('自动化授权的员工或会话配置已变更')
    return this.repository.assertExecutable(origin, conversationId)
  }
  async replyContext(id: string) {
    const o = (await this.repository.view()).occurrences.find(o => o.id === id)
    if (!o?.messageId) throw new Error('本次运行的原始消息已不可用')
    return o
  }
  budgetRenewed(o: AutomationOccurrence) {
    this.occurrences.set(o.id, o)
  }
  /** Host critical section also covers the human reply and the newly acquired compute slot. */
  async reply(origin: AutomationOrigin, conversationId: string, expectedVersion: number, questionMessageId: string, records: StoredRecord[], commitQuestion?: (tx: RecordTransaction) => Promise<void>) {
    if (await this.hooks.validate(conversationId) !== origin.authorizedFingerprint) throw new Error('自动化授权的员工或会话配置已变更')
    const o = await this.repository.reply(origin, conversationId, expectedVersion, questionMessageId, records, commitQuestion)
    this.occurrences.set(o.id, o)
  }
  /** Called under the host critical section, with retry records committed in the same transaction. */
  async resume(origin: AutomationOrigin, conversationId: string, records: StoredRecord[], continuedByUser = false) {
    if (await this.hooks.validate(conversationId) !== origin.authorizedFingerprint) throw new Error('自动化授权的员工或会话配置已变更')
    const o = await this.repository.resume(origin, conversationId, records, continuedByUser)
    this.occurrences.set(o.id, o)
  }
  async synchronizeBehaviors() { return this.serialize(async () => { if (this.closing || this.backingUp) throw new Error('时钟正在退出或备份'); await this.ensureNative(); await this.hooks.behaviors?.synchronize(this.native!) }) }
  private async ensureNative() {
    if (this.native) return
    const native = new NativeSchedules(join(this.dataPath, 'automation-mastra.sqlite'), (id, revision, runId, time, version) => this.admit(id, revision, 'schedule', runId, time, version).then(() => {}), (input, runId, time) => this.hooks.behaviors?.dispatch(input, runId, time) ?? Promise.reject(new Error('行为服务未注册')))
    try {
      await native.init(); this.native = native
      const schedules = await native.mastra.schedules.list({ workflowId: AUTOMATION_WORKFLOW })
      await this.refresh()
      // Pause unknown ownership before starting any worker. Product tombstones remain authoritative.
      for (const schedule of schedules) {
        const d = [...this.definitions.values()].find(d => `schedule_boai-${d.id}` === schedule.id)
        if (!d || d.deletedAt) { await native.mastra.schedules.pause(schedule.id); continue }
        for await (const trigger of native.history(schedule.id)) {
          const runId = trigger.runId ?? `trigger:${schedule.id}:${trigger.id ?? trigger.scheduledFireAt}`
          await this.repository.recordUnaccountedTrigger(d.id, runId, trigger.scheduledFireAt, trigger.id)
        }
        if (schedule.lastRunId) {
          const prefix = `sched_${schedule.id}_`, suffix = schedule.lastRunId.startsWith(prefix) ? schedule.lastRunId.slice(prefix.length) : ''
          if (/^\d{13}$/.test(suffix)) await this.repository.recordUnaccountedTrigger(d.id, schedule.lastRunId, Number(suffix))
        }
      }
      for (const d of this.definitions.values()) await this.sync(d)
      await this.hooks.behaviors?.synchronize(native)
      await this.refresh(); await native.start()
    } catch (error) { this.native = undefined; await native.close().catch(() => {}); throw error }
  }
  private async sync(initial: AutomationDefinition) {
    if (!this.native) return
    let d = initial
    // A concurrent editor may advance the product revision during native I/O. Never acknowledge that stale projection.
    for (let attempt = 0; attempt < 3; attempt++) {
      let error: string | undefined
      try {
        const id = `schedule_boai-${d.id}`, existing = await this.native.mastra.schedules.get(id)
        const status = d.enabled && !d.deletedAt ? 'active' : 'paused'
        const inputData = { automationId: d.id, revision: d.revision, executionRevision: d.executionRevision, scheduleGeneration: d.scheduleGeneration }
        if (d.frequency === 'manual') { if (existing && existing.status !== 'paused') await this.native.mastra.schedules.pause(existing.id) }
        else if (!existing) await this.native.mastra.schedules.create({ id, workflowId: AUTOMATION_WORKFLOW, cron: d.cron, timezone: d.timezone, inputData, status })
        else if (existing.status !== status || existing.cron !== d.cron || existing.timezone !== d.timezone || JSON.stringify('inputData' in existing ? existing.inputData : null) !== JSON.stringify(inputData)) {
          // Supplying even an unchanged cron makes Mastra recompute nextFireAt and discard a retained due slot.
          await this.native.mastra.schedules.update(existing.id, { ...(existing.cron !== d.cron ? { cron: d.cron } : {}), ...(existing.timezone !== d.timezone ? { timezone: d.timezone } : {}), inputData, status })
        }
      } catch (cause) { error = String(cause) }
      const applied = await this.repository.acknowledgeSync(d.id, d.revision, error)
      if (applied) { this.definitions.set(applied.id, applied); return }
      const current = (await this.repository.view()).definitions.find(item => item.id === d.id)
      if (!current) return
      d = current
    }
    throw new Error('自动化配置持续变化，日程同步尚未完成')
  }
  private async synchronize(id?: string) {
    try {
      await this.ensureNative(); await this.refresh()
      for (const d of this.definitions.values()) if (d.id === id || d.sync !== 'synced' || d.appliedRevision !== d.revision) await this.sync(d)
      this.error = undefined
    } catch (error) {
      this.error = String(error)
      await this.refresh()
      for (const d of this.definitions.values()) if (d.id === id || d.sync !== 'synced') await this.repository.acknowledgeSync(d.id, d.revision, this.error)
    }
    await this.refresh()
    if (this.error || [...this.definitions.values()].some(d => d.sync !== 'synced')) this.scheduleRetry()
    this.hooks.notify()
  }
  private scheduleRetry() {
    if (this.closing || this.backingUp || this.retryTimer || this.retryCount >= retryDelays.length) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.serialize(async () => { if (this.closing || this.backingUp) return; await this.synchronize(); this.hooks.changed() }).catch(error => { this.error = String(error) })
    }, retryDelays[this.retryCount++])
    this.retryTimer.unref()
  }
  save(input: AutomationInput, authorize?: () => Promise<void>, creationSource?: AutomationCreationSource) {
    return this.serialize(async () => {
      if (this.closing || this.backingUp) throw new Error('调度服务正在关闭或备份')
      const value = automationSchema.parse(input)
      const d = await this.hooks.critical(async () => { await authorize?.(); return (!value.id ? await this.repository.creation(value.requestId) : null) ?? await this.repository.save(value, await this.hooks.validate(value), creationSource) })
      this.retryCount = 0; await this.synchronize(d.id); this.hooks.changed()
      const current = this.definitions.get(d.id)
      return structuredClone(current?.revision === d.revision ? current : d)
    })
  }
  creation(requestId: string) { return this.repository.creation(requestId) }
  async resumePlan(id: string, request?: { requestId: string; expectedRevision: number }, authorize?: () => Promise<void>) {
    if (request) { const prior = await this.hooks.critical(async () => { await authorize?.(); return this.repository.mutation(request.requestId, { id, expectedRevision: request.expectedRevision }) }); if (prior) return prior }
    const d = (await this.repository.view()).definitions.find(d => d.id === id && !d.deletedAt)
    if (!d) throw new Error('定时任务不存在')
    return this.save({ id, expectedRevision: request?.expectedRevision ?? d.revision, requestId: request?.requestId, owner: d.owner, collaboration: d.collaboration, name: d.name, description: d.description, prompt: d.prompt, conversationPolicy: d.conversationPolicy, conversationId: d.conversationId, employeeIds: d.employeeIds, frequency: d.frequency, startsOn: d.startsOn, dayOfMonth: d.dayOfMonth, time: d.time, weekday: d.weekday, daysOfWeek: d.daysOfWeek, timezone: d.timezone, enabled: true, notify: d.notify, notificationPolicy: d.notificationPolicy, taskKind: d.taskKind, monitor: d.monitor }, authorize)
  }
  pause(id: string, deleted = false, request?: { requestId: string; expectedRevision: number }, authorize?: () => Promise<void>) {
    return this.serialize(async () => {
      const definition = await this.hooks.critical(async () => { await authorize?.(); return this.repository.pause(id, deleted, request) })
      this.retryCount = 0; await this.synchronize(id); this.hooks.changed()
      return definition
    })
  }
  /** Called inside the host's mutation gate; native synchronization is queued without re-entering it. */
  async detachContacts(agentIds: string[], conversationIds: string[]) {
    const view = await this.repository.view()
    const affected = view.definitions.filter(d => !d.deletedAt && (d.employeeIds?.some(id => agentIds.includes(id)) || conversationIds.includes(d.conversationId ?? '') || d.owner?.kind === 'employee' && agentIds.includes(d.owner.employeeId) || d.owner?.kind === 'group' && conversationIds.includes(d.owner.conversationId)))
    const definitionIds = new Set(affected.map(d => d.id))
    const waiting = view.occurrences.filter(o => pendingOccurrence.has(o.status) && (definitionIds.has(o.automationId) || conversationIds.includes(o.conversationId)))
    if (waiting.some(o => activeOccurrence.has(o.status) || this.monitors.has(o.id))) throw new Error('关联自动化仍在执行或收尾，请先停止并等待结束后再删除')
    for (const definition of affected.filter(d => d.enabled)) await this.repository.pause(definition.id)
    for (const occurrence of waiting) {
      const saved = await this.repository.updateOccurrence(occurrence.id, occurrence.stateVersion, { status: 'cancelling', cancellationCause: 'user', cancellationRequestedAt: new Date().toISOString(), reason: '关联员工或群聊已删除，等待已终结' })
      if (!saved) throw new Error('关联自动化状态已变化，请重试删除')
      this.occurrences.set(saved.id, saved)
      await this.hooks.cancel(saved, { endWaiting: true })
      const ended = await this.repository.updateOccurrence(saved.id, saved.stateVersion, { status: 'cancelled', deliveryStatus: 'unknown', finishedAt: new Date().toISOString(), waitingTurnIds: [] })
      if (ended) this.occurrences.set(ended.id, ended)
    }
    if (!affected.length && !waiting.length) return
    await this.refresh()
    void this.serialize(async () => { await this.synchronize(); this.hooks.changed() }).catch(error => { this.error = String(error); this.hooks.changed() })
  }
  async view(): Promise<AutomationsView> {
    await this.tail; const { definitions, occurrences } = await this.refresh()
    const sorted = occurrences.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
    const latest = new Map<string, AutomationOccurrence>(), counts = new Map<string, number>()
    let attentionCount = 0
    for (const o of sorted) {
      const prior = latest.get(o.automationId)
      if (!prior || (o.finishedAt ?? o.startedAt) > (prior.finishedAt ?? prior.startedAt) || (o.finishedAt ?? o.startedAt) === (prior.finishedAt ?? prior.startedAt) && o.id > prior.id) latest.set(o.automationId, o)
      if (automationNeedsAttention(o)) { attentionCount++; counts.set(o.automationId, (counts.get(o.automationId) ?? 0) + 1) }
    }
    return structuredClone({ definitions: definitions.filter(d => !d.deletedAt).map(d => ({ ...d, nextTimes: d.enabled && d.sync === 'synced' ? nextTimes(d) : [], latestOccurrence: latest.get(d.id), attentionCount: counts.get(d.id) ?? 0 })), occurrences: sorted.slice(0, 300), attentionCount, available: !this.closing && !this.error, error: this.error })
  }
  run(id: string, requestId: string, authorize?: () => Promise<void>) { return this.admit(id, undefined, 'manual', requestId, Date.now(), undefined, authorize) }
  async list(query: AutomationListQuery) {
    const page = await this.store.queryAutomationDefinitions(query)
    return { ...page, definitions: page.definitions.map(d => ({ ...d, nextTimes: d.enabled && d.sync === 'synced' ? nextTimes(d) : [] })) }
  }
  async occurrence(id: string) { const page = await this.store.automationHistory({ id, limit: 1 }); if (!page.occurrences[0]) throw new Error('本次执行记录不存在'); return page.occurrences[0] }
  history(input: unknown) {
    const query = z.object({ automationId: z.string().min(1).max(200).optional(), attentionOnly: z.boolean().optional(), search: z.string().trim().max(200).optional(), status: z.enum(['all', 'active', 'completed', 'attention']).optional(), before: z.object({ startedAt: z.iso.datetime(), id: z.string().min(1).max(500) }).strict().optional(), limit: z.number().int().min(1).max(100).default(30) }).strict().parse(input)
    return this.store.automationHistory(query)
  }
  preview(input: unknown) { const parsed = scheduleSchema.safeParse(input); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请检查日程设置'); const value = parsed.data; return { nextTimes: nextTimes({ ...value, cron: automationCron(value) }) } }
  admit(id: string, revision: number | undefined, source: 'manual' | 'schedule', key: string, time: number, version?: NativeAutomationVersion, authorize?: () => Promise<void>) {
    return this.serialize(async () => {
      const result = await this.hooks.critical(async () => { await authorize?.(); return this.repository.claim({ automationId: id, revision, source, key, scheduledAt: time, ...version }, async d => {
        if (this.closing || this.backingUp) return '应用正在退出或备份'
        try { if (await this.hooks.validate(d) !== d.authorizedFingerprint) return { reason: '员工或会话权限已变更，请编辑保存任务后重新启用', attention: 'authorization' as const } } catch (error) { return { reason: String(error), attention: 'authorization' as const } }
        if (d.conversationId && this.hooks.busy(d.conversationId)) return '并发或会话忙碌，本次已跳过'
      }, this.hooks.prepareConversation) })
      let o = result.occurrence
      if (o.deletedAt) {
        if (source === 'manual') throw new Error('本次执行记录已删除，请发起新的运行')
        return structuredClone(o)
      }
      this.occurrences.set(o.id, o)
      if (!result.created) return structuredClone(o)
      const intent = result.dispatch
      if (intent?.definition && intent.origin) {
        try {
          if (intent.definition.taskKind === 'monitor') {
            if (!this.hooks.readMonitor) throw new Error('监控数据读取不可用')
            o = await this.hooks.critical(async () => {
              if (await this.hooks.validate(intent.definition!) !== intent.definition!.authorizedFingerprint) throw new Error('监控授权已变化')
              return this.repository.beginMonitor(o.id)
            })
            this.occurrences.set(o.id, o)
            const controller = new AbortController(), entry = { controller, task: Promise.resolve() }
            this.monitors.set(o.id, entry)
            entry.task = this.executeMonitor(o, intent.definition, controller.signal).catch(error => { this.error = String(error); this.observe() })
          } else {
            await this.hooks.dispatch(intent.definition, o, intent.origin, async (message, records) => {
              o = await this.repository.commitDispatch(o.id, message, records); this.occurrences.set(o.id, o)
            })
            if (o.status !== 'running') throw new Error('自动化消息未完成事务投递')
          }
        } catch (error) {
          o = await this.repository.updateOccurrence(o.id, o.stateVersion, { status: 'failed', deliveryStatus: 'unknown', reason: String(error), finishedAt: new Date().toISOString() }) ?? o
          this.occurrences.set(o.id, o)
        }
      }
      this.hooks.changed(); this.hooks.notify(); this.observe(); return structuredClone(o)
    })
  }
  private async executeMonitor(started: AutomationOccurrence, definition: AutomationDefinition, signal: AbortSignal) {
    let read: AutomationMonitorRead
    try { signal.throwIfAborted(); read = await this.hooks.readMonitor!(definition, signal) }
    catch (error) { read = { error: error instanceof Error ? error.message : String(error) } }
    await this.serialize(() => this.hooks.critical(async () => {
      // The reader has actually exited. A stop can now release its slot, never sooner.
      this.monitors.delete(started.id)
      await this.refresh()
      const current = this.occurrences.get(started.id)
      if (!current || !pendingOccurrence.has(current.status)) return
      let saved: AutomationOccurrence | undefined
      try {
        if (current.cancellationRequestedAt || this.closing) saved = await this.repository.updateOccurrence(current.id, current.stateVersion, { status: current.cancellationRequestedAt ? 'cancelled' : 'interrupted', deliveryStatus: 'unknown', reason: current.reason ?? '应用退出；监控不会自动重放', finishedAt: new Date().toISOString(), modelCalls: 0, usageIncomplete: false })
        else {
          if (await this.hooks.validate(definition) !== definition.authorizedFingerprint) throw new Error('监控授权已变化，本次不推进检查点')
          saved = await this.repository.completeMonitor(current.id, started.stateVersion, read)
        }
      } catch (error) {
        saved = await this.repository.updateOccurrence(current.id, current.stateVersion, { status: 'failed', deliveryStatus: 'unknown', reason: String(error), finishedAt: new Date().toISOString(), modelCalls: 0, usageIncomplete: false })
      }
      if (saved) this.occurrences.set(saved.id, saved)
      this.hooks.changed(); this.hooks.notify(); this.hooks.capacityAvailable?.()
    }))
  }

  observe() {
    if (this.closing) return
    if (this.observing) { this.observeAgain = true; return }
    this.observing = true
    void this.serialize(() => this.hooks.critical(() => this.reconcile())).catch(error => { this.error = String(error) }).finally(() => { this.observing = false; if (this.observeAgain) { this.observeAgain = false; this.observe() } })
  }
  private async reconcile(recovery = false) {
    await this.refresh()
    for (const o of this.occurrences.values()) {
        if (o.taskKind === 'monitor') {
          if (!pendingOccurrence.has(o.status) || this.monitors.has(o.id)) continue
          const saved = await this.repository.updateOccurrence(o.id, o.stateVersion, { status: o.cancellationRequestedAt ? 'cancelled' : 'needs_review', deliveryStatus: 'unknown', reason: o.reason ?? '监控读取已退出但结果未完成提交；需核对，不会自动重读', finishedAt: new Date().toISOString(), modelCalls: 0, usageIncomplete: false })
          if (saved) { this.occurrences.set(o.id, saved); this.hooks.changed(); this.hooks.notify(); this.hooks.capacityAvailable?.() }
          continue
        }
        if (!pendingOccurrence.has(o.status) && !(recovery && o.status === 'interrupted')) continue
        const update = await this.hooks.inspect(o)
        if (!update) continue
        // Only already committed, fully settled results can close a crash window. Never restart work here.
        if (recovery && update.status !== 'completed' && update.status !== 'cancelled') {
          update.status = o.status; update.finishedAt = o.finishedAt; update.reason = o.reason
          if (update.deliveryStatus === 'pending') update.deliveryStatus = 'unknown'
        }
        const next = { ...o, ...update }
        if (!pendingOccurrence.has(next.status) && next.deliveryStatus === 'pending') next.deliveryStatus = 'unknown'
        if (JSON.stringify(next) === JSON.stringify(o)) continue
        const saved = await this.repository.updateOccurrence(o.id, o.stateVersion, next)
        if (!saved) continue
        this.occurrences.set(o.id, saved)
        if (activeOccurrence.has(o.status) && !activeOccurrence.has(saved.status)) this.hooks.capacityAvailable?.()
        this.hooks.changed()
        this.hooks.notify()
    }
  }
  stop(id: string, reason = '用户停止本次执行', cause: 'user' | 'budget' = 'user', expectedDeadline?: number, request?: { authorize(): Promise<void>; expectedStateVersion: number }) {
    return this.serialize(async () => {
      await this.hooks.critical(async () => {
        await request?.authorize()
        await this.refresh(); const o = this.occurrences.get(id)
        if (!o || !pendingOccurrence.has(o.status) || cause === 'budget' && o.budgetScope) return
        if (request && o.status !== 'cancelling' && o.stateVersion !== request.expectedStateVersion) throw new Error('本次执行已变化，请读取最新记录后停止')
        // Late callbacks from the retired elapsed-time limit cannot stop a run.
        if (expectedDeadline !== undefined) return
        const saved = await this.repository.updateOccurrence(id, o.stateVersion, { status: 'cancelling', cancellationCause: o.cancellationCause ?? cause, cancellationRequestedAt: o.cancellationRequestedAt ?? new Date().toISOString(), reason })
        if (!saved) return
        this.occurrences.set(id, saved)
        if (saved.taskKind === 'monitor') this.monitors.get(id)?.controller.abort(new Error(reason))
        else await this.hooks.cancel(saved)
        await this.reconcile()
        this.hooks.changed()
      })
    })
  }
  async beforeBackup() {
    await this.tail; await this.refresh()
    if ([...this.occurrences.values()].some(o => activeOccurrence.has(o.status))) throw new Error('自动化正在执行，请先停止本次运行')
    this.backingUp = true; clearTimeout(this.retryTimer); this.retryTimer = undefined; await this.native?.stop()
  }
  async backup(path: string) { await this.native?.backup(join(path, 'automation-mastra.sqlite')) }
  async afterBackup() { this.backingUp = false; if (!this.closing) { await this.native?.start(); if ([...this.definitions.values()].some(d => d.sync !== 'synced')) this.scheduleRetry() } }
  async close() { this.closing = true; clearTimeout(this.retryTimer); for (const entry of this.monitors.values()) entry.controller.abort(new Error('应用正在退出')); await this.tail; await Promise.all([...this.monitors.values()].map(entry => entry.task)); await this.native?.close() }
}
