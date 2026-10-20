/*
 * [INPUT]: 真实bootstrap/独立服务、隔离profile、原owner和宿主退出屏障。
 * [OUTPUT]: 准入先于迁移、初始化期间维护拒绝、服务/宿主/发现文件全部排空后才允许维护。
 * [POS]: 个人升级数据准入集成回归；不调用模型、不替代桌面/安装包验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import { startHeadlessServer } from '../src/runtime/headless'
import { DesktopHostBridge } from '../src/runtime/desktop-host'
import { acquireProfileAccess, ProfileAccessBusyError } from '../src/runtime/profile-access'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const dispose of cleanup.splice(0).reverse()) await dispose() })
function barrier() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-profile-runtime-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const profile = join(root, 'profile'), dataPath = join(profile, 'v2')
  const options = { dataPath, skillDiscovery: { homeDir: root }, engine: { run: async () => {}, test: async () => 'unused' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  return { root, profile, dataPath, options }
}
test('maintenance rejects bootstrap before any profile creation or migration', async () => {
  const f = await fixture(), maintenance = acquireProfileAccess(f.profile, 'maintenance'); cleanup.push(() => maintenance.release())
  await expect(startOwnedRuntime(f.options)).rejects.toBeInstanceOf(ProfileAccessBusyError)
  await expect(readFile(f.profile)).rejects.toMatchObject({ code: 'ENOENT' })
  maintenance.assertHeld()
})
test('actual prepare and initialized service retain access until complete runtime close', async () => {
  const f = await fixture(), entered = barrier(), resume = barrier(); cleanup.push(resume.resolve)
  const starting = startOwnedRuntime(f.options, () => { entered.resolve(); return resume.promise })
  await entered.promise
  expect(() => acquireProfileAccess(f.profile, 'maintenance')).toThrow(ProfileAccessBusyError)
  await expect(readFile(join(f.dataPath, 'boai.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
  resume.resolve(); const owned = await starting; cleanup.push(owned.close)
  expect(() => acquireProfileAccess(f.profile, 'maintenance')).toThrow(ProfileAccessBusyError)
  await owned.close(); const maintenance = acquireProfileAccess(f.profile, 'maintenance'); maintenance.release()
  await expect(readFile(join(f.dataPath, '.cli/owner.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
test('canonical v2 alias cannot bypass its containing desktop profile maintenance', async () => {
  const f = await fixture(); await mkdir(f.dataPath, { recursive: true }); const alias = join(f.root, 'alias'); await symlink(f.dataPath, alias)
  const maintenance = acquireProfileAccess(f.profile, 'maintenance'); cleanup.push(() => maintenance.release())
  await expect(startOwnedRuntime({ ...f.options, dataPath: alias })).rejects.toBeInstanceOf(ProfileAccessBusyError)
  await expect(readFile(join(f.dataPath, 'data-version.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
test('headless metadata and host drain remain protected after the original runtime owner has left', async () => {
  const f = await fixture(), server = await startHeadlessServer({ dataPath: f.dataPath, version: 'fixture', skillHome: f.root, engine: f.options.engine }); cleanup.push(server.close)
  const entered = barrier(), resume = barrier(), original = DesktopHostBridge.prototype.close
  vi.spyOn(DesktopHostBridge.prototype, 'close').mockImplementationOnce(async function (this: DesktopHostBridge) { entered.resolve(); await resume.promise; return original.call(this) })
  const closing = server.close(); cleanup.push(resume.resolve); await entered.promise
  await expect(readFile(join(f.dataPath, '.cli/owner.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(() => acquireProfileAccess(f.profile, 'maintenance')).toThrow(ProfileAccessBusyError)
  resume.resolve(); await closing; await server.finished
  const maintenance = acquireProfileAccess(f.profile, 'maintenance'); maintenance.release()
  await expect(readFile(join(f.dataPath, '.cli/connection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
