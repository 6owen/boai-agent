/*
 * [INPUT]: 旧库格式 fixture、真实 SQLite/受管副本、便携 ZIP 与禁止网络/模型执行的服务。
 * [OUTPUT]: 离线恢复、来源/校验及导出往返；导入前后全部员工权限和原绑定保持，包括预置核心员工。
 * [POS]: Skills K4 技能库迁移集成回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { AppService } from '../src/runtime/service'
import type { Method, Methods } from '../src/shared/ipc'
import type { SkillScan } from '../src/shared/domain/skills'
import { inspectResourceTree } from '../src/runtime/modules/resources/local-resources'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-library-')); roots.push(root)
  const network = vi.fn(async () => { throw new Error('Offline library must not download') }), model = vi.fn(async () => { throw new Error('Must not execute model or skills') })
  const start = async (folder = 'data') => {
    const service = new AppService({ dataPath: join(root, folder), engine: { run: model, test: async () => 'ok' }, skillDownloads: network, skillMarketplaceFetch: network, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    services.push(service); await service.init()
    const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
    return { service, api }
  }
  return { root, network, model, start, ...await start() }
}
type Api = Awaited<ReturnType<typeof setup>>['api']
async function settled(api: Api, id: string) {
  let result = await api('getSkillOperation', { id })
  await vi.waitFor(async () => { result = await api('getSkillOperation', { id }); expect(result.status).not.toBe('running') })
  return result
}
async function install(api: Api, scan: SkillScan, restoreCollections = true) {
  const input = { requestId: crypto.randomUUID(), scanId: scan.id, candidateIds: scan.candidates.map(value => value.id), addToFavorites: false, restoreCollections }
  return settled(api, (await api('installSkills', input)).id)
}
const body = (name: string) => `---\nname: ${name}\ndescription: Offline library test\n---\nUse the saved reference; do not fetch latest.\n`
const json = (value: unknown) => JSON.stringify(value)
const manifest = { schemaVersion: 1, kind: 'boai-skill-library', name: '旧项目技能库', exportedAt: 1720000000000, skillsPath: 'skills', vendorPath: 'vendor', sourcesPath: 'sources' }
function fixture() {
  const files: Record<string, string | Uint8Array> = { 'boai.json': json(manifest), 'skills/local-writer/SKILL.md': body('local-writer'), 'skills/remote-reader/SKILL.md': body('remote-reader'), 'skills/remote-reader/references/example.md': 'Saved reference from an older version', 'skills/remote-reader/assets/example.bin': Uint8Array.from([0, 255, 42]), 'skills/remote-reader/LICENSE': 'Fixture license', 'skills/remote-reader/scripts/setup.js': 'throw new Error("Must not execute package scripts")', 'meta.ts': `export interface VendorSkillMeta { source: string; skillsPath?: string; skills: Record<string,string> }\nexport const vendors: Record<string,VendorSkillMeta> = { 'openai-skills': { source: 'https://github.com/openai/skills.git', skillsPath: '.', skills: { 'skills/remote-reader': 'remote-reader' } } }\nthrow new Error('Never execute meta.ts')\n`, 'scripts/cli.ts': 'throw new Error("Never execute old CLI")' }
  const checksum = createHash('sha256').update('SKILL.md').update('\0').update(Buffer.from(body('local-writer')).toString('base64')).update('\0').digest('hex')
  files['boai.lock.json'] = json({ schemaVersion: 1, exportedAt: manifest.exportedAt, skills: { 'workspace:local-writer': { kind: 'local', checksum }, 'global:remote-reader': { kind: 'vendor', sourceId: 'openai-skills', revision: 'old-tag-not-a-commit' } } })
  return files
}
async function archive(root: string, files = fixture(), filename = 'old-library.zip') {
  const path = join(root, filename)
  await writeFile(path, zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, typeof value === 'string' ? strToU8(value) : value]))))
  return path
}

test('legacy library restores the package offline, statically maps GitHub sources and never grants permissions', async () => {
  const { root, api, network, model } = await setup(), path = await archive(root)
  const agentsBefore = (await api('snapshot', undefined)).agents
  const scan = await api('scanSkillSource', { source: path, kind: 'zip' })
  expect(scan.library).toEqual({ name: manifest.name, groups: [], favoriteCount: 0 })
  expect(scan.warnings?.join()).toContain('未保存收藏分组')
  expect((await api('snapshot', undefined)).resources).toEqual([])
  const remote = scan.candidates.find(value => value.name === 'remote-reader')!
  expect(remote.source).toMatchObject({ kind: 'git', repository: 'https://github.com/openai/skills', ref: 'HEAD', skillPath: 'skills/remote-reader' })
  expect(remote.source).not.toHaveProperty('resolvedCommit')
  const result = await install(api, scan)
  expect(result.kind).toBe('library-import'); expect(result.items.every(item => item.status === 'installed')).toBe(true)
  const snapshot = await api('snapshot', undefined), resource = snapshot.resources.find(value => value.name === 'remote-reader')!
  expect(await readFile(join(resource.path, 'references/example.md'), 'utf8')).toBe('Saved reference from an older version')
  expect(await readFile(join(resource.path, 'assets/example.bin'))).toEqual(Buffer.from([0, 255, 42]))
  expect(snapshot.agents).toEqual(agentsBefore)
  expect((await api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([])
  expect(network).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled()
})

test('dynamic legacy metadata degrades to snapshots without evaluation; an altered checksum skips only its own entry', async () => {
  const { root, api, network } = await setup(), files = fixture()
  files['meta.ts'] = 'export const vendors = (() => { throw new Error("Do not execute"); })()'
  files['skills/local-writer/SKILL.md'] = body('local-writer') + 'Tampered instructions'
  const scan = await api('scanSkillSource', { source: await archive(root, files), kind: 'zip' })
  expect(scan.warnings?.join()).toContain('无法静态验证')
  expect(scan.candidates.find(value => value.name === 'local-writer')?.error).toContain('checksum')
  expect(scan.candidates.find(value => value.name === 'remote-reader')?.source?.kind).toBe('snapshot')
  expect((await install(api, scan)).items.map(item => item.status)).toEqual(['skipped', 'installed'])
  expect(network).not.toHaveBeenCalled()
})

test.each(['manifest-version', 'lock-traversal', 'lock-missing', 'unknown-collection', 'duplicate-group'])('malformed library %s cannot be accepted as an ordinary ZIP', async kind => {
  const { root, api } = await setup(), files = fixture()
  if (kind === 'manifest-version') files['boai.json'] = json({ ...manifest, schemaVersion: 2 })
  if (kind === 'lock-traversal') files['boai.lock.json'] = json({ schemaVersion: 1, exportedAt: 1, skills: { 'workspace:../private': { kind: 'local' } } })
  if (kind === 'lock-missing') delete files['boai.lock.json']
  if (kind === 'unknown-collection') files['boai-agent.collections.json'] = json({ schemaVersion: 1, groups: [], entries: { 'skills/missing': { favorite: true } } })
  if (kind === 'duplicate-group') files['boai-agent.collections.json'] = json({ schemaVersion: 1, groups: [{ key: 'one', name: 'Reports' }, { key: 'two', name: 'reports' }], entries: {} })
  await expect(api('scanSkillSource', { source: await archive(root, files), kind: 'zip' })).rejects.toThrow()
  expect((await api('snapshot', undefined)).resources).toEqual([])
  expect(await readdir(join(root, 'data/skill-staging'))).toEqual([])
})

test('same library moved between paths reuses resources, merges collections idempotently and preserves local grouping', async () => {
  const { root, api, service, start } = await setup(), files = fixture()
  files['boai-agent.collections.json'] = json({ schemaVersion: 1, groups: [{ key: 'reports', name: 'Reports' }], entries: { 'skills/remote-reader': { favorite: true, group: 'reports' }, 'skills/local-writer': { favorite: true } } })
  const path = await archive(root, files), first = await install(api, await api('scanSkillSource', { source: path, kind: 'zip' }))
  const collections = await api('getSkillCollections', undefined)
  expect(collections.favoriteResourceIds).toHaveLength(2); expect(collections.groups.map(value => value.name)).toEqual(['Reports'])
  const moved = join(root, 'moved.zip'); await cp(path, moved)
  const repeated = await install(api, await api('scanSkillSource', { source: moved, kind: 'zip' }))
  expect(repeated.items.map(item => item.status)).toEqual(['reused', 'reused']); expect(await api('getSkillCollections', undefined)).toEqual(collections)
  const resourceId = first.items.find(value => value.name === 'remote-reader')!.resourceId!
  let value = await api('updateSkillCollections', { expectedRevision: collections.revision, action: { kind: 'create-group', name: 'My preference' } })
  value = await api('updateSkillCollections', { expectedRevision: value.revision, action: { kind: 'assign-group', resourceId, groupId: value.groups[1].id } })
  await service.close(); const reopened = await start()
  await install(reopened.api, await reopened.api('scanSkillSource', { source: moved, kind: 'zip' }))
  expect(await reopened.api('getSkillCollections', undefined)).toEqual(value)
})

test('library conflicts skip existing public content and import scope never follows old machine ownership', async () => {
  const { root, api } = await setup(), files = fixture(), path = await archive(root, files)
  await install(api, await api('scanSkillSource', { source: path, kind: 'zip' }))
  files['skills/remote-reader/references/example.md'] = 'Another saved version'
  const changed = await archive(root, files, 'changed.zip'), conflict = await api('scanSkillSource', { source: changed, kind: 'zip' })
  expect(conflict.candidates.find(value => value.name === 'remote-reader')?.conflict).toContain('默认跳过')
  expect((await install(api, conflict)).items.map(value => value.status)).toEqual(['reused', 'skipped'])
  const personal = await install(api, await api('scanSkillSource', { source: path, kind: 'zip', ownerAgentId: 'researcher' }))
  expect(personal.items.every(value => value.status === 'installed')).toBe(true)
  const snapshot = await api('snapshot', undefined)
  expect(snapshot.resources.filter(value => value.ownerAgentId === 'researcher')).toHaveLength(2)
  expect(snapshot.agents.every(value => !value.skillIds.length)).toBe(true)
})

test('restoring collections follows saved group order rather than file order, and opting out leaves collections empty', async () => {
  const { root, api, start } = await setup(), files = fixture()
  files['boai-agent.collections.json'] = json({ schemaVersion: 1, groups: [{ key: 'first', name: 'First' }, { key: 'second', name: 'Second' }], entries: { 'skills/local-writer': { favorite: true, group: 'second' }, 'skills/remote-reader': { favorite: true, group: 'first' } } })
  const path = await archive(root, files)
  await install(api, await api('scanSkillSource', { source: path, kind: 'zip' }))
  expect((await api('getSkillCollections', undefined)).groups.map(value => value.name)).toEqual(['First', 'Second'])
  const other = await start('without-collections')
  await install(other.api, await other.api('scanSkillSource', { source: path, kind: 'zip' }), false)
  expect(await other.api('getSkillCollections', undefined)).toMatchObject({ favoriteResourceIds: [], groups: [] })
})

test('export round trip preserves complete bytes, sources and collections while omitting machine IDs and credentials', async () => {
  const { root, api, service, start, network } = await setup()
  await install(api, await api('scanSkillSource', { source: await archive(root), kind: 'zip' }))
  const resources = (await api('snapshot', undefined)).resources, remote = resources.find(value => value.name === 'remote-reader')!, local = resources.find(value => value.name === 'local-writer')!
  await writeFile(join(local.path, '.env'), 'SECRET=must-not-export')
  let collection = await api('getSkillCollections', undefined)
  collection = await api('updateSkillCollections', { expectedRevision: collection.revision, action: { kind: 'favorite', resourceId: remote.id, favorite: true } })
  collection = await api('updateSkillCollections', { expectedRevision: collection.revision, action: { kind: 'create-group', name: 'Research' } })
  await api('updateSkillCollections', { expectedRevision: collection.revision, action: { kind: 'assign-group', resourceId: remote.id, groupId: collection.groups[0].id } })
  const plan = await api('planSkillLibraryExport', { resourceIds: resources.map(value => value.id), name: 'Portable library' })
  expect(plan.items.find(value => value.resourceId === local.id)?.excluded).toEqual(['.env'])
  const destination = join(root, 'portable.zip'), input = { planId: plan.id, requestId: 'export-round-trip' }
  const result = await settled(api, (await service.exportSkillLibrary(input, destination)).id)
  expect(result.items.every(value => value.status === 'exported')).toBe(true)
  expect(await service.exportSkillLibrary(input, destination)).toEqual(result)
  await expect(service.exportSkillLibrary(input, join(root, 'different.zip'))).rejects.toThrow('requestId')
  const exported = unzipSync(await readFile(destination))
  expect(exported['skills/remote-reader/assets/example.bin']).toEqual(Uint8Array.from([0, 255, 42]))
  expect(strFromU8(exported['skills/remote-reader/LICENSE'])).toBe('Fixture license')
  expect(exported['skills/remote-reader/scripts/setup.js']).toBeDefined()
  expect(exported['skills/local-writer/.env']).toBeUndefined()
  const metadata = ['boai.json', 'boai.lock.json', 'boai-agent.sources.json', 'boai-agent.collections.json'].map(path => strFromU8(exported[path])).join('\n')
  for (const machineValue of [root, remote.id, local.id, collection.groups[0].id, 'must-not-export', 'ownerAgentId', 'resourceId']) expect(metadata).not.toContain(machineValue)
  const other = await start('restored'), scan = await other.api('scanSkillSource', { source: destination, kind: 'zip' })
  expect(scan.candidates.every(value => !value.error)).toBe(true)
  expect(scan.library).toMatchObject({ groups: ['Research'], favoriteCount: 1 })
  await install(other.api, scan)
  const restored = (await other.api('snapshot', undefined)).resources.find(value => value.name === 'remote-reader')!
  expect((await inspectResourceTree(restored.path)).hash).toBe((await inspectResourceTree(remote.path)).hash)
  expect((await other.api('getSkillDetail', { resourceId: restored.id })).installation?.source).toEqual((await api('getSkillDetail', { resourceId: remote.id })).installation?.source)
  expect((await other.api('getSkillCollections', undefined)).favoriteResourceIds).toEqual([restored.id])
  expect(network).not.toHaveBeenCalled()
})

test('export publishes frozen reviewed content, never overwrites a destination and stays idempotent across restart', async () => {
  const { root, api, service, start } = await setup()
  await install(api, await api('scanSkillSource', { source: await archive(root), kind: 'zip' }))
  const resource = (await api('snapshot', undefined)).resources.find(value => value.name === 'remote-reader')!
  const plan = await api('planSkillLibraryExport', { resourceIds: [resource.id], name: 'Reviewed' })
  await writeFile(join(resource.path, 'SKILL.md'), body(resource.name) + 'unreviewed change')
  const destination = join(root, 'frozen.zip'), input = { planId: plan.id, requestId: 'frozen-export' }
  await writeFile(destination, 'Existing file must stay')
  await expect(service.exportSkillLibrary(input, destination)).rejects.toThrow('同名文件')
  expect(await readFile(destination, 'utf8')).toBe('Existing file must stay')
  await rm(destination)
  const result = await settled(api, (await service.exportSkillLibrary(input, destination)).id)
  expect(strFromU8(unzipSync(await readFile(destination))[`skills/${resource.name}/SKILL.md`])).toBe(body(resource.name))
  await service.close(); const reopened = await start()
  expect(await reopened.service.exportSkillLibrary(input, destination)).toEqual(result)
  const current = await reopened.api('planSkillLibraryExport', { resourceIds: [resource.id], name: 'Now modified' })
  expect(current.items[0].warnings.join()).toContain('本地内容已修改')
  await expect(reopened.service.exportSkillLibrary({ planId: current.id, requestId: 'inside-data' }, join(root, 'data/export.zip'))).rejects.toThrow('应用数据目录之外')
})

test('same-name resources require explicit selection; discarded plans cannot export', async () => {
  const { root, api, service } = await setup(), path = await archive(root)
  await install(api, await api('scanSkillSource', { source: path, kind: 'zip' }))
  await install(api, await api('scanSkillSource', { source: path, kind: 'zip', ownerAgentId: 'researcher' }))
  const resources = (await api('snapshot', undefined)).resources
  const conflict = await api('planSkillLibraryExport', { resourceIds: resources.map(value => value.id), name: 'Conflict' })
  expect(conflict.items.every(value => value.error?.includes('相同技能名'))).toBe(true)
  await expect(service.exportSkillLibrary({ planId: conflict.id, requestId: 'conflict' }, join(root, 'conflict.zip'))).rejects.toThrow('同名冲突')
  const selected = await api('planSkillLibraryExport', { resourceIds: [resources[0].id], name: 'One' })
  await api('discardSkillLibraryExport', { id: selected.id })
  await expect(service.exportSkillLibrary({ planId: selected.id, requestId: 'discarded' }, join(root, 'discarded.zip'))).rejects.toThrow('过期')
})

test('restart interrupts an unknown export without replaying it or touching arbitrary output files', async () => {
  const { root, service, start } = await setup(); await service.close()
  const destination = join(root, 'keep.zip'); await writeFile(destination, 'Evidence from previous export')
  const store = new ProductStore(join(root, 'data/boai.sqlite')); await store.init()
  await store.write([{ collection: 'skillOperations', id: 'crashed-export', value: { id: 'crashed-export', kind: 'library-export', scanId: 'lost-plan', status: 'running', fingerprint: 'old', outputName: 'keep.zip', items: [{ candidateId: 'one', name: 'Old', status: 'pending' }] } }]); await store.close()
  const reopened = await start(), operation = await reopened.api('getSkillOperation', { id: 'crashed-export' })
  expect(operation.status).toBe('interrupted'); expect(operation.items[0].error).toContain('不会自动重写')
  expect(await readFile(destination, 'utf8')).toBe('Evidence from previous export')
})
