/*
 * [OUTPUT]: 渠道搜索使用员工独立webSearch service及原可用范围，业务数据源为空仍能检索且不外借其他员工服务。
 * [OUTPUT]: 回应来源、未知不重试、旧回执不覆盖新状态与BOAI续聊不外发。
 * [OUTPUT]: 渠道私聊/群沿当前API员工目录批准，另一员工授权不外借，临时许可不跨来源续聊。
 * [OUTPUT]: CLI公开RPC/独立产物沿原渠道事务续聊与明确发送；旧hash/撤权拒绝、未知结果与重启不重放。
 * [OUTPUT]: 渠道私聊/群搜索沿本人源绑定与原首选，平台来信仅原渠道回发、BOAI续聊不回发、重复/重启零重放。
 * [OUTPUT]: 渠道停止/解除与同记录本人续聊的活动知识读取和迟到发布隔离回归。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 2026-10-14现行分离合同：BOAI/本人平台两创建顺序隔离、旧归一/别名保留后新渠道房间、真实阅读提示/隐藏恢复/重启回归。
 * [OUTPUT]: 员工各自渠道群上下文/无本地镜像、旧单员工原位及多员工历史/未知回执、单绑定限制回归。
 * [OUTPUT]: 2026-10-14 跨入口主私聊/其他用户隔离、两个群回复链、迁移回执/重启、忙时拒绝与100次去重压力回归。
 * [OUTPUT]: 群名慢查询不阻塞回复、100次事件缓存、重启持久化及失败/停止后的旧查询回归。
 * [OUTPUT]: 清理隐藏后重启，新渠道消息恢复原私聊/群条目，重复/未授权/未提及/材料失败不恢复。
 * [INPUT]: AppService原事务/执行路径、隔离SQLite、现成transport合同的受控夹具。
 * [OUTPUT]: 绑定/凭据隔离、平台事件/受理与拒绝的安全观察、真实来源、连续聊天/重启、重复事件、发送未知、附件失败与多机器人群回归。
 * [POS]: 第16组离线集成验证；不冒充真实平台或真实供应商通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { openDesktopCli } from '../apps/electron/src/main/cli-service'
import { readLocalConnection } from '../packages/transport/src/discovery'
import { CliRpcClient } from '../packages/transport/src/client'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { mergeRooms } from '../packages/runtime/src/modules/conversations/room-migration'
import type { AgentEngine, EngineContext, SecretStore } from '../packages/runtime/src/contracts'
import type { ChannelBindingState, ChannelDelivery, ChannelBindingInput } from '../packages/shared/src/domain/channels'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot } from '../packages/shared/src/domain'
import type { ChannelInbound, ChannelTransportFactory } from '../packages/runtime/src/modules/channels/channel-service'
import { isChannelConversation, mainConversations, sortedConversations } from '../packages/shared/src/domain/conversation-list'
import { createKnowledgeOperations } from '../packages/runtime/src/modules/resources/knowledge-tools'
import type { Resource } from '../packages/shared/src/domain'
import type { DataSource } from '../packages/shared/src/domain/sources'
import type { WebSearchServiceConfig } from '../packages/shared/src/domain/web-search'
import { webSearchServer, webSourceConfig, resultUrl, pageText } from './fixtures/web-search-server'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
class Secrets implements SecretStore {
  values = new Map<string, string>()
  async get(id: string) { return this.values.get(id) }
  async set(id: string, value: string) { this.values.set(id, value) }
  async delete(id: string) { this.values.delete(id) }
}
class Engine implements AgentEngine {
  contexts: EngineContext[] = []
  handler?: (context: EngineContext) => Promise<void>
  async test() { return 'fixture' }
  async decide(context: EngineContext) {
    const trigger = context.messages.find(message => message.id === context.triggerMessageId)
    return { action: context.messages.some(message => message.senderId === context.agent.id && message.sequence > (trigger?.sequence ?? Infinity) && message.status === 'completed') ? 'pass' as const : 'reply' as const, responseKind: 'chat' as const, observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) }
  }
  async run(context: EngineContext) { this.contexts.push(context); if (this.handler) await this.handler(context); else await context.onDelta(`答复-${context.agent.id}`) }
}
async function fixture(connectFailure?: unknown, groupName?: (chatId: string) => Promise<string | undefined>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-channels-'))); roots.push(root)
  const secrets = new Secrets(), engine = new Engine()
  const incoming = new Map<string, (event: ChannelInbound) => Promise<void>>()
  const observed = new Map<string, () => void>()
  const sent: { bindingId: string; text: string; files: string[]; externalThreadId: string }[] = []
  const failSend = new Set<string>(), reactionCalls: unknown[] = []
  let failReaction = false
  const factory: ChannelTransportFactory = async (binding, _credential, receive, _failed, received) => {
    let connected = false
    incoming.set(binding.id, receive)
    if (received) observed.set(binding.id, received)
    return { react: async (source, emoji, active) => { reactionCalls.push({ source, emoji, active }); if (failReaction) throw new Error('reaction response lost') }, groupName, start: async () => { if (connectFailure !== undefined) throw connectFailure; connected = true; return { botUserId: `bot-${binding.appId}` } }, stop: async () => { connected = false }, connected: () => connected, send: async (target, text, files) => { sent.push({ bindingId: binding.id, text, files: files.map(file => file.name), externalThreadId: target.externalThreadId }); if (failSend.has(binding.id)) throw new Error('response lost'); return ['external-reply'] } }
  }
  const create = async () => { const service = new AppService({ dataPath: root, secrets, engine, channelTransport: factory, emit: () => {} }); services.push(service); await service.init(); return service }
  const service = await create()
  const connection = await service.handle('saveConnection', { name: 'Fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1', defaultModel: 'fixture' }) as Connection
  for (const agent of ((await service.handle('snapshot', undefined)) as Snapshot).agents.filter(agent => ['writer', 'researcher'].includes(agent.id))) {
    const { configVersion, workspaceRef: _, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, connectionId: connection.id, modelId: 'fixture' })
  }
  const save = (agentId = 'writer', platform: ChannelBindingInput['platform'] = 'feishu', appId = platform + '-' + agentId, extra: Partial<ChannelBindingInput> = {}) => service.handle('saveChannelBinding', { agentId, platform, appId, name: `${platform}-${agentId}`, credential: 'fixture-secret', allowedUserIds: ['owner'], allowedChatIds: ['group'], requestId: `${platform}-${appId}`, ...extra }) as Promise<ChannelBindingState>
  const connect = async (binding: ChannelBindingState) => { await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision }); return (await service.handle('listChannelBindings', { agentId: binding.agentId }) as ChannelBindingState[]).find(value => value.id === binding.id)! }
  return { root, secrets, engine, incoming, observed, sent, failSend, service, create, save, connect, reactionCalls, failReaction: () => { failReaction = true } }
}
const event = (overrides: Partial<ChannelInbound> = {}): ChannelInbound => ({ eventId: 'event-1', tenantId: 'tenant', chatId: 'private', externalThreadId: 'lark:private:event-1', kind: 'direct', userId: 'owner', userName: '外部用户', text: '你好', isBot: false, mentioned: true, mentionedUserIds: [], attachments: [], ...overrides })
async function until(predicate: () => Promise<boolean> | boolean) { for (let i = 0; i < 400; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw new Error('Channel fixture timeout') }
async function channels(service: AppService) { return ((await service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => isChannelConversation(value) && !value.mergedInto) }
async function detail(service: AppService, id: string) { return service.handle('getConversation', { id }) as Promise<ConversationDetail> }

// Old installations may contain multiple bindings. Seed only this isolated database.
async function legacySibling(f: Awaited<ReturnType<typeof fixture>>, binding: ChannelBindingState, platform: ChannelBindingInput['platform'], appId: string) {
  await f.service.close()
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
  const old = (await store.load<ChannelBindingState & { credentialRef: string }>('channelBindings')).find(value => value.id === binding.id)!
  const sibling = { ...old, id: randomUUID(), platform, appId }
  try { await store.write([{ collection: 'channelBindings', id: sibling.id, value: sibling }]) } finally { await store.close() }
  f.service = await f.create()
  await until(async () => (await f.service.handle('listChannelBindings', { agentId: binding.agentId }) as ChannelBindingState[]).every(value => value.status === 'connected'))
  return (await f.service.handle('listChannelBindings', { agentId: binding.agentId }) as ChannelBindingState[]).find(value => value.id === sibling.id)!
}

describe('employee channel business connection', () => {
  it.each(['direct', 'group'] as const)('uses only the executing employee directory grants for %s channel access and local continuation', async kind => {
    const f = await fixture(), business = await realpath(await mkdtemp(join(tmpdir(), 'boai-channel-directory-'))); roots.push(business)
    const path = join(business, 'original.txt'); await writeFile(path, 'CHANNEL-DIRECTORY-ORIGINAL')
    for (const id of ['writer', 'researcher']) {
      const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...agent } = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === id)!
      await f.service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'ask', directoryGrants: id === 'researcher' ? [{ path: business, access: 'read-write' }] : [] })
    }
    const reads: string[] = [], failures: string[] = []
    f.engine.handler = async context => {
      expect(context.agent.id).toBe('writer')
      const runtime = await createTaskRuntime(context)
      try {
        const result = await runtime.tools.read_file.execute!({ path }, { requestContext: new RequestContext(), observe: noopObserve }) as { content: string }
        reads.push(result.content); await context.onDelta(result.content)
      } catch (error) { failures.push(String(error)); throw error }
      finally { await runtime.dispose() }
    }
    const binding = await f.connect(await f.save()), incoming = event({ kind, chatId: kind === 'group' ? 'group' : 'private' })
    await f.incoming.get(binding.id)!(incoming)
    await until(async () => (await f.service.handle('snapshot', undefined) as Snapshot).approvals.length === 1)
    const first = (await f.service.handle('snapshot', undefined) as Snapshot).approvals[0]
    expect(first.directory).toMatchObject({ directory: business, access: 'read-only' }); expect(reads).toEqual([]); expect(f.sent).toEqual([])
    await f.service.handle('approve', { id: first.id, approved: true, always: false })
    await until(() => f.sent.length === 1)
    expect(reads).toEqual(['CHANNEL-DIRECTORY-ORIGINAL']); expect(f.sent[0].text).toBe(reads[0])
    const room = (await channels(f.service))[0]
    await f.service.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '本人在BOAI继续读取同一原件', mentionIds: [] })
    await until(async () => (await f.service.handle('snapshot', undefined) as Snapshot).approvals.length === 1)
    const second = (await f.service.handle('snapshot', undefined) as Snapshot).approvals[0]
    expect(second.id).not.toBe(first.id); expect(second.directory?.directory).toBe(business)
    await f.service.handle('approve', { id: second.id, approved: false })
    await until(async () => (await detail(f.service, room.id)).runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)))
    expect(reads).toHaveLength(1); expect(f.sent).toHaveLength(1); expect(failures).toHaveLength(1); expect(failures[0]).toContain('拒绝')
    expect(await readFile(path, 'utf8')).toBe('CHANNEL-DIRECTORY-ORIGINAL')
    await f.service.close(); f.service = await f.create()
    expect(reads).toHaveLength(1); expect(f.sent).toHaveLength(1)
    const state = await f.service.handle('snapshot', undefined) as Snapshot
    expect(state.agents.find(agent => agent.id === 'writer')?.directoryGrants).toEqual([]); expect(state.approvals).toEqual([])
    if (process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR) {
      const output = join(process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR, `channel-${kind}`); await mkdir(output, { recursive: true })
      await (f.service as unknown as { store: ProductStore }).store.backup(join(output, 'boai.sqlite'))
      await writeFile(join(output, 'facts.json'), JSON.stringify({ externalRequests: 0, reads, failures, first, second, state, sent: f.sent, detail: await detail(f.service, room.id) }, null, 2))
    }
  })

  it.each(['direct', 'group'] as const)('uses the executing employee web source for %s channel messages, local continuation and restart', async kind => {
    const server = await webSearchServer()
    try {
      const f = await fixture()
      const source = await f.service.handle('saveWebSearchService', { id: randomUUID(), expectedRevision: 0, provider: 'tavily', name: 'Employee search', enabled: true, credential: 'fixture-search-secret' }) as WebSearchServiceConfig
      const other = await f.service.handle('saveWebSearchService', { id: randomUUID(), expectedRevision: 0, provider: 'tavily', name: 'Other employee search', enabled: true, credential: 'fixture-search-secret' }) as WebSearchServiceConfig
      for (const id of ['writer', 'researcher']) {
        const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...agent } = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === id)!
        const own = id === 'writer' ? source : other
        await f.service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, sourceIds: [], webSearch: { mode: 'service', serviceId: own.id, allowedServiceIds: [own.id] } })
      }
      let error: unknown
      f.engine.handler = async ctx => {
        try {
          expect(ctx.agent.id).toBe('writer'); expect(ctx.webSearchServices?.map(source => source.id)).toEqual([source.id]); expect(ctx.dataSources).toEqual([])
          await expect(ctx.inspectWebSearch!(other.id)).rejects.toThrow('未启用')
          const catalog = await ctx.inspectWebSearch!(source.id)
          expect(JSON.stringify(catalog)).toContain('tavily_search')
          const search = await ctx.callWebSearch!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'public Orion launch schedule' } })
          expect(JSON.stringify(search)).toContain(resultUrl)
          const body = await ctx.callWebSearch!({ sourceId: source.id, tool: 'tavily_extract', arguments: { urls: [resultUrl] } })
          expect(JSON.stringify(body)).toContain(pageText); expect(ctx.work).toBeUndefined()
          await ctx.onDelta(pageText + ' ' + resultUrl)
        } catch (failure) { error = failure; throw failure }
      }
      const binding = await f.connect(await f.save()), input = event({ kind, chatId: kind === 'group' ? 'group' : 'private', text: '请用本人绑定来源查证公共资料' })
      await f.incoming.get(binding.id)!(input)
      await vi.waitFor(() => { if (error) throw error; expect(f.sent).toHaveLength(1) }, { timeout: 10000 })
      const room = (await channels(f.service))[0]
      expect(f.sent[0]).toMatchObject({ bindingId: binding.id, text: pageText + ' ' + resultUrl, externalThreadId: input.externalThreadId })
      await f.incoming.get(binding.id)!(input); expect(server.calls).toHaveLength(2); expect(f.sent).toHaveLength(1)
      await f.service.handle('sendMessage', { conversationId: room.id, requestId: randomUUID(), content: '在本地继续查证相同公共资料', mentionIds: [] })
      await vi.waitFor(async () => { if (error) throw error; expect((await detail(f.service, room.id)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(2) }, { timeout: 10000 })
      expect(server.calls).toHaveLength(4); expect(f.sent).toHaveLength(1)
      const before = await detail(f.service, room.id); await f.service.close(); f.service = await f.create()
      await until(async () => (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
      expect((await detail(f.service, room.id)).messages).toEqual(before.messages); expect(server.calls).toHaveLength(4)
      await f.incoming.get(binding.id)!({ ...input, eventId: 'after-restart', externalThreadId: 'lark:after-restart' })
      await vi.waitFor(() => { if (error) throw error; expect(f.sent).toHaveLength(2) }, { timeout: 10000 })
      expect(server.calls.map(call => call.name)).toEqual(['tavily_search', 'tavily_extract', 'tavily_search', 'tavily_extract', 'tavily_search', 'tavily_extract'])
      expect((await detail(f.service, room.id)).workItems).toEqual([])
      if (process.env.BOAI_REVIEW_RUN_DIR) { const dir = join(process.env.BOAI_REVIEW_RUN_DIR, 'search-entries'); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'channel-' + kind + '.json'), JSON.stringify({ kind, calls: server.calls, sent: f.sent, detail: await detail(f.service, room.id), externalRequests: 0, modelMode: 'controlled-engine-and-channel-transport-real-MCP-SDK' }, null, 2)) }
    } finally { await server.close() }
  })

  it.each(['direct', 'group'] as const)('revokes prior knowledge provenance and does not share it with a replacement %s recipient', async kind => {
    const f = await fixture(), binding = await f.connect(await f.save())
    const original = event({ kind, chatId: kind === 'group' ? 'group' : 'private' })
    await f.incoming.get(binding.id)!(original); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], path = join(f.root, 'reference.md')
    await writeFile(path, '只有原获准会话可用的知识')
    const agent = ((await f.service.handle('snapshot', undefined)) as Snapshot).agents.find(agent => agent.id === 'writer')!
    await f.service.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: agent.id, expectedConfigVersion: agent.configVersion, source: { kind: 'file', path, name: '规范.md' } })
    const resource = (await f.service.handle('listEmployeeKnowledge', { agentId: agent.id }) as Resource[])[0]
    await f.service.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: agent.id, resourceId: resource.id, conversationId: room.id, expectedConfigVersion: (await detail(f.service, room.id)).conversation.configVersion, shared: true })
    f.engine.handler = async context => {
      const read = createKnowledgeOperations(context).find(tool => tool.name === 'read_knowledge')
      await context.onDelta(read ? (await read.execute({ resourceId: resource.id, path: resource.path, contentHash: resource.knowledge!.contentHash }) as { content: string }).content : '没有获准知识资料')
    }
    await f.incoming.get(binding.id)!({ ...original, eventId: 'knowledge-history' }); await until(() => f.sent.length === 2)
    expect(f.sent[1].text).toBe('只有原获准会话可用的知识')
    const answer = (await detail(f.service, room.id)).messages.find(message => message.content === f.sent[1].text)!
    const store = (f.service as unknown as { store: ProductStore }).store
    expect(await store.get('memoryObservations', answer.runId!)).toBeTruthy()
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    expect(await store.get('memoryObservations', answer.runId!)).toBeTruthy()
    expect((await store.get<{ invalidated?: boolean }>('snapshots', answer.runId!))?.invalidated).not.toBe(true)
    const stopped = (await f.service.handle('listChannelBindings', { agentId: agent.id }) as ChannelBindingState[])[0]
    const edited = await f.service.handle('saveChannelBinding', { id: stopped.id, agentId: agent.id, platform: stopped.platform, appId: stopped.appId, name: stopped.name, expectedRevision: stopped.revision, allowedUserIds: kind === 'direct' ? ['replacement'] : ['owner'], allowedChatIds: kind === 'group' ? ['replacement-group'] : [], requestId: randomUUID() }) as ChannelBindingState
    expect((await store.get<{ invalidated?: boolean }>('snapshots', answer.runId!))?.invalidated).toBe(true)
    expect(await store.get('memoryObservations', answer.runId!)).toBeUndefined()
    await f.connect(edited)
    await f.incoming.get(binding.id)!({ ...original, eventId: 'replacement', userId: kind === 'direct' ? 'replacement' : 'owner', chatId: kind === 'group' ? 'replacement-group' : 'private' })
    await until(() => f.sent.length === 3)
    expect(f.sent[2].text).toBe('没有获准知识资料')
    expect(f.engine.contexts.at(-1)?.conversation.id).not.toBe(room.id)
    expect(f.engine.contexts.at(-1)?.resources.some(item => item.id === resource.id)).toBe(false)
    expect((await f.service.handle('listEmployeeKnowledge', { agentId: agent.id }) as Resource[]).map(item => item.id)).toContain(resource.id)
    expect((await detail(f.service, room.id)).messages.some(message => message.id === answer.id)).toBe(true)
  })

  it.each((['disconnect', 'remove', 'reconnect', 'local'] as const).flatMap(operation => ['between-reads', 'in-flight-read'].map(stage => ({ operation, stage }))))('invalidates active external knowledge on $operation at $stage while retaining owner-local access', async ({ operation, stage }) => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], path = join(f.root, 'private-reference.md')
    await writeFile(path, '知识资料：项目颜色蓝色。')
    const agent = ((await f.service.handle('snapshot', undefined)) as Snapshot).agents.find(agent => agent.id === 'writer')!
    await f.service.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: agent.id, expectedConfigVersion: agent.configVersion, source: { kind: 'file', path, name: '参考.md' } })
    const resource = (await f.service.handle('listEmployeeKnowledge', { agentId: agent.id }) as Resource[])[0]
    await f.service.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: agent.id, resourceId: resource.id, conversationId: room.id, expectedConfigVersion: (await detail(f.service, room.id)).conversation.configVersion, shared: true })
    let held: EngineContext | undefined, first = '', second = '', error = '', done = false
    let release!: () => void
    const pause = new Promise<void>(resolve => { release = resolve })
    f.engine.handler = async context => {
      const read = createKnowledgeOperations(context).find(tool => tool.name === 'read_knowledge')!
      const args = { resourceId: resource.id, path: resource.path, contentHash: resource.knowledge!.contentHash }
      try {
        first = (await read.execute(args) as { content: string }).content
        if (stage === 'between-reads') { held = context; await pause }
        else {
          const access = context.assertKnowledgeAccess!
          let checks = 0
          context.assertKnowledgeAccess = async ids => {
            // The third gate follows the actual file read, before returning bytes.
            if (++checks === 3) { held = context; await pause }
            await access(ids)
          }
        }
        try { second = (await read.execute(args) as { content: string }).content } catch (failure) { error = String(failure) }
        await context.onDelta('迟到参考答案：蓝色')
      } finally { done = true }
    }
    try {
      if (operation === 'local') await f.service.handle('sendMessage', { conversationId: room.id, content: '本人继续查阅资料', requestId: randomUUID(), mentionIds: [] })
      else await f.incoming.get(binding.id)!(event({ eventId: 'knowledge-active', text: '请查阅资料' }))
      await until(() => !!held)
      await f.service.handle(operation === 'remove' ? 'removeChannelBinding' : 'disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
      if (operation === 'reconnect') await f.connect((await f.service.handle('listChannelBindings', { agentId: agent.id }) as ChannelBindingState[])[0])
      release(); await until(() => done)
      await until(async () => (await detail(f.service, room.id)).runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)))
      expect(first).toBe('知识资料：项目颜色蓝色。')
      expect(held!.signal.aborted).toBe(operation !== 'local')
      expect(second).toBe(operation === 'local' ? first : '')
      expect(Boolean(error)).toBe(operation !== 'local')
      const answers = (await detail(f.service, room.id)).messages.filter(message => message.status === 'completed' && message.content.includes('迟到参考答案'))
      expect(answers).toHaveLength(operation === 'local' ? 1 : 0)
      expect(f.sent).toHaveLength(1)
    } finally { release() }
  })

  it('includes local continuation in the same record paging, search and unread counts', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], existing = await detail(f.service, room.id)
    await f.service.close()
    const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
    const local: Message = { id: 'old-private-user', conversationId: room.id, senderType: 'user', senderId: 'user', senderName: '本人', content: '历史内部密语', status: 'completed', sequence: 3, createdAt: new Date().toISOString() }
    const reply: Message = { ...local, id: 'old-private-reply', senderType: 'agent', senderId: 'writer', content: '历史内部答复', sequence: 4, runId: 'old-private-run' }
    const reading = new (await import('../packages/runtime/src/modules/conversations/reading-repository')).ConversationReadingRepository(store)
    try { await store.transaction(async tx => {
      await tx.put({ collection: 'messages', id: local.id, value: local }); await tx.put({ collection: 'messages', id: reply.id, value: reply })
      await tx.put({ collection: 'runs', id: reply.runId!, value: { ...existing.runs.find(run => run.messageId), id: reply.runId, conversationId: room.id, messageId: reply.id, triggerMessageId: local.id, agentId: 'writer', status: 'completed', createdAt: local.createdAt } })
      await reading.recordCompletion(tx, reply)
    }) } finally { await store.close() }
    const service = await f.create()
    const view = await service.handle('getConversationView', { conversationId: room.id }) as import('../packages/shared/src/domain/reading').ConversationView
    expect(view.messages.map(message => message.id)).toEqual([...existing.messages.map(message => message.id), local.id, reply.id])
    expect(view.reading.unreadCount).toBe(2)
    expect((await channels(service))[0].channelUnreadCount).toBe(2)
    expect((await channels(service))[0].lastMessagePreview).toContain('历史内部')
    const hidden = await service.handle('getConversationView', { conversationId: room.id, aroundMessageId: reply.id }) as typeof view
    expect(hidden.messages.some(message => message.id === reply.id)).toBe(true)
    expect((await detail(service, room.id)).messages).toHaveLength(4)
    const completions = view.messagePage.items.flatMap(item => item.completion ? [item.completion] : [])
    const observed = await service.handle('observeConversationReading', { conversationId: room.id, epoch: view.reading.epoch, expectedRevision: view.reading.revision, completions }) as typeof view.reading
    expect(observed.unreadCount).toBe(0)
    expect((await channels(service))[0].channelUnreadCount).toBe(0)
  })

  it('publishes only a selected fixed file from this record, with hash and cross-channel checks', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const parent = (await channels(f.service))[0], source = (await detail(f.service, parent.id)).messages[0]
    const internal = parent
    const host = f.service as unknown as { store: ProductStore; artifactRepository: import('../packages/runtime/src/modules/workspaces/artifact-repository').ArtifactRepository }
    const fileId = randomUUID(), directory = join(f.root, 'workspaces', internal.id, 'artifacts', fileId)
    await mkdir(directory, { recursive: true }); const path = join(directory, 'internal.md'), text = '# 内部修改结果\n'
    await writeFile(path, text)
    const artifact = await host.store.transaction(tx => host.artifactRepository.register(tx, { id: fileId, conversationId: internal.id, ownerAgentId: 'writer', name: 'internal.md', path, size: Buffer.byteLength(text), contentHash: createHash('sha256').update(text).digest('hex') }, { conversationId: internal.id, revisionRequestId: null, sourceWorkId: null, sourceMessageId: null }))
    expect(f.sent).toHaveLength(1)
    const ref = { id: artifact.id, conversationId: internal.id, contentHash: artifact.contentHash }
    const input = { conversationId: parent.id, sourceMessageId: source.id, content: '', artifacts: [ref], requestId: 'publish-file' }
    await expect(f.service.handle('publishChannelMessage', { ...input, artifacts: [{ ...ref, contentHash: 'a'.repeat(64) }] })).rejects.toThrow()
    const accepted = await f.service.handle('publishChannelMessage', input) as Message
    await until(() => f.sent.length === 2)
    expect(f.sent.at(-1)?.files).toEqual(['internal.md']); expect(accepted.channelPublication?.artifacts[0]).toMatchObject({ ...ref, name: 'internal.md' })
    await f.incoming.get(binding.id)!(event({ eventId: 'other-channel', kind: 'group', chatId: 'group' })); await until(() => f.sent.length === 3)
    const other = (await channels(f.service)).find(room => room.id !== parent.id)!, otherSource = (await detail(f.service, other.id)).messages[0]
    await expect(f.service.handle('publishChannelMessage', { ...input, conversationId: other.id, sourceMessageId: otherSource.id, requestId: 'wrong-file-channel' })).rejects.toThrow('来源已失效')
    await writeFile(path, '# 外部修改\n')
    await expect(f.service.handle('publishChannelMessage', { ...input, requestId: 'stale-file' })).rejects.toThrow()
    expect(f.sent).toHaveLength(3)
  })

  it('continues each channel record with shared history and sends only platform-triggered answers automatically', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ text: '原始上下文：项目代号青石' })); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], source = (await detail(f.service, room.id)).messages[0]
    const roomsBefore = ((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.map(room => room.id)
    const local = await f.service.handle('sendMessage', { conversationId: room.id, content: '接着刚才，交期是周五', mentionIds: [], requestId: 'same-record-local', replyToMessageId: source.id }) as Message
    await until(async () => (await detail(f.service, room.id)).messages.some(message => message.senderType === 'agent' && message.sequence > local.sequence && message.status === 'completed'))
    expect(f.engine.contexts.at(-1)?.conversation.id).toBe(room.id)
    expect(f.engine.contexts.at(-1)?.messages.map(message => message.content)).toEqual(expect.arrayContaining(['原始上下文：项目代号青石', '接着刚才，交期是周五']))
    expect(f.sent).toHaveLength(1)
    expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.map(room => room.id)).toEqual(roomsBefore)
    await f.incoming.get(binding.id)!(event({ eventId: 'next-external', text: '项目交期是什么？', externalThreadId: 'thread-next' })); await until(() => f.sent.length === 2)
    expect(f.engine.contexts.at(-1)?.conversation.id).toBe(room.id)
    expect(f.engine.contexts.at(-1)?.messages.some(message => message.content === '接着刚才，交期是周五')).toBe(true)
    expect(f.sent.at(-1)?.externalThreadId).toBe('thread-next')
    await f.incoming.get(binding.id)!(event({ eventId: 'new-chat', chatId: 'new-private-chat', externalThreadId: 'new-thread', text: '新的会话' })); await until(() => f.sent.length === 3)
    expect(f.engine.contexts.at(-1)?.conversation.id).not.toBe(room.id)
    expect(f.engine.contexts.at(-1)?.messages.some(message => message.content.includes('青石') || message.content.includes('交期是周五'))).toBe(false)
    await f.service.close(); const restarted = await f.create()
    expect((await detail(restarted, room.id)).messages.some(message => message.id === local.id)).toBe(true)
    expect(f.sent).toHaveLength(3)
  })

  it.each([false, true])('sends the selected existing answer once without another model call or duplicate message, unknown=%s', async unknown => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0]
    await f.service.handle('sendMessage', { conversationId: room.id, content: '继续这条记录', mentionIds: [], requestId: 'local-for-publish' })
    await until(async () => (await detail(f.service, room.id)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length === 2)
    const before = await detail(f.service, room.id), answer = before.messages.at(-1)!
    const contentHash = createHash('sha256').update(JSON.stringify([answer.id, answer.conversationId, answer.content, answer.status])).digest('hex')
    const input = { conversationId: room.id, messageId: answer.id, contentHash, requestId: 'publish-existing' }
    await expect(f.service.handle('publishChannelReply', { ...input, contentHash: 'f'.repeat(64) })).rejects.toThrow('已变化')
    await expect(f.service.handle('publishChannelReply', { ...input, messageId: before.messages[0].id })).rejects.toThrow('已变化')
    const calls = f.engine.contexts.length
    if (unknown) f.failSend.add(binding.id)
    const first = await f.service.handle('publishChannelReply', input) as Message
    await until(async () => (await f.service.handle('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [answer.id] }) as ChannelDelivery[])[0]?.status === (unknown ? 'unknown' : 'sent'))
    expect(first.id).toBe(answer.id)
    expect((await detail(f.service, room.id)).messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
    expect(f.sent).toHaveLength(2); expect(f.sent[1].externalThreadId).toBe('lark:private:event-1')
    expect(f.engine.contexts).toHaveLength(calls)
    await f.service.close(); const restarted = await f.create()
    expect(await restarted.handle('publishChannelReply', input)).toMatchObject({ id: answer.id })
    expect(await restarted.handle('publishChannelReply', { ...input, requestId: 'another-click' })).toMatchObject({ id: answer.id })
    expect(f.sent).toHaveLength(2); expect(f.engine.contexts).toHaveLength(calls)
  })
  it('publishes only an explicit fixed target without a model call, deduplicates and preserves unknown after restart', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], source = (await detail(f.service, room.id)).messages[0]
    await f.incoming.get(binding.id)!(event({ eventId: 'newer', externalThreadId: 'thread-newer' })); await until(() => f.sent.length === 2)
    const input = { conversationId: room.id, sourceMessageId: source.id, content: '明确外发', artifacts: [], requestId: 'explicit-send' }
    const calls = f.engine.contexts.length
    const [first, duplicate] = await Promise.all([f.service.handle('publishChannelMessage', input), f.service.handle('publishChannelMessage', input)]) as Message[]
    expect(first.id).toBe(duplicate.id); expect(first.channelPublication?.actor).toBe('user')
    await until(() => f.sent.length === 3)
    expect(f.sent.at(-1)).toMatchObject({ text: '明确外发', externalThreadId: 'lark:private:event-1' })
    expect(f.engine.contexts).toHaveLength(calls)
    await until(async () => (await f.service.handle('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [first.id] }) as ChannelDelivery[])[0]?.status === 'sent')
    await expect(f.service.handle('publishChannelMessage', { ...input, content: '换内容' })).rejects.toThrow('不同内容')
    await expect(f.service.handle('publishChannelMessage', { ...input, sourceMessageId: first.id, requestId: 'invalid-target' })).rejects.toThrow('原始来信')
    f.failSend.add(binding.id)
    const unknownInput = { ...input, content: '平台结果未知', requestId: 'unknown-send' }
    const unknown = await f.service.handle('publishChannelMessage', unknownInput) as Message
    await until(async () => (await f.service.handle('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [unknown.id] }) as ChannelDelivery[])[0]?.status === 'unknown')
    await f.service.close(); const restarted = await f.create()
    expect(await restarted.handle('publishChannelMessage', unknownInput)).toMatchObject({ id: unknown.id })
    expect(f.sent).toHaveLength(4); expect(f.engine.contexts).toHaveLength(calls)
    await restarted.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    await expect(restarted.handle('publishChannelMessage', { ...input, requestId: 'revoked' })).rejects.toThrow('授权已失效')
    expect(f.sent).toHaveLength(4)
  })
  it('edits the current record attachment locally without acquiring another channel permission', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ attachments: [{ name: 'notes.txt', read: async () => Buffer.from('原渠道附件固定内容') }] })); await until(() => f.sent.length === 1)
    const parent = (await channels(f.service))[0], material = (await detail(f.service, parent.id)).materials![0]
    const internal = parent
    const materialReference = { id: material.id, conversationId: parent.id, revision: material.revision, contentHash: material.contentHash!, parseVersion: material.parseVersion }
    const receipt = await f.service.handle('sendMessage', { conversationId: internal.id, content: '只在内部修改这份文件', mentionIds: ['writer'], requestId: 'edit-channel-file', materialReference }) as Message
    expect(receipt.materialReference).toEqual(materialReference)
    await until(async () => (await detail(f.service, internal.id)).messages.some(message => message.senderType === 'agent' && message.status === 'completed'))
    expect(JSON.stringify(f.engine.contexts.at(-1)?.messages)).toContain('原渠道附件固定内容')
    expect(f.sent).toHaveLength(1)
    await f.incoming.get(binding.id)!(event({ eventId: 'group-file', kind: 'group', chatId: 'group' })); await until(() => f.sent.length === 2)
    const other = (await channels(f.service)).find(room => room.id !== parent.id)!
    const otherDiscussion = other
    await expect(f.service.handle('sendMessage', { conversationId: otherDiscussion.id, content: '越权读取', mentionIds: ['writer'], requestId: 'wrong-channel', materialReference })).rejects.toThrow()
    expect(f.sent).toHaveLength(2)
  })

  it('projects channel new replies without scanning history or pretending they were seen, and clears the badge only on verified observation', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0]
    expect(room.channelUnreadCount).toBe(1)
    const view = await f.service.handle('getConversationView', { conversationId: room.id }) as import('../packages/shared/src/domain/reading').ConversationView
    expect((await channels(f.service))[0].channelUnreadCount).toBe(1)
    const completions = view.messagePage.items.flatMap(item => item.completion ? [{ messageId: item.completion.messageId, epoch: item.completion.epoch, ordinal: item.completion.ordinal, contentHash: item.completion.contentHash }] : [])
    await f.service.handle('observeConversationReading', { conversationId: room.id, epoch: view.reading.epoch, expectedRevision: view.reading.revision, completions })
    expect((await channels(f.service))[0].channelUnreadCount).toBe(0)
    await f.service.handle('updateConversationList', { id: mainConversations(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations)[0].id, action: 'hide' })
    await f.incoming.get(binding.id)!(event());
    expect(mainConversations(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations)).toHaveLength(0)
    await f.incoming.get(binding.id)!(event({ eventId: 'new-event' })); await until(() => f.sent.length === 2)
    expect(mainConversations(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations)).toHaveLength(1)
    expect((await channels(f.service))[0].channelUnreadCount).toBe(1)
  })
  it('allows one new binding per employee, verifies the same receipt, and permits replacing an unbound bot', async () => {
    const f = await fixture(), first = await f.save()
    expect(await f.save()).toEqual(first)
    await expect(f.save('writer', 'lark', 'another-bot')).rejects.toThrow('一个渠道绑定')
    expect(f.secrets.values.size).toBe(1)
    await f.save('researcher')
    await f.service.handle('removeChannelBinding', { id: first.id, expectedRevision: first.revision })
    const next = await f.save('writer', 'lark', 'replacement-bot')
    expect(next.platform).toBe('lark')
    expect(await f.service.handle('listChannelBindings', { agentId: 'writer' })).toHaveLength(1)
  })
  it('preserves a legacy single-employee group identity and blocks BOAI group configuration while local clear/hide still works', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'group' })); await until(() => f.sent.length === 1)
    const original = (await channels(f.service))[0], before = await detail(f.service, original.id)
    await f.service.close()
    const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
    const { agentId: _, ...legacySource } = original.channel!
    try { await store.write([{ collection: 'conversations', id: original.id, value: { ...original, channel: legacySource } }]) } finally { await store.close() }
    const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'group', eventId: 'new-group-event' })); await until(() => f.sent.length === 2)
    expect(await channels(restarted)).toHaveLength(1)
    expect((await channels(restarted))[0]).toMatchObject({ id: original.id, configVersion: original.configVersion, channel: { agentId: 'writer' } })
    expect((await detail(restarted, original.id)).messages.map(message => message.id)).toEqual(expect.arrayContaining(before.messages.map(message => message.id)))
    await expect(restarted.handle('createConversation', { id: original.id, expectedConfigVersion: original.configVersion, kind: 'group', title: '本地改名', agentIds: ['writer', 'researcher'] })).rejects.toThrow('渠道会话不能修改')
    await expect(restarted.handle('deleteConversation', { id: original.id })).rejects.toThrow('不能解散')
    await restarted.handle('clearConversationHistory', { id: original.id, hide: true })
    expect((await channels(restarted))[0]).toMatchObject({ id: original.id, list: { hidden: true } })
  })
  it('retains shared legacy group history and cleared/unknown receipts without replay, while new events enter each employee channel', async () => {
    const f = await fixture(), writer = await f.connect(await f.save()), researcher = await f.connect(await f.save('researcher'))
    const input = event({ kind: 'group', chatId: 'group' })
    await f.incoming.get(writer.id)!(input); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0], history = await detail(f.service, room.id)
    await f.service.close()
    const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
    const { agentId: _, ...legacySource } = room.channel!
    const legacyId = 'channel-' + createHash('sha256').update(JSON.stringify(legacySource)).digest('hex')
    const shared = { ...room, id: legacyId, workspacePath: join(f.root, 'workspaces', legacyId), channel: legacySource, agentIds: ['writer', 'researcher'] }
    const legacyKey = (id: string) => 'channel-' + createHash('sha256').update(JSON.stringify([legacySource, id])).digest('hex')
    try {
      await store.transaction(async tx => {
        await tx.remove('conversations', room.id)
        await tx.put({ collection: 'conversations', id: shared.id, value: shared })
        for (const message of history.messages) await tx.put({ collection: 'messages', id: message.id, value: { ...message, conversationId: shared.id } })
        for (const run of history.runs) await tx.put({ collection: 'runs', id: run.id, value: { ...run, conversationId: shared.id } })
        for (const id of ['cleared-old', 'unknown-old']) await tx.put({ collection: 'messageReceipts', id: legacyKey(id), value: { id: legacyKey(id), conversationId: shared.id, ...(id === 'cleared-old' ? { cleared: true } : {}) } })
      })
    } finally { await store.close() }
    const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'researcher' }) as ChannelBindingState[])[0].status === 'connected' && (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
    for (const eventId of ['cleared-old', 'unknown-old']) for (const binding of [writer, researcher]) await f.incoming.get(binding.id)!(event({ ...input, eventId }))
    expect(f.sent).toHaveLength(1)
    await expect(restarted.handle('sendMessage', { conversationId: shared.id, content: '不继续旧协作', requestId: 'legacy-local', mentionIds: [] })).rejects.toThrow('仅保留历史')
    for (const binding of [writer, researcher]) await f.incoming.get(binding.id)!(event({ ...input, eventId: 'fresh-event' }))
    await until(() => f.sent.length === 3)
    const rooms = await channels(restarted)
    expect(rooms).toHaveLength(3)
    const { channelUnreadCount: _unread, ...savedShared } = shared
    expect(rooms.find(value => value.id === shared.id)).toMatchObject(savedShared)
    expect((await detail(restarted, shared.id)).messages.map(message => message.id)).toEqual(history.messages.map(message => message.id))
    expect(rooms.filter(value => value.id !== shared.id).map(value => value.agentIds)).toEqual(expect.arrayContaining([['writer'], ['researcher']]))
  })
  it.each(['direct', 'group'] as const)('restores the same hidden %s item only when a new authorized platform message is committed after restart', async kind => {
    const f = await fixture(), binding = await f.connect(await f.save('writer', 'feishu', 'hidden-bot', { ownerUserId: 'owner' }))
    const input = event({ kind, ...(kind === 'group' ? { chatId: 'group' } : {}) })
    await f.incoming.get(binding.id)!(input); await until(() => f.sent.length === 1)
    const room = f.engine.contexts[0].conversation
    await f.service.handle('clearConversationHistory', { id: room.id, hide: true })
    await f.service.close(); const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
    const snapshot = () => restarted.handle('snapshot', undefined) as Promise<Snapshot>
    const visible = async () => sortedConversations((await snapshot()).conversations).some(value => value.id === room.id)
    expect(await visible()).toBe(false)
    await f.incoming.get(binding.id)!(input)
    await f.incoming.get(binding.id)!(event({ ...input, eventId: 'unapproved', userId: 'stranger' }))
    if (kind === 'group') await f.incoming.get(binding.id)!(event({ ...input, eventId: 'not-mentioned', mentioned: false }))
    await expect(f.incoming.get(binding.id)!(event({ ...input, eventId: 'failed-material', attachments: [{ name: 'broken.txt', read: async () => { throw new Error('download failed') } }] }))).rejects.toThrow('download failed')
    expect(await visible()).toBe(false); expect(f.sent).toHaveLength(1)
    await f.incoming.get(binding.id)!(event({ ...input, eventId: 'new-after-restart', text: '下午好' })); await until(() => f.sent.length === 2)
    expect(await visible()).toBe(true)
    expect((await snapshot()).conversations.filter(value => value.id === room.id)).toHaveLength(1)
    expect((await snapshot()).conversations.find(value => value.id === room.id)).toMatchObject({ configVersion: room.configVersion, title: room.title, list: { hidden: false, pinned: false } })
    expect((await detail(restarted, room.id)).messages.filter(message => message.senderType === 'user').map(message => message.content)).toEqual(['下午好'])
    await restarted.close(); const again = await f.create()
    expect(sortedConversations(((await again.handle('snapshot', undefined)) as Snapshot).conversations).some(value => value.id === room.id)).toBe(true)
    expect(f.sent).toHaveLength(2)
  })
  it('fetches group names without blocking replies, caches repeated events and persists only the title across restart/rename', async () => {
    let resolve!: (name: string) => void
    const lookup = vi.fn(() => new Promise<string>(done => { resolve = done }))
    const f = await fixture(undefined, lookup), binding = await f.connect(await f.save())
    const group = event({ kind: 'group', chatId: 'group' })
    await f.incoming.get(binding.id)!(group); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0]
    expect(room.title).toBe('feishu · group')
    for (let index = 0; index < 100; index++) await f.incoming.get(binding.id)!(group)
    await f.incoming.get(binding.id)!(event({ ...group, eventId: 'next', text: '继续聊' })); await until(() => f.sent.length === 2)
    expect(lookup).toHaveBeenCalledExactlyOnceWith('group')
    resolve('  研发\n讨论群  '); await until(async () => (await channels(f.service))[0].title === '研发 讨论群 · 飞书')
    expect((await channels(f.service))[0]).toMatchObject({ id: room.id, channel: room.channel, configVersion: room.configVersion, updatedAt: room.updatedAt })
    await f.service.close(); const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
    expect((await channels(restarted))[0]).toMatchObject({ id: room.id, title: '研发 讨论群 · 飞书' })
    lookup.mockResolvedValue('改名后的群')
    await f.incoming.get(binding.id)!(event({ ...group, eventId: 'after-restart' })); await until(() => f.sent.length === 3)
    await until(async () => (await channels(restarted))[0].title === '改名后的群 · 飞书')
    expect(await channels(restarted)).toHaveLength(1)
    expect((await channels(restarted))[0]).toMatchObject({ id: room.id, configVersion: room.configVersion })
  })
  it('keeps delivery connected with a cached failed lookup and never queries unapproved groups or private chats', async () => {
    const lookup = vi.fn(async () => { throw new Error('platform_permission_denied') })
    const f = await fixture(undefined, lookup), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'not-allowed' }))
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'group', mentioned: false }))
    expect(lookup).not.toHaveBeenCalled()
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    expect(lookup).not.toHaveBeenCalled()
    for (const eventId of ['group-first', 'group-second']) {
      await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'group', eventId }))
      await until(() => f.sent.length === (eventId === 'group-first' ? 2 : 3))
    }
    expect(lookup).toHaveBeenCalledExactlyOnceWith('group')
    expect((await channels(f.service)).find(room => room.kind === 'group')?.title).toBe('feishu · group')
    expect((await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status).toBe('connected')
  })
  it('discards the result of a group name query after its binding disconnects', async () => {
    let resolve!: (name: string) => void
    const f = await fixture(undefined, () => new Promise<string>(done => { resolve = done })), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'group' })); await until(() => f.sent.length === 1)
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    resolve('迟到的群名'); await f.service.close()
    const restarted = await f.create()
    expect((await channels(restarted))[0].title).toBe('feishu · group')
  })
  it.each([false, true])('separates linked owner platform history from BOAI, local-first=%s, and resumes only its own context', async localFirst => {
    const f = await fixture()
    const open = () => f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Promise<Conversation>
    const first = localFirst ? await open() : undefined
    const binding = await f.connect(await f.save('writer', 'feishu', 'owner-bot', { ownerUserId: 'owner', allowedUserIds: ['owner', 'colleague'] }))
    await f.incoming.get(binding.id)!(event({ text: '手机私聊消息' })); await until(() => f.sent.length === 1)
    const main = await open(), phone = f.engine.contexts[0].conversation
    if (first) expect(main.id).toBe(first.id)
    expect(phone.id).not.toBe(main.id)
    expect((await detail(f.service, phone.id)).messages[0]).toMatchObject({ channel: { owner: true }, senderType: 'user' })
    expect((await detail(f.service, main.id)).messages).toHaveLength(0)
    await f.service.handle('sendMessage', { conversationId: main.id, content: 'BOAI 本地继续', mentionIds: [], requestId: 'local-owner-message' })
    await until(async () => (await detail(f.service, main.id)).runs.every(run => run.status === 'completed'))
    expect(f.sent).toHaveLength(1)
    expect(f.engine.contexts.at(-1)?.messages.map(message => message.content)).not.toContain('手机私聊消息')
    await f.incoming.get(binding.id)!(event({ eventId: 'phone-next', text: '手机继续讨论' })); await until(() => f.sent.length === 2)
    expect(f.engine.contexts.at(-1)?.conversation.id).toBe(phone.id)
    expect(f.engine.contexts.at(-1)?.messages.map(message => message.content)).toContain('手机私聊消息')
    expect(f.engine.contexts.at(-1)?.messages.map(message => message.content)).not.toContain('BOAI 本地继续')
    await f.incoming.get(binding.id)!(event({ eventId: 'colleague', userId: 'colleague' })); await until(() => f.sent.length === 3)
    const other = (await channels(f.service)).find(room => room.channel?.userId === 'colleague')!
    expect(other.id).not.toBe(main.id); expect(other.id).not.toBe(phone.id)
    const before = await detail(f.service, phone.id)
    await f.service.close(); const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].status === 'connected')
    await f.incoming.get(binding.id)!(event({ text: '手机私聊消息' })); expect(f.sent).toHaveLength(3)
    expect((await detail(restarted, phone.id)).messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  })
  it('keeps group rooms independent while different reply chains share the same group', async () => {
    const f = await fixture(), binding = await f.connect(await f.save('writer', 'feishu', 'group-bot', { ownerUserId: 'owner', allowedChatIds: ['group', 'group-2'] }))
    for (const [index, chatId, threadId] of [[0, 'group', 'thread-a'], [1, 'group', 'thread-b'], [2, 'group-2', 'thread-a']] as const) {
      await f.incoming.get(binding.id)!(event({ kind: 'group', eventId: `group-${index}`, chatId, threadId, externalThreadId: `lark:${chatId}:${threadId}` }))
      await until(() => f.sent.length === index + 1)
    }
    const rooms = await channels(f.service)
    expect(rooms).toHaveLength(2)
    expect((await detail(f.service, rooms.find(room => room.channel?.chatId === 'group')!.id)).messages.filter(message => message.senderType === 'user')).toHaveLength(2)
    expect(f.sent.map(value => value.externalThreadId)).toEqual(['lark:group:thread-a', 'lark:group:thread-b', 'lark:group-2:thread-a'])
  })
  it('requires an explicit owner link even with a single authorized user', async () => {
    const f = await fixture()
    await expect(f.save('writer', 'feishu', 'invalid-owner', { ownerUserId: 'someone-else' })).rejects.toThrow('授权用户')
    const local = await f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Conversation
    const binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    expect((await channels(f.service))[0].id).not.toBe(local.id)
  })
  it('retains old merged history and receipt aliases, then routes new owner messages to a fresh independent room without replay', async () => {
    const f = await fixture(), local = await f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Conversation
    const input = { conversationId: local.id, content: '原本地消息', mentionIds: [], requestId: 'before-merge' }
    const accepted = await f.service.handle('sendMessage', input) as Message
    await until(async () => (await detail(f.service, local.id)).runs.every(run => run.status === 'completed'))
    let binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const old = (await channels(f.service))[0], history = await detail(f.service, old.id)
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    binding = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    await f.service.handle('saveChannelBinding', { id: binding.id, expectedRevision: binding.revision, agentId: binding.agentId, platform: binding.platform, appId: binding.appId, name: binding.name, allowedUserIds: binding.allowedUserIds, allowedChatIds: binding.allowedChatIds, ownerUserId: 'owner', requestId: 'owner-link' })
    expect((await detail(f.service, old.id)).messages.map(message => message.id)).toEqual(history.messages.map(message => message.id))
    await f.service.close()
    const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
    try { await store.transaction(tx => mergeRooms(tx, { ...local, mainPrivate: true, channel: old.channel }, [old])) } finally { await store.close() }
    const restarted = await f.create(), merged = await detail(restarted, local.id)
    expect(merged.messages.map(message => message.id)).toEqual(expect.arrayContaining([accepted.id, ...history.messages.map(message => message.id)]))
    expect((await detail(restarted, old.id)).conversation.id).toBe(local.id)
    expect((await restarted.handle('sendMessage', input) as Message).id).toBe(accepted.id)
    const saved = (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    await restarted.handle('connectChannelBinding', { id: saved.id, expectedRevision: saved.revision })
    await f.incoming.get(binding.id)!(event()); expect(f.sent).toHaveLength(1)
    await f.incoming.get(binding.id)!(event({ eventId: 'fresh-owner', text: '新的手机私聊' })); await until(() => f.sent.length === 2)
    const phone = (await channels(restarted))[0]
    expect(phone.id).not.toBe(local.id); expect(phone.id).not.toBe(old.id)
    expect((await detail(restarted, phone.id)).messages.filter(message => message.senderType === 'user').map(message => message.content)).toEqual(['新的手机私聊'])
    expect((await detail(restarted, local.id)).messages.map(message => message.id)).toEqual(merged.messages.map(message => message.id))
    await restarted.close(); const again = await f.create()
    expect((await detail(again, local.id)).messages.map(message => message.id)).toEqual(merged.messages.map(message => message.id))
    expect((await channels(again))[0].id).toBe(phone.id)
    expect(f.engine.contexts).toHaveLength(3); expect(f.sent).toHaveLength(2)
  })
  it('keeps room and route counts bounded under repeated platform events and local opens', async () => {
    const f = await fixture(), binding = await f.connect(await f.save('writer', 'feishu', 'stress-owner', { ownerUserId: 'owner' }))
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const started = performance.now()
    for (let index = 0; index < 100; index++) {
      await f.incoming.get(binding.id)!(event())
      await f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] })
    }
    const elapsedMs = performance.now() - started
    expect(elapsedMs).toBeLessThan(3000)
    const snapshot = (await f.service.handle('snapshot', undefined)) as Snapshot
    expect(snapshot.conversations).toHaveLength(2)
    expect(mainConversations(snapshot.conversations)).toHaveLength(1)
    const reader = await ProductStore.openReadOnly(join(snapshot.dataPath, 'boai.sqlite'))
    try { expect(await reader.load('channelTargets')).toHaveLength(1); expect(await reader.load('messageReceipts')).toHaveLength(1) } finally { await reader.close() }
    process.stdout.write(`ROOM_ROUTE_PRESSURE ${JSON.stringify({ duplicateEvents: 100, localOpens: 100, elapsedMs, budgetMs: 3000, rooms: 2, mainItems: 1, targets: 1, replies: f.sent.length })}\n`)
    expect(f.engine.contexts).toHaveLength(1); expect(f.sent).toHaveLength(1)
  })
  it('saves owner attribution while an unrelated local room runs without merging or disturbing its work', async () => {
    const f = await fixture(), local = await f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Conversation
    let binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    binding = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(f.engine, 'run').mockImplementationOnce(async context => { await held; await context.onDelta('本地执行已完成') })
    try {
      await f.service.handle('sendMessage', { conversationId: local.id, content: '正在执行', mentionIds: [], requestId: 'busy-room' })
      await until(async () => (await detail(f.service, local.id)).runs.some(run => run.status === 'running'))
      const saved = await f.service.handle('saveChannelBinding', { id: binding.id, expectedRevision: binding.revision, agentId: binding.agentId, platform: binding.platform, appId: binding.appId, name: binding.name, allowedUserIds: binding.allowedUserIds, allowedChatIds: binding.allowedChatIds, ownerUserId: 'owner', requestId: 'busy-owner-link' }) as ChannelBindingState
      expect(saved.ownerUserId).toBe('owner')
      expect((await detail(f.service, local.id)).runs.some(run => run.status === 'running')).toBe(true)
      expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(room => !room.mergedInto)).toHaveLength(2)
      expect(await f.service.handle('getChannelBindingReceipt', { agentId: 'writer', requestId: 'busy-owner-link' })).toMatchObject({ id: binding.id })
    } finally { release(); await until(async () => (await detail(f.service, local.id)).runs.every(run => !['running', 'queued', 'waiting_approval'].includes(run.status))) }
  })
  it('distinguishes platform delivery, authorization rejection and accepted messages without exposing message text', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    f.observed.get(binding.id)!()
    let state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastEventAt).toBeTruthy(); expect(state.lastInbound).toBeUndefined()
    await f.incoming.get(binding.id)!(event({ userId: 'unapproved', text: 'private text' }))
    state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastInbound).toMatchObject({ status: 'ignored', detail: expect.stringContaining('授权用户') })
    expect(JSON.stringify(state)).not.toContain('private text'); expect(await channels(f.service)).toHaveLength(0)
    await f.incoming.get(binding.id)!(event())
    await until(() => f.sent.length === 1)
    state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastInbound).toMatchObject({ status: 'accepted', conversationId: (await channels(f.service))[0].id })
    await f.incoming.get(binding.id)!(event())
    state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastInbound).toMatchObject({ status: 'ignored', detail: expect.stringContaining('重复') })
    expect(f.sent).toHaveLength(1)
  })
  it('reports group authorization and acceptance failures with safe fixed reasons', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ kind: 'group', chatId: 'other' }))
    let state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastInbound).toMatchObject({ status: 'ignored', detail: expect.stringContaining('授权群') })
    await expect(f.incoming.get(binding.id)!(event({ attachments: [{ name: 'notes.txt', read: async () => { throw new Error('Authorization fixture-secret private-file'); } }] }))).rejects.toThrow('private-file')
    state = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    expect(state.lastInbound).toMatchObject({ status: 'failed' })
    expect(JSON.stringify(state)).not.toMatch(/fixture-secret|private-file|Authorization/)
    expect(f.engine.contexts).toHaveLength(0)
  })
  it.each([
    ['ERR_INVALID_URL', '请求地址无效'],
    ['ENOTFOUND', '域名解析失败'],
    [99991663, '99991663'],
    ['unknown-sdk-code', '连接未建立'],
  ])('shows only the safe connection reason for %s, never SDK credentials', async (code, expected) => {
    const error = new Error('SDK context: app_secret=fixture-secret Authorization=fixture-token', { cause: Object.assign(new Error('private platform response'), { code }) })
    const f = await fixture(error), binding = await f.save()
    await expect(f.connect(binding)).rejects.toThrow(expected)
    const states = await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[]
    expect(states[0].status).toBe('failed'); expect(states[0].detail).toContain(expected)
    expect(JSON.stringify(states)).not.toMatch(/fixture-secret|fixture-token|private platform response|SDK context/)
    expect(f.engine.contexts).toHaveLength(0)
  })
  it('saves one bot per employee without leaking its credential, and checks an unknown save by original request', async () => {
    const f = await fixture(), binding = await f.save()
    expect(await f.save()).toEqual(binding)
    expect(JSON.stringify(binding)).not.toContain('fixture-secret')
    expect(JSON.stringify(await f.service.handle('snapshot', undefined))).not.toContain('fixture-secret')
    const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite'))
    expect(JSON.stringify(await store.load('channelBindings'))).not.toContain('fixture-secret'); await store.close()
    expect(await f.service.handle('getChannelBindingReceipt', { agentId: 'writer', requestId: 'feishu-feishu-writer' })).toEqual(binding)
    await expect(f.service.handle('saveChannelBinding', { agentId: 'researcher', platform: 'feishu', appId: binding.appId, name: 'Other', credential: 'secret', allowedUserIds: ['owner'], allowedChatIds: [], requestId: 'other' })).rejects.toThrow('已绑定')
  })
  it('uses the original employee execution once, preserves external identity and continues the same private conversation', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const conversation = (await channels(f.service))[0], first = await detail(f.service, conversation.id)
    expect(first.messages[0].senderId).not.toBe('user'); expect(first.messages[0].senderName).toBe('外部用户')
    expect(first.messages[0].channel?.eventId).toBe('event-1'); expect(first.messages.filter(message => message.senderType === 'agent')).toHaveLength(1)
    await f.incoming.get(binding.id)!(event({ eventId: 'event-2', externalThreadId: 'lark:private:event-2', text: '继续' })); await until(() => f.sent.length === 2)
    expect(await channels(f.service)).toHaveLength(1); expect(f.engine.contexts).toHaveLength(2)
    const ordinary = await f.service.handle('createConversation', { kind: 'direct', title: '本机聊天', agentIds: ['writer'] }) as { id: string }
    expect(ordinary.id).not.toBe(conversation.id)
  })
  it('rejects unauthorized users, bot echoes and unmentioned groups without creating conversation or execution', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    for (const input of [event({ userId: 'stranger' }), event({ isBot: true }), event({ kind: 'group', chatId: 'group', mentioned: false }), event({ kind: 'group', chatId: 'unapproved' })]) await f.incoming.get(binding.id)!(input)
    expect(await channels(f.service)).toHaveLength(0); expect(f.engine.contexts).toHaveLength(0); expect(f.sent).toHaveLength(0)
  })
  it('deduplicates concurrent events and does not replay after restart or repeat unknown platform sends', async () => {
    const f = await fixture(), binding = await f.connect(await f.save()); f.failSend.add(binding.id)
    await Promise.all([f.incoming.get(binding.id)!(event()), f.incoming.get(binding.id)!(event())]); await until(() => f.sent.length === 1)
    await until(async () => (await f.service.handle('listChannelDeliveries', { agentId: 'writer' }) as ChannelDelivery[])[0]?.status === 'unknown')
    await f.service.close(); const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]?.status === 'connected')
    await f.incoming.get(binding.id)!(event()); expect(f.sent).toHaveLength(1); expect(f.engine.contexts).toHaveLength(1)
    f.failSend.clear(); await f.incoming.get(binding.id)!(event({ eventId: 'event-new' })); await until(() => f.sent.length === 2)
    expect(await channels(restarted)).toHaveLength(1)
  })
  it('keeps different users and Feishu/Lark namespaces separate and disconnects only the selected binding', async () => {
    const f = await fixture(), feishu = await f.connect(await f.save()), lark = await legacySibling(f, feishu, 'lark', 'lark-writer')
    await f.incoming.get(feishu.id)!(event()); await f.incoming.get(lark.id)!(event()); await until(() => f.sent.length === 2)
    expect(await channels(f.service)).toHaveLength(2)
    await f.service.handle('disconnectChannelBinding', { id: feishu.id, expectedRevision: feishu.revision })
    await f.incoming.get(feishu.id)!(event({ eventId: 'stopped' })); await f.incoming.get(lark.id)!(event({ eventId: 'lark-new' })); await until(() => f.sent.length === 3)
    expect(f.sent.at(-1)?.bindingId).toBe(lark.id)
  })
  it('uses only the initiating bot for a group reply on grandfathered multiple bindings of the same employee', async () => {
    const f = await fixture(), first = await f.connect(await f.save()), second = await legacySibling(f, first, 'feishu', 'old-second-bot')
    await f.incoming.get(first.id)!(event({ kind: 'group', chatId: 'group', eventId: 'first', externalThreadId: 'lark:group:first' })); await until(() => f.sent.length === 1)
    await f.incoming.get(second.id)!(event({ kind: 'group', chatId: 'group', eventId: 'second', externalThreadId: 'lark:group:second' }))
    await until(() => f.sent.some(value => value.bindingId === second.id && value.externalThreadId === 'lark:group:second'))
    expect(f.sent.map(value => value.bindingId)).toEqual([first.id, second.id])
    expect(await channels(f.service)).toHaveLength(1)
  })
  it('prepares a real attachment before execution, and does not run only the text when another attachment fails', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event({ attachments: [{ name: 'notes.txt', read: async () => Buffer.from('渠道材料原文') }] })); await until(() => f.sent.length === 1)
    const conversation = (await channels(f.service))[0], result = await detail(f.service, conversation.id)
    expect(result.materials?.[0].status).toBe('ready'); expect(result.messages[0].materialIds).toHaveLength(1)
    const bad = vi.fn(async () => { throw new Error('download failed') })
    await expect(f.incoming.get(binding.id)!(event({ eventId: 'broken', attachments: [{ name: 'broken.txt', read: bad }] }))).rejects.toThrow('download failed')
    expect(f.engine.contexts).toHaveLength(1); expect((await detail(f.service, conversation.id)).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  })
  it('isolates the same group event for each employee and never mirrors local channel messages', async () => {
    const f = await fixture(), writer = await f.connect(await f.save()), researcher = await f.connect(await f.save('researcher'))
    const input = event({ kind: 'group', chatId: 'group', mentionedUserIds: ['bot-feishu-writer', 'bot-feishu-researcher'] })
    await Promise.all([f.incoming.get(writer.id)!(input), f.incoming.get(researcher.id)!(input)])
    await until(() => f.sent.length === 2)
    const rooms = await channels(f.service)
    expect(rooms).toHaveLength(2); expect(f.engine.contexts).toHaveLength(2)
    expect(new Set(f.sent.map(value => value.bindingId))).toEqual(new Set([writer.id, researcher.id]))
    for (const room of rooms) {
      expect(room.agentIds).toHaveLength(1)
      const result = await detail(f.service, room.id)
      expect(result.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
      expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.senderId)).toEqual(room.agentIds)
    }
    const writerRoom = rooms.find(room => room.agentIds[0] === 'writer')!
    const internal = writerRoom
    await f.service.handle('sendMessage', { conversationId: internal.id, content: 'BOAI群内本地讨论', mentionIds: [], requestId: 'local-channel' })
    await until(async () => (await detail(f.service, internal.id)).messages.some(message => message.senderType === 'agent' && message.sequence > 1 && message.status === 'completed'))
    expect(f.sent).toHaveLength(2)
    await f.incoming.get(researcher.id)!(event({ ...input, eventId: 'researcher-next' })); await until(() => f.sent.length === 3)
    expect(f.engine.contexts.at(-1)?.messages.some(message => message.content === 'BOAI群内本地讨论')).toBe(false)
    await Promise.all([f.incoming.get(writer.id)!(input), f.incoming.get(researcher.id)!(input)])
    expect(f.sent).toHaveLength(3)
  })
  it('keeps cleared event identities and preserves history when unbinding', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const conversation = (await channels(f.service))[0]
    await f.service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    await f.incoming.get(binding.id)!(event()); expect(f.engine.contexts).toHaveLength(1)
    await f.incoming.get(binding.id)!(event({ eventId: 'new-after-clear' })); await until(() => f.sent.length === 2)
    await f.service.handle('removeChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    expect(await f.service.handle('listChannelBindings', { agentId: 'writer' })).toEqual([])
    expect((await detail(f.service, conversation.id)).messages).toHaveLength(2)
  })
  it('does not activate bindings from a portable backup and reports unavailable credentials on restore', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    const destination = await mkdtemp(join(tmpdir(), 'boai-channel-backup-')); roots.push(destination)
    await f.service.backup(destination)
    const copy = await ProductStore.openReadOnly(join(destination, 'boai.sqlite'))
    expect(await copy.load('channelBindings')).toMatchObject([{ id: binding.id, enabled: false }]); await copy.close()
    expect((await readFile(join(destination, 'backup.json'), 'utf8'))).toContain('"credentialsIncluded": false')
    f.secrets.values.clear()
    expect((await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].hasCredential).toBe(false)
  })
  it('replies to the original platform message even when another message arrives during execution', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const run = f.engine.run.bind(f.engine)
    f.engine.run = async context => { if (!f.engine.contexts.length) { entered(); await gate }; await run(context) }
    f.engine.decide = async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) })
    await f.incoming.get(binding.id)!(event({ externalThreadId: 'lark:private:original' })); await started
    await f.incoming.get(binding.id)!(event({ eventId: 'next', externalThreadId: 'lark:private:next' }))
    release(); await until(() => f.sent.length === 2)
    expect(f.sent.map(value => value.externalThreadId)).toEqual(['lark:private:original', 'lark:private:next'])
  })
  it('does not send an old execution result to a user whose channel authorization was removed', async () => {
    const f = await fixture(), binding = await f.connect(await f.save())
    let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    const run = f.engine.run.bind(f.engine)
    let finished = false
    f.engine.run = async context => { entered(); await gate; try { await run(context) } finally { finished = true } }
    await f.incoming.get(binding.id)!(event()); await started
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    const stopped = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    const edited = await f.service.handle('saveChannelBinding', { id: stopped.id, agentId: 'writer', platform: 'feishu', appId: stopped.appId, name: stopped.name, expectedRevision: stopped.revision, allowedUserIds: ['other'], allowedChatIds: [], requestId: 'revoke-old-user' }) as ChannelBindingState
    await f.connect(edited); release()
    await until(() => finished)
    const view = await detail(f.service, (await channels(f.service))[0].id)
    expect(view.runs.some(run => run.phase === 'execution' && run.status === 'cancelled')).toBe(true)
    expect(view.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
    expect(f.sent).toHaveLength(0)
  })
})

for (const transport of ['rpc', 'standalone'] as const) it.skipIf(transport === 'standalone' && process.env.BOAI_CLI_CHANNEL_PROCESS_TEST !== '1')(`continues a channel privately and publishes only explicitly through CLI ${transport}, preserving unknown and restart receipts`, async () => {
  const f = await fixture(), binding = await f.connect(await f.save())
  const cleanup: (() => Promise<unknown> | void)[] = []
  const commands: { method: string; code: number; stdout?: string; stderr?: string }[] = []
  const connect = async (app: AppService) => {
    const server = await openDesktopCli(f.root, 'test', { request: async (method, input) => app.handle(method, input) as never }); cleanup.push(() => server.close())
    const metadata = await readLocalConnection(f.root), client = new CliRpcClient(metadata.url, metadata); cleanup.push(() => client.destroy()); await client.connect()
    return { server, client, invoke: async <T>(method: string, input: unknown): Promise<T> => {
      if (transport === 'rpc') return client.invoke(method, input) as Promise<T>
      try {
        const result = await promisify(execFile)(process.execPath, [resolve('dist/cli/index.mjs'), '--data-dir', f.root, 'invoke', method, JSON.stringify(input), '--json'], { cwd: f.root, env: { PATH: process.env.PATH, HOME: f.root, TMPDIR: f.root }, timeout: 15000, maxBuffer: 2 * 1024 * 1024 })
        commands.push({ method, code: 0, ...result }); expect(result.stderr).toBe(''); return JSON.parse(result.stdout) as T
      } catch (error) {
        const e = error as { code?: number; stdout?: string; stderr?: string }
        commands.push({ method, code: e.code ?? -1, stdout: e.stdout, stderr: e.stderr }); throw error
      }
    } }
  }
  try {
    const cli = await connect(f.service)
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const room = (await channels(f.service))[0]
    const local = await cli.invoke<Message>('sendMessage', { conversationId: room.id, content: '仅在BOAI内部讨论，不外发。', mentionIds: [], requestId: 'cli-channel-local' })
    await until(async () => (await detail(f.service, room.id)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length === 2)
    const before = await detail(f.service, room.id), answer = before.messages.at(-1)!, source = before.messages[0]
    expect(f.sent).toHaveLength(1); expect(local.channel).toBeUndefined()
    const calls = f.engine.contexts.length, contentHash = createHash('sha256').update(JSON.stringify([answer.id, answer.conversationId, answer.content, answer.status])).digest('hex')
    const selected = { conversationId: room.id, messageId: answer.id, contentHash, requestId: 'cli-publish-reply' }
    await expect(cli.invoke('publishChannelReply', { ...selected, contentHash: 'f'.repeat(64) })).rejects.toThrow()
    expect(f.sent).toHaveLength(1)
    const published = await cli.invoke<Message>('publishChannelReply', selected); expect(published.id).toBe(answer.id)
    await until(() => f.sent.length === 2)
    expect((await cli.invoke<ChannelDelivery[]>('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [answer.id] }))[0].status).toBe('sent')
    expect((await cli.invoke<Message>('publishChannelReply', selected)).id).toBe(answer.id)
    expect(f.sent).toHaveLength(2); expect(f.engine.contexts).toHaveLength(calls)
    const explicit = { conversationId: room.id, sourceMessageId: source.id, content: '明确发送这条说明。', artifacts: [], requestId: 'cli-publish-new' }
    const sent = await cli.invoke<Message>('publishChannelMessage', explicit)
    await until(() => f.sent.length === 3)
    expect(f.sent.at(-1)).toMatchObject({ text: explicit.content, externalThreadId: 'lark:private:event-1' })
    await expect(cli.invoke('publishChannelMessage', { ...explicit, content: '相同请求不同文字' })).rejects.toThrow()
    await expect(cli.invoke('publishChannelMessage', { ...explicit, requestId: 'bad-shape', hiddenPermission: 'full-access' })).rejects.toThrow()
    f.failSend.add(binding.id)
    const unknownInput = { ...explicit, content: '外部受理后回执失联。', requestId: 'cli-publish-unknown' }
    const unknown = await cli.invoke<Message>('publishChannelMessage', unknownInput)
    await until(async () => (await cli.invoke<ChannelDelivery[]>('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [unknown.id] }))[0]?.status === 'unknown')
    const beforeRestart = await detail(f.service, room.id)
    cli.client.destroy(); await cli.server.close(); await f.service.close()
    const restarted = await f.create(), next = await connect(restarted)
    expect((await next.invoke<Message>('publishChannelReply', selected)).id).toBe(answer.id)
    expect((await next.invoke<Message>('publishChannelMessage', explicit)).id).toBe(sent.id)
    expect((await next.invoke<Message>('publishChannelMessage', unknownInput)).id).toBe(unknown.id)
    expect(await next.invoke('getMessageReceipt', { requestId: unknownInput.requestId })).toMatchObject({ id: unknown.id })
    expect((await detail(restarted, room.id)).messages).toEqual(beforeRestart.messages)
    expect(f.sent).toHaveLength(4); expect(f.engine.contexts).toHaveLength(calls)
    await restarted.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    await expect(next.invoke('publishChannelMessage', { ...explicit, requestId: 'cli-revoked' })).rejects.toThrow()
    expect(f.sent).toHaveLength(4); expect(f.engine.contexts).toHaveLength(calls)
    if (process.env.BOAI_REVIEW_RUN_DIR) {
      const directory = join(process.env.BOAI_REVIEW_RUN_DIR, 'cli-channel-' + transport); await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'facts.json'), JSON.stringify({ transport, local, selected, sent, unknown, beforeRestart, afterRestart: await detail(restarted, room.id), deliveries: await next.invoke('listChannelMessageDeliveries', { conversationId: room.id, messageIds: [answer.id, sent.id, unknown.id] }), actualSends: f.sent, calls, commands, externalRequests: 0 }, null, 2))
      const db = new DatabaseSync(join(f.root, 'boai.sqlite'), { readOnly: true })
      try { db.exec(`VACUUM INTO '${join(directory, 'boai.sqlite').replaceAll("'", "''")}'`) } finally { db.close() }
    }
  } finally { for (const close of cleanup.reverse()) await close() }
})

it('channel reactions bind actual origin, share receipts and stay local on BOAI continuation', async () => {
  const f = await fixture(), results: unknown[] = []
  let complete = false
  f.engine.handler = async ctx => {
    const target = (await ctx.reactions!.list()).find(item => item.messageId === ctx.triggerMessageId)!
    expect(target.destination).toBe(ctx.messages.find(m => m.id === ctx.triggerMessageId)?.channel ? 'channel' : 'boai')
    const input = { messageId: target.messageId, emoji: '👍', active: true }
    results.push(await ctx.reactions!.set(input))
    results.push(await ctx.reactions!.set(input))
    // Replaying the earlier add after removal must not reapply its local projection.
    await ctx.reactions!.set({ ...input, active: false })
    if (target.destination === 'channel') await ctx.reactions!.set(input)
    await ctx.onDelta('收到。'); complete = true
  }
  const binding = await f.connect(await f.save())
  await f.incoming.get(binding.id)!(event())
  await until(() => complete && f.sent.length === 1)
  const room = (await channels(f.service))[0]
  await until(async () => (await detail(f.service, room.id)).runs.every(run => run.status === 'completed'))
  expect(f.reactionCalls).toHaveLength(2)
  expect(f.reactionCalls[0]).toMatchObject({ source: { eventId: 'event-1', bindingId: binding.id, replyThreadId: 'lark:private:event-1' }, emoji: '👍', active: true })
  const source = (await detail(f.service, room.id)).messages.find(message => message.channel)!
  expect(source.reactions).toEqual([])
  expect(results.slice(0, 2)).toEqual([expect.objectContaining({ status: 'sent', destination: 'channel' }), expect.objectContaining({ status: 'sent', destination: 'channel' })])
  complete = false
  await f.service.handle('sendMessage', { conversationId: room.id, requestId: 'local-react', content: '在BOAI继续聊', mentionIds: [] })
  await until(() => complete)
  await until(async () => (await detail(f.service, room.id)).runs.every(run => run.status === 'completed'))
  expect(f.reactionCalls).toHaveLength(2); expect(f.sent).toHaveLength(1)
  const db = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite'))
  try { expect((await db.load<ChannelDelivery>('channelDeliveries')).filter(item => item.reaction)).toHaveLength(2); expect(await db.load('workItems')).toHaveLength(0) } finally { await db.close() }
  await f.service.close(); f.service = await f.create()
  expect(f.reactionCalls).toHaveLength(2)
})
it('uncertain channel reactions retain one receipt and never project success or replay after restart', async () => {
  const f = await fixture(); f.failReaction()
  let complete = false, results: unknown[] = []
  f.engine.handler = async ctx => {
    const input = { messageId: ctx.triggerMessageId!, emoji: '👍', active: true }
    results = [await ctx.reactions!.set(input), await ctx.reactions!.set(input)]
    await ctx.onDelta('回应未确认。'); complete = true
  }
  const binding = await f.connect(await f.save())
  await f.incoming.get(binding.id)!(event())
  await until(() => complete && f.sent.length === 1)
  const room = (await channels(f.service))[0]
  expect(results).toEqual([expect.objectContaining({ status: 'unknown' }), expect.objectContaining({ status: 'unknown' })])
  expect(f.reactionCalls).toHaveLength(1)
  expect((await detail(f.service, room.id)).messages.find(message => message.channel)?.reactions).toBeUndefined()
  await f.service.close(); f.service = await f.create()
  expect(f.reactionCalls).toHaveLength(1)
})

it('Telegram employee reactions replace only their own mark and revoke access after the run', async () => {
  const f = await fixture(); let ctx: EngineContext | undefined, complete = false
  f.engine.handler = async context => {
    ctx = context
    const input = { messageId: context.triggerMessageId!, emoji: '👍', active: true }
    await f.service.handle('setMessageReaction', { conversationId: context.conversation.id, ...input })
    await context.reactions!.set(input)
    await context.reactions!.set({ ...input, emoji: '🎉' })
    await context.onDelta('收到。'); complete = true
  }
  const binding = await f.connect(await f.save('writer', 'telegram', '42', { credential: '42:fixture-token' }))
  await f.incoming.get(binding.id)!(event({ eventId: '100:1', tenantId: 'telegram', chatId: '100', externalThreadId: 'telegram:100' }))
  await until(() => complete && f.sent.length === 1)
  const room = (await channels(f.service))[0]
  await until(async () => (await detail(f.service, room.id)).runs.every(run => run.status === 'completed'))
  expect((await detail(f.service, room.id)).messages.find(message => message.id === ctx!.triggerMessageId)?.reactions).toEqual([{ emoji: '👍', senderId: 'user', senderName: '我' }, { emoji: '🎉', senderId: 'writer', senderName: ctx!.agent.name }])
  await expect(ctx!.reactions!.set({ messageId: ctx!.triggerMessageId!, emoji: '👍', active: true })).rejects.toThrow()
  expect(f.reactionCalls).toHaveLength(2)
})
