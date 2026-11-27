/*
 * [OUTPUT]: 长话题标题可换至两行，弹层适应窗口宽度并仅纵向滚动。
 * [OUTPUT]: 标题栏话题 Popover 只显示当前员工可见的话题，沿正常会话导航。
 * [OUTPUT]: 首句占位标题在生成期间复用 shadcn shimmer。
 * [OUTPUT]: 2026-11-09任务移入标题DropdownMenu，沿原关闭动画完成后导航，不再显示独立任务按钮。
 * [OUTPUT]: 2026-11-06 标题菜单拆分会话文件/知识资料，移除执行过程菜单项。
 * [OUTPUT]: 数字员工主聊天标题右侧任务按钮打开员工任务面板，与聊天并列。
 * [OUTPUT]: 标题栏随会话切换保持挂载，身份变化清理旧菜单动作与清空确认，避免把上一会话操作带入当前。
 * [OUTPUT]: 会话菜单移除网页预览与执行过程入口，会话文件和知识资料分别打开右侧面板。
 * [OUTPUT]: 文件收进标题下拉菜单，关闭菜单后打开右侧面板，与主聊天并行；无独立按钮或互斥Tabs。
 * [OUTPUT]: 任务保留标题按钮；文件和知识资料使用独立菜单入口。
 * [OUTPUT]: 菜单动作等待真实关闭动画完成再导航或打开面板，避免原触发器隐藏后Portal退出动画失去定位；重新打开或来源隐藏取消旧动作。
 * [OUTPUT]: 配置定位通讯录当前员工/群；会话文件、知识资料与渠道收进操作菜单，标题不再提供置顶或搜索本会话。
 * [OUTPUT]: 渠道标题保持单行，取消重复的“渠道会话”副标题。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道镜像移除常驻三Tabs，文件和执行以Header入口进入同容器详情。
 * [OUTPUT]: 导出ConversationHeaderLayout供渠道空态共用标题/操作栏，渐隐滚动与宽度规则沿共享聊天布局。
 * [OUTPUT]: 右侧渠道聊天通过headerActions注入列表Popover按钮；共用聊天标题/文件入口。
 * [OUTPUT]: 2026-10-14现行分离合同：员工主私聊右上角渠道入口，渠道详情保持只读来源与接入员工。
 * [OUTPUT]: bobo主聊天显示员工名，独立话题标题可在会话菜单中修改。
 * [INPUT]: 最新会话/成员/资料快照、群组/员工配置、执行/渠道与文件入口、标题编辑与清理回调、统一 DropdownMenu 与成员资料浮层。
 * [OUTPUT]: 外部渠道仅显示接入员工与渠道信息入口，不呈现BOAI群成员管理。
 * [OUTPUT]: 聊天标题下拉菜单中的文件打开右侧详情；核心标题编辑及成员资料保持。
 * [POS]: 会话标题交互；清空确认复用 ConversationHistoryDialog，持久操作交给宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import type { Conversation, DigitalAgent, Resource } from '@boai/shared/domain'
import { conversationSection, isChannelConversation, sortedConversations } from '@boai/shared/domain/conversation-list'
import { isCoreConversation } from '@boai/shared/domain/core-agent'
import { BookOpen, FolderOpen, List, MessageCircle, MoreHorizontal, Pencil, Settings, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ConversationHistoryDialog } from './conversation-history-dialog'
import { AgentInfoPopover } from './agent-info-popover'

interface Props {
  conversation: Conversation; busy: boolean
  members: DigitalAgent[]; resources: Resource[]
  onDetails(): void
  onConfigureAgent(agent: DigitalAgent): void
  onEditTitle(conversation: Conversation): void
  onClear(id: string, hide: boolean): Promise<void>
  onTasks?(): void
  onFiles?(): void
  onKnowledge?(): void
  onChannels?(): void
  headerActions?: ReactNode
}

export function ConversationHeaderLayout({ title, titleGenerating, description, children }: { title: string; titleGenerating?: boolean; description?: string; children?: ReactNode }) {
  return <header className="chat-header">
    <div className="chat-header-main"><div className="chat-heading"><h2 className={cn('chat-title', titleGenerating && 'w-fit shimmer')} aria-busy={titleGenerating || undefined}>{title}</h2>{description && <span className="field-hint">{description}</span>}</div></div>
    <div className="chat-header-actions">{children}</div>
  </header>
}

export function ConversationTopics({ conversation, conversations, messageTimes, onSelect }: {
  conversation: Conversation; conversations: Conversation[]; messageTimes: Record<string, string>; onSelect(id: string): void
}) {
  const [open, setOpen] = useState(false)
  const employeeId = conversation.agentIds[0]
  const topics = useMemo(() => sortedConversations(conversations.filter(room =>
    room.agentIds[0] === employeeId && conversationSection(room) === 'topic'), messageTimes), [conversations, employeeId, messageTimes])
  if (!topics.length) return null
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="话题列表" title="话题列表" />}><List /></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(22rem,var(--available-height))] overflow-x-hidden overflow-y-auto">
      <PopoverTitle>话题</PopoverTitle>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
        {topics.map(topic => <Button key={topic.id} variant="ghost" size="content" className="w-full min-w-0 px-2 py-1.5 aria-[current=page]:bg-muted"
          aria-current={topic.id === conversation.id ? 'page' : undefined} title={topic.title} onClick={() => {
            setOpen(false)
            if (topic.id !== conversation.id) onSelect(topic.id)
          }}><span className={cn('min-w-0 flex-1 line-clamp-2 whitespace-normal [overflow-wrap:anywhere] text-left', topic.titleGenerating && 'shimmer')}>{topic.title}</span></Button>)}
      </div>
    </PopoverContent>
  </Popover>
}

export function ConversationHeader({ conversation, members, resources, busy, onDetails, onConfigureAgent, onEditTitle, onClear, onChannels, headerActions, onFiles, onKnowledge, onTasks }: Props) {
  const [clearing, setClearing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => { pendingAction.current = null; setMenuOpen(false); setClearing(false) }, [conversation.id])
  const channel = isChannelConversation(conversation)
  const afterMenuClose = (action: () => void) => { pendingAction.current = action; setMenuOpen(false) }
  const completeMenuClose = (open: boolean) => {
    if (open) return
    const action = pendingAction.current
    pendingAction.current = null
    if (!action || !trigger.current?.getClientRects().length) return
    trigger.current.focus({ preventScroll: true })
    action()
  }
  const title = isCoreConversation(conversation) && conversation.employeeChat === 'main' ? members[0]?.name ?? conversation.title : conversation.title
  return <>
    <ConversationHeaderLayout title={title} titleGenerating={conversation.titleGenerating}>
        {headerActions}
        {(conversation.kind === 'group' || channel) && <>
          <div className="chat-members" aria-label={channel ? '接入员工' : '群聊成员'}>
            {members.slice(0, 3).map(member => <AgentInfoPopover key={member.id} agent={member} resources={resources} placement="header" onConfigure={() => onConfigureAgent(member)} />)}
            {members.length > 3 && <Button variant="link" size="content" className="chat-members-more" aria-label={`打开${channel ? '渠道信息' : '群组设置'}，另有 ${members.length - 3} 位成员`} title={channel ? '渠道信息' : '群组设置'} onClick={event => { event.currentTarget.focus(); onDetails() }}>+{members.length - 3}</Button>}
          </div>
        </>}
        <DropdownMenu open={menuOpen} onOpenChange={open => { if (open) pendingAction.current = null; setMenuOpen(open) }} onOpenChangeComplete={completeMenuClose}>
          <DropdownMenuTrigger render={<Button ref={trigger} variant="ghost" size="icon-sm" aria-label="会话操作" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => afterMenuClose(onDetails)}><Settings />{channel ? '渠道信息' : '配置'}</DropdownMenuItem>
              {(conversation.employeeChat === 'topic' || isCoreConversation(conversation) && conversation.employeeChat !== 'main') && <DropdownMenuItem disabled={busy} onClick={() => afterMenuClose(() => onEditTitle(conversation))}><Pencil />编辑标题</DropdownMenuItem>}
              {onTasks && <DropdownMenuItem onClick={() => afterMenuClose(onTasks)}><span className="app-icon i-carbon-task" />任务</DropdownMenuItem>}
              {onFiles && <DropdownMenuItem onClick={() => afterMenuClose(onFiles)}><FolderOpen />会话文件</DropdownMenuItem>}
              {onKnowledge && <DropdownMenuItem onClick={() => afterMenuClose(onKnowledge)}><BookOpen />知识资料</DropdownMenuItem>}
              {onChannels && <DropdownMenuItem onClick={() => afterMenuClose(onChannels)}><MessageCircle />渠道</DropdownMenuItem>}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => afterMenuClose(() => setClearing(true))}><Trash2 />清空聊天记录</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
    </ConversationHeaderLayout>
    <ConversationHistoryDialog target={clearing ? { conversation, hide: false } : null} busy={busy} onClose={() => setClearing(false)} onClear={onClear} />
  </>
}
