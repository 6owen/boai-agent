/*
 * [OUTPUT]: assignment人工委派与progress内部进度明确分层，保留五状态及原任务会话标识。
 * [OUTPUT]: briefPending仅标记会话创建的原始要求尚待整理，不参与状态流转或执行门禁。
 * [OUTPUT]: 普通任务不保存创建方式分类；sourceKind的manual/message仅用于旧数据迁移，原定时来源保持。
 * [OUTPUT]: 原agentTasks扩展要求/消息来源/最近执行和等待补充状态，长期任务不随聊天清空删除。
 * [INPUT]: Original explicit task records and bounded application queries.
 * [OUTPUT]: Shared task progress/list projection; done is a declaration, not execution or artifact acceptance.
 * [POS]: Task tracking DTOs; Plan Weave and Run/Work retain their own authority.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
export const EMPLOYEE_TASK_STATUSES = ['pending', 'in_progress', 'in_review', 'done', 'closed'] as const
export type TrackedTaskStatus = typeof EMPLOYEE_TASK_STATUSES[number]
export interface TrackedTask {
  id: string
  agentId: string
  /** Assigned goals enter Kanban; agent-owned progress records never do. */
  kind?: 'assignment' | 'progress'
  conversationId?: string
  /** Explicit assignment, retained independently of any individual execution. */
  description?: string
  briefPending?: boolean
  source?: { conversationId: string; messageId: string }
  /** New assignments omit this field; manual/message are legacy migration inputs only. */
  sourceKind?: 'message' | 'manual' | 'schedule'
  latestOccurrenceId?: string
  sessionConversationId?: string
  statusSource?: 'manual' | 'employee' | 'execution'
  title: string
  steps: { title: string; done: boolean }[]
  status: TrackedTaskStatus
  note: string
  revision: number
  createdAt: string
  updatedAt: string
}
/** Explicit employee assignments use task-level delivery and human acceptance. */
export const isEmployeeTaskAssignment = (task: Pick<TrackedTask, 'kind' | 'sourceKind'>) => task.kind === 'assignment' || task.kind === undefined && (task.sourceKind === 'manual' || task.sourceKind === 'message')
export const TASK_PAGE_LIMITS = { page: 30, maxPage: 100, noteCharacters: 1000, stepTitleCharacters: 300 } as const
export interface TrackedTaskListItem extends Omit<TrackedTask, 'steps' | 'note' | 'description'> {
  executionStatus?: import('./automations').AutomationOccurrence['status']
  stepCount: number
  completedStepCount: number
  nextStepTitle?: string
  noteExcerpt: string
  noteTruncated: boolean
}
export interface TrackedTaskPage { items: TrackedTaskListItem[]; nextCursor?: string }
