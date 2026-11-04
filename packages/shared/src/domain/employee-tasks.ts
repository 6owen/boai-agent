/*
 * [OUTPUT]: 按员工/状态清空全部分页任务，返回删除及在途保留ID；稳定请求回执防止重试扩大删除范围。
 * [OUTPUT]: 平级状态可直接创建，支持自然语言会话创建后由原Agent补全内容；状态不控制执行。
 * [INPUT]: Explicit employee assignments, chat message provenance and execution history.
 * [OUTPUT]: Employee-owned task commands; task completion remains an explicit declaration.
 * [POS]: Product view of existing tracked tasks, independent of individual runs.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import type { TrackedTask, TrackedTaskPage, TrackedTaskStatus } from './tracked-tasks'
import type { AutomationHistoryPage, AutomationOccurrence } from './automations'
export interface EmployeeTaskCreate {
  employeeId: string; requestId: string; title?: string; description?: string
  status?: TrackedTaskStatus; conversation?: boolean
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
  clearEmployeeTasks: { input: { employeeId: string; status: TrackedTaskStatus; requestId: string }; output: { deletedIds: string[]; skippedIds: string[] } }
  runEmployeeTask: { input: { employeeId: string; id: string; expectedRevision: number; requestId: string; supplement?: string; message?: import('../ipc').Methods['sendMessage']['input'] }; output: AutomationOccurrence }
  runEmployeeTasks: { input: { employeeId: string; tasks: { id: string; expectedRevision: number }[]; requestId: string }; output: { items: ({ id: string; execution: AutomationOccurrence } | { id: string; error: string })[] } }
}
