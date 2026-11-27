/*
 * [INPUT]: Host-authorized messages, conversation identity and optional current-turn identity.
 * [OUTPUT]: Ordered completed conversation text, current/history partitions and stable source records consumed by both kinds of employee.
 * [POS]: Conversation evidence contract; callers control visibility, scope and memory persistence.
 * [PROTOCOL]: Update this header and the conversations directory map when changing source projections.
 */
import type { Message } from '@boai/shared/domain'

/** Callers authorize the input. Keep every completed nonempty message from the requested conversation. */
export function contextWindow(messages: Message[], conversationId: string) {
  return messages
    .filter(message => message.conversationId === conversationId && message.status === 'completed' && message.content.trim())
    .sort((a, b) => a.sequence - b.sequence)
}

export function partitionTurn(messages: Message[], triggerMessageId?: string, turnId?: string) {
  const root = messages.find(message => message.id === triggerMessageId)
    ?? [...messages].reverse().find(message => message.senderType === 'user')
    ?? messages.at(-1)
  const id = turnId ?? root?.turnId
  const isCurrent = (message: Message) => message.id === root?.id || (id ? message.turnId === id : !!root && message.sequence >= root.sequence)
  return { root, id, current: messages.filter(isCurrent), history: messages.filter(message => !isCurrent(message)) }
}

/** Native sessions persist digests of these records. Preserve their serialized field order. */
export function messageData(message: Message, rootId?: string) {
  return {
    id: message.id,
    turnId: message.turnId ?? null,
    sequence: message.sequence,
    createdAt: message.createdAt,
    isRootRequest: message.id === rootId,
    senderType: message.senderType,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    ...(message.workingDirectory ? { workingDirectory: message.workingDirectory } : {}),
    ...(message.composerReferences?.length ? { resourceReferences: message.composerReferences } : {}),
    ...(message.browserReference ? { browserReference: message.browserReference } : {}),
    mentionIds: message.mentionIds ?? [],
    replyToMessageId: message.replyToMessageId,
  }
}

/** Omit only empty/default metadata; retain content, attribution, ordering and timestamps. */
export function decisionMessageData(message: Message, rootId?: string) {
  const { turnId, mentionIds, isRootRequest, ...data } = messageData(message, rootId)
  return { ...data, ...(turnId ? { turnId } : {}), ...(mentionIds.length ? { mentionIds } : {}), ...(isRootRequest ? { isRootRequest: true } : {}) }
}

export function visibleMessages(context: { messages: Message[]; conversation: { id: string } }) {
  return contextWindow(context.messages, context.conversation.id)
}
