/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道镜像移除常驻三Tabs，文件和执行以Header入口进入同容器详情。
 * [OUTPUT]: 导出ConversationHeaderLayout供渠道空态共用标题/操作栏，渐隐滚动与宽度规则沿共享聊天布局。
 * [OUTPUT]: 右侧渠道聊天通过headerActions注入列表Popover按钮；共用聊天标题/任务/文件入口。
 * [OUTPUT]: 2026-10-14现行分离合同：员工主私聊右上角渠道入口，渠道详情保持只读来源与接入员工。
 * [INPUT]: 最新会话/成员/资料快照、群组/员工配置与任务入口、列表更新与清理回调、统一 DropdownMenu 与成员资料浮层。
 * [OUTPUT]: 外部渠道仅显示接入员工与渠道信息入口，不呈现BOAI群成员管理。
 * [OUTPUT]: 同一会话受控聊天/任务/文件标签；执行入口独立为操作菜单左侧图标按钮；核心标题编辑、置顶及成员资料保持。
 * [POS]: 会话标题交互；清空确认复用 ConversationHistoryDialog，持久操作交给宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState, type ReactNode } from 'react'
import type { Conversation, DigitalAgent, Resource } from '@shared/domain'
import { isChannelConversation, type ConversationListChange } from '@shared/domain/conversation-list'
import { isCoreConversation } from '@shared/domain/core-agent'
import { Workflow, FolderOpen, MoreHorizontal, Pencil, Pin, Search, Settings, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConversationHistoryDialog } from './conversation-history-dialog'
import { AgentInfoPopover } from './agent-info-popover'

interface Props {
  conversation: Conversation; busy: boolean
  members: DigitalAgent[]; resources: Resource[]
  onDetails(): void; onActivity(): void; onTrace(): void; onSearch(): void; onChange(change: ConversationListChange): void
  onConfigureAgent(agent: DigitalAgent): void
  onEditTitle(conversation: Conversation): void
  onClear(id: string, hide: boolean): Promise<void>
  onFiles?(): void
  onChannels?(): void
  headerActions?: ReactNode
  view?: 'chat' | 'tasks' | 'files'
  onViewChange?(view: 'chat' | 'tasks' | 'files'): void
}

export function ConversationHeaderLayout({ title, description, tabs, children }: { title: string; description?: string; tabs?: ReactNode; children?: ReactNode }) {
  return <header className="chat-header">
    <div className="chat-header-main"><div className="chat-heading"><h2 className="chat-title">{title}</h2>{description && <span className="field-hint">{description}</span>}</div></div>
    {tabs}
    <div className="chat-header-actions">{children}</div>
  </header>
}

export function ConversationHeader({ conversation, members, resources, busy, onDetails, onConfigureAgent, onEditTitle, onActivity, onTrace, onSearch, onChange, onClear, view = 'chat', onViewChange, onChannels, headerActions, onFiles }: Props) {
  const [clearing, setClearing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const channel = isChannelConversation(conversation)
  const openDetails = (open: () => void) => { trigger.current?.focus(); open() }
  return <>
    <ConversationHeaderLayout title={conversation.title} description={channel ? '渠道会话' : undefined}
      tabs={!channel && conversation.purpose !== 'channel-internal' && onViewChange && <Tabs value={view} onValueChange={value => onViewChange(value as 'chat' | 'tasks' | 'files')} className="pointer-events-auto shrink-0"><TabsList aria-label="会话视图"><TabsTrigger value="chat">聊天</TabsTrigger><TabsTrigger value="tasks">任务</TabsTrigger><TabsTrigger value="files">文件</TabsTrigger></TabsList></Tabs>}>
        {headerActions}
        {onFiles && <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看渠道文件" onClick={onFiles} />}><FolderOpen /></TooltipTrigger><TooltipContent>文件</TooltipContent></Tooltip>}
        {onChannels && <Button variant="ghost" size="sm" onClick={onChannels} aria-label="打开员工渠道会话">渠道</Button>}
        {(conversation.kind === 'group' || channel) && <>
          <div className="chat-members" aria-label={channel ? '接入员工' : '群聊成员'}>
            {members.slice(0, 3).map(member => <AgentInfoPopover key={member.id} agent={member} resources={resources} placement="header" onConfigure={() => onConfigureAgent(member)} />)}
            {members.length > 3 && <Button variant="link" size="content" className="chat-members-more" aria-label={`打开${channel ? '渠道信息' : '群组设置'}，另有 ${members.length - 3} 位成员`} title={channel ? '渠道信息' : '群组设置'} onClick={event => { event.currentTarget.focus(); onDetails() }}>+{members.length - 3}</Button>}
          </div>
        </>}
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="打开执行面板" onClick={event => { event.currentTarget.focus(); onTrace() }} />}><Workflow /></TooltipTrigger><TooltipContent>执行</TooltipContent></Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button ref={trigger} variant="ghost" size="icon-sm" aria-label="会话操作" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openDetails(onDetails)}><Settings />{channel ? '渠道信息' : '配置'}</DropdownMenuItem>
              {isCoreConversation(conversation) ? <DropdownMenuItem disabled={busy} onClick={() => onEditTitle(conversation)}><Pencil />编辑标题</DropdownMenuItem> : <DropdownMenuItem disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => openDetails(onActivity)}><FolderOpen />任务与产物</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDetails(onSearch)}><Search />搜索本会话</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setClearing(true)}><Trash2 />清空聊天记录</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
    </ConversationHeaderLayout>
    <ConversationHistoryDialog target={clearing ? { conversation, hide: false } : null} busy={busy} onClose={() => setClearing(false)} onClear={onClear} />
  </>
}
