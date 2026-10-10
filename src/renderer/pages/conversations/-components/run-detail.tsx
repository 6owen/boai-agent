/*
 * [OUTPUT]: 2026-10-10 共用RunCard显示有界真实阶段、Codex公开摘要/进度说明以及分离的工具参数/结果。
 * [OUTPUT]: 2026-10-10 同一RunCard供会话与员工执行详情复用，状态/未知/工具/失败与原重试门禁保持。
 * [OUTPUT]: Codex/Claude均按实际外部请求显示计量与未知内部步骤。
 * [OUTPUT]: 调度尝试与实际已开始的本机请求分开，当前所示运行按externalInvocations计数，旧缺失/非法数保持未知；不改变预算。
 * [OUTPUT]: 本机Agent中断只提示核对后明确新请求，不展示宿主已拒绝的原运行重试按钮；API原重试边界保持。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [OUTPUT]: 本机执行次数显示外部请求，并明确内部模型调用次数未知。
 * [INPUT]: 会话轮次、运行状态、工作结果与重试操作。
 * [OUTPUT]: 执行过程折叠摘要整行可点击且使用12px旋转箭头；可折叠的运行摘要、失败证据和显式重试。
 * [POS]: 会话 Trace 的运行诊断补充；不进入任务与产物面板。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend } from '@shared/domain/backends'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronRight, Terminal } from '@/components/icons'
import type { AgentDelivery, AgentRun, ConversationDetail, Snapshot, WorkItem } from '@shared/domain'
import { byCreatedAt, roundTime, type ActivityRound } from '../activity'
import { runLabels, deliveryLabels, turnLabels, liveTurn, latestMemberDeliveries, failureSummary, workDispositionLabels } from '../presentation'
import { ExecutionProgress } from './execution-progress'
export function RoundDetail({ round, detail, snapshot, busy, onRetry, historical = false }: { round: ActivityRound; detail: ConversationDetail; snapshot: Snapshot; busy: boolean; onRetry: (id: string) => void; historical?: boolean }) {
  const turn = round.turn
  const roundDeliveries = (detail.deliveries ?? []).filter(delivery => turn && delivery.turnId === turn.id)
  const latestByMember = latestMemberDeliveries(roundDeliveries)
  const unresolved = detail.unresolvedFailureDeliveryIds ? new Set(detail.unresolvedFailureDeliveryIds) : undefined
  // The scheduler owns recovery rules. A later pass must not hide an unresolved execution failure.
  if (unresolved) {
    for (const failure of [...roundDeliveries].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.observedThroughSequence - b.observedThroughSequence)) {
      if (unresolved.has(failure.id)) latestByMember.set(failure.agentId, failure)
    }
  }
  const deliveries = [...latestByMember.values()].sort((a, b) => detail.conversation.agentIds.indexOf(a.agentId) - detail.conversation.agentIds.indexOf(b.agentId) || a.agentId.localeCompare(b.agentId))
  const repliedAgentIds = new Set(detail.messages.filter(message => turn && message.turnId === turn.id && message.senderType === 'agent' && message.status === 'completed' && message.content.trim()).map(message => message.senderId))
  const memberLabel = (delivery: AgentDelivery) => {
    if (delivery.status === 'failed' && unresolved && !unresolved.has(delivery.id)) return '此前失败已恢复'
    if (repliedAgentIds.has(delivery.agentId) && ['passed', 'skipped', 'completed'].includes(delivery.status)) return delivery.status === 'completed' ? '已回复' : '已回复，暂无补充'
    return delivery.status === 'passed' ? '本轮不发言' : deliveryLabels[delivery.status]
  }
  const runs = [...round.runs].sort(byCreatedAt)
  const nativeRuns = runs.filter(run => isNativeBackend(run.backend))
  const nativeRequests = nativeRuns.every(run => Number.isSafeInteger(run.backend!.externalInvocations) && run.backend!.externalInvocations >= 0) ? nativeRuns.reduce((sum, run) => sum + run.backend!.externalInvocations, 0) : undefined
  const active = runs.some(run => ['queued', 'running', 'waiting_approval'].includes(run.status)) || Boolean(turn && liveTurn(turn.status))
  return <section className={`activity-round${historical ? ' is-history' : ''}`} aria-label={historical ? '历史轮次详情' : '本轮详情'} data-turn-id={turn?.id}>
    <div className="round-context"><span className="pill">{historical ? '历史记录' : '本轮'}</span><time dateTime={round.createdAt}>{roundTime(round.createdAt)}</time></div>
    <p className="round-trigger"><strong>触发消息</strong><span>{round.trigger ? `${round.trigger.senderType === 'user' ? '你' : round.trigger.senderName}：${round.trigger.content}` : '原始消息不可用，此处保留运行记录。'}</span></p>
    <h3>{turn ? turnLabels[turn.status].replace('本轮', historical ? '该轮' : '本轮') : runs.length ? '运行记录' : '等待开始处理'}</h3>
    {turn?.reason && <p className="field-hint">{turn.status === 'failed' ? failureSummary(turn.reason) : turn.reason}</p>}
    {turn && <p className="field-hint">{historical ? '该轮' : '本轮'}{nativeRuns.length ? '处理尝试' : '模型调用'} {turn.modelCalls} 次 · 公开消息 {turn.publicMessages} 条</p>}
    {nativeRuns.length > 0 && <p className="field-hint">当前记录中的本机请求：{nativeRequests === undefined ? '未知' : `${nativeRequests} 次`}；本机 Agent 内部模型调用次数未知。</p>}
    {deliveries.length > 0 && <><h4>成员状态</h4><p className="field-hint">每位员工一条状态；各次尝试保留在下方运行记录中。</p>{deliveries.map(delivery => <div className="delivery-row" key={delivery.agentId}><span>{snapshot.agents.find(agent => agent.id === delivery.agentId)?.name ?? '已移除员工'}</span><small>{memberLabel(delivery)}</small>{delivery.error && (delivery.status === 'interrupted' || (delivery.status === 'failed' && (!unresolved || unresolved.has(delivery.id)))) && <p className="error-copy">{failureSummary(delivery.error)}</p>}</div>)}</>}
    <h4>{historical ? '该轮' : '本轮'}运行记录 · {runs.length}</h4>
    {runs.map((run, index) => {
      const newerAttempt = runs.slice(index + 1).some(candidate => candidate.agentId === run.agentId && candidate.phase === run.phase)
      return <RunCard key={run.id} run={run} work={detail.workItems?.find(work => work.id === run.workId)} busy={busy} onRetry={onRetry} historical={historical} newerAttempt={newerAttempt} canRetry={!historical && !newerAttempt && !active && (run.status === 'interrupted' || !turn || !unresolved || roundDeliveries.some(delivery => delivery.agentId === run.agentId && unresolved.has(delivery.id)))} />
    })}
    {!runs.length && <p className="field-hint">本条消息还没有运行记录。</p>}
    {historical && runs.some(run => ['failed', 'interrupted'].includes(run.status)) && <p className="historical-note">这条消息之后已有新的轮次。若仍需处理，请在会话中发送新的消息。</p>}
  </section>
}

function toolDetail(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value } }

export function RunCard({ run, work, onRetry, busy, historical, newerAttempt, canRetry }: { run: AgentRun; work?: WorkItem; onRetry: (id: string) => void; busy: boolean; historical: boolean; newerAttempt: boolean; canRetry: boolean }) {
  const phase = run.phase === 'decision' ? '参与判断' : run.phase === 'memory' ? '记忆整理' : run.phase === 'coordination' ? '历史协调任务' : run.responseKind === 'chat' ? '交流回复' : '任务执行'
  const failed = ['failed', 'interrupted'].includes(run.status)
  return <Card className="run-card gap-0 p-4" data-run-id={run.id}><CardContent className="p-0">
    <div className="run-topline"><span className={`status-dot ${run.status}`} /><strong>{run.agentName}</strong><span>{run.workId && run.status === 'completed' ? '本次运行结束' : runLabels[run.status]}</span></div>
    <div className="run-context"><span>{phase}</span><time dateTime={run.createdAt}>{roundTime(run.createdAt)}</time></div>
    {work && <p className="field-hint">交付目标：{work.deliverable}</p>}
    {run.disposition && <p className="field-hint">本次工作结果：{workDispositionLabels[run.disposition]}</p>}
    <ExecutionProgress run={run} />
    {run.timing && <details className="tool-row soft-divider-top"><summary><ChevronRight size={12} />耗时与等待</summary><p className="field-hint">模型排队 {(run.timing.queueMs / 1000).toFixed(1)} 秒 · 执行阶段 {(run.timing.executionMs / 1000).toFixed(1)} 秒 · 资源等待 {((run.taskQueueMs ?? 0) / 1000).toFixed(1)} 秒 · 限流等待 {(run.timing.backoffMs / 1000).toFixed(1)} 秒</p></details>}
    {run.draft?.status === 'withheld' && <details className="tool-row soft-divider-top"><summary><ChevronRight size={12} />未发布的任务结果</summary><p className="field-hint">{run.draft.reason}</p><pre>{run.draft.text}</pre></details>}
    {failed && work?.requiresReview && <p className="historical-note">已有操作需要核对。请检查结果后，在会话中发送明确的后续要求。</p>}
    {failed && newerAttempt && <p className="historical-note">较早的尝试；此员工之后已有新的{phase}记录。</p>}
    {historical && <p className="historical-note">历史轮次中的运行，不代表当前消息的处理结果。</p>}
    {failed && run.phase === 'memory' && <p className="historical-note">记忆整理{run.status === 'interrupted' ? '中断' : '未完成'}，不会重新执行原任务。</p>}
    {run.error && <><p className="error-copy">{run.phase === 'memory' ? '记忆整理遇到问题，请查看错误详情。' : failureSummary(run.error)}</p><details className="error-details"><summary>错误详情</summary><pre>{run.error}</pre></details></>}
    {[...run.toolEvents].sort(byCreatedAt).map(tool => <details className="tool-row soft-divider-top" key={tool.id}><summary><ChevronRight size={12} /><Terminal size={12} /><span>{tool.name}</span><small>{tool.status === 'running' ? '运行中' : tool.status === 'failed' ? '失败' : '完成'}</small></summary>{tool.input && <><h5>调用参数</h5><pre>{toolDetail(tool.input)}</pre></>}{(!tool.input || tool.status !== 'running') && <><h5>{tool.status === 'running' ? '调用参数' : tool.status === 'failed' ? '错误' : '返回结果'}</h5><pre>{toolDetail(tool.detail)}</pre></>}</details>)}
    {failed && run.backend && run.phase !== 'memory' && <p className="historical-note">本机 Agent 不会自动续跑；请核对已有结果后，在聊天中发送明确的后续要求。</p>}
    {failed && !run.backend && canRetry && !work?.requiresReview && run.phase !== 'memory' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRetry(run.id)}>重试本轮{phase}</Button>}
  </CardContent></Card>
}
