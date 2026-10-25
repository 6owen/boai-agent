/*
 * [INPUT]: Original ProductStore transactions and explicit session request identity.
 * [OUTPUT]: Content-bound operation receipts in the same store as Conversation and cleanup journals.
 * [POS]: Business idempotence only; never creates an execution loop or CLI-side cache.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createHash } from 'node:crypto'
import { sessionOperationContent, type SessionOperationReceipt } from '@boai/shared/domain/session-operation'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { Conversation } from '@boai/shared/domain'

export interface SessionOperationRecord extends SessionOperationReceipt { id: string; fingerprint: string }
export const sessionFingerprint = (input: Parameters<typeof sessionOperationContent>[0]) => createHash('sha256').update(sessionOperationContent(input)).digest('hex')
export async function sessionOperation(store: ProductStore, requestId: string, fingerprint?: string) {
  const receipt = await store.get<SessionOperationRecord>('sessionReceipts', requestId)
  if (receipt && fingerprint && receipt.fingerprint !== fingerprint) throw new Error('requestId 已用于其他会话操作')
  return receipt ?? null
}
export function publicSessionReceipt(receipt: SessionOperationRecord): SessionOperationReceipt {
  const { id: _id, ...result } = receipt
  return result
}

/** Accept the original cleanup plan before any memory/browser/file revocation. */
export async function prepareSessionDeletion(store: ProductStore, conversation: Conversation, discussions: Conversation[], receipt: SessionOperationRecord) {
  return store.transaction(async tx => {
    const pending = await tx.get<{ sessionRequestId?: string }>('conversationCleanup', conversation.id)
    if (pending && pending.sessionRequestId !== receipt.requestId) throw new Error('原会话清理尚未结束，请先核对原操作')
    const previous = await tx.get<SessionOperationRecord>('sessionReceipts', receipt.id)
    if (previous && (previous.fingerprint !== receipt.fingerprint || previous.state !== 'pending')) throw new Error('会话操作身份或状态已变化')
    await tx.put({ collection: 'sessionReceipts', id: receipt.id, value: receipt })
    // The same original journal owns each dependent discussion. Recovery can finish
    // them before completing the parent's receipt; no second cleanup scheduler.
    for (const room of discussions) {
      const previous = await tx.get<{ sessionRequestId?: string }>('conversationCleanup', room.id)
      await tx.put({ collection: 'conversationCleanup', id: room.id, value: { ...previous, id: room.id, hide: false, remove: true } })
    }
    await tx.put({ collection: 'conversationCleanup', id: conversation.id, value: { id: conversation.id, hide: true, sessionRequestId: receipt.requestId } })
    return receipt.requestId
  })
}
