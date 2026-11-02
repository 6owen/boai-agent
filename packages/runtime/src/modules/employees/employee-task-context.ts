/*
 * [INPUT]: Trusted task conversation, current employee and persisted assignment.
 * [OUTPUT]: API/native持续任务会话与平级状态标签；会话创建先沿原任务补全标题/目标/验收，不另建任务。
 * [POS]: Employee task context; grants no tools and does not dispatch execution.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { Conversation } from '@boai/shared/domain'
import type { AutomationDispatch } from '@boai/shared/domain/automations'
import { isEmployeeTaskAssignment, type TrackedTask } from '@boai/shared/domain/tracked-tasks'
import type { ProductStore } from '../../adapters/storage/product-store'

export const employeeTaskOperations = new Set(['tasks.list', 'tasks.get', 'tasks.update'])

export async function employeeTaskInstructions(store: ProductStore, employeeId: string, conversation: Conversation, occurrenceId?: string) {
  if (!conversation.employeeTaskId) return ''
  const task = await store.get<TrackedTask>('agentTasks', conversation.employeeTaskId)
  if (!task || !isEmployeeTaskAssignment(task) || task.agentId !== employeeId || task.sessionConversationId !== conversation.id) return ''
  const dispatch = occurrenceId ? await store.get<AutomationDispatch>('automationDispatches', occurrenceId) : undefined
  const frozen = dispatch?.definition?.employeeTask
  const requirements = frozen?.id === task.id ? frozen.requirements ?? task.description ?? task.note : task.description ?? task.note
  return `[Current employee task]\n${JSON.stringify({ id: task.id, status: task.status, revision: task.revision, requirements })}\n` +
    (task.briefPending ? 'The user explicitly created this task through conversation. The requirements above are their original input. First use tasks.get and tasks.update on this same ID to give it a concise title and a description with the goal, acceptance criteria and expected output supported by that input. Recheck briefPending: if it is already false, keep the user\'s newer brief rather than overwriting it. Do not invent requirements or turn this into your implementation plan. If essential details are missing, ask in this conversation and keep the uncertainty explicit. Then carry out the work the user requested in this same conversation. Do not create another task or a main-chat message.\n' : '') +
    'Kanban contains goals and acceptance criteria explicitly assigned or confirmed by the user. Keep distinct user assignments separate. Your own implementation plan, todos, tool steps and subagent work are internal execution details, not additional Kanban assignments. Do not replace, merge or split the user goal without their instruction.\n' +
    'This conversation belongs to this existing task. The requirements above were captured for this execution; newer saved brief edits apply to a later execution unless the user explicitly supplements this conversation now. Read tasks.get for current steps, note and revision; update that same ID with tasks.update through boai_catalog/boai_call. Never create another tracking task for this assignment. Read the exact operation schema and use a stable requestId for each write.\n' +
    'When this turn advances the task itself, set in_progress before doing its work. Deliver the requested result in this conversation, then set in_review when the task deliverable is ready for user acceptance. Partial work, waiting for input, waiting for approval or a blocker stays in_progress; record the reason and remaining work in note and explain any question in the conversation. Use only pending, in_progress, in_review, done, closed; blocked is not a valid status.\n' +
    'All statuses are peer collaboration/notification labels, not sequential stages or execution gates. The user can create a task in any status and freely drag or set its status. Do not infer execution, delivery or acceptance from that label alone. A progress question, discussion or acknowledgement that produces none of the task deliverable does not change status, including when it is done or closed. A run ending does not prove delivery. Set done only after the user explicitly accepts the output; set closed only when the user explicitly asks to close it. When the user asks for new work or revisions, continue in this same conversation and set in_progress without requiring a manual reopen, then in_review after delivery. Re-read after a revision conflict. Status changes do not start, stop or block any execution.'
}
