/*
 * [INPUT]: 宿主核定员工工作区、相对目录与显式用户打开操作。
 * [OUTPUT]: 有界分页与固定行虚拟目录、真实路径和外部应用打开；隐藏停读、保留已加载页/滚动并丢弃迟到结果。
 * [POS]: 工作区文件标签；原会话附件/成果列表保持独立。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import type { DesktopApi } from '@boai/shared/ipc'
import type { WorkspaceDirectoryPage, WorkspaceApplication } from '@boai/shared/ipc/workspace-files'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

export function WorkspaceFiles({ api, active, employeeId, conversationId, onHome, onTerminal }: {
  api: DesktopApi; active: boolean; employeeId: string; conversationId: string; onHome(): void; onTerminal(): void
}) {
  const scope = { employeeId, conversationId }
  const [path, setPath] = useState(''), [page, setPage] = useState<WorkspaceDirectoryPage>(), [applications, setApplications] = useState<WorkspaceApplication[]>([])
  const [loading, setLoading] = useState(false), [opening, setOpening] = useState(false), [revision, refresh] = useState(0)
  const loadedPath = useRef<string | undefined>(undefined), loadedQuery = useRef<string | undefined>(undefined)
  const scroller = useRef<HTMLDivElement>(null), scrollTop = useRef(0)
  const [focusedRow, setFocusedRow] = useState<number | null>(null)
  const rows = useVirtualizer({
    count: page?.entries.length ?? 0, getScrollElement: () => scroller.current,
    estimateSize: () => 32, overscan: 8, enabled: active,
    initialOffset: () => scrollTop.current,
    getItemKey: index => page?.entries[index]?.relativePath ?? index,
    rangeExtractor: range => {
      const indices = defaultRangeExtractor(range)
      if (focusedRow !== null && focusedRow < range.count && !indices.includes(focusedRow)) return [...indices, focusedRow].sort((a, b) => a - b)
      return indices
    },
  })
  useLayoutEffect(() => { if (active && scroller.current) scroller.current.scrollTop = scrollTop.current }, [active])
  const generation = useRef(0), visible = useRef(active), pendingOpen = useRef(false), pendingRead = useRef(false)
  visible.current = active
  const current = (ticket: number) => visible.current && generation.current === ticket
  useEffect(() => {
    const ticket = ++generation.current
    pendingRead.current = false
    if (!active) return
    const query = JSON.stringify([employeeId, conversationId, path, revision])
    if (loadedQuery.current === query && page) { setLoading(false); return }
    setLoading(true); if (loadedPath.current !== path) setPage(undefined)
    void api.request('listWorkspaceFiles', { scope: { employeeId, conversationId }, relativePath: path }).then(value => {
      if (current(ticket)) { loadedPath.current = path; loadedQuery.current = query; setPage(value) }
    }).catch(error => { if (current(ticket)) toast.error(String(error)) }).finally(() => { if (current(ticket)) setLoading(false) })
    return () => { generation.current++ }
  }, [api, active, employeeId, conversationId, path, revision])
  useEffect(() => {
    if (!active) return
    let disposed = false
    void api.request('listWorkspaceApplications', {}).then(value => { if (!disposed) setApplications(value) }).catch(error => { if (!disposed) toast.error(String(error)) })
    return () => { disposed = true }
  }, [api, active])
  const open = async (relativePath: string, action: 'open' | 'reveal' = 'open', applicationId?: string) => {
    if (!active || pendingOpen.current) return
    pendingOpen.current = true; setOpening(true)
    try { await api.request('openWorkspacePath', { scope, relativePath, action, applicationId }) }
    catch (error) { if (visible.current) toast.error(String(error)) }
    finally { pendingOpen.current = false; setOpening(false) }
  }
  const navigate = (relativePath: string) => { if (relativePath !== path) { scrollTop.current = 0; if (scroller.current) scroller.current.scrollTop = 0; setFocusedRow(null); setPage(undefined); setPath(relativePath) } }
  const more = async () => {
    if (!active || loading || pendingRead.current || !page?.nextCursor) return
    const ticket = generation.current, previous = page
    pendingRead.current = true; setLoading(true)
    try {
      const next = await api.request('listWorkspaceFiles', { scope, relativePath: path, cursor: page.nextCursor })
      if (current(ticket)) setPage({ ...next, entries: [...previous.entries, ...next.entries] })
    } catch (error) { if (current(ticket)) toast.error(String(error)) }
    finally { if (current(ticket)) { pendingRead.current = false; setLoading(false) } }
  }
  return <section className="flex h-full min-h-0 flex-col" aria-label="工作区文件">
    <div className="flex shrink-0 items-center gap-1 border-b p-2">
      <Button variant="ghost" size="icon-sm" aria-label="工作区开始" onClick={onHome}><span className="i-solar-home-2-linear size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="上一级目录" disabled={loading || !page || page.parentPath === undefined} onClick={() => navigate(page!.parentPath!)}><span className="i-solar-arrow-up-linear size-4" /></Button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={page?.path}>{page?.path ?? '员工工作区'}</span>
      <Button variant="ghost" size="icon-sm" aria-label="复制工作区路径" disabled={!page} onClick={() => { if (page) void (api.writeClipboardText ? api.writeClipboardText(page.path) : navigator.clipboard.writeText(page.path)).catch(error => toast.error(String(error))) }}><span className="i-solar-copy-linear size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="刷新工作区文件" disabled={loading} onClick={() => refresh(value => value + 1)}><span className="i-solar-refresh-linear size-4" /></Button>
      <Button variant="secondary" size="sm" disabled={!page || opening} onClick={() => void open(path)}>打开</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" size="icon-sm" disabled={!page || opening} aria-label="工作区外部打开方式" />}><span className="i-solar-alt-arrow-down-linear size-3" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          <DropdownMenuItem disabled={!page || opening} onClick={() => void open(path)}>系统默认打开</DropdownMenuItem>
          {applications.filter(application => application.kind !== 'system').map(application => <DropdownMenuItem key={application.id} disabled={opening} onClick={() => void open(path, 'open', application.id)}>{application.name}</DropdownMenuItem>)}
          <DropdownMenuItem onClick={() => { const ticket = generation.current; void api.request('listWorkspaceApplications', { refresh: true }).then(value => { if (current(ticket)) setApplications(value) }).catch(error => { if (current(ticket)) toast.error(String(error)) }) }}>刷新应用列表</DropdownMenuItem>
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" aria-label="新建工作区终端" onClick={onTerminal}><span className="i-carbon-terminal size-4" /></Button>
    </div>
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto p-2" aria-busy={loading} onScroll={event => { if (active) scrollTop.current = event.currentTarget.scrollTop }}>
      <div className="relative w-full" style={{ height: rows.getTotalSize() }}>
      {rows.getVirtualItems().map(row => {
        const entry = page!.entries[row.index]!
        return <div className="absolute left-0 top-0 flex h-8 w-full min-w-0 items-center gap-1 rounded-md hover:bg-muted/50" key={entry.relativePath} style={{ transform: `translateY(${row.start}px)` }} onFocusCapture={() => setFocusedRow(row.index)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedRow(null) }}>
        <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" disabled={opening || entry.kind === 'other' || entry.kind === 'symlink'} title={entry.name} onClick={() => { if (entry.kind === 'directory') navigate(entry.relativePath); else void open(entry.relativePath) }}>
          <span className={entry.kind === 'directory' ? 'i-solar-folder-linear size-4 shrink-0' : 'i-solar-document-linear size-4 shrink-0'} /><span className="truncate">{entry.name}</span>{entry.kind === 'symlink' && <span className="text-xs text-muted-foreground">链接</span>}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`定位 ${entry.name}`} disabled={opening || entry.kind === 'symlink' || entry.kind === 'other'} onClick={() => void open(entry.relativePath, 'reveal')}><span className="i-solar-folder-open-linear size-4" /></Button>
      </div>})}
      </div>
      {loading && <p className="p-3 text-sm text-muted-foreground">正在读取…</p>}
      {!loading && page && !page.entries.length && <p className="p-3 text-sm text-muted-foreground">空目录</p>}
      {!loading && !page && <Button variant="ghost" size="sm" onClick={() => refresh(value => value + 1)}>重新读取</Button>}
      {page?.nextCursor && <Button variant="ghost" size="sm" disabled={loading} onClick={() => void more()}>加载更多</Button>}
    </div>
  </section>
}
