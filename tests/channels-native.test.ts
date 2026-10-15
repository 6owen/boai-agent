/*
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 2026-10-14现行分离合同：Codex/Claude分别续用BOAI和渠道session；旧归一原件/本地修订/备份预览/hash清理保留，零API模型调用。
 * [OUTPUT]: 2026-10-14 迁移前交付、明确新消息修订、原生session重建、备份恢复预览及原件hash清理回归。
 * [OUTPUT]: 2026-10-14 Codex/Claude本人渠道与BOAI共用原生session、成果修订、重启零重放协议回归。
 * [INPUT]: 第13组现有Codex/Claude stdio夹具、生产AppService与受控渠道传输。
 * [OUTPUT]: 外部渠道沿真实原生驱动连续会话，API模型零调用、重启零重放及新消息接续；不代替真实供应商。
 * [POS]: 第16组CH11本机协议集成。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeFixture } from './fixtures/native-product'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { mergeRooms } from '../src/runtime/modules/conversations/room-migration'
import { isChannelConversation } from '../src/shared/domain/conversation-list'
import { AppService } from '../src/runtime/service'
import type { ChannelInbound, ChannelTransportFactory } from '../src/runtime/modules/channels/channel-service'
import type { ChannelBindingState } from '../src/shared/domain/channels'
import type { Snapshot, ConversationDetail, Message } from '../src/shared/domain'

const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of disposals.splice(0).reverse()) await close() })
describe.each(['codex', 'claude'] as const)('%s employee contacted through channel', runtime => {
  it('revises a channel artifact through the native protocol in an internal session and only sends its new version explicitly', async () => {
    const native = await nativeFixture(runtime, disposals); await native.service.close()
    const secrets = new Map<string, string>(), sent: { text: string; files: string[] }[] = []
    let receive!: (event: ChannelInbound) => Promise<void>
    const factory: ChannelTransportFactory = async (_binding, _credential, handler) => {
      receive = handler; let connected = false
      return { start: async () => { connected = true; return {} }, stop: async () => { connected = false }, connected: () => connected, send: async (_target, text, files) => { sent.push({ text, files: files.map(file => file.name) }); return ['native-file-reply'] } }
    }
    const service = new AppService({ dataPath: native.root, engine: { run: async () => { throw new Error('no API execution') }, test: async () => '' }, secrets: { get: async (id: string) => secrets.get(id), set: async (id: string, value: string) => { secrets.set(id, value) }, delete: async (id: string) => { secrets.delete(id) } }, channelTransport: factory, emit: () => {} })
    disposals.push(() => service.close()); await service.init()
    const binding = await service.handle('saveChannelBinding', { agentId: native.agent.id, platform: 'feishu', appId: 'private-file-app', name: '独立文件修改', credential: 'fixture', allowedUserIds: ['owner'], allowedChatIds: [], requestId: 'private-file-bind' }) as ChannelBindingState
    await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    await receive({ eventId: 'first-file', text: 'NATIVE_PUBLISH', tenantId: 'tenant', chatId: 'direct', externalThreadId: 'lark:direct:first-file', kind: 'direct', userId: 'owner', userName: '外部本人', isBot: false, mentioned: false, mentionedUserIds: [], attachments: [] })
    await expect.poll(() => sent.length, { timeout: 15000 }).toBe(1)
    const parent = ((await service.handle('snapshot', undefined)) as Snapshot).conversations.find(isChannelConversation)!
    const before = await service.handle('getConversation', { id: parent.id }) as ConversationDetail, original = before.artifacts[0]
    const internal = await service.handle('ensureChannelDiscussion', { conversationId: parent.id }) as typeof parent
    const request = await service.handle('reviseArtifact', { conversationId: internal.id, artifactId: original.id, contentHash: original.contentHash, targetAgentId: native.agent.id, content: 'NATIVE_REVISE 修改刚才文件', requestId: 'native-private-file-revision' }) as Message
    await expect.poll(async () => { const detail = await service.handle('getConversation', { id: internal.id }) as ConversationDetail; return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) }, { timeout: 15000 }).toBe(true)
    const after = await service.handle('getConversation', { id: internal.id }) as ConversationDetail, version = after.artifacts[0]
    expect(after.artifacts, JSON.stringify({ messages: after.messages.map(message => message.content), runs: after.runs.map(run => ({ status: run.status, error: run.error, tools: run.toolEvents })) })).toHaveLength(1)
    expect(version).toMatchObject({ logicalArtifactId: original.logicalArtifactId, previousArtifactId: original.id, contentVersion: 2, revisionRequestId: request.artifactRevisionRequestId, conversationId: internal.id })
    expect(after.runs.find(run => run.phase === 'execution')?.backend?.sessionId).not.toBe(before.runs.find(run => run.phase === 'execution')?.backend?.sessionId)
    expect(sent).toHaveLength(1)
    await service.handle('publishChannelMessage', { conversationId: parent.id, sourceMessageId: before.messages.find(message => message.channel)!.id, content: '明确发送内部新版', artifacts: [{ id: version.id, conversationId: internal.id, contentHash: version.contentHash }], requestId: 'native-publish-private-file' })
    await expect.poll(() => sent.length, { timeout: 15000 }).toBe(2)
    expect(sent[1].files).toEqual([version.name])
    expect((await service.handle('getConversation', { id: parent.id }) as ConversationDetail).artifacts.map(artifact => artifact.id)).toEqual([original.id])
  })

  it('retains files from already merged history while new channel input and BOAI revisions use independent native rooms', async () => {
    const native = await nativeFixture(runtime, disposals)
    await native.service.close()
    const secrets = new Map<string, string>(), sent: string[] = []
    let receive!: (event: ChannelInbound) => Promise<void>
    const factory: ChannelTransportFactory = async (_binding, _credential, handler) => {
      receive = handler; let connected = false
      return { start: async () => { connected = true; return {} }, stop: async () => { connected = false }, connected: () => connected, send: async (_target, text) => { sent.push(text); return ['file-reply'] } }
    }
    const options = { dataPath: native.root, engine: { run: async () => { throw new Error('no API execution') }, test: async () => '' }, secrets: { get: async (id: string) => secrets.get(id), set: async (id: string, value: string) => { secrets.set(id, value) }, delete: async (id: string) => { secrets.delete(id) } }, channelTransport: factory, emit: () => {} }
    let service = new AppService(options)
    disposals.push(() => service.close()); await service.init()
    let binding = await service.handle('saveChannelBinding', { agentId: native.agent.id, platform: 'feishu', appId: 'migration-app', name: '文件迁移', credential: 'fixture', allowedUserIds: ['owner'], allowedChatIds: [], requestId: 'file-bind' }) as ChannelBindingState
    await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    const input = (eventId: string, text: string): ChannelInbound => ({ eventId, text, tenantId: 'tenant', chatId: 'direct', externalThreadId: `lark:direct:${eventId}`, kind: 'direct', userId: 'owner', userName: '外部本人', isBot: false, mentioned: false, mentionedUserIds: [], attachments: [] })
    await receive(input('publish', 'NATIVE_PUBLISH')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(1)
    const old = ((await service.handle('snapshot', undefined)) as Snapshot).conversations.find(room => room.channel)!
    const before = await service.handle('getConversation', { id: old.id }) as ConversationDetail
    expect(before.artifacts).toHaveLength(1)
    binding = (await service.handle('listChannelBindings', { agentId: native.agent.id }) as ChannelBindingState[])[0]
    await service.handle('disconnectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    binding = (await service.handle('listChannelBindings', { agentId: native.agent.id }) as ChannelBindingState[])[0]
    binding = await service.handle('saveChannelBinding', { id: binding.id, expectedRevision: binding.revision, agentId: binding.agentId, platform: binding.platform, appId: binding.appId, name: binding.name, allowedUserIds: binding.allowedUserIds, allowedChatIds: binding.allowedChatIds, ownerUserId: 'owner', requestId: 'file-owner-link' }) as ChannelBindingState
    await service.close()
    const store = new ProductStore(join(native.root, 'boai.sqlite')); await store.init()
    try { await store.transaction(tx => mergeRooms(tx, { ...native.chat, mainPrivate: true, channel: old.channel }, [old])) } finally { await store.close() }
    service = new AppService(options); await service.init()
    const read = () => service.handle('getConversation', { id: native.chat.id }) as Promise<ConversationDetail>
    const merged = await read()
    expect(merged.artifacts).toHaveLength(1)
    expect(merged.artifacts[0]).toMatchObject({ id: before.artifacts[0].id, path: before.artifacts[0].path, contentHash: before.artifacts[0].contentHash })
    expect(merged.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
    expect(merged.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id)); expect(sent).toHaveLength(1)
    await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    await receive(input('new-phone', '你好')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(2)
    const phone = ((await service.handle('snapshot', undefined)) as Snapshot).conversations.find(room => isChannelConversation(room) && !room.mergedInto)!
    expect(phone.id).not.toBe(native.chat.id)
    expect((await service.handle('getConversation', { id: phone.id }) as ConversationDetail).artifacts).toHaveLength(0)
    await service.handle('sendMessage', { conversationId: native.chat.id, content: 'NATIVE_REVISE 修改刚才文件', mentionIds: [], requestId: 'local-revision' })
    await expect.poll(async () => ['completed', 'failed'].includes((await read()).runs.at(-1)?.status ?? ''), { timeout: 15000 }).toBe(true)
    const execution = await read()
    expect(execution.runs.at(-1)?.status, JSON.stringify({ messages: execution.messages.map(message => message.content), runs: execution.runs.map(run => ({ status: run.status, error: run.error })), artifacts: execution.artifacts })).toBe('completed')
    await expect.poll(() => sent.length, { timeout: 15000 }).toBe(2)
    const revised = await read()
    expect(revised.artifacts).toHaveLength(2); expect(revised.artifacts[1].contentVersion).toBe(2)
    expect(revised.runs.at(-1)?.backend?.sessionId).not.toBe(before.runs[0].backend?.sessionId)
    const destination = await mkdtemp(join(tmpdir(), 'boai-room-file-restore-'))
    disposals.push(() => rm(destination, { recursive: true, force: true }))
    await service.backup(destination)
    const restored = new AppService({ dataPath: destination, engine: { run: async () => { throw new Error('restore must not execute') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    disposals.push(() => restored.close()); await restored.init()
    for (const artifact of revised.artifacts) {
      const preview = await restored.handle('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash }) as import('../src/shared/domain/artifacts').ArtifactPreview
      expect(preview.artifact.contentHash).toBe(artifact.contentHash)
    }
    expect(sent).toHaveLength(2); expect((await restored.handle('getConversation', { id: native.chat.id }) as ConversationDetail).runs).toHaveLength(revised.runs.length)
    await restored.close()
    await service.handle('clearConversationHistory', { id: native.chat.id, hide: false })
    for (const artifact of revised.artifacts) await expect(stat(artifact.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await read()).artifacts).toHaveLength(0)
  }, 30000)
  it.each([false, true])('owner link %s keeps the same native session and does not execute a Mastra model or replay on restart', async owner => {
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
    const binding = await service.handle('saveChannelBinding', { agentId: native.agent.id, platform: 'feishu', appId: 'fixture-app', name: '原生渠道', credential: 'fixture-secret', allowedUserIds: ['owner'], allowedChatIds: [], ...(owner ? { ownerUserId: 'owner' } : {}), requestId: 'fixture-bind' }) as ChannelBindingState
    await service.handle('connectChannelBinding', { id: binding.id, expectedRevision: binding.revision })
    const input = (eventId: string, text: string): ChannelInbound => ({ eventId, text, tenantId: 'tenant', chatId: 'direct', externalThreadId: `lark:direct:${eventId}`, kind: 'direct', userId: 'owner', userName: '外部用户', isBot: false, mentioned: false, mentionedUserIds: [], attachments: [] })
    const detail = async () => {
      const conversation = ((await service.handle('snapshot', undefined)) as Snapshot).conversations.find(conversation => isChannelConversation(conversation) && !conversation.mergedInto)!
      return service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
    }
    await receive(input('first', '你好')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(1)
    if (owner) {
      const room = (await detail()).conversation
      const local = await service.handle('createConversation', { kind: 'direct', title: native.agent.name, agentIds: [native.agent.id] }) as typeof room
      expect(local.id).not.toBe(room.id)
      await service.handle('sendMessage', { conversationId: local.id, content: '本地继续', mentionIds: [], requestId: 'native-local-message' })
      await expect.poll(async () => (await service.handle('getConversation', { id: local.id }) as ConversationDetail).runs.at(-1)?.status, { timeout: 15000 }).toBe('completed')
      const localSession = (await service.handle('getConversation', { id: local.id }) as ConversationDetail).runs.at(-1)?.backend?.sessionId
      expect(localSession).not.toBe((await detail()).runs[0].backend?.sessionId)
      const internal = await service.handle('ensureChannelDiscussion', { conversationId: room.id }) as typeof room
      await service.handle('sendMessage', { conversationId: internal.id, content: '内部讨论不公开', mentionIds: [], requestId: 'native-internal-message' })
      await expect.poll(async () => (await service.handle('getConversation', { id: internal.id }) as ConversationDetail).runs.at(-1)?.status, { timeout: 15000 }).toBe('completed')
      const internalSession = (await service.handle('getConversation', { id: internal.id }) as ConversationDetail).runs.at(-1)?.backend?.sessionId
      expect(internalSession).toBeTruthy(); expect(internalSession).not.toBe(localSession); expect(internalSession).not.toBe((await detail()).runs[0].backend?.sessionId)
      expect(sent).toHaveLength(1)
    }
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
    expect(result.runs).toHaveLength(3); expect(result.runs.at(-1)!.backend?.sessionId).toBe(sessionId)
    await receive(input('publish', 'NATIVE_PUBLISH')); await expect.poll(() => sent.length, { timeout: 15000 }).toBe(4)
    result = await detail(); expect(result.artifacts).toHaveLength(1); expect(files[3]).toHaveLength(1)
    expect(files[3][0].content).toBe('# 原生文件\n实际内容\n')
    await receive(input('revise', 'NATIVE_REVISE 修改刚才文件')); await expect.poll(async () => { result = await detail(); return result.runs.at(-1)?.status }, { timeout: 15000 }).toBe('completed')
    await expect.poll(() => sent.length, { timeout: 15000 }).toBe(5)
    result = await detail(); expect(result.artifacts, JSON.stringify({ messages: result.messages.map(message => message.content), runs: result.runs.map(run => ({ status: run.status, error: run.error })), work: result.workItems?.map(work => ({ status: work.status })) })).toHaveLength(2); expect(files[4]).toHaveLength(1)
    expect(result.artifacts[1].contentVersion).toBe(2)
  }, 30000)
})
