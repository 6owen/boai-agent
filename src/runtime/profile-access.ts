/*
 * [INPUT]: 明确profile根目录、应用共享访问或升级维护模式，以及Node内置SQLite。
 * [OUTPUT]: profile之外的持久锁文件及本卷别名身份；应用可并用，维护排斥访问，实际进程死亡释放。
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
  mkdirSync(directory, { recursive: true, mode: 0o700 }); const parent = privatePath(directory, true)
  // Let this same parent filesystem resolve case/Unicode aliases even while userData is absent.
  // A directory preserves the full legal leaf length; adding a suffix to a 255-byte name would not.
  const scopeDirectory = join(directory, basename(profileRoot))
  mkdirSync(scopeDirectory, { mode: 0o700, recursive: true }); const scope = privatePath(scopeDirectory, true)
  const file = join(scopeDirectory, 'access.sqlite')
  publishControl(file, profileRoot)
  const original = privatePath(file, false)
  if (original.size > 1024 * 1024) throw Error('数据维护锁内容过大，原文件保持')
  const database = new DatabaseSync(file, { readOnly: mode === 'application', timeout: 0 })
  let released = false
  const assertHeld = () => {
    if (released || !database.isTransaction) throw Error('数据维护访问已结束')
    const currentParent = privatePath(directory, true), currentScope = privatePath(scopeDirectory, true), current = privatePath(file, false)
    if (currentParent.dev !== parent.dev || currentParent.ino !== parent.ino || currentScope.dev !== scope.dev || currentScope.ino !== scope.ino || current.dev !== original.dev || current.ino !== original.ino) throw Error('数据维护锁路径身份已改变，不能继续写入')
  }
  try {
    if (database.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') throw Error('数据维护锁格式不受支持，原文件保持')
    database.exec(mode === 'maintenance' ? 'BEGIN EXCLUSIVE' : 'BEGIN')
    const rows = database.prepare('SELECT id,version,profile FROM identity').all()
    if (rows.length !== 1 || rows[0].id !== 1 || rows[0].version !== 1 || typeof rows[0].profile !== 'string' || !isAbsolute(rows[0].profile) || dirname(rows[0].profile) !== dirname(profileRoot)) throw Error('数据维护锁身份或版本不符，原文件保持')
    const recordedScope = privatePath(join(directory, basename(rows[0].profile)), true)
    if (recordedScope.dev !== scope.dev || recordedScope.ino !== scope.ino) throw Error('数据维护锁身份或版本不符，原文件保持')
    assertHeld(); active.add(database)
  } catch (error) {
    database.close()
    const code = (error as { errcode?: number }).errcode
    if (code !== undefined && [5, 6].includes(code & 0xff)) throw new ProfileAccessBusyError(mode)
    throw error
  }
  return { profileRoot, file, assertHeld, release() {
    if (released) return
    try { database.exec('ROLLBACK') }
    finally { database.close(); active.delete(database); released = true }
  } }
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
