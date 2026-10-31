/*
 * [INPUT]: Trusted desktop update API and authoritative update events.
 * [OUTPUT]: Current/new version, check/restart actions and release notes in existing settings.
 * [POS]: Update card in desktop settings; errors use Sonner.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import { showErrorToast, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsHelp } from './settings-layout'
import { getSettingsQuery, useSettingsQuery } from '@/stores/settings-query'

export function AppUpdatesCard({ api, active }: { api: DesktopApi; active: boolean }) {
  const query = getSettingsQuery(api, 'app-updates', {
    read: () => api.updates!.snapshot(), staleTime: 60_000, refreshOnFocus: true,
    merge: (previous, next) => previous && previous.revision > next.revision ? previous : next,
    onEvent: (event, current) => { if (event.type === 'app:update') current.accept(event.state) },
  })
  const { data: state } = useSettingsQuery(query, active && !!api.updates)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (active && state?.error) showErrorToast(state.error) }, [active, state?.error])
  if (!api.updates) return null
  const phase = state?.phase
  const working = busy || !state || ['checking', 'downloading', 'preparing', 'installing'].includes(phase!)
  async function act() {
    if (busy || !api.updates || !state) return
    setBusy(true)
    try {
      if (state.phase === 'ready' && state.availableVersion) await api.updates.install(state.availableVersion)
      else query.accept(await api.updates.check())
    } catch (error) { showErrorToast(errorText(error)) }
    finally { setBusy(false) }
  }
  return <Card className="mt-6" aria-label="应用更新">
    <CardHeader><CardTitle className="flex items-center gap-1">应用更新<SettingsHelp label="应用更新说明">
      {state?.disabledReason ?? '后台下载更新，正常退出应用时安装。关闭窗口后仍在后台运行时，不会安装或中断员工任务。'}
      {state?.fallback && <p>此次更新使用完整安装包。</p>}
    </SettingsHelp></CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><span>当前版本</span><span>{state ? `v${state.currentVersion}` : '—'}</span></div>
      {state?.availableVersion && <div className="flex items-center justify-between"><span>新版本</span><span>v{state.availableVersion}</span></div>}
      {(phase === 'downloading' || phase === 'preparing') && <progress className="w-full" aria-label={phase === 'preparing' ? '正在准备更新' : '正在下载更新'} max={100} value={state?.progress} />}
      {state?.releaseNotes && <details><summary className="cursor-pointer text-sm">更新说明</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{state.releaseNotes}</p></details>}
    </CardContent>
    <CardFooter><Button size="sm" variant="secondary" disabled={!active || working || phase === 'disabled'} onClick={() => void act()}>{phase === 'ready' ? '重启并更新' : phase === 'checking' ? '正在检查…' : phase === 'downloading' ? '正在下载…' : phase === 'preparing' ? '正在准备…' : phase === 'installing' ? '正在安装…' : '检查更新'}</Button></CardFooter>
  </Card>
}
