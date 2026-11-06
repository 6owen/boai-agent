/*
 * [INPUT]: Real SQLite, isolated package/employee files, original SourceService and HTTP MCP transport.
 * [OUTPUT]: Actual MCP binding/call, secret target isolation, frozen skill hashes, CAS admission, idle-run protection and safe lifecycle evidence.
 * [OUTPUT]: Native package guards capture original bindings, revalidate authority and cannot survive lifecycle changes.
 * [POS]: WT2 domain integration; no live account/model or desktop acceptance.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import { CapabilityPackageServices, type CapabilityServicesPort } from '../packages/runtime/src/modules/resources/capability-package-services'
import type { DigitalAgent, Resource } from '../packages/shared/src/domain'
import type { CapabilityInstallation } from '../packages/shared/src/domain/capability-packages'
import type { NativeCapabilityInventory } from '../packages/runtime/src/modules/resources/capability-native-ownership'
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function setup(auth = false, options: { skillOnly?: boolean; stdio?: boolean } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-services-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  let calls = 0, requests = 0
  const server = createServer((req, res) => { requests++; let body = ''; req.on('data', chunk => { body += chunk }); req.on('end', () => {
    if (auth && req.headers.authorization !== 'Bearer fixture-private-token') { res.writeHead(401); res.end(); return }
    const message = body ? JSON.parse(body) : {}
    if (message.id === undefined) { res.writeHead(202); res.end(); return }
    const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'local-fixture', version: '1.0.0' } }
      : message.method === 'tools/list' ? { tools: [{ name: 'echo', description: 'Read fixture', inputSchema: { type: 'object' } }] }
        : (calls++, { content: [{ type: 'text', text: JSON.stringify({ input: message.params.arguments, token: req.headers.authorization ?? '' }) }] })
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`
  const store = new ProductStore(join(root, 'data.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), secrets = { get: async (id: string) => vault.get(id), set: async (id: string, value: string) => { vault.set(id, value) }, delete: async (id: string) => { vault.delete(id) } }
  const sources = new SourceService(store, secrets, root, { critical: action => action(), install: () => {}, changed: async () => {} }); await sources.init(); cleanups.push(() => sources.close())
  const port: CapabilityServicesPort = { store, dataPath: root, sources, changed: vi.fn(async () => {}), drainEmployees: vi.fn(async () => {}), assertEmployeesIdle: vi.fn(async () => {}), assertNativeOwnership: vi.fn(async () => { throw new Error('未知原生包归属') }) }
  const services = new CapabilityPackageServices(port); await services.init(); cleanups.push(() => services.packages.close())
  const agent = (id: string): DigitalAgent => ({ id, name: id, role: '', instructions: '', color: '#888888', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: false, active: true, configVersion: 1 })
  await store.write(['employee-a', 'bobo'].map(id => ({ collection: 'agents', id, value: agent(id) })))
  const path = join(root, 'input'); await mkdir(join(path, 'skills', 'fixture-method'), { recursive: true })
  await writeFile(join(path, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'fixture-package', version: '1', repository: 'https://example.test/wt2' }))
  await writeFile(join(path, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Exercise current input.\n---\nCall the actual echo tool with the provided input.')
  const marker = join(root, 'stdio-was-started.txt')
  const stdio = { type: 'stdio', command: process.execPath, args: ['-e', "require('node:fs').writeFileSync(process.argv[1], process.env.WT2_PACKAGE_SECRET ? 'secret-present' : 'secret-missing')", marker], env: { WT2_PACKAGE_SECRET: '${WT2_PACKAGE_SECRET}' } }
  if (!options.skillOnly) await writeFile(join(path, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { fixture: options.stdio ? stdio : { type: 'streamable-http', url, ...(auth ? { extensions: { 'com.openai': { auth: { type: 'api_key', headerScheme: 'bearer' } } } } : {}) } } }))
  const inspected = await services.packages.inspect(path), installed = await services.packages.install({ path, contentHash: inspected.contentHash, requestId: randomUUID() })
  expect(installed?.status).toBe('completed')
  const installation = services.packages.get(installed!.installationId)
  const bind = async (value = installation, employeeId = 'employee-a', expectedConfigVersion = 1) => services.packages.bind({ installationId: value.id, expectedRevision: value.revision, employeeId, expectedConfigVersion, expectedBindingRevision: 0, contributionIds: value.contributions.map(item => item.id), requestId: randomUUID() })
  const enable = async () => { await services.packages.setEnabled({ installationId: installation.id, expectedRevision: services.packages.get(installation.id).revision, enabled: true, requestId: randomUUID() }); return services.packages.get(installation.id) }
  return { root, path, marker, store, sources, services, port, installation, bind, enable, requests: () => requests, calls: () => calls, vault }
}
const emptyNativeInventory: NativeCapabilityInventory = { owner: 'codex-local', skills: { complete: true, items: [] }, sources: { complete: true, items: [] } }
it('checks native ownership only for the current employee active bindings and validates both sides of proof', async () => {
  const f = await setup(false, { skillOnly: true })
  const employee = { ...(await f.store.get<DigitalAgent>('agents', 'employee-a'))!, executionBackend: { kind: 'codex-local' as const, profileId: 'fixture-native' } }
  await f.store.write([{ collection: 'agents', id: employee.id, value: employee }])
  vi.mocked(f.port.assertNativeOwnership).mockResolvedValue(undefined)
  await f.bind()
  expect(f.services.hasBindings(employee.id)).toBe(true)
  expect(f.services.nativeGuard(employee, async () => {})).toBeUndefined()
  await f.enable()
  const validate = vi.fn(async () => {})
  const guard = f.services.nativeGuard(employee, validate)!
  await guard(emptyNativeInventory)
  expect(validate).toHaveBeenCalledTimes(2)
  expect(f.services.nativeGuard({ ...employee, id: 'bobo' }, validate)).toBeUndefined()
  const definition = f.installation.definitions.find(value => value.kind === 'skill')!
  await expect(guard({ ...emptyNativeInventory, skills: { complete: true, items: [{ name: definition.kind === 'skill' ? definition.name : '', path: '/native/SKILL.md', contentHash: '0'.repeat(64) }] } })).rejects.toThrow(/重复|归属|加载/)
})
it('invalidates captured native proof on package lifecycle changes and does not reuse proof after restart', async () => {
  const f = await setup(false, { skillOnly: true })
  const employee = { ...(await f.store.get<DigitalAgent>('agents', 'employee-a'))!, executionBackend: { kind: 'codex-local' as const, profileId: 'fixture-native' } }
  await f.store.write([{ collection: 'agents', id: employee.id, value: employee }])
  vi.mocked(f.port.assertNativeOwnership).mockResolvedValue(undefined)
  await f.bind(); const active = await f.enable()
  const guard = f.services.nativeGuard(employee, async () => {})!
  await guard(emptyNativeInventory)
  await f.services.packages.setEnabled({ installationId: active.id, expectedRevision: active.revision, enabled: false, requestId: randomUUID() })
  await expect(guard(emptyNativeInventory)).rejects.toThrow('已变化')
  await f.enable()
  await f.services.packages.close()
  const restored = new CapabilityPackageServices(f.port); await restored.init()
  cleanups.push(() => restored.packages.close())
  const nextGuard = restored.nativeGuard(employee, async () => {})!
  await expect(nextGuard({ ...emptyNativeInventory, skills: { complete: false, items: [] } })).rejects.toThrow()
  await nextGuard(emptyNativeInventory)
})
it('never accepts native ownership after caller authority is revoked', async () => {
  const f = await setup(false, { skillOnly: true })
  const employee = { ...(await f.store.get<DigitalAgent>('agents', 'employee-a'))!, executionBackend: { kind: 'codex-local' as const, profileId: 'fixture-native' } }
  await f.store.write([{ collection: 'agents', id: employee.id, value: employee }])
  vi.mocked(f.port.assertNativeOwnership).mockResolvedValue(undefined)
  await f.bind(); await f.enable()
  const guard = f.services.nativeGuard(employee, async () => { throw new Error('original execution revoked') })!
  await expect(guard(emptyNativeInventory)).rejects.toThrow('original execution revoked')
})
it('uses the original MCP transport only after employee binding, rejects bobo and drains before disable', async () => {
  const f = await setup(), contribution = f.installation.contributions.find(value => value.kind === 'source')!
  expect(f.requests()).toBe(0); expect(f.sources.allSummaries('bobo')).toEqual([])
  await f.bind(); const active = await f.enable()
  expect(f.sources.summaries([contribution.objectId], 'bobo')).toEqual([])
  const ref = f.sources.summaries([contribution.objectId], 'employee-a')[0]
  await expect(f.sources.use(ref, 'bypass', AbortSignal.timeout(10000), undefined, undefined, 'all', undefined, 'bobo')).rejects.toThrow('未绑定')
  expect(f.requests()).toBe(0)
  const catalog = await f.sources.use(ref, 'allowed', AbortSignal.timeout(10000), undefined, undefined, 'all', undefined, 'employee-a')
  expect(catalog).toMatchObject({ tools: [{ name: 'echo' }] })
  const result = await f.sources.use(ref, 'allowed', AbortSignal.timeout(10000), { sourceId: ref.id, tool: 'echo', arguments: { task: 'new input' } }, undefined, 'all', undefined, 'employee-a')
  expect(JSON.stringify(result)).toContain('new input'); expect(f.calls()).toBe(1)
  const employee = await f.store.get<DigitalAgent>('agents', 'employee-a'), bobo = await f.store.get<DigitalAgent>('agents', 'bobo')
  expect(employee!.skillIds).toHaveLength(1); expect(bobo!.skillIds).toEqual([])
  expect(f.services.canUseResource(employee!.skillIds[0], 'employee-a')).toBe(true)
  expect(f.services.canUseResource(employee!.skillIds[0], 'bobo')).toBe(false)
  await f.services.packages.setEnabled({ installationId: active.id, expectedRevision: active.revision, enabled: false, requestId: randomUUID() })
  expect(f.sources.allSummaries('employee-a')).toEqual([]); expect(f.services.canUseResource(employee!.skillIds[0], 'employee-a')).toBe(false)
  await expect(f.sources.use(ref, 'old', AbortSignal.timeout(1000), undefined, undefined, 'all', undefined, 'employee-a')).rejects.toThrow()
  expect(f.calls()).toBe(1)
})
it('requires explicit secret configuration and preserves credentials across approved package update', async () => {
  const f = await setup(true), contribution = f.installation.contributions.find(value => value.kind === 'source')!
  await expect(f.bind()).rejects.toThrow('凭据'); expect(f.requests()).toBe(0)
  const requestId = randomUUID(), configure = { installationId: f.installation.id, expectedRevision: 1, contributionId: contribution.id, expectedSourceRevision: 1, credential: 'fixture-private-token' }
  const configured = await f.services.configure(configure, requestId)
  expect(await f.services.configure(configure, requestId)).toEqual(configured)
  expect(JSON.stringify(await f.store.load('dataSources'))).not.toContain('fixture-private-token')
  expect(JSON.stringify(await f.store.load('sourceCreations'))).not.toContain('fixture-private-token')
  await f.bind(); let active = await f.enable()
  const ref = f.sources.allSummaries('employee-a')[0]
  const result = await f.sources.use(ref, 'auth', AbortSignal.timeout(10000), { sourceId: ref.id, tool: 'echo', arguments: {} }, undefined, 'all', undefined, 'employee-a')
  expect(JSON.stringify(result)).not.toContain('fixture-private-token'); await f.sources.closeRun('auth')
  await writeFile(join(f.path, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Updated method.\n---\nUse the input and verify the returned echo.')
  const inspection = await f.services.packages.inspect(f.path)
  const updated = await f.services.packages.update({ installationId: active.id, expectedRevision: active.revision, path: f.path, contentHash: inspection.contentHash, approvedContributionKeys: inspection.definitions.map(value => value.key), requestId: randomUUID() })
  expect(updated?.status).toBe('completed'); active = f.services.packages.get(active.id)
  expect(active.contentHash).toBe(inspection.contentHash)
  const next = f.sources.allSummaries('employee-a')[0]
  expect(next.id).not.toBe(ref.id); expect(f.sources.get(next.id).hasCredential).toBe(true)
  await f.services.packages.uninstall({ installationId: active.id, expectedRevision: active.revision, requestId: randomUUID() })
  expect(f.sources.list()).toEqual([]); expect(f.vault.size).toBe(0)
})
it('keeps a customized employee skill as an independent object on uninstall', async () => {
  const f = await setup(); await f.bind(); await f.enable()
  const employee = await f.store.get<DigitalAgent>('agents', 'employee-a'), id = employee!.skillIds[0]
  const resource = await f.store.get<Resource>('resources', id)
  await writeFile(join(resource!.path, 'SKILL.md'), 'User customized this copy')
  const active = f.services.packages.get(f.installation.id)
  const removed = await f.services.packages.uninstall({ installationId: active.id, expectedRevision: active.revision, requestId: randomUUID() })
  expect(removed?.retained).toContain(resource!.path)
  expect(await readFile(join(resource!.path, 'SKILL.md'), 'utf8')).toBe('User customized this copy')
  expect(await f.store.get('resources', id)).toBeDefined()
  expect((await f.store.get<DigitalAgent>('agents', 'employee-a'))!.skillIds).toEqual([])
  expect(f.services.canUseResource(id, 'employee-a')).toBe(true)
  await f.services.packages.close()
  const restored = new CapabilityPackageServices(f.port); await restored.init()
  cleanups.push(() => restored.packages.close())
  expect(restored.managedResourcePath(resource!)).toBe(resource!.path)
  expect(restored.canUseResource(id, 'employee-a')).toBe(true)
  expect(await readFile(join(restored.managedResourcePath(resource!)!, 'SKILL.md'), 'utf8')).toBe('User customized this copy')
})
it('refuses mismatched managed copy ownership rather than relocating an unrelated employee resource', async () => {
  const f = await setup(false, { skillOnly: true }); await f.bind()
  const employee = (await f.store.get<DigitalAgent>('agents', 'employee-a'))!
  const resource = (await f.store.get<Resource>('resources', employee.skillIds[0]))!
  expect(() => f.services.managedResourcePath({ ...resource, ownerAgentId: 'bobo' })).toThrow('身份不一致')
  const copies = await f.store.load<{ id: string; employeeId?: string; files: { resourceId: string } }>('capabilitySkillCopies')
  const copy = copies.find(value => value.employeeId === employee.id)!
  await f.services.packages.close()
  await f.store.write([{ collection: 'capabilitySkillCopies', id: copy.id, value: { ...copy, files: { ...copy.files, resourceId: randomUUID() } } }])
  const restored = new CapabilityPackageServices(f.port)
  await expect(restored.init()).rejects.toThrow('身份不一致')
})

it('does not transfer a bearer credential to a changed endpoint and keeps the enabled original version usable after rejection', async () => {
  const f = await setup(true), source = f.installation.contributions.find(value => value.kind === 'source')!
  await f.services.configure({ installationId: f.installation.id, expectedRevision: 1, contributionId: source.id, expectedSourceRevision: 1, credential: 'fixture-private-token' }, randomUUID())
  await f.bind(); const active = await f.enable()
  const mcp = JSON.parse(await readFile(join(f.path, 'mcp.json'), 'utf8'))
  mcp.mcpServers.fixture.url += '/another-account'
  await writeFile(join(f.path, 'mcp.json'), JSON.stringify(mcp))
  const inspected = await f.services.packages.inspect(f.path)
  const update = { installationId: active.id, expectedRevision: active.revision, path: f.path, contentHash: inspected.contentHash, approvedContributionKeys: ['source:fixture'], requestId: randomUUID() }
  const failed = await f.services.packages.update(update)
  expect(failed).toMatchObject({ status: 'failed', phase: 'rolled-back' })
  expect(f.services.packages.get(active.id)).toMatchObject({ contentHash: active.contentHash, enabled: true })
  expect(f.sources.list()).toHaveLength(1); expect(f.sources.get(source.objectId).hasCredential).toBe(true); expect(f.vault.size).toBe(1)
  expect(f.requests()).toBe(0)
  const ref = f.sources.allSummaries('employee-a')[0]
  const result = await f.sources.use(ref, 'still-original', AbortSignal.timeout(10000), { sourceId: ref.id, tool: 'echo', arguments: { stage: 'old version remains' } }, undefined, 'all', undefined, 'employee-a')
  expect(JSON.stringify(result)).toContain('old version remains'); expect(JSON.stringify(result)).not.toContain('fixture-private-token'); await f.sources.closeRun('still-original')
  await f.services.packages.setEnabled({ installationId: active.id, expectedRevision: active.revision, enabled: false, requestId: randomUUID() })
  const disabled = f.services.packages.get(active.id), changed = await f.services.packages.update({ ...update, expectedRevision: disabled.revision, requestId: randomUUID() })
  expect(changed?.status).toBe('completed')
  const nextSource = f.sources.list()[0]
  expect(nextSource.id).not.toBe(source.objectId); expect(nextSource.hasCredential).toBe(false); expect(f.vault.size).toBe(0)
  await expect(f.services.packages.setEnabled({ installationId: active.id, expectedRevision: f.services.packages.get(active.id).revision, enabled: true, requestId: randomUUID() })).rejects.toThrow('缺少凭据')
})
it('rejects a modified package snapshot before adopting its bytes as a skill baseline', async () => {
  const f = await setup(false, { skillOnly: true }), original = f.services.materialize.bind(f.services)
  const manifest = JSON.parse(await readFile(join(f.path, 'plugin.json'), 'utf8')); manifest.name = 'second-package'; manifest.repository += '/second'
  await writeFile(join(f.path, 'plugin.json'), JSON.stringify(manifest))
  const inspection = await f.services.packages.inspect(f.path)
  let failure: unknown
  vi.spyOn(f.services, 'materialize').mockImplementationOnce(async (installation, directory) => {
    await writeFile(join(directory, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Unexpected replacement.\n---\nUnreviewed bytes.')
    try { await original(installation, directory) } catch (error) { failure = error; throw error }
  })
  const result = await f.services.packages.install({ path: f.path, contentHash: inspection.contentHash, requestId: randomUUID() })
  expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toContain('不能采用修改后的基线')
  expect(result?.status).toBe('interrupted'); expect(result?.retained).toHaveLength(1)
  expect(f.services.packages.list()).toHaveLength(1)
  expect(await f.store.load('capabilitySkillCopies')).toHaveLength(1); expect(await f.store.load('resources')).toEqual([])
})
it('does not create employee skill copies for stale package, binding or employee revisions', async () => {
  const f = await setup(false, { skillOnly: true })
  const base = { installationId: f.installation.id, expectedRevision: 1, employeeId: 'employee-a', expectedConfigVersion: 1, expectedBindingRevision: 0, contributionIds: f.installation.contributions.map(value => value.id) }
  const copies = () => f.store.load<{ employeeId?: string }>('capabilitySkillCopies')
  await expect(f.services.packages.bind({ ...base, expectedRevision: 99, requestId: randomUUID() })).rejects.toThrow('版本已变化')
  await expect(f.services.packages.bind({ ...base, expectedBindingRevision: 99, requestId: randomUUID() })).rejects.toThrow('绑定已变化')
  await expect(f.services.packages.bind({ ...base, expectedConfigVersion: 99, requestId: randomUUID() })).rejects.toThrow('员工配置已变化')
  expect((await copies()).filter(value => value.employeeId)).toEqual([])
  expect((await f.store.get<DigitalAgent>('agents', 'employee-a'))?.skillIds).toEqual([])
  expect(await f.store.load('resources')).toEqual([])
})
it('rejects a reused configuration request with a different secret and returns only the original credential-free receipt', async () => {
  const f = await setup(true), source = f.installation.contributions.find(value => value.kind === 'source')!, requestId = randomUUID()
  const input = { installationId: f.installation.id, expectedRevision: 1, contributionId: source.id, expectedSourceRevision: 1, credential: 'fixture-private-token' }
  const original = await f.services.configure(input, requestId)
  await expect(f.services.configure({ ...input, credential: 'different-private-token' }, requestId)).rejects.toThrow('不同的数据源配置')
  expect(await f.services.configure(input, requestId)).toEqual(original)
  expect(await f.services.configureReceipt(requestId)).toEqual(original)
  expect(await f.sources.getCredential({ id: source.objectId, expectedRevision: 2 })).toBe('fixture-private-token')
  expect(f.vault.size).toBe(1)
  for (const collection of ['dataSources', 'sourceCreations', 'capabilityPackages', 'capabilityOperations']) expect(JSON.stringify(await f.store.load(collection))).not.toMatch(/fixture-private-token|different-private-token/)
  expect(f.requests()).toBe(0)
})
it('checks actual employee idleness for skill-only packages and does not interrupt an active employee to update', async () => {
  const f = await setup(false, { skillOnly: true }); await f.bind(); const active = await f.enable()
  expect(f.sources.list()).toEqual([])
  const beforeCopies = await f.store.load('capabilitySkillCopies'), employee = await f.store.get<DigitalAgent>('agents', 'employee-a'), resource = await f.store.get<Resource>('resources', employee!.skillIds[0])
  await writeFile(join(f.path, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Another method.\n---\nUse another input.')
  const inspection = await f.services.packages.inspect(f.path)
  vi.mocked(f.port.assertEmployeesIdle).mockRejectedValueOnce(new Error('employee-a has an active native run'))
  await expect(f.services.packages.update({ installationId: active.id, expectedRevision: active.revision, path: f.path, contentHash: inspection.contentHash, approvedContributionKeys: ['skill:fixture-method'], requestId: randomUUID() })).rejects.toThrow('active native run')
  expect(f.port.assertEmployeesIdle).toHaveBeenCalledWith(['employee-a']); expect(f.port.drainEmployees).not.toHaveBeenCalled()
  expect(f.services.packages.get(active.id).contentHash).toBe(active.contentHash)
  expect(await f.store.load('capabilitySkillCopies')).toEqual(beforeCopies)
  expect(await readFile(join(resource!.path, 'SKILL.md'), 'utf8')).toContain('Call the actual echo')
})
it('keeps an actual MCP session lease pinned until SourceService closes the run', async () => {
  const f = await setup(); await f.bind(); const active = await f.enable(), ref = f.sources.allSummaries('employee-a')[0]
  await f.sources.use(ref, 'pinned-run', AbortSignal.timeout(10000), undefined, undefined, 'all', undefined, 'employee-a')
  await writeFile(join(f.path, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Updated echo.\n---\nRead the echo result.')
  const inspection = await f.services.packages.inspect(f.path), request = { installationId: active.id, expectedRevision: active.revision, path: f.path, contentHash: inspection.contentHash, approvedContributionKeys: ['skill:fixture-method'], requestId: randomUUID() }
  await expect(f.services.packages.update(request)).rejects.toThrow('仍在使用')
  const result = await f.sources.use(ref, 'pinned-run', AbortSignal.timeout(10000), { sourceId: ref.id, tool: 'echo', arguments: { lease: 'original' } }, undefined, 'all', undefined, 'employee-a')
  expect(JSON.stringify(result)).toContain('original'); expect(f.services.packages.get(active.id).contentHash).toBe(active.contentHash)
  await f.sources.closeRun('pinned-run')
  expect((await f.services.packages.update(request))?.status).toBe('completed')
  await expect(f.sources.use(ref, 'stale-run', AbortSignal.timeout(1000), undefined, undefined, 'all', undefined, 'employee-a')).rejects.toThrow()
})
it('does not grant or prepare copies for an unidentified native plugin ownership combination', async () => {
  const f = await setup(false, { skillOnly: true }), agent = (await f.store.get<DigitalAgent>('agents', 'employee-a'))!
  await f.store.write([{ collection: 'agents', id: agent.id, value: { ...agent, executionBackend: { kind: 'codex-local', profileId: 'fixture-native' } } }])
  await expect(f.bind()).rejects.toThrow('未知原生包归属')
  expect(f.port.assertNativeOwnership).toHaveBeenCalledOnce()
  expect(f.services.packages.listBindings(f.installation.id)).toEqual([])
  expect((await f.store.load<{ employeeId?: string }>('capabilitySkillCopies')).filter(value => value.employeeId)).toEqual([])
})
it('revokes authenticated package access before any new handshake when its credential is removed', async () => {
  const f = await setup(true), source = f.installation.contributions.find(value => value.kind === 'source')!
  await f.services.configure({ installationId: f.installation.id, expectedRevision: 1, contributionId: source.id, expectedSourceRevision: 1, credential: 'fixture-private-token' }, randomUUID())
  await f.bind(); const active = await f.enable()
  await f.services.configure({ installationId: active.id, expectedRevision: active.revision, contributionId: source.id, expectedSourceRevision: 2, credential: '' }, randomUUID())
  const ref = f.sources.get(source.objectId), before = f.requests()
  expect(ref.hasCredential).toBe(false)
  await expect(f.sources.use(ref, 'revoked-auth', AbortSignal.timeout(5000), { sourceId: ref.id, tool: 'echo', arguments: {} }, undefined, 'all', undefined, 'employee-a')).rejects.toThrow()
  expect(f.requests()).toBe(before)
  await expect(f.sources.use(ref, 'revoked-directory', AbortSignal.timeout(5000), undefined, undefined, 'all', undefined, 'employee-a')).rejects.toThrow('凭据')
  expect(f.requests()).toBe(before)
})

it.each(['', JSON.stringify({ UNRELATED_SECRET: 'unrelated-value' })])('does not launch a stdio package with missing required secret environment (%s)', async credential => {
  const f = await setup(false, { stdio: true }), installation = f.installation, source = installation.contributions.find(value => value.kind === 'source')!
  await f.services.configure({ installationId: installation.id, expectedRevision: installation.revision, contributionId: source.id, expectedSourceRevision: 1, credential: JSON.stringify({ WT2_PACKAGE_SECRET: 'private-environment-value' }) }, randomUUID())
  await f.bind(); const active = await f.enable()
  await f.services.configure({ installationId: active.id, expectedRevision: active.revision, contributionId: source.id, expectedSourceRevision: 2, credential }, randomUUID())
  const ref = f.sources.get(source.objectId)
  await expect(f.sources.use(ref, 'revoked-stdio', AbortSignal.timeout(5000), undefined, undefined, 'all', undefined, 'employee-a')).rejects.toThrow()
  await expect(readFile(f.marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})
it('adds an explicitly approved source contribution while updating a previously skill-only package', async () => {
  const f = await setup(false, { skillOnly: true })
  await writeFile(join(f.path, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { extra: { type: 'streamable-http', url: 'http://127.0.0.1:9/mcp' } } }))
  const inspection = await f.services.packages.inspect(f.path), request = { installationId: f.installation.id, expectedRevision: 1, path: f.path, contentHash: inspection.contentHash, approvedContributionKeys: [], requestId: randomUUID() }
  await expect(f.services.packages.update(request)).rejects.toThrow('尚未明确授权')
  expect((await f.services.packages.update({ ...request, approvedContributionKeys: ['source:extra'] }))?.status).toBe('completed')
  expect(f.sources.list()).toHaveLength(1); expect(f.requests()).toBe(0)
})
