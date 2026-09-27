import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AgentDelivery, Conversation, ConversationEvent, Contribution, DecisionRecord, DigitalAgent, DiscussionTurn, Message, ParticipationDecision } from '../shared/contracts'
import { ProductStore, type StoredRecord } from './store'

const now = () => new Date().toISOString()
const row = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const ended = new Set(['completed', 'cancelled', 'failed', 'interrupted', 'budget_exhausted', 'waiting_user'])
const identifier = z.string().min(1).max(200)
export const decisionSchema = z.object({
  action: z.enum(['reply', 'pass', 'wait', 'ask', 'request_handoff']), responseKind: z.enum(['chat', 'task']).optional(),
  replyToMessageId: identifier.optional(), recipientAgentIds: z.array(identifier).max(12).optional(), purpose: z.string().max(2000).optional(),
  dependencyMessageIds: z.array(identifier).max(12).optional(), proposedContribution: z.object({ key: z.literal('main'), purpose: z.string().min(1).max(2000) }).strict().optional(),
  dependsOnContributions: z.array(z.object({ agentId: identifier, key: z.literal('main') }).strict()).max(12).optional(), observedThroughSequence: z.number().int().nonnegative(),
}).strict()
type EventRecord = ConversationEvent & { generation: number; sequence: number }
type TurnRecord = DiscussionTurn & { epoch: number; decisionCalls?: number; deliveryFailure?: boolean }
type DeliveryRecord = AgentDelivery & { failurePhase?: 'decision' | 'execution' }
type Grant = { id: string; turnId: string; agentId: string; decisionId: string; contextVersion: number; status: 'active' | 'done' | 'expired' }
type Active = { turn: TurnRecord; controller: AbortController; pending: Map<string, AgentDelivery>; inflight: Map<string, Promise<void>>; ready: Map<string, DecisionRecord>; waiting: Map<string, DecisionRecord>; handled: Set<string>; contributions: Map<string, number>; retriedDependencies: Set<string>; invited: Set<string>; speaker?: Promise<void>; wake: () => void; wakePromise: Promise<void>; promise: Promise<void>; yielded: boolean; asked: boolean; budgetLimited?: boolean; latestEvent: EventRecord; timer: ReturnType<typeof setTimeout>; done: boolean }
export interface SchedulerHooks {
  conversation(id: string): Conversation
  agent(id: string): DigitalAgent
  message(id: string): Message | undefined
  decide(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery, signal: AbortSignal): Promise<ParticipationDecision>
  speak(turn: DiscussionTurn, event: ConversationEvent, decision: DecisionRecord, signal: AbortSignal, publish: (message: Message, records: StoredRecord[]) => Promise<void>): Promise<void>
  settled(turn: DiscussionTurn, participants: string[], signal: AbortSignal): Promise<void>
  changed(conversationId: string): void
  error(error: unknown): void
}

/** Owns delivery and speaking rights. It never uses a model to choose a speaker. */
export class GroupScheduler {
  readonly turns = new Map<string, TurnRecord>()
  readonly events = new Map<string, EventRecord>()
  readonly deliveries = new Map<string, DeliveryRecord>()
  readonly decisions = new Map<string, DecisionRecord>()
  readonly contributions = new Map<string, Contribution>()
  private grants = new Map<string, Grant>()
  private active = new Map<string, Active>()
  private cancelling = new Map<string, number>()
  private closing = false
  constructor(private store: ProductStore, private hooks: SchedulerHooks) {}
  async init() {
    for (const name of ['turns', 'events', 'deliveries', 'decisions', 'contributions', 'grants'] as const) {
      const records = await this.store.load<{ id: string }>(name)
      ;(this[name] as Map<string, { id: string }>) = new Map(records.map(record => [record.id, record]))
    }
    const updates: StoredRecord[] = []
    for (const turn of this.turns.values()) if (!ended.has(turn.status)) { turn.status = 'interrupted'; turn.reason = '应用退出时讨论尚未完成'; turn.finishedAt = now(); turn.epoch++; updates.push(row('turns', turn)) }
    for (const delivery of this.deliveries.values()) if (['pending', 'evaluating', 'ready', 'waiting', 'responding'].includes(delivery.status)) { delivery.status = 'interrupted'; updates.push(row('deliveries', delivery)) }
    // Older builds called a partially failed group successful once any reply arrived.
    for (const turn of this.turns.values()) if (['completed', 'waiting_user', 'failed'].includes(turn.status)) {
      const failedMembers = new Set(this.unresolvedFailures(turn.id).map(delivery => delivery.agentId))
      if (failedMembers.size) { turn.status = 'failed'; turn.deliveryFailure = true; turn.reason = `${failedMembers.size} 名员工未完成本轮判断或执行；已收到的回复会保留`; updates.push(row('turns', turn)) }
      else if (turn.status === 'failed' && (turn.deliveryFailure || /^\d+ 名员工未完成本轮判断或执行/.test(turn.reason ?? ''))) {
        turn.status = [...this.decisions.values()].some(decision => decision.turnId === turn.id && decision.action === 'ask' && this.deliveries.get(decision.deliveryId)?.status === 'completed') ? 'waiting_user' : 'completed'
        delete turn.deliveryFailure; delete turn.reason; updates.push(row('turns', turn))
      }
    }
    for (const grant of this.grants.values()) if (grant.status === 'active') { grant.status = 'expired'; updates.push(row('grants', grant)) }
    for (const contribution of this.contributions.values()) if (['proposed', 'accepted', 'running'].includes(contribution.status)) { contribution.status = 'cancelled'; contribution.error = '应用退出，工作项中断'; updates.push(row('contributions', contribution)) }
    await this.store.write(updates)
  }
  prepare(conversation: Conversation, message: Message) {
    const turn: TurnRecord = { id: randomUUID(), conversationId: conversation.id, triggerMessageId: message.id, epoch: 1, status: 'queued', generation: 0, createdAt: now(), modelCalls: 0, publicMessages: 0 }
    message.turnId = turn.id
    const event: EventRecord = { id: randomUUID(), turnId: turn.id, conversationId: conversation.id, type: 'user_message', messageId: message.id, recipientAgentIds: message.mentionIds, generation: 0, sequence: message.sequence, createdAt: now() }
    const deliveries = conversation.agentIds.map(agentId => this.delivery(event, agentId))
    return { turn, event, deliveries, records: [row('turns', turn), row('events', event), ...deliveries.map(delivery => row('deliveries', delivery))] }
  }
  accept(prepared: ReturnType<GroupScheduler['prepare']>) {
    this.turns.set(prepared.turn.id, prepared.turn); this.events.set(prepared.event.id, prepared.event)
    for (const delivery of prepared.deliveries) this.deliveries.set(delivery.id, delivery)
    const previous = this.active.get(prepared.turn.conversationId)
    if (previous) { previous.yielded = true; if (previous.done) previous.controller.abort(new Error('优先处理用户的新消息')); previous.wake() }
    this.kick(prepared.turn.conversationId)
  }
  hasActiveTurn(turnId: string) { return [...this.active.values()].some(active => active.turn.id === turnId) }
  get busy() { return this.active.size > 0 || [...this.turns.values()].some(turn => turn.status === 'queued') }
  async reserveMaintenance(turnId: string) {
    const turn = this.turns.get(turnId), active = turn && this.active.get(turn.conversationId)
    if (!turn || !active || active.yielded || active.controller.signal.aborted || turn.modelCalls >= this.totalCallLimit(turn)) return false
    turn.modelCalls++; await this.store.write([row('turns', turn)]); return true
  }
  private totalCallLimit(turn: DiscussionTurn) { return Math.max(24, this.hooks.conversation(turn.conversationId).agentIds.length * 8) }
  async reserveAdditionalCall(turnId: string, phase: 'decision' | 'execution' | 'memory') {
    const turn = this.turns.get(turnId), active = turn && this.active.get(turn.conversationId)
    if (!turn || !active || active.turn.id !== turnId || this.closing || active.controller.signal.aborted || (active.done && phase !== 'memory') || (active.yielded && phase === 'decision')) throw new Error('本轮已结束或已有用户新消息，不能继续请求模型')
    if (turn.modelCalls >= this.totalCallLimit(turn)) { await this.stop(active, 'budget_exhausted', '达到本轮模型调用上限'); throw new Error('达到本轮模型调用上限') }
    if (phase === 'decision') {
      if ((turn.decisionCalls ?? 0) >= Math.max(12, this.hooks.conversation(turn.conversationId).agentIds.length * 4)) { active.budgetLimited = true; throw new Error('达到本轮判断调用上限，未发起补充模型请求') }
      turn.decisionCalls = (turn.decisionCalls ?? 0) + 1
    }
    turn.modelCalls++; await this.store.write([row('turns', turn)])
  }
  async recordOutputUsage(turnId: string, delta: number) {
    const turn = this.turns.get(turnId)
    if (!turn || !Number.isFinite(delta)) return
    turn.tokenEstimate = Math.max(0, (turn.tokenEstimate ?? 0) + delta)
    await this.store.write([row('turns', turn)])
    const active = this.active.get(turn.conversationId)
    if (active?.turn.id === turnId && turn.tokenEstimate >= 16000) {
      if (active.done) active.controller.abort(new Error('达到本轮输出用量上限'))
      else await this.stop(active, 'budget_exhausted', '达到本轮输出用量上限')
    }
  }
  detail(conversationId: string) {
    const turns = [...this.turns.values()].filter(turn => turn.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return { turns, unresolvedFailureDeliveryIds: turns.flatMap(turn => this.unresolvedFailures(turn.id).map(delivery => delivery.id)), events: [...this.events.values()].filter(event => event.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), deliveries: [...this.deliveries.values()].filter(delivery => delivery.conversationId === conversationId), decisions: [...this.decisions.values()].filter(decision => this.turns.get(decision.turnId)?.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), contributions: [...this.contributions.values()].filter(contribution => this.turns.get(contribution.turnId)?.conversationId === conversationId) }
  }
  private unresolvedFailures(turnId: string): DeliveryRecord[] {
    const deliveries = [...this.deliveries.values()].filter(delivery => delivery.turnId === turnId)
    const eventOrder = new Map([...this.events.values()].filter(event => event.turnId === turnId).map((event, index) => [event.id, index]))
    const deliveryOrder = new Map(deliveries.map((delivery, index) => [delivery.id, index]))
    const decisions = new Map([...this.decisions.values()].filter(decision => decision.turnId === turnId).map(decision => [decision.deliveryId, decision]))
    const later = (candidate: DeliveryRecord, failure: DeliveryRecord) => {
      const sequence = candidate.observedThroughSequence - failure.observedThroughSequence
      if (sequence) return sequence > 0
      const eventDifference = (eventOrder.get(candidate.eventId) ?? -1) - (eventOrder.get(failure.eventId) ?? -1)
      return eventDifference ? eventDifference > 0 : deliveryOrder.get(candidate.id)! > deliveryOrder.get(failure.id)!
    }
    return deliveries.filter(failure => {
      if (failure.status !== 'failed') return false
      // Older records infer phase from whether a validated decision preceded failure.
      const phase = failure.failurePhase ?? (decisions.has(failure.id) ? 'execution' : 'decision')
      return !deliveries.some(candidate => candidate.agentId === failure.agentId && later(candidate, failure) && (phase === 'decision'
        ? decisions.has(candidate.id)
        : candidate.status === 'completed' && decisions.get(candidate.id)?.action === 'reply'))
    })
  }
  private delivery(event: EventRecord, agentId: string): AgentDelivery {
    return { id: `${event.id}:${agentId}`, turnId: event.turnId, conversationId: event.conversationId, agentId, eventId: event.id, status: 'pending', observedThroughSequence: event.sequence, updatedAt: now() }
  }
  private kick(conversationId: string) {
    if (this.closing || this.cancelling.has(conversationId) || this.active.has(conversationId)) return
    const turn = [...this.turns.values()].find(turn => turn.conversationId === conversationId && turn.status === 'queued')
    if (!turn) return
    const event = [...this.events.values()].find(event => event.turnId === turn.id && event.type === 'user_message')!
    const active = { turn, controller: new AbortController(), pending: new Map([...this.deliveries.values()].filter(delivery => delivery.turnId === turn.id).map(delivery => [delivery.agentId, delivery])), inflight: new Map(), ready: new Map(), waiting: new Map(), handled: new Set(), contributions: new Map(), retriedDependencies: new Set(), invited: new Set(event.recipientAgentIds ?? []), wake: () => {}, wakePromise: Promise.resolve(), promise: Promise.resolve(), yielded: false, asked: false, latestEvent: event, timer: setTimeout(() => {}, 0), done: false } as Active
    clearTimeout(active.timer)
    active.timer = setTimeout(() => { void this.stop(active, 'budget_exhausted', '达到本轮时间上限') }, 5 * 60_000)
    active.timer.unref()
    this.active.set(conversationId, active)
    active.promise = this.loop(active).catch(async error => { this.hooks.error(error); await this.stop(active, 'failed', error instanceof Error ? error.message : String(error)) }).finally(() => { clearTimeout(active.timer); this.active.delete(conversationId); this.hooks.changed(conversationId); this.kick(conversationId) })
  }
  private signal(active: Active) {
    let wake!: () => void
    active.wakePromise = new Promise<void>(resolve => { wake = resolve })
    active.wake = wake
  }
  private async loop(active: Active) {
    active.turn.status = 'evaluating'; await this.store.write([row('turns', active.turn)])
    while (!active.done) {
      this.signal(active)
      if (active.controller.signal.aborted) break
      if (active.yielded && !active.speaker) { await this.stop(active, 'completed', '已让出当前讨论，优先处理用户的新消息'); break }
      while (!active.yielded && active.inflight.size < 3) {
        const delivery = [...active.pending.values()].sort((a, b) => Number(active.handled.has(a.agentId)) - Number(active.handled.has(b.agentId)) || (active.contributions.get(a.agentId) ?? 0) - (active.contributions.get(b.agentId) ?? 0)).find(delivery => !active.inflight.has(delivery.agentId) && ![...active.ready.values()].some(decision => decision.agentId === delivery.agentId && this.deliveries.get(decision.deliveryId)?.status === 'responding'))
        if (!delivery) break
        // Refresh stale intentions only near their speaking slot. Initial delivery
        // still runs three at once, without an N-by-N rejudgment fanout per message.
        if (active.handled.has(delivery.agentId) && (active.speaker || active.inflight.size || [...active.ready.values()].some(decision => this.dependencies(active, decision) === 'ready'))) break
        if ((active.turn.decisionCalls ?? 0) >= Math.max(12, this.hooks.conversation(active.turn.conversationId).agentIds.length * 4)) {
          active.budgetLimited = true
          const pending = [...active.pending.values()]; active.pending.clear()
          for (const item of pending) { item.status = 'skipped'; item.error = '达到本轮判断调用上限，尚未发出的判断已停止' }
          await this.store.write(pending.map(item => row('deliveries', item))); break
        }
        if (active.turn.modelCalls >= this.totalCallLimit(active.turn)) { await this.stop(active, 'budget_exhausted', '达到本轮模型调用上限'); break }
        active.pending.delete(delivery.agentId)
        active.turn.modelCalls++; active.turn.decisionCalls = (active.turn.decisionCalls ?? 0) + 1
        const promise = this.evaluate(active, delivery).catch(error => this.hooks.error(error)).finally(() => { active.inflight.delete(delivery.agentId); active.wake() })
        active.inflight.set(delivery.agentId, promise)
      }
      if (active.done) break
      if (!active.speaker && !active.yielded) {
        const candidates = [...active.ready.values()].sort((a, b) => Number(active.invited.has(b.agentId)) - Number(active.invited.has(a.agentId)) || (active.contributions.get(a.agentId) ?? 0) - (active.contributions.get(b.agentId) ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.agentId.localeCompare(b.agentId))
        const selected = candidates.find(decision => this.dependencies(active, decision) === 'ready')
        if (selected) {
          if (active.turn.modelCalls >= this.totalCallLimit(active.turn)) { await this.stop(active, 'budget_exhausted', '达到本轮模型调用上限'); break }
          active.ready.delete(selected.agentId)
          active.speaker = this.respond(active, selected).catch(error => this.hooks.error(error)).finally(() => { active.speaker = undefined; active.wake() })
        }
      }
      if (!active.speaker && !active.inflight.size && !active.pending.size) {
        const unresolved = [...active.waiting.values(), ...active.ready.values()]
        let refreshed = false
        for (const decision of unresolved) {
          const state = this.dependencies(active, decision)
          if (state === 'ready' && decision.action !== 'wait') continue
          if (!active.retriedDependencies.has(decision.agentId)) {
            active.retriedDependencies.add(decision.agentId); active.ready.delete(decision.agentId); active.waiting.delete(decision.agentId)
            await this.dependencyEvent(active, decision.agentId, state === 'ready' ? '依赖已经完成，请判断下一步' : '上游未承诺工作或已失败，请澄清、独立处理或结束')
            refreshed = true
          } else {
            const delivery = this.deliveries.get(decision.deliveryId)!
            delivery.status = 'skipped'; delivery.error = '依赖不可满足或仍未明确，本轮停止等待'; active.ready.delete(decision.agentId); active.waiting.delete(decision.agentId)
            await this.store.write([row('deliveries', delivery)])
          }
        }
        if (!refreshed && !active.ready.size && !active.waiting.size) {
          const failed = this.unresolvedFailures(active.turn.id)
          active.turn.status = active.budgetLimited ? 'budget_exhausted' : failed.length ? 'failed' : active.asked ? 'waiting_user' : 'completed'; active.turn.finishedAt = now(); active.done = true
          active.turn.deliveryFailure = failed.length > 0
          if (active.budgetLimited) active.turn.reason = '达到本轮判断调用上限'
          else if (failed.length) active.turn.reason = `${new Set(failed.map(delivery => delivery.agentId)).size} 名员工未完成本轮判断或执行；已收到的回复会保留`
          const unfinished = [...this.contributions.values()].filter(item => item.turnId === active.turn.id && ['proposed', 'accepted', 'running'].includes(item.status))
          for (const item of unfinished) { item.status = 'declined'; item.error ??= active.asked ? '需要用户补充信息，本轮工作尚未完成' : '员工本轮没有完成该工作项' }
          const superseded = [...this.deliveries.values()].filter(item => item.turnId === active.turn.id && ['pending', 'ready', 'waiting'].includes(item.status))
          for (const item of superseded) { item.status = 'skipped'; item.error ??= '本轮已结束，该判断已被后续事件接替' }
          await this.store.write([row('turns', active.turn), ...unfinished.map(item => row('contributions', item)), ...superseded.map(item => row('deliveries', item))]); this.hooks.changed(active.turn.conversationId)
          await this.hooks.settled(active.turn, [...active.contributions.keys()], active.controller.signal)
          break
        }
      }
      if (!active.done) await active.wakePromise
    }
  }
  private alive(active: Active) { return !active.done && !active.controller.signal.aborted && !this.closing }
  private async evaluate(active: Active, delivery: AgentDelivery) {
    const event = this.events.get(delivery.eventId)!
    try {
      if (!this.hooks.agent(delivery.agentId).active) throw new Error('员工已停用')
      delivery.status = 'evaluating'; delivery.updatedAt = now(); await this.store.write([row('turns', active.turn), row('deliveries', delivery)]); this.hooks.changed(delivery.conversationId)
      const timeout = AbortSignal.timeout(15_000)
      const signal = AbortSignal.any([active.controller.signal, timeout])
      const result = await abortable(this.hooks.decide(active.turn, event, delivery, signal), signal)
      if (!this.alive(active) || active.yielded) return
      const parsed = decisionSchema.parse(result)
      if (parsed.observedThroughSequence !== delivery.observedThroughSequence) throw new Error('参与判断的上下文版本不匹配')
      const conversation = this.hooks.conversation(active.turn.conversationId)
      for (const target of parsed.recipientAgentIds ?? []) if (!conversation.agentIds.includes(target) || target === delivery.agentId) throw new Error('接续目标不是有效的其他成员')
      if (parsed.action === 'request_handoff' && !parsed.recipientAgentIds?.length) throw new Error('接续请求必须包含目标成员')
      for (const messageId of [...(parsed.dependencyMessageIds ?? []), ...(parsed.replyToMessageId ? [parsed.replyToMessageId] : [])]) if (this.hooks.message(messageId)?.conversationId !== conversation.id) throw new Error('引用消息不属于当前会话')
      for (const dependency of parsed.dependsOnContributions ?? []) if (!conversation.agentIds.includes(dependency.agentId) || dependency.agentId === delivery.agentId) throw new Error('工作项依赖无效或引用了自身')
      const decision: DecisionRecord = { ...parsed, id: randomUUID(), turnId: active.turn.id, agentId: delivery.agentId, deliveryId: delivery.id, createdAt: now() }
      const changes = [row('decisions', decision)]
      if (parsed.proposedContribution) {
        const contribution: Contribution = { id: this.contributionId(active.turn.id, delivery.agentId), turnId: active.turn.id, agentId: delivery.agentId, key: 'main', purpose: parsed.proposedContribution.purpose, status: parsed.action === 'pass' ? 'declined' : 'accepted', dependsOn: (parsed.dependsOnContributions ?? []).map(dependency => this.contributionId(active.turn.id, dependency.agentId)), resultMessageIds: [], artifactIds: [] }
        const previous = this.contributions.get(contribution.id)
        if (previous?.status === 'completed') { contribution.status = 'completed'; contribution.resultMessageIds = previous.resultMessageIds; contribution.artifactIds = previous.artifactIds }
        this.contributions.set(contribution.id, contribution)
        if (this.cyclic(contribution.id)) { this.contributions.delete(contribution.id); throw new Error('工作项依赖形成循环') }
        changes.push(row('contributions', contribution))
      }
      this.decisions.set(decision.id, decision); active.handled.add(delivery.agentId)
      if (delivery.observedThroughSequence < active.latestEvent.sequence) {
        delivery.status = 'skipped'; delivery.error = '已有新的公开消息，将重新判断'; await this.queue(active, active.latestEvent, delivery.agentId)
      } else if (parsed.action === 'pass') {
        delivery.status = 'passed'; active.waiting.delete(delivery.agentId)
        const contribution = this.contributions.get(this.contributionId(active.turn.id, delivery.agentId))
        if (contribution && contribution.status !== 'completed') { contribution.status = 'declined'; changes.push(row('contributions', contribution)) }
      } else if (active.invited.size && !active.invited.has(delivery.agentId)) { delivery.status = 'skipped'; delivery.error = '本轮有明确收件人，保留判断但不抢答' }
      else if ((active.contributions.get(delivery.agentId) ?? 0) >= 2) { delivery.status = 'skipped'; delivery.error = '该员工已达到本轮主动发言上限' }
      else if (parsed.action === 'wait') { delivery.status = 'waiting'; active.waiting.set(delivery.agentId, decision) }
      else { delivery.status = 'ready'; active.ready.set(delivery.agentId, decision); active.waiting.delete(delivery.agentId) }
      delivery.updatedAt = now(); changes.push(row('deliveries', delivery)); await this.store.write(changes); this.hooks.changed(delivery.conversationId)
    } catch (error) {
      if (!this.alive(active)) return
      active.handled.add(delivery.agentId); delivery.status = 'failed'; delivery.updatedAt = now(); delivery.error = error instanceof Error ? error.message : String(error)
      ;(delivery as DeliveryRecord).failurePhase = 'decision'
      if (delivery.observedThroughSequence < active.latestEvent.sequence) await this.queue(active, active.latestEvent, delivery.agentId)
      await this.store.write([row('deliveries', delivery)]); this.hooks.changed(delivery.conversationId)
    }
  }
  private contributionId(turnId: string, agentId: string) { return `${turnId}:${agentId}:main` }
  private cyclic(id: string, visiting = new Set<string>()): boolean {
    if (visiting.has(id)) return true
    const next = new Set(visiting); next.add(id)
    return (this.contributions.get(id)?.dependsOn ?? []).some(dependency => this.cyclic(dependency, next))
  }
  private dependencies(active: Active, decision: DecisionRecord): 'ready' | 'pending' | 'failed' {
    const statuses = (decision.dependsOnContributions ?? []).map(dependency => this.contributions.get(this.contributionId(active.turn.id, dependency.agentId))?.status ?? (active.handled.has(dependency.agentId) ? 'declined' : 'proposed'))
    if (statuses.some(status => ['failed', 'cancelled', 'declined'].includes(status))) return 'failed'
    return statuses.every(status => status === 'completed') ? 'ready' : 'pending'
  }
  private async queue(active: Active, event: EventRecord, agentId: string) {
    if (!this.alive(active) || active.yielded || (active.contributions.get(agentId) ?? 0) >= 2) return
    const delivery = this.delivery(event, agentId)
    if (this.deliveries.has(delivery.id)) return
    const previous = active.pending.get(agentId)
    if (previous) previous.status = 'skipped'
    this.deliveries.set(delivery.id, delivery); active.pending.set(agentId, delivery); active.ready.delete(agentId)
    await this.store.write([row('deliveries', delivery), ...(previous ? [row('deliveries', previous)] : [])]); active.wake()
  }
  private async dependencyEvent(active: Active, agentId: string, reason: string) {
    const event: EventRecord = { ...active.latestEvent, id: randomUUID(), type: 'dependency_resolved', recipientAgentIds: [agentId], createdAt: now() }
    this.events.set(event.id, event); await this.store.write([row('events', event)]); await this.queue(active, event, agentId)
    const waiting = this.contributions.get(this.contributionId(active.turn.id, agentId))
    if (waiting) { waiting.error = reason; await this.store.write([row('contributions', waiting)]) }
  }
  private async respond(active: Active, decision: DecisionRecord) {
    const delivery = this.deliveries.get(decision.deliveryId)!
    const event = this.events.get(delivery.eventId)!
    if (delivery.observedThroughSequence < active.latestEvent.sequence) { delivery.status = 'skipped'; await this.store.write([row('deliveries', delivery)]); await this.queue(active, active.latestEvent, decision.agentId); return }
    const grant: Grant = { id: randomUUID(), turnId: active.turn.id, agentId: decision.agentId, decisionId: decision.id, contextVersion: delivery.observedThroughSequence, status: 'active' }
    this.grants.set(grant.id, grant); delivery.status = 'responding'; active.turn.status = decision.responseKind === 'task' ? 'executing' : 'responding'; active.turn.modelCalls++
    const contribution = decision.action === 'reply' ? this.contributions.get(this.contributionId(active.turn.id, decision.agentId)) : undefined
    if (contribution && contribution.status !== 'completed') contribution.status = 'running'
    await this.store.write([row('grants', grant), row('deliveries', delivery), row('turns', active.turn), ...(contribution ? [row('contributions', contribution)] : [])]); this.hooks.changed(delivery.conversationId)
    try {
      let published = false
      await this.hooks.speak(active.turn, event, decision, active.controller.signal, async (message, records) => {
        if (!this.alive(active) || grant.status !== 'active') throw new Error('发言权已经失效')
        grant.status = 'done'; delivery.status = 'completed'; active.turn.publicMessages++
        const previousContributions = active.contributions.get(decision.agentId) ?? 0
        active.contributions.set(decision.agentId, previousContributions + 1)
        if (decision.action === 'ask') active.asked = true
        if (decision.action === 'request_handoff') for (const recipient of decision.recipientAgentIds ?? []) active.invited.add(recipient)
        if (contribution) { contribution.status = 'completed'; contribution.resultMessageIds.push(message.id); contribution.artifactIds.push(...records.filter(record => record.collection === 'artifacts').map(record => record.id)) }
        const next: EventRecord = { id: randomUUID(), turnId: active.turn.id, conversationId: active.turn.conversationId, type: decision.action === 'request_handoff' ? 'handoff' : 'agent_message', agentId: decision.agentId, messageId: message.id, recipientAgentIds: decision.recipientAgentIds, sequence: message.sequence, generation: previousContributions === 0 ? 1 : event.generation + 1, createdAt: now() }
        const shouldDispatch = !active.yielded && next.generation < 3 && this.hooks.conversation(active.turn.conversationId).kind === 'group'
        const candidates = shouldDispatch ? this.hooks.conversation(active.turn.conversationId).agentIds.filter(agentId => agentId !== decision.agentId && active.handled.has(agentId) && (active.contributions.get(agentId) ?? 0) < 2).map(agentId => this.delivery(next, agentId)) : []
        const previous = [...new Map(candidates.flatMap(candidate => [active.pending.get(candidate.agentId), this.deliveries.get(active.ready.get(candidate.agentId)?.deliveryId ?? ''), this.deliveries.get(active.waiting.get(candidate.agentId)?.deliveryId ?? '')]).filter((value): value is AgentDelivery => !!value).map(item => [item.id, item])).values()]
        for (const item of previous) { item.status = 'skipped'; item.error = '已有新消息，将在发言前重新判断' }
        active.turn.generation = Math.max(active.turn.generation, next.generation)
        await this.store.write([...records, row('events', next), row('grants', grant), row('deliveries', delivery), row('turns', active.turn), ...(contribution ? [row('contributions', contribution)] : []), ...candidates.map(candidate => row('deliveries', candidate)), ...previous.map(candidate => row('deliveries', candidate))])
        this.events.set(next.id, next); active.latestEvent = next
        for (const candidate of candidates) { this.deliveries.set(candidate.id, candidate); active.pending.set(candidate.agentId, candidate); active.ready.delete(candidate.agentId); active.waiting.delete(candidate.agentId) }
        published = true; this.hooks.changed(delivery.conversationId); active.wake()
        if (next.generation >= 3 || (active.turn.tokenEstimate ?? 0) > 16000) await this.stop(active, 'budget_exhausted', next.generation >= 3 ? '达到本轮自动接续代数上限' : '达到本轮输出长度上限')
      })
      if (!published && this.alive(active)) throw new Error('员工没有提交公开回复')
    } catch (error) {
      if (this.alive(active)) {
        delivery.status = 'failed'; delivery.error = error instanceof Error ? error.message : String(error); grant.status = 'expired'
        delivery.failurePhase = 'execution'; delivery.updatedAt = now()
        if (contribution) { contribution.status = 'failed'; contribution.error = delivery.error }
        await this.store.write([row('deliveries', delivery), row('grants', grant), ...(contribution ? [row('contributions', contribution)] : [])]); this.hooks.changed(delivery.conversationId)
      }
    }
  }
  private async stop(active: Active, status: DiscussionTurn['status'], reason: string) {
    if (active.done) { active.controller.abort(new Error(reason)); active.wake(); return }
    active.done = true; active.turn.status = status; active.turn.reason = reason; active.turn.finishedAt = now(); active.turn.epoch++; active.controller.abort(new Error(reason)); active.wake()
    const rows = [row('turns', active.turn)]
    for (const delivery of this.deliveries.values()) if (delivery.turnId === active.turn.id && ['pending', 'evaluating', 'ready', 'waiting', 'responding'].includes(delivery.status)) { delivery.status = status === 'interrupted' ? 'interrupted' : 'cancelled'; rows.push(row('deliveries', delivery)) }
    for (const grant of this.grants.values()) if (grant.turnId === active.turn.id && grant.status === 'active') { grant.status = 'expired'; rows.push(row('grants', grant)) }
    for (const contribution of this.contributions.values()) if (contribution.turnId === active.turn.id && ['proposed', 'accepted', 'running'].includes(contribution.status)) { contribution.status = 'cancelled'; rows.push(row('contributions', contribution)) }
    await this.store.write(rows); this.hooks.changed(active.turn.conversationId)
  }
  async cancel(conversationId: string, reason = '用户停止本轮讨论', interrupted = false) {
    this.cancelling.set(conversationId, (this.cancelling.get(conversationId) ?? 0) + 1)
    try {
    const active = this.active.get(conversationId)
    if (active) await this.stop(active, interrupted ? 'interrupted' : 'cancelled', reason)
    for (const turn of this.turns.values()) if (turn.conversationId === conversationId && turn.status === 'queued') {
      turn.status = interrupted ? 'interrupted' : 'cancelled'; turn.reason = reason; turn.finishedAt = now(); turn.epoch++
      const deliveries = [...this.deliveries.values()].filter(delivery => delivery.turnId === turn.id)
      for (const delivery of deliveries) { delivery.status = interrupted ? 'interrupted' : 'cancelled'; delivery.updatedAt = now() }
      await this.store.write([row('turns', turn), ...deliveries.map(delivery => row('deliveries', delivery))])
    }
    } finally {
      const remaining = this.cancelling.get(conversationId)! - 1
      if (remaining) this.cancelling.set(conversationId, remaining)
      else { this.cancelling.delete(conversationId); this.kick(conversationId) }
    }
  }
  async close() {
    this.closing = true
    for (const id of new Set([...this.turns.values()].map(turn => turn.conversationId))) await this.cancel(id, '应用正在退出', true)
    await Promise.allSettled([...this.active.values()].flatMap(active => [active.promise, ...active.inflight.values(), ...(active.speaker ? [active.speaker] : [])]))
  }
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('已取消'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
