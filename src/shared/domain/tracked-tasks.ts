/*
 * [INPUT]: Original explicit task records and bounded application queries.
 * [OUTPUT]: Shared task progress/list projection; done is a declaration, not execution or artifact acceptance.
 * [POS]: Task tracking DTOs; Plan Weave and Run/Work retain their own authority.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
export type TrackedTaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done'
export interface TrackedTask {
  id: string
  agentId: string
  conversationId?: string
  title: string
  steps: { title: string; done: boolean }[]
  status: TrackedTaskStatus
  note: string
  revision: number
  createdAt: string
  updatedAt: string
}
export const TASK_PAGE_LIMITS = { page: 30, maxPage: 100, noteCharacters: 1000, stepTitleCharacters: 300 } as const
export interface TrackedTaskListItem extends Omit<TrackedTask, 'steps' | 'note'> {
  stepCount: number
  completedStepCount: number
  nextStepTitle?: string
  noteExcerpt: string
  noteTruncated: boolean
}
export interface TrackedTaskPage { items: TrackedTaskListItem[]; nextCursor?: string }
