/*
 * [INPUT]: A recent session identity and the existing read-only activity application operations.
 * [OUTPUT]: Dialog initially focuses its title; the 1px separator highlights only on hover/drag, and edge-aligned ScrollArea keeps viewport fade without native scrollbar space. OCR card and stale-result isolation remain intact.
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
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronRight, Clock, InfoIcon } from '@/components/icons'
import { toast } from 'sonner'

export function RecentActivityRow({ api, active, session }: { api: DesktopApi; active: boolean; session: ActivitySession }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [page, setPage] = useState<ActivitySessionPage>()
  const [selectedId, select] = useState<string>()
  const titleRef = useRef<HTMLHeadingElement>(null)
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
      generation.current++; pending.current = false; setLoading(false); setPage(undefined); setFailed(false); select(undefined)
      if (!active) setOpen(false)
      return
    }
    void load()
    return () => { generation.current++; pending.current = false }
  }, [api, active, open, session.id])
  const current = page?.session ?? session
  const label = current.apps.join('、') || '桌面活动', start = new Date(current.from), end = new Date(current.to)
  const time = `${format(start, 'MM-dd HH:mm:ss')} 至 ${format(end, format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd') ? 'HH:mm:ss' : 'MM-dd HH:mm:ss')}`
  const selected = page?.samples.find(sample => sample.id === selectedId) ?? page?.samples[0]
  const changeOpen = (value: boolean) => { if (!value) { generation.current++; pending.current = false } setOpen(value) }
  return <Dialog open={open && active} onOpenChange={changeOpen}>
    <DialogTrigger render={<ListRow label={label} description={time} icon={<Clock />} disabled={!active} aria-label={`查看 ${label} 的活动详情，${time}`} />} />
    <DialogContent initialFocus={titleRef} className="max-h-[calc(100dvh-32px)] overflow-hidden p-0 sm:max-w-[min(960px,calc(100vw-32px))]">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0" style={{ height: 'min(80dvh, 680px)' }}>
        <ResizablePanel defaultSize="30%" minSize="22%" maxSize="40%">
          <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 pt-6" aria-label="原始观察列表" aria-busy={loading}>
            <div className="flex min-h-8 items-center justify-between gap-2 px-6"><h3 className="text-sm font-medium">原始观察</h3><span className="text-xs text-muted-foreground">{current.sampleCount} 条</span></div>
            <ScrollArea className="h-0 min-h-0 flex-1">
              <div className="space-y-1 pb-6 pl-4 pr-3">
                {failed ? <Button variant="secondary" size="sm" onClick={() => void load()}>重新读取活动详情</Button> : !page ? <ActivityDetailSkeleton /> : <>
                  {!page.samples.length && <p className="p-2 text-sm text-muted-foreground">该片段暂无窗口观察记录。</p>}
                  <div role="list">{page.samples.map(sample => <div role="listitem" key={sample.id}><ListRow selected={sample.id === selected?.id} label={sample.title || '无窗口标题'} description={`${sample.app} · ${format(new Date(sample.capturedAt), 'HH:mm:ss')}`} icon={<InfoIcon />} onClick={() => select(sample.id)} /></div>)}</div>
                  {page.nextOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load('samples')}>加载更多观察</Button>}
                </>}
              </div>
            </ScrollArea>
          </section>
        </ResizablePanel>
        <ResizableHandle className="resize-handle bg-transparent shadow-none hover:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring" aria-label="调整观察列表与详情宽度" />
        <ResizablePanel defaultSize="70%" minSize="50%">
          <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 pt-6" aria-label="活动详情">
            <DialogHeader className="pl-6 pr-12"><DialogTitle ref={titleRef} tabIndex={-1} className="truncate" title={label}>{label}</DialogTitle><DialogDescription>{time}</DialogDescription></DialogHeader>
            <ScrollArea key={`${page?.revision}:${selected?.id}`} className="h-0 min-h-0 flex-1" viewportProps={{ className: 'scroll-fade-t scroll-fade-6' }}>
              <div className="space-y-4 px-6 pb-6" aria-busy={loading}>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">保存截图</dt><dd className="m-0 tabular-nums">{current.screenshotCount} 张</dd>
                  <dt className="text-muted-foreground">按键 / 点击</dt><dd className="m-0 tabular-nums">{current.keypresses} / {current.clicks} 次</dd>
                </dl>
                <Separator />
                {!page && !failed ? <ActivityDetailSkeleton /> : selected && open && active ? <section className="space-y-3" aria-label="所选观察详情">
                  <div className="space-y-1"><h3 className="break-words text-sm font-medium">{selected.title || '无窗口标题'}</h3><p className="text-xs text-muted-foreground">{selected.app} · {format(new Date(selected.capturedAt), 'MM-dd HH:mm:ss')}</p></div>
                  <Collapsible defaultOpen>
                    <h4><CollapsibleTrigger className="flex items-center justify-between gap-2 rounded-sm py-1 text-sm font-medium">识别文字<ChevronRight /></CollapsibleTrigger></h4>
                    <CollapsibleContent><div className="pt-2"><Card size="sm"><CardContent><pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm">{selected.text || (selected.ocr === false ? '本次未进行文字识别。' : '该窗口未识别到文字。')}</pre></CardContent></Card></div></CollapsibleContent>
                  </Collapsible>
                  {selected.screenshot && <ActivityScreenshot api={api} id={selected.id} />}
                </section> : page && <p className="text-sm text-muted-foreground">该片段暂无窗口观察记录。</p>}
                {page && page.analysisTotal > 0 && open && active && <section className="space-y-2"><Separator /><h4 className="text-sm font-medium">相关活动主题</h4>
                  {page.analyses.map(analysis => <div key={analysis.id}><ActivityAnalysisDetail api={api} analysis={analysis} /></div>)}
                  {page.nextAnalysisOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load('analyses')}>加载更多主题</Button>}
                </section>}
              </div>
            </ScrollArea>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </DialogContent>
  </Dialog>
}

function ActivityDetailSkeleton() {
  return <div className="space-y-3 p-2" aria-hidden="true">{[0, 1, 2].map(index => <div className="space-y-2" key={index}><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div>
}

function ActivityAnalysisDetail({ api, analysis }: { api: DesktopApi; analysis: ActivityAnalysis }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<ActivitySample[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const load = async (offset: number) => {
    const sequence = ++generation.current
    setLoading(true)
    try {
      const page = await applicationCall<{ sourceHash: string; samples: ActivitySample[]; nextOffset: number | null }>(api, 'activity.analysis.sources', { id: analysis.id, offset, limit: 10 })
      if (sequence !== generation.current) return
      if (page.sourceHash !== analysis.sourceHash) throw new Error('活动分析来源已改变，请刷新后重试')
      setSources(previous => offset ? [...previous, ...page.samples] : page.samples)
      setNextOffset(page.nextOffset)
    } catch (error) { if (sequence === generation.current) { setSources([]); setNextOffset(null); toast.error(String(error)) } }
    finally { if (sequence === generation.current) setLoading(false) }
  }
  return <Popover open={open} onOpenChange={value => { generation.current++; setOpen(value); if (value) { setSources([]); setNextOffset(0); void load(0) } }}>
    <PopoverTrigger render={<Button variant="outline" size="sm" />}>{analysis.title || '查看分析'}</PopoverTrigger>
    <PopoverContent align="start" className="max-h-[70vh] w-[min(42rem,85vw)] space-y-3 overflow-auto">
      <p className="text-sm whitespace-pre-wrap">{analysis.description}</p>
      {analysis.memoryCandidates.length > 0 && <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">长期记忆建议 · 尚未保存</p>{analysis.memoryCandidates.map((candidate, index) => <div key={index} className="space-y-1 text-sm"><p>{candidate.content}</p><p className="text-muted-foreground text-xs">{candidate.why}</p></div>)}</div>}
      <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">原始桌面记录</p>{sources.map(sample => <div key={sample.id} className="space-y-1 border-t pt-2"><p className="text-xs font-medium">{sample.app} · {sample.title || '无窗口标题'} · {new Date(sample.capturedAt).toLocaleString()}</p><pre className="whitespace-pre-wrap break-words text-xs">{sample.text || '该窗口未识别到文字。'}</pre></div>)}{nextOffset !== null && <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load(nextOffset)}>{sources.length ? '加载更多原文' : '读取原文'}</Button>}</div>
    </PopoverContent>
  </Popover>
}

function ActivityScreenshot({ api, id }: { api: DesktopApi; id: string }) {
  const [url, setUrl] = useState(''), [loading, setLoading] = useState(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  return url ? <img src={url} alt="本次活动的前台窗口截图" className="mt-3 max-w-full rounded-md" /> : <Button className="mt-3" variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); void applicationCall<{ url: string }>(api, 'activity.screenshot', { id }).then(value => { if (live.current) setUrl(value.url) }, error => { if (live.current) toast.error(String(error)) }).finally(() => { if (live.current) setLoading(false) }) }}>查看截图</Button>
}
