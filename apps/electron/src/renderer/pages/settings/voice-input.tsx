/*
 * [OUTPUT]: 2026-10-27 语音插件配置Dialog；本地模型、在线服务、独立文字整理及手工术语。
 * [INPUT]: Explicit voice configuration, model installation and existing text-model connections.
 * [OUTPUT]: Optional local/online ASR, separately opt-in refinement and manually maintained terminology.
 * [POS]: Voice application-plugin settings; failure feedback uses Sonner.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Connection } from '@boai/shared/domain'
import type { VoiceSnapshot, VoiceSettings } from '@boai/voice-input-plugin/protocol'
import { getDesktopClient } from '@/services/request/desktop-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Switch } from '@/components/ui/switch'
import { Dialog } from '@/components/ui/dialog'
import { ConnectionDialogLayout, ConnectionForm, ConnectionSettingRow } from './connection-layout'

export function VoiceInputSettings({ onClose }: { onClose(): void }) {
  const api = getDesktopClient(), voice = api?.voice
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(), [settings, setSettings] = useState<VoiceSettings>()
  const [connections, setConnections] = useState<Connection[]>([]), [key, setKey] = useState<string>(), [terms, setTerms] = useState('')
  const [saving, setSaving] = useState(false), [downloading, setDownloading] = useState(false)
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : '语音设置操作失败')
  useEffect(() => {
    let active = true
    if (!voice || !api) return
    void Promise.all([voice.snapshot(), api.request('snapshot', undefined)]).then(([state, app]) => {
      if (!active) return
      if (state.diagnostic) toast.error(state.diagnostic)
      setSnapshot(state); setSettings(state.settings); setTerms(state.settings.terms.map(term => [term.word, ...term.aliases].join(' | ')).join('\n')); setConnections(app.connections.filter(connection => connection.provider !== 'anthropic' && connection.api !== 'responses' && !connection.gateway))
    }).catch(fail)
    return () => { active = false }
  }, [voice, api])
  useEffect(() => {
    if (!downloading || !voice) return
    const timer = setInterval(() => { void voice.snapshot().then(setSnapshot).catch(() => {}) }, 700)
    return () => clearInterval(timer)
  }, [downloading, voice])
  const save = async () => {
    if (!voice || !settings || !snapshot) return
    setSaving(true)
    try {
      const result = await voice.configure({ expectedRevision: snapshot.settings.revision, settings: {
        mode: settings.mode, online: { endpoint: settings.online.endpoint.trim(), model: settings.online.model.trim() }, refinement: settings.refinement,
        terms: terms.split('\n').map(line => line.split('|').map(word => word.trim()).filter(Boolean)).filter(parts => parts.length).map(([word, ...aliases]) => ({ word: word!, aliases })),
      }, ...(key !== undefined ? { apiKey: key } : {}) })
      setSnapshot(result); setSettings(result.settings); setKey(undefined); toast.success('语音输入设置已保存'); onClose()
    } catch (error) { fail(error); await voice.snapshot().then(setSnapshot).catch(() => {}) }
    finally { setSaving(false) }
  }
  const download = async (action: 'start' | 'cancel' | 'remove') => {
    if (!voice) return
    if (action === 'start') setDownloading(true)
    try { setSnapshot(await voice.download(action)) } catch (error) { if (action !== 'cancel') fail(error) }
    finally { if (action !== 'remove') setDownloading(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
    <ConnectionDialogLayout choosing={false} label="语音输入" title="语音输入设置" illustration={null} showIntro={false} closeLabel="关闭语音设置" working={saving} onClose={onClose} finalFocus={false} scrollBody>
      <ConnectionForm disabled={saving || !settings || snapshot?.readOnly === true} onSubmit={event => { event.preventDefault(); void save() }} footer={<Button type="submit" disabled={saving || !settings || snapshot?.readOnly === true}>保存</Button>}>
        <ConnectionSettingRow label="识别方式" hint="本地识别在此电脑处理音频；在线识别仅发送到你配置的服务，不自动回退或切换。">
          <SelectField value={settings?.mode ?? 'local'} onValueChange={mode => setSettings(value => value ? { ...value, mode: mode as VoiceSettings['mode'] } : value)} options={[{ value: 'local', label: '本地 · SenseVoice' }, { value: 'qwen-realtime', label: '在线 · Qwen 实时识别' }]} />
        </ConnectionSettingRow>
        {settings?.mode === 'local' ? <ConnectionSettingRow label="SenseVoiceSmall 模型" hint={`由 FunAudioLLM 提供，使用 sherpa-onnx INT8 转换及 Silero VAD。模型和完整许可按需下载，约 ${Math.ceil((snapshot?.modelBytes ?? 0) / 1024 / 1024)} MiB；不会包含在聊天备份中。`}>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={downloading} onClick={() => void download(snapshot?.localReady ? 'remove' : 'start')}>{snapshot?.localReady ? '移除模型' : '下载模型'}</Button>
            {downloading && <><progress aria-label="语音模型下载进度" max={snapshot?.modelBytes} value={snapshot?.download?.received ?? 0} className="w-24" /><Button type="button" variant="ghost" size="sm" onClick={() => void download('cancel')}>取消</Button></>}
            <a className="text-xs underline" href="https://github.com/modelscope/FunASR/blob/58830eca4012644aac0c3218c3ccc7d98f003fda/MODEL_LICENSE" target="_blank" rel="noreferrer">模型许可</a>
          </div>
        </ConnectionSettingRow> : <>
          <ConnectionSettingRow label="识别服务地址" hint="音频将发往此 WSS 地址。更换地址后须重新填写密钥。"><Input value={settings?.online.endpoint ?? ''} onChange={event => setSettings(value => value ? { ...value, online: { ...value.online, endpoint: event.target.value } } : value)} /></ConnectionSettingRow>
          <ConnectionSettingRow label="识别模型"><Input value={settings?.online.model ?? ''} onChange={event => setSettings(value => value ? { ...value, online: { ...value.online, model: event.target.value } } : value)} /></ConnectionSettingRow>
          <ConnectionSettingRow label="API 密钥"><Input type="password" autoComplete="off" value={key ?? ''} placeholder={snapshot?.onlineKeyPresent ? '已配置，留空保持' : '输入所选服务的密钥'} onChange={event => setKey(event.target.value)} /></ConnectionSettingRow>
        </>}
        <ConnectionSettingRow label="文字整理" hint="默认关闭。开启后仅将本次转写和术语表发送给所选文字模型，不读取聊天历史；原文可以立即编辑或发送。"><Switch checked={settings?.refinement.enabled ?? false} onCheckedChange={enabled => setSettings(value => value ? { ...value, refinement: { ...value.refinement, enabled } } : value)} /></ConnectionSettingRow>
        {settings?.refinement.enabled && <>
          <ConnectionSettingRow label="文字模型连接"><SelectField value={settings.refinement.connectionId} options={connections.map(connection => ({ value: connection.id, label: connection.name }))} onValueChange={connectionId => setSettings(value => value ? { ...value, refinement: { ...value.refinement, connectionId, model: connections.find(connection => connection.id === connectionId)?.defaultModel ?? '' } } : value)} /></ConnectionSettingRow>
          <ConnectionSettingRow label="文字模型"><Input value={settings.refinement.model} onChange={event => setSettings(value => value ? { ...value, refinement: { ...value.refinement, model: event.target.value } } : value)} /></ConnectionSettingRow>
        </>}
        <ConnectionSettingRow label="术语表" full hint="每行一个标准词，可用 | 添加别名。Qwen 识别与可选文字整理会参考这些词；本地识别不做机械替换，也不会从聊天自动学习。"><Textarea aria-label="语音术语表" rows={4} value={terms} onChange={event => setTerms(event.target.value)} placeholder="BOAI | 波艾" /></ConnectionSettingRow>
      </ConnectionForm>
    </ConnectionDialogLayout>
  </Dialog>
}
