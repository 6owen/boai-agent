/*
 * [INPUT]: Actual local recorder status, source records, structured themes and saved thematic reports.
 * [OUTPUT]: Dedicated settings page with recorder controls, recent sessions, source-bound theme/candidate review, shared calendar range/report entry and confirmed deletion.
 * [POS]: Desktop settings card, independent of employee automation/personality logs.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ActivityStatus, ActivitySample, ActivityReport, ActivitySettings, ActivityAnalysis } from '@boai/shared/domain/desktop-activity'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CalendarClock, InfoIcon, Trash2, RefreshCw } from '@/components/icons'
import { toast } from 'sonner'
import { ActivityRecorderSettings, ActivitySection } from './activity-recorder-settings'

export function DesktopActivityPage({ api, active, onReport }: { api: DesktopApi; active: boolean; onReport(from: string, to: string): Promise<void> }) {
  const [status, setStatus] = useState<ActivityStatus>(), [busy, setBusy] = useState(false), [dates, setDates] = useState<DateRange>(() => ({ from: new Date(), to: new Date() })), [samples, setSamples] = useState<ActivitySample[]>([]), [total, setTotal] = useState(0), [reports, setReports] = useState<ActivityReport[]>([]), [analysisView, setAnalysisView] = useState<{ total: number; analyses: ActivityAnalysis[]; nextOffset: number | null }>({ total: 0, analyses: [], nextOffset: null }), [clearOpen, setClearOpen] = useState(false)
  const lock = useRef(false), generation = useRef(0), currentRange = useRef('')
  const from = format(dates.from!, 'yyyy-MM-dd'), to = format(dates.to ?? dates.from!, 'yyyy-MM-dd')
  const rangeKey = `${active}:${from}:${to}`
  currentRange.current = rangeKey
  const refresh = async () => {
    const key = rangeKey, sequence = ++generation.current
    const [next, rows, saved, analyzed] = await Promise.all([applicationCall<ActivityStatus>(api, 'activity.status'), applicationCall<{ samples: ActivitySample[]; total: number }>(api, 'activity.query', { from, to, limit: 20 }), applicationCall<ActivityReport[]>(api, 'activity.reports'), applicationCall<{ total: number; analyses: ActivityAnalysis[]; nextOffset: number | null }>(api, 'activity.analyses', { from, to, limit: 20 })])
    if (key !== currentRange.current || sequence !== generation.current) return
    setStatus(previous => !previous || next.settings.revision >= previous.settings.revision ? next : previous); setSamples(rows.samples); setTotal(rows.total); setReports(saved); setAnalysisView(analyzed)
  }
  useEffect(() => {
    if (!active) return
    let live = true
    const sequence = ++generation.current
    void Promise.all([applicationCall<ActivityStatus>(api, 'activity.status'), applicationCall<{ samples: ActivitySample[]; total: number }>(api, 'activity.query', { from, to, limit: 20 }), applicationCall<ActivityReport[]>(api, 'activity.reports'), applicationCall<{ total: number; analyses: ActivityAnalysis[]; nextOffset: number | null }>(api, 'activity.analyses', { from, to, limit: 20 })]).then(([next, rows, saved, analyzed]) => { if (live && sequence === generation.current) { setStatus(previous => !previous || next.settings.revision >= previous.settings.revision ? next : previous); setSamples(rows.samples); setTotal(rows.total); setReports(saved); setAnalysisView(analyzed) } }, error => { if (live) toast.error(String(error)) })
    return () => { live = false }
  }, [api, active, from, to])
  useEffect(() => {
    if (!active) return
    let live = true, reading = false
    const poll = async () => {
      if (reading || lock.current) return
      reading = true
      try { const next = await applicationCall<ActivityStatus>(api, 'activity.status'); if (live) setStatus(previous => !previous || next.settings.revision >= previous.settings.revision ? next : previous) }
      catch { /* Manual refresh exposes failures without repeated background toasts. */ }
      finally { reading = false }
    }
    const timer = setInterval(() => void poll(), 5000)
    window.addEventListener('focus', poll)
    return () => { live = false; generation.current++; clearInterval(timer); window.removeEventListener('focus', poll) }
  }, [api, active])
  const action = async (run: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await run() } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
    finally { try { await refresh() } catch (error) { toast.error(String(error)) } lock.current = false; setBusy(false) }
  }
  const update = (patch: Partial<ActivitySettings>) => void action(() => applicationCall(api, 'activity.configure', { expectedRevision: status!.settings.revision, ...patch }, true))
  const loadMoreAnalyses = async () => {
    if (lock.current || analysisView.nextOffset === null) return
    const key = currentRange.current
    lock.current = true; setBusy(true)
    try {
      const page = await applicationCall<{ total: number; analyses: ActivityAnalysis[]; nextOffset: number | null }>(api, 'activity.analyses', { from, to, offset: analysisView.nextOffset, limit: 20 })
      if (key !== currentRange.current) return
      if (page.total !== analysisView.total) { await refresh(); toast.info('活动分析已变化，已刷新列表。') }
      else setAnalysisView(previous => ({ total: page.total, analyses: [...previous.analyses, ...page.analyses], nextOffset: page.nextOffset }))
    } catch (error) { toast.error(String(error)) } finally { lock.current = false; setBusy(false) }
  }
  return <section className="settings-document space-y-6">
    <div className="settings-document-heading flex items-center justify-between"><h2 className="flex items-center gap-2">桌面活动与日报<Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label="桌面活动说明" />}><InfoIcon /></TooltipTrigger><TooltipContent className="max-w-80">记录保存在本机。生成日报时，所选 OCR 文字会发给 bobo 使用的模型；保存的截图不会自动发送给模型。</TooltipContent></Tooltip></h2><Button size="icon-sm" variant="ghost" disabled={busy} aria-label="刷新桌面活动" onClick={() => void action(async () => {})}><RefreshCw /></Button></div>
    <ActivityRecorderSettings status={status} busy={busy} update={update} permission={(kind, openSettings) => void action(() => applicationCall(api, 'activity.permissions', { kind, openSettings }, true))} openDirectory={() => { if (status?.outputDirectory) void action(() => api.request('openPath', { path: status.outputDirectory! })) }} />
    <ActivitySection title="最近活动">
      {!status?.recentSessions?.length && <p className="field-hint py-4">暂无活动记录。</p>}
      {status?.recentSessions?.map(session => <div key={session.id} className="space-y-1 py-3"><p className="font-medium">{session.apps.join('、')}</p><p className="field-hint">{new Date(session.from).toLocaleString()} 至 {new Date(session.to).toLocaleTimeString()}{session.active ? ' · 活跃' : ''}</p><p className="field-hint">{session.sampleCount} 条观察 · {session.screenshotCount} 张截图 · {session.keypresses} 次按键 · {session.clicks} 次点击</p></div>)}
    </ActivitySection>
    <h3 className="font-medium">活动记录与日报</h3>
    <div className="flex flex-wrap items-center gap-2"><Popover><PopoverTrigger render={<Button variant="secondary" size="sm" data-slot="date-range-trigger" aria-label="日报日期范围" />}><CalendarClock />{from === to ? from : `${from} 至 ${to}`}</PopoverTrigger><PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] max-h-(--available-height) overflow-auto p-0"><Calendar mode="range" selected={dates} defaultMonth={dates.from} numberOfMonths={2} locale={zhCN} max={30} aria-label="日报日期范围" onSelect={next => { if (next?.from) setDates(next) }} /></PopoverContent></Popover>
      <Button variant="outline" size="sm" disabled={busy || !total} onClick={() => void action(() => onReport(from, to))}>交给 bobo 生成日报</Button>

    </div>
    <p className="text-muted-foreground text-sm">{total ? `所选日期有 ${total} 条观察，显示前 ${samples.length} 条。` : '所选日期暂无桌面活动记录。'}</p>
    {samples.length > 0 && <Card className="gap-0 p-0"><CardContent className="soft-divide-y px-4">{samples.map(sample => <div key={sample.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{sample.app} · {sample.title || '无窗口标题'}</p><p className="text-muted-foreground text-xs">{new Date(sample.capturedAt).toLocaleString()}</p></div><Popover><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看活动文字" />}><InfoIcon /></PopoverTrigger><PopoverContent align="end" className="max-h-96 w-96 overflow-auto"><pre className="whitespace-pre-wrap text-sm">{sample.text || (sample.ocr === false ? '本次未进行文字识别。' : '该窗口未识别到文字。')}</pre>{sample.screenshot && <ActivityScreenshot api={api} id={sample.id} />}</PopoverContent></Popover></div>)}</CardContent></Card>}
    {analysisView.total > 0 && <Card className="gap-0 p-0"><CardContent className="space-y-3 p-4"><div><h4 className="text-sm font-medium">活动主题</h4><p className="text-muted-foreground text-xs">根据屏幕文字提炼，需以原记录核对。共 {analysisView.total} 条分析，已显示 {analysisView.analyses.length} 条。</p></div>{analysisView.analyses.map(item => <div key={item.id} className="space-y-1 border-t pt-3"><p className="text-sm font-medium">{item.project || item.title || '未命名主题'}</p><p className="text-muted-foreground text-xs">{item.sampleIds.length} 条原记录{item.highlights.length ? ` · ${item.highlights.slice(0, 2).join('；')}` : ''}</p><ActivityAnalysisDetail api={api} analysis={item} /></div>)}{analysisView.nextOffset !== null && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void loadMoreAnalyses()}>加载更多分析</Button>}{analysisView.analyses.some(item => item.memoryCandidates.length > 0) && <p className="text-muted-foreground text-xs">长期记忆建议只供核对，尚未加入 Bobo 的长期记忆。</p>}</CardContent></Card>}
    {reports.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">已生成日报</h4>{reports.map(report => <Popover key={report.id}><PopoverTrigger render={<Button className="mr-2" variant="outline" size="sm" />}>{report.from === report.to ? report.from : `${report.from} 至 ${report.to}`}</PopoverTrigger><PopoverContent align="start" className="max-h-[65vh] w-[min(36rem,80vw)] overflow-auto"><div className="whitespace-pre-wrap text-sm">{report.content}</div></PopoverContent></Popover>)}</div>}
    <ActivitySection title="清理活动数据"><div className="flex items-center justify-between gap-3 py-4"><p className="field-hint">可删除所选日期或全部记录，保留采集设置。</p>      <Popover open={clearOpen} onOpenChange={setClearOpen}><PopoverTrigger render={<Button variant="outline" size="sm" disabled={busy || !status?.count && !status?.sessionCount} aria-label="删除桌面活动" />}><Trash2 />清理活动数据</PopoverTrigger><PopoverContent align="end" className="w-72 space-y-3"><p className="text-sm">删除活动文字、截图、键鼠事件、提炼主题和关联日报，无法撤销。</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void action(async () => { await applicationCall(api, 'activity.clear', { from, to }, true); setClearOpen(false) })}>删除所选日期</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void action(async () => { await applicationCall(api, 'activity.clear', {}, true); setClearOpen(false) })}>全部清空</Button></div></PopoverContent></Popover></div></ActivitySection>
  </section>
}

function ActivityAnalysisDetail({ api, analysis }: { api: DesktopApi; analysis: ActivityAnalysis }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<ActivitySample[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const load = async (offset: number) => {
    setLoading(true)
    try {
      const page = await applicationCall<{ sourceHash: string; samples: ActivitySample[]; nextOffset: number | null }>(api, 'activity.analysis.sources', { id: analysis.id, offset, limit: 10 })
      if (page.sourceHash !== analysis.sourceHash) throw new Error('活动分析来源已改变，请刷新后重试')
      setSources(previous => offset ? [...previous, ...page.samples] : page.samples)
      setNextOffset(page.nextOffset)
    } catch (error) { setSources([]); setNextOffset(null); toast.error(String(error)) }
    finally { setLoading(false) }
  }
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) { setSources([]); setNextOffset(0); void load(0) } }}>
    <PopoverTrigger render={<Button variant="outline" size="sm" />}>{analysis.title || '查看分析'}</PopoverTrigger>
    <PopoverContent align="start" className="max-h-[70vh] w-[min(42rem,85vw)] space-y-3 overflow-auto">
      <p className="text-sm whitespace-pre-wrap">{analysis.description}</p>
      {analysis.memoryCandidates.length > 0 && <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">长期记忆建议 · 尚未保存</p>{analysis.memoryCandidates.map((candidate, index) => <div key={index} className="space-y-1 text-sm"><p>{candidate.content}</p><p className="text-muted-foreground text-xs">{candidate.why}</p></div>)}</div>}
      <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">原始桌面记录</p>{sources.map(sample => <div key={sample.id} className="space-y-1 border-t pt-2"><p className="text-xs font-medium">{sample.app} · {sample.title || '无窗口标题'} · {new Date(sample.capturedAt).toLocaleString()}</p><pre className="whitespace-pre-wrap break-words text-xs">{sample.text || '该窗口未识别到文字。'}</pre></div>)}{nextOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load(nextOffset)}>{loading ? '读取中…' : sources.length ? '加载更多原文' : '读取原文'}</Button>}</div>
    </PopoverContent>
  </Popover>
}

function ActivityScreenshot({ api, id }: { api: DesktopApi; id: string }) {
  const [url, setUrl] = useState(''), [loading, setLoading] = useState(false)
  return url ? <img src={url} alt="本次活动的前台窗口截图" className="mt-3 max-w-full rounded-md" /> : <Button className="mt-3" variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); void applicationCall<{ url: string }>(api, 'activity.screenshot', { id }).then(value => setUrl(value.url), error => toast.error(String(error))).finally(() => setLoading(false)) }}>查看截图</Button>
}
