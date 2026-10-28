/*
 * [OUTPUT]: 2026-10-28 逐模型安装与快照、已安装模型选择、录音固定模型身份及活动资源移除保护。
 * [INPUT]: Trusted desktop frame commands, plugin enablement, lifecycle, vault and isolated helper port.
 * [OUTPUT]: Single application capture lease, private bounded PCM spool, local/online transcription and optional refinement.
 * [POS]: Optional voice application plugin host; no employee execution or message publication.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { mkdir, open, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { VoiceSettingsStore, type VoiceSecrets } from './settings'
import { VoiceModels } from './models'
import { QwenRecognition } from './qwen'
import { voiceIdentitySchema, voiceConfigureSchema, voiceDownloadSchema, validateVoiceLanguage, type VoiceApi, type VoiceEvent, type VoiceIdentity, type VoiceResult, type VoiceSnapshot, type VoiceSettings, type VoiceLanguage, type VoiceModelId } from './protocol'

export interface VoiceHelper {
  kill(): Promise<void>
  result: Promise<{ complete: boolean; error?: string }>
}
export interface VoiceHostPorts {
  secrets: VoiceSecrets
  enabled(): boolean
  allowed(): boolean
  supported(): boolean
  emit(event: VoiceEvent): void
  usage?(entry: { requestId: string; stage: 'asr' | 'refinement'; state: 'started' | 'reported' | 'unknown'; inputTokens?: number; outputTokens?: number; totalTokens?: number }): void
  helper(models: string, audio: string, segment: (index: number, text: string) => void, language: VoiceLanguage, modelId: VoiceModelId): VoiceHelper
  refine(connectionId: string, model: string, text: string, terms: { word: string; aliases: string[] }[], signal: AbortSignal, instructions: string): Promise<string>
}
type Session = { mode: VoiceSettings['mode']; localModelId: VoiceModelId; language: VoiceLanguage; identity: VoiceIdentity; controller: AbortController; sequence: number; accepting: boolean; queue: Promise<void>; pendingBytes: number; file?: FileHandle; path?: string; online?: QwenRecognition; helper?: VoiceHelper; texts: string[]; finish?: Promise<VoiceResult> }
export class VoiceHost {
  readonly settings: VoiceSettingsStore
  readonly models: VoiceModels
  private session?: Session
  private settled?: { id: string; revision: number; text: string; controller: AbortController }
  private refinements = new Set<string>()
  private pending?: { session: Session; done: Promise<void> }
  private generation = 0
  private configuring = false
  private removing = new Set<VoiceModelId>()
  private microphoneCheck?: { token: string; timer: ReturnType<typeof setTimeout> }
  private initializationError?: string
  constructor(private root: string, private ports: VoiceHostPorts) {
    this.settings = new VoiceSettingsStore(join(root, 'settings.json'), ports.secrets)
    this.models = new VoiceModels(join(root, 'models'))
  }
  async init() {
    try { await this.settings.init(); await this.models.recover(); await rm(join(this.root, 'temporary'), { recursive: true, force: true }) }
    catch { this.initializationError = '语音输入的本机存储不可用，请修复后重启；其他功能仍可使用'; this.settings.readOnly = true }
  }
  async snapshot(): Promise<VoiceSnapshot> {
    const settings = structuredClone(this.settings.value)
    const ref = settings.online.credentialRef
    const onlineKeyPresent = ref ? await (this.ports.secrets.has ? this.ports.secrets.has(ref) : this.ports.secrets.get(ref).then(Boolean)).catch(() => false) : false
    const models = await this.models.snapshot(), selected = models.find(model => model.id === settings.localModelId)!
    return { settings, models, localReady: selected.ready, supported: this.ports.supported(), onlineKeyPresent, readOnly: this.settings.readOnly, diagnostic: this.initializationError ?? (this.settings.readOnly ? '语音设置无法读取或来自更新版本，原文件已保留；请修复后重启' : undefined), download: selected.download, modelBytes: selected.bytes }
  }
  async configure(input: Parameters<VoiceApi['configure']>[0]) {
    if (this.configuring) throw new Error('语音设置正在保存，请稍后重试')
    const parsed = voiceConfigureSchema.parse(input)
    if (this.settings.readOnly || parsed.expectedRevision !== this.settings.value.revision) throw new Error('语音设置不可写或已变化，请重新读取')
    validateVoiceLanguage(parsed.settings)
    const modelChanged = parsed.settings.localModelId !== this.settings.value.localModelId
    if (modelChanged && (this.session || this.pending)) throw new Error('请先结束当前录音，再切换识别模型')
    if (this.removing.has(parsed.settings.localModelId)) throw new Error('模型正在移除，请稍后重试')
    this.configuring = true
    try {
      if (modelChanged && !(await this.models.ready(true, undefined, parsed.settings.localModelId))) throw new Error('请先下载并校验所选模型')
      await this.cancelAll(); await this.settings.update(parsed); return await this.snapshot()
    } finally { this.configuring = false }
  }
  async download(input: Parameters<VoiceApi['download']>[0]) {
    const { action, modelId } = voiceDownloadSchema.parse(input)
    if (action === 'start') {
      if (!this.ports.enabled() || this.settings.readOnly) throw new Error('请先启用语音输入插件')
      if (this.removing.has(modelId)) throw new Error('模型正在移除，请稍后重试')
      if (this.modelInUse(modelId)) throw new Error('请先结束当前录音，再更新模型')
      await this.models.download(modelId)
    } else if (action === 'cancel') await this.models.cancel(modelId)
    else {
      if (this.configuring || this.removing.has(modelId)) throw new Error('语音模型正在更新，请稍后重试')
      if (this.modelInUse(modelId)) throw new Error('请先结束当前录音，再移除模型')
      if (this.ports.enabled() && this.settings.value.mode === 'local' && this.settings.value.localModelId === modelId) throw new Error('请先选择其他模型或停用语音输入，再移除当前模型')
      this.removing.add(modelId)
      try { await this.models.remove(modelId) } finally { this.removing.delete(modelId) }
    }
    return this.snapshot()
  }
  private modelInUse(modelId: VoiceModelId) {
    return [this.session, this.pending?.session].some(session => session?.mode === 'local' && session.localModelId === modelId)
  }
  microphoneAccess(input: { token: string; active: boolean }) {
    const { token, active } = z.object({ token: z.string().uuid(), active: z.boolean() }).strict().parse(input)
    if (!active) { if (this.microphoneCheck?.token === token) this.releaseMicrophoneCheck(); return }
    if (!this.ports.enabled() || !this.ports.allowed() || this.settings.readOnly || this.configuring || this.session || this.pending || this.microphoneCheck) throw new Error('请先启用语音输入并结束当前录音或设备授权')
    this.microphoneCheck = { token, timer: setTimeout(() => this.releaseMicrophoneCheck(), 60_000) }
  }
  private releaseMicrophoneCheck() { clearTimeout(this.microphoneCheck?.timer); this.microphoneCheck = undefined }
  canCapture() { return (!!this.microphoneCheck || !!this.session?.accepting) && this.ports.enabled() && this.ports.allowed() && !this.session?.controller.signal.aborted }
  async start(input: VoiceIdentity) {
    const identity = voiceIdentitySchema.parse(input)
    if (!this.ports.enabled() || !this.ports.allowed() || this.settings.readOnly || this.configuring) throw new Error('当前窗口不能开始录音')
    if (this.session || this.pending || this.microphoneCheck) throw new Error('另一输入框正在使用语音输入')
    if (identity.settingsRevision !== this.settings.value.revision) throw new Error('语音设置已变化，请重新开始')
    const generation = ++this.generation, settings = structuredClone(this.settings.value)
    this.settled?.controller.abort(); this.settled = undefined; this.refinements.clear()
    const session: Session = { mode: settings.mode, localModelId: settings.localModelId, language: settings.language, identity, controller: new AbortController(), sequence: 0, accepting: true, queue: Promise.resolve(), pendingBytes: 0, texts: [] }
    const pending = { session, done: Promise.resolve() }
    this.pending = pending
    pending.done = this.prepare(session, generation, settings).finally(() => { if (this.pending === pending) this.pending = undefined })
    return pending.done
  }
  private async prepare(session: Session, generation: number, settings: VoiceSettings) {
    const signal = session.controller.signal
    try {
      if (settings.mode === 'local') {
        if (this.removing.has(session.localModelId)) throw new Error('模型正在移除，请稍后重试')
        const ready = this.ports.supported() && await this.models.ready(true, signal, session.localModelId)
        signal.throwIfAborted()
        if (!ready) throw new Error('本地语音模型或引擎未就绪，请在设置的语音输入页下载')
        const directory = join(this.root, 'temporary'); await mkdir(directory, { recursive: true, mode: 0o700 })
        signal.throwIfAborted()
        session.path = join(directory, session.identity.sessionId + '.pcm'); session.file = await open(session.path, 'wx', 0o600)
      } else {
        const key = settings.online.credentialRef && await this.ports.secrets.get(settings.online.credentialRef)
        signal.throwIfAborted()
        if (!key) throw new Error('请配置在线识别服务的 API 密钥')
        session.online = new QwenRecognition(session.identity.sessionId, settings, key, event => { if (this.session === session) this.ports.emit(event) })
        this.ports.usage?.({ requestId: session.identity.sessionId, stage: 'asr', state: 'started' })
        await session.online.ready
      }
      signal.throwIfAborted()
      if (generation !== this.generation || !this.ports.allowed() || !this.ports.enabled()) throw new Error('录音已取消')
      this.session = session
    } catch (error) { session.online?.cancel(); this.recordAsrExit(session); await session.file?.close(); if (session.path) await rm(session.path, { force: true }); throw error }
  }
  private current(id: string) { const session = this.session; if (!session || session.identity.sessionId !== id || session.controller.signal.aborted) throw new Error('语音会话已失效'); return session }
  private recordAsrExit(session: Session) {
    if (!session.online || this.accountedAsr.has(session)) return
    this.accountedAsr.add(session)
    this.ports.usage?.({ requestId: session.identity.sessionId, stage: 'asr', state: 'unknown' })
  }
  private accountedAsr = new WeakSet<Session>()
  append(input: { sessionId: string; sequence: number; pcm: Uint8Array }) {
    const value = z.object({ sessionId: z.string().uuid(), sequence: z.number().int().nonnegative(), pcm: z.instanceof(Uint8Array).refine(value => value.length > 0 && value.length <= 32768 && value.length % 2 === 0) }).strict().parse(input)
    const session = this.current(value.sessionId)
    if (!session.accepting || !this.canCapture() || value.sequence !== session.sequence) throw new Error('录音顺序或窗口状态已变化')
    if (session.pendingBytes + value.pcm.byteLength > 512 * 1024) throw new Error('录音写入队列已满')
    session.sequence++; session.pendingBytes += value.pcm.byteLength
    const pcm = Uint8Array.from(value.pcm)
    const operation = session.queue.then(async () => { session.controller.signal.throwIfAborted(); if (session.online) session.online.append(pcm); else await session.file!.writeFile(pcm) }).finally(() => { session.pendingBytes -= pcm.byteLength })
    session.queue = operation
    return operation
  }
  finish(id: string): Promise<VoiceResult> {
    const session = this.current(id)
    if (session.finish) return session.finish
    session.accepting = false
    session.finish = this.complete(session); return session.finish
  }
  private async complete(session: Session): Promise<VoiceResult> {
    const id = session.identity.sessionId
    try {
      await session.queue; const file = session.file; session.file = undefined; await file?.close()
      session.controller.signal.throwIfAborted()
      let result: VoiceResult
      if (session.online) result = await session.online.finish()
      else {
        session.helper = this.ports.helper(this.models.directoryFor(session.localModelId), session.path!, (sequence, text) => {
          if (this.session !== session || session.controller.signal.aborted || sequence !== session.texts.length) return
          session.texts.push(text)
          this.ports.emit({ type: 'segment', sessionId: id, id: `local:${sequence}`, sequence, revision: 1, text, final: true })
        }, session.language, session.localModelId)
        const outcome = await session.helper.result
        result = { sessionId: id, text: session.texts.join(''), complete: outcome.complete, error: outcome.error, usage: 'local' }
      }
      session.controller.signal.throwIfAborted()
      if (this.session !== session) throw new Error('语音会话已失效')
      if (result.complete) this.settled = { id, revision: session.identity.settingsRevision, text: result.text, controller: new AbortController() }
      return result
    } finally {
      session.online?.cancel()
      this.recordAsrExit(session)
      if (session.path) await rm(session.path, { force: true })
      if (this.session === session) this.session = undefined
    }
  }
  async cancel(id: string) {
    if (this.settled?.id === id) { this.settled.controller.abort(); this.settled = undefined }
    const pending = this.pending
    if (pending?.session.identity.sessionId === id) {
      pending.session.controller.abort(); pending.session.online?.cancel()
      await pending.done.catch(() => {})
      this.ports.emit({ type: 'cancelled', sessionId: id })
      return
    }
    const session = this.session
    if (!session || session.identity.sessionId !== id) return
    session.accepting = false; session.controller.abort(); session.online?.cancel()
    this.recordAsrExit(session)
    // Do not release the lease until the helper really exited.
    await session.helper?.kill()
    await session.queue.catch(() => {}); const file = session.file; session.file = undefined; await file?.close()
    if (session.path) await rm(session.path, { force: true })
    if (this.session === session) this.session = undefined
    this.ports.emit({ type: 'cancelled', sessionId: id })
  }
  async cancelAll() { this.releaseMicrophoneCheck(); this.generation++; this.settled?.controller.abort(); this.settled = undefined; if (this.pending) await this.cancel(this.pending.session.identity.sessionId); if (this.session) await this.cancel(this.session.identity.sessionId) }
  async close() { await this.cancelAll(); await this.models.cancel() }
  async refine(input: { sessionId: string; text: string; settingsRevision: number }) {
    const value = z.object({ sessionId: z.string().uuid(), text: z.string().max(1_000_000), settingsRevision: z.number().int().nonnegative() }).strict().parse(input)
    const saved = this.settled, settings = structuredClone(this.settings.value)
    if (!saved || saved.id !== value.sessionId || saved.text !== value.text || saved.revision !== value.settingsRevision || settings.revision !== saved.revision || !settings.refinement.enabled || !this.ports.enabled() || !this.ports.allowed() || this.refinements.has(saved.id)) return null
    this.refinements.add(saved.id)
    try {
      const text = await this.ports.refine(settings.refinement.connectionId, settings.refinement.model, value.text, settings.terms, saved.controller.signal, settings.refinement.instructions)
      if (saved.controller.signal.aborted || this.settled !== saved || this.settings.value.revision !== saved.revision || !this.ports.allowed()) return null
      return { text, settingsRevision: saved.revision }
    } catch { return null }
  }
}
