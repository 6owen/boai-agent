/*
 * [INPUT]: Explicit microphone authorization, configured device ID and trusted voice lease API.
 * [OUTPUT]: Device picker with missing-device visibility; temporary authorization streams close on every exit.
 * [POS]: Voice settings microphone field; never starts ASR, stores audio or chooses a fallback device.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { VoiceApi } from '@boai/shared/plugins/voice-input'
import { openVoiceMicrophone } from '@boai/voice-input-plugin/capture'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { ConnectionSettingRow } from './connection-layout'
import { getDesktopClient } from '@/services/request/desktop-client'

export function VoiceMicrophone({ voice, active, enabled, disabled, value, onChange }: { voice?: VoiceApi; active: boolean; enabled: boolean; disabled: boolean; value: string; onChange(value: string): void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [checking, setChecking] = useState(false)
  const pending = useRef<AbortController | undefined>(undefined), mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort() } }, [])
  useEffect(() => {
    if (!active || !enabled || disabled) { pending.current?.abort(); return }
    const hidden = () => { if (document.hidden) pending.current?.abort() }
    const unsubscribe = getDesktopClient()?.subscribe(event => { if (event.type === 'desktop:lifecycle' && (event.state.locked || event.state.power !== 'awake')) pending.current?.abort() })
    document.addEventListener('visibilitychange', hidden)
    return () => { pending.current?.abort(); unsubscribe?.(); document.removeEventListener('visibilitychange', hidden) }
  }, [active, enabled, disabled])
  useEffect(() => {
    if (!active || !navigator.mediaDevices) return
    let current = true
    const refresh = () => { void navigator.mediaDevices.enumerateDevices().then(list => { if (current) setDevices(list.filter(device => device.kind === 'audioinput')) }).catch(() => {}) }
    refresh(); navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => { current = false; navigator.mediaDevices.removeEventListener('devicechange', refresh) }
  }, [active])
  const authorize = async () => {
    if (!voice || pending.current || !active || !enabled || disabled) return
    const controller = new AbortController(), token = crypto.randomUUID(), signal = controller.signal
    pending.current = controller; setChecking(true)
    const release = () => { void voice.microphoneAccess({ token, active: false }).catch(() => {}) }
    const cancelled = () => {
      release()
      if (pending.current === controller) { pending.current = undefined; if (mounted.current) setChecking(false) }
      if (signal.reason?.name === 'TimeoutError' && mounted.current) toast.error('麦克风授权等待超时，请重试')
    }
    signal.addEventListener('abort', cancelled, { once: true })
    const timer = setTimeout(() => controller.abort(new DOMException('麦克风授权等待超时', 'TimeoutError')), 60_000)
    let close: (() => void) | undefined
    try {
      await voice.microphoneAccess({ token, active: true }); signal.throwIfAborted()
      // The probe uses the system default to obtain permission even if the saved device was unplugged.
      const microphone = await openVoiceMicrophone(signal); close = microphone.close
      const list = await navigator.mediaDevices.enumerateDevices(); signal.throwIfAborted()
      if (mounted.current) { setDevices(list.filter(device => device.kind === 'audioinput')); toast.success('麦克风授权完成，设备已刷新') }
    } catch (error) { if (!signal.aborted && mounted.current) toast.error(error instanceof Error ? error.message : '无法读取麦克风') }
    finally {
      close?.(); clearTimeout(timer); signal.removeEventListener('abort', cancelled); release()
      if (pending.current === controller) { pending.current = undefined; if (mounted.current) setChecking(false) }
    }
  }
  const options = [{ value: '', label: '系统默认麦克风' }, ...devices.filter(device => device.deviceId && device.deviceId !== 'default').map((device, index) => ({ value: device.deviceId, label: device.label || `麦克风 ${index + 1}` }))]
  if (value && !options.some(option => option.value === value)) options.push({ value, label: '已选设备不可用，请授权刷新或重新选择' })
  return <ConnectionSettingRow label="麦克风" hint="指定设备不可用时会停止并提示，不会自动改用其他设备。授权会短暂打开系统默认麦克风以读取设备，随后立即关闭；不会发送或保存音频。">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SelectField aria-label="麦克风" className="min-w-0 flex-1" disabled={disabled || checking} value={value} options={options} onValueChange={onChange} />
      {checking ? <Button type="button" variant="ghost" size="sm" onClick={() => pending.current?.abort()}>取消授权</Button> : <Button type="button" variant="secondary" size="sm" disabled={disabled || !enabled || !voice} onClick={() => void authorize()}>授权并刷新设备</Button>}
    </div>
  </ConnectionSettingRow>
}
