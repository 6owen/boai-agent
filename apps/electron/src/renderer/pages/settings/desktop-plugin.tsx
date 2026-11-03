/*
 * [INPUT]: Optional Agent Desktop settings and owner-only connection check.
 * [OUTPUT]: Existing plugin dialog controls and Sonner feedback; no app interaction during checks.
 * [POS]: Desktop plugin configuration, independent of the old computer-use connection.
 * [PROTOCOL]: Update Header and settings/.folder.md on change.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DesktopPluginSettings } from '@boai/shared/plugins/desktop-tools'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { showErrorToast } from '@/components/common'

export function DesktopPluginDialog({ api, onClose }: { api: DesktopApi; onClose(): void }) {
  const [settings, setSettings] = useState<DesktopPluginSettings>(), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api.request('getDesktopPluginSettings', undefined).then(value => { if (active) setSettings(value) }).catch(error => { if (active) showErrorToast(String(error)) })
    return () => { active = false }
  }, [api])
  const save = async () => {
    if (!settings || busy) return
    setBusy(true)
    try { await api.request('saveDesktopPluginSettings', { expectedRevision: settings.revision, config: settings.config }); toast.success('Agent Desktop 配置已保存'); onClose() }
    catch (error) { showErrorToast(String(error)) }
    finally { setBusy(false) }
  }
  const check = async () => {
    setBusy(true)
    try {
      const result = await api.request('testDesktopPlugin', undefined)
      const report = JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}')
      if (!report.ok) throw new Error(report.error?.message ?? 'Agent Desktop 检查失败')
      const permissions = report.data?.permissions
      const missing = Object.entries(permissions ?? {}).filter(([, value]) => (value as { state?: string }).state === 'denied').map(([name]) => name === 'accessibility' ? '辅助功能' : name === 'screen_recording' ? '屏幕录制' : name === 'automation' ? '自动化' : name)
      if (missing.length) showErrorToast(`Agent Desktop 已连接，请在系统设置中授权：${missing.join('、')}`)
      else toast.success('Agent Desktop 已连接')
    } catch (error) { showErrorToast(String(error)) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>Agent Desktop</DialogTitle></DialogHeader>
      <div className="flex items-center justify-between gap-4">
        <Tooltip><TooltipTrigger render={<label htmlFor="desktop-plugin-headed" className="text-sm font-medium" />}>允许前台操作</TooltipTrigger><TooltipContent>允许拖拽、双击和真实键盘输入；这些操作可能切换应用焦点或移动鼠标。</TooltipContent></Tooltip>
        <Switch id="desktop-plugin-headed" checked={settings?.config.allowHeaded ?? false} disabled={!settings || busy} onCheckedChange={allowHeaded => setSettings(value => value && ({ ...value, config: { allowHeaded } }))} />
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { void check() }}>检查连接</Button><Button disabled={!settings || busy} onClick={() => { void save() }}>保存</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
