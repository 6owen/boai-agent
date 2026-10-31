/*
 * [OUTPUT]: 五状态、手动状态来源和唯一任务会话标识。
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
  conversationId?: string
  /** Explicit assignment, retained independently of any individual execution. */
  description?: string
  source?: { conversationId: string; messageId: string }
  sourceKind?: 'message' | 'manual' | 'schedule'
  latestOccurrenceId?: string
  sessionConversationId?: string
  statusSource?: 'manual' | 'execution'
  title: string
  steps: { title: string; done: boolean }[]
  status: TrackedTaskStatus
  note: string
  revision: number
  createdAt: string
  updatedAt: string
}
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
