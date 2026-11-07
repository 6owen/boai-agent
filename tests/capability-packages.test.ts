/*
 * [INPUT]: Real local package directories, SQLite and controlled original-service lifecycle ports.
 * [OUTPUT]: Inert parsing, CAS/grants, immutable updates, cleanup completion windows and durable recovery-attempt evidence.
 * [POS]: WT2 package contract tests; no external model, service account or desktop acceptance.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { CapabilityPackages } from '../packages/runtime/src/modules/resources/capability-packages'
import type { CapabilityPackageHost } from '../packages/runtime/src/modules/resources/capability-package-host'
import { assertCanonicalCapabilityPaths, capabilityRelativePath, inspectCapabilityPackage } from '../packages/runtime/src/modules/resources/capability-package-inspection'
import { CapabilityPackageFiles } from '../packages/runtime/src/modules/resources/capability-package-files'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { capabilityPackageOperations } from '../packages/runtime/src/modules/resources/capability-package-operations'
import type { CapabilityPackageServices } from '../packages/runtime/src/modules/resources/capability-package-services'
import type { CapabilityInstallation } from '../packages/shared/src/domain/capability-packages'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const schema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const mcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
async function folder() { const root = await mkdtemp(join(tmpdir(), 'boai-capability-')); cleanups.push(() => rm(root, { recursive: true, force: true })); return root }
async function pkg(root: string, opts: { legacy?: boolean; version?: string; skill?: boolean; servers?: Record<string, unknown>; extra?: Record<string, unknown> } = {}) {
  const path = join(root, randomUUID()); await mkdir(path)
  const manifest = { ...(opts.legacy ? {} : { $schema: schema }), name: 'test-package', version: opts.version ?? '1.0.0', description: 'Test package', repository: 'https://example.test/package', ...opts.extra }
  if (opts.legacy) await mkdir(join(path, '.codex-plugin'))
  await writeFile(join(path, opts.legacy ? '.codex-plugin/plugin.json' : 'plugin.json'), JSON.stringify(manifest))
  if (opts.skill !== false) { await mkdir(join(path, 'skills', 'test-method'), { recursive: true }); await writeFile(join(path, 'skills/test-method/SKILL.md'), '---\nname: test-method\ndescription: Exercise method.\n---\nUse the supplied input.') }
  if (opts.servers) await writeFile(join(path, opts.legacy ? '.mcp.json' : 'mcp.json'), JSON.stringify({ ...(opts.legacy ? {} : { $schema: mcpSchema }), mcpServers: opts.servers }))
  return path
}
async function setup() {
  const root = await folder(), store = new ProductStore(join(root, 'db.sqlite')); await store.init(); cleanups.push(() => store.close())
  const host: CapabilityPackageHost = {
    materialize: vi.fn<CapabilityPackageHost['materialize']>(async installation => { await store.write(installation.contributions.map(value => ({ collection: 'testContributions', id: value.objectId, value }))) }),
    retire: vi.fn<CapabilityPackageHost['retire']>(async (_installation, contributions) => { await store.transaction(async tx => { for (const value of contributions) if (value.ownership === 'owned') await tx.remove('testContributions', value.objectId) }); return [] }),
    applyBinding: vi.fn<CapabilityPackageHost['applyBinding']>(async (tx, _installation, previous, next, expectedVersion) => {
      const employeeId = next?.employeeId ?? previous!.employeeId
      const current = await tx.get<{ version: number }>('testEmployees', employeeId)
      if (!current || expectedVersion !== undefined && current.version !== expectedVersion) throw new Error('员工配置已变化')
      await tx.put({ collection: 'testEmployees', id: employeeId, value: { version: current.version + 1, contributions: next?.contributionIds ?? [] } })
    }),
    assertOwnership: vi.fn<CapabilityPackageHost['assertOwnership']>(async () => {}), drain: vi.fn<CapabilityPackageHost['drain']>(async () => {}), changed: vi.fn<CapabilityPackageHost['changed']>(async () => {}),
  }
  const manager = new CapabilityPackages(store, join(root, 'data'), host); await manager.init()
  await store.write(['employee-a', 'bobo'].map(id => ({ collection: 'testEmployees', id, value: { version: 1 } })))
  const install = async (path: string, requestId = randomUUID()) => { const inspection = await manager.inspect(path); const result = await manager.install({ path, contentHash: inspection.contentHash, requestId }); expect(result?.status).toBe('completed'); return manager.get(result!.installationId) }
  const bind = async (installation: CapabilityInstallation, employeeId = 'employee-a', expectedConfigVersion = 1) => manager.bind({ installationId: installation.id, expectedRevision: installation.revision, requestId: randomUUID(), employeeId, expectedBindingRevision: 0, expectedConfigVersion, contributionIds: installation.contributions.map(value => value.id) })
  return { root, store, host, manager, install, bind }
}
it('normalizes portable and legacy MCP independently without connecting or running package scripts', async () => {
  const root = await folder(), portable = await pkg(root, { servers: { docs: { type: 'streamable-http', url: 'http://127.0.0.1:9/mcp' } } }), legacy = await pkg(root, { legacy: true, servers: { docs: { url: 'http://127.0.0.1:9/mcp' } } })
  const a = await inspectCapabilityPackage(portable), b = await inspectCapabilityPackage(legacy)
  expect(a.definitions).toEqual(b.definitions); expect(a.packageId).toBe(b.packageId); expect(a.format).toBe('portable'); expect(b.format).toBe('codex-legacy')
  expect(await readdir(root)).toHaveLength(2)
})
it('uses inline OpenAI extension as full overlay replacement and never merges legacy hooks', async () => {
  const root = await folder(), path = await pkg(root, { extra: { extensions: { 'com.openai': { interface: { displayName: 'Inline' } } } } })
  await mkdir(join(path, '.codex-plugin')); await writeFile(join(path, '.codex-plugin/plugin.json'), JSON.stringify({ hooks: './hooks/hook.json' }))
  expect((await inspectCapabilityPackage(path)).unsupported).toEqual([])
  await writeFile(join(path, 'plugin.json'), JSON.stringify({ $schema: schema, name: 'test-package' }))
  expect((await inspectCapabilityPackage(path)).unsupported).toContainEqual(expect.objectContaining({ component: 'hooks' }))
})
it.each(['../secret', '/etc/passwd', './a/../../secret', 'C:\\data', 'a\\b', './a//b'])('rejects package escape %s', path => { expect(() => capabilityRelativePath(path)).toThrow() })
it('rejects symlinks and case-normalized duplicate paths before returning a preview', async () => {
  const root = await folder(), path = await pkg(root)
  await symlink(join(path, 'plugin.json'), join(path, 'external'))
  await expect(inspectCapabilityPackage(path)).rejects.toThrow('符号链接')
  expect(() => assertCanonicalCapabilityPaths(['A.txt', 'a.TXT'])).toThrow('重复规范路径')
  expect(() => assertCanonicalCapabilityPaths(['Assets/one.png', 'assets/two.png'])).toThrow('重复规范路径')
})
it('requires the pinned portable schema and treats OAuth as unsupported without exposing declared secrets', async () => {
  const root = await folder(), path = await pkg(root, { servers: { private: { type: 'streamable-http', url: 'https://example.test/mcp', extensions: { 'com.openai': { auth: { type: 'oauth', clientSecret: 'never-return-this' } } } } } })
  const inspected = await inspectCapabilityPackage(path)
  expect(inspected.unsupported).toContainEqual(expect.objectContaining({ code: 'unsupported-authentication' })); expect(inspected.partialAllowed).toBe(false)
  expect(JSON.stringify(inspected)).not.toContain('never-return-this')
  await writeFile(join(path, 'plugin.json'), JSON.stringify({ name: 'test-package' })); await expect(inspectCapabilityPackage(path)).rejects.toThrow('1.0.0')
})
it('represents bearer and secret environment requirements without copying their values', async () => {
  const root = await folder(), path = await pkg(root, { servers: { remote: { type: 'streamable-http', url: 'https://example.test/mcp', extensions: { 'com.openai': { auth: { type: 'api_key', headerScheme: 'bearer' } } } }, local: { type: 'stdio', command: 'node', args: ['server.js'], env: { API_TOKEN: '${API_TOKEN}' } } } })
  const inspected = await inspectCapabilityPackage(path)
  expect(inspected.unsupported).toEqual([])
  expect(inspected.definitions.filter(value => value.kind === 'source').map(value => value.requiredSecrets)).toEqual([['bearer'], ['API_TOKEN']])
})
it('allows only explicit independently supported MCP partial import; dependent skills remain blocked', async () => {
  const f = await setup(), path = await pkg(f.root, { skill: false, servers: { good: { type: 'streamable-http', url: 'https://example.test/mcp' }, bad: { type: 'unknown' } } })
  const inspected = await f.manager.inspect(path); expect(inspected.partialAllowed).toBe(true)
  await expect(f.manager.install({ path, contentHash: inspected.contentHash, requestId: randomUUID() })).rejects.toThrow('不支持')
  const receipt = await f.manager.install({ path, contentHash: inspected.contentHash, requestId: randomUUID(), allowPartial: true }); expect(receipt?.result).toMatchObject({ partial: true, enabled: false })
})
it('installs once for a stable request and never grants bobo implicit execution access', async () => {
  const f = await setup(), path = await pkg(f.root), inspection = await f.manager.inspect(path), requestId = randomUUID()
  const request = { path, contentHash: inspection.contentHash, requestId }
  const [first, second] = await Promise.all([f.manager.install(request), f.manager.install(request)])
  expect(first).toEqual(second); expect(f.host.materialize).toHaveBeenCalledTimes(1)
  const installation = f.manager.get(first!.installationId), contribution = installation.contributions[0], grant = { installationId: installation.id, contributionId: contribution.id, version: installation.contentHash, employeeId: 'bobo' }
  expect(f.manager.canUse(grant)).toBe(false)
  await f.manager.setEnabled({ installationId: installation.id, expectedRevision: 1, requestId: randomUUID(), enabled: true })
  expect(f.manager.canUse(grant)).toBe(false)
  await f.bind(f.manager.get(installation.id), 'bobo'); expect(f.manager.canUse(grant)).toBe(true)
  expect(f.manager.canUse({ ...grant, employeeId: 'employee-a' })).toBe(false)
  await expect(f.manager.install({ ...request, allowPartial: true })).rejects.toThrow('请求标识')
})
it('checks employee and package CAS inside the binding transaction', async () => {
  const f = await setup(), installed = await f.install(await pkg(f.root))
  await expect(f.bind(installed, 'employee-a', 9)).rejects.toThrow('员工配置')
  expect(f.manager.listBindings(installed.id)).toEqual([])
  await f.bind(installed)
  await expect(f.bind(installed)).rejects.toThrow('绑定已变化')
  await expect(f.manager.setEnabled({ installationId: installed.id, expectedRevision: 0, enabled: true, requestId: randomUUID() })).rejects.toThrow('刷新')
})
it('refuses changed content after preview and rolls back a failed materialization without a half-active package', async () => {
  const f = await setup(), path = await pkg(f.root), inspected = await f.manager.inspect(path)
  await writeFile(join(path, 'extra.txt'), 'changed')
  await expect(f.manager.install({ path, contentHash: inspected.contentHash, requestId: randomUUID() })).rejects.toThrow('内容已变化')
  vi.mocked(f.host.materialize).mockImplementationOnce(async installation => { await f.store.write([{ collection: 'testContributions', id: installation.contributions[0].objectId, value: {} }]); throw new Error('interrupted adapter') })
  const requestId = randomUUID(), current = await f.manager.inspect(path), receipt = await f.manager.install({ path, contentHash: current.contentHash, requestId })
  expect(receipt).toMatchObject({ status: 'failed', phase: 'rolled-back' }); expect(f.manager.list()).toEqual([]); expect(await f.store.load('testContributions')).toEqual([])
  expect(await f.manager.install({ path, contentHash: current.contentHash, requestId })).toEqual(receipt)
})
it('pins active leases, demands explicit changed-contribution consent and keeps old version after failed update', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  const current = f.manager.get(first.id), grant = { installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash }, release = f.manager.acquire(grant)
  const path = await pkg(f.root, { version: '2.0.0' }); await writeFile(join(path, 'skills/test-method/SKILL.md'), '---\nname: test-method\ndescription: Changed method.\n---\nNew method.')
  const inspected = await f.manager.inspect(path), request = { installationId: first.id, expectedRevision: current.revision, path, contentHash: inspected.contentHash, approvedContributionKeys: [], requestId: randomUUID() }
  await expect(f.manager.update(request)).rejects.toThrow('仍在使用'); release()
  await expect(f.manager.update(request)).rejects.toThrow('尚未明确授权')
  vi.mocked(f.host.materialize).mockRejectedValueOnce(new Error('adapter failed'))
  const receipt = await f.manager.update({ ...request, approvedContributionKeys: ['skill:test-method'] })
  expect(receipt?.status).toBe('failed'); expect(f.manager.get(first.id).contentHash).toBe(first.contentHash); expect(f.manager.canUse(grant)).toBe(true)
})
it('moves explicit bindings to an immutable successful version and rejects stale grants', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  const path = await pkg(f.root, { version: '2.0.0' }), inspected = await f.manager.inspect(path)
  const receipt = await f.manager.update({ installationId: first.id, expectedRevision: 2, path, contentHash: inspected.contentHash, approvedContributionKeys: [], requestId: randomUUID() })
  expect(receipt?.status).toBe('completed')
  const current = f.manager.get(first.id), binding = f.manager.listBindings(first.id)[0]
  expect(binding.version).toBe(current.contentHash); expect(binding.revision).toBe(2)
  expect(f.manager.canUse({ installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash })).toBe(false)
  expect(f.manager.canUse({ installationId: first.id, contributionId: current.contributions[0].id, employeeId: 'employee-a', version: current.contentHash })).toBe(true)
})
it('keeps failed draining blocked across restart and never reports a live resource as uninstalled', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  vi.mocked(f.host.drain).mockRejectedValueOnce(new Error('process did not exit'))
  await expect(f.manager.setEnabled({ installationId: first.id, expectedRevision: 2, enabled: false, requestId: randomUUID() })).rejects.toThrow('did not exit')
  const restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  expect(restarted.get(first.id)).toMatchObject({ status: 'draining', enabled: false })
  expect(restarted.canUse({ installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash })).toBe(false)
  await restarted.setEnabled({ installationId: first.id, expectedRevision: 2, enabled: false, requestId: randomUUID() }); expect(restarted.get(first.id)).toMatchObject({ status: 'installed', enabled: false, revision: 3 })
})
it('retains modified package files and only deletes objects whose ownership belongs to the package', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), files = new CapabilityPackageFiles(join(f.root, 'data'))
  const path = join(files.directory(first), 'skills/test-method/SKILL.md'); await writeFile(path, 'User customization')
  const receipt = await f.manager.uninstall({ installationId: first.id, expectedRevision: 1, requestId: randomUUID() })
  expect(receipt).toMatchObject({ status: 'completed', phase: 'committed-cleanup-required' }); expect(receipt?.retained?.length).toBe(1)
  expect(await readFile(path, 'utf8')).toBe('User customization'); expect(f.manager.list()).toEqual([])
})
it('marks a pre-commit restart as interrupted and explicit recovery cleans without replaying materialization', async () => {
  const f = await setup(), installed = await f.install(await pkg(f.root))
  const interruptedId = randomUUID(), draft = { ...installed, id: randomUUID() }
  await f.store.write([{ collection: 'capabilityOperations', id: interruptedId, value: { requestId: interruptedId, action: 'install', installationId: draft.id, fingerprint: 'fixture', status: 'preparing', phase: 'materializing', draft } }])
  const calls = vi.mocked(f.host.materialize).mock.calls.length, restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  expect(await restarted.getOperation(interruptedId)).toMatchObject({ status: 'interrupted' })
  expect(await restarted.recover(interruptedId)).toMatchObject({ status: 'failed', phase: 'reconciled' }); expect(f.host.materialize).toHaveBeenCalledTimes(calls)
})

it('persists an unbind drain failure without restoring access after restart or replaying the failed request', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  vi.mocked(f.host.drain).mockRejectedValueOnce(new Error('still in use'))
  const request = { installationId: first.id, expectedRevision: 2, requestId: randomUUID(), employeeId: 'employee-a', expectedBindingRevision: 1, expectedConfigVersion: 2 }
  await expect(f.manager.unbind(request)).rejects.toThrow('still in use')
  expect(await f.manager.getOperation(request.requestId)).toMatchObject({ status: 'interrupted' })
  const restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  const grant = { installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash }
  expect(restarted.canUse(grant)).toBe(false)
  const count = vi.mocked(f.host.drain).mock.calls.length
  expect(await restarted.unbind(request)).toMatchObject({ status: 'interrupted' }); expect(f.host.drain).toHaveBeenCalledTimes(count)
  await restarted.unbind({ ...request, requestId: randomUUID() }); expect(restarted.listBindings(first.id)[0].contributionIds).toEqual([])
})
it('stops admissions before close and awaits the actual lease release', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  const grant = { installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash }, controller = new AbortController(), release = f.manager.acquire(grant, controller)
  vi.mocked(f.host.drain).mockImplementationOnce(async () => { expect(controller.signal.aborted).toBe(true); release() })
  const closing = f.manager.close()
  expect(f.manager.canUse(grant)).toBe(false)
  await expect(f.manager.bind({ installationId: first.id, expectedRevision: 2, requestId: randomUUID(), employeeId: 'bobo', expectedBindingRevision: 0, expectedConfigVersion: 1, contributionIds: [first.contributions[0].id] })).rejects.toThrow('正在退出')
  await closing; expect(f.manager.busy).toBe(false)
})
it('does not treat a missing ownership marker as successful file removal', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), files = new CapabilityPackageFiles(join(f.root, 'data'))
  await rm(join(files.directory(first), '..', '.boai-capability-owner'))
  const retained = await files.cleanup(first)
  expect(retained).toHaveLength(1); expect(await readFile(join(files.directory(first), 'plugin.json'), 'utf8')).toContain('test-package')
})
it('bounds manifests, directory depth and contribution count before materialization', async () => {
  const root = await folder(), large = await pkg(root)
  await writeFile(join(large, 'plugin.json'), ' '.repeat(1024 * 1024 + 1)); await expect(inspectCapabilityPackage(large)).rejects.toThrow('1 MB')
  const deep = await pkg(root); await mkdir(join(deep, ...Array.from({ length: 33 }, () => 'nested')), { recursive: true }); await expect(inspectCapabilityPackage(deep)).rejects.toThrow('32')
  const many = await pkg(root, { skill: false, servers: Object.fromEntries(Array.from({ length: 201 }, (_, index) => ['server-' + index, { type: 'streamable-http', url: 'https://example.test/mcp' }])) })
  await expect(inspectCapabilityPackage(many)).rejects.toThrow('200')
})

it('does not import an embedded secret even when another MCP server permits partial import', async () => {
  const f = await setup(), path = await pkg(f.root, { skill: false, servers: { good: { type: 'streamable-http', url: 'https://example.test/mcp' }, oauth: { type: 'streamable-http', url: 'https://example.test/oauth', extensions: { 'com.openai': { auth: { type: 'oauth', clientSecret: 'private-fixture-token' } } } } } })
  const inspection = await f.manager.inspect(path)
  expect(JSON.stringify(inspection)).not.toContain('private-fixture-token')
  await expect(f.manager.install({ path, contentHash: inspection.contentHash, allowPartial: true, requestId: randomUUID() })).rejects.toThrow('秘密值')
  expect(f.host.materialize).not.toHaveBeenCalled()
})
it('journals employee preparation before copying and never repeats a failed copy request', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), requestId = randomUUID()
  f.host.prepareBinding = vi.fn(async () => { expect(await f.manager.getOperation(requestId)).toMatchObject({ status: 'preparing' }); throw new Error('copy unavailable') })
  const request = { installationId: first.id, expectedRevision: 1, requestId, employeeId: 'employee-a', expectedBindingRevision: 0, expectedConfigVersion: 1, contributionIds: [first.contributions[0].id] }
  await expect(f.manager.bind(request)).rejects.toThrow('copy unavailable')
  expect(await f.manager.bind(request)).toMatchObject({ status: 'interrupted' }); expect(f.host.prepareBinding).toHaveBeenCalledTimes(1)
  expect(f.manager.listBindings(first.id)).toEqual([]); expect(f.host.retire).not.toHaveBeenCalled()
})
it('refuses an update while a native employee still holds skill files even without a source lease', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), path = await pkg(f.root, { version: '2.0.0' }), inspection = await f.manager.inspect(path)
  vi.mocked(f.host.materialize).mockClear()
  f.host.assertIdle = vi.fn(async () => { throw new Error('员工仍在使用技能副本') })
  await expect(f.manager.update({ installationId: first.id, expectedRevision: first.revision, path, contentHash: inspection.contentHash, approvedContributionKeys: [], requestId: randomUUID() })).rejects.toThrow('仍在使用技能')
  expect(f.host.materialize).not.toHaveBeenCalled(); expect(f.host.drain).not.toHaveBeenCalled()
  expect(f.manager.get(first.id).contentHash).toBe(first.contentHash)
})
it('rechecks a lease admitted during asynchronous update inspection before preparing the next version', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)); await f.bind(first)
  await f.manager.setEnabled({ installationId: first.id, expectedRevision: 1, enabled: true, requestId: randomUUID() })
  const path = await pkg(f.root, { version: '2.0.0' }), inspection = await f.manager.inspect(path)
  const grant = { installationId: first.id, contributionId: first.contributions[0].id, employeeId: 'employee-a', version: first.contentHash }
  let release: (() => void) | undefined
  vi.spyOn(f.manager, 'inspect').mockImplementationOnce(async () => { release = f.manager.acquire(grant); return inspection })
  vi.mocked(f.host.materialize).mockClear()
  const receipt = await f.manager.update({ installationId: first.id, expectedRevision: 2, path, contentHash: inspection.contentHash, approvedContributionKeys: [], requestId: randomUUID() })
  expect(receipt?.status).toBe('failed'); expect(f.host.materialize).not.toHaveBeenCalled(); expect(f.manager.get(first.id).contentHash).toBe(first.contentHash)
  expect(f.manager.canUse(grant)).toBe(true); release!()
})

async function cleanupChange(f: Awaited<ReturnType<typeof setup>>, first: CapabilityInstallation, action: 'update' | 'uninstall', requestId: string) {
  if (action === 'uninstall') return () => f.manager.uninstall({ installationId: first.id, expectedRevision: first.revision, requestId })
  const path = await pkg(f.root, { version: '2.0.0' }), inspected = await f.manager.inspect(path)
  return () => f.manager.update({ installationId: first.id, expectedRevision: first.revision, requestId, path, contentHash: inspected.contentHash, approvedContributionKeys: [] })
}

it.each(['update', 'uninstall'] as const)('keeps %s cleanup pending while retiring and records a final marker even when nothing is retained', async action => {
  const f = await setup(), first = await f.install(await pkg(f.root)), requestId = randomUUID()
  const change = await cleanupChange(f, first, action, requestId), retire = vi.mocked(f.host.retire).getMockImplementation()!
  let entered = false, release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  vi.mocked(f.host.retire).mockImplementationOnce(async (...args) => { entered = true; await hold; return retire(...args) })
  const pending = change()
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    expect(await f.manager.getOperation(requestId)).toMatchObject({ status: 'completed', phase: 'committed' })
    expect(f.manager.get(first.id).revision).toBe(first.revision + 1)
    expect(await f.store.load('testContributions')).not.toEqual([])
  } finally { release() }
  expect(await pending).toMatchObject({ status: 'completed', phase: 'committed-cleaned', retained: [] })
  const files = new CapabilityPackageFiles(join(f.root, 'data'))
  await expect(access(files.directory(first))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['update', 'uninstall'] as const)('recovers committed %s ownership after retirement and final cleanup marker both fail', async action => {
  const f = await setup(), first = await f.install(await pkg(f.root)), requestId = randomUUID()
  const change = await cleanupChange(f, first, action, requestId), files = new CapabilityPackageFiles(join(f.root, 'data'))
  vi.mocked(f.host.retire).mockRejectedValueOnce(new Error('retirement unavailable'))
  const write = f.store.write.bind(f.store)
  const marker = vi.spyOn(f.store, 'write').mockImplementation(async (records, removals) => {
    if (records.some(record => record.collection === 'capabilityOperations' && record.id === requestId && (record.value as { phase?: string }).phase === 'committed-cleanup-required')) throw new Error('cleanup marker unavailable')
    return write(records, removals)
  })
  await expect(change()).rejects.toThrow('cleanup marker unavailable')
  marker.mockRestore()
  expect(await f.manager.getOperation(requestId)).toMatchObject({ status: 'completed', phase: 'committed' })
  expect((await f.manager.getOperation(requestId))?.retained).toBeUndefined()
  expect(await readFile(join(files.directory(first), 'plugin.json'), 'utf8')).toContain('test-package')
  const materializations = vi.mocked(f.host.materialize).mock.calls.length, bindings = vi.mocked(f.host.applyBinding).mock.calls.length
  const restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  expect(await restarted.recover(requestId)).toMatchObject({ status: 'completed', phase: 'committed-cleaned', retained: [] })
  expect(f.host.materialize).toHaveBeenCalledTimes(materializations); expect(f.host.applyBinding).toHaveBeenCalledTimes(bindings)
  await expect(access(files.directory(first))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await f.store.load<{ id: string }>('testContributions')).some(value => first.contributions.some(contribution => contribution.objectId === value.id))).toBe(false)
  expect(restarted.get(first.id).retained).toBeUndefined()
})

it('recovers a lost recovery response after restart without repeating cleanup for the same attempt', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), originalRequestId = randomUUID(), attemptRequestId = randomUUID()
  vi.mocked(f.host.retire).mockRejectedValueOnce(new Error('retirement unavailable'))
  expect(await f.manager.uninstall({ installationId: first.id, expectedRevision: first.revision, requestId: originalRequestId })).toMatchObject({ phase: 'committed-cleanup-required' })
  const retire = vi.mocked(f.host.retire).getMockImplementation()!
  let entered = false, release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  vi.mocked(f.host.retire).mockImplementationOnce(async (...args) => { entered = true; await hold; return retire(...args) })
  const pending = f.manager.recover(originalRequestId, attemptRequestId)
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    expect(await f.manager.recoveryReceipt(attemptRequestId)).toBeUndefined()
    expect(await f.manager.getOperation(attemptRequestId)).toMatchObject({ action: 'recover', status: 'preparing' })
    expect(await f.manager.getOperation(attemptRequestId)).not.toHaveProperty('originalRequestId')
  } finally { release() }
  const completed = await pending
  expect(completed).toMatchObject({ requestId: originalRequestId, status: 'completed', phase: 'committed-cleaned' })
  const cleanupCalls = vi.mocked(f.host.retire).mock.calls.length
  const restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  expect(await restarted.recoveryReceipt(attemptRequestId)).toEqual(completed)
  expect(await restarted.recover(originalRequestId, attemptRequestId)).toEqual(completed)
  expect(f.host.retire).toHaveBeenCalledTimes(cleanupCalls)
  expect(await restarted.getOperation(attemptRequestId)).not.toHaveProperty('recoveryResult')
  await expect(restarted.recover(randomUUID(), attemptRequestId)).rejects.toThrow('请求标识')
})

it('reports an interrupted recovery attempt after restart without claiming the original cleanup completed or replaying it', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), originalRequestId = randomUUID(), attemptRequestId = randomUUID()
  vi.mocked(f.host.retire).mockRejectedValueOnce(new Error('retirement unavailable'))
  await f.manager.uninstall({ installationId: first.id, expectedRevision: first.revision, requestId: originalRequestId })
  vi.mocked(f.host.retire).mockRejectedValueOnce(new Error('still unavailable'))
  const write = f.store.write.bind(f.store)
  const missingReceipt = vi.spyOn(f.store, 'write').mockImplementation(async (records, removals) => {
    if (records.some(record => record.collection === 'capabilityOperations' && record.id === attemptRequestId && (record.value as { status?: string }).status !== 'preparing')) throw new Error('recovery receipt unavailable')
    return write(records, removals)
  })
  await expect(f.manager.recover(originalRequestId, attemptRequestId)).rejects.toThrow('recovery receipt unavailable')
  missingReceipt.mockRestore()
  expect(await f.manager.recoveryReceipt(attemptRequestId)).toBeUndefined()
  const cleanupCalls = vi.mocked(f.host.retire).mock.calls.length
  const restarted = new CapabilityPackages(f.store, join(f.root, 'data'), f.host); await restarted.init()
  const interrupted = await restarted.recoveryReceipt(attemptRequestId)
  expect(interrupted).toMatchObject({ requestId: attemptRequestId, action: 'recover', status: 'interrupted', phase: 'recovery-required' })
  expect(await restarted.getOperation(originalRequestId)).toMatchObject({ requestId: originalRequestId, action: 'uninstall', status: 'completed', phase: 'committed-cleanup-required', retained: [expect.any(String)] })
  expect(await restarted.recover(originalRequestId, attemptRequestId)).toEqual(interrupted)
  expect(f.host.retire).toHaveBeenCalledTimes(cleanupCalls)
  const retried = await restarted.recover(originalRequestId, randomUUID())
  expect(retried).toMatchObject({ requestId: originalRequestId, status: 'completed', phase: 'committed-cleaned', retained: [] })
  expect(f.host.retire).toHaveBeenCalledTimes(cleanupCalls + 1)
})

it('keeps the real application receipt running after uninstall commits until its owned cleanup result settles', async () => {
  const f = await setup(), first = await f.install(await pkg(f.root)), files = new CapabilityPackageFiles(join(f.root, 'data'))
  const customized = join(files.directory(first), 'skills/test-method/SKILL.md')
  await writeFile(customized, 'Preserve this user customization')
  // The actual operation factory uses only the real package manager for this path; credential adapters are not involved.
  const application = new ApplicationService(f.store, capabilityPackageOperations({ packages: f.manager } as CapabilityPackageServices), async () => {})
  const retire = vi.mocked(f.host.retire).getMockImplementation()!
  let entered = false, release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  vi.mocked(f.host.retire).mockImplementationOnce(async (...args) => { entered = true; await hold; return retire(...args) })
  const requestId = 'application-uninstall-cleanup', pending = application.call({ operation: 'capabilityPackages.uninstall', input: { installationId: first.id, expectedRevision: first.revision }, requestId })
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    expect(f.manager.get(first.id).status).toBe('uninstalled')
    const current = await application.receipt({ requestId })
    expect(current).toMatchObject({ status: 'running' }); expect(current?.finishedAt).toBeUndefined()
    expect(await f.manager.getOperation(`application-${current!.receiptId}`)).toMatchObject({ status: 'completed', phase: 'committed' })
  } finally { release() }
  const completed = await pending
  expect(completed).toMatchObject({ status: 'succeeded', data: { status: 'completed', phase: 'committed-cleanup-required', retained: [expect.any(String)] } })
  expect(await application.receipt({ requestId })).toEqual(completed)
  expect(await readFile(customized, 'utf8')).toBe('Preserve this user customization')
})
