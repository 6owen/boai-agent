/*
 * [INPUT]: 计划列表、独立标签偏好及关闭回调。
 * [OUTPUT]: 通讯录同款双栏管理：标签筛选/搜索、表格多选及批量设置标签；提交锁和版本保持。
 * [POS]: schedules 管理弹窗，仅编辑展示标签。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { useState } from 'react'
import type { AutomationsView } from '@boai/shared/domain'
import { scheduleTagIds, sortedSchedules } from '@boai/shared/domain/schedule-list'
import { Banner } from '@/components/common'
import { ChevronRight, Clock, Pencil, Plus, Search, Trash2, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScheduleTagAssignment, ScheduleTagCreateRow, ScheduleTagDialog, type ScheduleTagTarget } from './schedule-tags'
import { scheduleSummary } from './schedule-presentation'
import type { useScheduleList } from './use-schedule-list'

type Filter = { kind: 'all' } | { kind: 'untagged' } | { kind: 'tag'; id: string }
export function ScheduleManager({ definitions, preferences, onClose }: {
  definitions: AutomationsView['definitions']; preferences: ReturnType<typeof useScheduleList>; onClose(): void
}) {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' }), [query, setQuery] = useState(''), [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tagTarget, setTagTarget] = useState<ScheduleTagTarget | null>(null), [creatingTag, setCreatingTag] = useState<number | null>(null)
  const value = preferences.value, disabled = preferences.busy || !value
  const tags = value?.tags ?? [], search = query.trim().toLocaleLowerCase()
  const activeFilter = filter.kind === 'tag' && !tags.some(tag => tag.id === filter.id) ? { kind: 'all' } as const : filter
  const tasks = sortedSchedules(definitions, value?.order ?? [])
  const visible = tasks.filter(task => {
    const ids = scheduleTagIds(value, task.id)
    return (activeFilter.kind === 'all' || activeFilter.kind === 'untagged' && !ids.length || activeFilter.kind === 'tag' && ids.includes(activeFilter.id)) && `${task.name} ${tags.filter(tag => ids.includes(tag.id)).map(tag => tag.name).join(' ')}`.toLocaleLowerCase().includes(search)
  })
  const selected = selectedIds.filter(id => visible.some(task => task.id === id))
  if (selected.length !== selectedIds.length) setSelectedIds(selected)
  if (activeFilter !== filter) { setFilter(activeFilter); setSelectedIds([]) }
  const chooseFilter = (next: Filter) => { setFilter(next); setSelectedIds([]) }
  const toggle = (id: string) => setSelectedIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  const startTag = (kind: ScheduleTagTarget['kind'], id: string, name: string) => { if (value) setTagTarget({ kind, id, name, revision: value.revision }) }
  const close = () => { if (!disabled && !tagTarget) onClose() }
  const nav = (label: string, count: number, next: Filter, selected: boolean) => <Button variant="ghost" size="content" className="contact-manager-menu" aria-pressed={selected} disabled={disabled} onClick={() => chooseFilter(next)}><span className="truncate">{label}</span><span className="contacts-count">{count}</span></Button>
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="contact-manager schedule-manager" aria-label="定时任务管理" style={{ display: 'flex', gap: 0, width: 'var(--contact-manager-width)', maxWidth: 'none', height: 'var(--contact-manager-height)', padding: 0, overflow: 'hidden' }} showCloseButton={false}>
      <DialogDescription className="sr-only">筛选、搜索和批量设置定时任务标签。</DialogDescription>
      <aside className="contact-manager-sidebar" aria-label="定时任务管理筛选">
        <div className="contact-manager-sidebar-heading"><Clock /><span>定时任务</span></div>
        {nav('全部', tasks.length, { kind: 'all' }, activeFilter.kind === 'all')}
        <p className="contact-manager-filter-label">筛选</p>
        <Collapsible defaultOpen>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contact-manager-filter-heading" />}><i aria-hidden className="app-icon i-carbon-tag" /><span>标签</span><ChevronRight /></CollapsibleTrigger>
          <CollapsibleContent><div className="contact-manager-submenu">
            {nav('无标签', tasks.filter(task => !scheduleTagIds(value, task.id).length).length, { kind: 'untagged' }, activeFilter.kind === 'untagged')}
            {tags.map(tag => <ContextMenu key={tag.id}><ContextMenuTrigger render={<Button variant="ghost" size="content" className="contact-manager-menu" aria-pressed={activeFilter.kind === 'tag' && activeFilter.id === tag.id} aria-label={`筛选标签 ${tag.name}`} disabled={disabled} onClick={() => chooseFilter({ kind: 'tag', id: tag.id })} />}><span className="truncate">{tag.name}</span><span className="contacts-count">{tasks.filter(task => scheduleTagIds(value, task.id).includes(tag.id)).length}</span></ContextMenuTrigger>
              <ContextMenuContent><ContextMenuGroup><ContextMenuItem disabled={disabled} onClick={() => startTag('rename', tag.id, tag.name)}><Pencil />重命名标签</ContextMenuItem><ContextMenuItem variant="destructive" disabled={disabled} onClick={() => startTag('delete', tag.id, tag.name)}><Trash2 />删除标签</ContextMenuItem></ContextMenuGroup></ContextMenuContent>
            </ContextMenu>)}
            {creatingTag !== null ? <ScheduleTagCreateRow key={creatingTag} revision={creatingTag} busy={disabled} error={preferences.error} change={preferences.change} onClose={() => setCreatingTag(null)} /> : <Button variant="secondary" size="sm" className="contact-manager-create-tag" disabled={disabled} onClick={() => { if (value) setCreatingTag(value.revision) }}><Plus /><span>新建标签</span></Button>}
          </div></CollapsibleContent>
        </Collapsible>
      </aside>
      <section className="contact-manager-main">
        <header className="contact-manager-header"><DialogTitle>{activeFilter.kind === 'all' ? '定时任务管理' : activeFilter.kind === 'untagged' ? '无标签' : tags.find(tag => tag.id === activeFilter.id)?.name}</DialogTitle><InputGroup style={{ width: 'var(--contact-manager-search-width)', flex: 'var(--contact-manager-search-flex)' }}><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label="搜索管理定时任务" placeholder="搜索名称或标签" value={query} onChange={event => { setQuery(event.target.value); setSelectedIds([]) }} /></InputGroup><Button variant="ghost" size="icon-sm" aria-label="关闭定时任务管理" disabled={disabled} onClick={close}><X /></Button></header>
        {preferences.error && <Banner>{preferences.error}</Banner>}
        <div className="contact-manager-table-scroll">
          <Table className="contact-manager-table"><TableHeader><TableRow><TableHead className="contact-manager-check"><Checkbox aria-label="全选当前结果" checked={Boolean(visible.length) && visible.every(task => selected.includes(task.id))} indeterminate={visible.some(task => selected.includes(task.id)) && !visible.every(task => selected.includes(task.id))} disabled={disabled || !visible.length} onCheckedChange={checked => setSelectedIds(checked ? visible.map(task => task.id) : [])} /></TableHead><TableHead>定时任务</TableHead><TableHead>执行时间</TableHead><TableHead>标签</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
            <TableBody>{visible.map(task => <TableRow key={task.id} data-state={selected.includes(task.id) ? 'selected' : undefined} tabIndex={disabled ? -1 : 0} aria-selected={selected.includes(task.id)} onClick={() => { if (!disabled) toggle(task.id) }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); if (!disabled) toggle(task.id) } }}>
              <TableCell className="contact-manager-check"><Checkbox aria-label={`选择 ${task.name}`} checked={selected.includes(task.id)} disabled={disabled} onClick={event => event.stopPropagation()} onCheckedChange={() => toggle(task.id)} /></TableCell>
              <TableCell><div className="contact-manager-identity"><Clock /><span title={task.name}>{task.name}</span></div></TableCell><TableCell>{scheduleSummary(task)}</TableCell>
              <TableCell><div className="contact-manager-tags">{tags.filter(tag => scheduleTagIds(value, task.id).includes(tag.id)).map(tag => <span key={tag.id}>{tag.name}</span>)}</div></TableCell><TableCell>{task.enabled ? '已启用' : '已暂停'}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!visible.length && <div className="contact-manager-empty"><p>{search ? '没有匹配的定时任务' : '暂无定时任务'}</p></div>}
        </div>
        {selected.length > 0 && value && <footer className="contact-manager-selection" aria-label="批量操作"><div><span>已选择 <span className="text-primary">{selected.length}</span> 项</span><Button variant="ghost" size="sm" className="text-primary" disabled={disabled} onClick={() => setSelectedIds([])}>取消选择</Button></div><ScheduleTagAssignment key={selected.join(':')} value={value} automationIds={selected} busy={disabled} browsingDisabled={false} change={preferences.change} /></footer>}
      </section>
    </DialogContent>
    <ScheduleTagDialog target={tagTarget} busy={disabled} error={preferences.error} change={preferences.change} onClose={() => setTagTarget(null)} />
  </Dialog>
}
