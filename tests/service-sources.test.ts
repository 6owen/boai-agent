/*
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

it('routes bound sources through native and Mastra contracts, rejecting private phases, another source and revoked bindings', async () => {
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
        await tools.call_data_source.execute!({ sourceId: source.id, tool: 'files', arguments: { operation: 'write', path: 'result.md', content: 'SOURCE_WRITE_RESULT', expectedHash: null } }, { requestContext: new RequestContext(), observe: noopObserve })
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
  source = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: 'bound', description: '', guide: '', enabled: true, type: 'local', local: { path: root, accessMode: 'read-write' } } }) as DataSource
  unrelated = await service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { name: 'unbound', description: '', guide: '', enabled: true, type: 'local', local: { path: root, accessMode: 'read' } } }) as DataSource
  let employee = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const definition = (agent: DigitalAgent) => { const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...value } = agent; return { ...value, expectedConfigVersion: configVersion } }
  employee = await service.handle('saveAgent', { ...definition(employee), connectionId: connection.id, modelId: 'fixture', sourceIds: [source.id] }) as DigitalAgent
  const conversation = await service.handle('createConversation', { kind: 'direct', title: 'source test', agentIds: [employee.id] }) as Conversation
  await service.handle('sendMessage', { conversationId: conversation.id, requestId: randomUUID(), content: '读取数据源的 facts.md 并报告事实', mentionIds: [] })
  await vi.waitFor(async () => {
    const detail = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    if (phaseFailure) throw phaseFailure
    expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('LOCAL_SOURCE_FACT'))).toBe(true)
  }, { timeout: 10000 })
  expect(decisionDenied).toBe(true); expect(context).toBeDefined()
  expect(await readFile(join(root, 'result.md'), 'utf8')).toBe('SOURCE_WRITE_RESULT')
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
        await create!.execute({ key: 'local', config: { name: '资料', description: '', guide: '', enabled: true, type: 'local', local: { path: root, accessMode: 'read' } } }, 'create-source')
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
  await expect(context!.createDataSource!({ key: 'late', config: { name: '迟到', description: '', guide: '', enabled: true, type: 'local', local: { path: root, accessMode: 'read' } } })).rejects.toThrow()
  await expect(service.handle('startCoreConversation', { requestId: randomUUID(), content: '冲突入口', sourceCreation: true, automationCreation: true })).rejects.toThrow('同时')
})
