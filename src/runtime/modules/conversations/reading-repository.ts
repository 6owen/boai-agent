/*
 * [OUTPUT]: 2026-10-14现行分离合同：只读批量完成/可见状态投影用于渠道新回复提示，不创建历史完成或伪造阅读。
 * [INPUT]: ProductStore 的真实发布事务、已提交消息、同事务来源验证 hook 及本人可见的固定完成快照。
 * [OUTPUT]: 会话内单调完成身份、幂等发布、连续阅读边界/有界缺口、独立锚点 CAS、旧历史未知与清理 epoch；备份与重启只保留已提交事实。
 * [POS]: conversations 的个人阅读权威；不完成 Work，不调用模型，不把开始顺序当完成顺序。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { Message } from '../../../shared/domain'
import { READING_LIMITS, type ConversationAnchorInput, type ConversationCompletion, type ConversationCompletionIdentity, type ConversationObserveInput, type ConversationReadingState } from '../../../shared/domain/reading'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'

interface Clock { id: string; conversationId: string; epoch: number; ordinal: number; legacyCompletedUnknown: boolean }
export interface ConversationReadingHooks { validateMessage?(tx: RecordTransaction, message: Message): Promise<void> }
type SavedState = Omit<ConversationReadingState, 'completionCount' | 'unreadCount' | 'legacyCompletedUnknown' | 'firstUnreadMessageId'>
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const integer = (value: number, min = 0) => Number.isSafeInteger(value) && value >= min
export function readingIdentifier(value: string): string { if (!/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('无效阅读对象标识'); return value }
export function completionHash(message: Message): string { return createHash('sha256').update(JSON.stringify({ id: message.id, conversationId: message.conversationId, senderId: message.senderId, content: message.content, materialIds: message.materialIds ?? [], materialSources: message.materialSources ?? [] })).digest('hex') }

export class ConversationReadingRepository {
  constructor(private store: ProductStore, private hooks: ConversationReadingHooks = {}) {}
  /** Read-only projection: never creates clocks or marks unseen messages as read. */
  async unreadCounts(): Promise<Map<string, number>> {
    const [clocks, states] = await Promise.all([this.store.load<Clock>('conversationCompletionClocks'), this.store.load<SavedState>('conversationReadingStates')])
    const byId = new Map(states.map(state => [state.id, state]))
    return new Map(clocks.map(clock => {
      const saved = byId.get(clock.id), state = saved?.epoch === clock.epoch ? saved : undefined
      return [clock.id, Math.max(0, clock.ordinal - (state?.boundary ?? 0) - (state?.sparseSeen.length ?? 0))]
    }))
  }
  private async source(tx: RecordTransaction, message: Message): Promise<void> {
    if (this.hooks.validateMessage) await this.hooks.validateMessage(tx, message)
    else if (message.materialIds?.length || message.materialSources?.length) throw new Error('含材料消息需接入当前来源核对后才能保存阅读事实')
  }
  private async conversation(tx: RecordTransaction, id: string) {
    readingIdentifier(id)
    if (!await tx.get('conversations', id)) throw new Error('聊天已不存在')
    if (await tx.get('conversationCleanup', id)) throw new Error('聊天正在清理，阅读状态不可用')
  }
  private async clock(tx: RecordTransaction, conversationId: string, excludeMessageId?: string): Promise<Clock> {
    const current = await tx.get<Clock>('conversationCompletionClocks', conversationId)
    if (current) return current
    const legacyCompletedUnknown = (await tx.list<Message>('messages')).some(message => message.conversationId === conversationId && message.id !== excludeMessageId && message.senderType === 'agent' && message.status === 'completed')
    const next: Clock = { id: conversationId, conversationId, epoch: 1, ordinal: 0, legacyCompletedUnknown }
    await tx.put(record('conversationCompletionClocks', next)); return next
  }
  private async state(tx: RecordTransaction, clock: Clock): Promise<SavedState> {
    const current = await tx.get<SavedState>('conversationReadingStates', clock.id)
    if (current && current.epoch === clock.epoch) return current
    const next: SavedState = { id: clock.id, conversationId: clock.id, userId: 'user', epoch: clock.epoch, revision: 0, boundary: 0, sparseSeen: [], anchor: null }
    await tx.put(record('conversationReadingStates', next)); return next
  }
  private async dto(tx: RecordTransaction, state: SavedState, clock: Clock): Promise<ConversationReadingState> {
    const firstUnread = await tx.firstUnreadCompletion({ conversationId: clock.id, epoch: clock.epoch, boundary: state.boundary, sparseSeen: state.sparseSeen })
    return { ...structuredClone(state), completionCount: clock.ordinal, unreadCount: clock.ordinal - state.boundary - state.sparseSeen.length, legacyCompletedUnknown: clock.legacyCompletedUnknown, ...(firstUnread ? { firstUnreadMessageId: firstUnread.messageId } : {}) }
  }
  /** Call after putting the final agent Message in its real publication transaction. */
  async recordCompletion(tx: RecordTransaction, message: Message): Promise<ConversationCompletion | null> {
    if (message.senderType !== 'agent' || message.status !== 'completed') return null
    readingIdentifier(message.id); await this.conversation(tx, message.conversationId)
    const actual = await tx.get<Message>('messages', message.id)
    if (!actual || actual.conversationId !== message.conversationId || actual.senderType !== 'agent' || actual.status !== 'completed' || completionHash(actual) !== completionHash(message)) throw new Error('阅读完成事件必须属于同事务真实完成的员工消息')
    const clock = await this.clock(tx, message.conversationId, message.id), previous = await tx.get<ConversationCompletion>('conversationCompletions', message.id), hash = completionHash(actual)
    if (previous) {
      if (previous.conversationId !== clock.id || previous.epoch !== clock.epoch || previous.contentHash !== hash) throw new Error('原完成身份已失效，不能重新计数')
      return structuredClone(previous)
    }
    if (!integer(clock.ordinal) || clock.ordinal >= Number.MAX_SAFE_INTEGER) throw new Error('完成序号已超出可用范围')
    const completion: ConversationCompletion = { id: actual.id, messageId: actual.id, conversationId: clock.id, epoch: clock.epoch, ordinal: clock.ordinal + 1, contentHash: hash, completedAt: new Date().toISOString() }
    await tx.put(record('conversationCompletionClocks', { ...clock, ordinal: completion.ordinal }))
    await tx.put(record('conversationCompletions', completion)); return structuredClone(completion)
  }
  async readState(conversationId: string): Promise<ConversationReadingState> {
    return this.store.transaction(async tx => { await this.conversation(tx, conversationId); const clock = await this.clock(tx, conversationId); return this.dto(tx, await this.state(tx, clock), clock) })
  }
  async observe(input: ConversationObserveInput): Promise<ConversationReadingState> {
    readingIdentifier(input.conversationId)
    if (!integer(input.epoch, 1) || !integer(input.expectedRevision) || !Array.isArray(input.completions) || input.completions.length > READING_LIMITS.observedCompletions) throw new Error('阅读观测须携带有界完成快照和预期版本')
    return this.store.transaction(async tx => {
      await this.conversation(tx, input.conversationId)
      const clock = await this.clock(tx, input.conversationId), state = await this.state(tx, clock)
      if (clock.epoch !== input.epoch || state.revision !== input.expectedRevision) throw new Error('阅读状态已更新，迟到观测不能覆盖当前状态')
      const seen = new Set(state.sparseSeen)
      for (const observed of input.completions) {
        readingIdentifier(observed.messageId)
        if (observed.epoch !== input.epoch || !integer(observed.ordinal, 1) || !/^[0-9a-f]{64}$/.test(observed.contentHash)) throw new Error('可见快照缺少有效完成身份')
        const completion = await tx.get<ConversationCompletion>('conversationCompletions', observed.messageId), message = await tx.get<Message>('messages', observed.messageId)
        if (!completion || completion.conversationId !== clock.id || completion.epoch !== observed.epoch || completion.ordinal !== observed.ordinal || completion.contentHash !== observed.contentHash || !message || message.conversationId !== clock.id || message.senderType !== 'agent' || message.status !== 'completed' || completionHash(message) !== observed.contentHash) throw new Error('所见消息未完成或其完成身份已变化，请重新读取')
        await this.source(tx, message)
        if (observed.ordinal > state.boundary) seen.add(observed.ordinal)
      }
      let boundary = state.boundary
      while (seen.delete(boundary + 1)) boundary++
      if (seen.size > READING_LIMITS.sparseSeen) throw new Error('阅读缺口记录已达上限，请先返回未读内容再继续')
      const sparseSeen = [...seen].sort((a, b) => a - b), changed = boundary !== state.boundary || JSON.stringify(sparseSeen) !== JSON.stringify(state.sparseSeen)
      const next = changed ? { ...state, boundary, sparseSeen, revision: state.revision + 1 } : state
      if (changed) await tx.put(record('conversationReadingStates', next))
      return this.dto(tx, next, clock)
    })
  }
  async saveAnchor(input: ConversationAnchorInput): Promise<ConversationReadingState> {
    readingIdentifier(input.conversationId); readingIdentifier(input.messageId)
    if (!integer(input.epoch, 1) || !integer(input.expectedAnchorRevision) || !integer(input.offset) || input.offset > READING_LIMITS.anchorOffset) throw new Error('阅读位置须携带有效版本和有界偏移')
    return this.store.transaction(async tx => {
      await this.conversation(tx, input.conversationId)
      const clock = await this.clock(tx, input.conversationId), state = await this.state(tx, clock)
      if (clock.epoch !== input.epoch || (state.anchor?.revision ?? 0) !== input.expectedAnchorRevision) throw new Error('阅读位置已更新，迟到位置不能覆盖当前锚点')
      const message = await tx.get<Message>('messages', input.messageId)
      if (!message || message.conversationId !== clock.id) throw new Error('阅读位置的原消息已不存在')
      await this.source(tx, message)
      const anchor = { messageId: message.id, offset: input.offset, revision: (state.anchor?.revision ?? 0) + 1 }, next = { ...state, anchor }
      await tx.put(record('conversationReadingStates', next)); return this.dto(tx, next, clock)
    })
  }
  /** Clear inside the original history transaction. Keep the epoch fence across a recreated chat. */
  async resetConversation(tx: RecordTransaction, conversationId: string): Promise<void> {
    readingIdentifier(conversationId)
    const clock = await tx.get<Clock>('conversationCompletionClocks', conversationId)
    if (clock && (!integer(clock.epoch, 1) || clock.epoch >= Number.MAX_SAFE_INTEGER)) throw new Error('阅读代际已超出可用范围')
    for (const completion of await tx.list<ConversationCompletion>('conversationCompletions')) if (completion.conversationId === conversationId) await tx.remove('conversationCompletions', completion.id)
    await tx.remove('conversationReadingStates', conversationId)
    await tx.put(record('conversationCompletionClocks', { id: conversationId, conversationId, epoch: (clock?.epoch ?? 0) + 1, ordinal: 0, legacyCompletedUnknown: false } satisfies Clock))
  }
  async completionSnapshot(conversationId: string, messageIds: string[]): Promise<ConversationCompletionIdentity[]> {
    readingIdentifier(conversationId)
    if (messageIds.length > READING_LIMITS.maxPage) throw new Error('完成快照请求超出页大小')
    return this.store.transaction(async tx => {
      await this.conversation(tx, conversationId)
      const clock = await this.clock(tx, conversationId), result: ConversationCompletionIdentity[] = []
      for (const id of messageIds) {
        const completion = await tx.get<ConversationCompletion>('conversationCompletions', readingIdentifier(id)), message = await tx.get<Message>('messages', id)
        if (completion && completion.conversationId === conversationId && completion.epoch === clock.epoch && message?.status === 'completed' && message.senderType === 'agent' && completionHash(message) === completion.contentHash) { await this.source(tx, message); result.push({ messageId: id, epoch: completion.epoch, ordinal: completion.ordinal, contentHash: completion.contentHash }) }
      }
      return result
    })
  }
}
