/*
 * [INPUT]: 生产图标协调器、可控Electron/安装辅助进程与Tray端口。
 * [OUTPUT]: Dock/托盘不等待安装写入、最新选择/返回旧ID竞态、分目标失败重试及退出排空。
 * [POS]: macOS图标生命周期模块回归；不操作用户Dock或安装副本。
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppIconController, type TrayIconPort } from '../src/main/app-icon'
import type { AppIconStatus, TrayIconStatus } from '../src/shared/appearance'
const fake = vi.hoisted(() => ({
  packaged: false, dock: [] as string[], missing: new Set<string>(), dockFailure: new Set<string>(),
  helpers: [] as Array<{ args: string[]; finish(error?: Error): void }>,
}))
vi.mock('electron', () => ({
  app: { get isPackaged() { return fake.packaged }, dock: { setIcon(image: { id: string }) { if (fake.dockFailure.has(image.id)) throw new Error('Dock setIcon失败'); fake.dock.push(image.id) } } },
  nativeImage: { createFromPath(path: string) { const id = path.split('/').at(-1)!.replace('.png', ''); return { id, isEmpty: () => fake.missing.has(id), getSize: () => ({ width: 512, height: 512 }) } } },
}))
vi.mock('node:fs/promises', () => ({ realpath: async () => '/isolated/BoAI.app/Contents/MacOS/BoAI' }))
vi.mock('node:child_process', () => ({ execFile: (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => { fake.helpers.push({ args, finish: error => callback(error ?? null, '', '') }); return {} } }))
afterEach(() => { fake.packaged = false; fake.dock.length = 0; fake.helpers.length = 0; fake.missing.clear(); fake.dockFailure.clear() })
function fixture() {
  let status: TrayIconStatus = { supported: true, available: true, state: 'applied', appliedId: 'avatar-cat', fallback: null, error: null }
  const fail = new Set<string>(), events: AppIconStatus[] = [], applied: string[] = []
  const apply = (id: string) => { applied.push(id); status = fail.has(id) ? { ...status, state: 'failed', error: '托盘失败' } : { ...status, state: 'applied', appliedId: id, fallback: null, error: null }; return { ...status } }
  const port: TrayIconPort = { snapshot: () => ({ ...status }), apply: vi.fn(apply), retry: vi.fn(apply) }
  const controller = new AppIconController('/icons', '/helper', value => events.push(value), port)
  return { controller, events, applied, port, fail, setTray(value: Partial<TrayIconStatus>) { status = { ...status, ...value } } }
}
const waitHelpers = async (count: number) => vi.waitFor(() => expect(fake.helpers).toHaveLength(count))

describe.runIf(process.platform === 'darwin')('macOS three target application', () => {
  test('开发版只应用运行态；相同成功ID不重复触碰Tray或Dock', async () => {
    const f = fixture(); await f.controller.apply('avatar-bear')
    expect(f.controller.snapshot()).toMatchObject({ requestedId: 'avatar-bear', pending: false, dock: { appliedId: 'avatar-bear', error: null }, tray: { appliedId: 'avatar-bear', state: 'applied' }, installed: { available: false } })
    await f.controller.apply('avatar-bear')
    expect(f.applied).toEqual(['avatar-bear']); expect(fake.dock).toEqual(['avatar-bear']); expect(fake.helpers).toHaveLength(0)
  })
  test('A安装写入很慢时B/C运行态立即更新，只排队最新C且旧回执不回写状态', async () => {
    fake.packaged = true; const f = fixture()
    const a = f.controller.apply('avatar-bear'); await waitHelpers(1)
    const b = f.controller.apply('avatar-mint-ring'), c = f.controller.apply('avatar-purple-star')
    expect(fake.dock).toEqual(['avatar-bear', 'avatar-mint-ring', 'avatar-purple-star'])
    expect(f.applied.at(-1)).toBe('avatar-purple-star'); expect(f.controller.snapshot().pending).toBe(true)
    fake.helpers[0].finish(); await waitHelpers(2)
    expect(fake.helpers[1].args.at(-1)).toBe('/icons/avatar-purple-star.png')
    expect(f.controller.snapshot().installed.appliedId).toBeNull()
    fake.helpers[1].finish(); await Promise.all([a, b, c])
    expect(f.controller.snapshot()).toMatchObject({ requestedId: 'avatar-purple-star', pending: false, installed: { appliedId: 'avatar-purple-star', error: null } })
    expect(f.events.map(event => event.sequence)).toEqual([...f.events.map(event => event.sequence)].sort((x, y) => x - y))
  })
  test('安装写入在途时切回原已应用ID也必须重新排队，不能让迟到旧写入成为最终图标', async () => {
    fake.packaged = true; const f = fixture()
    const initial = f.controller.apply('avatar-mint-ring'); await waitHelpers(1); fake.helpers[0].finish(); await initial
    const next = f.controller.apply('avatar-bear'); await waitHelpers(2)
    const back = f.controller.apply('avatar-mint-ring')
    expect(fake.dock.at(-1)).toBe('avatar-mint-ring')
    fake.helpers[1].finish(); await waitHelpers(3)
    expect(fake.helpers[2].args.at(-1)).toBe('/icons/avatar-mint-ring.png')
    fake.helpers[2].finish(); await Promise.all([next, back])
    expect(f.controller.snapshot().installed.appliedId).toBe('avatar-mint-ring')
  })
  test('Dock成功不会跳过Tray失败；重试只触碰未成功目标', async () => {
    const f = fixture(); f.fail.add('avatar-bear'); await f.controller.apply('avatar-bear')
    expect(f.controller.snapshot()).toMatchObject({ dock: { appliedId: 'avatar-bear', error: null }, tray: { appliedId: 'avatar-cat', error: '托盘失败' } })
    f.fail.clear(); await f.controller.retry()
    expect(fake.dock).toEqual(['avatar-bear']); expect(f.port.retry).toHaveBeenCalledWith('avatar-bear')
    expect(f.controller.snapshot().tray).toMatchObject({ appliedId: 'avatar-bear', error: null })
  })
  test('Dock缺图/原生失败仍应用Tray，安装失败不把运行态回滚', async () => {
    fake.packaged = true; const f = fixture(); fake.missing.add('avatar-bear')
    const first = f.controller.apply('avatar-bear'); await waitHelpers(1); fake.helpers[0].finish(new Error('安装图标失败')); await first
    expect(f.controller.snapshot()).toMatchObject({ requestedId: 'avatar-bear', dock: { appliedId: 'avatar-cat', error: expect.any(String) }, tray: { appliedId: 'avatar-bear', error: null }, installed: { error: '安装图标失败' } })
    fake.missing.clear(); const retry = f.controller.retry(); await waitHelpers(2); fake.helpers[1].finish(); await retry
    expect(f.applied).toEqual(['avatar-bear']); expect(f.controller.snapshot().dock).toEqual({ appliedId: 'avatar-bear', error: null })
  })
  test('启动Tray尚未就绪不冒充已更新，随后同ID仍会应用', async () => {
    const f = fixture(); f.setTray({ state: 'waiting', available: false, appliedId: null })
    vi.mocked(f.port.apply).mockImplementationOnce(() => f.port.snapshot())
    await f.controller.apply('avatar-bear'); expect(f.controller.snapshot().tray.state).toBe('waiting')
    f.setTray({ state: 'applied', available: true, appliedId: 'avatar-cat' })
    await f.controller.apply('avatar-bear'); expect(f.controller.snapshot().tray.appliedId).toBe('avatar-bear')
  })
  test('退出拒绝新换图，排空已开始写入但不执行排队的旧选择；失败退出可恢复', async () => {
    fake.packaged = true; const f = fixture()
    const first = f.controller.apply('avatar-bear'); await waitHelpers(1)
    const queued = f.controller.apply('avatar-mint-ring'), stopped = f.controller.close()
    await expect(f.controller.apply('avatar-cat')).rejects.toThrow('退出')
    fake.helpers[0].finish(); await Promise.all([first, queued, stopped]); expect(fake.helpers).toHaveLength(1)
    const resumed = f.controller.resume(); await waitHelpers(2); expect(fake.helpers[1].args.at(-1)).toBe('/icons/avatar-mint-ring.png'); fake.helpers[1].finish(); await resumed
    expect(f.controller.snapshot()).toMatchObject({ requestedId: 'avatar-mint-ring', pending: false, installed: { appliedId: 'avatar-mint-ring' } })
  })
})
test.runIf(process.platform !== 'darwin')('非macOS不运行Dock或安装更新，不冒充支持托盘选择', async () => {
  const f = fixture(); f.setTray({ supported: false, state: 'unsupported' })
  await f.controller.apply('avatar-bear')
  expect(f.controller.snapshot().platform).toBe('unsupported'); expect(fake.dock).toEqual([]); expect(fake.helpers).toEqual([])
})
