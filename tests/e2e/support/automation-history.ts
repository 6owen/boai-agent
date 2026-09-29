/*
 * [INPUT]: 当前场景独立目录、计划身份与历史数量。
 * [OUTPUT]: 指定触发时刻的历史遮挡数据；隔离到期等待记录的准备；无模型调用的已结束历史记录，用于桌面分页与计划筛选验收。
 * [POS]: Electron 自动化历史数据支撑；仅写入 fixture 数据库。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { AutomationOccurrence } from '../../../src/shared/domain'
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
      const budget = (await tx.get<import('../../../src/shared/domain').WorkBudget>('workBudgets', o.budgetId))!
      budget.deadlineAt = new Date(0).toISOString()
      o.budget.deadlineAt = budget.deadlineAt; o.budget.exhausted = true
      o.status = 'cancelled'; o.cancellationCause = 'budget'; o.reason = '达到本次自动化的时间预算'; o.cancellationRequestedAt = new Date().toISOString(); o.finishedAt = o.cancellationRequestedAt; o.stateVersion++
      await tx.put({ collection: 'workBudgets', id: budget.id, value: budget })
      await tx.put({ collection: 'automationOccurrences', id: o.id, value: o })
    })
  } finally { await store.close() }
}
