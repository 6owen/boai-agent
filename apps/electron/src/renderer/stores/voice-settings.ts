/*
 * [INPUT]: 语音配置草稿、版本化宿主回执、导航与窗口结束事件。
 * [OUTPUT]: 页外串行自动保存；失败保留草稿，旧回执不覆盖新输入，关闭前等待写入结束。
 * [POS]: Renderer 语音设置状态所有者；不启动录音、下载或在线识别。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import type { DesktopApi } from '@boai/shared/ipc'
import { validateVoiceLanguage, type VoiceSettings, type VoiceSnapshot } from '@boai/shared/plugins/voice-input'

export type VoiceDraft = { settings: VoiceSettings; terms: string; key?: string }
type State = { snapshot?: VoiceSnapshot; draft?: VoiceDraft; loading: boolean; saving: boolean; error?: string }
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

  initialize(api: DesktopApi) {
    if (this.api === api) return
    this.dispose(); this.api = api
    this.subscriptions.push(api.subscribe(event => {
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
  dispose() { for (const unsubscribe of this.subscriptions) unsubscribe(); this.subscriptions = [] }
  hasWork() { const state = this.store.getState(); return !!state.draft || state.saving }
  async load() {
    if (!this.api?.voice || this.hasWork()) return
    if (!this.loading) {
      this.store.setState({ loading: true })
      this.loading = this.api.voice.snapshot().then(snapshot => {
        if (!this.hasWork()) this.store.setState({ snapshot, error: snapshot.diagnostic })
        if (snapshot.diagnostic) this.fail(snapshot.diagnostic)
      }).catch(error => this.fail(error)).finally(() => { this.loading = undefined; this.store.setState({ loading: false }) })
    }
    await this.loading
  }
  edit(change: (draft: VoiceDraft) => VoiceDraft, immediate = false) {
    const state = this.store.getState()
    if (!state.snapshot || state.snapshot.readOnly || state.loading) return
    const draft = change(state.draft ?? voiceDraft(state.snapshot))
    this.version++
    this.store.setState({ draft: !state.saving && JSON.stringify(draft) === JSON.stringify(voiceDraft(state.snapshot)) ? undefined : draft, error: undefined })
    if (immediate) void this.flush()
  }
  private fail(error: unknown) {
    this.store.setState({ error: message(error) })
    toast.error(message(error), { action: { label: '重试', onClick: () => { void (this.hasWork() ? this.flush() : this.load()) } } })
  }
  flush(): Promise<boolean> {
    this.queued = true
    if (this.writing) return this.writing
    this.writing = Promise.resolve().then(async () => {
      while (this.queued) {
        this.queued = false
        const { draft, snapshot } = this.store.getState(), version = this.version
        if (!draft || !snapshot) break
        if (!this.api?.voice || snapshot.readOnly) return false
        this.store.setState({ saving: true })
        try {
          const { settings, terms, key } = draft
          validateVoiceLanguage(settings)
          const result = await this.api.voice.configure({ expectedRevision: settings.revision, settings: {
            mode: settings.mode, language: settings.language, microphoneDeviceId: settings.microphoneDeviceId,
            online: { endpoint: settings.online.endpoint.trim(), model: settings.online.model.trim() }, refinement: settings.refinement,
            terms: terms.split('\n').map(line => line.split('|').map(word => word.trim()).filter(Boolean)).filter(parts => parts.length).map(([word, ...aliases]) => ({ word: word!, aliases })),
          }, ...(key !== undefined ? { apiKey: key } : {}) })
          const current = this.store.getState().draft
          this.store.setState({ snapshot: result, error: undefined, draft: version === this.version || !current ? undefined : {
            ...current, key: current.key === key ? undefined : current.key,
            settings: { ...current.settings, revision: result.settings.revision },
          } })
          toast.success('语音输入设置已保存')
        } catch (error) { this.queued = false; this.fail(error); return false }
        finally { this.store.setState({ saving: false }) }
      }
      return !this.hasWork()
    }).finally(() => { this.writing = undefined })
    return this.writing
  }
  async discard(): Promise<boolean> {
    await this.writing
    if (!this.api?.voice) return !this.hasWork()
    try {
      // A rejected configure can follow a committed write. Re-read before abandoning its draft.
      const snapshot = await this.api.voice.snapshot()
      this.version++; this.store.setState({ snapshot, draft: undefined, error: snapshot.diagnostic })
      return true
    } catch (error) { this.fail(error); return false }
  }
}

export const voiceSettings = new VoiceSettingsController()
export const useVoiceSettings = () => useStore(voiceSettings.store)
