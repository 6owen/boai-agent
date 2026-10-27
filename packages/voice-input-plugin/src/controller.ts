/*
 * [OUTPUT]: 2026-10-27 临时预览、一次草稿插入、改稿失效与迟到整理保护。
 * [INPUT]: Voice API events, active Composer target and actual capture lifecycle.
 * [OUTPUT]: Ephemeral ordered preview, once-only insertion and guarded optional refinement.
 * [POS]: Plugin UI controller; draft writes are delegated to host editor transactions.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import type { VoiceApi, VoiceEvent, VoiceIdentity } from './protocol'
import { captureVoice, type VoiceCapture } from './capture'
export interface VoiceAnchor { scope: string; revision: number; start: number; end: number }
export interface VoiceDraftPort {
  snapshot(): VoiceAnchor | undefined
  insert(anchor: VoiceAnchor, text: string): VoiceAnchor | undefined
  replace(anchor: VoiceAnchor, original: string, text: string): VoiceAnchor | undefined
}
export interface VoiceUi { phase: 'idle' | 'starting' | 'recording' | 'finishing'; preview: string; pending?: string; partial?: boolean; canRestore?: boolean }
export class VoiceController {
  private identity?: VoiceIdentity
  private controller?: AbortController
  private capture?: VoiceCapture
  private unsubscribe?: () => void
  private segments = new Map<string, Extract<VoiceEvent, { type: 'segment' }>>()
  private anchor?: VoiceAnchor
  private sequence = 0
  private generation = 0
  private consumed = false
  private latest?: { anchor: VoiceAnchor; raw: string; text: string }
  state: VoiceUi = { phase: 'idle', preview: '' }
  constructor(private api: VoiceApi, private draft: VoiceDraftPort, private change: (state: VoiceUi) => void, private error: (message: string) => void, private createCapture = captureVoice) {}
  private update(patch: Partial<VoiceUi>) { this.state = { ...this.state, ...patch }; this.change(this.state) }
  async start(instanceId: string) {
    if (this.state.phase !== 'idle') return
    const closing = this.cancel()
    const generation = ++this.generation, controller = new AbortController(); this.controller = controller
    this.update({ phase: 'starting', preview: '', pending: undefined, partial: false, canRestore: false }); this.segments.clear(); this.sequence = 0; this.consumed = false; this.latest = undefined
    const anchor = this.draft.snapshot()
    if (!anchor) { await this.cancel(); return }
    this.anchor = anchor
    const current = () => { if (generation !== this.generation || controller.signal.aborted) { controller.abort(); throw new Error('录音已取消') } }
    try {
      await closing; current()
      const snapshot = await this.api.snapshot(); current()
      const identity: VoiceIdentity = { sessionId: crypto.randomUUID(), scope: anchor.scope, instanceId, generation, draftRevision: anchor.revision, settingsRevision: snapshot.settings.revision, anchor: { start: anchor.start, end: anchor.end } }
      this.identity = identity
      this.unsubscribe = this.api.subscribe(event => {
        if (this.identity !== identity || controller.signal.aborted || event.sessionId !== identity.sessionId) return
        if (event.type === 'cancelled') { void this.cancel(); return }
        if (event.type === 'failed') { void this.finish(true); return }
        if (event.type !== 'segment') return
        const previous = this.segments.get(event.id)
        if (previous?.final || previous && previous.revision >= event.revision) return
        this.segments.set(event.id, event)
        this.update({ preview: [...this.segments.values()].sort((a, b) => a.sequence - b.sequence).map(item => item.text).join('') })
      })
      await this.api.start(identity); current()
      const capture = await this.createCapture(controller.signal, pcm => this.api.append({ sessionId: identity.sessionId, sequence: this.sequence++, pcm }), error => { this.error(error.message); void this.finish(true) })
      if (generation !== this.generation || controller.signal.aborted || this.identity !== identity || this.consumed) { capture.cancel(); return }
      this.capture = capture; this.update({ phase: 'recording' })
    } catch (error) { if (generation === this.generation) { if (!controller.signal.aborted) this.error(error instanceof Error ? error.message : '无法开始录音'); await this.cancel() } else controller.abort() }
  }
  private finishing?: string
  async finish(captureFailed = false) {
    const identity = this.identity, anchor = this.anchor, controller = this.controller
    if (!identity || !anchor || !controller || this.finishing === identity.sessionId || this.consumed) return
    this.finishing = identity.sessionId; this.update({ phase: 'finishing' })
    try {
      if (captureFailed) this.capture?.cancel(); else await this.capture?.stop()
      this.capture = undefined
      const result = await this.api.finish(identity.sessionId)
      if (controller.signal.aborted || this.identity !== identity) return
      this.consumed = true; this.unsubscribe?.(); this.unsubscribe = undefined
      if (result.error) this.error(result.error)
      this.update({ phase: 'idle', preview: '', pending: undefined })
      if (!result.text.trim()) return
      if (!result.complete || captureFailed) { this.update({ pending: result.text, partial: true }); return }
      const inserted = this.draft.insert(anchor, result.text)
      if (!inserted) { this.update({ pending: result.text, partial: false }); return }
      await this.refine(identity, inserted, result.text)
    } catch (error) {
      if (!controller.signal.aborted && this.identity === identity) {
        this.error(error instanceof Error ? error.message : '语音识别失败')
        const text = [...this.segments.values()].filter(item => item.final).sort((a, b) => a.sequence - b.sequence).map(item => item.text).join('')
        this.consumed = true; this.unsubscribe?.(); this.unsubscribe = undefined; this.capture?.cancel(); this.capture = undefined
        await this.api.cancel(identity.sessionId).catch(() => {})
        if (!controller.signal.aborted && this.identity === identity) this.update({ phase: 'idle', preview: '', pending: text || undefined, partial: true })
      }
    } finally { if (this.finishing === identity.sessionId) this.finishing = undefined }
  }
  insertPending() {
    const anchor = this.draft.snapshot(), text = this.state.pending
    if (!anchor || !text) return
    if (this.draft.insert(anchor, text)) this.update({ pending: undefined, partial: false })
  }
  private async refine(identity: VoiceIdentity, anchor: VoiceAnchor, raw: string) {
    const result = await this.api.refine({ sessionId: identity.sessionId, text: raw, settingsRevision: identity.settingsRevision }).catch(() => null)
    if (this.identity !== identity || this.controller?.signal.aborted || !result || result.settingsRevision !== identity.settingsRevision || result.text === raw) return
    const replaced = this.draft.replace(anchor, raw, result.text)
    if (replaced) { this.latest = { anchor: replaced, raw, text: result.text }; this.update({ canRestore: true }) }
  }
  restoreRaw() { if (this.latest) { this.draft.replace(this.latest.anchor, this.latest.text, this.latest.raw); this.latest = undefined; this.update({ canRestore: false }) } }
  async cancel() {
    this.generation++; this.controller?.abort(); this.capture?.cancel(); this.capture = undefined; this.unsubscribe?.(); this.unsubscribe = undefined
    const id = this.identity?.sessionId; this.identity = undefined; this.finishing = undefined; this.latest = undefined; this.anchor = undefined; this.segments.clear()
    this.update({ phase: 'idle', preview: '', pending: undefined, partial: false, canRestore: false })
    if (id) await this.api.cancel(id).catch(error => this.error(error instanceof Error ? error.message : '语音会话关闭失败'))
  }
}
