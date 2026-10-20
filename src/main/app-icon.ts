/*
 * [INPUT]: Validated appearance appIconId and checked-in PNG/native helper assets.
 * [OUTPUT]: Serialized macOS Dock and current installed .app icon application with separate status.
 * [POS]: Main-process app icon lifecycle; development never writes an installed app.
 * [PROTOCOL]: Update this Header and src/main/.folder.md when this file changes.
 */
import { app, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { access, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { defaultAppIconId, isAppIconId, type AppIconId, type AppIconStatus } from '../shared/appearance'

const run = promisify(execFile)
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)

export class AppIconController {
  private status: AppIconStatus
  private tail: Promise<unknown> = Promise.resolve()
  private requested = defaultAppIconId
  constructor(private readonly assets: string, private readonly helper: string, private readonly changed: (status: AppIconStatus) => void) {
    const macos = process.platform === 'darwin'
    this.status = {
      platform: macos ? 'macos' : 'unsupported',
      environment: app.isPackaged ? 'installed' : 'development',
      requestedId: defaultAppIconId,
      pending: false,
      dock: { appliedId: null, error: null },
      installed: { appliedId: null, error: null, available: macos && app.isPackaged },
    }
  }
  snapshot(): AppIconStatus { return structuredClone(this.status) }
  private publish() { this.changed(this.snapshot()) }
  apply(id: AppIconId, force = false): Promise<AppIconStatus> {
    if (!isAppIconId(id)) return Promise.reject(new Error('未知应用图标'))
    if (!force && id === this.requested && (this.status.pending || this.status.dock.appliedId === id)) return Promise.resolve(this.snapshot())
    this.requested = id
    this.status.requestedId = id
    this.status.pending = true
    this.publish()
    const work = this.tail.then(async () => {
      if (this.requested !== id) return this.snapshot()
      if (this.status.platform !== 'macos') {
        this.status.dock.error = '当前系统不支持 macOS Dock 图标。'
      } else {
        const dock = app.dock!
        const iconPath = join(this.assets, `${id}.png`)
        try {
          await access(iconPath)
          const image = nativeImage.createFromPath(iconPath)
          if (image.isEmpty() || image.getSize().width < 256) throw new Error('图标文件无法解码。')
          dock.setIcon(image)
          this.status.dock = { appliedId: id, error: null }
        } catch (error) {
          this.status.dock.error = failure(error)
          if (id !== defaultAppIconId) {
            const fallback = nativeImage.createFromPath(join(this.assets, `${defaultAppIconId}.png`))
            if (!fallback.isEmpty()) { dock.setIcon(fallback); this.status.dock.appliedId = defaultAppIconId }
          }
        }
        if (this.status.installed.available) {
          try {
            const executable = await realpath(process.execPath)
            const bundle = dirname(dirname(dirname(executable)))
            if (!basename(bundle).endsWith('.app')) throw new Error('未找到当前运行应用的 .app 副本。')
            await run(this.helper, [id === defaultAppIconId ? 'reset' : 'set', bundle, ...(id === defaultAppIconId ? [] : [iconPath])], { timeout: 15_000, maxBuffer: 100_000 })
            this.status.installed = { appliedId: id, error: null, available: true }
          } catch (error) {
            this.status.installed.error = failure(error)
          }
        }
      }
      if (this.requested === id) this.status.pending = false
      this.publish()
      return this.snapshot()
    })
    this.tail = work.catch(() => {})
    return work
  }
  retry() { return this.apply(this.requested, true) }
}
