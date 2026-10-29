/*
 * [OUTPUT]: 标识原判断/协调/执行阶段；无可读Run时允许显示保留的单次运行记录。
 * [OUTPUT]: 聊天历史包含已发布的定时执行；跟踪原来源更新/删除，并复用精确停止入口。
 * [OUTPUT]: 2026-10-27移除任务结果入口与弹窗，执行记录沿原详情展示。
 * [OUTPUT]: 执行历史仅查看过程/定位消息及原停止入口，不提供继续或发送消息的按钮。
 * [OUTPUT]: 通讯录固定Run通过原员工详情查询精确读取，同一执行卡片不加载其他历史或额外摘要。
 * [OUTPUT]: 卡片工具行按停止图标、定位聊天记录、原生记录切换排列；定时任务停止由父级按本次身份提供，仅显示在最新卡片。
 * [OUTPUT]: 定时任务按occurrence限定同一次运行，仅显示执行卡片；普通会话保留历史标题和成员筛选。
 * [OUTPUT]: 通用运行时插件参与成果修订候选与真实执行停止，原来源核验保持。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [INPUT]: 会话执行历史、Rovai迁入的执行内容、BOAI现有详情容器。
 * [OUTPUT]: 私聊隐藏头像栏；卡片固定次级header/通栏分隔和最大60vh/600px独立滚动；视图切换测量真实高度过渡，已打开内容保留、折叠停读，展示与折叠独立。
 * [POS]: 执行面板数据边界，隐藏停读，更新保留展开/阅读位置。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { isNativeBackend } from '@boai/shared/domain/backends'
import { useEffect, useLayoutEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { Snapshot, AgentRun, DigitalAgent } from '@boai/shared/domain'
import type { ExecutionHistoryPage } from '@boai/shared/domain/execution'
import { Avatar, Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from '@/components/ui/popover'
import { ChevronRight, Icon, Terminal, Workflow } from '@/components/icons'
import { ExecutionFeed, type ExecutionView } from './execution-feed'
import { ExecutionRunInfo } from './execution-record'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ExecutionAvatarRail } from './ExecutionAvatarRail'
import { ExecutionReadingContext } from './useExecutionWindow'
import { ExecutionContentCache } from './execution-content-cache'
import { ExecutionMessageButton, type ExecutionMessageNavigation } from './execution-message-button'
import { ExecutionStopButton } from './execution-stop-button'

const labels: Record<AgentRun['status'], string> = { queued: '排队中', running: '执行中', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断', waiting_approval: '等待批准' }
export function TraceTab({ api, conversationId, messageId, agentId, active, snapshot, occurrenceId, runId, title, onNavigateMessage, stopAction, emptyContent, emptyMessage = '发送消息后，可在这里查看员工的执行过程。' }: {
  api: DesktopApi; conversationId: string; messageId?: string; agentId?: string; active: boolean; snapshot: Snapshot; busy?: boolean; onRetry?(id: string): void; onStop?(id: string): void
  occurrenceId?: string; runId?: string; title?: string; emptyMessage?: string; emptyContent?: ReactNode; onNavigateMessage?: ExecutionMessageNavigation; stopAction?: ReactNode
}) {
  const [views, setViews] = useState<Record<string, ExecutionView>>({})
  const [employee, setEmployee] = useState(agentId ?? ''), [items, setItems] = useState<ExecutionHistoryPage['items']>([]), [next, setNext] = useState<ExecutionHistoryPage['next']>()
  const [error, setError] = useState(''), [loaded, setLoaded] = useState(false), [open, setOpen] = useState<Record<string, boolean>>({})
  const historyScope = useRef(''), paged = useRef(false), caches = useRef(new Map<string, ExecutionContentCache>())
  const sourceRooms = useRef(new Set<string>())
  useEffect(() => { setEmployee(agentId ?? '') }, [agentId, messageId])
  useEffect(() => {
    if (!active) return
    let disposed = false, inFlight = false, again = false, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (inFlight) { again = true; return }
      inFlight = true
      try {
        const page: ExecutionHistoryPage = runId && agentId
          ? await api.request('getEmployeeExecution', { agentId, runId }).then(detail => {
            if (detail.run.conversationId !== conversationId) throw new Error('执行记录来源已变化')
            return { items: [{ run: detail.run, trigger: title || detail.conversationTitle }] }
          })
          : await api.request('listExecutionHistory', { conversationId, occurrenceId, agentId: employee || undefined })
        if (!disposed) {
          for (const item of page.items) sourceRooms.current.add(item.run.conversationId)
          setItems(previous => [...page.items, ...(paged.current ? previous.filter(item => !page.items.some(current => current.run.id === item.run.id) && (!employee || item.run.agentId === employee)) : [])]); if (!paged.current) setNext(page.next); setError(''); setLoaded(true)
          if (messageId) { const target = page.items.find(item => item.run.triggerMessageId === messageId || item.run.messageId === messageId); if (target) setOpen(previous => ({ ...previous, [target.run.id]: true })) }
        }
      } catch (error) { if (!disposed) { setError(errorText(error)); if (runId) { setItems([]); caches.current.clear(); setLoaded(true) } } }
      finally { inFlight = false; if (again && !disposed) { again = false; timer = setTimeout(() => void load(), 150) } }
    }
    const scope = `${conversationId}:${employee}:${occurrenceId ?? ''}:${runId ?? ''}`
    if (historyScope.current !== scope) { historyScope.current = scope; paged.current = false; sourceRooms.current.clear(); setItems([]); setNext(undefined); setLoaded(false) }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) { disposed = true; caches.current.clear(); setItems([]); setNext(undefined); setLoaded(true); return }
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && sourceRooms.current.has(event.conversationId)) { setItems(previous => previous.filter(item => item.run.conversationId !== event.conversationId)); caches.current.clear() }
      if (event.type === 'automation:history-deleted') { setItems(previous => previous.filter(item => item.run.origin?.occurrenceId !== event.occurrenceId)); caches.current.clear() }
      if (event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId || sourceRooms.current.has(event.conversationId)) && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 180)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, employee, active, messageId, occurrenceId, runId, agentId, title])
  const loadMore = async () => {
    try { paged.current = true; const scope = historyScope.current; const page = await api.request('listExecutionHistory', { conversationId, occurrenceId, agentId: employee || undefined, before: next }); if (scope !== historyScope.current) return; for (const item of page.items) sourceRooms.current.add(item.run.conversationId); setItems(previous => [...previous, ...page.items.filter(item => !previous.some(current => current.run.id === item.run.id))]); setNext(page.next) }
    catch (error) { setError(errorText(error)) }
  }
  const conversation = snapshot.conversations.find(value => value.id === conversationId)
  const members = (conversation?.agentIds ?? []).map(id => snapshot.agents.find(agent => agent.id === id)).filter((agent): agent is DigitalAgent => Boolean(agent))
  return <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden${runId ? ' automation-occurrence-panel' : ''}`}>
    {!occurrenceId && !runId && conversation?.kind === 'group' && <div data-slot="execution-employees" className="group-members shrink-0">
      <ExecutionAvatarRail members={members} items={[{ agentId: '', displayName: '总览', overview: true, statusLabel: '' }, ...members.map(agent => {
        const status = items.find(item => item.run.agentId === agent.id)?.run.status
        return { agentId: agent.id, displayName: agent.name, avatarRef: agent.avatar, color: agent.color, statusLabel: status ? labels[status] : '暂无执行' }
      })]} selectedAgentId={employee} revealRequest={messageId ? 1 : 0} active={active} onOpen={setEmployee} />
    </div>}
    <ScrollArea className="h-full min-h-0 min-w-0 flex-1 overflow-hidden" viewportProps={{ className: 'execution-history-body min-w-0', id: 'agent-execution-drawer', 'aria-label': '执行' }}>
    <div className="flex min-w-0 flex-col gap-4 p-4">
      {error && <Banner>{error}</Banner>}{!loaded && !error && <Loading />}
      {!occurrenceId && !runId && <p className="m-0 text-sm text-muted-foreground">执行历史</p>}
      {items.map(({ run, trigger }, index) => {
        const view = views[run.id] ?? 'rendered'
        const live = ['running', 'queued', 'waiting_approval'].includes(run.status)
        const expanded = open[run.id] ?? (live || index === 0)
        const agent = members.find(value => value.id === run.agentId), name = agent?.name ?? run.agentName
        if (!caches.current.has(run.id)) caches.current.set(run.id, new ExecutionContentCache())
        const cache = caches.current.get(run.id)!
        const opened = expanded || open[run.id] !== undefined
        return <Card key={run.id} size="sm" className="min-w-0 shrink-0 gap-0 p-0" data-execution-run-id={run.id}>
          <Collapsible open={expanded} onOpenChange={value => setOpen(previous => ({ ...previous, [run.id]: value }))}>
          <CardHeader className="flex min-w-0 flex-row items-center gap-2 p-2">
          <Popover>
            <PopoverTrigger openOnHover render={<Button variant="ghost" size="content" className="shrink-0 p-1" aria-label={`查看 ${name} 的资料`} />}>
              <Avatar small name={name} seed={run.agentId} avatar={agent?.avatar} color={agent?.color} />
            </PopoverTrigger>
            <PopoverContent align="start"><PopoverHeader><PopoverTitle>{name}</PopoverTitle><PopoverDescription>{agent?.role || '数字员工'}</PopoverDescription></PopoverHeader></PopoverContent>
          </Popover>
          <CollapsibleTrigger render={<Button variant="ghost" size="content" className="group/execution-heading flex h-[36px] min-w-0 flex-1 items-center gap-2 pl-1 text-left" />} aria-label={`${expanded ? '收起' : '展开'}执行：${trigger || name}`}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={trigger || name}>{trigger || name}</span>
            <span data-slot="execution-collapse-icon" className="flex size-[36px] shrink-0 items-center justify-center"><ChevronRight className="size-4 text-muted-foreground transition-transform group-aria-expanded/execution-heading:rotate-90" /></span>
          </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent keepMounted={opened}>
            {opened && <ExecutionRunContent api={api} run={run} active={active && expanded} cache={cache} view={view} live={live}
              onNavigateMessage={onNavigateMessage}
              stopAction={index === 0 ? stopAction : undefined} allowStop={!occurrenceId}
              onViewChange={value => setViews(previous => ({ ...previous, [run.id]: value }))} />}
          </CollapsibleContent>
          </Collapsible>
        </Card>
      })}
      {loaded && !items.length && (emptyContent ?? <p className="text-sm text-muted-foreground">{emptyMessage}</p>)}
      {next && <Button variant="secondary" size="sm" onClick={() => void loadMore()}>加载更早的执行</Button>}
    </div>
  </ScrollArea></div>
}

function ExecutionRunContent({ api, run, active, cache, view, live, onViewChange, onNavigateMessage, stopAction, allowStop }: {
  api: DesktopApi; run: AgentRun; active: boolean; cache: ExecutionContentCache; view: ExecutionView; live: boolean
  onViewChange(view: ExecutionView): void
  onNavigateMessage?: ExecutionMessageNavigation; stopAction?: ReactNode; allowStop: boolean
}) {
  const [following, setFollowing] = useState(true)
  const viewport = useRef<HTMLDivElement>(null)
  const transition = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), previousHeight = useRef<number | undefined>(undefined)
  useLayoutEffect(() => {
    const host = transition.current, body = content.current, from = previousHeight.current
    previousHeight.current = undefined
    if (!host || !body || from === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let animation: Animation | undefined, target = -1
    // Measure the natural inner layout; animate only its outer clip, not the scroll viewport.
    const resize = () => {
      const height = body.getBoundingClientRect().height
      if (Math.abs(height - target) < 0.5) return
      const start = animation ? host.getBoundingClientRect().height : from
      animation?.cancel()
      target = height
      if (Math.abs(start - height) < 0.5) { observer.disconnect(); return }
      animation = host.animate([{ height: `${start}px` }, { height: `${height}px` }], { duration: 180, easing: 'ease' })
      animation.onfinish = () => { observer.disconnect(); animation = undefined }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(body)
    resize()
    return () => { observer.disconnect(); animation?.cancel() }
  }, [view])
  const setReading = useCallback((value: boolean) => setFollowing(value), [])
  const markReading = (host: HTMLElement) => { host.dataset.executionReadingIntent = String(performance.now()) }
  return <ExecutionReadingContext value={setReading}><div ref={transition} className="min-w-0 overflow-hidden"><CardContent ref={content} className="soft-divider-top min-w-0 p-0">
    <div data-slot="execution-content-toolbar" className="flex min-w-0 items-center justify-between gap-3 px-3 py-1 text-muted-foreground">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {!isNativeBackend(run.backend) && run.usage?.totalTokens !== undefined && <span title={`${run.usage.totalTokens.toLocaleString()} tokens`}>{Intl.NumberFormat('en', { notation: 'compact' }).format(run.usage.totalTokens)} tokens</span>}
        <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString('zh-CN')}>{new Date(run.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
        {run.phase && run.phase !== 'execution' && <span>{{ decision: '判断阶段', coordination: '协调阶段', memory: '记忆整理阶段' }[run.phase]}</span>}
        <span className="flex items-center gap-1"><Icon name={run.status === 'running' ? 'LoaderCircle' : run.status === 'completed' ? 'CircleCheck' : run.status === 'failed' ? 'OctagonX' : 'Clock'} className={run.status === 'running' ? 'size-3.5 animate-spin' : 'size-3.5'} />{labels[run.status]}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
      {stopAction}
      {allowStop && live && <ExecutionStopButton key={run.id} api={api} run={run} active={active} compact />}
      {onNavigateMessage && <ExecutionMessageButton api={api} run={run} active={active} onNavigate={onNavigateMessage} />}
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={view === 'rendered' ? '显示原生记录' : '显示过程视图'} onClick={() => {
        previousHeight.current = transition.current?.getBoundingClientRect().height
        setFollowing(false)
        if (viewport.current) {
          markReading(viewport.current)
          delete viewport.current.dataset.executionAnchorKey
          delete viewport.current.dataset.executionAnchorRun
        }
        onViewChange(view === 'rendered' ? 'raw' : 'rendered')
      }} />}>{view === 'rendered' ? <Terminal /> : <Workflow />}</TooltipTrigger><TooltipContent>{view === 'rendered' ? '显示原生记录' : '显示过程视图'}</TooltipContent></Tooltip>
      </div>
    </div>
    <Separator />
    <ScrollArea className="max-h-[min(60vh,600px)] min-w-0" onPointerDownCapture={event => {
      if (!(event.target as Element).closest('[data-slot="scroll-area-scrollbar"]') || !viewport.current) return
      markReading(viewport.current); setFollowing(false)
    }} viewportProps={{
      ref: viewport, className: 'execution-drawer-body h-auto max-h-[min(60vh,600px)] min-w-0 overscroll-contain', 'aria-label': `${run.agentName}的执行内容`,
      'data-following-latest': following ? 'true' : 'false', 'data-latest-execution-run': run.id,
      onWheel: event => { markReading(event.currentTarget); if (event.deltaY < 0) setFollowing(false) },
      onKeyDown: event => { markReading(event.currentTarget); if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) setFollowing(false) },
      onTouchMove: event => { markReading(event.currentTarget); setFollowing(false) },
    }}>
      <div className="min-w-0 p-3">
        <ExecutionFeed api={api} run={run} active={active} cache={cache} view={view} />
        {view === 'raw' && <ExecutionRunInfo run={run} />}
      </div>
    </ScrollArea>
  </CardContent></div></ExecutionReadingContext>
}
