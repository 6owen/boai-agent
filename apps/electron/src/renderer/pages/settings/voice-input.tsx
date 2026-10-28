/*
 * [OUTPUT]: 复用Shell连接及页外配置缓存；多模型目录独立刷新并保留原选择/下载交互。
 * [OUTPUT]: 当前模型Select与独立本地模型Card；按模型下载/取消/移除，资源轮询不覆盖配置草稿。
 * [INPUT]: Explicit voice configuration, model installation and existing text-model connections.
 * [OUTPUT]: Optional local/online ASR, separately opt-in refinement and manually maintained terminology.
 * [POS]: Voice application-plugin settings; failure feedback uses Sonner.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import { useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Connection } from '@boai/shared/domain'
import type { VoiceModelId, VoiceSettings } from '@boai/voice-input-plugin/protocol'
import { getDesktopClient } from '@/services/request/desktop-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/ui/select-field'
import { Switch } from '@/components/ui/switch'
import { GuardContext } from '@/components/common'
import { VOICE_PLUGIN_ID as voicePluginId, voiceLanguages, voiceModelLanguages, validateVoiceLanguage, type VoiceLanguage } from '@boai/shared/plugins/voice-input'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { pluginAvailability } from '@boai/shared/plugins/types'
import { setPluginEnabled, usePlugins } from '@/stores/plugins'
import { SettingsLayout, SettingsSection, SettingsCard } from './settings-layout'
import { VoiceSettingRow } from './voice-setting-row'
import { VoiceMicrophone } from './voice-microphone'
import { VoiceModelsCard } from './voice-models'
import { useVoiceSettings, voiceDraft, voiceSettings } from '@/stores/voice-settings'

export function VoiceInputSettingsPage({ active, connections: allConnections, onOpenShortcuts }: { active: boolean; connections: Connection[]; onOpenShortcuts(): void }) {
  const api = getDesktopClient(), voice = api?.voice, guard = useContext(GuardContext)
  const plugins = usePlugins(), plugin = applicationPlugins.find(item => item.id === voicePluginId)!
  const availability = pluginAvailability(plugin, plugins.settings), enabled = plugins.ready && availability === 'enabled'
  const state = useVoiceSettings(), draft = state.draft ?? (state.snapshot && voiceDraft(state.snapshot))
  const settings = draft?.settings, terms = draft?.terms ?? '', key = draft?.key
  const { loading, saving } = state
  const connections = allConnections.filter(connection => connection.provider !== 'anthropic' && connection.api !== 'responses' && !connection.gateway)
  const models = state.models ?? state.snapshot?.models ?? []
  const [operations, setOperations] = useState<ReadonlyMap<VoiceModelId, 'start' | 'cancel' | 'remove'>>(new Map())
  const pending = useRef(new Map<VoiceModelId, 'start' | 'cancel' | 'remove'>()), mounted = useRef(false), form = useRef<HTMLFormElement>(null)
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : typeof error === 'string' ? error : '语音设置操作失败')
  const setSettings = (change: (value: VoiceSettings) => VoiceSettings, immediate = false) => voiceSettings.edit(value => ({ ...value, settings: change(value.settings) }), immediate)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!api || !voice) return
    voiceSettings.initialize(api)
    if (!active) return
    const stop = voiceSettings.activate()
    const refresh = () => voiceSettings.invalidate()
    window.addEventListener('focus', refresh)
    return () => { stop(); window.removeEventListener('focus', refresh) }
  }, [voice, api, active])
  useEffect(() => {
    if (!active) { void voiceSettings.flush(); return }
    const flush = () => { void voiceSettings.flush() }
    const outside = (event: PointerEvent) => {
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.matches('input, textarea') && form.current?.contains(focused) && !event.composedPath().includes(focused)) flush()
    }
    const hidden = () => { if (document.hidden) flush() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('blur', flush)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('blur', flush)
      flush()
    }
  }, [active])
  const downloadingModel = operations.size > 0 || models.some(model => model.download)
  useEffect(() => {
    if (!active || !voice) return
    // Reuse a fresh catalog; stale catalogs and ongoing downloads still reconcile on return.
    void voiceSettings.refreshModels(false).catch(() => {})
    if (!downloadingModel) return
    const timer = setInterval(() => { void voiceSettings.refreshModels().catch(() => {}) }, 700)
    return () => { clearInterval(timer) }
  }, [active, downloadingModel, voice])
  const download = async (modelId: VoiceModelId, action: 'start' | 'cancel' | 'remove') => {
    if (!voice) return
    const previous = pending.current.get(modelId)
    if (previous && !(previous === 'start' && action === 'cancel')) return
    pending.current.set(modelId, action); setOperations(new Map(pending.current))
    try {
      await voice.download({ modelId, action })
      await voiceSettings.refreshModels()
      if (mounted.current && action !== 'cancel' && pending.current.get(modelId) === action) toast.success(action === 'start' ? '语音模型已下载' : '语音模型已移除')
    } catch (error) {
      if (mounted.current && pending.current.get(modelId) === action) fail(error)
      void voiceSettings.refreshModels().catch(() => {})
    }
    finally {
      if (pending.current.get(modelId) === action) pending.current.delete(modelId)
      if (mounted.current) setOperations(new Map(pending.current))
    }
  }
  const local = (settings?.mode ?? 'local') === 'local'
  const installedModels = models.filter(model => model.ready)
  const selectedModel = installedModels.find(model => model.id === settings?.localModelId)
  const languages = voiceModelLanguages(settings?.localModelId ?? 'sensevoice-small')
  const selectRecognition = (change: Partial<Pick<VoiceSettings, 'mode' | 'localModelId'>>) => {
    if (!settings) return
    try { validateVoiceLanguage({ ...settings, ...change }) }
    catch (error) { fail(error); return }
    setSettings(value => ({ ...value, ...change }), true)
  }
  const disabled = !settings || state.snapshot?.readOnly === true || !active
  return <SettingsLayout title="语音输入" aria-label="语音输入设置">
    {state.error && <Button type="button" variant="ghost" disabled={saving || loading || !voice || !active} onClick={() => guard.navigate(() => { void voiceSettings.load(true) }, { resetOnDiscard: false })}>重新读取语音设置</Button>}
    <form ref={form} data-edit-form onBlur={event => { if (event.target.matches('input, textarea')) void voiceSettings.flush() }} onSubmit={event => { event.preventDefault(); void voiceSettings.flush() }}>
      <SettingsSection first title="识别">
        <SettingsCard>
          <VoiceSettingRow label="启用语音输入" hint="开关即时保存，与插件管理共用同一配置。开启后从聊天输入框开始录音；不会自动下载模型或访问麦克风。">
            <Switch checked={enabled} disabled={!active || saving || !plugins.ready || !!plugins.busy || plugins.settings.readOnly || availability === 'incompatible'} onCheckedChange={value => { void setPluginEnabled(voicePluginId, value).then(() => { const state = usePlugins.getState(); if (state.error) fail(state.error); else toast.success(value ? '语音输入已启用' : '语音输入已停用') }) }} />
          </VoiceSettingRow>
        </SettingsCard>
        <fieldset disabled={disabled} className="mt-3 min-w-0">
        <SettingsCard>
        <VoiceSettingRow label="识别方式" hint="本地识别在此电脑处理音频；在线识别仅发送到你配置的服务，不自动回退或切换。">
          <SelectField value={settings?.mode ?? 'local'} onValueChange={mode => selectRecognition({ mode: mode as VoiceSettings['mode'] })} options={[{ value: 'local', label: '本地' }, { value: 'qwen-realtime', label: '在线 · Qwen 实时识别' }]} />
        </VoiceSettingRow>
        {local && <VoiceSettingRow label="当前模型" hint="从已安装模型中选择。下方模型列表可下载多个模型，下载完成后不会自动切换；切换前请结束当前录音。">
          <SelectField value={selectedModel?.id ?? ''} placeholder={installedModels.length ? '选择已安装的模型' : '请先下载模型'} disabled={!installedModels.length || saving} options={installedModels.map(model => ({ value: model.id, label: model.name }))} onValueChange={localModelId => selectRecognition({ localModelId: localModelId as VoiceModelId })} />
        </VoiceSettingRow>}
        <VoiceSettingRow label="识别语言" hint="自动识别适合多语言混读；指定语言可减少误判。可选语言由当前识别模型决定。">
          <SelectField value={settings?.language ?? 'auto'} options={voiceLanguages.filter(item => !local || languages.includes(item.value) || item.value === settings?.language).map(item => ({ ...item, label: local && !languages.includes(item.value) ? `${item.label}（当前模型不支持，请重选）` : item.label }))} onValueChange={language => setSettings(value => value ? { ...value, language: language as VoiceLanguage } : value, true)} />
        </VoiceSettingRow>
        <VoiceMicrophone voice={voice} active={active} enabled={enabled} disabled={disabled || saving} value={settings?.microphoneDeviceId ?? ''} onChange={microphoneDeviceId => setSettings(value => value ? { ...value, microphoneDeviceId } : value, true)} />
        <VoiceSettingRow label="语音快捷键" hint="在快捷键设置中启用和录入。聚焦当前聊天输入框时按下开始录音，再按一次停止；不自动发送。">
          <Button type="button" variant="ghost" data-voice-setting-control aria-label="前往快捷键设置" onClick={onOpenShortcuts}>前往快捷键设置</Button>
        </VoiceSettingRow>
        {!local && <>
          <VoiceSettingRow label="识别服务地址" hint="音频将发往此 WSS 地址。更换地址后须重新填写密钥。"><Input value={settings?.online.endpoint ?? ''} onChange={event => setSettings(value => value ? { ...value, online: { ...value.online, endpoint: event.target.value } } : value)} /></VoiceSettingRow>
          <VoiceSettingRow label="识别模型"><Input value={settings?.online.model ?? ''} onChange={event => setSettings(value => value ? { ...value, online: { ...value.online, model: event.target.value } } : value)} /></VoiceSettingRow>
          <VoiceSettingRow label="API 密钥"><Input type="password" autoComplete="off" value={key ?? ''} placeholder={state.snapshot?.onlineKeyPresent ? '已配置，留空保持' : '输入所选服务的密钥'} onChange={event => voiceSettings.edit(value => ({ ...value, key: event.target.value }))} /></VoiceSettingRow>
        </>}
        </SettingsCard></fieldset>
      </SettingsSection>
      {local && <VoiceModelsCard models={models} selected={settings?.localModelId ?? 'sensevoice-small'} enabled={enabled} disabled={disabled} pending={operations} onAction={(modelId, action) => { void download(modelId, action) }} />}
      <SettingsSection title="文字整理">
        <fieldset disabled={disabled} className="min-w-0"><SettingsCard>
        <VoiceSettingRow label="启用文字整理" hint="默认关闭。开启后仅将本次转写和术语表发送给所选文字模型，不读取聊天历史；原文可以立即编辑或发送。"><Switch checked={settings?.refinement.enabled ?? false} onCheckedChange={enabled => setSettings(value => value ? { ...value, refinement: { ...value.refinement, enabled } } : value, true)} /></VoiceSettingRow>
        {settings?.refinement.enabled && <>
          <VoiceSettingRow label="文字模型连接"><SelectField value={settings.refinement.connectionId} options={connections.map(connection => ({ value: connection.id, label: connection.name }))} onValueChange={connectionId => setSettings(value => value ? { ...value, refinement: { ...value.refinement, connectionId, model: connections.find(connection => connection.id === connectionId)?.defaultModel ?? '' } } : value, true)} /></VoiceSettingRow>
          <VoiceSettingRow label="文字模型"><Input value={settings.refinement.model} onChange={event => setSettings(value => value ? { ...value, refinement: { ...value.refinement, model: event.target.value } } : value)} /></VoiceSettingRow>
          <VoiceSettingRow label="高级润色规则" full hint="只补充标点、口头语和表达习惯；不会让文字模型回答或执行口述内容。留空使用默认规则。">
            <details className="w-full"><summary className="cursor-pointer py-2 text-sm">编辑润色规则</summary><Textarea className="mt-2" aria-label="高级润色规则" maxLength={4000} rows={4} placeholder="例如：使用中文标点，保留语气词，英文产品名保持原样。" value={settings.refinement.instructions} onChange={event => setSettings(value => value ? { ...value, refinement: { ...value.refinement, instructions: event.target.value } } : value)} /></details>
          </VoiceSettingRow>
        </>}
        </SettingsCard></fieldset>
      </SettingsSection>
      <SettingsSection title="术语">
        <fieldset disabled={disabled} className="min-w-0"><SettingsCard>
        <VoiceSettingRow label="术语表" full hint="每行一个标准词，可用 | 添加别名。Qwen 识别与可选文字整理会参考这些词；本地识别不做机械替换，也不会从聊天自动学习。"><Textarea aria-label="语音术语表" rows={4} value={terms} onChange={event => voiceSettings.edit(value => ({ ...value, terms: event.target.value }))} placeholder="BOAI | 波艾" /></VoiceSettingRow>
        </SettingsCard></fieldset>
      </SettingsSection>
    </form>
  </SettingsLayout>
}
