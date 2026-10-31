/*
 * [INPUT]: Task lifecycle and revision-aware change callback.
 * [OUTPUT]: Status masks use one fixed square; board trigger/overlay share the same slot.
 * [OUTPUT]: Shared shadcn status selection; compact circular icons for the task board.
 * [POS]: Employee task presentation; changing status does not cancel a run.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import type { TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { EMPLOYEE_TASK_STATUSES } from '@boai/shared/domain/tracked-tasks'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
export const taskStatusLabels: Record<TrackedTaskStatus, string> = { pending: '待办', in_progress: '进行中', in_review: '待确认', done: '完成', closed: '已关闭' }
const dots: Record<TrackedTaskStatus, string> = { pending: 'bg-muted-foreground', in_progress: 'bg-chart-3', in_review: 'bg-chart-2', done: 'bg-chart-1', closed: 'bg-destructive' }
const icons: Record<TrackedTaskStatus, string> = { pending: 'i-carbon-circle-dash text-muted-foreground', in_progress: 'i-carbon-in-progress text-chart-3', in_review: 'i-carbon-review text-chart-2', done: 'i-carbon-checkmark-filled text-chart-1', closed: 'i-carbon-close-outline text-destructive' }
export function TaskStatusIcon({ status }: { status: TrackedTaskStatus }) { return <span data-task-status-icon aria-hidden="true" className={`inline-block size-3.5 shrink-0 ${icons[status]}`} /> }
export function TaskStatusLabel({ status }: { status: TrackedTaskStatus }) { return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${dots[status]}`} />{taskStatusLabels[status]}</span> }
export function EmployeeTaskStatus({ status, disabled, compact, onChange }: { status: TrackedTaskStatus; disabled?: boolean; compact?: boolean; onChange(value: TrackedTaskStatus): void }) {
  return <Select value={status} disabled={disabled} items={taskStatusLabels} onValueChange={value => { if (value && value !== status) onChange(value as TrackedTaskStatus) }}><SelectTrigger size="sm" className={compact ? 'size-5 gap-0 rounded-sm border-0 bg-transparent bg-none p-0 shadow-none hover:bg-muted [&>.app-icon]:hidden *:data-[slot=select-value]:justify-center' : 'w-fit'} aria-label="任务状态" title={taskStatusLabels[status]}><SelectValue>{compact ? <><TaskStatusIcon status={status} /><span className="sr-only">{taskStatusLabels[status]}</span></> : <TaskStatusLabel status={status} />}</SelectValue></SelectTrigger><SelectContent>{EMPLOYEE_TASK_STATUSES.map(value => <SelectItem key={value} value={value}><TaskStatusLabel status={value} /></SelectItem>)}</SelectContent></Select>
}
