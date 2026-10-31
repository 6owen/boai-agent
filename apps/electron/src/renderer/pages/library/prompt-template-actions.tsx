/*
 * [INPUT]: 当前提示词所见版本、操作锁定与删除回执回调。
 * [OUTPUT]: 列表仅删除，详情可提供编辑菜单项；锚定删除确认冻结所见版本，不提供行内分组/编辑按钮。
 * [POS]: 提示词显式删除交互，复用原版本化IPC与Sonner。
 * [PROTOCOL]: 修改同步Header与所属.folder.md。
 */
import { useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { PromptTemplate } from '@boai/shared/domain/prompt-templates'
import { useMutation } from '@/components/common'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTitle } from '@/components/ui/popover'
import { MoreHorizontal } from '@/components/icons'

export function PromptActions({ api, value, disabled = false, onEdit, onRemoved }: { api: DesktopApi; value: PromptTemplate; disabled?: boolean; onEdit?(): void; onRemoved(): void }) {
  const anchor = useRef<HTMLButtonElement>(null), [removing, setRemoving] = useState<PromptTemplate | null>(null)
  const { busy, run } = useMutation(), locked = disabled || busy
  return <>
    <DropdownMenu><DropdownMenuTrigger render={<Button ref={anchor} variant="ghost" size="icon-sm" disabled={locked} aria-label={`提示词操作 ${value.name}`} data-confirming={Boolean(removing) || undefined} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" finalFocus={removing ? false : undefined}>
      {onEdit && <DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>}
      <DropdownMenuItem variant="destructive" onClick={() => setRemoving(value)}>删除提示词</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
    <Popover open={Boolean(removing)} onOpenChange={open => { if (!locked && !open) setRemoving(null) }}><PopoverContent anchor={anchor} align="end" finalFocus={anchor}>
      <PopoverTitle>删除“{removing?.name}”？</PopoverTitle><div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={locked} onClick={() => setRemoving(null)}>取消</Button><Button variant="destructive" size="sm" disabled={locked} onClick={() => { if (removing) void run(async () => { await api.request('removePromptTemplate', { id: removing.id, expectedRevision: removing.revision }); setRemoving(null); onRemoved() }) }}>确认删除</Button></div>
    </PopoverContent></Popover>
  </>
}
