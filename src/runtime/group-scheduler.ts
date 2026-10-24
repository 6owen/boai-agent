/*
 * [OUTPUT]: 默认执行不按累计调用、工具步骤、用量或墙钟截断；保留真实用量、取消/权限和明确指定的预算。
 * [OUTPUT]: 原轮次支持员工定向取消、独立信号及禁止本轮重新邀请；同事继续，实际退出仍归原运行。
 * [OUTPUT]: 2026-10-14 安装已提交的空闲房间历史迁移，仅更新原缓存，不重新调度或运行启动恢复。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: 调度轮次只累计API用量；本机不受API输出额度、调用或时长截断，API预算取消与本机执行信号分离。
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [INPUT]: 共享领域类型、产品存储与群事件。
 * [OUTPUT]: 宿主核对已分工成员的真实业务广播仅保留上下文，在模型计数前跳过重复判断；用户/明确收件人/首轮/定向接续及未分工成员保持原边界。真实 bobo 公告的 collaboration_start 以唯一启动意图在原事务消费；仅同请求的定向工作可与开场并行，同员工真实执行/退出仍互斥，普通用户轮次仍单 lane 并优先；bobo 固定群根/成员独立判断及同预算子工作接续；重启不自动开工。普通聊天最终公开回复通过宿主 commitReply hook 同事务保存真实完成事实；失败/流式/取消不计完成，task 仍由原 Work 事务所有者提交。
 * [OUTPUT]: 公开 chat ask 的具体问题消息/判断关系同事务；task实际执行后仅沿已提交Message→Run→原Work.userQuestion核读等待，未提交/普通正文/依赖等待不算本人问题；原问题回答定向轮次及投影仅在提交后安装；自动化来源贯穿轮次并定向停止执行；删除员工/群时显式终结等待，保留已完成投递；群聊轮次、并行流式/完成事件版本、有限并行任务/定向接续、用户输入优先与清理后的投影回收。
 * [POS]: src/runtime/group-scheduler.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { isNativeBackend } from '../shared/domain/backends'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AgentDelivery, AgentRun, CollaborationStartIntent, Conversation, ConversationEvent, Contribution, DecisionRecord, DigitalAgent, DiscussionTurn, Message, ParticipationDecision, WorkItem } from '../shared/domain'
import { ProductStore, type RecordTransaction, type StoredRecord } from './adapters/storage/product-store'
import { collaborationStartAuthority } from './modules/collaboration/work-collaboration'
import { checkWorkBudget } from './modules/collaboration/work-budget'
import { workIntentSchema } from './modules/collaboration/work-protocol'
import { MAX_INDEPENDENT_TASKS } from './modules/collaboration/task-admission'
import { publishedWorkQuestionMatches } from '../shared/domain/inbox'

const now = () => new Date().toISOString()
const row = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const ended = new Set(['completed', 'cancelled', 'failed', 'interrupted', 'budget_exhausted', 'waiting_user'])
const identifier = z.string().min(1).max(200)
export const decisionSchema = z.object({
  work: workIntentSchema.optional(),
  action: z.enum(['reply', 'pass', 'wait', 'ask', 'request_handoff']), responseKind: z.enum(['chat', 'task']).optional(),
  replyToMessageId: identifier.optional(), recipientAgentIds: z.array(identifier).max(12).optional(), purpose: z.string().max(2000).optional(),
  dependencyMessageIds: z.array(identifier).max(12).optional(), proposedContribution: z.object({ key: z.literal('main'), purpose: z.string().min(1).max(2000) }).strict().optional(),
  dependsOnContributions: z.array(z.object({ agentId: identifier, key: z.literal('main') }).strict()).max(12).optional(), observedThroughSequence: z.number().int().nonnegative(),
}).strict()
type EventRecord = ConversationEvent & { generation: number; sequence: number }
type TurnRecord = DiscussionTurn & { cancelledAgentIds?: string[]; epoch: number; decisionCalls?: number; deliveryFailure?: boolean }
type DeliveryRecord = AgentDelivery & { failurePhase?: 'decision' | 'execution' }
type Grant = { id: string; turnId: string; agentId: string; decisionId: string; contextVersion: number; status: 'active' | 'done' | 'expired' }
type Active = { turn: TurnRecord; controller: AbortController; apiController: AbortController; employeeControllers: Map<string, AbortController>; pending: Map<string, AgentDelivery>; inflight: Map<string, Promise<void>>; ready: Map<string, DecisionRecord>; waiting: Map<string, DecisionRecord>; handled: Set<string>; contributions: Map<string, number>; retriedDependencies: Set<string>; invited: Set<string>; tasks: Map<string, Promise<void>>; deferredWork: Set<string>; awaitingExecution: Set<string>; chats: Map<string, Promise<void>>; wake: () => void; wakePromise: Promise<void>; promise: Promise<void>; yielded: boolean; asked: boolean; budgetLimited?: boolean; latestEvent: EventRecord; done: boolean }
export type PublishReply = (message: Message, records: StoredRecord[], commit?: (records: StoredRecord[]) => Promise<void>) => Promise<void>
export interface SchedulerHooks {
  interpretGroup?(turn: DiscussionTurn, signal: AbortSignal): Promise<DiscussionTurn['coordination']>

  commitReply?(message: Message, records: StoredRecord[]): Promise<void>
  critical<T>(operation: () => Promise<T>): Promise<T>
  conversation(id: string): Conversation
  agent(id: string): DigitalAgent
  message(id: string): Message | undefined
  /** Host-verified work broadcasts update context without another model participation call. */
  contextOnly?(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery): Promise<string | undefined>
  decide(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery, signal: AbortSignal): Promise<ParticipationDecision>
  speak(turn: DiscussionTurn, event: ConversationEvent, decision: DecisionRecord, signal: AbortSignal, publish: PublishReply): Promise<void | 'deferred'>
  settled(turn: DiscussionTurn, participants: string[], signal: AbortSignal): Promise<void>
  executionBusy?(conversationId: string, agentId: string): boolean
  changed(conversationId: string): void
  idle?(conversationId: string): void
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
  /** Install committed idle-room history without running startup recovery or scheduling it. */
  installRoomMigration(records: StoredRecord[]) {
    for (const record of records) if (['turns', 'events', 'deliveries', 'decisions', 'contributions', 'grants'].includes(record.collection)) {
      ;(this[record.collection as 'turns'] as Map<string, unknown>).set(record.id, record.value)
    }
  }
  async init() {
    for (const name of ['turns', 'events', 'deliveries', 'decisions', 'contributions', 'grants'] as const) {
      const records = await this.store.load<{ id: string }>(name)
      ;(this[name] as Map<string, { id: string }>) = new Map(records.map(record => [record.id, record]))
    }
    const updates: StoredRecord[] = []
    const works = new Map((await this.store.load<WorkItem>('workItems')).map(work => [work.id, work]))
    for (const turn of this.turns.values()) if (!turn.origin) {
      const origin = turn.workId ? works.get(turn.workId)?.origin : this.hooks.message(turn.triggerMessageId)?.origin
      if (origin) { turn.origin = origin; updates.push(row('turns', turn)) }
    }
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
    for (const intent of await this.store.load<CollaborationStartIntent>('collaborationStarts')) if (intent.status === 'pending') { intent.status = 'interrupted'; intent.reason = '应用退出前群协作尚未启动，不自动开工'; updates.push(row('collaborationStarts', intent)) }
    await this.store.write(updates)
  }
  forgetHistory(removals: { collection: string; id: string }[]) {
    for (const item of removals) {
      switch (item.collection) {
        case 'turns': this.turns.delete(item.id); break
        case 'events': this.events.delete(item.id); break
        case 'deliveries': this.deliveries.delete(item.id); break
        case 'decisions': this.decisions.delete(item.id); break
        case 'contributions': this.contributions.delete(item.id); break
        case 'grants': this.grants.delete(item.id); break
      }
    }
  }
  prepare(conversation: Conversation, message: Message) {
    const turn: TurnRecord = { id: randomUUID(), conversationId: conversation.id, triggerMessageId: message.id, ...(message.origin ? { origin: message.origin } : {}), epoch: 1, status: 'queued', generation: 0, createdAt: now(), modelCalls: 0, publicMessages: 0 }
    message.turnId = turn.id
    const event: EventRecord = { id: randomUUID(), turnId: turn.id, conversationId: conversation.id, type: 'user_message', messageId: message.id, recipientAgentIds: message.mentionIds, generation: 0, sequence: message.sequence, createdAt: now() }
    const deliveries = conversation.agentIds.map(agentId => this.delivery(event, agentId))
    return { turn, event, deliveries, records: [row('turns', turn), row('events', event), ...deliveries.map(delivery => row('deliveries', delivery))] }
  }
  prepareWork(conversation: Conversation, message: Message, work: WorkItem, wakeId: string, sequence: number) {
    const source = work.collaborationRequestId ? { collaborationRequestId: work.collaborationRequestId } : {}
    const turn: TurnRecord = { id: randomUUID(), conversationId: conversation.id, triggerMessageId: message.id, workId: work.id, wakeId, ...source, ...(work.origin ? { origin: work.origin } : {}), epoch: 1, status: 'queued', generation: 0, createdAt: now(), modelCalls: 0, publicMessages: 0 }
    const event: EventRecord = { id: randomUUID(), turnId: turn.id, conversationId: conversation.id, type: 'work_ready', messageId: message.id, recipientAgentIds: [work.ownerAgentId], ...source, generation: 0, sequence, createdAt: now(), work: { key: work.key, scope: work.scope, deliverable: work.deliverable, workId: work.id, expectedVersion: work.version } }
    const deliveries = [this.delivery(event, work.ownerAgentId)]
    return { turn, event, deliveries, records: [row('turns', turn), row('events', event), ...deliveries.map(delivery => row('deliveries', delivery))] }
  }
  /** Commit first; the caller installs actual objects and then passes the returned records to accept. */
  async prepareCollaborationStart(tx: RecordTransaction, intentId: string): Promise<ReturnType<GroupScheduler['prepare']> | null> {
    const intent = await tx.get<CollaborationStartIntent>('collaborationStarts', intentId)
    if (!intent) throw new Error('群协作启动身份不存在')
    if (intent.status === 'consumed') return null
    if (intent.status !== 'pending') throw new Error('群协作启动已中断、停止或需要核对，不自动重放')
    const { group, message, root, budget } = await collaborationStartAuthority(tx, intent)
    if (root.version !== intent.rootWorkVersion || root.status !== 'ready' || root.activeRunId || root.requiresReview) throw new Error('群协作根工作已变化，不能开工')
    checkWorkBudget(budget, root.budgetPolicy)
    const turn: TurnRecord = { id: randomUUID(), conversationId: group.id, triggerMessageId: message.id, workId: root.id, collaborationRequestId: intent.requestId, startIntentId: intent.id, epoch: 1, status: 'queued', generation: 0, createdAt: now(), modelCalls: 0, publicMessages: 0 }
    const event: EventRecord = { id: randomUUID(), turnId: turn.id, conversationId: group.id, type: 'collaboration_start', collaborationRequestId: intent.requestId, messageId: message.id, agentId: 'bobo', generation: 0, sequence: message.sequence, createdAt: now(), work: { key: root.key, scope: root.scope, deliverable: root.deliverable, workId: root.id, expectedVersion: root.version } }
    const deliveries = ['bobo', ...group.agentIds.filter(id => id !== 'bobo')].map(id => this.delivery(event, id))
    message.turnId = turn.id
    intent.status = 'consumed'; intent.turnId = turn.id; intent.consumedAt = now()
    const records = [row('turns', turn), row('events', event), ...deliveries.map(delivery => row('deliveries', delivery))]
    for (const record of [...records, row('messages', message), row('collaborationStarts', intent)]) await tx.put(record)
    return { turn, event, deliveries, records }
  }
  prepareQuestionReply(conversation: Conversation, message: Message, questionTurnId: string, ownerAgentId: string, work?: WorkItem) {
    const prepared = this.prepare({ ...conversation, agentIds: [ownerAgentId] }, message)
    prepared.turn.replyToTurnIds = [questionTurnId]
    if (work) {
      prepared.turn.workId = work.id
      if (work.collaborationRequestId) { prepared.turn.collaborationRequestId = work.collaborationRequestId; prepared.event.collaborationRequestId = work.collaborationRequestId }
      prepared.event.work = { key: work.key, scope: work.scope, deliverable: work.deliverable, workId: work.id, expectedVersion: work.version + 1 }
    }
    return prepared
  }
  installQuestionAnswer(decision?: DecisionRecord, turn?: DiscussionTurn) {
    if (decision) this.decisions.set(decision.id, decision)
    if (turn) Object.assign(this.turns.get(turn.id)!, turn)
  }
  accept(prepared: ReturnType<GroupScheduler['prepare']>) {
    this.turns.set(prepared.turn.id, prepared.turn); this.events.set(prepared.event.id, prepared.event)
    for (const delivery of prepared.deliveries) this.deliveries.set(delivery.id, delivery)
    if (!prepared.turn.wakeId) for (const previous of this.active.values()) if (previous.turn.conversationId === prepared.turn.conversationId) { previous.yielded = true; if (previous.done) previous.controller.abort(new Error('优先处理用户的新消息')); previous.wake() }
    this.kick(prepared.turn.conversationId)
  }
  hasActiveTurn(turnId: string) { return [...this.active.values()].some(active => active.turn.id === turnId) }
  canStartWork(turnId: string, agentId?: string) { return [...this.active.values()].some(active => active.turn.id === turnId && this.alive(active, agentId) && !active.yielded) }
  executionStarted(turnId: string, agentId: string) {
    const turn = this.turns.get(turnId), active = this.active.get(turnId)
    if (active?.turn.id === turnId) { active.awaitingExecution.delete(agentId); active.wake() }
  }
  executionFinished(conversationId: string) { this.executionReleased(conversationId) }
  get busy() { return this.active.size > 0 || [...this.turns.values()].some(turn => turn.status === 'queued') }
  async reserveMaintenance(turnId: string) {
    const turn = this.turns.get(turnId), active = this.active.get(turnId)
    if (!turn || !active || active.yielded || active.controller.signal.aborted) return false
    turn.modelCalls++; await this.store.write([row('turns', turn)]); return true
  }
  async reserveAdditionalCall(turnId: string, phase: 'decision' | 'execution' | 'memory') {
    const turn = this.turns.get(turnId), active = this.active.get(turnId)
    if (!turn || !active || active.turn.id !== turnId || this.closing || active.controller.signal.aborted || (active.done && phase !== 'memory') || (active.yielded && phase === 'decision')) throw new Error('本轮已结束或已有用户新消息，不能继续请求模型')
    if (phase === 'decision') {
      if ((turn.decisionCalls ?? 0) >= Math.max(12, this.hooks.conversation(turn.conversationId).agentIds.length * 4)) { active.budgetLimited = true; throw new Error('达到本轮判断调用上限，未发起补充模型请求') }
      turn.decisionCalls = (turn.decisionCalls ?? 0) + 1
    }
    turn.modelCalls++; await this.store.write([row('turns', turn)])
  }
  async recordOutputUsage(turnId: string, delta: number, runtime: 'api' | 'native' = 'api') {
    const turn = this.turns.get(turnId)
    if (!turn || runtime === 'native' || !Number.isFinite(delta)) return
    // Legacy turns are audited on restart, not resumed. Preserve their API baseline
    // when this method is used without a runtime; new native turns start at zero.
    turn.apiTokenEstimate ??= turn.tokenEstimate ?? 0
    if (runtime === 'api') turn.apiTokenEstimate = Math.max(0, turn.apiTokenEstimate + delta)
    turn.tokenEstimate = Math.max(0, (turn.tokenEstimate ?? 0) + delta)
    await this.store.write([row('turns', turn)])
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
    return { id: `${event.id}:${agentId}`, turnId: event.turnId, conversationId: event.conversationId, agentId, eventId: event.id, eventIds: [event.id], status: 'pending', observedThroughSequence: event.sequence, observedEventId: event.id, updatedAt: now() }
  }
  private workOwner(turn: DiscussionTurn) {
    return [...this.events.values()].find(event => event.turnId === turn.id && event.type === 'work_ready')?.recipientAgentIds?.[0]
  }
  private executionAvailable(active: Active, agentId: string) {
    return !this.hooks.executionBusy?.(active.turn.conversationId, agentId) && ![...this.active.values()].some(other => other !== active && other.turn.conversationId === active.turn.conversationId &&
      (other.tasks.has(agentId) || other.chats.has(agentId) || other.awaitingExecution.has(agentId) || (!other.done && this.workOwner(other.turn) === agentId)))
  }
  private executionReleased(conversationId: string) {
    for (const active of this.active.values()) if (active.turn.conversationId === conversationId) active.wake()
    this.kick(conversationId); this.hooks.idle?.(conversationId)
  }
  private kick(conversationId: string) {
    if (this.closing || this.cancelling.has(conversationId)) return
    const running = [...this.active.values()].filter(active => active.turn.conversationId === conversationId)
    const queued = [...this.turns.values()].filter(turn => turn.conversationId === conversationId && turn.status === 'queued')
    const opening = (turn: DiscussionTurn) => !!turn.startIntentId && !!turn.collaborationRequestId && [...this.events.values()].some(event => event.turnId === turn.id && event.type === 'collaboration_start' && event.collaborationRequestId === turn.collaborationRequestId)
    const userTurn = queued.find(turn => !turn.wakeId && !opening(turn))
    // Ordinary user input remains single-lane; only this opening's real directed work may overlap.
    if (running.some(active => !active.turn.wakeId && (!opening(active.turn) || active.yielded)) || (userTurn && running.length) || running.length >= MAX_INDEPENDENT_TASKS) return
    const occupied = new Set(running.flatMap(active => [this.workOwner(active.turn), ...active.tasks.keys(), ...active.chats.keys(), ...active.awaitingExecution]))
    const runningOpening = running.find(active => opening(active.turn))
    const turn = userTurn ?? queued.find(turn => (!runningOpening || (turn.wakeId && turn.collaborationRequestId === runningOpening.turn.collaborationRequestId)) && (!running.length || turn.wakeId) && !occupied.has(this.workOwner(turn)) && !this.hooks.executionBusy?.(conversationId, this.workOwner(turn) ?? ''))
    if (!turn) return
    const event = [...this.events.values()].find(event => event.turnId === turn.id && ['user_message', 'work_ready', 'collaboration_start'].includes(event.type))!
    const active = { turn, controller: new AbortController(), apiController: new AbortController(), employeeControllers: new Map(), pending: new Map([...this.deliveries.values()].filter(delivery => delivery.turnId === turn.id).map(delivery => [delivery.agentId, delivery])), inflight: new Map(), chats: new Map(), tasks: new Map(), deferredWork: new Set(), awaitingExecution: new Set(), ready: new Map(), waiting: new Map(), handled: new Set(), contributions: new Map(), retriedDependencies: new Set(), invited: new Set(event.recipientAgentIds ?? []), wake: () => {}, wakePromise: Promise.resolve(), promise: Promise.resolve(), yielded: false, asked: false, latestEvent: event, done: false } as Active
    this.active.set(turn.id, active)
    active.promise = this.loop(active).catch(async error => { this.hooks.error(error); await this.stop(active, 'failed', error instanceof Error ? error.message : String(error)) }).finally(() => { this.active.delete(turn.id); this.hooks.changed(conversationId); this.executionReleased(conversationId) })
    if (turn.wakeId) this.kick(conversationId)
  }
  private signal(active: Active) {
    let wake!: () => void
    active.wakePromise = new Promise<void>(resolve => { wake = resolve })
    active.wake = wake
  }
  private async loop(active: Active) {
    active.turn.status = 'evaluating'; await this.store.write([row('turns', active.turn)])
    const coordination = await this.hooks.interpretGroup?.(active.turn, active.controller.signal)
    if (coordination) await this.hooks.critical(async () => {
      if (!this.alive(active) || active.yielded) return
      const waiting = coordination.mode === 'ordered' ? [...active.pending.values()].filter(delivery => delivery.agentId !== coordination.agentIds[0]).map(delivery => ({ ...delivery, status: 'waiting' as const })) : []
      const nextTurn = { ...active.turn, coordination }
      await this.store.write([row('turns', nextTurn), ...waiting.map(delivery => row('deliveries', delivery))])
      active.turn.coordination = coordination
      for (const delivery of waiting) { Object.assign(this.deliveries.get(delivery.id)!, delivery); active.pending.delete(delivery.agentId) }
    })
    while (!active.done) {
      this.signal(active)
      if (active.controller.signal.aborted) break
      if (active.yielded && !active.chats.size && !active.tasks.size) { await this.stop(active, active.turn.coordination?.mode === 'ordered' ? 'interrupted' : 'completed', '已让出当前讨论，优先处理用户的新消息'); break }
      while (!active.yielded && active.inflight.size < this.hooks.conversation(active.turn.conversationId).agentIds.length) {
        // Let a ready response reach the shared model gate before refilling decision slots.
        if (active.awaitingExecution.size || [...active.ready.values()].some(decision => this.executionAvailable(active, decision.agentId) && this.dependencies(active, decision) === 'ready' && (decision.action === 'reply' && decision.responseKind === 'task' ? active.tasks.size < MAX_INDEPENDENT_TASKS : !active.chats.has(decision.agentId)))) break
        const awaitingFirstResponse = [...active.pending.keys(), ...active.inflight.keys(), ...active.ready.keys(), ...active.chats.keys()].some(agentId => (active.contributions.get(agentId) ?? 0) === 0 && (!active.ready.has(agentId) || this.dependencies(active, active.ready.get(agentId)!) === 'ready'))
        const delivery = [...active.pending.values()].sort((a, b) => Number(active.handled.has(a.agentId)) - Number(active.handled.has(b.agentId)) || (active.contributions.get(a.agentId) ?? 0) - (active.contributions.get(b.agentId) ?? 0)).find(delivery => {
          if (!this.executionAvailable(active, delivery.agentId) || active.inflight.has(delivery.agentId) || active.chats.has(delivery.agentId) || active.tasks.has(delivery.agentId) || [...active.ready.values()].some(decision => decision.agentId === delivery.agentId && this.deliveries.get(decision.deliveryId)?.status === 'responding')) return false
          const event = this.events.get(delivery.eventId)!
          // Coalesce ordinary follow-ups for members who already spoke. Explicit
          // recipients and dependency notifications retain their next opportunity.
          const ordinaryPeerRefresh = event.type === 'agent_message' && !(delivery.eventIds ?? [delivery.eventId]).some(id => this.events.get(id)?.recipientAgentIds?.includes(delivery.agentId)) && (active.contributions.get(delivery.agentId) ?? 0) > 0
          return !(ordinaryPeerRefresh && awaitingFirstResponse)
        })
        if (!delivery) break
        if (!isNativeBackend(this.hooks.agent(delivery.agentId).executionBackend) && active.apiController.signal.aborted) { active.pending.delete(delivery.agentId); delivery.status = 'skipped'; delivery.error = active.turn.reason; await this.store.write([row('deliveries', delivery)]); continue }
        const contextOnly = await this.hooks.contextOnly?.(active.turn, this.events.get(delivery.eventId)!, delivery)
        if (!this.alive(active) || active.yielded) break
        // Publication can replace this pending delivery while the host checks its committed sources.
        if (active.pending.get(delivery.agentId) !== delivery) continue
        if (contextOnly) {
          active.pending.delete(delivery.agentId); delivery.status = 'skipped'; delivery.error = contextOnly; delivery.updatedAt = now()
          await this.store.write([row('deliveries', delivery)]); this.hooks.changed(delivery.conversationId)
          continue
        }
        // Coalesce peer events while replies execute, then refresh a bounded batch.
        // A slow peer decision must not serialize the remaining independent members.
        if (active.handled.has(delivery.agentId) && (active.tasks.size || [...active.ready.values()].some(decision => this.dependencies(active, decision) === 'ready'))) break
        if (!isNativeBackend(this.hooks.agent(delivery.agentId).executionBackend) && (active.turn.decisionCalls ?? 0) >= Math.max(12, this.hooks.conversation(active.turn.conversationId).agentIds.length * 4)) {
          active.budgetLimited = true
          const pending = [...active.pending.values()].filter(item => !isNativeBackend(this.hooks.agent(item.agentId).executionBackend)); for (const item of pending) active.pending.delete(item.agentId)
          for (const item of pending) { item.status = 'skipped'; item.error = '达到本轮判断调用上限，尚未发出的判断已停止' }
          await this.store.write(pending.map(item => row('deliveries', item))); continue
        }
        active.pending.delete(delivery.agentId)
        const openingRoot = this.events.get(delivery.eventId)?.type === 'collaboration_start' && delivery.agentId === 'bobo'
        if (!isNativeBackend(this.hooks.agent(delivery.agentId).executionBackend) && !active.turn.wakeId && !openingRoot && active.turn.coordination?.mode !== 'ordered') { active.turn.modelCalls++; active.turn.decisionCalls = (active.turn.decisionCalls ?? 0) + 1 }
        const promise = this.evaluate(active, delivery).catch(error => this.hooks.error(error)).finally(() => { active.inflight.delete(delivery.agentId); active.wake() })
        active.inflight.set(delivery.agentId, promise)
      }
      if (active.done) break
      if (!active.yielded) {
        const candidates = [...active.ready.values()].sort((a, b) => Number(active.invited.has(b.agentId)) - Number(active.invited.has(a.agentId)) || (active.contributions.get(a.agentId) ?? 0) - (active.contributions.get(b.agentId) ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.agentId.localeCompare(b.agentId))
        for (const selected of candidates) {
          if (!isNativeBackend(this.hooks.agent(selected.agentId).executionBackend) && active.apiController.signal.aborted) { active.ready.delete(selected.agentId); continue }
          const task = selected.action === 'reply' && selected.responseKind === 'task'
          if (!this.executionAvailable(active, selected.agentId) || active.tasks.has(selected.agentId) || active.chats.has(selected.agentId) || this.dependencies(active, selected) !== 'ready' || (task && active.tasks.size >= MAX_INDEPENDENT_TASKS)) continue
          // Execution owns its Work deadline; admission waiting must not spend a second turn-wide clock.
          active.ready.delete(selected.agentId); active.awaitingExecution.add(selected.agentId)
          const execution = this.respond(active, selected).catch(error => this.hooks.error(error)).finally(() => {
            active.awaitingExecution.delete(selected.agentId)
            if (task) active.tasks.delete(selected.agentId)
            else active.chats.delete(selected.agentId)
            active.wake()
            this.executionReleased(active.turn.conversationId)
          })
          if (task) active.tasks.set(selected.agentId, execution)
          else active.chats.set(selected.agentId, execution)
        }
      }
      if (!active.chats.size && !active.tasks.size && !active.inflight.size && !active.pending.size) {
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
          active.turn.status = active.budgetLimited ? 'budget_exhausted' : failed.length ? 'failed' : active.turn.cancelledAgentIds?.length ? 'cancelled' : active.asked ? 'waiting_user' : 'completed'; active.turn.finishedAt = now(); active.done = true
          active.turn.deliveryFailure = failed.length > 0
          if (active.budgetLimited) active.turn.reason ??= '达到本轮判断调用上限'
          else if (failed.length) active.turn.reason = `${new Set(failed.map(delivery => delivery.agentId)).size} 名员工未完成本轮判断或执行；已收到的回复会保留`
          const unfinished = [...this.contributions.values()].filter(item => item.turnId === active.turn.id && ['proposed', 'accepted', 'running'].includes(item.status))
          for (const item of unfinished) { item.status = 'declined'; item.error ??= active.asked ? '需要用户补充信息，本轮工作尚未完成' : '员工本轮没有完成该工作项' }
          const superseded = [...this.deliveries.values()].filter(item => item.turnId === active.turn.id && ['pending', 'ready', 'waiting'].includes(item.status))
          for (const item of superseded) { item.status = 'skipped'; item.error ??= '本轮已结束，该判断已被后续事件接替' }
          await this.store.write([row('turns', active.turn), ...unfinished.map(item => row('contributions', item)), ...superseded.map(item => row('deliveries', item))]); this.hooks.changed(active.turn.conversationId)
          await this.hooks.settled(active.turn, [...active.contributions.keys()].filter(id => !active.turn.cancelledAgentIds?.includes(id)), active.controller.signal)
          break
        }
      }
      if (!active.done) await active.wakePromise
    }
  }
  private alive(active: Active, agentId?: string) { return !active.done && !active.controller.signal.aborted && !this.closing && (!agentId || !active.turn.cancelledAgentIds?.includes(agentId)) }
  private async evaluate(active: Active, delivery: AgentDelivery) {
    const event = this.events.get(delivery.eventId)!
    if (event.type !== 'user_message') { delivery.observedThroughSequence = active.latestEvent.sequence; delivery.observedEventId = active.latestEvent.id }
    try {
      this.assertOrderedParticipant(active, delivery.agentId)
      if (!this.hooks.agent(delivery.agentId).active) throw new Error('员工已停用')
      delivery.status = 'evaluating'; delivery.updatedAt = now(); await this.store.write([row('turns', active.turn), row('deliveries', delivery)]); this.hooks.changed(delivery.conversationId)
      // The service starts the decision deadline only after connection-wide admission.
      const signal = this.employeeSignal(active, delivery.agentId)
      const result: ParticipationDecision & { sourceDecisionRunId?: string } = event.type === 'work_ready' || (event.type === 'collaboration_start' && delivery.agentId === 'bobo')
        ? { action: 'reply', responseKind: 'task', work: event.work, purpose: event.work?.deliverable, observedThroughSequence: delivery.observedThroughSequence }
        : active.turn.coordination?.mode === 'ordered'
          ? { action: 'reply', responseKind: 'chat', purpose: active.turn.coordination.instruction, observedThroughSequence: delivery.observedThroughSequence }
          : await abortable(this.hooks.decide(active.turn, event, delivery, signal), signal)
      if (!this.alive(active, delivery.agentId) || active.yielded) return
      signal.throwIfAborted()
      const { sourceDecisionRunId, ...intent } = result
      const parsed = decisionSchema.parse(intent)
      if (parsed.observedThroughSequence !== delivery.observedThroughSequence) throw new Error('参与判断的上下文版本不匹配')
      const conversation = this.hooks.conversation(active.turn.conversationId)
      for (const target of parsed.recipientAgentIds ?? []) if (!conversation.agentIds.includes(target) || target === delivery.agentId) throw new Error('接续目标不是有效的其他成员')
      if (parsed.action === 'request_handoff' && !parsed.recipientAgentIds?.length) throw new Error('接续请求必须包含目标成员')
      for (const messageId of [...(parsed.dependencyMessageIds ?? []), ...(parsed.replyToMessageId ? [parsed.replyToMessageId] : [])]) if (this.hooks.message(messageId)?.conversationId !== conversation.id) throw new Error('引用消息不属于当前会话')
      for (const dependency of parsed.dependsOnContributions ?? []) if (!conversation.agentIds.includes(dependency.agentId) || dependency.agentId === delivery.agentId) throw new Error('工作项依赖无效或引用了自身')
      const decision: DecisionRecord = { ...parsed, ...(sourceDecisionRunId ? { sourceDecisionRunId } : {}), id: randomUUID(), turnId: active.turn.id, agentId: delivery.agentId, deliveryId: delivery.id, createdAt: now() }
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
      if (this.stale(active, delivery) && !this.independentChat(decision)) {
        delivery.status = 'skipped'; delivery.error = '已有新的公开消息，将重新判断'; await this.queue(active, active.latestEvent, delivery.agentId)
      } else if (parsed.action === 'pass') {
        delivery.status = 'passed'; active.waiting.delete(delivery.agentId)
        const contribution = this.contributions.get(this.contributionId(active.turn.id, delivery.agentId))
        if (contribution && contribution.status !== 'completed') { contribution.status = 'declined'; changes.push(row('contributions', contribution)) }
      } else if (active.invited.size && !active.invited.has(delivery.agentId)) { delivery.status = 'skipped'; delivery.error = '本轮有明确收件人，保留判断但不抢答' }
      else if (parsed.action === 'reply' && parsed.responseKind === 'task' && active.deferredWork.has(`${delivery.agentId}:${parsed.work?.workId ?? parsed.work?.key ?? 'main'}`)) { delivery.status = 'skipped'; delivery.error = '本轮已暂缓该工作，不重复争抢或重新执行' }
      else if ((active.contributions.get(delivery.agentId) ?? 0) >= 2) { delivery.status = 'skipped'; delivery.error = '该员工已达到本轮主动发言上限' }
      else if (parsed.action === 'wait') { delivery.status = 'waiting'; active.waiting.set(delivery.agentId, decision) }
      else { delivery.status = 'ready'; active.ready.set(delivery.agentId, decision); active.waiting.delete(delivery.agentId) }
      delivery.updatedAt = now(); changes.push(row('deliveries', delivery)); await this.store.write(changes); this.hooks.changed(delivery.conversationId)
    } catch (error) {
      if (!this.alive(active, delivery.agentId)) return
      active.handled.add(delivery.agentId); delivery.status = 'failed'; delivery.updatedAt = now(); delivery.error = error instanceof Error ? error.message : String(error)
      ;(delivery as DeliveryRecord).failurePhase = 'decision'
      if (this.stale(active, delivery)) await this.queue(active, active.latestEvent, delivery.agentId)
      await this.store.write([row('deliveries', delivery)]); this.hooks.changed(delivery.conversationId)
    }
  }
  private stale(active: Active, delivery: AgentDelivery) {
    return delivery.observedEventId ? delivery.observedEventId !== active.latestEvent.id : delivery.observedThroughSequence < active.latestEvent.sequence
  }
  private independentChat(decision: DecisionRecord) {
    const event = this.events.get(this.deliveries.get(decision.deliveryId)!.eventId)!
    return event.type === 'user_message' && decision.action === 'reply' && decision.responseKind === 'chat' && !decision.work && !decision.proposedContribution && !decision.dependencyMessageIds?.length && !decision.dependsOnContributions?.length && !decision.recipientAgentIds?.length && (!decision.replyToMessageId || decision.replyToMessageId === event.messageId)
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
    if (!this.alive(active, agentId) || active.yielded || (active.contributions.get(agentId) ?? 0) >= 2) return
    const delivery = this.delivery(event, agentId)
    if (this.deliveries.has(delivery.id)) return
    const previous = active.pending.get(agentId)
    if (previous) this.mergeDelivery(previous, delivery)
    this.deliveries.set(delivery.id, delivery); active.pending.set(agentId, delivery); active.ready.delete(agentId)
    await this.store.write([row('deliveries', delivery), ...(previous ? [row('deliveries', previous)] : [])]); active.wake()
  }
  private mergeDelivery(previous: AgentDelivery, next: AgentDelivery) {
    if (previous.turnId !== next.turnId || previous.conversationId !== next.conversationId || previous.agentId !== next.agentId) throw new Error('不能合并不同轮次或员工的投递')
    next.eventIds = [...new Set([...(previous.eventIds ?? [previous.eventId]), ...(next.eventIds ?? [next.eventId])])]
    previous.status = 'skipped'; previous.supersededByDeliveryId = next.id
    previous.error = '输入已合并到后续判断，保留全部来源引用'; previous.updatedAt = now()
  }
  private async dependencyEvent(active: Active, agentId: string, reason: string) {
    const event: EventRecord = { ...active.latestEvent, id: randomUUID(), type: 'dependency_resolved', recipientAgentIds: [agentId], createdAt: now() }
    this.events.set(event.id, event); await this.store.write([row('events', event)]); await this.queue(active, event, agentId)
    const waiting = this.contributions.get(this.contributionId(active.turn.id, agentId))
    if (waiting) { waiting.error = reason; await this.store.write([row('contributions', waiting)]) }
  }
  private assertOrderedParticipant(active: Active, agentId: string) {
    const state = active.turn.coordination
    if (state?.mode !== 'ordered') return
    if (state.agentIds[state.completed.length] !== agentId) throw new Error('群接续执行权已变化')
    const conversation = this.hooks.conversation(active.turn.conversationId)
    for (const id of state.agentIds) {
      const member = this.hooks.agent(id)
      if (!conversation.agentIds.includes(id) || !member.active || member.configVersion !== state.memberConfigVersions[id]) throw new Error('群接续成员或配置已变化，请重新发起')
    }
  }
  private async respond(active: Active, decision: DecisionRecord) {
    if (!this.alive(active, decision.agentId)) return
    const delivery = this.deliveries.get(decision.deliveryId)!
    const event = this.events.get(delivery.eventId)!
    if (this.stale(active, delivery) && !this.independentChat(decision)) { delivery.status = 'skipped'; await this.store.write([row('deliveries', delivery)]); await this.queue(active, active.latestEvent, decision.agentId); return }
    const grant: Grant = { id: randomUUID(), turnId: active.turn.id, agentId: decision.agentId, decisionId: decision.id, contextVersion: delivery.observedThroughSequence, status: 'active' }
    this.grants.set(grant.id, grant); delivery.status = 'responding'; active.turn.status = decision.responseKind === 'task' ? 'executing' : 'responding'; if (!isNativeBackend(this.hooks.agent(decision.agentId).executionBackend)) active.turn.modelCalls++
    const contribution = decision.action === 'reply' ? this.contributions.get(this.contributionId(active.turn.id, decision.agentId)) : undefined
    if (contribution && contribution.status !== 'completed') contribution.status = 'running'
    try {
      await this.store.write([row('grants', grant), row('deliveries', delivery), row('turns', active.turn), ...(contribution ? [row('contributions', contribution)] : [])]); this.hooks.changed(delivery.conversationId)
      let published = false
      const result = await this.hooks.speak(active.turn, event, decision, this.employeeSignal(active, decision.agentId), async (message, records, commit = records => this.hooks.commitReply ? this.hooks.commitReply(message, records) : this.store.write(records)) => {
        if (!this.alive(active, decision.agentId) || this.employeeSignal(active, decision.agentId).aborted || grant.status !== 'active') throw new Error('发言权已经失效')
        this.assertOrderedParticipant(active, decision.agentId)
        const ordered = active.turn.coordination?.mode === 'ordered' ? active.turn.coordination : undefined
        const nextGrant = { ...grant, status: 'done' as const }
        const nextDelivery = { ...delivery, status: 'completed' as const }
        const previousContributions = active.contributions.get(decision.agentId) ?? 0
        const nextContribution = contribution ? { ...contribution, status: 'completed' as const, resultMessageIds: [...contribution.resultMessageIds, message.id], artifactIds: [...contribution.artifactIds, ...records.filter(record => record.collection === 'artifacts').map(record => record.id)] } : undefined
        const next: EventRecord = { id: randomUUID(), turnId: active.turn.id, conversationId: active.turn.conversationId, ...(active.turn.collaborationRequestId ? { collaborationRequestId: active.turn.collaborationRequestId } : {}), type: decision.action === 'request_handoff' ? 'handoff' : 'agent_message', agentId: decision.agentId, messageId: message.id, recipientAgentIds: decision.recipientAgentIds, sequence: Math.max(active.latestEvent.sequence, message.sequence), generation: previousContributions === 0 ? 1 : event.generation + 1, createdAt: now() }
        const shouldDispatch = !ordered && !active.turn.wakeId && !active.yielded && next.generation < 3 && this.hooks.conversation(active.turn.conversationId).kind === 'group'
        const candidates = shouldDispatch ? this.hooks.conversation(active.turn.conversationId).agentIds.filter(agentId => !active.turn.cancelledAgentIds?.includes(agentId) && agentId !== decision.agentId && active.handled.has(agentId) && (!active.ready.has(agentId) || !this.independentChat(active.ready.get(agentId)!)) && (active.contributions.get(agentId) ?? 0) < 2).map(agentId => this.delivery(next, agentId)) : []
        const nextCoordination = ordered ? { ...ordered, revision: ordered.revision + 1, completed: [...ordered.completed, { agentId: decision.agentId, messageId: message.id, eventId: next.id, contentHash: createHash('sha256').update(message.content).digest('hex') }] } : undefined
        const nextAgentId = nextCoordination?.agentIds[nextCoordination.completed.length]
        if (nextAgentId && !active.yielded && !active.turn.cancelledAgentIds?.includes(nextAgentId)) {
          const waiting = [...this.deliveries.values()].find(item => item.turnId === active.turn.id && item.agentId === nextAgentId && item.status === 'waiting')
          if (!waiting) throw new Error('群接续缺少原投递身份')
          candidates.push({ ...waiting, status: 'pending', eventId: next.id, eventIds: [...new Set([...(waiting.eventIds ?? [waiting.eventId]), next.id])], observedEventId: next.id, observedThroughSequence: next.sequence, updatedAt: now() })
        }
        const previous = [...new Map(candidates.flatMap(candidate => [active.pending.get(candidate.agentId), this.deliveries.get(active.ready.get(candidate.agentId)?.deliveryId ?? ''), this.deliveries.get(active.waiting.get(candidate.agentId)?.deliveryId ?? '')]).filter((value): value is AgentDelivery => !!value).map(item => [item.id, structuredClone(item)])).values()]
        for (const item of previous) this.mergeDelivery(item, candidates.find(candidate => candidate.agentId === item.agentId)!)
        const nextTurn = { ...active.turn, ...(nextCoordination ? { coordination: nextCoordination } : {}), publicMessages: active.turn.publicMessages + 1, generation: Math.max(active.turn.generation, next.generation) }
        const questionDecision = decision.action === 'ask' && decision.responseKind !== 'task' ? { ...decision, userQuestion: { id: `decision:${decision.id}`, messageId: message.id, content: message.content, revision: 1 } } : undefined
        await commit([...records, row('events', next), row('grants', nextGrant), row('deliveries', nextDelivery), row('turns', nextTurn), ...(questionDecision ? [row('decisions', questionDecision)] : []), ...(nextContribution ? [row('contributions', nextContribution)] : []), ...candidates.map(candidate => row('deliveries', candidate)), ...previous.map(candidate => row('deliveries', candidate))])
        // Execution can discover a user question after its initial reply decision. Trust only the committed work result.
        const workQuestion = decision.responseKind === 'task' && message.runId && await this.store.transaction(async tx => {
          const run = await tx.get<AgentRun>('runs', message.runId!)
          if (!run?.workId || run.status !== 'completed' || run.responseKind !== 'task' || run.conversationId !== active.turn.conversationId || run.turnId !== active.turn.id || run.agentId !== decision.agentId || run.messageId !== message.id) return false
          const work = await tx.get<WorkItem>('workItems', run.workId), published = await tx.get<Message>('messages', message.id)
          return publishedWorkQuestionMatches(work, run, published)
        })
        // Only acknowledge delivery and speaking rights after durable publication.
        Object.assign(grant, nextGrant); Object.assign(delivery, nextDelivery)
        if (questionDecision) Object.assign(decision, questionDecision)
        if (nextCoordination) active.turn.coordination = nextCoordination
        active.turn.publicMessages = nextTurn.publicMessages; active.turn.generation = nextTurn.generation
        active.contributions.set(decision.agentId, previousContributions + 1)
        if (decision.action === 'ask' || workQuestion) active.asked = true
        if (decision.action === 'request_handoff') for (const recipient of decision.recipientAgentIds ?? []) active.invited.add(recipient)
        if (contribution && nextContribution) Object.assign(contribution, nextContribution)
        for (const item of previous) Object.assign(this.deliveries.get(item.id)!, item)
        this.events.set(next.id, next); active.latestEvent = next
        for (const candidate of candidates) { this.deliveries.set(candidate.id, candidate); active.pending.set(candidate.agentId, candidate); active.ready.delete(candidate.agentId); active.waiting.delete(candidate.agentId) }
        published = true; this.hooks.changed(delivery.conversationId); active.wake()
        if (!ordered && next.generation >= 3) await this.stop(active, 'budget_exhausted', '达到本轮自动接续代数上限')
      })
      if (!this.alive(active, decision.agentId)) return
      if (result === 'deferred') {
        active.deferredWork.add(`${decision.agentId}:${decision.work?.workId ?? decision.work?.key ?? 'main'}`)
        delivery.status = 'skipped'; delivery.error = '共享工作未获得执行权或任务草稿已暂缓，请查看运行和工作记录'; grant.status = 'expired'
        if (contribution && contribution.status !== 'completed') contribution.status = 'declined'
        await this.store.write([row('deliveries', delivery), row('grants', grant), ...(contribution ? [row('contributions', contribution)] : [])])
        return
      }
      if (!published && this.alive(active, decision.agentId)) throw new Error('员工没有提交公开回复')
    } catch (error) {
      if (this.alive(active, decision.agentId)) {
        delivery.status = 'failed'; delivery.error = error instanceof Error ? error.message : String(error); grant.status = 'expired'
        delivery.failurePhase = 'execution'; delivery.updatedAt = now()
        if (contribution) { contribution.status = 'failed'; contribution.error = delivery.error }
        await this.store.write([row('deliveries', delivery), row('grants', grant), ...(contribution ? [row('contributions', contribution)] : [])]); this.hooks.changed(delivery.conversationId)
      }
    }
  }
  private employeeSignal(active: Active, agentId: string) {
    let controller = active.employeeControllers.get(agentId)
    if (!controller) { controller = new AbortController(); active.employeeControllers.set(agentId, controller) }
    if (active.turn.cancelledAgentIds?.includes(agentId)) controller.abort(new Error('用户停止此员工本轮执行'))
    return AbortSignal.any([active.controller.signal, controller.signal, ...(isNativeBackend(this.hooks.agent(agentId).executionBackend) ? [] : [active.apiController.signal])])
  }
  private async stop(active: Active, status: DiscussionTurn['status'], reason: string) {
    // API budget exhaustion must not cancel another employee's native process.
    if (status === 'budget_exhausted' && this.hooks.conversation(active.turn.conversationId).agentIds.some(id => isNativeBackend(this.hooks.agent(id).executionBackend))) {
      const api = (id: string) => !isNativeBackend(this.hooks.agent(id).executionBackend)
      if (!this.hooks.conversation(active.turn.conversationId).agentIds.some(api)) return
      active.apiController.abort(new Error(reason)); active.budgetLimited = true; active.turn.reason = reason
      const skipped = new Map<string, AgentDelivery>()
      for (const queue of [active.pending, active.ready, active.waiting]) for (const [id, item] of queue) if (api(id)) {
        queue.delete(id)
        const delivery = 'deliveryId' in item ? this.deliveries.get(item.deliveryId) : item
        if (delivery) { delivery.status = 'skipped'; delivery.error = reason; skipped.set(delivery.id, delivery) }
      }
      await this.store.write([row('turns', active.turn), ...[...skipped.values()].map(item => row('deliveries', item))]); active.wake()
      return
    }
    if (active.done) { active.controller.abort(new Error(reason)); active.wake(); return }
    active.done = true; active.turn.status = status; active.turn.reason = reason; active.turn.finishedAt = now(); active.turn.epoch++; active.controller.abort(new Error(reason)); active.wake()
    const rows = [row('turns', active.turn)]
    for (const delivery of this.deliveries.values()) if (delivery.turnId === active.turn.id && ['pending', 'evaluating', 'ready', 'waiting', 'responding'].includes(delivery.status)) { delivery.status = status === 'interrupted' ? 'interrupted' : 'cancelled'; rows.push(row('deliveries', delivery)) }
    for (const grant of this.grants.values()) if (grant.turnId === active.turn.id && grant.status === 'active') { grant.status = 'expired'; rows.push(row('grants', grant)) }
    for (const contribution of this.contributions.values()) if (contribution.turnId === active.turn.id && ['proposed', 'accepted', 'running'].includes(contribution.status)) { contribution.status = 'cancelled'; rows.push(row('contributions', contribution)) }
    await this.store.write(rows); this.hooks.changed(active.turn.conversationId)
  }
  /** Revoke only this participant's remaining speaking/execution rights in the original turn. */
  async cancelParticipant(turnId: string, agentId: string) {
    const turn = this.turns.get(turnId), active = this.active.get(turnId)
    if (!turn || ended.has(turn.status)) return
    turn.cancelledAgentIds = [...new Set([...(turn.cancelledAgentIds ?? []), agentId])]
    turn.reason = '用户停止部分员工本轮执行；其他员工的回复保留'
    if (active) {
      active.pending.delete(agentId); active.ready.delete(agentId); active.waiting.delete(agentId)
      active.employeeControllers.get(agentId)?.abort(new Error('用户停止此员工本轮执行'))
    }
    const rows = [row('turns', turn)]
    for (const delivery of this.deliveries.values()) if (delivery.turnId === turnId && delivery.agentId === agentId && ['pending', 'evaluating', 'ready', 'waiting', 'responding'].includes(delivery.status)) {
      delivery.status = 'cancelled'; delivery.updatedAt = now(); rows.push(row('deliveries', delivery))
    }
    for (const grant of this.grants.values()) if (grant.turnId === turnId && grant.agentId === agentId && grant.status === 'active') { grant.status = 'expired'; rows.push(row('grants', grant)) }
    for (const item of this.contributions.values()) if (item.turnId === turnId && item.agentId === agentId && ['proposed', 'accepted', 'running'].includes(item.status)) { item.status = 'cancelled'; rows.push(row('contributions', item)) }
    await this.store.write(rows); active?.wake(); this.hooks.changed(turn.conversationId)
  }
  async cancelTurns(turnIds: Set<string>, reason: string, endWaiting = false) {
    for (const active of this.active.values()) if (turnIds.has(active.turn.id)) await this.stop(active, 'cancelled', reason)
    for (const turn of this.turns.values()) if (turnIds.has(turn.id) && (turn.status === 'queued' || endWaiting && turn.status === 'waiting_user')) {
      turn.status = 'cancelled'; turn.reason = reason; turn.finishedAt = now(); turn.epoch++
      const deliveries = [...this.deliveries.values()].filter(delivery => delivery.turnId === turn.id)
      for (const delivery of deliveries) if (['pending', 'evaluating', 'ready', 'waiting', 'responding'].includes(delivery.status)) delivery.status = 'cancelled'
      await this.store.write([row('turns', turn), ...deliveries.map(delivery => row('deliveries', delivery))])
    }
  }
  async cancelWorks(workIds: Set<string>) {
    for (const active of this.active.values()) if (active.turn.workId && workIds.has(active.turn.workId)) await this.stop(active, 'cancelled', '用户停止此工作')
    for (const turn of this.turns.values()) if (turn.workId && workIds.has(turn.workId) && turn.status === 'queued') {
      turn.status = 'cancelled'; turn.reason = '用户停止此工作'; turn.finishedAt = now(); turn.epoch++
      const deliveries = [...this.deliveries.values()].filter(delivery => delivery.turnId === turn.id)
      for (const delivery of deliveries) delivery.status = 'cancelled'
      await this.store.write([row('turns', turn), ...deliveries.map(delivery => row('deliveries', delivery))])
    }
  }
  async cancel(conversationId: string, reason = '用户停止本轮讨论', interrupted = false) {
    this.cancelling.set(conversationId, (this.cancelling.get(conversationId) ?? 0) + 1)
    try {
    for (const active of this.active.values()) if (active.turn.conversationId === conversationId) await this.stop(active, interrupted ? 'interrupted' : 'cancelled', reason)
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
    await Promise.allSettled([...this.active.values()].flatMap(active => [active.promise, ...active.inflight.values(), ...active.tasks.values(), ...active.chats.values()]))
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
