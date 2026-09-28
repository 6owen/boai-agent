/*
 * [INPUT]: 固定会话/消息/员工身份、桌面 Trace 查询和事件。
 * [OUTPUT]: 轮次与员工筛选、异步刷新、原生调用树和折叠运行诊断；切换会话不漂移。
 * [POS]: 执行过程标签的数据边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ConversationDetail, Snapshot } from '@shared/domain'
import type { StoredTraceSpan } from '@shared/domain/traces'
import { Banner, errorText, Loading } from '@/components/common'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { activityRounds, type ActivityRound } from '@/pages/conversations/activity'
import { TraceDetail } from '@/pages/conversations/-components/trace-detail'
import { RoundDetail } from '@/pages/conversations/-components/run-detail'

export function TraceTab({ api, conversationId, messageId, agentId, active, snapshot, busy, onRetry }: {
  api: DesktopApi; conversationId: string; messageId?: string; agentId?: string; active: boolean; snapshot: Snapshot; busy: boolean; onRetry(id: string): void
}) {
  const [roundId, setRoundId] = useState(''), [employee, setEmployee] = useState(agentId ?? '')
  const [value, setValue] = useState<{ detail: ConversationDetail; spans: StoredTraceSpan[]; round?: ActivityRound; selection: string }>(), [error, setError] = useState('')
  useEffect(() => {
    let disposed = false, request = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const token = ++request
      try {
        const detail = await api.request('getConversation', { id: conversationId })
        const rounds = activityRounds(detail), anchor = detail.messages.find(message => message.id === messageId)
        if (messageId && !anchor) throw new Error('这条消息已被清理，执行记录不再可用。')
        const round = roundId ? rounds.find(round => round.id === roundId) : anchor ? rounds.find(round => anchor.turnId ? round.turn?.id === anchor.turnId : round.runs.some(run => run.id === anchor.runId) || round.trigger?.id === anchor.id) : rounds[0]
        const spans = round?.trigger ? await api.request('getConversationTrace', { conversationId, messageId: round.trigger.id, turnId: round.turn?.id }) : []
        if (!disposed && token === request) { setValue({ detail, spans, round, selection: roundId }); setError('') }
      } catch (e) { if (!disposed && token === request) { setValue(undefined); setError(errorText(e)) } }
    }
    if (active) void load()
    const unsubscribe = api.subscribe(event => {
      if (event.type === 'conversation:cleared' && event.conversationId === conversationId) { setValue(undefined); setError('聊天记录已清空。'); request++; return }
      if (!active) return
      if (!(event.type === 'changed' && (!event.conversationId || event.conversationId === conversationId)) && !(event.type === 'message' && event.message.conversationId === conversationId)) return
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
      <NativeSelect aria-label="执行轮次" value={round.id} onChange={event => setRoundId(event.target.value)}>{rounds.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.trigger?.content.slice(0, 60) || '历史执行'} · {new Date(item.createdAt).toLocaleTimeString('zh-CN')}</NativeSelectOption>)}</NativeSelect>
      {detail.conversation.kind === 'group' && <NativeSelect aria-label="筛选员工" value={employee} onChange={event => setEmployee(event.target.value)}><NativeSelectOption value="">全部员工</NativeSelectOption>{[...members].map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}</NativeSelect>}
    </div>
    <p className="trace-trigger">{round.trigger?.content}</p>
    {runs.filter(run => run.traceError).map(run => <Banner key={run.id}>部分执行记录未能保存：{run.traceError}</Banner>)}
    {spans.length ? <TraceDetail key={`${round.id}:${employee}`} spans={spans} runs={runs} /> : <p className="field-hint">{runs.some(run => ['running', 'queued'].includes(run.status)) ? '执行记录正在生成…' : runs.some(run => run.backend) ? '外部员工未提供 Mastra Trace，可展开运行摘要。' : '这次执行没有采集到 Trace，可展开运行摘要。'}</p>}
    <details className="trace-run-summary soft-divider-top"><summary>运行摘要与错误</summary><RoundDetail round={{ ...round, runs }} detail={filtered} snapshot={snapshot} busy={busy} onRetry={onRetry} historical={round.id !== rounds[0]?.id} /></details>
  </div>
}
