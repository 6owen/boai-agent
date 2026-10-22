/*
 * [INPUT]: Electron Tray/Menu、原主窗口显示/退出入口、桌面偏好。
 * [OUTPUT]: 强引用同一Tray，按应用图标更新模板/回退与实际状态；关闭隐藏/全屏恢复保持。
 * [POS]: Electron 官方 Tray 示例适配；固定来源见第17组01。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { defaultAppIconId, isAppIconId, type AppIconId, type TrayIconStatus } from '../shared/appearance'
import { loadTrayIcon } from './tray-icon'
import type { DesktopSettingsStore } from './desktop-settings'

// Original BOAI pixel mark. NativeImage uses BGRA; no external raster asset or dependency.
function trayImage(size: number) {
  const bits = ['11110', '10001', '10001', '11110', '10001', '10001', '11110']
  const bytes = Buffer.alloc(size * size * 4)
  const unit = Math.max(1, Math.floor(size / 10)), x0 = Math.floor((size - unit * 5) / 2), y0 = Math.floor((size - unit * 7) / 2)
  for (let row = 0; row < bits.length; row++) for (let col = 0; col < 5; col++) if (bits[row][col] === '1') {
    for (let y = 0; y < unit; y++) for (let x = 0; x < unit; x++) {
      const offset = ((y0 + row * unit + y) * size + x0 + col * unit + x) * 4
      bytes[offset + 3] = 255
      if (process.platform !== 'darwin') { bytes[offset] = 205; bytes[offset + 1] = 90; bytes[offset + 2] = 70 }
    }
  }
  return nativeImage.createFromBitmap(bytes, { width: size, height: size })
}

export class BackgroundTray {
  private tray?: Tray
  private stopped = false
  private status: TrayIconStatus = { supported: process.platform === 'darwin', available: false, state: process.platform === 'darwin' ? 'waiting' : 'unsupported', appliedId: null, fallback: null, error: null }
  constructor(private readonly settings: DesktopSettingsStore, private readonly show: () => void, private readonly quit: () => void, private readonly report: (message: string) => void, private readonly assets = '') {}
  iconStatus(): TrayIconStatus { return { ...this.status } }
  private builtin() {
    const image = trayImage(process.platform === 'darwin' ? 22 : 32)
    if (process.platform === 'darwin') {
      image.addRepresentation({ scaleFactor: 2, dataURL: `data:image/png;base64,${trayImage(44).toPNG().toString('base64')}` })
      image.setTemplateImage(true)
    }
    return image
  }
  init(id: AppIconId = defaultAppIconId): TrayIconStatus {
    if (this.stopped) return this.iconStatus()
    if (this.tray) return this.applyIcon(id)
    let image: ReturnType<typeof trayImage>
    let appliedId: AppIconId | null = null, fallback: TrayIconStatus['fallback'] = null, error: string | null = null
    if (process.platform === 'darwin') {
      try { image = loadTrayIcon(this.assets, id); appliedId = id }
      catch {
        error = '所选托盘图标无法加载，正在使用备用图标。'
        try { image = loadTrayIcon(this.assets, defaultAppIconId); appliedId = defaultAppIconId; fallback = 'default' }
        catch { image = this.builtin(); fallback = 'builtin' }
      }
    } else image = this.builtin()
    try {
      this.tray = new Tray(image)
      this.tray.setToolTip('BoAI Agent')
      this.tray.on('click', this.show)
      this.settings.trayAvailable = true
      this.status = { ...this.status, available: true, appliedId, fallback, error, state: process.platform !== 'darwin' ? 'unsupported' : error ? 'failed' : 'applied' }
      this.refresh()
    } catch {
      this.settings.trayAvailable = false
      this.tray?.destroy(); this.tray = undefined
      this.status = { ...this.status, available: false, state: 'unavailable', appliedId: null, fallback: null, error: '系统托盘不可用。' }
      this.report('系统托盘不可用，关闭窗口将沿系统默认行为；应用保持可见。')
    }
    return this.iconStatus()
  }
  applyIcon(id: AppIconId): TrayIconStatus {
    if (this.stopped || process.platform !== 'darwin' || !this.tray) return this.iconStatus()
    if (!isAppIconId(id)) throw new Error('未知应用图标')
    if (this.status.appliedId === id && !this.status.error) return this.iconStatus()
    try {
      const image = loadTrayIcon(this.assets, id)
      this.tray.setImage(image)
      this.status = { ...this.status, appliedId: id, fallback: null, state: 'applied', error: null }
    } catch {
      // A failed replacement must retain the last usable image, menu and listeners.
      this.status = { ...this.status, state: 'failed', error: '托盘图标未能更新，已保留原图标。' }
    }
    return this.iconStatus()
  }
  retryIcon(id: AppIconId): TrayIconStatus { return this.tray ? this.applyIcon(id) : this.init(id) }
  refresh() {
    if (!this.tray) return
    const state = this.settings.snapshot()
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开 BoAI Agent', click: this.show },
      { type: 'separator' },
      { label: '关闭窗口后继续运行', type: 'checkbox', checked: state.preferences.runInBackground, enabled: !state.error, click: item => {
        void this.settings.update({ runInBackground: item.checked }, state.revision).catch(error => { this.refresh(); this.report(error instanceof Error ? error.message : '桌面设置保存失败。') })
      } },
      { type: 'separator' },
      { label: '退出 BoAI Agent', click: this.quit },
    ]))
  }
  shouldHide() { return this.settings.trayAvailable && this.settings.snapshot().preferences.runInBackground }
  stopIconUpdates() { this.stopped = true; this.status = { ...this.status, state: 'closed' } }
  resumeIconUpdates() { this.stopped = false; this.status = { ...this.status, state: !this.tray ? 'unavailable' : !this.status.supported ? 'unsupported' : this.status.error ? 'failed' : 'applied' } }
  destroy() { this.stopIconUpdates(); this.tray?.destroy(); this.tray = undefined; this.settings.trayAvailable = false; this.status = { ...this.status, available: false } }
}

const pendingHides = new WeakMap<BrowserWindow, () => void>()
export function cancelWindowHide(window: BrowserWindow) {
  const hide = pendingHides.get(window)
  if (hide) window.removeListener('leave-full-screen', hide)
  pendingHides.delete(window)
}
export function hideMainWindow(window: BrowserWindow) {
  cancelWindowHide(window)
  if (process.platform === 'darwin' && window.isFullScreen()) {
    const hide = () => { pendingHides.delete(window); if (!window.isDestroyed()) window.hide() }
    pendingHides.set(window, hide)
    window.once('leave-full-screen', hide)
    window.setFullScreen(false)
  } else window.hide()
}
