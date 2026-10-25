/*
 * [INPUT]: 自动化当前结果/通知偏好、ProductStore 事务与主进程提交回执。
 * [OUTPUT]: 监控按重要性/冷却与显式每次结果偏好提醒；未交付/部分结果与页面共用待处理语义；与结果同事务的通知意图、语义去重、原子领取及 submitted/failed/unknown；中断不盲目重发。
 * [POS]: 自动化通知账本；只记录提醒，不改变业务交付或执行预算。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import type { AutomationDefinition, AutomationInput, AutomationNotice, AutomationNoticeReceipt, AutomationOccurrence } from '@boai/shared/domain/automations'
import { automationNeedsAttention } from '@boai/shared/domain/automations'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
const row = (value: AutomationNotice) => ({ collection: 'automationNotices', id: value.id, value })
export function notificationPolicy(input: AutomationInput, prior?: AutomationDefinition) {
  return input.notificationPolicy ?? (prior?.notificationPolicy === 'important_only' && input.notify === prior.notify ? 'important_only' : input.notify ? 'all_results' : 'muted')
}
function noticeKind(o: AutomationOccurrence): AutomationNotice['kind'] | undefined {
  if (automationNeedsAttention(o)) return 'attention'
  if (o.status === 'completed' || o.status === 'cancelled') return 'result'
}
function wanted(d: AutomationDefinition, o: AutomationOccurrence) {
  const policy = d.notificationPolicy ?? (d.notify ? 'all_results' : 'muted'), kind = noticeKind(o)
  const resultWanted = policy === 'all_results' || kind === 'attention' || (o.monitor ? o.monitor.notification === 'eligible' : o.deliveryStatus === 'delivered' || o.deliveryStatus === 'partial')
  return !d.deletedAt && (o.attentionReason !== 'authorization' || d.executionRevision === o.executionRevision) && policy !== 'muted' && kind && resultWanted
}
export function automationNoticeIdentity(o: AutomationOccurrence) {
  // Repeated authorization failures stay quiet until execution authorization changes.
  const identity = o.attentionReason === 'authorization' ? [o.automationId, 'authorization', o.executionRevision]
    : [o.id, o.status, o.deliveryStatus, [...o.waitingTurnIds ?? []].sort(), [...o.runIds].sort(), [...o.resultMessageIds].sort(), (o.resultEvidence ?? []).map(e => [e.workId, e.resultVersion, e.reference]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}
/** Must run inside the same write transaction as the occurrence state. */
export async function queueAutomationNotice(tx: RecordTransaction, d: AutomationDefinition | undefined, o: AutomationOccurrence) {
  if (!d || !wanted(d, o) || o.notificationDelivered) return
  const id = automationNoticeIdentity(o)
  if (await tx.get('automationNotices', id)) return
  await tx.put(row({ id, automationId: o.automationId, occurrenceId: o.id, conversationId: o.conversationId || undefined, messageId: o.resultMessageIds.at(-1),
    kind: noticeKind(o)!, occurrenceStatus: o.status, deliveryStatus: o.deliveryStatus, status: 'pending', createdAt: new Date().toISOString() }))
}
export async function recoverAutomationNotices(tx: RecordTransaction, restored: boolean) {
  for (const notice of await tx.list<AutomationNotice>('automationNotices')) {
    if (notice.status === 'submitting') {
      notice.status = 'unknown'; notice.error = '提交期间应用中断，系统接收状态未知；不会自动重发'
    } else if (restored && notice.status === 'pending') {
      notice.status = 'suppressed'; notice.error = '从备份恢复，不重发此前待提交的系统提醒'
    } else continue
    notice.finishedAt = new Date().toISOString(); await tx.put(row(notice))
  }
}
export class AutomationNotifications {
  constructor(private store: ProductStore) {}
  take() {
    return this.store.transaction(async tx => {
      const pending = (await tx.list<AutomationNotice>('automationNotices')).filter(n => n.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      for (const notice of pending) {
        const d = await tx.get<AutomationDefinition>('automations', notice.automationId), o = await tx.get<AutomationOccurrence>('automationOccurrences', notice.occurrenceId)
        if (!d || !o || !wanted(d, o) || notice.id !== automationNoticeIdentity(o)) {
          notice.status = 'suppressed'; notice.error = '偏好或运行状态已经变化，本次提醒不再提交'; notice.finishedAt = new Date().toISOString()
          await tx.put(row(notice)); continue
        }
        notice.status = 'submitting'; notice.attemptId = randomUUID(); notice.attemptedAt = new Date().toISOString()
        await tx.put(row(notice)); return notice
      }
      return null
    })
  }
  settle(receipt: AutomationNoticeReceipt) {
    return this.store.transaction(async tx => {
      const notice = await tx.get<AutomationNotice>('automationNotices', receipt.id)
      if (!notice || notice.attemptId !== receipt.attemptId || !(notice.status === 'submitting' || notice.status === 'submitted' && receipt.status === 'failed')) return false
      notice.status = receipt.status; notice.finishedAt = new Date().toISOString(); notice.error = receipt.error?.slice(0, 2000)
      await tx.put(row(notice)); return true
    })
  }
}
