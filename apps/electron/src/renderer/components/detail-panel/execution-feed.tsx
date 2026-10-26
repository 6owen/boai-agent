/*
 * [OUTPUT]: 空过程按queued明确展示等待其他任务释放执行资源，running才等待员工输出。
 * [OUTPUT]: 操作/加载/校验错误统一Sonner，页面不插入报错DOM；重试/核对等操作保持独立可用。
 * [OUTPUT]: 返回思考使用Beautiful UI ThinkingState；仅最新思考事件在运行时标为思考中，聊天加载由外层统一呈现。
 * [OUTPUT]: 聊天卡复用执行流并隐藏协议记录；模型返回的思考独立折叠，不混入最终答案。
 * [INPUT]: 直接迁入的Rovai执行呈现/分组/可变高度列表、BOAI分页IPC与现有UI。
 * [OUTPUT]: 过程中的整轮/工具文件差异复用全局Pierre DiffPreview；步骤组缓存恢复后React状态驱动折叠，原生记录/窗口/批准保持。
 * [POS]: 执行内容接线，外观统一使用BOAI现有组件；不处理模型权限或重新调度。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useEffect, useMemo, useState, useRef, useContext } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { AgentRun } from '@boai/shared/domain'
import type { ExecutionEvidence, NativeAction } from '@boai/shared/domain/execution'
import { buildLiveExecutionProgress, executionStepPublicTitle, type ExecutionStep } from '@boai/shared/rovai'
import { groupConsecutiveToolItems, toolActivityGroupPresentation, type GroupedExecutionProgressItem } from '@boai/shared/rovai/tool-grouping'
import { Banner, errorText } from '@/components/common'
import { MarkdownContent } from '@/components/common/markdown'
import { DiffPreview } from '@/components/common/file-preview/diff-preview'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ToolChip, ToolChips } from '@/components/ui/tool-chips'
import { CodeBlock } from '@/components/ui/code-block'
import { Input } from '@/components/ui/input'
import { ThinkingState } from '@/components/ui/thinking-state'
import { Check, LoaderCircle, Terminal, FileText, Pencil, Search, Settings, X, Clock } from '@/components/icons'
import { cn } from 'cn'
import { ExecutionContentContext, ExecutionVirtualList, useExecutionRetainedState } from './ExecutionVirtualList'
import { ExecutionContentCache } from './execution-content-cache'
import { readExecutionEvidence } from './execution-content'
import { ExecutionNarration } from './ExecutionNarration'
import { handleToolResultKeyDown, ToolCallDetail } from './ExecutionToolGroup'
import { useExecutionWindow } from './useExecutionWindow'
import { executionWindowClient } from './execution-window-client'
import { ExecutionRawRecord, ExecutionRecordFields } from './execution-record'

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const pretty = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
// Connection/lifecycle records remain readable, without breaking the agent's sequence of work.
const connectionEvent = (event: ExecutionEvidence) => event.eventType === 'runtime.native' && ['mcpServer/startupStatus/updated', 'mcpServer/startupStatus/completed', 'remoteControl/status/changed', 'account/updated', 'thread/goal/cleared', 'status'].includes(String(object(event.payload).method))
const statusLabel = { running: '执行中', completed: '已完成', failed: '失败', waiting: '等待中', stopped: '已停止', skipped: '已跳过', recorded: '已记录' }


function ToolRow({ step, evidence, run }: { step: ExecutionStep; evidence: ExecutionEvidence[]; run: AgentRun }) {
  const toggle = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useExecutionRetainedState(`tool:${run.id}:${step.id}`, false)
  const raw = evidence.find(event => event.canonical?.operationId === step.id), payload = object(raw?.payload), item = object(payload.item)
  const status = ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && ['running', 'waiting'].includes(step.status) ? 'stopped' : step.status
  const input = item.arguments ?? item.input ?? (item.command ? { command: item.command, cwd: item.cwd } : undefined)
  const result = item.aggregatedOutput ?? item.output ?? item.result ?? payload.result
  const title = executionStepPublicTitle(step)
  const label = step.fileOperation ? (step.fileOperation.operationKind === 'read' ? '读取' : '写入') : step.publicCommand ? '运行' : undefined
  const icon = step.iconKind === 'file-write' ? Pencil : ['file', 'file-read'].includes(step.iconKind) ? FileText : step.iconKind === 'web' ? Search : step.iconKind === 'runtime' ? Settings : Terminal
  return <ToolChip open={expanded} onOpenChange={setExpanded} triggerRef={toggle} title={`${title} · ${statusLabel[status]}`} label={label} chip={title} mono={Boolean(step.publicCommand || step.fileOperation)} icon={icon}
    status={<span className={cn('ml-auto flex shrink-0 items-center', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')} role="img" aria-label={statusLabel[status]} title={statusLabel[status]}>
        {status === 'running' ? <LoaderCircle className="size-3 animate-spin" /> : status === 'completed' ? <Check className="size-3" /> : status === 'failed' ? <X className="size-3" /> : <Clock className="size-3" />}
      </span>}>
      <p className="m-0 break-all">{title}</p>
      {raw?.parentId && <p className="m-0 break-all text-xs text-muted-foreground">子执行 · {raw.parentId}</p>}
      {input !== undefined && <section className="flex min-w-0 flex-col gap-1.5"><div className="text-xs font-medium text-muted-foreground">参数</div><ToolCallDetail detail={pretty(input)} expanded={expanded} resultKey={`${run.id}:${step.id}:input`} title={title} summaryRef={toggle} inputOnly /></section>}
      {(result !== undefined || step.detail) && <section className="flex min-w-0 flex-col gap-1.5"><div className="text-xs font-medium text-muted-foreground">结果</div><ToolCallDetail detail={result === undefined ? step.detail : pretty(result)} expanded={expanded} resultKey={`${run.id}:${step.id}:result`} title={title} summaryRef={toggle} />{item.exitCode != null && <div className="text-xs text-muted-foreground">退出码 {String(item.exitCode)}</div>}</section>}
      {step.fileChanges?.map((change, index) => <DiffPreview key={`${change.path}:${index}`} diff={change.diff} path={change.path} changeKind={change.changeKind} onKeyDown={event => { if (event.key === 'Escape') handleToolResultKeyDown(event, toggle.current) }} />)}
  </ToolChip>
}

function ExecutionItem({ item, evidence, run }: { item: GroupedExecutionProgressItem; evidence: ExecutionEvidence[]; run: AgentRun }) {
  const live = ['running', 'queued', 'waiting_approval'].includes(run.status)
  const retained = useContext(ExecutionContentContext)
  const groupKeys = item.kind === 'toolGroup' ? item.items.map(value => `${run.id}:${value.key}`) : [`${run.id}:${item.key}`]
  const [expanded, setLocalExpanded] = useState(() => {
    const saved = groupKeys.map(key => retained?.get<boolean>(`group:${key}`)).filter(value => value !== undefined)
    return saved.length ? saved.some(Boolean) : live
  })
  const setExpanded = (value: boolean) => { setLocalExpanded(value); for (const key of groupKeys) retained?.set(`group:${key}`, value) }
  if (item.kind === 'narration') return <ExecutionNarration preview={item.body} />
  if (item.kind === 'tool') return <ToolRow step={item.step} evidence={evidence} run={run} />
  if (item.kind === 'toolGroup') {
    const presentation = toolActivityGroupPresentation(item.items, run.status === 'completed' ? 'succeeded' : run.status === 'waiting_approval' ? 'waiting' : run.status === 'interrupted' ? 'cancelled' : run.status, live)
    return <ToolChips open={expanded} onOpenChange={setExpanded} title={`${presentation.primary}${presentation.currentTitle ? ` · ${presentation.currentTitle}` : ''}`}>
      {item.items.map(value => <ToolRow key={value.key} step={value.step} evidence={evidence} run={run} />)}
    </ToolChips>
  }
  if (item.kind === 'plan') return <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed">{item.explanation && <MarkdownContent size="compact">{item.explanation}</MarkdownContent>}<ul className="m-0 flex list-none flex-col gap-1.5 p-0">{item.plan.map((step, index) => <li key={index} className="flex items-start gap-2">{step.status === 'completed' ? <Check className="mt-0.5 size-4 shrink-0" /> : step.status === 'inProgress' ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : <span className="mt-1 size-3 shrink-0 rounded-full border border-border" />}<span className="min-w-0 break-words">{step.step}</span></li>)}</ul></div>
  if (item.kind === 'compaction') return <p className="m-0 text-xs text-muted-foreground">{item.compaction.phase === 'completed' ? '上下文整理完成' : '正在整理上下文'}</p>
  if (item.kind === 'diagnostic') return <p className="m-0 text-xs text-muted-foreground">运行时正在重试 · {item.diagnostic.attempt}/{item.diagnostic.maxAttempts}</p>
  return null
}

function ReasoningRow({ api, run, event, working, active }: { api: DesktopApi; run: AgentRun; event: ExecutionEvidence; working: boolean; active: boolean }) {
  const [open, setOpen] = useExecutionRetainedState(`reasoning:${run.id}:${event.id}`, true)
  return <ThinkingState open={open} onOpenChange={setOpen} working={working} active={active}>
    <ExecutionNarration api={api} run={run} evidence={event.deferred ? event : undefined} preview={String(object(event.payload).text ?? '')} />
  </ThinkingState>
}

function EvidenceRow({ api, event, events, run, active, working, read }: { api: DesktopApi; event: ExecutionEvidence; events: ExecutionEvidence[]; run: AgentRun; active: boolean; working: boolean; read(event: ExecutionEvidence): Promise<void> }) {
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useExecutionRetainedState(`event:${run.id}:${event.id}`, false)
  useEffect(() => { if (event.deferred && !['agent.text.block', 'agent.reasoning.block'].includes(event.eventType)) void read(event) }, [event.id, event.revision, event.deferred, retry])
  if (event.eventType === 'agent.reasoning.block') return <ReasoningRow api={api} run={run} event={event} working={working} active={active} />
  if (event.deferred && event.eventType === 'agent.text.block') return <ExecutionNarration api={api} run={run} evidence={event} preview="" />
  if (event.deferred) return <Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>读取完整执行内容 · {Math.ceil(event.contentLength / 1024)} KB</Button>
  const progress = groupConsecutiveToolItems(buildLiveExecutionProgress([event], run.id, { textMode: 'complete', includePublicResults: true }).items)
  const parent = event.parentId ? events.find(value => value.canonical?.operationId === event.parentId) : undefined
  const payload = object(event.payload)
  const diff = payload.method === 'turn/diff/updated' ? object(payload.params).diff : undefined
  const title = typeof diff === 'string' ? '本轮文件差异' : String(payload.method ?? event.canonical?.presentationHint ?? event.eventType)
  return <div className={event.parentId ? 'ml-3 border-l border-border pl-3' : 'min-w-0'}>
    {event.parentId && <p className="m-0 mb-2 break-all text-xs text-muted-foreground">子执行 · {String(object(object(parent?.payload).item).name ?? object(object(parent?.payload).item).tool ?? event.parentId)}</p>}
    {progress.length ? progress.map(item => <ExecutionItem key={item.key} item={item} evidence={events} run={run} />) : <ToolChip title={title} chip={title} icon={typeof diff === 'string' ? FileText : Settings} open={expanded} onOpenChange={setExpanded}>
      {typeof diff === 'string' ? <DiffPreview diff={diff} /> : <ExecutionRecordFields value={event.payload} />}
    </ToolChip>}
  </div>
}

function NativeRequest({ action, api, run, view }: { action: NativeAction; api: DesktopApi; run: AgentRun; view: ExecutionView }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const respond = async (option?: string) => {
    setBusy(true); setError('')
    try { await api.request('respondNativeAction', { conversationId: run.conversationId, runId: run.id, actionId: action.id, response: { option, answers } }) }
    catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  return <Card size="sm" className="min-w-0" aria-label="原生执行请求"><CardHeader><CardTitle className="break-words">{action.title}</CardTitle></CardHeader><CardContent className="flex min-w-0 flex-col gap-3">
    <ToolChip title="查看完整请求" label="请求" chip={action.title} open={expanded} onOpenChange={setExpanded} triggerRef={trigger}>{view === 'raw' ? <CodeBlock code={pretty(action.detail)} language={typeof action.detail === 'string' ? undefined : 'json'} density="compact" className="max-h-80" tabIndex={0} aria-label="完整原生请求" onKeyDown={event => handleToolResultKeyDown(event, trigger.current)} /> : <ExecutionRecordFields value={action.detail} />}</ToolChip>
    {action.questions?.map(question => <label key={question.id} className="flex flex-col gap-2 text-sm">{question.question}<Input type={question.isSecret ? 'password' : 'text'} value={answers[question.id]?.[0] ?? ''} onChange={event => setAnswers({ ...answers, [question.id]: [event.target.value] })} />{question.options && <div className="flex flex-wrap gap-2">{question.options.map(option => <Button key={option.label} variant="outline" size="sm" onClick={() => setAnswers({ ...answers, [question.id]: [option.label] })} title={option.description}>{option.label}</Button>)}</div>}</label>)}
    <div className="flex flex-wrap gap-2">{action.options.map(option => <Button key={option.id} size="sm" variant="secondary" disabled={busy} onClick={() => void respond(option.id)}>{option.label}</Button>)}{action.kind === 'input' && <Button size="sm" disabled={busy} onClick={() => void respond()}>回复</Button>}</div>{error && <Banner>{error}</Banner>}
  </CardContent></Card>
}

export type ExecutionView = 'rendered' | 'raw'

export function ExecutionFeed({ api, run, active, cache, view = 'rendered', presentation = 'detail' }: { api: DesktopApi; run: AgentRun; active: boolean; cache: ExecutionContentCache; view?: ExecutionView; presentation?: 'detail' | 'chat' }) {
  const [events, setEvents] = useState<ExecutionEvidence[]>([]), [actions, setActions] = useState<NativeAction[]>([]), [error, setError] = useState(''), [revision, changed] = useState(0)
  const window = useExecutionWindow(executionWindowClient(api), active, run.conversationId, { id: run.id, executionEpoch: 1, updatedAt: run.finishedAt ?? run.createdAt, executionEvidenceChangeSequence: revision, status: run.status === 'completed' ? 'succeeded' : run.status === 'waiting_approval' ? 'waiting' : run.status === 'interrupted' ? 'cancelled' : run.status }, revision, events)
  useEffect(() => {
    if (active && !window.loading) setEvents((window.evidence as unknown as ExecutionEvidence[]).map(event => cache.get<ExecutionEvidence>(`${event.id}:${event.revision}`) ?? event))
  }, [window.evidence, window.loading, active, cache])
  useEffect(() => {
    if (!active) return
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try { const requests = await api.request('listNativeActions', { conversationId: run.conversationId, runId: run.id }); if (!disposed) setActions(requests.filter(action => action.status === 'pending')) }
      catch (error) { if (!disposed) setError(errorText(error)) }
    }
    void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === run.conversationId) { disposed = true; setEvents([]); setActions([]); return }
      if (event.type === 'changed' && event.conversationId === run.conversationId && !timer) timer = setTimeout(() => { timer = undefined; if (!disposed) { changed(value => value + 1); void load() } }, 150)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, run.id, active, cache])
  const processEvents = useMemo(() => events.filter(event => !connectionEvent(event)), [events])
  const progress = useMemo(() => {
    const result: (GroupedExecutionProgressItem | { key: string; kind: 'evidence'; evidence: ExecutionEvidence })[] = []
    let pending: Parameters<typeof groupConsecutiveToolItems>[0] = []
    const flush = () => { result.push(...groupConsecutiveToolItems(pending)); pending = [] }
    for (const event of processEvents) {
      if (presentation === 'chat' && !event.deferred && event.eventType !== 'agent.reasoning.block' && !buildLiveExecutionProgress([event], run.id, { textMode: 'complete', includePublicResults: true }).items.length) continue
      const items = event.deferred ? [] : buildLiveExecutionProgress([event], run.id, { textMode: 'complete', includePublicResults: true }).items
      if (!items.length || event.parentId) {
        flush()
        result.push({ key: `evidence:${event.id}`, kind: 'evidence', evidence: event })
      } else pending.push(...items)
    }
    flush(); return result
  }, [processEvents, run.id, presentation])
  const rawRecords = useMemo(() => events.map(event => ({ key: `raw:${event.id}`, evidence: event })), [events])
  const read = async (event: ExecutionEvidence) => {
    try { const full = await cache.load(`${event.id}:${event.revision}`, () => readExecutionEvidence(api, run, event)); setEvents(previous => previous.map(value => value.id === event.id && value.revision === event.revision ? full : value)) }
    catch (error) { setError(errorText(error)) }
  }
  return <ExecutionContentContext value={cache}><div ref={window.root} className="flex min-w-0 flex-col gap-4" data-execution-view={view}>
    {window.error && <><Banner>{window.error}</Banner><Button variant="link" size="sm" onClick={() => void window.move('retry')}>重试</Button></>}
    {error && <Banner>{error}</Banner>}
    {presentation === 'detail' && actions.map(action => action.kind === 'input' && !action.questions?.some(question => question.isSecret) ? <p key={action.id} className="m-0 text-sm text-muted-foreground">等待你的回复，可直接在聊天中回答。</p> : <NativeRequest key={action.id} action={action} api={api} run={run} view={view} />)}
    {view === 'raw' ? <ExecutionVirtualList key="raw" items={rawRecords} enabled={active} gap={8}>{item => <div key={item.key} data-execution-item-key={item.key}><ExecutionRawRecord event={item.evidence} read={read} /></div>}</ExecutionVirtualList>
    : <ExecutionVirtualList key="rendered" items={progress} enabled={active} gap={8}>{item => <div key={item.key} data-execution-item-key={item.key}>{item.kind === 'evidence'
      ? <EvidenceRow api={api} event={item.evidence} events={events} run={run} active={active} working={run.status === 'running' && processEvents.at(-1)?.id === item.evidence.id} read={read} />
      : <ExecutionItem item={item} evidence={events} run={run} />}</div>}</ExecutionVirtualList>}
    {presentation === 'detail' && !events.length && !error && <p className="m-0 text-sm text-muted-foreground">{run.status === 'queued' ? '等待其他任务释放执行资源…' : run.status === 'running' ? '等待员工输出…' : '这次历史执行没有保存原生过程。'}</p>}
    {run.error && <details className="text-xs text-muted-foreground"><summary>错误详情</summary><pre className="whitespace-pre-wrap break-words">{run.error}</pre></details>}
  </div></ExecutionContentContext>
}
