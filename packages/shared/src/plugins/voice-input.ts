/*
 * [OUTPUT]: 2026-10-27 语音v2配置、后端语言目录、精确设备选择、附加整理规则和短期设备授权合同。
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
] as const
export type VoiceLanguage = typeof voiceLanguages[number]['value']
export const localVoiceLanguages: readonly VoiceLanguage[] = ['auto', 'zh', 'yue', 'en', 'ja', 'ko']
export const voiceSettingsSchema = legacyVoiceSettingsSchema.extend({
  schemaVersion: z.literal(2), language: z.enum(voiceLanguages.map(item => item.value)),
  microphoneDeviceId: z.string().max(512),
  refinement: legacyVoiceSettingsSchema.shape.refinement.extend({ instructions: z.string().max(4000) }),
})
export function validateVoiceLanguage(settings: { mode: 'local' | 'qwen-realtime'; language: VoiceLanguage }) {
  if (settings.mode === 'local' && !localVoiceLanguages.includes(settings.language)) throw new Error('本地识别不支持所选语言，请重新选择识别语言')
}
export function readVoiceSettings(value: unknown): VoiceSettings {
  const legacy = legacyVoiceSettingsSchema.safeParse(value)
  const settings = legacy.success ? voiceSettingsSchema.parse({ ...legacy.data, schemaVersion: 2, language: 'auto', microphoneDeviceId: '', refinement: { ...legacy.data.refinement, instructions: '' } }) : voiceSettingsSchema.parse(value)
  validateVoiceLanguage(settings)
  return settings
}
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>
export interface VoiceSnapshot { settings: VoiceSettings; localReady: boolean; supported: boolean; onlineKeyPresent: boolean; readOnly?: boolean; diagnostic?: string; download?: { received: number; total: number }; modelBytes: number }
export const voiceIdentitySchema = z.object({ sessionId: z.string().uuid(), scope: z.string().min(1).max(500), instanceId: z.string().uuid(), generation: z.number().int().nonnegative(), draftRevision: z.number().int().nonnegative(), settingsRevision: z.number().int().nonnegative(), anchor: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict() }).strict()
export type VoiceIdentity = z.infer<typeof voiceIdentitySchema>
export type VoiceEvent = { type: 'segment'; sessionId: string; id: string; sequence: number; revision: number; text: string; final: boolean }
  | { type: 'cancelled' | 'failed'; sessionId: string; error?: string }
export interface VoiceResult { sessionId: string; text: string; complete: boolean; error?: string; usage: 'unknown' | 'local' }
export interface VoiceApi {
  microphoneAccess(input: { token: string; active: boolean }): Promise<void>
  snapshot(): Promise<VoiceSnapshot>
  configure(input: { expectedRevision: number; settings: Omit<VoiceSettings, 'revision' | 'schemaVersion'>; apiKey?: string }): Promise<VoiceSnapshot>
  download(action: 'start' | 'cancel' | 'remove'): Promise<VoiceSnapshot>
  start(identity: VoiceIdentity): Promise<void>
  append(input: { sessionId: string; sequence: number; pcm: Uint8Array }): Promise<void>
  finish(sessionId: string): Promise<VoiceResult>
  cancel(sessionId: string): Promise<void>
  refine(input: { sessionId: string; text: string; settingsRevision: number }): Promise<{ text: string; settingsRevision: number } | null>
  subscribe(listener: (event: VoiceEvent) => void): () => void
}
export const defaultVoiceSettings = (): VoiceSettings => ({ schemaVersion: 2, revision: 0, mode: 'local', language: 'auto', microphoneDeviceId: '',
  online: { endpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime', model: 'qwen3-asr-flash-realtime' },
  refinement: { enabled: false, connectionId: '', model: '', instructions: '' }, terms: [],
})
