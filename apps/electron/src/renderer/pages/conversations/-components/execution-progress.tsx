/*
 * [OUTPUT]: 运行中卡片footer可停止原Run或定时occurrence，终态保留过程并移除停止入口。
 * [OUTPUT]: 补充指令回执区分宿主接受、原生当前轮次确认和未知，不以普通调度冒充生效。
 * [OUTPUT]: 2026-10-27按用户要求删除执行卡查看/继续与任务结果；卡片只展示原执行内容和状态。
 * [OUTPUT]: 错误正文复用流式正文的MarkdownContent compact排版，字号/行高/颜色一致。
 * [OUTPUT]: 执行与失败卡片共用可用宽度；终态仅显示实际错误，不添加取消/已有过程保留状态行。
 * [OUTPUT]: 失败/取消/中断的执行过程及自动化镜像保留在聊天；支持原生复制和员工配置入口。
 * [OUTPUT]: 运行时插件复用原生执行进度/停止入口，不展示BOAI本机预算。
 * [OUTPUT]: 执行Soft消息卡随内容撑宽并受聊天区域约束；loading行固定对齐，真实过程向下追加。
 * [OUTPUT]: 执行中员工消息卡直接呈现共享执行流；不向聊天上下文或渠道写入过程消息。
 * [OUTPUT]: 2026-10-11 第13组原生员工与Rovai执行过程接线，沿用BOAI视觉组件；消息流程卡片退役，输入框工具栏保持。
 * [INPUT]: 当前原消息的真实Run/Work、宿主持久阶段、Codex公开摘要及原Trace导航。
 * [OUTPUT]: 已接收回执、聊天内执行卡与共用有界过程清单；不伪造消息、已读或模型思维链。
 * [POS]: 会话和员工执行详情共用的进度投影，审批/交付仍归原业务记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AgentRun } from '@boai/shared/domain'
import { MarkdownContent } from '@/components/common/markdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon, Clock } from '@/components/icons'
import { LoadingState } from '@/components/ui/loading-state'
import { useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { failureSummary } from '../presentation'
import { ExecutionFeed } from '@/components/detail-panel/execution-feed'
import { ExecutionContentCache } from '@/components/detail-panel/execution-content-cache'
import { ExecutionStopButton } from '@/components/detail-panel/execution-stop-button'

export function MessageReceipt({ runs, steering }: { runs: AgentRun[]; steering?: import('@boai/shared/domain/execution').NativeSteeringReceipt }) {
  const received = steering ? steering.delivery === 'submitted' : runs.some(run => ['codex-local', 'claude-local', 'runtime-plugin'].includes(run.backend?.kind ?? '') ? run.backend?.inputAccepted || run.backend?.turnId : run.progress?.some(event => event.id === 'stage:employee_start'))
  const label = steering ? steering.delivery === 'submitted' ? '原生当前轮次已接收补充' : steering.delivery === 'unknown' ? '补充接收结果未确认，没有自动重发' : '补充已保存，等待原生接收确认' : received ? '员工已接收这条消息' : runs.length && runs.every(run => !['queued', 'running', 'waiting_approval'].includes(run.status)) ? '已发送，接收回执未记录' : '已发送，等待员工处理'
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
export function ChatExecutionCard({ api, run, active }: { api: DesktopApi; run: AgentRun; active: boolean }) {
  const [cache] = useState(() => new ExecutionContentCache())
  const live = ['queued', 'running', 'waiting_approval'].includes(run.status)
  return <div className="message-card soft-card min-w-0 w-full max-w-full" data-chat-execution-run={run.id} data-execution-run-id={run.id} aria-label={`${run.agentName}的执行过程`}>
    <div className="flex min-w-0 flex-col gap-2">
      {live && <div className="flex min-h-6 min-w-0 items-center gap-1">
        <LoadingState label={run.status === 'waiting_approval' ? '等待批准' : run.status === 'queued' ? '等待执行资源' : '正在处理'} startedAt={run.createdAt} active={active} working={run.status === 'running'} />
      </div>}
      {!live && run.error && <MarkdownContent size="compact">{failureSummary(run.error)}</MarkdownContent>}
      <ExecutionFeed api={api} run={run} active={active} cache={cache} presentation="chat" />
      {live && <footer className="soft-divider-top flex justify-end pt-2"><ExecutionStopButton key={run.id} api={api} run={run} active={active} /></footer>}
    </div>
  </div>
}
