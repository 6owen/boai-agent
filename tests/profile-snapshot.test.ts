/*
 * [INPUT]: 实际Swift清单/ditto、SQLite维护租约、隔离凭据/浏览器/WAL及原生元数据。
 * [OUTPUT]: 成套数据和元数据保持、嵌套维护互斥；修改/中断/未知备份不能被核验为成功。
 * [POS]: 升级备份模块合同；不运行Electron或模型，不代替安装/回滚/个人权限验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查tests/.folder.md。
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { chmod, copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
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
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-profile-snapshot-')), profile = join(root, 'profile'), output = join(root, 'snapshot')
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
  const verified = await verifyProfileSnapshot(f.output, join(f.root, 'verification'), f.tools)
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
  await expect(verifyProfileSnapshot(f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
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
  await expect(verifyProfileSnapshot(f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
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
  await verifyProfileSnapshot(f.output, join(f.root, 'verification'), f.tools)
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
  if (kind === 'future-version') { manifest.version = 2; await writeFile(path, JSON.stringify(manifest)) }
  if (kind === 'invalid-id') { manifest.transactionId = '-'.repeat(36); await writeFile(path, JSON.stringify(manifest)) }
  if (kind === 'failed-result') await writeFile(join(f.output, 'failure.json'), '{"status":"failed"}')
  if (kind === 'public-acl') expect(await f.tools.execute('add-public-acl', '/bin/chmod', ['+a', 'everyone allow read,list,search', f.output])).toMatchObject({ exitCode: 0 })
  await expect(verifyProfileSnapshot(f.output, join(f.root, 'verification'), f.tools)).rejects.toThrow()
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
