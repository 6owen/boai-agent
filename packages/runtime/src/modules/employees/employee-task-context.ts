/*
 * [INPUT]: Trusted task conversation, current employee and persisted assignment.
 * [OUTPUT]: API/native task identity and explicit progress/delivery/acceptance instructions.
 * [POS]: Employee task context; grants no tools and does not dispatch execution.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { Conversation } from '@boai/shared/domain'
import { isEmployeeTaskAssignment, type TrackedTask } from '@boai/shared/domain/tracked-tasks'
import type { ProductStore } from '../../adapters/storage/product-store'

export const employeeTaskOperations = new Set(['tasks.list', 'tasks.get', 'tasks.update'])

export async function employeeTaskInstructions(store: ProductStore, employeeId: string, conversation: Conversation) {
  if (!conversation.employeeTaskId) return ''
  const task = await store.get<TrackedTask>('agentTasks', conversation.employeeTaskId)
  if (!task || !isEmployeeTaskAssignment(task) || task.agentId !== employeeId || task.sessionConversationId !== conversation.id) return ''
  return `[Current employee task]\n${JSON.stringify({ id: task.id, status: task.status, revision: task.revision })}\n` +
    'This conversation belongs to this existing task. Read tasks.get for its current requirements, steps, note and revision; update that same ID with tasks.update through boai_catalog/boai_call. Never create another tracking task for this assignment. Read the exact operation schema and use a stable requestId for each write.\n' +
    'When this turn advances the task itself, set in_progress before doing its work. Deliver the requested result in this conversation, then set in_review when the task deliverable is ready for user acceptance. Partial work, waiting for input, waiting for approval or a blocker stays in_progress; record the reason and remaining work in note and explain any question in the conversation. Use only pending, in_progress, in_review, done, closed; blocked is not a valid status.\n' +
    'A progress question, discussion or acknowledgement that produces none of the task deliverable does not change task status. A run ending does not prove delivery. done and closed belong to the user; do not set them or reopen them. Re-read after a revision conflict and respect the latest user decision. Task status changes do not stop a running execution.'
}
