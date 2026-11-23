/*
 * [INPUT]: 本机目录身份、skills CLI 的全局来源锁文件和宿主 home。
 * [OUTPUT]: 本地更新目标与同盘恢复路径、通过共用锁文件索引读取旧 CLI 的精确 GitHub 来源；仅允许 ~/.agents/skills 的普通目录，不修改插件或锁文件。
 * [POS]: resources 的本机更新文件/来源边界，复用既有扫描与更新事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { realpath } from 'node:fs/promises'
import type { SkillSource } from '@boai/shared/domain/skills'
import { restoreLibrarySource } from '../../adapters/skills/library-format'
import { workspaceTarget } from '../workspaces/file-access'
import { localSkillId, type LocalSkillCatalogService } from './local-skill-catalog'
import { readLocalSkillLock } from './local-skill-lock'

export class LocalSkillUpdateTargets {
  constructor(private readonly catalog: LocalSkillCatalogService, private readonly home = homedir()) {}
  async location(id: string, name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(name)) throw new Error('无效的本地技能目录名')
    const root = await workspaceTarget(this.home, '.agents/skills')
    const boundary = await realpath(root), target = join(boundary, name)
    if (localSkillId(target) !== id) throw new Error('只支持更新 ~/.agents/skills 中的本地技能；插件请由原安装工具更新')
    return { boundary, target }
  }
  async target(id: string) {
    const { skill } = await this.catalog.detail(id)
    if (skill.source !== 'global') throw new Error('此技能由其他工具或插件管理，请使用原安装工具更新')
    const name = basename(skill.path), paths = await this.location(id, name)
    if (await this.catalog.source(id) !== paths.target) throw new Error('技能位置已变化，请重新扫描')
    return { id, name: skill.name, description: skill.description, path: paths.target }
  }
  async paths(id: string, name: string, directory: string) {
    const { boundary, target } = await this.location(id, name)
    const root = join(boundary, `.boai-update-${directory}`)
    return { boundary, target, root, next: join(root, 'next'), old: join(root, 'old') }
  }
  async entries() { return (await this.catalog.list()).skills.filter(skill => skill.source === 'global') }
  async sources(): Promise<Map<string, SkillSource>> {
    let lookup: Awaited<ReturnType<typeof readLocalSkillLock>>
    try { lookup = await readLocalSkillLock(this.home) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map(); throw new Error('无法读取本地技能安装来源记录，请检查 .skill-lock.json') }
    const skills = await this.entries()
    const sources = new Map<string, SkillSource>()
    for (const skill of skills) {
      const entry = lookup(basename(skill.path))
      if (entry?.sourceType !== 'github' || !entry.skillPath) continue
      const repository = entry.source && /^[\w.-]+\/[\w.-]+(?:\.git)?$/.test(entry.source) ? `https://github.com/${entry.source}` : entry.sourceUrl
      if (!repository) continue
      const skillPath = entry.skillPath.replace(/\\/g, '/').replace(/(^|\/)SKILL\.md$/i, '') || '.'
      if (skillPath.startsWith('/') || skillPath.split('/').some(part => part === '..') || /[\x00-\x1f]/.test(skillPath)) continue
      try { sources.set(skill.id, restoreLibrarySource({ kind: 'git', repository, ref: entry.ref || 'HEAD', skillPath }, '')) }
      catch { /* Unsupported lock entries are never guessed from skill names. */ }
    }
    return sources
  }
  changed() { this.catalog.invalidate() }
}
