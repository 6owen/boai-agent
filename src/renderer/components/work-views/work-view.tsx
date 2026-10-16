/*
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [INPUT]: 有界Work查询、会话/员工范围、活跃状态与原聊天导航。
 * [OUTPUT]: 同一只读任务清单与五列看板；列独立分页/计数，按范围查询保留选中卡和滚动，重核空窗不覆写位置、隐藏停读；员工摘要包含本人子工作，可信自动化回查原触发。
 * [POS]: 会话任务/全局任务/员工当前工作的共用入口，不读取整段聊天或另一份任务表。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { AutomationOrigin, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import type { WorkViewItem, WorkViewPage, WorkViewQuery, WorkViewTarget } from '@shared/domain/work-views'
import { Banner, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkFilters } from './filters'
import { emptyWorkFilters, workGroups, workQuery, type WorkViewFilters, type WorkViewMode } from './model'
import { WorkCard } from './work-card'
import { usePagedQuery } from './use-paged-query'
import { rememberedWorkSelection, rememberWorkSelection } from './view-state'

export interface WorkViewProps { api: DesktopApi; snapshot: Snapshot; active: boolean; conversationId?: string; ownerAgentId?: string; compact?: boolean; mode?: WorkViewMode; onModeChange?(mode: WorkViewMode): void; filters?: WorkViewFilters; onFiltersChange?(value: WorkViewFilters): void; onNavigate(target: WorkViewTarget, current?: () => boolean): void; onInspect?(item: WorkViewItem): void; onAutomation?(origin: AutomationOrigin, current?: () => boolean, conversationId?: string): void }
const remembered = new Map<string, { filters: WorkViewFilters; mode: WorkViewMode }>()
const positions = new Map<string, number>()
export function WorkView({ api, snapshot, active, conversationId, ownerAgentId, compact, mode: controlledMode, onModeChange, filters: controlledFilters, onFiltersChange, onNavigate, onInspect, onAutomation }: WorkViewProps) {
  const scopeKey = conversationId ? `conversation:${conversationId}` : ownerAgentId ? `employee:${ownerAgentId}` : 'global'
  const initial = () => ({ key: scopeKey, ...(remembered.get(scopeKey) ?? { filters: { ...emptyWorkFilters }, mode: conversationId || compact ? 'list' as const : 'board' as const }) })
  const [local, setLocal] = useState(initial)
  const state = local.key === scopeKey ? local : initial(), filters = controlledFilters ?? state.filters, mode = compact ? 'list' : controlledMode ?? state.mode
  const update = (patch: Partial<Omit<typeof local, 'key'>>) => { const value = { ...state, ...patch }; remembered.set(scopeKey, { filters: value.filters, mode: value.mode }); setLocal(value) }
  let query: WorkViewQuery | undefined, invalid = ''
  try { query = workQuery(compact ? emptyWorkFilters : filters, { conversationId, ownerAgentId }, compact) } catch (cause) { invalid = (cause as Error).message }
  if (!compact && filters.conversationId && !snapshot.conversations.some(item => item.id === filters.conversationId && !item.list?.hidden)) invalid = '所选会话已从列表移除，请重新选择或清除筛选。'
  const props = { api, snapshot, active: active && !invalid, onNavigate, onInspect, onAutomation, compact, viewScope: `${scopeKey}:${mode}` }
  const board = useRef<HTMLDivElement>(null), boardKey = 'board:' + JSON.stringify([scopeKey, query])
  useLayoutEffect(() => { if (active && mode === 'board' && board.current) board.current.scrollLeft = positions.get(boardKey) ?? 0 }, [active, mode, boardKey])
  return <section className={compact ? 'flex min-w-0 flex-col gap-3' : 'flex h-full min-h-0 min-w-0 flex-col gap-3 p-4'} aria-label={compact ? '当前负责工作' : '任务工作视图'}>
    {!compact && <div className="flex flex-wrap items-start justify-between gap-3"><WorkFilters snapshot={snapshot} value={filters} conversationId={conversationId} ownerAgentId={ownerAgentId} onChange={value => { update({ filters: value }); onFiltersChange?.(value) }} />
      <Tabs value={mode} onValueChange={value => { const next = value as WorkViewMode; update({ mode: next }); onModeChange?.(next) }}><TabsList aria-label="任务展示方式"><TabsTrigger value="board">看板</TabsTrigger><TabsTrigger value="list">列表</TabsTrigger></TabsList></Tabs>
    </div>}
    {invalid && <Banner>{invalid}</Banner>}
    {query && !invalid && (mode === 'board' ? <div ref={board} className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" aria-label="任务看板" onScroll={event => { if (active && event.target === event.currentTarget) positions.set(boardKey, event.currentTarget.scrollLeft) }}>{workGroups.map(group => <section className="flex min-h-0 min-w-64 flex-1 flex-col gap-2" key={group.id} aria-label={group.label}><WorkResults {...props} query={{ ...query, group: group.id }} heading={group.label} /></section>)}</div> : <WorkResults {...props} query={query} />)}
  </section>
}
function WorkResults({ query, heading, viewScope, ...props }: Pick<WorkViewProps, 'api' | 'snapshot' | 'active' | 'onNavigate' | 'onInspect' | 'onAutomation' | 'compact'> & { query: WorkViewQuery; heading?: string; viewScope: string }) {
  const key = JSON.stringify(['work', viewScope, query]), scroller = useRef<HTMLDivElement>(null), [selection, setSelection] = useState(() => ({ key, id: rememberedWorkSelection(key) }))
  const { page, loading, error, loadMore, reload } = usePagedQuery<WorkViewItem, string, WorkViewPage>({ api: props.api, active: props.active, queryKey: key, conversationId: query.conversationId, read: cursor => props.api.request('queryWorkViews', { ...query, cursor }), identity: item => item.work.id })
  useLayoutEffect(() => { if (props.active && page && scroller.current) scroller.current.scrollTop = positions.get(key) ?? 0 }, [props.active, page, key])
  return <>
    {heading ? <h3 className="m-0 flex items-center justify-between px-1 text-sm font-medium">{heading}<span className="text-muted-foreground">{page?.total ?? '—'}</span></h3> : page && <p className="m-0 text-xs text-muted-foreground">已加载 {page.items.length} / {page.total} 项{!query.ownerAgentId && !props.compact ? `根工作 · ${page.childTotal} 项子工作另计` : '负责工作'}</p>}
    <ScrollFade ref={scroller} className={props.compact ? 'flex max-h-96 flex-col gap-3' : 'flex min-h-0 flex-1 flex-col gap-3 pb-1'} onScroll={event => { if (props.active && page && !loading) positions.set(key, event.currentTarget.scrollTop) }} aria-busy={loading}>
      {page?.items.map(item => <WorkCard key={item.work.id} {...props} item={item} viewKey={key} selected={(selection.key === key ? selection.id : rememberedWorkSelection(key)) === item.work.id} onSelect={() => { rememberWorkSelection(key, item.work.id); setSelection({ key, id: item.work.id }) }} />)}
      {loading && <Loading />}
      {error && <><Banner>{error}</Banner><Button size="sm" variant="ghost" onClick={reload}>重新读取</Button></>}
      {page && !page.items.length && !loading && <p className="my-4 px-1 text-sm text-muted-foreground">{props.compact ? '暂无当前负责的工作。' : '暂无符合条件的工作。'}</p>}
      {page?.nextCursor && !props.compact && <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadMore()}>加载更多 · 已显示 {page.items.length} / {page.total}</Button>}
      {props.compact && page?.nextCursor && <p className="m-0 text-xs text-muted-foreground">当前显示前 {page.items.length} 项，共 {page.total} 项；查看全部可继续筛选。</p>}
    </ScrollFade>
  </>
}
