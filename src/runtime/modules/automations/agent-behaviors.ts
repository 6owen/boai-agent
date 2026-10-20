/*
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 反思较早漏日/当日笔记与来源失效、十技能绑定；实际与撤回候选归架构§11.22。
 * [OUTPUT]: 任一实际来源聊天变化均取消活动； 人格反思准入汇集本人候选会话，宿主再核实际来源；记录多会话清理身份。
 * [INPUT]: Saved employee profiles, original Mastra clock and host execution/delivery hooks.
 * [OUTPUT]: Feature-driven heartbeat and scoped history deletion; payload cleanup preserves event/freshness/cadence guards.
 * [POS]: Employee behavior extension of automations; no timer loop or fake user messages.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { defaultAgentProfile, normalizeAgentProfile, primaryPersonalityRoom, deleteAgentBehaviorHistorySchema, clearAgentBehaviorHistorySchema, type AgentBehaviorHistoryCleanup, type AgentBehaviorDefinition, type AgentBehaviorRun, type AgentProfile, type AgentPersonalityState } from '../../../shared/domain/agent-profile'
import type { DigitalAgent, Conversation, Message } from '../../../shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'
import { BEHAVIOR_WORKFLOW, type NativeSchedules } from './native-schedules'
import { memoryStatus, memoryUseScope } from '../memory/memory-policy'
import { isCoreAgent } from '../../../shared/domain/core-agent'
import { PERSONALITY_HEARTBEAT, hasPersonalityActivity, personalityKinds, personalityBehavior, personalityDue, reflectionRooms } from './personality-policy'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const scheduleId = (agentId: string, behaviorId: string) => 'schedule_boai-behavior-' + digest([agentId, behaviorId]).slice(0, 32)
export class AgentBehaviorService {
  private active = new Map<string, { controller: AbortController; task: Promise<void>; agentId: string; conversationId: string }>()
  private closed = false
  private syncTail: Promise<void> = Promise.resolve()
  constructor(private readonly store: ProductStore, private readonly hooks: {
    available(agentId: string, conversationId: string): boolean
    execute(run: AgentBehaviorRun, behavior: AgentBehaviorDefinition, signal: AbortSignal): Promise<string>
    changed(): void
    error?(error: unknown): void
  }) {}
  get busy() { return this.active.size > 0 }
  hasActive(scope: { agentId?: string; conversationId?: string }) { return [...this.active.values()].some(item => scope.agentId === item.agentId || scope.conversationId === item.conversationId) }
  async init() {
    await this.store.transaction(async tx => {
      for (const run of await tx.list<AgentBehaviorRun>('agentBehaviorRuns')) if (run.status === 'running') {
        await tx.put({ collection: 'agentBehaviorRuns', id: run.id, value: { ...run, status: 'interrupted', finishedAt: new Date().toISOString(), error: '原进程已退出；原行为不自动重放' } })
      }
    })
  }
  private async profiles() {
    const agents = await this.store.load<DigitalAgent>('agents'), stored = await this.store.load<AgentProfile>('agentProfiles')
    return agents.map(agent => ({ agent, profile: normalizeAgentProfile(stored.find(item => item.agentId === agent.id) ?? defaultAgentProfile(agent.id, isCoreAgent(agent))) }))
  }
  async hasSchedules() { return (await this.profiles()).some(({ profile }) => hasPersonalityActivity(profile) || profile.behaviors.length > 0) }
  async synchronize(native: NativeSchedules) {
    const task = this.syncTail.then(async () => {
      const profiles = await this.profiles()
      const expected = new Set<string>()
      for (const { agent, profile } of profiles) {
        const id = scheduleId(agent.id, PERSONALITY_HEARTBEAT); expected.add(id)
        const enabled = agent.active && hasPersonalityActivity(profile)
        const inputData = { agentId: agent.id, behaviorId: PERSONALITY_HEARTBEAT, profileRevision: profile.revision, scheduleId: id }
        const old = await native.mastra.schedules.get(id), status = enabled ? 'active' as const : 'paused' as const
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone, cron = '*/30 * * * *'
        if (!old && enabled) await native.mastra.schedules.create({ id, workflowId: BEHAVIOR_WORKFLOW, cron, timezone, inputData, status })
        else if (old && (old.cron !== cron || old.timezone !== timezone || old.status !== status || JSON.stringify('inputData' in old ? old.inputData : null) !== JSON.stringify(inputData))) {
          await native.mastra.schedules.update(id, { cron, timezone, status, inputData })
        }
      }
      // Retire every manually created personality schedule, including schedules removed from old profiles.
      for (const old of await native.mastra.schedules.list({ workflowId: BEHAVIOR_WORKFLOW })) if (!expected.has(old.id)) await native.mastra.schedules.pause(old.id)
      for (const [id, entry] of this.active) {
        const run = await this.store.get<AgentBehaviorRun>('agentBehaviorRuns', id), profile = profiles.find(item => item.agent.id === run?.agentId)?.profile
        if (!run || !profile || profile.revision !== run.profileRevision) entry.controller.abort(new Error('人格配置已变化'))
      }
    })
    this.syncTail = task.catch(() => {})
    return task
  }
  async dispatch(input: { agentId: string; behaviorId: string; profileRevision: number; scheduleId: string }, eventId: string, at: number) {
    if (input.scheduleId !== scheduleId(input.agentId, input.behaviorId)) throw new Error('行为时钟身份不匹配')
    if (input.behaviorId !== PERSONALITY_HEARTBEAT) return // retired manual schedules cannot execute
    return this.run(input.agentId, input.behaviorId, eventId, at, input.profileRevision)
  }
  async run(agentId: string, behaviorId: string, eventId: string, at = Date.now(), expectedRevision?: number) {
    if (this.closed) throw new Error('行为服务正在退出')
    const id = digest([agentId, behaviorId, eventId])
    const admitted = await this.store.transaction(async tx => {
      const old = await tx.get<AgentBehaviorRun>('agentBehaviorRuns', id)
      if (old) return old.deletedAt || old.behaviorId === PERSONALITY_HEARTBEAT && !old.kind ? undefined : { run: old }
      const agent = await tx.get<DigitalAgent>('agents', agentId)
      if (!agent?.active) throw new Error('员工已停用或删除')
      const profile = normalizeAgentProfile(await tx.get<AgentProfile>('agentProfiles', agentId) ?? defaultAgentProfile(agentId, isCoreAgent(agent)))
      if (expectedRevision !== undefined && expectedRevision !== profile.revision) return
      if (Date.now() - at > 120_000 || at > Date.now() + 5000) return
      const skip = async (conversationId = '') => {
        // Quiet checks still consume the event. A replay must not act on a message arriving later.
        const timestamp = new Date().toISOString()
        const receipt: AgentBehaviorRun = { id, agentId, behaviorId: PERSONALITY_HEARTBEAT, profileRevision: profile.revision, conversationId, eventId, scheduledAt: new Date(at).toISOString(), status: 'skipped', startedAt: timestamp, finishedAt: timestamp }
        await tx.put({ collection: 'agentBehaviorRuns', id, value: receipt })
      }
      const rooms = await tx.list<Conversation>('conversations'), room = primaryPersonalityRoom(agentId, rooms)
      if (!room) return skip()
      const previous = (await tx.list<AgentBehaviorRun>('agentBehaviorRuns')).filter(item => item.agentId === agentId)
      if (previous.some(item => item.status === 'running') || !this.hooks.available(agentId, room.id)) return skip(room.id)
      const messages = (await tx.conversationRecords(profile.features.growth ? reflectionRooms(agentId, room, rooms).map(room => room.id) : [room.id])).filter(row => row.collection === 'messages').map(row => row.value as Message)
      const state = (await tx.list<AgentPersonalityState>('agentPersonalityStates')).find(item => item.agentId === agentId && !item.conversationId)
      const memories = profile.features.growth ? (await tx.list<import('../../../shared/domain').MemoryEntry>('memory')).filter(entry => entry.ownerAgentId === agentId) : []
      const reflectedDays = memories.filter(entry => entry.diary).map(entry => entry.diary!.date)
      const allowedRooms = new Set(reflectionRooms(agentId, room, rooms).map(item => item.id))
      // Admission candidates only: the host selects exact authorized bytes/parents again before any model call.
      const notes = memories.filter(entry => !entry.diary && memoryStatus(entry, at) === 'active' &&
        (memoryUseScope(entry) !== 'conversation' || entry.conversationId === room.id) &&
        (entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])).every(id => allowedRooms.has(id)))
      const ids = behaviorId === PERSONALITY_HEARTBEAT ? personalityKinds.map(kind => `builtin-${kind}`) : [behaviorId]
      const candidate = ids.flatMap(candidateId => {
        const behavior = personalityBehavior(profile, room, candidateId)
        const due = behavior && personalityDue(profile, behavior, messages, previous, state, at, reflectedDays, notes)
        return behavior && due ? [{ behavior, due }] : []
      })[0]
      if (!candidate) return skip(room.id)
      const { behavior, due } = candidate
      const run: AgentBehaviorRun = { id, agentId, behaviorId: behavior.id, kind: behavior.kind, ...due, profileRevision: profile.revision, conversationId: room.id, eventId, scheduledAt: new Date(at).toISOString(), status: 'running', startedAt: new Date().toISOString() }
      await tx.put({ collection: 'agentBehaviorRuns', id, value: run })
      return { run, behavior }
    })
    if (!admitted) return
    if (admitted.run.status === 'running' && admitted.behavior) {
      const controller = new AbortController()
      if (this.closed) controller.abort(new Error('应用退出'))
      const task = Promise.resolve().then(async () => {
        try {
          controller.signal.throwIfAborted()
          const result = await this.hooks.execute(admitted.run, admitted.behavior!, controller.signal)
          controller.signal.throwIfAborted()
          await this.finish(id, { status: result === 'skip' ? 'skipped' : 'completed', result })
        } catch (error) {
          await this.finish(id, { status: controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : '行为执行失败' })
        } finally { this.active.delete(id); this.hooks.changed() }
      })
      this.active.set(id, { controller, task, agentId, conversationId: admitted.run.conversationId }); void task.catch(error => this.hooks.error?.(error))
    }
    this.hooks.changed(); return admitted.run
  }
  private async finish(id: string, patch: Partial<AgentBehaviorRun>) {
    await this.store.transaction(async tx => {
      const current = await tx.get<AgentBehaviorRun>('agentBehaviorRuns', id)
      if (current?.status === 'running') await tx.put({ collection: 'agentBehaviorRuns', id, value: { ...current, ...patch, finishedAt: new Date().toISOString() } })
    })
  }
  async observe(id: string, patch: Pick<AgentBehaviorRun, 'promptEvidence' | 'usage' | 'sourceConversationIds'>) { await this.store.transaction(async tx => {
    const current = await tx.get<AgentBehaviorRun>('agentBehaviorRuns', id)
    if (current?.status === 'running') await tx.put({ collection: 'agentBehaviorRuns', id, value: { ...current, ...patch } })
  }) }
  async countModelCall(id: string) { await this.store.transaction(async tx => {
    const current = await tx.get<AgentBehaviorRun>('agentBehaviorRuns', id)
    if (current?.status === 'running') await tx.put({ collection: 'agentBehaviorRuns', id, value: { ...current, modelCalls: (current.modelCalls ?? 0) + 1 } })
  }) }
  async assertActive(runId: string) {
    const run = await this.store.get<AgentBehaviorRun>('agentBehaviorRuns', runId), active = this.active.get(runId)
    active?.controller.signal.throwIfAborted()
    if (!run || run.status !== 'running' || !active) throw new Error('行为运行授权已失效')
    const agent = await this.store.get<DigitalAgent>('agents', run.agentId)
    if (!agent?.active) throw new Error('员工已停用或删除')
    const profile = normalizeAgentProfile(await this.store.get<AgentProfile>('agentProfiles', run.agentId) ?? defaultAgentProfile(agent.id, isCoreAgent(agent)))
    const room = primaryPersonalityRoom(agent.id, await this.store.load<Conversation>('conversations'))
    const behavior = room && personalityBehavior(profile, room, run.behaviorId)
    if (profile.revision !== run.profileRevision || !behavior || room?.id !== run.conversationId) throw new Error('人格活动配置已失效')
    return { run, behavior }
  }

  async list(agentId: string) { return (await this.store.load<AgentBehaviorRun>('agentBehaviorRuns')).filter(item => item.agentId === agentId && !item.deletedAt && (item.kind || item.behaviorId !== PERSONALITY_HEARTBEAT)).sort((a,b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 100) }
  private assertDeletable(run: AgentBehaviorRun | undefined, agentId: string) {
    if (!run || run.agentId !== agentId || !run.kind && run.behaviorId === PERSONALITY_HEARTBEAT) throw new Error('活动记录不存在或不属于当前员工')
    if (run.status === 'running' || this.active.has(run.id)) throw new Error('活动仍在运行，请先停止后再删除')
    return run
  }
  async validateHistoryDeletion(raw: unknown) {
    const input = deleteAgentBehaviorHistorySchema.parse(raw)
    this.assertDeletable(await this.store.get<AgentBehaviorRun>('agentBehaviorRuns', input.runId), input.agentId)
  }
  private historyTombstone(run: AgentBehaviorRun): AgentBehaviorRun {
    // Keep deduplication and policy inputs, never results, prompts or model usage.
    const { result: _result, error: _error, promptEvidence: _prompt, usage: _usage, modelCalls: _calls, ...guard } = run
    return { ...guard, deletedAt: new Date().toISOString() }
  }
  async deleteHistory(raw: unknown): Promise<AgentBehaviorHistoryCleanup> {
    const input = deleteAgentBehaviorHistorySchema.parse(raw)
    const deletedCount = await this.store.transaction(async tx => {
      const run = this.assertDeletable(await tx.get<AgentBehaviorRun>('agentBehaviorRuns', input.runId), input.agentId)
      if (run.deletedAt) return 0
      await tx.put({ collection: 'agentBehaviorRuns', id: run.id, value: this.historyTombstone(run) })
      return 1
    })
    if (deletedCount) this.hooks.changed()
    return { agentId: input.agentId, deletedCount }
  }
  async clearHistory(raw: unknown): Promise<AgentBehaviorHistoryCleanup> {
    const input = clearAgentBehaviorHistorySchema.parse(raw), cutoff = Math.min(Date.parse(input.before), Date.now())
    const deletedCount = await this.store.transaction(async tx => {
      if (!await tx.get<DigitalAgent>('agents', input.agentId)) throw new Error('员工不存在')
      let count = 0
      for (const run of await tx.list<AgentBehaviorRun>('agentBehaviorRuns')) {
        if (run.agentId !== input.agentId || run.deletedAt || run.status === 'running' || this.active.has(run.id) || !run.kind && run.behaviorId === PERSONALITY_HEARTBEAT) continue
        // The confirmation freezes the cutoff. Newly completed activities remain visible.
        if (!(Date.parse(run.finishedAt ?? run.startedAt) <= cutoff)) continue
        await tx.put({ collection: 'agentBehaviorRuns', id: run.id, value: this.historyTombstone(run) }); count++
      }
      return count
    })
    if (deletedCount) this.hooks.changed()
    return { agentId: input.agentId, deletedCount }
  }
  async stop(id: string) { const active = this.active.get(id); active?.controller.abort(new Error('用户停止行为')); await active?.task }
  async cancelScope(scope: { agentId?: string; conversationId?: string }) {
    for (const run of await this.store.load<AgentBehaviorRun>('agentBehaviorRuns')) if (run.status === 'running' && (scope.agentId === run.agentId || scope.conversationId === run.conversationId || !!scope.conversationId && run.sourceConversationIds?.includes(scope.conversationId))) this.active.get(run.id)?.controller.abort(new Error('行为来源或配置已变化'))
  }
  async close() { this.closed = true; for (const active of this.active.values()) active.controller.abort(new Error('应用退出')); await Promise.allSettled([...this.active.values()].map(item => item.task)); await this.syncTail }
}
