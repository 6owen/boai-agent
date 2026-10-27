/*
 * [INPUT]: 定时任务标签、冻结版本与明确选中任务。
 * [OUTPUT]: 通讯录同款行内新建、重命名/删除、部分勾选及批量即时标签；原生标签提供唯一无障碍名称，逐次接续回执版本。
 * [POS]: 定时任务管理的标签操作；原任务与执行记录保持。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { useState } from 'react'
import { scheduleTagIds, type ScheduleListAction, type ScheduleListPreferences } from '@boai/shared/domain/schedule-list'
import { Banner, useMutation } from '@/components/common'
import { Check, Search, X } from '@/components/icons'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type ScheduleTagTarget = { kind: 'rename' | 'delete'; id: string; name: string; revision: number }
type Change = (action: ScheduleListAction, revision?: number) => Promise<boolean>

export function ScheduleTagCreateRow({ revision, busy, error, change, onClose }: {
  revision: number; busy: boolean; error: string; change: Change; onClose(): void
}) {
  const [name, setName] = useState(''), [frozenRevision] = useState(revision)
  const mutation = useMutation(), locked = busy || mutation.busy
  return <>
    <form className="contact-tag-create-row" aria-label="新建标签" onSubmit={event => {
      event.preventDefault()
      if (locked || !name.trim()) return
      void mutation.run(async () => { if (await change({ kind: 'create-tag', name }, frozenRevision)) onClose() })
    }}>
      <Input autoFocus aria-label="标签名称" placeholder="标签名称" maxLength={40} disabled={locked} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!locked) onClose() }
      }} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="保存新标签" data-unavailable={!name.trim() || undefined} disabled={locked || !name.trim()}><Check /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="取消新建标签" disabled={locked} onClick={onClose}><X /></Button>
    </form>
    {(mutation.error || error) && <Banner>{mutation.error || error}</Banner>}
  </>
}

export function ScheduleTagDialog({ target, busy, error, change, onClose }: {
  target: ScheduleTagTarget | null; busy: boolean; error: string; change: Change; onClose(): void
}) {
  const [draft, setDraft] = useState({ target, name: target?.name ?? '' })
  if (draft.target !== target) setDraft({ target, name: target?.name ?? '' })
  const close = () => { if (!busy) onClose() }
  if (target?.kind === 'delete') return <AlertDialog open onOpenChange={open => { if (!open) close() }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>删除标签？</AlertDialogTitle><AlertDialogDescription>删除“{target.name}”，定时任务及执行记录保留，其他标签不受影响。</AlertDialogDescription></AlertDialogHeader>
      {error && <Banner>{error}</Banner>}
      <AlertDialogFooter><Button variant="secondary" disabled={busy} onClick={close}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { void change({ kind: 'delete-tag', tagId: target.id }, target.revision).then(saved => { if (saved) onClose() }) }}>删除标签</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader><DialogTitle>重命名标签</DialogTitle><DialogDescription className="sr-only">修改标签名称，任务和其他标签保持。</DialogDescription></DialogHeader>
      <form onSubmit={event => {
        event.preventDefault()
        if (!target || busy || !draft.name.trim()) return
        void change({ kind: 'rename-tag', tagId: target.id, name: draft.name }, target.revision).then(saved => { if (saved) onClose() })
      }}>
        <Input autoFocus aria-label="标签名称" placeholder="标签名称" maxLength={40} disabled={busy} value={draft.name} onChange={event => setDraft({ target, name: event.target.value })} />
        {error && <Banner>{error}</Banner>}
        <DialogFooter variant="plain"><Button type="button" variant="ghost" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !draft.name.trim()}>保存标签</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function ScheduleTagAssignment({ value, automationIds, busy, browsingDisabled, change, active = true }: { value: ScheduleListPreferences; automationIds: string[]; busy: boolean; browsingDisabled: boolean; change: Change; active?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [targets, setTargets] = useState(automationIds)
  const [revision, setRevision] = useState(value.revision)
  const mutation = useMutation(), locked = busy || mutation.busy || !active
  const search = query.trim().toLocaleLowerCase()
  const stale = open && value.revision !== revision
  const toggle = (tagId: string, checked: boolean) => {
    if (locked || !targets.length) return
    void mutation.run(async () => {
      if (value.revision !== revision) throw new Error('定时任务标签已变化，请关闭标签面板后重新选择。')
      if (await change({ kind: 'set-tags', automationIds: targets, tagIds: [tagId], mode: checked ? 'add' : 'remove' }, revision)) {
        // Each successful list transaction advances its revision once.
        setRevision(revision + 1)
      }
    })
  }
  return <Popover open={active && open} onOpenChange={next => {
    if (locked) return
    setOpen(next)
    if (next) { mutation.setError(''); setQuery(''); setTargets([...automationIds]); setRevision(value.revision) }
  }}>
    <PopoverTrigger render={<Button variant="secondary" data-tag-saving={mutation.busy || undefined} disabled={locked} />}><i aria-hidden className="app-icon i-carbon-tag" />设置标签</PopoverTrigger>
    <PopoverContent side="top" align="end" className="contact-tag-assignment" data-tag-saving={mutation.busy || undefined} aria-label="设置标签">
      <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索标签" placeholder="搜索标签" value={query} disabled={browsingDisabled || !active} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <div className="contact-tag-options">
        {value.tags.filter(tag => tag.name.toLocaleLowerCase().includes(search)).map(tag => {
          const matching = targets.filter(id => scheduleTagIds(value, id).includes(tag.id)).length
          return <label key={tag.id} className="contact-tag-option"><Checkbox checked={Boolean(targets.length) && matching === targets.length} indeterminate={matching > 0 && matching < targets.length} disabled={locked || stale || !targets.length} onCheckedChange={checked => toggle(tag.id, checked)} /><span>{tag.name}</span></label>
        })}
        {!value.tags.some(tag => tag.name.toLocaleLowerCase().includes(search)) && <p className="contacts-list-empty">{search ? '没有匹配的标签' : '暂无标签，请先新建标签'}</p>}
      </div>
      {!locked && (stale || mutation.error) && <Banner>{stale ? '定时任务标签已变化，请关闭标签面板后重新选择。' : mutation.error}</Banner>}
    </PopoverContent>
  </Popover>
}
