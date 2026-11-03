/*
 * [INPUT]: Task lifecycle and revision-aware change callback.
 * [OUTPUT]: Status masks use one fixed square; board trigger/overlay share the same slot.
 * [OUTPUT]: Shared shadcn status selection; compact circular icons for the task board.
 * [OUTPUT]: Task properties use a flat Popover/Command status selector; board/list Select behavior stays scoped.
 * [POS]: Employee task presentation; changing status does not cancel a run.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useState } from 'react'
import type { TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { EMPLOYEE_TASK_STATUSES } from '@boai/shared/domain/tracked-tasks'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
type StatusProps = { status: TrackedTaskStatus; disabled?: boolean; onChange(value: TrackedTaskStatus): void }
export const taskStatusLabels: Record<TrackedTaskStatus, string> = { pending: '待办', in_progress: '进行中', in_review: '待确认', done: '完成', closed: '已关闭' }
const dots: Record<TrackedTaskStatus, string> = { pending: 'bg-muted-foreground', in_progress: 'bg-chart-3', in_review: 'bg-chart-2', done: 'bg-chart-1', closed: 'bg-destructive' }
const icons: Record<TrackedTaskStatus, string> = { pending: 'i-carbon-circle-dash text-muted-foreground', in_progress: 'i-carbon-in-progress text-chart-3', in_review: 'i-carbon-review text-chart-2', done: 'i-carbon-checkmark-filled text-chart-1', closed: 'i-carbon-close-outline text-destructive' }
export function TaskStatusIcon({ status }: { status: TrackedTaskStatus }) { return <span data-task-status-icon aria-hidden="true" className={`inline-block size-3.5 shrink-0 ${icons[status]}`} /> }
export function TaskStatusLabel({ status }: { status: TrackedTaskStatus }) { return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${dots[status]}`} />{taskStatusLabels[status]}</span> }
export function EmployeeTaskStatus({ status, disabled, compact, onChange }: StatusProps & { compact?: boolean }) {
  return <Select value={status} disabled={disabled} items={taskStatusLabels} onValueChange={value => { if (value && value !== status) onChange(value as TrackedTaskStatus) }}><SelectTrigger size="sm" className={compact ? 'size-5 gap-0 rounded-sm border-0 bg-transparent bg-none p-0 shadow-none hover:bg-muted [&>.app-icon]:hidden *:data-[slot=select-value]:justify-center' : 'w-fit'} aria-label="任务状态" title={taskStatusLabels[status]}><SelectValue>{compact ? <><TaskStatusIcon status={status} /><span className="sr-only">{taskStatusLabels[status]}</span></> : <TaskStatusLabel status={status} />}</SelectValue></SelectTrigger><SelectContent>{EMPLOYEE_TASK_STATUSES.map(value => <SelectItem key={value} value={value}><TaskStatusLabel status={value} /></SelectItem>)}</SelectContent></Select>
}
export function EmployeeTaskStatusPopover({ status, disabled, onChange }: StatusProps) {
  const [open, setOpen] = useState(false)
  return <Popover open={open && !disabled} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 justify-start gap-2 px-2 text-[length:var(--text-ui-secondary)] font-normal text-foreground/80" disabled={disabled} aria-label="任务状态" />}><TaskStatusIcon status={status} />{taskStatusLabels[status]}</PopoverTrigger>
    <PopoverContent align="start" className="w-40 p-0" aria-label="选择任务状态">
      <Command defaultValue={status} tabIndex={-1} ref={element => element?.focus()}>
        <CommandList aria-label="任务状态选项"><CommandGroup>
          {EMPLOYEE_TASK_STATUSES.map(value => <CommandItem key={value} value={value} data-checked={value === status} className="text-[length:var(--text-ui-secondary)]" onSelect={() => { setOpen(false); if (value !== status) onChange(value) }}><TaskStatusIcon status={value} />{taskStatusLabels[value]}</CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
