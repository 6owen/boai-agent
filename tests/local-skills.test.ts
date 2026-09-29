/*
 * [INPUT]: 真实 AppService 与隔离的 Agent/全局/插件技能目录。
 * [OUTPUT]: 首次打开即发现本机技能、链接去重、插件开关、错误可见、刷新/重启及收藏不授权回归。
 * [POS]: tests 的本机技能发现集成验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { Method, Methods } from '../src/shared/ipc'
const roots: string[] = [], services: AppService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-discovery-')); roots.push(root)
  const homeDir = join(root, 'home'), codexHome = join(homeDir, '.codex')
  const skill = async (path: string, name: string, body = '本机说明') => { await mkdir(path, { recursive: true }); await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: 已存在的技能\n---\n# ${body}`); return path }
  const global = await skill(join(homeDir, '.agents/skills/report'), 'report')
  await mkdir(join(codexHome, 'skills'), { recursive: true }); await symlink(global, join(codexHome, 'skills/report'))
  await skill(join(codexHome, 'skills/.system/helper'), 'Helper Display Name')
  const plugin = join(root, 'plugin'); await skill(join(plugin, 'skills/build'), 'build')
  await mkdir(join(plugin, '.codex-plugin')); await writeFile(join(plugin, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'kata-code', skills: './skills' }))
  await mkdir(join(homeDir, '.agents/plugins'), { recursive: true }); await writeFile(join(homeDir, '.agents/plugins/marketplace.json'), JSON.stringify({ plugins: [{ name: 'kata-code', source: { path: plugin } }] }))
  await writeFile(join(codexHome, 'config.toml'), '[plugins."kata-code@plugins-cli"]\nenabled = true\n')
  const start = async () => {
    const service = new AppService({ dataPath: join(root, 'data'), ...{ skillDiscovery: { homeDir, codexHome } }, engine: { run: async () => {}, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    services.push(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    return { service, api }
  }
  return { root, homeDir, codexHome, global, skill, start, ...await start() }
}
test('a fresh library discovers existing shared, linked Agent and enabled plugin skills without importing or granting', async () => {
  const { api } = await setup()
  expect((await api('snapshot', undefined)).resources).toEqual([])
  const catalog = await api('listLocalSkills', undefined)
  expect(catalog.skills.map(skill => skill.slug).sort()).toEqual(['helper', 'kata-code:build', 'report'])
  expect(catalog.skills.find(skill => skill.slug === 'report')?.source).toBe('global')
  expect(catalog.skills.find(skill => skill.slug === 'helper')?.name).toBe('Helper Display Name')
  const report = catalog.skills.find(skill => skill.slug === 'report')!
  expect((await api('getLocalSkillDetail', { id: report.id })).content).toContain('本机说明')
  const collection = await api('updateSkillCollections', { expectedRevision: 0, action: { kind: 'favorite', resourceId: report.id, favorite: true } })
  expect(collection.favoriteResourceIds).toEqual([report.id])
  const snapshot = await api('snapshot', undefined)
  expect(snapshot.resources).toEqual([]); expect(snapshot.agents.every(agent => !agent.skillIds.length)).toBe(true)
})
test('refresh and restart retain favorite identities, exclude disabled plugins and expose malformed files', async () => {
  const { api, service, start, homeDir, codexHome, skill } = await setup()
  const report = (await api('listLocalSkills', undefined)).skills.find(skill => skill.slug === 'report')!
  await api('updateSkillCollections', { expectedRevision: 0, action: { kind: 'favorite', resourceId: report.id, favorite: true } })
  await writeFile(join(codexHome, 'config.toml'), '[plugins."kata-code@plugins-cli"]\nenabled = false\n')
  await skill(join(homeDir, '.agents/skills/new'), 'new')
  await writeFile(join(homeDir, '.agents/skills/new/SKILL.md'), 'malformed')
  const refreshed = await api('listLocalSkills', undefined)
  expect(refreshed.skills.some(skill => skill.source === 'plugin')).toBe(false)
  expect(refreshed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining('/new') })]))
  await service.close(); const restarted = await start()
  expect((await restarted.api('listLocalSkills', undefined)).skills.find(skill => skill.slug === 'report')?.id).toBe(report.id)
  expect((await restarted.api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([report.id])
  await expect(api('getLocalSkillDetail', { id: '../../outside' })).rejects.toThrow()
})
test('retargeted directory links cannot read unreviewed files through an old catalog identity', async () => {
  const { api, homeDir, skill, root } = await setup()
  const first = await skill(join(root, 'first'), 'linked'), second = await skill(join(root, 'second'), 'replacement')
  const link = join(homeDir, '.agents/skills/linked'); await symlink(first, link)
  const entry = (await api('listLocalSkills', undefined)).skills.find(skill => skill.slug === 'linked')!
  await rm(link); await symlink(second, link)
  await expect(api('getLocalSkillDetail', { id: entry.id })).rejects.toThrow('重新扫描')
})

test('invalid skills and linked documents remain visible as issues without hiding valid neighbors', async () => {
  const { api, homeDir, skill, root } = await setup()
  const source = await skill(join(root, 'outside'), 'outside')
  const linked = join(homeDir, '.agents/skills/document-link'); await mkdir(linked)
  await symlink(join(source, 'SKILL.md'), join(linked, 'SKILL.md'))
  await symlink(join(root, 'missing'), join(homeDir, '.agents/skills/broken'))
  const catalog = await api('listLocalSkills', undefined)
  expect(catalog.skills.some(skill => skill.slug === 'report')).toBe(true)
  expect(catalog.skills.some(skill => skill.slug === 'document-link')).toBe(false)
  expect(catalog.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([linked, join(homeDir, '.agents/skills/broken')]))
})
test('many Agent aliases cannot consume the scan limit before shared and enabled plugin skills', async () => {
  const { api, homeDir, skill } = await setup()
  const shared = join(homeDir, '.agents/skills')
  for (let index = 0; index < 110; index++) await skill(join(shared, `entry-${index}`), `entry-${index}`)
  // Agent installers link a common collection into many registered roots.
  const aliases = ['.aider-desk', '.augment', '.bob', '.claude', '.cursor', '.continue', '.gemini', '.copilot', '.factory', '.openclaw', '.codebuddy', '.codemaker', '.codestudio', '.commandcode', '.firebender', '.forge', '.grok', '.hermes', '.inferencesh', '.jazz', '.junie', '.iflow', '.kilocode', '.kiro', '.kode', '.lingma', '.mcpjam', '.minimax', '.vibe', '.moxby', '.mux', '.openhands', '.ona', '.qoder', '.qoder-cn', '.qwen', '.reasonix', '.rovodev', '.roo', '.terramind', '.tinycloud', '.trae', '.zcode', '.zencoder', '.neovate', '.pochi', '.adal']
  for (const alias of aliases) { await mkdir(join(homeDir, alias), { recursive: true }); await symlink(shared, join(homeDir, alias, 'skills')) }
  const catalog = await api('listLocalSkills', undefined)
  expect(catalog.skills).toHaveLength(113)
  expect(catalog.skills.filter(skill => skill.source === 'global')).toHaveLength(111)
  expect(catalog.skills.some(skill => skill.slug === 'kata-code:build')).toBe(true)
  expect(catalog.issues).toEqual([])
})
