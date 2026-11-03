/*
 * [INPUT]: Original task brief and owner-scoped versioned IPC.
 * [OUTPUT]: Compact title/description editor with explicit save/cancel; focus changes never save or close, conflicts preserve drafts.
 * [POS]: Task property header editor; status updates can coexist with brief edits.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useContext, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorText, showErrorToast, useDirty, GuardContext } from '@/components/common'

export function EmployeeTaskRequirements({ api, task, active, onClose }: { api: DesktopApi; task: TrackedTask; active: boolean; onClose(): void }) {
  const original = useRef({ title: task.title, description: task.description ?? task.note })
  const [title, setTitle] = useState(original.current.title), [description, setDescription] = useState(original.current.description), [busy, setBusy] = useState(false)
  const locked = useRef(false), clean = useDirty({ title, description }), guard = useContext(GuardContext)
  const close = () => { if (!locked.current) guard.navigate(onClose) }
  const save = async () => {
    if (!active || locked.current) return
    if (title === original.current.title && description === original.current.description) { clean(); onClose(); return }
    if (!title.trim()) { showErrorToast('任务名称不能为空'); return }
    if (!description.trim()) { showErrorToast('任务描述不能为空'); return }
    locked.current = true; setBusy(true)
    try {
      const current = (await api.request('getEmployeeTask', { employeeId: task.agentId, id: task.id })).task
      const changes: { title?: string; description?: string } = {}
      if (title.trim() !== original.current.title && current.title !== title.trim()) {
        if (current.title !== original.current.title) throw new Error('任务名称已经改变，请核对最新内容后再修改')
        changes.title = title.trim()
      }
      if (description.trim() !== original.current.description && (current.description ?? current.note) !== description.trim()) {
        if ((current.description ?? current.note) !== original.current.description) throw new Error('任务描述已经改变，请核对最新内容后再修改')
        changes.description = description.trim()
      }
      if (Object.keys(changes).length) await api.request('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.revision, ...changes })
      clean(); guard.saved(); onClose()
    } catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <Dialog open={active} onOpenChange={open => { if (!open) close() }}><DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] max-w-none flex-col gap-4 p-5 sm:max-w-none">
    <DialogHeader><DialogTitle>编辑任务</DialogTitle></DialogHeader>
    <form className="flex min-h-0 flex-col gap-4 overflow-y-auto" onSubmit={event => { event.preventDefault(); void save() }} onKeyDown={event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save() }
    }}>
      <div className="flex flex-col gap-2"><Label htmlFor="employee-task-edit-title">任务名称</Label><Input id="employee-task-edit-title" autoFocus maxLength={300} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></div>
      <div className="flex min-h-0 flex-col gap-2"><Label htmlFor="employee-task-edit-description">任务描述</Label><Textarea id="employee-task-edit-description" value={description} maxLength={40000} rows={6} className="min-h-32 resize-y" disabled={busy} onChange={event => setDescription(event.target.value)} /></div>
      <div className="flex shrink-0 justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !title.trim() || !description.trim()}>保存</Button></div>
    </form>
  </DialogContent></Dialog>
}
