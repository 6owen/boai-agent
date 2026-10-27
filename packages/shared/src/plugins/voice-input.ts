/*
 * [OUTPUT]: 2026-10-27 语音合同或宿主适配；可信主窗口、隔离识别与用户显式配置。
 * [INPUT]: Explicit desktop settings and a trusted Composer identity.
 * [OUTPUT]: Typed voice-only protocol, no employee tool, message send or raw credential return.
 * [POS]: Host-owned voice application-plugin contract; independent of executable plugin code.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { z } from 'zod'
export const VOICE_PLUGIN_ID = 'boai.voice-input'
export const voiceSettingsSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), mode: z.enum(['local', 'qwen-realtime']),
  online: z.object({ endpoint: z.string().url().max(1000), model: z.string().min(1).max(160), credentialRef: z.string().max(200).optional() }).strict(),
  refinement: z.object({ enabled: z.boolean(), connectionId: z.string().max(200), model: z.string().max(200) }).strict(),
  terms: z.array(z.object({ word: z.string().trim().min(1).max(100), aliases: z.array(z.string().trim().min(1).max(100)).max(10) }).strict()).max(200),
}).strict()
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>
export interface VoiceSnapshot { settings: VoiceSettings; localReady: boolean; supported: boolean; onlineKeyPresent: boolean; readOnly?: boolean; diagnostic?: string; download?: { received: number; total: number }; modelBytes: number }
export const voiceIdentitySchema = z.object({ sessionId: z.string().uuid(), scope: z.string().min(1).max(500), instanceId: z.string().uuid(), generation: z.number().int().nonnegative(), draftRevision: z.number().int().nonnegative(), settingsRevision: z.number().int().nonnegative(), anchor: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict() }).strict()
export type VoiceIdentity = z.infer<typeof voiceIdentitySchema>
export type VoiceEvent = { type: 'segment'; sessionId: string; id: string; sequence: number; revision: number; text: string; final: boolean }
  | { type: 'cancelled' | 'failed'; sessionId: string; error?: string }
export interface VoiceResult { sessionId: string; text: string; complete: boolean; error?: string; usage: 'unknown' | 'local' }
export interface VoiceApi {
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
export const defaultVoiceSettings = (): VoiceSettings => ({ schemaVersion: 1, revision: 0, mode: 'local',
  online: { endpoint: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime', model: 'qwen3-asr-flash-realtime' },
  refinement: { enabled: false, connectionId: '', model: '' }, terms: [],
})
