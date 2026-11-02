/*
 * [INPUT]: One employee, original task pages and durable batch admission IPC.
 * [OUTPUT]: Select tasks in click order and dispatch once; partial failures retain only failed selections.
 * [POS]: Task-panel batch action; cards, drag gestures and execution queue remain unchanged.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi, Methods } from '@boai/shared/ipc'
import type { TrackedTaskListItem } from '@boai/shared/domain/tracked-tasks'
import { AUTOMATION_ONGOING_STATUSES } from '@boai/shared/domain/automations'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { errorText, showErrorToast } from '@/components/common'
import { TaskStatusIcon } from './employee-task-status'

export function EmployeeTaskBatch({ api, employeeId, open, active, onClose, onDispatched }: {
  api: DesktopApi; employeeId: string; open: boolean; active: boolean; onClose(): void; onDispatched(): void
}) {
  const [items, setItems] = useState<TrackedTaskListItem[]>([]), [next, setNext] = useState<string>()
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false)
  const pending = useRef<Methods['runEmployeeTasks']['input'] | undefined>(undefined), locked = useRef(false), scope = useRef(employeeId)
  useEffect(() => { scope.current = employeeId; pending.current = undefined; locked.current = false; setItems([]); setNext(undefined); setSelected([]); setBusy(false) }, [employeeId])
  useEffect(() => {
    if (!open || !active) return
    let live = true
    setLoading(true)
    void api.request('listEmployeeTasks', { employeeId, includeDone: true, limit: 100 }).then(page => {
      if (live) { setItems(page.items); setNext(page.nextCursor); if (!pending.current) setSelected(current => current.filter(id => page.items.some(item => item.id === id))) }
    }).catch(error => { if (live) showErrorToast(errorText(error)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [api, employeeId, open, active])
  const working = (task: TrackedTaskListItem) => !!task.executionStatus && (AUTOMATION_ONGOING_STATUSES as readonly string[]).includes(task.executionStatus)
  const available = items.filter(task => !working(task)).slice(0, 100), all = available.length > 0 && available.every(task => selected.includes(task.id))
  const execute = async () => {
    if (!active || locked.current || !selected.length) return
    if (!pending.current && selected.some(id => !items.some(task => task.id === id))) { showErrorToast('任务列表已变化，请重新选择'); return }
    locked.current = true; setBusy(true)
    const owner = employeeId
    pending.current ??= { employeeId, requestId: crypto.randomUUID(), tasks: selected.map(id => ({ id, expectedRevision: items.find(task => task.id === id)!.revision })) }
    try {
      const result = await api.request('runEmployeeTasks', pending.current)
      if (scope.current !== owner) return
      pending.current = undefined; onDispatched()
      const failed = result.items.filter(item => 'error' in item)
      setSelected(failed.map(item => item.id))
      if (failed.length) {
        showErrorToast(`有 ${failed.length} 项任务未受理：${failed[0].error}`)
        const refreshed = await Promise.allSettled(failed.map(item => api.request('getEmployeeTask', { employeeId, id: item.id })))
        if (scope.current === owner) setItems(current => current.map(item => {
          const latest = refreshed.find(result => result.status === 'fulfilled' && result.value.task.id === item.id)
          return latest?.status === 'fulfilled' ? { ...item, ...latest.value.task, executionStatus: latest.value.executions.occurrences[0]?.status } : item
        }))
      } else onClose()
    } catch (error) { if (scope.current === owner) showErrorToast(errorText(error)) }
    finally { if (scope.current === owner) { locked.current = false; setBusy(false) } }
  }
  const loadMore = async () => {
    if (!next || loading || busy) return
    setLoading(true)
    try { const page = await api.request('listEmployeeTasks', { employeeId, includeDone: true, limit: 100, cursor: next }); if (scope.current === employeeId) { setItems(current => [...current, ...page.items.filter(item => !current.some(old => old.id === item.id))]); setNext(page.nextCursor) } }
    catch (error) { showErrorToast(errorText(error)) }
    finally { setLoading(false) }
  }
  return <Dialog open={open && active} onOpenChange={value => { if (!value && !busy) onClose() }}><DialogContent aria-describedby={undefined} className="w-[min(600px,calc(100vw-32px))] max-w-none gap-6 p-6 sm:max-w-none">
    <DialogHeader><DialogTitle>批量执行任务</DialogTitle></DialogHeader>
    <Label className="flex items-center gap-3"><Checkbox aria-label="全选当前列表" checked={all} indeterminate={selected.length > 0 && !all} disabled={busy || !!pending.current || !available.length} onCheckedChange={checked => setSelected(checked ? available.slice(0, 100).map(task => task.id) : [])} />全选当前列表<span className="ml-auto text-xs tabular-nums text-muted-foreground">{selected.length} / 100</span></Label>
    <ScrollArea className="max-h-[55dvh]" viewportProps={{ className: 'max-h-[55dvh]', 'aria-label': '选择批量执行任务' }}><div className="space-y-1 pr-3">
      {items.map(task => <Label key={task.id} className="flex min-h-10 items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"><Checkbox aria-label={`选择任务：${task.title}`} checked={selected.includes(task.id)} disabled={busy || !!pending.current || working(task) || selected.length >= 100 && !selected.includes(task.id)} onCheckedChange={checked => setSelected(current => checked ? [...current, task.id] : current.filter(id => id !== task.id))} /><TaskStatusIcon status={task.status} /><span className="min-w-0 flex-1 truncate">{task.title}</span></Label>)}
      {next && <Button variant="ghost" size="sm" disabled={loading || busy} onClick={() => void loadMore()}>加载更多</Button>}
    </div></ScrollArea>
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy || !selected.length} onClick={() => void execute()}>执行所选任务（{selected.length}）</Button></div>
  </DialogContent></Dialog>
}
