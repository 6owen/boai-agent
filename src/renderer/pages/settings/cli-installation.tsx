/*
 * [INPUT]: Desktop-only CLI installation status and native directory selection operations.
 * [OUTPUT]: Compact installation status and explicit actions; usage/connection/path/platform details live in the title icon Tooltip, original reconciliation remains.
 * [POS]: CLI Card within existing desktop settings; errors use global Sonner.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { DesktopApi } from '@shared/ipc'
import type { CliInstallation } from '@shared/ipc/cli-installation'
import { showErrorToast, errorText } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsHelp } from './settings-layout'

const labels: Record<CliInstallation['state'], string> = { 'not-installed': '未安装', installed: '已安装', 'update-available': '可更新到当前应用', conflict: '安装项已被外部修改' }
export function CliInstallationCard({ api, active }: { api: DesktopApi; active: boolean }) {
  const [status, setStatus] = useState<CliInstallation>(), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false)
  const generation = useRef(0), pending = useRef(false)
  useEffect(() => {
    const ticket = ++generation.current
    if (!active) return
    setConfirmed(false)
    void api.request('getCliInstallation', undefined).then(value => { if (ticket === generation.current) { setStatus(value); setConfirmed(true) } }, error => { if (ticket === generation.current) showErrorToast(errorText(error)) })
    return () => { generation.current++ }
  }, [api, active])
  async function act(kind: 'refresh' | 'install' | 'uninstall') {
    if (pending.current || !active || kind !== 'refresh' && (!confirmed || !status)) return
    pending.current = true; setBusy(true)
    const ticket = ++generation.current
    try {
      const value = kind === 'refresh' ? await api.request('getCliInstallation', undefined) : kind === 'install' ? await api.request('installCli', { expectedRevision: status!.revision }) : await api.request('uninstallCli', { expectedRevision: status!.revision })
      if (ticket === generation.current && value) { setStatus(value); setConfirmed(true) }
    } catch (error) {
      if (ticket === generation.current) { showErrorToast(errorText(error)); setConfirmed(false) }
      try { const value = await api.request('getCliInstallation', undefined); if (ticket === generation.current) { setStatus(value); setConfirmed(true) } } catch { /* Keep recovery explicit; never repeat a write. */ }
    } finally { pending.current = false; setBusy(false) }
  }
  return <Card className="mt-6" role="region" aria-label="命令行工具">
    <CardHeader><CardTitle className="flex items-center gap-1">命令行工具<SettingsHelp label="命令行工具说明">
      <p>在终端通过 boai 使用当前应用的员工、会话和任务。安装到 PATH 目录后可直接运行，也可使用命令的完整路径。</p>
      <p>应用在原位置升级后，命令会使用新版本。</p>
      {status && <p>{status.connection.state === 'connected' ? `已连接当前工作空间 · 服务 ${status.connection.version}` : '当前工作空间服务暂不可用'}</p>}
      {status?.commandPath && <p>命令位置：{status.commandPath}</p>}
      {status && !status.supported && <p>当前仅支持在 macOS 安装命令行工具。</p>}
    </SettingsHelp></CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-2">
      <p role="status">{status ? `${labels[status.state]} · CLI ${status.installedVersion ?? status.version}` : '正在读取安装状态…'}</p>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={busy || !confirmed || !status?.supported || status.state === 'conflict' || status.state === 'installed'} onClick={() => void act('install')}>{status?.state === 'update-available' ? '更新命令行工具' : '安装命令行工具'}</Button>
      {status?.canUninstall && <Button size="sm" variant="ghost" disabled={busy || !confirmed} onClick={() => void act('uninstall')}>卸载命令行工具</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('refresh')}>刷新状态</Button>
    </CardFooter>
  </Card>
}
