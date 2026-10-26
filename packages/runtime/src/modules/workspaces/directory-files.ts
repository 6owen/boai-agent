/*
 * [INPUT]: 当前运行的真实目录授权、明确文件操作、取消信号及原副作用登记回调。
 * [OUTPUT]: 移动两侧批准/独占目标与源保留、删除链接项、外部文件固定字节受管副本；不把业务原件登记为可清理产物。
 * [POS]: 目录授权的真实文件副作用，供原Mastra工具使用；目录权限归RunDirectoryAccess。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { constants, type Stats } from 'node:fs'
import { lstat, open, readlink, rmdir, symlink, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { EngineContext } from '../../contracts'
import type { RunDirectoryAccess } from './directory-run'
import { assertTaskPathAccess, MAX_FILE_BYTES, RESERVED_SYSTEM_FILES, withFileMutationLocks, workspaceTarget } from './file-access'
import { fileContentHash } from './file-editing'

type MutationContext = Pick<EngineContext, 'signal' | 'beforeEffect' | 'afterEffect'> & { directoryAccess: RunDirectoryAccess }
const sameEntry = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
const sameBytes = (a: Stats, b: Stats) => sameEntry(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs

export async function deleteBusinessEntry(context: MutationContext, value: string) {
  const target = await context.directoryAccess.authorize(value, 'delete-entry', `删除文件 ${value}`, context.signal)
  return withFileMutationLocks([target.path], async () => {
    await context.directoryAccess.verifyTarget(target, context.signal)
    const original = await lstat(target.path)
    if (!original.isFile() && !original.isSymbolicLink() && !original.isDirectory()) throw new Error('只能删除普通文件、链接或空目录')
    await context.beforeEffect?.()
    await context.directoryAccess.verifyTarget(target, context.signal)
    if (!sameBytes(original, await lstat(target.path))) throw new Error('待删除文件已变化，操作未执行')
    // unlink never follows the final symlink. rmdir refuses nonempty directories.
    if (original.isDirectory()) await rmdir(target.path)
    else await unlink(target.path)
    await context.afterEffect?.()
    return { path: target.path, deleted: true, kind: original.isSymbolicLink() ? 'symlink' : original.isDirectory() ? 'empty-directory' : 'file' }
  })
}

export async function moveBusinessFile(context: MutationContext, from: string, to: string) {
  const source = await context.directoryAccess.authorize(from, 'delete-entry', `移动文件 ${from} → ${to}`, context.signal)
  const destination = await context.directoryAccess.authorize(to, 'create-entry', `移动文件 ${from} → ${to}`, context.signal)
  if (source.path === destination.path) throw new Error('源文件和目标文件相同，操作未执行')
  if (destination.exists) throw new Error('目标已存在，移动不会覆盖；请指定新的文件名')
  return withFileMutationLocks([source.path, destination.path], async () => {
    const verify = async () => { await context.directoryAccess.verifyTarget(source, context.signal); await context.directoryAccess.verifyTarget(destination, context.signal) }
    await verify()
    const original = await lstat(source.path)
    if ((!original.isFile() && !original.isSymbolicLink()) || original.nlink !== 1) throw new Error('移动工具只接受普通文件或独立符号链接；目录请使用已授权命令')
    await context.beforeEffect?.(); await verify()
    if (!sameBytes(original, await lstat(source.path))) throw new Error('源文件已变化，移动未执行')
    await workspaceTarget(destination.directory, path.relative(destination.directory, destination.path), true)
    let destinationCreated = false, createdState: Stats | undefined
    try {
      if (original.isSymbolicLink()) {
        // macOS link(2) can follow a symbolic source. Recreate the link text,
        // without opening its target, on every platform instead.
        const text = await readlink(source.path)
        if (!sameBytes(original, await lstat(source.path))) throw new Error('源链接已变化')
        await symlink(text, destination.path); destinationCreated = true
        createdState = await lstat(destination.path)
        if (!createdState.isSymbolicLink() || await readlink(destination.path) !== text) throw new Error('目标链接已变化')
      } else {
        // Copy from a verified O_NOFOLLOW descriptor on every filesystem. This
        // cannot follow a source symlink swapped in just before a path-based link.
        const input = await open(source.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try {
          if (!sameBytes(original, await input.stat())) throw new Error('源文件已变化')
          const output = await open(destination.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), original.mode & 0o777)
          destinationCreated = true
          try {
            const buffer = Buffer.alloc(64 * 1024)
            for (let offset = 0; offset < original.size;) {
              context.signal.throwIfAborted()
              const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, original.size - offset), offset)
              if (!bytesRead) throw new Error('源文件在复制时发生变化')
              for (let written = 0; written < bytesRead;) {
                const result = await output.write(buffer, written, bytesRead - written, offset + written)
                if (!result.bytesWritten) throw new Error('目标写入未取得进展')
                written += result.bytesWritten
              }
              offset += bytesRead
            }
            if (!sameBytes(original, await input.stat())) throw new Error('源文件在复制时发生变化')
            await output.chmod(original.mode & 0o777)
            await output.utimes(original.atime, original.mtime)
            createdState = await output.stat()
          } finally { await output.close() }
        } finally { await input.close() }
      }
      // A known partial result retains both entries; never silently replay it.
      await verify()
      const current = await lstat(source.path)
      if (!sameBytes(original, current)) throw new Error('源文件在移动期间变化')
      if (!createdState || !sameBytes(createdState, await lstat(destination.path))) throw new Error('目标文件在移动期间变化')
      await unlink(source.path)
    } catch (error) {
      if (!destinationCreated) throw error
      if (!context.signal.aborted) await context.afterEffect?.()
      return { from: source.path, to: destination.path, moved: false, destinationCreated: true, sourceRetained: true, reason: error instanceof Error ? error.message : '未能核对源文件', instruction: '目标已经创建；保留源文件。请核对两处实际状态，不要自动重试移动。' }
    }
    await context.afterEffect?.()
    return { from: source.path, to: destination.path, moved: true, destinationCreated: true, sourceRetained: false }
  })
}

/** Copy immutable bytes into this run; only this managed copy may become Artifact.sourcePath. */
export async function stageBusinessArtifact(context: EngineContext, value: string, name?: string) {
  if (!context.directoryAccess || !context.workspace) throw new Error('当前运行缺少目录访问或工作区')
  const target = await context.directoryAccess.authorize(value, 'read', `交付文件 ${value}`, context.signal)
  const filename = name ?? path.basename(target.path)
  if (!filename || filename === '.' || filename === '..' || /[\\/:\x00-\x1f\x7f]/u.test(filename) || RESERVED_SYSTEM_FILES.has(filename.toUpperCase())) throw new Error('无效的交付文件名')
  await context.directoryAccess.verifyTarget(target, context.signal)
  const input = await open(target.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let bytes: Buffer
  try {
    const before = await input.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size > 20 * MAX_FILE_BYTES) throw new Error('交付文件必须是最多20MiB的普通文件')
    const buffer = Buffer.alloc(before.size + 1), { bytesRead } = await input.read(buffer, 0, buffer.length, 0)
    if (bytesRead !== before.size || !sameBytes(before, await input.stat()) || !sameBytes(before, await lstat(target.path))) throw new Error('交付原件正在变化，请完成写入后再交付')
    bytes = buffer.subarray(0, bytesRead)
    await context.directoryAccess.verifyTarget(target, context.signal)
  } finally { await input.close() }
  const relative = `runs/${context.runId}/deliveries/${randomUUID()}/${filename}`
  const candidate = path.resolve(context.workspace.root, relative)
  await assertTaskPathAccess(context, candidate, 'write')
  await context.beforeEffect?.(); await context.directoryAccess.verifyTarget(target, context.signal)
  const destination = await workspaceTarget(context.workspace.root, relative, true)
  await assertTaskPathAccess(context, destination, 'write')
  context.signal.throwIfAborted()
  const output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
  try { await output.writeFile(bytes) } finally { await output.close() }
  context.signal.throwIfAborted()
  return { source: `self:/${relative}`, contentHash: fileContentHash(bytes), originalName: filename }
}
