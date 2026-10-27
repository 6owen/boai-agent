/*
 * [OUTPUT]: 2026-10-27 原Composer语音控件增加统一快捷键，限定当前输入焦点/窗口与非录入状态。
 * [INPUT]: Active Composer instance, plugin snapshot and trusted desktop voice API.
 * [OUTPUT]: Explicit recording controls and ephemeral transcription preview; navigation/lifecycle cancels.
 * [POS]: Thin Composer adapter; ordinary draft/send flow remains the owner.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { Mic, Square, X, Undo2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { pluginAvailability } from '@boai/shared/plugins/types'
import type { DesktopApi } from '@boai/shared/ipc'
import { shortcuts } from '@/stores/shortcuts'
import { matchShortcut } from '@boai/shared/shortcuts'
import { pluginUsage, usePlugins } from '@/stores/plugins'
import { VoiceController, type VoiceUi } from '@boai/voice-input-plugin/controller'
import type { MentionInputHandle } from './mention-input'
export function useVoiceInput(api: DesktopApi | undefined, editor: RefObject<MentionInputHandle | null>, scope: string, active: boolean, disabled: boolean) {
  const settings = usePlugins(value => value.settings), ready = usePlugins(value => value.ready)
  const enabled = ready && pluginAvailability(applicationPlugins.find(plugin => plugin.id === 'boai.voice-input')!, settings) === 'enabled'
  const instance = useRef(crypto.randomUUID()), owner = useRef<VoiceController | undefined>(undefined)
  const [state, setState] = useState<VoiceUi>({ phase: 'idle', preview: '' })
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!api?.voice || !enabled || !active || disabled) return
    let mounted = true
    const controller = new VoiceController(api.voice, {
      snapshot: () => editor.current?.voiceSnapshot(),
      insert: (anchor, text) => editor.current?.insertVoice(anchor, text),
      replace: (anchor, raw, text) => editor.current?.replaceVoice(anchor, raw, text),
    }, value => { if (mounted) setState(value) }, message => { if (mounted) toast.error(message) })
    owner.current = controller
    const cancel = () => { void controller.cancel() }
    const visibility = () => { if (document.hidden) cancel() }
    const unsubscribe = api.subscribe(event => { if (event.type === 'desktop:lifecycle' && (event.state.locked || event.state.power !== 'awake')) cancel() })
    document.addEventListener('visibilitychange', visibility)
    return () => { mounted = false; owner.current = undefined; void controller.cancel(); unsubscribe(); document.removeEventListener('visibilitychange', visibility); setState({ phase: 'idle', preview: '' }) }
  }, [api, enabled, active, disabled, scope, editor])
  useEffect(() => {
    if (!enabled || !active || disabled) return
    const onKey = (event: KeyboardEvent) => {
      const shortcut = shortcuts.store.getState(), controller = owner.current
      if (!controller || !document.hasFocus() || document.hidden || event.defaultPrevented || shortcut.capturing || shortcut.snapshot?.error || !shortcut.snapshot || matchShortcut(event, shortcut.snapshot) !== 'voiceInput') return
      const overlay = '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="context-menu-content"]'
      if ([...document.querySelectorAll(overlay)].some(node => node.getClientRects().length > 0)) return
      if (controller.state.phase === 'idle' && !editor.current?.hasFocus()) return
      if (controller.state.phase !== 'idle' && controller.state.phase !== 'recording') return
      event.preventDefault()
      if (controller.state.phase === 'recording') void controller.finish()
      else void controller.start(instance.current)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, active, disabled, editor])
  useEffect(() => {
    if (state.phase !== 'recording') return
    setSeconds(0)
    const start = performance.now(), timer = setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [state.phase])
  useEffect(() => state.phase !== 'idle' && enabled ? pluginUsage.acquire('boai.voice-input') : undefined, [state.phase, enabled])
  const cancel = () => { void owner.current?.cancel() }
  if (!api?.voice || !enabled || !active) return { controls: null, preview: null, cancel }
  const running = state.phase !== 'idle'
  return { cancel,
    controls: <>
      <Button variant="ghost" size="icon-sm" round aria-label={state.phase === 'recording' ? '停止录音' : '语音输入'} title={state.phase === 'recording' ? '停止录音' : '语音输入'} disabled={disabled || state.phase === 'starting' || state.phase === 'finishing'} onMouseDown={event => event.preventDefault()} onClick={() => { if (state.phase === 'recording') void owner.current?.finish(); else void owner.current?.start(instance.current) }}>{state.phase === 'recording' ? <Square /> : <Mic />}</Button>
      {state.canRestore && <Button variant="ghost" size="icon-sm" round aria-label="还原语音转写原文" onMouseDown={event => event.preventDefault()} onClick={() => owner.current?.restoreRaw()}><Undo2 /></Button>}
      {running && <><span className="text-xs tabular-nums" aria-label="录音时长">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><Button variant="ghost" size="icon-sm" round aria-label="取消语音输入" onClick={cancel}><X /></Button></>}
    </>,
    preview: (state.preview || state.pending) ? <div className="w-full px-1 py-2 text-sm text-muted-foreground" aria-label={state.pending ? state.partial ? '部分转写' : '待插入转写' : '语音转写预览'}>
      <div className="max-h-32 overflow-auto whitespace-pre-wrap">{state.pending ?? state.preview}</div>
      {state.pending && <div className="flex gap-2 pt-1"><Button variant="ghost" size="xs" onMouseDown={event => event.preventDefault()} onClick={() => owner.current?.insertPending()}>{state.partial ? '插入已确认片段' : '插入当前位置'}</Button><Button variant="ghost" size="xs" onClick={cancel}>丢弃</Button></div>}
    </div> : null,
  }
}
