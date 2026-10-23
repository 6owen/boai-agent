/*
 * [INPUT]: 原Desktop隔离生命周期、实际Main程序和SQLite维护准入。
 * [OUTPUT]: 外层/v2活动维护或持久意图的真实拒绝、缺目录/原件保持及恢复后重新打开。
 * [POS]: 升级保护BDD支撑；5秒拒绝期限、原生guard收尾，零模型或个人数据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, readlink, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import type { Desktop } from './desktop'
import { acquireProfileAccess } from '../../../src/runtime/profile-access'
import { repairProcess, type ProcessReceipt } from '../../evaluation/repair-process'

async function snapshot(root: string): Promise<unknown[]> {
  const rows: unknown[] = []
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      // Reading the authority inode directly in the lock-owning process can
      // cancel its POSIX locks. Internal authorities are not snapshot data.
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
export class ProfileMaintenanceFixture {
  private maintenance?: ReturnType<typeof acquireProfileAccess>
  private before: unknown[] = []
  private remaining?: unknown[]
  private receipt?: ProcessReceipt
  private executable = ''
  private arguments: string[] = []
  private readonly id = randomUUID()
  private readonly target: string
  private constructor(private readonly runtime: Desktop, private readonly scope: '外层' | 'v2', private readonly state: '活动维护' | '待恢复事务', private readonly temporary: string) {
    this.target = scope === '外层' ? runtime.root : join(runtime.root, 'v2')
  }
  static async create(runtime: Desktop, scope: string, state: string) {
    if (scope !== '外层' && scope !== 'v2' || state !== '活动维护' && state !== '待恢复事务') throw Error('升级保护场景状态不明确')
    const temporary = await mkdtemp(join(tmpdir(), 'boai-maintenance-proof-')), fixture = new ProfileMaintenanceFixture(runtime, scope, state, temporary)
    runtime.defer(async () => { fixture.maintenance?.release(); await rm(temporary, { recursive: true, force: true }) })
    await runtime.start({ dataDir: runtime.root }); await expect(runtime.page.locator('.app-shell')).toBeVisible()
    const observed = await runtime.app.evaluate(({ app }) => ({ executable: process.execPath, packaged: app.isPackaged, dataDir: app.getPath('userData') }))
    fixture.executable = observed.executable; fixture.arguments = observed.packaged ? [] : [resolve('dist/main/main.cjs')]
    await runtime.close()
    await writeFile(join(runtime.root, 'original-fixture.txt'), 'PRIVATE_FIXTURE_ORIGINAL', { mode: 0o600 })
    fixture.maintenance = acquireProfileAccess(fixture.target, 'maintenance')
    if (state === '待恢复事务') fixture.maintenance.beginMaintenance(fixture.id)
    fixture.before = await snapshot(fixture.target)
    await rename(fixture.target, join(temporary, 'original'))
    if (state === '待恢复事务') fixture.maintenance.release()
    fixture.remaining = scope === 'v2' ? await snapshot(runtime.root) : undefined
    return fixture
  }
  async attempt() {
    this.receipt = await repairProcess({ command: '/usr/bin/env', args: ['BOAI_DATA_DIR=' + this.runtime.root, this.executable, ...this.arguments], cwd: process.cwd(), timeoutMs: 5000, signal: new AbortController().signal, managed: { guard: resolve('dist/native/boai-process-guard'), ledger: join(this.temporary, 'processes') } })
  }
  async verifyAndRestore() {
    const original = join(this.temporary, 'original'), receipt = this.receipt!
    const appeared = await lstat(this.target).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
    const after = await snapshot(original)
    // Persist the actual failure facts before assertions or scenario cleanup.
    await this.runtime.reviewData('迁移前启动拒绝的实际进程与原件', { scope: this.scope, state: this.state, executable: this.executable, args: this.arguments, receipt, appeared, before: this.before, after })
    expect(appeared, 'Main在维护准入前重建了数据目录').toBe(false)
    expect(after).toEqual(this.before)
    if (this.remaining) expect(await snapshot(this.runtime.root)).toEqual(this.remaining)
    expect(receipt.failure).toBeUndefined(); expect(receipt.exitCode).toBe(1)
    expect(receipt.stderr).toContain(this.state === '待恢复事务' ? '尚未恢复' : '正在维护')
    if (this.state === '待恢复事务') {
      const recovery = acquireProfileAccess(this.target, 'maintenance')
      try { expect(recovery.maintenanceIntent()?.id).toBe(this.id); await rename(original, this.target); recovery.finishMaintenance(this.id) }
      finally { recovery.release() }
    } else { this.maintenance!.assertHeld(); await rename(original, this.target); this.maintenance!.release() }
    expect(await snapshot(this.target)).toEqual(this.before)
    await expect(readFile(join(this.runtime.root, 'original-fixture.txt'), 'utf8')).resolves.toBe('PRIVATE_FIXTURE_ORIGINAL')
    await this.runtime.start({ dataDir: this.runtime.root }); await expect(this.runtime.page.locator('.app-shell')).toBeVisible()
    expect(this.runtime.errors).toEqual([])
  }
}
