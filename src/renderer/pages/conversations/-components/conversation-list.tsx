/*
 * [INPUT]: 会话/员工快照、草稿、列表更新回调与统一 UI 组件与共用清理确认弹窗。
 * [OUTPUT]: 常驻会话名称输入与核心助手真实头像/名称的唯一折叠分组，右侧设置/新会话图标；核心历史紧凑小缩进、单一背景，默认标题占满行宽，更多/编辑随悬停、聚焦或菜单打开覆盖末尾且不改变标题宽度，行内图标/右键/更多共用编辑标题，普通会话保持头像和预览及置顶；加号只保留员工/群聊，名称筛选临时展开分组并禁用拖拽，清除后保留原折叠；加号旁全局搜索图标和普通 Dialog，默认全范围及可选筛选、关闭停读和稳定身份导航。
 * [POS]: 会话列表交互；持久化通过 Shell 的类型化请求完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { cn } from 'cn'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty'
import conversationCompanions from '@/assets/conversation-companions.webp'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, MoreHorizontal, Pencil, Pin, Search, Settings, SquarePen, Trash2 } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Conversation, DigitalAgent, Snapshot } from '@shared/domain'
import { CORE_AGENT_DEFAULT_NAME, isCoreAgent, isCoreConversation } from '@shared/domain/core-agent'
import { sortedConversations, type ConversationListChange } from '@shared/domain/conversation-list'
import { Avatar, timeText } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { GroupAvatar } from '@/components/common/group-avatar'
import { type ChatDraft } from '../presentation'
import { ConversationHistoryDialog } from './conversation-history-dialog'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationSearchResult, ConversationSearchTarget } from '@shared/domain/reading'
import { ConversationSearch, type ConversationSearchRequest } from './conversation-search'

interface Props {
  api: DesktopApi; active: boolean; searchRequest?: ConversationSearchRequest; onSearchResult(result: ConversationSearchResult, current: () => boolean, navigated: () => void): Promise<void>
  onSearchUnavailable(target: ConversationSearchTarget): void
  onSearchOpenChange(open: boolean): void
  snapshot: Snapshot; selectedId: string | null
  previews: Record<string, string>; messageTimes: Record<string, string>; drafts: Map<string, ChatDraft>
  onSelect(id: string): void; onCreate(kind: 'agent' | 'group'): void
  onCreateCore(): void
  onConfigureCore(): void
  onEditTitle(conversation: Conversation): void
  onChange(change: ConversationListChange): void; onClear(id: string, hide: boolean): Promise<void>; busy: boolean
}
export function ConversationList({ api, active, searchRequest, onSearchResult, onSearchUnavailable, onSearchOpenChange, snapshot, selectedId, previews, messageTimes, drafts, onSelect, onCreate, onCreateCore, onConfigureCore, onEditTitle, onChange, onClear, busy }: Props) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false), [dialogRequest, setDialogRequest] = useState<ConversationSearchRequest>()
  useEffect(() => { if (searchRequest) { setDialogRequest(searchRequest); setSearchOpen(true) } }, [searchRequest?.requestId])
  useEffect(() => { if (!active) setSearchOpen(false) }, [active])
  useEffect(() => { onSearchOpenChange(active && searchOpen); return () => onSearchOpenChange(false) }, [active, searchOpen, onSearchOpenChange])
  const [coreOpen, setCoreOpen] = useState(true)
  const [coreMenuOpen, setCoreMenuOpen] = useState(false)
  const [coreHistoryMenuId, setCoreHistoryMenuId] = useState<string | null>(null)
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [regularOpen, setRegularOpen] = useState(true)
  const [confirmation, setConfirmation] = useState<{ conversation: Conversation; hide: boolean } | null>(null)
  const confirm = (conversation: Conversation, hide: boolean) => setConfirmation({ conversation, hide })
  const visibleConversations = sortedConversations(snapshot.conversations, messageTimes)
  const search = query.trim().toLocaleLowerCase()
  const conversations = visibleConversations.filter(item => item.title.toLocaleLowerCase().includes(search))
  const coreAgent = snapshot.agents.find(isCoreAgent), coreName = coreAgent?.name ?? CORE_AGENT_DEFAULT_NAME
  const renderConversation = (conversation: Conversation) => {
        const coreConversation = isCoreConversation(conversation)
        const pin = () => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })
        const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0])
        const messageTime = [messageTimes[conversation.id] ?? '', conversation.lastMessageAt ?? ''].sort().at(-1)!
        const members = conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
        return <DragListItem id={conversation.id} className="conversation-row" key={conversation.id}>{({ dragging, dragProps }) =>
          <ContextMenu onOpenChange={open => { if (coreConversation) setCoreHistoryMenuId(open ? conversation.id : null) }}>
            {coreConversation ? <ContextMenuTrigger render={<div className={cn('conversation-item conversation-core-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} data-menu-open={coreHistoryMenuId === conversation.id || undefined} />} aria-label={conversation.title}>
              <Button variant="ghost" size="content" className="conversation-core-title" aria-label={conversation.title} {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={() => { if (!dragging) onSelect(conversation.id) }}><span className="truncate">{conversation.title}</span></Button>
              <div className="conversation-core-actions">
              <DropdownMenu onOpenChange={open => setCoreHistoryMenuId(open ? conversation.id : null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="conversation-core-action" disabled={busy} aria-label={`${conversation.title} 的更多操作`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup><DropdownMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
                  <DropdownMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</DropdownMenuItem>
                </DropdownMenuGroup></DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon-sm" className="conversation-core-action" disabled={busy} aria-label={`编辑 ${conversation.title} 的标题`} title="编辑标题" onClick={() => onEditTitle(conversation)}><Pencil /></Button>
              </div>
            </ContextMenuTrigger> : <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} />} aria-label={conversation.title}
              {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} aria-description={`${conversation.list?.pinned ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
              onClick={() => { if (!dragging) onSelect(conversation.id) }}>
              {conversation.kind === 'group' ? <GroupAvatar members={members} /> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />}
              <span className="conversation-copy"><span className="conversation-title">{conversation.title}
                {conversation.activity && conversation.activity !== 'idle' && <span className={`list-activity ${conversation.activity}`}>{({ running: '处理中', waiting_approval: '待授权', queued: '排队', failed: '失败' } as const)[conversation.activity]}</span>}
                {messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}
              </span><span className="conversation-preview">{conversation.purpose === 'automation' && '定时任务 · '}{drafts.get(conversation.id)?.text ? <><em>[草稿]</em> {drafts.get(conversation.id)?.text}</> : previews[conversation.id] || conversation.lastMessagePreview || (conversation.kind === 'group' ? `${conversation.agentIds.length} 位数字员工` : agent?.role || '专属对话')}</span></span>
            </ContextMenuTrigger>}
            <ContextMenuContent className="w-40"><ContextMenuGroup>
              {coreConversation ? <ContextMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</ContextMenuItem> : <ContextMenuItem disabled={busy} onClick={pin}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</ContextMenuItem>}
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
    <div className="list-heading"><h2>会话</h2><div className="list-heading-actions"><Dialog open={active && searchOpen} onOpenChange={setSearchOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="搜索会话内容" title="搜索" />} onClick={() => setDialogRequest({ requestId: crypto.randomUUID() })}><Search /></DialogTrigger>
      <ConversationSearch api={api} active={active && searchOpen} snapshot={snapshot} selectedId={selectedId} request={dialogRequest} onOpen={(result, current) => onSearchResult(result, current, () => setSearchOpen(false))} onUnavailable={onSearchUnavailable} />
    </Dialog><AddContactMenu onCreate={onCreate} /></div></div>
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
    <Collapsible className="flex min-h-0 flex-1 flex-col" open={Boolean(search) || coreOpen} onOpenChange={open => { if (!search) setCoreOpen(open) }}>
      <div className="conversation-section-row conversation-core-section-row" data-menu-open={coreMenuOpen || undefined}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading conversation-core-heading" aria-label={`${coreName} 的会话分组`} />}><Avatar small name={coreName} seed={coreAgent?.id} avatar={coreAgent?.avatar} color={coreAgent?.color} /><span className="min-w-0 truncate">{coreName}</span><ChevronRight /></CollapsibleTrigger>
        <DropdownMenu open={coreMenuOpen} onOpenChange={setCoreMenuOpen}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="conversation-section-action" aria-label={`${coreName} 的更多操作`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup><DropdownMenuItem onClick={onConfigureCore}><Settings />助手设置</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" className="conversation-section-action" disabled={busy} aria-label={`与 ${coreName} 新建会话`} title="新建会话" onClick={onCreateCore}><SquarePen /></Button>
      </div>
    <div className="conversation-list" role="navigation" aria-label="会话列表">
      <DragList ids={conversations.map(item => item.id)} disabled={busy || Boolean(search)} canMove={(id, targetId) => {
        const source = conversations.find(item => item.id === id), target = conversations.find(item => item.id === targetId)
        return Boolean(source && target && isCoreConversation(source) === isCoreConversation(target) && Boolean(source.list?.pinned) === Boolean(target.list?.pinned))
      }} onMove={move => onChange({ ...move, action: 'move' })}>
      {core.length > 0 &&
        <CollapsibleContent><div role="group" className="conversation-core-history" aria-label={`${coreName} 的会话`}>{core.map(renderConversation)}</div></CollapsibleContent>
      }
      {pinned.length > 0 && <Collapsible open={Boolean(search) || pinnedOpen} onOpenChange={open => { if (!search) setPinnedOpen(open) }}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>置顶<ChevronRight /></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="置顶会话">{pinned.map(renderConversation)}</div></CollapsibleContent>
      </Collapsible>}
      <Collapsible open={Boolean(search) || regularOpen} onOpenChange={open => { if (!search) setRegularOpen(open) }}>
        {regular.length > 0 && <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>会话<ChevronRight /></CollapsibleTrigger>}
        <CollapsibleContent><div role="group" aria-label="普通会话">{regular.map(renderConversation)}</div></CollapsibleContent>
      </Collapsible>
      </DragList>
      {!visibleConversations.length && <Empty className="conversation-list-empty px-3 py-8">
        <EmptyHeader><EmptyMedia><img src={conversationCompanions} className="select-none" draggable={false} width={144} height={110} alt="等你开聊的小伙伴" /></EmptyMedia>
          <EmptyDescription className="text-xs leading-relaxed">找个小伙伴，聊聊新想法吧。</EmptyDescription>
        </EmptyHeader>
      </Empty>}
    </div>
    </Collapsible>
    <ConversationHistoryDialog target={confirmation} busy={busy} onClose={() => setConfirmation(null)} onClear={onClear} />
  </div>
}
