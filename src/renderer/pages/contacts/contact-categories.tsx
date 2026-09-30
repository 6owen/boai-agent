/*
 * [INPUT]: 通讯录分类、员工计数与版本化保存回调。
 * [OUTPUT]: 紧凑员工分类管理浮层；分类拖拽/键盘排序、新建/重命名原位编辑，删除确认明确保留员工；编辑或删除确认期间暂停排序。
 * [POS]: contacts 的分类管理入口；复用全局 Popover、Input 和 Button。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { ContactListAction, ContactListPreferences } from '@shared/domain/contact-list'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { FolderOpen, Pencil, Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
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
  }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel() } }}>
    <Input className="min-w-0" aria-label="员工分类名称" autoFocus maxLength={40} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="分类名称" />
    <Button type="submit" size="sm" disabled={busy || !name.trim()}>保存</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>取消</Button>
  </form>
  return <Popover onOpenChange={open => { if (!open) { cancel(); setDeleting(null) } }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="管理员工分类" title="员工分类" />}><FolderOpen /></PopoverTrigger>
    <PopoverContent align="start" className="w-80 gap-1 p-2">
      <div className="flex items-center justify-between gap-2 px-2 py-1"><PopoverTitle>员工分类</PopoverTitle><Button variant="ghost" size="icon-sm" aria-label="新建员工分类" disabled={busy || !value} onClick={() => { setEditing(''); setName('') }}><Plus /></Button></div>
      <div className="max-h-72 overflow-y-auto">
        <DragList ids={value?.categories.map(category => category.id) ?? []} disabled={busy || editing !== null || deleting !== null} onMove={({ id, targetId, placement }) => { void change({ kind: 'move-category', categoryId: id, targetId, placement }) }}>
        {value?.categories.map(category => <DragListItem key={category.id} id={category.id}>{({ dragging, dragProps }) => <div {...dragProps} role="group" tabIndex={editing === category.id ? -1 : 0} aria-label={`员工分类 ${category.name}`} className={`flex min-h-10 items-center gap-2 rounded-md px-2 py-1${dragging ? ' drag-list-dragging' : ''}`}>
          {editing === category.id ? form : <>
            <span className="min-w-0 flex-1 truncate text-sm" title={category.name}>{category.name}</span><span className="text-xs text-muted-foreground">{agentIds.filter(id => value.categoryByAgentId[id] === category.id).length}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`重命名分类 ${category.name}`} disabled={busy} onClick={() => { setEditing(category.id); setName(category.name) }}><Pencil /></Button>
            <Popover open={deleting === category.id} onOpenChange={open => setDeleting(open ? category.id : null)}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`删除分类 ${category.name}`} disabled={busy} />}><Trash2 /></PopoverTrigger><PopoverContent side="right" align="start" className="w-60">
              <PopoverTitle>删除“{category.name}”？</PopoverTitle><PopoverDescription>分类中的员工会回到未分类，员工和聊天记录都会保留。</PopoverDescription>
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => { void change({ kind: 'delete-category', categoryId: category.id }).then(saved => { if (saved) setDeleting(null) }) }}>删除分类</Button></div>
            </PopoverContent></Popover>
          </>}
        </div>}</DragListItem>)}
        </DragList>
        {editing === '' && <div className="px-2 py-1">{form}</div>}
      </div>
      {!value?.categories.length && editing === null && <PopoverDescription className="px-2 pb-2">创建一个分类，再通过员工的右键菜单归类。</PopoverDescription>}
    </PopoverContent>
  </Popover>
}
