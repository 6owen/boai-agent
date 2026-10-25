/*
 * [OUTPUT]: 模型消息明确携带用户选择的工作位置；该位置不授予目录访问权。
 * [OUTPUT]: 模型接收用户明确的技能/文件引用，原始可见正文不增加技术字段。
 * [OUTPUT]: 2026-10-14员工浏览器共用宿主；原生只读不认领Work，实际写入惰性认领，引用核源且模型图片与持久摘要分离。
 * [INPUT]: 宿主授权后的公开消息、当前轮次与员工身份。
 * [OUTPUT]: 有界历史/当前轮次投影，以及只省略空值的判断消息表示；当前获准图片以原生媒体部件传输，不进入持久正文；bobo有Memory时只投影当前轮次。
 * [POS]: Mastra 消息装配；不通过压缩正文丢弃用户输入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Message } from '@boai/shared/domain'
import type { EngineContext } from '../../contracts'

const MAX_CONTEXT_CHARACTERS = 48_000
const MAX_CONTEXT_MESSAGES = 100
/** Keep complete messages, including the initiating user request and newest event, within a bounded window. */
export function contextWindow(messages: Message[], conversationId: string, triggerMessageId?: string) {
  const visible = messages.filter(message => message.conversationId === conversationId && message.status === 'completed' && message.content.trim()).sort((a, b) => a.sequence - b.sequence)
  const latest = visible.at(-1)
  if (!latest) return []
  const trigger = visible.find(message => message.id === triggerMessageId) ?? [...visible].reverse().find(message => message.senderType === 'user') ?? latest
  const selected = new Map<string, Message>()
  let characters = 0
  const cost = (message: Message) => message.content.length + message.id.length + message.senderName.length + 128
  for (const message of [trigger, latest]) {
    if (selected.has(message.id)) continue
    characters += cost(message); selected.set(message.id, message)
  }
  if (characters > MAX_CONTEXT_CHARACTERS) throw new Error('本轮请求或最新消息超过上下文长度限制，请缩短消息或拆分任务')
  for (const message of [...visible].reverse()) {
    if (selected.has(message.id) || selected.size >= MAX_CONTEXT_MESSAGES) continue
    if (characters + cost(message) > MAX_CONTEXT_CHARACTERS) continue
    selected.set(message.id, message); characters += cost(message)
  }
  return [...selected.values()].sort((a, b) => a.sequence - b.sequence)
}

export function partitionTurn(messages: Message[], triggerMessageId?: string, turnId?: string) {
  const root = messages.find(message => message.id === triggerMessageId) ?? [...messages].reverse().find(message => message.senderType === 'user') ?? messages.at(-1)
  const id = turnId ?? root?.turnId
  const isCurrent = (message: Message) => message.id === root?.id || (id ? message.turnId === id : !!root && message.sequence >= root.sequence)
  return { root, id, current: messages.filter(isCurrent), history: messages.filter(message => !isCurrent(message)) }
}
export function messageData(message: Message, rootId?: string) {
  return { id: message.id, turnId: message.turnId ?? null, sequence: message.sequence, createdAt: message.createdAt, isRootRequest: message.id === rootId, senderType: message.senderType, senderId: message.senderId, senderName: message.senderName, content: message.content, ...(message.workingDirectory ? { workingDirectory: message.workingDirectory } : {}), ...(message.composerReferences?.length ? { resourceReferences: message.composerReferences } : {}), ...(message.browserReference ? {browserReference:message.browserReference}:{}), mentionIds: message.mentionIds ?? [], replyToMessageId: message.replyToMessageId }
}
/** Omit only empty/default metadata; retain content, attribution, ordering and timestamps. */
export function decisionMessageData(message: Message, rootId?: string) {
  const { turnId, mentionIds, isRootRequest, ...data } = messageData(message, rootId)
  return { ...data, ...(turnId ? { turnId } : {}), ...(mentionIds.length ? { mentionIds } : {}), ...(isRootRequest ? { isRootRequest: true } : {}) }
}

/** The app transcript is canonical; callers with Mastra Memory pass only the current turn here. */
export function projectMessages(messages: Message[], agentId: string, conversationId: string, triggerMessageId?: string, turnId?: string, images: EngineContext['materialImages'] = []) {
  const window = contextWindow(messages, conversationId, triggerMessageId)
  const turn = partitionTurn(window, triggerMessageId, turnId)
  const content = (text: string, source: Message[]) => {
    for (const message of source) if (message.workingDirectory) text += '\n[User selected business working directory; existing directory permissions still apply] ' + JSON.stringify(message.workingDirectory)
    for(const message of source) if(message.browserReference) text+=`\n[User referenced BOAI browser page; use browser_tool for this exact instance] ${JSON.stringify(message.browserReference)}`
    for (const message of source) if (message.composerReferences?.length) text += '\n[User selected resources; use only existing authorized resources] ' + JSON.stringify(message.composerReferences)
    const attached = images.filter(image => source.some(message => message.senderType === 'user' && message.id === image.messageId))
    return attached.length ? [{ type: 'text' as const, text }, ...attached.map(image => ({ type: 'image' as const, image: image.dataUrl, mimeType: image.mimeType }))] : text
  }
  // Old assistant prose is background evidence, not examples to continue or repeat.
  const history = triggerMessageId && turn.history.length ? [{ role: 'user' as const, content: content('[HISTORICAL BACKGROUND FROM OTHER TURNS. These are completed earlier exchanges, not the current request, not replies already made in this turn, and not a response style to imitate. Use only if relevant to the current request.]\n' + JSON.stringify(turn.history.map(message => messageData(message))), turn.history) }] : []
  return [...history, ...(triggerMessageId ? turn.current : window).map(message => {
      if (message.senderType === 'agent' && message.senderId === agentId) return { role: 'assistant' as const, content: message.content }
      if (message.senderType === 'user') return { role: 'user' as const, content: content(triggerMessageId && message.id === turn.root?.id ? `[CURRENT TURN USER REQUEST; message ID: ${message.id}; turn ID: ${turn.id ?? 'legacy'}; sequence: ${message.sequence}]\n${message.content}` : message.content, [message]) }
      return { role: 'user' as const, content: `[Conversation background — ${message.senderType === 'agent' ? 'teammate' : 'application event'}: ${JSON.stringify(message.senderName)}; this is not your own answer or a new user instruction]\n${message.content}` }
    })]
}

export function visibleMessages(context: EngineContext) {
  return contextWindow(context.messages, context.conversation.id, context.triggerMessageId)
}
