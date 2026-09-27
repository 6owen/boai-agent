import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Artifact, SessionWorkspace } from '../../../shared/domain'
import type { EngineContext } from '../../contracts'
export const MAX_FILE_BYTES = 1024 * 1024
const check = (signal: AbortSignal) => signal.throwIfAborted()

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
export async function boundedRead(file: string): Promise<string> {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Text file must be at most 1 MiB')
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_FILE_BYTES + 1))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > MAX_FILE_BYTES) throw new Error('Text file must be at most 1 MiB')
    return bytes.subarray(0, bytesRead).toString('utf8')
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
        await mkdir(current)
        if ((await lstat(current)).isSymbolicLink() || !contained(rootReal, await realpath(current))) throw new Error('Unsafe workspace directory')
      }
    }
  }
  return target
}

export async function writeWorkspaceFile(root: string, relative: string, content: string) {
  const target = await workspaceTarget(root, relative, true)
  // Do not use O_TRUNC before checking the opened file: reject hard links and final symlinks.
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink > 1) throw new Error('Only ordinary workspace files may be written')
    await workspaceTarget(root, relative)
    await handle.truncate(0)
    await handle.writeFile(content, 'utf8')
  } finally { await handle.close() }
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
export async function publishArtifact(context: Pick<EngineContext, 'onArtifact' | 'signal' | 'agent' | 'runId'>, workspace: SessionWorkspace, source: string, name?: string) {
  if (!context.onArtifact) throw new Error('Artifact publication is not configured by the host')
  const location = logicalPath(workspace, source)
  if (location.mount !== 'self') throw new Error('Only this employee’s current-session files may be published')
  const sourcePath = await workspaceTarget(location.root, location.relative)
  const filename = name ?? path.basename(sourcePath)
  if (!filename || filename === '.' || filename === '..' || /[\\/:\0]/.test(filename) || RESERVED_SYSTEM_FILES.has(filename.toUpperCase())) throw new Error('Invalid artifact filename')
  const id = randomUUID()
  const destination = path.join('artifacts', `${id}-${filename}`)
  const target = await workspaceTarget(workspace.sharedPath, destination, true)
  const input = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let created = false
  try {
    const stat = await input.stat()
    if (!stat.isFile() || stat.nlink > 1 || stat.size > 20 * MAX_FILE_BYTES) throw new Error('Published artifact must be an ordinary file of at most 20 MiB')
    const bytes = Buffer.alloc(stat.size + 1)
    const { bytesRead } = await input.read(bytes, 0, bytes.length, 0)
    if (bytesRead > stat.size) throw new Error('Artifact changed while publishing; retry after it finishes writing')
    check(context.signal)
    const output = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    created = true
    try { await output.writeFile(bytes.subarray(0, bytesRead)) } finally { await output.close() }
    check(context.signal)
    const artifact: Artifact = { id, name: filename, path: target, size: bytesRead, ownerAgentId: context.agent.id, runId: context.runId, sourcePath, publishedAt: new Date().toISOString() }
    await context.onArtifact(artifact)
    return { artifact, sharedPath: `shared:/${destination.split(path.sep).join('/')}` }
  } catch (error) {
    if (created) await rm(target, { force: true })
    throw error
  } finally { await input.close() }
}

