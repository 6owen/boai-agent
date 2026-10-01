/*
 * [INPUT]: 会话/员工快照、草稿、列表更新回调与统一 UI 组件与共用清理确认弹窗。
 * [OUTPUT]: 核心助手整行折叠标题；更多/编辑图标仅整行悬停、聚焦或菜单打开时显示并保留占位；普通/定时聊天分类、排序、搜索与清理；空列表复用透明毛绒伙伴 WebP。
 * [POS]: 会话列表交互；持久化通过 Shell 的类型化请求完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { cn } from 'cn'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty'
import conversationCompanions from '@/assets/conversation-companions.webp'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, MoreHorizontal, Pin, Search, Settings, SquarePen, Trash2 } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent, isCoreConversation } from '@shared/domain/core-agent'
import { sortedConversations, type ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { GroupAvatar } from '@/components/common/group-avatar'
import { type ChatDraft } from '../presentation'
import { ConversationHistoryDialog } from './conversation-history-dialog'

interface Props {
  snapshot: Snapshot; selectedId: string | null; query: string; onQuery(value: string): void
  previews: Record<string, string>; messageTimes: Record<string, string>; drafts: Map<string, ChatDraft>
  onSelect(id: string): void; onCreate(kind: 'agent' | 'group'): void
  onCreateCore(): void
  onConfigureCore(): void
  onChange(change: ConversationListChange): void; onClear(id: string, hide: boolean): Promise<void>; busy: boolean
}
export function ConversationList({ snapshot, selectedId, query, onQuery, previews, messageTimes, drafts, onSelect, onCreate, onCreateCore, onConfigureCore, onChange, onClear, busy }: Props) {
  const [coreOpen, setCoreOpen] = useState(true)
  const [coreMenuOpen, setCoreMenuOpen] = useState(false)
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [regularOpen, setRegularOpen] = useState(true)
  const [confirmation, setConfirmation] = useState<{ conversation: Conversation; hide: boolean } | null>(null)
  const confirm = (conversation: Conversation, hide: boolean) => setConfirmation({ conversation, hide })
  const conversations = sortedConversations(snapshot.conversations, messageTimes).filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
  const coreName = snapshot.agents.find(isCoreAgent)?.name ?? CORE_AGENT_DEFAULT_NAME
  const renderConversation = (conversation: Conversation) => {
        const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0])
        const messageTime = [messageTimes[conversation.id] ?? '', conversation.lastMessageAt ?? ''].sort().at(-1)!
        const members = conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
        return <DragListItem id={conversation.id} className="conversation-row" key={conversation.id}>{({ dragging, dragProps }) =>
          <ContextMenu>
            <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} />} aria-label={conversation.title}
              {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} aria-description={`${conversation.list?.pinned ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
              onClick={() => { if (!dragging) onSelect(conversation.id) }}>
              {conversation.kind === 'group' ? <GroupAvatar members={members} /> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />}
              <span className="conversation-copy"><span className="conversation-title">{conversation.title}
                {conversation.activity && conversation.activity !== 'idle' && <span className={`list-activity ${conversation.activity}`}>{({ running: '处理中', waiting_approval: '待授权', queued: '排队', failed: '失败' } as const)[conversation.activity]}</span>}
                {messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}
              </span><span className="conversation-preview">{conversation.purpose === 'automation' && '定时任务 · '}{drafts.get(conversation.id)?.text ? <><em>[草稿]</em> {drafts.get(conversation.id)?.text}</> : previews[conversation.id] || conversation.lastMessagePreview || (conversation.kind === 'group' ? `${conversation.agentIds.length} 位数字员工` : agent?.role || '专属对话')}</span></span>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40"><ContextMenuGroup>
              <ContextMenuItem disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</ContextMenuItem>
            </ContextMenuGroup><ContextMenuSeparator /><ContextMenuGroup>
              <ContextMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</ContextMenuItem>
              <ContextMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</ContextMenuItem>
            </ContextMenuGroup></ContextMenuContent>
          </ContextMenu>
        }</DragListItem>
  }
  const core = conversations.filter(isCoreConversation)
  const ordinary = conversations.filter(item => !isCoreConversation(item))
  const pinned = ordinary.filter(item => item.list?.pinned), regular = ordinary.filter(item => !item.list?.pinned)
  return <div className="conversation-list-panel">
    <div className="list-heading"><h2>会话</h2><div className="list-heading-actions"><AddContactMenu onCreate={onCreate} /></div></div>
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => onQuery(event.target.value)} /></InputGroup>
    <div className="conversation-list" role="navigation" aria-label="会话列表">
      <DragList ids={conversations.map(item => item.id)} disabled={busy} canMove={(id, targetId) => {
        const source = conversations.find(item => item.id === id), target = conversations.find(item => item.id === targetId)
        return Boolean(source && target && isCoreConversation(source) === isCoreConversation(target) && Boolean(source.list?.pinned) === Boolean(target.list?.pinned))
      }} onMove={move => onChange({ ...move, action: 'move' })}>
      <Collapsible open={Boolean(query.trim()) || coreOpen} onOpenChange={setCoreOpen}>
        <div className="conversation-section-row" data-menu-open={coreMenuOpen || undefined}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>{coreName}<ChevronRight /></CollapsibleTrigger>
          <DropdownMenu open={coreMenuOpen} onOpenChange={setCoreMenuOpen}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="conversation-section-action" aria-label={`${coreName} 的更多操作`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup><DropdownMenuItem onClick={onConfigureCore}><Settings />助手设置</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" className="conversation-section-action" disabled={busy} aria-label={`与 ${coreName} 新建会话`} title="新建会话" onClick={onCreateCore}><SquarePen /></Button>
        </div>
        <CollapsibleContent><div role="group" aria-label={`${coreName} 的会话`}>{core.map(renderConversation)}</div></CollapsibleContent>
      </Collapsible>
      {pinned.length > 0 && <Collapsible open={Boolean(query.trim()) || pinnedOpen} onOpenChange={setPinnedOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>置顶<ChevronRight /></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="置顶会话">{pinned.map(renderConversation)}</div></CollapsibleContent>
      </Collapsible>}
      <Collapsible open={Boolean(query.trim()) || regularOpen} onOpenChange={setRegularOpen}>
        {regular.length > 0 && <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>会话<ChevronRight /></CollapsibleTrigger>}
        <CollapsibleContent><div role="group" aria-label="普通会话">{regular.map(renderConversation)}</div></CollapsibleContent>
      </Collapsible>
      </DragList>
      {!conversations.length && <Empty className="conversation-list-empty px-3 py-8">
        <EmptyHeader><EmptyMedia><img src={conversationCompanions} className="select-none" draggable={false} width={144} height={110} alt="等你开聊的小伙伴" /></EmptyMedia>
          <EmptyDescription className="text-xs leading-relaxed">{query.trim() ? '没有找到，换个名字试试？' : '找个小伙伴，聊聊新想法吧。'}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
    </div>
    <ConversationHistoryDialog target={confirmation} busy={busy} onClose={() => setConfirmation(null)} onClear={onClear} />
  </div>
}
