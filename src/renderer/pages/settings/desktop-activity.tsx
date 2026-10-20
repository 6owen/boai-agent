/*
 * [INPUT]: Actual local recorder status, source records and saved thematic reports.
 * [OUTPUT]: Immediate opt-in settings, shared calendar range/report entry and confirmed deletion.
 * [POS]: Desktop settings card, independent of employee automation/personality logs.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import type { DesktopApi } from '@shared/ipc'
import type { ActivityStatus, ActivitySample, ActivityReport, ActivitySettings } from '@shared/domain/desktop-activity'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CalendarClock, InfoIcon, Trash2, RefreshCw } from '@/components/icons'
import { toast } from 'sonner'

export function DesktopActivityCard({ api, active, onReport }: { api: DesktopApi; active: boolean; onReport(from: string, to: string): Promise<void> }) {
  const [status, setStatus] = useState<ActivityStatus>(), [busy, setBusy] = useState(false), [dates, setDates] = useState<DateRange>(() => ({ from: new Date(), to: new Date() })), [samples, setSamples] = useState<ActivitySample[]>([]), [total, setTotal] = useState(0), [reports, setReports] = useState<ActivityReport[]>([]), [excluded, setExcluded] = useState(''), [clearOpen, setClearOpen] = useState(false)
  const from = format(dates.from!, 'yyyy-MM-dd'), to = format(dates.to ?? dates.from!, 'yyyy-MM-dd')
  const refresh = async () => {
    const [next, rows, saved] = await Promise.all([applicationCall<ActivityStatus>(api, 'activity.status'), applicationCall<{ samples: ActivitySample[]; total: number }>(api, 'activity.query', { from, to, limit: 20 }), applicationCall<ActivityReport[]>(api, 'activity.reports')])
    setStatus(next); setSamples(rows.samples); setTotal(rows.total); setReports(saved); setExcluded(next.settings.excludedApps.join('\n'))
  }
  useEffect(() => {
    if (!active) return
    let live = true
    void Promise.all([applicationCall<ActivityStatus>(api, 'activity.status'), applicationCall<{ samples: ActivitySample[]; total: number }>(api, 'activity.query', { from, to, limit: 20 }), applicationCall<ActivityReport[]>(api, 'activity.reports')]).then(([next, rows, saved]) => { if (live) { setStatus(next); setSamples(rows.samples); setTotal(rows.total); setReports(saved); setExcluded(next.settings.excludedApps.join('\n')) } }, error => { if (live) toast.error(String(error)) })
    return () => { live = false }
  }, [api, active, from, to])
  const action = async (run: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await run() } catch (error) { toast.error(String(error)) } finally { await refresh().catch(error => toast.error(String(error))); setBusy(false) } }
  useEffect(() => { if (status?.lastError) toast.error(status.lastError) }, [status?.lastError])
  const update = (patch: Partial<ActivitySettings>) => void action(() => applicationCall(api, 'activity.configure', { expectedRevision: status!.settings.revision, ...patch }, true))
  return <section className="mt-6 space-y-4">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-medium">桌面活动与日报<Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label="桌面活动说明" />}><InfoIcon /></TooltipTrigger><TooltipContent className="max-w-80">开启后按频率读取前台窗口，以本机 OCR 保存文字、应用名称和窗口标题，不保存截图。日报由 bobo 读取这些记录生成，会将所选记录发送给 bobo 使用的模型；不使用聊天历史补造活动。</TooltipContent></Tooltip></h3>
      <Button size="icon-sm" variant="ghost" disabled={busy} aria-label="刷新桌面活动" onClick={() => void action(async () => {})}><RefreshCw /></Button></div>
    <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
      <div className="appearance-row"><label htmlFor="activity-recording">记录桌面活动</label><Switch id="activity-recording" checked={status?.settings.enabled ?? false} disabled={!status || busy || !status.supported} onCheckedChange={enabled => update({ enabled })} /></div>
      <div className="appearance-row"><span>采集频率</span><SelectField className="w-36" size="sm" aria-label="活动采集频率" value={status?.settings.intervalSeconds ?? 60} options={[{ value: 30, label: '每 30 秒' }, { value: 60, label: '每分钟' }, { value: 120, label: '每 2 分钟' }, { value: 300, label: '每 5 分钟' }]} disabled={!status || busy} onValueChange={value => update({ intervalSeconds: Number(value) })} /></div>
      <div className="appearance-row"><span>保留记录</span><SelectField className="w-36" size="sm" aria-label="活动保留天数" value={status?.settings.retentionDays ?? 14} options={[{ value: 1, label: '1 天' }, { value: 7, label: '7 天' }, { value: 14, label: '14 天' }, { value: 30, label: '30 天' }]} disabled={!status || busy} onValueChange={value => update({ retentionDays: Number(value) })} /></div>
      <div className="appearance-row"><span>不记录的应用</span><Popover><PopoverTrigger render={<Button variant="outline" size="sm" disabled={!status || busy} />}>编辑排除列表</PopoverTrigger><PopoverContent align="end" className="w-80 space-y-3"><label htmlFor="activity-excluded" className="text-sm">应用标识，每行一个</label><Textarea id="activity-excluded" className="min-h-40" value={excluded} onChange={event => setExcluded(event.target.value)} /><Button size="sm" disabled={busy} onClick={() => update({ excludedApps: [...new Set(excluded.split('\n').map(x => x.trim()).filter(Boolean))] })}>保存排除列表</Button></PopoverContent></Popover></div>
    </CardContent></Card>
    <div className="flex flex-wrap items-center gap-2"><Popover><PopoverTrigger render={<Button variant="secondary" size="sm" data-slot="date-range-trigger" aria-label="日报日期范围" />}><CalendarClock />{from === to ? from : `${from} 至 ${to}`}</PopoverTrigger><PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] max-h-(--available-height) overflow-auto p-0"><Calendar mode="range" selected={dates} defaultMonth={dates.from} numberOfMonths={2} locale={zhCN} max={30} aria-label="日报日期范围" onSelect={next => { if (next?.from) setDates(next) }} /></PopoverContent></Popover>
      <Button variant="outline" size="sm" disabled={busy || !total} onClick={() => void action(() => onReport(from, to))}>交给 bobo 生成日报</Button>
      <Popover open={clearOpen} onOpenChange={setClearOpen}><PopoverTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy || !status?.count} aria-label="删除桌面活动" />}><Trash2 /></PopoverTrigger><PopoverContent align="end" className="w-72 space-y-3"><p className="text-sm">删除活动文字和关联日报。</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void action(async () => { await applicationCall(api, 'activity.clear', { from, to }, true); setClearOpen(false) })}>删除所选日期</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void action(async () => { await applicationCall(api, 'activity.clear', {}, true); setClearOpen(false) })}>全部清空</Button></div></PopoverContent></Popover>
    </div>
    <p className="text-muted-foreground text-sm">{total ? `所选日期有 ${total} 条观察，显示前 ${samples.length} 条。` : '所选日期暂无桌面活动记录。'}</p>
    {samples.length > 0 && <Card className="gap-0 p-0"><CardContent className="soft-divide-y px-4">{samples.map(sample => <div key={sample.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{sample.app} · {sample.title || '无窗口标题'}</p><p className="text-muted-foreground text-xs">{new Date(sample.capturedAt).toLocaleString()}</p></div><Popover><PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="查看活动文字" />}><InfoIcon /></PopoverTrigger><PopoverContent align="end" className="max-h-96 w-96 overflow-auto"><pre className="whitespace-pre-wrap text-xs">{sample.text || '该窗口未识别到文字。'}</pre></PopoverContent></Popover></div>)}</CardContent></Card>}
    {reports.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">已生成日报</h4>{reports.map(report => <Popover key={report.id}><PopoverTrigger render={<Button className="mr-2" variant="outline" size="sm" />}>{report.from === report.to ? report.from : `${report.from} 至 ${report.to}`}</PopoverTrigger><PopoverContent align="start" className="max-h-[65vh] w-[min(36rem,80vw)] overflow-auto"><div className="whitespace-pre-wrap text-sm">{report.content}</div></PopoverContent></Popover>)}</div>}
  </section>
}
