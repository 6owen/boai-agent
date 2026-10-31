/*
 * [OUTPUT]: Qwen3-ASR-0.6B本地模型身份与30语言目录；旧模型语言/默认选择保持。
 * [OUTPUT]: 2026-10-28 语音v3记录本地模型身份；v1/v2只读迁移、逐模型安装快照和明确模型下载操作。
 * [INPUT]: Explicit desktop settings and a trusted Composer identity.
 * [OUTPUT]: Typed voice-only protocol, no employee tool, message send or raw credential return.
 * [POS]: Host-owned voice application-plugin contract; independent of executable plugin code.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { z } from 'zod'
export const VOICE_PLUGIN_ID = 'boai.voice-input'
export const legacyVoiceSettingsSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), mode: z.enum(['local', 'qwen-realtime']),
  online: z.object({ endpoint: z.string().url().max(1000), model: z.string().min(1).max(160), credentialRef: z.string().max(200).optional() }).strict(),
  refinement: z.object({ enabled: z.boolean(), connectionId: z.string().max(200), model: z.string().max(200) }).strict(),
  terms: z.array(z.object({ word: z.string().trim().min(1).max(100), aliases: z.array(z.string().trim().min(1).max(100)).max(10) }).strict()).max(200),
}).strict()
export const voiceLanguages = [
  { value: 'auto', label: '自动识别' }, { value: 'zh', label: '中文' }, { value: 'yue', label: '粤语' },
  { value: 'en', label: '英语' }, { value: 'ja', label: '日语' }, { value: 'ko', label: '韩语' },
  { value: 'de', label: '德语' }, { value: 'ru', label: '俄语' }, { value: 'fr', label: '法语' },
  { value: 'pt', label: '葡萄牙语' }, { value: 'ar', label: '阿拉伯语' }, { value: 'it', label: '意大利语' },
  { value: 'es', label: '西班牙语' }, { value: 'hi', label: '印地语' }, { value: 'id', label: '印尼语' },
  { value: 'th', label: '泰语' }, { value: 'tr', label: '土耳其语' }, { value: 'uk', label: '乌克兰语' },
  { value: 'vi', label: '越南语' }, { value: 'cs', label: '捷克语' }, { value: 'da', label: '丹麦语' },
  { value: 'fil', label: '菲律宾语' }, { value: 'fi', label: '芬兰语' }, { value: 'is', label: '冰岛语' },
  { value: 'ms', label: '马来语' }, { value: 'no', label: '挪威语' }, { value: 'pl', label: '波兰语' }, { value: 'sv', label: '瑞典语' },
  { value: 'nl', label: '荷兰语' }, { value: 'fa', label: '波斯语' }, { value: 'el', label: '希腊语' },
  { value: 'hu', label: '匈牙利语' }, { value: 'mk', label: '马其顿语' }, { value: 'ro', label: '罗马尼亚语' },
] as const
export type VoiceLanguage = typeof voiceLanguages[number]['value']
export const localVoiceLanguages: readonly VoiceLanguage[] = ['auto', 'zh', 'yue', 'en', 'ja', 'ko']
const voiceSettingsV2Schema = legacyVoiceSettingsSchema.extend({
  schemaVersion: z.literal(2), language: z.enum(voiceLanguages.map(item => item.value)),
  microphoneDeviceId: z.string().max(512),
  refinement: legacyVoiceSettingsSchema.shape.refinement.extend({ instructions: z.string().max(4000) }),
})
export const voiceModelIds = ['sensevoice-small', 'whisper-tiny', 'whisper-base', 'qwen3-asr-0.6b'] as const
export type VoiceModelId = typeof voiceModelIds[number]
export const voiceModelIdSchema = z.enum(voiceModelIds)
const whisperVoiceLanguages: readonly VoiceLanguage[] = ['auto', 'zh', 'en', 'ja', 'ko', 'de', 'ru', 'fr', 'pt', 'ar', 'it', 'es', 'hi', 'id', 'th', 'tr', 'uk', 'vi', 'cs', 'da', 'fil', 'fi', 'is', 'ms', 'no', 'pl', 'sv']
const qwen3VoiceLanguages: readonly VoiceLanguage[] = voiceLanguages.map(item => item.value).filter(value => value !== 'uk' && value !== 'is' && value !== 'no')
const localModelLanguages: Record<VoiceModelId, readonly VoiceLanguage[]> = {
  'sensevoice-small': localVoiceLanguages, 'whisper-tiny': whisperVoiceLanguages, 'whisper-base': whisperVoiceLanguages,
  'qwen3-asr-0.6b': qwen3VoiceLanguages,
}
export function voiceModelLanguages(modelId: VoiceModelId): readonly VoiceLanguage[] { return localModelLanguages[modelId] }
export const voiceSettingsSchema = voiceSettingsV2Schema.extend({ schemaVersion: z.literal(3), localModelId: voiceModelIdSchema })
export const voiceDownloadSchema = z.object({ modelId: voiceModelIdSchema, action: z.enum(['start', 'cancel', 'remove']) }).strict()
export const voiceConfigureSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  settings: voiceSettingsSchema.omit({ revision: true, schemaVersion: true }).extend({ online: voiceSettingsSchema.shape.online.omit({ credentialRef: true }) }),
  apiKey: z.string().max(4096).optional(),
}).strict()
export function validateVoiceLanguage(settings: { mode: 'local' | 'qwen-realtime'; language: VoiceLanguage; localModelId?: VoiceModelId }) {
  if (settings.mode === 'local' && !voiceModelLanguages(settings.localModelId ?? 'sensevoice-small').includes(settings.language)) throw new Error('所选本地模型不支持当前语言，请先重新选择识别语言')
}
export function readVoiceSettings(value: unknown): VoiceSettings {
  const legacy = legacyVoiceSettingsSchema.safeParse(value)
  const previous = voiceSettingsV2Schema.safeParse(legacy.success ? { ...legacy.data, schemaVersion: 2, language: 'auto', microphoneDeviceId: '', refinement: { ...legacy.data.refinement, instructions: '' } } : value)
  const settings = voiceSettingsSchema.parse(previous.success ? { ...previous.data, schemaVersion: 3, localModelId: 'sensevoice-small' } : value)
  validateVoiceLanguage(settings)
  return settings
}
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>
export interface VoiceModelSnapshot {
  id: VoiceModelId; name: string; languages: readonly VoiceLanguage[]; bytes: number; ready: boolean; licenseUrl: string
  download?: { received: number; total: number }
}
export interface VoiceSnapshot {
  settings: VoiceSettings; models: VoiceModelSnapshot[]; localReady: boolean; supported: boolean; onlineKeyPresent: boolean
  readOnly?: boolean; diagnostic?: string; download?: { received: number; total: number }; modelBytes: number
}
export const voiceIdentitySchema = z.object({ sessionId: z.string().uuid(), scope: z.string().min(1).max(500), instanceId: z.string().uuid(), generation: z.number().int().nonnegative(), draftRevision: z.number().int().nonnegative(), settingsRevision: z.number().int().nonnegative(), anchor: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict() }).strict()
export type VoiceIdentity = z.infer<typeof voiceIdentitySchema>
export type VoiceEvent = { type: 'segment'; sessionId: string; id: string; sequence: number; revision: number; text: string; final: boolean }
  | { type: 'cancelled' | 'failed'; sessionId: string; error?: string }
export interface VoiceResult { sessionId: string; text: string; complete: boolean; error?: string; usage: 'unknown' | 'local' }
export interface VoiceApi {
  microphoneAccess(input: { token: string; active: boolean }): Promise<void>
  snapshot(): Promise<VoiceSnapshot>
  configure(input: z.infer<typeof voiceConfigureSchema>): Promise<VoiceSnapshot>
  download(input: z.infer<typeof voiceDownloadSchema>): Promise<VoiceSnapshot>
  start(identity: VoiceIdentity): Promise<void>
  append(input: { sessionId: string; sequence: number; pcm: Uint8Array }): Promise<void>
  finish(sessionId: string): Promise<VoiceResult>
  cancel(sessionId: string): Promise<void>
  refine(input: { sessionId: string; text: string; settingsRevision: number }): Promise<{ text: string; settingsRevision: number } | null>
  subscribe(listener: (event: VoiceEvent) => void): () => void
}
export const defaultVoiceSettings = (): VoiceSettings => ({ schemaVersion: 3, revision: 0, mode: 'local', localModelId: 'sensevoice-small', language: 'auto', microphoneDeviceId: '',
  online: { endpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime', model: 'qwen3-asr-flash-realtime' },
  refinement: { enabled: false, connectionId: '', model: '', instructions: '' }, terms: [],
})
