/*
 * [INPUT]: 固定时间、隔离SQLite和原会话身份。
 * [OUTPUT]: 预置暂停计划及已结束历史，仅供UI场景；零模型/零计划执行。
 * [POS]: 版本化定时任务UI场景的数据准备。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import type { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { AutomationDefinition, AutomationOccurrence } from '../../../packages/shared/src/domain/automations'
export async function seedScheduleUi(store: ProductStore, conversationId: string) {
  const at = '2026-10-20T01:00:00.000Z'
  const tasks: AutomationDefinition[] = ['AI 新闻早报', '每日复盘日报', '每周五工作周报'].map((name, index) => ({
    schemaVersion: 1, id: `ui-schedule-${index}`, revision: 1, executionRevision: 1, scheduleGeneration: 1,
    scheduleEffectiveAt: at, conversationPolicy: 'existing-conversation', conversationId,
    owner: { kind: 'employee', employeeId: 'researcher' }, employeeIds: ['researcher'],
    name, prompt: name, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Shanghai',
    enabled: false, notify: false, notificationPolicy: 'muted', cron: '0 9 * * *', authorizedFingerprint: 'ui-only', sync: 'synced', appliedRevision: 1, createdAt: at, updatedAt: at,
  }))
  const occurrences: AutomationOccurrence[] = tasks.map((task, index) => ({
    schemaVersion: 1, id: `ui-occurrence-${index}`, stateVersion: 1, automationId: task.id, name: task.name, source: 'schedule',
    scheduledFor: at, startedAt: at, finishedAt: at, status: index === 0 ? 'completed' : index === 1 ? 'failed' : 'skipped',
    deliveryStatus: index === 0 ? 'no_change' : 'blocked', conversationId, runIds: [], resultMessageIds: [], usageIncomplete: false,
  }))
  await store.write([...tasks.map(value => ({ collection: 'automations', id: value.id, value })), ...occurrences.map(value => ({ collection: 'automationOccurrences', id: value.id, value }))])
}
