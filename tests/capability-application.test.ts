/*
 * [INPUT]: Actual AppService/ProductStore, isolated package files, controlled engine and loopback MCP.
 * [OUTPUT]: Host business authority, package Source/Skill bridge isolation, template provenance and live receipt coverage.
 * [POS]: WT2 host integration; no real model, external account or GUI acceptance.
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md；共享索引由协调者维护。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { access, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { startOwnedRuntime } from '../packages/runtime/src/bootstrap'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createNativeProducts } from '../packages/runtime/src/adapters/native-products'
import { createSourceTools } from '../packages/runtime/src/adapters/mastra/source-tools'
import { CapabilityPackageServices } from '../packages/runtime/src/modules/resources/capability-package-services'
import { EMPLOYEE_PRESETS, resolveEmployeePreset } from '../packages/shared/src/domain/agent-presets'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { ApplicationCatalog, ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { CapabilityInspection, CapabilityInstallation, CapabilityOperation } from '../packages/shared/src/domain/capability-packages'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../packages/shared/src/domain'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const modelConfig = { name: 'Controlled API', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' }
async function fixture(overrides: Partial<AgentEngine> = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-capability-application-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const vault = new Map<string, string>()
  const engine: AgentEngine = { test: async () => 'unused', decide: async () => { throw new Error('No model expected') }, run: async () => { throw new Error('No model expected') }, ...overrides }
  const options = { dataPath: join(root, 'app'), skillDiscovery: { homeDir: root }, engine, secrets: { get: async (id: string) => vault.get(id), set: async (id: string, value: string) => { vault.set(id, value) }, delete: async (id: string) => { vault.delete(id) } }, emit: () => {} }
  const owned = await startOwnedRuntime(options); cleanups.push(owned.close)
  const call = (operation: string, input = {}, requestId?: string) => owned.service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  const agent = async (id: string) => (await owned.service.handle('snapshot', undefined) as Snapshot).agents.find(value => value.id === id)!
  const store = await ProductStore.openReadOnly(join(options.dataPath, 'boai.sqlite')); cleanups.push(() => store.close())
  return { root, owned, call, agent, store }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function packageInput(root: string, url?: string) {
  const path = join(root, 'package-input'); await mkdir(join(path, 'skills', 'fixture-method'), { recursive: true })
  await writeFile(join(path, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'host-fixture', version: '1', repository: 'https://example.test/host-fixture' }))
  await writeFile(join(path, 'skills/fixture-method/SKILL.md'), '---\nname: fixture-method\ndescription: Verify the supplied input.\n---\nReturn the verified PACKAGE_SKILL_FACT.')
  if (url) await writeFile(join(path, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { fixture: { type: 'streamable-http', url } } }))
  return path
}
async function install(f: Fixture, path: string) {
  const inspection = await f.call('capabilityPackages.inspect', { path })
  expect(inspection.status).toBe('succeeded')
  const result = await f.call('capabilityPackages.install', { path, contentHash: (inspection.data as CapabilityInspection).contentHash }, randomUUID())
  expect(result).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
  return (await f.call('capabilityPackages.get', { installationId: (result.data as CapabilityOperation).installationId })).data as { installation: CapabilityInstallation }
}
async function configureAgent(f: Fixture, id: string, connection: Connection) {
  const original = await f.agent(id)
  const { configVersion, workspaceRef: _workspace, memoryNamespace: _memory, policyVersion: _policy, ...definition } = original
  return await f.owned.service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, connectionId: connection.id, modelId: connection.defaultModel, executionPermission: 'full-access' }) as DigitalAgent
}
async function waitForAnswer(f: Fixture, room: Conversation, text: string, failure: () => unknown) {
  await vi.waitFor(async () => {
    if (failure()) throw failure()
    const detail = await f.owned.service.handle('getConversation', { id: room.id }) as ConversationDetail
    expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content === text)).toBe(true)
    expect(detail.runs.filter(run => run.phase === 'execution').some(run => run.status === 'completed')).toBe(true)
  }, { timeout: 15000 })
}
async function localMcp() {
  const calls: unknown[] = [], requests: string[] = []
  const server = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk }); req.on('end', () => {
      const message = body ? JSON.parse(body) : {}; requests.push(message.method ?? req.method)
      if (message.id === undefined) { res.writeHead(202); res.end(); return }
      let result: unknown
      if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'host-fixture', version: '1.0.0' } }
      else if (message.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Read the provided fixture input', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }
      else { calls.push(message.params.arguments); result = { content: [{ type: 'text', text: JSON.stringify(message.params.arguments) }] } }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`, calls, requests }
}

it('lets owner and bobo discover/manage packages while an unbound bobo cannot discover or call their Source', async () => {
  const server = await localMcp()
  let installation: CapabilityInstallation, failure: unknown, latest: EngineContext | undefined
  const f = await fixture({
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      latest = context
      try {
        const bridge = createNativeProducts(context)
        try {
          const catalog = await bridge.tools.find(tool => tool.name === 'boai_catalog')!.execute({ domain: 'capabilityPackages', includeSchemas: true }, 'discover-packages') as ApplicationCatalog
          expect(catalog.operations.map(operation => operation.name)).toContain('capabilityPackages.setEnabled')
          const result = await bridge.tools.find(tool => tool.name === 'boai_call')!.execute({ operation: 'capabilityPackages.setEnabled', input: { installationId: installation.id, expectedRevision: installation.revision, enabled: true }, requestId: 'enable-package' }, 'enable-package') as ApplicationResult
          expect(result).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
          const sourceId = installation.contributions.find(value => value.kind === 'source')!.objectId
          expect(context.dataSources?.some(source => source.id === sourceId)).toBe(false)
          await expect(context.inspectDataSource!(sourceId)).rejects.toThrow()
          await expect(context.callDataSource!({ sourceId, tool: 'echo', arguments: { forbidden: true } })).rejects.toThrow()
          expect(context.resources.some(resource => resource.name === 'fixture-method')).toBe(false)
        } finally { await bridge.dispose() }
        await context.onDelta('包已启用，调用仍需员工绑定。')
      } catch (error) { failure = error; throw error }
    },
  })
  const catalog = await f.owned.service.handle('getApplicationCatalog', { domain: 'capabilityPackages', includeSchemas: true }) as ApplicationCatalog
  expect(catalog.operations.map(operation => operation.name)).toEqual(expect.arrayContaining(['capabilityPackages.inspect', 'capabilityPackages.install', 'capabilityPackages.bind']))
  installation = (await install(f, await packageInput(f.root, server.url))).installation
  expect(await f.call('capabilityPackages.setEnabled', { installationId: installation.id, expectedRevision: installation.revision, enabled: true }, 'owner-enable')).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
  installation = ((await f.call('capabilityPackages.get', { installationId: installation.id })).data as { installation: CapabilityInstallation }).installation
  const connection = (await f.call('connections.create', modelConfig, 'model')).data as Connection
  await configureAgent(f, 'bobo', connection)
  const room = await f.owned.service.handle('startCoreConversation', { content: '启用这个包但不绑定员工', requestId: 'enable-intent' }) as Conversation
  await waitForAnswer(f, room, '包已启用，调用仍需员工绑定。', () => failure)
  expect(server.requests).toEqual([])
  expect(await f.store.load('capabilityBindings')).toEqual([])
  expect((await f.store.load<CapabilityInstallation>('capabilityPackages')).find(value => value.id === installation.id)).toMatchObject({ enabled: true })
  await expect(latest!.application!.catalog({ domain: 'capabilityPackages' })).rejects.toThrow()
})

it('uses bound API employee Skill and Source through the original bridges while rejecting application management', async () => {
  const server = await localMcp()
  let sourceId = '', failure: unknown, latest: EngineContext | undefined
  const f = await fixture({
    decide: async context => {
      if (context.participation?.hasRespondedInTurn) return { action: 'pass', observedThroughSequence: context.participation.observedThroughSequence }
      return { action: 'reply', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence, work: { key: 'package-check', scope: '读取已绑定能力', deliverable: '包的真实结果' } }
    },
    run: async context => {
      latest = context
      try {
        expect(context.application).toBeDefined()
        const catalog = await context.application!.catalog({ domain: 'capabilityPackages' })
        expect(catalog.operations.every(operation => !operation.name.startsWith('capabilityPackages.'))).toBe(true)
        expect(await context.application!.call({ operation: 'capabilityPackages.install', input: {}, requestId: 'employee-management-denied' })).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
        expect(context.dataSources?.map(source => source.id)).toContain(sourceId)
        const resource = context.resources.find(item => item.name === 'fixture-method')!
        expect(resource.ownerAgentId).toBe(context.agent.id)
        const bridge = createNativeProducts(context)
        try {
          const listed = await bridge.tools.find(tool => tool.name === 'list_skills')!.execute({}, 'skills')
          expect(JSON.stringify(listed)).toContain(resource.id)
          const content = await bridge.tools.find(tool => tool.name === 'read_skill')!.execute({ resourceId: resource.id }, 'read-package-skill')
          expect(JSON.stringify(content)).toContain('PACKAGE_SKILL_FACT')
          const api = createSourceTools(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
          const inspected = await api.inspect_data_source.execute!({ sourceId }, invocation)
          expect(JSON.stringify(inspected)).toContain('echo')
          const result = await api.call_data_source.execute!({ sourceId, tool: 'echo', arguments: { bridge: 'api' } }, invocation)
          expect(JSON.stringify(result)).toContain('api')
          const native = await bridge.tools.find(tool => tool.name === 'call_data_source')!.execute({ sourceId, tool: 'echo', arguments: { bridge: 'native-product' } }, 'package-source')
          expect(JSON.stringify(native)).toContain('native-product')
        } finally { await bridge.dispose() }
        await context.onDelta('已核对包的技能与数据源。')
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '已读取包能力', evidence: [{ kind: 'answer', reference: '已核对包的技能与数据源。' }] })
      } catch (error) { failure = error; throw error }
    },
    report: async (_context, draft) => ({ action: 'publish', text: draft.text }),
  })
  const connection = (await f.call('connections.create', modelConfig, 'model')).data as Connection
  const employee = await configureAgent(f, 'researcher', connection)
  let { installation } = await install(f, await packageInput(f.root, server.url))
  sourceId = installation.contributions.find(value => value.kind === 'source')!.objectId
  expect(await f.call('capabilityPackages.bind', { installationId: installation.id, expectedRevision: installation.revision, employeeId: employee.id, expectedConfigVersion: employee.configVersion, expectedBindingRevision: 0, contributionIds: installation.contributions.map(value => value.id) }, 'bind-package')).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
  installation = ((await f.call('capabilityPackages.get', { installationId: installation.id })).data as { installation: CapabilityInstallation }).installation
  expect(await f.call('capabilityPackages.setEnabled', { installationId: installation.id, expectedRevision: installation.revision, enabled: true }, 'enable-package')).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
  const room = await f.owned.service.handle('createConversation', { kind: 'direct', title: '包能力验收', agentIds: [employee.id] }) as Conversation
  await f.owned.service.handle('sendMessage', { conversationId: room.id, requestId: 'read-package', content: '读取绑定技能并调用包工具', mentionIds: [] })
  await waitForAnswer(f, room, '已核对包的技能与数据源。', () => failure)
  expect(server.calls).toEqual([{ bridge: 'api' }, { bridge: 'native-product' }])
  expect(await f.store.load('capabilityPackages')).toHaveLength(1)
  await expect(latest!.inspectDataSource!(sourceId)).rejects.toThrow()
})

it('persists assistant template provenance and keeps legacy preset choices idempotent without inheriting private bindings', async () => {
  const f = await fixture()
  await f.call('connections.create', modelConfig, 'model')
  expect((await f.call('employees.presets')).data).toEqual(EMPLOYEE_PRESETS)
  const created: DigitalAgent[] = []
  for (const legacyIndex of [0, 1, 2]) {
    const preset = resolveEmployeePreset(legacyIndex)!
    expect(preset.id).toBe(['researcher', 'writer', 'reviewer'][legacyIndex])
    const input = { name: `Template ${preset.id}`, role: preset.role, instructions: preset.instructions, templateId: preset.id, templateVersion: preset.version }
    const requestId = `template-${legacyIndex}`
    const result = await f.call('employees.create', input, requestId)
    expect(result).toMatchObject({ status: 'succeeded', data: { templateOrigin: { templateId: preset.id, version: preset.version }, name: input.name, role: preset.role, instructions: preset.instructions, skillIds: [], knowledgeIds: [], sourceIds: [] } })
    expect(await f.call('employees.create', input, requestId)).toEqual(result)
    expect(await f.owned.service.handle('getApplicationReceipt', { requestId })).toEqual(result)
    const employee = result.data as DigitalAgent; created.push(employee)
    expect(employee.id).not.toBe(preset.id)
    expect(employee.systemRole).toBeUndefined()
    expect((await f.store.load<DigitalAgent>('agents')).find(value => value.id === employee.id)).toMatchObject({ templateOrigin: { templateId: preset.id, version: preset.version } })
  }
  const employees = await f.store.load<DigitalAgent>('agents')
  expect(employees.filter(employee => employee.name.startsWith('Template '))).toHaveLength(3)
  expect(new Set(created.map(employee => employee.workspaceRef)).size).toBe(3)
  const before = employees.length
  const obsolete = await f.call('employees.create', { name: 'Obsolete', templateId: 'researcher', templateVersion: '0' }, 'obsolete-template')
  expect(await f.store.load('agents')).toHaveLength(before)
  expect(obsolete).toMatchObject({ status: 'rejected' })
})

it('keeps an application receipt running during real package preparation and records only the completed installation', async () => {
  const f = await fixture(), path = await packageInput(f.root)
  const inspected = (await f.call('capabilityPackages.inspect', { path })).data as CapabilityInspection
  let entered = false, release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const original = CapabilityPackageServices.prototype.materialize
  vi.spyOn(CapabilityPackageServices.prototype, 'materialize').mockImplementationOnce(async function (this: CapabilityPackageServices, installation, directory) {
    entered = true; await hold; return original.call(this, installation, directory)
  })
  const requestId = 'held-install'
  const pending = f.call('capabilityPackages.install', { path, contentHash: inspected.contentHash }, requestId)
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    expect(await f.store.load('capabilityOperations')).toMatchObject([{ status: 'preparing' }])
    const receipt = await f.owned.service.handle('getApplicationReceipt', { requestId }) as ApplicationResult
    expect(receipt.status).toBe('running'); expect(receipt.finishedAt).toBeUndefined()
  } finally { release() }
  const completed = await pending
  expect(completed).toMatchObject({ status: 'succeeded', data: { status: 'completed' } })
  expect(await f.owned.service.handle('getApplicationReceipt', { requestId })).toEqual(completed)
  expect(await f.store.load('capabilityPackages')).toHaveLength(1)
})

it('rejects a stale package revision at the application boundary without recording a domain intent', async () => {
  const f = await fixture(), { installation } = await install(f, await packageInput(f.root))
  const before = await f.store.load('capabilityOperations')
  const input = { installationId: installation.id, expectedRevision: installation.revision + 1, enabled: true }
  const result = await f.call('capabilityPackages.setEnabled', input, 'stale-package-revision')
  expect(result).toMatchObject({ status: 'rejected', error: { message: expect.stringContaining('版本已变化') } })
  expect(await f.store.load('capabilityOperations')).toEqual(before)
  expect((await f.store.load<CapabilityInstallation>('capabilityPackages')).find(value => value.id === installation.id)).toEqual(installation)
  expect(await f.call('capabilityPackages.setEnabled', input, 'stale-package-revision')).toEqual(result)
  expect(await f.call('capabilityPackages.receipt', { applicationReceiptId: result.receiptId })).toMatchObject({ status: 'succeeded', data: null })
})

it('does not commit a bobo installation after its original run is stopped and removes the prepared owned files', async () => {
  let path = '', contentHash = '', packageDirectory = '', latest: EngineContext | undefined
  let entered = false, finished = false, result: ApplicationResult | undefined, failure: unknown, release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const original = CapabilityPackageServices.prototype.materialize
  vi.spyOn(CapabilityPackageServices.prototype, 'materialize').mockImplementationOnce(async function (this: CapabilityPackageServices, installation, directory) {
    await original.call(this, installation, directory)
    packageDirectory = directory; entered = true; await hold
  })
  const f = await fixture({
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      latest = context
      try { result = await context.application!.call({ operation: 'capabilityPackages.install', input: { path, contentHash }, requestId: 'cancelled-bobo-install' }) }
      catch (error) { failure = error }
      finally { finished = true }
    },
  })
  const server = await localMcp()
  path = await packageInput(f.root, server.url)
  contentHash = ((await f.call('capabilityPackages.inspect', { path })).data as CapabilityInspection).contentHash
  const connection = (await f.call('connections.create', modelConfig, 'model')).data as Connection
  await configureAgent(f, 'bobo', connection)
  const room = await f.owned.service.handle('startCoreConversation', { content: '安装明确给出的能力包', requestId: 'cancel-install-intent' }) as Conversation
  let ownedPaths: string[] = []
  try {
    await vi.waitFor(() => { if (failure) throw failure; expect(entered).toBe(true) }, { timeout: 10000 })
    const copies = await f.store.load<{ resource: { path: string } }>('capabilitySkillCopies')
    expect(copies).toHaveLength(1); ownedPaths = copies.map(copy => copy.resource.path)
    expect(await f.store.load('dataSources')).toHaveLength(1)
    expect(await f.store.load('capabilityPackages')).toEqual([])
    await f.owned.service.handle('cancelRunExecution', { conversationId: room.id, runId: latest!.runId })
    expect(latest!.signal.aborted).toBe(true)
  } finally { release() }
  await vi.waitFor(() => expect(finished).toBe(true), { timeout: 10000 })
  expect(failure).toBeUndefined()
  expect(result).toMatchObject({ status: 'succeeded', data: { status: 'failed', phase: 'rolled-back', retained: [] } })
  expect(await f.store.load('capabilityPackages')).toEqual([])
  expect(await f.store.load('capabilitySkillCopies')).toEqual([])
  expect(await f.store.load('dataSources')).toEqual([])
  expect(await f.store.load('capabilityOperations')).toMatchObject([{ status: 'failed', phase: 'rolled-back' }])
  for (const ownedPath of [packageDirectory, ...ownedPaths]) await expect(access(ownedPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(server.requests).toEqual([])
})
