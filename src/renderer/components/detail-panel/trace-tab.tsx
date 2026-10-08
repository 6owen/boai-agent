/*
 * [OUTPUT]: 旧ACP按run停止入口不接管原生Codex的Work生命周期。
 * [INPUT]: 固定会话/消息/员工身份、桌面 Trace 查询和事件。
 * [OUTPUT]: 历史轮次下拉使用宿主有界当前来源请求摘要，所选旧轮继续原ID核读；无正文轮次元信息，按固定入口/轮次触发/运行消息 ID 分批核读，不回拉全历史；下拉字段统一使用 shadcn Select；轮次与员工筛选、异步刷新、原生调用树和折叠运行诊断；切换会话不漂移；ACP可直接停止所选原运行并等待执行器退出。
 * [POS]: 执行过程标签的数据边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationDetail, Snapshot } from '@shared/domain'
import type { StoredTraceSpan } from '@shared/domain/traces'
import { Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { activityRounds, type ActivityRound } from '@/pages/conversations/activity'
import { TraceDetail } from '@/pages/conversations/-components/trace-detail'
import { RoundDetail } from '@/pages/conversations/-components/run-detail'
import { readDetailMessages } from '@/pages/conversations/detail-reading'
import { READING_LIMITS } from '@shared/domain/reading'

export function TraceTab({ api, conversationId, messageId, agentId, active, snapshot, busy, onRetry, onStop }: {
  api: DesktopApi; conversationId: string; messageId?: string; agentId?: string; active: boolean; snapshot: Snapshot; busy: boolean; onRetry(id: string): void; onStop(id: string): void
}) {
  const [roundId, setRoundId] = useState(''), [employee, setEmployee] = useState(agentId ?? '')
  const [value, setValue] = useState<{ detail: ConversationDetail; spans: StoredTraceSpan[]; round?: ActivityRound; selection: string }>(), [error, setError] = useState('')
  useEffect(() => {
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try {
        const current = () => !disposed && token === request
        const detail = await api.request('getConversationMetadata', { id: conversationId, includeTriggerSummaries: true })
        if (!current()) return
        const anchors = await readDetailMessages(api, conversationId, messageId ? [messageId] : [], current)
        detail.messages = anchors.flatMap(item => item.status === 'available' && item.message ? [item.message] : [])
        const rounds = activityRounds(detail), anchor = detail.messages.find(message => message.id === messageId)
        if (messageId && !anchor) throw new Error(anchors[0]?.reason ?? '这条消息已被清理，执行记录不再可用。')
        const round = roundId ? rounds.find(round => round.id === roundId) : anchor ? rounds.find(round => anchor.turnId ? round.turn?.id === anchor.turnId : round.runs.some(run => run.id === anchor.runId) || round.trigger?.id === anchor.id) : rounds[0]
        if (roundId && !round) throw new Error('所选轮次已不可用，不会切换到其他轮次。')
        const triggerId = round?.turn?.triggerMessageId ?? round?.runs[0]?.triggerMessageId ?? round?.trigger?.id
        const items = await readDetailMessages(api, conversationId, [...(triggerId ? [triggerId] : []), ...(round?.runs.filter(run => !run.phase || run.phase === 'execution').map(run => run.messageId) ?? [])], current)
        if (!current()) return
        const trigger = items.find(item => item.messageId === triggerId)
        if (triggerId && trigger?.status !== 'available') throw new Error(trigger?.reason ?? '原轮次来源消息已不可用。')
        detail.messages = [...new Map([...detail.messages, ...items.flatMap(item => item.status === 'available' && item.message ? [item.message] : [])].map(message => [message.id, message])).values()]
        const selectedRound = activityRounds(detail).find(item => item.id === round?.id)
        const spans = triggerId ? await api.request('getConversationTrace', { conversationId, messageId: triggerId, turnId: round?.turn?.id }) : []
        if (current()) { setValue({ detail, spans, round: selectedRound, selection: roundId }); setError('') }
      } catch (e) { if (!disposed && token === request) { setValue(undefined); setError(errorText(e)) } }
    }
    if (active) void load()
    const unsubscribe = api.subscribe(event => {
      if ((event.type === 'conversation:cleared' || event.type === 'conversation:deleted') && event.conversationId === conversationId) { setValue(undefined); setError('聊天记录已清理。'); request++; clearTimeout(timer); return }
      if (!active) return
      if (!(event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId)) && !(event.type === 'message' && event.message.conversationId === conversationId)) return
      request++; setValue(undefined)
      if (!timer) timer = setTimeout(() => { timer = undefined; void load() }, 160)
    })
    return () => { disposed = true; unsubscribe(); clearTimeout(timer) }
  }, [api, conversationId, messageId, active, roundId])
  if (error) return <Banner>{error}</Banner>
  if (!value || value.selection !== roundId) return <Loading />
  const { detail, round } = value
  if (!round) return <p className="empty-note">发送消息后，可以在这里查看执行过程。</p>
  const rounds = activityRounds(detail), members = new Map(round.runs.map(run => [run.agentId, run.agentName]))
  const runs = round.runs.filter(run => !employee || run.agentId === employee), runIds = new Set(runs.map(run => run.id))
  const spans = value.spans.filter(span => runIds.has(span.runId))
  const filtered = { ...detail, deliveries: detail.deliveries?.filter(item => !employee || item.agentId === employee) }
  return <div className="detail-section trace-detail" data-turn-id={round.turn?.id}>
    <div className="trace-filters">
      <SelectField aria-label="执行轮次" value={round.id} onValueChange={selectedValue => setRoundId(selectedValue)} options={rounds.map(item => ({ value: item.id, label: `${item.trigger?.content.slice(0, READING_LIMITS.triggerSummaryCharacters) || detail.triggerSummaries?.[item.turn?.triggerMessageId ?? item.runs[0]?.triggerMessageId ?? ''] || '历史执行'} · ${new Date(item.createdAt).toLocaleTimeString('zh-CN')}` }))} />
      {detail.conversation.kind === 'group' && <SelectField aria-label="筛选员工" value={employee} onValueChange={selectedValue => setEmployee(selectedValue)} options={[{ value: '', label: '全部员工' }, ...[...members].map(([id, name]) => ({ value: id, label: name }))]} />}
    </div>
    {rounds.length > READING_LIMITS.triggerSummaries && <p className="field-hint">最近 {READING_LIMITS.triggerSummaries} 条请求显示已核对摘要，更早轮次按时间选择后核对原请求。</p>}
    <p className="trace-trigger">{round.trigger?.content}</p>
    {runs.filter(run => run.traceError).map(run => <Banner key={run.id}>部分执行记录未能保存：{run.traceError}</Banner>)}
    {spans.length ? <TraceDetail key={`${round.id}:${employee}`} spans={spans} runs={runs} /> : <p className="field-hint">{runs.some(run => ['running', 'queued'].includes(run.status)) ? '执行记录正在生成…' : runs.some(run => run.backend) ? '外部员工未提供 Mastra Trace，可展开运行摘要。' : '这次执行没有采集到 Trace，可展开运行摘要。'}</p>}
    {runs.filter(run => run.backend?.kind === 'acp-local' && ['queued', 'running', 'waiting_approval'].includes(run.status)).map(run => <Button key={run.id} variant="secondary" size="sm" disabled={busy} onClick={() => onStop(run.id)}>停止此外部任务</Button>)}
    <details className="trace-run-summary soft-divider-top"><summary>运行摘要与错误</summary><RoundDetail round={{ ...round, runs }} detail={filtered} snapshot={snapshot} busy={busy} onRetry={onRetry} historical={round.id !== rounds[0]?.id} /></details>
  </div>
}
