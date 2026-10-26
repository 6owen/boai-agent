/*
 * [INPUT]: 固定 bobo 的原组织工作、严格方案与宿主能力回调。
 * [OUTPUT]: 有界通讯录发现与真实组织回执；工具不能自选模式、预算、身份或材料授权。
 * [POS]: 仅 core task/组织阶段的 Mastra 产品工具，群内成员不获取管理权限。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createTool } from '@mastra/core/tools'
import type { EngineContext } from '../../contracts'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { boboCollaborationPlanSchema, employeeCandidateQuerySchema } from '@boai/shared/domain/bobo-collaboration'

export function createBoboOrganizationTools(context: EngineContext) {
  if (!isCoreAgent(context.agent) || context.conversation.purpose !== 'core' || !context.work?.organization || !context.organizeCollaboration || context.responseKind !== 'task') throw new Error('当前不是获准的 bobo 组织工作')
  return {
    find_employees: createTool({
      id: 'find_employees',
      description: 'Find reusable saved employees by name or role. Returns bounded actual IDs, configuration versions and bound capabilities. Use the next cursor for more results. Do not invent existing identities or read their private chats. Prefer suitable existing employees; create only missing roles.',
      inputSchema: employeeCandidateQuerySchema,
      execute: async query => {
        context.signal.throwIfAborted()
        if (!context.findEmployees) throw new Error('员工发现权限未接通')
        return context.findEmployees(employeeCandidateQuerySchema.parse(query))
      },
    }),
    organize_collaboration: createTool({
      id: 'organize_collaboration',
      description: 'Publish the exact employee creation or group organization authorized by this original work. Existing employee references require actual IDs and versions from find_employees; only missing roles become new employees. For a group, provide groupTitle and a concise announcement in your own voice stating the approved goal, each person’s responsibilities and expected results. Share only necessary approved context. The host controls employee_creation, organize_only or organize_and_execute; this tool cannot change that mode. A committed receipt proves organization only, not group business delivery. The original core chat remains. Never repeat an uncertain publication or create hidden subagents.',
      inputSchema: boboCollaborationPlanSchema,
      execute: async (plan, execution) => {
        context.signal.throwIfAborted()
        const toolCallId = execution?.agent?.toolCallId
        if (!toolCallId) throw new Error('组织操作缺少真实模型工具调用身份')
        await context.beforeEffect?.(); context.signal.throwIfAborted()
        const receipt = await context.organizeCollaboration!(boboCollaborationPlanSchema.parse(plan), toolCallId)
        if (receipt.status === 'committed') await context.afterEffect?.()
        return receipt
      },
    }),
  }
}
