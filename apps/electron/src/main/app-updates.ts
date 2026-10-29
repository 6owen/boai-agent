/*
 * [INPUT]: Sparkle bridge, packaged release metadata and the existing desktop quit lifecycle.
 * [OUTPUT]: Silent background download/delta fallback; installation only after host cleanup.
 * [POS]: Desktop-only update coordinator; no model calls, runtime replacement or data migration.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import type { SparkleBridge, SparkleBridgeEvent } from 'electron-sparkle-updater'
import type { AppUpdateState } from '@boai/shared/ipc/app-updates'

export class AppUpdates {
  private bridge?: SparkleBridge
  private restart = false
  private closing = false
  private started = false
  private state: AppUpdateState
  constructor(version: string, private readonly changed: (state: AppUpdateState) => void, private readonly log: (message: string) => void) {
    this.state = { revision: 0, currentVersion: version, phase: 'disabled', disabledReason: '安装支持更新的 macOS 版本后启用。' }
  }
  disable(reason: string) { if (!this.started) this.update({ disabledReason: reason }) }
  snapshot(): AppUpdateState { return { ...this.state } }
  private update(patch: Partial<AppUpdateState>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    this.changed(this.snapshot())
  }
  start(bridge: SparkleBridge, config: { feedUrl: string; publicKey: string }) {
    if (this.started || this.closing) return
    this.started = true
    try {
      const url = new URL(config.feedUrl)
      if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('更新地址必须使用 HTTPS')
      if (!/^[A-Za-z0-9+/]{43}=$/.test(config.publicKey)) throw new Error('更新校验公钥无效')
      this.bridge = bridge
      bridge.setEventHandler(event => this.onEvent(event))
      if (!bridge.init({ appcastUrl: config.feedUrl, publicEdKey: config.publicKey })) throw new Error('无法启动更新服务')
      this.update({ phase: 'idle', disabledReason: undefined })
      bridge.setAutomaticChecks(true)
      this.check()
    } catch (error) { this.bridge = undefined; this.fail(error) }
  }
  fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    this.log(message)
    this.update({ phase: 'error', error: message })
  }
  private onEvent(event: SparkleBridgeEvent) {
    if (this.closing) return
    switch (event.type) {
      case 'checking':
        if (this.state.phase !== 'ready') this.update({ phase: 'checking', error: undefined })
        break
      case 'update-available':
        this.update({ phase: 'downloading', availableVersion: event.version, releaseNotes: event.releaseNotes?.slice(0, 64_000), progress: 0, fallback: false, error: undefined })
        break
      case 'download-progress':
        this.update({ phase: event.phase === 'apply' ? 'preparing' : 'downloading', progress: Number.isFinite(event.percent) ? Math.max(0, Math.min(100, event.percent!)) : undefined, fallback: event.fallback || this.state.fallback })
        break
      case 'update-downloaded':
        this.update({ phase: 'ready', availableVersion: event.version ?? this.state.availableVersion, progress: 100, error: undefined })
        // Keep Sparkle's ready reply until the host has saved and drained on quit.
        break
      case 'update-not-available':
        if (this.state.phase !== 'ready') this.update({ phase: 'idle', availableVersion: undefined, progress: undefined, error: undefined })
        break
      case 'error': this.fail(event.message ?? '更新失败'); break
    }
  }
  check(): AppUpdateState {
    if (this.closing || !this.bridge || this.state.phase === 'disabled') return this.snapshot()
    if (['checking', 'downloading', 'preparing', 'ready', 'installing'].includes(this.state.phase)) return this.snapshot()
    this.update({ phase: 'checking', error: undefined })
    try { this.bridge.checkForUpdates() } catch (error) { this.fail(error) }
    return this.snapshot()
  }
  requestInstall(version: string, quit: () => void) {
    if (this.restart || this.closing) return
    if (!this.bridge || this.state.phase !== 'ready' || !version || version !== this.state.availableVersion) throw new Error('此版本尚未准备完成，请重新检查更新。')
    this.restart = true
    quit()
  }
  cancelInstall() { this.restart = false }
  /** Called only once the existing host shutdown has completed successfully. */
  finishQuit(): boolean {
    this.closing = true
    this.bridge?.setAutomaticChecks(false)
    if (!this.bridge || this.state.phase !== 'ready') { this.restart = false; return false }
    this.update({ phase: 'installing' })
    if (this.restart) { this.bridge.installUpdateNow(); return true }
    this.bridge.installUpdateOnQuit()
    return false
  }
  quitFailed(error: unknown) {
    this.restart = false; this.closing = false
    this.bridge?.setAutomaticChecks(true)
    if (this.state.phase === 'ready') {
      const message = error instanceof Error ? error.message : String(error)
      this.log(message); this.update({ error: message })
    } else this.fail(error)
  }
}
