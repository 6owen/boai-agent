/*
 * [INPUT]: A recent session identity and the existing read-only activity application operations.
 * [OUTPUT]: Skill-style activity row and on-demand Dialog with paginated original observations, related analyses and explicit screenshot access.
 * [POS]: Settings activity details; no capture, generation or mutation side effects.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ActivityAnalysis, ActivitySample, ActivitySession, ActivitySessionPage } from '@boai/shared/domain/desktop-activity'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { ListRow } from '@/components/ui/item'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Clock, InfoIcon } from '@/components/icons'
import { toast } from 'sonner'

export function RecentActivityRow({ api, active, session }: { api: DesktopApi; active: boolean; session: ActivitySession }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [page, setPage] = useState<ActivitySessionPage>()
  const generation = useRef(0), pending = useRef(false)
  const load = async (kind: 'initial' | 'samples' | 'analyses' = 'initial') => {
    if (pending.current) return
    pending.current = true; setLoading(true); setFailed(false)
    const sequence = ++generation.current, previous = kind === 'initial' ? undefined : page
    try {
      let next = await applicationCall<ActivitySessionPage>(api, 'activity.session.sources', { id: session.id, offset: kind === 'samples' ? previous?.nextOffset ?? 0 : 0, analysisOffset: kind === 'analyses' ? previous?.nextAnalysisOffset ?? 0 : 0, limit: 20 })
      if (sequence !== generation.current) return
      if (previous && previous.revision !== next.revision) {
        next = await applicationCall<ActivitySessionPage>(api, 'activity.session.sources', { id: session.id, limit: 20 })
        if (sequence !== generation.current) return
        setPage(next); toast.info('活动内容已变化，已刷新详情。')
      } else setPage(previous ? { ...next,
        samples: kind === 'samples' ? [...previous.samples, ...next.samples] : previous.samples,
        nextOffset: kind === 'samples' ? next.nextOffset : previous.nextOffset,
        analyses: kind === 'analyses' ? [...previous.analyses, ...next.analyses] : previous.analyses,
        nextAnalysisOffset: kind === 'analyses' ? next.nextAnalysisOffset : previous.nextAnalysisOffset,
      } : next)
    } catch (error) {
      if (sequence === generation.current) { setPage(undefined); setFailed(true); toast.error(String(error)) }
    } finally { if (sequence === generation.current) { pending.current = false; setLoading(false) } }
  }
  useEffect(() => {
    if (!active || !open) {
      generation.current++; pending.current = false; setLoading(false); setPage(undefined); setFailed(false)
      if (!active) setOpen(false)
      return
    }
    void load()
    return () => { generation.current++; pending.current = false }
  }, [api, active, open, session.id])
  const current = page?.session ?? session
  const label = current.apps.join('、') || '桌面活动', start = new Date(current.from), end = new Date(current.to)
  const time = `${format(start, 'MM-dd HH:mm:ss')} 至 ${format(end, format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd') ? 'HH:mm:ss' : 'MM-dd HH:mm:ss')}`
  return <Dialog open={open && active} onOpenChange={value => { if (!value) { generation.current++; pending.current = false } setOpen(value) }}>
    <DialogTrigger render={<ListRow label={label} description={time} icon={<Clock />} disabled={!active} aria-label={`查看 ${label} 的活动详情，${time}`} />} />
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{time}</DialogDescription></DialogHeader>
      <ScrollArea className="h-[min(60vh,36rem)] min-h-0">
        <div className="space-y-4 pr-3">
          <dl className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">观察记录</dt><dd className="tabular-nums">{current.sampleCount} 条</dd>
            <dt className="text-muted-foreground">保存截图</dt><dd className="tabular-nums">{current.screenshotCount} 张</dd>
            <dt className="text-muted-foreground">按键</dt><dd className="tabular-nums">{current.keypresses} 次</dd>
            <dt className="text-muted-foreground">点击</dt><dd className="tabular-nums">{current.clicks} 次</dd>
          </dl>
          {failed ? <Button variant="secondary" size="sm" onClick={() => void load()}>重新读取活动详情</Button> : !page ? <p className="field-hint">正在读取活动详情…</p> : <>
            <section><h4 className="mb-2 text-sm font-medium">原始观察</h4>
              {!page.samples.length && <p className="field-hint">该片段暂无窗口观察记录。</p>}
              {page.samples.map(sample => <Collapsible key={sample.id}>
                <CollapsibleTrigger render={<ListRow label={sample.title || '无窗口标题'} description={`${sample.app} · ${format(new Date(sample.capturedAt), 'MM-dd HH:mm:ss')}`} icon={<InfoIcon />} />} />
                <CollapsibleContent><div className="space-y-2 px-2 pb-3"><pre className="whitespace-pre-wrap break-words text-sm">{sample.text || (sample.ocr === false ? '本次未进行文字识别。' : '该窗口未识别到文字。')}</pre>{sample.screenshot && <ActivityScreenshot api={api} id={sample.id} />}</div></CollapsibleContent>
              </Collapsible>)}
              {page.nextOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load('samples')}>{loading ? '读取中…' : '加载更多观察'}</Button>}
            </section>
            {page.analysisTotal > 0 && <section className="space-y-2"><h4 className="text-sm font-medium">相关活动主题</h4>
              {page.analyses.map(analysis => <div key={analysis.id}><ActivityAnalysisDetail api={api} analysis={analysis} /></div>)}
              {page.nextAnalysisOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load('analyses')}>{loading ? '读取中…' : '加载更多主题'}</Button>}
            </section>}
          </>}
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
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
