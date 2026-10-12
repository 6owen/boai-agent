/*
 * [INPUT]: 第13组现有Codex/Claude stdio夹具、生产AppService与受控渠道传输。
 * [OUTPUT]: 外部渠道沿真实原生驱动连续会话，API模型零调用、重启零重放及新消息接续；不代替真实供应商。
 * [POS]: 第16组CH11本机协议集成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nativeFixture } from './fixtures/native-product'
import { AppService } from '../src/runtime/service'
import type { ChannelInbound, ChannelTransportFactory } from '../src/runtime/modules/channels/channel-service'
import type { ChannelBindingState } from '../src/shared/domain/channels'
import type { Snapshot, ConversationDetail } from '../src/shared/domain'

const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of disposals.splice(0).reverse()) await close() })
describe.each(['codex', 'claude'] as const)('%s employee contacted through channel', runtime => {
  it('keeps the same native session and does not execute a Mastra model or replay on restart', async () => {
    const native = await nativeFixture(runtime, disposals)
    await native.service.close()
    const secrets = new Map<string, string>(), sent: string[] = [], files: { name: string; content: string }[][] = []
    let receive!: (event: ChannelInbound) => Promise<void>
    const factory: ChannelTransportFactory = async (_binding, _credential, handler) => {
      receive = handler; let connected = false
      return { start: async () => { connected = true; return { botUserId: 'fixture-bot' } }, stop: async () => { connected = false }, connected: () => connected, send: async (_target, text, results) => { sent.push(text); files.push(results.map(file => ({ name: file.name, content: file.bytes.toString('utf8') }))); return ['fixture-reply'] } }
    }
    const options = { dataPath: native.root, engine: { run: async () => { throw new Error('Channel must not invoke API model for native employee') }, test: async () => { throw new Error('API model must not run') } }, secrets: { get: async (id: string) => secrets.get(id), set: async (id: string, value: string) => { secrets.set(id, value) }, delete: async (id: string) => { secrets.delete(id) } }, channelTransport: factory, emit: () => {} }
    let service = new AppService(options); await service.init(); disposals.push(() => service.close())
    const binding = await service.handle('saveChannelBinding', { agentId: native.agent.id, platform: 'feishu', appId: 'fixture-app', name: '原生渠道', credential: 'fixture-secret', allowedUserIds: ['owner'], allowedChatIds: [], requestId: 'fixture-bind' }) as ChannelBindingState
    await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    const input = (eventId: string, text: string): ChannelInbound => ({ eventId, text, tenantId: 'tenant', chatId: 'direct', externalThreadId: `lark:direct:${eventId}`, kind: 'direct', userId: 'owner', userName: '外部用户', isBot: false, mentioned: false, mentionedUserIds: [], attachments: [] })
    const detail = async () => {
      const conversation = ((await service.handle('snapshot', undefined)) as Snapshot).conversations.find(conversation => conversation.channel)!
      return service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
    }
    await receive(input('first', '你好')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(1)
    await receive(input('second', '继续讨论')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(2)
    let result = await detail()
    expect(result.runs.every(run => run.phase === 'execution' && run.status === 'completed')).toBe(true)
    expect(new Set(result.runs.map(run => run.backend?.sessionId)).size).toBe(1)
    expect(result.messages.filter(message => message.channel).every(message => message.senderId !== 'user')).toBe(true)
    const sessionId = result.runs[0].backend?.sessionId; expect(sessionId).toBeTruthy()
    await service.close(); service = new AppService(options); await service.init()
    await expect.poll(async () => (await service.handle('listChannelBindings', { agentId: native.agent.id }) as ChannelBindingState[])[0]?.status).toBe('connected')
    await receive(input('first', '你好')); expect(sent).toHaveLength(2)
    await receive(input('third', '继续讨论')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(3)
    result = await detail()
    expect(result.runs).toHaveLength(3); expect(result.runs[2].backend?.sessionId).toBe(sessionId)
    await receive(input('publish', 'NATIVE_PUBLISH')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(4)
    result = await detail(); expect(result.artifacts).toHaveLength(1); expect(files[3]).toHaveLength(1)
    expect(files[3][0].content).toBe('# 原生文件\n实际内容\n')
    await receive(input('revise', 'NATIVE_REVISE 修改刚才文件')); await expect.poll(async () => { result = await detail(); return result.runs.at(-1)?.status }, { timeout: 15000 }).toBe('completed')
    await expect.poll(() => sent.length, { timeout: 15000 }).toBe(5)
    result = await detail(); expect(result.artifacts, JSON.stringify({ messages: result.messages.map(message => message.content), runs: result.runs.map(run => ({ status: run.status, error: run.error })), work: result.workItems?.map(work => ({ status: work.status })) })).toHaveLength(2); expect(files[4]).toHaveLength(1)
    expect(result.artifacts[1].contentVersion).toBe(2)
  }, 30000)
})
