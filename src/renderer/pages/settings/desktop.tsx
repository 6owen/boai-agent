/*
 * [OUTPUT]: 桌面活动与日报迁至独立设置分类；本页保留后台运行与 CLI。
 * [OUTPUT]: 运行选项增加CLI安装管理Card，复用全局组件及Sonner。
 * [INPUT]: 类型化桌面设置 IPC、变化订阅与共用 Card/Switch。
 * [OUTPUT]: 后台常驻、实际登录项状态与隐藏启动设置；共用有界文档容器，即时保存。
 * [POS]: 设置中的运行选项；保持 BOAI 原组件和样式。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Banner } from '@/components/common'
import type { DesktopApi } from '@shared/ipc'
import type { DesktopPatch, DesktopSettings } from '@shared/ipc/desktop'
import { CliInstallationCard } from './cli-installation'

const loginHints: Record<DesktopSettings['login']['status'], string> = {
  enabled: '已启用系统登录启动。', disabled: '系统登录启动未启用。',
  'requires-approval': '请在系统设置的登录项中允许 BoAI Agent 运行。',
  development: '安装应用后可设置开机启动，开发模式不会修改系统登录项。',
  unsupported: '当前系统暂不支持设置开机启动。', error: '无法读取系统登录项，请稍后重试。',
}
export function DesktopSettingsPage({ api, active }: { api: DesktopApi; active: boolean }) {
  const [settings, setSettings] = useState<DesktopSettings>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!active) return
    let live = true
    const unsubscribe = api.subscribe(event => { if (live && event.type === 'desktop:changed') setSettings(event.settings) })
    void api.request('getDesktopSettings', undefined).then(value => { if (live) setSettings(value) }).catch(error => { if (live) setError(String(error)) })
    return () => { live = false; unsubscribe() }
  }, [api, active])
  const update = async (patch: DesktopPatch) => {
    if (!settings || busy) return
    setBusy(true); setError('')
    try { setSettings(await api.request('updateDesktopSettings', { patch, expectedRevision: settings.revision })) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); try { setSettings(await api.request('getDesktopSettings', undefined)) } catch { /* Keep the last confirmed settings. */ } }
    finally { setBusy(false) }
  }
  const disabled = busy || !settings || Boolean(settings.error)
  return <section className="settings-document"><div className="page-heading"><div><h2>运行选项</h2><p>关闭窗口后继续接收渠道消息和执行定时任务。</p></div></div>
    {error && <Banner>{error}</Banner>}{settings?.error && <Banner>{settings.error}</Banner>}
    <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
      <div className="appearance-row"><label htmlFor="desktop-background">关闭窗口后继续运行</label><Switch id="desktop-background" aria-label="关闭窗口后继续运行" checked={settings?.preferences.runInBackground ?? false} disabled={disabled || !settings?.trayAvailable} onCheckedChange={value => { void update({ runInBackground: value }) }} /></div>
      <div className="appearance-row"><label htmlFor="desktop-login">开机启动</label><Switch id="desktop-login" aria-label="开机启动" checked={settings?.login.enabled ?? false} disabled={disabled || !settings?.login.supported || settings.login.status === 'error'} onCheckedChange={value => { void update({ openAtLogin: value }) }} /></div>
      <div className="appearance-row"><label htmlFor="desktop-hidden">登录后隐藏启动</label><Switch id="desktop-hidden" aria-label="登录后隐藏启动" checked={settings?.preferences.startHidden ?? false} disabled={disabled || !settings?.preferences.runInBackground} onCheckedChange={value => { void update({ startHidden: value }) }} /></div>
    </CardContent></Card>
    <p className="field-hint">{settings ? loginHints[settings.login.status] : '正在读取运行设置…'}</p>
    {settings && !settings.trayAvailable && <p className="field-hint">系统托盘不可用，关闭窗口将按系统默认行为处理。</p>}
    <p className="field-hint">通过系统托盘或菜单栏重新打开窗口；选择「退出 BoAI Agent」会停止运行。电脑需保持开机、联网，休眠期间无法接收消息。</p>
    <CliInstallationCard api={api} active={active} />
  </section>
}
