/*
 * [OUTPUT]: 清空/房间迁移同时失效pluginSessions，旧历史不重解释或重放。
 * [OUTPUT]: 2026-10-14 保存旧成果/清理意图的原存储房间，业务归属迁移不改变原件位置。
 * [INPUT]: 空闲房间、原产品事务及明确的房间归一关系。
 * [OUTPUT]: 同事务保留业务ID/文件路径/回执、迁移房间引用及历史顺序；旧原生线程失效，新消息才重建。
 * [POS]: 现有记录的房间迁移，不启动模型、不投递平台消息。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { Conversation, Message } from '@boai/shared/domain'
import type { RecordTransaction, StoredRecord } from '../../adapters/storage/product-store'
import type { ConversationCompletion, ConversationReadingState } from '@boai/shared/domain/reading'
import { completionHash } from './reading-repository'

const scopeKeys = new Set(['conversationId', 'sourceConversationId', 'groupConversationId', 'coreConversationId'])
function remap(value: unknown, oldIds: Set<string>, targetId: string, key = ''): unknown {
  if (typeof value === 'string') return scopeKeys.has(key) && oldIds.has(value) ? targetId : value
  if (Array.isArray(value)) return value.map(item => key === 'conversationIds' && typeof item === 'string' && oldIds.has(item) ? targetId : remap(item, oldIds, targetId))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, field === 'id' && key === 'conversation' && typeof item === 'string' && oldIds.has(item) ? targetId : remap(item, oldIds, targetId, field)]))
}

/** Caller holds the runtime mutation lock and checks that all affected rooms are idle. */
export async function mergeRooms(tx: RecordTransaction, target: Conversation, rooms: Conversation[]): Promise<StoredRecord[]> {
  if (!rooms.length) { await tx.put({ collection: 'conversations', id: target.id, value: target }); return [{ collection: 'conversations', id: target.id, value: target }] }
  const oldIds = new Set(rooms.map(room => room.id)), scope = new Set([target.id, ...oldIds])
  for (const id of scope) if (await tx.get('conversationCleanup', id)) throw new Error('聊天清理待核对，不能归一历史。')
  const original = await tx.conversationRecords([...scope])
  const messages = original.filter(record => record.collection === 'messages').map(record => record.value as Message).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.conversationId === b.conversationId ? a.sequence - b.sequence : a.conversationId.localeCompare(b.conversationId)) || a.id.localeCompare(b.id))
  const sequences = new Map(messages.map((message, index) => [message.id, index + 1]))
  const changes: StoredRecord[] = []
  const clocks = original.filter(record => record.collection === 'conversationCompletionClocks').map(record => record.value as { epoch: number; legacyCompletedUnknown: boolean })
  const epoch = Math.max(0, ...clocks.map(clock => clock.epoch)) + 1
  const states = original.filter(record => record.collection === 'conversationReadingStates').map(record => record.value as ConversationReadingState)
  const completions = original.filter(record => record.collection === 'conversationCompletions').map(record => record.value as ConversationCompletion).sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id))
  const seen = new Set(completions.filter(completion => states.some(state => state.conversationId === completion.conversationId && state.epoch === completion.epoch && (state.boundary >= completion.ordinal || state.sparseSeen.includes(completion.ordinal)))).map(completion => completion.messageId))
  const completionOrder = new Map(completions.map((completion, index) => [completion.id, index + 1]))
  const updatedMessages = new Map<string, Message>()
  for (const record of original) {
    // Read/index observations belong to the previous sequence domain; rebuild them.
    if (['conversationReadingStates', 'conversationCompletionClocks', 'conversationSearchBodies'].includes(record.collection)) { await tx.remove(record.collection, record.id); continue }
    let value = remap(record.value, oldIds, target.id) as Record<string, unknown>
    if (record.collection === 'messages') { value = { ...value, sequence: sequences.get(record.id), ...(oldIds.has((record.value as Message).conversationId) ? { originalConversationId: (record.value as Message).originalConversationId ?? (record.value as Message).conversationId } : {}) }; updatedMessages.set(record.id, value as unknown as Message) }
    if (['artifacts', 'artifactCleanups', 'artifactPublicationIntents'].includes(record.collection) && oldIds.has((record.value as { conversationId: string }).conversationId)) value = { ...value, storageConversationId: value.storageConversationId ?? (record.value as { conversationId: string }).conversationId }
    if (record.collection === 'conversationCompletions') continue
    if (record.collection === 'codexSessions' || record.collection === 'claudeSessions' || record.collection === 'pluginSessions') value = { ...value, resumeInvalidated: 'room-merged' }
    const updated = { ...record, value }
    if (JSON.stringify(value) !== JSON.stringify(record.value)) { await tx.put(updated); changes.push(updated) }
  }
  for (const completion of completions) {
    const message = updatedMessages.get(completion.messageId) ?? await tx.get<Message>('messages', completion.messageId)
    if (!message) throw new Error('历史阅读完成来源缺失，不能归一。')
    await tx.put({ collection: 'conversationCompletions', id: completion.id, value: { ...completion, conversationId: target.id, epoch, ordinal: completionOrder.get(completion.id), contentHash: completionHash(message) } })
  }
  let boundary = 0
  while (boundary < completions.length && seen.has(completions[boundary].messageId)) boundary++
  await tx.put({ collection: 'conversationCompletionClocks', id: target.id, value: { id: target.id, conversationId: target.id, epoch, ordinal: completions.length, legacyCompletedUnknown: clocks.some(clock => clock.legacyCompletedUnknown) } })
  await tx.put({ collection: 'conversationReadingStates', id: target.id, value: { id: target.id, conversationId: target.id, userId: 'user', epoch, revision: Math.max(0, ...states.map(state => state.revision)) + 1, boundary, sparseSeen: completions.flatMap((completion, index) => index >= boundary && seen.has(completion.messageId) ? [index + 1] : []), anchor: null } })
  const merged: Conversation = { ...target, agentIds: [...new Set([...target.agentIds, ...rooms.flatMap(room => room.agentIds)])], configVersion: (target.configVersion ?? 1) + 1, updatedAt: new Date().toISOString() }
  for (const conversation of [merged, ...rooms.map(room => ({ ...room, mergedInto: target.id, list: { ...room.list, hidden: true } }))]) {
    const record = { collection: 'conversations', id: conversation.id, value: conversation }; await tx.put(record); changes.push(record)
  }
  return changes
}
