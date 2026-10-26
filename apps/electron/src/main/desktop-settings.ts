/*
 * [INPUT]: 固定布尔偏好、Electron 原生登录项端口与独立 JSON 文件。
 * [OUTPUT]: 原子保存/串行版本校验，开发环境零登录项写入；读取实际 OS 状态。
 * [POS]: 桌面偏好宿主；不进入业务备份或外观配置。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DesktopPatch, DesktopSettings } from '@boai/shared/ipc/desktop'

export const LOGIN_ARGUMENT = '--boai-login-start'
const preferencesSchema = z.object({ runInBackground: z.boolean(), startHidden: z.boolean() }).strict()
const fileSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), preferences: preferencesSchema }).strict()
const patchSchema = preferencesSchema.partial().extend({ openAtLogin: z.boolean().optional() }).strict()
type LoginOptions = { openAtLogin?: boolean; path?: string; args?: string[] }
type LoginState = { openAtLogin: boolean; executableWillLaunchAtLogin?: boolean; status?: string; wasOpenedAtLogin?: boolean }
export type LoginHost = {
  platform: string; packaged: boolean; executable: string
  get(options?: LoginOptions): LoginState
  set(options: LoginOptions): void
}

export class DesktopSettingsStore {
  private value = { schemaVersion: 1 as const, revision: 0, preferences: { runInBackground: true, startHidden: true } }
  private queue: Promise<unknown> = Promise.resolve()
  private error?: string
  trayAvailable = false
  constructor(private readonly path: string, private readonly host: LoginHost, private readonly changed: () => void) {}
  async init() {
    try {
      const bytes = await readFile(this.path)
      if (bytes.length > 16_384) throw new Error('过大')
      this.value = fileSchema.parse(JSON.parse(bytes.toString('utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = '桌面设置无法读取，已使用默认值；原文件保留，请修复后重启。'
    }
  }
  private loginOptions(): LoginOptions | undefined {
    return this.host.platform === 'win32' ? { path: this.host.executable, args: [LOGIN_ARGUMENT] } : undefined
  }
  snapshot(): DesktopSettings {
    let login: DesktopSettings['login'] = { supported: false, enabled: false, status: this.host.packaged ? 'unsupported' : 'development' }
    if (this.host.packaged && ['darwin', 'win32'].includes(this.host.platform)) {
      try {
        const state = this.host.get(this.loginOptions())
        const enabled = state.openAtLogin && (this.host.platform !== 'win32' || state.executableWillLaunchAtLogin !== false)
        login = { supported: true, enabled, status: state.status === 'requires-approval' ? 'requires-approval' : enabled ? 'enabled' : 'disabled' }
      } catch { login = { supported: true, enabled: false, status: 'error' } }
    }
    return { revision: this.value.revision, preferences: { ...this.value.preferences }, trayAvailable: this.trayAvailable, login, ...(this.error ? { error: this.error } : {}) }
  }
  hiddenAtLogin(argv: string[]) {
    if (!this.value.preferences.runInBackground || !this.value.preferences.startHidden || !this.trayAvailable || !this.host.packaged) return false
    if (this.host.platform === 'win32') return argv.includes(LOGIN_ARGUMENT)
    if (this.host.platform === 'darwin') { try { return this.host.get().wasOpenedAtLogin === true } catch { return false } }
    return false
  }
  update(input: DesktopPatch, expectedRevision: number): Promise<DesktopSettings> {
    const work = this.queue.then(async () => {
      if (this.error) throw new Error(this.error)
      const patch = patchSchema.parse(input)
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== this.value.revision) throw new Error('桌面设置已变化，请刷新后重试。')
      if (patch.openAtLogin !== undefined) {
        if (!this.snapshot().login.supported) throw new Error('开机启动仅支持安装后的 macOS / Windows 应用。')
        // This operation is deliberately separate from local preference persistence.
        if (Object.keys(patch).length !== 1) throw new Error('请单独修改开机启动。')
        this.host.set({ ...this.loginOptions(), openAtLogin: patch.openAtLogin })
      } else {
        const next = { schemaVersion: 1 as const, revision: this.value.revision + 1, preferences: { ...this.value.preferences, ...patch } }
        const temp = `${this.path}.${randomUUID()}.tmp`
        await mkdir(dirname(this.path), { recursive: true })
        try { await writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await rename(temp, this.path) }
        finally { await rm(temp, { force: true }) }
        this.value = next
      }
      this.changed()
      return this.snapshot()
    })
    this.queue = work.catch(() => {})
    return work
  }
  async flush() { await this.queue }
}
