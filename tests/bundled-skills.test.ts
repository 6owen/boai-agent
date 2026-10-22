/*
 * [OUTPUT]: 预览技能旧受管副本沿原hash/版本/回执更新，自定义副本拒绝静默覆盖。
 * [INPUT]: 隔离 AppService/SQLite、实际随包技能、原绑定/更新/删除协议。
 * [OUTPUT]: 新 Bobo 默认清单完整独立副本、重启/升级不覆盖、旧库不补绑及中断回执核对。
 * [POS]: 默认技能源分发集成回归；不调用模型或 Electron。
 * [PROTOCOL]: 修改同步 Header 与 tests/.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { bundledSkillNames, bundledSkillIdentity } from '../src/runtime/modules/resources/bundled-skills'
import { LocalSkillCatalogService } from '../src/runtime/modules/resources/local-skill-catalog'
import { inspectResourceTree } from '../src/runtime/modules/resources/local-resources'
import type { DigitalAgent, Resource } from '../src/shared/domain'
import type { Method, Methods } from '../src/shared/ipc'

const roots: string[] = [], services = new Set<AppService>()
afterEach(async () => {
  vi.restoreAllMocks()
  for (const service of services) await service.close()
  services.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-bundled-')); roots.push(root)
  const homeDir = join(root, 'home'), bundledRoot = join(root, 'bundle'), dataPath = join(root, 'data')
  await mkdir(homeDir); await cp(resolve('resources/agent-skills'), bundledRoot, { recursive: true })
  const model = vi.fn(async () => {})
  const start = async (bundle: string | null = bundledRoot) => {
    const events: unknown[] = []
    const service = new AppService({ dataPath, skillDiscovery: { homeDir, ...(bundle ? { bundledRoot: bundle } : {}) }, engine: { run: model, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: event => events.push(event) })
    services.add(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    const store = (service as unknown as { store: ProductStore }).store
    const close = async () => { await service.close(); services.delete(service) }
    const bobo = async () => (await api('snapshot', undefined)).agents.find(agent => agent.id === 'bobo')!
    return { service, api, store, close, bobo, events }
  }
  return { root, homeDir, bundledRoot, dataPath, model, start }
}
const skillInput = ({ configVersion, workspaceRef: _, memoryNamespace: _m, policyVersion: _p, ...input }: DigitalAgent) => ({ ...input, expectedConfigVersion: configVersion })

test('fresh Bobo receives all shipped independent skills through original receipts without touching shared home or ordinary employees', async () => {
  const f = await fixture(), app = await f.start(), bobo = await app.bobo()
  const resources = await app.store.load<Resource>('resources')
  expect(bobo.skillIds).toHaveLength(bundledSkillNames.length)
  expect(resources.map(item => item.name).sort()).toEqual([...bundledSkillNames].sort())
  for (const resource of resources) {
    expect(resource.ownerAgentId).toBe('bobo')
    expect(resource.path.startsWith(join(f.dataPath, 'skills'))).toBe(true)
    expect((await inspectResourceTree(resource.path)).hash).toBe((await inspectResourceTree(join(f.bundledRoot, resource.name))).hash)
  }
  expect((await app.store.load<{ status: string }>('skillOperations')).every(item => item.status === 'completed')).toBe(true)
  expect((await app.api('snapshot', undefined)).agents.filter(agent => agent.id !== 'bobo').every(agent => agent.skillIds.length === 0)).toBe(true)
  await expect(readFile(join(f.homeDir, '.agents/skills/boai-browser/SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.model).not.toHaveBeenCalled()
  expect(app.events.filter((event: any) => event.type === 'runtime-error')).toEqual([])
  const version = bobo.configVersion
  await app.close()
  const restarted = await f.start()
  expect((await restarted.bobo()).skillIds).toEqual(bobo.skillIds)
  expect((await restarted.bobo()).configVersion).toBe(version)
  expect(await restarted.store.load('skillOperations')).toHaveLength(bundledSkillNames.length)
})

test('upgraded bundle preserves custom employee copy and removals; original update preview detects changed builtin source', async () => {
  const f = await fixture(), app = await f.start()
  const resources = await app.store.load<Resource>('resources')
  const edited = resources.find(item => item.name === 'boai-browser')!, removed = resources.find(item => item.name === 'boai-todo')!
  const original = await readFile(join(edited.path, 'SKILL.md'), 'utf8')
  await writeFile(join(edited.path, 'SKILL.md'), original + '\nUser customization.\n')
  const bobo = await app.bobo()
  await app.api('saveAgent', { ...skillInput(bobo), skillIds: bobo.skillIds.filter(id => id !== removed.id) })
  const saved = await app.bobo()
  await app.close()
  await writeFile(join(f.bundledRoot, edited.name, 'SKILL.md'), original + '\nShipped update.\n')
  const movedBundle = join(f.root, 'new-application-location')
  await cp(f.bundledRoot, movedBundle, { recursive: true })
  await rm(f.bundledRoot, { recursive: true })
  const restarted = await f.start(movedBundle)
  expect((await restarted.bobo()).skillIds).toEqual(saved.skillIds)
  expect((await restarted.bobo()).configVersion).toBe(saved.configVersion)
  expect(await readFile(join(edited.path, 'SKILL.md'), 'utf8')).toBe(original + '\nUser customization.\n')
  const catalog = await restarted.api('listLocalSkills', {})
  expect(catalog.skills.find(skill => skill.name === edited.name)?.id).toBe(bundledSkillIdentity(edited.name))
  const check = await restarted.api('checkSkillUpdate', { id: edited.id })
  expect(check).toMatchObject({ status: 'available', localModified: true })
  expect(check.fileChanges?.modified).toContain('SKILL.md')
})

test('existing Bobo without initialization marker is not silently migrated', async () => {
  const f = await fixture(), app = await f.start(null)
  // Represents a profile created before bundled default seeding existed.
  await app.store.transaction(tx => tx.remove('defaultSkillSeeds', 'bobo'))
  const original = await app.bobo(); await app.close()
  const restarted = await f.start()
  expect((await restarted.bobo()).skillIds).toEqual(original.skillIds)
  expect((await restarted.bobo()).configVersion).toBe(original.configVersion)
  expect(await restarted.store.load('skillOperations')).toEqual([])
  expect((await restarted.api('listLocalSkills', {})).skills.filter(skill => skill.source === 'builtin')).toHaveLength(bundledSkillNames.length)
})

test('restart reconciles committed and deleted receipts even if seed bookkeeping did not finish', async () => {
  const f = await fixture(), app = await f.start()
  const resource = (await app.store.load<Resource>('resources')).find(item => item.name === 'boai-todo')!
  await app.api('removeResource', { id: resource.id })
  const saved = await app.bobo()
  const seed = (await app.store.load<any>('defaultSkillSeeds'))[0]
  await app.store.write([{ collection: 'defaultSkillSeeds', id: 'bobo', value: { ...seed, status: 'pending', settled: [] } }])
  await app.close()
  const restarted = await f.start()
  expect((await restarted.bobo()).skillIds).toEqual(saved.skillIds)
  expect((await restarted.bobo()).configVersion).toBe(saved.configVersion)
  expect(await restarted.store.load('skillOperations')).toHaveLength(bundledSkillNames.length)
  expect((await restarted.store.load<any>('defaultSkillSeeds'))[0].status).toBe('completed')
})

test('interrupted original binding is retained for inspection and never blindly retried at startup', async () => {
  const f = await fixture(), app = await f.start(null)
  await app.store.write([{ collection: 'skillOperations', id: 'bobo-default-skills-v1-boai-travel', value: { id: 'bobo-default-skills-v1-boai-travel', kind: 'binding', status: 'interrupted', items: [], binding: { receipt: { status: 'interrupted' } } } }])
  await app.close()
  const restarted = await f.start()
  expect((await restarted.bobo()).skillIds).toEqual([])
  expect((await restarted.store.load<any>('defaultSkillSeeds'))[0]).toMatchObject({ status: 'attention' })
  expect(restarted.events.some((event: any) => event.type === 'runtime-error' && event.error.includes('默认技能'))).toBe(true)
  expect(await restarted.store.load('skillOperations')).toHaveLength(1)
})

test('builtin namespace cannot be shadowed by shared same-name skills and rejects source escape', async () => {
  const f = await fixture()
  const shared = join(f.homeDir, '.agents/skills/boai-browser')
  await mkdir(shared, { recursive: true })
  await writeFile(join(shared, 'SKILL.md'), '---\nname: boai-browser\ndescription: custom\n---\nMy shared skill.\n')
  const catalog = new LocalSkillCatalogService({ homeDir: f.homeDir, bundledRoot: f.bundledRoot })
  expect((await catalog.list()).skills.filter(skill => skill.name === 'boai-browser')).toHaveLength(2)
  expect((await catalog.detail(bundledSkillIdentity('boai-browser'))).content).not.toContain('My shared skill.')
  await rm(join(f.bundledRoot, 'boai-browser'), { recursive: true })
  await symlink(shared, join(f.bundledRoot, 'boai-browser'))
  const refreshed = await catalog.list(true)
  expect(refreshed.skills.some(skill => skill.id === bundledSkillIdentity('boai-browser'))).toBe(false)
  expect(refreshed.issues.length).toBeGreaterThan(0)
})

test.each([false, true])('sidebar source upgrade uses original receipt and preserves customized copies; custom=%s', async custom => {
  const f = await fixture(), source = join(f.bundledRoot, 'boai-artifact-sidebar', 'SKILL.md')
  const current = await readFile(source, 'utf8')
  const legacy = '---\nname: boai-artifact-sidebar\ndescription: Legacy sidebar fixture\n---\nUse terminal.create and terminal.exec for the interactive terminal.\n'
  await writeFile(source, legacy)
  const app = await f.start(), bobo = await app.bobo()
  const resource = (await app.store.load<Resource>('resources')).find(item => item.name === 'boai-artifact-sidebar')!
  expect(bobo.skillIds).toContain(resource.id)
  if (custom) await writeFile(join(resource.path, 'SKILL.md'), legacy + '\nMy custom instructions.\n')
  await app.close(); await writeFile(source, current)
  const next = await f.start()
  expect(await readFile(join(resource.path, 'SKILL.md'), 'utf8')).toBe(legacy + (custom ? '\nMy custom instructions.\n' : ''))
  const check = await next.api('checkSkillUpdate', { id: resource.id })
  expect(check).toMatchObject({ status: 'available', localModified: custom })
  const input = { requestId: `sidebar-preview-update-${custom}`, planId: check.planId!, expectedRevision: check.expectedRevision!, expectedHash: check.expectedHash! }
  if (custom) {
    await expect(next.api('updateSkill', input)).rejects.toThrow('明确确认')
    expect(await readFile(join(resource.path, 'SKILL.md'), 'utf8')).toContain('My custom instructions.')
  } else {
    const operation = await next.api('updateSkill', input)
    await vi.waitFor(async () => expect((await next.api('getSkillOperation', { id: operation.id })).status).toBe('completed'))
    const receipt = await next.api('getSkillOperation', { id: operation.id })
    expect(receipt.items[0].status).toBe('updated')
    expect(await readFile(join(resource.path, 'SKILL.md'), 'utf8')).toBe(current)
    expect(current).not.toContain('terminal.create'); expect(current).toContain('preview.start')
    expect(await next.api('updateSkill', input)).toEqual(receipt)
  }
  expect((await next.bobo()).skillIds).toEqual(bobo.skillIds)
  expect(f.model).not.toHaveBeenCalled()
})
