/*
 * [OUTPUT]: 共用Zustand读取缓存；短时重进复用已确认快照，活跃轮询/窗口聚焦复核权限，保存后强制刷新。
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [INPUT]: Actual local recorder status and source-bound session details.
 * [OUTPUT]: Card-wrapped recent activity list and recorder settings, with a destructive clear action behind explicit Popover confirmation; no report section.
 * [POS]: Desktop settings card, independent of employee automation/personality logs.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { SettingsLayout, SettingsSection, SettingsCard } from './settings-layout'
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { ActivityStatus, ActivitySettings } from '@boai/shared/domain/desktop-activity'
import { applicationCall } from '@/components/common/application-client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InfoIcon, Trash2, RefreshCw } from '@/components/icons'
import { toast } from 'sonner'
import { ActivityRecorderSettings, ActivitySection, ActivitySettingRow } from './activity-recorder-settings'
import { RecentActivityRow } from './activity-session-detail'
import { getSettingsQuery, useSettingsQuery } from '@/stores/settings-query'

export function DesktopActivityPage({ api, active }: { api: DesktopApi; active: boolean }) {
  const query = getSettingsQuery<ActivityStatus>(api, 'desktop-activity', {
    read: () => applicationCall<ActivityStatus>(api, 'activity.status'), staleTime: 5000, refreshOnFocus: true,
    merge: (previous, next) => previous && next.settings.revision < previous.settings.revision ? previous : next,
    onEvent: (event, cache) => { if (event.type === 'changed' && !event.conversationId) cache.invalidate() },
  })
  const { data: status } = useSettingsQuery(query, active)
  const [busy, setBusy] = useState(false), [clearOpen, setClearOpen] = useState(false)
  const lock = useRef(false), current = useRef({ api, active })
  current.current = { api, active }
  useEffect(() => {
    current.current = { api, active }
    return () => { current.current = { api, active: false } }
  }, [api, active])
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => { if (!lock.current) void query.ensure({ silent: true }) }, 5000)
    return () => clearInterval(timer)
  }, [query, active])
  const action = async (run: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await run() } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
    finally {
      if (current.current.api === api && current.current.active) await query.refresh()
      else query.invalidate()
      lock.current = false; setBusy(false)
    }
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
