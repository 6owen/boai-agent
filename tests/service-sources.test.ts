/*
 * [OUTPUT]: 数据源Composer引用核对固定ID/源版本、绑定/启用、核心首发/重复请求与真实双工具桥；选择本身成为来源失效依赖，不授予权限。
 * [OUTPUT]: 员工整体三档权限实际约束本地数据源写入；审批前零写、只读拒绝、完全访问无审批，旧配置兼容。
 * [OUTPUT]: 真实AppService验证bobo无绑定全局及同轮新增源读写、普通chat无Work、停用/私有阶段/结束运行拒绝；普通员工绑定门禁保持。
 * [OUTPUT]: 桌面凭据读取、编辑后回填/清空、版本拒绝与普通DTO隔离；使用测试vault，不读取用户密钥。
 * [OUTPUT]: 新增专用核心会话真实工具保存、普通聊天不暴露、原生桥调用及结束运行拒绝。
 * [INPUT]: Real AppService/SQLite and deterministic employee task engine.
 * [OUTPUT]: Bound-source calls through both tool bridges, phase/employee checks and removal invalidation.
 * [POS]: Host integration tests; no real model or external account.
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../src/runtime/service'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { createSourceTools } from '../src/runtime/adapters/mastra/source-tools'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { DataSource } from '../src/shared/domain/sources'
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

it('gives bobo all enabled sources without binding, and can read/write a newly created source in the same chat turn', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-core-sources-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'facts.md'), 'GLOBAL_FACT')
  let existing: DataSource, disabled: DataSource, latest: EngineContext | undefined, failure: unknown
  const engine: AgentEngine = {
    test: async () => 'unused',
    decide: async ctx => {
      expect(ctx.dataSources?.map(source => source.id)).toEqual([existing.id])
      await expect(ctx.inspectDataSource!(existing.id)).rejects.toThrow('权限')
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }
    },
    run: async ctx => {
      latest = ctx
      try {
        expect(ctx.agent.sourceIds ?? []).toEqual([]); expect(ctx.work).toBeUndefined()
        await expect(ctx.inspectDataSource!(disabled.id)).rejects.toThrow('不可用')
        const tools = createSourceTools(ctx)
        const toolContext = { requestContext: new RequestContext(), observe: noopObserve }
        expect(JSON.stringify(await tools.call_data_source.execute!({ sourceId: existing.id, tool: 'files', arguments: { operation: 'read', path: 'facts.md' } }, toolContext))).toContain('GLOBAL_FACT')
        const added = await ctx.manageDataSources!({ command: { action: 'create', input: { key: 'new-folder', config: { name: 'New folder', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } } } }) as DataSource
        expect(ctx.dataSources?.some(source => source.id === added.id)).toBe(false) // Not in the initial model snapshot.
        const bridge = createNativeProducts(ctx)
        const inspect = bridge.tools.find(tool => tool.name === 'inspect_data_source')!
        expect(JSON.stringify(await inspect.execute({ sourceId: added.id }, 'inspect-new'))).toContain('expectedHash')
        await bridge.tools.find(tool => tool.name === 'call_data_source')!.execute({ sourceId: added.id, tool: 'files', arguments: { operation: 'write', path: 'new.md', content: 'BOBO_WRITE', expectedHash: null } }, 'write-new')
        expect(await readFile(join(root, 'new.md'), 'utf8')).toBe('BOBO_WRITE')
        await tools.call_data_source.execute!({ sourceId: existing.id, tool: 'files', arguments: { operation: 'write', path: 'api-bridge.md', content: 'MASTRA_WRITE', expectedHash: null } }, toolContext)
        expect(ctx.work).toBeUndefined()
        await bridge.dispose(); await ctx.onDelta('已读写全局资源')
      } catch (error) { failure = error; throw error }
    },
  }
  const service = new AppService({ dataPath: join(root, 'app'), skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' })
  const config = { name: 'Existing', type: 'local' as const, description: '', guide: '', enabled: true, local: { path: root } }
  existing = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config }) as DataSource
  disabled = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { ...config, enabled: false } }) as DataSource
  const room = await service.handle('startCoreConversation', { requestId: randomUUID(), content: '读取资料并创建新文件' }) as Conversation
  await vi.waitFor(async () => {
    if (failure) throw failure
    const detail = await service.handle('getConversation', { id: room.id }) as ConversationDetail
    expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content === '已读写全局资源')).toBe(true)
  }, { timeout: 15000 })
  expect(await readFile(join(root, 'api-bridge.md'), 'utf8')).toBe('MASTRA_WRITE')
  await expect(latest!.inspectDataSource!(existing.id)).rejects.toThrow('权限')
})

it('returns the saved source credential only through the versioned editor request and saves actual input including blank', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-source-credential-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const vault = new Map<string, string>()
  const service = new AppService({ dataPath: root, engine: {
    async test() { return 'unused' }, async decide() { throw new Error('no model expected') }, async run() { throw new Error('no model expected') },
  }, secrets: { get: async id => vault.get(id), set: async (id, value) => { vault.set(id, value) }, delete: async id => { vault.delete(id) } }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  const config = { name: 'Fixture MCP', type: 'mcp' as const, description: '', guide: '', enabled: true, mcp: { transport: 'http' as const, url: 'https://example.com/mcp', authType: 'bearer' as const } }
  let source = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config, credential: 'fixture-first-key' }) as DataSource
  const original = { id: source.id, expectedRevision: source.revision }
  expect(await service.handle('getDataSourceCredential', original)).toBe('fixture-first-key')
  expect(JSON.stringify(await service.handle('listDataSources', undefined))).not.toContain('fixture-first-key')
  expect(JSON.stringify(await service.handle('getDataSource', { id: source.id }))).not.toContain('fixture-first-key')
  await expect(service.handle('getDataSourceCredential', { ...original, credentialId: 'arbitrary-vault-key' })).rejects.toThrow()
  source = await service.handle('saveDataSource', { ...original, config, credential: 'fixture-replacement' }) as DataSource
  await expect(service.handle('getDataSourceCredential', original)).rejects.toThrow('已变化')
  expect(await service.handle('getDataSourceCredential', { id: source.id, expectedRevision: source.revision })).toBe('fixture-replacement')
  source = await service.handle('saveDataSource', { id: source.id, expectedRevision: source.revision, config, credential: '' }) as DataSource
  expect(source.hasCredential).toBe(false); expect(vault.size).toBe(0)
  expect(await service.handle('getDataSourceCredential', { id: source.id, expectedRevision: source.revision })).toBe('')
  source = await service.handle('saveDataSource', { id: source.id, expectedRevision: source.revision, config, credential: 'fixture-restored' }) as DataSource
  vault.clear()
  await expect(service.handle('getDataSourceCredential', { id: source.id, expectedRevision: source.revision })).rejects.toThrow('无法读取')
  await service.handle('removeDataSource', { id: source.id, expectedRevision: source.revision })
  await expect(service.handle('getDataSourceCredential', { id: source.id, expectedRevision: source.revision })).rejects.toThrow()
})

it.each([undefined, 'read-only', 'ask', 'full-access'] as const)('routes bound sources with %s permission and rejects revoked bindings', async permission => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-source-host-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'facts.md'), 'LOCAL_SOURCE_FACT')
  let source: DataSource, unrelated: DataSource, context: EngineContext | undefined, decisionDenied = false, phaseFailure: unknown
  const engine: AgentEngine = {
    async test() { return 'ok' },
    async decide(ctx) {
      if (ctx.participation?.hasRespondedInTurn) return { action: 'pass', observedThroughSequence: ctx.participation.observedThroughSequence }
      try { await ctx.inspectDataSource!(source.id) } catch { decisionDenied = true }
      return { action: 'reply', responseKind: 'task', observedThroughSequence: ctx.participation!.observedThroughSequence, work: { key: 'source-task', scope: '读取绑定文件', deliverable: '来源事实' } }
    },
    async run(ctx) {
      context = ctx
      try {
        expect(ctx.dataSources?.map(source => source.id)).toEqual([source.id])
        await expect(ctx.inspectDataSource!(unrelated.id)).rejects.toThrow('权限')
        const tools = createSourceTools(ctx)
        const resultFromMastra = await tools.call_data_source.execute!({ sourceId: source.id, tool: 'files', arguments: { operation: 'read', path: 'facts.md' } }, { requestContext: new RequestContext(), observe: noopObserve })
        expect(JSON.stringify(resultFromMastra)).toContain('LOCAL_SOURCE_FACT')
        const writing = tools.call_data_source.execute!({ sourceId: source.id, tool: 'files', arguments: { operation: 'write', path: 'result.md', content: 'SOURCE_WRITE_RESULT', expectedHash: null } }, { requestContext: new RequestContext(), observe: noopObserve })
        if (permission === 'read-only') await expect(writing).rejects.toThrow('只读')
        else await writing
        const bridge = createNativeProducts(ctx)
        const tool = bridge.tools.find(tool => tool.name === 'call_data_source')!
        const result = await tool.execute({ sourceId: source.id, tool: 'files', arguments: { operation: 'read', path: 'facts.md' } }, 'call-source')
        expect(JSON.stringify(result)).toContain('LOCAL_SOURCE_FACT')
        await bridge.dispose()
        await ctx.onDelta('来源事实 LOCAL_SOURCE_FACT')
        await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '已读取来源事实', evidence: [{ kind: 'answer', reference: 'LOCAL_SOURCE_FACT' }] })
      } catch (error) { phaseFailure = error; throw error }
    },
    async report(_ctx, draft) { return { action: 'publish', text: draft.text } },
  }
  const service = new AppService({ dataPath: join(root, 'app'), engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  source = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: 'bound', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } }) as DataSource
  unrelated = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: 'unbound', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } }) as DataSource
  let employee = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const definition = (agent: DigitalAgent) => { const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...value } = agent; return { ...value, expectedConfigVersion: configVersion } }
  employee = await service.handle('saveAgent', { ...definition(employee), connectionId: connection.id, modelId: 'fixture', sourceIds: [source.id], executionPermission: permission }) as DigitalAgent
  const conversation = await service.handle('createConversation', { kind: 'direct', title: 'source test', agentIds: [employee.id] }) as Conversation
  await service.handle('sendMessage', { conversationId: conversation.id, requestId: randomUUID(), content: '读取数据源的 facts.md 并报告事实', mentionIds: [] })
  await vi.waitFor(async () => {
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    if (phaseFailure) throw phaseFailure
    const approvals = (await service.handle('snapshot', undefined) as Snapshot).approvals
    if (approvals.length) {
      expect(permission).toBe('ask'); expect(approvals[0].kind).toBe('source'); expect(approvals[0].rememberAllowed).toBe(false)
      await expect(readFile(join(root, 'result.md'))).rejects.toMatchObject({ code: 'ENOENT' })
      await service.handle('approve', { id: approvals[0].id, approved: true })
    }
    expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('LOCAL_SOURCE_FACT'))).toBe(true)
  }, { timeout: 10000 })
  expect(decisionDenied).toBe(true); expect(context).toBeDefined()
  if (permission === 'read-only') await expect(readFile(join(root, 'result.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  else expect(await readFile(join(root, 'result.md'), 'utf8')).toBe('SOURCE_WRITE_RESULT')
  await service.handle('saveAgent', { ...definition(employee), sourceIds: [] })
  await expect(context!.inspectDataSource!(source.id)).rejects.toThrow()
  const snapshot = await service.handle('snapshot', undefined) as Snapshot
  expect(snapshot.agents.find(agent => agent.id === employee.id)?.sourceIds).toEqual([])
})


it('grants creation only to a dedicated core user conversation and rejects the ended run', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-source-creation-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  let context: EngineContext | undefined, failure: unknown
  const engine: AgentEngine = { test: async () => 'ok', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => {
    context = ctx
    try {
      const bridge = createNativeProducts(ctx), create = bridge.tools.find(tool => tool.name === 'create_data_source')
      if (ctx.conversation.sourceCreation) {
        expect(ctx.manageAutomation).toBeUndefined(); expect(create).toBeDefined(); expect(ctx.work).toBeUndefined()
        await create!.execute({ key: 'local', config: { name: '资料', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } }, 'create-source')
      } else expect(create).toBeUndefined()
      await bridge.dispose(); await ctx.onDelta('已按实际回执处理')
    } catch (error) { failure = error; throw error }
  } }
  const service = new AppService({ dataPath: join(root, 'app'), engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); cleanups.push(() => service.close()); await service.init()
  await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' })
  const wait = async (conversation: Conversation) => {
    await vi.waitFor(async () => { const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail; expect(detail.turns?.every(turn => ['completed', 'failed', 'cancelled'].includes(turn.status))).toBe(true) }, { timeout: 8000 })
    if (failure) throw failure
  }
  const ordinary = await service.handle('startCoreConversation', { requestId: randomUUID(), content: '你好' }) as Conversation; await wait(ordinary)
  const conversation = await service.handle('startCoreConversation', { requestId: randomUUID(), content: '添加资料文件夹', sourceCreation: true }) as Conversation; await wait(conversation)
  expect(await service.handle('listDataSources', undefined)).toMatchObject([{ type: 'local', creationSource: { conversationId: conversation.id, agentId: 'bobo' } }])
  await expect(context!.createDataSource!({ key: 'late', config: { name: '迟到', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } })).rejects.toThrow()
  await expect(service.handle('startCoreConversation', { requestId: randomUUID(), content: '冲突入口', sourceCreation: true, automationCreation: true })).rejects.toThrow('同时')
})


it.each(['researcher', 'bobo'])('keeps selected source identity through message acceptance and both tool bridges for %s', async agentId => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-composer-sources-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'facts.md'), 'SELECTED_SOURCE_FACT')
  let selected: DataSource, employee: DigitalAgent, context: EngineContext | undefined, failure: unknown
  const calls: string[] = []
  const engine: AgentEngine = {
    test: async () => 'ok',
    decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }),
    run: async ctx => {
      context = ctx
      try {
        const references = ctx.messages.find(message => message.id === ctx.triggerMessageId)!.composerReferences!
        expect(references).toEqual([{ kind: 'source', id: selected.id, name: selected.name, agentId, revision: selected.revision }])
        const tools = createSourceTools(ctx)
        const request = { sourceId: references[0].id, tool: 'files', arguments: { operation: 'read', path: 'facts.md' } }
        expect(JSON.stringify(await tools.call_data_source.execute!(request, { requestContext: new RequestContext(), observe: noopObserve }))).toContain('SELECTED_SOURCE_FACT')
        const bridge = createNativeProducts(ctx)
        try { expect(JSON.stringify(await bridge.tools.find(tool => tool.name === 'call_data_source')!.execute(request, 'selected-source'))).toContain('SELECTED_SOURCE_FACT') }
        finally { await bridge.dispose() }
        calls.push(references[0].id)
        await ctx.onDelta('SELECTED_SOURCE_FACT')
      } catch (error) { failure = error; throw error }
    },
  }
  const service = new AppService({ dataPath: join(root, 'app'), engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  const config = { name: '同名资料', description: '', guide: '', enabled: true, type: 'local' as const, local: { path: root } }
  selected = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config }) as DataSource
  const unrelated = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config }) as DataSource
  const disabled = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { ...config, enabled: false } }) as DataSource
  const original = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === agentId)!
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = original
  employee = await service.handle('saveAgent', { ...definition, connectionId: connection.id, modelId: 'fixture', sourceIds: agentId === 'bobo' ? [] : [selected.id], expectedConfigVersion: configVersion }) as DigitalAgent
  const direct = agentId === 'bobo' ? undefined : await service.handle('createConversation', { kind: 'direct', title: '指定数据源', agentIds: [agentId] }) as Conversation
  const reference = { kind: 'source' as const, id: selected.id, name: selected.name, agentId, revision: selected.revision }
  const submit = (ref: typeof reference, requestId = randomUUID()) => direct
    ? service.handle('sendMessage', { conversationId: direct.id, requestId, content: '@同名资料 请读取事实', mentionIds: [], composerReferences: [ref] })
    : service.handle('startCoreConversation', { requestId, content: '@同名资料 请读取事实', composerReferences: [ref] })
  for (const ref of [{ ...reference, revision: reference.revision + 1 }, { ...reference, agentId: 'writer' }, { ...reference, id: disabled.id }, ...(agentId === 'bobo' ? [] : [{ ...reference, id: unrelated.id }])]) {
    await expect(submit(ref)).rejects.toThrow()
  }
  expect(calls).toEqual([])
  const requestId = randomUUID(), accepted = await submit(reference, requestId) as Conversation | import('../src/shared/domain').Message
  const conversationId = direct?.id ?? accepted.id
  await vi.waitFor(async () => { const view = await service.handle('getConversation', { id: conversationId }) as ConversationDetail; expect(view.runs.some(run => run.status === 'completed')).toBe(true) }, { timeout: 8000 })
  if (failure) throw failure
  expect(context).toBeDefined(); expect(calls).toEqual([selected.id])
  const view = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
  expect(view.messages.find(message => message.senderType === 'user')!.composerReferences).toEqual([reference])
  await service.handle('saveDataSource', { id: selected.id, expectedRevision: selected.revision, config: { ...config, enabled: false } })
  await expect(submit(reference)).rejects.toThrow('已变化')
  expect((await submit(reference, requestId) as { id: string }).id).toBe(accepted.id)
  expect(calls).toEqual([selected.id])
})

it('invalidates a core run when its selected source changes before any source tool is called', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-selected-source-revocation-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  let active: EngineContext | undefined
  const engine: AgentEngine = { test: async () => 'ok', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => {
    active = ctx
    await new Promise<void>(resolve => { if (ctx.signal.aborted) resolve(); else ctx.signal.addEventListener('abort', () => resolve(), { once: true }) })
  } }
  const service = new AppService({ dataPath: join(root, 'app'), engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' })
  const source = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: '资料', description: '', guide: '', enabled: true, type: 'local', local: { path: root } } }) as DataSource
  const core = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  const conversation = await service.handle('startCoreConversation', { requestId: randomUUID(), content: '@资料 核对', composerReferences: [{ kind: 'source', id: source.id, name: source.name, agentId: core.id, revision: source.revision }] }) as Conversation
  await vi.waitFor(() => expect(active).toBeDefined())
  expect(active!.agent.sourceIds ?? []).toEqual([])
  await service.handle('removeDataSource', { id: source.id, expectedRevision: source.revision })
  expect(active!.signal.aborted).toBe(true)
  const view = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
  expect(view.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toEqual([])
  expect(view.runs.find(run => run.id === active!.runId)).toMatchObject({ status: 'cancelled' })
})
