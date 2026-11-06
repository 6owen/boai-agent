/*
 * [INPUT]: Selected browser plugin and the existing desktop settings API.
 * [OUTPUT]: Independent browser default foreground preference saved by revision with Sonner feedback.
 * [POS]: Plugin configuration dialog; no embedded-browser or retrieval settings are changed.
 * [PROTOCOL]: Update Header and settings/.folder.md on change.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import { browserPluginNames, type BrowserPluginProvider, type BrowserPluginSettings } from '@boai/shared/plugins/browser-tools'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { showErrorToast } from '@/components/common'

export function BrowserPluginDialog({ api, provider, onClose }: { api: DesktopApi; provider: BrowserPluginProvider; onClose(): void }) {
  const [settings, setSettings] = useState<BrowserPluginSettings>(), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api.request('getBrowserPluginSettings', { provider }).then(value => { if (active) setSettings(value) }).catch(error => { if (active) showErrorToast(error instanceof Error ? error.message : String(error)) })
    return () => { active = false }
  }, [api, provider])
  const save = async () => {
    if (!settings || busy) return
    setBusy(true)
    try {
      await api.request('saveBrowserPluginSettings', { provider, expectedRevision: settings.revision, config: settings.config })
      toast.success('浏览器插件配置已保存'); onClose()
    } catch (error) { showErrorToast(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>{browserPluginNames[provider]}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><label htmlFor="browser-plugin-executable" className="text-sm font-medium">浏览器程序</label>
          <Input id="browser-plugin-executable" placeholder="自动选择 Chrome / Chromium" value={settings?.config.executablePath ?? ''} disabled={!settings || busy} onChange={event => setSettings(value => value && ({ ...value, config: { ...value.config, executablePath: event.target.value } }))} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Tooltip><TooltipTrigger render={<label htmlFor="browser-plugin-foreground" className="text-sm font-medium" />}>默认前台运行</TooltipTrigger><TooltipContent>本次明确指定优先；未指定时遵循此配置。关闭后以无头模式运行。</TooltipContent></Tooltip>
          <Switch id="browser-plugin-foreground" checked={!(settings?.config.headless ?? true)} disabled={!settings || busy} onCheckedChange={foreground => setSettings(value => value && ({ ...value, config: { ...value.config, headless: !foreground } }))} />
        </div>
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={!settings || busy} onClick={() => { void save() }}>保存</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
