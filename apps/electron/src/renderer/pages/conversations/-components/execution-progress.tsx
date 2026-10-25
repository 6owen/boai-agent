/*
 * [OUTPUT]: 查看仅随可继续的终态操作区出现；排队、运行和待批准没有常驻查看或空操作行。
 * [OUTPUT]: 错误正文复用流式正文的MarkdownContent compact排版，字号/行高/颜色一致；底部查看按钮文案为“查看”。
 * [OUTPUT]: 查看完整执行过程与继续统一放在卡片底部操作区，查看使用文字按钮并位于继续左侧，运行时同样不占状态行。
 * [OUTPUT]: 执行与失败卡片共用可用宽度；终态仅显示实际错误，不添加取消/已有过程保留状态行。
 * [OUTPUT]: 继续按钮移至卡片底部并复用审批主按钮；沿当前聊天发送真实继续消息。
 * [OUTPUT]: 失败/取消/中断的执行过程及自动化镜像保留在聊天；支持显式继续、原生复制和员工配置右键入口。
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
import { Button } from '@/components/ui/button'
import { MarkdownContent } from '@/components/common/markdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon, Clock } from '@/components/icons'
import { LoadingState } from '@/components/ui/loading-state'
import { useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { canContinueRun, ContinueRunButton } from '@/components/detail-panel/continue-run-button'
import { failureSummary } from '../presentation'
import { ExecutionFeed } from '@/components/detail-panel/execution-feed'
import { ExecutionContentCache } from '@/components/detail-panel/execution-content-cache'

export function MessageReceipt({ runs }: { runs: AgentRun[] }) {
  const received = runs.some(run => ['codex-local', 'claude-local', 'runtime-plugin'].includes(run.backend?.kind ?? '') ? run.backend?.inputAccepted || run.backend?.turnId : run.progress?.some(event => event.id === 'stage:employee_start'))
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
export function ChatExecutionCard({ api, run, active, onOpen, conversationId, onContinue }: { api: DesktopApi; run: AgentRun; active: boolean; onOpen(): void; conversationId?: string; onContinue?(): void }) {
  const [cache] = useState(() => new ExecutionContentCache())
  const live = ['queued', 'running', 'waiting_approval'].includes(run.status)
  return <div className="message-card soft-card min-w-0 w-full max-w-full" data-chat-execution-run={run.id} data-execution-run-id={run.id} aria-label={`${run.agentName}的执行过程`}>
    <div className="flex min-w-0 flex-col gap-2">
      {live && <div className="flex min-h-6 min-w-0 items-center gap-1">
        <LoadingState label={run.status === 'waiting_approval' ? '等待批准' : run.status === 'queued' ? '等待执行资源' : '正在处理'} startedAt={run.createdAt} active={active} working={run.status === 'running'} />
      </div>}
      {!live && run.error && <MarkdownContent size="compact">{failureSummary(run.error)}</MarkdownContent>}
      <ExecutionFeed api={api} run={run} active={active} cache={cache} presentation="chat" />
      {canContinueRun(run) && <div className="button-row justify-end">
        <Button variant="secondary" size="sm" onClick={onOpen} aria-label="查看完整执行过程">查看</Button>
        <ContinueRunButton api={api} run={run} active={active} conversationId={conversationId} onDispatch={onContinue} />
      </div>}
    </div>
  </div>
}
