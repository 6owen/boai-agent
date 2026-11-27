/*
 * [OUTPUT]: 当前任务执行记录的清空入口用与搜索同尺寸的垃圾桶图标，保留悬停提示和确认。
 * [OUTPUT]: 2026-11-27 移除查看运行详情入口；有会话的记录行直达原消息，无会话原因直接显示。
 * [OUTPUT]: 2026-11-27 有关联会话的日志行直接定位；独立按钮查看详情；清空和删除提示只指日志。
 * [OUTPUT]: Dialog检索缩至28px/12px图标，10px清空图标在输入框外且悬停危险色；ScrollArea贴侧栏边缘，留白仅在内容层，原查询/分页/删除保持。
 * [OUTPUT]: 确认全部清空后立即按原动画关闭Popover，后台清理期间保留提交锁及Sonner结果反馈。
 * [OUTPUT]: 可按员工查询原执行记录，定时页面的布局和默认查询保持。
 * [OUTPUT]: 筛选复用公共FilterTabs及transitions-dev滑动层；实际新结果沿Panel reveal显现，后台刷新与分页不重播。
 * [OUTPUT]: 悬停/聚焦显示逐条删除；当前任务全部清空先分页冻结已结束记录，再按版本清理，活动/新记录保留。
 * [OUTPUT]: 每条已结束执行可经Popover确认删除；传所见版本，失败Sonner，运行/等待记录禁删。
 * [INPUT]: 原自动化分页查询、当前计划和右侧执行记录导航。
 * [OUTPUT]: 区分首次读取与后台刷新；已有列表/空态在执行进度更新时保持，避免加载行反复增删改变页面高度。
 * [OUTPUT]: 技能目录式两行执行记录、右侧折叠检索；全历史服务端搜索/分页，隐藏停止读取。
 * [POS]: 定时任务主区列表，不读取结果正文或展开执行过程。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AutomationHistoryPage, AutomationHistoryQuery, Snapshot } from '@boai/shared/domain'
import type { DesktopApi } from '@boai/shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { FilterTabs } from '@/components/common/filter-tabs'
import { usePanelReveal } from '@/components/common/use-panel-reveal'
import { CatalogSearch } from '@/components/common/catalog-search'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Clock, Trash2, ChevronRight, Search } from '@/components/icons'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notify as toast } from '@boai/ui/sonner'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import { occurrenceStatusLabels, deliveries } from './automation-history'

const historyFilters = [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'attention', label: '需处理' }] as const

export function AutomationHistory({ api, active, automationId, employeeId, attentionOnly = false, grouped = false, conversations, onConversation }: {
  conversations?: Snapshot['conversations']; onConversation?(id: string, messageId?: string): void
  api: DesktopApi; active: boolean; automationId?: string; employeeId?: string; attentionOnly?: boolean; grouped?: boolean
}) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState<NonNullable<AutomationHistoryQuery['status']>>('all')
  const [pages, setPages] = useState(1), [revision, setRevision] = useState(0)
  const [history, setHistory] = useState<AutomationHistoryPage>({ occurrences: [] })
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [error, setError] = useState('')
  const [clearing, setClearing] = useState(false)
  const deletedIds = useRef(new Set<string>())
  const removeRows = (ids: string[]) => {
    for (const id of ids) deletedIds.current.add(id)
    setHistory(previous => ({ ...previous, occurrences: previous.occurrences.filter(o => !deletedIds.current.has(o.id)) }))
    setRevision(value => value + 1)
  }
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'automation:history-deleted') { deletedIds.current.add(event.occurrenceId); setHistory(previous => ({ ...previous, occurrences: previous.occurrences.filter(o => o.id !== event.occurrenceId) })) }
      if ((event.type === 'changed' || event.type === 'automation:history-deleted') && !timer) timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 100)
    })
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [api, active])
  useEffect(() => {
    if (!active) return
    let live = true
    setLoading(true)
    void (async () => {
      const occurrences: AutomationHistoryPage['occurrences'] = []
      let before: AutomationHistoryPage['nextCursor']
      for (let page = 0; page < pages; page++) {
        const result = await api.request('listAutomationHistory', { automationId, employeeId, attentionOnly, search, status: attentionOnly ? 'attention' : status, before, limit: 30 })
        if (!live) return
        occurrences.push(...result.occurrences); before = result.nextCursor
        if (!before) break
      }
      if (live) { setHistory({ occurrences: occurrences.filter(o => !deletedIds.current.has(o.id)), nextCursor: before }); setLoaded(true); setError('') }
    })().catch(cause => { if (live) setError(errorText(cause)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [api, active, automationId, employeeId, attentionOnly, pages, revision, search, status])
  const listReveal = usePanelReveal(`${status}:${search}:${attentionOnly}`, active && loaded)
  const renderRecord = (o: AutomationHistoryPage['occurrences'][number]) => {
    const date = new Date(o.startedAt).toLocaleString('zh-CN', { hour12: false })
    const locate = o.status !== 'skipped' && o.taskKind !== 'monitor' && onConversation && conversations?.some(room => room.id === o.conversationId && !room.list?.hidden && !room.mergedInto)
    const reason = !locate && o.reason ? errorText(o.reason) : undefined
    const subtitle = [
      date,
      ...(!grouped ? [o.source === 'manual' ? '手动触发' : '定时触发', occurrenceStatusLabels[o.status], deliveries[o.deliveryStatus]] : []),
      reason,
    ].filter(Boolean).join(' · ')
    const row = { className: 'conversation-item automation-record-row', style: { paddingRight: 44 }, 'data-occurrence-id': o.id }
    const content = <>
      {!grouped && <span className="skill-list-icon"><Clock /></span>}
      <span className="conversation-copy">
        <strong className={`conversation-title${grouped ? ' block truncate' : ''}`} title={o.name}>{o.name}</strong>
        <small className="conversation-preview" title={subtitle}>
          {grouped ? <><time dateTime={o.startedAt}>{date}</time>{reason ? ` · ${reason}` : ''}</> : subtitle}
        </small>
      </span>
    </>
    return <div key={o.id} className="automation-history-row relative min-w-0">
      {locate
        ? <Button {...row} variant="ghost" size="content" title="定位聊天记录" onClick={() => onConversation(o.conversationId, o.messageId)}>{content}</Button>
        : <div {...row}>{content}</div>}
      <DeleteHistoryRecord api={api} occurrence={o} active={active && !clearing} onDeleted={() => removeRows([o.id])} />
    </div>
  }
  const results = <div ref={listReveal} className="schedule-content-transition t-panel-slide" data-open="true" data-settled="true" aria-busy={loading}>
    {error && <Banner>{error}</Banner>}
    {grouped && <p className="contact-manager-filter-label">筛选</p>}
    <div className="automation-record-list">{grouped ? [
      { label: '进行中', rows: history.occurrences.filter(o => (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)) },
      { label: '已完成', rows: history.occurrences.filter(o => o.status === 'completed') },
      { label: '需处理', rows: history.occurrences.filter(o => o.status !== 'completed' && !(AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(o.status)) },
    ].filter(group => group.rows.length).map(group => <Collapsible key={group.label}><CollapsibleTrigger render={<Button variant="ghost" size="content" className="conversation-section-heading contact-manager-filter-heading" />}><Clock /><span className="truncate">{group.label}</span><span className="contacts-count ml-auto">{group.rows.length}</span><ChevronRight style={{ marginLeft: 0 }} /></CollapsibleTrigger><CollapsibleContent><div className="contact-manager-submenu">{group.rows.map(renderRecord)}</div></CollapsibleContent></Collapsible>) : history.occurrences.map(renderRecord)}</div>
    {loading && !loaded && <Loading>正在读取执行记录…</Loading>}
    {loaded && !error && !history.occurrences.length && <p className="field-hint">{search ? '没有匹配的执行记录' : '暂无执行记录'}</p>}
    {history.nextCursor && <Button variant="secondary" size="sm" disabled={loading} onClick={() => setPages(value => value + 1)}>加载更早记录</Button>}
    {error && <Button variant="secondary" size="sm" onClick={() => setRevision(value => value + 1)}>重试读取</Button>}
  </div>
  const changeSearch = (value: string) => { setSearch(value.slice(0, 200)); setPages(1); setLoaded(false); setHistory({ occurrences: [] }) }
  return <section className={`automation-records${grouped ? ' min-h-0 flex-1 gap-0' : ''}`} aria-label="执行记录" style={active ? undefined : { display: 'none' }}>
    {grouped && <div className="flex shrink-0 items-center gap-2 px-[12px]" aria-label="执行记录工具栏"><InputGroup className="h-[28px] min-w-0 flex-1"><InputGroupAddon><Search className="size-[12px]" /></InputGroupAddon><InputGroupInput className="h-full text-[length:var(--text-ui-secondary)]" aria-label="搜索执行记录" placeholder="搜索记录" value={search} onChange={event => changeSearch(event.target.value)} /></InputGroup><ClearHistoryRecords api={api} automationId={automationId} employeeId={employeeId} attentionOnly={attentionOnly} active={active} onBusyChange={setClearing} onDeleted={removeRows} compact /></div>}
    {!grouped && <div className="automation-records-heading"><h3>{attentionOnly ? '需处理记录' : '执行记录'}</h3><div className="automation-record-actions">
      {automationId && <ClearHistoryRecords api={api} automationId={automationId} active={active} onBusyChange={setClearing} onDeleted={removeRows} />}
      <CatalogSearch label="搜索执行记录" placeholder="搜索记录中的任务标题" value={search} onChange={changeSearch} />
    </div></div>}
    {grouped ? <ScrollArea className="min-h-0 flex-1" viewportProps={{ className: 'overscroll-contain scroll-fade-y scroll-fade-6', 'aria-label': '执行记录滚动列表' }}><div className="px-[12px] pb-[22px]">{results}</div></ScrollArea> : !automationId && !attentionOnly ? <FilterTabs label="执行记录筛选" value={status} options={historyFilters} onValueChange={value => { setStatus(value); setPages(1); setLoaded(false); setHistory({ occurrences: [] }) }}>{results}</FilterTabs> : results}

  </section>
}

function ClearHistoryRecords({ api, automationId, employeeId, attentionOnly = false, active, onBusyChange, onDeleted, compact = false }: {
  api: DesktopApi; automationId?: string; employeeId?: string; attentionOnly?: boolean; active: boolean; onBusyChange(busy: boolean): void; onDeleted(ids: string[]): void; compact?: boolean
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const locked = useRef(false), generation = useRef(0)
  useEffect(() => { if (!active) setOpen(false); return () => { generation.current++ } }, [active, automationId, employeeId, attentionOnly])
  const clear = async () => {
    if (!active || locked.current) return
    locked.current = true; setOpen(false); setBusy(true); onBusyChange(true)
    const current = generation.current, deleted: string[] = [], failures: string[] = []
    try {
      // Freeze every page before mutation: clearing ignores the visible search and never sweeps new runs.
      const records = new Map<string, number>(), cursors = new Set<string>()
      let before: AutomationHistoryPage['nextCursor']
      do {
        const page = await api.request('listAutomationHistory', { ...(automationId ? { automationId } : {}), ...(employeeId ? { employeeId } : {}), ...(attentionOnly ? { attentionOnly: true } : {}), status: attentionOnly ? 'attention' : 'all', limit: 100, before })
        if (generation.current !== current) return
        for (const record of page.occurrences) {
          if (!(AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(record.status) && !records.has(record.id)) records.set(record.id, record.stateVersion)
        }
        before = page.nextCursor
        if (before) {
          const cursor = JSON.stringify(before)
          if (cursors.has(cursor)) throw new Error('执行记录分页异常，请重新读取后再清空')
          cursors.add(cursor)
        }
      } while (before)
      for (const [id, expectedVersion] of records) {
        if (generation.current !== current) return
        try { await api.request('deleteAutomationOccurrence', { id, expectedVersion }); deleted.push(id) }
        catch (error) { failures.push(errorText(error)) }
      }
      if (generation.current !== current) return
      if (failures.length) toast.error(`已删除 ${deleted.length} 条，${failures.length} 条未能删除：${failures[0]}`)
      else if (deleted.length) toast.success(`已清空 ${deleted.length} 条执行记录`)
      else toast.info('没有可清空的已结束记录')
    } catch (error) { if (generation.current === current) toast.error(errorText(error)) }
    finally { onDeleted(deleted); locked.current = false; setBusy(false); onBusyChange(false) }
  }
  const label = compact ? '清空记录' : '全部清空'
  const trigger = <PopoverTrigger render={<Button variant="ghost" size={compact ? 'icon-xs' : 'icon-sm'}
    className="text-muted-foreground hover:text-destructive" aria-label={label} title={compact ? label : undefined} disabled={!active || busy} />}>
    <Trash2 className={compact ? 'size-[10px]' : undefined} />
  </PopoverTrigger>
  return <Popover open={open} onOpenChange={value => { if (!locked.current) setOpen(value) }}>
    {compact ? trigger : <Tooltip><TooltipTrigger delay={500} render={trigger} /><TooltipContent>{label}</TooltipContent></Tooltip>}
    <PopoverContent align="end"><PopoverTitle>{automationId ? '清空当前任务的执行记录？' : employeeId ? '清空当前员工的执行记录？' : attentionOnly ? '清空需处理的执行记录？' : '清空全部执行记录？'}</PopoverTitle><PopoverDescription>执行中和等待处理的记录会保留。</PopoverDescription><div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" size="sm" disabled={busy || !active} onClick={() => void clear()}>确认清空</Button></div></PopoverContent>
  </Popover>
}

function DeleteHistoryRecord({ api, occurrence, active, onDeleted }: { api: DesktopApi; occurrence: AutomationHistoryPage['occurrences'][number]; active: boolean; onDeleted(): void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const confirmedVersion = useRef(occurrence.stateVersion)
  const ongoing = (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(occurrence.status)
  useEffect(() => { if (!active) setOpen(false) }, [active])
  const remove = async () => {
    if (busy || ongoing || !active) return
    setBusy(true)
    try { await api.request('deleteAutomationOccurrence', { id: occurrence.id, expectedVersion: confirmedVersion.current }); setOpen(false); onDeleted() }
    catch (error) { toast.error(errorText(error)) }
    finally { setBusy(false) }
  }
  return <Popover open={open} onOpenChange={value => { if (busy) return; if (value) confirmedVersion.current = occurrence.stateVersion; setOpen(value) }}>
    <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="automation-record-delete absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive" disabled={!active || busy || ongoing} aria-label={`删除执行记录 ${occurrence.name}`} title={ongoing ? '请先停止本次执行' : '删除执行记录'} />}><Trash2 /></PopoverTrigger>
    <PopoverContent align="end"><PopoverTitle>删除这条执行记录？</PopoverTitle><div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" size="sm" disabled={busy || ongoing || !active} onClick={() => void remove()}>{busy ? '正在删除…' : '确认删除'}</Button></div></PopoverContent>
  </Popover>
}
