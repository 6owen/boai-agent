/*
 * [INPUT]: 运行领域类型、活动投影与公共组件、统一 UI 基础组件。
 * [OUTPUT]: 当前及历史轮次的运行详情。
 * [POS]: src/renderer/pages/conversations/-components/activity-detail.tsx。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, FolderOpen, Terminal } from '@/components/icons/index'
import type { AgentDelivery, AgentRun, ConversationDetail, Snapshot } from '@shared/domain'
import { sizeText } from '@/components/common/index'
import { activityRounds, byCreatedAt, roundTime, type ActivityRound } from '@/pages/conversations/activity'

import { runLabels, deliveryLabels, turnLabels, liveTurn, latestMemberDeliveries, failureSummary } from '../presentation'
export function ActivityDetail({ detail, snapshot, busy, onRetry, onOpenPath }: { detail: ConversationDetail; snapshot: Snapshot; busy: boolean; onRetry: (id: string) => void; onOpenPath: (path: string) => void }) {
  const [current, ...history] = activityRounds(detail)
  return <div className="detail-section activity-detail">
    {current ? <RoundDetail key={current.id} round={current} detail={detail} snapshot={snapshot} busy={busy} onRetry={onRetry} /> : <p className="field-hint">还没有执行记录。发送消息后，这里会显示对应轮次。</p>}
    {history.length > 0 && <details className="round-history"><summary>历史轮次 · {history.length}</summary><p className="field-hint">以下记录属于之前的消息，不代表本轮结果。历史错误会保留。</p>{history.map(round => <details className="history-round" key={round.id}><summary><time dateTime={round.createdAt}>{roundTime(round.createdAt)}</time><span>{round.trigger?.content.slice(0, 70) || '未关联触发消息'}</span><small>{round.turn ? turnLabels[round.turn.status].replace('本轮', '该轮') : `${round.runs.length} 条运行记录`}</small></summary><RoundDetail round={round} detail={detail} snapshot={snapshot} busy={busy} onRetry={onRetry} historical /></details>)}</details>}
    <h4>会话全部产物 · {detail.artifacts.length}</h4>{detail.artifacts.map(artifact => <Button variant="ghost" size="content" className="artifact-item" key={artifact.path} onClick={() => onOpenPath(artifact.path)}><FileText size={18} /><span><strong>{artifact.name}</strong><small>{sizeText(artifact.size)}</small></span><FolderOpen size={15} /></Button>)}{!detail.artifacts.length && <p className="field-hint">生成并发布的文件将在这里显示。</p>}
  </div>
}

function RoundDetail({ round, detail, snapshot, busy, onRetry, historical = false }: { round: ActivityRound; detail: ConversationDetail; snapshot: Snapshot; busy: boolean; onRetry: (id: string) => void; historical?: boolean }) {
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
  const active = runs.some(run => ['queued', 'running', 'waiting_approval'].includes(run.status)) || Boolean(turn && liveTurn(turn.status))
  return <section className={`activity-round${historical ? ' is-history' : ''}`} aria-label={historical ? '历史轮次详情' : '本轮详情'} data-turn-id={turn?.id}>
    <div className="round-context"><span className="pill">{historical ? '历史记录' : '本轮'}</span><time dateTime={round.createdAt}>{roundTime(round.createdAt)}</time></div>
    <p className="round-trigger"><strong>触发消息</strong><span>{round.trigger ? `${round.trigger.senderType === 'user' ? '你' : round.trigger.senderName}：${round.trigger.content}` : '原始消息不可用，此处保留运行记录。'}</span></p>
    <h3>{turn ? turnLabels[turn.status].replace('本轮', historical ? '该轮' : '本轮') : runs.length ? '运行记录' : '等待开始处理'}</h3>
    {turn?.reason && <p className="field-hint">{turn.status === 'failed' ? failureSummary(turn.reason) : turn.reason}</p>}
    {turn && <p className="field-hint">{historical ? '该轮' : '本轮'}模型调用 {turn.modelCalls} 次 · 公开消息 {turn.publicMessages} 条</p>}
    {deliveries.length > 0 && <><h4>成员状态</h4><p className="field-hint">每位员工一条状态；各次尝试保留在下方运行记录中。</p>{deliveries.map(delivery => <div className="delivery-row" key={delivery.agentId}><span>{snapshot.agents.find(agent => agent.id === delivery.agentId)?.name ?? '已移除员工'}</span><small>{memberLabel(delivery)}</small>{delivery.error && (delivery.status === 'interrupted' || (delivery.status === 'failed' && (!unresolved || unresolved.has(delivery.id)))) && <p className="error-copy">{failureSummary(delivery.error)}</p>}</div>)}</>}
    <h4>{historical ? '该轮' : '本轮'}运行记录 · {runs.length}</h4>
    {runs.map((run, index) => {
      const newerAttempt = runs.slice(index + 1).some(candidate => candidate.agentId === run.agentId && candidate.phase === run.phase)
      return <RunCard key={run.id} run={run} busy={busy} onRetry={onRetry} historical={historical} newerAttempt={newerAttempt} canRetry={!historical && !newerAttempt && !active && (run.status === 'interrupted' || !turn || !unresolved || roundDeliveries.some(delivery => delivery.agentId === run.agentId && unresolved.has(delivery.id)))} />
    })}
    {!runs.length && <p className="field-hint">本条消息还没有运行记录。</p>}
    {historical && runs.some(run => ['failed', 'interrupted'].includes(run.status)) && <p className="historical-note">这条消息之后已有新的轮次。若仍需处理，请在会话中发送新的消息。</p>}
  </section>
}

function RunCard({ run, onRetry, busy, historical, newerAttempt, canRetry }: { run: AgentRun; onRetry: (id: string) => void; busy: boolean; historical: boolean; newerAttempt: boolean; canRetry: boolean }) {
  const phase = run.phase === 'decision' ? '参与判断' : run.phase === 'memory' ? '记忆整理' : run.phase === 'coordination' ? '历史协调任务' : run.responseKind === 'chat' ? '交流回复' : '任务执行'
  const failed = ['failed', 'interrupted'].includes(run.status)
  return <Card className="run-card gap-0 p-4" data-run-id={run.id}><CardContent className="p-0">
    <div className="run-topline"><span className={`status-dot ${run.status}`} /><strong>{run.agentName}</strong><span>{runLabels[run.status]}</span></div>
    <div className="run-context"><span>{phase}</span><time dateTime={run.createdAt}>{roundTime(run.createdAt)}</time></div>
    {failed && newerAttempt && <p className="historical-note">较早的尝试；此员工之后已有新的{phase}记录。</p>}
    {historical && <p className="historical-note">历史轮次中的运行，不代表当前消息的处理结果。</p>}
    {failed && run.phase === 'memory' && <p className="historical-note">记忆整理{run.status === 'interrupted' ? '中断' : '未完成'}，不会重新执行原任务。</p>}
    {run.error && <><p className="error-copy">{run.phase === 'memory' ? '记忆整理遇到问题，请查看错误详情。' : failureSummary(run.error)}</p><details className="error-details"><summary>错误详情</summary><pre>{run.error}</pre></details></>}
    {[...run.toolEvents].sort(byCreatedAt).map(tool => <details className="tool-row" key={tool.id}><summary><Terminal size={12} /><span>{tool.name}</span><small>{tool.status === 'running' ? '运行中' : tool.status === 'failed' ? '失败' : '完成'}</small></summary><pre>{tool.detail}</pre></details>)}
    {failed && canRetry && run.phase !== 'memory' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => onRetry(run.id)}>重试本轮{phase}</Button>}
  </CardContent></Card>
}
