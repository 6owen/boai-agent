/*
 * [OUTPUT]: 受管图片字节写入复用同一目录/链接/不存在基线与锁，不增加任意文件权限。
 * [OUTPUT]: 写文件与双路径移动共用原子预留的文件锁，避免并发覆盖与锁顺序死锁；发布合同保持。
 * [OUTPUT]: 文件写入在创建父目录、写锁内及截断前复核可选业务目录目标/授权；原材料hash和逻辑路径保持。
 * [OUTPUT]: 员工文本工具可要求严格 UTF-8 解码，技能预览保留原二进制识别；可选 hash/不存在基线在同路径写入锁内、截断前核对。
 * [OUTPUT]: 复制共享原件前等待宿主持久准备记录，准备失败不创建原件；完成登记后才返回发布结果。
 * [INPUT]: 当前员工会话工作区、宿主材料来源授权门禁与真实文件请求。
 * [OUTPUT]: 首次共享目录并发创建仅接受EEXIST后核验的真实目录，链接/文件/其他IO故障仍拒绝；发布真实字节 hash、明确宿主修订请求，失败只删除本次未外改原件；拒绝路径/链接越界、按当前来源授权核对内建文件访问，并仅在私有源和共享目标均获准时发布真实产物。
 * [POS]: runtime/modules/workspaces 的逻辑路径、授权检查和真实文件副作用边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Artifact, SessionWorkspace } from '../../../shared/domain'
import type { EngineContext } from '../../contracts'
import { decodeWorkspaceText, fileContentHash } from './file-editing'
export const MAX_FILE_BYTES = 1024 * 1024
const check = (signal: AbortSignal) => signal.throwIfAborted()

type TaskFileContext = Pick<EngineContext, 'signal' | 'materialRefs' | 'canAccessTaskPath'>
type TaskPathOperation = 'read' | 'list' | 'write' | 'publish'

export async function taskPathAllowed(context: TaskFileContext, target: string, operation: TaskPathOperation): Promise<boolean> {
  check(context.signal)
  if (!context.canAccessTaskPath && context.materialRefs?.length) throw new Error('Material-backed file access requires the host authorization gate')
  const allowed = context.canAccessTaskPath ? await context.canAccessTaskPath(path.resolve(target), operation) : true
  check(context.signal)
  return allowed === true
}

export async function assertTaskPathAccess(context: TaskFileContext, target: string, operation: TaskPathOperation) {
  if (!await taskPathAllowed(context, target, operation)) throw new Error(`Task file ${operation} access is not authorized`)
}

export function contained(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/** Reject symlinks at every component, including links that currently point inside the root. */
export async function restrictedPath(roots: string[], target: string): Promise<string> {
  const candidate = path.resolve(target)
  const root = roots.find(value => contained(value, candidate))
  if (!root) throw new Error('Path is outside the bound resource')
  let current = root
  if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not permitted')
  for (const part of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not permitted')
  }
  const canonical = await realpath(candidate)
  if (!contained(await realpath(root), canonical)) throw new Error('Resource path escaped its root')
  return canonical
}
export async function boundedRead(file: string, options: { strictUtf8?: boolean } = {}): Promise<string> {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Text file must be at most 1 MiB')
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_FILE_BYTES + 1))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > MAX_FILE_BYTES) throw new Error('Text file must be at most 1 MiB')
    const content = bytes.subarray(0, bytesRead)
    return options.strictUtf8 ? decodeWorkspaceText(content) : content.toString('utf8')
  } finally { await handle.close() }
}

export async function workspaceTarget(root: string, relative: string, createParents = false) {
  const target = path.resolve(root, workspaceRelative(relative))
  if (!contained(root, target)) throw new Error('Path is outside the conversation workspace')
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Workspace roots cannot be symbolic links')
  const rootReal = await realpath(root)
  let current = root
  const parts = path.relative(root, target).split(path.sep).filter(Boolean)
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) throw new Error('Symbolic links are not permitted in workspace tools')
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error('Parent must be a directory')
      if (!contained(rootReal, await realpath(current))) throw new Error('Workspace path escaped its root')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (!createParents) throw error
      if (index < parts.length - 1) {
        try { await mkdir(current) } catch (creationError) {
          // Another employee may have created this shared parent after our lstat.
          if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError
        }
        const created = await lstat(current)
        if (created.isSymbolicLink() || !created.isDirectory() || !contained(rootReal, await realpath(current))) throw new Error('Unsafe workspace directory')
      }
    }
  }
  return target
}

const workspaceWrites = new Map<string, Promise<unknown>>()
/** Reserve every path together so two-file moves and single-file writes cannot deadlock. */
export async function withFileMutationLocks<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
  const keys = [...new Set(paths.map(value => path.resolve(value)))].sort()
  const previous = Promise.all(keys.map(key => workspaceWrites.get(key)).filter(Boolean)).catch(() => undefined)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), reservation = previous.then(() => gate)
  for (const key of keys) workspaceWrites.set(key, reservation)
  await previous
  try { return await operation() }
  finally { release(); for (const key of keys) if (workspaceWrites.get(key) === reservation) workspaceWrites.delete(key) }
}
export async function writeWorkspaceFile(root: string, relative: string, content: string | Uint8Array, expectedHash?: string | null, signal?: AbortSignal, verify?: () => Promise<void>) {
  signal?.throwIfAborted()
  await verify?.()
  const target = await workspaceTarget(root, relative, true)
  const key = path.join(await realpath(path.dirname(target)), path.basename(target))
  await withFileMutationLocks([key], write)

  async function write() {
    signal?.throwIfAborted()
    await verify?.()
    await workspaceTarget(root, relative, true)
    // Do not use O_TRUNC before checking the opened file: reject hard links and final symlinks.
    const flags = expectedHash === undefined ? constants.O_WRONLY | constants.O_CREAT
      : expectedHash === null ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL : constants.O_RDWR
    const handle = await open(target, flags | (constants.O_NOFOLLOW ?? 0), 0o600)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.nlink > 1) throw new Error('Only ordinary workspace files may be written')
      await workspaceTarget(root, relative)
      if (typeof expectedHash === 'string') {
        if (stat.size > MAX_FILE_BYTES) throw new Error('File changed before writing. Re-read it; the file was not modified.')
        const current = Buffer.alloc(MAX_FILE_BYTES + 1)
        const { bytesRead } = await handle.read(current, 0, current.length, 0)
        const entry = await lstat(target)
        if (entry.ino !== stat.ino || entry.dev !== stat.dev || entry.nlink > 1 || entry.size !== bytesRead || entry.mtimeMs !== stat.mtimeMs || entry.ctimeMs !== stat.ctimeMs || bytesRead > MAX_FILE_BYTES || fileContentHash(current.subarray(0, bytesRead)) !== expectedHash) throw new Error('File changed before writing. Re-read it; the file was not modified.')
      }
      const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
      // Explicit positions preserve the same write behavior with or without the guarded read.
      signal?.throwIfAborted()
      await verify?.()
      await handle.truncate(0)
      for (let offset = 0; offset < bytes.length;) {
        const result = await handle.write(bytes, offset, bytes.length - offset, offset)
        if (!result.bytesWritten) throw new Error('Workspace write made no progress')
        offset += result.bytesWritten
      }
    } finally { await handle.close() }
  }
}

export function workspaceRelative(value: string) {
  if (path.isAbsolute(value) || value.includes('\0') || value.replaceAll('\\', '/').split('/').includes('..')) throw new Error('Use a relative path inside the conversation workspace')
  return value || '.'
}

export const RESERVED_SYSTEM_FILES = new Set(['AGENTS.MD', 'SOUL.MD', 'IDENTITY.MD', 'USER.MD', 'MEMORY.MD', 'TOOLS.MD', 'HEARTBEAT.MD', 'BOOT.MD', 'BOOTSTRAP.MD'])
export function logicalPath(workspace: SessionWorkspace, value: string, write = false) {
  const match = /^(self|shared):\/(.*)$/.exec(value)
  if (!match) throw new Error('Use self:/work/…, self:/runs/…, or shared:/… logical paths')
  const [, mount, raw] = match
  if (raw.includes('\\')) throw new Error('Backslashes are not permitted in logical paths')
  const relative = workspaceRelative(raw)
  const parts = relative.split('/').filter(part => part && part !== '.')
  if (parts.some(part => RESERVED_SYSTEM_FILES.has(part.toUpperCase()))) throw new Error('System files are managed by the host, not workspace tools')
  if (mount === 'self' && parts.length && !['work', 'runs'].includes(parts[0])) throw new Error('self:/ exposes only this employee’s current-session work/ and runs/')
  if (write && mount === 'shared') throw new Error('Shared files are read-only; use publish_artifact to publish a self:/ result')
  if (write && parts.length < 2) throw new Error('Write a file under self:/work/ or self:/runs/')
  return { root: mount === 'self' ? workspace.root : workspace.sharedPath, relative, mount }
}
export async function initializeWorkspace(context: Pick<EngineContext, 'workspace' | 'runId'>) {
  const workspace = context.workspace
  if (!workspace) throw new Error('任务缺少当前员工的会话工作区')
  const root = path.resolve(workspace.root)
  const normalized = { root, workPath: path.resolve(workspace.workPath), runPath: path.resolve(workspace.runPath), sharedPath: path.resolve(workspace.sharedPath) }
  if (path.basename(context.runId) !== context.runId || !context.runId || normalized.workPath !== path.join(root, 'work') || normalized.runPath !== path.join(root, 'runs', context.runId)) throw new Error('Invalid employee session workspace layout')
  if (contained(root, normalized.sharedPath) || contained(normalized.sharedPath, root)) throw new Error('Private and shared workspace roots must be separate')
  await mkdir(root, { recursive: true })
  // Validate the parent before creating a child: never create through an existing symlink.
  await workspaceTarget(root, 'work/.probe', true)
  await workspaceTarget(root, `runs/${context.runId}/.probe`, true)
  await mkdir(normalized.sharedPath, { recursive: true })
  await restrictedPath([root], normalized.runPath)
  if ((await lstat(normalized.sharedPath)).isSymbolicLink()) throw new Error('Shared workspace cannot be a symbolic link')
  return normalized
}
export async function publishArtifact(context: Pick<EngineContext, 'onArtifactPreparing' | 'onArtifact' | 'signal' | 'agent' | 'runId' | 'materialRefs' | 'canAccessTaskPath' | 'artifactRevision'>, workspace: SessionWorkspace, source: string, name?: string, revisionRequestId?: string) {
  if (!context.onArtifact) throw new Error('Artifact publication is not configured by the host')
  if (revisionRequestId && context.artifactRevision?.id !== revisionRequestId) throw new Error('Artifact revision publication is not authorized by the host')
  const location = logicalPath(workspace, source)
  if (location.mount !== 'self') throw new Error('Only this employee’s current-session files may be published')
  await assertTaskPathAccess(context, path.resolve(location.root, location.relative), 'publish')
  const sourcePath = await workspaceTarget(location.root, location.relative)
  const filename = name ?? path.basename(sourcePath)
  if (!filename || filename === '.' || filename === '..' || /[\\/:\0]/.test(filename) || RESERVED_SYSTEM_FILES.has(filename.toUpperCase())) throw new Error('Invalid artifact filename')
  const id = randomUUID()
  const destination = path.join('artifacts', `${id}-${filename}`)
  await assertTaskPathAccess(context, path.resolve(workspace.sharedPath, destination), 'publish')
  const target = await workspaceTarget(workspace.sharedPath, destination, true)
  const input = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let created = false, contentHash: string | undefined
  try {
    const stat = await input.stat()
    if (!stat.isFile() || stat.nlink > 1 || stat.size > 20 * MAX_FILE_BYTES) throw new Error('Published artifact must be an ordinary file of at most 20 MiB')
    const bytes = Buffer.alloc(stat.size + 1)
    const { bytesRead } = await input.read(bytes, 0, bytes.length, 0)
    const after = await input.stat()
    if (bytesRead !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Artifact changed while publishing; retry after it finishes writing')
    contentHash = createHash('sha256').update(bytes.subarray(0, bytesRead)).digest('hex')
    const artifact: Artifact = { id, name: filename, path: target, size: bytesRead, ownerAgentId: context.agent.id, runId: context.runId, sourcePath, contentHash, ...(revisionRequestId ? { revisionRequestId } : {}), publishedAt: new Date().toISOString() }
    await context.onArtifactPreparing?.(artifact)
    await assertTaskPathAccess(context, sourcePath, 'publish')
    await assertTaskPathAccess(context, target, 'publish')
    const output = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    created = true
    try { await output.writeFile(bytes.subarray(0, bytesRead)) } finally { await output.close() }
    check(context.signal)
    await context.onArtifact(artifact)
    return { artifact, sharedPath: `shared:/${destination.split(path.sep).join('/')}` }
  } catch (error) {
    if (created && contentHash) {
      // A rejected publication only owns its unchanged bytes. Preserve external edits.
      try {
        await workspaceTarget(workspace.sharedPath, destination)
        const failed = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        let unchanged = false
        try {
          const state = await failed.stat()
          if (state.isFile() && state.nlink === 1 && state.size <= 20 * MAX_FILE_BYTES) {
            const current = await failed.readFile(), after = await failed.stat(), entry = await lstat(target)
            unchanged = state.ino === entry.ino && state.dev === entry.dev && state.size === after.size && state.mtimeMs === after.mtimeMs && state.ctimeMs === after.ctimeMs && createHash('sha256').update(current).digest('hex') === contentHash
          }
        } finally { await failed.close() }
        if (unchanged) await rm(target, { force: true })
      } catch { /* Missing or changed paths remain for controlled inspection. */ }
    }
    throw error
  } finally { await input.close() }
}
