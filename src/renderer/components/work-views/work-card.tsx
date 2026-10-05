/*
 * [INPUT]: 宿主核对的Work行、实际员工快照、真实审批/运行身份及固定来源解析接口。
 * [OUTPUT]: 会话/全局/员工共用自然高度不收缩的只读工作卡；按查询/Work身份保留详情与子展开，原请求/问题/结果/待审批卡分别精确导航，可信自动化显示原计划并回查具体触发，父子与结果依赖分开，不改业务状态。
 * [POS]: 工作视图的最小业务卡片，子工作仍沿同一有界宿主查询。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AutomationOrigin, Snapshot } from '@shared/domain'
import type { DesktopApi } from '@shared/ipc'
import type { WorkViewItem, WorkViewPage, WorkViewTarget, WorkViewTargetInput } from '@shared/domain/work-views'
import { Avatar, Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePagedQuery } from './use-paged-query'
import { workApprovalTargetMatches, workStateLabels } from './model'
import { rememberedWorkCard, rememberWorkCard, rememberedWorkSelection, rememberWorkSelection, type WorkCardViewState } from './view-state'

export interface WorkCardProps { api: DesktopApi; item: WorkViewItem; snapshot?: Snapshot; active: boolean; compact?: boolean; onNavigate(target: WorkViewTarget, current?: () => boolean): void; onInspect?(item: WorkViewItem): void; onAutomation?(origin: AutomationOrigin, current?: () => boolean, conversationId?: string): void; ancestors?: string[]; viewKey?: string; selected?: boolean; onSelect?(): void }
export function WorkCard({ api, item, snapshot, active, compact, onNavigate, onInspect, onAutomation, ancestors = [], viewKey = 'standalone', selected, onSelect }: WorkCardProps) {
  const work = item.work, owner = snapshot?.agents.find(agent => agent.id === work.ownerAgentId)
  const [error, setError] = useState(''), [opening, setOpening] = useState('')
  const stateKey = JSON.stringify([viewKey, work.id]), [localView, setLocalView] = useState(() => ({ key: stateKey, state: rememberedWorkCard(viewKey, work.id) }))
  const view = localView.key === stateKey ? localView.state : rememberedWorkCard(viewKey, work.id)
  const changeView = (patch: Partial<WorkCardViewState>) => { const next = { ...rememberedWorkCard(viewKey, work.id), ...patch }; rememberWorkCard(viewKey, work.id, next); setLocalView({ key: stateKey, state: next }); onSelect?.() }
  const generation = useRef(0), current = useRef({ active, item }); current.current = { active, item }
  useEffect(() => { current.current.active = active; setOpening(''); setError(''); return () => { current.current.active = false; generation.current++ } }, [active, work.id])
  const navigate = async (input: WorkViewTargetInput) => {
    const token = ++generation.current, id = work.id; setOpening(JSON.stringify(input)); setError('')
    const visible = () => current.current.active && current.current.item.work.id === id && generation.current === token && (input.kind !== 'approval' || workApprovalTargetMatches(current.current.item, input))
    try {
      const target = await api.request('resolveWorkViewTarget', input)
      if (!visible()) return
      if (input.kind === 'approval' && !workApprovalTargetMatches(current.current.item, input, target)) throw new Error('原审批身份已变化，请重新读取工作。')
      onNavigate(target, visible)
    } catch (cause) { if (visible()) setError(errorText(cause)) }
    finally { if (generation.current === token) setOpening('') }
  }
  const origin = item.source === 'automation' && work.origin?.kind === 'automation' ? work.origin : undefined
  const openAutomation = async () => {
    if (!origin || !onAutomation || !active || !item.sourceAvailable) return
    const token = ++generation.current, source = JSON.stringify(origin), visible = () => current.current.active && current.current.item.source === 'automation' && current.current.item.sourceAvailable && current.current.item.work.id === work.id && current.current.item.work.sourceMessageId === work.sourceMessageId && generation.current === token && JSON.stringify(current.current.item.work.origin) === source
    setOpening('automation'); setError('')
    try { const target = await api.request('resolveWorkViewTarget', { workId: work.id, kind: 'source' }); if (!visible()) return; if (target.workId !== work.id || target.conversationId !== work.conversationId) throw new Error('原工作来源已变化，请重新读取。'); onAutomation(origin, visible, work.conversationId) }
    catch (cause) { if (visible()) setError(errorText(cause)) }
    finally { if (generation.current === token) setOpening('') }
  }
  const source = item.source === 'automation' ? `定时触发 · ${origin?.name || '计划名称未知'}` : item.source === 'ordinary' ? '普通工作' : '来源未知'
  return <Card size="sm" className={selected ? 'shrink-0 gap-3 bg-muted/60' : 'shrink-0 gap-3'} data-work-id={work.id} data-selected={selected ? 'true' : undefined} aria-current={selected ? 'true' : undefined} onClick={event => { if (event.target instanceof Element && event.target.closest('[data-work-id]') === event.currentTarget) onSelect?.() }} onFocusCapture={event => { if (event.target instanceof Element && event.target.closest('[data-work-id]') === event.currentTarget) onSelect?.() }}>
    <CardHeader><div className="flex min-w-0 items-start justify-between gap-2"><CardTitle className="min-w-0 break-words">{work.deliverable}</CardTitle><span className="shrink-0 text-xs text-muted-foreground">{workStateLabels[work.status]}</span></div></CardHeader>
    <CardContent className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm"><Avatar name={owner?.name ?? item.ownerName ?? '负责人未知'} seed={work.ownerAgentId} avatar={owner?.avatar} color={owner?.color} small /><span className="truncate">{owner?.name ?? item.ownerName ?? '负责人未知'}</span>{work.parentWorkId && <span className="text-xs text-muted-foreground">子工作</span>}</div>
      {(!compact || origin) && <p className="m-0 break-words text-xs text-muted-foreground">{item.conversationTitle} · {source} · {new Date(work.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      {(work.status === 'waiting' || work.status === 'blocked' || work.status === 'failed' || work.status === 'interrupted') && <p className="m-0 break-words text-sm text-muted-foreground">{work.nextStep || work.outcome?.summary || '原因未记录，请查看原聊天。'}</p>}
      {!!item.approvalTargets?.length && <p role="status" className="m-0 text-sm text-muted-foreground">待审批，请在原聊天查看请求并处理。</p>}
      {!item.sourceAvailable && <p role="status" className="m-0 text-xs text-muted-foreground">原请求消息不可定位。</p>}
      <details className="text-sm" open={view.details} onToggle={event => { if (event.currentTarget.open !== view.details) changeView({ details: event.currentTarget.open }) }}><summary className="cursor-pointer text-muted-foreground">工作详情</summary><div className="mt-2 flex flex-col gap-2">
        {work.outcome?.summary && <p className="m-0 whitespace-pre-wrap break-words">{work.outcome.summary}</p>}
        {work.nextStep && <p className="m-0 whitespace-pre-wrap break-words">接续：{work.nextStep}</p>}
        {work.parentWorkId && <p className="m-0 text-xs text-muted-foreground">属于真实父工作；依赖关系单独列在下方。</p>}
        {!!work.requiredResults.length && <div><p className="m-0 text-muted-foreground">等待 {work.requiredResults.length} 项工作结果</p>{work.requiredResults.map(result => <Button key={result.workId} size="sm" variant="link" disabled={Boolean(opening) || !active} onClick={() => void navigate({ workId: result.workId, kind: 'result' })}>查看依赖结果 · 第 {result.resultVersion} 版起</Button>)}</div>}
        {work.status === 'delivered' && <p className="m-0 text-xs text-muted-foreground">已交付是工作记录；采用及人工效果评价以原成果记录为准。</p>}
        {onInspect && <Button size="sm" variant="ghost" onClick={() => onInspect(item)}>查看完整记录</Button>}
      </div></details>
      <div className="flex flex-wrap gap-1">
        <Button variant="secondary" size="sm" disabled={!item.sourceAvailable || Boolean(opening) || !active} onClick={() => void navigate({ workId: work.id, kind: 'source' })}>查看原聊天</Button>
        {origin && onAutomation && <Button variant="ghost" size="sm" disabled={!item.sourceAvailable || Boolean(opening) || !active} onClick={() => void openAutomation()}>查看本次触发</Button>}
        {item.approvalTargets?.map((approval, index) => <Button key={approval.approvalId} variant="secondary" size="sm" disabled={Boolean(opening) || !active} onClick={() => void navigate({ workId: work.id, kind: 'approval', approvalId: approval.approvalId, runId: approval.runId, messageId: approval.messageId })}>查看原审批{item.approvalTargets!.length > 1 ? ` ${index + 1}` : ''}</Button>)}
        {work.userQuestion && <Button variant="ghost" size="sm" disabled={Boolean(opening) || !active} onClick={() => void navigate({ workId: work.id, kind: 'question' })}>查看问题</Button>}
        {item.resultMessageIds.map((messageId, index) => <Button key={messageId} variant="ghost" size="sm" disabled={Boolean(opening) || !active} onClick={() => void navigate({ workId: work.id, kind: 'result', messageId })}>{item.resultMessageIds.length > 1 ? `结果 ${index + 1}` : '查看结果'}</Button>)}
        {work.artifactIds.map((artifactId, index) => <Button key={artifactId} variant="ghost" size="sm" disabled={Boolean(opening) || !active} onClick={() => void navigate({ workId: work.id, kind: 'result', artifactId })}>交付文件{work.artifactIds.length > 1 ? ` ${index + 1}` : ''}</Button>)}
      </div>
      {opening && <Loading>正在核对来源…</Loading>}{error && <Banner>{error}</Banner>}
      {item.childCount > 0 && <Button size="sm" variant="ghost" className="self-start" aria-expanded={view.children} onClick={() => changeView({ children: !view.children })}>{view.children ? '收起' : '展开'}子工作 · {item.childCount}</Button>}
      {view.children && (ancestors.includes(work.id) ? <p className="m-0 text-xs text-muted-foreground">历史父子关系存在循环，停止展开。</p> : <ChildWorks {...{ api, snapshot, active, onNavigate, onInspect, onAutomation, viewKey }} parentId={work.id} conversationId={work.conversationId} ancestors={[...ancestors, work.id]} />)}
    </CardContent>
  </Card>
}
function ChildWorks({ parentId, conversationId, ancestors, ...props }: Omit<WorkCardProps, 'item'> & { parentId: string; conversationId: string; ancestors: string[] }) {
  const query = { conversationId, parentWorkId: parentId, limit: 30 }
  const key = JSON.stringify([props.viewKey, 'children', query]), [selection, setSelection] = useState(() => ({ key, id: rememberedWorkSelection(key) }))
  const { page, loading, error, loadMore, reload } = usePagedQuery<WorkViewItem, string, WorkViewPage>({ api: props.api, active: props.active, queryKey: key, conversationId, read: cursor => props.api.request('queryWorkViews', { ...query, cursor }), identity: item => item.work.id })
  return <div className="flex flex-col gap-3 border-l pl-3" aria-label="真实子工作">
    {page?.items.map(item => <WorkCard key={item.work.id} {...props} item={item} viewKey={key} selected={(selection.key === key ? selection.id : rememberedWorkSelection(key)) === item.work.id} onSelect={() => { rememberWorkSelection(key, item.work.id); setSelection({ key, id: item.work.id }) }} ancestors={ancestors} compact />)}
    {loading && <Loading />}{error && <Banner>{error}<Button variant="ghost" size="sm" onClick={reload}>重新读取</Button></Banner>}
    {page?.nextCursor && <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadMore()}>加载更多子工作</Button>}
  </div>
}
