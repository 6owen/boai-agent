/*
 * [OUTPUT]: selector/text等待核对真实destroyed事件结束挂起JavaScript，关闭意图不释放，正常返回清理监听器。
 * [OUTPUT]: 重复关闭页面释放网络计数与时间戳，迟到回调及无归属WebContents不恢复已退出记录。
 * [OUTPUT]: 首次导航等待Craft空白页初始化；准备失败不导航，防止迟到回退覆盖用户目标页。
 * [INPUT]: 内置浏览器下载策略、真实临时目录与可控 Electron 下载事件。
 * [OUTPUT]: 人工原生保存不复用旧工作目录；受管下载固定策略，取消等待真实退出且不取消人工下载；同ID重开后旧回调不能改状态或移除新窗口。
 * [POS]: tests/browser-pane-manager.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserPaneManager } from '../src/main/browser/browser-pane-manager'
import type { BrowserManagerOptions } from '../src/main/browser/types'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
function fixture(policy: BrowserManagerOptions['downloadPolicy']) {
  const manager = new BrowserPaneManager({ rendererDirectory: '/renderer', preloadPath: '/preload', allowNavigation: () => true, allowNetwork: () => true, downloadPolicy: policy, allowUserNavigation: () => true, toolbarState: () => ({}), userControl: async () => {} })
  const ses = Object.assign(new EventEmitter(), { webRequest: { onBeforeRequest: vi.fn(), onCompleted: vi.fn(), onErrorOccurred: vi.fn() } })
  const wc = { id: 42, isDestroyed: () => false }
  const instance = { id: 'built-in', ownedWebContents: [null, wc], downloads: [] as Array<{ savePath?: string; state: string }>, downloadDirectory: '/old-work-directory', activeDownloads: new Map() }
  // Exercise the actual observer with controlled Electron events, without opening native windows.
  const internals = manager as unknown as { instances: Map<string, unknown>; setupSessionObservers(session: unknown): void }
  internals.instances.set(instance.id, instance)
  internals.setupSessionObservers(ses)
  const start = () => {
    let path = ''
    const item = Object.assign(new EventEmitter(), { getURL: () => 'https://example.com/file', getFilename: () => '../report.txt', getReceivedBytes: () => 4, getTotalBytes: () => 8, getMimeType: () => 'text/plain', getSavePath: () => path, setSavePath: vi.fn((value: string) => { path = value }), cancel: vi.fn() })
    const event = { preventDefault: vi.fn() }
    ses.emit('will-download', event, item, wc)
    return { item, event, finish: (state = 'completed', chosenPath?: string) => { if (chosenPath) path = chosenPath; item.emit('done', {}, state) } }
  }
  return { manager, instance, start, ses }
}

describe('内置浏览器网络观察释放', () => {
  it('反复打开关闭页面后计数归零，已退出页面的迟到事件不能重新登记', () => {
    const { manager, ses } = fixture(() => null)
    const internals = manager as unknown as { instances: Map<string, unknown>; inFlightRequestsByWebContentsId: Map<number, number>; lastNetworkActivityByWebContentsId: Map<number, number>; finalizeDestroyedInstance(instance: unknown, source: 'closed'): void }
    internals.instances.clear()
    const before = ses.webRequest.onBeforeRequest.mock.calls[0][0] as (details: unknown, callback: (result: unknown) => void) => void
    const completed = ses.webRequest.onCompleted.mock.calls[0][0] as (details: unknown) => void
    const failed = ses.webRequest.onErrorOccurred.mock.calls[0][0] as (details: unknown) => void
    for (let id = 1; id <= 30; id++) {
      let destroyed = false
      const contents = { id, session: ses, isDestroyed: () => destroyed }
      const instance = { id: `window-${id}`, window: { isDestroyed: () => destroyed }, ownedWebContents: [contents, contents], networkLogs: [], cdp: { detach: vi.fn() } }
      internals.instances.set(instance.id, instance)
      const details = { webContentsId: id, url: 'https://example.com/file', resourceType: 'mainFrame', statusCode: 200 }
      before(details, vi.fn()); completed(details)
      expect(internals.inFlightRequestsByWebContentsId.get(id)).toBe(0)
      expect(internals.lastNetworkActivityByWebContentsId.has(id)).toBe(true)
      destroyed = true
      internals.finalizeDestroyedInstance(instance, 'closed')
      before(details, vi.fn()); completed(details); failed(details)
    }
    expect(internals.instances.size).toBe(0)
    expect(internals.inFlightRequestsByWebContentsId.size).toBe(0)
    expect(internals.lastNetworkActivityByWebContentsId.size).toBe(0)
  })
})
describe('内置浏览器下载', () => {
  it('人工下载使用原生保存结果，不继承上次工具目录', () => {
    const { instance, start } = fixture(() => ({ kind: 'native' }))
    const download = start()
    expect(download.item.setSavePath).not.toHaveBeenCalled()
    expect(instance.downloads[0]?.savePath).toBeUndefined()
    download.finish('completed', '/chosen/report.txt')
    expect(instance.downloads[0]).toMatchObject({ state: 'completed', savePath: '/chosen/report.txt' })
  })
  it('受管下载固定创建时的目录，实际退出前保持等待，普通下载继续', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'boai-browser-download-')); directories.push(directory)
    let policy: ReturnType<BrowserManagerOptions['downloadPolicy']> = { kind: 'managed', directory }
    const { manager, instance, start } = fixture(() => policy)
    const managed = start()
    expect(managed.item.setSavePath).toHaveBeenCalledWith(join(directory, 'report.txt'))
    policy = { kind: 'native' }
    const native = start()
    let exited = false
    const pending = manager.cancelDownloads(instance.id, { managedOnly: true }).then(() => { exited = true })
    await Promise.resolve()
    expect(managed.item.cancel).toHaveBeenCalledOnce()
    expect(native.item.cancel).not.toHaveBeenCalled()
    expect(exited).toBe(false)
    managed.finish('cancelled')
    await pending
    expect(exited).toBe(true)
    expect(instance.activeDownloads.size).toBe(1)
    const closing = manager.cancelDownloads(instance.id)
    expect(native.item.cancel).toHaveBeenCalledOnce()
    native.finish('cancelled')
    await closing
    expect(instance.activeDownloads.size).toBe(0)
  })
  it('拒绝的下载不会选择保存位置或留下进行中回执', () => {
    const { instance, start } = fixture(() => null)
    const download = start()
    expect(download.event.preventDefault).toHaveBeenCalledOnce()
    expect(download.item.setSavePath).not.toHaveBeenCalled()
    expect(instance.activeDownloads.size).toBe(0)
    expect(instance.downloads).toHaveLength(0)
  })
})

describe('内置浏览器窗口重开', () => {
  it('首次导航等待初始页面真正完成，避免加载竞争', async () => {
    const { manager } = fixture(() => null)
    const loadURL = vi.fn(async () => undefined)
    const instance = { id: 'built-in', toolbarReady: true, toolbarError: null, initialPageReady: false, initialPageError: null,
      window: { isDestroyed: () => false }, pageView: { webContents: { loadURL, stop: vi.fn(), getURL: () => 'https://example.com/', getTitle: () => 'Target' } } }
    const internals = manager as unknown as { instances: Map<string, unknown>; pushToolbarState(instance: unknown): void }
    internals.instances.set(instance.id, instance); vi.spyOn(internals, 'pushToolbarState').mockImplementation(() => {})
    const pending = manager.navigate(instance.id, 'https://example.com/')
    await new Promise(resolve => setTimeout(resolve, 35))
    const premature = loadURL.mock.calls.length
    instance.initialPageReady = true
    await expect(pending).resolves.toEqual({ url: 'https://example.com/', title: 'Target' })
    expect(premature).toBe(0); expect(loadURL).toHaveBeenCalledExactlyOnceWith('https://example.com/')
  })
  it('初始页面加载失败明确拒绝导航，不伪装成就绪', async () => {
    const { manager } = fixture(() => null)
    const loadURL = vi.fn(async () => undefined)
    const instance = { id: 'built-in', toolbarReady: true, toolbarError: null, initialPageReady: false, initialPageError: 'load failed',
      window: { isDestroyed: () => false }, pageView: { webContents: { loadURL, stop: vi.fn(), getURL: () => 'about:blank', getTitle: () => '' } } }
    const internals = manager as unknown as { instances: Map<string, unknown>; pushToolbarState(instance: unknown): void }
    internals.instances.set(instance.id, instance); vi.spyOn(internals, 'pushToolbarState').mockImplementation(() => {})
    await expect(manager.navigate(instance.id, 'https://example.com/')).rejects.toThrow('初始页面加载失败')
    expect(loadURL).not.toHaveBeenCalled()
  })
  it('同ID旧窗口的状态和销毁回调不能覆盖或移除新窗口', () => {
    const { manager } = fixture(() => null)
    const changed = vi.fn(), removed = vi.fn()
    manager.onStateChange(changed)
    manager.onRemoved(removed)
    const internals = manager as unknown as { instances: Map<string, unknown>; destroyingIds: Set<string>; emitStateChange(instance: unknown): void; finalizeDestroyedInstance(instance: unknown, source: 'closed'): void }
    const retired = { id: 'built-in', currentUrl: 'https://old.example', window: { isDestroyed: () => true }, ownedWebContents: [{ isDestroyed: () => true }], cdp: { detach: vi.fn() } }
    const current = { id: 'built-in', currentUrl: 'https://current.example', title: '当前页面' }
    internals.instances.set(current.id, current)
    internals.destroyingIds.add(current.id)
    internals.emitStateChange(retired)
    internals.finalizeDestroyedInstance(retired, 'closed')
    expect(changed).not.toHaveBeenCalled()
    expect(removed).not.toHaveBeenCalled()
    expect(retired.cdp.detach).not.toHaveBeenCalled()
    expect(internals.instances.get(current.id)).toBe(current)
    expect(internals.destroyingIds.has(current.id)).toBe(true)
    internals.emitStateChange(current)
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://current.example', title: '当前页面' }))
  })
})


describe('网页实际退出后的等待收尾', () => {
  it.each(['selector', 'text'] as const)('%s等待不能因底层JavaScript回执永不返回而跨越实际页面销毁', async kind => {
    const { manager } = fixture(() => null)
    let destroyed = false, rejectScript!: (error: Error) => void
    const wc = Object.assign(new EventEmitter(), { isDestroyed: () => destroyed,
      executeJavaScript: vi.fn(() => new Promise<unknown>((_resolve, reject) => { rejectScript = reject })) })
    const instance = { id: 'waiting-page', window: { isDestroyed: () => false }, pageView: { webContents: wc } }
    const internals = manager as unknown as { instances: Map<string, unknown> }
    internals.instances.set(instance.id, instance)
    let result: 'pending' | 'completed' | Error = 'pending'
    const pending = manager.waitFor(instance.id, { kind, value: kind === 'selector' ? '#never-ready' : 'NEVER_READY', timeoutMs: 30_000 })
      .then(() => { result = 'completed' }, error => { result = error })
    await vi.waitFor(() => expect(wc.executeJavaScript).toHaveBeenCalledOnce())
    // A close request is not proof that the renderer can no longer execute.
    wc.emit('close'); await Promise.resolve(); expect(result).toBe('pending')
    destroyed = true; wc.emit('destroyed')
    try {
      await expect.poll(() => result instanceof Error ? result.message : result, { timeout: 500 }).toMatch(/页面已实际退出/)
      expect(wc.listenerCount('destroyed')).toBe(0)
      expect(wc.executeJavaScript).toHaveBeenCalledOnce()
    } finally {
      // Keep the controlled unresolved transport out of later cases, even on red.
      rejectScript(new Error('controlled transport cleanup')); await pending
    }
  })
  it('正常等待返回后移除实际退出监听器，不改变网页返回值', async () => {
    const { manager } = fixture(() => null)
    const wc = Object.assign(new EventEmitter(), { isDestroyed: () => false, executeJavaScript: vi.fn(async () => true) })
    const instance = { id: 'normal-page', window: { isDestroyed: () => false }, pageView: { webContents: wc } }
    const internals = manager as unknown as { instances: Map<string, unknown> }
    internals.instances.set(instance.id, instance)
    await expect(manager.waitFor(instance.id, { kind: 'text', value: 'READY' })).resolves.toMatchObject({ ok: true, kind: 'text' })
    expect(wc.listenerCount('destroyed')).toBe(0)
    expect(wc.executeJavaScript).toHaveBeenCalledOnce()
  })
})
