/*
 * [INPUT]: AppService原事务/执行路径、隔离SQLite、现成transport合同的受控夹具。
 * [OUTPUT]: 绑定/凭据隔离、真实来源、连续聊天/重启、重复事件、发送未知、附件失败与多机器人群的业务回归。
 * [POS]: 第16组离线集成验证；不冒充真实平台或真实供应商通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { AgentEngine, EngineContext, SecretStore } from '../src/runtime/contracts'
import type { ChannelBindingState, ChannelDelivery, ChannelBindingInput } from '../src/shared/domain/channels'
import type { Connection, ConversationDetail, DigitalAgent, Message, Snapshot } from '../src/shared/domain'
import type { ChannelInbound, ChannelTransportFactory } from '../src/runtime/modules/channels/channel-service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'

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
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-channels-')); roots.push(root)
  const secrets = new Secrets(), engine = new Engine()
  const incoming = new Map<string, (event: ChannelInbound) => Promise<void>>()
  const sent: { bindingId: string; text: string; files: string[]; externalThreadId: string }[] = []
  const failSend = new Set<string>()
  const factory: ChannelTransportFactory = async (binding, _credential, receive) => {
    let connected = false
    incoming.set(binding.id, receive)
    return { start: async () => { connected = true; return { botUserId: `bot-${binding.appId}` } }, stop: async () => { connected = false }, connected: () => connected, send: async (target, text, files) => { sent.push({ bindingId: binding.id, text, files: files.map(file => file.name), externalThreadId: target.externalThreadId }); if (failSend.has(binding.id)) throw new Error('response lost'); return ['external-reply'] } }
  }
  const create = async () => { const service = new AppService({ dataPath: root, secrets, engine, channelTransport: factory, emit: () => {} }); services.push(service); await service.init(); return service }
  const service = await create()
  const connection = await service.handle('saveConnection', { name: 'Fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1', defaultModel: 'fixture' }) as Connection
  for (const agent of ((await service.handle('snapshot', undefined)) as Snapshot).agents.filter(agent => ['writer', 'researcher'].includes(agent.id))) {
    const { configVersion, workspaceRef: _, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, connectionId: connection.id, modelId: 'fixture' })
  }
  const save = (agentId = 'writer', platform: ChannelBindingInput['platform'] = 'feishu', appId = platform + '-' + agentId) => service.handle('saveChannelBinding', { agentId, platform, appId, name: `${platform}-${agentId}`, credential: 'fixture-secret', allowedUserIds: ['owner'], allowedChatIds: ['group'], requestId: `${platform}-${appId}` }) as Promise<ChannelBindingState>
  const connect = async (binding: ChannelBindingState) => { await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision }); return (await service.handle('listChannelBindings', { agentId: binding.agentId }) as ChannelBindingState[]).find(value => value.id === binding.id)! }
  return { root, secrets, engine, incoming, sent, failSend, service, create, save, connect }
}
const event = (overrides: Partial<ChannelInbound> = {}): ChannelInbound => ({ eventId: 'event-1', tenantId: 'tenant', chatId: 'private', externalThreadId: 'lark:private:event-1', kind: 'direct', userId: 'owner', userName: '外部用户', text: '你好', isBot: false, mentioned: true, mentionedUserIds: [], attachments: [], ...overrides })
async function until(predicate: () => Promise<boolean> | boolean) { for (let i = 0; i < 400; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw new Error('Channel fixture timeout') }
async function channels(service: AppService) { return ((await service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => value.channel) }
async function detail(service: AppService, id: string) { return service.handle('getConversation', { id }) as Promise<ConversationDetail> }

describe('employee channel business connection', () => {
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
