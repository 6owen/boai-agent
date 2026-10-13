/*
 * [INPUT]: 假 Electron 托盘与窗口、固定桌面偏好。
 * [OUTPUT]: 托盘失败可恢复、退出沿原入口、macOS全屏隐藏可取消。
 * [POS]: 后台生命周期边界回归，不操作用户托盘。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { BackgroundTray, cancelWindowHide, hideMainWindow } from '../src/main/background'
import type { DesktopSettingsStore } from '../src/main/desktop-settings'
const fake = vi.hoisted(() => ({ fail: false, instances: [] as { menu: any[]; handlers: Record<string, () => void>; destroy: ReturnType<typeof vi.fn> }[] }))
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: (items: unknown) => items },
  nativeImage: { createFromBitmap: () => ({ addRepresentation() {}, setTemplateImage() {}, toPNG: () => Buffer.alloc(0) }) },
  Tray: class {
    menu: any[] = []; handlers: Record<string, () => void> = {}; destroy = vi.fn()
    constructor() { if (fake.fail) throw new Error('tray'); fake.instances.push(this) }
    setContextMenu(menu: any[]) { this.menu = menu }
    setToolTip() {}
    on(event: string, handler: () => void) { this.handlers[event] = handler }
  },
}))
afterEach(() => { fake.fail = false; fake.instances.length = 0 })
const settings = () => ({ trayAvailable: false, snapshot: () => ({ revision: 0, preferences: { runInBackground: true, startHidden: true } }), update: vi.fn() })
it('托盘不可用时不能隐藏窗口留下无入口应用', () => {
  fake.fail = true
  const store = settings(), show = vi.fn(), quit = vi.fn(), report = vi.fn()
  const tray = new BackgroundTray(store as unknown as DesktopSettingsStore, show, quit, report)
  tray.init()
  expect(store.trayAvailable).toBe(false); expect(tray.shouldHide()).toBe(false)
  expect(report).toHaveBeenCalledTimes(1); expect(quit).not.toHaveBeenCalled()
})
it('打开和退出使用同一宿主入口，不创建新的运行服务', () => {
  const store = settings(), show = vi.fn(), quit = vi.fn()
  const tray = new BackgroundTray(store as unknown as DesktopSettingsStore, show, quit, vi.fn()); tray.init()
  fake.instances[0].menu[0].click(); fake.instances[0].handlers.click()
  fake.instances[0].menu.at(-1).click()
  expect(show).toHaveBeenCalledTimes(2); expect(quit).toHaveBeenCalledTimes(1)
  tray.destroy(); expect(tray.shouldHide()).toBe(false); expect(fake.instances[0].destroy).toHaveBeenCalledTimes(1)
})
it.runIf(process.platform === 'darwin')('全屏关闭等系统离开全屏，期间重开可取消待隐藏', () => {
  const window = Object.assign(new EventEmitter(), { isFullScreen: () => true, isDestroyed: () => false, hide: vi.fn(), setFullScreen: vi.fn() })
  hideMainWindow(window as unknown as BrowserWindow)
  expect(window.setFullScreen).toHaveBeenCalledWith(false); expect(window.hide).not.toHaveBeenCalled()
  cancelWindowHide(window as unknown as BrowserWindow); window.emit('leave-full-screen'); expect(window.hide).not.toHaveBeenCalled()
  hideMainWindow(window as unknown as BrowserWindow); window.emit('leave-full-screen'); expect(window.hide).toHaveBeenCalledTimes(1)
})
