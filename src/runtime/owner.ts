/*
 * [INPUT]: A canonical local profile and its sole desktop/headless runtime process.
 * [OUTPUT]: An OS-backed exclusive SQLite transaction and informational process identity.
 * [POS]: Runtime ownership only; no product tables, heartbeat takeover, PID killing or replay.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createClient } from '@libsql/client'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

export interface RuntimeOwnerIdentity { instanceId: string; dataPath: string; pid: number; processStartedAt: string; acquiredAt: string }
export class RuntimeOwnedError extends Error {
  constructor() { super('此数据配置已有运行服务；请连接原服务或等待其实际退出'); this.name = 'RuntimeOwnedError' }
}
async function privatePath(path: string, directory: boolean) {
  const stat = await lstat(path)
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)) throw new Error('运行服务所有权文件必须是当前用户的私有普通文件')
}
export async function acquireRuntimeOwner(input: string) {
  await mkdir(input, { recursive: true })
  const dataPath = await realpath(input), directory = join(dataPath, '.cli')
  await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  await privatePath(directory, true)
  const file = join(directory, 'owner.sqlite')
  try { const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await handle.close() }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  await privatePath(file, false)
  // Never unlink this inode. BEGIN IMMEDIATE is the authority, including across crashes/PID reuse.
  const client = createClient({ url: pathToFileURL(file).href, concurrency: 1 })
  let transaction: Awaited<ReturnType<typeof client.transaction>>
  try { await client.execute('PRAGMA busy_timeout=0'); transaction = await client.transaction('write') }
  catch (error) { client.close(); if (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes((error as { code?: string }).code ?? '')) throw new RuntimeOwnedError(); throw error }
  const identity: RuntimeOwnerIdentity = { instanceId: randomUUID(), dataPath, pid: process.pid, processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), acquiredAt: new Date().toISOString() }
  const path = join(directory, 'owner.json'), temporary = join(directory, `owner-${identity.instanceId}.tmp`)
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify(identity)); await handle.sync() } finally { await handle.close() }
    await rename(temporary, path)
  } catch (error) { await transaction.rollback(); transaction.close(); client.close(); await rm(temporary, { force: true }); throw error }
  let released: Promise<void> | undefined
  return { identity, release() {
    return released ??= (async () => {
      try { if (JSON.parse(await readFile(path, 'utf8')).instanceId === identity.instanceId) await rm(path) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      // Call only after AppService and all adapters have drained. Metadata alone never releases ownership.
      await transaction.rollback(); transaction.close(); client.close()
    })()
  } }
}
