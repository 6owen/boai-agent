/*
 * [INPUT]: 会话/员工快照、草稿、列表更新回调与统一 UI 组件。
 * [OUTPUT]: 单加号入口、成员拼图头像、可拖拽排序及右键置顶/删除的紧凑会话列表。
 * [POS]: 会话列表交互；持久化通过 Shell 的类型化请求完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState, type DragEvent } from 'react'
import { cn } from 'cn'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Pin, Search, Trash2 } from '@/components/icons'
import type { Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import { sortedConversations, type ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { GroupAvatar } from '@/components/common/group-avatar'
import { type ChatDraft } from '../presentation'

type DropTarget = { id: string; placement: 'before' | 'after' }
interface Props {
  snapshot: Snapshot; selectedId: string | null; query: string; onQuery(value: string): void
  previews: Record<string, string>; messageTimes: Record<string, string>; drafts: Map<string, ChatDraft>
  onSelect(id: string): void; onCreate(kind: 'agent' | 'group'): void
  onChange(change: ConversationListChange): void; busy: boolean
}
export function ConversationList({ snapshot, selectedId, query, onQuery, previews, messageTimes, drafts, onSelect, onCreate, onChange, busy }: Props) {
  const [dragged, setDragged] = useState<string | null>(null), [target, setTarget] = useState<DropTarget | null>(null)
  const conversations = sortedConversations(snapshot.conversations, messageTimes).filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
  const finishDrag = () => { setDragged(null); setTarget(null) }
  const dropTarget = (event: DragEvent, conversation: Conversation): DropTarget | null => {
    const source = conversations.find(item => item.id === dragged)
    if (busy || !source || source.id === conversation.id || Boolean(source.list?.pinned) !== Boolean(conversation.list?.pinned)) return null
    const box = event.currentTarget.getBoundingClientRect()
    return { id: conversation.id, placement: event.clientY < box.y + box.height / 2 ? 'before' : 'after' }
  }
  return <div className="conversation-list-panel">
    <div className="list-heading"><h2>会话</h2><div className="list-heading-actions"><AddContactMenu onCreate={onCreate} /></div></div>
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => onQuery(event.target.value)} /></InputGroup>
    <div className="conversation-list" role="navigation" aria-label="会话列表" onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null) }}>
      {conversations.map(conversation => {
        const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0])
        const messageTime = [messageTimes[conversation.id] ?? '', conversation.lastMessageAt ?? ''].sort().at(-1)!
        const members = conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
        return <div className="conversation-row" key={conversation.id} data-drop={target?.id === conversation.id ? target.placement : undefined}
          onDragOver={event => { const next = dropTarget(event, conversation); setTarget(next); if (next) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
          onDrop={event => { const next = dropTarget(event, conversation); if (next && dragged) { event.preventDefault(); onChange({ id: dragged, action: 'move', targetId: next.id, placement: next.placement }) } finishDrag() }}>
          <ContextMenu>
            <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selectedId === conversation.id, dragging: dragged === conversation.id })} />} aria-label={conversation.title}
              aria-current={selectedId === conversation.id ? 'page' : undefined} aria-description={`${conversation.list?.pinned ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
              draggable={!busy} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-boai-conversation', conversation.id); setDragged(conversation.id) }} onDragEnd={finishDrag}
              onClick={() => { if (!dragged) onSelect(conversation.id) }}
              onKeyDown={event => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || busy) return
                event.preventDefault()
                const section = conversations.filter(item => Boolean(item.list?.pinned) === Boolean(conversation.list?.pinned))
                const other = section[section.indexOf(conversation) + (event.key === 'ArrowUp' ? -1 : 1)]
                if (other) onChange({ id: conversation.id, action: 'move', targetId: other.id, placement: event.key === 'ArrowUp' ? 'before' : 'after' })
              }}>
              {conversation.kind === 'group' ? <GroupAvatar members={members} /> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />}
              <span className="conversation-copy"><span className="conversation-title">{conversation.title}
                {conversation.list?.pinned && <Pin className="conversation-pin" />}
                {conversation.activity && conversation.activity !== 'idle' && <span className={`list-activity ${conversation.activity}`}>{({ running: '处理中', waiting_approval: '待授权', queued: '排队', failed: '失败' } as const)[conversation.activity]}</span>}
                {messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}
              </span><span className="conversation-preview">{drafts.get(conversation.id)?.text ? <><em>[草稿]</em> {drafts.get(conversation.id)?.text}</> : previews[conversation.id] || conversation.lastMessagePreview || (conversation.kind === 'group' ? `${conversation.agentIds.length} 位数字员工` : agent?.role || '专属对话')}</span></span>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40"><ContextMenuGroup>
              <ContextMenuItem disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</ContextMenuItem>
            </ContextMenuGroup><ContextMenuSeparator /><ContextMenuGroup>
              <ContextMenuItem variant="destructive" disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'hide' })}><Trash2 />删除会话</ContextMenuItem>
            </ContextMenuGroup></ContextMenuContent>
          </ContextMenu>
        </div>
      })}
      {!conversations.length && <div className="list-empty">{query ? '没有匹配的会话' : '从通讯录发消息，或点击加号创建新的会话。'}</div>}
    </div>
    <div className="list-footer"><span className="local-dot" />本地工作空间<span>{snapshot.agents.length} 位员工</span></div>
  </div>
}
