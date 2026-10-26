/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [INPUT]: 宿主保存的渠道/内部会话关系、阅读代际与固定原消息。
 * [OUTPUT]: 内部讨论仅可引用自己的原渠道；核对清理/成员/内容身份，不授予对外发送或跨渠道权限。
 * [POS]: 渠道内部讨论与文件修订共用的来源核验。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { createHash } from 'node:crypto'
import type { Conversation, Message } from '@boai/shared/domain'
import type { ChannelMessageReference } from '@boai/shared/domain/channels'
import type { RecordTransaction } from '../../adapters/storage/product-store'

export const channelContentHash = (message: Message) => createHash('sha256').update(JSON.stringify([message.id, message.conversationId, message.content, message.status])).digest('hex')
export async function assertChannelSourceAccess(tx: RecordTransaction, conversationId: string, sourceId: string) {
  if (conversationId === sourceId) return
  const room = await tx.get<Conversation>('conversations', conversationId), source = await tx.get<Conversation>('conversations', sourceId)
  const clock = await tx.get<{ epoch: number }>('conversationCompletionClocks', sourceId)
  if (!room || room.purpose !== 'channel-internal' || room.channelDiscussion?.conversationId !== sourceId || room.channelDiscussion.epoch !== (clock?.epoch ?? 1) || !source?.channel || source.mergedInto || room.agentIds.length !== 1 || source.agentIds.length !== 1 || room.agentIds[0] !== source.agentIds[0] || await tx.get('conversationCleanup', sourceId) || await tx.get('conversationCleanup', conversationId)) throw new Error('内部讨论的原渠道来源已失效，请重新打开渠道。')
}
export async function channelReferenceMessage(tx: RecordTransaction, conversationId: string, ref: ChannelMessageReference) {
  if (conversationId === ref.conversationId) throw new Error('渠道消息须在独立内部讨论中引用。')
  await assertChannelSourceAccess(tx, conversationId, ref.conversationId)
  const message = await tx.get<Message>('messages', ref.messageId)
  if (!message || message.conversationId !== ref.conversationId || message.status !== 'completed' || channelContentHash(message) !== ref.contentHash) throw new Error('引用的渠道消息已变化或清理，请重新选择。')
  return message
}
