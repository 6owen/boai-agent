/*
 * [OUTPUT]: 定时新任务在受理事务复制默认项目；旧历史不套用今天的默认值。
 * [OUTPUT]: 本轮结束并有回复时兜底显示待确认；保留人工状态、后续排队和业务交付账本，启动仅校正旧显示。
 * [OUTPUT]: 任意任务状态均可快捷执行；已有执行时同任务新要求进入原持久FIFO。
 * [OUTPUT]: 定时计划每次受理生成可见assignment及独立任务会话，沿同一协作/验收协议；内部进度不晋升为委派。
 * [OUTPUT]: 旧普通执行补回任务时登记assignment，不再写manual创建方式；定时记录的schedule来源保持。
 * [INPUT]: Accepted automation occurrence and explicit employee task, inside the original transaction.
 * [OUTPUT]: Durable task ownership and many execution links; historical adoption never dispatches work.
 * [POS]: Task metadata bridge; scheduler, Work and native sessions keep execution authority.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { createHash } from 'node:crypto'
import type { AutomationDefinition, AutomationOccurrence, AutomationDispatch } from '@boai/shared/domain/automations'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import { initialProjectSelection, legacyProjectSelection } from '../workspaces/project-directory'
import type { DigitalAgent, Message } from '@boai/shared/domain'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import { isEmployeeTaskAssignment } from '@boai/shared/domain/tracked-tasks'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const taskIdentity = (source: string) => `task-${createHash('sha256').update(source).digest('hex').slice(0, 40)}`
export const ongoingTaskExecution = (o?: AutomationOccurrence) => !!o && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)

/** A finished reply is ready for human review, not proof of acceptance or Work delivery. */
export function hasEmployeeTaskResult(o: AutomationOccurrence) {
  return !!o.taskId && !o.deletedAt && o.status === 'completed' && o.resultMessageIds.length > 0
}

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
  const newScheduledTask = !task && d.purpose !== 'employee-task'
  if (d.employeeTask && !historical) {
    if (!task || task.agentId !== agentId) throw new Error('任务不存在或不属于当前员工')
    if (!d.employeeTask.message && task.revision !== d.employeeTask.expectedRevision) throw new Error('任务已经改变，请刷新后重新提交')
    if (!isEmployeeTaskAssignment(task) && (task.status === 'done' || task.status === 'closed')) throw new Error('请先重新打开已完成任务')
  }
  if (!task) {
    const description = historical ? (await tx.get<AutomationDispatch>('automationDispatches', o.id))?.definition?.prompt ?? (o.messageId ? (await tx.get<Message>('messages', o.messageId))?.content : undefined) : d.prompt
    const source = o.messageId ? await tx.get<Message>('messages', o.messageId) : undefined
    const projectSelection = source?.projectSelections?.[agentId] ?? source?.projectSelection ?? (source?.workingDirectory ? legacyProjectSelection(source.workingDirectory) : historical ? legacyProjectSelection() : initialProjectSelection(await tx.get<DigitalAgent>('agents', agentId)))
    task = { projectSelection, id: taskId, agentId, title: o.name, description, steps: [], note: '', status: 'pending', kind: 'assignment', ...(newScheduledTask ? { sourceKind: 'schedule' as const } : {}), revision: 1, createdAt: o.startedAt, updatedAt: o.startedAt }
    // Adopt the old execution projection only when reconstructing missing history; new deliveries use the normal assignment protocol.
    if (historical && newScheduledTask) task.status = await executionTaskStatus(tx, o, { ...task, kind: undefined })
  }
  if (task.agentId !== agentId) throw new Error('任务归属不一致')
  o.taskId = task.id
  const latest = task.latestOccurrenceId ? await tx.get<AutomationOccurrence>('automationOccurrences', task.latestOccurrenceId) : undefined
  if (!historical || !latest || o.startedAt > latest.startedAt || o.startedAt === latest.startedAt && o.id > latest.id) {
    const explicitTaskRun = !historical && (newScheduledTask || d.employeeTask && !d.employeeTask.message)
    const executionState = isEmployeeTaskAssignment(task) ? (explicitTaskRun ? { status: 'in_progress' as const, statusSource: 'execution' as const } : {}) : {
      statusSource: 'execution' as const,
      ...(!historical || !task.latestOccurrenceId ? { status: await executionTaskStatus(tx, o, task) } : {}),
    }
    task = { ...task, latestOccurrenceId: o.id, ...executionState, revision: task.revision + 1, updatedAt: o.startedAt }
    await tx.put({ collection: 'agentTasks', id: task.id, value: task })
  }
  const room = await tx.get<import('@boai/shared/domain').Conversation>('conversations', o.conversationId)
  if (room?.purpose === 'automation' && (!room.employeeTaskId || room.employeeTaskId === task.id)) {
    await tx.put({ collection: 'conversations', id: room.id, value: { ...room, projectSelection: task.projectSelection ?? room.projectSelection ?? legacyProjectSelection(), employeeTaskId: task.id, automationId: room.automationId ?? d.id, occurrenceId: room.occurrenceId ?? o.id } })
    await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, sessionConversationId: room.id } })
  }
  await tx.put({ collection: 'automationOccurrences', id: o.id, value: o })
}

/** Reflect the latest execution's waits/failures without letting an old run overwrite later user edits. */
export async function syncEmployeeTask(tx: RecordTransaction, o: AutomationOccurrence, recovery = false) {
  if (!o.taskId || o.deletedAt) return
  const task = await tx.get<TrackedTask>('agentTasks', o.taskId)
  if (!task || task.statusSource === 'manual') return
  const previous = await tx.get<AutomationOccurrence>('automationOccurrences', o.id)
  if (!recovery && previous?.status === o.status && previous.deliveryStatus === o.deliveryStatus && hasEmployeeTaskResult(previous) === hasEmployeeTaskResult(o)) return
  const status = await executionTaskStatus(tx, o, task)
  if (task.status !== status) await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, status, revision: task.revision + 1, updatedAt: o.finishedAt ?? new Date().toISOString() } })
}

async function executionTaskStatus(tx: RecordTransaction, o: AutomationOccurrence, task: TrackedTask): Promise<TrackedTask['status']> {
  const executions = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(item => item.taskId === task.id && item.id !== o.id && !item.deletedAt)
  executions.push(o)
  if (isEmployeeTaskAssignment(task)) {
    // Review is a display hint for the latest finished reply. Human acceptance stays separate.
    const latest = executions.find(item => item.id === task.latestOccurrenceId)
    if (task.status === 'in_progress' && latest && !executions.some(ongoingTaskExecution)) {
      if (hasEmployeeTaskResult(latest)) return 'in_review'
      if (['failed', 'cancelled', 'interrupted', 'skipped'].includes(latest.status)) return 'pending'
    }
    return task.status
  }
  if (executions.some(item => ['admitted', 'running', 'waiting_work', 'cancelling'].includes(item.status))) return 'in_progress'
  if (executions.some(item => ['waiting_user', 'waiting_approval'].includes(item.status))) return 'in_review'
  if (executions.some(item => item.status === 'queued')) return 'pending'
  return 'in_review'
}
