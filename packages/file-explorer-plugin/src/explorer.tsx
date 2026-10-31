/*
 * [OUTPUT]: 2026-10-29 文件浏览器目录边界及真实回归覆盖；验证结果归第19组18。
 * [INPUT]: Host-scoped list/preview/open callbacks, visibility and BOAI preview renderer.
 * [OUTPUT]: Left content preview and right virtual file tree inside the shared detail panel.
 * [POS]: Official application plugin UI; adapted dsh-file-browser tree, no global DOM or filesystem writes.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@boai/ui/button'
import type { WorkspaceDirectoryPage, WorkspaceFilePreview } from '@boai/shared/ipc/workspace-files'
import { splitNameTail, treeRows, type TreeRow } from './tree'
import './explorer.css'

export interface FileExplorerProps {
  active: boolean
  label: string
  revision?: number
  list(path: string, cursor?: string): Promise<WorkspaceDirectoryPage>
  preview(path: string): Promise<WorkspaceFilePreview>
  onError(error: unknown): void
  renderPreview(path: string, content: WorkspaceFilePreview): ReactNode
  toolbar?(path: string, rootPath?: string): ReactNode
}
export function FileExplorer(props: FileExplorerProps) {
  const latest = useRef(props); latest.current = props
  const [cache, setCache] = useState(new Map<string, WorkspaceDirectoryPage>())
  const [expanded, setExpanded] = useState(new Set<string>())
  const [loading, setLoading] = useState(new Set<string>())
  const [selected, setSelected] = useState<string>()
  const [content, setContent] = useState<{ path: string; value: WorkspaceFilePreview }>()
  const [reading, setReading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [focused, setFocused] = useState(0)
  const generation = useRef(0), readId = useRef(0), pending = useRef(new Set<string>()), failed = useRef(new Set<string>())
  const scroller = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => treeRows(cache, expanded, showHidden), [cache, expanded, showHidden])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 32, overscan: 8, enabled: props.active,
    rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), Math.min(focused, Math.max(0, rows.length - 1))])].sort((a,b) => a-b),
  })
  const current = (ticket: number) => latest.current.active && generation.current === ticket
  const load = async (path: string, cursor?: string) => {
    if (!latest.current.active || pending.current.has(path)) return
    const ticket = generation.current
    pending.current.add(path); setLoading(value => new Set(value).add(path))
    try {
      const page = await latest.current.list(path, cursor)
      if (!current(ticket)) return
      setCache(previous => new Map(previous).set(path, { ...page, entries: cursor ? [...(previous.get(path)?.entries ?? []), ...page.entries] : page.entries }))
    } catch (error) { if (current(ticket)) { failed.current.add(path); latest.current.onError(error) } }
    finally { if (current(ticket)) { pending.current.delete(path); setLoading(value => { const next = new Set(value); next.delete(path); return next }) } }
  }
  useEffect(() => {
    generation.current++; pending.current.clear(); failed.current.clear(); setLoading(new Set()); setCache(new Map()); setContent(undefined); setReading(false)
    if (props.active) { void load(''); if (selected) void openFile(selected) }
    return () => { generation.current++; readId.current++ }
  }, [props.active, props.revision, refresh])
  // Revalidate expanded directories after a refresh or returning to this tab.
  useEffect(() => {
    if (!props.active) return
    for (const row of rows) if (row.entry.kind === 'directory' && expanded.has(row.entry.relativePath) && !cache.has(row.entry.relativePath) && !pending.current.has(row.entry.relativePath) && !failed.current.has(row.entry.relativePath)) void load(row.entry.relativePath)
  }, [cache, expanded, props.active])
  const openFile = async (path: string) => {
    const ticket = generation.current, request = ++readId.current
    setSelected(path); setContent(undefined); setReading(true)
    try {
      const value = await latest.current.preview(path)
      if (current(ticket) && request === readId.current) setContent({ path, value })
    } catch (error) { if (current(ticket) && request === readId.current) latest.current.onError(error) }
    finally { if (current(ticket) && request === readId.current) setReading(false) }
  }
  const toggle = (path: string) => setExpanded(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const activate = (row: TreeRow) => {
    if (row.more) { void load(row.parent, cache.get(row.parent)?.nextCursor); return }
    if (row.entry.kind === 'directory') toggle(row.entry.relativePath)
    else if (row.entry.kind === 'file') void openFile(row.entry.relativePath)
  }
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index)); setFocused(next); virtual.scrollToIndex(next)
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-tree-index="${next}"]`)?.focus())
  }
  const keyDown = (event: KeyboardEvent, row: TreeRow, index: number) => {
    if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key)) event.preventDefault()
    if (event.key === 'ArrowDown') focusRow(index + 1)
    else if (event.key === 'ArrowUp') focusRow(index - 1)
    else if (event.key === 'Home') focusRow(0)
    else if (event.key === 'End') focusRow(rows.length - 1)
    else if (event.key === 'ArrowRight' && row.entry.kind === 'directory') expanded.has(row.entry.relativePath) ? focusRow(index + 1) : toggle(row.entry.relativePath)
    else if (event.key === 'ArrowLeft') {
      if (expanded.has(row.entry.relativePath)) toggle(row.entry.relativePath)
      else { const parent = rows.findIndex(value => value.entry.relativePath === row.parent); if (parent >= 0) focusRow(parent) }
    } else if (event.key === 'Enter' || event.key === ' ') activate(row)
  }
  if (!props.active) return null
  return <section className="boai-explorer" aria-label={props.label}>
    <div className="boai-explorer-toolbar">
      <div className="boai-explorer-path" title={cache.get('')?.rootPath}>{cache.get('')?.rootPath ?? props.label}</div>
      <Button variant="ghost" size="icon-sm" aria-label="刷新文件树" onClick={() => setRefresh(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="显示隐藏文件" aria-pressed={showHidden} onClick={() => setShowHidden(value => !value)}><span className="i-solar-eye-linear size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="折叠所有目录" onClick={() => setExpanded(new Set())}><span className="i-solar-alt-arrow-up-linear size-4" /></Button>
      {props.toolbar?.(selected ?? '', cache.get('')?.rootPath)}
    </div>
    <div className="boai-explorer-panes">
      <div className="boai-explorer-preview" role="region" aria-label="文件内容预览" aria-busy={reading}>
        {content ? props.renderPreview(content.path, content.value) : <div className="boai-explorer-empty">{reading ? '正在读取…' : selected ? <Button variant="ghost" size="sm" onClick={() => void openFile(selected)}>打开预览</Button> : '选择文件预览'}</div>}
      </div>
      <div className="boai-explorer-tree" ref={scroller} role="tree" aria-label="文件树" aria-busy={loading.size > 0}>
        <div className="boai-explorer-rows" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map(item => {
            const row = rows[item.index]; if (!row) return null
            const { entry, depth, more } = row, isDir = entry.kind === 'directory'
            const name = isDir || more ? { head: entry.name, tail: '' } : splitNameTail(entry.name)
            return <div key={entry.relativePath} role="treeitem" aria-label={entry.name} aria-level={depth} aria-expanded={isDir ? expanded.has(entry.relativePath) : undefined} aria-selected={selected === entry.relativePath} aria-disabled={!more && !isDir && entry.kind !== 'file'} tabIndex={focused === item.index ? 0 : -1} data-tree-index={item.index} data-tree-path={entry.relativePath} className="boai-explorer-row" title={entry.relativePath} style={{ transform: `translateY(${item.start}px)`, paddingLeft: 8 + (depth - 1) * 16 }} onFocus={() => setFocused(item.index)} onKeyDown={event => keyDown(event, row, item.index)} onClick={() => { setFocused(item.index); activate(row) }}>
              <span className={isDir ? expanded.has(entry.relativePath) ? 'i-solar-alt-arrow-down-linear boai-explorer-chevron' : 'i-solar-alt-arrow-right-linear boai-explorer-chevron' : 'boai-explorer-chevron'} />
              <span className={isDir ? 'i-solar-folder-linear boai-explorer-icon' : 'i-solar-document-linear boai-explorer-icon'} />
              <span className="boai-explorer-filename"><span className="boai-explorer-name">{name.head}</span>{name.tail && <span className="boai-explorer-tail">{name.tail}</span>}</span>
              {loading.has(entry.relativePath) && <span aria-label="正在读取目录">…</span>}
            </div>
          })}
        </div>
        {!rows.length && !loading.size && <div className="boai-explorer-empty">{cache.has('') ? '空目录' : <Button variant="ghost" size="sm" onClick={() => setRefresh(value => value + 1)}>重新读取</Button>}</div>}
      </div>
    </div>
  </section>
}
