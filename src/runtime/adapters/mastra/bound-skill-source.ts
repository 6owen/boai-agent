import { readVersionedText, type ResourceVersion } from '../../modules/workspaces/environment-plan'
import path from 'node:path'
import { lstat, readdir } from 'node:fs/promises'
import type { SkillSource } from '@mastra/core/workspace'
import { restrictedPath } from '../../modules/workspaces/file-access'

/** Read-only, allowlisted disk source used by Mastra's native skill discovery and tools. */
export class BoundSkillSource implements SkillSource {
  constructor(private readonly roots: string[], private readonly versions: ResourceVersion[], private readonly signal: AbortSignal) {}
  private inVersion(file: string) { return this.versions.some(version => version.files.some(entry => entry.path === file || entry.path.startsWith(file + path.sep))) }
  async realpath(file: string) {
    this.signal.throwIfAborted()
    const safe = await restrictedPath(this.roots, file)
    if (!this.inVersion(safe)) throw new Error('文件不属于本次运行授权的资源版本')
    this.signal.throwIfAborted()
    return safe
  }
  async exists(file: string) { try { await this.realpath(file); return true } catch { return false } }
  async stat(file: string) {
    const safe = await this.realpath(file)
    const stat = await lstat(safe)
    return { name: path.basename(safe), type: stat.isDirectory() ? 'directory' as const : 'file' as const, size: stat.size, createdAt: stat.birthtime, modifiedAt: stat.mtime }
  }
  async readFile(file: string) { const text = await readVersionedText(await this.realpath(file), this.versions); this.signal.throwIfAborted(); return text }
  async readdir(file: string) {
    const directory = await this.realpath(file)
    const entries = await readdir(directory, { withFileTypes: true })
    this.signal.throwIfAborted()
    return entries.filter(entry => !entry.isSymbolicLink() && this.inVersion(path.join(directory, entry.name)) && (entry.isDirectory() || entry.isFile())).slice(0, 256).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' as const : 'file' as const }))
  }
}

