/*
 * [INPUT]: Persisted turns/messages or task dispatches, exact conversation and action identity.
 * [OUTPUT]: Composer queue projection and durable fixed-target action receipts.
 * [POS]: Existing scheduler/automation queue adapter; no second execution loop.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { z } from 'zod'
import type { Conversation, Message } from '@boai/shared/domain'
import type { AutomationDispatch, AutomationOccurrence } from '@boai/shared/domain/automations'
import type { ConversationQueueAction, ConversationQueueItem } from '@boai/shared/domain/message-queue'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import type { GroupScheduler } from '../../group-scheduler'
import { queuedOrder } from '../automations/schedule-policy'

const id = z.string().min(1).max(500)
export const queueActionSchema = z.object({ conversationId: id, id, expectedRevision: z.number().int().nonnegative(), action: z.enum(['remove', 'send-now']), requestId: id }).strict()
export type QueueActionReceipt = { fingerprint: string; targets: string[]; applied?: boolean }
export const queueActionKey = (requestId: string) => `message-queue:${requestId}`
export async function prepareQueueAction(tx: RecordTransaction, input: ConversationQueueAction, prepare: () => Promise<string[]>): Promise<QueueActionReceipt> {
  const fingerprint = JSON.stringify(input), key = queueActionKey(input.requestId)
  const previous = await tx.get<QueueActionReceipt>('messageQueueActions', key)
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error('同一队列操作不能更换消息或动作')
    return previous
  }
  const receipt = { fingerprint, targets: await prepare() }
  await tx.put({ collection: 'messageQueueActions', id: key, value: receipt })
  return receipt
}
export async function finishQueueAction(store: ProductStore, input: ConversationQueueAction, receipt: QueueActionReceipt) {
  await store.write([{ collection: 'messageQueueActions', id: queueActionKey(input.requestId), value: { ...receipt, applied: true } }])
}
export async function listConversationQueue(store: ProductStore, scheduler: GroupScheduler, room: Conversation): Promise<{ items: ConversationQueueItem[] }> {
  if (room.employeeTaskId) return store.transaction(async tx => {
    const items: ConversationQueueItem[] = []
    const occurrences = (await tx.list<AutomationOccurrence>('automationOccurrences')).filter(o => o.conversationId === room.id && o.taskId === room.employeeTaskId && !o.deletedAt && o.status === 'queued').sort(queuedOrder)
    for (const o of occurrences) {
      const dispatch = await tx.get<AutomationDispatch>('automationDispatches', o.id)
      if (dispatch?.status !== 'pending' || !dispatch.definition) continue
      const message = dispatch.definition.employeeTask?.message
      items.push({ id: o.id, conversationId: room.id, revision: o.stateVersion, content: message?.content || dispatch.definition.prompt, createdAt: o.admittedAt ?? o.startedAt, attachmentCount: message?.materialUploads?.length || message?.materialSelections?.length || 0 })
    }
    return { items }
  })
  const items: ConversationQueueItem[] = []
  for (const turn of [...scheduler.turns.values()].filter(turn => turn.conversationId === room.id && turn.status === 'queued' && !turn.origin && !turn.wakeId && !turn.startIntentId).sort((a, b) => (a.queuePriority ?? 0) - (b.queuePriority ?? 0))) {
    const message = await store.get<Message>('messages', turn.triggerMessageId)
    if (message?.senderType !== 'user' || message.nativeSteering) continue
    items.push({ id: turn.id, conversationId: room.id, revision: turn.epoch, content: message.content, createdAt: message.createdAt, attachmentCount: message.attachmentInputs?.length || message.materialSources?.length || 0 })
  }
  return { items }
}
