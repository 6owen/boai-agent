/*
 * [INPUT]: Persisted task records, validated filters, authenticated actor and optional authorized output lookup.
 * [OUTPUT]: Filter-bound pages and current execution activity for application tools, employee chat and the task board.
 * [POS]: Runtime task read model; mutations and scheduling remain with their owners.
 * [PROTOCOL]: Update this header and tasks/.folder.md when query or cursor contracts change.
 */
import { z } from 'zod'
import type { Message } from '@boai/shared/domain'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { AutomationOccurrence } from '@boai/shared/domain/automations'
import { EMPLOYEE_TASK_STATUSES, TASK_PAGE_LIMITS, type TrackedTaskListItem, type TrackedTaskPage } from '@boai/shared/domain/tracked-tasks'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError } from '../../application-operation'
import { jsonSha256 } from '../../json-digest'

const id = z.string().min(1).max(200)
export const taskPageQuery = z.object({ taskId: id.optional(), activeOnly: z.boolean().default(false), agentId: id.optional(), conversationId: id.optional(), status: z.enum(EMPLOYEE_TASK_STATUSES).optional(), includeDone: z.boolean().default(false), limit: z.number().int().min(1).max(TASK_PAGE_LIMITS.maxPage).default(TASK_PAGE_LIMITS.page), cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict()
const cursor = z.object({ version: z.literal(1), key: z.string().length(64), updatedAt: z.string().datetime(), id }).strict()
const invalid = () => { throw new ApplicationValidationError('INVALID_INPUT', '任务分页游标已失效或不属于当前筛选，请从第一页重新读取') }

export async function readTaskPage(store: ProductStore, raw: unknown, actor: ApplicationActor, scope: 'assignments' | 'all-records'): Promise<TrackedTaskPage> {
  const input = taskPageQuery.parse(raw)
  if (actor.kind !== 'owner' && input.agentId && input.agentId !== actor.employeeId) throw new ApplicationValidationError('FORBIDDEN', '任务不属于当前员工可用范围')
  const viewer = actor.kind === 'owner' ? undefined : { employeeId: actor.employeeId, conversationId: actor.conversationId }
  const filters = {
    taskId: input.taskId, activeOnly: input.activeOnly, agentId: input.agentId ?? viewer?.employeeId,
    conversationId: input.conversationId, status: input.status,
    includeDone: input.status ? false : input.activeOnly || input.includeDone, assignmentsOnly: scope === 'assignments',
  }
  const key = jsonSha256({ filters, viewer: viewer ?? 'owner' })
  let before: { updatedAt: string; id: string } | undefined
  if (input.cursor) {
    try {
      const value = cursor.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
      if (value.key !== key) return invalid()
      before = { updatedAt: value.updatedAt, id: value.id }
    } catch {
      return invalid()
    }
  }
  const rows = await store.queryTrackedTaskPage({ ...filters, viewer, before, limit: input.limit })
  const items = rows.slice(0, input.limit), last = items.at(-1)
  return { items, ...(rows.length > input.limit && last ? { nextCursor: Buffer.from(JSON.stringify({ version: 1, key, updatedAt: last.updatedAt, id: last.id })).toString('base64url') } : {}) }
}

export type TaskOutputs = (tasks: TrackedTaskListItem[], actor: ApplicationActor) => Promise<Map<string, Pick<Message, 'id' | 'conversationId' | 'content' | 'createdAt'>>>
export const taskActivityQuery = taskPageQuery.extend({ limit: z.number().int().min(1).max(20).default(8), includeDone: z.boolean().default(true) })
const execution = (value: AutomationOccurrence) => ({ id: value.id, status: value.status, startedAt: value.startedAt, finishedAt: value.finishedAt })
export async function readTaskActivity(store: ProductStore, raw: unknown, actor: ApplicationActor, outputs?: TaskOutputs) {
  const input = taskActivityQuery.parse(raw)
  if (actor.kind === 'owner' && !input.agentId) throw new ApplicationValidationError('INVALID_INPUT', '请选择员工')
  const page = await readTaskPage(store, input, actor, 'assignments')
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
