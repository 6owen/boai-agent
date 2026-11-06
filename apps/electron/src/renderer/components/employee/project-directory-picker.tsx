/*
 * [INPUT]: 已保存项目位置或员工配置草稿、系统目录选择器与版本化保存回调。
 * [OUTPUT]: 项目短名/完整路径Tooltip、显式受管目录和目录选择；不修改目录授权或消息草稿。
 * [POS]: 员工默认项目、聊天与任务共用的目录控件；会话保存使用宿主CAS回执。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { Conversation } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { FolderOpen } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { errorText, showErrorToast } from '@/components/common'

export function ProjectDirectoryPicker({ api, directory, disabled = false, active = true, label = '项目目录', onChange, onBusyChange }: {
  api: DesktopApi; directory?: string; disabled?: boolean; active?: boolean; label?: string
  onChange(directory: string | undefined): void | Promise<void>; onBusyChange?(busy: boolean): void
}) {
  const [busy, setBusy] = useState(false)
  const flight = useRef(false), alive = useRef(true), currentActive = useRef(active); currentActive.current = active
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const name = directory ? directory.split(/[\\/]/).filter(Boolean).at(-1) || directory : 'BOAI 受管目录'
  const change = async (choose: boolean) => {
    if (disabled || !currentActive.current || flight.current) return
    flight.current = true; setBusy(true); onBusyChange?.(true)
    try {
      const next = choose ? await api.request('chooseProjectDirectory', undefined) : undefined
      if (next !== null && alive.current && currentActive.current) await onChange(next)
    } catch (error) { showErrorToast(errorText(error)) }
    finally { flight.current = false; if (alive.current) { setBusy(false); onBusyChange?.(false) } }
  }
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger delay={500} render={<DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="min-w-0 max-w-48 text-muted-foreground" disabled={disabled || busy} aria-label={`${label}：${name}`} />} />}><FolderOpen /><span className="truncate">{name}</span></TooltipTrigger>
      <TooltipContent side="top" className="max-w-96 break-all">{directory || '使用 BOAI 受管工作目录'}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent side="top" align="start" className="w-48">
      <DropdownMenuItem disabled={disabled || busy} onClick={() => void change(true)}>选择项目目录</DropdownMenuItem>
      <DropdownMenuItem disabled={disabled || busy || !directory} onClick={() => void change(false)}>使用 BOAI 受管目录</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

export function ConversationProjectPicker({ api, conversation, disabled, active = true, onSaved, onBusyChange }: {
  api: DesktopApi; conversation: Conversation; disabled?: boolean; active?: boolean
  onSaved(conversation: Conversation): void; onBusyChange?(busy: boolean): void
}) {
  const selection = conversation.projectSelection
  return <ProjectDirectoryPicker api={api} active={active} directory={selection?.mode === 'directory' ? selection.directory : undefined} disabled={disabled} onBusyChange={onBusyChange} onChange={async directory => {
    const committed = await api.request('updateConversationProject', { conversationId: conversation.id, expectedRevision: selection?.revision ?? 0, ...(directory ? { mode: 'directory' as const, directory } : { mode: 'managed' as const }) })
    onSaved(committed)
  }} />
}
