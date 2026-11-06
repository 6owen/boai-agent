/*
 * [OUTPUT]: 收起处理过程保留两行思考预览，完整工具明细按需展开，最终回复替换沿原消息逻辑。
 * [OUTPUT]: 聊天处理卡默认单行：原logo及当前动作在左，计时/停止/展开在右；Motion过渡完整正文高度，收起后无正文残片。
 * [OUTPUT]: 顶部图标统一ghost样式；聊天内部思考/工具组默认收起，停止仅更新状态与计时，保留用户展开选择和展开入口。
 * [OUTPUT]: 补充指令回执区分宿主接受、原生当前轮次确认和未知，不以普通调度冒充生效。
 * [OUTPUT]: 2026-10-27按用户要求删除执行卡查看/继续与任务结果；卡片只展示原执行内容和状态。
 * [OUTPUT]: 错误正文复用流式正文的MarkdownContent compact排版，字号/行高/颜色一致。
 * [OUTPUT]: 执行与失败卡片共用可用宽度；错误在完整过程内呈现，完成替换答案保持。
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
import { Button } from '@/components/ui/button'
import { useEffect, useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
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

function currentAction(run: AgentRun) {
  if (run.status === 'cancelled' || run.status === 'interrupted') return '已停止'
  if (run.status === 'failed') return '处理失败'
  if (run.status === 'completed') return '已完成'
  if (run.status === 'waiting_approval') return '等待批准'
  if (run.status === 'queued') return '等待执行资源'
  const tool = run.toolEvents.slice().reverse().find(event => event.status === 'running')
  if (tool) return `正在执行 · ${tool.name}`
  const progress = run.progress?.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return progress?.text.trim().replace(/\s+/g, ' ') || '正在处理'
}

function ExecutionElapsed({ startedAt, finishedAt, active }: { startedAt: string; finishedAt?: string; active: boolean }) {
  const [now, setNow] = useState(Date.now)
  const start = Date.parse(startedAt)
  useEffect(() => {
    if (!active || !Number.isFinite(start)) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [active, start])
  if (!Number.isFinite(start)) return null
  const seconds = Math.max(0, ((finishedAt ? Date.parse(finishedAt) : now) - start) / 1000)
  return <span data-slot="execution-elapsed" className="mr-1 shrink-0 font-mono text-[length:var(--text-ui-caption)] text-muted-foreground/70 tabular-nums">
    {seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`}
  </span>
}

/** A live view of the run, never a new message in model/channel history. */
export function ChatExecutionCard({ api, run, active }: { api: DesktopApi; run: AgentRun; active: boolean }) {
  const [cache] = useState(() => new ExecutionContentCache())
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const reducedMotion = useReducedMotion()
  const live = ['queued', 'running', 'waiting_approval'].includes(run.status)
  const collapsed = !expanded
  return <div className="message-card soft-card min-w-0 w-full max-w-full" data-chat-execution-run={run.id} data-execution-run-id={run.id} aria-label={`${run.agentName}的执行过程`}>
    <div className="flex min-w-0 flex-col">
      <header className="relative z-10 flex min-h-6 min-w-0 items-center justify-between gap-2">
        <LoadingState label={currentAction(run)} active={active} working={run.status === 'running'} />
        <div className="flex shrink-0 items-center gap-1" data-slot="execution-header-actions">
          <ExecutionElapsed startedAt={run.createdAt} finishedAt={run.finishedAt} active={active && live} />
          <ExecutionStopButton key={run.id} api={api} run={run} active={active} compact />
          <Button type="button" variant="ghost" size="icon-xs" title={expanded ? '收起处理过程' : '展开处理过程'} aria-label={expanded ? '收起处理过程' : '展开处理过程'} aria-controls={contentId} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
            <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} />
          </Button>
        </div>
      </header>
      <motion.div id={contentId} data-slot="chat-execution-viewport" data-collapsed={collapsed} initial={false} animate={{ height: 'auto' }} transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.25, 0.1, 0.25, 1] }} className="min-w-0 overflow-hidden text-[length:var(--text-ui-control)] leading-relaxed">
        <div className="pt-2">
          {!collapsed && !live && run.error && <div className="mb-2"><MarkdownContent size="compact">{failureSummary(run.error)}</MarkdownContent></div>}
          <ExecutionFeed api={api} run={run} active={active} cache={cache} presentation="chat" defaultExpanded={false} compact={collapsed} />
        </div>
      </motion.div>
    </div>
  </div>
}
