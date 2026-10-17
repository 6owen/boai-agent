/*
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 运行信息按请求展示网关所选模型/响应头实际模型/响应体报告，缺少头部保持未知。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 原生信息记录分别展示选定/初始化/API模型、公开目录及容量来源，复用原只读CodeBlock。
 * [INPUT]: 原执行证据、完整内容读取回调与共享UI。
 * [OUTPUT]: 原生记录及运行信息默认收起，JSON使用紧凑Shiki，结构化字段继承11px次级色；保留展开状态和按需读取。
 * [POS]: 执行面板展示组件，保留事件原文，不更改调用、过滤或持久数据。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { useEffect, useRef, useState } from 'react'
import type { AgentRun } from '@shared/domain'
import type { ExecutionEvidence } from '@shared/domain/execution'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { ToolChip } from '@/components/ui/tool-chips'
import { useExecutionRetainedState } from './ExecutionVirtualList'
import { handleToolResultKeyDown } from './ExecutionToolGroup'

/** Render arbitrary native fields without substituting a JSON dump into the process view. */
export function ExecutionRecordFields({ value }: { value: unknown }) {
  if (value === null || typeof value !== 'object') return <span className="whitespace-pre-wrap break-all">{String(value ?? 'null')}</span>
  const entries = Object.entries(value)
  if (!entries.length) return <span className="font-mono text-muted-foreground">{Array.isArray(value) ? '[]' : '{}'}</span>
  return <dl className="m-0 flex min-w-0 flex-col gap-2 leading-relaxed">{entries.map(([key, item]) => <div key={key} className="min-w-0">
    <dt className="break-all font-mono text-xs text-muted-foreground">{key}</dt>
    <dd className="m-0 mt-1 min-w-0 border-l border-border pl-2.5"><ExecutionRecordFields value={item} /></dd>
  </div>)}</dl>
}

export function ExecutionRawRecord({ event, read }: { event: ExecutionEvidence; read(event: ExecutionEvidence): Promise<void> }) {
  const [expanded, setExpanded] = useExecutionRetainedState(`raw:${event.runId}:${event.id}`, false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (expanded && event.deferred) void read(event) }, [event.id, event.revision, event.deferred, expanded])
  const payload = event.payload as { method?: unknown } | null
  const title = typeof payload?.method === 'string' ? payload.method : event.eventType
  return <div className="min-w-0" data-native-record-id={event.id}>
    <ToolChip open={expanded} onOpenChange={setExpanded} triggerRef={trigger} title={`#${event.sequence} ${title} · ${event.createdAt}`} label={`#${event.sequence}`} chip={title} mono
      status={<time className="shrink-0 text-xs font-normal text-muted-foreground" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time>}>
      {event.deferred
      ? <Button variant="link" size="sm" onClick={() => void read(event)}>读取完整原生记录 · {Math.ceil(event.contentLength / 1024)} KB</Button>
      : <CodeBlock code={JSON.stringify(event.payload, null, 2)} language="json" density="compact" className="max-h-96" tabIndex={0} aria-label={`${title} 原生记录`} onKeyDown={event => handleToolResultKeyDown(event, trigger.current)} />}
    </ToolChip>
  </div>
}

export function ExecutionRunInfo({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <div className="mt-4"><ToolChip title="运行信息" label="运行信息" chip={run.backend?.program?.name ?? run.agentName} open={open} onOpenChange={setOpen} triggerRef={trigger}>
    <CodeBlock code={JSON.stringify({ gatewayModelCalls: run.modelCalls?.map(call => ({ ...call, route: call.route ?? { routeSource: 'unknown' } })), runtime: run.backend?.program?.name, model: run.backend?.modelId, selectedModel: run.backend?.selectedModelId, apiReportedModel: run.backend?.reportedModelId, modelSource: run.backend?.modelIdSource, selectedModelSource: run.backend?.modelSource, nativeInfo: run.backend?.nativeInfo, session: run.backend?.sessionId, turn: run.backend?.turnId, contextWindowTokens: run.backend?.contextWindowTokens, contextWindowSource: run.backend?.contextWindowSource, options: run.backend?.options, status: run.status, finishedAt: run.finishedAt }, null, 2)} language="json" density="compact" className="max-h-96" tabIndex={0} aria-label="运行信息原生记录" onKeyDown={event => handleToolResultKeyDown(event, trigger.current)} />
  </ToolChip></div>
}
