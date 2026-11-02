/*
 * [INPUT]: Employee-local hidden status labels and explicit view callbacks.
 * [OUTPUT]: Shared visibility controls; pressed tags use the global ghost selection background, hidden tags stay transparent.
 * [POS]: Employee task display controls; status labels have no transition hierarchy.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EyeOff, MoreHorizontal, Plus, Sliders } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskStatusIcon, taskStatusLabels } from './employee-task-status'

export const taskVisibilityKey = (employeeId: string) => `boai.v2.employeeTaskHiddenColumns:${employeeId}`
export function readHiddenTaskColumns(employeeId: string): TrackedTaskStatus[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(taskVisibilityKey(employeeId)) ?? '[]'); return Array.isArray(value) ? EMPLOYEE_TASK_STATUSES.filter(status => value.includes(status)) : [] }
  catch { return [] }
}
export function EmployeeTaskDisplay({ hidden, disabled, onToggle }: { hidden: TrackedTaskStatus[]; disabled: boolean; onToggle(status: TrackedTaskStatus): void }) {
  return <Popover><PopoverTrigger render={<Button variant="secondary" size="sm" disabled={disabled} aria-label="显示任务列" />}><Sliders />显示</PopoverTrigger>
    <PopoverContent align="end" className="w-72 gap-3 p-4"><PopoverTitle className="text-xs text-muted-foreground">列</PopoverTitle><div className="flex flex-wrap gap-2">
      {EMPLOYEE_TASK_STATUSES.map(status => <Button key={status} variant="ghost" size="sm" aria-pressed={!hidden.includes(status)} onClick={() => onToggle(status)}><TaskStatusIcon status={status} />{taskStatusLabels[status]}</Button>)}
    </div></PopoverContent>
  </Popover>
}
export function TaskColumnActions({ status, disabled, onCreate, onHide }: { status: TrackedTaskStatus; disabled?: boolean; onCreate(status: TrackedTaskStatus): void; onHide(status: TrackedTaskStatus): void }) {
  return <div className="flex shrink-0 items-center gap-1">
    <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" disabled={disabled} aria-label={`${taskStatusLabels[status]}列菜单`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onHide(status)}><EyeOff />隐藏列</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" disabled={disabled} aria-label={`创建${taskStatusLabels[status]}任务`} onClick={() => onCreate(status)}><Plus /></Button>} /><TooltipContent>创建任务</TooltipContent></Tooltip>
  </div>
}
