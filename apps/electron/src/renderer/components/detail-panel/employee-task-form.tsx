/*
 * [INPUT]: Fixed employee and explicit assignment text.
 * [OUTPUT]: 任意状态表单创建只保存；会话模式以原始输入建任务并开始独立会话执行，分阶段沿稳定请求重试。
 * [POS]: Employee task dialog; independent of scheduled plan configuration.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { useContext, useRef, useState } from 'react'
import type { DesktopApi, Methods } from '@boai/shared/ipc'
import type { TrackedTaskStatus } from '@boai/shared/domain/tracked-tasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorText, showErrorToast, GuardContext, useDirty } from '@/components/common'
import { EmployeeTaskStatus } from './employee-task-status'
export function EmployeeTaskForm({ api, employeeId, initialStatus = 'pending', active, onClose, onSaved }: { api: DesktopApi; employeeId: string; initialStatus?: TrackedTaskStatus; active: boolean; onClose(): void; onSaved(id: string): void }) {
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [prompt, setPrompt] = useState(''), [conversation, setConversation] = useState(false), [status, setStatus] = useState(initialStatus), [busy, setBusy] = useState(false)
  const guard = useContext(GuardContext), clean = useDirty({ title, description, prompt, status })
  const close = () => guard.navigate(onClose)
  const pending = useRef<{ create: Methods['createEmployeeTask']['input']; run?: Methods['runEmployeeTask']['input'] } | undefined>(undefined), locked = useRef(false)
  const valid = conversation ? !!prompt.trim() : !!title.trim() && !!description.trim()
  const save = async () => {
    if (!active || locked.current || !valid) return
    locked.current = true; setBusy(true)
    pending.current ??= { create: { employeeId, requestId: crypto.randomUUID(), status, ...(conversation ? { description: prompt.trim(), conversation: true } : { title: title.trim(), description: description.trim() }) } }
    try {
      const task = await api.request('createEmployeeTask', pending.current.create)
      if (pending.current.create.conversation) {
        pending.current.run ??= { employeeId, id: task.id, expectedRevision: task.revision, requestId: pending.current.create.requestId }
        await api.request('runEmployeeTask', pending.current.run)
      }
      clean(); guard.saved(); onSaved(task.id)
    }
    catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <Dialog open={active} onOpenChange={open => { if (!open && !busy) close() }}><DialogContent aria-describedby={undefined} className="w-[min(760px,calc(100vw-32px))] max-w-none gap-6 p-6 sm:max-w-none">
    <DialogHeader><DialogTitle>{conversation ? '创建任务会话' : '创建任务'}</DialogTitle></DialogHeader>
    <form className="flex flex-col gap-6" onSubmit={event => { event.preventDefault(); void save() }}>
      <EmployeeTaskStatus status={status} disabled={busy || !!pending.current} onChange={setStatus} />
      {conversation ? <div className="flex flex-col gap-2"><Label htmlFor="employee-task-prompt">交给员工的事情</Label><Textarea id="employee-task-prompt" autoFocus rows={12} className="h-[min(360px,45dvh)] min-h-32 resize-none" maxLength={40000} value={prompt} disabled={busy || !!pending.current} onChange={e => setPrompt(e.target.value)} /></div> : <>
        <div className="flex flex-col gap-2"><Label htmlFor="employee-task-title">任务名称</Label><Input id="employee-task-title" autoFocus maxLength={300} value={title} disabled={busy || !!pending.current} onChange={e => setTitle(e.target.value)} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="employee-task-description">任务要求</Label><Textarea id="employee-task-description" rows={10} className="h-[min(320px,40dvh)] min-h-32 resize-none" maxLength={40000} value={description} disabled={busy || !!pending.current} onChange={e => setDescription(e.target.value)} /></div>
      </>}
      <div className="flex items-center justify-between gap-2"><Button type="button" variant="ghost" disabled={busy || !!pending.current} onClick={() => { if (!conversation && !prompt) setPrompt([title, description].filter(Boolean).join('\n\n')); setConversation(value => !value) }}>{conversation ? '表单创建' : '会话创建'}</Button><div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>取消</Button><Button type="submit" disabled={busy || !valid}>{pending.current ? '核对本次提交' : conversation ? '创建会话' : '创建任务'}</Button></div></div>
    </form>
  </DialogContent></Dialog>
}
