/*
 * [OUTPUT]: bobo 空白主聊入口可拖拽排序和置顶；实际主聊出现后接续列表位置。
 * [OUTPUT]: 拖放置顶提示与通讯录复用同一套落点皮肤。
 * [OUTPUT]: 删除核心会话后不重新展示旧主聊或空白占位；仍可见的话题保留员工入口。
 * [OUTPUT]: 员工主聊的拖放落点覆盖整行，包括行尾话题按钮。
 * [OUTPUT]: 置顶卡片和原生拖影只显示头像与员工名称，等待保存时保持落点，置顶员工的话题通过聊天标题栏查阅。
 * [OUTPUT]: 主聊统一进入普通列表或头像置顶区，复用持久置顶与排序；话题沿所属员工展开。
 * [OUTPUT]: 侧栏话题标题在生成期间复用 shadcn shimmer。
 * [OUTPUT]: 会话摘要只显示最新已发送消息，不接入composer草稿或执行状态；渠道入口仅提示真实未读回复。
 * [OUTPUT]: 员工配置与置顶共用同一右键菜单分组，清理操作独立分组。
 * [OUTPUT]: 失败/取消/中断的执行过程及自动化镜像保留在聊天；支持显式继续、原生复制和员工配置右键入口。
 * [OUTPUT]: 员工会话右键配置跳转现有通讯录选中项；定时运行按用户点击查看过程/聊天。
 * [OUTPUT]: 核心助手整行右键提供新增会话/助手设置/清空所有记录/删除所有会话；批量固定全部可见核心会话且不受名称搜索影响，确认后沿原清理回调执行，无渠道入口。
 * [OUTPUT]: 核心助手行复用通讯录的头像、名称及摘要排版；右侧箭头独立折叠话题，新话题通过右键菜单创建。
 * [OUTPUT]: 渠道列表不显示置顶标记或右键置顶入口，普通会话保持。
 * [OUTPUT]: showHeading允许Popover省略列表标题，普通主列表默认保持。
 * [OUTPUT]: 渠道列表可嵌入Popover；仅传入onBack时显示返回按钮，搜索/label折叠沿原状态。
 * [OUTPUT]: 2026-10-15渠道私聊/群聊复用会话label折叠；搜索临时展开，明确定位展开目标分组，取消横向筛选Tabs。
 * [OUTPUT]: 2026-10-14现行分离合同：主列表按员工/BOAI群显示，员工渠道页私聊/群筛选及真实新回复提示；渠道分组一次读取，避免逐员工重复排序。
 * [OUTPUT]: 员工行打开固定主聊天，独立箭头展开话题；话题行尾只显示更多操作，编辑标题通过菜单进入。
 * [OUTPUT]: 员工行尾话题箭头共用 icon-xs，群组选中仍打开原群聊。
 * [OUTPUT]: 当前会话为子话题时标记所属员工，收起话题列表后保持归属提示。
 * [OUTPUT]: 话题箭头在行尾原位显现，支持悬停和键盘聚焦。
 * [INPUT]: 会话/员工快照、已发送消息摘要、列表更新回调与统一 UI 组件与共用清理确认弹窗。
 * [OUTPUT]: 渠道会话单列、显示接入员工身份，拖拽作用在渠道分类内。
 * [OUTPUT]: 常驻会话名称输入支持临时展开匹配分组并禁用拖拽，清除后保留折叠状态。话题采用紧凑缩进，右键和更多菜单共用编辑标题。
 * [POS]: 会话列表交互；持久化通过 Shell 的类型化请求完成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState, type ComponentProps, type DragEvent } from 'react'
import { DragList, DragListGroupTarget, DragListItem, type ListMove } from '@/components/common/drag-list'
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
import { CORE_AGENT_ID, isCoreAgent, isCoreConversation } from '@boai/shared/domain/core-agent'
import { mainConversations, sortedConversations, conversationListUpdates, conversationSection, isChannelConversation, isEmployeeMainChat, type ConversationListChange } from '@boai/shared/domain/conversation-list'
import { CHANNEL_NAMES } from '@boai/shared/domain/channels'
import { Avatar, timeText } from '@/components/common'
import { AddContactMenu } from '@/components/common/add-contact-menu'
import { GroupAvatar } from '@/components/common/group-avatar'
import { ConversationHistoryDialog, type ConversationHistoryTarget } from './conversation-history-dialog'

function EmployeeConversationRow({ topicOwner, children, className, ...props }: ComponentProps<'div'> & { topicOwner?: string }) {
  return <div {...props} className={cn('conversation-employee-row', className)}>
    {children}
    {topicOwner !== undefined && <CollapsibleTrigger render={<Button variant="ghost" size="icon-xs" className="conversation-topic-toggle" aria-label={`${topicOwner} 的话题`} title="展开或收起话题" />}><ChevronRight /></CollapsibleTrigger>}
  </div>
}

// Chromium takes its native drag image from this connected element at drag start.
function setPinDragImage(event: DragEvent<HTMLElement>, name: string) {
  const avatar = event.currentTarget.querySelector('.avatar, .group-avatar')
  const list = event.currentTarget.closest('.conversation-list')
  if (!avatar || !list || typeof event.dataTransfer.setDragImage !== 'function') return
  const image = document.createElement('div')
  image.className = 'conversation-item conversation-pin-tile conversation-pin-drag-image selected'
  image.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'conversation-pin-name'
  label.textContent = name
  image.append(avatar.cloneNode(true), label)
  list.append(image)
  const { width, height } = image.getBoundingClientRect()
  event.dataTransfer.setDragImage(image, width / 2, height / 2)
  requestAnimationFrame(() => image.remove())
}

type PinChange = Extract<ConversationListChange, { action: 'pin' }>
type CoreMainPlacement = { pinned: boolean; nextTo?: Pick<ListMove, 'targetId' | 'placement'> }
const CORE_MAIN_ENTRY = 'draft:bobo:main'
const CORE_MAIN_PLACEMENT_KEY = 'boai.conversations.core-main-placement'

function readCoreMainPlacement(): CoreMainPlacement | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CORE_MAIN_PLACEMENT_KEY) ?? 'null')
    if (typeof saved?.pinned === 'boolean') {
      const anchor = saved.nextTo
      return { pinned: saved.pinned, ...(typeof anchor?.targetId === 'string' && (anchor.placement === 'before' || anchor.placement === 'after') ? { nextTo: anchor } : {}) }
    }
  } catch { /* Optional presentation preference. */ }
  return null
}

function placeRelative(ids: string[], id: string, nextTo?: CoreMainPlacement['nextTo'], fallback = 0) {
  const index = nextTo ? ids.indexOf(nextTo.targetId) : -1
  ids.splice(index < 0 ? fallback : index + Number(nextTo?.placement === 'after'), 0, id)
}

interface Props {
  snapshot: Snapshot; selectedId: string | null
  previews: Record<string, string>; messageTimes: Record<string, string>
  onSelect(id: string): void; onCreate(kind: 'agent' | 'group'): void
  onOpenMain?(agent: DigitalAgent): void; onCreateTopic?(agent: DigitalAgent): void
  mainDraftEmployeeId?: string
  onConfigureAgent?(agent: DigitalAgent): void
  onEditTitle(conversation: Conversation): void
  onChange(change: ConversationListChange): void | Promise<void>; onClear(id: string, hide: boolean): Promise<void>; busy: boolean
  showHeading?: boolean
  selectionRequest?: string
  channelAgent?: DigitalAgent
  onBack?(): void
  onOpenChannels?(agent: DigitalAgent, conversationId?: string): void
}
export function ConversationList({ snapshot, selectedId, previews, messageTimes, onSelect, onCreate, onOpenMain, onCreateTopic, mainDraftEmployeeId, onConfigureAgent, onEditTitle, onChange, onClear, busy, channelAgent, onBack, onOpenChannels, selectionRequest, showHeading = true }: Props) {
  const [query, setQuery] = useState('')
  const [pendingPin, setPendingPin] = useState<PinChange | null>(null)
  const [coreMainPlacement, setCoreMainPlacement] = useState(readCoreMainPlacement)
  const transferringCorePlacement = useRef(false)
  const [openEmployeeTopics, setOpenEmployeeTopics] = useState<Record<string, boolean>>({ [CORE_AGENT_ID]: true })
  const [coreHistoryMenuId, setCoreHistoryMenuId] = useState<string | null>(null)
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
      if (conversationSection(room) === 'topic') setOpenEmployeeTopics(previous => ({ ...previous, [room.agentIds[0]]: true }))
      return
    }
    if (!isChannelConversation(room)) return
    setChannelOpen(value => ({ ...value, [room.kind]: true }))
    setQuery(value => room.title.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()) ? value : '')
  }, [selectedId, selection, channelAgent, snapshot.conversations])
  const [confirmation, setConfirmation] = useState<ConversationHistoryTarget | null>(null)
  const pendingRoom = pendingPin && snapshot.conversations.find(room => room.id === pendingPin.id)
  const pinUpdates = pendingPin && pendingRoom && !pendingRoom.list?.hidden && Boolean(pendingRoom.list?.pinned) !== pendingPin.pinned
    ? new Map(conversationListUpdates(snapshot.conversations, pendingPin, messageTimes).map(room => [room.id, room]))
    : null
  const conversations = pinUpdates ? snapshot.conversations.map(room => pinUpdates.get(room.id) ?? room) : snapshot.conversations
  const visible = sortedConversations(conversations, messageTimes)
  const selectedTopic = visible.find(room => room.id === selectedId && conversationSection(room) === 'topic')
  const channelsByAgent = new Map<string, Conversation[]>()
  const topicsByAgent = new Map<string, Conversation[]>()
  for (const room of visible) {
    if (isChannelConversation(room)) {
      for (const id of room.agentIds) {
        const rooms = channelsByAgent.get(id) ?? []
        rooms.push(room)
        channelsByAgent.set(id, rooms)
      }
    } else if (conversationSection(room) === 'topic') {
      const id = room.agentIds[0], topics = topicsByAgent.get(id) ?? []
      topics.push(room)
      topicsByAgent.set(id, topics)
    }
  }
  const search = query.trim().toLocaleLowerCase()
  const coreAgent = channelAgent ? undefined : snapshot.agents.find(isCoreAgent)
  const title = (item: Conversation) => isCoreConversation(item) && item.employeeChat === 'main' ? coreAgent?.name ?? item.title : item.title
  const matches = (item: Conversation) => title(item).toLocaleLowerCase().includes(search)
  const visibleConversations = channelAgent ? (channelsByAgent.get(channelAgent.id) ?? []) : mainConversations(conversations, messageTimes)
  const confirm = (conversation: Conversation, hide: boolean) => setConfirmation({ conversation: { ...conversation, title: title(conversation) }, hide })
  const allCore = coreAgent ? visible.filter(room => isCoreConversation(room) && !isChannelConversation(room)) : []
  const ordinary = channelAgent ? [] : [...visibleConversations]
  for (const id of topicsByAgent.keys()) {
    if (id === CORE_AGENT_ID || ordinary.some(room => isEmployeeMainChat(room, id))) continue
    const main = snapshot.conversations.find(room => isEmployeeMainChat(room, id))
    if (main) ordinary.push(main)
  }
  const pinName = (room: Conversation) => room.kind === 'direct' ? snapshot.agents.find(agent => agent.id === room.agentIds[0])?.name ?? room.title : room.title
  const ordinaryMatches = ordinary.filter(room => matches(room) || Boolean(room.list?.pinned && pinName(room).toLocaleLowerCase().includes(search)) ||
    room.kind === 'direct' && topicsByAgent.get(room.agentIds[0])?.some(matches))
  const hiddenCoreHistory = snapshot.conversations.some(room => isCoreConversation(room) && !isChannelConversation(room) && room.list?.hidden)
  const coreMain = coreAgent && ordinary.find(room => isEmployeeMainChat(room, CORE_AGENT_ID))
  const showCoreStart = coreAgent && !coreMain &&
    (topicsByAgent.has(coreAgent.id) || !hiddenCoreHistory) &&
    (!search || coreAgent.name.toLocaleLowerCase().includes(search) || topicsByAgent.get(coreAgent.id)?.some(matches))
  const listEmpty = !visibleConversations.length && (Boolean(channelAgent) || !topicsByAgent.size && !(showCoreStart && coreMainPlacement?.pinned))
  const saveCoreMainPlacement = (placement: CoreMainPlacement | null) => {
    setCoreMainPlacement(placement)
    try {
      if (placement) localStorage.setItem(CORE_MAIN_PLACEMENT_KEY, JSON.stringify(placement))
      else localStorage.removeItem(CORE_MAIN_PLACEMENT_KEY)
    } catch { /* Optional presentation preference. */ }
  }
  // The draft only owns a sidebar position. Use the existing list actions once a real main chat exists.
  useEffect(() => {
    if (!coreMain || !coreMainPlacement || transferringCorePlacement.current || busy || pendingPin) return
    transferringCorePlacement.current = true
    void (async () => {
      try {
        if (Boolean(coreMain.list?.pinned) !== coreMainPlacement.pinned) {
          await onChange({ id: coreMain.id, action: 'pin', pinned: coreMainPlacement.pinned })
        }
        const anchor = coreMainPlacement.nextTo
        const target = anchor && mainConversations(snapshot.conversations).find(room => room.id === anchor.targetId)
        if (anchor && target && Boolean(target.list?.pinned) === coreMainPlacement.pinned) {
          await onChange({ id: coreMain.id, action: 'move', ...anchor })
        }
      } finally {
        saveCoreMainPlacement(null)
        transferringCorePlacement.current = false
      }
    })()
  }, [coreMain, coreMainPlacement, busy, pendingPin, snapshot.conversations, onChange])
  const confirmAllCore = (hide: boolean) => { if (coreAgent) setConfirmation({ conversations: allCore, agentName: coreAgent.name, hide }) }
  const pin = async (id: string, pinned: boolean) => {
    if (busy || pendingPin || transferringCorePlacement.current) return
    if (id === CORE_MAIN_ENTRY) {
      saveCoreMainPlacement({ pinned })
      return
    }
    const change: PinChange = { id, action: 'pin', pinned }
    setPendingPin(change)
    try { await onChange(change) } finally { setPendingPin(null) }
  }
  const shownTopics = (employeeId: string) => channelAgent ? [] : (topicsByAgent.get(employeeId) ?? []).filter(matches)
  const topicsOpen = (employeeId: string) => Boolean(search) || (openEmployeeTopics[employeeId] ?? selectedTopic?.agentIds[0] === employeeId)
  const setTopicsOpen = (employeeId: string, open: boolean) => {
    if (!search) setOpenEmployeeTopics(previous => ({ ...previous, [employeeId]: open }))
  }
  const renderEmployeeActions = (agent: DigitalAgent) => <>
    {onCreateTopic && <ContextMenuItem disabled={busy} onClick={() => onCreateTopic(agent)}><SquarePen />新话题</ContextMenuItem>}
    {onConfigureAgent && <ContextMenuItem onClick={() => onConfigureAgent(agent)}><Settings />{isCoreAgent(agent) ? '助手设置' : '员工配置'}</ContextMenuItem>}
  </>
  const renderCoreHistoryActions = () => <><ContextMenuSeparator /><ContextMenuGroup>
    <ContextMenuItem disabled={busy || !allCore.length} onClick={() => confirmAllCore(false)}><Trash2 />清空所有记录</ContextMenuItem>
    <ContextMenuItem variant="destructive" disabled={busy || !allCore.length} onClick={() => confirmAllCore(true)}><Trash2 />删除所有会话</ContextMenuItem>
  </ContextMenuGroup></>
  const renderConversation = (conversation: Conversation, tile = false, topicOwner?: string) => {
        const coreConversation = isCoreConversation(conversation)
        const section = conversationSection(conversation)
        const compact = section === 'topic'
        const topicActive = !channelAgent && selectedTopic && isEmployeeMainChat(conversation, selectedTopic.agentIds[0])
        const isChannel = section === 'channel'
        const canPin = section === 'ordinary' && !conversation.list?.hidden
        const agent = snapshot.agents.find(a => a.id === conversation.agentIds[0])
        const messageTime = [messageTimes[conversation.id] ?? '', conversation.lastMessageAt ?? ''].sort().at(-1)!
        const members = conversation.agentIds.map(id => snapshot.agents.find(a => a.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
        const channels = !compact && !channelAgent && conversation.kind === 'direct' && agent ? channelsByAgent.get(agent.id) ?? [] : []
        const unread = channels.reduce((count, room) => count + (room.channelUnreadCount ?? 0), 0)
        const notification = channels.find(room => (room.channelUnreadCount ?? 0) > 0)
        const employee = !compact && conversation.kind === 'direct' ? agent : undefined
        const avatar = conversation.kind === 'group' && !isChannel ? <GroupAvatar members={members} /> : <Avatar name={agent?.name ?? conversation.title} seed={agent?.id} avatar={agent?.avatar} color={agent?.color} />
        const name = coreConversation && !compact && agent ? `${agent.name} 的主聊天` : tile ? pinName(conversation) : title(conversation)
        return <DragListItem id={conversation.id} className={cn('conversation-row relative', tile && 'conversation-pin-item')} key={conversation.id} horizontal={tile}>{({ dragging, dragProps }) => {
          const row = <><ContextMenu onOpenChange={open => { if (compact) setCoreHistoryMenuId(open ? conversation.id : null) }}>
            {compact ? <ContextMenuTrigger render={<div className={cn('conversation-item conversation-core-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging })} data-menu-open={coreHistoryMenuId === conversation.id || undefined} />} aria-label={conversation.title}>
              <Button variant="ghost" size="content" className="conversation-core-title" aria-label={conversation.title} {...dragProps} aria-current={selectedId === conversation.id ? 'page' : undefined} onClick={() => { if (!dragging) onSelect(conversation.id) }}><span className={cn('truncate', conversation.titleGenerating && 'shimmer')} aria-busy={conversation.titleGenerating || undefined}>{conversation.title}</span>{messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}</Button>
              <div className="conversation-core-actions">
              <DropdownMenu onOpenChange={open => setCoreHistoryMenuId(open ? conversation.id : null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="conversation-core-action" disabled={busy} aria-label={`${conversation.title} 的更多操作`} title="更多操作" />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40"><DropdownMenuGroup><DropdownMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup>
                  <DropdownMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</DropdownMenuItem>
                </DropdownMenuGroup></DropdownMenuContent>
              </DropdownMenu>
              </div>
            </ContextMenuTrigger> : <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: selectedId === conversation.id, 'drag-list-dragging': dragging }, tile && 'conversation-pin-tile')} data-active-topic={topicActive || undefined} />} aria-label={name}
              {...dragProps} onDragStart={event => {
                dragProps.onDragStart?.(event)
                if (canPin && !event.defaultPrevented) setPinDragImage(event, pinName(conversation))
              }} aria-current={selectedId === conversation.id ? 'page' : undefined} aria-description={`${topicActive ? '当前会话是此员工的话题。' : ''}${conversation.list?.pinned ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
              onClick={() => { if (!dragging) onSelect(conversation.id) }}>
              {avatar}
              {tile ? <span className="conversation-pin-name">{pinName(conversation)}</span> : <span className="conversation-copy"><span className="conversation-title">{title(conversation)}
                {messageTime && <time dateTime={messageTime}>{timeText(messageTime)}</time>}
              </span><span className={cn('conversation-preview', { 'pr-24': notification })}>{previews[conversation.id] || conversation.lastMessagePreview || ''}</span></span>}
            </ContextMenuTrigger>}
            <ContextMenuContent className="w-40">{(!isChannel || employee && onConfigureAgent) && <><ContextMenuGroup>
              {employee && (isChannel ? onConfigureAgent && <ContextMenuItem onClick={() => onConfigureAgent(employee)}><Settings />员工配置</ContextMenuItem> : renderEmployeeActions(employee))}
              {!isChannel && compact && <ContextMenuItem disabled={busy || conversation.list?.hidden} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</ContextMenuItem>}
              {tile && notification && agent && <ContextMenuItem onClick={() => onOpenChannels?.(agent, notification.id)}>{CHANNEL_NAMES[notification.channel!.platform]} · 新回复 {unread}</ContextMenuItem>}
              {canPin && <ContextMenuItem disabled={busy || Boolean(pendingPin)} onClick={() => { void pin(conversation.id, !conversation.list?.pinned) }}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</ContextMenuItem>}
            </ContextMenuGroup><ContextMenuSeparator /></>}<ContextMenuGroup>
              <ContextMenuItem disabled={busy} onClick={() => confirm(conversation, false)}><Trash2 />清空聊天记录</ContextMenuItem>
              <ContextMenuItem variant="destructive" disabled={busy} onClick={() => confirm(conversation, true)}><Trash2 />删除会话</ContextMenuItem>
            </ContextMenuGroup>{coreConversation && employee && renderCoreHistoryActions()}</ContextMenuContent>
          </ContextMenu>
          {!tile && notification && agent && <Button variant="ghost" size="content" className="absolute bottom-2 right-3 text-xs text-primary" aria-label={`${agent.name}的渠道有${unread}条新回复`} onClick={() => onOpenChannels?.(agent, notification.id)}>{CHANNEL_NAMES[notification.channel!.platform]} · 新回复 {unread}</Button>}
          </>
          return topicOwner === undefined ? row : <EmployeeConversationRow topicOwner={topicOwner}>
            <div className="conversation-row relative">{row}</div>
          </EmployeeConversationRow>
        }}</DragListItem>
  }
  const renderEmployee = (conversation: Conversation) => {
    const employeeId = conversation.agentIds[0]
    const topics = conversation.kind === 'direct' ? shownTopics(employeeId) : []
    const topicOwner = isCoreConversation(conversation) ? coreAgent?.name ?? conversation.title : conversation.title
    if (!topics.length) return renderConversation(conversation)
    return <Collapsible key={conversation.id} open={topicsOpen(employeeId)} onOpenChange={value => setTopicsOpen(employeeId, value)}>
      {renderConversation(conversation, false, topicOwner)}
      <CollapsibleContent><div className="conversation-core-history" role="group" aria-label={isCoreConversation(conversation) ? `${topicOwner} 的会话` : `${topicOwner} 的话题列表`}>{topics.map(topic => renderConversation(topic))}</div></CollapsibleContent>
    </Collapsible>
  }
  const channel = (channelAgent ? visibleConversations : []).filter(matches)
  const placedCoreId = showCoreStart ? CORE_MAIN_ENTRY : coreMainPlacement && ordinaryMatches.find(room => room.id === coreMain?.id)?.id
  const pinned = ordinaryMatches.filter(item => item.id !== placedCoreId && !item.list?.hidden && item.list?.pinned)
  const regular = ordinaryMatches.filter(item => item.id !== placedCoreId && (item.list?.hidden || !item.list?.pinned))
  const pinnedIds = pinned.map(item => item.id)
  const regularIds = regular.map(item => item.id)
  const corePinned = Boolean(coreMainPlacement?.pinned)
  if (placedCoreId) {
    const ids = corePinned ? pinnedIds : regularIds
    placeRelative(ids, placedCoreId, coreMainPlacement?.nextTo, coreMainPlacement ? 0 : ids.length)
  }
  const pinnedEmployees = new Set(pinned.filter(room => room.kind === 'direct').map(room => room.agentIds[0]))
  if (placedCoreId && corePinned) pinnedEmployees.add(CORE_AGENT_ID)
  const otherRows = [...channel,
    ...(!channelAgent ? visible.filter(room => conversationSection(room) === 'topic' && !pinnedEmployees.has(room.agentIds[0]) && matches(room)) : [])]
  const byId = new Map([...ordinaryMatches, ...otherRows].map(room => [room.id, room]))
  const dragIds = [...pinnedIds, ...regularIds, ...otherRows.map(room => room.id)].filter(id => !byId.get(id)?.list?.hidden)
  const isPinned = (id: string) => id === placedCoreId ? corePinned : Boolean(byId.get(id)?.list?.pinned)
  const groupOf = (id: string) => {
    if (id === CORE_MAIN_ENTRY) return 'ordinary'
    const room = byId.get(id)
    return room && conversationSection(room)
  }
  const pinTarget = 'conversation-pin-target'
  const regularTarget = 'conversation-regular-target'
  const sortingBusy = busy || Boolean(pendingPin || coreMain && coreMainPlacement)
  const move = async (move: ListMove) => {
    const { id, targetId, placement } = move
    if (id === CORE_MAIN_ENTRY) {
      saveCoreMainPlacement({ pinned: corePinned, nextTo: { targetId, placement } })
    } else if (targetId === CORE_MAIN_ENTRY) {
      const group = corePinned ? pinnedIds : regularIds
      const original = group.filter(id => id !== CORE_MAIN_ENTRY && !byId.get(id)?.list?.hidden)
      const order = group.filter(value => value !== id && (value === CORE_MAIN_ENTRY || !byId.get(value)?.list?.hidden))
      placeRelative(order, id, move)
      const realOrder = order.filter(value => value !== CORE_MAIN_ENTRY)
      const index = realOrder.indexOf(id)
      if (index !== original.indexOf(id)) {
        const previous = realOrder[index - 1]
        await onChange({ id, action: 'move', targetId: previous ?? realOrder[index + 1], placement: previous ? 'after' : 'before' })
      }
      saveCoreMainPlacement({ pinned: corePinned, nextTo: { targetId: id, placement: placement === 'before' ? 'after' : 'before' } })
    } else await onChange({ ...move, action: 'move' })
  }
  const renderCoreStart = (agent: DigitalAgent, tile = false) => {
    const topics = shownTopics(agent.id)
    const row = <DragListItem key={CORE_MAIN_ENTRY} id={CORE_MAIN_ENTRY} horizontal={tile} className={cn('conversation-row relative', tile && 'conversation-pin-item')}>{({ dragging, dragProps }) => {
      const entry = <ContextMenu>
        <ContextMenuTrigger render={<Button variant="ghost" size="content" className={cn('conversation-item', { selected: mainDraftEmployeeId === agent.id, 'drag-list-dragging': dragging }, tile && 'conversation-pin-tile')} data-main-placeholder="" />}
          {...dragProps} aria-label={`${agent.name} 的主聊天`} aria-current={mainDraftEmployeeId === agent.id ? 'page' : undefined}
          aria-description={`${tile ? '已置顶。' : ''}可拖拽排序，或按 Alt 加上下方向键移动。右键打开菜单。`}
          data-active-topic={selectedTopic?.agentIds[0] === agent.id || undefined}
          onDragStart={event => { dragProps.onDragStart?.(event); if (!event.defaultPrevented) setPinDragImage(event, agent.name) }}
          onClick={() => { if (!dragging) onOpenMain?.(agent) }}>
          <Avatar name={agent.name} seed={agent.id} avatar={agent.avatar} color={agent.color} />
          {tile ? <span className="conversation-pin-name">{agent.name}</span> : <span className="conversation-copy"><span className="conversation-title">{agent.name}</span><span className="conversation-preview">{agent.role}</span></span>}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">{renderEmployeeActions(agent)}<ContextMenuItem disabled={sortingBusy} onClick={() => { void pin(CORE_MAIN_ENTRY, !tile) }}><Pin />{tile ? '取消置顶' : '置顶'}</ContextMenuItem>{renderCoreHistoryActions()}</ContextMenuContent>
      </ContextMenu>
      return tile ? entry : <EmployeeConversationRow topicOwner={topics.length ? agent.name : undefined}>{entry}</EmployeeConversationRow>
    }}</DragListItem>
    return tile || !topics.length ? row : <Collapsible key={CORE_MAIN_ENTRY} open={topicsOpen(agent.id)} onOpenChange={open => setTopicsOpen(agent.id, open)}>
      {row}
      <CollapsibleContent><div className="conversation-core-history" role="group" aria-label={`${agent.name} 的会话`}>{topics.map(topic => renderConversation(topic))}</div></CollapsibleContent>
    </Collapsible>
  }
  return <div className="conversation-list-panel">
    {showHeading && <div className="list-heading"><h2>{channelAgent ? `${channelAgent.name}的渠道` : '会话'}</h2><div className="list-heading-actions">{channelAgent ? onBack && <Button variant="ghost" size="icon-sm" aria-label="返回员工主聊天" onClick={onBack}><ChevronLeft /></Button> : <AddContactMenu onCreate={onCreate} />}</div></div>}
    <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索会话" placeholder="搜索会话名称" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
    <div className={cn("conversation-list", !channelAgent && "conversation-sidebar-list")} role="navigation" aria-label="会话列表">
      <DragList ids={dragIds} disabled={sortingBusy || Boolean(search)} canMove={(id, targetId) => {
        if (id === CORE_MAIN_ENTRY || targetId === CORE_MAIN_ENTRY) return groupOf(id) === groupOf(targetId) && isPinned(id) === isPinned(targetId)
        const source = byId.get(id), target = byId.get(targetId)
        if (!source || !target) return false
        const section = conversationSection(source)
        return section === conversationSection(target) && (section !== 'topic' || source.agentIds[0] === target.agentIds[0]) &&
          (!channelAgent || source.kind === target.kind) && Boolean(source.list?.pinned) === Boolean(target.list?.pinned)
      }} onMove={move} canGroupDrop={(id, target) => {
        return groupOf(id) === 'ordinary' && (isPinned(id) ? target === regularTarget : target === pinTarget)
      }} onGroupDrop={(id, target) => {
        if (target === regularTarget) setRegularOpen(true)
        void pin(id, target === pinTarget)
      }}>
      {!channelAgent && <>
        <DragListGroupTarget id={pinTarget} className="conversation-pin-shelf">{eligible => pinnedIds.length
          ? <div className="conversation-pin-grid" role="group" aria-label="置顶会话">{pinnedIds.map(id => id === CORE_MAIN_ENTRY && coreAgent ? renderCoreStart(coreAgent, true) : renderConversation(byId.get(id)!, true))}</div>
          : eligible ? <div className="list-pin-placeholder">拖到此处置顶</div> : null}
        </DragListGroupTarget>
        <DragListGroupTarget id={regularTarget} className="conversation-regular-drop"><Collapsible className="conversation-regular-list" open={Boolean(search) || regularOpen} onOpenChange={open => { if (!search) setRegularOpen(open) }}>
          {regularIds.length > 0 && <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>会话<ChevronRight /></CollapsibleTrigger>}
          <CollapsibleContent><div role="group" aria-label="普通会话">
            {regularIds.map(id => id === CORE_MAIN_ENTRY && coreAgent ? renderCoreStart(coreAgent) : renderEmployee(byId.get(id)!))}
          </div></CollapsibleContent>
        </Collapsible></DragListGroupTarget>
      </>}
      {channelAgent && <div role="group" aria-label="渠道会话">{(['direct', 'group'] as const).map(kind => {
        const rooms = channel.filter(room => room.kind === kind)
        const label = kind === 'direct' ? '私聊' : '群聊'
        return <Collapsible key={kind} open={Boolean(search) || channelOpen[kind]} onOpenChange={open => { if (!search) setChannelOpen(value => ({ ...value, [kind]: open })) }}>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>{label}<ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><div role="group" aria-label={`渠道${label}`}>{rooms.map(room => renderConversation(room))}</div></CollapsibleContent>
        </Collapsible>
      })}</div>}
      </DragList>
      {listEmpty && <Empty className="conversation-list-empty flex-none px-3 py-8">
        <EmptyHeader><EmptyMedia><img src={conversationCompanions} className="select-none" draggable={false} width={144} height={110} alt="等你开聊的小伙伴" /></EmptyMedia>
          <EmptyDescription className="text-xs leading-relaxed">{channelAgent ? '机器人收到的私聊和群消息会出现在这里。' : '找个小伙伴，聊聊新想法吧。'}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
    </div>
    <ConversationHistoryDialog target={confirmation} busy={busy} onClose={() => setConfirmation(null)} onClear={onClear} />
  </div>
}
