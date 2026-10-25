/*
 * [OUTPUT]: 增补同一Tray换图、缺图/更新失败保旧图、默认/B回退及退出拒绝迟到换图；原后台断言保持。
 * [INPUT]: 假 Electron 托盘与窗口、固定桌面偏好。
 * [OUTPUT]: 托盘失败可恢复、退出沿原入口、macOS全屏隐藏可取消。
 * [POS]: 后台生命周期边界回归，不操作用户托盘。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { BackgroundTray, cancelWindowHide, hideMainWindow } from '../apps/electron/src/main/background'
import type { DesktopSettingsStore } from '../apps/electron/src/main/desktop-settings'
const fake = vi.hoisted(() => ({ fail: false, replaceFail: false, bad: new Set<string>(), loads: [] as string[], instances: [] as { menu: any[]; handlers: Record<string, () => void>; destroy: ReturnType<typeof vi.fn>; image: { id?: string }; updates: number }[] }))
vi.mock('../apps/electron/src/main/tray-icon', () => ({ loadTrayIcon: (_root: string, id: string) => { fake.loads.push(id); if (fake.bad.has(id)) throw new Error('missing'); return { id } } }))
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: (items: unknown) => items },
  nativeImage: { createFromBitmap: () => ({ addRepresentation() {}, setTemplateImage() {}, toPNG: () => Buffer.alloc(0) }) },
  Tray: class {
    menu: any[] = []; handlers: Record<string, () => void> = {}; destroy = vi.fn()
    image: { id?: string }; updates = 0
    constructor(image: { id?: string }) { if (fake.fail) throw new Error('tray'); this.image = image; fake.instances.push(this) }
    setImage(image: { id?: string }) { if (fake.replaceFail) throw new Error('setImage'); this.image = image; this.updates++ }
    setContextMenu(menu: any[]) { this.menu = menu }
    setToolTip() {}
    on(event: string, handler: () => void) { this.handlers[event] = handler }
  },
}))
afterEach(() => { fake.fail = false; fake.replaceFail = false; fake.instances.length = 0; fake.bad.clear(); fake.loads.length = 0 })
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

it.runIf(process.platform === 'darwin')('直接以保存ID启动，多次换图仍为同一Tray及原菜单/监听器', () => {
  const store = settings(), show = vi.fn(), quit = vi.fn(), tray = new BackgroundTray(store as unknown as DesktopSettingsStore, show, quit, vi.fn(), '/assets')
  tray.init('avatar-bear'); expect(fake.instances[0].image.id).toBe('avatar-bear')
  const menu = fake.instances[0].menu, handler = fake.instances[0].handlers.click
  for (const id of ['avatar-mint-ring', 'avatar-purple-star', 'avatar-cat']) expect(tray.applyIcon(id)).toMatchObject({ appliedId: id, state: 'applied', error: null })
  expect(fake.instances).toHaveLength(1); expect(fake.instances[0].updates).toBe(3)
  expect(fake.instances[0].menu).toBe(menu); expect(fake.instances[0].handlers.click).toBe(handler)
  handler(); menu.at(-1).click(); expect(show).toHaveBeenCalledTimes(1); expect(quit).toHaveBeenCalledTimes(1)
})
it.runIf(process.platform === 'darwin')('缺图和setImage失败保留原可用图，不重建或破坏后台入口，重试可恢复', () => {
  const store = settings(), tray = new BackgroundTray(store as unknown as DesktopSettingsStore, vi.fn(), vi.fn(), vi.fn(), '/assets')
  tray.init('avatar-cat'); fake.bad.add('avatar-bear')
  expect(tray.applyIcon('avatar-bear')).toMatchObject({ appliedId: 'avatar-cat', state: 'failed', available: true })
  expect(tray.shouldHide()).toBe(true); expect(fake.instances[0].image.id).toBe('avatar-cat')
  fake.bad.clear(); fake.replaceFail = true
  expect(tray.applyIcon('avatar-bear')).toMatchObject({ appliedId: 'avatar-cat', state: 'failed' })
  fake.replaceFail = false
  expect(tray.retryIcon('avatar-bear')).toMatchObject({ appliedId: 'avatar-bear', error: null, state: 'applied' })
  expect(fake.instances).toHaveLength(1); expect(fake.instances[0].destroy).not.toHaveBeenCalled()
})
it.runIf(process.platform === 'darwin')('首次缺图先用默认模板，再用B兜底且不伪造已应用ID', () => {
  fake.bad.add('avatar-bear')
  const first = new BackgroundTray(settings() as unknown as DesktopSettingsStore, vi.fn(), vi.fn(), vi.fn(), '/assets')
  expect(first.init('avatar-bear')).toMatchObject({ appliedId: 'avatar-cat', fallback: 'default', state: 'failed', available: true })
  fake.bad.add('avatar-cat')
  const second = new BackgroundTray(settings() as unknown as DesktopSettingsStore, vi.fn(), vi.fn(), vi.fn(), '/assets')
  expect(second.init('avatar-bear')).toMatchObject({ appliedId: null, fallback: 'builtin', state: 'failed', available: true })
  expect(first.shouldHide()).toBe(true); expect(second.shouldHide()).toBe(true)
})
it.runIf(process.platform === 'darwin')('初始化失败可明确重试，但退出后迟到更新/重试不创建Tray', () => {
  const store = settings(), tray = new BackgroundTray(store as unknown as DesktopSettingsStore, vi.fn(), vi.fn(), vi.fn(), '/assets')
  fake.fail = true; expect(tray.init('avatar-bear').state).toBe('unavailable'); expect(tray.shouldHide()).toBe(false)
  fake.fail = false; expect(tray.retryIcon('avatar-bear').state).toBe('applied')
  tray.stopIconUpdates(); expect(tray.applyIcon('avatar-cat').state).toBe('closed'); expect(fake.instances[0].image.id).toBe('avatar-bear')
  tray.destroy(); expect(tray.retryIcon('avatar-mint-ring').state).toBe('closed'); expect(fake.instances).toHaveLength(1)
})
