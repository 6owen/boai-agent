/*
 * [INPUT]: Employee-owned scheduled runs and their existing conversations.
 * [OUTPUT]: Scheduled work uses ordinary employee topics; legacy history keeps its IDs without Kanban ownership.
 * [POS]: Product conversation identity adapter; no execution loop or task-board state.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import type { AutomationOccurrence, Conversation } from '@boai/shared/domain'
import { CORE_AGENT_ID } from '@boai/shared/domain/core-agent'
import type { ProductStore } from '../../adapters/storage/product-store'

export function isScheduledEmployeeTopic(room: Conversation) {
  return room.employeeChat === 'topic' && room.kind === 'direct' && room.agentIds.length === 1 &&
    !room.employeeTaskId && !!room.automationId && !!room.occurrenceId
}

export function asEmployeeTopic(room: Conversation): Conversation {
  const { employeeTaskId: _task, ...conversation } = room
  return { ...conversation, employeeChat: 'topic', purpose: room.agentIds[0] === CORE_AGENT_ID ? 'core' : 'personal', memoryScope: room.memoryScope ?? 'employee' }
}

/** Preserve original thread/native-session/run identities. Never dispatch or replay historical work. */
export async function migrateScheduledEmployeeTopics(store: ProductStore) {
  await store.transaction(async tx => {
    for (const occurrence of await tx.list<AutomationOccurrence>('automationOccurrences')) {
      if (occurrence.deletedAt || occurrence.purpose === 'employee-task' || occurrence.taskKind === 'monitor' || occurrence.plan?.owner.kind !== 'employee') continue
      const room = await tx.get<Conversation>('conversations', occurrence.conversationId)
      if (!room || await tx.get('conversationCleanup', room.id) || room.mergedInto || room.channel || room.kind !== 'direct' || room.agentIds.length !== 1 || room.agentIds[0] !== occurrence.plan.owner.employeeId ||
          room.automationId !== occurrence.automationId || room.occurrenceId !== occurrence.id) continue
      if (room.purpose === 'automation') await tx.put({ collection: 'conversations', id: room.id, value: asEmployeeTopic(room) })
      else if (!isScheduledEmployeeTopic(room)) continue
      if (occurrence.taskId) {
        const { taskId: _task, ...detached } = occurrence
        await tx.put({ collection: 'automationOccurrences', id: occurrence.id, value: detached })
      }
    }
  })
}
