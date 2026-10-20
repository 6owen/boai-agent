/*
 * [OUTPUT]: 表情回应共用输出队列与channelDeliveries原回执，未知和重启均不重发。
 * [OUTPUT]: 2026-10-19应用业务协议：导出原渠道绑定与动作schema供公共业务协议复用。
 * [OUTPUT]: 绑定变更在原串行边界通知执行来源失效；实时核对原请求者与员工，停用不撤销历史接收者权限。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 明确外发沿固定原来信和绑定版本，普通本地讨论没有回发目标；未发送/未知各保存独立回执。
 * [OUTPUT]: 2026-10-14现行分离合同：本人ID不再合并历史，逐来源/绑定回发与旧回执去重保持；停止、凭据及未知保存核对不变。
 * [OUTPUT]: 入站按绑定员工分别受理，兼容旧共享/清理回执去重；新增每员工一个绑定，既有多绑定保留。
 * [OUTPUT]: 2026-10-14 明确本人账号同事务关联、主私聊解析和逐触发来源回发，取消最近平台目标回退。
 * [OUTPUT]: 授权群名称异步读取与有界缓存；失败保留原标题，停止/换绑后的旧查询不写回。
 * [INPUT]: ProductStore、vault、原员工/会话/消息受理和现成渠道Transport。
 * [OUTPUT]: 稳定绑定和外部会话来源、显式发送者授权、单次业务受理及独立发送结果；显示平台事件/受理结果，失败只用固定原因或白名单码，不回显凭据/载荷。
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
  react?(source: ChannelMessageSource, emoji: string, active: boolean): Promise<void>
  start(): Promise<{ botUserId?: string; botUserName?: string }>
  stop(): Promise<void>
  connected(): boolean
  groupName?(chatId: string): Promise<string | undefined>
  send(target: ChannelTarget, text: string, files: ChannelOutputFile[]): Promise<string[]>
}
export interface ChannelTarget { id: string; bindingId: string; conversationId: string; externalThreadId: string; userId: string; chatId: string; kind: 'direct' | 'group' }
export type ChannelTransportFactory = (binding: ChannelBinding, credential: string, receive: (event: ChannelInbound) => Promise<void>, failed: () => void, observed?: () => void) => Promise<ChannelTransport>
interface StoredBinding extends ChannelBinding { credentialRef: string }
interface ChannelHooks {
  critical<T>(operation: () => Promise<T>): Promise<T>
  agent(id: string): DigitalAgent
  conversation(source: ChannelConversationSource, agentIds: string[], owner: boolean): Promise<Conversation>
  groupName(conversationId: string, source: ChannelConversationSource, name: string): Promise<void>
  prepare(conversationId: string, eventKey: string, attachments: ChannelAttachment[]): Promise<MaterialSelection[]>
  accept(conversationId: string, event: ChannelInbound, source: ChannelMessageSource, requestId: string, agentIds: string[], materials: MaterialSelection[]): Promise<Message>
  files(message: Message): Promise<ChannelOutputFile[]>
  authorizationChanged(bindingId: string): Promise<void>
  changed(): void
}
const id = z.string().trim().min(1).max(512)
export const channelBindingInputSchema = z.object({ id: id.optional(), agentId: id, platform: z.enum(CHANNEL_PLATFORMS), appId: id, robotCode: id.optional(), name: z.string().trim().min(1).max(100), credential: z.string().min(1).max(8000).optional(), allowedUserIds: z.array(id).min(1).max(100), allowedChatIds: z.array(id).max(100), ownerUserId: id.nullable().optional(), expectedRevision: z.number().int().positive().optional(), botUserId: id.optional(), requestId: id }).strict()
export const channelBindingActionSchema = z.object({ id, expectedRevision: z.number().int().positive() }).strict()
const key = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const time = () => new Date().toISOString()
function connectionFailureDetail(error: unknown) {
  const reasons: Record<string, string> = {
    ERR_INVALID_URL: '渠道请求地址无效（ERR_INVALID_URL），请更新BOAI后重新连接。',
    ENOTFOUND: '渠道域名解析失败（ENOTFOUND），请检查网络或代理。',
    ECONNREFUSED: '平台连接被拒绝（ECONNREFUSED），请检查网络或代理。',
    ECONNRESET: '平台连接被中断（ECONNRESET），请检查网络或代理。',
    ETIMEDOUT: '平台连接超时（ETIMEDOUT），请检查网络或代理。',
    permission_denied: '平台权限不足，请核对应用权限及已发布版本。',
    credential_missing: '已保存的渠道凭据不可用，请停止连接后重新填写凭据。',
  }
  // SDK errors may wrap HTTP errors; never copy their message, URL or headers.
  for (let depth = 0; depth < 4 && error && typeof error === 'object'; depth++) {
    const value = error as { code?: unknown; cause?: unknown; response?: { data?: { code?: unknown } } }
    if (typeof value.code === 'string' && Object.hasOwn(reasons, value.code)) return reasons[value.code]
    const code = typeof value.code === 'number' ? value.code : value.response?.data?.code
    if (typeof code === 'number' && Number.isSafeInteger(code) && code > 0 && code < 10_000_000_000) return `平台未接受连接（错误码 ${code}），请核对机器人能力、应用发布、凭据和权限。`
    error = value.cause
  }
  return '连接未建立。请核对机器人凭据、网络、事件订阅及平台权限。'
}

export class EmployeeChannels {
  private bindings = new Map<string, StoredBinding>()
  private live = new Map<string, ChannelTransport>()
  private states = new Map<string, { status: ChannelBindingState['status']; detail?: string }>()
  private health = new Map<string, Pick<ChannelBindingState, 'lastEventAt' | 'lastInbound'>>()
  private lifecycle = new Map<string, Promise<unknown>>()
  private output: Promise<unknown> = Promise.resolve()
  private inputs = new Set<Promise<void>>()
  // Each binding authorizes at most 100 chat IDs. Disconnect drops its cache.
  private groupNames = new Map<string, Map<string, { refreshAt: number }>>()
  private metadata = new Set<Promise<void>>()
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
      return { ...publicBinding, ...state, ...this.health.get(binding.id), hasCredential, ...(state.status === 'connected' && !this.live.get(binding.id)?.connected() ? { status: 'disconnected' as const, detail: '平台连接当前不可用。' } : {}), pendingDeliveries: deliveries.filter(value => value.bindingId === binding.id && value.status !== 'sent').length }
    }))
  }
  async receipt(agentId: string, requestId: string) {
    const receipt = await this.hooks.critical(() => this.store.get<{ bindingId: string }>('channelBindingReceipts', requestId))
    return receipt ? (await this.list(agentId)).find(binding => binding.id === receipt.bindingId) ?? null : null
  }
  async save(input: ChannelBindingInput): Promise<ChannelBindingState> {
    const value = channelBindingInputSchema.parse(input)
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
      if (!prior && [...this.bindings.values()].some(binding => binding.agentId === value.agentId)) throw new Error('每名员工只能新增一个渠道绑定，请先解除现有绑定。')
      if (!prior && !value.credential) throw new Error('请输入机器人凭据。')
      const ownerUserId = value.ownerUserId === undefined ? prior?.ownerUserId : value.ownerUserId ?? undefined
      if (ownerUserId && !value.allowedUserIds.includes(ownerUserId)) throw new Error('本人用户 ID 必须在授权用户中。')
      if (value.platform === 'telegram' && value.credential && value.appId !== value.credential.split(':')[0]) throw new Error('Bot ID与Bot Token的真实机器人身份不一致。')
      const credentialRef = value.credential ? `channel-${randomUUID()}` : prior!.credentialRef
      if (value.credential) await this.secrets.set(credentialRef, value.credential)
      const binding: StoredBinding = { id: prior?.id ?? randomUUID(), agentId: value.agentId, platform: value.platform, appId: value.appId, robotCode: value.robotCode ?? prior?.robotCode, name: value.name, allowedUserIds: [...new Set(value.allowedUserIds)], allowedChatIds: [...new Set(value.allowedChatIds)], credentialRef, hasCredential: true, enabled: false, revision: (prior?.revision ?? 0) + 1, botUserId: value.botUserId ?? prior?.botUserId, botUserName: prior?.botUserName, installedAt: prior?.installedAt ?? time(), updatedAt: time() }
      await this.store.transaction(async tx => {
        const current = prior ? await tx.get<StoredBinding>('channelBindings', prior.id) : undefined
        if (prior && current?.revision !== prior.revision) throw new Error('渠道配置已更新。')
        await tx.put(record('channelBindings', { ...binding, ownerUserId })); await tx.put(record('channelBindingReceipts', { id: value.requestId, fingerprint, bindingId: binding.id }))
      })
      binding.ownerUserId = ownerUserId
      this.bindings.set(binding.id, binding); this.states.set(binding.id, { status: 'disconnected' }); this.hooks.changed()
      if (prior) await this.hooks.authorizationChanged(binding.id)
      // Never erase a credential when commit status is unknown.
      if (prior && prior.credentialRef !== credentialRef) await this.secrets.delete(prior.credentialRef)
    })
    const receipt = await this.store.get<{ bindingId: string }>('channelBindingReceipts', value.requestId)
    return (await this.list(value.agentId)).find(binding => binding.id === receipt!.bindingId)!
  }
  async action(input: ChannelBindingAction, operation: 'connect' | 'disconnect' | 'remove') {
    const value = channelBindingActionSchema.parse(input)
    if (this.lifecycle.has(value.id)) throw new Error('渠道连接正在切换，请等待实际退出。')
    const task = (async () => {
      let binding!: StoredBinding
      await this.hooks.critical(async () => {
        binding = this.binding(value.id); this.hooks.agent(binding.agentId)
        if (binding.revision !== value.expectedRevision) throw new Error('渠道配置已更新，请刷新核对。')
        binding = { ...binding, enabled: operation === 'connect', revision: binding.revision + 1, updatedAt: time() }
        await this.store.write([record('channelBindings', binding)]); this.bindings.set(binding.id, binding)
        await this.hooks.authorizationChanged(binding.id)
      })
      await this.disconnect(binding.id)
      if (operation === 'connect') await this.connect(binding.id)
      if (operation === 'remove') await this.hooks.critical(async () => {
        await this.store.transaction(tx => tx.remove('channelBindings', binding.id)); this.bindings.delete(binding.id); this.states.delete(binding.id); this.health.delete(binding.id)
        await this.hooks.authorizationChanged(binding.id)
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
      if (!credential) throw Object.assign(new Error('credential_missing'), { code: 'credential_missing' })
      transport = await this.factory(binding, credential, event => {
        const task = this.receive(id, event); this.inputs.add(task)
        void task.finally(() => this.inputs.delete(task)).catch(() => undefined)
        return task
      }, () => { this.states.set(id, { status: 'failed', detail: '平台连接或消息处理失败，请核对配置与权限。' }); this.hooks.changed() }, () => {
        if (!this.closing && this.bindings.has(id)) { this.health.set(id, { ...this.health.get(id), lastEventAt: time() }); this.hooks.changed() }
      })
      this.live.set(id, transport)
      const identity = await transport.start()
      if (this.closing || !this.bindings.get(id)?.enabled) { await transport.stop(); this.live.delete(id); return }
      const updated = { ...binding, botUserId: identity.botUserId ?? binding.botUserId, botUserName: identity.botUserName }
      await this.store.write([record('channelBindings', updated)]); this.bindings.set(id, updated)
      this.states.set(id, { status: 'connected' }); this.hooks.changed()
    } catch (error) {
      if (transport) await transport.stop().catch(() => undefined)
      const detail = connectionFailureDetail(error)
      this.live.delete(id); this.states.set(id, { status: 'failed', detail }); this.hooks.changed()
      throw new Error(detail)
    }
  }
  private async disconnect(id: string) {
    const transport = this.live.get(id)
    this.groupNames.delete(id)
    await transport?.stop()
    await this.output
    this.live.delete(id); this.states.set(id, { status: 'disconnected' })
  }
  private refreshGroupName(binding: StoredBinding, conversationId: string, source: ChannelConversationSource) {
    const transport = this.live.get(binding.id)
    if (this.closing || source.kind !== 'group' || !transport?.groupName) return
    let names = this.groupNames.get(binding.id)
    if (!names) { names = new Map(); this.groupNames.set(binding.id, names) }
    if ((names.get(source.chatId)?.refreshAt ?? 0) > Date.now()) return
    const entry = { refreshAt: Infinity }
    names.set(source.chatId, entry)
    const current = () => !this.closing && this.live.get(binding.id) === transport && this.bindings.get(binding.id)?.enabled && this.bindings.get(binding.id)?.revision === binding.revision && this.groupNames.get(binding.id) === names
    // Platform I/O must never hold the runtime critical section or delay a reply.
    const task = Promise.resolve().then(() => transport.groupName!(source.chatId)).then(async value => {
      const name = value?.replace(/\s+/g, ' ').trim().slice(0, 200)
      entry.refreshAt = Date.now() + (name ? 5 * 60_000 : 60_000)
      if (name && current()) await this.hooks.critical(async () => { if (current()) await this.hooks.groupName(conversationId, source, name) })
    }).catch(() => { entry.refreshAt = Date.now() + 60_000 }).finally(() => { this.metadata.delete(task) })
    this.metadata.add(task)
  }
  async receive(bindingId: string, event: ChannelInbound) {
    if (this.closing) return
    const receivedAt = time()
    const observed = (status: NonNullable<ChannelBindingState['lastInbound']>['status'], detail: string, conversationId?: string) => {
      if (this.closing || !this.bindings.has(bindingId)) return
      this.health.set(bindingId, { ...this.health.get(bindingId), lastEventAt: receivedAt, lastInbound: { receivedAt, status, detail, ...(conversationId ? { conversationId } : {}) } }); this.hooks.changed()
    }
    if (event.isBot) { observed('ignored', '机器人消息不触发员工。'); return }
    if (!event.eventId || !event.userId) { observed('ignored', '平台消息缺少有效来源身份，未受理。'); return }
    try { await this.hooks.critical(async () => {
      const binding = this.binding(bindingId)
      if (!binding.enabled) { observed('ignored', '渠道已停止，消息未受理。'); return }
      if (!binding.allowedUserIds.includes(event.userId)) { observed('ignored', '发送者不在授权用户中，消息未受理。'); return }
      if (event.kind === 'group' && !binding.allowedChatIds.includes(event.chatId)) { observed('ignored', '消息来自未配置的授权群，未受理。'); return }
      if (event.kind === 'group' && !event.mentioned) { observed('ignored', '群消息未明确提及机器人，未受理。'); return }
      if (event.text.length > 100_000 || [event.eventId, event.tenantId, event.chatId, event.userId].some(value => !value || value.length > 512)) throw new Error('渠道消息来源或正文超出当前范围。')
      this.hooks.agent(binding.agentId)
      const legacySource: ChannelConversationSource = { platform: binding.platform, tenantId: event.tenantId, chatId: event.chatId, kind: event.kind, ...(event.threadId ? { threadId: event.threadId } : {}), ...(event.kind === 'direct' ? { bindingId, userId: event.userId } : {}) }
      const source = event.kind === 'group' ? { ...legacySource, agentId: binding.agentId } : legacySource
      const requestId = `channel-${key([source, event.eventId])}`
      const existing = await this.store.get<{ messageId?: string; cleared?: boolean }>('messageReceipts', requestId)
      const legacyReceipt = event.kind === 'group' && await this.store.get('messageReceipts', `channel-${key([legacySource, event.eventId])}`)
      if (existing || legacyReceipt) { observed('ignored', '重复平台消息，未重复调用员工。'); return }
      const conversation = await this.hooks.conversation(source, [binding.agentId], event.kind === 'direct' && binding.ownerUserId === event.userId)
      const target: ChannelTarget = { id: `${conversation.id}:${binding.id}`, bindingId, conversationId: conversation.id, externalThreadId: event.externalThreadId, userId: event.userId, chatId: event.chatId, kind: event.kind }
      await this.store.write([record('channelTargets', target)])
      const materials = await this.hooks.prepare(conversation.id, requestId, event.attachments)
      await this.hooks.accept(conversation.id, event, { ...source, bindingId, eventId: event.eventId, userId: event.userId, replyThreadId: event.externalThreadId, ...(binding.ownerUserId === event.userId ? { owner: true } : {}) }, requestId, [binding.agentId], materials)
      observed('accepted', '消息已进入员工会话，处理结果见会话。', conversation.id)
      this.refreshGroupName(binding, conversation.id, source)
    }) } catch (error) { observed('failed', '消息受理失败，请核对员工模型配置、材料和执行记录。'); throw error }
  }
  executionBinding(source: ChannelMessageSource, agentId: string, requireEnabled = true) {
    const binding = this.bindings.get(source.bindingId)
    if (!binding || requireEnabled && !binding.enabled || binding.agentId !== agentId || binding.platform !== source.platform || !binding.allowedUserIds.includes(source.userId) || source.kind === 'group' && !binding.allowedChatIds.includes(source.chatId)) throw new Error('原渠道绑定或请求者授权已失效。')
    return binding
  }
  publicationBinding(source: ChannelMessageSource, agentId: string) {
    try { const binding = this.executionBinding(source, agentId); if (source.replyThreadId) return binding } catch { /* Preserve the public delivery error. */ }
    throw new Error('原渠道绑定或收件人授权已失效，未发送。')
  }
  published(message: Message) {
    if (message.senderType !== 'agent' || message.status !== 'completed' || this.closing) return
    const task = this.output.then(async () => {
      const targets = (await this.store.load<ChannelTarget>('channelTargets', { conversationId: message.conversationId })).filter(target => this.bindings.get(target.bindingId)?.agentId === message.senderId)
      for (const savedTarget of targets) {
        const run = message.runId ? await this.store.get<AgentRun>('runs', message.runId) : undefined
        const work = run?.workId ? await this.store.get<WorkItem>('workItems', run.workId) : undefined
        const budget = work?.budgetId ? await this.store.get<WorkBudget>('workBudgets', work.budgetId) : undefined
        const sourceIds = [message.channelPublication?.sourceMessageId, run?.triggerMessageId, work?.sourceMessageId, budget?.sourceMessageId].filter((id): id is string => !!id)
        let origin: ChannelMessageSource | undefined
        for (const id of sourceIds) { const source = await this.store.get<Message>('messages', id); if (source?.senderType === 'user' && source.conversationId === message.conversationId) { origin = source.channel; break } }
        // A local trigger has no external destination. Never fall back to a recent user.
        if (!origin?.replyThreadId || origin.kind !== savedTarget.kind || origin.platform !== this.bindings.get(savedTarget.bindingId)?.platform || origin.bindingId !== savedTarget.bindingId) continue
        const target = { ...savedTarget, externalThreadId: origin.replyThreadId, userId: origin.userId, chatId: origin.chatId }
        const binding = this.bindings.get(target.bindingId), transport = this.live.get(target.bindingId)
        if (!binding) continue
        const deliveryId = key([target.bindingId, message.id])
        if (await this.store.get('channelDeliveries', deliveryId)) continue
        const published = await this.store.get<Message>('messages', message.id)
        const conversation = await this.store.get<Conversation>('conversations', message.conversationId)
        if (!published || published.status !== 'completed' || published.content !== message.content || !conversation?.agentIds.includes(message.senderId) || await this.store.get('conversationCleanup', message.conversationId)) continue
        let delivery: ChannelDelivery = { id: deliveryId, bindingId: binding.id, conversationId: message.conversationId, messageId: message.id, status: 'sending', createdAt: time(), updatedAt: time() }
        if (!binding.enabled || !binding.allowedUserIds.includes(target.userId) || target.kind === 'group' && !binding.allowedChatIds.includes(target.chatId) || message.channelPublication && message.channelPublication.bindingRevision !== binding.revision) {
          await this.store.write([record('channelDeliveries', { ...delivery, status: 'failed', detail: '原渠道绑定或授权已变化，未发送。' })]); this.hooks.changed(); continue
        }
        // Prepare files before the first external side effect.
        let files: ChannelOutputFile[]
        try { files = await this.hooks.files(published) } catch { delivery = { ...delivery, status: 'failed', detail: '成果来源未通过核对，未发送。' }; await this.store.write([record('channelDeliveries', delivery)]); this.hooks.changed(); continue }
        await this.store.write([record('channelDeliveries', delivery)])
        try {
          const stillPublished = await this.store.get<Message>('messages', message.id)
          const stillSource = (await Promise.all(sourceIds.map(id => this.store.get<Message>('messages', id)))).find(source => source?.senderType === 'user' && source.conversationId === message.conversationId)
          if (!stillPublished || stillPublished.content !== published.content || JSON.stringify(stillSource?.channel) !== JSON.stringify(origin) || await this.store.get('conversationCleanup', message.conversationId)) { delivery = { ...delivery, status: 'failed', detail: '原渠道消息已清理或变化，未发送。' } }
          else if (this.bindings.get(binding.id)?.revision !== binding.revision || !this.bindings.get(binding.id)?.enabled) { delivery = { ...delivery, status: 'failed', detail: '渠道绑定或授权已变化，未发送。' } }
          else if (!transport?.connected()) { delivery = { ...delivery, status: 'failed', detail: '平台连接不可用，未发送。' } }
          else { const externalMessageIds = await transport.send(target, published.content, files); delivery = { ...delivery, status: 'sent', externalMessageIds } }
        } catch { delivery = { ...delivery, status: 'unknown', detail: '平台发送未确认；未重跑员工或自动重发。' } }
        await this.store.write([record('channelDeliveries', { ...delivery, updatedAt: time() })]); this.hooks.changed()
      }
    })
    this.output = task.catch(() => { this.hooks.changed() })
  }
  /** Shares the delivery queue/receipts with messages. Never retries an uncertain platform effect. */
  async react(agentId: string, message: Message, emoji: string, active: boolean, requestId: string, signal: AbortSignal): Promise<ChannelDelivery & { replayed?: true }> {
    const source = message.channel!
    const id = key(['reaction', agentId, requestId])
    const task = this.output.then(async () => {
      signal.throwIfAborted()
      const previous = await this.store.get<ChannelDelivery>('channelDeliveries', id)
      if (previous) {
        if (previous.messageId !== message.id || previous.reaction?.emoji !== emoji || previous.reaction.active !== active || previous.bindingId !== source.bindingId) throw new Error('原表情回应请求用于不同内容。')
        return { ...previous, replayed: true as const }
      }
      const binding = this.publicationBinding(source, agentId), transport = this.live.get(binding.id)
      if (this.closing || !transport?.connected() || !transport.react) throw new Error('此渠道当前不支持表情回应或连接不可用。')
      const current = await this.store.get<Message>('messages', message.id)
      const room = await this.store.get<Conversation>('conversations', message.conversationId)
      if (!current || current.status !== 'completed' || JSON.stringify(current.channel) !== JSON.stringify(source) || !room?.agentIds.includes(agentId) || await this.store.get('conversationCleanup', message.conversationId)) throw new Error('原回应消息已清理或变化。')
      let delivery: ChannelDelivery = { id, bindingId: binding.id, conversationId: message.conversationId, messageId: message.id, reaction: { emoji, active, agentId, requestId }, status: 'sending', createdAt: time(), updatedAt: time() }
      await this.store.write([record('channelDeliveries', delivery)])
      if (signal.aborted || this.closing || this.bindings.get(binding.id)?.revision !== binding.revision || !this.bindings.get(binding.id)?.enabled || !transport.connected()) {
        delivery = { ...delivery, status: 'failed', detail: '执行已停止或渠道授权变化，未发送表情回应。' }
      } else {
        try { await transport.react(source, emoji, active); delivery = { ...delivery, status: 'sent' } }
        catch { delivery = { ...delivery, status: 'unknown', detail: '平台表情回应未确认；未自动重试。' } }
      }
      delivery.updatedAt = time()
      await this.store.write([record('channelDeliveries', delivery)]); this.hooks.changed()
      return delivery
    })
    this.output = task.catch(() => { this.hooks.changed() })
    return task
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
  async close() {
    this.closing = true
    await Promise.allSettled([...this.lifecycle.values()]); await Promise.all([...this.live.keys()].map(id => this.disconnect(id))); await Promise.allSettled([...this.inputs, ...this.metadata]); await this.output
  }
}
