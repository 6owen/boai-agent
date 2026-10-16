/*
 * [OUTPUT]: 执行Soft消息卡随内容撑宽并受聊天区域约束；loading行固定对齐，真实过程向下追加。
 * [OUTPUT]: 执行中员工消息卡直接呈现共享执行流；不向聊天上下文或渠道写入过程消息。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [INPUT]: 当前原消息的真实Run/Work、宿主持久阶段、Codex公开摘要及原Trace导航。
 * [OUTPUT]: 已接收回执、聊天内执行卡与共用有界过程清单；不伪造消息、已读或模型思维链。
 * [POS]: 会话和员工执行详情共用的进度投影，审批/交付仍归原业务记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AgentRun } from '@shared/domain'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon, Clock } from '@/components/icons'
import { LoadingState } from '@/components/ui/loading-state'
import { useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import { ExecutionFeed } from '@/components/detail-panel/execution-feed'
import { ExecutionContentCache } from '@/components/detail-panel/execution-content-cache'

export function MessageReceipt({ runs }: { runs: AgentRun[] }) {
  const received = runs.some(run => ['codex-local', 'claude-local'].includes(run.backend?.kind ?? '') ? run.backend?.inputAccepted || run.backend?.turnId : run.progress?.some(event => event.id === 'stage:employee_start'))
  const label = received ? '员工已接收这条消息' : runs.length && runs.every(run => !['queued', 'running', 'waiting_approval'].includes(run.status)) ? '已发送，接收回执未记录' : '已发送，等待员工处理'
  return <Tooltip><TooltipTrigger render={<span className={`message-receipt${received ? ' is-received' : ''}`} tabIndex={0} aria-label={label} />}>
    {received ? <Icon name="CircleCheck" /> : <Clock />}
  </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export function ExecutionProgress({ run }: { run: AgentRun }) {
  if (!run.progress?.length) return null
  return <section className="execution-progress flex flex-col gap-2" aria-label="处理过程">
    {run.progress.map(event => <div key={`${event.kind}:${event.id}`} className="execution-progress-entry">
      <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      <div><small>{event.kind === 'summary' ? '执行摘要' : event.kind === 'commentary' ? '进度说明' : '执行阶段'}</small><p className="whitespace-pre-wrap break-words">{event.text}</p></div>
    </div>)}
  </section>
}

/** A live view of the run, never a new message in model/channel history. */
export function ChatExecutionCard({ api, run, active, onOpen }: { api: DesktopApi; run: AgentRun; active: boolean; onOpen(): void }) {
  const [cache] = useState(() => new ExecutionContentCache())
  return <div className="message-card soft-card min-w-0 w-fit max-w-full" data-chat-execution-run={run.id} data-execution-run-id={run.id} aria-label={`${run.agentName}的执行过程`}>
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-6 min-w-0 items-center gap-1">
        <LoadingState label={run.status === 'waiting_approval' ? '等待批准' : run.status === 'queued' ? '排队中' : '正在处理'} startedAt={run.createdAt} active={active} working={run.status === 'running'} />
        <Button variant="ghost" size="icon-2xs" className="text-muted-foreground/70" onClick={onOpen} aria-label="查看完整执行过程" title="查看完整执行过程"><Icon name="ChevronRight" className="size-2.5" /></Button>
      </div>
      <ExecutionFeed api={api} run={run} active={active} cache={cache} presentation="chat" />
    </div>
  </div>
}
