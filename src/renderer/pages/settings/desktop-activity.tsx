/*
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [INPUT]: Actual local recorder status and source-bound session details.
 * [OUTPUT]: Card-wrapped recent activity list and recorder settings, with a destructive clear action behind explicit Popover confirmation; no report section.
 * [POS]: Desktop settings card, independent of employee automation/personality logs.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { SettingsLayout, SettingsSection, SettingsCard } from './settings-layout'
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { ActivityStatus, ActivitySettings } from '@shared/domain/desktop-activity'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon, Trash2, RefreshCw } from '@/components/icons'
import { toast } from 'sonner'
import { ActivityRecorderSettings, ActivitySection, ActivitySettingRow } from './activity-recorder-settings'
import { RecentActivityRow } from './activity-session-detail'

export function DesktopActivityPage({ api, active }: { api: DesktopApi; active: boolean }) {
  const [status, setStatus] = useState<ActivityStatus>(), [busy, setBusy] = useState(false), [clearOpen, setClearOpen] = useState(false)
  const lock = useRef(false), generation = useRef(0), activeRef = useRef(active)
  activeRef.current = active
  const refresh = async () => {
    if (!activeRef.current) return
    const sequence = ++generation.current
    const next = await applicationCall<ActivityStatus>(api, 'activity.status')
    if (!activeRef.current || sequence !== generation.current) return
    setStatus(previous => !previous || next.settings.revision >= previous.settings.revision ? next : previous)
  }
  useEffect(() => {
    if (!active) return
    let live = true, reading = false
    void refresh().catch(error => { if (live) toast.error(String(error)) })
    const poll = async () => {
      if (reading || lock.current) return
      reading = true
      try { await refresh() }
      catch { /* Manual refresh exposes failures without repeated background toasts. */ }
      finally { reading = false }
    }
    const timer = setInterval(() => void poll(), 5000)
    window.addEventListener('focus', poll)
    return () => { live = false; generation.current++; clearInterval(timer); window.removeEventListener('focus', poll) }
  }, [api, active])
  const action = async (run: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await run() } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
    finally { try { await refresh() } catch (error) { toast.error(String(error)) } lock.current = false; setBusy(false) }
  }
  const update = (patch: Partial<ActivitySettings>) => void action(() => applicationCall(api, 'activity.configure', { expectedRevision: status!.settings.revision, ...patch }, true))
  return <SettingsLayout title={<>桌面活动与日报<Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label="桌面活动说明" />}><InfoIcon /></TooltipTrigger><TooltipContent>记录保存在本机</TooltipContent></Tooltip></>} actions={<Button size="icon-sm" variant="ghost" disabled={busy} aria-label="刷新桌面活动" onClick={() => void action(async () => {})}><RefreshCw /></Button>}>
    <ActivityRecorderSettings status={status} busy={busy} update={update} permission={(kind, openSettings) => void action(() => applicationCall(api, 'activity.permissions', { kind, openSettings }, true))} openDirectory={() => { if (status?.outputDirectory) void action(() => api.request('openPath', { path: status.outputDirectory! })) }} />
    <SettingsSection title="最近活动">
      <SettingsCard contentClassName="p-2"><div role="list" aria-label="最近活动">
        {!status?.recentSessions?.length && <p className="field-hint py-2">暂无活动记录。</p>}
        {status?.recentSessions?.map(session => <div role="listitem" key={session.id}><RecentActivityRow api={api} active={active} session={session} /></div>)}
      </div></SettingsCard>
    </SettingsSection>
    <ActivitySection title="清理活动数据"><ActivitySettingRow label="活动数据" hint="删除全部活动记录及关联数据，保留采集设置。">
      <Popover open={clearOpen} onOpenChange={setClearOpen}>
        <PopoverTrigger render={<Button variant="destructive" size="sm" disabled={busy || !status?.count && !status?.sessionCount} aria-label="清理活动数据" />}><Trash2 />清理活动数据</PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <PopoverHeader><PopoverTitle>清理全部活动数据？</PopoverTitle><PopoverDescription>将删除全部活动文字、截图、键鼠事件及关联分析和日报，无法撤销。</PopoverDescription></PopoverHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setClearOpen(false)}>取消</Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void action(async () => { await applicationCall(api, 'activity.clear', {}, true); setClearOpen(false) })}>确认清理</Button>
          </div>
        </PopoverContent>
      </Popover>
    </ActivitySettingRow></ActivitySection>
  </SettingsLayout>
}
