/*
 * [INPUT]: Explicit BOAI service data directory and an already exclusive service owner.
 * [OUTPUT]: Separate private CLI/desktop discovery and logs; reject links/foreign or permissive files.
 * [POS]: CLI discovery only; metadata does not itself prove process liveness or confer a service lock.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { PROTOCOL_VERSION } from '@boai/shared/cli/protocol'

const metadata = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), workspaceId: z.string().min(1), serverId: z.string().uuid(), url: z.string().url(), token: z.string().min(32).max(4096), pid: z.number().int().positive(), version: z.string().min(1) }).strict()
export type LocalConnection = z.infer<typeof metadata>
export async function profileIdentity(dataPath: string) { return `boai-${createHash('sha256').update(await realpath(dataPath)).digest('hex').slice(0, 32)}` }
async function checkPrivate(path: string, directory: boolean) {
  const stat = await lstat(path)
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || (!directory && stat.size > 8192)) throw new Error('CLI 连接文件类型无效')
  if (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new Error('CLI 连接文件必须仅供当前用户访问')
}
export async function readLocalConnection(dataPath: string, filename: 'connection.json' | 'desktop.json' = 'connection.json'): Promise<LocalConnection> {
  const directory = join(await realpath(dataPath), '.cli')
  await checkPrivate(directory, true)
  const path = join(directory, filename); await checkPrivate(path, false)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let value: LocalConnection
  try { value = metadata.parse(JSON.parse(await file.readFile('utf8'))) } finally { await file.close() }
  const endpoint = new URL(value.url)
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('本机 CLI 连接地址无效')
  if (value.workspaceId !== await profileIdentity(dataPath)) throw new Error('CLI 连接文件不属于此数据配置')
  return value
}
export async function publishLocalConnection(dataPath: string, value: LocalConnection, filename: 'connection.json' | 'desktop.json' = 'connection.json') {
  metadata.parse(value)
  const directory = await prepareLocalDirectory(dataPath)
  const path = join(directory, filename), temporary = join(directory, `connection-${randomUUID()}.tmp`)
  const file = await open(temporary, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(value)); await file.sync() } finally { await file.close() }
  try { await rename(temporary, path) } finally { await rm(temporary, { force: true }) }
  return async () => {
    // Old shutdown must never remove the next owner's connection record.
    try { if (JSON.parse(await readFile(path, 'utf8')).serverId === value.serverId) await rm(path) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
export async function prepareLocalDirectory(dataPath: string) {
  await mkdir(dataPath, { recursive: true })
  const directory = join(await realpath(dataPath), '.cli')
  await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  await checkPrivate(directory, true)
  return directory
}
