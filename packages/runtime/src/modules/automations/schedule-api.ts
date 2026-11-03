/*
 * [INPUT]: Shared schedule business commands, original AutomationService/store and trusted caller defaults.
 * [OUTPUT]: One public schedule facade; legacy IPC uses the same domain service, tools never receive internal task fields.
 * [POS]: Schedule application boundary; no model invocation, new clock or business execution loop.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { AutomationCreationSource, AutomationDefinition, AutomationInput } from '@boai/shared/domain/automations'
import { createScheduleSchema, listSchedulesSchema, parseSchedule, previewScheduleSchema, ScheduleError, updateScheduleSchema, type ScheduleTrigger, type ScheduleView } from '@boai/shared/domain/schedules'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { AutomationService } from './automation-service'
import type { DigitalAgent } from '@boai/shared/domain'
import { normalizeSchedule, nextTimes } from './schedule-policy'

export interface ScheduleContext { employeeId?: string; source?: AutomationCreationSource }
export class ScheduleApi {
  constructor(private store: ProductStore, private service: AutomationService, private hooks: { validate(): Promise<void>; prepareEmployee(id: string): Promise<void> }) {}
  private zone() { return Intl.DateTimeFormat().resolvedOptions().timeZone }
  private async employee(id: string) {
    const employee = await this.store.get<DigitalAgent>('agents', id)
    if (!employee) throw new ScheduleError('NOT_FOUND', '执行员工不存在。', ['employeeId'])
    if (!employee.active) throw new ScheduleError('FORBIDDEN', '执行员工已停用。', ['employeeId'])
    if (employee.executionBackend?.kind === 'acp-local') throw new ScheduleError('UNSUPPORTED_SCHEDULE', '该员工执行方式尚不支持定时计划。', ['employeeId'])
    return employee
  }
  private schedule(trigger: ScheduleTrigger, zone = this.zone()): Pick<AutomationInput, 'frequency' | 'startsOn' | 'time' | 'weekday' | 'daysOfWeek' | 'dayOfMonth' | 'timezone' | 'onceAt'> {
    const timezone = 'timezone' in trigger ? trigger.timezone ?? zone : zone
    return normalizeSchedule({ frequency: trigger.kind, time: 'time' in trigger ? trigger.time : trigger.kind === 'hourly' ? `00:${String(trigger.minute).padStart(2, '0')}` : '00:00', weekday: trigger.kind === 'weekly' ? trigger.daysOfWeek[0] : 0,
      timezone, startsOn: trigger.kind === 'once' ? trigger.date : 'startsOn' in trigger ? trigger.startsOn : undefined,
      daysOfWeek: trigger.kind === 'weekly' ? [...new Set(trigger.daysOfWeek)].sort() : undefined, dayOfMonth: trigger.kind === 'monthly' ? trigger.dayOfMonth : undefined })
  }
  private trigger(d: AutomationDefinition): ScheduleTrigger {
    const calendar = { timezone: d.timezone, ...(d.startsOn ? { startsOn: d.startsOn } : {}) }
    switch (d.frequency) {
      case 'manual': return { kind: 'manual' }
      case 'once': return { kind: 'once', date: d.startsOn!, time: d.time, timezone: d.timezone }
      case 'hourly': return { kind: 'hourly', minute: Number(d.time.slice(-2)), ...calendar }
      case 'daily': return { kind: 'daily', time: d.time, ...calendar }
      case 'weekly': return { kind: 'weekly', daysOfWeek: d.daysOfWeek ?? [d.weekday], time: d.time, ...calendar }
      case 'monthly': return { kind: 'monthly', dayOfMonth: d.dayOfMonth ?? Number(d.startsOn?.slice(8) ?? 1), time: d.time, ...calendar }
    }
  }
  view(d: AutomationDefinition): ScheduleView {
    const times = d.enabled && !d.deletedAt && d.sync === 'synced' ? nextTimes(d) : []
    return { id: d.id, revision: d.revision, name: d.name, instruction: d.prompt, employeeId: d.owner?.kind === 'employee' ? d.owner.employeeId : undefined,
      ...((d.owner?.kind !== 'employee' || d.taskKind === 'monitor' || d.conversationPolicy === 'existing-conversation') ? { legacy: true } : {}),
      trigger: this.trigger(d), enabled: d.enabled, notification: d.notificationPolicy, activation: d.sync === 'synced' ? 'ready' : d.sync === 'error' ? 'failed' : 'pending',
      state: d.deletedAt ? 'deleted' : d.onceConsumedAt ? 'finished' : !d.enabled ? 'paused' : d.sync === 'error' ? 'needs_attention' : d.sync === 'pending' ? 'activating' : 'scheduled',
      nextTimes: times, nextTriggerAt: times[0], ...(d.syncError ? { activationError: '调度尚未激活，请检查执行员工配置并核对该计划。' } : {}), lastOccurrenceId: d.onceOccurrenceId }
  }
  private async definition(id: string) {
    await this.hooks.validate()
    const d = await this.store.get<AutomationDefinition>('automations', id)
    if (!d || d.deletedAt || d.purpose) throw new ScheduleError('NOT_FOUND', '定时计划不存在。')
    return d
  }
  async get(id: string) { return this.view(await this.definition(id)) }
  async list(raw: unknown) {
    await this.hooks.validate()
    const query = parseSchedule(listSchedulesSchema, raw)
    const page = await this.service.list({ ...(query.employeeId ? { owner: { kind: 'employee', employeeId: query.employeeId } } : {}), before: query.before, limit: query.limit })
    return { definitions: page.definitions.map(d => this.view(d)), nextCursor: page.nextCursor }
  }
  preview(raw: unknown) {
    const value = parseSchedule(previewScheduleSchema, raw), schedule = this.schedule(value.trigger)
    if (schedule.frequency === 'once' && Date.parse(schedule.onceAt!) <= Date.now()) throw new ScheduleError('PAST_TRIGGER_TIME', '单次定时时间已过，请选择新的未来时间。', ['trigger'])
    return { ...this.service.preview(schedule), timezone: schedule.timezone }
  }
  async create(raw: unknown, requestId: string, context: ScheduleContext = {}) {
    const input = parseSchedule(createScheduleSchema, raw), fingerprint = JSON.stringify(input)
    await this.hooks.validate()
    const prior = await this.service.creation(requestId, fingerprint)
    if (prior) return this.view(prior)
    const employeeId = input.employeeId ?? context.employeeId
    if (!employeeId) throw new ScheduleError('MISSING_FIELD', '请选择执行员工，或在该员工的本人会话中创建。', ['employeeId'])
    await this.employee(employeeId)
    const schedule = this.schedule(input.trigger)
    if (schedule.frequency === 'once' && Date.parse(schedule.onceAt!) <= Date.now()) throw new ScheduleError('PAST_TRIGGER_TIME', '单次定时时间已过，请选择新的未来时间。', ['trigger'])
    await this.hooks.prepareEmployee(employeeId)
    const notification = input.notification ?? 'all_results'
    const saved = await this.service.save({ ...schedule, name: input.name ?? input.instruction.split('\n')[0].slice(0, 100), prompt: input.instruction, owner: { kind: 'employee', employeeId },
      conversationPolicy: 'new-conversation', employeeIds: [employeeId], enabled: input.enabled ?? true, notify: notification !== 'muted', notificationPolicy: notification, requestId }, this.hooks.validate, context.source, fingerprint)
    return this.view(saved)
  }
  async update(raw: unknown, requestId: string) {
    const input = parseSchedule(updateScheduleSchema, raw), d = await this.definition(input.id)
    if (d.revision !== input.expectedRevision) throw new ScheduleError('REVISION_CONFLICT', '任务配置已变更，请读取最新版本。')
    if (input.employeeId && d.owner?.kind !== 'employee') throw new ScheduleError('UNSUPPORTED_SCHEDULE', '旧群计划请从原定时页面修改归属。', ['employeeId'])
    if (input.employeeId) { await this.employee(input.employeeId); await this.hooks.prepareEmployee(input.employeeId) }
    const schedule = input.trigger ? this.schedule(input.trigger, d.timezone) : { frequency: d.frequency, startsOn: d.startsOn, time: d.time, weekday: d.weekday, daysOfWeek: d.daysOfWeek, dayOfMonth: d.dayOfMonth, timezone: d.timezone, onceAt: d.onceAt }
    return this.view(await this.service.save({ ...schedule, id: d.id, expectedRevision: input.expectedRevision, requestId, name: input.name ?? d.name, prompt: input.instruction ?? d.prompt, description: d.description,
      owner: input.employeeId ? { kind: 'employee', employeeId: input.employeeId } : d.owner, employeeIds: input.employeeId ? [input.employeeId] : d.employeeIds, collaboration: d.collaboration,
      conversationPolicy: d.conversationPolicy, conversationId: d.conversationId, taskKind: d.taskKind, monitor: d.monitor,
      enabled: input.enabled ?? d.enabled, notify: (input.notification ?? d.notificationPolicy) !== 'muted', notificationPolicy: input.notification ?? d.notificationPolicy }, this.hooks.validate))
  }
  async mutation(action: 'pause' | 'resume' | 'delete', id: string, expectedRevision: number, requestId: string) {
    await this.definition(id)
    const request = { requestId, expectedRevision }
    return this.view(await (action === 'resume' ? this.service.resumePlan(id, request, this.hooks.validate) : this.service.pause(id, action === 'delete', request, this.hooks.validate)))
  }
  async recover(requestId: string) {
    await this.hooks.validate()
    const d = await this.service.creation(requestId, undefined, true)
    return d ? this.view(d) : undefined
  }
  async recoverMutation(requestId: string, legacy = false) {
    await this.hooks.validate()
    const original = await this.service.mutationResult(requestId)
    if (!original) return undefined
    const current = await this.store.get<AutomationDefinition>('automations', original.id)
    const result = current?.revision === original.revision ? current : original
    return legacy ? result : this.view(result)
  }
  async recoverLegacy(requestId: string) { await this.hooks.validate(); return await this.service.creation(requestId, undefined, true) ?? undefined }
  /** Existing page/CLI payloads retain their shape but share the same complete validation and write service. */
  async saveLegacy(input: AutomationInput, authorize?: () => Promise<void>, source?: AutomationCreationSource) {
    await this.hooks.validate(); await authorize?.()
    const employeeId = input.owner?.kind === 'employee' ? input.owner.employeeId : input.employeeIds?.length === 1 ? input.employeeIds[0] : undefined
    if (employeeId && !input.purpose) await this.hooks.prepareEmployee(employeeId)
    return this.service.save(input, async () => { await this.hooks.validate(); await authorize?.() }, source)
  }
}
