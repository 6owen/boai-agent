/*
 * [OUTPUT]: 2026-10-14 跨入口主私聊/其他用户隔离、两个群回复链、迁移回执/重启、忙时拒绝与100次去重压力回归。
 * [INPUT]: AppService原事务/执行路径、隔离SQLite、现成transport合同的受控夹具。
 * [OUTPUT]: 绑定/凭据隔离、平台事件/受理与拒绝的安全观察、真实来源、连续聊天/重启、重复事件、发送未知、附件失败与多机器人群回归。
 * [POS]: 第16组离线集成验证；不冒充真实平台或真实供应商通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { AgentEngine, EngineContext, SecretStore } from '../src/runtime/contracts'
import type { ChannelBindingState, ChannelDelivery, ChannelBindingInput } from '../src/shared/domain/channels'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot } from '../src/shared/domain'
import type { ChannelInbound, ChannelTransportFactory } from '../src/runtime/modules/channels/channel-service'

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
  async test() { return 'fixture' }
  async decide(context: EngineContext) {
    const trigger = context.messages.find(message => message.id === context.triggerMessageId)
    return { action: context.messages.some(message => message.senderId === context.agent.id && message.sequence > (trigger?.sequence ?? Infinity) && message.status === 'completed') ? 'pass' as const : 'reply' as const, responseKind: 'chat' as const, observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) }
  }
  async run(context: EngineContext) { this.contexts.push(context); await context.onDelta(`答复-${context.agent.id}`) }
}
async function fixture(connectFailure?: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'boai-channels-')); roots.push(root)
  const secrets = new Secrets(), engine = new Engine()
  const incoming = new Map<string, (event: ChannelInbound) => Promise<void>>()
  const observed = new Map<string, () => void>()
  const sent: { bindingId: string; text: string; files: string[]; externalThreadId: string }[] = []
  const failSend = new Set<string>()
  const factory: ChannelTransportFactory = async (binding, _credential, receive, _failed, received) => {
    let connected = false
    incoming.set(binding.id, receive)
    if (received) observed.set(binding.id, received)
    return { start: async () => { if (connectFailure !== undefined) throw connectFailure; connected = true; return { botUserId: `bot-${binding.appId}` } }, stop: async () => { connected = false }, connected: () => connected, send: async (target, text, files) => { sent.push({ bindingId: binding.id, text, files: files.map(file => file.name), externalThreadId: target.externalThreadId }); if (failSend.has(binding.id)) throw new Error('response lost'); return ['external-reply'] } }
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
  return { root, secrets, engine, incoming, observed, sent, failSend, service, create, save, connect }
}
const event = (overrides: Partial<ChannelInbound> = {}): ChannelInbound => ({ eventId: 'event-1', tenantId: 'tenant', chatId: 'private', externalThreadId: 'lark:private:event-1', kind: 'direct', userId: 'owner', userName: '外部用户', text: '你好', isBot: false, mentioned: true, mentionedUserIds: [], attachments: [], ...overrides })
async function until(predicate: () => Promise<boolean> | boolean) { for (let i = 0; i < 400; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw new Error('Channel fixture timeout') }
async function channels(service: AppService) { return ((await service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => value.channel) }
async function detail(service: AppService, id: string) { return service.handle('getConversation', { id }) as Promise<ConversationDetail> }

describe('employee channel business connection', () => {
  it.each([false, true])('unifies explicitly linked owner with local room, local-first=%s, and routes replies to the initiating bot', async localFirst => {
    const f = await fixture()
    const open = () => f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Promise<Conversation>
    const first = localFirst ? await open() : undefined
    const binding = await f.connect(await f.save('writer', 'feishu', 'owner-bot', { ownerUserId: 'owner', allowedUserIds: ['owner', 'colleague'] }))
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const main = await open()
    if (first) expect(main.id).toBe(first.id)
    expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(room => !room.mergedInto && room.kind === 'direct')).toHaveLength(1)
    let result = await detail(f.service, main.id)
    expect(result.messages[0]).toMatchObject({ channel: { owner: true }, senderType: 'user' })
    expect(result.messages[0].senderId).not.toBe('user')
    await f.service.handle('sendMessage', { conversationId: main.id, content: 'BOAI 本地继续', mentionIds: [], requestId: 'local-owner-message' })
    await until(() => f.engine.contexts.length === 2 && f.engine.contexts.at(-1)?.messages.some(message => message.content === 'BOAI 本地继续') === true)
    await until(async () => (await detail(f.service, main.id)).runs.every(run => run.status === 'completed'))
    expect(f.sent).toHaveLength(1)
    const second = await f.connect(await f.save('writer', 'lark', 'second-bot', { ownerUserId: 'owner' }))
    await f.incoming.get(second.id)!(event({ eventId: 'second-owner', externalThreadId: 'lark:another:second', chatId: 'another' }))
    await until(() => f.sent.length === 2)
    expect(f.sent[1]).toMatchObject({ bindingId: second.id, externalThreadId: 'lark:another:second' })
    result = await detail(f.service, main.id)
    expect(result.messages.filter(message => message.senderType === 'user')).toHaveLength(3)
    expect(f.engine.contexts.at(-1)?.conversation.id).toBe(main.id)
    expect(f.engine.contexts.at(-1)?.messages.map(message => message.content)).toContain('BOAI 本地继续')
    await f.incoming.get(binding.id)!(event({ eventId: 'colleague', userId: 'colleague', userName: '同事' })); await until(() => f.sent.length === 3)
    const other = (await channels(f.service)).find(room => room.channel?.userId === 'colleague')!
    expect(other.id).not.toBe(main.id)
    expect((await detail(f.service, other.id)).messages.some(message => message.content === 'BOAI 本地继续')).toBe(false)
    await f.service.close(); const restarted = await f.create()
    await until(async () => (await restarted.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[]).every(value => value.status === 'connected'))
    await f.incoming.get(binding.id)!(event()); expect(f.sent).toHaveLength(3)
    expect((await detail(restarted, main.id)).messages).toHaveLength(result.messages.length)
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
  it('merges old private history atomically without replay, preserves receipts and old read links', async () => {
    const f = await fixture()
    const local = await f.service.handle('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] }) as Conversation
    const input = { conversationId: local.id, content: '原本地消息', mentionIds: [], requestId: 'before-merge' }
    const accepted = await f.service.handle('sendMessage', input) as Message
    await until(async () => (await detail(f.service, local.id)).runs.every(run => run.status === 'completed'))
    let binding = await f.connect(await f.save())
    await f.incoming.get(binding.id)!(event()); await until(() => f.sent.length === 1)
    const old = (await channels(f.service))[0], history = await detail(f.service, old.id)
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    binding = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    const saved = await f.service.handle('saveChannelBinding', { id: binding.id, expectedRevision: binding.revision, agentId: binding.agentId, platform: binding.platform, appId: binding.appId, name: binding.name, allowedUserIds: binding.allowedUserIds, allowedChatIds: binding.allowedChatIds, ownerUserId: 'owner', requestId: 'owner-link' }) as ChannelBindingState
    const merged = await detail(f.service, local.id)
    expect(merged.messages.map(message => message.id)).toEqual(expect.arrayContaining([accepted.id, ...history.messages.map(message => message.id)]))
    expect(new Set(merged.messages.map(message => message.sequence)).size).toBe(merged.messages.length)
    expect(merged.messages.filter(message => history.messages.some(old => old.id === message.id)).every(message => message.originalConversationId === old.id)).toBe(true)
    expect(merged.runs.filter(run => run.phase === 'execution')).toHaveLength(2)
    expect((await detail(f.service, old.id)).conversation.id).toBe(local.id)
    expect((await f.service.handle('sendMessage', input) as Message).id).toBe(accepted.id)
    expect(f.engine.contexts).toHaveLength(2); expect(f.sent).toHaveLength(1)
    await f.connect(saved)
    await f.incoming.get(binding.id)!(event()); expect(f.sent).toHaveLength(1)
    const reading = await f.service.handle('getConversationReading', { conversationId: local.id }) as { completionCount: number; unreadCount: number }
    expect(reading.completionCount).toBe(2); expect(reading.unreadCount).toBe(2)
    await expect(f.service.handle('sendMessage', { ...input, conversationId: old.id, requestId: 'new-old-destination' })).rejects.toThrow('主私聊')
    await f.service.close(); const restarted = await f.create()
    expect((await detail(restarted, local.id)).messages.map(message => message.id)).toEqual(merged.messages.map(message => message.id))
    expect(f.engine.contexts).toHaveLength(2); expect(f.sent).toHaveLength(1)
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
    expect(snapshot.conversations).toHaveLength(1)
    const reader = await ProductStore.openReadOnly(join(snapshot.dataPath, 'boai.sqlite'))
    try { expect(await reader.load('channelTargets')).toHaveLength(1); expect(await reader.load('messageReceipts')).toHaveLength(1) } finally { await reader.close() }
    process.stdout.write(`ROOM_ROUTE_PRESSURE ${JSON.stringify({ duplicateEvents: 100, localOpens: 100, elapsedMs, budgetMs: 3000, rooms: 1, targets: 1, replies: f.sent.length })}\n`)
    expect(f.engine.contexts).toHaveLength(1); expect(f.sent).toHaveLength(1)
  })
  it('rejects owner history convergence while the local room is running, leaving binding and both rooms intact', async () => {
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
      await expect(f.service.handle('saveChannelBinding', { id: binding.id, expectedRevision: binding.revision, agentId: binding.agentId, platform: binding.platform, appId: binding.appId, name: binding.name, allowedUserIds: binding.allowedUserIds, allowedChatIds: binding.allowedChatIds, ownerUserId: 'owner', requestId: 'busy-owner-link' })).rejects.toThrow('相关聊天仍有执行')
      expect((await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0].ownerUserId).toBeUndefined()
      expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(room => !room.mergedInto)).toHaveLength(2)
      expect(await f.service.handle('getChannelBindingReceipt', { agentId: 'writer', requestId: 'busy-owner-link' })).toBeNull()
    } finally { release() }
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
    const f = await fixture(), feishu = await f.connect(await f.save()), lark = await f.connect(await f.save('writer', 'lark'))
    await f.incoming.get(feishu.id)!(event()); await f.incoming.get(lark.id)!(event()); await until(() => f.sent.length === 2)
    expect(await channels(f.service)).toHaveLength(2)
    await f.service.handle('disconnectChannelBinding', { id: feishu.id, expectedRevision: feishu.revision })
    await f.incoming.get(feishu.id)!(event({ eventId: 'stopped' })); await f.incoming.get(lark.id)!(event({ eventId: 'lark-new' })); await until(() => f.sent.length === 3)
    expect(f.sent.at(-1)?.bindingId).toBe(lark.id)
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
  it('aggregates a group event received by two robots, while each employee replies through its own bot', async () => {
    const f = await fixture(), writer = await f.connect(await f.save()), researcher = await f.connect(await f.save('researcher'))
    const input = event({ kind: 'group', chatId: 'group', mentionedUserIds: ['bot-feishu-writer', 'bot-feishu-researcher'] })
    await Promise.all([f.incoming.get(writer.id)!(input), f.incoming.get(researcher.id)!(input)])
    await until(() => f.sent.length === 2)
    expect(await channels(f.service)).toHaveLength(1); expect(f.engine.contexts).toHaveLength(2)
    expect(new Set(f.sent.map(value => value.bindingId))).toEqual(new Set([writer.id, researcher.id]))
    const result = await detail(f.service, (await channels(f.service))[0].id)
    expect(result.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
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
    f.engine.run = async context => { entered(); await gate; await run(context) }
    await f.incoming.get(binding.id)!(event()); await started
    await f.service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    const stopped = (await f.service.handle('listChannelBindings', { agentId: 'writer' }) as ChannelBindingState[])[0]
    const edited = await f.service.handle('saveChannelBinding', { id: stopped.id, agentId: 'writer', platform: 'feishu', appId: stopped.appId, name: stopped.name, expectedRevision: stopped.revision, allowedUserIds: ['other'], allowedChatIds: [], requestId: 'revoke-old-user' }) as ChannelBindingState
    await f.connect(edited); release()
    await until(async () => (await detail(f.service, (await channels(f.service))[0].id)).messages.some(message => message.senderType === 'agent' && message.status === 'completed'))
    expect(f.sent).toHaveLength(0)
  })
})
