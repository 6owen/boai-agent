/*
 * [INPUT]: Main 快照、页外保存队列、共用 Card/Switch/Button 和平台按键规则。
 * [OUTPUT]: 四项启停/录入、点击外部自动保存、同一行组合提交；无保存按钮。
 * [POS]: 设置中的快捷键页；页面卸载只结束捕获，不清除失败草稿。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { shortcuts, useShortcuts } from '@/stores/shortcuts'
import { bindingFromKey, shortcutIds, shortcutLabels, shortcutText } from '@shared/shortcuts'

export function ShortcutSettings({ active = true }: { active?: boolean }) {
  const state = useShortcuts(value => value)
  useEffect(() => {
    if (!active) { shortcuts.finish(); return }
    const outside = (event: PointerEvent) => {
      const id = shortcuts.store.getState().capturing
      if (!id) return
      const path = event.composedPath()
      if (path.some(node => node instanceof HTMLElement && (node.dataset.shortcutRecorder === id || node.dataset.shortcutSwitch === id))) return
      shortcuts.finish()
    }
    const keydown = (event: KeyboardEvent) => {
      const current = shortcuts.store.getState()
      if (!current.capturing) return
      event.stopPropagation()
      if (event.key === 'Tab') { shortcuts.finish(); return }
      event.preventDefault()
      if (event.key === 'Escape') { shortcuts.cancel(); return }
      if (!current.captureReady || event.isComposing || event.repeat || ['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'Dead', 'Process', 'Unidentified'].includes(event.key)) return
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && ['Backspace', 'Delete'].includes(event.key)) { shortcuts.record(null); return }
      const binding = bindingFromKey(event, current.snapshot!.platform)
      shortcuts.record(binding ?? null, binding ? undefined : `请使用包含 ${current.snapshot!.platform === 'mac' ? 'Command' : 'Ctrl'} 的单组组合键。`)
    }
    const blur = () => shortcuts.finish()
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', blur)
      shortcuts.finish()
    }
  }, [active])
  const unavailable = !state.snapshot || Boolean(state.snapshot.error) || !active
  return <section className="settings-document">
    <header className="settings-document-heading"><h2>快捷键</h2><Button variant="ghost" size="sm" disabled={unavailable || state.busy.length > 0} onClick={() => { void shortcuts.reset() }}>恢复默认</Button></header>
    <Card className="gap-0 p-0"><CardContent className="appearance-options soft-divide-y">
      {shortcutIds.map(id => {
        const saved = state.snapshot?.preferences[id], draft = state.drafts[id], recording = state.capturing === id, busy = state.busy.includes(id)
        const status = busy ? '正在保存…' : draft?.changedElsewhere ? '已在其他位置修改，请重新核对' : draft?.error || draft?.invalid ? '未保存，请重新录入' : draft ? '待保存' : ''
        return <div className="appearance-row" key={id} aria-busy={busy}>
          <div className="flex min-w-0 items-center gap-3"><span data-shortcut-switch={id}><Switch aria-label={shortcutLabels[id]} checked={saved?.enabled ?? false} disabled={unavailable || busy || state.unknown} onCheckedChange={value => shortcuts.toggle(id, value)} /></span><span>{shortcutLabels[id]}</span></div>
          <div className="flex flex-col items-end gap-1">
            {!state.snapshot ? <Skeleton className="h-9 w-40" /> : <Button variant="outline" size="sm" className={recording ? 'min-w-40 border-primary ring-2 ring-ring' : 'min-w-40'} data-shortcut-recorder={id} aria-label={`修改${shortcutLabels[id]}快捷键`} aria-pressed={recording} disabled={unavailable || busy} onClick={() => { if (!recording) void shortcuts.begin(id) }} onBlur={event => {
              const target = event.relatedTarget
              if (target instanceof HTMLElement && target.closest(`[data-shortcut-switch="${id}"]`)) return
              if (shortcuts.store.getState().capturing === id) shortcuts.finish()
            }}>
              {recording && !state.captureReady ? '正在准备…' : recording && !draft ? '按下组合键' : draft?.invalid ? '请重新录入' : <kbd className="font-mono text-xs">{shortcutText((draft?.value ?? saved!).binding, state.snapshot.platform)}</kbd>}
            </Button>}
            {status && <span className="text-xs text-muted-foreground" role="status">{status}</span>}
          </div>
        </div>
      })}
    </CardContent></Card>
    {state.error && <Button variant="ghost" size="sm" onClick={() => { void shortcuts.reload() }}>重新读取快捷键</Button>}
    {state.unknown && <Button variant="ghost" size="sm" onClick={() => { void shortcuts.flush() }}>核对保存结果</Button>}
  </section>
}
