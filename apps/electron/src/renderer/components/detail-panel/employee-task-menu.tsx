/*
 * [INPUT]: Employee-owned task rows/cards and revision-aware IPC mutations.
 * [OUTPUT]: Neutral opening; deletion uses a standard right-side submenu with cancel/confirm items.
 * [POS]: Employee task actions only; schedule plans and execution history remain intact.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { createContext, useContext, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { EMPLOYEE_TASK_STATUSES, type TrackedTaskListItem, type TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorText, showErrorToast } from '@/components/common'
import { TaskStatusIcon, taskStatusLabels } from './employee-task-status'

type Action = { kind: 'rename' | 'delete'; task: TrackedTaskListItem }
type Actions = { disabled: boolean; action?: Action; pending: boolean; choose(action: Action): void; close(): void; confirm(): void; status(task: TrackedTaskListItem, value: TrackedTaskStatus): void }
const ActionsContext = createContext<Actions | undefined>(undefined)
export function EmployeeTaskMenu({ task, children, surface = 'button' }: { task: TrackedTaskListItem; children: ReactElement; surface?: 'card' | 'button' }) {
  const actions = useContext(ActionsContext), [menuOpen, setMenuOpen] = useState(false)
  const pointerMoved = useRef(false)
  const openingPoint = useRef<{ x: number; y: number } | null>(null)
  if (!actions) return children
  const deleting = actions.action?.kind === 'delete' && actions.action.task.id === task.id
  const ignoreStationaryPointer = (event: { preventBaseUIHandler(): void }) => {
    if (!pointerMoved.current) event.preventBaseUIHandler()
  }
  return <ContextMenu open={menuOpen} onOpenChange={(open, details) => {
    if (deleting && actions.pending) return
    if (open) {
      const event = details.event
      openingPoint.current = 'clientX' in event && 'clientY' in event ? { x: Number(event.clientX), y: Number(event.clientY) } : null
      pointerMoved.current = false
    }
    setMenuOpen(open)
    if (!open && deleting) actions.close()
  }}><ContextMenuTrigger render={children} data-slot={surface} onKeyDown={event => {
    if (actions.disabled || event.defaultPrevented || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return
    event.preventDefault()
    // Use the same library trigger on platforms without a native keyboard context-menu event.
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 16, clientY: rect.top + 20 }))
  }} />
    <ContextMenuContent onPointerMoveCapture={event => {
      // Placement/reveal can emit mouseenter beneath a stationary pointer. Only
      // real movement enables hover focus; keyboard navigation stays with Base UI.
      const point = openingPoint.current
      if (!pointerMoved.current && (!point || Math.abs(event.clientX - point.x) > 1 || Math.abs(event.clientY - point.y) > 1)) pointerMoved.current = true
    }} onMouseMove={ignoreStationaryPointer}>
      <ContextMenuItem disabled={actions.disabled} onMouseMove={ignoreStationaryPointer} onClick={() => actions.choose({ kind: 'rename', task })}>重命名任务</ContextMenuItem>
      <ContextMenuSub><ContextMenuSubTrigger disabled={actions.disabled} onMouseEnter={ignoreStationaryPointer} onMouseMove={ignoreStationaryPointer}>状态</ContextMenuSubTrigger><ContextMenuSubContent>
        <ContextMenuRadioGroup value={task.status} onValueChange={value => actions.status(task, value as TrackedTaskStatus)}>
          {EMPLOYEE_TASK_STATUSES.map(status => <ContextMenuRadioItem key={status} value={status}><TaskStatusIcon status={status} />{taskStatusLabels[status]}</ContextMenuRadioItem>)}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent></ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuSub open={deleting} onOpenChange={open => {
        if (actions.pending) return
        if (open) actions.choose({ kind: 'delete', task })
        else if (deleting) actions.close()
      }}>
        <ContextMenuSubTrigger disabled={actions.disabled && !deleting} onMouseEnter={ignoreStationaryPointer} onMouseMove={ignoreStationaryPointer} className="text-destructive focus:text-destructive data-open:text-destructive">删除任务</ContextMenuSubTrigger>
        <ContextMenuSubContent aria-label="删除任务确认">
          <ContextMenuItem closeOnClick={false} disabled={actions.pending} onClick={() => { actions.close(); setMenuOpen(false) }}>取消</ContextMenuItem>
          <ContextMenuItem variant="destructive" closeOnClick={false} disabled={actions.pending} onClick={actions.confirm}>{actions.pending ? '删除中…' : '确认删除'}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  </ContextMenu>
}
export function EmployeeTaskActions({ api, employeeId, active, disabled, onStatus, onChanged, children }: {
  api: DesktopApi; employeeId: string; active: boolean; disabled: boolean; children: ReactNode
  onStatus(task: TrackedTaskListItem, status: TrackedTaskStatus): void
  onChanged(deletedId?: string): void
}) {
  const [action, setAction] = useState<Action>(), [title, setTitle] = useState(''), [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const close = () => { if (!locked.current) setAction(undefined) }
  const save = async () => {
    if (!active || disabled || locked.current || !action || (action.kind === 'rename' && !title.trim())) return
    locked.current = true; setBusy(true)
    try {
      const input = { employeeId, id: action.task.id, expectedRevision: action.task.revision }
      if (action.kind === 'rename') await api.request('updateEmployeeTask', { ...input, title: title.trim() })
      else await api.request('deleteEmployeeTask', input)
      setAction(undefined); onChanged(action.kind === 'delete' ? action.task.id : undefined)
    } catch (error) { showErrorToast(errorText(error)); onChanged() }
    finally { locked.current = false; setBusy(false) }
  }
  return <ActionsContext.Provider value={{ disabled: disabled || busy || !active, action: active ? action : undefined, pending: busy, close, confirm: () => { void save() }, choose: value => { setTitle(value.task.title); setAction(value) }, status: onStatus }}>
    {children}
    <Dialog open={active && action?.kind === 'rename'} onOpenChange={open => { if (!open) close() }}><DialogContent aria-describedby={undefined} className="w-[min(560px,calc(100vw-32px))] max-w-none gap-6 p-6 sm:max-w-none">
      <DialogHeader><DialogTitle>重命名任务</DialogTitle></DialogHeader>
      <form className="flex flex-col gap-6" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="flex flex-col gap-2"><Label htmlFor="employee-task-rename">任务名称</Label><Input id="employee-task-rename" autoFocus onFocus={e => e.currentTarget.select()} maxLength={300} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || disabled || !title.trim() || title.trim() === action?.task.title}>保存</Button></div>
      </form>
    </DialogContent></Dialog>
  </ActionsContext.Provider>
}
