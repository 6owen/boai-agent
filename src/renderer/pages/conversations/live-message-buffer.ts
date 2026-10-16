/*
 * [INPUT]: 当前聊天读取与读取期间的实时消息事件。
 * [OUTPUT]: 只保留当前读取的同会话增量；读取结束、替换或来源清理立即释放正文引用。
 * [POS]: 主聊天分页/后台核读的短期竞态缓冲，不作为历史消息缓存。
 * [PROTOCOL]: 修改时同步Header与所属.folder.md。
 */
import type { Message } from '@shared/domain'

interface Capture { conversationId: string; messages: Map<string, Message> }
export class LiveMessageBuffer {
  private current?: Capture
  begin(conversationId: string): Capture {
    this.clear()
    const capture = { conversationId, messages: new Map<string, Message>() }
    this.current = capture
    return capture
  }
  add(message: Message): void {
    if (this.current?.conversationId === message.conversationId) this.current.messages.set(message.id, message)
  }
  finish(capture: Capture): void {
    capture.messages.clear()
    if (this.current === capture) this.current = undefined
  }
  clear(conversationId?: string): void {
    if (this.current && (conversationId === undefined || this.current.conversationId === conversationId)) this.finish(this.current)
  }
}
