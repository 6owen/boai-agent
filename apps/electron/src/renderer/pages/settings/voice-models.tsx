/*
 * [INPUT]: Host-owned model catalog, installation progress and explicit per-model actions.
 * [OUTPUT]: Same-page local model Card with independent download/cancel/remove controls and license details.
 * [POS]: Voice settings model list; model selection remains in the recognition Select.
 * [PROTOCOL]: Update Header and settings/.folder.md when changed.
 */
import type { VoiceModelId, VoiceModelSnapshot } from '@boai/shared/plugins/voice-input'
import { voiceLanguages } from '@boai/shared/plugins/voice-input'
import { CheckIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsHelp, SettingsRow, SettingsSection } from './settings-layout'

type ModelAction = 'start' | 'cancel' | 'remove'
export function VoiceModelsCard({ models, selected, enabled, disabled, pending, onAction }: {
  models: readonly VoiceModelSnapshot[]; selected: VoiceModelId; enabled: boolean; disabled: boolean
  pending: ReadonlyMap<VoiceModelId, ModelAction>
  onAction(modelId: VoiceModelId, action: ModelAction): void
}) {
  return <SettingsSection title="本地模型">
    <fieldset disabled={disabled} className="min-w-0"><SettingsCard>
      {models.map(model => {
        const operation = pending.get(model.id), downloading = !!model.download || operation === 'start'
        const current = model.ready && model.id === selected
        const languages = voiceLanguages.filter(item => item.value !== 'auto' && model.languages.includes(item.value)).map(item => item.label).join('、')
        return <SettingsRow key={model.id} data-voice-setting-row data-voice-model-id={model.id} className="py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>{model.name}</span>
              {current && <CheckIcon className="size-4 text-primary" aria-label="当前模型" />}
              <SettingsHelp label={`${model.name}说明`}>
                <p>支持{languages}。模型和所需文件按需下载，不包含在聊天备份中。</p>
                <p>下载后从上方“当前模型”选择使用；移除当前模型前，请切换模型或停用语音输入。</p>
              </SettingsHelp>
            </div>
            <div className="text-xs text-muted-foreground">{Math.ceil(model.bytes / 1024 / 1024)} MiB · {model.languages.length > 8 ? '多语言' : languages}</div>
          </div>
          <div className="appearance-row-controls max-w-full flex-wrap gap-3">
            <a className="text-xs underline" href={model.licenseUrl} aria-label={`${model.name}模型许可`} target="_blank" rel="noreferrer">模型许可</a>
            {downloading && <progress aria-label={`${model.name}下载进度`} max={model.download?.total ?? model.bytes} value={model.download?.received ?? 0} className="w-24" />}
            <Button type="button" variant="secondary" data-voice-setting-control
              aria-label={`${downloading ? '取消下载' : model.ready ? '移除' : '下载'} ${model.name}`}
              disabled={operation === 'cancel' || operation === 'remove' || (!downloading && (!model.ready && !enabled || current && enabled))}
              onClick={() => onAction(model.id, downloading ? 'cancel' : model.ready ? 'remove' : 'start')}>
              {downloading ? '取消下载' : model.ready ? '移除模型' : '下载模型'}
            </Button>
          </div>
        </SettingsRow>
      })}
    </SettingsCard></fieldset>
  </SettingsSection>
}
