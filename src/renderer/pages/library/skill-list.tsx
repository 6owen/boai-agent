/*
 * [INPUT]: 已筛选技能、收藏顺序/分组、选择与全局 DragList 保存回调。
 * [OUTPUT]: 收藏直接沿会话Collapsible内自然布局列表，展开不重测虚拟高度或自动滚动；保留关闭组落点及跨组键盘排序。
 * [OUTPUT]: 仅本地完整目录使用TanStack Virtual，固定拖拽/聚焦/菜单行；收藏和本地共用技能行。
 * [POS]: library 的本地/收藏列表；复用会话行皮肤与全局拖拽协议。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import type { LocalSkill, SkillCollectionAction, SkillCollections } from '@shared/domain/skills'
import { DragList, DragListItem, DragListGroupTarget } from '@/components/common/drag-list'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronRight, MoreHorizontal, Zap } from '@/components/icons'

export type SkillEntry = { id: string; name: string; description: string; source: string; searchText: string; local: LocalSkill }
type Props = {
  entries: SkillEntry[]; selected?: string; own: boolean; searching: boolean; collapsed: string[]
  collection: SkillCollections | null; favorites: ReadonlySet<string>; busy: boolean
  onSelect(id: string): void; onToggle(entry: SkillEntry): void; onReveal(id: string): void
  onCollapse(id: string): void; onChange(action: SkillCollectionAction): void
}

export const SkillList = memo(function SkillList(props: Props) {
  const { entries, selected, own, searching, collapsed, collection, busy, onSelect, onCollapse, onChange } = props
  const scroll = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<string | null>(null), [focused, setFocused] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null)
  const groups = useMemo(() => {
    const grouped = new Map<string, SkillEntry[]>()
    for (const entry of entries) { const id = collection?.groupByResourceId[entry.id] ?? ''; const items = grouped.get(id) ?? []; items.push(entry); grouped.set(id, items) }
    return [...(collection?.groups ?? []), { id: '', name: '未分组' }].map(group => ({ ...group, entries: grouped.get(group.id) ?? [], open: searching || !collapsed.includes(group.id) }))
  }, [entries, collection, collapsed, searching])
  const ids = useMemo(() => own ? groups.flatMap(group => group.open ? group.entries.map(entry => entry.id) : []) : entries.map(entry => entry.id), [entries, groups, own])
  const rowKey = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-skill-row]')?.dataset.skillRow ?? null : null
  return <div ref={scroll} className="conversation-list skills-list-scroll skills-browser-list" role="navigation" aria-label="技能列表"
    onDragStartCapture={event => setDragged(rowKey(event.target))} onDragEndCapture={() => setDragged(null)} onDropCapture={() => setDragged(null)}
    onFocusCapture={event => setFocused(rowKey(event.target))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null) }}
    onKeyDown={event => {
      if (event.defaultPrevented || event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || (event.target as Element).closest('[role=menu]')) return
      const current = ids.indexOf(selected ?? ''), next = ids[Math.max(0, Math.min(ids.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]
      if (next) {
        event.preventDefault(); onSelect(next)
        if (own) scroll.current?.querySelector<HTMLElement>(`[data-skill-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    }}>
    <DragList ids={ids} disabled={!own || busy || !collection} onMove={({ id, targetId, placement }) => onChange({ kind: 'move-skill', resourceId: id, targetId, placement })} onGroupDrop={(resourceId, groupId) => onChange({ kind: 'assign-group', resourceId, groupId: groupId || undefined })}>
      <div className="skill-list-content">
        {own ? groups.map(group => <Collapsible key={group.id} className="skills-list-group" data-skill-row={`group:${group.id}`} open={group.open} onOpenChange={() => { if (!searching) onCollapse(group.id) }}>
          <DragListGroupTarget id={group.id}><CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading" />}>{group.name}<small>{group.entries.length}</small><ChevronRight /></CollapsibleTrigger></DragListGroupTarget>
          <CollapsibleContent><div role="group" aria-label={group.name}>{group.entries.map(entry => <div key={entry.id} data-skill-row={entry.id}><SkillRow {...props} entry={entry} onMenu={setMenu} /></div>)}</div></CollapsibleContent>
        </Collapsible>) : <VirtualSkillRows {...props} scroll={scroll} pinned={[dragged, focused, menu]} onMenu={setMenu} />}
      </div>
    </DragList>
  </div>
})

function VirtualSkillRows(props: Props & { scroll: RefObject<HTMLDivElement | null>; pinned: (string | null)[]; onMenu(id: string | null): void }) {
  const { entries, selected, scroll, pinned } = props
  const indices = useMemo(() => new Map(entries.map((entry, index) => [entry.id, index])), [entries])
  const rangeExtractor = useCallback((range: Range) => {
    const items = new Set(defaultRangeExtractor(range))
    for (const key of pinned) { const index = key ? indices.get(key) : undefined; if (index !== undefined) items.add(index) }
    return [...items].sort((a, b) => a - b)
  }, [pinned, indices])
  const virtual = useVirtualizer({ count: entries.length, getScrollElement: () => scroll.current, estimateSize: () => 58, getItemKey: index => entries[index]!.id, rangeExtractor, overscan: 6 })
  useEffect(() => { const index = selected ? indices.get(selected) : undefined; if (index !== undefined) virtual.scrollToIndex(index, { align: 'auto' }) }, [selected, indices, virtual])
  return <div className="skill-virtual-space" style={{ height: virtual.getTotalSize() }}>
    {virtual.getVirtualItems().map(item => {
      const entry = entries[item.index]!
      return <div key={item.key} data-index={item.index} data-skill-row={entry.id} ref={virtual.measureElement} className="skill-virtual-row" style={{ transform: `translateY(${item.start}px)` }}><SkillRow {...props} entry={entry} /></div>
    })}
  </div>
}

function SkillRow({ entry, selected, collection, favorites, busy, onSelect, onToggle, onReveal, onMenu }: Props & { entry: SkillEntry; onMenu(id: string | null): void }) {
  return <DragListItem id={entry.id} className={`skill-list-row${entry.id === selected ? ' selected' : ''}`}>{({ dragging, dragProps }) => <>
          <Button variant="ghost" size="content" className={`conversation-item skill-list-select${entry.id === selected ? ' selected' : ''}${dragging ? ' drag-list-dragging' : ''}`} {...dragProps} aria-pressed={entry.id === selected} onClick={() => { if (!dragging) onSelect(entry.id) }}><span className="skill-list-icon"><Zap /></span><span className="conversation-copy"><strong className="conversation-title">{entry.name}</strong><small className="conversation-preview">{entry.source && <span className="skill-source-badge">{entry.source}</span>}{entry.description || '查看技能说明'}</small></span></Button>
          <DropdownMenu onOpenChange={open => onMenu(open ? entry.id : null)}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="skill-row-menu" aria-label={`${entry.name} 的操作`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent side="right" align="start" className="w-[240px] p-2"><DropdownMenuItem className="px-2.5 py-2" disabled={busy || !collection} onClick={() => onToggle(entry)}>{favorites.has(entry.id) ? '取消收藏' : '加入收藏'}</DropdownMenuItem><DropdownMenuItem className="whitespace-nowrap px-2.5 py-2" onClick={() => onReveal(entry.id)}>在文件夹中显示</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </>}</DragListItem>
}
