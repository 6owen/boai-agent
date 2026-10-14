/*
 * [INPUT]: 生产渠道工厂、实际飞书事件Dispatcher/Channel/Chat/Mastra和隔离模型HTTP协议服务。
 * [OUTPUT]: 原始私聊/群提及事件形成用户消息，调用员工绑定模型并回发；隔离平台网络，不代替真实平台验收。
 * [OUTPUT]: 真实厂商getChatInfo协议的群名进入会话标题，不改变原房间身份。
 * [POS]: 第16组端到端协议回归，补原转换后消息夹具缺口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import type { ChannelBindingState, ChannelDelivery } from '../src/shared/domain/channels'
import type { Connection, ConversationDetail, DigitalAgent, Snapshot } from '../src/shared/domain'

const platform = vi.hoisted(() => ({ channels: [] as unknown[], sends: [] as { url: string; data: unknown }[] }))
vi.mock('@larksuite/channel', async importOriginal => {
  const actual = await importOriginal<typeof import('@larksuite/channel')>()
  return { ...actual, createLarkChannel: (options: Parameters<typeof actual.createLarkChannel>[0]) => {
    const request = async (config: { url: string; data?: unknown }) => {
      if (config.url.includes('/auth/')) return { code: 0, tenant_access_token: 'fixture-token', expire: 7200 }
      if (config.url.includes('/bot/v3/info')) return { code: 0, bot: { open_id: 'ou_fixture_bot', app_name: 'Fixture bot' } }
      if (config.url.includes('/im/v1/chats/')) return { code: 0, data: { chat_id: config.url.split('/').at(-1), chat_mode: config.url.endsWith('oc_direct') ? 'p2p' : 'group', name: '飞书协议测试群' } }
      if (config.url.includes('/im/v1/messages')) {
        platform.sends.push({ url: config.url, data: config.data })
        return { code: 0, data: { message_id: `om_reply_${platform.sends.length}` } }
      }
      throw new Error(`Unexpected fixture endpoint: ${new URL(config.url).pathname}`)
    }
    const method = (input: string | { url: string; data?: unknown }, data?: unknown) => request(typeof input === 'string' ? { url: input, data } : input)
    const channel = actual.createLarkChannel({ ...options, transport: 'webhook', keepalive: { enabled: false }, httpInstance: { request, get: method, post: method, put: method, patch: method, delete: method } as NonNullable<typeof options.httpInstance> })
    platform.channels.push(channel)
    return channel
  } }
})

const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of disposals.splice(0).reverse()) await close(); platform.channels.length = 0; platform.sends.length = 0 })
const reply = '你好，我已收到飞书消息。'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-feishu-inbound-')); disposals.push(() => rm(root, { recursive: true, force: true }))
  const requests: { model: string; messages: { role: string; content: unknown }[]; stream?: boolean; response_format?: unknown }[] = []
  const server = createServer(async (request, response) => {
    let text = ''; for await (const part of request) text += part
    const body = JSON.parse(text) as (typeof requests)[number]; requests.push(body)
    const instructions = JSON.stringify(body.messages.filter(message => message.role === 'system'))
    const content = instructions.includes('Action and responseKind are separate choices') ? JSON.stringify({ action: 'reply', responseKind: 'chat' }) : instructions.includes('Return only new, useful facts') ? '{"candidates":[]}' : reply
    if (!body.stream) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ id: 'fixture-response', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })); return }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [delta, finish_reason] of [[{ role: 'assistant', content }, null], [{}, 'stop']] as const) response.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk', model: body.model, choices: [], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  disposals.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture model server did not start')
  const secrets = new Map<string, string>()
  const service = new AppService({ dataPath: root, engine: new MastraEngine(), secrets: { get: async id => secrets.get(id), set: async (id, value) => { secrets.set(id, value) }, delete: async id => { secrets.delete(id) } }, emit: () => {} })
  disposals.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'DeepSeek fixture', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${address.port}/v1`, defaultModel: 'deepseek-chat', apiKey: 'fixture-deepseek-key' }) as Connection
  const agent = await service.handle('saveAgent', { name: '飞书机器人', role: '', instructions: '回答用户的聊天消息。', color: '#aabbcc', connectionId: connection.id, modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
  const binding = await service.handle('saveChannelBinding', { agentId: agent.id, platform: 'feishu', appId: `fixture-${agent.id}`, name: '飞书机器人', credential: 'fixture-secret', allowedUserIds: ['ou_fixture_owner'], allowedChatIds: ['oc_group'], requestId: 'fixture-bind' }) as ChannelBindingState
  await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
  return { service, requests, agent, binding }
}
async function dispatch(kind: 'p2p' | 'group', messageId: string, text = '你好') {
  const dispatcher = Reflect.get(platform.channels[0] as object, 'dispatcher') as { invoke(data: unknown, options: { needCheck: boolean }): Promise<unknown> }
  await dispatcher.invoke({ schema: '2.0', header: { event_id: `evt_${messageId}`, event_type: 'im.message.receive_v1', tenant_key: 'fixture-tenant' }, event: { sender: { sender_id: { open_id: 'ou_fixture_owner' }, sender_type: 'user', tenant_key: 'fixture-tenant' }, message: { message_id: messageId, chat_id: kind === 'p2p' ? 'oc_direct' : 'oc_group', chat_type: kind, message_type: 'text', create_time: String(Date.now()), content: JSON.stringify({ text: kind === 'p2p' ? text : `@_user_1 ${text}` }), ...(kind === 'group' ? { mentions: [{ key: '@_user_1', id: { open_id: 'ou_fixture_bot' }, name: 'Fixture bot', tenant_key: 'fixture-tenant' }] } : {}) } } }, { needCheck: false })
}

describe('raw Feishu event to employee API and platform reply', () => {
  it('observes a platform event even when SDK normalization fails before BOAI receives a message', async () => {
    const f = await fixture()
    const dispatcher = Reflect.get(platform.channels[0] as object, 'dispatcher') as { invoke(data: unknown, options: { needCheck: boolean }): Promise<unknown> }
    await dispatcher.invoke({ schema: '2.0', header: { event_id: 'evt_malformed', event_type: 'im.message.receive_v1' }, event: { message: { chat_id: 'oc_direct', message_id: 'om_malformed', chat_type: 'p2p', message_type: 'text', content: '{"text":"你好"}' } } }, { needCheck: false })
    const state = (await f.service.handle('listChannelBindings', { agentId: f.agent.id }) as ChannelBindingState[])[0]
    expect(state.lastEventAt).toBeTruthy(); expect(state.lastInbound).toBeUndefined(); expect(state.status).toBe('failed')
    expect(f.requests).toHaveLength(0)
    expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => value.channel)).toHaveLength(0)
  })
  it.each(['p2p', 'group'] as const)('receives %s as a user message, calls the employee model and replies once', async kind => {
    const f = await fixture()
    await dispatch(kind, `om_${kind}_first`)
    try {
      await expect.poll(async () => ((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => value.channel).length, { timeout: 2500 }).toBe(1)
    } catch {
      throw new Error(JSON.stringify({ stage: 'receive', binding: await f.service.handle('listChannelBindings', { agentId: f.agent.id }), requests: f.requests.length }))
    }
    const conversation = ((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.find(value => value.channel)!
    if (kind === 'group') await expect.poll(async () => ((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.find(value => value.id === conversation.id)?.title).toBe('飞书协议测试群 · 飞书')
    const detail = () => f.service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
    try {
      await expect.poll(async () => (await detail()).messages.filter(value => value.senderType === 'agent' && value.status === 'completed').length, { timeout: 5000 }).toBe(1)
    } catch {
      const state = await detail()
      throw new Error(JSON.stringify({ stage: 'model', messages: state.messages.map(value => ({ type: value.senderType, status: value.status, content: value.content })), runs: state.runs.map(value => ({ phase: value.phase, status: value.status, error: value.error })), requests: f.requests.map(value => ({ stream: value.stream, format: value.response_format, roles: value.messages.map(message => message.role) })) }))
    }
    await expect.poll(() => platform.sends.length, { timeout: 2500 }).toBe(1)
    const result = await detail()
    expect(result.messages[0]).toMatchObject({ senderType: 'user', content: '你好', channel: { platform: 'feishu', userId: 'ou_fixture_owner' } })
    expect(result.messages.find(value => value.senderType === 'agent')).toMatchObject({ senderId: f.agent.id, content: reply })
    expect(f.requests.some(body => body.model === 'deepseek-chat' && body.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('你好')))).toBe(true)
    expect(JSON.stringify(platform.sends[0].data)).toContain(reply)
    expect((await f.service.handle('listChannelDeliveries', { agentId: f.agent.id }) as ChannelDelivery[])[0].status).toBe('sent')
    await dispatch(kind, `om_${kind}_first`)
    expect(platform.sends).toHaveLength(1)
    await dispatch(kind, `om_${kind}_second`, '继续聊')
    await expect.poll(() => platform.sends.length, { timeout: 5000 }).toBe(2)
    expect(((await f.service.handle('snapshot', undefined)) as Snapshot).conversations.filter(value => value.channel)).toHaveLength(1)
  })
})
