/*
 * [OUTPUT]: 页面布局复用settings-layout，标题/分组留白与卡片/设置行统一，原业务回调保持。
 * [INPUT]: Main 快照、页外保存队列、共用 Card/Switch/Button 和平台按键规则。
 * [OUTPUT]: 五项启停/录入（含语音输入）、clickoutside自动保存；不渲染保存/准备/错误状态文案，保存成功和失败由页外队列沿Sonner提示，保留原恢复动作。
 * [POS]: 设置中的快捷键页；页面卸载只结束捕获，不清除失败草稿。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { SettingsLayout, SettingsCard, SettingsRow } from './settings-layout'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { shortcuts, useShortcuts } from '@/stores/shortcuts'
import { bindingFromKey, shortcutIds, shortcutLabels, shortcutText } from '@boai/shared/shortcuts'

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
  return <SettingsLayout title="快捷键" actions={<Button variant="ghost" size="sm" disabled={unavailable || state.busy.length > 0} onClick={() => { void shortcuts.reset() }}>恢复默认</Button>}>
    <SettingsCard>
      {shortcutIds.map(id => {
        const saved = state.snapshot?.preferences[id], draft = state.drafts[id], recording = state.capturing === id, busy = state.busy.includes(id)
        return <SettingsRow key={id} aria-busy={busy}>
          <div className="flex min-w-0 items-center gap-3"><span data-shortcut-switch={id}><Switch aria-label={shortcutLabels[id]} checked={saved?.enabled ?? false} disabled={unavailable || busy || state.unknown} onCheckedChange={value => shortcuts.toggle(id, value)} /></span><span>{shortcutLabels[id]}</span></div>
          {!state.snapshot ? <Skeleton className="h-9 w-40" /> : <Button variant="outline" size="sm" className={recording ? 'min-w-40 border-primary ring-2 ring-ring' : 'min-w-40'} data-shortcut-recorder={id} aria-label={`修改${shortcutLabels[id]}快捷键`} aria-pressed={recording} disabled={unavailable || busy} onClick={() => { if (!recording) void shortcuts.begin(id) }} onBlur={event => {
              const target = event.relatedTarget
              if (target instanceof HTMLElement && target.closest(`[data-shortcut-switch="${id}"]`)) return
              if (shortcuts.store.getState().capturing === id) shortcuts.finish()
            }}>
            {recording && state.captureReady && (!draft || draft.invalid) ? '按下组合键' : <kbd className="font-mono text-xs">{shortcutText((draft?.invalid ? saved! : draft?.value ?? saved!).binding, state.snapshot.platform)}</kbd>}
          </Button>}
        </SettingsRow>
      })}
    </SettingsCard>
    {state.error && <Button variant="ghost" size="sm" onClick={() => { void shortcuts.reload() }}>重新读取快捷键</Button>}
    {state.unknown && <Button variant="ghost" size="sm" onClick={() => { void shortcuts.flush() }}>核对保存结果</Button>}
  </SettingsLayout>
}
