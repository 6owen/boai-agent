/*
 * [INPUT]: Typed desktop inbox, live Agent updates and shell navigation callbacks.
 * [OUTPUT]: Fixed-height toolbar inbox with a compact header, scroll fade, read actions and the shared upgrade flow.
 * [POS]: Application-wide notification and Agent update controls.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { AgentUpdate, NotificationSnapshot, NotificationTarget } from '@boai/shared/ipc/notifications'
import { errorText, showErrorToast } from '@/components/common'
import { Bell, ChevronRight, Download, LoaderCircle, RefreshCw } from '@/components/icons'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { ScrollFade } from '@/components/ui/scroll-fade'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Inbox = { state?: NotificationSnapshot; check(): void; update(item: AgentUpdate): void; read(ids: string[]): void }
const InboxContext = createContext<Inbox | null>(null)
export const useDesktopNotifications = () => useContext(InboxContext)

export function DesktopNotificationProvider({ api, children }: { api: DesktopApi; children: ReactNode }) {
  const [state, setState] = useState<NotificationSnapshot>()
  const [target, setTarget] = useState<AgentUpdate>()
  useEffect(() => {
    if (!api.notifications) return
    let active = true
    const accept = (next: NotificationSnapshot) => {
      if (active) setState(current => current && current.revision > next.revision ? current : next)
    }
    const unsubscribe = api.subscribe(event => { if (event.type === 'notifications:changed') accept(event.state) })
    void api.notifications.snapshot().then(accept, error => { if (active) showErrorToast(errorText(error)) })
    return () => { active = false; unsubscribe() }
  }, [api])
  const actions = api.notifications
  if (!actions) return children
  const report = (error: unknown) => showErrorToast(errorText(error))
  const check = () => { void actions.checkAgentUpdates().catch(report) }
  const read = (ids: string[]) => { void actions.read(ids).catch(report) }
  const confirm = () => {
    if (!target?.latestVersion) return
    const progress = toast.loading(`正在更新 ${target.name}`, { position: 'top-right' })
    setTarget(undefined)
    void actions.installAgentUpdate({ profileId: target.profileId, profileRevision: target.profileRevision, version: target.latestVersion }).then(
      () => toast.success(`${target.name} 已更新`, { id: progress, position: 'top-right' }),
      error => { toast.dismiss(progress); report(error) },
    )
  }
  return <InboxContext.Provider value={{ state, check, update: setTarget, read }}>
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
  </InboxContext.Provider>
}

const updating = (item?: AgentUpdate) => item?.phase === 'installing' || item?.phase === 'verifying'
const isBusy = (state?: NotificationSnapshot) => !!(state?.checking || state?.agentUpdates.some(updating))
const time = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function AgentUpdateCheckButton() {
  const inbox = useDesktopNotifications()
  if (!inbox) return null
  return <Button variant="secondary" size="sm" disabled={isBusy(inbox.state)} onClick={inbox.check}>
    {inbox.state?.checking ? <LoaderCircle className="spinner" /> : <RefreshCw />}检查 Agent 更新
  </Button>
}

export function AgentUpdateButton({ item, showProgress = false }: { item: AgentUpdate; showProgress?: boolean }) {
  const inbox = useDesktopNotifications()
  if (!inbox || !item.latestVersion || item.blocked) return null
  const running = updating(item)
  const progress = item.phase === 'verifying' ? '核对版本' : '下载中'
  const action = item.phase === 'failed' ? '重试' : '更新'
  return <Button variant="secondary" size="sm" disabled={isBusy(inbox.state)} aria-busy={running} aria-label={running ? progress : `${action} ${item.name}`} onClick={() => inbox.update(item)}>
    {running ? <LoaderCircle className="spinner" /> : <Download />}{running && showProgress ? progress : action}
  </Button>
}

export function NotificationCenter({ onOpen }: { onOpen(target: NotificationTarget): void }) {
  const inbox = useDesktopNotifications()
  const [open, setOpen] = useState(false)
  if (!inbox) return null
  const items = inbox.state?.items ?? []
  const updates = new Map(inbox.state?.agentUpdates.map(item => [item.profileId, item]))
  const unread = items.filter(item => !item.read).map(item => item.id)
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger delay={500} render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="titlebar-no-drag relative shrink-0" aria-label="通知中心" aria-description={unread.length ? `${unread.length} 条未读` : undefined} />} />}>
        <Bell />{unread.length > 0 && <i aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" />}
      </TooltipTrigger>
      <TooltipContent side="bottom">通知中心</TooltipContent>
    </Tooltip>
    <PopoverContent align="end" sideOffset={9} className="h-[360px] max-h-(--available-height) w-[min(23rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
      <div className="flex h-[32px] shrink-0 items-center justify-between gap-2 px-3">
        <PopoverTitle>通知中心</PopoverTitle>
        <Button variant="ghost" size="xs" disabled={!unread.length} onClick={() => inbox.read(unread)}>全部已读</Button>
      </div>
      <ScrollFade className="flex-1 overscroll-contain" aria-label="通知列表">
        {items.length ? <ul className="soft-divide-y m-0 p-0">
          {items.map(item => {
            const update = item.target.kind === 'agent-update' && item.id.startsWith('agent:') ? updates.get(item.target.profileId) : undefined
            return <li key={item.id} className="flex items-center gap-1 px-2 py-1.5">
              <Button variant="ghost" size="content" className="min-w-0 flex-1 justify-start px-2 py-2 text-left" onClick={() => {
                inbox.read([item.id]); setOpen(false); onOpen(item.target)
              }}>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-primary'}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{item.title}</span>
                    {item.detail && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
                    <time dateTime={item.createdAt} className="text-xs text-muted-foreground">{time.format(new Date(item.createdAt))}</time>
                  </span>
                  {!update?.latestVersion && <ChevronRight className="text-muted-foreground" />}
                </span>
              </Button>
              {update && <AgentUpdateButton item={update} showProgress />}
            </li>
          })}
        </ul> : <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground"><Bell aria-hidden="true" size={22} />暂无通知</div>}
      </ScrollFade>
    </PopoverContent>
  </Popover>
}
