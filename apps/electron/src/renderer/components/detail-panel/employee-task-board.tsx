/*
 * [OUTPUT]: Busy interaction locks the board without dimming unrelated cards; source/overlay status slots share geometry.
 * [INPUT]: Employee task pages, revision-aware status persistence and ReUI Kanban.
 * [OUTPUT]: ReUI sortable interaction with global Card/ScrollArea, local view order and confirmed status writes.
 * [POS]: Employee right-side task board; schedules and execution FIFO retain their own authority.
 * [PROTOCOL]: Update Header and owning .folder.md on change; upstream source is recorded in @boai/ui NOTICE.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { DigitalAgent } from '@boai/shared/domain'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskListItem, type TrackedTaskPage, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { relativeTime } from '@boai/shared/rovai'
import { Avatar, errorText, showErrorToast } from '@/components/common'
import { Clock, FileText, MessageCircle, Plus } from '@/components/icons/index'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanItem, KanbanItemHandle, KanbanOverlay, type KanbanCommitMeta } from '@/components/ui/kanban'
import { occurrenceStatusLabels } from '@/pages/schedules/automation-history'
import { EmployeeTaskMenu } from './employee-task-menu'
import { EmployeeTaskStatus, TaskStatusIcon, taskStatusLabels } from './employee-task-status'
import { readTaskBoardOrder, orderedTaskColumns, commitTaskBoardOrder, type TaskColumns } from './employee-task-board-order'

type TaskPages = Partial<Record<TrackedTaskStatus, TrackedTaskPage>>
type Props = {
  employee: DigitalAgent; data: TaskPages; changing: boolean; changingTaskId?: string
  onOpen(id: string): void; onCreate(): void; onLoadMore(status: TrackedTaskStatus): void
  onStatus(task: TrackedTaskListItem, status: TrackedTaskStatus): Promise<boolean | void> | void
}
const laneColors: Record<TrackedTaskStatus, string> = {
  pending: 'bg-muted/40', in_progress: 'bg-chart-3/5', in_review: 'bg-chart-2/5', done: 'bg-chart-1/5', closed: 'bg-destructive/5',
}
const sourceLabels = { schedule: '定时任务', message: '聊天消息', manual: '手动创建' }
const getItemValue = (task: TrackedTaskListItem) => task.id
// Status menus use the same authoritative pages; preview ordering belongs to ReUI.
export function projectTaskMove(pages: TaskPages, task: TrackedTaskListItem, status: TrackedTaskStatus): TaskPages {
  return Object.fromEntries(EMPLOYEE_TASK_STATUSES.map(lane => {
    const page = pages[lane]
    if (!page || lane !== status && !page.items.some(item => item.id === task.id)) return [lane, page]
    const items = page.items.filter(item => item.id !== task.id)
    return [lane, { ...page, items: lane === status ? [{ ...task, status }, ...items] : items }]
  }))
}
export function EmployeeTaskBoard({ employee, data, changing, changingTaskId, onOpen, onCreate, onStatus, onLoadMore }: Props) {
  const [order, setOrder] = useState(() => readTaskBoardOrder(employee.id))
  const [preview, setPreview] = useState<TaskColumns>(), [dragged, setDragged] = useState<TrackedTaskListItem>(), [saving, setSaving] = useState<string>()
  const locked = useRef(false), draggedThisGesture = useRef(false)
  const reducedMotion = useReducedMotion()
  const columns = useMemo(() => orderedTaskColumns(Object.fromEntries(EMPLOYEE_TASK_STATUSES.map(status => [status, data[status]?.items ?? []])), order), [data, order])
  const displayed = (dragged || saving ? preview : undefined) ?? columns, disabled = changing || !!saving, busyTaskId = saving ?? changingTaskId
  const commit = async (next: TaskColumns, meta: KanbanCommitMeta<TrackedTaskListItem>) => {
    const task = meta.previousValue[meta.activeContainer]?.find(item => item.id === meta.event.active.id)
    const status = meta.overContainer as TrackedTaskStatus
    if (disabled || locked.current || meta.kind !== 'item' || !task || task.agentId !== employee.id || !EMPLOYEE_TASK_STATUSES.includes(status)) { setPreview(undefined); return }
    locked.current = true; setSaving(task.id); setPreview(next)
    try {
      if (status !== task.status && await onStatus(task, status) === false) return
      setOrder(commitTaskBoardOrder(employee.id, next, order))
    } catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setSaving(undefined); setPreview(undefined) }
  }
  return <Kanban value={displayed} onValueChange={setPreview} getItemValue={getItemValue} restoreOnCancel onValueCommit={(next, meta) => void commit(next, meta)} className="mt-14 flex min-h-0 flex-1 flex-col"
    accessibility={{ screenReaderInstructions: { draggable: '按空格开始拖动，用方向键移动到目标状态或位置，再按空格放下；按 Escape 取消。' } }}
    onDragStart={({ active }) => { draggedThisGesture.current = true; setPreview(columns); setDragged(Object.values(columns).flat().find(task => task.id === active.id)) }}
    onDragEnd={() => { draggedThisGesture.current = true; setDragged(undefined); setPreview(undefined) }}
    onDragCancel={() => { draggedThisGesture.current = true; setDragged(undefined); setPreview(undefined) }}>
    <ScrollArea orientation="horizontal" className="min-h-0 flex-1" viewportProps={{ 'aria-label': '任务看板横向滚动区域' }} contentProps={{ className: 'h-full', style: { display: 'flex' } }}>
      <KanbanBoard inert={disabled} role="tabpanel" aria-label="任务看板" className="flex h-full min-w-full gap-4 p-3" onPointerDownCapture={() => { draggedThisGesture.current = false }} onKeyDownCapture={event => { if (event.key === 'Enter') draggedThisGesture.current = false }}>
        {EMPLOYEE_TASK_STATUSES.map(status => <KanbanColumn key={status} value={status} render={<section />} aria-label={`${taskStatusLabels[status]}任务`} data-task-status={status} className={`h-full w-[280px] shrink-0 overflow-hidden rounded-md border border-transparent ${laneColors[status]} data-disabled:opacity-100`}>
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-3.5">
            <h3 className="m-0 flex min-w-0 items-center gap-2 text-xs font-semibold"><TaskStatusIcon status={status} /><span>{taskStatusLabels[status]}</span><span className="font-normal tabular-nums text-muted-foreground">{displayed[status].length}{data[status]?.nextCursor ? '+' : ''}</span></h3>
            {status === 'pending' && <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="创建待办任务" onClick={onCreate}><Plus /></Button>} /><TooltipContent>创建任务</TooltipContent></Tooltip>}
          </div>
          <ScrollArea className="min-h-0 flex-1" viewportProps={{ 'aria-label': `${taskStatusLabels[status]}任务滚动区域`, className: 'overscroll-y-contain [overflow-anchor:none] scroll-fade-t scroll-fade-6' }}>
            <KanbanColumnContent value={status} className="px-3 pb-3 pt-1">
              {displayed[status].map(task => <TaskCard key={task.id} task={task.status === status ? task : { ...task, status }} employee={employee} disabled={task.id === busyTaskId} reducedMotion={!!reducedMotion} onOpen={() => { if (!draggedThisGesture.current) onOpen(task.id) }} onStatus={value => { void onStatus(task, value) }} />)}
              {!displayed[status].length && <p className="m-0 py-8 text-center text-xs text-muted-foreground">暂无任务</p>}
              {data[status]?.nextCursor && <Button variant="ghost" size="sm" onClick={() => onLoadMore(status)}>加载更多</Button>}
            </KanbanColumnContent>
          </ScrollArea>
        </KanbanColumn>)}
      </KanbanBoard>
    </ScrollArea>
    <KanbanOverlay {...(reducedMotion ? { dropAnimation: null } : {})} zIndex={1000} style={{ pointerEvents: 'none' }}>{dragged ? <TaskCard task={dragged} employee={employee} disabled overlay /> : null}</KanbanOverlay>
  </Kanban>
}

type TaskCardProps = {
  task: TrackedTaskListItem; employee: DigitalAgent; disabled: boolean; overlay?: boolean; reducedMotion?: boolean
  onOpen?(): void; onStatus?(status: TrackedTaskStatus): void
}
function TaskCard({ task, employee, disabled, overlay, reducedMotion, onOpen, onStatus }: TaskCardProps) {
  const statusCallback = useRef(onStatus); statusCallback.current = onStatus
  const changeStatus = useCallback((status: TrackedTaskStatus) => statusCallback.current?.(status), [])
  const card = <Card size="sm" className="relative gap-0 py-0" data-employee-task-id={overlay ? undefined : task.id} data-task-drag-preview={overlay || undefined} aria-hidden={overlay || undefined}>
    {!overlay && <KanbanItemHandle render={<Button variant="ghost" size="content" className="absolute inset-0 rounded-[inherit]" aria-label={`打开任务：${task.title}`} onClick={onOpen} />} />}
    <TaskCardBody task={task} employee={employee} disabled={disabled} overlay={overlay} onStatus={changeStatus} />
  </Card>
  return overlay ? card : <EmployeeTaskMenu task={task} surface="card"><KanbanItem value={task.id} disabled={disabled} data-slot="card" className="data-disabled:opacity-100" style={reducedMotion ? { transition: 'none' } : undefined} render={card} /></EmployeeTaskMenu>
}
const TaskCardBody = memo(function TaskCardBody({ task, employee, disabled, overlay, onStatus }: Pick<TaskCardProps, 'task' | 'employee' | 'disabled' | 'overlay' | 'onStatus'>) {
  const SourceIcon = task.sourceKind === 'schedule' ? Clock : task.sourceKind === 'message' ? MessageCircle : FileText
  const summary = task.noteExcerpt || task.nextStepTitle
  const working = task.executionStatus && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(task.executionStatus)
  return <CardContent className="pointer-events-none relative py-3">
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <span data-task-status-slot className="pointer-events-auto flex size-5 shrink-0 items-center justify-center">{overlay ? <TaskStatusIcon status={task.status} /> : <EmployeeTaskStatus compact status={task.status} disabled={disabled} onChange={value => onStatus?.(value)} />}</span>
          <span className="truncate font-mono" title={task.id}>#{task.id.replace(/^task-/, '').slice(0, 8)}</span>
        </div>
        {working && <span className="shrink-0">{occurrenceStatusLabels[task.executionStatus!]}</span>}
      </div>
      <h4 className="m-0 mt-1 line-clamp-2 break-words text-sm font-medium leading-snug">{task.title}</h4>
      {summary && <p className="m-0 mt-1 truncate text-xs text-muted-foreground">{summary}</p>}
      {task.sourceKind && <div className="mt-1.5 flex"><span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground"><SourceIcon size={12} /><span className="truncate">{sourceLabels[task.sourceKind]}</span></span></div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 [&_.avatar]:size-5"><Avatar small name={employee.name} seed={employee.id} avatar={employee.avatar} color={employee.color} /><span className="truncate">{employee.name}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {task.stepCount > 0 && <span className="tabular-nums" title="已完成步骤">{task.completedStepCount}/{task.stepCount}</span>}
          <time dateTime={task.updatedAt} title={new Date(task.updatedAt).toLocaleString('zh-CN')}>{relativeTime(task.updatedAt)}更新</time>
        </span>
      </div>
    </CardContent>
})
