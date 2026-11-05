/*
 * [INPUT]: Existing employee assignments, their actual executions and host-authorized output evidence.
 * [OUTPUT]: Bounded live task activity shared by employee main-chat context and application tools.
 * [POS]: Read model only; no task creation, scheduling or memory duplication.
 * [PROTOCOL]: Update Header and application/.folder.md on change.
 */
import { z } from 'zod'
import type { Message } from '@boai/shared/domain'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { AutomationOccurrence } from '@boai/shared/domain/automations'
import type { TrackedTaskListItem, TrackedTaskPage } from '@boai/shared/domain/tracked-tasks'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
import { taskPageOperation, taskPageQuery } from './task-page'

export type TaskOutputs = (tasks: TrackedTaskListItem[], actor: ApplicationActor) => Promise<Map<string, Pick<Message, 'id' | 'conversationId' | 'content' | 'createdAt'>>>
const activityQuery = taskPageQuery.extend({ limit: z.number().int().min(1).max(20).default(8), includeDone: z.boolean().default(true) })
const execution = (value: AutomationOccurrence) => ({ id: value.id, status: value.status, startedAt: value.startedAt, finishedAt: value.finishedAt })
export async function readTaskActivity(store: ProductStore, raw: unknown, actor: ApplicationActor, outputs?: TaskOutputs) {
  const input = activityQuery.parse(raw)
  if (actor.kind === 'owner' && !input.agentId) throw new ApplicationValidationError('INVALID_INPUT', '请选择员工')
  const page = await taskPageOperation(store, true).execute(input, undefined, actor) as TrackedTaskPage
  const evidence = await outputs?.(page.items, actor)
  const items = await Promise.all(page.items.map(async task => {
    const query = { employeeId: task.agentId, taskId: task.id }
    const [active, recent] = await Promise.all([store.automationHistory({ ...query, status: 'active', limit: 10 }), store.automationHistory({ ...query, limit: 1 })])
    const output = evidence?.get(task.id)
    return { ...task, activeExecutions: active.occurrences.map(execution), moreActiveExecutions: !!active.nextCursor,
      latestExecution: recent.occurrences[0] ? execution(recent.occurrences[0]) : null,
      ...(output ? { latestOutput: { messageId: output.id, conversationId: output.conversationId, createdAt: output.createdAt, content: output.content.slice(0, 2000), truncated: output.content.length > 2000 } } : {}) }
  }))
  return { employeeId: input.agentId ?? (actor.kind !== 'owner' ? actor.employeeId : undefined), readAt: new Date().toISOString(), items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    coverage: 'Current persisted assignments and executions only. Display status is not execution state or user acceptance. latestOutput is a sourced employee message, not proof of task completion; missing output does not prove none exists. Follow nextCursor for more tasks.' }
}
export function taskActivityOperation(store: ProductStore, outputs: TaskOutputs): ApplicationOperation {
  return { name: 'tasks.activity', description: '查询自己任务面板的真实任务、在途执行、最近执行和获准结果原文。includeDone=true包含已完成/关闭；activeOnly按真实执行筛选，taskId读取指定任务；nextCursor继续分页。只读，不运行任务。', effect: 'read', input: activityQuery, resultType: 'EmployeeTaskActivity', execute: (input, _, actor) => readTaskActivity(store, input, actor, outputs) }
}
