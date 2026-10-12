/*
 * [INPUT]: Mastra 1.71 Channels、TelegramProvider 0.2.2、飞书/Lark适配器0.3.0与channel0.7.1、Rovai钉钉模块。
 * [OUTPUT]: 每绑定独立应用期连接，自定义handler只进入BOAI；飞书附件与状态补接原厂资源能力。
 * [POS]: 第16组现成平台适配；不运行默认Agent模型，不公开凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { AgentChannels, type ChannelHandler, type ChannelHandlers } from '@mastra/core/channels'
import { Mastra } from '@mastra/core/mastra'
import { Agent } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { TelegramProvider } from '@mastra/telegram'
import { LarkAdapter } from '@larksuite/vercel-chat-adapter'
import { createLarkChannel, type LarkChannel, type NormalizedMessage } from '@larksuite/channel'
import type { Attachment, Logger, Message as ChatMessage, Thread } from 'chat'
import type { ChannelBinding } from '../../../shared/domain/channels'
import { MATERIAL_LIMITS } from '../../../shared/domain/materials'
import type { SecretStore } from '../../contracts'
import type { ChannelAttachment, ChannelInbound, ChannelOutputFile, ChannelTarget, ChannelTransport, ChannelTransportFactory } from '../../modules/channels/channel-service'
import { DingTalkStreamRegistry } from './rovai/dingtalk-stream-registry'
import { DingTalkOpenApiClient } from './rovai/dingtalk-open-api'
import type { DingTalkInboundMessage } from './rovai/dingtalk-inbound'
import { withDingTalkInboundFiles } from './rovai/dingtalk-inbound-attachments'
import { DWClient } from 'dingtalk-stream'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const string = (value: unknown) => typeof value === 'string' ? value : ''
const logger = (failed: () => void): Logger => ({ debug() {}, info() {}, warn() {}, error: failed, child: () => logger(failed) })
function checked(bytes: Buffer) { if (bytes.length > MATERIAL_LIMITS.attachmentBytes) throw new Error('channel_attachment_too_large'); return bytes }
function attachments(values: Attachment[]): ChannelAttachment[] {
  return values.map((file, index) => ({ name: file.name ?? `attachment-${index}.${file.type === 'image' ? 'png' : 'bin'}`, size: file.size, read: async () => {
    if (file.data) return checked(Buffer.isBuffer(file.data) ? file.data : Buffer.from(await file.data.arrayBuffer()))
    if (file.fetchData) { const data = await file.fetchData(); return checked(Buffer.isBuffer(data) ? data : Buffer.from(data)) }
    throw new Error('channel_attachment_download_unavailable')
  } }))
}
export function normalizeChatInbound(binding: ChannelBinding, thread: Pick<Thread, 'id' | 'isDM'>, message: ChatMessage): ChannelInbound {
  const raw = object(message.raw)
  const lark = binding.platform === 'feishu' || binding.platform === 'lark'
  const telegram = object(raw.message ?? raw)
  const chat = object(telegram.chat)
  const chatId = lark ? string(raw.chatId) : String(chat.id ?? thread.id.split(':')[1] ?? '')
  const sender = object(object(raw.raw).sender)
  const tenantId = lark ? string(sender.tenant_key) || binding.appId : 'telegram'
  const isDM = lark ? raw.chatType === 'p2p' : thread.isDM
  // Feishu top-level message IDs are reply targets, not new conversation IDs.
  const threadId = lark ? raw.chatMode === 'topic' ? string(raw.threadId) || string(raw.rootId) : undefined : telegram.message_thread_id ? String(telegram.message_thread_id) : undefined
  const mentionedUserIds = lark ? Array.isArray(raw.mentions) ? raw.mentions.map(value => string(object(value).openId) || string(object(value).userId)).filter(Boolean) : [] : [...message.text.matchAll(/@([a-zA-Z0-9_]+)/g)].map(match => match[1].toLowerCase())
  return { eventId: message.id, tenantId, chatId, kind: isDM ? 'direct' : 'group', threadId, externalThreadId: thread.id, userId: message.author.userId, userName: message.author.fullName || message.author.userName || message.author.userId, text: message.text, isBot: message.author.isBot === true || message.author.isMe || raw.senderIsBot === true || raw.senderType === 'app', mentioned: message.isMention === true, mentionedUserIds, attachments: attachments(message.attachments) }
}

export function channelTransportFactory(dataPath: string, secrets: SecretStore): ChannelTransportFactory {
  return async (binding, credential, receive, failed) => {
    if (binding.platform === 'dingtalk') return dingTalk(binding, credential, receive, failed)
    await mkdir(join(dataPath, 'channel-state'), { recursive: true })
    const storage = new LibSQLStore({ id: `channel-${binding.id}`, url: pathToFileURL(join(dataPath, 'channel-state', `${binding.id}.sqlite`)).href })
    await storage.init()
    let running = false
    const handler: ChannelHandler = async (thread, message) => { await receive(normalizeChatInbound(binding, thread, message)) }
    const handlers: ChannelHandlers = { onDirectMessage: handler, onMention: handler, onSubscribedMessage: handler, onAction: false, onSlashCommand: false }
    let channels: AgentChannels | undefined
    let larkChannel: LarkChannel | undefined
    let provider: TelegramProvider | undefined
    let mastra: Mastra
    if (binding.platform === 'feishu' || binding.platform === 'lark') {
      class EmployeeLarkAdapter extends LarkAdapter {
        override parseMessage(message: NormalizedMessage) {
          const parsed = super.parseMessage(message)
          parsed.attachments = message.resources.map((resource, index) => ({ type: resource.type === 'image' ? 'image' as const : 'file' as const, name: resource.fileName ?? `attachment-${index}.${resource.type === 'image' ? 'png' : 'bin'}`, fetchData: async () => {
            if (!larkChannel || resource.type === 'sticker') throw new Error('channel_attachment_unavailable')
            return checked(await larkChannel.downloadResource(message.messageId, resource.fileKey, resource.type === 'image' ? 'image' : 'file'))
          } }))
          return parsed
        }
      }
      const adapter = new EmployeeLarkAdapter({ appId: binding.appId, appSecret: credential, domain: binding.platform, userName: binding.name, logger: logger(failed), channelFactory: options => {
        larkChannel = createLarkChannel({ ...options, domain: binding.platform, includeRawInMessage: true, resolveChatMode: true, keepalive: { enabled: true }, httpTimeoutMs: 20_000 })
        return larkChannel
      } })
      channels = new AgentChannels({ adapters: { lark: adapter }, handlers, tools: false, userName: binding.name, threadContext: { maxMessages: 0, addSystemMessage: false }, chatOptions: { logger: logger(failed) } })
      mastra = new Mastra({ storage })
    } else {
      const encryptionRef = `channel-encryption-${binding.id}`
      let encryptionKey = await secrets.get(encryptionRef)
      if (!encryptionKey) { encryptionKey = randomBytes(32).toString('hex'); await secrets.set(encryptionRef, encryptionKey) }
      provider = new TelegramProvider({ mode: 'polling', handlers, encryptionKey, streaming: false, typingStatus: false, tools: false, logger: logger(failed), threadContext: { maxMessages: 0, addSystemMessage: false } })
      // The holder only supplies Provider lifecycle; accidental default execution fails closed.
      const holder = new Agent({ id: binding.id, name: binding.name, instructions: '', model: () => { throw new Error('渠道只转交BOAI员工，不执行默认模型。') } })
      mastra = new Mastra({ storage, agents: { [binding.id]: holder }, channels: { telegram: provider } })
    }
    const transport: ChannelTransport = {
      async start() {
        if (provider) {
          const installation = await provider.getInstallation(binding.id)
          if (installation?.botToken && installation.botToken !== credential) await provider.disconnect(binding.id)
          if (installation?.botToken === credential) await provider.initialize()
          else await provider.connect(binding.id, { botToken: credential })
          channels = mastra.getAgentById(binding.id).getChannels() ?? undefined
        } else await channels!.initialize(mastra)
        running = true
        const installation = await provider?.getInstallation(binding.id)
        return { botUserId: larkChannel?.botIdentity?.openId ?? (installation?.botUserId ? String(installation.botUserId) : undefined), botUserName: installation?.username?.toLowerCase() }
      },
      async stop() { running = false; await channels?.sdk?.shutdown(); await mastra.shutdown() },
      connected() { const state = larkChannel?.getConnectionStatus?.()?.state; return running && (!state || state === 'connected') },
      async send(target, text, files) {
        if (!running) throw new Error('channel_disconnected')
        const ids: string[] = []
        if (text.trim()) {
          const message = await channels!.sdk!.thread(target.externalThreadId).post({ markdown: text })
          ids.push(message.id)
        }
        for (const file of files) {
          if (larkChannel) {
            const replyTo = target.externalThreadId.split(':').slice(2).join(':') || undefined
            const result = await larkChannel.send(target.chatId, { file: { source: file.bytes, fileName: file.name } }, { replyTo })
            ids.push(result.messageId)
          } else {
            const message = await channels!.sdk!.thread(target.externalThreadId).post({ raw: '', files: [{ data: file.bytes, filename: file.name, mimeType: file.mimeType }] })
            ids.push(message.id)
          }
        }
        return ids
      },
    }
    return transport
  }
}

function dingTalk(binding: ChannelBinding, credential: string, receive: (event: ChannelInbound) => Promise<void>, failed: () => void): ChannelTransport {
  const api = new DingTalkOpenApiClient({ appKey: binding.appId, appSecret: credential })
  const robotCode = binding.robotCode ?? binding.appId
  const clients = new Set<DWClient>()
  const registry = new DingTalkStreamRegistry({ createClient: value => { const client = new DWClient({ clientId: value.appKey, clientSecret: value.appSecret, debug: false, keepAlive: true }); client.on('error', failed); clients.add(client); return client }, onCard: async () => {}, onFailure: failed, onMessage: async (message: DingTalkInboundMessage) => {
    await receive({ eventId: message.externalMessageId, tenantId: message.tenantKey, chatId: message.chatId, externalThreadId: message.chatId, kind: message.conversationKind === 'p2p' ? 'direct' : 'group', userId: message.senderUserId, userName: message.senderDisplayName, text: message.body, isBot: false, mentioned: message.explicitlyAtBot, mentionedUserIds: message.atUsers.flatMap(user => [user.staffId, user.dingtalkId].filter((id): id is string => !!id)), attachments: message.resources.map(resource => ({ name: resource.name, read: async () => {
      return withDingTalkInboundFiles(api, robotCode, { requestId: message.externalMessageId, appId: binding.appId, messageId: message.externalMessageId, resources: [{ ...resource, downloadCode: resource.downloadCode ?? resource.fileKey }], attempt: 0, retryAt: null }, files => readFile(files[0]))
    } })) })
  } })
  return {
    async start() { await registry.start({ appKey: binding.appId, appSecret: credential, robotCode }); return { botUserId: binding.botUserId ?? robotCode } },
    async stop() {
      // dingtalk-stream@2.1.5 has no public awaitable disconnect. Its fixed
      // implementation owns this WebSocket; wait for its actual close event.
      const closed = [...clients].map(client => {
        const socket = Reflect.get(client, 'socket')
        if (!socket || socket.readyState === 3) return Promise.resolve()
        return new Promise<void>(resolve => {
          const timer = setTimeout(() => socket.terminate(), 5000)
          socket.once('close', () => { clearTimeout(timer); resolve() })
        })
      })
      registry.stopAll(); for (const client of clients) client.disconnect()
      await Promise.all(closed); clients.clear()
    },
    connected: () => registry.has(binding.appId),
    async send(target: ChannelTarget, text: string, files: ChannelOutputFile[]) {
      const ids: string[] = []
      if (text.trim()) {
        const result = target.kind === 'group' ? await api.sendGroupMarkdown({ robotCode, openConversationId: target.chatId, title: binding.name, text }) : await api.sendPrivateMarkdown({ robotCode, userId: target.userId, title: binding.name, text })
        ids.push(result)
      }
      for (const file of files) {
        const mediaId = await api.uploadFile(file.bytes, file.name, file.mimeType ?? 'application/octet-stream')
        const attachment = { kind: 'file' as const, mediaId, fileName: file.name }
        const result = target.kind === 'group' ? await api.sendGroupAttachment({ robotCode, openConversationId: target.chatId, attachment }) : await api.sendPrivateAttachment({ robotCode, userId: target.userId, attachment })
        ids.push(result)
      }
      return ids
    },
  }
}
