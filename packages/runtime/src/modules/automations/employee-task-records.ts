/*
 * [OUTPUT]: 按任务汇总运行状态、尊重手动状态；历史采纳不恢复已删除的任务。
 * [INPUT]: Accepted automation occurrence and explicit employee task, inside the original transaction.
 * [OUTPUT]: Durable task ownership and many execution links; historical adoption never dispatches work.
 * [POS]: Task metadata bridge; scheduler, Work and native sessions keep execution authority.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { createHash } from 'node:crypto'
import type { AutomationDefinition, AutomationOccurrence, AutomationDispatch } from '@boai/shared/domain/automations'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import type { Message } from '@boai/shared/domain'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const taskIdentity = (source: string) => `task-${createHash('sha256').update(source).digest('hex').slice(0, 40)}`
export const ongoingTaskExecution = (o?: AutomationOccurrence) => !!o && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)

export async function linkEmployeeTask(tx: RecordTransaction, d: AutomationDefinition, o: AutomationOccurrence, historical = false) {
  const owner = o.plan?.owner ?? d.owner
  if (o.deletedAt || o.status === 'skipped' || o.taskKind === 'monitor' || owner?.kind !== 'employee') return
  const agentId = owner.employeeId
  const taskId = o.taskId ?? d.employeeTask?.id ?? taskIdentity(d.purpose === 'employee-task' ? `definition:${d.id}` : `occurrence:${o.id}`)
  if (await tx.get('deletedEmployeeTasks', taskId)) {
    if (d.employeeTask && !historical) throw new Error('任务已删除')
    return
  }
  let task = await tx.get<TrackedTask>('agentTasks', taskId)
  if (d.employeeTask && !historical) {
    if (!task || task.agentId !== agentId) throw new Error('任务不存在或不属于当前员工')
    if (task.revision !== d.employeeTask.expectedRevision) throw new Error('任务已经改变，请刷新后重新提交')
    if (task.status === 'done' || task.status === 'closed') throw new Error('请先重新打开已完成任务')
    if (!d.employeeTask.message && task.latestOccurrenceId && ongoingTaskExecution(await tx.get<AutomationOccurrence>('automationOccurrences', task.latestOccurrenceId))) throw new Error('该任务还有执行或等待中的运行，请先处理本次运行')
  }
  if (!task) {
    const description = historical ? (await tx.get<AutomationDispatch>('automationDispatches', o.id))?.definition?.prompt ?? (o.messageId ? (await tx.get<Message>('messages', o.messageId))?.content : undefined) : d.prompt
    task = { id: taskId, agentId, title: o.name, description, steps: [], note: '', status: 'pending', sourceKind: d.purpose === 'employee-task' ? 'manual' : 'schedule', revision: 1, createdAt: o.startedAt, updatedAt: o.startedAt }
  }
  if (task.agentId !== agentId) throw new Error('任务归属不一致')
  o.taskId = task.id
  const latest = task.latestOccurrenceId ? await tx.get<AutomationOccurrence>('automationOccurrences', task.latestOccurrenceId) : undefined
  if (!historical || !latest || o.startedAt > latest.startedAt || o.startedAt === latest.startedAt && o.id > latest.id) {
    task = { ...task, latestOccurrenceId: o.id, statusSource: 'execution', ...(!historical || !task.latestOccurrenceId ? { status: await executionTaskStatus(tx, o, task) } : {}), revision: task.revision + 1, updatedAt: o.startedAt }
    await tx.put({ collection: 'agentTasks', id: task.id, value: task })
  }
  const room = await tx.get<import('@boai/shared/domain').Conversation>('conversations', o.conversationId)
  if (room?.purpose === 'automation' && (!room.employeeTaskId || room.employeeTaskId === task.id)) {
    await tx.put({ collection: 'conversations', id: room.id, value: { ...room, employeeTaskId: task.id, automationId: room.automationId ?? d.id, occurrenceId: room.occurrenceId ?? o.id } })
    await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, sessionConversationId: room.id } })
  }
  await tx.put({ collection: 'automationOccurrences', id: o.id, value: o })
}

/** Reflect the latest execution's waits/failures without letting an old run overwrite later user edits. */
export async function syncEmployeeTask(tx: RecordTransaction, o: AutomationOccurrence) {
  if (!o.taskId || o.deletedAt) return
  const task = await tx.get<TrackedTask>('agentTasks', o.taskId)
  if (!task || task.statusSource === 'manual') return
  const previous = await tx.get<AutomationOccurrence>('automationOccurrences', o.id)
  if (previous?.status === o.status && previous.deliveryStatus === o.deliveryStatus) return
  const status = await executionTaskStatus(tx, o, task)
  if (task.status !== status) await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, status, revision: task.revision + 1, updatedAt: o.finishedAt ?? new Date().toISOString() } })
}

async function executionTaskStatus(tx: RecordTransaction, o: AutomationOccurrence, task: TrackedTask): Promise<TrackedTask['status']> {
  const executions = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => item.taskId === task.id && item.id !== o.id && !item.deletedAt)
  executions.push(o)
  if (executions.some(item => ['admitted', 'running', 'waiting_work', 'cancelling'].includes(item.status))) return 'in_progress'
  if (executions.some(item => ['waiting_user', 'waiting_approval'].includes(item.status))) return 'in_review'
  if (executions.some(item => item.status === 'queued')) return 'pending'
  return 'in_review'
}
