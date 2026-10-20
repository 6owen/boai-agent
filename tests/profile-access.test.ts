/*
 * [INPUT]: 实际SQLite共享/独占事务、隔离profile及Node/Electron子进程。
 * [OUTPUT]: 多应用/维护互斥、持久升级意图与恢复、缺目录别名/控制路径边界及真实GC/死亡释放。
 * [POS]: 个人升级准入合同；不是应用升级或完整数据回滚验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { acquireProfileAccess, acquireRuntimeProfileAccess, ProfileAccessBusyError } from '../src/runtime/profile-access'

const require = createRequire(import.meta.url), leases: ReturnType<typeof acquireProfileAccess>[] = [], roots: string[] = []
const children = new Set<{ process: ChildProcess; ended: Promise<unknown> }>()
let helperRoot: string, helper: string
beforeAll(async () => {
  helperRoot = await mkdtemp(join(tmpdir(), 'boai-profile-helper-')); helper = join(helperRoot, 'child.mjs')
  await build({ stdin: { contents: `
    import { acquireProfileAccess } from ${JSON.stringify(resolve('src/runtime/profile-access.ts'))};
    let lease = acquireProfileAccess(process.argv[2], process.argv[3]);
    process.send({kind:'ready',pid:process.pid,node:process.version});
    process.on('message',kind=>{
      if(kind==='forget'){lease=undefined;global.gc();global.gc();process.send({kind:'forgot'})}
      if(kind==='release'){lease.release();process.send({kind:'released'})}
      if(typeof kind==='string'&&kind.startsWith('begin:')){const intent=lease.beginMaintenance(kind.slice(6));process.send({kind:'begun',intent})}
    });
    process.on('disconnect',()=>process.exit(0));setInterval(()=>{},1000);
  `, resolveDir: process.cwd() }, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: helper })
})
afterEach(async () => {
  for (const child of children) { if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill('SIGKILL'); await child.ended }
  children.clear()
  for (const lease of leases.splice(0).reverse()) lease.release()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
afterAll(async () => { await rm(helperRoot, { recursive: true, force: true }) })
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'boai-profile-access-')); roots.push(root); return { root, profile: join(root, 'profile') } }
function access(profile: string, mode: 'application' | 'maintenance' = 'application') { const lease = acquireProfileAccess(profile, mode); leases.push(lease); return lease }
function message(child: ChildProcess, kind: string) {
  return new Promise<Record<string, unknown>>((done, reject) => {
    const timer = setTimeout(() => finish(Error('child handshake deadline: ' + kind)), 5000)
    const receive = (row: any) => { if (row?.kind === kind) finish(undefined, row) }
    const exit = () => finish(Error('child exited before ' + kind))
    const finish = (error?: Error, value?: Record<string, unknown>) => { clearTimeout(timer); child.off('message', receive); child.off('exit', exit); error ? reject(error) : done(value!) }
    child.on('message', receive); child.once('exit', exit)
  })
}
async function child(profile: string, mode: 'application' | 'maintenance', executable: string) {
  const process = spawn(executable, ['--expose-gc', helper, profile, mode], { env: { ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const ended = once(process, 'close'); children.add({ process, ended })
  let stderr = ''; process.stderr!.on('data', bytes => { stderr += bytes.toString() })
  const ready = await message(process, 'ready').catch(error => { throw Error(error.message + ': ' + stderr) })
  return { process, ended, ready }
}

test('all admitted applications must leave before maintenance; maintenance excludes new applications', async () => {
  const { profile } = await fixture(), first = access(profile), second = access(profile)
  expect(() => access(profile, 'maintenance')).toThrow(ProfileAccessBusyError)
  first.release(); expect(() => access(profile, 'maintenance')).toThrow(ProfileAccessBusyError)
  second.release(); const maintenance = access(profile, 'maintenance')
  expect(() => access(profile)).toThrow(ProfileAccessBusyError)
  maintenance.assertHeld(); maintenance.release(); maintenance.release()
  access(profile).assertHeld()
})

test('admission does not create a missing profile while maintenance owns its stable sibling lock', async () => {
  const { profile } = await fixture(), lease = access(profile, 'maintenance')
  await expect(readFile(join(profile, 'product.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(() => access(profile)).toThrow(ProfileAccessBusyError)
  await expect(readFile(profile)).rejects.toMatchObject({ code: 'ENOENT' })
  lease.assertHeld()
})

test('unfinished upgrade survives lease release and protects a temporarily missing profile until explicit recovery', async () => {
  const { root, profile } = await fixture(); await mkdir(profile); await writeFile(join(profile, 'original'), 'credential-and-data-fixture')
  const maintenance = access(profile, 'maintenance'), id = randomUUID(), intent = maintenance.beginMaintenance(id)
  expect(intent).toEqual({ version: 1, id, startedAt: expect.any(String) })
  await rename(profile, join(root, 'backup')); maintenance.release()
  expect(() => access(profile)).toThrow('尚未恢复')
  await expect(lstat(profile)).rejects.toMatchObject({ code: 'ENOENT' })
  const recovery = access(profile, 'maintenance')
  expect(recovery.maintenanceIntent()).toEqual(intent)
  expect(recovery.beginMaintenance(id)).toEqual(intent)
  expect(() => recovery.beginMaintenance(randomUUID())).toThrow('其他')
  expect(() => recovery.finishMaintenance(randomUUID())).toThrow('不匹配')
  expect(() => access(profile)).toThrow(ProfileAccessBusyError)
  await rename(join(root, 'backup'), profile); recovery.finishMaintenance(id)
  expect(() => recovery.assertHeld()).toThrow('已结束')
  access(profile).assertHeld()
  expect(await readFile(join(profile, 'original'), 'utf8')).toBe('credential-and-data-fixture')
})

test('ordinary application access cannot create or clear upgrade intent, and invalid ids do not change control bytes', async () => {
  const { profile } = await fixture(), application = access(profile), before = await readFile(application.file)
  expect(() => application.beginMaintenance(randomUUID())).toThrow('维护模式')
  expect(() => application.finishMaintenance(randomUUID())).toThrow('维护模式')
  expect(await readFile(application.file)).toEqual(before); application.release()
  const maintenance = access(profile, 'maintenance')
  expect(() => maintenance.beginMaintenance('')).toThrow('事务ID')
  expect(() => maintenance.beginMaintenance('not-a-uuid')).toThrow('事务ID')
  expect(() => maintenance.finishMaintenance(randomUUID())).toThrow('不匹配')
  expect(maintenance.maintenanceIntent()).toBeUndefined()
  expect(await readFile(maintenance.file)).toEqual(before)
})

test('upgrade intent uses a durable v2 marker and explicit completion restores v1 admission at final release', async () => {
  const { profile } = await fixture(), maintenance = access(profile, 'maintenance'), id = randomUUID()
  maintenance.beginMaintenance(id); maintenance.release()
  const readVersion = () => { const database = new DatabaseSync(maintenance.file, { readOnly: true }); try { return database.prepare('SELECT version FROM identity').get()?.version } finally { database.close() } }
  expect(readVersion()).toBe(2)
  const recovery = access(profile, 'maintenance'); recovery.finishMaintenance(id)
  expect(readVersion()).toBe(1)
  access(profile).assertHeld()
})

test.each(['future', 'missing', 'id', 'timestamp', 'oversized', 'inconsistent'])('invalid %s upgrade record refuses application and maintenance without resetting bytes', async kind => {
  const { profile } = await fixture(), original = access(profile, 'maintenance'); original.beginMaintenance(randomUUID()); original.release()
  const database = new DatabaseSync(original.file)
  try {
    if (kind === 'missing') database.exec('DELETE FROM maintenance')
    else if (kind === 'inconsistent') database.exec('UPDATE identity SET version=1')
    else {
      const record = JSON.parse(database.prepare('SELECT intent FROM maintenance').get()!.intent as string)
      if (kind === 'future') record.version = 2
      if (kind === 'id') record.id = 'not-a-uuid'
      if (kind === 'timestamp') record.startedAt = 'tomorrow'
      database.prepare('UPDATE maintenance SET intent=?').run(kind === 'oversized' ? 'x'.repeat(2049) : JSON.stringify(record))
    }
  } finally { database.close() }
  const before = await readFile(original.file)
  expect(() => access(profile)).toThrow()
  expect(() => access(profile, 'maintenance')).toThrow()
  expect(await readFile(original.file)).toEqual(before)
})

test('aliases share authority and replacing profile contents does not replace the maintenance lock', async () => {
  const { root, profile } = await fixture(); await mkdir(profile); await writeFile(join(profile, 'original'), 'before')
  const alias = join(root, 'alias'); await symlink(profile, alias)
  const before = access(profile); expect(access(alias).file).toBe(before.file)
  for (const lease of leases) lease.release()
  const maintenance = access(alias, 'maintenance'), lockBytes = await readFile(maintenance.file)
  await rename(profile, join(root, 'backup')); await mkdir(profile); await writeFile(join(profile, 'restored'), 'after')
  expect(() => access(profile)).toThrow(ProfileAccessBusyError)
  expect(await readFile(maintenance.file)).toEqual(lockBytes)
  maintenance.assertHeld(); maintenance.release(); access(alias).assertHeld()
  expect(await readFile(join(root, 'backup/original'), 'utf8')).toBe('before')
})

test.each([['profile', 'PROFILE'], ['prófile', 'pro\u0301file'], ['µprofile', 'μprofile']])('missing profile cannot escape through filesystem alias %s / %s', async (name, alias) => {
  const { root } = await fixture(), profile = join(root, name), alternate = join(root, alias)
  await mkdir(profile); const info = await lstat(profile), other = await lstat(alternate).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  const aliases = other?.dev === info.dev && other?.ino === info.ino
  const maintenance = access(profile, 'maintenance'); await rename(profile, join(root, 'backup'))
  if (aliases) expect(() => access(alternate)).toThrow(ProfileAccessBusyError)
  else access(alternate).assertHeld() // Distinct names on a sensitive volume remain independent.
  maintenance.assertHeld()
})

test('a dangling profile symlink or child cannot acquire a different authority during restore', async () => {
  const { root, profile } = await fixture(); await mkdir(profile)
  const alias = join(root, 'alias'); await symlink(profile, alias)
  const maintenance = access(profile, 'maintenance'); await rename(profile, join(root, 'backup'))
  const before = await readdir(root)
  expect(() => access(alias)).toThrow('符号链接')
  expect(() => acquireRuntimeProfileAccess(join(alias, 'v2'))).toThrow('符号链接')
  expect(await readdir(root)).toEqual(before)
  maintenance.assertHeld()
})

test.each([{ uppercase: false, child: '' }, { uppercase: true, child: '' }, { uppercase: false, child: 'nested' }, { uppercase: true, child: 'nested' }])('control namespace cannot contain a profile ($uppercase/$child)', async ({ uppercase, child }) => {
  if (!process.getuid) return
  const { root } = await fixture(), name = `.boai-profile-locks-${process.getuid()}`, profile = join(root, uppercase ? name.toUpperCase() : name, child)
  expect(() => access(profile, 'maintenance')).toThrow('保留')
  await expect(lstat(profile)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readdir(root)).toEqual([])
})

test('an already published control scope cannot be maintained as a product profile', async () => {
  const { profile } = await fixture(), original = access(profile, 'maintenance'), scope = dirname(original.file)
  const before = await readdir(scope), bytes = await readFile(original.file)
  expect(() => access(scope, 'maintenance')).toThrow('保留')
  expect(await readdir(scope)).toEqual(before)
  expect(await readFile(original.file)).toEqual(bytes)
  original.assertHeld()
})

test('unrelated profiles do not block each other; runtime v2 aliases cover both desktop and bare profiles', async () => {
  const { root, profile } = await fixture(); access(profile, 'maintenance'); const unrelated = access(join(root, 'other')); unrelated.assertHeld(); unrelated.release()
  const data = join(root, 'other/v2'); await mkdir(data, { recursive: true }); const alias = join(root, 'runtime-alias'); await symlink(data, alias)
  const runtime = acquireRuntimeProfileAccess(alias)
  try {
    expect(() => access(join(root, 'other'), 'maintenance')).toThrow(ProfileAccessBusyError)
    expect(() => access(data, 'maintenance')).toThrow(ProfileAccessBusyError)
  } finally { runtime.release() }
})

test('bare v2 below a writable parent can start when the absent outer authority cannot be created', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return
  const { root } = await fixture(), data = join(root, 'parent/v2'); await mkdir(data, { recursive: true })
  await chmod(root, 0o500)
  let runtime: ReturnType<typeof acquireRuntimeProfileAccess> | undefined
  try {
    runtime = acquireRuntimeProfileAccess(data)
    expect(runtime.profileRoot).toBe(await realpath(data))
    expect(() => access(data, 'maintenance')).toThrow(ProfileAccessBusyError)
  } finally { runtime?.release(); await chmod(root, 0o700) }
})

test('readonly outer parent never permits fallback around an existing maintenance authority', async () => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return
  const { root } = await fixture(), parent = join(root, 'parent'), data = join(parent, 'v2'); await mkdir(data, { recursive: true })
  const maintenance = access(parent, 'maintenance'); await chmod(root, 0o500)
  try {
    expect(() => acquireRuntimeProfileAccess(data)).toThrow(ProfileAccessBusyError)
    maintenance.assertHeld()
    await expect(readFile(join(data, 'boai.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await chmod(root, 0o700) }
})

test.each(['future', 'identity', 'wal', 'empty'])('unsupported %s control bytes are preserved rather than reset', async kind => {
  const { profile } = await fixture(), original = access(profile); original.release()
  if (kind === 'empty') await writeFile(original.file, '')
  else {
    const database = new DatabaseSync(original.file)
    try {
      if (kind === 'future') database.exec('UPDATE identity SET version=3')
      if (kind === 'identity') database.exec("UPDATE identity SET profile='/another-profile'")
      if (kind === 'wal') database.exec('PRAGMA journal_mode=WAL')
    } finally { database.close() }
  }
  const bytes = await readFile(original.file)
  expect(() => acquireProfileAccess(profile)).toThrow()
  expect(await readFile(original.file)).toEqual(bytes)
})

test('symlinked control authority is rejected without changing either file', async () => {
  const { root, profile } = await fixture(), original = access(profile); original.release()
  const moved = join(root, 'moved.sqlite'); await rename(original.file, moved); await symlink(moved, original.file)
  const bytes = await readFile(moved)
  expect(() => access(profile)).toThrow('私有普通路径')
  expect(await readFile(moved)).toEqual(bytes)
})

test('active holder rejects replaced authority before any further protected operation', async () => {
  const { root, profile } = await fixture(), original = access(profile)
  const moved = join(root, 'original-control.sqlite'); await rename(original.file, moved)
  await writeFile(original.file, await readFile(moved), { mode: 0o600 })
  expect(() => original.assertHeld()).toThrow('身份已改变')
})

test('non-private authority is rejected and its bytes remain unchanged', async () => {
  if (process.platform === 'win32') return // POSIX permission semantics; other contracts still run on Windows.
  const { profile } = await fixture(), original = access(profile); original.release()
  const bytes = await readFile(original.file); await chmod(original.file, 0o644)
  expect(() => access(profile)).toThrow('私有普通路径')
  expect(await readFile(original.file)).toEqual(bytes)
})

test('empty and relative maintenance targets are refused without resolving to the working directory', () => {
  expect(() => acquireProfileAccess('')).toThrow('绝对profile路径')
  expect(() => acquireProfileAccess('relative')).toThrow('绝对profile路径')
  expect(() => acquireProfileAccess(parse(resolve('/')).root)).toThrow('根目录')
})

for (const [name, executable] of [['Node', process.execPath], ['Electron Node', require('electron') as string]]) {
  test(`${name}: forgotten application handle survives GC and actual SIGKILL releases the kernel lock`, async () => {
    const { profile } = await fixture(), running = await child(profile, 'application', executable)
    expect(running.ready.pid).toBe(running.process.pid)
    const forgotten = message(running.process, 'forgot'); running.process.send('forget'); await forgotten
    expect(() => access(profile, 'maintenance')).toThrow(ProfileAccessBusyError)
    running.process.kill('SIGKILL'); await running.ended
    access(profile, 'maintenance').assertHeld()
  })
  test(`${name}: maintenance process death admits a new application without deleting lock authority`, async () => {
    const { profile } = await fixture(), running = await child(profile, 'maintenance', executable)
    expect(() => access(profile)).toThrow(ProfileAccessBusyError)
    running.process.kill('SIGKILL'); await running.ended
    access(profile).assertHeld()
  })
  test(`${name}: committed upgrade intent stays locked, survives actual SIGKILL and requires the original recovery id`, async () => {
    const { root, profile } = await fixture(); await mkdir(profile); await writeFile(join(profile, 'original'), 'original-private-fixture')
    const running = await child(profile, 'maintenance', executable), id = randomUUID()
    const begun = message(running.process, 'begun'); running.process.send('begin:' + id); const recorded = await begun
    expect(recorded.intent).toMatchObject({ version: 1, id })
    expect(() => access(profile)).toThrow(ProfileAccessBusyError)
    expect(() => access(profile, 'maintenance')).toThrow(ProfileAccessBusyError)
    await rename(profile, join(root, 'backup'))
    running.process.kill('SIGKILL'); await running.ended
    expect(() => access(profile)).toThrow('尚未恢复')
    await expect(lstat(profile)).rejects.toMatchObject({ code: 'ENOENT' })
    const recovery = access(profile, 'maintenance'); expect(recovery.maintenanceIntent()).toEqual(recorded.intent)
    expect(() => recovery.finishMaintenance(randomUUID())).toThrow('不匹配')
    await rename(join(root, 'backup'), profile); recovery.finishMaintenance(id)
    access(profile).assertHeld()
    expect(await readFile(join(profile, 'original'), 'utf8')).toBe('original-private-fixture')
  })
}
