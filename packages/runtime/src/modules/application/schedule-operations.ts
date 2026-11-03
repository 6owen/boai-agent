/*
 * [INPUT]: Schedule facade and host-authenticated application actor.
 * [OUTPUT]: Thin automations CRUD/preview adapters with one public schema, explicit contract version and original domain receipt recovery.
 * [POS]: Application protocol adapter; business defaults, validation and persistence stay in the schedule module.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import type { Method, Methods } from '@boai/shared/ipc'
import { createScheduleSchema, listSchedulesSchema, previewScheduleSchema, scheduleMutationSchema, updateScheduleSchema } from '@boai/shared/domain/schedules'
import type { ScheduleApi, ScheduleContext } from '../automations/schedule-api'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
import { automationInputSchema } from '../automations/automation-service'
import { automationListSchema } from '../automations/automation-commands'
import { scheduleSchema } from '../automations/schedule-policy'

export function scheduleOperations(resolve: () => ScheduleApi | undefined, port: { request<K extends Method>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']> }): ApplicationOperation[] {
  const service = () => { const value = resolve(); if (!value) throw new ApplicationValidationError('CAPABILITY_UNAVAILABLE', '定时任务服务尚未就绪。'); return value }
  const operations: ApplicationOperation[] = [
    { name: 'automations.create', description: '保存一个单次或周期计划，不立即执行。employeeId默认当前员工（包括bobo），timezone默认当前用户时区。缺少明确提醒时间应先询问；成功回显实际时间与激活状态。', effect: 'write', input: createScheduleSchema, resultType: 'ScheduleView', exclusiveSource: true,
      execute: (input, key, actor) => {
        const context: ScheduleContext = actor.kind === 'owner' ? {} : { employeeId: actor.employeeId, ...(actor.kind === 'employee' ? { source: { agentId: actor.employeeId, conversationId: actor.conversationId, messageId: actor.messageId } } : {}) }
        return service().create(input, key!, context)
      }, recover: key => service().recover(key) },
    { name: 'automations.update', description: '修改原计划的实际变更字段，传id与当前expectedRevision；不重新创建、不立即执行。', effect: 'write', input: updateScheduleSchema, resultType: 'ScheduleView', execute: (input, key) => service().update(input, key!), recover: key => service().recoverMutation(key) },
    { name: 'automations.get', description: '读取计划、版本、业务时间、激活状态与下一次触发；不执行。', effect: 'read', input: z.object({ id: z.string().min(1).max(200) }).strict(), resultType: 'ScheduleView', execute: input => service().get(input.id) },
    { name: 'automations.list', description: '按employeeId列出定时计划；省略查看全部。只返回公开计划字段，不含内部员工任务。', effect: 'read', input: listSchedulesSchema, resultType: '{ definitions: ScheduleView[]; nextCursor?: object }', execute: input => service().list(input) },
    { name: 'automations.preview', description: '只读预览trigger的实际时间与时区；与创建共用时间规则，明确时间的创建无需强制先预览。', effect: 'read', input: previewScheduleSchema, resultType: '{ nextTimes: string[]; timezone: string }', execute: input => Promise.resolve(service().preview(input)) },
    ...(['pause', 'resume', 'delete'] as const).map(action => ({ name: `automations.${action}`, description: action === 'delete' ? '取消原计划未来触发，保留执行历史；不停止已经运行的执行。传id及当前expectedRevision。' : `${action === 'pause' ? '暂停未来触发' : '恢复未来触发；过期单次不能重新预约'}，传id及当前expectedRevision。`, effect: 'write' as const, input: scheduleMutationSchema, resultType: 'ScheduleView', execute: (input: z.infer<typeof scheduleMutationSchema>, key: string | undefined) => service().mutation(action, input.id, input.expectedRevision, key!), recover: (key: string) => service().recoverMutation(key) })),
  ]
  // Frozen whitelist for explicitly versioned old clients. Model discovery exposes only the business contract above.
  const legacyCreate = automationInputSchema.pick({ frequency: true, startsOn: true, dayOfMonth: true, time: true, weekday: true, daysOfWeek: true, timezone: true,
    owner: true, collaboration: true, name: true, description: true, prompt: true, conversationPolicy: true, conversationId: true, employeeIds: true,
    enabled: true, notify: true, notificationPolicy: true, taskKind: true, monitor: true }).extend({ frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']) })
  const lookup = z.object({ id: z.string().min(1).max(200) }).strict()
  const legacy: Record<string, NonNullable<ApplicationOperation['legacy']>> = {
    'automations.create': { input: legacyCreate, execute: (input, requestId) => port.request('saveAutomation', { ...input, requestId }), recover: key => service().recoverLegacy(key) },
    'automations.update': { input: legacyCreate.extend({ id: z.string().min(1).max(200), expectedRevision: z.number().int().positive() }), execute: (input, requestId) => port.request('saveAutomation', { ...input, requestId }), recover: key => service().recoverMutation(key, true) },
    'automations.get': { input: lookup, execute: input => port.request('getAutomation', input) },
    'automations.list': { input: automationListSchema.omit({ purpose: true }), execute: input => port.request('listOwnerAutomations', input) },
    'automations.preview': { input: scheduleSchema.omit({ onceAt: true }).extend({ frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']) }), execute: input => port.request('previewAutomation', input) },
    'automations.pause': { input: lookup, execute: input => port.request('pauseAutomation', input) },
    'automations.resume': { input: lookup, execute: input => port.request('resumeAutomation', input) },
    'automations.delete': { input: lookup, execute: input => port.request('deleteAutomation', input) },
  }
  return operations.map(operation => ({ ...operation, contractVersion: 2, legacy: legacy[operation.name] }))
}
