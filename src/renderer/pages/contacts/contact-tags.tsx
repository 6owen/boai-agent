/*
 * [INPUT]: 通讯录标签、版本化操作、明确选择的员工身份与批量操作面板在场状态。
 * [OUTPUT]: 冻结版本的行内标签新建、重命名和保留员工的删除确认；搜索标签与全选/部分选中的即时批量增删，局部提交保留触发器/勾选外观和搜索可用状态，写入仍锁定；冻结目标身份并逐次接续自己的提交版本，保留其他标签并拒绝外部版本变化；批量面板退出时关闭浮层并禁用标签写入。
 * [POS]: 通讯录管理弹窗的标签编辑组件，复用 Base UI Dialog/Popover 和 Checkbox。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import { contactTagIds, type ContactListAction, type ContactListPreferences } from '@shared/domain/contact-list'
import { Banner, useMutation } from '@/components/common'
import { Check, Search, X } from '@/components/icons'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type ContactTagTarget = { kind: 'rename' | 'delete'; id: string; name: string; revision: number }
type Change = (action: ContactListAction, revision?: number) => Promise<boolean>

export function ContactTagCreateRow({ revision, busy, error, change, onClose }: {
  revision: number; busy: boolean; error: string; change: Change; onClose(): void
}) {
  const [name, setName] = useState(''), [frozenRevision] = useState(revision)
  const mutation = useMutation(), locked = busy || mutation.busy
  return <>
    <form className="contact-tag-create-row" aria-label="新建标签" onSubmit={event => {
      event.preventDefault()
      if (locked || !name.trim()) return
      void mutation.run(async () => { if (await change({ kind: 'create-category', name }, frozenRevision)) onClose() })
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

export function ContactTagDialog({ target, busy, error, change, onClose }: {
  target: ContactTagTarget | null; busy: boolean; error: string; change: Change; onClose(): void
}) {
  const [draft, setDraft] = useState({ target, name: target?.name ?? '' })
  if (draft.target !== target) setDraft({ target, name: target?.name ?? '' })
  const close = () => { if (!busy) onClose() }
  if (target?.kind === 'delete') return <AlertDialog open onOpenChange={open => { if (!open) close() }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>删除标签？</AlertDialogTitle><AlertDialogDescription>删除“{target.name}”，员工及聊天记录保留，其他标签不受影响。</AlertDialogDescription></AlertDialogHeader>
      {error && <Banner>{error}</Banner>}
      <AlertDialogFooter><Button variant="secondary" disabled={busy} onClick={close}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => { void change({ kind: 'delete-category', categoryId: target.id }, target.revision).then(saved => { if (saved) onClose() }) }}>删除标签</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) close() }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader><DialogTitle>重命名标签</DialogTitle><DialogDescription>标签用于筛选联系人，一个 Agent 可以有多个标签。</DialogDescription></DialogHeader>
      <form onSubmit={event => {
        event.preventDefault()
        if (!target || busy || !draft.name.trim()) return
        void change({ kind: 'rename-category', categoryId: target.id, name: draft.name }, target.revision).then(saved => { if (saved) onClose() })
      }}>
        <Input autoFocus aria-label="标签名称" placeholder="标签名称" maxLength={40} disabled={busy} value={draft.name} onChange={event => setDraft({ target, name: event.target.value })} />
        {error && <Banner>{error}</Banner>}
        <DialogFooter variant="plain"><Button type="button" variant="ghost" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !draft.name.trim()}>保存标签</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function ContactTagAssignment({ value, agentIds, busy, browsingDisabled, change, active = true }: { value: ContactListPreferences; agentIds: string[]; busy: boolean; browsingDisabled: boolean; change: Change; active?: boolean }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [targets, setTargets] = useState(agentIds)
  const [revision, setRevision] = useState(value.revision)
  const mutation = useMutation(), locked = busy || mutation.busy || !active
  const search = query.trim().toLocaleLowerCase()
  const stale = open && value.revision !== revision
  const toggle = (tagId: string, checked: boolean) => {
    if (locked || !targets.length) return
    void mutation.run(async () => {
      if (value.revision !== revision) throw new Error('通讯录已变化，请关闭标签面板后重新选择。')
      if (await change({ kind: 'set-agent-tags', agentIds: targets, tagIds: [tagId], mode: checked ? 'add' : 'remove' }, revision)) {
        // Every successful contact-list transaction advances its revision once.
        setRevision(revision + 1)
      }
    })
  }
  return <Popover open={active && open} onOpenChange={next => {
    if (locked) return
    setOpen(next)
    if (next) { mutation.setError(''); setQuery(''); setTargets([...agentIds]); setRevision(value.revision) }
  }}>
    <PopoverTrigger render={<Button variant="secondary" data-tag-saving={mutation.busy || undefined} disabled={locked} />}><i aria-hidden className="app-icon i-carbon-tag" />设置标签</PopoverTrigger>
    <PopoverContent side="top" align="end" className="contact-tag-assignment" data-tag-saving={mutation.busy || undefined} aria-label="设置标签">
      <InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索标签" placeholder="搜索标签" value={query} disabled={browsingDisabled || !active} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <div className="contact-tag-options">
        {value.categories.filter(tag => tag.name.toLocaleLowerCase().includes(search)).map(tag => {
          const matching = targets.filter(id => contactTagIds(value, id).includes(tag.id)).length
          return <label key={tag.id} className="contact-tag-option"><Checkbox aria-label={`标签 ${tag.name}`} checked={Boolean(targets.length) && matching === targets.length} indeterminate={matching > 0 && matching < targets.length} disabled={locked || stale || !targets.length} onCheckedChange={checked => toggle(tag.id, checked)} /><span>{tag.name}</span></label>
        })}
        {!value.categories.some(tag => tag.name.toLocaleLowerCase().includes(search)) && <p className="contacts-list-empty">{search ? '没有匹配的标签' : '暂无标签，请先新建标签'}</p>}
      </div>
      {!locked && (stale || mutation.error) && <Banner>{stale ? '通讯录已变化，请关闭标签面板后重新选择。' : mutation.error}</Banner>}
    </PopoverContent>
  </Popover>
}
