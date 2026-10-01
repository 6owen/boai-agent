/*
 * [INPUT]: 通讯录分类、员工计数与版本化保存回调。
 * [OUTPUT]: 分类 label 右侧控件随行悬停/键盘聚焦显示、确认期间保持显示并继承文字颜色；加号分类管理与分类标题右键操作共用受控重命名/解散/整类员工删除确认，保留分类拖拽/键盘排序、新建/重命名原位编辑及处理中保护。
 * [POS]: contacts 的分类管理菜单；复用全局 DropdownMenu、Popover、Input 和 Button。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { ContactListAction, ContactListPreferences } from '@shared/domain/contact-list'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { Banner } from '@/components/common'
import { FolderOpen, Pencil, Plus, Trash2 } from '@/components/icons'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

export interface ContactCategoryOperation {
  kind: 'rename' | 'delete' | 'delete-agents'
  category: { id: string; name: string }
  agentIds: string[]
  revision: number
}

export function ContactCategoryDialog({ target, busy, error, change, onClose }: {
  target: ContactCategoryOperation | null; busy: boolean; error: string
  change(action: ContactListAction): Promise<boolean>; onClose(): void
}) {
  const [draft, setDraft] = useState({ id: target?.category.id, name: target?.category.name ?? '' })
  if (draft.id !== target?.category.id) setDraft({ id: target?.category.id, name: target?.category.name ?? '' })
  const close = () => { if (!busy) onClose() }
  if (target?.kind === 'rename') return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader><DialogTitle>修改分类名称</DialogTitle><DialogDescription>修改“{target.category.name}”的名称。</DialogDescription></DialogHeader>
      <form onSubmit={event => {
        event.preventDefault()
        if (busy || !draft.name.trim()) return
        void change({ kind: 'rename-category', categoryId: target.category.id, name: draft.name }).then(saved => { if (saved) onClose() })
      }}>
        <Input autoFocus aria-label="员工分类名称" maxLength={40} disabled={busy} value={draft.name} onChange={event => setDraft({ id: target.category.id, name: event.target.value })} />
        {error && <Banner>{error}</Banner>}
        <DialogFooter variant="plain"><Button type="button" variant="ghost" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !draft.name.trim()}>保存</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  const deleteAgents = target?.kind === 'delete-agents'
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open) close() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{deleteAgents ? '删除分类及全部员工' : '解散分类'}？</AlertDialogTitle>
        <AlertDialogDescription>{deleteAgents
          ? `将删除“${target?.category.name}”及其中全部 ${target?.agentIds.length ?? 0} 位员工，永久清空这些员工的单聊记录、记忆和工作区，无法恢复。员工会从群聊中移除，有成员的群聊记录保留，空群自动解散。`
          : `将解散“${target?.category.name}”，分类中的员工回到未分类，员工和聊天记录保留。`}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <Banner>{error}</Banner>}
      <AlertDialogFooter><Button variant="secondary" disabled={busy} onClick={close}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => {
        if (target) void change({ kind: deleteAgents ? 'delete-category-agents' : 'delete-category', categoryId: target.category.id }).then(saved => { if (saved) onClose() })
      }}>{busy ? '正在删除…' : deleteAgents ? '删除分类及全部员工' : '解散分类'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

export function ContactCategories({ value, agentIds, change, busy }: { value: ContactListPreferences | null; agentIds: string[]; change(action: ContactListAction): Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const cancel = () => { setEditing(null); setName('') }
  const form = <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={event => {
    event.preventDefault()
    if (busy || !name.trim()) return
    void change(editing ? { kind: 'rename-category', categoryId: editing, name } : { kind: 'create-category', name }).then(saved => { if (saved) cancel() })
  }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') cancel() }}>
    <Input className="min-w-0" aria-label="员工分类名称" autoFocus maxLength={40} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="分类名称" />
    <Button type="submit" size="sm" disabled={busy || !name.trim()}>保存</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>取消</Button>
  </form>
  return <DropdownMenuSub onOpenChange={open => { if (!open) { cancel(); setDeleting(null) } }}>
    <DropdownMenuSubTrigger><FolderOpen />分类</DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="w-80">
      <DropdownMenuGroup>
      <div className="contact-categories-heading flex items-center justify-between gap-2" data-editing={editing === '' || undefined}><DropdownMenuLabel>员工分类</DropdownMenuLabel><DropdownMenuItem nativeButton closeOnClick={false} render={<Button variant="ghost" size="icon-sm" aria-label="新建员工分类" />} className="contact-category-action p-0" disabled={busy || !value} onClick={() => { setEditing(''); setName('') }}><Plus /></DropdownMenuItem></div>
      <div className="max-h-72 overflow-y-auto">
        <DragList ids={value?.categories.map(category => category.id) ?? []} disabled={busy || editing !== null || deleting !== null} onMove={({ id, targetId, placement }) => { void change({ kind: 'move-category', categoryId: id, targetId, placement }) }}>
        {value?.categories.map(category => <DragListItem key={category.id} id={category.id}>{({ dragging, dragProps }) => <DropdownMenuItem {...dragProps} closeOnClick={false} label={category.name} aria-label={`员工分类 ${category.name}`} data-confirming={deleting === category.id || undefined} onKeyDown={event => { if (event.target !== event.currentTarget && event.key !== 'Escape') event.stopPropagation(); else dragProps.onKeyDown?.(event) }} className={`contact-category-item min-h-10${dragging ? ' drag-list-dragging' : ''}`}>
          {editing === category.id ? form : <>
            <span className="min-w-0 flex-1 truncate text-sm" title={category.name}>{category.name}</span><span className="text-xs text-muted-foreground">{agentIds.filter(id => value.categoryByAgentId[id] === category.id).length}</span>
            <Button variant="ghost" size="icon-sm" className="contact-category-action" aria-label={`重命名分类 ${category.name}`} disabled={busy} onClick={() => { setEditing(category.id); setName(category.name) }}><Pencil /></Button>
            <Popover open={deleting === category.id} onOpenChange={open => setDeleting(open ? category.id : null)}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="contact-category-action" aria-label={`删除分类 ${category.name}`} disabled={busy} />}><Trash2 /></PopoverTrigger><PopoverContent side="right" align="start" className="w-60">
              <PopoverTitle>删除“{category.name}”？</PopoverTitle><PopoverDescription>分类中的员工会回到未分类，员工和聊天记录都会保留。</PopoverDescription>
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => { void change({ kind: 'delete-category', categoryId: category.id }).then(saved => { if (saved) setDeleting(null) }) }}>删除分类</Button></div>
            </PopoverContent></Popover>
          </>}
        </DropdownMenuItem>}</DragListItem>)}
        </DragList>
        {editing === '' && <div className="px-3 py-2">{form}</div>}
      </div>
      {!value?.categories.length && editing === null && <p className="px-3 py-2 text-sm text-muted-foreground">创建一个分类，再通过员工的右键菜单归类。</p>}
      </DropdownMenuGroup>
    </DropdownMenuSubContent>
  </DropdownMenuSub>
}
