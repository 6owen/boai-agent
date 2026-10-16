/*
 * [OUTPUT]: 每条已结束执行可经Popover确认删除；传所见版本，失败Sonner，运行/等待记录禁删。
 * [INPUT]: 原自动化分页查询、当前计划和右侧执行记录导航。
 * [OUTPUT]: 区分首次读取与后台刷新；已有列表/空态在执行进度更新时保持，避免加载行反复增删改变页面高度。
 * [OUTPUT]: 技能目录式两行执行记录、右侧折叠检索；全历史服务端搜索/分页，隐藏停止读取。
 * [POS]: 定时任务主区列表，不读取结果正文或展开执行过程。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AutomationHistoryPage, AutomationHistoryQuery } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import { Banner, errorText, Loading } from '@/components/common'
import { CatalogSearch } from '@/components/common/catalog-search'
import { Button } from '@/components/ui/button'
import { Clock, Trash2 } from '@/components/icons'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { AUTOMATION_ONGOING_STATUSES } from '@shared/domain/automations'
import { occurrenceStatusLabels, deliveries } from './automation-history'

export function AutomationHistory({ api, active, automationId, attentionOnly = false, selectedId, onOccurrence }: {
  api: DesktopApi; active: boolean; automationId?: string; attentionOnly?: boolean; selectedId?: string; onOccurrence(id: string): void
}) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState<AutomationHistoryQuery['status']>('all')
  const [pages, setPages] = useState(1), [revision, setRevision] = useState(0)
  const [history, setHistory] = useState<AutomationHistoryPage>({ occurrences: [] })
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false), [error, setError] = useState('')
  const deletedIds = useRef(new Set<string>())
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'automation:history-deleted') { deletedIds.current.add(event.occurrenceId); setHistory(previous => ({ ...previous, occurrences: previous.occurrences.filter(o => o.id !== event.occurrenceId) })); setRevision(value => value + 1); return }
      if (event.type === 'changed' && !timer) timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1) }, 100)
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
        const result = await api.request('listAutomationHistory', { automationId, attentionOnly, search, status: attentionOnly ? 'attention' : status, before, limit: 30 })
        if (!live) return
        occurrences.push(...result.occurrences); before = result.nextCursor
        if (!before) break
      }
      if (live) { setHistory({ occurrences: occurrences.filter(o => !deletedIds.current.has(o.id)), nextCursor: before }); setLoaded(true); setError('') }
    })().catch(cause => { if (live) setError(errorText(cause)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [api, active, automationId, attentionOnly, pages, revision, search, status])
  return <section className="automation-records" aria-label="执行记录" style={active ? undefined : { display: 'none' }}>
    <div className="automation-records-heading"><h3>{attentionOnly ? '需处理记录' : '执行记录'}</h3><CatalogSearch label="搜索执行记录" placeholder="搜索记录中的任务标题" value={search} onChange={value => { setSearch(value.slice(0, 200)); setPages(1); setLoaded(false); setHistory({ occurrences: [] }) }} /></div>
    {!automationId && !attentionOnly && <div className="button-row" aria-label="执行记录筛选">{([{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'attention', label: '需处理' }] as const).map(item => <Button key={item.value} size="sm" variant={status === item.value ? 'secondary' : 'ghost'} aria-pressed={status === item.value} onClick={() => { if (status === item.value) return; setStatus(item.value); setPages(1); setLoaded(false); setHistory({ occurrences: [] }) }}>{item.label}</Button>)}</div>}
    {error && <Banner>{error}</Banner>}
    <div className="automation-record-list">{history.occurrences.map(o => {
      const date = new Date(o.startedAt).toLocaleString('zh-CN', { hour12: false })
      const subtitle = `${date} · ${o.source === 'manual' ? '手动触发' : '定时触发'} · ${occurrenceStatusLabels[o.status]} · ${deliveries[o.deliveryStatus]}`
      return <div key={o.id} className="relative min-w-0"><Button variant="ghost" size="content" className={`conversation-item automation-record-row${selectedId === o.id ? ' selected' : ''}`} style={{ paddingRight: 44 }} data-occurrence-id={o.id} aria-pressed={selectedId === o.id} onClick={() => onOccurrence(o.id)}>
        <span className="skill-list-icon"><Clock /></span><span className="conversation-copy"><strong className="conversation-title" title={o.name}>{o.name}</strong><small className="conversation-preview" title={subtitle}>{subtitle}</small></span>
      </Button><DeleteHistoryRecord api={api} occurrence={o} active={active} onDeleted={() => { deletedIds.current.add(o.id); setHistory(previous => ({ ...previous, occurrences: previous.occurrences.filter(item => item.id !== o.id) })); setRevision(value => value + 1) }} /></div>
    })}</div>
    {loading && !loaded && <Loading>正在读取执行记录…</Loading>}
    {loaded && !error && !history.occurrences.length && <p className="field-hint">{search ? '没有匹配的执行记录' : '暂无执行记录'}</p>}
    {history.nextCursor && <Button variant="secondary" size="sm" disabled={loading} onClick={() => setPages(value => value + 1)}>加载更早记录</Button>}
    {error && <Button variant="secondary" size="sm" onClick={() => setRevision(value => value + 1)}>重试读取</Button>}
  </section>
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
    <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive" disabled={!active || busy || ongoing} aria-label={`删除执行记录 ${occurrence.name}`} title={ongoing ? '请先停止本次执行' : '删除执行记录'} />}><Trash2 /></PopoverTrigger>
    <PopoverContent align="end"><PopoverTitle>删除这条执行记录及其文件？</PopoverTitle><div className="button-row justify-end"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" size="sm" disabled={busy || ongoing || !active} onClick={() => void remove()}>{busy ? '正在删除…' : '确认删除'}</Button></div></PopoverContent>
  </Popover>
}
