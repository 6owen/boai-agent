/*
 * [INPUT]: 隔离 JSON 与假系统登录项端口。
 * [OUTPUT]: 后台偏好重启、CAS、损坏保护、OS 实际状态及开发零写入边界。
 * [POS]: 桌面后台模块回归，不操作用户登录项。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopSettingsStore, LOGIN_ARGUMENT, type LoginHost } from '../apps/electron/src/main/desktop-settings'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture(overrides: Partial<LoginHost> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-desktop-')); roots.push(root)
  const host: LoginHost = { platform: 'darwin', packaged: false, executable: '/installed/BoAI', get: vi.fn(() => ({ openAtLogin: false })), set: vi.fn(), ...overrides }
  const path = join(root, 'desktop.json'), changed = vi.fn(), store = new DesktopSettingsStore(path, host, changed)
  await store.init(); store.trayAvailable = true
  return { root, path, host, store, changed }
}
it('后台选项持久保存，托盘关闭隐藏不要求注册登录项', async () => {
  const { store, path, host, changed } = await fixture()
  expect(store.snapshot().preferences.runInBackground).toBe(true)
  await store.update({ runInBackground: false, startHidden: false }, 0)
  const reopened = new DesktopSettingsStore(path, host, changed); await reopened.init()
  expect(reopened.snapshot().preferences).toEqual({ runInBackground: false, startHidden: false })
  expect(host.set).not.toHaveBeenCalled()
})
it('开发环境不能写登录项，即使收到伪造请求或登录 argv', async () => {
  const { store, host } = await fixture({ platform: 'win32' })
  await expect(store.update({ openAtLogin: true }, 0)).rejects.toThrow('安装后')
  expect(store.hiddenAtLogin([LOGIN_ARGUMENT])).toBe(false)
  expect(host.get).not.toHaveBeenCalled(); expect(host.set).not.toHaveBeenCalled()
})
it('Windows 按当前安装路径与专用参数注册并读取 OS 启动批准状态', async () => {
  const get = vi.fn(() => ({ openAtLogin: true, executableWillLaunchAtLogin: false }))
  const { store, host } = await fixture({ platform: 'win32', packaged: true, get })
  expect(store.snapshot().login).toMatchObject({ enabled: false, status: 'disabled' })
  expect(get).toHaveBeenLastCalledWith({ path: host.executable, args: [LOGIN_ARGUMENT] })
  await store.update({ openAtLogin: true }, 0)
  expect(host.set).toHaveBeenCalledWith({ openAtLogin: true, path: host.executable, args: [LOGIN_ARGUMENT] })
  expect(store.hiddenAtLogin([])).toBe(false)
  expect(store.hiddenAtLogin([LOGIN_ARGUMENT])).toBe(true)
  store.trayAvailable = false; expect(store.hiddenAtLogin([LOGIN_ARGUMENT])).toBe(false)
})
it('macOS 显示待系统批准，隐藏启动只依实际登录来源；不使用 openAsHidden', async () => {
  const { store, host } = await fixture({ packaged: true, get: vi.fn(() => ({ openAtLogin: true, status: 'requires-approval', wasOpenedAtLogin: true })) })
  expect(store.snapshot().login.status).toBe('requires-approval')
  expect(store.hiddenAtLogin([])).toBe(true)
  await store.update({ openAtLogin: false }, 0)
  expect(host.set).toHaveBeenCalledWith({ openAtLogin: false })
  await store.update({ runInBackground: false }, 0)
  expect(store.hiddenAtLogin([])).toBe(false)
})
it('旧版本并发保存拒绝，任意路径和命令输入不会到达系统端口', async () => {
  const { store, host } = await fixture({ packaged: true })
  const changes = await Promise.allSettled([store.update({ startHidden: false }, 0), store.update({ runInBackground: false }, 0)])
  expect(changes.map(value => value.status)).toEqual(['fulfilled', 'rejected'])
  await expect(store.update(JSON.parse('{"openAtLogin":true,"path":"/evil"}'), 1)).rejects.toThrow()
  await expect(store.update({ openAtLogin: true, startHidden: false }, 1)).rejects.toThrow('单独')
  expect(host.set).not.toHaveBeenCalled()
})
it('损坏或未来版本文件保留，不能以默认值覆盖用户文件', async () => {
  const { path, host, changed } = await fixture()
  const prior = '{"schemaVersion":2,"newSettings":true}'
  await writeFile(path, prior)
  const store = new DesktopSettingsStore(path, host, changed); await store.init()
  expect(store.snapshot().error).toContain('原文件保留')
  await expect(store.update({ startHidden: false }, 0)).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe(prior)
})
it('不支持的平台或系统查询失败不会虚构已注册', async () => {
  const { store, host } = await fixture({ platform: 'linux', packaged: true })
  expect(store.snapshot().login.status).toBe('unsupported')
  expect(host.get).not.toHaveBeenCalled()
  await expect(store.update({ openAtLogin: true }, 0)).rejects.toThrow()
  const failed = await fixture({ packaged: true, get: () => { throw new Error('OS') } })
  expect(failed.store.snapshot().login.status).toBe('error')
})
