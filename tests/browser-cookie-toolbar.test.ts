/*
 * [INPUT]: 真实BrowserPaneManager与受控Electron toolbar/page/frame和IPC。
 * [OUTPUT]: 来源/导入/菜单IPC拒绝网页及子frame；展开不挤页面，收起/失焦/导航/崩溃恢复48px。
 * [POS]: Cookie菜单宿主边界回归；实际DOM点击另归浏览器BDD。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserPaneManager } from '../apps/electron/src/main/browser/browser-pane-manager'
const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<unknown>>())
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<unknown>) => handlers.set(channel, handler) } }))
beforeEach(() => handlers.clear())
function fixture() {
  const listCookieSources = vi.fn(async (_id: string, assert: () => void) => { assert(); return { sources: [] } }), importCookies = vi.fn(async (_id: string, assert: () => void, _source?: string) => { assert(); return { status: 'cancelled' as const } })
  const manager = new BrowserPaneManager({ rendererDirectory: '/renderer', preloadPath: '/preload', allowNavigation: () => true, allowNetwork: () => true, downloadPolicy: () => null, allowUserNavigation: () => true, userNavigation: async () => {}, toolbarState: () => ({}), userControl: async () => {}, listCookieSources, importCookies })
  const toolbar = Object.assign(new EventEmitter(), { isDestroyed: () => false, mainFrame: {}, getURL: (): string => 'file:///renderer/browser-toolbar.html?instanceId=fixture', send: vi.fn() })
  const page = Object.assign(new EventEmitter(), { isDestroyed: () => false, setWindowOpenHandler: vi.fn() })
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false, getContentSize: () => [1000, 700], setTopBrowserView: vi.fn() })
  const instance = { id: 'fixture', window, ownedWebContents: [toolbar, page], toolbarView: { webContents: toolbar, setBounds: vi.fn(), setAutoResize: vi.fn() }, pageView: { webContents: page, setBounds: vi.fn(), setAutoResize: vi.fn() }, cdp: { invalidateRefs: vi.fn() }, cookieMenuOpen: false }
  const internal = manager as any; internal.instances.set(instance.id, instance); internal.setupWindowListeners(instance); manager.registerToolbarIpc()
  const event = { sender: toolbar, senderFrame: toolbar.mainFrame }
  const call = (channel: string, value?: unknown, source = event) => handlers.get(`browser-toolbar:${channel}`)!(source, instance.id, value)
  return { manager, internal, instance, toolbar, page, window, event, call, listCookieSources, importCookies }
}
describe('Cookie工具栏IPC及覆盖尺寸', () => {
  it.each(['list-cookie-sources', 'import-cookies', 'cookie-menu-open'])('%s拒绝页面、子frame及伪URL，不暴露本机来源', async channel => {
    const f = fixture()
    await expect(f.call(channel, undefined, { sender: f.page, senderFrame: f.toolbar.mainFrame } as any)).rejects.toThrow('来源')
    await expect(f.call(channel, undefined, { sender: f.toolbar, senderFrame: {} })).rejects.toThrow('来源')
    f.toolbar.getURL = () => 'https://example.com/browser-toolbar.html'
    await expect(f.call(channel)).rejects.toThrow('来源')
    expect(f.listCookieSources).not.toHaveBeenCalled(); expect(f.importCookies).not.toHaveBeenCalled()
  })
  it('展开仅改变toolbar，关闭恢复48px，不留下透明输入覆盖区', async () => {
    const f = fixture(); await f.call('cookie-menu-open', true)
    expect(f.instance.toolbarView.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1000, height: 700 }); expect(f.instance.pageView.setBounds).not.toHaveBeenCalled()
    await f.call('cookie-menu-open', false)
    expect(f.instance.toolbarView.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1000, height: 48 })
    await expect(f.call('cookie-menu-open', 700)).rejects.toThrow('无效')
  })
  it.each(['blur', 'did-start-navigation', 'render-process-gone'])('%s收起覆盖，迟到销毁回调不重新布局', async eventName => {
    const f = fixture(); await f.call('cookie-menu-open', true)
    ;(eventName === 'blur' ? f.window : f.toolbar).emit(eventName)
    expect(f.instance.cookieMenuOpen).toBe(false); expect(f.instance.toolbarView.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1000, height: 48 })
    f.internal.destroyingIds.add(f.instance.id); f.instance.toolbarView.setBounds.mockClear(); f.window.emit('blur')
    expect(f.instance.toolbarView.setBounds).not.toHaveBeenCalled()
  })
  it('导入/导航在回调和Dialog前收起；只接受opaque来源ID', async () => {
    const f = fixture(); await f.call('cookie-menu-open', true)
    f.importCookies.mockImplementation(async () => { expect(f.instance.cookieMenuOpen).toBe(false); expect(f.instance.toolbarView.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1000, height: 48 }); return { status: 'cancelled' } })
    const id = randomUUID(); await f.call('import-cookies', id); expect(f.importCookies).toHaveBeenCalledWith('fixture', expect.any(Function), id)
    await expect(f.call('import-cookies', '/private/profile')).rejects.toThrow('无效')
    await f.call('cookie-menu-open', true); await f.call('navigate', 'https://example.com'); expect(f.instance.cookieMenuOpen).toBe(false)
  })
})
