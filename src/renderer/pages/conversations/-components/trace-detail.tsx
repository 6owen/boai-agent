/*
 * [INPUT]: 同一轮次的原生 Span、运行记录和员工筛选。
 * [OUTPUT]: 可折叠调用树、相对时间线及锚定节点的浮层输入输出详情；未结束节点保留真实状态。
 * [POS]: 会话执行过程视图；不将 Span 完成解释为业务交付。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useState } from 'react'
import type { AgentRun } from '@shared/domain'
import type { StoredTraceSpan } from '@shared/domain/traces'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDownIcon, X } from '@/components/icons'

const phaseLabels: Record<string, string> = { decision: '参与判断', execution: '回复与执行', memory: '记忆整理', report: '整理汇报' }
const typeLabels: Record<string, string> = { agent_run: '员工运行', model_generation: '模型调用', model_step: '模型步骤', model_inference: '模型推理', tool_call: '工具调用', generic: '请求数据' }
const duration = (ms: number) => ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`

export function TraceDetail({ spans, runs }: { spans: StoredTraceSpan[]; runs: AgentRun[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [selectedId, setSelectedId] = useState<string>()
  const start = Math.min(...spans.map(span => Date.parse(span.startedAt)))
  const end = Math.max(...spans.map(span => Date.parse(span.endedAt ?? runs.find(run => run.id === span.runId)?.finishedAt ?? span.startedAt)))
  const total = Math.max(1, end - start)
  const sorted = [...spans].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  const keys = new Set(spans.map(span => span.id)), children = new Map<string, StoredTraceSpan[]>()
  for (const span of sorted) {
    const parent = span.parentSpanId ? `${span.traceId}:${span.parentSpanId}` : ''
    const key = keys.has(parent) ? parent : ''
    children.set(key, [...(children.get(key) ?? []), span])
  }
  const rows = (span: StoredTraceSpan, depth: number): React.ReactNode => {
    const nested = children.get(span.id) ?? [], run = runs.find(run => run.id === span.runId)
    const elapsed = span.endedAt ? Date.parse(span.endedAt) - Date.parse(span.startedAt) : undefined
    const stopped = run && ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)
    return <div key={span.id}>
      <div className="trace-row" data-selected={selectedId === span.id} style={{ paddingLeft: Math.min(depth, 6) * 12 }}>
        <Button variant="ghost" size="icon-sm" className="trace-toggle" disabled={!nested.length} aria-label={`${collapsed.has(span.id) ? '展开' : '收起'} ${span.name}`} aria-expanded={nested.length ? !collapsed.has(span.id) : undefined} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(span.id)) next.delete(span.id); else next.add(span.id); return next })}>{nested.length ? collapsed.has(span.id) ? <ChevronRight size={12} /> : <ChevronDownIcon /> : <span className={`status-dot ${span.error ? 'failed' : span.endedAt ? 'completed' : 'running'}`} />}</Button>
        <Popover open={selectedId === span.id} onOpenChange={open => setSelectedId(open ? span.id : undefined)}><PopoverTrigger render={<Button variant="ghost" size="content" className="trace-node" aria-label={`查看节点 ${span.name}`} />}>
          <span className="trace-node-name" title={span.name}>{depth === 0 && run ? `${run.agentName} · ${phaseLabels[run.phase ?? 'execution'] ?? run.phase}` : span.name}<small>{typeLabels[span.spanType] ?? span.spanType}</small></span>
          <span className="trace-bar-track" aria-hidden="true"><span className={`trace-bar${span.error ? ' is-error' : ''}`} style={{ left: `${Math.min(100, Math.max(0, (Date.parse(span.startedAt) - start) / total * 100))}%`, width: `${Math.min(100, Math.max(1, (elapsed ?? 0) / total * 100))}%` }} /></span>
          <small className="trace-duration">{elapsed === undefined ? stopped ? '未记录结束' : '执行中' : duration(elapsed)}</small>
        </PopoverTrigger><PopoverContent side="left" align="start" sideOffset={12} className="trace-span-popover" style={{ width: 'min(560px, calc(100vw - 32px))', maxHeight: 'min(640px, calc(100vh - 32px))' }} aria-label="节点详情"><SpanDetails span={span} close={() => setSelectedId(undefined)} /></PopoverContent></Popover>
      </div>
      {!collapsed.has(span.id) && nested.map(child => rows(child, depth + 1))}
    </div>
  }
  return <section className="trace-view" aria-label="调用树与时间线">
    <div className="trace-summary"><span>{spans.length} 个节点</span><span>{duration(total)}</span></div>
    <div className="trace-tree">{(children.get('') ?? []).map(span => rows(span, 0))}</div>

  </section>
}

function SpanDetails({ span, close }: { span: StoredTraceSpan; close(): void }) {
  return <section className="trace-span-detail">
      <div className="trace-span-heading"><strong>{span.name}</strong><Button variant="ghost" size="icon-sm" aria-label="关闭节点详情" onClick={close}><X /></Button></div>
      <p className="field-hint">{typeLabels[span.spanType] ?? span.spanType} · {span.error ? '发生错误' : span.endedAt ? '已结束' : '未记录结束'}</p>
      {(['input', 'output', 'attributes', 'metadata', 'error'] as const).filter(field => field !== 'error' || span.error).map(field => <details className="trace-payload soft-divider-top" key={field} open={field === 'input' || field === 'output' || field === 'error'}><summary>{{ input: '输入', output: '输出', attributes: '调用信息', metadata: '上下文', error: '错误' }[field]}</summary><pre>{JSON.stringify(span[field], null, 2) ?? '未提供'}</pre></details>)}
      <details className="trace-payload soft-divider-top"><summary>原始节点</summary><pre>{JSON.stringify(span, null, 2)}</pre></details>
    </section>
}
