/*
 * [INPUT]: Fixed employee and explicit assignment text.
 * [OUTPUT]: Spacious responsive task form; creates one durable pending task with a stable submission identity.
 * [POS]: Employee task dialog; independent of scheduled plan configuration.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useContext, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorText, showErrorToast, GuardContext, useDirty } from '@/components/common'
export function EmployeeTaskForm({ api, employeeId, active, onClose, onSaved }: { api: DesktopApi; employeeId: string; active: boolean; onClose(): void; onSaved(id: string): void }) {
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [busy, setBusy] = useState(false)
  const guard = useContext(GuardContext), clean = useDirty({ title, description })
  const close = () => guard.navigate(onClose)
  const pending = useRef<{ requestId: string; title: string; description: string } | undefined>(undefined), locked = useRef(false)
  const save = async () => {
    if (!active || locked.current || !title.trim() || !description.trim()) return
    locked.current = true; setBusy(true)
    pending.current ??= { requestId: crypto.randomUUID(), title: title.trim(), description: description.trim() }
    try { const task = await api.request('createEmployeeTask', { employeeId, ...pending.current }); clean(); guard.saved(); onSaved(task.id) }
    catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <Dialog open={active} onOpenChange={open => { if (!open && !busy) close() }}><DialogContent aria-describedby={undefined} className="w-[min(760px,calc(100vw-32px))] max-w-none gap-6 p-6 sm:max-w-none">
    <DialogHeader><DialogTitle>创建任务</DialogTitle></DialogHeader>
    <form className="flex flex-col gap-6" onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="flex flex-col gap-2"><Label htmlFor="employee-task-title">任务名称</Label><Input id="employee-task-title" autoFocus maxLength={300} value={title} disabled={busy || !!pending.current} onChange={e => setTitle(e.target.value)} /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="employee-task-description">任务要求</Label><Textarea id="employee-task-description" rows={10} className="h-[min(320px,40dvh)] min-h-32 resize-none" maxLength={40000} value={description} disabled={busy || !!pending.current} onChange={e => setDescription(e.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !title.trim() || !description.trim()}>{busy ? '正在保存…' : pending.current ? '核对本次提交' : '创建任务'}</Button></div>
    </form>
  </DialogContent></Dialog>
}
