/*
 * [INPUT]: Selected browser plugin and the existing desktop settings API.
 * [OUTPUT]: External configuration refresh advances untouched field baselines and preserves local drafts; conflicting saves require a new explicit decision.
 * [POS]: Plugin configuration dialog; no embedded-browser or retrieval settings are changed.
 * [PROTOCOL]: Update Header and settings/.folder.md on change.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import { browserPluginNames, browserDefaultForeground, mergeBrowserConfigurationDraft, refreshBrowserConfigurationDraft, type BrowserPluginConfig, type BrowserPluginProvider, type BrowserPluginSettings } from '@boai/shared/plugins/browser-tools'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { showErrorToast } from '@/components/common'

export function BrowserPluginDialog({ api, provider, onClose }: { api: DesktopApi; provider: BrowserPluginProvider; onClose(): void }) {
  const [editor, setEditor] = useState<{ base: BrowserPluginConfig; latest: BrowserPluginSettings; draft: BrowserPluginConfig }>(), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setEditor(undefined)
    const refresh = () => { void api.request('getBrowserPluginSettings', { provider }).then(latest => {
      if (!active) return
      setEditor(current => {
        if (current && latest.revision < current.latest.revision) return current
        if (!current || current.draft.headless === current.base.headless && current.draft.executablePath === current.base.executablePath) return { base: latest.config, latest, draft: latest.config }
        const refreshed = refreshBrowserConfigurationDraft(current.base, current.draft, latest.config)
        return { ...current, latest, ...refreshed }
      })
    }).catch(error => { if (active) showErrorToast(error instanceof Error ? error.message : String(error)) }) }
    refresh()
    const unsubscribe = api.subscribe(event => { if (event.type === 'changed') refresh() })
    return () => { active = false; unsubscribe() }
  }, [api, provider])
  const save = async () => {
    if (!editor || busy) return
    setBusy(true)
    try {
      const latest = await api.request('getBrowserPluginSettings', { provider })
      const merged = mergeBrowserConfigurationDraft(editor.base, editor.draft, latest.config)
      if (merged.conflicts.length) {
        setEditor({ base: latest.config, latest, draft: merged.config })
        showErrorToast('配置已被其他入口修改，草稿已保留；请核对后重新保存。')
        return
      }
      await api.request('saveBrowserPluginSettings', { provider, expectedRevision: latest.revision, config: merged.config })
      toast.success('浏览器插件配置已保存'); onClose()
    } catch (error) { showErrorToast(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>{browserPluginNames[provider]}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><label htmlFor="browser-plugin-executable" className="text-sm font-medium">浏览器程序</label>
          <Input id="browser-plugin-executable" placeholder="自动选择 Chrome / Chromium" value={editor?.draft.executablePath ?? ''} disabled={!editor || busy} onChange={event => setEditor(value => value && ({ ...value, draft: { ...value.draft, executablePath: event.target.value } }))} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Tooltip><TooltipTrigger render={<label htmlFor="browser-plugin-foreground" className="text-sm font-medium" />}>默认前台运行</TooltipTrigger><TooltipContent>本次明确指定优先；未指定时遵循此配置。关闭后以无头模式运行。</TooltipContent></Tooltip>
          <Switch id="browser-plugin-foreground" checked={editor ? browserDefaultForeground(editor.draft) : false} disabled={!editor || busy} onCheckedChange={foreground => setEditor(value => value && ({ ...value, draft: { ...value.draft, headless: !foreground } }))} />
        </div>
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={!editor || busy} onClick={() => { void save() }}>保存</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
