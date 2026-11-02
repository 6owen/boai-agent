/*
 * [OUTPUT]: 可持续任务会话、轻量状态、要求编辑及按选择顺序幂等批量派发；验收不锁住执行。
 * [INPUT]: Explicit employee assignments, chat message provenance and execution history.
 * [OUTPUT]: Employee-owned task commands; task completion remains an explicit declaration.
 * [POS]: Product view of existing tracked tasks, independent of individual runs.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import type { TrackedTask, TrackedTaskPage, TrackedTaskStatus } from './tracked-tasks'
import type { AutomationHistoryPage, AutomationOccurrence } from './automations'
export interface EmployeeTaskCreate {
  employeeId: string; requestId: string; title?: string; description?: string
  source?: { conversationId: string; messageId: string }
}
export interface EmployeeTaskQuery { employeeId: string; status?: TrackedTaskStatus; includeDone?: boolean; cursor?: string; limit?: number }
export interface EmployeeTaskDetail { task: TrackedTask; executions: AutomationHistoryPage; sourceExecution?: { available: boolean; runs: Pick<import('./index').AgentRun, 'id' | 'status' | 'createdAt'>[] } }
export interface EmployeeTaskMethods {
  openEmployeeTaskSession: { input: { employeeId: string; id: string }; output: import('./index').Conversation }
  sendEmployeeTaskMessage: { input: import('../ipc').Methods['sendMessage']['input']; output: AutomationOccurrence | import('./index').Message }
  getEmployeeTaskMessageReceipt: { input: { requestId: string }; output: AutomationOccurrence | import('./index').Message | null }
  createEmployeeTask: { input: EmployeeTaskCreate; output: TrackedTask }
  listEmployeeTasks: { input: EmployeeTaskQuery; output: TrackedTaskPage }
  getEmployeeTask: { input: { employeeId: string; id?: string; occurrenceId?: string; before?: { startedAt: string; id: string } }; output: EmployeeTaskDetail }
  updateEmployeeTask: { input: { employeeId: string; id: string; expectedRevision: number; status?: TrackedTaskStatus; title?: string; description?: string }; output: TrackedTask }
  deleteEmployeeTask: { input: { employeeId: string; id: string; expectedRevision: number }; output: { deleted: true } }
  runEmployeeTask: { input: { employeeId: string; id: string; expectedRevision: number; requestId: string; supplement?: string; message?: import('../ipc').Methods['sendMessage']['input'] }; output: AutomationOccurrence }
  runEmployeeTasks: { input: { employeeId: string; tasks: { id: string; expectedRevision: number }[]; requestId: string }; output: { items: ({ id: string; execution: AutomationOccurrence } | { id: string; error: string })[] } }
}
