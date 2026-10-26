/*
 * [OUTPUT]: employeeId仅用于专用创建入口选归属；群内负责人沿collaboration.coordinatorId，误填时给出删除字段的纠错而不放松归属校验。
 * [OUTPUT]: 专用bobo会话可按明确employeeId保存单员工计划；普通员工仍只能管理本归属。
 * [OUTPUT]: 模型工具目录使用标准对象根；执行仍由discriminated union逐动作严格校验。
 * [INPUT]: 当前员工对话的宿主授权、原自动化服务及稳定用户消息身份。
 * [OUTPUT]: API/本机共用计划管理工具协议，真实保存/修改/状态回执；不使用独立草稿模型。
 * [POS]: 自动化对话入口合同，owner由宿主决定而不由模型猜测。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { automationInputSchema } from './automation-service'
import { nextTimes } from './schedule-policy'
import { automationOwnerSchema } from './automation-plan'
import { createHash } from 'node:crypto'
import type { AutomationCreationSource, AutomationDefinition, AutomationOccurrence, AutomationOwner } from '@boai/shared/domain/automations'
import type { AutomationService } from './automation-service'
import type { ProductStore } from '../../adapters/storage/product-store'

const id = z.string().min(1).max(200)
const targetEmployeeId = id.describe('Only selects the owner in the dedicated bobo scheduled-task creation conversation. Omit in an existing employee/group conversation: the host fixes that owner. For group leadership use plan.collaboration.coordinatorId, never employeeId.')
const key = z.string().trim().min(1).max(100)
const cursor = z.object({ updatedAt: z.iso.datetime(), id }).strict()
export const automationListSchema = z.object({ owner: automationOwnerSchema.optional(), before: cursor.optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
export const automationCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), before: cursor.optional(), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  z.object({ action: z.literal('get'), id }).strict(),
  z.object({ action: z.literal('save'), key, employeeId: targetEmployeeId.optional(), plan: automationInputSchema.omit({ requestId: true, owner: true, conversationId: true, employeeIds: true }) }).strict(),
  z.object({ action: z.enum(['pause', 'resume', 'delete']), id, expectedRevision: z.number().int().positive(), key }).strict(),
  z.object({ action: z.literal('run'), id, key }).strict(),
  z.object({ action: z.literal('stop'), id, occurrenceId: id, expectedStateVersion: z.number().int().positive(), key }).strict(),
])
// Provider tool directories require an object root. Keep the execution union
// authoritative: unrelated fields are still rejected by automationCommandSchema.
export const automationCommandToolSchema = z.object({
  action: z.enum(['list', 'get', 'save', 'pause', 'resume', 'delete', 'run', 'stop']),
  before: cursor.optional(), limit: z.number().int().min(1).max(50).optional(),
  id: id.optional(), key: key.optional(), employeeId: targetEmployeeId.optional(),
  plan: automationInputSchema.omit({ requestId: true, owner: true, conversationId: true, employeeIds: true }).optional(),
  expectedRevision: z.number().int().positive().optional(), occurrenceId: id.optional(),
  expectedStateVersion: z.number().int().positive().optional(),
}).strict()
export type AutomationCommand = z.infer<typeof automationCommandSchema>
export const automationToolDescription = 'Manage BOAI automation plans. In the dedicated bobo scheduled-task conversation, save requires employeeId from the supplied employee directory and creates a single-employee plan; elsewhere omit employeeId because the host already fixes the current employee/group owner. A group coordinator is plan.collaboration.coordinatorId, not employeeId. An owner-field rejection is an argument error: remove employeeId and preserve the same key, do not change ownership or ask the user to re-authorize the same group. Use list/get to inspect actual IDs, revisions and history. Save only when the current user explicitly asks to create or change a plan; discussion of a possible plan is a draft, not permission to enable it. Ask for missing schedule/scope/coordinator details. Use one stable key per user intent, including repeated calls; never change it to bypass an unknown receipt. Edits require the actual expectedRevision. A group plan needs saved assignments with exact current member IDs, dependencies and a coordinator. New plans use isolated task contexts. Do not create cron jobs or timers yourself. Only the returned persisted definition proves a plan exists. Report its schedule/timezone, owner, participation and next execution plainly.'

export function automationCommands(service: AutomationService, store: ProductStore, authority: { owner?: AutomationOwner; source: AutomationCreationSource; validate(): Promise<void> }) {
  const authorize = async (definitionId?: string) => {
    await authority.validate()
    if (!definitionId) return
    const definition = await store.get<AutomationDefinition>('automations', definitionId)
    if (!definition || (authority.owner ? JSON.stringify(definition.owner) !== JSON.stringify(authority.owner) : definition.owner?.kind !== 'employee')) throw new Error('此计划不属于当前员工或群，请回到归属对话管理')
    return definition
  }
  return async (raw: AutomationCommand): Promise<unknown> => {
    const input = automationCommandSchema.parse(raw)
    const definitionId = input.action === 'save' ? input.plan.id : input.action === 'list' ? undefined : input.id
    const definition = await authorize(definitionId)
    if (input.action === 'list') {
      const result = await service.list({ owner: authority.owner, before: input.before, limit: input.limit })
      if (!authority.owner) result.definitions = result.definitions.filter(d => d.owner?.kind === 'employee')
      await authorize(); return result
    }
    if (input.action === 'get') {
      const history = await service.history({ automationId: input.id, limit: 30 })
      await authorize(input.id); return { definition, history }
    }
    const requestId = 'automation-command-' + createHash('sha256').update(JSON.stringify([authority.source.messageId, authority.owner, input.action, definitionId ?? null, input.key])).digest('hex')
    const validate = async () => { await authorize(definitionId) }
    if (input.action === 'save') {
      if (authority.owner && input.employeeId && (authority.owner.kind !== 'employee' || input.employeeId !== authority.owner.employeeId)) throw new Error(authority.owner.kind === 'group' ? '不能更改当前计划归属：本计划由宿主固定归属当前群。请删除 employeeId，负责人填写 plan.collaboration.coordinatorId；保持同一 key 后重试。' : '不能更改当前计划归属：请省略 employeeId，沿当前员工保存；如需其他员工，请到其对话或专用创建入口。')
      const owner = authority.owner ?? (definition?.owner?.kind === 'employee' ? definition.owner : input.employeeId ? { kind: 'employee' as const, employeeId: input.employeeId } : undefined)
      if (!owner || !authority.owner && (owner.kind !== 'employee' || owner.employeeId === authority.source.agentId || input.employeeId && input.employeeId !== owner.employeeId || input.plan.collaboration || input.plan.taskKind === 'monitor' || input.plan.conversationPolicy === 'existing-conversation')) throw new Error('请选择一名通讯录员工，以独立任务聊天执行')
      const conversationPolicy = input.plan.conversationPolicy ?? definition?.conversationPolicy ?? 'new-conversation'
      const conversationId = conversationPolicy === 'existing-conversation' ? definition?.conversationId ?? authority.source.conversationId : undefined
      const saved = await service.save({ ...input.plan, owner, conversationPolicy, conversationId, requestId }, validate, authority.source)
      return { ...saved, nextTimes: saved.enabled && saved.sync === 'synced' ? nextTimes(saved) : [] }
    }
    if (input.action === 'run') return service.run(input.id, requestId, validate)
    if (input.action === 'stop') {
      const validateOccurrence = async () => {
        await validate()
        const occurrence = await store.get<AutomationOccurrence>('automationOccurrences', input.occurrenceId)
        if (!occurrence || occurrence.automationId !== input.id) throw new Error('本次执行不属于所选计划')
      }
      await service.stop(input.occurrenceId, undefined, 'user', undefined, { authorize: validateOccurrence, expectedStateVersion: input.expectedStateVersion })
      return service.occurrence(input.occurrenceId)
    }
    const request = { requestId, expectedRevision: input.expectedRevision }
    if (input.action === 'resume') return service.resumePlan(input.id, request, validate)
    return service.pause(input.id, input.action === 'delete', request, validate)
  }
}
