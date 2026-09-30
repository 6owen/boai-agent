/*
 * [INPUT]: 通讯录分类、员工计数与版本化保存回调。
 * [OUTPUT]: 加号菜单中的分类二级菜单，使用小字号标题；保留分类拖拽/键盘排序、新建/重命名原位编辑与删除确认，编辑或删除确认期间暂停排序。
 * [POS]: contacts 的分类管理菜单；复用全局 DropdownMenu、Popover、Input 和 Button。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { ContactListAction, ContactListPreferences } from '@shared/domain/contact-list'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { FolderOpen, Pencil, Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

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
      <div className="flex items-center justify-between gap-2"><DropdownMenuLabel>员工分类</DropdownMenuLabel><DropdownMenuItem nativeButton closeOnClick={false} render={<Button variant="ghost" size="icon-sm" aria-label="新建员工分类" />} className="p-0" disabled={busy || !value} onClick={() => { setEditing(''); setName('') }}><Plus /></DropdownMenuItem></div>
      <div className="max-h-72 overflow-y-auto">
        <DragList ids={value?.categories.map(category => category.id) ?? []} disabled={busy || editing !== null || deleting !== null} onMove={({ id, targetId, placement }) => { void change({ kind: 'move-category', categoryId: id, targetId, placement }) }}>
        {value?.categories.map(category => <DragListItem key={category.id} id={category.id}>{({ dragging, dragProps }) => <DropdownMenuItem {...dragProps} closeOnClick={false} label={category.name} aria-label={`员工分类 ${category.name}`} onKeyDown={event => { if (event.target !== event.currentTarget && event.key !== 'Escape') event.stopPropagation(); else dragProps.onKeyDown?.(event) }} className={`min-h-10${dragging ? ' drag-list-dragging' : ''}`}>
          {editing === category.id ? form : <>
            <span className="min-w-0 flex-1 truncate text-sm" title={category.name}>{category.name}</span><span className="text-xs text-muted-foreground">{agentIds.filter(id => value.categoryByAgentId[id] === category.id).length}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`重命名分类 ${category.name}`} disabled={busy} onClick={() => { setEditing(category.id); setName(category.name) }}><Pencil /></Button>
            <Popover open={deleting === category.id} onOpenChange={open => setDeleting(open ? category.id : null)}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`删除分类 ${category.name}`} disabled={busy} />}><Trash2 /></PopoverTrigger><PopoverContent side="right" align="start" className="w-60">
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
