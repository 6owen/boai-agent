/*
 * [OUTPUT]: 旧独立会话被同一员工任务继续使用时，按每条消息的真实occurrence投影，避免归到首轮执行。
 * [OUTPUT]: 员工任务恢复进入主聊天；旧独立上下文沿原回执投影指令和回复，不重放执行。
 * [OUTPUT]: 公开任务消息身份共用确定性函数，执行镜像按原消息直接核源，不扫描聊天历史。
 * [INPUT]: 公共消息写事务、真实会话/参与者/来源和原阅读事务。
 * [OUTPUT]: 任何新公开消息与对应IM入口可见性同事务；隔离任务按固定归属投影，原回执屏障/执行上下文保持。
 * [POS]: 会话公共消息接收规则，不依赖页面/运行后端或模型是否回答。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationOccurrence, Conversation, DigitalAgent, Message } from '@boai/shared/domain'
import type { MessageCommit, RecordTransaction } from '../../adapters/storage/product-store'
import type { ConversationReadingRepository } from './reading-repository'
import { isCoreAgent } from '@boai/shared/domain/core-agent'

/** All public messages pass here once their owning transaction has prepared its records. */
export async function receiveConversationMessages(tx: RecordTransaction, changes: MessageCommit[], dataPath: string, reading: ConversationReadingRepository) {
  const conversations = new Map<string, Conversation>(), publications: Message[] = []
  const save = async (room: Conversation) => { await tx.put({ collection: 'conversations', id: room.id, value: room }); conversations.set(room.id, room) }
  const show = async (room: Conversation, message: Message) => {
    if (await tx.get('conversationCleanup', room.id)) return
    const lastMessageAt = [room.lastMessageAt ?? '', message.createdAt].sort().at(-1)!
    if (room.list?.hidden || room.lastMessageAt !== lastMessageAt) await save({ ...room, lastMessageAt, list: { ...room.list, hidden: false } })
  }
  const mainPrivate = async (agentId: string) => {
    const agent = await tx.get<DigitalAgent>('agents', agentId)
    if (!agent || isCoreAgent(agent)) return
    const existing = (await tx.list<Conversation>('conversations')).find(room => !room.mergedInto && !room.channel && room.kind === 'direct' && (!room.purpose || room.purpose === 'personal') && room.agentIds.length === 1 && room.agentIds[0] === agentId)
    if (existing) return await tx.get('conversationCleanup', existing.id) ? undefined : existing
    const id = randomUUID(), timestamp = new Date().toISOString()
    const room: Conversation = { id, kind: 'direct', mainPrivate: true, title: agent.name, agentIds: [agentId], mode: 'natural', workspacePath: join(dataPath, 'workspaces', id), sharedKnowledgeIds: [], configVersion: 1, createdAt: timestamp, updatedAt: timestamp }
    await mkdir(room.workspacePath, { recursive: true }); await save(room)
    return room
  }
  for (const { message, inserted } of changes) {
    const source = await tx.get<Conversation>('conversations', message.conversationId)
    if (!source || source.mergedInto || await tx.get('conversationCleanup', source.id)) continue
    // Updates, including stream deltas/reactions/recovery, are not a new receipt.
    if (inserted) await show(source, message)
    if (source.channel || source.channelDiscussion) {
      if (inserted) for (const agentId of source.agentIds) {
        const main = await mainPrivate(agentId)
        // Channel history stays in its own room. Only restore its employee entry here.
        if (main?.list?.hidden) await save({ ...main, list: { ...main.list, hidden: false } })
      }
    } else if (source.purpose === 'automation' && !message.automationPublication) {
      const occurrenceId = message.origin?.occurrenceId ?? source.occurrenceId
      const occurrence = occurrenceId ? await tx.get<AutomationOccurrence>('automationOccurrences', occurrenceId) : undefined
      if (occurrence && occurrence.conversationId !== source.id) continue
      const owner = occurrence?.plan?.owner
      const target = owner?.kind === 'group' ? await tx.get<Conversation>('conversations', owner.conversationId) : source.agentIds.length === 1 ? await mainPrivate(source.agentIds[0]) : undefined
      if (!target || await tx.get('conversationCleanup', target.id)) continue
      const sequence = async () => Math.max(0, ...(await tx.list<Message>('messages')).filter(item => item.conversationId === target.id).map(item => item.sequence))
      const result = await publishTaskMessages(tx, source, target, [message], sequence, reading)
      if (result.conversation) {
        conversations.set(target.id, result.conversation)
        publications.push(...result.messages)
        if (inserted) for (const published of result.messages) await show((await tx.get<Conversation>('conversations', target.id))!, published)
      }
    }
  }
  return { conversations: [...conversations.values()], messages: publications }
}

type Receipt = { id: string; fingerprint: string; conversationId: string; messageId?: string; cleared?: true }

export function automationPublicationIdentity(publication: NonNullable<Message['automationPublication']>) {
  const { automationId, occurrenceId, sourceConversationId, sourceMessageId } = publication
  const fingerprint = createHash('sha256').update(JSON.stringify({ automationId, occurrenceId, sourceConversationId, sourceMessageId })).digest('hex')
  return { id: `automation-chat-${fingerprint}`, fingerprint }
}

/** Runs inside the host mutation lock and one product transaction. */
async function publishTaskMessages(tx: RecordTransaction, source: Conversation, target: Conversation, candidates: Message[], sequence: () => Promise<number>, reading: ConversationReadingRepository) {
  const messages: Message[] = []
  if (source.purpose !== 'automation' || source.mergedInto || !source.agentIds.length || !source.automationId || !source.occurrenceId
    || target.channel || target.mergedInto || target.purpose && target.purpose !== 'personal' || source.agentIds.some(id => !target.agentIds.includes(id))
    || await tx.get('conversationCleanup', source.id) || await tx.get('conversationCleanup', target.id)) return { messages }
  let nextSequence: number | undefined, reopen = false
  for (const candidate of candidates) {
    const original = await tx.get<Message>('messages', candidate.id)
    if (!original || original.conversationId !== source.id || original.automationPublication
      || original.senderType === 'agent' && !source.agentIds.includes(original.senderId)) continue
    const origin = original.origin
    if (origin) {
      const occurrence = await tx.get<AutomationOccurrence>('automationOccurrences', origin.occurrenceId)
      if (!occurrence || occurrence.conversationId !== source.id || occurrence.automationId !== origin.automationId || occurrence.deletedAt) continue
    }
    const publication = { automationId: origin?.automationId ?? source.automationId, occurrenceId: origin?.occurrenceId ?? source.occurrenceId, sourceConversationId: source.id, sourceMessageId: original.id }
    const { id, fingerprint } = automationPublicationIdentity(publication)
    const receipt = await tx.get<Receipt>('messageReceipts', id)
    // Clearing the destination keeps this receipt. A refresh/restart must never restore the cleared text.
    if (receipt?.cleared) continue
    if (receipt && (receipt.fingerprint !== fingerprint || receipt.conversationId !== target.id || receipt.messageId !== id)) throw new Error('定时任务消息的投递身份不一致')
    const previous = receipt ? await tx.get<Message>('messages', id) : undefined
    if (receipt && !previous) throw new Error('定时任务消息已投递但回执不完整，请重启核对')
    if (!previous && nextSequence === undefined) nextSequence = await sequence()
    const message: Message = { id, conversationId: target.id, sequence: previous?.sequence ?? (nextSequence = nextSequence! + 1), createdAt: original.createdAt,
      senderType: original.senderType, senderId: original.senderId, senderName: original.senderName, content: original.content, status: original.status,
      ...(original.origin ? { origin: original.origin } : {}), ...(previous?.reactions ? { reactions: previous.reactions } : {}), automationPublication: publication }
    if (previous && previous.content === message.content && previous.status === message.status) continue
    if (previous?.status === 'completed') throw new Error('已发布的定时任务消息不可被后台更新覆盖')
    await tx.put({ collection: 'messages', id, value: message })
    await tx.put({ collection: 'messageReceipts', id, value: { id, fingerprint, conversationId: target.id, messageId: id } satisfies Receipt })
    await reading.recordCompletion(tx, message)
    messages.push(message)
    if (!previous) reopen = true
  }
  if (!messages.length) return { messages }
  const conversation = { ...target, ...(reopen ? { list: { ...target.list, hidden: false } } : {}) }
  await tx.put({ collection: 'conversations', id: conversation.id, value: conversation })
  return { messages, conversation }
}
