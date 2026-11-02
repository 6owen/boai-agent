/*
 * [INPUT]: Original task brief and owner-scoped versioned IPC.
 * [OUTPUT]: Edit requirements in place, save on blur and preserve drafts on conflict; never starts execution.
 * [POS]: Task conversation brief editor; status updates can coexist with brief edits.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { useContext, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import { Textarea } from '@/components/ui/textarea'
import { errorText, showErrorToast, useDirty, GuardContext } from '@/components/common'

export function EmployeeTaskRequirements({ api, task, active, onClose }: { api: DesktopApi; task: TrackedTask; active: boolean; onClose(): void }) {
  const original = useRef(task.description ?? task.note), [draft, setDraft] = useState(original.current), [busy, setBusy] = useState(false)
  const locked = useRef(false), cancelled = useRef(false), clean = useDirty(draft), guard = useContext(GuardContext)
  const save = async () => {
    if (!active || locked.current || cancelled.current) return
    if (draft === original.current) { clean(); onClose(); return }
    if (!draft.trim()) { showErrorToast('任务要求不能为空'); return }
    locked.current = true; setBusy(true)
    try {
      const current = (await api.request('getEmployeeTask', { employeeId: task.agentId, id: task.id })).task
      if ((current.description ?? current.note) !== draft.trim()) {
        if ((current.description ?? current.note) !== original.current) throw new Error('任务要求已经改变，请核对最新内容后再修改')
        await api.request('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.revision, description: draft.trim() })
      }
      clean(); guard.saved(); onClose()
    } catch (error) { showErrorToast(errorText(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <Textarea autoFocus aria-label="编辑任务要求" value={draft} maxLength={40000} rows={10} className="min-h-40 resize-y" disabled={busy} onChange={event => setDraft(event.target.value)} onBlur={() => void save()} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; clean(); onClose() }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.blur() }
  }} />
}
