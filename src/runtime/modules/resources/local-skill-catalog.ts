/*
 * [INPUT]: 本机 Agent 技能根、共享 ~/.agents/skills、启用插件配置与 SKILL.md。
 * [OUTPUT]: 进程内目录缓存/扫描去重、显式刷新与安装后失效；稳定收藏身份、来源与可见诊断；详情始终复核文件和路径，不创建执行资源。
 * [POS]: resources 的本机技能发现；沿用 boai-app 来源优先级和插件命名空间。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import { readdir, realpath, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { LocalSkill, LocalSkillCatalog, LocalSkillDetail } from '../../../shared/domain/skills'
import { boundedRead, restrictedPath } from '../workspaces/file-access'
import { parseSkillDocument } from './local-resources'

export interface SkillDiscoveryOptions { homeDir?: string; codexHome?: string }
type Root = { path: string; source: LocalSkill['source']; label: string; pluginName?: string; namespace?: string }
const MAX_ENTRIES = 5000
const agentPaths = ['.claude/skills', '.cursor/skills', '.gemini/skills', '.gemini/antigravity/skills', '.gemini/antigravity-cli/skills', '.openclaw/skills', '.clawdbot/skills', '.moltbot/skills', '.copilot/skills', '.factory/skills', '.continue/skills', '.codeium/windsurf/skills', '.aider-desk/skills', '.astrbot/data/skills', '.autohand/skills', '.augment/skills', '.bob/skills', '.codeartsdoer/skills', '.codebuddy/skills', '.codemaker/skills', '.codestudio/skills', '.commandcode/skills', '.snowflake/cortex/skills', '.deepagents/agent/skills', '.firebender/skills', '.forge/skills', '.grok/skills', '.hermes/skills', '.inferencesh/skills', '.jazz/skills', '.junie/skills', '.iflow/skills', '.kilocode/skills', '.kiro/skills', '.kode/skills', '.lingma/skills', '.mcpjam/skills', '.minimax/skills', '.vibe/skills', '.moxby/skills', '.mux/skills', '.openhands/skills', '.ona/skills', '.pi/agent/skills', '.qoder/skills', '.qoder-cn/skills', '.qwen/skills', '.reasonix/skills', '.rovodev/skills', '.roo/skills', '.tabnine/agent/skills', '.terramind/skills', '.tinycloud/skills', '.trae/skills', '.zcode/skills', '.zencoder/skills', '.neovate/skills', '.pochi/skills', '.adal/skills']
const configPaths = ['agents/skills', 'crush/skills', 'devin/skills', 'goose/skills', 'kimchi/harness/skills', 'opencode/skills']
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
export const localSkillId = (identity: string) => `local:${createHash('sha256').update(identity).digest('hex')}`

export class LocalSkillCatalogService {
  private entries = new Map<string, { skill: LocalSkill; canonical: string }>()
  private loading?: Promise<LocalSkillCatalog>
  private cached?: LocalSkillCatalog
  private revision = 0
  private readonly home: string
  private readonly codex: string
  constructor(options: SkillDiscoveryOptions = {}) {
    this.home = options.homeDir ?? homedir()
    this.codex = options.codexHome ?? (options.homeDir ? join(this.home, '.codex') : process.env.CODEX_HOME?.trim() || join(this.home, '.codex'))
  }
  invalidate() { this.cached = undefined; this.revision++ }
  async list(refresh = false): Promise<LocalSkillCatalog> {
    if (refresh) this.invalidate()
    if (this.cached) return structuredClone(this.cached)
    if (this.loading) { await this.loading; return this.list() }
    const revision = this.revision
    const pending = this.discover().then(value => { if (revision === this.revision) this.cached = value; return value }).finally(() => { if (this.loading === pending) this.loading = undefined })
    this.loading = pending
    const value = await pending
    return revision === this.revision ? structuredClone(value) : this.list()
  }
  private async discover(): Promise<LocalSkillCatalog> {
    const issues: LocalSkillCatalog['issues'] = []
    const issue = (path: string, message: string) => { if (issues.length < 100) issues.push({ path, message }) }
    const directories = async (path: string) => {
      try { const items = await readdir(path, { withFileTypes: true }); if (items.length > MAX_ENTRIES) issue(path, '目录条目过多，仅扫描前 5000 项'); return items.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ENTRIES).filter(item => item.isDirectory() || item.isSymbolicLink()) }
      catch (error) { if (!missing(error)) issue(path, '无法读取目录，请检查访问权限'); return [] }
    }
    const configRoot = this.home === homedir() ? process.env.XDG_CONFIG_HOME || join(this.home, '.config') : join(this.home, '.config')
    const roots: Root[] = [...agentPaths.map(path => ({ path: join(this.home, path), source: 'agent' as const, label: path.split('/')[0].slice(1) })), ...configPaths.map(path => ({ path: join(configRoot, path), source: 'agent' as const, label: path.split('/')[0] })), { path: join(this.codex, 'skills'), source: 'agent', label: 'Codex' }, { path: join(this.home, '.agents/skills'), source: 'global', label: '全局 (~/.agents/skills/)' }]
    // Read only the plugin switches; config values (including credentials) never enter a DTO or diagnostic.
    let plugins: Record<string, unknown> = {}
    try { plugins = object(parseToml(await boundedRead(join(this.codex, 'config.toml'))).plugins) }
    catch (error) { if (!missing(error)) issue(join(this.codex, 'config.toml'), '无法读取插件启用配置') }
    let registered: unknown[] = []
    try { const file = object(JSON.parse(await boundedRead(join(this.home, '.agents/plugins/marketplace.json')))); if (Array.isArray(file.plugins)) registered = file.plugins }
    catch (error) { if (!missing(error)) issue(join(this.home, '.agents/plugins/marketplace.json'), '无法读取插件来源清单') }
    for (const [identity, setting] of Object.entries(plugins).slice(0, 500)) {
      if (object(setting).enabled !== true) continue
      const match = /^([^/@\\]+)@([^/@\\]+)$/.exec(identity)
      if (!match || match.slice(1).some(part => part === '.' || part === '..')) continue
      const [, name, marketplace] = match
      const registration = marketplace === 'plugins-cli' ? registered.map(object).find(item => item.name === name) : undefined
      const registeredPath = object(registration?.source).path
      const candidates: string[] = []
      const cache = join(this.codex, 'plugins/cache', marketplace, name)
      const versions = await directories(cache)
      // Installed caches use version directories. Read only the latest version, never all historical copies.
      versions.sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }))
      if (versions[0]) candidates.push(join(cache, versions[0].name))
      if (typeof registeredPath === 'string') candidates.push(resolve(this.home, registeredPath))
      for (const pluginRoot of candidates) {
        try {
          const manifest = object(JSON.parse(await boundedRead(join(pluginRoot, '.codex-plugin/plugin.json'))))
          const declared = manifest.skills === undefined ? ['./skills'] : Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills]
          for (const path of declared.slice(0, 50)) if (typeof path === 'string') {
            const canonicalPlugin = await realpath(pluginRoot)
            const skillsRoot = resolve(canonicalPlugin, path)
            await restrictedPath([canonicalPlugin], skillsRoot)
            roots.push({ path: skillsRoot, source: 'plugin', label: `插件 (${name})`, pluginName: name, namespace: identity })
          }
          break
        } catch (error) { if (!missing(error)) issue(pluginRoot, '无法读取插件技能声明') }
      }
    }
    const bySlug = new Map<string, { skill: LocalSkill; canonical: string }>()
    let visited = 0
    const seen = new Set<string>()
    const load = async (root: Root, directory: string, slug: string) => {
      let resolved = false
      try {
        const canonical = await realpath(directory); resolved = true
        const identity = root.namespace ? `${root.namespace}:${slug}` : canonical
        if (seen.has(identity)) return
        seen.add(identity)
        if (++visited > MAX_ENTRIES) return
        const file = join(canonical, 'SKILL.md')
        await restrictedPath([canonical], file)
        const document = await boundedRead(file)
        const metadata = parseSkillDocument(document, { strictName: false })
        const qualified = root.pluginName ? `${root.pluginName}:${slug}` : slug
        const id = localSkillId(root.namespace ? `${root.namespace}:${slug}` : canonical)
        const skill: LocalSkill = { id, slug: qualified, name: metadata.name, description: metadata.description, path: directory, source: root.source, sourceLabel: root.source === 'agent' ? `Agent (${root.label})` : root.label, ...(root.pluginName ? { pluginName: root.pluginName } : {}) }
        if (root.source !== 'agent' || !bySlug.has(qualified)) bySlug.set(qualified, { skill, canonical })
      } catch (error) { if (!missing(error) || !resolved) issue(directory, error instanceof Error && !directory.endsWith('config.toml') ? error.message : '无法读取技能') }
    }
    const priority = { global: 0, plugin: 1, agent: 2 }
    roots.sort((a, b) => priority[a.source] - priority[b.source])
    for (const root of roots) {
      // Plugin manifests may point directly at a single skill.
      try { if ((await lstat(join(root.path, 'SKILL.md'))).isFile()) { await load(root, root.path, basename(root.path)); continue } } catch { /* Otherwise enumerate the declared root. */ }
      for (const entry of await directories(root.path)) {
        if (root.source === 'agent' && bySlug.has(entry.name)) continue
        const directory = join(root.path, entry.name)
        if (entry.name === '.system' || entry.name.startsWith('@')) {
          for (const nested of await directories(directory)) await load(root, join(directory, nested.name), nested.name)
        } else if (!entry.name.startsWith('.')) await load(root, directory, entry.name)
      }
    }
    if (visited > MAX_ENTRIES) issue(this.home, '技能超过 5000 项，扫描结果已截断')
    this.entries = new Map([...bySlug.values()].map(entry => [entry.skill.id, entry]))
    return { skills: [...this.entries.values()].map(entry => entry.skill).sort((a, b) => a.name.localeCompare(b.name)), issues }
  }
  async detail(id: string): Promise<LocalSkillDetail> {
    if (!this.entries.has(id)) await this.list()
    const entry = this.entries.get(id)
    if (!entry) throw new Error('技能已不存在，请重新扫描')
    if (await realpath(entry.skill.path) !== entry.canonical) throw new Error('技能目录已变化，请重新扫描')
    await restrictedPath([entry.canonical], join(entry.canonical, 'SKILL.md'))
    const content = await boundedRead(join(entry.canonical, 'SKILL.md'))
    const metadata = parseSkillDocument(content, { strictName: false })
    return { skill: { ...entry.skill, name: metadata.name, description: metadata.description }, content, filePath: join(entry.canonical, 'SKILL.md') }
  }
  async source(id: string) { await this.detail(id); return this.entries.get(id)!.canonical }
  async has(id: string) { try { await this.detail(id); return true } catch { return false } }
}
