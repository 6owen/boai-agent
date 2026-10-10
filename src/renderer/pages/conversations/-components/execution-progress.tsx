/*
 * [INPUT]: 当前原消息的真实Run/Work、宿主持久阶段、Codex公开摘要及原Trace导航。
 * [OUTPUT]: 已接收回执、聊天内执行卡与共用有界过程清单；不伪造消息、已读或模型思维链。
 * [POS]: 会话和员工执行详情共用的进度投影，审批/交付仍归原业务记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { AgentRun, WorkItem } from '@shared/domain'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon, Clock, ChevronRight, LoaderCircle, Workflow } from '@/components/icons'
import { byCreatedAt } from '../activity'
import { runLabels } from '../presentation'

export function MessageReceipt({ runs }: { runs: AgentRun[] }) {
  const received = runs.some(run => run.progress?.some(event => event.id === 'stage:employee_start') || run.backend?.turnId)
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

export function ChatExecutionCard({ runs, work, group, onOpen }: { runs: AgentRun[]; work?: WorkItem; group: boolean; onOpen(): void }) {
  const ordered = [...runs].filter(run => run.phase !== 'memory').sort(byCreatedAt)
  const run = [...ordered].reverse().find(value => ['queued', 'running', 'waiting_approval'].includes(value.status)) ?? ordered.at(-1)
  if (!run) return null
  // Finished conversational decisions are already represented by the actual reply.
  if (!run.workId && ['completed', 'cancelled'].includes(run.status)) return null
  const active = ['queued', 'running'].includes(run.status)
  const tool = [...run.toolEvents].reverse().find(value => value.status === 'running')
  const latest = [...(run.progress ?? [])].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1)
  const label = run.status === 'waiting_approval' ? '等待你的批准' : active && tool ? `正在调用 ${tool.name}` : active && run.phase === 'decision' ? '正在理解你的消息' : active ? latest?.text ?? '正在处理' : run.status === 'completed' && run.workId ? run.disposition === 'delivered' ? '已交付' : run.disposition === 'waiting' ? '等待继续处理' : '本次处理结束' : runLabels[run.status]
  return <Button variant="outline" size="content" className="chat-execution-card" aria-label={`查看${run.backend?.program?.name ?? '员工'}执行详情`} onClick={onOpen}>
    {active ? <LoaderCircle className="spinner" data-icon="inline-start" /> : <Workflow data-icon="inline-start" />}
    <span className="chat-execution-content"><strong>{group ? `${run.agentName} · ` : ''}{run.backend?.program?.name ?? '员工'} · {work ? '处理工作' : '处理消息'}</strong>
      <span className="truncate">{label}</span>{work && <small className="truncate">{work.deliverable}</small>}
    </span><ChevronRight data-icon="inline-end" />
  </Button>
}
