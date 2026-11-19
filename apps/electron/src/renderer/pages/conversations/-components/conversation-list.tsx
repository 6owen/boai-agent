/*
 * [OUTPUT]: 会话摘要只显示最新已发送消息，不接入composer草稿或执行状态；渠道入口仅提示真实未读回复。
 * [OUTPUT]: 员工配置与置顶共用同一右键菜单分组，清理操作独立分组。
 * [OUTPUT]: 失败/取消/中断的执行过程及自动化镜像保留在聊天；支持显式继续、原生复制和员工配置右键入口。
 * [OUTPUT]: 员工会话右键配置跳转现有通讯录选中项；定时运行按用户点击查看过程/聊天。
 * [OUTPUT]: 核心助手整行右键提供新增会话/助手设置/清空所有记录/删除所有会话；批量固定全部可见核心会话且不受名称搜索影响，确认后沿原清理回调执行，无渠道入口。
 * [OUTPUT]: 核心助手折叠按钮直接复用通讯录conversation-item的行高、内边距、头像与名称/角色两行排版，整行占满列表且无悬停底色；箭头固定最右，新会话按钮位于其左，各操作与原折叠独立。
 * [OUTPUT]: 渠道列表不显示置顶标记或右键置顶入口，普通会话保持。
 * [OUTPUT]: showHeading允许Popover省略列表标题，普通主列表默认保持。
 * [OUTPUT]: 渠道列表可嵌入Popover；仅传入onBack时显示返回按钮，搜索/label折叠沿原状态。
 * [OUTPUT]: 2026-10-15渠道私聊/群聊复用会话label折叠；搜索临时展开，明确定位展开目标分组，取消横向筛选Tabs。
 * [OUTPUT]: 2026-10-14现行分离合同：主列表按员工/BOAI群显示，员工渠道页私聊/群筛选及真实新回复提示；渠道分组一次读取，避免逐员工重复排序。
 * [OUTPUT]: 员工行打开固定主聊天，独立箭头展开该员工的话题；话题可搜索和编辑标题。
 * [OUTPUT]: 员工行尾话题箭头共用 icon-xs，群组选中仍打开原群聊。
 * [OUTPUT]: 当前会话为子话题时标记所属员工，收起话题列表后保持归属提示。
 * [OUTPUT]: 员工行操作使用右侧布局槽，文字区域按可用宽度截断。
 * [INPUT]: 会话/员工快照、已发送消息摘要、列表更新回调与统一 UI 组件与共用清理确认弹窗。
 * [OUTPUT]: 渠道会话单列、显示接入员工身份，拖拽和置顶不影响普通/核心分类。
 * [OUTPUT]: 常驻会话名称输入与核心助手真实头像/名称的唯一折叠分组，右键管理与右侧新会话图标；核心历史紧凑小缩进、单一背景，默认标题占满行宽，更多/编辑随悬停、聚焦或菜单打开覆盖末尾且不改变标题宽度，行内图标/右键/更多共用编辑标题，普通会话保持头像和预览及置顶；标题右侧加号只保留员工/群聊，名称筛选临时展开分组并禁用拖拽，清除后保留原折叠；全局检索入口与 Dialog 由 Shell 承载。
 * [POS]: 会话列表交互；持久化通过 Shell 的类型化请求完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty'
import conversationCompanions from '@/assets/conversation-companions.webp'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Pin, Search, Settings, SquarePen, Trash2 } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Conversation, DigitalAgent, Snapshot } from '@boai/shared/domain'
import { CORE_AGENT_DEFAULT_NAME, CORE_AGENT_ID, isCoreAgent, isCoreConversation } from '@boai/shared/domain/core-agent'
import { mainConversations, sortedConversations, conversationSection, isChannelConversation, isEmployeeMainChat, type ConversationListChange } from '@boai/shared/domain/conversation-list'
import { CHANNEL_NAMES } from '@boai/shared/domain/channels'
import { Avatar, timeText } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { GroupAvatar } from '@/components/common/group-avatar'
import { ConversationHistoryDialog, type ConversationHistoryTarget } from './conversation-history-dialog'

interface Props {
  snapshot: Snapshot; selectedId: string | null
  previews: Record<string, string>; messageTimes: Record<string, string>
  onSelect(id: string): void; onCreate(kind: 'agent' | 'group'): void
  onOpenCore(): void; onCreateCore(): void
  coreMainDraft?: boolean
  onConfigureCore(): void
  onConfigureAgent?(agent: DigitalAgent): void
  onEditTitle(conversation: Conversation): void
  onChange(change: ConversationListChange): void; onClear(id: string, hide: boolean): Promise<void>; busy: boolean
  showHeading?: boolean
  selectionRequest?: string
  channelAgent?: DigitalAgent
  onBack?(): void
  onOpenChannels?(agent: DigitalAgent, conversationId?: string): void
}
export function ConversationList({ snapshot, selectedId, previews, messageTimes, onSelect, onCreate, onOpenCore, onCreateCore, coreMainDraft, onConfigureCore, onConfigureAgent, onEditTitle, onChange, onClear, busy, channelAgent, onBack, onOpenChannels, selectionRequest, showHeading = true }: Props) {
  const [query, setQuery] = useState('')
  const [coreOpen, setCoreOpen] = useState(true)
  const [openEmployeeTopics, setOpenEmployeeTopics] = useState<Record<string, boolean>>({})
  const [coreHistoryMenuId, setCoreHistoryMenuId] = useState<string | null>(null)
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [regularOpen, setRegularOpen] = useState(true)
  const [channelOpen, setChannelOpen] = useState({ direct: true, group: true })
  const selection = selectionRequest ?? selectedId
  const lastSelection = useRef(selection)
  useEffect(() => {
    if (lastSelection.current === selection) return
    const room = snapshot.conversations.find(room => room.id === selectedId)
    if (selectedId && !room) return
    lastSelection.current = selection
    if (!room) return
    if (!channelAgent) {
      if (room.employeeChat !== 'topic') return
      if (isCoreConversation(room)) setCoreOpen(true)
      else setOpenEmployeeTopics(previous => ({ ...previous, [room.agentIds[0]]: true }))
      return
    }
    if (!isChannelConversation(room)) return
    setChannelOpen(value => ({ ...value, [room.kind]: true }))
    setQuery(value => room.title.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()) ? value : '')
  }, [selectedId, selection, channelAgent, snapshot.conversations])
  const [confirmation, setConfirmation] = useState<ConversationHistoryTarget | null>(null)
  const confirm = (conversation: Conversation, hide: boolean) => setConfirmation({ conversation, hide })
  const visible = sortedConversations(snapshot.conversations, messageTimes)
  const selectedTopic = visible.find(room => room.id === selectedId && room.employeeChat === 'topic')
  const channelsByAgent = new Map<string, Conversation[]>()
  const topicsByAgent = new Map<string, Conversation[]>()
  for (const room of visible) {
    if (isChannelConversation(room)) {
      for (const id of room.agentIds) {
        const rooms = channelsByAgent.get(id) ?? []
        rooms.push(room)
        channelsByAgent.set(id, rooms)
      }
    } else if (room.employeeChat === 'topic' && !isCoreConversation(room)) {
      const id = room.agentIds[0], topics = topicsByAgent.get(id) ?? []
      topics.push(room)
      topicsByAgent.set(id, topics)
    }
  }
  const search = query.trim().toLocaleLowerCase()
  const title = (item: Conversation) => item.title
  const matches = (item: Conversation) => title(item).toLocaleLowerCase().includes(search)
  const visibleConversations = channelAgent ? (channelsByAgent.get(channelAgent.id) ?? []) : mainConversations(snapshot.conversations, messageTimes)
  const coreAgent = snapshot.agents.find(isCoreAgent), coreName = coreAgent?.name ?? CORE_AGENT_DEFAULT_NAME
  const coreMain = snapshot.conversations.find(room => isEmployeeMainChat(room, CORE_AGENT_ID))
  const allCore = visible.filter(room => isCoreConversation(room) && !isChannelConversation(room))
  const coreTopicActive = selectedId !== coreMain?.id && allCore.some(room => room.id === selectedId)
  const core = allCore.filter(room => room.id !== coreMain?.id && matches(room))
  const ordinary = visibleConversations.filter(room => !isCoreConversation(room) && !isChannelConversation(room))
  for (const id of topicsByAgent.keys()) {
    if (ordinary.some(room => isEmployeeMainChat(room, id))) continue
    const main = snapshot.conversations.find(room => isEmployeeMainChat(room, id))
    if (main) ordinary.push(main)
  }
  const ordinaryMatches = ordinary.filter(room => matches(room) || room.kind === 'direct' && topicsByAgent.get(room.agentIds[0])?.some(matches))
  const confirmAllCore = (hide: boolean) => setConfirmation({ conversations: allCore, agentName: coreName, hide })
  const renderConversation = (conversation: Conversation) => {
        const coreConversation = isCoreConversation(conversation)
        const compact = coreConversation || conversation.employeeChat === 'topic'
        const topicActive = !channelAgent && selectedTopic && isEmployeeMainChat(conversation, selectedTopic.agentIds[0])
        const pin = () => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })
        const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0])
        const messageTime = [messageTimes[conversation.id] ?? '', conversation.lastMessageAt ?? ''].sort().at(-1)!
        const members = conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
        const channels = !compact && !channelAgent && conversation.kind === 'direct' && agent ? channelsByAgent.get(agent.id) ?? [] : []
        const unread = channels.reduce((count, room) => count + (room.channelUnreadCount ?? 0), 0)
        const notification = channels.find(room => (room.channelUnreadCount ?? 0) > 0)
        return <DragListItem id={conversation.id} className="conversation-row relative" key={conversation.id}>{({ dragging, dragProps }) =>
          <ContextMenu onOpenChange={open => { if (compact) setCoreHistoryMenuId(open ? conversation.id : null) }}>
            {compact ? <ContextMenuTrigger render={<div className={cn('conversation-item conversation-core-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} data-menu-open={coreHistoryMenuId === conversation.id || undefined} />} aria-label={conversation.title}>
              <Button variant="ghost" size="content" className="conversation-core-title" aria-label={conversation.title} {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={() => { if (!dragging) onSelect(conversation.id) }}><span className="truncate">{conversation.title}</span>{messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}</Button>
              <div className="conversation-core-actions">
              <DropdownMenu onOpenChange={open => setCoreHistoryMenuId(open ? conversation.id : null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="conversation-core-action" disabled={busy} aria-label={`${conversation.title} 的更多操作`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup><DropdownMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
                  <DropdownMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</DropdownMenuItem>
                </DropdownMenuGroup></DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon-sm" className="conversation-core-action" disabled={busy} aria-label={`编辑 ${conversation.title} 的标题`} title="编辑标题" onClick={() => onEditTitle(conversation)}><Pencil /></Button>
              </div>
            </ContextMenuTrigger> : <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} data-active-topic={topicActive || undefined} />} aria-label={title(conversation)}
              {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} aria-description={`${topicActive ? '当前会话是此员工的话题。' : ''}${conversation.list?.pinned ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
              onClick={() => { if (!dragging) onSelect(conversation.id) }}>
              {conversation.kind === 'group' && !isChannelConversation(conversation) ? <GroupAvatar members={members} /> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />}
              <span className="conversation-copy"><span className="conversation-title">{title(conversation)}
                {messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}
              </span><span className={cn('conversation-preview', { 'pr-24': notification })}>{previews[conversation.id] || conversation.lastMessagePreview || ''}</span></span>
            </ContextMenuTrigger>}
            <ContextMenuContent className="w-40">{(!isChannelConversation(conversation) || !compact && conversation.kind === 'direct' && agent && onConfigureAgent) && <><ContextMenuGroup>
              {!compact && conversation.kind === 'direct' && agent && onConfigureAgent && <ContextMenuItem onClick={() => onConfigureAgent(agent)}><Settings />员工配置</ContextMenuItem>}
              {!isChannelConversation(conversation) && (compact ? <ContextMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</ContextMenuItem> : <ContextMenuItem disabled={busy} onClick={pin}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</ContextMenuItem>)}
            </ContextMenuGroup><ContextMenuSeparator /></>}<ContextMenuGroup>
              <ContextMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</ContextMenuItem>
              <ContextMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</ContextMenuItem>
            </ContextMenuGroup></ContextMenuContent>
            {notification && agent && <Button variant="ghost" size="content" className="absolute bottom-2 right-3 text-xs text-primary" aria-label={`${agent.name}的渠道有${unread}条新回复`} onClick={() => onOpenChannels?.(agent, notification.id)}>{CHANNEL_NAMES[notification.channel!.platform]} · 新回复 {unread}</Button>}
          </ContextMenu>
        }</DragListItem>
  }
  const renderEmployee = (conversation: Conversation) => {
    const employeeId = conversation.agentIds[0]
    const topics = conversation.kind === 'direct' ? topicsByAgent.get(employeeId) : undefined
    if (!topics?.length) return renderConversation(conversation)
    const shownTopics = topics.filter(matches)
    if (!shownTopics.length) return renderConversation(conversation)
    const open = Boolean(search) || (openEmployeeTopics[employeeId] ?? topics.some(room => room.id === selectedId))
    return <Collapsible key={conversation.id} open={open} onOpenChange={value => { if (!search) setOpenEmployeeTopics(previous => ({ ...previous, [employeeId]: value })) }}>
      <div className="conversation-employee-row">
        {renderConversation(conversation)}
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-xs" className="conversation-employee-action conversation-topic-toggle" aria-label={`${conversation.title} 的话题`} title="展开或收起话题" />}><ChevronRight /></CollapsibleTrigger>
      </div>
      <CollapsibleContent><div className="conversation-core-history" role="group" aria-label={`${conversation.title} 的话题列表`}>{shownTopics.map(renderConversation)}</div></CollapsibleContent>
    </Collapsible>
  }
  const channel = (channelAgent ? visibleConversations : []).filter(matches)
  const pinned = ordinaryMatches.filter(item => item.list?.pinned), regular = ordinaryMatches.filter(item => !item.list?.pinned)
  const displayed = [...core, ...ordinaryMatches, ...channel, ...[...topicsByAgent.values()].flat().filter(matches)]
  return <div className="conversation-list-panel">
    {showHeading && <div className="list-heading"><h2>{channelAgent ? `${channelAgent.name}的渠道` : '会话'}</h2><div className="list-heading-actions">{channelAgent ? onBack && <Button variant="ghost" size="icon-sm" aria-label="返回员工主聊天" onClick={onBack}><ChevronLeft /></Button> : <AddContactMenu onCreate={onCreate} />}</div></div>}
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
    <Collapsible className="flex min-h-0 flex-1 flex-col" open={Boolean(search) || coreOpen} onOpenChange={open => { if (!search) setCoreOpen(open) }}>
      {!channelAgent && <ContextMenu><ContextMenuTrigger render={<div className="conversation-employee-row conversation-core-section-row" />}>
        <Button variant="ghost" size="content" className={cn('conversation-item conversation-core-heading', { selected: coreMain?.id === selectedId || !coreMain && coreMainDraft })} aria-label={`${coreName} 的主聊天`} aria-current={coreMain?.id === selectedId || !coreMain && coreMainDraft ? 'page' : undefined} data-active-topic={coreTopicActive || undefined} aria-description={coreTopicActive ? '当前会话是此员工的话题。' : undefined} onClick={onOpenCore}>
          <Avatar name={coreName} seed={coreAgent?.id} avatar={coreAgent?.avatar} color={coreAgent?.color} />
          <span className="conversation-copy"><span className="conversation-title">{coreName}</span><span className="conversation-preview">{(coreMain && (previews[coreMain.id] || coreMain.lastMessagePreview)) || coreAgent?.role || '数字员工'}</span></span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="conversation-employee-action" disabled={busy} aria-label={`与 ${coreName} 新建会话`} title="新话题" onClick={onCreateCore}><SquarePen /></Button>
        {core.length > 0 && <CollapsibleTrigger render={<Button variant="ghost" size="icon-xs" className="conversation-employee-action conversation-topic-toggle" aria-label={`${coreName} 的话题`} title="展开或收起话题" />}><ChevronRight /></CollapsibleTrigger>}
      </ContextMenuTrigger><ContextMenuContent className="w-40"><ContextMenuGroup>
        <ContextMenuItem disabled={busy} onClick={onCreateCore}><SquarePen />新话题</ContextMenuItem>
        <ContextMenuItem onClick={onConfigureCore}><Settings />助手设置</ContextMenuItem>
      </ContextMenuGroup><ContextMenuSeparator /><ContextMenuGroup>
        <ContextMenuItem disabled={busy || !allCore.length} onClick={() => confirmAllCore(false)}><Trash2 />清空所有记录</ContextMenuItem>
        <ContextMenuItem variant="destructive" disabled={busy || !allCore.length} onClick={() => confirmAllCore(true)}><Trash2 />删除所有会话</ContextMenuItem>
      </ContextMenuGroup></ContextMenuContent></ContextMenu>}
    <div className="conversation-list" role="navigation" aria-label="会话列表">
      <DragList ids={displayed.map(item => item.id)} disabled={busy || Boolean(search)} canMove={(id, targetId) => {
        const source = displayed.find(item => item.id === id), target = displayed.find(item => item.id === targetId)
        return Boolean(source && target && conversationSection(source) === conversationSection(target) &&
          (source.employeeChat !== 'topic' || source.agentIds[0] === target.agentIds[0]) && (!channelAgent || source.kind === target.kind) && Boolean(source.list?.pinned) === Boolean(target.list?.pinned))
      }} onMove={move => onChange({ ...move, action: 'move' })}>
      {core.length > 0 &&
        <CollapsibleContent><div role="group" className="conversation-core-history" aria-label={`${coreName} 的会话`}>{core.map(renderConversation)}</div></CollapsibleContent>
      }
      {pinned.length > 0 && <Collapsible open={Boolean(search) || pinnedOpen} onOpenChange={open => { if (!search) setPinnedOpen(open) }}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>置顶<ChevronRight /></CollapsibleTrigger>
        <CollapsibleContent><div role="group" aria-label="置顶会话">{pinned.map(renderEmployee)}</div></CollapsibleContent>
      </Collapsible>}
      <Collapsible open={Boolean(search) || regularOpen} onOpenChange={open => { if (!search) setRegularOpen(open) }}>
        {regular.length > 0 && <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>会话<ChevronRight /></CollapsibleTrigger>}
        <CollapsibleContent><div role="group" aria-label="普通会话">{regular.map(renderEmployee)}</div></CollapsibleContent>
      </Collapsible>
      {channelAgent && <div role="group" aria-label="渠道会话">{(['direct', 'group'] as const).map(kind => {
        const rooms = channel.filter(room => room.kind === kind)
        const label = kind === 'direct' ? '私聊' : '群聊'
        return <Collapsible key={kind} open={Boolean(search) || channelOpen[kind]} onOpenChange={open => { if (!search) setChannelOpen(value => ({ ...value, [kind]: open })) }}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>{label}<ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><div role="group" aria-label={`渠道${label}`}>{rooms.map(renderConversation)}</div></CollapsibleContent>
        </Collapsible>
      })}</div>}
      </DragList>
      {!visibleConversations.length && <Empty className="conversation-list-empty px-3 py-8">
        <EmptyHeader><EmptyMedia><img src={conversationCompanions} className="select-none" draggable={false} width={144} height={110} alt="等你开聊的小伙伴" /></EmptyMedia>
          <EmptyDescription className="text-xs leading-relaxed">{channelAgent ? '机器人收到的私聊和群消息会出现在这里。' : '找个小伙伴，聊聊新想法吧。'}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
    </div>
    </Collapsible>
    <ConversationHistoryDialog target={confirmation} busy={busy} onClose={() => setConfirmation(null)} onClear={onClear} />
  </div>
}
