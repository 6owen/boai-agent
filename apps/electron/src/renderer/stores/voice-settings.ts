/*
 * [OUTPUT]: 多模型目录独立于配置草稿刷新；保留模型身份CAS和资源回执排序，重进复用新鲜目录。
 * [INPUT]: 语音配置草稿、版本化宿主回执、导航与窗口结束事件。
 * [OUTPUT]: 页外快照缓存与串行自动保存；失效/过期才重读，背景读取不覆盖草稿，API切换隔离迟到回执。
 * [POS]: Renderer 语音设置状态所有者；不启动录音、下载或在线识别。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import { validateVoiceLanguage, type VoiceSettings, type VoiceSnapshot } from '@boai/shared/plugins/voice-input'

export type VoiceDraft = { settings: VoiceSettings; terms: string; key?: string }
type State = { snapshot?: VoiceSnapshot; models?: VoiceSnapshot['models']; draft?: VoiceDraft; loading: boolean; saving: boolean; error?: string }
export const voiceDraft = (snapshot: VoiceSnapshot): VoiceDraft => ({ settings: snapshot.settings, terms: snapshot.settings.terms.map(term => [term.word, ...term.aliases].join(' | ')).join('\n') })
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export class VoiceSettingsController {
  readonly store = createStore<State>(() => ({ loading: false, saving: false }))
  private api?: DesktopApi
  private subscriptions: (() => void)[] = []
  private version = 0
  private queued = false
  private writing?: Promise<boolean>
  private loading?: Promise<void>
  private generation = 0
  private readVersion = 0
  private modelRequest = 0
  private modelAccepted = 0
  private modelsUpdatedAt = 0
  private updatedAt = 0
  private invalidated = true
  private active = 0

  initialize(api: DesktopApi) {
    if (this.api === api) return
    this.dispose(); this.api = api
    this.subscriptions.push(api.subscribe(event => {
      if (event.type === 'plugins:changed' || event.type === 'changed' && !event.conversationId) this.invalidate()
      if (event.type === 'voice-settings:flush') void (async () => {
        const clean = event.discard ? await this.discard() : await this.flush()
        await api.request('completeVoiceSettingsFlush', { requestId: event.requestId, clean, settled: !this.store.getState().saving }).catch(() => {})
      })()
    }))
    let previous = false
    this.subscriptions.push(this.store.subscribe(() => {
      const dirty = this.hasWork()
      if (dirty !== previous) { previous = dirty; void api.request('setUnsavedChanges', { source: 'voice', dirty }).catch(() => {}) }
    }))
  }
  dispose() {
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions = []; this.api = undefined; this.generation++; this.readVersion++; this.modelRequest++; this.modelAccepted = 0; this.modelsUpdatedAt = 0
    this.loading = undefined; this.writing = undefined; this.queued = false; this.active = 0; this.updatedAt = 0; this.invalidated = true
    this.store.setState({ snapshot: undefined, models: undefined, draft: undefined, loading: false, saving: false, error: undefined })
  }
  activate() {
    const generation = this.generation
    this.active++; void this.load()
    return () => { if (generation === this.generation) this.active-- }
  }
  invalidate() {
    this.invalidated = true; this.readVersion++
    if (this.active) void this.load()
  }
  hasWork() { const state = this.store.getState(); return !!state.draft || state.saving }
  async load(force = false) {
    if (!this.api?.voice || this.hasWork()) return
    if (!force && !this.invalidated && this.store.getState().snapshot && Date.now() - this.updatedAt < 60_000) return
    if (!this.loading) {
      const generation = this.generation, readVersion = this.readVersion, version = this.version, modelRequest = ++this.modelRequest
      this.store.setState({ loading: true })
      const loading = this.api.voice.snapshot().then(snapshot => {
        if (generation !== this.generation || readVersion !== this.readVersion || version !== this.version || this.hasWork()) return
        this.accept(snapshot, modelRequest)
        if (snapshot.diagnostic) this.fail(snapshot.diagnostic)
      }).catch(error => { if (generation === this.generation && readVersion === this.readVersion) this.fail(error) }).finally(() => {
        if (generation !== this.generation || this.loading !== loading) return
        this.loading = undefined; this.store.setState({ loading: false })
        if (readVersion !== this.readVersion && this.active && !this.hasWork()) void this.load()
      })
      this.loading = loading
    }
    await this.loading
  }
  private acceptModels(snapshot: VoiceSnapshot, request: number) {
    if (request < this.modelAccepted) return
    this.modelAccepted = request; this.modelsUpdatedAt = Date.now()
    this.store.setState({ models: snapshot.models })
  }
  async refreshModels(force = true) {
    const api = this.api, generation = this.generation
    if (!api?.voice) return
    if (!force) {
      await this.loading
      if (api !== this.api || generation !== this.generation) return
      if (this.store.getState().models && Date.now() - this.modelsUpdatedAt < 5000) return
    }
    const request = ++this.modelRequest, snapshot = await api.voice.snapshot()
    if (api === this.api && generation === this.generation) this.acceptModels(snapshot, request)
  }
  private accept(snapshot: VoiceSnapshot, modelRequest: number) {
    this.acceptModels(snapshot, modelRequest)
    const previous = this.store.getState().snapshot
    const next = previous && previous.settings.revision > snapshot.settings.revision ? { ...snapshot, settings: previous.settings, onlineKeyPresent: previous.onlineKeyPresent } : snapshot
    this.updatedAt = Date.now(); this.invalidated = false
    this.store.setState({ snapshot: next, error: snapshot.diagnostic })
  }
  edit(change: (draft: VoiceDraft) => VoiceDraft, immediate = false) {
    const state = this.store.getState()
    if (!state.snapshot || state.snapshot.readOnly) return
    const draft = change(state.draft ?? voiceDraft(state.snapshot))
    this.version++
    this.store.setState({ draft: !state.saving && JSON.stringify(draft) === JSON.stringify(voiceDraft(state.snapshot)) ? undefined : draft, error: undefined })
    if (immediate) void this.flush()
  }
  private fail(error: unknown) {
    this.store.setState({ error: message(error) })
    this.invalidated = true
    toast.error(message(error), { action: { label: '重试', onClick: () => { void (this.hasWork() ? this.flush() : this.load(true)) } } })
  }
  flush(): Promise<boolean> {
    this.queued = true
    if (this.writing) return this.writing
    const generation = this.generation
    const writing = Promise.resolve().then(async () => {
      while (this.queued && generation === this.generation) {
        this.queued = false
        const { draft, snapshot } = this.store.getState(), version = this.version, modelRequest = ++this.modelRequest
        if (!draft || !snapshot) break
        if (!this.api?.voice || snapshot.readOnly) return false
        this.store.setState({ saving: true })
        try {
          const { settings, terms, key } = draft
          validateVoiceLanguage(settings)
          const result = await this.api.voice.configure({ expectedRevision: settings.revision, settings: {
            mode: settings.mode, localModelId: settings.localModelId, language: settings.language, microphoneDeviceId: settings.microphoneDeviceId,
            online: { endpoint: settings.online.endpoint.trim(), model: settings.online.model.trim() }, refinement: settings.refinement,
            terms: terms.split('\n').map(line => line.split('|').map(word => word.trim()).filter(Boolean)).filter(parts => parts.length).map(([word, ...aliases]) => ({ word: word!, aliases })),
          }, ...(key !== undefined ? { apiKey: key } : {}) })
          if (generation !== this.generation) return false
          const current = this.store.getState().draft
          this.readVersion++; this.accept(result, modelRequest)
          this.store.setState({ draft: version === this.version || !current ? undefined : {
            ...current, key: current.key === key ? undefined : current.key,
            settings: { ...current.settings, revision: result.settings.revision },
          } })
          toast.success('语音输入设置已保存')
        } catch (error) { if (generation === this.generation) { this.queued = false; this.fail(error) } return false }
        finally { if (generation === this.generation) this.store.setState({ saving: false }) }
      }
      return generation === this.generation && !this.hasWork()
    }).finally(() => { if (this.writing === writing) this.writing = undefined })
    this.writing = writing
    return writing
  }
  async discard(): Promise<boolean> {
    const generation = this.generation
    await this.writing
    if (generation !== this.generation) return false
    if (!this.api?.voice) return !this.hasWork()
    try {
      // A rejected configure can follow a committed write. Re-read before abandoning its draft.
      const modelRequest = ++this.modelRequest, snapshot = await this.api.voice.snapshot()
      if (generation !== this.generation) return false
      this.version++; this.readVersion++; this.accept(snapshot, modelRequest); this.store.setState({ draft: undefined })
      return true
    } catch (error) { if (generation === this.generation) this.fail(error); return false }
  }
}

export const voiceSettings = new VoiceSettingsController()
export const useVoiceSettings = () => useStore(voiceSettings.store)
