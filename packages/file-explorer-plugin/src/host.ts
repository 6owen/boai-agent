/*
 * [OUTPUT]: 2026-10-29 文件浏览器目录边界及真实回归覆盖；验证结果归第19组18。
 * [INPUT]: Runtime-validated employee root, relative path and existing resource path constraints.
 * [OUTPUT]: Bounded non-recursive directory pages and explicitly opened validated workspace targets.
 * [POS]: Official file explorer host; path validation and authority supplied by BOAI.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { lstat, open, opendir, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { z } from 'zod'
import { previewFile, previewBinaryFile } from '@boai/shared/domain/file-preview'
import type { FileExplorerScope, WorkspaceDirectoryPage, WorkspaceDirectoryEntry, WorkspaceFilePreview } from '@boai/shared/ipc/workspace-files'

export const workspaceScopeSchema = z.object({ employeeId: z.string().min(1).max(200), conversationId: z.string().min(1).max(200).optional() }).strict()
const explorerScopeSchema = workspaceScopeSchema.extend({ directory: z.string().min(1).max(4096).optional() })
const previewSchema = z.object({ scope: explorerScopeSchema, relativePath: z.string().min(1).max(4096) }).strict()
const pathSchema = z.string().max(4096).default('')
const querySchema = z.object({ scope: explorerScopeSchema, relativePath: pathSchema, cursor: z.string().max(2000).optional() }).strict()
const openSchema = z.object({ scope: explorerScopeSchema, relativePath: pathSchema, action: z.enum(['open', 'reveal']).default('open'), applicationId: z.string().min(1).max(100).optional() }).strict()
const PAGE_SIZE = 100
const MAX_DIRECTORY_ENTRIES = 20000
const portable = (path: string) => path.split(sep).join('/')
const stamp = (root: string, directory: string, info: Stats, names: string[]) => createHash('sha256').update(JSON.stringify([root, directory, info.dev, info.ino, info.mtimeMs, names])).digest('hex')

export class WorkspaceFileService {
  constructor(private resolveScope: (scope: FileExplorerScope) => Promise<string>, private opener: (path: string, action: 'open' | 'reveal', applicationId?: string) => Promise<void>, private validatePath: (roots: string[], path: string) => Promise<string>, private enabled: () => boolean = () => true) {}

  private assertEnabled() { if (!this.enabled()) throw new Error('文件浏览器插件已停用') }

  private async target(scope: FileExplorerScope, path: string) {
    this.assertEnabled()
    if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) throw new Error('请选择工作区内的相对路径')
    const root = await this.resolveScope(scope)
    // Reuse the original resource validator, including rejection of every symlink component.
    const target = await this.validatePath([root], join(root, path))
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
    this.assertEnabled()
    // Do not publish a late page after its employee/conversation disappeared.
    if (await realpath(await this.resolveScope(value.scope)) !== root) throw new Error('工作区已变化，请重新打开')
    this.assertEnabled()
    return { rootPath: root, path: target, relativePath: portable(relative(root, target)), ...(target !== root ? { parentPath: portable(relative(root, dirname(target))) } : {}), entries: page, ...(offset + PAGE_SIZE < entries.length ? { nextCursor: Buffer.from(JSON.stringify({ version, offset: offset + PAGE_SIZE })).toString('base64url') } : {}) }
  }

  async preview(input: unknown): Promise<WorkspaceFilePreview> {
    const value = previewSchema.parse(input), { root, target } = await this.target(value.scope, value.relativePath)
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile()) throw new Error('仅支持预览普通文件')
      if (before.size > 20 * 1024 * 1024) {
        await this.resolveScope(value.scope); this.assertEnabled()
        return { kind: 'unsupported', text: '', reason: '文件超过 20 MiB，请使用外部打开' }
      }
      const bytes = Buffer.alloc(before.size + 1)
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      const after = await handle.stat()
      const current = await stat(await this.validatePath([root], target))
      if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || current.ino !== before.ino || current.dev !== before.dev || current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) throw new Error('文件已变化，请重新预览')
      if (await realpath(await this.resolveScope(value.scope)) !== root) throw new Error('目录已变化，请重新打开')
      this.assertEnabled()
      const content = bytes.subarray(0, bytesRead)
      const mime = content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
        : content[0] === 255 && content[1] === 216 && content[2] === 255 ? 'image/jpeg'
        : /^GIF8[79]a/.test(content.subarray(0, 6).toString('ascii')) ? 'image/gif'
        : content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : undefined
      if (mime) return { kind: 'image', url: `data:${mime};base64,${content.toString('base64')}` }
      return previewBinaryFile(value.relativePath, content) ?? previewFile(value.relativePath, content)
    } finally { await handle.close() }
  }

  async open(input: unknown) {
    const value = openSchema.parse(input), { root, target } = await this.target(value.scope, value.relativePath)
    const info = await stat(target)
    if (!info.isDirectory() && !info.isFile()) throw new Error('仅支持打开普通文件和文件夹')
    if (await realpath(await this.resolveScope(value.scope)) !== root) throw new Error('工作区已变化，请重新打开')
    await this.validatePath([root], target)
    this.assertEnabled()
    await this.opener(target, value.action, value.applicationId)
  }
}
