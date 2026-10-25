/*
 * [INPUT]: Validated saved appIconId, local Dock assets/native helper and the single Tray owner.
 * [OUTPUT]: Immediate Dock/tray updates, separately serialized installed-icon writes, latest-request status and targeted retry.
 * [POS]: Main-process app icon lifecycle; development never writes an installed app.
 * [PROTOCOL]: Update this Header and apps/electron/src/main/.folder.md when this file changes.
 */
import { app, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { defaultAppIconId, isAppIconId, type AppIconId, type AppIconStatus, type TrayIconStatus } from '@boai/shared/appearance'

const run = promisify(execFile)
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
export type TrayIconPort = { snapshot(): TrayIconStatus; apply(id: AppIconId): TrayIconStatus; retry(id: AppIconId): TrayIconStatus }

export class AppIconController {
  private status: AppIconStatus
  private tail: Promise<unknown> = Promise.resolve()
  private requested = defaultAppIconId
  private ticket = 0
  private closed = false
  private active?: { id: AppIconId; ticket: number; work: Promise<AppIconStatus> }
  constructor(private readonly assets: string, private readonly helper: string, private readonly changed: (status: AppIconStatus) => void, private readonly tray: TrayIconPort) {
    const macos = process.platform === 'darwin'
    this.status = {
      sequence: 0,
      platform: macos ? 'macos' : 'unsupported',
      environment: app.isPackaged ? 'installed' : 'development',
      requestedId: defaultAppIconId,
      pending: false,
      dock: { appliedId: null, error: null },
      tray: { supported: macos, available: false, state: macos ? 'waiting' : 'unsupported', appliedId: null, fallback: null, error: null },
      installed: { appliedId: null, error: null, available: macos && app.isPackaged },
    }
  }
  snapshot(): AppIconStatus { return structuredClone(this.status) }
  private publish() { this.status.sequence++; this.changed(this.snapshot()) }
  private dockReady(id: string) { return this.status.dock.appliedId === id && !this.status.dock.error }
  private trayReady(id: string) { return !this.status.tray.supported || this.status.tray.state === 'applied' && this.status.tray.appliedId === id && !this.status.tray.error }
  private installedReady(id: string) { return !this.status.installed.available || !this.active && this.status.installed.appliedId === id && !this.status.installed.error }
  apply(id: AppIconId, retry = false): Promise<AppIconStatus> {
    if (this.closed) return Promise.reject(new Error('应用正在退出，图标更新已停止。'))
    if (!isAppIconId(id)) return Promise.reject(new Error('未知应用图标'))
    this.status.tray = this.tray.snapshot()
    if (!retry && this.active?.id === id && this.active.ticket === this.ticket) return this.active.work
    if (id === this.requested && this.dockReady(id) && this.trayReady(id) && this.installedReady(id) && !this.status.pending) return Promise.resolve(this.snapshot())
    this.requested = id
    const ticket = ++this.ticket
    this.status.requestedId = id
    this.status.pending = true
    this.publish()
    if (this.status.platform !== 'macos') {
      this.status.dock.error = '当前系统不支持 macOS Dock 图标。'
      this.status.pending = false; this.publish(); return Promise.resolve(this.snapshot())
    }
    // Runtime targets never wait behind an earlier, slow installed-app helper process.
    if (!this.dockReady(id)) {
      try {
        const image = nativeImage.createFromPath(join(this.assets, `${id}.png`))
        if (image.isEmpty() || image.getSize().width < 256) throw new Error('Dock图标文件无法解码。')
        app.dock!.setIcon(image)
        this.status.dock = { appliedId: id, error: null }
      } catch (error) {
        this.status.dock.error = failure(error)
        if (id !== defaultAppIconId) {
          try {
            const fallback = nativeImage.createFromPath(join(this.assets, `${defaultAppIconId}.png`))
            if (!fallback.isEmpty()) { app.dock!.setIcon(fallback); this.status.dock.appliedId = defaultAppIconId }
          } catch { /* Retain the previous actual Dock state and the original error. */ }
        }
      }
    }
    if (!this.trayReady(id)) {
      try { this.status.tray = retry ? this.tray.retry(id) : this.tray.apply(id) }
      catch (error) { this.status.tray = { ...this.tray.snapshot(), state: 'failed', error: failure(error) } }
    }
    if (this.installedReady(id)) {
      this.status.pending = false; this.publish(); return Promise.resolve(this.snapshot())
    }
    // A new choice owns all future status. Already-started native writes are drained,
    // then the latest saved choice is written; skipped intermediate choices never run.
    this.status.installed.error = null
    this.publish()
    const work = this.tail.then(async () => {
      if (this.closed || ticket !== this.ticket) return this.snapshot()
      try {
        const executable = await realpath(process.execPath)
        const bundle = dirname(dirname(dirname(executable)))
        if (!basename(bundle).endsWith('.app')) throw new Error('未找到当前运行应用的 .app 副本。')
        if (this.closed || ticket !== this.ticket) return this.snapshot()
        await run(this.helper, [id === defaultAppIconId ? 'reset' : 'set', bundle, ...(id === defaultAppIconId ? [] : [join(this.assets, `${id}.png`)])], { timeout: 15_000, maxBuffer: 100_000 })
        if (!this.closed && ticket === this.ticket) this.status.installed = { appliedId: id, error: null, available: true }
      } catch (error) {
        if (!this.closed && ticket === this.ticket) this.status.installed.error = failure(error)
      }
      if (!this.closed && ticket === this.ticket) { this.status.pending = false; this.publish() }
      return this.snapshot()
    }).finally(() => { if (this.active?.ticket === ticket) this.active = undefined })
    this.active = { id, ticket, work }
    this.tail = work.catch(() => {})
    return work
  }
  retry() { return this.apply(this.requested, true) }
  async close() { this.closed = true; this.ticket++; this.status.pending = false; this.status.tray = this.tray.snapshot(); await this.tail }
  resume() { this.closed = false; return this.apply(this.requested) }
}
