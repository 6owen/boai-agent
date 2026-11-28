/*
 * [OUTPUT]: 2026-11-27 预览已有记录绑定隔离会话的原消息，验证点击记录后的定位。
 * [OUTPUT]: CI截图与录屏共用已有消息的静态执行历史，支持收起状态截图，不调用模型或触发计划。
 * [INPUT]: 固定时间、隔离SQLite和原会话身份。
 * [OUTPUT]: 预置暂停计划及已结束历史，仅供UI场景；零模型/零计划执行。
 * [POS]: 版本化定时任务UI场景的数据准备。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import type { AgentRun, Message } from '../../../packages/shared/src/domain'
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
  const messages = await store.load<Message>('messages', { conversationId })
  const trigger = messages.find(message => message.senderType === 'user')
  const occurrences: AutomationOccurrence[] = tasks.map((task, index) => ({
    schemaVersion: 1, id: `ui-occurrence-${index}`, stateVersion: 1, automationId: task.id, name: task.name, source: 'schedule',
    scheduledFor: at, startedAt: at, finishedAt: at, status: index === 0 ? 'completed' : index === 1 ? 'failed' : 'skipped',
    deliveryStatus: index === 0 ? 'no_change' : 'blocked', conversationId, ...(index === 0 && trigger ? { messageId: trigger.id } : {}), runIds: [], resultMessageIds: [], usageIncomplete: false,
  }))
  messages.sort((a, b) => a.sequence - b.sequence)
  const history: AgentRun[] = messages.filter(message => message.senderType === 'agent').slice(-3).flatMap(message => {
    const trigger = messages.filter(item => item.senderType === 'user' && item.sequence < message.sequence).at(-1)
    return trigger ? [{
      id: `ui-preview-${message.id}`, conversationId, agentId: message.senderId, agentName: message.senderName,
      triggerMessageId: trigger.id, messageId: message.id, status: 'completed', phase: 'execution',
      createdAt: message.createdAt, finishedAt: message.createdAt, toolEvents: [],
    }] : []
  })
  await store.write([...history.map(value => ({ collection: 'runs', id: value.id, value })), ...tasks.map(value => ({ collection: 'automations', id: value.id, value })), ...occurrences.map(value => ({ collection: 'automationOccurrences', id: value.id, value }))])
}
