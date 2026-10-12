/*
 * [INPUT]: ProductStore、vault、原员工/会话/消息受理和现成渠道Transport。
 * [OUTPUT]: 稳定绑定和外部会话来源、显式发送者授权、单次业务受理及独立发送结果；未知不重放。
 * [POS]: 第16组业务接线；不自建平台协议或员工执行循环。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DigitalAgent, Message, Conversation, MaterialSelection, AgentRun, WorkItem, WorkBudget } from '../../../shared/domain'
import { CHANNEL_PLATFORMS, type ChannelBinding, type ChannelBindingAction, type ChannelBindingInput, type ChannelBindingState, type ChannelConversationSource, type ChannelDelivery, type ChannelMessageSource } from '../../../shared/domain/channels'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { SecretStore } from '../../contracts'

export interface ChannelAttachment { name: string; size?: number; read(): Promise<Buffer> }
export interface ChannelInbound {
  eventId: string; tenantId: string; chatId: string; threadId?: string; externalThreadId: string
  kind: 'direct' | 'group'; userId: string; userName: string; text: string
  isBot: boolean; mentioned: boolean; mentionedUserIds: string[]; attachments: ChannelAttachment[]
}
export interface ChannelOutputFile { name: string; mimeType?: string; bytes: Buffer }
export interface ChannelTransport {
  start(): Promise<{ botUserId?: string; botUserName?: string }>
  stop(): Promise<void>
  connected(): boolean
  send(target: ChannelTarget, text: string, files: ChannelOutputFile[]): Promise<string[]>
}
export interface ChannelTarget { id: string; bindingId: string; conversationId: string; externalThreadId: string; userId: string; chatId: string; kind: 'direct' | 'group' }
export type ChannelTransportFactory = (binding: ChannelBinding, credential: string, receive: (event: ChannelInbound) => Promise<void>, failed: () => void) => Promise<ChannelTransport>
interface StoredBinding extends ChannelBinding { credentialRef: string }
interface ChannelHooks {
  critical<T>(operation: () => Promise<T>): Promise<T>
  agent(id: string): DigitalAgent
  conversation(source: ChannelConversationSource, agentIds: string[]): Promise<Conversation>
  prepare(conversationId: string, eventKey: string, attachments: ChannelAttachment[]): Promise<MaterialSelection[]>
  accept(conversationId: string, event: ChannelInbound, source: ChannelMessageSource, requestId: string, agentIds: string[], materials: MaterialSelection[]): Promise<Message>
  files(message: Message): Promise<ChannelOutputFile[]>
  changed(): void
}
const id = z.string().trim().min(1).max(512)
const inputSchema = z.object({ id: id.optional(), agentId: id, platform: z.enum(CHANNEL_PLATFORMS), appId: id, robotCode: id.optional(), name: z.string().trim().min(1).max(100), credential: z.string().min(1).max(8000).optional(), allowedUserIds: z.array(id).min(1).max(100), allowedChatIds: z.array(id).max(100), expectedRevision: z.number().int().positive().optional(), botUserId: id.optional(), requestId: id }).strict()
const actionSchema = z.object({ id, expectedRevision: z.number().int().positive() }).strict()
const key = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const time = () => new Date().toISOString()

export class EmployeeChannels {
  private bindings = new Map<string, StoredBinding>()
  private live = new Map<string, ChannelTransport>()
  private states = new Map<string, { status: ChannelBindingState['status']; detail?: string }>()
  private lifecycle = new Map<string, Promise<unknown>>()
  private output: Promise<unknown> = Promise.resolve()
  private inputs = new Set<Promise<void>>()
  private closing = false
  constructor(private store: ProductStore, private secrets: SecretStore, private factory: ChannelTransportFactory, private hooks: ChannelHooks) {}

  async init() {
    this.bindings = new Map((await this.store.load<StoredBinding>('channelBindings')).map(binding => [binding.id, binding]))
    for (const delivery of await this.store.load<ChannelDelivery>('channelDeliveries')) if (delivery.status === 'sending') {
      await this.store.write([record('channelDeliveries', { ...delivery, status: 'unknown', detail: '发送期间运行服务退出；未自动重发。', updatedAt: time() })])
    }
    // A missing vault entry after restore never activates a bot on another host.
    for (const binding of this.bindings.values()) if (binding.enabled) {
      const task = this.connect(binding.id).catch(() => undefined).finally(() => this.lifecycle.delete(binding.id))
      this.lifecycle.set(binding.id, task)
    }
  }
  async list(agentId: string): Promise<ChannelBindingState[]> {
    this.hooks.agent(agentId)
    const deliveries = await this.store.load<ChannelDelivery>('channelDeliveries')
    return Promise.all([...this.bindings.values()].filter(value => value.agentId === agentId).map(async binding => {
      const { credentialRef: _, ...publicBinding } = binding
      const state = this.states.get(binding.id) ?? { status: 'disconnected' as const }
      const hasCredential = !!await this.secrets.get(binding.credentialRef).catch(() => undefined)
      return { ...publicBinding, ...state, hasCredential, ...(state.status === 'connected' && !this.live.get(binding.id)?.connected() ? { status: 'disconnected' as const, detail: '平台连接当前不可用。' } : {}), pendingDeliveries: deliveries.filter(value => value.bindingId === binding.id && value.status !== 'sent').length }
    }))
  }
  async receipt(agentId: string, requestId: string) {
    const receipt = await this.hooks.critical(() => this.store.get<{ bindingId: string }>('channelBindingReceipts', requestId))
    return receipt ? (await this.list(agentId)).find(binding => binding.id === receipt.bindingId) ?? null : null
  }
  async save(input: ChannelBindingInput): Promise<ChannelBindingState> {
    const value = inputSchema.parse(input)
    await this.hooks.critical(async () => {
      this.hooks.agent(value.agentId)
      const prior = value.id ? this.bindings.get(value.id) : undefined
      const fingerprint = key({ ...value, credential: value.credential ? key(value.credential) : undefined })
      const receipt = await this.store.get<{ id: string; fingerprint: string; bindingId: string }>('channelBindingReceipts', value.requestId)
      if (receipt) {
        if (receipt.fingerprint !== fingerprint || !this.bindings.has(receipt.bindingId)) throw new Error('原渠道请求已提交或解除，请核对原绑定。')
        return
      }
      if (value.id && !prior) throw new Error('渠道绑定不存在。')
      if (prior && value.robotCode && value.robotCode !== (prior.robotCode ?? prior.appId)) throw new Error('机器人身份不能改绑，请先解除原绑定。')
      if (prior && (prior.agentId !== value.agentId || prior.platform !== value.platform || prior.appId !== value.appId)) throw new Error('请解除原绑定后创建另一机器人；历史关系不改绑。')
      if (prior && prior.revision !== value.expectedRevision) throw new Error('渠道配置已更新，请刷新核对。')
      if (prior?.enabled || (prior && this.lifecycle.has(prior.id))) throw new Error('请先停止连接，再修改渠道配置。')
      if ([...this.bindings.values()].some(binding => binding.id !== prior?.id && binding.platform === value.platform && binding.appId === value.appId)) throw new Error('该机器人已绑定其他员工，请先核对原绑定。')
      if (!prior && !value.credential) throw new Error('请输入机器人凭据。')
      if (value.platform === 'telegram' && value.credential && value.appId !== value.credential.split(':')[0]) throw new Error('Bot ID与Bot Token的真实机器人身份不一致。')
      const credentialRef = value.credential ? `channel-${randomUUID()}` : prior!.credentialRef
      if (value.credential) await this.secrets.set(credentialRef, value.credential)
      const binding: StoredBinding = { id: prior?.id ?? randomUUID(), agentId: value.agentId, platform: value.platform, appId: value.appId, robotCode: value.robotCode ?? prior?.robotCode, name: value.name, allowedUserIds: [...new Set(value.allowedUserIds)], allowedChatIds: [...new Set(value.allowedChatIds)], credentialRef, hasCredential: true, enabled: false, revision: (prior?.revision ?? 0) + 1, botUserId: value.botUserId ?? prior?.botUserId, botUserName: prior?.botUserName, installedAt: prior?.installedAt ?? time(), updatedAt: time() }
      await this.store.transaction(async tx => {
        const current = prior ? await tx.get<StoredBinding>('channelBindings', prior.id) : undefined
        if (prior && current?.revision !== prior.revision) throw new Error('渠道配置已更新。')
        await tx.put(record('channelBindings', binding)); await tx.put(record('channelBindingReceipts', { id: value.requestId, fingerprint, bindingId: binding.id }))
      })
      this.bindings.set(binding.id, binding); this.states.set(binding.id, { status: 'disconnected' }); this.hooks.changed()
      // Never erase a credential when commit status is unknown.
      if (prior && prior.credentialRef !== credentialRef) await this.secrets.delete(prior.credentialRef)
    })
    const receipt = await this.store.get<{ bindingId: string }>('channelBindingReceipts', value.requestId)
    return (await this.list(value.agentId)).find(binding => binding.id === receipt!.bindingId)!
  }
  async action(input: ChannelBindingAction, operation: 'connect' | 'disconnect' | 'remove') {
    const value = actionSchema.parse(input)
    if (this.lifecycle.has(value.id)) throw new Error('渠道连接正在切换，请等待实际退出。')
    const task = (async () => {
      let binding!: StoredBinding
      await this.hooks.critical(async () => {
        binding = this.binding(value.id); this.hooks.agent(binding.agentId)
        if (binding.revision !== value.expectedRevision) throw new Error('渠道配置已更新，请刷新核对。')
        binding = { ...binding, enabled: operation === 'connect', revision: binding.revision + 1, updatedAt: time() }
        await this.store.write([record('channelBindings', binding)]); this.bindings.set(binding.id, binding)
      })
      await this.disconnect(binding.id)
      if (operation === 'connect') await this.connect(binding.id)
      if (operation === 'remove') await this.hooks.critical(async () => {
        await this.store.transaction(tx => tx.remove('channelBindings', binding.id)); this.bindings.delete(binding.id); this.states.delete(binding.id)
        await this.secrets.delete(binding.credentialRef)
        await this.secrets.delete(`channel-encryption-${binding.id}`)
      })
      this.hooks.changed()
    })()
    this.lifecycle.set(value.id, task)
    try { await task } finally { this.lifecycle.delete(value.id) }
  }
  private binding(id: string) { const binding = this.bindings.get(id); if (!binding || this.closing) throw new Error('渠道绑定已解除或正在退出。'); return binding }
  private async connect(id: string) {
    const binding = this.binding(id)
    this.states.set(id, { status: 'connecting' }); this.hooks.changed()
    let transport: ChannelTransport | undefined
    try {
      this.hooks.agent(binding.agentId)
      const credential = await this.secrets.get(binding.credentialRef)
      if (!credential) throw new Error('credential_missing')
      transport = await this.factory(binding, credential, event => {
        const task = this.receive(id, event); this.inputs.add(task)
        void task.finally(() => this.inputs.delete(task)).catch(() => undefined)
        return task
      }, () => { this.states.set(id, { status: 'failed', detail: '平台连接或消息处理失败，请核对配置与权限。' }); this.hooks.changed() })
      this.live.set(id, transport)
      const identity = await transport.start()
      if (this.closing || !this.bindings.get(id)?.enabled) { await transport.stop(); this.live.delete(id); return }
      const updated = { ...binding, botUserId: identity.botUserId ?? binding.botUserId, botUserName: identity.botUserName }
      await this.store.write([record('channelBindings', updated)]); this.bindings.set(id, updated)
      this.states.set(id, { status: 'connected' }); this.hooks.changed()
    } catch {
      if (transport) await transport.stop().catch(() => undefined)
      this.live.delete(id); this.states.set(id, { status: 'failed', detail: '连接未建立。请核对机器人凭据、网络、事件订阅及平台权限。' }); this.hooks.changed()
      throw new Error('渠道连接失败，请核对配置后重试。')
    }
  }
  private async disconnect(id: string) {
    const transport = this.live.get(id)
    await transport?.stop()
    await this.output
    this.live.delete(id); this.states.set(id, { status: 'disconnected' })
  }
  async receive(bindingId: string, event: ChannelInbound) {
    if (event.isBot || !event.eventId || !event.userId || this.closing) return
    await this.hooks.critical(async () => {
      const binding = this.binding(bindingId)
      if (!binding.enabled || !binding.allowedUserIds.includes(event.userId) || (event.kind === 'group' && (!event.mentioned || !binding.allowedChatIds.includes(event.chatId)))) return
      if (event.text.length > 100_000 || [event.eventId, event.tenantId, event.chatId, event.userId].some(value => !value || value.length > 512)) throw new Error('渠道消息来源或正文超出当前范围。')
      const candidates = event.kind === 'direct' ? [binding] : [...this.bindings.values()].filter(other => other.enabled && other.platform === binding.platform && other.allowedUserIds.includes(event.userId) && other.allowedChatIds.includes(event.chatId) && (other.id === binding.id || !!other.botUserId && event.mentionedUserIds.includes(other.botUserId) || !!other.botUserName && event.mentionedUserIds.includes(other.botUserName)))
      for (const candidate of candidates) this.hooks.agent(candidate.agentId)
      const source: ChannelConversationSource = { platform: binding.platform, tenantId: event.tenantId, chatId: event.chatId, kind: event.kind, ...(event.threadId ? { threadId: event.threadId } : {}), ...(event.kind === 'direct' ? { bindingId, userId: event.userId } : {}) }
      const requestId = `channel-${key([source, event.eventId])}`
      const existing = await this.store.get<{ messageId?: string; cleared?: boolean }>('messageReceipts', requestId)
      if (existing) return
      const conversation = await this.hooks.conversation(source, [...new Set(candidates.map(candidate => candidate.agentId))])
      for (const candidate of candidates) {
        const target: ChannelTarget = { id: `${conversation.id}:${candidate.id}`, bindingId: candidate.id, conversationId: conversation.id, externalThreadId: event.externalThreadId, userId: event.userId, chatId: event.chatId, kind: event.kind }
        await this.store.write([record('channelTargets', target)])
      }
      const materials = await this.hooks.prepare(conversation.id, requestId, event.attachments)
      await this.hooks.accept(conversation.id, event, { ...source, bindingId, eventId: event.eventId, userId: event.userId, replyThreadId: event.externalThreadId }, requestId, candidates.map(candidate => candidate.agentId), materials)
    })
  }
  published(message: Message) {
    if (message.senderType !== 'agent' || message.status !== 'completed' || this.closing) return
    const task = this.output.then(async () => {
      const targets = (await this.store.load<ChannelTarget>('channelTargets', { conversationId: message.conversationId })).filter(target => this.bindings.get(target.bindingId)?.agentId === message.senderId)
      for (const savedTarget of targets) {
        const run = message.runId ? await this.store.get<AgentRun>('runs', message.runId) : undefined
        const work = run?.workId ? await this.store.get<WorkItem>('workItems', run.workId) : undefined
        const budget = work?.budgetId ? await this.store.get<WorkBudget>('workBudgets', work.budgetId) : undefined
        const sourceIds = [run?.triggerMessageId, work?.sourceMessageId, budget?.sourceMessageId].filter((id): id is string => !!id)
        let origin: ChannelMessageSource | undefined
        for (const id of sourceIds) { const source = await this.store.get<Message>('messages', id); if (source?.channel && source.conversationId === message.conversationId) { origin = source.channel; break } }
        const target = origin?.replyThreadId ? { ...savedTarget, externalThreadId: origin.replyThreadId, userId: origin.userId } : savedTarget
        const binding = this.bindings.get(target.bindingId), transport = this.live.get(target.bindingId)
        if (!binding?.enabled || !binding.allowedUserIds.includes(target.userId) || target.kind === 'group' && !binding.allowedChatIds.includes(target.chatId)) continue
        const deliveryId = key([target.bindingId, message.id])
        if (await this.store.get('channelDeliveries', deliveryId)) continue
        const published = await this.store.get<Message>('messages', message.id)
        const conversation = await this.store.get<Conversation>('conversations', message.conversationId)
        if (!published || published.status !== 'completed' || published.content !== message.content || !conversation?.agentIds.includes(message.senderId) || await this.store.get('conversationCleanup', message.conversationId)) continue
        let delivery: ChannelDelivery = { id: deliveryId, bindingId: binding.id, conversationId: message.conversationId, messageId: message.id, status: 'sending', createdAt: time(), updatedAt: time() }
        // Prepare files before the first external side effect.
        let files: ChannelOutputFile[]
        try { files = await this.hooks.files(published) } catch { delivery = { ...delivery, status: 'failed', detail: '成果来源未通过核对，未发送。' }; await this.store.write([record('channelDeliveries', delivery)]); continue }
        await this.store.write([record('channelDeliveries', delivery)])
        try {
          if (this.bindings.get(binding.id)?.revision !== binding.revision || !this.bindings.get(binding.id)?.enabled) { delivery = { ...delivery, status: 'failed', detail: '渠道绑定或授权已变化，未发送。' } }
          else if (!transport?.connected()) { delivery = { ...delivery, status: 'failed', detail: '平台连接不可用，未发送。' } }
          else { const externalMessageIds = await transport.send(target, published.content, files); delivery = { ...delivery, status: 'sent', externalMessageIds } }
        } catch { delivery = { ...delivery, status: 'unknown', detail: '平台发送未确认；未重跑员工或自动重发。' } }
        await this.store.write([record('channelDeliveries', { ...delivery, updatedAt: time() })]); this.hooks.changed()
      }
    })
    this.output = task.catch(() => { this.hooks.changed() })
  }
  async deliveries(agentId: string) { const ids = new Set((await this.list(agentId)).map(value => value.id)); return (await this.store.load<ChannelDelivery>('channelDeliveries')).filter(value => ids.has(value.bindingId)).slice(-50).reverse() }
  /** Called inside the existing employee-delete critical section, after its eligibility checks. */
  async detachEmployees(agentIds: string[]) {
    for (const binding of this.bindings.values()) if (agentIds.includes(binding.agentId)) {
      const disabled = { ...binding, enabled: false, revision: binding.revision + 1, updatedAt: time() }
      await this.store.write([record('channelBindings', disabled)]); this.bindings.set(binding.id, disabled)
      await this.disconnect(binding.id)
    }
  }
  async close() { this.closing = true; await Promise.allSettled([...this.lifecycle.values()]); await Promise.all([...this.live.keys()].map(id => this.disconnect(id))); await Promise.allSettled([...this.inputs]); await this.output }
}
