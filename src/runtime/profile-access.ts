/*
 * [INPUT]: 明确profile根目录、应用共享访问或升级维护模式，以及Node内置SQLite。
 * [OUTPUT]: profile外准入、原authority身份核对、持久意图及快照完成凭据；提交后连接锁保持。
 * [POS]: 桌面/独立服务/个人升级的写入准入；不替代runtime owner或实际进程退出证明。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { userInfo } from 'node:os'

export type ProfileAccessMode = 'application' | 'maintenance'
export class ProfileAccessBusyError extends Error {
  constructor(readonly mode: ProfileAccessMode) {
    super(mode === 'application' ? '此数据配置正在维护，请在升级完成后重新打开' : '此数据配置仍有程序或独立服务使用，请等待实际退出后再维护')
    this.name = 'ProfileAccessBusyError'
  }
}
export class ProfileMaintenancePendingError extends ProfileAccessBusyError {
  constructor() {
    super('application')
    this.message = '此数据配置有尚未恢复的升级事务，请先完成升级恢复'
    this.name = 'ProfileMaintenancePendingError'
  }
}
export interface ProfileMaintenanceIntent { version: 1; id: string; startedAt: string }
export interface ProfileSnapshotReceipt { version: 1; transactionId: string; directory: string; manifestSha256: string }
const validMaintenanceId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
function snapshotReceipt(value: unknown): ProfileSnapshotReceipt {
  const record = value as ProfileSnapshotReceipt | undefined
  if (!record || Object.keys(record).sort().join(',') !== 'directory,manifestSha256,transactionId,version' || record.version !== 1 || !validMaintenanceId(record.transactionId) || typeof record.directory !== 'string' || !isAbsolute(record.directory) || resolve(record.directory) !== record.directory || dirname(record.directory) === record.directory || typeof record.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.manifestSha256)) throw Error('快照完成凭据格式不受支持')
  return { version: 1, transactionId: record.transactionId, directory: record.directory, manifestSha256: record.manifestSha256 }
}
function readSnapshot(database: DatabaseSync, id: string): ProfileSnapshotReceipt | undefined {
  if (!validMaintenanceId(id)) throw Error('快照事务ID必须为小写UUID')
  const table = database.prepare("SELECT type FROM sqlite_schema WHERE name='profile_snapshots'").get()
  if (!table) return
  if (table.type !== 'table') throw Error('快照完成凭据表格式不受支持')
  const rows = database.prepare('SELECT receipt FROM profile_snapshots WHERE id=? LIMIT 2').all(id)
  if (!rows.length) return
  if (rows.length !== 1 || typeof rows[0].receipt !== 'string' || rows[0].receipt.length > 16384) throw Error('快照完成凭据记录不受支持')
  const receipt = snapshotReceipt(JSON.parse(rows[0].receipt))
  if (receipt.transactionId !== id) throw Error('快照完成凭据事务身份不符')
  return receipt
}
function readMaintenance(database: DatabaseSync, version: number): ProfileMaintenanceIntent | undefined {
  const table = database.prepare("SELECT type FROM sqlite_schema WHERE name='maintenance'").get()
  if (!table) { if (version === 2) throw Error('升级事务记录缺失，不能初始化数据'); return }
  if (table.type !== 'table') throw Error('升级事务记录格式不受支持')
  const rows = database.prepare('SELECT id,intent FROM maintenance LIMIT 2').all()
  if (!rows.length) { if (version === 2) throw Error('升级事务记录缺失，不能初始化数据'); return }
  if (rows.length !== 1 || rows[0].id !== 1 || typeof rows[0].intent !== 'string' || rows[0].intent.length > 2048) throw Error('升级事务记录格式不受支持')
  const record = JSON.parse(rows[0].intent)
  if (version !== 2 || !record || Object.keys(record).sort().join(',') !== 'id,startedAt,version' || record.version !== 1 || !validMaintenanceId(record.id) || typeof record.startedAt !== 'string' || !Number.isFinite(Date.parse(record.startedAt)) || new Date(record.startedAt).toISOString() !== record.startedAt) throw Error('升级事务身份或版本不符，原记录保持')
  return { version: 1, id: record.id, startedAt: record.startedAt }
}

// Keep failed/unknown shutdowns locked even if their caller loses its handle or GC runs.
// Only explicit completed cleanup or actual process death releases an admitted lease.
const active = new Set<DatabaseSync>()
const namespace = process.getuid?.() ?? createHash('sha256').update(userInfo().username).digest('hex').slice(0, 16)
const controlDirectory = (profileRoot: string) => join(dirname(profileRoot), `.boai-profile-locks-${namespace}`)
function canonicalPath(path: string): string {
  path = resolve(path)
  try { return realpathSync(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // A temporarily missing symlink target is not a new literal profile authority.
    try { if (lstatSync(path).isSymbolicLink()) throw Error('数据配置包含目标暂不可用的符号链接，请等待恢复完成') }
    catch (inspection) { if ((inspection as NodeJS.ErrnoException).code !== 'ENOENT') throw inspection }
    return join(canonicalPath(dirname(path)), basename(path))
  }
}
/** Standard desktop v2 is nested in userData; bare headless profiles use their own root. */
export function runtimeProfileRoot(dataPath: string) {
  const path = canonicalPath(dataPath)
  return basename(path).toLowerCase() === 'v2' ? dirname(path) : path
}
function privatePath(path: string, directory: boolean) {
  const info = lstatSync(path)
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)) throw Error('数据维护锁必须为当前用户的私有普通路径')
  return info
}
function syncPath(path: string, directory = false) {
  if (directory && process.platform === 'win32') return
  const fd = openSync(path, constants.O_RDONLY)
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function publishControl(file: string, profileRoot: string) {
  try { privatePath(file, false); return }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const temporary = join(dirname(file), `profile-${randomUUID()}.tmp`)
  const fd = openSync(temporary, 'wx', 0o600); closeSync(fd)
  try {
    const database = new DatabaseSync(temporary)
    try {
      database.exec('PRAGMA journal_mode=DELETE; CREATE TABLE identity (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, profile TEXT NOT NULL)')
      database.prepare('INSERT INTO identity VALUES (1,1,?)').run(profileRoot)
    } finally { database.close() }
    syncPath(temporary)
    // Atomic publication without overwriting an existing authority. Never unlink the published inode.
    try { linkSync(temporary, file); syncPath(dirname(file), true) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  } finally { unlinkSync(temporary) }
}

export function acquireProfileAccess(input: string, mode: ProfileAccessMode = 'application') {
  if (typeof input !== 'string' || !input || !isAbsolute(input)) throw Error('数据维护要求明确的绝对profile路径')
  if (!['application', 'maintenance'].includes(mode)) throw Error('数据维护模式无效')
  // Do not create userData before admission: it may be temporarily absent during a restore.
  const profileRoot = canonicalPath(input), directory = controlDirectory(profileRoot)
  if (profileRoot === dirname(profileRoot)) throw Error('数据配置不能使用文件系统根目录')
  for (let path = profileRoot; path !== dirname(path); path = dirname(path)) {
    if (basename(path).normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').toUpperCase().startsWith('.BOAI-PROFILE-LOCKS-')) throw Error('数据配置不能位于保留的维护锁目录内')
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 }); const parent = privatePath(directory, true)
  // Let this same parent filesystem resolve case/Unicode aliases even while userData is absent.
  // A directory preserves the full legal leaf length; adding a suffix to a 255-byte name would not.
  const scopeDirectory = join(directory, basename(profileRoot))
  mkdirSync(scopeDirectory, { mode: 0o700, recursive: true }); const scope = privatePath(scopeDirectory, true)
  const file = join(scopeDirectory, 'access.sqlite')
  publishControl(file, profileRoot)
  const original = privatePath(file, false)
  if (original.size > 1024 * 1024) throw Error('数据维护锁内容过大，原文件保持')
  const database = new DatabaseSync(file, { readOnly: mode === 'application' })
  let released = false, faulted = false, transactionOpen = false, accessVersion = 1
  const assertHeld = () => {
    // Node 22.13 has no isTransaction getter; BEGIN/read below still establish the real lock.
    // Maintenance EXCLUSIVE locking mode retains the kernel lock across durable COMMITs.
    if (released || faulted || mode === 'application' && (!transactionOpen || database.isTransaction === false)) throw Error('数据维护访问已结束或结果未知')
    if (mode === 'maintenance' && database.prepare('PRAGMA locking_mode').get()?.locking_mode !== 'exclusive') throw Error('数据维护连接锁未保持')
    const currentParent = privatePath(directory, true), currentScope = privatePath(scopeDirectory, true), current = privatePath(file, false)
    if (currentParent.dev !== parent.dev || currentParent.ino !== parent.ino || currentScope.dev !== scope.dev || currentScope.ino !== scope.ino || current.dev !== original.dev || current.ino !== original.ino) throw Error('数据维护锁路径身份已改变，不能继续写入')
  }
  try {
    database.exec('PRAGMA busy_timeout=0')
    if (database.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') throw Error('数据维护锁格式不受支持，原文件保持')
    if (mode === 'maintenance') {
      database.exec('PRAGMA synchronous=FULL')
      if (database.prepare('PRAGMA locking_mode=EXCLUSIVE').get()?.locking_mode !== 'exclusive') throw Error('数据维护连接锁不受支持')
    }
    database.exec(mode === 'maintenance' ? 'BEGIN EXCLUSIVE' : 'BEGIN')
    transactionOpen = true
    const rows = database.prepare('SELECT id,version,profile FROM identity').all()
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].version !== 1 && rows[0].version !== 2 || typeof rows[0].profile !== 'string' || !isAbsolute(rows[0].profile) || dirname(rows[0].profile) !== dirname(profileRoot)) throw Error('数据维护锁身份或版本不符，原文件保持')
    const recordedScope = privatePath(join(directory, basename(rows[0].profile)), true)
    if (recordedScope.dev !== scope.dev || recordedScope.ino !== scope.ino) throw Error('数据维护锁身份或版本不符，原文件保持')
    accessVersion = rows[0].version === 2 ? 2 : 1
    const intent = readMaintenance(database, accessVersion)
    if (mode === 'application' && intent) throw new ProfileMaintenancePendingError()
    assertHeld(); active.add(database)
  } catch (error) {
    database.close()
    const code = (error as { errcode?: number }).errcode
    if (code !== undefined && [5, 6].includes(code & 0xff)) throw new ProfileAccessBusyError(mode)
    throw error
  }
  const release = () => {
    if (released) return
    try { if (transactionOpen) database.exec('ROLLBACK') }
    finally { database.close(); active.delete(database); released = true }
  }
  const requireMaintenance = () => { assertHeld(); if (mode !== 'maintenance') throw Error('仅维护模式可以修改升级事务') }
  const commitMaintenance = (write: () => void) => {
    try {
      if (!transactionOpen) { database.exec('BEGIN EXCLUSIVE'); transactionOpen = true }
      write(); database.exec('COMMIT'); transactionOpen = false
      assertHeld()
    } catch (error) { faulted = true; throw error }
  }
  return { profileRoot, file, assertHeld, release,
    assertProfileIdentity(profile: string) {
      assertHeld()
      if (typeof profile !== 'string' || !isAbsolute(profile)) throw Error('快照来源必须为明确绝对路径')
      const root = canonicalPath(profile), otherDirectory = controlDirectory(root), otherScope = join(otherDirectory, basename(root))
      const identities = [[privatePath(otherDirectory, true), parent], [privatePath(otherScope, true), scope], [privatePath(join(otherScope, 'access.sqlite'), false), original]]
      if (identities.some(([actual, expected]) => actual.dev !== expected.dev || actual.ino !== expected.ino)) throw Error('快照不属于同一原维护身份')
    },
    maintenanceIntent() { assertHeld(); return readMaintenance(database, accessVersion) },
    snapshotReceipt(id: string) { assertHeld(); return readSnapshot(database, id) },
    // The caller finishes all asynchronous work and cancellation checks before this commit.
    recordSnapshot(value: ProfileSnapshotReceipt) {
      requireMaintenance()
      const receipt = snapshotReceipt(value)
      if (readMaintenance(database, accessVersion)?.id !== receipt.transactionId) throw Error('快照完成凭据必须沿原维护事务')
      const previous = readSnapshot(database, receipt.transactionId)
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(receipt)) throw Error('原事务已有不同快照完成凭据，不能覆盖')
        return previous
      }
      commitMaintenance(() => {
        database.exec('CREATE TABLE IF NOT EXISTS profile_snapshots (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)')
        database.prepare('INSERT INTO profile_snapshots VALUES (?,?)').run(receipt.transactionId, JSON.stringify(receipt))
      })
      return receipt
    },
    beginMaintenance(id: string) {
      requireMaintenance()
      if (!validMaintenanceId(id)) throw Error('升级事务ID必须为小写UUID')
      const current = readMaintenance(database, accessVersion)
      if (current) { if (current.id !== id) throw Error('此配置仍有其他升级事务，请先恢复原事务'); return current }
      const intent: ProfileMaintenanceIntent = { version: 1, id, startedAt: new Date().toISOString() }
      commitMaintenance(() => {
        database.exec('CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY CHECK(id=1), intent TEXT NOT NULL)')
        database.prepare('INSERT INTO maintenance VALUES (1,?)').run(JSON.stringify(intent))
        database.exec('UPDATE identity SET version=2 WHERE id=1')
      })
      accessVersion = 2
      return intent
    },
    // Call only after the installer has verified a consistent app/data pair. This ends the lease.
    finishMaintenance(id: string) {
      requireMaintenance()
      if (!validMaintenanceId(id) || readMaintenance(database, accessVersion)?.id !== id) throw Error('升级事务ID不匹配，不能清除原事务')
      commitMaintenance(() => { database.exec('DELETE FROM maintenance; UPDATE identity SET version=1 WHERE id=1') })
      accessVersion = 1
      release()
    },
  }
}

/** Parent first: standard desktop maintenance must reject startup before any v2 writes. */
export function acquireRuntimeProfileAccess(dataPath: string) {
  const dataRoot = canonicalPath(dataPath)
  let profileRoot = runtimeProfileRoot(dataRoot)
  const accesses: ReturnType<typeof acquireProfileAccess>[] = []
  try { accesses.push(acquireProfileAccess(profileRoot)) }
  catch (error) {
    const failure = error as NodeJS.ErrnoException
    // A bare profile may itself be named v2 below a directory whose parent is not writable.
    // Only absent parent-authority creation can fall back; existing/busy/invalid authority cannot.
    if (profileRoot === dataRoot || failure.syscall !== 'mkdir' || failure.path !== controlDirectory(profileRoot) || !['EACCES', 'EPERM'].includes(failure.code ?? '')) throw error
    try { lstatSync(controlDirectory(profileRoot)); throw error }
    catch (inspection) { if ((inspection as NodeJS.ErrnoException).code !== 'ENOENT') throw inspection }
    profileRoot = dataRoot; accesses.push(acquireProfileAccess(dataRoot))
  }
  try {
    // Also cover a bare headless profile named v2, without relying on the folder name alone.
    if (dataRoot !== profileRoot) accesses.push(acquireProfileAccess(dataRoot))
  } catch (error) { accesses[0].release(); throw error }
  return { profileRoot, release() { for (const access of [...accesses].reverse()) access.release() } }
}
