/*
 * [OUTPUT]: 执行记录面板夹具提供同会话不同occurrence与公开过程原件，验证不串记录。
 * [INPUT]: 当前场景独立目录、计划身份与历史数量。
 * [OUTPUT]: 指定触发时刻的历史遮挡数据；隔离到期等待记录的准备；无模型调用的已结束历史记录，用于桌面分页与计划筛选验收。
 * [POS]: Electron 自动化历史数据支撑；仅写入 fixture 数据库。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { AutomationOccurrence } from '../../../packages/shared/src/domain'
import { ExecutionRepository } from '../../../packages/runtime/src/modules/conversations/execution'

export async function seedAutomationProcesses(root: string, automationId: string, conversationId: string) {
  const store = new ProductStore(join(root, 'boai.sqlite'))
  await store.init()
  try {
    const execution = new ExecutionRepository(store, () => {})
    for (let index = 0; index < 3; index++) {
      const id = `${automationId}-process-${index}`, runId = `${id}-run`, startedAt = `2026-10-1${index + 1}T01:00:00.000Z`
      const message: import('../../../packages/shared/src/domain').Message = { id: `${id}-request`, conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: `第${index + 1}次天气查询`, status: 'completed', sequence: index * 2 + 1, createdAt: startedAt }
      const result: typeof message = { ...message, id: `${id}-result`, senderType: 'agent', senderId: 'researcher', senderName: '研究员', content: `南京天气结果 ${index + 1}`, sequence: index * 2 + 2, runId }
      const run: import('../../../packages/shared/src/domain').AgentRun = { id: runId, conversationId, agentId: 'researcher', agentName: '研究员', triggerMessageId: message.id, messageId: result.id, status: 'completed', phase: 'execution', createdAt: startedAt, finishedAt: startedAt, toolEvents: [] }
      const occurrence: AutomationOccurrence = { schemaVersion: 1, stateVersion: 1, id, automationId, name: `天气记录 ${index + 1}`, source: 'schedule', startedAt, scheduledFor: startedAt, finishedAt: startedAt, status: 'completed', deliveryStatus: 'delivered', conversationId, messageId: message.id, runIds: [runId], resultMessageIds: [result.id], modelCalls: 1, usageIncomplete: true }
      await store.write([{ collection: 'messages', id: message.id, value: message }, { collection: 'messages', id: result.id, value: result }, { collection: 'runs', id: run.id, value: run }, { collection: 'automationOccurrences', id: occurrence.id, value: occurrence }])
      await execution.append(run, { id: `${run.id}-text`, eventType: 'agent.text.block', payload: { text: result.content } })
    }
  } finally { await store.close() }
}
export async function seedAutomationHistory(root: string, automationId: string, count: number, startedAt = '2025-01-01T00:00:00.000Z') {
  const store = new ProductStore(join(root, 'boai.sqlite'))
  await store.init()
  try {
    const records: AutomationOccurrence[] = Array.from({ length: count }, (_, index) => ({ schemaVersion: 1, id: `${automationId}-${String(index).padStart(4, '0')}`, stateVersion: 1, automationId, name: `过往记录 ${index}`, source: 'schedule', startedAt, scheduledFor: startedAt, status: 'completed', deliveryStatus: 'unknown', conversationId: 'historical-chat', runIds: [], resultMessageIds: [], usageIncomplete: true }))
    await store.write(records.map(value => ({ collection: 'automationOccurrences', id: value.id, value })))
  } finally { await store.close() }
}

/** Seed an elapsed, fully stopped waiting occurrence without waiting five real minutes. */
export async function seedExpiredAutomationBudget(root: string, occurrenceId: string) {
  const store = new ProductStore(join(root, 'boai.sqlite'))
  await store.init()
  try {
    await store.transaction(async tx => {
      const o = (await tx.get<AutomationOccurrence>('automationOccurrences', occurrenceId))!
      if (o.status !== 'waiting_user' || !o.budgetId || !o.budget) throw new Error('Fixture requires a settled clarification')
      const budget = (await tx.get<import('../../../packages/shared/src/domain').WorkBudget>('workBudgets', o.budgetId))!
      budget.deadlineAt = new Date(0).toISOString()
      o.budget.deadlineAt = budget.deadlineAt; o.budget.exhausted = true
      o.status = 'cancelled'; o.cancellationCause = 'budget'; o.reason = '达到本次自动化的时间预算'; o.cancellationRequestedAt = new Date().toISOString(); o.finishedAt = o.cancellationRequestedAt; o.stateVersion++
      await tx.put({ collection: 'workBudgets', id: budget.id, value: budget })
      await tx.put({ collection: 'automationOccurrences', id: o.id, value: o })
    })
  } finally { await store.close() }
}
