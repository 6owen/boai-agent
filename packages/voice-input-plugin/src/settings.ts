/*
 * [OUTPUT]: 2026-10-27 语音v1只读投影到v2；语言校验、串行CAS和原凭据绑定保持。
 * [INPUT]: Explicit revision-checked settings, separate vault and local application path.
 * [OUTPUT]: Atomic opt-in configuration with origin-bound ASR credential references.
 * [POS]: Plugin configuration owner, outside business backups.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { mkdir, readFile, rename, rm, writeFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defaultVoiceSettings, readVoiceSettings, validateVoiceLanguage, voiceSettingsSchema, type VoiceApi, type VoiceSettings } from './protocol'
export interface VoiceSecrets { get(id: string): Promise<string | undefined>; has?(id: string): Promise<boolean>; set(id: string, value: string): Promise<void>; delete(id: string): Promise<void> }
export function voiceEndpoint(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash || url.search) throw new Error('识别地址须为不含凭据或查询参数的 WSS 地址')
  return url
}
export class VoiceSettingsStore {
  value = defaultVoiceSettings()
  readOnly = false
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private path: string, private secrets: VoiceSecrets) {}
  async init() {
    try { if ((await stat(this.path)).size > 128_000) throw new Error('Oversized settings'); this.value = readVoiceSettings(JSON.parse(await readFile(this.path, 'utf8'))); voiceEndpoint(this.value.online.endpoint) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.readOnly = true }
  }
  update(input: Parameters<VoiceApi['configure']>[0]) {
    const operation = this.queue.then(async () => {
      const parsed = z.object({ expectedRevision: z.number().int().nonnegative(), settings: voiceSettingsSchema.omit({ revision: true, schemaVersion: true }).extend({ online: voiceSettingsSchema.shape.online.omit({ credentialRef: true }) }), apiKey: z.string().max(4096).optional() }).strict().parse(input)
      if (this.readOnly || parsed.expectedRevision !== this.value.revision) throw new Error('语音设置不可写或已变化，请重新读取')
      validateVoiceLanguage(parsed.settings)
      voiceEndpoint(parsed.settings.online.endpoint)
      const sameEndpoint = parsed.settings.online.endpoint === this.value.online.endpoint
      let ref = sameEndpoint ? this.value.online.credentialRef : undefined
      const old = this.value.online.credentialRef
      let created: string | undefined
      if (parsed.apiKey !== undefined) {
        ref = parsed.apiKey.trim() ? `voice-asr:${randomUUID()}` : undefined
        if (ref) { await this.secrets.set(ref, parsed.apiKey.trim()); created = ref }
      }
      const next: VoiceSettings = { ...parsed.settings, schemaVersion: 2, revision: this.value.revision + 1, online: { ...parsed.settings.online, ...(ref ? { credentialRef: ref } : {}) } }
      const temp = `${this.path}.${randomUUID()}.tmp`
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      try { await writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await rename(temp, this.path) }
      catch (error) { if (created) await this.secrets.delete(created); throw error }
      finally { await rm(temp, { force: true }) }
      this.value = next
      if (old && old !== ref) await this.secrets.delete(old).catch(() => {})
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}
