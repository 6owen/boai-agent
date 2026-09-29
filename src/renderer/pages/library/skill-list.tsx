/*
 * [INPUT]: 已筛选技能、收藏顺序/分组、选择与全局 DragList 保存回调。
 * [OUTPUT]: TanStack Virtual 有界行渲染、分组展开、键盘定位；保留拖拽源、聚焦和菜单行以免滚出视口时中断交互。
 * [POS]: library 的本地/收藏虚拟列表；复用会话行皮肤与全局拖拽协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import type { LocalSkill, SkillCollectionAction, SkillCollections } from '@shared/domain/skills'
import { DragList, DragListItem, DragListGroupTarget } from '@/components/common/drag-list'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronRight, MoreHorizontal, Zap } from '@/components/icons'

export type SkillEntry = { id: string; name: string; description: string; source: string; searchText: string; local: LocalSkill }
type Row = { kind: 'skill'; key: string; entry: SkillEntry } | { kind: 'group'; key: string; id: string; name: string; count: number; open: boolean }
type Props = {
  entries: SkillEntry[]; selected?: string; own: boolean; searching: boolean; collapsed: string[]
  collection: SkillCollections | null; favorites: ReadonlySet<string>; busy: boolean
  onSelect(id: string): void; onToggle(entry: SkillEntry): void; onReveal(id: string): void
  onCollapse(id: string): void; onChange(action: SkillCollectionAction): void
}

export const SkillList = memo(function SkillList({ entries, selected, own, searching, collapsed, collection, favorites, busy, onSelect, onToggle, onReveal, onCollapse, onChange }: Props) {
  const scroll = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<string | null>(null), [focused, setFocused] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null)
  const rows = useMemo<Row[]>(() => {
    if (!own) return entries.map(entry => ({ kind: 'skill', key: entry.id, entry }))
    const grouped = new Map<string, SkillEntry[]>()
    for (const entry of entries) { const id = collection?.groupByResourceId[entry.id] ?? ''; const items = grouped.get(id) ?? []; items.push(entry); grouped.set(id, items) }
    return [...(collection?.groups ?? []), { id: '', name: '未分组' }].flatMap(group => {
      const items = grouped.get(group.id) ?? [], open = searching || !collapsed.includes(group.id)
      return [{ kind: 'group', key: `group:${group.id}`, ...group, count: items.length, open } as Row, ...(open ? items.map(entry => ({ kind: 'skill' as const, key: entry.id, entry })) : [])]
    })
  }, [entries, own, collection, collapsed, searching])
  const indices = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows])
  const ids = useMemo(() => rows.flatMap(row => row.kind === 'skill' ? [row.entry.id] : []), [rows])
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows])
  const estimateSize = useCallback((index: number) => rows[index]?.kind === 'group' ? 36 : 58, [rows])
  const rangeExtractor = useCallback((range: Range) => {
    const items = new Set(defaultRangeExtractor(range))
    for (const key of [dragged, focused, menu]) { const index = key ? indices.get(key) : undefined; if (index !== undefined) items.add(index) }
    return [...items].sort((a, b) => a - b)
  }, [dragged, focused, menu, indices])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize, getItemKey, rangeExtractor, overscan: 6 })
  useEffect(() => { const index = selected ? indices.get(selected) : undefined; if (index !== undefined) virtual.scrollToIndex(index, { align: 'auto' }) }, [selected, indices, virtual])
  const rowKey = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-skill-row]')?.dataset.skillRow ?? null : null
  return <div ref={scroll} className="conversation-list skills-list-scroll skills-browser-list" role="navigation" aria-label="技能列表"
    onDragStartCapture={event => setDragged(rowKey(event.target))} onDragEndCapture={() => setDragged(null)} onDropCapture={() => setDragged(null)}
    onFocusCapture={event => setFocused(rowKey(event.target))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null) }}
    onKeyDown={event => {
      if (event.defaultPrevented || event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || (event.target as Element).closest('[role=menu]')) return
      const current = ids.indexOf(selected ?? ''), next = ids[Math.max(0, Math.min(ids.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]
      if (next) { event.preventDefault(); onSelect(next); virtual.scrollToIndex(indices.get(next)!, { align: 'auto' }) }
    }}>
    <DragList ids={ids} disabled={!own || busy || !collection} onMove={({ id, targetId, placement }) => onChange({ kind: 'move-skill', resourceId: id, targetId, placement })} onGroupDrop={(resourceId, groupId) => onChange({ kind: 'assign-group', resourceId, groupId: groupId || undefined })}>
      <div className="skill-virtual-space" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map(item => {
          const row = rows[item.index]!
          return <div key={item.key} data-index={item.index} data-skill-row={row.key} ref={virtual.measureElement} className="skill-virtual-row" style={{ transform: `translateY(${item.start}px)` }}>
            {row.kind === 'group' ? <div className="skills-list-group"><DragListGroupTarget id={row.id}><Button variant="ghost" size="content" className="conversation-section-heading" aria-expanded={row.open} onClick={() => onCollapse(row.id)}>{row.name}<small>{row.count}</small><ChevronRight /></Button></DragListGroupTarget></div> : <DragListItem id={row.entry.id} className={`skill-list-row${row.entry.id === selected ? ' selected' : ''}`}>{({ dragging, dragProps }) => <>
              <Button variant="ghost" size="content" className={`conversation-item skill-list-select${row.entry.id === selected ? ' selected' : ''}${dragging ? ' drag-list-dragging' : ''}`} {...dragProps} aria-pressed={row.entry.id === selected} onClick={() => { if (!dragging) onSelect(row.entry.id) }}><span className="skill-list-icon"><Zap /></span><span className="conversation-copy"><strong className="conversation-title">{row.entry.name}</strong><small className="conversation-preview">{row.entry.source && <span className="skill-source-badge">{row.entry.source}</span>}{row.entry.description || '查看技能说明'}</small></span></Button>
              <DropdownMenu onOpenChange={open => setMenu(open ? row.key : null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="skill-row-menu" aria-label={`${row.entry.name} 的操作`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent side="right" align="start" className="w-[240px] p-2"><DropdownMenuItem className="px-2.5 py-2" disabled={busy || !collection} onClick={() => onToggle(row.entry)}>{favorites.has(row.entry.id) ? '取消收藏' : '加入收藏'}</DropdownMenuItem><DropdownMenuItem className="whitespace-nowrap px-2.5 py-2" onClick={() => onReveal(row.entry.id)}>在文件夹中显示</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </>}</DragListItem>}
          </div>
        })}
      </div>
    </DragList>
  </div>
})
