/*
 * [INPUT]: 最新会话快照、配置/任务入口、列表更新与清理回调、统一 DropdownMenu。
 * [OUTPUT]: 悬浮纯名称标题与配置、置顶/取消置顶、任务与产物、清空菜单；详情关闭后返回稳定的菜单按钮焦点。
 * [POS]: 会话标题交互；清空确认复用 ConversationHistoryDialog，持久操作交给宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useRef, useState } from 'react'
import type { Conversation } from '@shared/domain'
import type { ConversationListChange } from '@shared/domain/conversation-list'
import { FolderOpen, MoreHorizontal, Pin, Settings, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConversationHistoryDialog } from './conversation-history-dialog'

interface Props {
  conversation: Conversation; busy: boolean
  onDetails(): void; onActivity(): void; onChange(change: ConversationListChange): void
  onClear(id: string, hide: boolean): Promise<void>
}

export function ConversationHeader({ conversation, busy, onDetails, onActivity, onChange, onClear }: Props) {
  const [clearing, setClearing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const openDetails = (open: () => void) => { trigger.current?.focus(); open() }
  return <>
    <header className="chat-header">
      <h2 className="chat-title">{conversation.title}</h2>
      <div className="chat-header-actions">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button ref={trigger} variant="ghost" size="icon-sm" aria-label="会话操作" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openDetails(onDetails)}><Settings />配置</DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => onChange({ id: conversation.id, action: 'pin', pinned: !conversation.list?.pinned })}><Pin />{conversation.list?.pinned ? '取消置顶' : '置顶'}</DropdownMenuItem>
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
