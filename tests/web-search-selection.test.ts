/*
 * [OUTPUT]: Current-text choice, independent group bindings, active-source cancellation/revocation, immutable routing and restart without replay.
 * [INPUT]: Employee preference, current source references, production AppService and an isolated MCP server.
 * [OUTPUT]: Preference persistence, explicit-source precedence and call rejection before outbound effects; no real models or provider success claims.
 * [POS]: Web search selection business tests.
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppService } from '../src/runtime/service'
import { searchSelection, assertSearchSelection } from '../src/runtime/modules/sources/search-selection'
import { hasChatSourceTools, createSourceTools } from '../src/runtime/adapters/mastra/source-tools'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { AgentInput, Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { DataSource } from '../src/shared/domain/sources'
import { webSearchServer, webSourceConfig, resultUrl, pageText } from './fixtures/web-search-server'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const definition = ({ configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...agent }: DigitalAgent): AgentInput => ({ ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision })
async function fixture(engine: AgentEngine = { test: async () => 'unused', decide: async () => { throw new Error('No model expected') }, run: async () => { throw new Error('No model expected') } }, browserAvailable = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-search-selection-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const vault = new Map<string, string>()
  const create = async () => { const app = new AppService({ dataPath: root, skillDiscovery: { homeDir: root }, engine, ...(browserAvailable ? { browserHost: { available: true, request: (async (method: string) => { if (method !== 'disconnect') throw new Error('selection must not launch the browser') }) as import('../src/shared/ipc/browser').BrowserHostBridge['request'] } } : {}), secrets: { get: async id => vault.get(id) ?? '', set: async (id, value) => { vault.set(id, value) }, delete: async id => { vault.delete(id) } }, emit: () => {} }); cleanup.push(() => app.close()); await app.init(); return app }
  let app = await create()
  const connection = await app.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  const sources: DataSource[] = []
  for (let i = 0; i < 2; i++) sources.push(await app.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { ...webSourceConfig, name: '同名搜索' } }) as DataSource)
  const current = async (id = 'researcher') => (await app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === id)!
  const save = async (changes: Partial<AgentInput> = {}, id = 'researcher') => app.handle('saveAgent', { ...definition(await current(id)), connectionId: connection.id, modelId: 'fixture', ...changes }) as Promise<DigitalAgent>
  await save({ sourceIds: sources.map(source => source.id) })
  return { get app() { return app }, sources, current, save, async restart() { await app.close(); app = await create() } }
}

it.each(['preferred', 'explicit-preferred', 'explicit-browser', 'browser', 'unavailable'] as const)('uses the selected source through the production host: %s', async kind => {
  const server = await webSearchServer(); cleanup.push(() => server.close())
  let sources: DataSource[], failure: unknown, captured: EngineContext | undefined
  const engine: AgentEngine = {
    test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }),
    run: async ctx => {
      captured = ctx
      try {
        const selection = searchSelection(ctx), chosen = kind === 'preferred' ? sources[0] : sources[1]
        if (kind === 'browser') {
          expect(selection.mode).toBe('browser'); expect(hasChatSourceTools(ctx)).toBe(true) // Alternatives can be explicitly selected; source calls remain blocked.
          for (const source of sources) await expect(ctx.callDataSource!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'public' } })).rejects.toThrow('浏览器')
        } else {
          expect(selection.mode).toBe(kind === 'unavailable' ? 'auto' : 'source')
          if (kind.startsWith('explicit')) expect(selection.explicit).toBe(true)
          if (kind === 'unavailable') expect(selection.unavailablePreferredSource).toBe(sources[0].id)
          else {
            const other = sources.find(source => source.id !== chosen.id)!
            await expect(ctx.callDataSource!({ sourceId: other.id, tool: 'tavily_search', arguments: { query: 'must not leave host' } })).rejects.toThrow('不能静默替换')
          }
          await ctx.inspectDataSource!(chosen.id)
          await ctx.callDataSource!({ sourceId: chosen.id, tool: 'tavily_search', arguments: { query: chosen.id } })
        }
        expect(ctx.work).toBeUndefined(); await ctx.onDelta('已核对检索路径。')
      } catch (error) { failure = error; throw error }
    },
  }
  const f = await fixture(engine); sources = f.sources
  await f.save({ webSearch: kind === 'browser' || kind === 'explicit-browser' ? { mode: 'browser' } : { mode: 'source', sourceId: sources[0].id } })
  if (kind === 'unavailable') await f.app.handle('saveDataSource', { id: sources[0].id, expectedRevision: sources[0].revision, config: { ...webSourceConfig, enabled: false } })
  const room = await f.app.handle('createConversation', { kind: 'direct', title: 'Search choice', agentIds: ['researcher'] }) as Conversation
  await f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '核对检索路径', mentionIds: [], ...(kind.startsWith('explicit') ? { composerReferences: [{ kind: 'source', id: sources[1].id, revision: sources[1].revision, agentId: 'researcher', name: sources[1].name }] } : {}) })
  await vi.waitFor(async () => {
    if (failure) throw failure
    const detail = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail
    expect(detail.messages.some(message => message.senderType === 'agent' && message.content === '已核对检索路径。' && message.status === 'completed')).toBe(true)
    expect(detail.workItems).toEqual([])
  }, { timeout: 10000 })
  expect(captured).toBeDefined(); expect(server.calls).toHaveLength(kind === 'browser' ? 0 : 1)
  if (kind !== 'browser') expect(server.calls[0].arguments.query).toBe((kind === 'preferred' ? sources[0] : sources[1]).id)
})

it('keeps unavailable preferences through unrelated edits, global removal and restart without starting a provider', async () => {
  const f = await fixture(), source = f.sources[0]
  await f.save({ webSearch: { mode: 'source', sourceId: source.id } })
  const disabled = await f.app.handle('saveDataSource', { id: source.id, expectedRevision: source.revision, config: { ...webSourceConfig, enabled: false } }) as DataSource
  expect((await f.save({ role: '新职责' })).webSearch).toEqual({ mode: 'source', sourceId: source.id })
  await f.app.handle('removeDataSource', { id: source.id, expectedRevision: disabled.revision })
  await f.restart()
  expect((await f.current()).webSearch).toEqual({ mode: 'source', sourceId: source.id })
  expect((await f.current()).sourceIds).not.toContain(source.id)
  expect((await f.save({ role: '重启后职责' })).webSearch).toEqual({ mode: 'source', sourceId: source.id })
  await expect(f.save({ webSearch: { mode: 'source', sourceId: randomUUID() } })).rejects.toThrow('可用的搜索数据源')
})

it.each(['employee', 'source-binding'] as const)('resets the preferred source only when intentionally unbound through %s', async origin => {
  const f = await fixture(), source = f.sources[0]
  let agent = await f.save({ webSearch: { mode: 'source', sourceId: source.id } })
  if (origin === 'employee') agent = await f.save({ sourceIds: [f.sources[1].id] })
  else {
    await f.app.handle('setDataSourceBindings', { id: source.id, expectedRevision: source.revision, agents: [], expectedBindings: [{ id: agent.id, expectedConfigVersion: agent.configVersion }] })
    agent = await f.current()
  }
  expect(agent.webSearch).toEqual({ mode: 'auto' }); expect(agent.sourceIds).not.toContain(source.id)
  await f.restart(); expect((await f.current()).webSearch).toEqual({ mode: 'auto' })
})

it('allows bobo to choose an enabled global search source while ordinary employees must bind it', async () => {
  const f = await fixture(), source = f.sources[0]
  await expect(f.save({ sourceIds: [], webSearch: { mode: 'source', sourceId: source.id } })).rejects.toThrow('可用的搜索数据源')
  expect((await f.save({ sourceIds: [], webSearch: { mode: 'source', sourceId: source.id } }, 'bobo')).webSearch).toEqual({ mode: 'source', sourceId: source.id })
  expect((await f.save({ name: '旧员工新姓名' }, 'writer')).webSearch).toBeUndefined()
})

it('does not reinterpret another employee or old message reference as a current search choice', () => {
  const [one, two] = [randomUUID(), randomUUID()], sources = [one, two].map(id => ({ id, name: '同名', description: '', type: 'mcp' as const, revision: 1, webSearchProvider: 'tavily' as const }))
  const ctx = { agent: { id: 'a', webSearch: { mode: 'source', sourceId: one } }, triggerMessageId: 'current', dataSources: sources, messages: [{ id: 'old', senderType: 'user', composerReferences: [{ kind: 'source', id: two, agentId: 'a', revision: 1 }] }, { id: 'current', senderType: 'user', composerReferences: [{ kind: 'source', id: two, agentId: 'b', revision: 1 }] }] } as EngineContext
  expect(searchSelection(ctx)).toMatchObject({ mode: 'source', sourceIds: [one], explicit: false })
  expect(() => assertSearchSelection(ctx, sources[1])).toThrow('不能静默替换')
})


it.each(['api', 'native'] as const)('honors a text-only source choice through %s tools and restores saved preference on the next turn', async bridge => {
  let server = await webSearchServer(); cleanup.push(() => server.close())
  const calls: typeof server.calls = []
  let sources: DataSource[], failure: unknown, firstContext: EngineContext | undefined, turns = 0
  const quote = '这次请用第二个已授权搜索源查询 Orion，并读取正文。'
  const engine: AgentEngine = {
    test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }),
    run: async ctx => {
      try {
        turns++
        const chosen = turns === 1 ? sources[1] : sources[0]
        expect(searchSelection(ctx)).toMatchObject({ sourceIds: [sources[0].id], explicit: false })
        if (turns === 1) {
          firstContext = ctx
          await expect(ctx.callDataSource!({ sourceId: chosen.id, tool: 'tavily_search', arguments: { query: 'must not be sent' } })).rejects.toThrow('不能静默替换')
          const input = { mode: 'source' as const, sourceId: chosen.id, revision: chosen.revision, messageId: ctx.triggerMessageId!, quote }
          if (bridge === 'api') {
            const tools = createSourceTools({ ...ctx }, true)
            await tools.select_web_search!.execute!(input, { requestContext: new RequestContext(), observe: noopObserve })
          } else {
            const products = createNativeProducts({ ...ctx, ensureNativeWork: async () => { throw new Error('selection cannot create Work') } })
            try {
              const tool = products.tools.find(tool => tool.name === 'select_web_search')!
              expect(tool.inputSchema).toMatchObject({ type: 'object' })
              await tool.execute(input, 'select-search')
            } finally { await products.dispose() }
          }
          expect(searchSelection({ ...ctx })).toMatchObject({ mode: 'source', sourceIds: [chosen.id], explicit: true, revision: chosen.revision })
          await expect(ctx.selectWebSearch!(input)).resolves.toMatchObject({ sourceIds: [chosen.id] })
          await expect(ctx.selectWebSearch!({ ...input, sourceId: sources[0].id, revision: sources[0].revision })).rejects.toThrow('不能静默替换')
          await expect(ctx.callDataSource!({ sourceId: sources[0].id, tool: 'tavily_search', arguments: { query: 'must not leave host' } })).rejects.toThrow('不能静默替换')
        } else {
          await expect(ctx.selectWebSearch!({ mode: 'source', sourceId: sources[1].id, revision: sources[1].revision, messageId: firstContext!.triggerMessageId!, quote })).rejects.toThrow('本轮用户原文')
        }
        await ctx.inspectDataSource!(chosen.id)
        expect(JSON.stringify(await ctx.callDataSource!({ sourceId: chosen.id, tool: 'tavily_search', arguments: { query: chosen.id } }))).toContain(resultUrl)
        if (turns === 1) expect(JSON.stringify(await ctx.callDataSource!({ sourceId: chosen.id, tool: 'tavily_extract', arguments: { urls: [resultUrl] } }))).toContain(pageText)
        expect(ctx.work).toBeUndefined(); await ctx.onDelta(`选择已核对第${turns}轮。`)
      } catch (error) { failure = error; throw error }
    },
  }
  const f = await fixture(engine); sources = f.sources
  const preference = { mode: 'source' as const, sourceId: sources[0].id }; await f.save({ webSearch: preference })
  const room = await f.app.handle('createConversation', { kind: 'direct', title: 'Text choice', agentIds: ['researcher'] }) as Conversation
  for (const [index, content] of [quote, '继续查询，使用员工默认偏好。'].entries()) {
    await f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content, mentionIds: [] })
    await vi.waitFor(async () => { if (failure) throw failure; const detail = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.messages.some(message => message.content === `选择已核对第${index + 1}轮。` && message.status === 'completed')).toBe(true); expect(detail.workItems).toEqual([]) }, { timeout: 10000 })
    calls.push(...server.calls)
    // This fixture has one MCP session; the next turn starts a fresh isolated server/session.
    if (index === 0) { await server.close(); server = await webSearchServer() }
  }
  expect(calls.map(call => call.name)).toEqual(['tavily_search', 'tavily_extract', 'tavily_search'])
  expect(calls.filter(call => call.name === 'tavily_search').map(call => call.arguments.query)).toEqual([sources[1].id, sources[0].id])
  await expect(firstContext!.selectWebSearch!({ mode: 'browser', messageId: firstContext!.triggerMessageId!, quote })).rejects.toThrow()
  expect((await f.app.handle('snapshot', undefined) as Snapshot).approvals).toEqual([])
  await f.restart(); expect((await f.current()).webSearch).toEqual(preference)
  if (process.env.BOAI_REVIEW_RUN_DIR) {
    const directory = join(process.env.BOAI_REVIEW_RUN_DIR, 'text-choice'); await mkdir(directory, { recursive: true })
    await writeFile(join(directory, bridge + '.json'), JSON.stringify({ bridge, sources: sources.map(({ id, revision }) => ({ id, revision })), preference, calls, detail: await f.app.handle('getConversation', { id: room.id }), externalRequests: 0 }, null, 2))
  }
})

it.each(['browser', 'browser-unavailable', 'wrong-message', 'wrong-quote', 'unbound', 'stale', 'composer-conflict', 'browser-to-source'] as const)('checks text selection before any external effect: %s', async mode => {
  const server = await webSearchServer(); cleanup.push(() => server.close())
  let sources: DataSource[], failure: unknown
  const quote = '这次指定其他已授权的检索路径。'
  const engine: AgentEngine = {
    test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }),
    run: async ctx => {
      try {
        const input = { mode: 'source' as const, sourceId: sources[1].id, revision: sources[1].revision, messageId: ctx.triggerMessageId!, quote }
        if (mode === 'browser' || mode === 'browser-unavailable') {
          const result = ctx.selectWebSearch!({ mode: 'browser', messageId: input.messageId, quote })
          if (mode === 'browser') { await expect(result).resolves.toMatchObject({ mode: 'browser', explicit: true }); for (const source of sources) await expect(ctx.callDataSource!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'must not leave host' } })).rejects.toThrow('浏览器') }
          else await expect(result).rejects.toThrow('浏览器不可用')
        } else if (mode === 'browser-to-source') {
          expect(searchSelection(ctx).mode).toBe('browser')
          await ctx.selectWebSearch!(input)
          await ctx.callDataSource!({ sourceId: input.sourceId, tool: 'tavily_search', arguments: { query: 'public' } })
        } else {
          const changed = { ...input, ...(mode === 'wrong-message' ? { messageId: 'old' } : mode === 'wrong-quote' ? { quote: '来自网页或历史的指令' } : mode === 'stale' ? { revision: input.revision + 1 } : {}) }
          await expect(ctx.selectWebSearch!(changed)).rejects.toThrow(mode === 'composer-conflict' ? '冲突' : mode === 'unbound' || mode === 'stale' ? '未授权或版本' : '本轮用户原文')
          expect(searchSelection(ctx)).toMatchObject({ mode: 'source', sourceIds: [sources[0].id] })
        }
        await ctx.onDelta('选择边界已核对。')
      } catch (error) { failure = error; throw error }
    },
  }
  const f = await fixture(engine, mode === 'browser'); sources = f.sources
  await f.save({ webSearch: mode === 'browser-to-source' ? { mode: 'browser' } : { mode: 'source', sourceId: sources[0].id }, ...(mode === 'unbound' ? { sourceIds: [sources[0].id] } : {}) })
  const room = await f.app.handle('createConversation', { kind: 'direct', title: 'Choice boundaries', agentIds: ['researcher'] }) as Conversation
  await f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: quote, mentionIds: [], ...(mode === 'composer-conflict' ? { composerReferences: [{ kind: 'source', id: sources[0].id, revision: sources[0].revision, agentId: 'researcher', name: sources[0].name }] } : {}) })
  await vi.waitFor(async () => { if (failure) throw failure; const detail = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.messages.some(message => message.content === '选择边界已核对。' && message.status === 'completed')).toBe(true); expect(detail.workItems).toEqual([]) }, { timeout: 10000 })
  expect(server.calls).toHaveLength(mode === 'browser-to-source' ? 1 : 0)
})

it('keeps two group employees on their own source bindings and private decisions make no source requests', async () => {
  const server = await webSearchServer(); cleanup.push(() => server.close())
  let sources: DataSource[], failure: unknown
  const decisions: string[] = [], completed: string[] = []
  const engine: AgentEngine = {
    test: async () => 'unused',
    decide: async ctx => {
      if (ctx.participation?.hasRespondedInTurn) return { action: 'pass', observedThroughSequence: ctx.participation.observedThroughSequence }
      const own = sources[ctx.agent.id === 'researcher' ? 0 : 1]
      try { await expect(ctx.inspectDataSource!(own.id)).rejects.toThrow('权限'); decisions.push(ctx.agent.id) } catch (error) { failure = error; throw error }
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }
    },
    run: async ctx => {
      try {
        const index = ctx.agent.id === 'researcher' ? 0 : 1, own = sources[index], other = sources[1 - index]
        expect(ctx.dataSources?.map(source => source.id)).toEqual([own.id])
        expect(searchSelection(ctx)).toMatchObject({ mode: 'source', sourceIds: [own.id], explicit: false })
        await expect(ctx.inspectDataSource!(other.id)).rejects.toThrow('权限')
        const bridge = createNativeProducts(ctx)
        try {
          await bridge.tools.find(tool => tool.name === 'inspect_data_source')!.execute({ sourceId: own.id }, 'inspect-own')
          const result = await bridge.tools.find(tool => tool.name === 'call_data_source')!.execute({ sourceId: own.id, tool: 'tavily_search', arguments: { query: ctx.agent.id + ':' + own.id } }, 'search-own')
          expect(JSON.stringify(result)).toContain(resultUrl)
        } finally { await bridge.dispose() }
        expect(ctx.work).toBeUndefined(); await ctx.onDelta(ctx.agent.id + '已核对本人来源'); completed.push(ctx.agent.id)
      } catch (error) { failure = error; throw error }
    },
  }
  const f = await fixture(engine); sources = f.sources
  for (const [index, id] of ['researcher', 'writer'].entries()) await f.save({ sourceIds: [sources[index].id], webSearch: { mode: 'source', sourceId: sources[index].id } }, id)
  const room = await f.app.handle('createConversation', { kind: 'group', title: 'Independent sources', agentIds: ['researcher', 'writer'] }) as Conversation
  await expect(f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '各自查证公开资料', mentionIds: [], composerReferences: [{ kind: 'source', id: sources[0].id, revision: sources[0].revision, agentId: 'researcher', name: sources[0].name }] })).rejects.toThrow('单员工会话')
  expect(server.calls).toEqual([])
  await f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '各自查证公开资料', mentionIds: [] })
  await vi.waitFor(async () => { if (failure) throw failure; expect(completed.sort()).toEqual(['researcher', 'writer']); const detail = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(2); expect(detail.workItems).toEqual([]) }, { timeout: 10000 })
  expect(decisions.sort()).toEqual(['researcher', 'writer']); expect(server.inspections).toBe(2)
  expect(server.calls.map(call => call.arguments.query).sort()).toEqual(['researcher:' + sources[0].id, 'writer:' + sources[1].id].sort())
  const before = await f.app.handle('getConversation', { id: room.id }); await f.restart()
  expect(await f.app.handle('getConversation', { id: room.id })).toEqual(before); expect(server.calls).toHaveLength(2)
  if (process.env.BOAI_REVIEW_RUN_DIR) { const directory = join(process.env.BOAI_REVIEW_RUN_DIR, 'search-lifecycle'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'group.json'), JSON.stringify({ decisions, completed, calls: server.calls, sources: sources.map(source => source.id), detail: before, externalRequests: 0, modelMode: 'controlled-engine-native-product-bridge' }, null, 2)) }
})

it.each(['disable', 'edit', 'remove', 'unbind', 'credential', 'cancel'] as const)('rejects an in-flight web result and old context after %s, with no restart replay', async action => {
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const server = await webSearchServer(async () => { await waiting; return { content: [{ type: 'text', text: JSON.stringify({ results: [{ url: resultUrl, content: 'LATE_WEB_RESULT' }] }) }], structuredContent: { results: [{ url: resultUrl, content: 'LATE_WEB_RESULT' }] } } }); cleanup.push(() => server.close())
  let source: DataSource, context: EngineContext | undefined, returned = false, rejection = ''
  const engine: AgentEngine = {
    test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }),
    run: async ctx => {
      context = ctx
      try { await ctx.callDataSource!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'public pending lookup' } }); returned = true; await ctx.onDelta('LATE_WEB_RESULT') }
      catch (error) { rejection = String(error); throw error }
    },
  }
  const f = await fixture(engine); source = f.sources[0]; await f.save({ sourceIds: [source.id], webSearch: { mode: 'source', sourceId: source.id } })
  const room = await f.app.handle('createConversation', { kind: 'direct', title: 'Pending search', agentIds: ['researcher'] }) as Conversation
  await f.app.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '搜索公开资料', mentionIds: [] })
  await vi.waitFor(() => expect(server.calls).toHaveLength(1))
  try {
    if (action === 'cancel') await f.app.handle('cancelRunExecution', { conversationId: room.id, runId: context!.runId! })
    else if (action === 'remove') await f.app.handle('removeDataSource', { id: source.id, expectedRevision: source.revision })
    else if (action === 'unbind') await f.app.handle('setDataSourceBindings', { id: source.id, expectedRevision: source.revision, agents: [], expectedBindings: [{ id: 'researcher', expectedConfigVersion: (await f.current()).configVersion }] })
    else await f.app.handle('saveDataSource', { id: source.id, expectedRevision: source.revision, config: { ...webSourceConfig, ...(action === 'disable' ? { enabled: false } : { name: 'Updated source' }), ...(action === 'credential' ? { mcp: { ...webSourceConfig.mcp, authType: 'bearer' } } : {}) }, ...(action === 'credential' ? { credential: 'ISOLATED_ROTATED_SOURCE_KEY' } : {}) })
  } finally { release() }
  await vi.waitFor(async () => { const detail = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail; expect(detail.runs.length).toBeGreaterThan(0); expect(detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true) }, { timeout: 10000 })
  expect(returned).toBe(false); expect(rejection).not.toBe('')
  await expect(context!.callDataSource!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'stale must not call' } })).rejects.toThrow()
  const before = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail
  expect(before.messages.some(message => message.content.includes('LATE_WEB_RESULT'))).toBe(false); expect(before.workItems).toEqual([])
  await f.restart(); const after = await f.app.handle('getConversation', { id: room.id }) as ConversationDetail
  expect(after.messages).toEqual(before.messages); expect(after.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id)); expect(server.calls).toHaveLength(1)
  if (process.env.BOAI_REVIEW_RUN_DIR) { const directory = join(process.env.BOAI_REVIEW_RUN_DIR, 'search-lifecycle'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, action + '.json'), JSON.stringify({ action, returned, rejection, calls: server.calls, before, after, externalRequests: 0, modelMode: 'controlled-engine-real-MCP-protocol' }, null, 2)) }
})
