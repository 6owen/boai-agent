/*
 * [OUTPUT]: 普通任务和定时计划统一员工任务入口，标签顺序仅管理展示。
 * [INPUT]: 定时任务、独立列表偏好、提交状态、任务导航/删除及创建回调。
 * [OUTPUT]: 无检索框的折叠分组、任务与标签拖拽排序；加宽选项菜单，右键项目统一图标并提供危险色删除确认入口。
 * [POS]: 定时任务左栏，复用DragList与通讯录管理布局。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header 与所属目录 .folder.md。
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { AutomationsView } from '@boai/shared/domain'
import { scheduleTagIds, sortedSchedules } from '@boai/shared/domain/schedule-list'
import { Banner, Loading } from '@/components/common'
import { DragList, DragListGroupTarget, DragListItem } from '@/components/common/drag-list'
import { ArrowRight, ChevronRight, CircleHelp, Clock, MoreHorizontal, Settings, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScheduleManager } from './schedule-manager'
import { scheduleSummary } from './schedule-presentation'
import type { useScheduleList } from './use-schedule-list'

const stateKey = 'boai.schedules.list-state'
function readCollapsed(): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(stateKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] } catch { return [] } }
type Row = { key: string; task: AutomationsView['definitions'][number]; tagId?: string }
export function ScheduleList({ definitions, preferences, loading, busy, selectedId, onSelect, onHistory, onDelete, create, filters }: {
  definitions: AutomationsView['definitions']; preferences: ReturnType<typeof useScheduleList>; loading: boolean; busy: boolean; selectedId?: string
  onSelect(id: string): void; onHistory(): void; onDelete(target: { id: string; name: string }): void; create: ReactNode; filters?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed), [managerOpen, setManagerOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem(stateKey, JSON.stringify(collapsed)) } catch { /* Optional local presentation preference. */ } }, [collapsed])
  const value = preferences.value, disabled = busy || preferences.busy || !value || loading
  const tags = value?.tags ?? []
  const tasks = sortedSchedules(definitions, value?.order ?? [])
  const groups = [{ id: '', name: tags.length ? '无标签' : '全部任务' }, ...tags]
  const rows: Row[] = groups.flatMap(group => tasks.filter(task => group.id ? scheduleTagIds(value, task.id).includes(group.id) : !scheduleTagIds(value, task.id).length).map(task => ({ key: JSON.stringify([group.id, task.id]), task, tagId: group.id || undefined })))
  const rowByKey = new Map(rows.map(row => [row.key, row]))
  const tagKey = (id: string) => `tag:${id}`
  const tagByKey = new Map(tags.map(tag => [tagKey(tag.id), tag.id]))
  const moveTo = (row: Row, tagId: string) => void preferences.change({ kind: 'move-to-tag', id: row.task.id, fromTagId: row.tagId, tagId: tagId || undefined })
  const section = (group: { id: string; name: string }) => {
    const items = rows.filter(row => (row.tagId ?? '') === group.id)
    const heading = (dragProps = {}) => <CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contacts-section-heading" />} {...dragProps}><span className="truncate">{group.name}</span><ChevronRight /><span className="contacts-count">{items.length}</span></CollapsibleTrigger>
    return <DragListGroupTarget key={group.id} id={group.id}><Collapsible open={!collapsed.includes(group.id)} onOpenChange={open => setCollapsed(current => open ? current.filter(id => id !== group.id) : [...current, group.id])}>
      {group.id ? <DragListItem id={tagKey(group.id)}>{({ dragProps }) => heading(dragProps)}</DragListItem> : heading()}
      <CollapsibleContent><div role="group" aria-label={group.name} className="schedule-items">{items.map(row => <DragListItem key={row.key} id={row.key}>{({ dragProps, dragging }) => <ContextMenu><ContextMenuTrigger render={<Button variant="ghost" size="content" className={`schedule-item${selectedId === row.task.id ? ' selected' : ''}${dragging ? ' drag-list-dragging' : ''}`} />} {...dragProps} aria-label={row.task.name} aria-current={selectedId === row.task.id ? 'page' : undefined} onClick={() => { if (!dragging) onSelect(row.task.id) }}>
        <strong title={row.task.name}>{row.task.name}</strong><small>{row.task.frequency !== 'manual' && !row.task.enabled ? '已暂停 · ' : ''}{scheduleSummary(row.task)}</small>
      </ContextMenuTrigger><ContextMenuContent className="min-w-48"><ContextMenuGroup>{groups.filter(target => target.id !== (row.tagId ?? '')).map(target => <ContextMenuItem key={target.id} disabled={disabled} onClick={() => moveTo(row, target.id)}><ArrowRight />移至 {target.name}</ContextMenuItem>)}<ContextMenuItem disabled={disabled} onClick={() => setManagerOpen(true)}><Settings />管理标签</ContextMenuItem></ContextMenuGroup><ContextMenuSeparator /><ContextMenuItem variant="destructive" disabled={disabled} onClick={() => onDelete({ id: row.task.id, name: row.task.name })}><Trash2 />删除</ContextMenuItem></ContextMenuContent></ContextMenu>}</DragListItem>)}</div></CollapsibleContent>
    </Collapsible></DragListGroupTarget>
  }
  return <>
    <div className="list-heading"><div className="schedule-list-title"><h2>任务</h2><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="任务说明" />}><CircleHelp /></TooltipTrigger><TooltipContent className="max-w-xs">任务按员工排队，过程和结果保留在独立任务上下文。定时计划需要应用运行；暂停计划不停止已受理的执行。</TooltipContent></Tooltip></div><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="任务选项" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-auto min-w-48 whitespace-nowrap"><DropdownMenuItem onClick={onHistory}><Clock />执行记录</DropdownMenuItem><DropdownMenuItem disabled={disabled} onClick={() => setManagerOpen(true)}><Settings />任务管理</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    {create}
    {filters}
    {preferences.error && <Banner>{preferences.error}</Banner>}
    <div className="contacts-sections"><DragList ids={[...tagByKey.keys(), ...rowByKey.keys()]} disabled={disabled || managerOpen}
      canMove={(id, targetId) => tagByKey.has(id) && tagByKey.has(targetId) || rowByKey.has(id) && rowByKey.has(targetId) && rowByKey.get(id)!.tagId === rowByKey.get(targetId)!.tagId}
      onMove={move => { const tagId = tagByKey.get(move.id), targetTagId = tagByKey.get(move.targetId); if (tagId && targetTagId) void preferences.change({ kind: 'move-tag', tagId, targetId: targetTagId, placement: move.placement }); else { const from = rowByKey.get(move.id), to = rowByKey.get(move.targetId); if (from && to) void preferences.change({ kind: 'move-task', id: from.task.id, targetId: to.task.id, placement: move.placement }) } }}
      canGroupDrop={(id, groupId) => rowByKey.has(id) && groups.some(group => group.id === groupId) && (rowByKey.get(id)!.tagId ?? '') !== groupId}
      onGroupDrop={(id, groupId) => { const row = rowByKey.get(id); if (row) moveTo(row, groupId) }}>{groups.map(section)}</DragList>
      {loading && <Loading />}
    </div>
    {managerOpen && <ScheduleManager definitions={definitions} preferences={preferences} onClose={() => setManagerOpen(false)} />}
  </>
}
