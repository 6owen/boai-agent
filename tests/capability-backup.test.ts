/*
 * [INPUT]: Production AppService/SQLite, isolated vaults, frozen package files and authenticated loopback MCP.
 * [OUTPUT]: Portable backup defaults, original binding/version recovery, bobo gate, explicit credential/enable recovery and frozen snapshot integrity.
 * [POS]: WT2 backup integration; no personal configuration, native program, model or GUI invocation.
 * [PROTOCOL]: Changes update Header and tests/.folder.md through its designated owner.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { startOwnedRuntime } from '../packages/runtime/src/bootstrap'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import { inspectResourceTree } from '../packages/runtime/src/modules/resources/local-resources'
import type { AppService } from '../packages/runtime/src/service'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import type { Snapshot } from '../packages/shared/src/domain'
import type { DataSource, SourceSummary } from '../packages/shared/src/domain/sources'
import type { ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { CapabilityBinding, CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '../packages/shared/src/domain/capability-packages'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const priorSecret = 'OLD_BACKUP_FIXTURE_SECRET', restoredSecret = 'NEW_BACKUP_FIXTURE_SECRET'
type CurrentPackage = { installation: CapabilityInstallation; bindings: CapabilityBinding[] }
const sources = (service: AppService) => (service as unknown as { dataSources: SourceService }).dataSources
const reference = ({ id, name, description, revision, type }: DataSource): SourceSummary => ({ id, name, description, revision, type })

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-backup-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const requests: { method: string; authorized: boolean }[] = [], values: unknown[] = []
  let expectedSecret = priorSecret
  const server = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk }); request.on('end', () => {
      const message = body ? JSON.parse(body) : {}, authorized = request.headers.authorization === `Bearer ${expectedSecret}`
      requests.push({ method: message.method ?? request.method ?? '', authorized })
      if (!authorized) { response.writeHead(401); response.end(); return }
      if (message.id === undefined) { response.writeHead(202); response.end(); return }
      const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'backup-fixture', version: '1' } }
        : message.method === 'tools/list' ? { tools: [{ name: 'echo', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }
          : (values.push(message.params.arguments), { content: [{ type: 'text', text: JSON.stringify(message.params.arguments) }] })
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
  })
  await new Promise<void>(ready => server.listen(0, '127.0.0.1', ready))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`
  const modelCall = vi.fn(async () => { throw new Error('Backup must not invoke any model') })
  const engine: AgentEngine = { test: modelCall, decide: modelCall, run: modelCall }
  const open = async (dataPath: string, vault = new Map<string, string>()) => {
    const secrets = { get: vi.fn(async (id: string) => vault.get(id)), set: vi.fn(async (id: string, value: string) => { vault.set(id, value) }), delete: vi.fn(async (id: string) => { vault.delete(id) }) }
    const options = { dataPath, skillDiscovery: { homeDir: join(root, 'isolated-home') }, engine, secrets, emit: () => {} }
    let owned = await startOwnedRuntime(options)
    cleanups.push(async () => { await owned.close() })
    const call = (name: string, input: unknown, write = false) => owned.service.handle('executeApplicationOperation', { operation: `capabilityPackages.${name}`, input, ...(write ? { requestId: randomUUID() } : {}) }) as Promise<ApplicationResult>
    const success = async <T>(name: string, input: unknown, write = false) => { const result = await call(name, input, write); expect(result.status, JSON.stringify(result)).toBe('succeeded'); return result.data as T }
    const agent = async (id: string) => (await owned.service.handle('snapshot', undefined) as Snapshot).agents.find(value => value.id === id)!
    return { get service() { return owned.service }, vault, secrets, call, success, agent, close: () => owned.close(), restart: async () => { await owned.close(); owned = await startOwnedRuntime(options) } }
  }
  const originalPath = join(root, 'original'), original = await open(originalPath)
  const input = join(root, 'input-package'); await mkdir(join(input, 'skills', 'backup-method'), { recursive: true })
  await writeFile(join(input, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'backup-package', version: '1.0.0', repository: 'https://example.test/backup-package' }))
  await writeFile(join(input, 'skills/backup-method/SKILL.md'), '---\nname: backup-method\ndescription: Verify the current invoice.\n---\nUse the currently supplied account mapping.\n')
  await writeFile(join(input, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { invoices: { type: 'streamable-http', url, extensions: { 'com.openai': { auth: { type: 'api_key', headerScheme: 'bearer' } } } } } }))
  const inspected = await original.success<CapabilityInspection>('inspect', { path: input })
  const installed = await original.success<CapabilityOperation>('install', { path: input, contentHash: inspected.contentHash }, true)
  const installationId = installed.installationId
  const current = (host = original) => host.success<CurrentPackage>('get', { installationId })
  let { installation } = await current()
  const contribution = installation.contributions.find(value => value.kind === 'source')!
  await original.success('configure', { installationId, expectedRevision: installation.revision, contributionId: contribution.id, expectedSourceRevision: sources(original.service).get(contribution.objectId).revision, credential: priorSecret }, true)
  for (const employeeId of ['researcher', 'bobo']) {
    const employee = await original.agent(employeeId)
    expect(employee.executionBackend?.kind ?? 'mastra-model').toBe('mastra-model')
    installation = (await current()).installation
    await original.success('bind', { installationId, expectedRevision: installation.revision, employeeId, expectedConfigVersion: employee.configVersion, expectedBindingRevision: 0, contributionIds: installation.contributions.map(value => value.id) }, true)
  }
  installation = (await current()).installation
  await original.success('setEnabled', { installationId, expectedRevision: installation.revision, enabled: true }, true)
  const ordinary = await original.service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: 'Ordinary MCP', description: '', guide: '', enabled: true, type: 'mcp', mcp: { transport: 'http', url, authType: 'bearer' } }, credential: priorSecret }) as DataSource
  const use = async (host: Awaited<ReturnType<typeof open>>, employeeId: string, forbidden = false) => {
    const source = sources(host.service), runId = `backup-use-${randomUUID()}`
    const ref = reference(source.get(contribution.objectId))
    try {
      const call = source.use(ref, runId, AbortSignal.timeout(10000), { sourceId: ref.id, tool: 'echo', arguments: { employeeId, restored: !forbidden } }, undefined, 'all', undefined, employeeId)
      if (forbidden) await expect(call).rejects.toThrow(/能力包|未启用|未获准/)
      else expect(JSON.stringify(await call)).toContain(employeeId)
    } finally { await source.closeRun(runId) }
  }
  return { root, originalPath, original, input, installationId, contribution, ordinary, current, use, open, modelCall, requests, values, switchSecret: () => { expectedSecret = restoredSecret } }
}

it('restores frozen packages disabled with no credentials and requires explicit original configure/enable for both API employee and bobo', async () => {
  const f = await fixture()
  await f.use(f.original, 'researcher'); await f.use(f.original, 'bobo')
  const originalPackage = await f.current(), expectedBindings = originalPackage.bindings
  const backup = join(f.root, 'backup'); await f.original.service.backup(backup)
  expect(JSON.parse(await readFile(join(backup, 'backup.json'), 'utf8'))).toMatchObject({ credentialsIncluded: false, capabilityPackageRestorePolicy: 'disabled' })
  const frozenRelative = join('capability-packages', f.installationId, originalPackage.installation.contentHash, 'package')
  expect((await inspectResourceTree(join(f.originalPath, frozenRelative))).hash).toBe(originalPackage.installation.contentHash)
  expect((await inspectResourceTree(join(backup, frozenRelative))).hash).toBe(originalPackage.installation.contentHash)
  const backupStore = await ProductStore.openReadOnly(join(backup, 'boai.sqlite'))
  try {
    const rows = await backupStore.load<DataSource & { credentialId?: string }>('dataSources')
    expect(rows.find(value => value.id === f.ordinary.id)).toMatchObject({ enabled: false })
    expect(rows.find(value => value.id === f.contribution.objectId)).toMatchObject({ enabled: true })
    expect(rows.every(value => value.credentialId === undefined)).toBe(true)
    expect(JSON.stringify(await backupStore.load('capabilityPackages'))).not.toContain(priorSecret)
  } finally { await backupStore.close() }
  const restoredPath = join(f.root, 'restored'); await cp(backup, restoredPath, { recursive: true })
  await f.original.close(); await rm(f.input, { recursive: true, force: true })
  f.switchSecret()
  const before = f.requests.length, restored = await f.open(restoredPath)
  expect(restored.vault.size).toBe(0)
  expect((await inspectResourceTree(join(restoredPath, frozenRelative))).hash).toBe(originalPackage.installation.contentHash)
  expect((await f.current(restored)).installation).toMatchObject({ id: f.installationId, enabled: false, contentHash: originalPackage.installation.contentHash, contributions: originalPackage.installation.contributions })
  expect((await f.current(restored)).bindings).toEqual(expectedBindings)
  expect(sources(restored.service).get(f.ordinary.id)).toMatchObject({ enabled: false, hasCredential: false })
  expect(sources(restored.service).get(f.contribution.objectId)).toMatchObject({ enabled: true, hasCredential: false })
  for (const id of ['researcher', 'bobo']) {
    expect(sources(restored.service).allSummaries(id).some(value => value.id === f.contribution.objectId)).toBe(false)
    await f.use(restored, id, true)
  }
  expect(f.requests).toHaveLength(before)
  await restored.restart()
  expect((await f.current(restored)).installation.enabled).toBe(false)
  expect(f.requests).toHaveLength(before)
  let current = await f.current(restored)
  const unavailable = await restored.call('setEnabled', { installationId: f.installationId, expectedRevision: current.installation.revision, enabled: true }, true)
  expect.soft(unavailable.status).toBe('rejected')
  expect((await f.current(restored)).installation.enabled).toBe(false)
  expect(f.requests).toHaveLength(before)
  current = await f.current(restored)
  await restored.success('configure', { installationId: f.installationId, expectedRevision: current.installation.revision, contributionId: f.contribution.id, expectedSourceRevision: sources(restored.service).get(f.contribution.objectId).revision, credential: restoredSecret }, true)
  expect(f.requests).toHaveLength(before)
  for (const id of ['researcher', 'bobo']) await f.use(restored, id, true)
  await restored.success('setEnabled', { installationId: f.installationId, expectedRevision: current.installation.revision, enabled: true }, true)
  expect((await f.current(restored)).bindings).toEqual(expectedBindings)
  for (const id of ['researcher', 'bobo']) await f.use(restored, id)
  expect(f.values.slice(-2)).toEqual([{ employeeId: 'researcher', restored: true }, { employeeId: 'bobo', restored: true }])
  expect(f.requests.slice(before).every(value => value.authorized)).toBe(true)
  const afterExplicitUse = f.requests.length
  await restored.restart()
  expect((await f.current(restored)).installation.enabled).toBe(true)
  expect(f.requests).toHaveLength(afterExplicitUse)
  current = await f.current(restored)
  await restored.success('setEnabled', { installationId: f.installationId, expectedRevision: current.installation.revision, enabled: false }, true)
  await restored.restart()
  expect((await f.current(restored)).installation.enabled).toBe(false)
  for (const id of ['researcher', 'bobo']) await f.use(restored, id, true)
  expect(f.requests).toHaveLength(afterExplicitUse)
  expect(f.modelCall).not.toHaveBeenCalled()
})

it.each(['missing', 'modified'] as const)('rejects a backup whose immutable package snapshot is %s instead of marking it complete', async fault => {
  const f = await fixture(), { installation } = await f.current()
  const path = join(f.originalPath, 'capability-packages', installation.id, installation.contentHash, 'package', 'skills', 'backup-method', 'SKILL.md')
  if (fault === 'missing') await rm(path); else await writeFile(path, 'Changed frozen content')
  const destination = join(f.root, 'incomplete-backup')
  await expect(f.original.service.backup(destination)).rejects.toThrow(/冻结原件|完整备份|ENOENT/)
  await expect(access(join(destination, 'backup.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.requests).toEqual([]); expect(f.modelCall).not.toHaveBeenCalled()
})
