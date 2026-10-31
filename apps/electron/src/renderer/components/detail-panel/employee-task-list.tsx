/*
 * [INPUT]: Bounded status pages, shared task actions and dialog navigation.
 * [OUTPUT]: Shared grid gutters center the chevron/status/count/title and align every task row.
 * [OUTPUT]: Compact task rows in independently collapsible status groups.
 * [POS]: Employee right-side task list; shared shadcn scrolling and collapse motion.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useState } from 'react'
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskPage, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { ChevronRight } from '@/components/icons/index'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmployeeTaskMenu } from './employee-task-menu'
import { TaskStatusIcon, taskStatusLabels } from './employee-task-status'
export function EmployeeTaskList({ data, onOpen, onLoadMore }: {
  data: Partial<Record<TrackedTaskStatus, TrackedTaskPage>>; onOpen(id: string): void; onLoadMore(status: TrackedTaskStatus): void
}) {
  const [expanded, setExpanded] = useState<Partial<Record<TrackedTaskStatus, boolean>>>({})
  return <ScrollArea className="mt-14 min-h-0 flex-1" viewportProps={{ className: 'scroll-fade-t scroll-fade-6', 'aria-label': '任务列表滚动区域' }}><div role="tabpanel" aria-label="任务列表" className="flex flex-col gap-2 p-3">
    {EMPLOYEE_TASK_STATUSES.map(status => {
      const page = data[status]
      return <Collapsible key={status} open={expanded[status] ?? !!page?.items.length} onOpenChange={open => setExpanded(current => ({ ...current, [status]: open }))} render={<section aria-label={`${taskStatusLabels[status]}任务`} />}>
        <CollapsibleTrigger render={<Button variant="ghost" size="content" className="grid h-10 w-full grid-cols-[16px_16px_auto_1fr] items-center gap-x-2.5 rounded-md bg-muted/60 px-3 text-sm hover:bg-muted/80" />}><ChevronRight size={14} className="justify-self-center" /><span className="flex size-4 items-center justify-center"><TaskStatusIcon status={status} /></span><span className="font-semibold">{taskStatusLabels[status]}</span><span className="font-normal tabular-nums text-muted-foreground">{page?.items.length ?? 0}{page?.nextCursor ? '+' : ''}</span></CollapsibleTrigger>
        <CollapsibleContent><div className="space-y-0.5 py-1">
          {page?.items.map(task => <EmployeeTaskMenu key={task.id} task={task}><Button data-employee-task-id={task.id} variant="ghost" size="content" className="grid min-h-10 w-full grid-cols-[16px_16px_auto_minmax(0,1fr)] items-center gap-x-2.5 rounded-md px-3 py-2 text-left" aria-label={`打开任务：${task.title}`} onClick={() => onOpen(task.id)}><span className="col-start-2 flex size-4 items-center justify-center"><TaskStatusIcon status={task.status} /></span><span className="w-[9ch] shrink-0 font-mono text-xs text-muted-foreground" title={task.id}>#{task.id.replace(/^task-/, '').slice(0, 8)}</span><span className="min-w-0 truncate text-sm font-medium">{task.title}</span></Button></EmployeeTaskMenu>)}
          {page && !page.items.length && <p className="m-0 py-8 text-center text-sm text-muted-foreground">无任务</p>}
          {page?.nextCursor && <Button variant="ghost" size="sm" className="w-full" onClick={() => onLoadMore(status)}>加载更多</Button>}
        </div></CollapsibleContent>
      </Collapsible>
    })}
  </div></ScrollArea>
}
