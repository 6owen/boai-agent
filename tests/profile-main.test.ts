/*
 * [INPUT]: 当前实际Main构建、SQLite维护准入、隔离外层/v2数据及原生进程guard。
 * [OUTPUT]: 活动维护或持久意图均在singleton/迁移前拒绝；目录暂缺时不得重建或改写原数据。
 * [POS]: 真实Electron启动负例；共用桌面租约，不调用模型或个人数据，不替代升级验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { beforeAll, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, readlink, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { acquireProfileAccess } from '../src/runtime/profile-access'
import { repairProcess } from './evaluation/repair-process'
// @ts-expect-error Plain Node ESM resource helper intentionally has no declaration file.
import { acquireResourceLock, desktopLockPath } from '../scripts/resource-lock.mjs'
// @ts-expect-error Plain Node ESM build helper intentionally has no declaration file.
import { verifyBuildIdentity } from '../scripts/build-identity.mjs'

beforeAll(async () => { await verifyBuildIdentity(process.cwd()) })
test('different worktrees share the same desktop resource lease', async () => {
  const other = await mkdtemp(join(tmpdir(), 'boai-other-worktree-')), cli = pathToFileURL(resolve('scripts/resource-lock.mjs')).href
  const release = acquireResourceLock()
  try {
    expect(desktopLockPath.startsWith(other)).toBe(false)
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', `import {acquireResourceLock} from ${JSON.stringify(cli)};globalThis.release=acquireResourceLock()`], { cwd: other, stdio: 'pipe' })).toThrow(/Command failed/)
  } finally { release(); await rm(other, { recursive: true, force: true }) }
})
async function snapshot(root: string): Promise<unknown[]> {
  const rows: unknown[] = []
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      // The authority is not user data. Opening/closing its SQLite inode in the
      // lock-owning process can release that process's POSIX record locks.
      if (name.startsWith('.boai-profile-locks-')) continue
      const path = join(directory, name), info = await lstat(path), row = { path: path.slice(root.length + 1), mode: info.mode & 0o777 }
      if (info.isDirectory()) { rows.push({ ...row, type: 'directory' }); await walk(path) }
      else if (info.isFile()) rows.push({ ...row, type: 'file', bytes: info.size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
      else if (info.isSymbolicLink()) rows.push({ ...row, type: 'link', target: await readlink(path) })
      else throw Error('隔离数据出现特殊文件')
    }
  }
  await walk(root); return rows
}
test.each([
  ['outer', 'active'], ['outer', 'pending'], ['v2', 'active'], ['v2', 'pending'],
] as const)('actual Main refuses %s %s before recreating missing data', async (scope, state) => {
  const root = await mkdtemp(join(tmpdir(), 'boai-profile-main-'))
  let unlock: (() => void) | undefined
  let maintenance: ReturnType<typeof acquireProfileAccess> | undefined
  try {
    unlock = acquireResourceLock()
    const profile = join(root, 'profile'), v2 = join(profile, 'v2'), target = scope === 'outer' ? profile : v2, original = join(root, 'original')
    await mkdir(v2, { recursive: true }); await mkdir(join(profile, 'browser'))
    for (const [name, value] of Object.entries({ 'v2/data-version.json': '{"schemaVersion":2}', 'v2/credentials.enc.json': '{"fixture":"opaque-original-no-real-key"}', 'browser/original-cookie.txt': 'PRIVATE_FIXTURE_ORIGINAL', 'desktop-settings.json': '{"schemaVersion":1,"revision":1,"preferences":{"runInBackground":false,"startHidden":false}}' })) await writeFile(join(profile, name), value, { mode: 0o600 })
    maintenance = acquireProfileAccess(target, 'maintenance')
    const id = randomUUID()
    if (state === 'pending') maintenance.beginMaintenance(id)
    const before = await snapshot(target)
    await rename(target, original)
    if (state === 'pending') maintenance.release()
    const remaining = scope === 'v2' ? await snapshot(profile) : undefined
    const receipt = await repairProcess({ command: '/usr/bin/env', args: ['BOAI_DATA_DIR=' + profile, createRequire(import.meta.url)('electron'), resolve('dist/main/main.cjs')], cwd: process.cwd(), timeoutMs: 5000, signal: new AbortController().signal, managed: { guard: resolve('dist/native/boai-process-guard'), ledger: join(root, 'processes') } })
    // Check the original symptom even if a wrong Main hangs or exits with another error.
    const appeared = await lstat(target).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
    console.log(JSON.stringify({ scope, state, appeared, receipt, originalUnchanged: JSON.stringify(await snapshot(original)) === JSON.stringify(before) }))
    expect(appeared, 'Main recreated data before checking its maintenance scope').toBe(false)
    expect(await snapshot(original)).toEqual(before)
    if (remaining) expect(await snapshot(profile)).toEqual(remaining)
    expect(receipt.failure).toBeUndefined(); expect(receipt.exitCode).toBe(1)
    expect(receipt.stderr).toContain(state === 'pending' ? '尚未恢复' : '正在维护')
    if (state === 'pending') {
      const recovery = acquireProfileAccess(target, 'maintenance')
      try { expect(recovery.maintenanceIntent()?.id).toBe(id); await rename(original, target); recovery.finishMaintenance(id) }
      finally { recovery.release() }
    } else { maintenance.assertHeld(); await rename(original, target) }
    expect(await snapshot(target)).toEqual(before)
  } finally { try { maintenance?.release(); await rm(root, { recursive: true, force: true }) } finally { unlock?.() } }
})
