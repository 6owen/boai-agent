/*
 * [INPUT]: 最新会话/成员/资料快照、配置/任务入口、列表更新与清理回调、统一 DropdownMenu 与成员资料浮层。
 * [OUTPUT]: 群聊仅显示群名，重叠头像打开成员资料、剩余人数以悬停变色的文字打开群组设置；保留任务产物入口与单聊悬浮名称，详情关闭焦点复用既有生命周期。
 * [POS]: 会话标题交互；清空确认复用 ConversationHistoryDialog，持久操作交给宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState } from 'react'
import type { Conversation, DigitalAgent, Resource } from '@shared/domain'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import { Workflow, FolderOpen, MoreHorizontal, Pin, Settings, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConversationHistoryDialog } from './conversation-history-dialog'
import { AgentInfoPopover } from './agent-info-popover'

interface Props {
  conversation: Conversation; busy: boolean
  members: DigitalAgent[]; resources: Resource[]
  onDetails(): void; onActivity(): void; onTrace(): void; onChange(change: ConversationListChange): void
  onClear(id: string, hide: boolean): Promise<void>
}

export function ConversationHeader({ conversation, members, resources, busy, onDetails, onActivity, onTrace, onChange, onClear }: Props) {
  const [clearing, setClearing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const openDetails = (open: () => void) => { trigger.current?.focus(); open() }
  return <>
    <header className="chat-header">
      <div className="chat-heading"><h2 className="chat-title">{conversation.title}</h2></div>
      <div className="chat-header-actions">
        {conversation.kind === 'group' && <>
          <div className="chat-members" aria-label="群聊成员">
            {members.slice(0, 3).map(member => <AgentInfoPopover key={member.id} agent={member} resources={resources} placement="header" />)}
            {members.length > 3 && <Button variant="link" size="content" className="chat-members-more" aria-label={`打开群组设置，另有 ${members.length - 3} 位成员`} title="群组设置" onClick={event => { event.currentTarget.focus(); onDetails() }}>+{members.length - 3}</Button>}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="打开任务与产物" title="任务与产物" onClick={event => { event.currentTarget.focus(); onActivity() }}><FolderOpen /></Button>
        </>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button ref={trigger} variant="ghost" size="icon-sm" aria-label="会话操作" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openDetails(onDetails)}><Settings />配置</DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDetails(onTrace)}><Workflow />执行过程</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openDetails(onActivity)}><FolderOpen />任务与产物</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setClearing(true)}><Trash2 />清空聊天记录</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <ConversationHistoryDialog target={clearing ? { conversation, hide: false } : null} busy={busy} onClose={() => setClearing(false)} onClear={onClear} />
  </>
}
