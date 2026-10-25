/*
 * [INPUT]: Runtime-validated employee root, relative path and existing resource path constraints.
 * [OUTPUT]: Bounded non-recursive directory pages and explicitly opened validated workspace targets.
 * [POS]: Main-process workspace file browsing; separate from delivered conversation files.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { lstat, opendir, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { z } from 'zod'
import { restrictedPath } from '../runtime/modules/workspaces/file-access'
import type { WorkspaceFileScope, WorkspaceDirectoryPage, WorkspaceDirectoryEntry } from '../shared/ipc/workspace-files'

export const workspaceScopeSchema = z.object({ employeeId: z.string().min(1).max(200), conversationId: z.string().min(1).max(200).optional() }).strict()
const pathSchema = z.string().max(4096).default('')
const querySchema = z.object({ scope: workspaceScopeSchema, relativePath: pathSchema, cursor: z.string().max(2000).optional() }).strict()
const openSchema = z.object({ scope: workspaceScopeSchema, relativePath: pathSchema, action: z.enum(['open', 'reveal']).default('open'), applicationId: z.string().min(1).max(100).optional() }).strict()
const PAGE_SIZE = 100
const MAX_DIRECTORY_ENTRIES = 20000
const portable = (path: string) => path.split(sep).join('/')
const stamp = (root: string, directory: string, info: Stats, names: string[]) => createHash('sha256').update(JSON.stringify([root, directory, info.dev, info.ino, info.mtimeMs, names])).digest('hex')

export class WorkspaceFileService {
  constructor(private resolveScope: (scope: WorkspaceFileScope) => Promise<string>, private opener: (path: string, action: 'open' | 'reveal', applicationId?: string) => Promise<void>) {}

  private async target(scope: WorkspaceFileScope, path: string) {
    if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) throw new Error('请选择工作区内的相对路径')
    const root = await this.resolveScope(scope)
    // Reuse the original resource validator, including rejection of every symlink component.
    const target = await restrictedPath([root], join(root, path))
    return { root: await realpath(root), target }
  }

  async list(input: unknown): Promise<WorkspaceDirectoryPage> {
    const value = querySchema.parse(input), { root, target } = await this.target(value.scope, value.relativePath)
    const before = await stat(target)
    if (!before.isDirectory()) throw new Error('当前目标不是文件夹')
    const entries: { name: string; kind: WorkspaceDirectoryEntry['kind'] }[] = []
    const directory = await opendir(target)
    for await (const entry of directory) {
      if (entries.length >= MAX_DIRECTORY_ENTRIES) throw new Error('此目录超过 20,000 项，请在系统文件管理器中打开')
      entries.push({ name: entry.name, kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' })
    }
    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const version = stamp(root, target, before, entries.map(entry => entry.name)), after = await stat(target)
    if (before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('目录已变化，请刷新后重试')
    let offset = 0
    if (value.cursor) {
      let cursor: { version: string; offset: number }
      try { cursor = z.object({ version: z.string(), offset: z.number().int().nonnegative().max(MAX_DIRECTORY_ENTRIES) }).strict().parse(JSON.parse(Buffer.from(value.cursor, 'base64url').toString())) }
      catch { throw new Error('目录分页已失效，请刷新') }
      if (cursor.version !== version) throw new Error('目录已变化，请刷新后继续浏览')
      offset = cursor.offset
    }
    const page: WorkspaceDirectoryEntry[] = []
    for (const entry of entries.slice(offset, offset + PAGE_SIZE)) {
      // lstat reports a link without following it or reading its target.
      const info = await lstat(join(target, entry.name)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
      if (!info) throw new Error('目录已变化，请刷新后重试')
      page.push({ ...entry, relativePath: portable(relative(root, join(target, entry.name))), size: info.size, modifiedAt: info.mtime.toISOString() })
    }
    // Do not publish a late page after its employee/conversation disappeared.
    if (await realpath(await this.resolveScope(value.scope)) !== root) throw new Error('工作区已变化，请重新打开')
    return { rootPath: root, path: target, relativePath: portable(relative(root, target)), ...(target !== root ? { parentPath: portable(relative(root, dirname(target))) } : {}), entries: page, ...(offset + PAGE_SIZE < entries.length ? { nextCursor: Buffer.from(JSON.stringify({ version, offset: offset + PAGE_SIZE })).toString('base64url') } : {}) }
  }

  async open(input: unknown) {
    const value = openSchema.parse(input), { root, target } = await this.target(value.scope, value.relativePath)
    const info = await stat(target)
    if (!info.isDirectory() && !info.isFile()) throw new Error('仅支持打开普通文件和文件夹')
    if (await realpath(await this.resolveScope(value.scope)) !== root) throw new Error('工作区已变化，请重新打开')
    await restrictedPath([root], target)
    await this.opener(target, value.action, value.applicationId)
  }
}
