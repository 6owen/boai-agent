/*
 * [OUTPUT]: 宿主执行与工具批准归 authorization；旧命令授权沿原事务与配置撤销。
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Durable Agent/Session.steer、Workspace 文件工具、LocalSandbox 进程和原生 Trace；授权及发布保留业务适配。
 * [INPUT]: BOAI logical paths, frozen source readers and current employee directory grants.
 * [OUTPUT]: Authorized LocalFilesystem provider for official Workspace tools.
 * [POS]: Business path/permission adapter; Mastra owns file tools, editing, read tracking and search.
 * [PROTOCOL]: Changes update this Header and mastra/.folder.md.
 */
import path from 'node:path'
import { LocalFilesystem, type WorkspaceFilesystem } from '@mastra/core/workspace'
import { FileNotFoundError } from '@mastra/core/workspace'
import type { EngineContext } from '../../contracts'
import { assertTaskPathAccess, taskPathAllowed, workspaceTarget, RESERVED_SYSTEM_FILES } from '../../modules/workspaces/file-access'
import { assertDirectoryTargetCurrent, type DirectoryTarget } from '../../modules/workspaces/directory-access'
import { authorizeExecution } from '../../modules/authorization/execution'

type Location = { root: string; relative: string; mount: string; business?: DirectoryTarget }
export function employeeFilesystem(context: EngineContext, root: string, locate: (file: string, write?: boolean) => Promise<Location>): WorkspaceFilesystem {
  const resolve = async (file: string, operation: 'read' | 'list' | 'write') => {
    context.signal.throwIfAborted()
    const location = await locate(file, operation === 'write')
    if (location.business) await assertDirectoryTargetCurrent(location.business)
    const target = path.resolve(location.root, location.relative)
    await assertTaskPathAccess(context, target, operation)
    if (!location.business) {
      try { await workspaceTarget(location.root, location.relative) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    return { ...location, target, fs: new LocalFilesystem({ basePath: location.root, contained: true }) }
  }
  const denied = async (): Promise<never> => { throw new Error('此操作请使用已授权的业务移动、删除或发布工具') }
  const filesystem: WorkspaceFilesystem = {
    id: `employee:${context.agent.id}:${context.conversation.id}`, name: 'EmployeeFilesystem', provider: 'boai-local', basePath: root, status: 'ready',
    getInstructions: () => 'Use self:/work/, self:/runs/ or authorized shared:/ files. Absolute business paths require directory permission. Reading uses the official line-based offset/limit; edits use old_string/new_string. System files and other sessions are inaccessible.',
    async readFile(file, options) {
      // Workspace probes optional gitignore metadata outside the logical namespace.
      if (file === '.gitignore' || file === '/.gitignore') throw new FileNotFoundError(file)
      const location = await resolve(file, 'read')
      const frozenText = options?.encoding && !context.readTaskBytes ? await context.readTaskFile?.(location.target) : undefined
      if (frozenText) { context.signal.throwIfAborted(); return frozenText.content }
      const verified = await context.readTaskBytes?.(location.target)
      const result = verified ? Buffer.from(verified.bytes) : await location.fs.readFile(location.relative)
      if (location.business) await resolve(file, 'read')
      context.signal.throwIfAborted()
      const bytes = Buffer.isBuffer(result) ? result : Buffer.from(result)
      if (options?.encoding === 'utf8' || options?.encoding === 'utf-8') {
        if (bytes.includes(0)) throw new Error('File is not UTF-8 text')
        try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
        catch { throw new Error('File is not UTF-8 text') }
      }
      return options?.encoding ? bytes.toString(options.encoding) : bytes
    },
    async writeFile(file, content, options) {
      const location = await resolve(file, 'write')
      if (!location.business) await authorizeExecution(context, { kind: 'file', description: `写入文件 ${file}` })
      await context.beforeEffect?.()
      await resolve(file, 'write')
      // The SDK carries the last-read mtime through approval into this write.
      await location.fs.writeFile(location.relative, content, { recursive: true, ...options })
      await context.afterEffect?.()
    },
    async stat(file) {
      try {
        const location = await resolve(file, 'read')
        return await location.fs.stat(location.relative)
      } catch (error) {
        // Directory authorization resolves existing read targets before the SDK
        // probes a new write target. Translate only absence; never permission errors.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FileNotFoundError(file)
        throw error
      }
    },
    async exists(file) {
      try { await filesystem.stat(file); return true }
      catch (error) { if (error instanceof FileNotFoundError) return false; throw error }
    },
    async readdir(file, options) {
      const location = await resolve(file, 'list')
      const entries = location.mount === 'self' && location.relative === '.'
        ? [{ name: 'work', type: 'directory' as const }, { name: 'runs', type: 'directory' as const }]
        : await location.fs.readdir(location.relative, { ...options, recursive: false })
      const authorized = []
      for (const entry of entries) {
        if (entry.isSymlink || !location.business && RESERVED_SYSTEM_FILES.has(entry.name.toUpperCase())) continue
        if (await taskPathAllowed(context, path.join(location.target, entry.name), entry.type === 'directory' ? 'list' : 'read')) authorized.push(entry)
      }
      await resolve(file, 'list')
      return authorized
    },
    appendFile: denied, deleteFile: denied, copyFile: denied, moveFile: denied, mkdir: denied, rmdir: denied,
  }
  return filesystem
}
