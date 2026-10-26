/*
 * [INPUT]: 实际BrowserService、受控窗口/对话框/Cookie端口与临时文件。
 * [OUTPUT]: 文件/profile共用固定应用partition与确认；来源重核/取消清理/员工互斥及旧证据失效回归。
 * [POS]: Cookie导入宿主生命周期测试；不读取真实登录资料或打开GUI。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserService } from '../apps/electron/src/main/browser/browser-service'
import type { BrowserPaneManager } from '../apps/electron/src/main/browser/browser-pane-manager'
import type { Cookie, CookiesSetDetails } from 'electron'
import { APPLICATION_BROWSER_SCOPE, type BrowserLease } from '../packages/shared/src/ipc/browser'
import type { CookieSourceProvider } from '../apps/electron/src/main/browser/cookie-sources'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
function deferred<T>() { let resolve!: (value: T) => void;const promise = new Promise<T>(yes => { resolve = yes });return { promise, resolve } }
async function fixture(cookieSources?: CookieSourceProvider) {
  const root = await mkdtemp(join(tmpdir(), 'boai-cookie-host-'));roots.push(root)
  await mkdir(join(root, 'managed'))
  const file = join(root, 'cookies.json');await writeFile(file, JSON.stringify([{ name: 'sid', value: 'private-value', domain: 'example.com', secure: true, httpOnly: true }]))
  const instances = new Map<string, any>(), items: Cookie[] = []
  const manager: any = {
    onStateChange: vi.fn(), onRemoved: vi.fn(), registerToolbarIpc: vi.fn(),
    createInstance: vi.fn((id: string) => instances.set(id, { id, toolbarReady: true, documentRevision: 2, window: { isDestroyed: () => false, setTitle: vi.fn() }, toolbarView: { webContents: { isDestroyed: () => false, send: vi.fn() } }, cdp: { invalidateRefs: vi.fn(), drain: vi.fn(async () => {}) } })),
    getInstance: (id: string) => instances.get(id), ready: async () => {}, focus: vi.fn(),
    cancelDownloads: async () => {}, waitForLoads: async () => {}, destroyInstance: vi.fn(async (id: string) => { instances.delete(id) }),
    navigateFromToolbar: vi.fn(async () => {}),
  }
  const port = {
    set: vi.fn(async (d: CookiesSetDetails) => { items.push({ name: d.name!, value: d.value!, domain: new URL(d.url).hostname, path: d.path, hostOnly: true, secure: d.secure, httpOnly: d.httpOnly, sameSite: d.sameSite!, session: true }) }),
    get: vi.fn(async () => items), flushStore: vi.fn(async () => {}),
  }
  const cookieImport = { chooseFile: vi.fn(async () => file), confirm: vi.fn(async () => true), showResult: vi.fn(async () => false), cookies: vi.fn(() => port) }
  const clearPartition = vi.fn(async () => {})
  const service = new BrowserService({ rendererDirectory: root, preloadPath: '/toolbar.cjs', profileRegistryPath: join(root, 'profiles.json'), managedDataDirectory: join(root, 'managed'), manager: manager as BrowserPaneManager, cookieImport, cookieSources, clearPartition })
  const state = await service.manualOpen({})
  const lease: BrowserLease = { scopeKey: APPLICATION_BROWSER_SCOPE, scopeEpoch: 0, agentId: 'a', conversationId: 'chat', workId: 'work', runId: 'run', generation: 'g1', configVersion: 1, agentName: 'A', conversationTitle: 'Chat', downloadDirectory: join(root, 'managed', 'run') }
  return { service, state, lease, manager, instances, cookieImport, port, clearPartition, file }
}
describe('Cookie导入宿主', () => {
  it('所选profile经过原确认/写回流程，来源返回不传Cookie，文件路径不参与profile导入', async () => {
    const provider = { list: vi.fn(async () => ({ sources: [{ id: 'selected', kind: 'chrome' as const, label: 'Chrome — Work', profileName: 'Work' }] })), read: vi.fn(async () => ({ source: 'Chrome — Work', text: JSON.stringify([{ name: 'sid', value: 'private-value', domain: 'example.com', secure: true, httpOnly: true }]) })) }
    const { service, state, cookieImport, port } = await fixture(provider)
    expect(await service.listCookieSources(state.instanceId, () => {}, true)).toEqual(await provider.list())
    expect(await service.importCookies(state.instanceId, () => {}, 'selected')).toMatchObject({ verified: 1 })
    expect(provider.read).toHaveBeenCalledWith('selected', expect.any(AbortSignal)); expect(cookieImport.chooseFile).not.toHaveBeenCalled(); expect(port.set).toHaveBeenCalledOnce()
    expect(JSON.stringify(cookieImport.confirm.mock.calls)).not.toContain('private-value')
  })
  it('窗口关闭取消profile读取并等临时清理后才清partition，不弹确认也不写入', async () => {
    const entered = deferred<void>(), aborted = deferred<void>(), release = deferred<void>()
    const provider: CookieSourceProvider = { list: async () => ({ sources: [] }), read: async (_id, signal) => { entered.resolve(); signal!.addEventListener('abort', () => aborted.resolve(), { once: true }); await aborted.promise; await release.promise; throw new Error('Cookie 导入已取消') } }
    const { service, state, cookieImport, port, clearPartition } = await fixture(provider)
    const importing = service.importCookies(state.instanceId, () => {}, 'selected'), rejection = expect(importing).rejects.toThrow('取消')
    await entered.promise; const clearing = service.clearScope({ scopeKey: APPLICATION_BROWSER_SCOPE }); await aborted.promise
    expect(clearPartition).not.toHaveBeenCalled(); release.resolve(); await rejection; await clearing
    expect(clearPartition).toHaveBeenCalledOnce(); expect(cookieImport.confirm).not.toHaveBeenCalled(); expect(port.set).not.toHaveBeenCalled()
  })
  it('来源列表返回前重核原sender，避免异步来源返回给重载后的页面', async () => {
    const pending = deferred<{ sources: [] }>(), provider: CookieSourceProvider = { list: () => pending.promise, read: vi.fn() }
    const { service, state } = await fixture(provider); let current = true
    const listing = service.listCookieSources(state.instanceId, () => { if (!current) throw new Error('sender changed') }), rejection = expect(listing).rejects.toThrow('sender changed')
    current = false; pending.resolve({ sources: [] }); await rejection
  })
  it('仅写应用partition，完成后失效旧页面证据和refs；不经renderer传值', async () => {
    const { service, state, cookieImport, manager, port } = await fixture()
    expect(await service.importCookies(state.instanceId, () => {})).toMatchObject({ verified: 1, flushed: true })
    expect(cookieImport.cookies).toHaveBeenCalledWith(`persist:boai-browser-${createHash('sha256').update(APPLICATION_BROWSER_SCOPE).digest('hex')}`)
    expect(JSON.stringify(cookieImport.confirm.mock.calls)).not.toContain('private-value')
    expect(service.list()[0]!.pageVersion).not.toBe(state.pageVersion)
    expect(manager.getInstance(state.instanceId).cdp.invalidateRefs).toHaveBeenCalledOnce()
    expect(port.set).toHaveBeenCalledOnce()
  })
  it('预览取消不写Cookie，确认期间拒绝员工认领；完成后可明确再试', async () => {
    const { service, state, lease, cookieImport, port } = await fixture()
    const waiting = deferred<boolean>(), appeared = deferred<void>()
    cookieImport.confirm.mockImplementation(async () => { appeared.resolve();return waiting.promise })
    const pending = service.importCookies(state.instanceId, () => {})
    await appeared.promise
    await expect(service.acquire(lease)).rejects.toThrow('Cookie 导入')
    waiting.resolve(false)
    expect(await pending).toEqual({ status: 'cancelled' });expect(port.set).not.toHaveBeenCalled()
    cookieImport.confirm.mockResolvedValue(true)
    expect(await service.importCookies(state.instanceId, () => {})).toMatchObject({ verified: 1 })
  })
  it('选择/确认后的sender变化及清登录资料使旧预览失效，不可写入新窗口', async () => {
    const { service, state, cookieImport, port, clearPartition } = await fixture()
    const waiting = deferred<boolean>(), appeared = deferred<void>()
    cookieImport.confirm.mockImplementation(async () => { appeared.resolve();return waiting.promise })
    const pending = service.importCookies(state.instanceId, () => {})
    const rejected = expect(pending).rejects.toThrow('原浏览器')
    await appeared.promise
    await service.clearScope({ scopeKey: APPLICATION_BROWSER_SCOPE })
    waiting.resolve(true);await rejected
    expect(port.set).not.toHaveBeenCalled();expect(clearPartition).toHaveBeenCalledOnce()
    expect(service.list()[0]!.control).toBe('closed')
  })
  it('写入期间清理等待本批实际退出，停止剩余记录后才清partition且不重开结果框', async () => {
    const { service, state, cookieImport, port, clearPartition, file } = await fixture()
    await writeFile(file, JSON.stringify([{ domain: 'example.com', name: 'one', value: 'first' }, { domain: 'example.com', name: 'two', value: 'second' }]))
    const entered = deferred<void>(), finish = deferred<void>(), original = port.set.getMockImplementation()!
    port.set.mockImplementation(async details => { entered.resolve();await finish.promise;await original(details) })
    const importing = service.importCookies(state.instanceId, () => {})
    await entered.promise
    const clearing = service.clearScope({ scopeKey: APPLICATION_BROWSER_SCOPE })
    await Promise.resolve()
    expect(clearPartition).not.toHaveBeenCalled()
    finish.resolve()
    expect(await importing).toMatchObject({ written: 1, verified: 1, notAttempted: 1, flushed: true })
    await clearing
    expect(port.set).toHaveBeenCalledTimes(1);expect(port.flushStore).toHaveBeenCalledOnce()
    expect(clearPartition).toHaveBeenCalledOnce();expect(cookieImport.showResult).not.toHaveBeenCalled()
  })
  it('sender复核失败不落盘、不显示结果；由原调用准确返回错误', async () => {
    const { service, state, cookieImport, port } = await fixture();let current = true
    cookieImport.confirm.mockImplementation(async () => { current = false;return true })
    await expect(service.importCookies(state.instanceId, () => { if (!current) throw new Error('sender changed') })).rejects.toThrow('sender changed')
    expect(port.set).not.toHaveBeenCalled();expect(cookieImport.showResult).not.toHaveBeenCalled()
  })
})
