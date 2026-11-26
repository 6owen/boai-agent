/*
 * [INPUT]: Typed host notices, Agent update state and shell navigation callbacks.
 * [OUTPUT]: Dispatches new host notices through global Sonner and hosts the shared Agent upgrade confirmation.
 * [POS]: Application-wide notification and Agent update controls.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { notify as toast } from '@boai/ui/sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { AgentUpdate, NotificationSnapshot, NotificationTarget } from '@boai/shared/ipc/notifications'
import { errorText, showErrorToast } from '@/components/common'
import { Download, LoaderCircle } from '@/components/icons'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type UpdateControls = { state?: NotificationSnapshot; update(item: AgentUpdate): void }
const NotificationContext = createContext<UpdateControls | null>(null)
export const useDesktopNotifications = () => useContext(NotificationContext)

export function DesktopNotificationProvider({ api, children, onOpen }: { api: Pick<DesktopApi, 'subscribe' | 'notifications'>; children: ReactNode; onOpen(target: NotificationTarget): void }) {
  const [state, setState] = useState<NotificationSnapshot>()
  const [target, setTarget] = useState<AgentUpdate>()
  const delivered = useRef(new Set<string>())
  const open = useRef(onOpen)
  open.current = onOpen
  const actions = api.notifications
  useEffect(() => {
    if (!actions) return
    let active = true
    let revision = -1
    const report = (error: unknown) => { if (active) showErrorToast(errorText(error)) }
    const accept = (next: NotificationSnapshot) => {
      if (!active || revision >= next.revision) return
      revision = next.revision
      setState(next)
      const liveIds = new Set(next.items.map(item => item.id))
      for (const id of delivered.current) {
        if (liveIds.has(id)) continue
        delivered.current.delete(id)
        toast.dismiss(id)
      }
      const pending = new Set(next.pendingIds)
      const presented: string[] = []
      for (const item of [...next.items].reverse()) {
        if (!pending.has(item.id) || delivered.current.has(item.id)) continue
        delivered.current.add(item.id)
        presented.push(item.id)
        toast[item.level ?? 'info'](item.title, {
          id: item.id,
          ...(item.detail ? { description: item.detail } : {}),
          action: { label: '查看', onClick: () => open.current(item.target) },
        })
      }
      if (presented.length) void actions.read(presented).catch(report)
    }
    const unsubscribe = api.subscribe(event => { if (event.type === 'notifications:changed') accept(event.state) })
    void actions.snapshot().then(accept, report)
    return () => { active = false; unsubscribe() }
  }, [api, actions])
  if (!actions) return children
  const confirm = () => {
    if (!target?.latestVersion) return
    const progress = toast.loading(`正在更新 ${target.name}`)
    setTarget(undefined)
    void actions.installAgentUpdate({ profileId: target.profileId, profileRevision: target.profileRevision, version: target.latestVersion }).then(
      () => toast.success(`${target.name} 已更新`, { id: progress }),
      error => { toast.dismiss(progress); showErrorToast(errorText(error)) },
    )
  }
  return <NotificationContext.Provider value={{ state, update: setTarget }}>
    {children}
    <AlertDialog open={!!target} onOpenChange={open => { if (!open) setTarget(undefined) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>更新 {target?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            v{target?.currentVersion} → v{target?.latestVersion}。新版本安装在 BoAI 的独立目录。已有原生会话可能通过历史交接继续，关联定时任务可能需要重新确认授权。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <Button onClick={confirm}>更新 BoAI 中的版本</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </NotificationContext.Provider>
}

const updating = (item?: AgentUpdate) => item?.phase === 'installing' || item?.phase === 'verifying'
const isBusy = (state?: NotificationSnapshot) => !!(state?.checking || state?.agentUpdates.some(updating))

export function AgentUpdateButton({ item }: { item: AgentUpdate }) {
  const controls = useDesktopNotifications()
  if (!controls || !item.latestVersion || item.blocked) return null
  const running = updating(item)
  const progress = item.phase === 'verifying' ? '核对版本' : '下载中'
  const action = item.phase === 'failed' ? '重试' : '更新'
  return <Button variant="secondary" size="sm" disabled={isBusy(controls.state)} aria-busy={running} aria-label={running ? progress : `${action} ${item.name}`} onClick={() => controls.update(item)}>
    {running ? <LoaderCircle className="spinner" /> : <Download />}{action}
  </Button>
}
