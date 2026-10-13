/*
 * [INPUT]: Electron Tray/Menu、原主窗口显示/退出入口、桌面偏好。
 * [OUTPUT]: 强引用托盘、关闭隐藏与全屏恢复；零新 runtime 或渠道接收器。
 * [POS]: Electron 官方 Tray 示例适配；固定来源见第17组01。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
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
  constructor(private readonly settings: DesktopSettingsStore, private readonly show: () => void, private readonly quit: () => void, private readonly report: (message: string) => void) {}
  init() {
    try {
      const icon = trayImage(process.platform === 'darwin' ? 22 : 32)
      if (process.platform === 'darwin') {
        icon.addRepresentation({ scaleFactor: 2, buffer: trayImage(44).toPNG() })
        icon.setTemplateImage(true)
      }
      this.tray = new Tray(icon)
      this.tray.setToolTip('BoAI Agent')
      this.tray.on('click', this.show)
      this.settings.trayAvailable = true
      this.refresh()
    } catch {
      this.settings.trayAvailable = false
      this.tray?.destroy(); this.tray = undefined
      this.report('系统托盘不可用，关闭窗口将沿系统默认行为；应用保持可见。')
    }
  }
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
  destroy() { this.tray?.destroy(); this.tray = undefined; this.settings.trayAvailable = false }
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
