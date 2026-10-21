/*
 * [INPUT]: 实际Swift/ditto与隔离数据；完成阶段取消及明确局部文件系统故障注入。
 * [OUTPUT]: 成套数据/缺目录别名恢复、子scope身份互斥；末阶段取消/失败不能获得完成资格。
 * [POS]: 升级备份模块合同；不运行Electron或模型，不代替安装/回滚/个人权限验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查tests/.folder.md。
 */
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { chmod, copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { acquireProfileAccess, acquireRuntimeProfileAccess, ProfileAccessBusyError } from '../src/runtime/profile-access'
import { createProfileSnapshot, verifyProfileSnapshot, type ProfileSnapshotTools } from '../src/runtime/profile-snapshot'
import { repairProcess, saveProcess } from './evaluation/repair-process'

let helper: string, tool: string, guard: string
const cleanup: (() => unknown | Promise<unknown>)[] = []
beforeAll(async () => {
  helper = await mkdtemp(join(tmpdir(), 'boai-profile-tool-')); tool = join(helper, 'profile-files'); guard = join(helper, 'guard')
  await copyFile(resolve('dist/native/boai-process-guard'), guard); await chmod(guard, 0o700)
  const receipt = await repairProcess({ command: '/usr/bin/swiftc', args: ['-O', resolve('scripts/profile-files.swift'), '-o', tool], cwd: process.cwd(), timeoutMs: 25000, signal: new AbortController().signal, managed: { guard, ledger: join(helper, 'processes') } })
  expect(receipt, 'actual Swift metadata tool must compile').toMatchObject({ exitCode: 0, failure: undefined })
})
afterAll(async () => { await rm(helper, { recursive: true, force: true }) })
afterEach(async () => { vi.doUnmock('node:fs/promises'); vi.resetModules(); for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function fixture(name = 'profile') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-profile-snapshot-'))), profile = join(root, name), output = join(root, 'snapshot')
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(profile, 'v2'), { recursive: true }); await mkdir(join(profile, 'browser')); await mkdir(join(profile, '空目录'))
  await writeFile(join(profile, 'v2/credentials.enc.json'), '{"fixture":"opaque-encrypted-original"}', { mode: 0o600 })
  await writeFile(join(profile, 'browser/Cookies'), 'PRIVATE_FIXTURE_LOGIN_BYTES', { mode: 0o600 })
  await writeFile(join(profile, 'desktop-settings.json'), '{"original":true}')
  await writeFile(join(profile, '中文\n文件.bin'), Buffer.from([0, 1, 127, 255]), { mode: 0o640 })
  await link(join(profile, '中文\n文件.bin'), join(profile, 'hardlink.bin'))
  await symlink('../../external-never-follow', join(profile, 'v2/external-link'))
  const database = new DatabaseSync(join(profile, 'v2/boai.sqlite')); database.exec('CREATE TABLE records(value); INSERT INTO records VALUES(42)'); database.close()
  const runtime = acquireRuntimeProfileAccess(join(profile, 'v2')); runtime.release()
  await mkdir(join(root, 'receipts'))
  let sequence = 0
  const tools: ProfileSnapshotTools = { inventoryTool: tool, execute: async (name, command, args) => {
    const prefix = `${sequence++}-${name}`, receipt = await repairProcess({ command, args, cwd: process.cwd(), timeoutMs: 10000, signal: new AbortController().signal, managed: { guard, ledger: join(root, 'processes') }, capture: { directory: join(root, 'receipts'), prefix } })
    await saveProcess(join(root, 'receipts'), prefix, receipt); return receipt
  } }
  const maintenance = acquireProfileAccess(profile, 'maintenance'), id = randomUUID(); cleanup.push(() => maintenance.release()); maintenance.beginMaintenance(id)
  return { root, profile, output, tools, maintenance, id }
}
test('offline copy keeps encrypted credentials, login bytes, ACL/xattrs/flags, links and SQLite, without changing original data', async () => {
  const f = await fixture(), path = join(f.profile, '中文\n文件.bin')
  for (const [name, command, args] of [
    ['xattr', '/usr/bin/xattr', ['-w', '-x', 'com.boai.snapshot-fixture', '0001FF7F', path]],
    ['acl', '/bin/chmod', ['+a', `user:${userInfo().username} allow read,readattr,readextattr,readsecurity`, path]],
    ['flags', '/usr/bin/chflags', ['nodump', path]],
  ] as const) expect(await f.tools.execute(name, command, [...args])).toMatchObject({ exitCode: 0, failure: undefined })
  const result = await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const verified = await verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)
  expect(verified.manifestSha256).toBe(result.manifestSha256)
  expect(await readFile(join(f.output, 'profile/v2/credentials.enc.json'))).toEqual(await readFile(join(f.profile, 'v2/credentials.enc.json')))
  expect(await readFile(join(f.output, 'profile/browser/Cookies'), 'utf8')).toBe('PRIVATE_FIXTURE_LOGIN_BYTES')
  expect((await readdir(join(f.output, 'profile'))).some(name => name.startsWith('.boai-profile-locks-'))).toBe(false)
  expect(result.excludedControls).toHaveLength(1)
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
  expect(() => acquireProfileAccess(f.profile)).toThrow()
})
test.each(['bytes', 'xattr', 'mode', 'link', 'hardlink'])('%s corruption cannot reuse the original snapshot qualification', async kind => {
  const f = await fixture(); await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const file = join(f.output, 'profile/v2/credentials.enc.json')
  if (kind === 'bytes') await writeFile(file, 'modified credential')
  if (kind === 'mode') await chmod(file, 0o644)
  if (kind === 'xattr') expect(await f.tools.execute('change-xattr', '/usr/bin/xattr', ['-w', 'com.boai.changed', 'changed', file])).toMatchObject({ exitCode: 0 })
  if (kind === 'link') { const link = join(f.output, 'profile/v2/external-link'); await rm(link); await symlink('/different-external', link) }
  if (kind === 'hardlink') { const path = join(f.output, 'profile/hardlink.bin'), bytes = await readFile(path); await rm(path); await writeFile(path, bytes) }
  await expect(verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
  f.maintenance.assertHeld(); expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test('nested maintenance is refused before copying, and the original live authority is retained', async () => {
  const f = await fixture(), nested = acquireProfileAccess(join(f.profile, 'v2'), 'maintenance'); cleanup.push(() => nested.release())
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toBeInstanceOf(ProfileAccessBusyError)
  nested.assertHeld(); await expect(lstat(join(f.output, 'snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
test('failed copying retains its original intent and partial attempt, without publishing a usable snapshot', async () => {
  const f = await fixture(), original = f.tools.execute
  f.tools.execute = (name, command, args) => name === 'profile-copy' ? Promise.resolve({ exitCode: 1 }) : original(name, command, args)
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toThrow('profile-copy')
  await expect(lstat(join(f.output, 'snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(JSON.parse(await readFile(join(f.output, 'intent.json'), 'utf8')).transactionId).toBe(f.id)
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
  await expect(verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
})
test('no original intent, wrong ID, overlapping or existing output cannot create or overwrite a snapshot', async () => {
  const f = await fixture()
  await expect(createProfileSnapshot(f.maintenance, f.output, randomUUID(), f.tools)).rejects.toThrow('原维护事务')
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(createProfileSnapshot(f.maintenance, join(f.profile, 'snapshot'), f.id, f.tools)).rejects.toThrow('相互包含')
  await mkdir(f.output); await writeFile(join(f.output, 'unique-original'), 'keep')
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(join(f.output, 'unique-original'), 'utf8')).toBe('keep')
  f.maintenance.finishMaintenance(f.id)
  const unmarked = acquireProfileAccess(f.profile, 'maintenance'); cleanup.push(() => unmarked.release())
  await expect(createProfileSnapshot(unmarked, join(f.root, 'unmarked'), f.id, f.tools)).rejects.toThrow('原维护事务')
  await expect(lstat(join(f.root, 'unmarked'))).rejects.toMatchObject({ code: 'ENOENT' })
})
test('committed WAL from an actually killed SQLite writer is preserved and readable from a disposable recovery copy', async () => {
  const f = await fixture(), database = join(f.profile, 'v2/boai.sqlite')
  const receipt = await f.tools.execute('original-wal-writer', process.execPath, ['--input-type=module', '-e', "import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;INSERT INTO records VALUES(99)');process.kill(process.pid,'SIGKILL')", database])
  expect(receipt.exitCode).not.toBe(0); expect((await lstat(database + '-wal')).size).toBeGreaterThan(0)
  await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const recovered = join(f.root, 'recovery-read')
  expect(await f.tools.execute('recovery-copy', '/usr/bin/ditto', [join(f.output, 'profile/v2'), recovered])).toMatchObject({ exitCode: 0 })
  const reader = new DatabaseSync(join(recovered, 'boai.sqlite'))
  try { expect(reader.prepare('SELECT value FROM records ORDER BY value').all()).toEqual([{ value: 42 }, { value: 99 }]) } finally { reader.close() }
  await verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)
})
test('a source change after copying cannot publish a completed backup', async () => {
  const f = await fixture(), original = f.tools.execute
  f.tools.execute = async (name, command, args) => { const receipt = await original(name, command, args); if (name === 'profile-copy') await writeFile(join(f.profile, 'v2/credentials.enc.json'), 'concurrent change'); return receipt }
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toThrow('不一致')
  await expect(lstat(join(f.output, 'snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test('cancellation after a real copy retains the attempt and original intent, with no completion record', async () => {
  const f = await fixture(), controller = new AbortController(), original = f.tools.execute
  f.tools.signal = controller.signal
  f.tools.execute = async (name, command, args) => { const receipt = await original(name, command, args); if (name === 'profile-copy') controller.abort(); return receipt }
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toThrow()
  expect(await readFile(join(f.output, 'profile/v2/credentials.enc.json'))).toEqual(await readFile(join(f.profile, 'v2/credentials.enc.json')))
  await expect(lstat(join(f.output, 'snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test.each(['future-version', 'invalid-id', 'failed-result', 'public-acl'])('%s cannot be accepted as a usable snapshot', async kind => {
  const f = await fixture(); await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const path = join(f.output, 'snapshot.json'), manifest = JSON.parse(await readFile(path, 'utf8'))
  if (kind === 'future-version') { manifest.version = 3; await writeFile(path, JSON.stringify(manifest)) }
  if (kind === 'invalid-id') { manifest.transactionId = '-'.repeat(36); await writeFile(path, JSON.stringify(manifest)) }
  if (kind === 'failed-result') await writeFile(join(f.output, 'failure.json'), '{"status":"failed"}')
  if (kind === 'public-acl') expect(await f.tools.execute('add-public-acl', '/bin/chmod', ['+a', 'everyone allow read,list,search', f.output])).toMatchObject({ exitCode: 0 })
  await expect(verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
})
test('an existing external symlink target is not read as part of its link metadata or copied into the backup', async () => {
  const f = await fixture(), external = join(f.root, 'external-never-follow')
  await writeFile(external, 'EXTERNAL_FIXTURE_NOT_IN_SNAPSHOT')
  expect(await f.tools.execute('external-xattr', '/usr/bin/xattr', ['-w', 'com.boai.external-only', 'external-attribute', external])).toMatchObject({ exitCode: 0 })
  expect(await f.tools.execute('external-acl', '/bin/chmod', ['+a', `user:${userInfo().username} allow read,readattr`, external])).toMatchObject({ exitCode: 0 })
  await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const catalog = JSON.parse(await readFile(join(f.output, 'catalog.json'), 'utf8')), link = catalog.entries.find((row: { path: string }) => row.path === 'v2/external-link')
  expect(link).toMatchObject({ type: 'link', target: '../../external-never-follow', acl: '' })
  expect(link.xattrs.some((row: { name: string }) => row.name === 'com.boai.external-only')).toBe(false)
  expect(catalog.entries.some((row: { path: string }) => row.path.includes('external-never-follow'))).toBe(false)
})
test('a public destination parent is refused before any backup directory or copy is created', async () => {
  const f = await fixture(); await chmod(f.root, 0o755)
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toThrow('私有目录')
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
  f.maintenance.assertHeld()
})
test.each(['pending', 'unknown'])('a moved child with %s authority cannot redirect its lease through an external symlink', async kind => {
  const f = await fixture(), child = join(f.profile, 'child'), external = join(f.root, 'external')
  await mkdir(child); await mkdir(external)
  const lease = acquireProfileAccess(child, 'maintenance'); lease.beginMaintenance(randomUUID()); lease.release()
  if (kind === 'unknown') { const db = new DatabaseSync(lease.file); db.exec('UPDATE identity SET version=99'); db.close() }
  await rename(child, join(f.root, 'moved-child')); await symlink(external, child)
  const original = f.tools.execute; let copied = false
  f.tools.execute = async (name, command, args) => { if (name === 'profile-copy') copied = true; return original(name, command, args) }
  await expect(createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)).rejects.toThrow()
  expect(copied).toBe(false)
  expect((await readdir(external))).toEqual([])
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test.each(['manifest-sync', 'directory-sync', 'manifest-read'])('cancellation during final %s cannot return success or receive independent completion qualification', async phase => {
  const f = await fixture(), controller = new AbortController(), manifest = join(f.output, 'snapshot.json')
  f.tools.signal = controller.signal
  const actual = await import('node:fs/promises'); let finalDirectory = false, triggered = false
  vi.doMock('node:fs/promises', () => ({ ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args), path = String(args[0]), original = handle.sync.bind(handle)
      if (path === manifest) finalDirectory = true
      if (phase === 'manifest-sync' && path === manifest || phase === 'directory-sync' && path === f.output && finalDirectory) handle.sync = async () => { await original(); triggered = true; controller.abort() }
      return handle
    },
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const value = await actual.readFile(...args)
      if (phase === 'manifest-read' && String(args[0]) === manifest) { triggered = true; controller.abort() }
      return value
    },
  }))
  const isolated = await import('../src/runtime/profile-snapshot')
  const outcome = await isolated.createProfileSnapshot(f.maintenance, f.output, f.id, f.tools).then(() => 'completed', () => 'rejected')
  expect(triggered).toBe(true)
  expect(outcome).toBe('rejected')
  expect(f.maintenance.snapshotReceipt(f.id)).toBeUndefined()
  await expect(verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), { ...f.tools, signal: undefined })).rejects.toThrow()
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test('a final sync failure and an unwritable failure marker cannot turn a rejected attempt into a completed snapshot', async () => {
  const f = await fixture(), actual = await import('node:fs/promises'); let finalDirectory = false, failedSync = false, failedMarker = false
  vi.doMock('node:fs/promises', () => ({ ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args), path = String(args[0]), original = handle.sync.bind(handle)
      if (path === join(f.output, 'snapshot.json')) finalDirectory = true
      if (path === f.output && finalDirectory) handle.sync = async () => { await original(); failedSync = true; throw Object.assign(Error('injected final fsync I/O failure'), { code: 'EIO' }) }
      return handle
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (String(args[0]) === join(f.output, 'failure.json')) { failedMarker = true; throw Object.assign(Error('injected failure marker disk full'), { code: 'ENOSPC' }) }
      return actual.writeFile(...args)
    },
  }))
  const isolated = await import('../src/runtime/profile-snapshot')
  const outcome = await isolated.createProfileSnapshot(f.maintenance, f.output, f.id, f.tools).then(() => 'completed', () => 'rejected')
  expect(failedSync && failedMarker).toBe(true)
  expect(outcome).toBe('rejected')
  expect(f.maintenance.snapshotReceipt(f.id)).toBeUndefined()
  await expect(lstat(join(f.output, 'failure.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(verifyProfileSnapshot(f.maintenance, f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
  expect(f.maintenance.maintenanceIntent()?.id).toBe(f.id)
})
test('verification needs the original authority receipt, including after reacquiring the original pending transaction', async () => {
  const f = await fixture(), created = await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  const wrong = acquireProfileAccess(join(f.root, 'other-profile'), 'maintenance'); cleanup.push(() => wrong.release()); wrong.beginMaintenance(f.id)
  await expect(verifyProfileSnapshot(wrong, f.output, join(f.root, 'wrong-verification'), f.tools)).rejects.toThrow('原维护身份')
  const receipt = f.maintenance.snapshotReceipt(f.id)
  expect(receipt).toMatchObject({ transactionId: f.id, directory: f.output, manifestSha256: created.manifestSha256 })
  f.maintenance.release()
  const recovered = acquireProfileAccess(f.profile, 'maintenance'); cleanup.push(() => recovered.release())
  expect(recovered.maintenanceIntent()?.id).toBe(f.id)
  expect(recovered.snapshotReceipt(f.id)).toEqual(receipt)
  expect((await verifyProfileSnapshot(recovered, f.output, join(f.root, 'recovered-verification'), f.tools)).manifestSha256).toBe(created.manifestSha256)
})
test('capacity includes resource forks and the control files temporarily copied by ditto without opening authority files in the lock holder', async () => {
  const f = await fixture(), fork = join(f.profile, 'resource-fork-only'), capacityFile = join(f.root, 'capacity.json'), catalogFile = join(f.root, 'capacity-user-data.json')
  await writeFile(fork, '')
  const value = '000102030405060708090a0b0c0d0e0f'
  expect(await f.tools.execute('capacity-resource-fork', '/usr/bin/xattr', ['-w', '-x', 'com.apple.ResourceFork', value, fork])).toMatchObject({ exitCode: 0 })
  expect(await f.tools.execute('capacity-inventory', tool, ['inventory', f.profile, catalogFile])).toMatchObject({ exitCode: 0 })
  expect(await f.tools.execute('capacity-all-nodes', tool, ['capacity', f.profile, capacityFile])).toMatchObject({ exitCode: 0 })
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8')), observed = JSON.parse(await readFile(capacityFile, 'utf8'))
  const dataBytes = catalog.entries.reduce((sum: number, row: { type: string; bytes?: number; xattrs: { bytes: number }[] }) => sum + (row.type === 'file' ? row.bytes! : 0) + row.xattrs.reduce((n, attr) => n + attr.bytes, 0), 0)
  const control = await lstat(join(f.profile, `.boai-profile-locks-${process.getuid?.()}/v2/access.sqlite`))
  expect(catalog.entries.find((row: { path: string }) => row.path === 'resource-fork-only').xattrs).toContainEqual(expect.objectContaining({ name: 'com.apple.ResourceFork', bytes: value.length / 2 }))
  expect(observed).toMatchObject({ version: 1 }); expect(observed.totalBytes).toBeGreaterThanOrEqual(dataBytes + control.size)
  f.maintenance.assertHeld(); expect(() => acquireProfileAccess(f.profile)).toThrow(ProfileAccessBusyError)
})
test.each([
  { name: 'case', leaf: 'CaseProfile', alias: 'CASEPROFILE' },
  { name: 'Unicode', leaf: 'Café', alias: 'Cafe\u0301' },
])('$name alias of a temporarily missing profile still verifies through its original authority', async ({ leaf, alias }) => {
  const f = await fixture(leaf), created = await createProfileSnapshot(f.maintenance, f.output, f.id, f.tools)
  f.maintenance.release(); await rename(f.profile, join(f.root, 'offline-original'))
  const recovered = acquireProfileAccess(join(f.root, alias), 'maintenance'); cleanup.push(() => recovered.release())
  expect(await realpath(recovered.file)).toBe(await realpath(f.maintenance.file))
  expect(recovered.snapshotReceipt(f.id)?.manifestSha256).toBe(created.manifestSha256)
  await expect(lstat(f.profile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await verifyProfileSnapshot(recovered, f.output, join(f.root, 'alias-verification'), f.tools)).manifestSha256).toBe(created.manifestSha256)
  await expect(lstat(f.profile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(recovered.maintenanceIntent()?.id).toBe(f.id)
  await rename(join(f.root, 'offline-original'), f.profile)
})
