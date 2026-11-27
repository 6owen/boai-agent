/*
 * [OUTPUT]: 已授权会话消息的窗口、当前轮及身份投影归 conversations；模型角色/图片装配归 API 适配器。
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Durable Agent/Session.steer、Workspace 文件工具、LocalSandbox 进程和原生 Trace；授权及发布保留业务适配。
 * [OUTPUT]: 模型消息明确携带用户选择的工作位置；该位置不授予目录访问权。
 * [OUTPUT]: 模型接收用户明确的技能/文件引用，原始可见正文不增加技术字段。
 * [OUTPUT]: 2026-10-14员工浏览器共用宿主；原生只读不认领Work，实际写入惰性认领，引用核源且模型图片与持久摘要分离。
 * [INPUT]: 宿主授权后的公开消息、当前轮次与员工身份。
 * [OUTPUT]: 完整获准历史/当前轮次投影，以及只省略空值的判断消息表示；当前获准图片以原生媒体部件传输，不进入持久正文；bobo有Memory时只投影当前轮次。
 * [POS]: Mastra 消息装配；不通过压缩正文丢弃用户输入。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Message } from '@boai/shared/domain'
import type { EngineContext } from '../../contracts'
import { contextWindow, messageData, partitionTurn } from '../../modules/conversations/message-context'

/** The app transcript is canonical; callers with Mastra Memory pass only the current turn here. */
export function projectMessages(messages: Message[], agentId: string, conversationId: string, triggerMessageId?: string, turnId?: string, images: EngineContext['materialImages'] = []) {
  const window = contextWindow(messages, conversationId)
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
