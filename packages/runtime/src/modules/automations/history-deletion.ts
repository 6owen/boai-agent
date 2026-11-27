/*
 * [INPUT]: 单次定时记录、所见版本及原触发身份。
 * [OUTPUT]: 原子移除可见日志和通知，保留最小去重墓碑，不改会话或其执行数据。
 * [POS]: 定时日志的独立删除入口，并供会话删除生成相同墓碑。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { AutomationOccurrence, Conversation } from '@boai/shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'
import { pendingOccurrence } from './schedule-policy'

export function deletedAutomationHistory(o: AutomationOccurrence): AutomationOccurrence {
  return {
    schemaVersion: 1, id: o.id, stateVersion: (o.stateVersion ?? 0) + 1, automationId: o.automationId,
    revision: o.revision, executionRevision: o.executionRevision, scheduleGeneration: o.scheduleGeneration,
    logicalSlot: o.logicalSlot, source: o.source, scheduledFor: o.scheduledFor, startedAt: o.startedAt,
    finishedAt: o.finishedAt, conversationId: '', nativeRunId: o.nativeRunId, manualRequestId: o.manualRequestId,
    name: '', status: 'cancelled', deliveryStatus: 'unknown', usageIncomplete: true, runIds: [], resultMessageIds: [],
    deletedAt: new Date().toISOString(),
  }
}

// Older builds cleared and hid a deleted session but left its log visible.
export async function recoverHistoryDeletions(store: ProductStore) {
  await store.transaction(async tx => {
    const pending = new Set((await tx.list<{ id: string }>('automationHistoryCleanups')).map(item => item.id))
    const removed = new Set<string>()
    for (const occurrence of await tx.list<AutomationOccurrence>('automationOccurrences')) {
      if (occurrence.deletedAt) continue
      if (!pending.has(occurrence.id)) {
        if (occurrence.reason !== '聊天记录已清空') continue
        const room = await tx.get<Conversation>('conversations', occurrence.conversationId)
        if (room && !room.list?.hidden) continue
      }
      if (pendingOccurrence.has(occurrence.status)) { pending.delete(occurrence.id); continue }
      await tx.put({ collection: 'automationOccurrences', id: occurrence.id, value: deletedAutomationHistory(occurrence) })
      await tx.remove('automationDispatches', occurrence.id)
      removed.add(occurrence.id)
    }
    if (removed.size) {
      for (const notice of await tx.list<{ id: string; occurrenceId: string }>('automationNotices')) {
        if (removed.has(notice.occurrenceId)) await tx.remove('automationNotices', notice.id)
      }
    }
    for (const id of pending) await tx.remove('automationHistoryCleanups', id)
  })
}

export async function deleteHistoryRecord(store: ProductStore, id: string, expectedVersion: number) {
  return store.transaction(async tx => {
    const occurrence = await tx.get<AutomationOccurrence>('automationOccurrences', id)
    if (!occurrence) throw new Error('本次执行记录不存在')
    if (occurrence.deletedAt) return
    if (pendingOccurrence.has(occurrence.status)) throw new Error('请先停止本次执行并等待结束，再删除记录')
    if (occurrence.stateVersion !== expectedVersion) throw new Error('执行记录已更新，请刷新后重试删除')
    await tx.put({ collection: 'automationOccurrences', id, value: deletedAutomationHistory(occurrence) })
    await tx.remove('automationDispatches', id)
    for (const notice of await tx.list<{ id: string; occurrenceId: string }>('automationNotices')) {
      if (notice.occurrenceId === id) await tx.remove('automationNotices', notice.id)
    }
    return occurrence.conversationId
  })
}
