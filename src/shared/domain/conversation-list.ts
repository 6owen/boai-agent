/*
 * [OUTPUT]: 2026-10-14 主列表排除归档房间与自动化专用聊天；实际主私聊归一由运行时完成。
 * [INPUT]: 会话记录、列表操作与最近消息时间。
 * [OUTPUT]: 兼容旧记录的置顶/手动顺序及仅隐藏会话的纯更新规则；核心助手与普通会话独立排序；可见核心会话的有界标题更新仅改标题，保留身份、偏好与授权配置。
 * [POS]: 会话列表的跨进程排序真源，不改变聊天历史或群配置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Conversation } from './index'
import { isCoreConversation } from './core-agent'

export const CONVERSATION_TITLE_MAX_LENGTH = 200

export type ConversationListChange =
  | { id: string; action: 'rename'; title: string }
  | { id: string; action: 'pin'; pinned: boolean }
  | { id: string; action: 'hide' }
  | { id: string; action: 'show' }
  | { id: string; action: 'move'; targetId: string; placement: 'before' | 'after' }

export function sortedConversations(conversations: Conversation[], messageTimes: Record<string, string> = {}) {
  const time = (item: Conversation) => [item.lastMessageAt ?? '', messageTimes[item.id] ?? ''].sort().at(-1)!
  return conversations.filter(item => !item.list?.hidden && !item.mergedInto && item.purpose !== 'automation').sort((a, b) =>
    Number(Boolean(b.list?.pinned)) - Number(Boolean(a.list?.pinned)) ||
    (a.list?.order ?? -1) - (b.list?.order ?? -1) ||
    time(b).localeCompare(time(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export function conversationListUpdates(conversations: Conversation[], change: ConversationListChange, messageTimes: Record<string, string> = {}): Conversation[] {
  const item = conversations.find(item => item.id === change.id)
  if (!item) throw new Error('会话不存在')
  const visible = sortedConversations(conversations, messageTimes)
  const sameSection = (other: Conversation) => isCoreConversation(other) === isCoreConversation(item)
  const putFirst = (pinned: boolean) => [item, ...visible.filter(other => other.id !== item.id && sameSection(other) && Boolean(other.list?.pinned) === pinned)]
    .map((item, order) => ({ ...item, list: { ...item.list, hidden: false, pinned, order } }))
  if (change.action === 'hide') return [{ ...item, list: { hidden: true, pinned: false } }]
  if (change.action === 'show') return item.list?.hidden ? putFirst(false) : []
  if (item.list?.hidden) throw new Error('请先从通讯录打开会话')
  if (change.action === 'rename') {
    if (!isCoreConversation(item)) throw new Error('仅核心助手会话可编辑标题')
    const title = change.title.trim()
    if (!title || title.length > CONVERSATION_TITLE_MAX_LENGTH) throw new Error(`会话标题应为 1–${CONVERSATION_TITLE_MAX_LENGTH} 个字符`)
    return [{ ...item, title }]
  }
  if (change.action === 'pin') return putFirst(change.pinned)
  const target = visible.find(item => item.id === change.targetId)
  if (!target) throw new Error('目标会话不存在')
  if (!sameSection(target)) throw new Error('请在同一会话分类内排序')
  if (Boolean(target.list?.pinned) !== Boolean(item.list?.pinned)) throw new Error('请在同一置顶分组内排序')
  if (target.id === item.id) return []
  const ordered = visible.filter(candidate => sameSection(candidate) && Boolean(candidate.list?.pinned) === Boolean(item.list?.pinned) && candidate.id !== item.id)
  const index = ordered.findIndex(candidate => candidate.id === target.id) + (change.placement === 'after' ? 1 : 0)
  ordered.splice(index, 0, item)
  return ordered.map((item, order) => ({ ...item, list: { ...item.list, order } }))
}
