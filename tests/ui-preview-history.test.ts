/*
 * [INPUT]: CI截图实际使用的schedule-ui夹具、原消息与隔离SQLite。
 * [OUTPUT]: 截图执行历史可由生产查询读取，保留原触发/回复关联且重复准备不新增执行。
 * [POS]: PR截图数据接线回归；不启动Electron或调用模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../packages/shared/src/domain'
import type { AutomationOccurrence } from '../packages/shared/src/domain/automations'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { seedScheduleUi } from './e2e/support/schedule-ui'

it('provides stable, readable execution rows through the shared CI screenshot fixture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-preview-history-')), store = new ProductStore(join(root, 'product.sqlite'))
  try {
    await store.init()
    const messages: Message[] = Array.from({ length: 8 }, (_, index) => ({
      id: `message-${index}`, conversationId: 'preview-chat', senderType: index % 2 ? 'agent' : 'user',
      senderId: index % 2 ? 'researcher' : 'user', senderName: index % 2 ? '研究员' : '我',
      content: `预览消息 ${index}`, sequence: index + 1, status: 'completed', createdAt: `2026-11-26T00:00:0${index}.000Z`,
    }))
    await store.write([
      { collection: 'conversations', id: 'preview-chat', value: { id: 'preview-chat', kind: 'direct', agentIds: ['researcher'] } },
      ...messages.map(value => ({ collection: 'messages', id: value.id, value })),
    ])
    await seedScheduleUi(store, 'preview-chat')
    const rows = await store.queryExecutionHistory({ conversationId: 'preview-chat' })
    const occurrences = await store.load<AutomationOccurrence>('automationOccurrences', { conversationId: 'preview-chat' })
    expect(occurrences.find(row => row.status === 'completed')?.messageId).toBe(messages[0].id)
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.run.messageId)).toEqual(['message-7', 'message-5', 'message-3'])
    expect(rows.map(row => row.trigger)).toEqual(['预览消息 6', '预览消息 4', '预览消息 2'])
    expect(rows.every(row => row.run.status === 'completed')).toBe(true)
    await seedScheduleUi(store, 'preview-chat')
    expect(await store.queryExecutionHistory({ conversationId: 'preview-chat' })).toEqual(rows)
    expect(await store.load('messages')).toEqual(messages)
  } finally { await store.close(); await rm(root, { recursive: true, force: true }) }
})
