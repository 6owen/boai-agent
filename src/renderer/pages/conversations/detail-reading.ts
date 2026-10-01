/*
 * [INPUT]: 明确会话/消息身份、现有有界历史 IPC 与当前标签生命周期。
 * [OUTPUT]: 每次只核对一个固定消息、最多四项并行的分批详情正文；来源失效仅返回原因，隐藏/迟到停止后续批次。
 * [POS]: 成果、执行与单次自动化结果共用的个人详情读取；不回拉全聊天，不产生阅读或业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { DesktopApi } from '@shared/ipc'
import type { ConversationMessageItem } from '@shared/domain/reading'

const DETAIL_MESSAGE_CONCURRENCY = 4
export async function readDetailMessages(api: Pick<DesktopApi, 'request'>, conversationId: string, messageIds: string[], current: () => boolean): Promise<ConversationMessageItem[]> {
  const ids = [...new Set(messageIds)], items: ConversationMessageItem[] = []
  for (let start = 0; start < ids.length && current(); start += DETAIL_MESSAGE_CONCURRENCY) {
    const batch = await Promise.all(ids.slice(start, start + DETAIL_MESSAGE_CONCURRENCY).map(async messageId => {
      try {
        const page = await api.request('listConversationMessages', { conversationId, aroundMessageId: messageId, limit: 1 })
        const item = page.items.find(value => value.messageId === messageId)
        if (page.conversationId !== conversationId || !item || item.message && (item.message.id !== messageId || item.message.conversationId !== conversationId)) throw new Error('原消息身份不一致，请重新核对明确目标。')
        return item
      } catch (failure) { return { messageId, sequence: 0, status: 'unavailable' as const, reason: failure instanceof Error ? failure.message : '原消息暂不可用，请重新核对。' } }
    }))
    if (!current()) return []
    items.push(...batch)
  }
  return current() ? items : []
}
