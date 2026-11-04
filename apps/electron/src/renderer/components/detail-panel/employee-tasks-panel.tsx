/*
 * [OUTPUT]: 清空按员工/状态调用原子全分页接口，刷新卡片与分页；在途保留及清空数量沿Sonner反馈。
 * [OUTPUT]: 2026-11-04外部任务定位保留消息身份交给原任务Dialog；手动选卡不携带其他任务的定位。
 * [OUTPUT]: 仅从各列/分组新增任务并继承状态；header保留显示及视图切换，列隐藏动作幂等。
 * [OUTPUT]: Pending status identifies only its changed card; shared board DOM and unaffected pages remain mounted.
 * [INPUT]: Employee-owned task pages and shared task-session renderer.
 * [OUTPUT]: ReUI board commits receive status-save acknowledgments; local order remains a view preference.
 * [OUTPUT]: Collapsible status list and shared card/row menus; revision-aware mutations and split task dialogs.
 * [POS]: Employee main-chat right-side task panel; scheduled-plan page remains separate.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { createContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Snapshot } from '@boai/shared/domain'
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskPage, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DetailPanelHeader } from '@/components/common/detail-panel-header'
import { Loading, errorText, showErrorToast } from '@/components/common'
import { EmployeeTaskDetail, type EmployeeTaskDetailProps } from './employee-task-detail'
import { EmployeeTaskForm } from './employee-task-form'
import { EmployeeTaskBoard, projectTaskMove } from './employee-task-board'
import { EmployeeTaskList } from './employee-task-list'
import { EmployeeTaskActions } from './employee-task-menu'
import { EmployeeTaskDisplay, readHiddenTaskColumns, taskVisibilityKey } from './employee-task-display'
import type { TaskColumnClear } from './employee-task-display'
import type { DetailTarget } from './tabs-state'
export const EmployeeTasksNavigation = createContext<(employeeId: string) => void>(() => {})
type Props = Pick<EmployeeTaskDetailProps, 'onSource' | 'renderChat' | 'onMaterials' | 'onContext'> & { api: DesktopApi; snapshot: Snapshot; employeeId: string; active: boolean; target: Extract<DetailTarget, { type: 'employee-tasks' }> }
export function EmployeeTasksPanel({ api, snapshot, employeeId, target, active, ...detail }: Props) {
  const [selected, setSelected] = useState<{ id?: string; occurrenceId?: string; focusMessage?: { id: string; requestId: string } } | undefined>(target.taskId || target.occurrenceId ? { id: target.taskId, occurrenceId: target.occurrenceId, focusMessage: target.focusMessage } : undefined)
  const [creating, setCreating] = useState<TrackedTaskStatus>(), [view, setView] = useState('board')
  const [visibility, setVisibility] = useState<Record<string, TrackedTaskStatus[]>>({})
  const hidden = visibility[employeeId] ?? readHiddenTaskColumns(employeeId)
  const [data, setData] = useState<Partial<Record<TrackedTaskStatus, TrackedTaskPage>>>({}), [pages, setPages] = useState<Partial<Record<TrackedTaskStatus, number>>>({}), [revision, setRevision] = useState(0), [failed, setFailed] = useState(false)
  const [changing, setChanging] = useState<{ task: TrackedTaskPage['items'][number]; status: TrackedTaskStatus }>()
  const [clearing, setClearing] = useState(false)
  const busy = !!changing || clearing
  const statusLocked = useRef(false)
  useEffect(() => { setSelected(target.taskId || target.occurrenceId ? { id: target.taskId, occurrenceId: target.occurrenceId, focusMessage: target.focusMessage } : undefined) }, [target.requestId, target.taskId, target.occurrenceId, target.focusMessage])
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined
    void Promise.all(EMPLOYEE_TASK_STATUSES.map(async status => {
      const items: TrackedTaskPage['items'] = []; let cursor: string | undefined
      for (let page = 0; page < (pages[status] ?? 1); page++) {
        const result = await api.request('listEmployeeTasks', { employeeId, status, limit: 30, cursor })
        if (!live) return
        items.push(...result.items); cursor = result.nextCursor
        if (!cursor) break
      }
      return [status, { items, nextCursor: cursor }] as const
    })).then(results => { if (live) { setData(Object.fromEntries(results.filter(value => !!value))); setFailed(false) } }).catch(error => { if (live) { setFailed(true); showErrorToast(errorText(error)) } })
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed' && !timer) timer = setTimeout(() => setRevision(v => v + 1), 150) })
    return () => { live = false; clearTimeout(timer); unsubscribe() }
  }, [api, employeeId, active, pages, revision])
  const employee = snapshot.agents.find(a => a.id === employeeId)
  if (!employee) return <p className="empty-note">该员工已不存在。</p>
  const changeStatus = async (task: TrackedTaskPage['items'][number], status: TrackedTaskStatus) => {
    if (!active || statusLocked.current || task.status === status) return false
    statusLocked.current = true
    setChanging({ task, status })
    try { const saved = await api.request('updateEmployeeTask', { employeeId, id: task.id, expectedRevision: task.revision, status }); setData(current => projectTaskMove(current, { ...task, ...saved }, saved.status)); setRevision(v => v + 1); return true }
    catch (error) { showErrorToast(errorText(error)); setRevision(v => v + 1); return false }
    finally { statusLocked.current = false; setChanging(undefined) }
  }
  const clearColumn: TaskColumnClear = async (status, requestId) => {
    if (!active || statusLocked.current) return false
    statusLocked.current = true; setClearing(true)
    try {
      const result = await api.request('clearEmployeeTasks', { employeeId, status, requestId })
      const deleted = new Set(result.deletedIds)
      setData(current => Object.fromEntries(Object.entries(current).map(([key, page]) => [key, { ...page, items: page.items.filter(task => !deleted.has(task.id)) }])))
      setSelected(current => current?.id && deleted.has(current.id) ? undefined : current)
      setPages(current => ({ ...current, [status]: 1 }))
      toast.success(result.skippedIds.length ? `已清空 ${result.deletedIds.length} 个任务，保留 ${result.skippedIds.length} 个正在执行或等待处理的任务` : `已清空 ${result.deletedIds.length} 个任务`)
      return true
    } catch (error) { showErrorToast(errorText(error)); return false }
    finally { statusLocked.current = false; setClearing(false); setRevision(v => v + 1) }
  }
  const displayed = changing ? projectTaskMove(data, changing.task, changing.status) : data
  const saveVisibility = (next: TrackedTaskStatus[]) => {
    setVisibility(current => ({ ...current, [employeeId]: next }))
    try { localStorage.setItem(taskVisibilityKey(employeeId), JSON.stringify(next)) } catch (error) { showErrorToast(errorText(error)) }
  }
  const toggleColumn = (status: TrackedTaskStatus) => saveVisibility(hidden.includes(status) ? hidden.filter(value => value !== status) : [...hidden, status])
  const hideColumn = (status: TrackedTaskStatus) => saveVisibility(hidden.includes(status) ? hidden : [...hidden, status])
  const controls = <><EmployeeTaskDisplay hidden={hidden} disabled={!active || busy} onToggle={toggleColumn} /><TabsList size="sm" aria-label="任务视图"><TabsTrigger value="board">看板</TabsTrigger><TabsTrigger value="list">列表</TabsTrigger></TabsList></>
  return <EmployeeTaskActions api={api} employeeId={employeeId} active={active} disabled={busy} onStatus={(task, status) => void changeStatus(task, status)} onChanged={deletedId => { if (deletedId && selected?.id === deletedId) setSelected(undefined); setRevision(v => v + 1) }}><Tabs value={view} onValueChange={value => { if (value === 'board' || value === 'list') setView(value) }} className="skill-detail-panel h-full min-h-0 w-full gap-0" aria-label={`${employee.name}的任务`} data-employee-tasks={employeeId}>
    <DetailPanelHeader title={`${employee.name} · 任务`} actions={controls} />
    {!data.pending && !failed ? <div className="mt-14 p-6"><Loading>正在读取任务…</Loading></div> : failed ? <div className="mt-14 p-6"><Button variant="secondary" onClick={() => setRevision(v => v + 1)}>重试读取任务</Button></div> : view === 'board' ? <EmployeeTaskBoard key={employee.id} employee={employee} data={displayed} hidden={hidden} changing={busy || !active} changingTaskId={changing?.task.id} onOpen={id => setSelected({ id })} onCreate={setCreating} onHide={hideColumn} onClear={clearColumn} onStatus={changeStatus} onLoadMore={status => setPages(v => ({ ...v, [status]: (v[status] ?? 1) + 1 }))} /> : <EmployeeTaskList data={displayed} hidden={hidden} disabled={busy || !active} onOpen={id => setSelected({ id })} onCreate={setCreating} onHide={hideColumn} onClear={clearColumn} onLoadMore={status => setPages(v => ({ ...v, [status]: (v[status] ?? 1) + 1 }))} />}
    {selected && <EmployeeTaskDetail key={selected.id ?? selected.occurrenceId} {...detail} {...selected} api={api} snapshot={snapshot} employeeId={employeeId} active={active} onBack={() => { setSelected(undefined); setRevision(v => v + 1) }} />}
    {creating && <EmployeeTaskForm api={api} employeeId={employeeId} initialStatus={creating} active={active} onClose={() => setCreating(undefined)} onSaved={id => { setCreating(undefined); setSelected({ id }); setRevision(v => v + 1) }} />}
  </Tabs></EmployeeTaskActions>
}
