/*
 * [INPUT]: 明确员工/群归属、保存的分工与当前持久聊天/员工身份。
 * [OUTPUT]: 分工依赖校验、保守旧归属推导与负责人可读的固定任务指令；不启动工作或调用模型。
 * [POS]: 自动化领域规则，共用现有Work执行而不建立另一套工作流引擎。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import type { Conversation } from '@boai/shared/domain'
import type { AutomationDefinition, AutomationInput, AutomationOwner } from '@boai/shared/domain/automations'

const id = z.string().min(1).max(200)
export const automationOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('employee'), employeeId: id }).strict(),
  z.object({ kind: z.literal('group'), conversationId: id }).strict(),
])
export const automationCollaborationSchema = z.object({
  coordinatorId: id,
  assignments: z.array(z.object({ employeeId: id, instruction: z.string().trim().min(1).max(2000), deliverable: z.string().trim().min(1).max(2000), dependsOn: z.array(id).max(11) }).strict()).min(2).max(12),
}).strict().superRefine((plan, ctx) => {
  const assignments = new Map(plan.assignments.map(item => [item.employeeId, item]))
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (assignments.size !== plan.assignments.length) invalid('每名参与员工只能有一项分工')
  if (!assignments.has(plan.coordinatorId)) invalid('汇总负责人必须有明确分工')
  for (const assignment of plan.assignments) {
    if (new Set(assignment.dependsOn).size !== assignment.dependsOn.length) invalid('分工依赖不能重复')
    if (assignment.dependsOn.some(value => value === assignment.employeeId || !assignments.has(value))) invalid('分工不能依赖自己或未参与的员工')
  }
  const visiting = new Set<string>(), visited = new Set<string>()
  function visit(employeeId: string): boolean {
    if (visiting.has(employeeId)) return false
    if (visited.has(employeeId)) return true
    visiting.add(employeeId)
    for (const dependency of assignments.get(employeeId)?.dependsOn ?? []) if (!visit(dependency)) return false
    visiting.delete(employeeId); visited.add(employeeId); return true
  }
  for (const employeeId of assignments.keys()) if (!visit(employeeId)) { invalid('分工依赖不能成环'); return }
  const required = new Set<string>()
  function include(employeeId: string) { if (required.has(employeeId)) return; required.add(employeeId); for (const dependency of assignments.get(employeeId)?.dependsOn ?? []) include(dependency) }
  include(plan.coordinatorId)
  if ([...assignments.keys()].some(employeeId => !required.has(employeeId))) invalid('每项分工都必须直接或间接参与最终汇总')
})

/** Never infer a BOAI group from channel, core, deleted or internal task contexts. */
export function inferAutomationOwner(input: Pick<AutomationInput, 'conversationPolicy' | 'conversationId' | 'employeeIds'>, conversations: ReadonlyMap<string, Conversation>, employeeIds: ReadonlySet<string>): AutomationOwner | undefined {
  if (input.conversationPolicy === 'new-conversation') {
    return input.employeeIds?.length === 1 && employeeIds.has(input.employeeIds[0]) ? { kind: 'employee', employeeId: input.employeeIds[0] } : undefined
  }
  const conversation = conversations.get(input.conversationId ?? '')
  if (!conversation || conversation.channel || conversation.mergedInto || conversation.purpose && conversation.purpose !== 'personal' || !conversation.agentIds.length || conversation.agentIds.some(id => !employeeIds.has(id))) return undefined
  if (conversation.kind === 'group') return { kind: 'group', conversationId: conversation.id }
  return conversation.agentIds.length === 1 ? { kind: 'employee', employeeId: conversation.agentIds[0] } : undefined
}

export function automationDispatchPrompt(definition: AutomationDefinition): string {
  if (!definition.collaboration) return definition.prompt
  return `${definition.prompt}\n\n本次自动化的固定分工（员工ID为身份，依赖仅指本次运行）：\n${JSON.stringify(definition.collaboration)}\ncoordinatorId对应的员工是唯一汇总负责人；其他员工只执行自己已认领的分工。负责人沿上述依赖顺序用delegate_work登记其他员工的工作，依赖必须引用本次工具返回的真实工作ID和结果版本；不要猜ID，不重复创建。随后用wait_for_work等待你所需的真实结果。依赖就绪后再完成你的分工和最终交付；失败或未知不得用旧结果冒充本次成功。不要在群中广播重新开工。`
}
