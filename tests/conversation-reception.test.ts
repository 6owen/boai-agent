/*
 * [INPUT]: 真实AppService/ProductStore与隔离员工、会话、公开消息。
 * [OUTPUT]: 所有入口的新消息与会话可见性同事务提交，失败/旧消息更新不恢复隐藏会话。
 * [POS]: IM公共消息受理回归；不访问外部模型或用户数据库。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { Conversation, Message, Snapshot } from '../src/shared/domain'
import { mainConversations } from '../src/shared/domain/conversation-list'

const dispose: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of dispose.splice(0).reverse()) await close() })
async function setup(kind: 'direct' | 'group' = 'direct') {
  const root = await mkdtemp(join(tmpdir(), 'boai-im-reception-')); dispose.push(() => rm(root, { recursive: true, force: true }))
  const service = new AppService({ dataPath: root, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, engine: { test: async () => '', decide: async ctx => ({ action: 'pass', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async () => {} } })
  dispose.push(() => service.close()); await service.init()
  const room = await service.handle('createConversation', { kind, title: '接收消息', agentIds: kind === 'direct' ? ['researcher'] : ['researcher', 'writer'] }) as Conversation
  const snapshot = () => service.handle('snapshot', undefined) as Promise<Snapshot>
  const hide = () => service.handle('updateConversationList', { id: room.id, action: 'hide' })
  const host = service as unknown as { store: ProductStore; conversations: Map<string, Conversation> }
  return { service, room, snapshot, hide, host }
}
it.each(['direct', 'group'] as const)('shows a hidden %s immediately when a user message is accepted', async kind => {
  const f = await setup(kind); await f.hide()
  await f.service.handle('sendMessage', { conversationId: f.room.id, content: '任何入口的新消息', mentionIds: [], requestId: 'new-message' })
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(true)
  expect(await f.host.store.get<Conversation>('conversations', f.room.id)).toMatchObject({ list: { hidden: false } })
})
it.each(['user', 'agent', 'system'] as const)('uses the common commit path for a %s message, without depending on a renderer event', async senderType => {
  const f = await setup(); await f.hide()
  const message: Message = { id: 'committed-message', conversationId: f.room.id, sequence: 1, senderType, senderId: senderType === 'agent' ? 'researcher' : senderType, senderName: senderType, content: '公开消息', status: 'completed', createdAt: new Date().toISOString() }
  await f.host.store.write([{ collection: 'messages', id: message.id, value: message }])
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(true)
  await f.hide()
  await f.host.store.transaction(tx => tx.put({ collection: 'messages', id: message.id, value: message }))
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(false)
  await f.host.store.transaction(tx => tx.put({ collection: 'messages', id: 'another-message', value: { ...message, id: 'another-message', sequence: 2 } }))
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(true)
})
it('does not reopen a conversation or publish a message from a rolled back transaction', async () => {
  const f = await setup(); await f.hide()
  await expect(f.host.store.transaction(async tx => {
    await tx.put({ collection: 'messages', id: 'rolled-back', value: { id: 'rolled-back', conversationId: f.room.id, sequence: 1, senderType: 'user', senderId: 'user', content: '未成功受理', status: 'completed', createdAt: new Date().toISOString() } })
    throw new Error('reject commit')
  })).rejects.toThrow('reject commit')
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(false)
  expect(await f.host.store.get('messages', 'rolled-back')).toBeUndefined()
})
it('restores the employee entry on channel receipt while retaining the real channel room and history', async () => {
  const f = await setup(); await f.hide()
  const channel: Conversation = { ...f.room, id: 'channel-room', mainPrivate: undefined, purpose: 'channel', channel: { platform: 'feishu', tenantId: 'tenant', bindingId: 'binding', chatId: 'external', kind: 'direct', userId: 'owner' }, list: { hidden: true } }
  await f.host.store.write([{ collection: 'conversations', id: channel.id, value: channel }]); f.host.conversations.set(channel.id, channel)
  const message: Message = { id: 'channel-message', conversationId: channel.id, sequence: 1, senderType: 'user', senderId: 'external-owner', senderName: '外部来信', content: '已收到，不必等待回复', status: 'completed', createdAt: new Date().toISOString() }
  await f.host.store.transaction(tx => tx.put({ collection: 'messages', id: message.id, value: message }))
  expect(mainConversations((await f.snapshot()).conversations).some(room => room.id === f.room.id)).toBe(true)
  expect(await f.host.store.get<Conversation>('conversations', channel.id)).toMatchObject({ list: { hidden: false } })
  expect((await f.host.store.load<Message>('messages')).filter(item => item.conversationId === f.room.id)).toEqual([])
  expect(await f.host.store.get<Message>('messages', message.id)).toMatchObject({ conversationId: channel.id, senderId: 'external-owner' })
})
