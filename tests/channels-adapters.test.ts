/*
 * [INPUT]: 实际Mastra Channels/厂商适配器和受控平台边界夹具。
 * [OUTPUT]: 自定义handler不执行默认模型、独立域/会话、飞书附件补接和原会话回发；不代替真实平台联调。
 * [POS]: 第16组SDK接线验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Message } from 'chat'
import { channelTransportFactory, normalizeChatInbound } from '../src/runtime/adapters/channels/mastra-channels'
import type { ChannelBinding } from '../src/shared/domain/channels'
import type { ChannelInbound, ChannelTransport } from '../src/runtime/modules/channels/channel-service'

const platform = vi.hoisted(() => ({ channels: [] as { appId: string; domain: string; handlers: Map<string, (value: unknown) => Promise<void>>; sends: unknown[]; disconnected: boolean; downloads: number }[] }))
vi.mock('@larksuite/channel', () => ({ createLarkChannel: (options: { appId: string; domain: string }) => {
  const state = { appId: options.appId, domain: options.domain, handlers: new Map<string, (value: unknown) => Promise<void>>(), sends: [] as unknown[], disconnected: false, downloads: 0 }
  platform.channels.push(state)
  return { botIdentity: { openId: `bot-${options.appId}`, name: 'Fixture' }, connect: async () => {}, disconnect: async () => { state.disconnected = true }, on: (name: string, handler: (value: unknown) => Promise<void>) => { state.handlers.set(name, handler); return () => state.handlers.delete(name) }, getChatInfo: async (id: string) => ({ chatId: id, chatType: 'p2p' }), send: async (chatId: string, input: unknown) => { state.sends.push({ chatId, input }); return { messageId: 'reply-id' } }, downloadResource: async () => { state.downloads++; return Buffer.from('material bytes') } }
} }))
const roots: string[] = [], transports: ChannelTransport[] = []
afterEach(async () => { await Promise.all(transports.splice(0).map(transport => transport.stop())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); platform.channels.length = 0; vi.unstubAllGlobals() })
const binding = (id: string, platform: ChannelBinding['platform']): ChannelBinding => ({ id, agentId: 'writer', platform, appId: id, name: id, enabled: true, revision: 1, allowedUserIds: ['owner'], allowedChatIds: [], hasCredential: true, installedAt: '', updatedAt: '' })
async function until(predicate: () => boolean) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw new Error('SDK handler fixture timeout') }

describe('real channel SDK wiring with simulated platform', () => {
  it('runs custom BOAI handler through real AgentChannels and preserves Feishu resources and Lark domain isolation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boai-channel-sdk-')); roots.push(root)
    const events: ChannelInbound[] = [], failures = vi.fn()
    const factory = channelTransportFactory(root, { get: async () => undefined, set: async () => {}, delete: async () => {} })
    for (const value of [binding('feishu-app', 'feishu'), binding('lark-app', 'lark')]) {
      const transport = await factory(value, 'secret', async event => { events.push(event) }, failures); transports.push(transport); await transport.start()
    }
    expect(platform.channels.map(channel => channel.domain)).toEqual(['feishu', 'lark'])
    for (const channel of platform.channels) await channel.handlers.get('message')!({ messageId: 'om-1', chatId: 'oc-same', chatType: 'p2p', chatMode: 'p2p', senderId: 'owner', senderName: '用户', senderType: 'user', content: '正文', resources: [{ type: 'file', fileKey: 'resource', fileName: 'notes.txt' }], mentions: [], mentionedBot: false, createTime: Date.now(), raw: { sender: { tenant_key: 'tenant' } } })
    await until(() => events.length === 2)
    expect(events[0].threadId).toBeUndefined(); expect(events[0].tenantId).toBe('tenant'); expect(events[0].attachments).toHaveLength(1)
    expect((await events[0].attachments[0].read()).toString()).toBe('material bytes')
    expect(platform.channels[0].downloads).toBe(1)
    expect(platform.channels.every(channel => channel.sends.length === 0)).toBe(true)
    await transports[0].send({ id: 'target', bindingId: 'feishu-app', conversationId: 'conversation', chatId: 'oc-same', externalThreadId: events[0].externalThreadId, userId: 'owner', kind: 'direct' }, '公开回复', [{ name: 'result.txt', bytes: Buffer.from('result') }])
    expect(platform.channels[0].sends).toHaveLength(2); expect(platform.channels[1].sends).toHaveLength(0); expect(failures).not.toHaveBeenCalled()
    await transports[0].stop(); expect(platform.channels[0].disconnected).toBe(true); expect(platform.channels[1].disconnected).toBe(false)
  })
  it('maps Telegram group mentions by real bot username and uses the platform topic ID', () => {
    const message = new Message({ id: 'telegram:-100:3', threadId: 'telegram:-100:9', text: '@writer_bot @research_bot 请分别回复', formatted: { type: 'root', children: [] }, raw: { chat: { id: -100, type: 'supergroup' }, message_thread_id: 9 }, author: { userId: 'owner', userName: 'owner', fullName: '用户', isBot: false, isMe: false }, metadata: { dateSent: new Date(), edited: false }, isMention: true, attachments: [] })
    const event = normalizeChatInbound(binding('telegram-bot', 'telegram'), { id: message.threadId, isDM: false }, message)
    expect(event.chatId).toBe('-100'); expect(event.threadId).toBe('9'); expect(event.mentionedUserIds).toEqual(['writer_bot', 'research_bot'])
  })
  it('connects the installed TelegramProvider in polling mode and routes a real SDK event only into the custom handler', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boai-telegram-sdk-')); roots.push(root)
    const events: ChannelInbound[] = [], methods: string[] = []
    let delivered = false
    vi.stubGlobal('fetch', async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = url.split('/').at(-1)!; methods.push(method)
      let result: unknown
      if (method === 'getMe') result = { id: 42, is_bot: true, first_name: 'Fixture', username: 'fixture_bot' }
      else if (method === 'deleteWebhook' || method === 'setMyCommands') result = true
      else if (method === 'getUpdates') {
        await new Promise(resolve => setTimeout(resolve, 20))
        result = delivered ? [] : [{ update_id: 1, message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 100, type: 'private' }, from: { id: 100, is_bot: false, first_name: 'User' }, text: 'Hello' } }]; delivered = true
      } else if (method === 'sendMessage' || method === 'sendRichMessage') result = { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: 100, type: 'private' }, text: 'Reply' }
      else throw new Error(`Unexpected simulated Bot API method: ${method}`)
      return Response.json({ ok: true, result })
    })
    const values = new Map<string, string>(), failures = vi.fn()
    const factory = channelTransportFactory(root, { get: async id => values.get(id), set: async (id, value) => { values.set(id, value) }, delete: async id => { values.delete(id) } })
    const transport = await factory(binding('telegram-42', 'telegram'), '42:fixture-token', async event => { events.push(event) }, failures); transports.push(transport)
    expect(await transport.start()).toEqual({ botUserId: '42', botUserName: 'fixture_bot' })
    await until(() => events.length === 1)
    expect(events[0]).toMatchObject({ kind: 'direct', chatId: '100', userId: '100', text: 'Hello' })
    expect(methods).not.toContain('setWebhook')
    expect(failures).not.toHaveBeenCalled()
    await transport.send({ id: 'target', bindingId: 'telegram-42', conversationId: 'conversation', chatId: '100', externalThreadId: events[0].externalThreadId, userId: '100', kind: 'direct' }, 'Reply', [])
    expect(methods.filter(method => method === 'sendMessage' || method === 'sendRichMessage')).toHaveLength(1)
  })
})
