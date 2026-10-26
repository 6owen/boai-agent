/*
 * [OUTPUT]: 分组管理表现层供技能和提示词共用，数据、计数和变更回调各自独立。
 * [INPUT]: 持久技能收藏、分组操作与当前技能计数。
 * [OUTPUT]: 分组标题加号随行悬停/键盘聚焦显示、新建期间保留并继承 label 颜色；紧凑无间隔分组列表、删除浮层确认与会话式全局拖拽排序；分组标题原位编辑、新建同行保存/取消与计数。
 * [POS]: library 的 Skills 列表分组管理，不提供重复的上下移动按钮。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { SkillCollections, SkillCollectionAction } from '@boai/shared/domain/skills'
import { DragList, DragListItem } from '@/components/common/drag-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle, PopoverDescription } from '@/components/ui/popover'
import { FolderOpen, Plus, Pencil, Trash2 } from '@/components/icons'

type GroupAction = Extract<SkillCollectionAction, { kind: 'create-group' | 'rename-group' | 'delete-group' | 'move-group' }>
export function SkillGroups({ value, change, busy }: { value: SkillCollections | null; change: (action: SkillCollectionAction) => Promise<boolean>; busy: boolean }) {
  return <CollectionGroups groups={value?.groups ?? []} counts={Object.fromEntries((value?.groups ?? []).map(group => [group.id, value!.favoriteResourceIds.filter(id => value!.groupByResourceId[id] === group.id).length]))} ready={Boolean(value)} change={change} busy={busy} noun="技能" />
}
export function CollectionGroups({ groups, counts, ready, change, busy, noun }: {
  groups: { id: string; name: string }[]; counts: Record<string, number>; ready: boolean
  change(action: GroupAction): Promise<boolean>; busy: boolean; noun: '技能' | '提示词'
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const cancel = () => { setEditing(null); setName('') }
  const form = <form className="skill-group-editor" onSubmit={event => { event.preventDefault(); if (busy || !name.trim()) return; void change(editing ? { kind: 'rename-group', groupId: editing, name } : { kind: 'create-group', name }).then(saved => { if (saved) cancel() }) }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (busy) event.preventDefault(); else cancel() } }}>
    <Input aria-label="分组名称" autoFocus maxLength={40} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="分组名称" /><Button type="submit" size="sm" aria-label="保存分组" disabled={busy || !name.trim()}>保存</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>取消</Button>
  </form>
  return <Popover open={open} onOpenChange={next => { if (busy) return; setOpen(next); if (!next) { cancel(); setDeleting(null) } }}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${noun}分组`} title={`${noun}分组`} />}><FolderOpen /></PopoverTrigger><PopoverContent align="start" className="skill-groups-popover w-80 gap-0 p-2">
    <div className="skill-groups-title" data-editing={editing === '' || undefined}><PopoverTitle>{noun}分组</PopoverTitle><Button variant="ghost" size="icon-sm" className="skill-groups-add" aria-label="新建分组" disabled={busy || !ready} onClick={() => { setEditing(''); setName('') }}><Plus /></Button></div>
    <DragList ids={groups.map(group => group.id)} disabled={busy || editing !== null || deleting !== null} onMove={({ id, targetId, placement }) => { void change({ kind: 'move-group', groupId: id, targetId, placement }) }}>
      {groups.map(group => <DragListItem key={group.id} id={group.id}>{({ dragging, dragProps }) => <div className={`skill-group-item${dragging ? ' drag-list-dragging' : ''}`} {...dragProps} role="group" tabIndex={editing === group.id ? -1 : 0} aria-label={`分组 ${group.name}`}>
        {editing === group.id ? form : <><span className="skill-group-name">{group.name}</span><small>{counts[group.id] ?? 0}</small>
          <div className="skill-group-controls" data-confirming={deleting === group.id || undefined}><Button variant="ghost" size="icon-sm" aria-label={`重命名 ${group.name}`} disabled={busy} onClick={() => { setEditing(group.id); setName(group.name) }}><Pencil /></Button><Popover open={deleting === group.id} onOpenChange={open => { if (!busy) setDeleting(open ? group.id : null) }}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`删除分组 ${group.name}`} disabled={busy} />}><Trash2 /></PopoverTrigger><PopoverContent side="right" align="start" className="w-[240px]">
            <PopoverTitle>删除“{group.name}”？</PopoverTitle><PopoverDescription>{noun === '技能' ? '组内技能将移到未分组，收藏和技能文件会保留。' : '组内提示词将移到未分组，提示词内容会保留。'}</PopoverDescription><div className="button-row justify-end"><Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => { void change({ kind: 'delete-group', groupId: group.id }).then(saved => { if (saved) setDeleting(null) }) }}>确认删除</Button></div>
          </PopoverContent></Popover></div></>}
      </div>}</DragListItem>)}
    </DragList>
    {!groups.length && editing === null && <p className="field-hint">点击加号创建分组，再把{noun}拖入分组。</p>}
    {editing === '' && <div className="skill-group-item">{form}</div>}
  </PopoverContent></Popover>
}
