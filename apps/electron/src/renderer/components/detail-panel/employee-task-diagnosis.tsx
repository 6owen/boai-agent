/*
 * [INPUT]: Current owner-selected employee task and one-shot diagnosis projections.
 * [OUTPUT]: On-demand evidence and explicit bobo explanations with typed admission and durable unknown-request identity.
 * [POS]: Original task diagnosis; snapshot reads never send, and explicit explanation never retries unknown sends.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md when this file changes.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DiagnosisFact, TaskDiagnosisSnapshot, TaskDiagnosisTarget } from '@boai/shared/domain/task-diagnosis'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { CircleHelp } from '@/components/icons'
import { showErrorToast } from '@/components/common'
import { createTaskDiagnosisReader, type TaskDiagnosisReadState } from './task-diagnosis-state'
import { createTaskDiagnosisExplanation, type DiagnosisExplanationState, type DiagnosisExplanationSource } from './task-diagnosis-explanation'

const statuses: Record<string, string> = { pending: '待处理', in_progress: '进行中', in_review: '待确认', done: '已完成', closed: '已关闭', queued: '排队中', admitted: '已受理', running: '执行中', waiting: '等待中', waiting_approval: '等待批准', waiting_user: '等待补充', waiting_work: '等待依赖', completed: '执行结束', succeeded: '已确认成功', failed: '失败', cancelled: '已取消', interrupted: '已中断', needs_review: '待核对', ready: '已就绪', delivered: '已交付', blocked: '受阻', unknown: '未知', unsettled: '结果未确定', denied: '已拒绝', rejected: '请求被拒绝', not_executed: '未执行', cleared: '已清理', answered: '已回答', waiting_or_unavailable: '依赖未满足或不可读', skipped: '已跳过', cancelling: '正在取消' }
const kinds: Record<DiagnosisFact['kind'], string> = { task: '任务标签', occurrence: '本次执行', run: '运行', approval: '批准请求', input: '补充请求', dependency: '依赖', tool: '工具记录', receipt: '原消息回执' }
const label = (status: string) => statuses[status] ?? '未知'
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '时间未知'
function DiagnosisContent({ value, choose }: { value: TaskDiagnosisSnapshot; choose(target: TaskDiagnosisTarget): void }) {
  return <div className="space-y-5 text-sm">
    <p className="text-xs text-muted-foreground">观察于 {time(value.observedAt)}{value.snapshotChanged ? ' · 读取期间来源有变化' : ''}</p>
    {value.selectionRequired && <section className="space-y-2"><h3 className="font-medium">选择要解释的执行</h3>{value.candidates.map((candidate, index) => <Button key={candidate.id} variant="outline" size="sm" className="w-full justify-start" onClick={() => {
      if (candidate.kind === 'occurrence' && value.target.kind === 'task') choose({ kind: 'task', employeeId: value.target.employeeId, taskId: value.target.taskId, occurrenceId: candidate.id })
      else if (candidate.kind === 'run' && value.target.conversationId) choose({ kind: 'run', employeeId: value.target.employeeId, conversationId: value.target.conversationId, runId: candidate.id })
    }}>执行 {index + 1} · {time(candidate.at)} · {label(candidate.status)}</Button>)}</section>}
    {value.assessment.findings.length > 0 && <section className="space-y-2"><h3 className="font-medium">{value.assessment.certainty === 'supported' ? '现有证据' : '仍需核对'}</h3>{value.assessment.findings.map(text => <p key={text}>{text}</p>)}</section>}
    {value.facts.length > 0 && <section className="space-y-2"><h3 className="font-medium">状态记录</h3><dl className="space-y-2">{value.facts.map(fact => <div key={fact.id} className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">{kinds[fact.kind]}{fact.relation === 'source-message' ? '（原消息范围）' : ''}</dt><dd className="text-right">{label(fact.status)}{fact.at && <span className="ml-2 text-xs text-muted-foreground">{time(fact.at)}</span>}</dd></div>)}</dl></section>}
    <section className="space-y-2"><h3 className="font-medium">耗时证据</h3><p>{value.timing.unionMs === null ? '缺少可配对的时间记录，实际耗时未知。' : `已记录工具区间合计覆盖 ${(value.timing.unionMs / 1000).toFixed(1)} 秒；重叠部分只计算一次。`}</p><p className="text-xs text-muted-foreground">{value.timing.explanation}</p></section>
    {value.assessment.missingEvidence.length > 0 && <section className="space-y-2"><h3 className="font-medium">尚缺证据</h3>{value.assessment.missingEvidence.map(text => <p key={text} className="text-muted-foreground">{text}</p>)}</section>}
    <section className="space-y-2"><h3 className="font-medium">证据范围</h3>{value.coverage.reasons.map(text => <p key={text} className="text-muted-foreground">{text}</p>)}{value.host?.summary.map(text => <p key={text} className="text-muted-foreground">{text}</p>)}</section>
  </div>
}
export function EmployeeTaskDiagnosis({ api, employeeId, taskId, active, onSource }: { api: DesktopApi; employeeId: string; taskId: string; active: boolean; onSource(source: DiagnosisExplanationSource): void }) {
  const [open, setOpen] = useState(false), [state, setState] = useState<TaskDiagnosisReadState>({ loading: false })
  const [explanationState, setExplanationState] = useState<DiagnosisExplanationState>({ busy: false, pending: false, accepted: false })
  const sourceRef = useRef(onSource); sourceRef.current = onSource
  const reader = useMemo(() => createTaskDiagnosisReader(query => api.request('executeApplicationOperation', { operation: 'diagnostics.task', input: query }), setState), [api, employeeId, taskId])
  const explanation = useMemo(() => {
    // Follow existing draft storage: UUID task identity scopes the sole pending record; known receipts stay on the backend.
    const key = `boai:task-diagnosis:pending:${employeeId}:${taskId}`
    return createTaskDiagnosisExplanation({ read: () => localStorage.getItem(key), write: value => localStorage.setItem(key, value), clear: () => localStorage.removeItem(key), requestId: () => crypto.randomUUID(), start: input => api.request('startTaskDiagnosisExplanation', input), receipts: requestId => Promise.all([api.request('getCoreConversationStart', { requestId }), api.request('getMessageReceipt', { requestId })]) }, setExplanationState)
  }, [api, employeeId, taskId])
  useEffect(() => { setExplanationState(explanation.state()) }, [explanation])
  useEffect(() => { if (!active) { setOpen(false); reader.reset(); explanation.invalidate() } return () => { reader.reset(); explanation.invalidate() } }, [reader, explanation, active])
  useEffect(() => { if (state.error && open && active) showErrorToast(state.error) }, [state.error, open, active])
  useEffect(() => { if (explanationState.error && open && active) showErrorToast(explanationState.error) }, [explanationState.error, open, active])
  const start = () => { if (!active) return; setExplanationState(explanation.state()); setOpen(true); void reader.read({ kind: 'task', employeeId, taskId }) }
  const explain = async () => {
    const target = state.target ?? { kind: 'task' as const, employeeId, taskId }
    const selected = target.kind === 'task' && state.snapshot?.target.occurrenceId ? { ...target, occurrenceId: state.snapshot.target.occurrenceId } : target
    const source = await explanation.explain(selected); if (source) sourceRef.current(source)
  }
  return <>
    <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={!active} aria-label="诊断任务" onClick={start} />}><CircleHelp /></TooltipTrigger><TooltipContent>诊断任务</TooltipContent></Tooltip>
    <Dialog open={active && open} onOpenChange={next => { setOpen(next); if (!next) { reader.reset(); explanation.invalidate() } }}><DialogContent aria-describedby={undefined} className="max-h-[80dvh] gap-4 sm:max-w-xl"><DialogHeader><DialogTitle>任务诊断</DialogTitle></DialogHeader>
      <ScrollArea className="min-h-0" viewportProps={{ className: 'max-h-[60dvh]', 'aria-busy': state.loading }}>
        {state.loading ? <div className="space-y-3" aria-label="读取任务证据"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div> : state.snapshot ? <DiagnosisContent value={state.snapshot} choose={target => { explanation.invalidate(); setExplanationState(explanation.state()); void reader.read(target) }} /> : state.error ? <p className="text-sm text-muted-foreground">当前证据不足，任务原因未知。运行服务不可用时，可在数据设置查看宿主诊断摘要。</p> : null}
      </ScrollArea>
      <div className="flex flex-wrap justify-end gap-2">{state.snapshot?.nextCursor && <Button variant="ghost" size="sm" disabled={state.loading} onClick={() => state.target && void reader.read(state.target, state.snapshot!.nextCursor)}>下一页记录</Button>}<Button variant="outline" size="sm" disabled={state.loading || explanationState.busy} onClick={() => void reader.read(state.target ?? { kind: 'task', employeeId, taskId })}>重新读取</Button><Button size="sm" disabled={explanationState.busy || (!explanationState.pending && !explanationState.accepted && (state.loading || !state.snapshot || state.snapshot.selectionRequired || state.snapshot.snapshotChanged))} onClick={() => void explain()}>{explanationState.pending ? '核对 bobo 请求' : explanationState.accepted ? '查看 bobo 解释' : '让 bobo 解释'}</Button></div>
    </DialogContent></Dialog>
  </>
}
