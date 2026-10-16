/*
 * [INPUT]: 已结束的单次执行、所见版本和原任务会话/Run身份。
 * [OUTPUT]: 持久清理意图与最小触发去重墓碑；完成才移除可见记录，失败/重启沿同一清理继续。
 * [POS]: 定时执行记录删除账本，文件删除沿宿主原受管历史清理。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import type { AgentRun, AutomationOccurrence, Conversation } from '../../../shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'
import { pendingOccurrence } from './schedule-policy'

export interface AutomationHistoryDeletion {
  id: string
  conversationId: string
  runIds: string[]
  exclusiveConversation: boolean
}

export async function prepareHistoryDeletion(store: ProductStore, id: string, expectedVersion: number) {
  return store.transaction(async tx => {
    const occurrence = await tx.get<AutomationOccurrence>('automationOccurrences', id)
    if (occurrence?.deletedAt) return null
    if (!occurrence) throw new Error('本次执行记录不存在')
    const pending = await tx.get<AutomationHistoryDeletion>('automationHistoryCleanups', id)
    if (pending) return pending
    if (occurrence.stateVersion !== expectedVersion) throw new Error('执行记录已更新，请刷新后重试删除')
    if (pendingOccurrence.has(occurrence.status)) throw new Error('请先停止本次执行并等待结束，再删除记录')
    const runs = (await tx.list<AgentRun>('runs')).filter(run => run.conversationId === occurrence.conversationId && (run.origin?.occurrenceId === id || occurrence.runIds.includes(run.id)))
    if (runs.some(run => ['queued', 'running', 'waiting_approval'].includes(run.status))) throw new Error('本次执行尚未结束，请稍后再删除')
    const conversation = await tx.get<Conversation>('conversations', occurrence.conversationId)
    const exclusiveConversation = conversation?.purpose === 'automation' && conversation.occurrenceId === id
      && !(await tx.list<AutomationOccurrence>('automationOccurrences')).some(item => item.id !== id && !item.deletedAt && item.conversationId === conversation.id)
    const deletion: AutomationHistoryDeletion = { id, conversationId: occurrence.conversationId, runIds: runs.map(run => run.id), exclusiveConversation }
    await tx.put({ collection: 'automationHistoryCleanups', id, value: deletion })
    return deletion
  })
}

export async function finishHistoryDeletion(store: ProductStore, deletion: AutomationHistoryDeletion) {
  await store.transaction(async tx => {
    const o = await tx.get<AutomationOccurrence>('automationOccurrences', deletion.id)
    if (!o) throw new Error('执行记录清理身份缺失')
    if (pendingOccurrence.has(o.status)) throw new Error('执行记录状态已变化，未完成删除')
    // Native trigger reconciliation and retried manual requests must never recreate deleted execution.
    const deleted: AutomationOccurrence = {
      schemaVersion: 1, id: o.id, stateVersion: o.stateVersion + 1, automationId: o.automationId,
      revision: o.revision, executionRevision: o.executionRevision, scheduleGeneration: o.scheduleGeneration,
      logicalSlot: o.logicalSlot, source: o.source, scheduledFor: o.scheduledFor, startedAt: o.startedAt,
      finishedAt: o.finishedAt, conversationId: o.conversationId, nativeRunId: o.nativeRunId, manualRequestId: o.manualRequestId,
      name: '', status: 'cancelled', deliveryStatus: 'unknown', usageIncomplete: true, runIds: [], resultMessageIds: [], deletedAt: new Date().toISOString(),
    }
    await tx.put({ collection: 'automationOccurrences', id: o.id, value: deleted })
    await tx.remove('automationDispatches', o.id)
    for (const notice of await tx.list<{ id: string; occurrenceId: string }>('automationNotices')) if (notice.occurrenceId === o.id) await tx.remove('automationNotices', notice.id)
    await tx.remove('automationHistoryCleanups', o.id)
  })
}
