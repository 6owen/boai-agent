/*
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 旅行日进度、预算/日记/返程同次保存；历史按会话投影，忘记/失效来源不再返回。
 * [OUTPUT]: 有记忆版本背书的成长可引用多会话；旧无背书来源仍限定原聊天。
 * [INPUT]: Original employee/message records, explicit CAS state changes and a clock value.
 * [OUTPUT]: Persistent emotion/fatigue/travel; growth follows actual memory authorization and the local-day limit, legacy traits remain scoped.
 * [POS]: State in ProductStore; state revisions never mutate employee configVersion.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { updateAgentStateSchema, type AgentEmotion, type AgentPersonalityState, type AgentStateView, type AgentTravel } from '../../../shared/domain/agent-profile'
import type { Conversation, DigitalAgent, Message, MemoryEntry, MemoryView } from '../../../shared/domain'
import type { MemoryForget } from '../../../shared/domain/memory'
import { memoryStatus } from '../memory/memory-policy'
import { validRecallProjection } from '../memory/memory-recall'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { projectTravel, travelTransition } from './travel-state'

const collection = 'agentPersonalityStates'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key = (agentId: string, conversationId?: string) => digest([agentId, conversationId ?? null])
const empty = (agentId: string, conversationId?: string): AgentPersonalityState => ({ id: key(agentId, conversationId), agentId, ...(conversationId ? { conversationId } : {}), revision: 0, updatedAt: '' })
const elapsed = (at: number, from: string) => Math.max(0, at - Date.parse(from)) || 0
const localDay = (at: number | string) => { const date = new Date(at); return [date.getFullYear(), date.getMonth(), date.getDate()].join('-') }
function decay(emotion: AgentEmotion | undefined, hours: number, at: number) {
  if (!emotion) return { mood: 'cheerful', valence: 7, energy: 7 }
  const weight = Math.max(0, 1 - elapsed(at, emotion.updatedAt) / (hours * 3600_000))
  return { mood: weight ? emotion.mood : 'cheerful', valence: 6 + (emotion.valence - 6) * weight, energy: emotion.energy }
}
function recoveredFatigue(fatigue: AgentPersonalityState['fatigue'], at: number) {
  const hour = new Date(at).getHours(), sleepStartedAt = fatigue?.sleepStartedAt ?? (fatigue?.sleeping ? fatigue.updatedAt : undefined)
  const wakeStartedAt = fatigue?.wakeStartedAt ?? (fatigue?.awake ? fatigue.updatedAt : undefined)
  const autoWake = !!(fatigue?.sleeping && sleepStartedAt && hour >= 8 && hour < 22 && elapsed(at, sleepStartedAt) >= 2 * 3600_000)
  return {
    value: Math.max(0, (fatigue?.value ?? 0) - (fatigue ? elapsed(at, fatigue.updatedAt) / 60_000 * .8 : 0) - (autoWake ? 40 : 0)),
    sleeping: !!fatigue?.sleeping && !autoWake,
    awake: !!(fatigue?.awake && wakeStartedAt && elapsed(at, wakeStartedAt) < 2 * 3600_000),
    sleepStartedAt: autoWake ? undefined : sleepStartedAt, wakeStartedAt,
  }
}
export function effectiveAgentState(base: AgentPersonalityState, context: AgentPersonalityState | undefined, at: number): AgentStateView['effective'] {
  const global = decay(base.emotion, 6, at), local = context?.emotion ? decay(context.emotion, 2, at) : undefined
  const recovered = recoveredFatigue(base.fatigue, at)
  const hour = new Date(at).getHours(), deepNight = hour >= 1 && hour < 6
  const timeBoost = deepNight ? 30 : hour >= 23 || hour < 8 ? 15 : hour >= 13 && hour < 15 ? 8 : 0
  const fatigue = Math.min(100, Math.round(recovered.value + timeBoost))
  const fatigueLevel = recovered.sleeping ? 'sleeping' : recovered.awake && !deepNight ? 'awake' : fatigue >= 75 ? 'sleeping' : fatigue >= 50 ? 'sleepy' : fatigue >= 30 ? 'tired' : 'awake'
  return { mood: local?.mood ?? global.mood, valence: Math.round((local ? global.valence * .3 + local.valence * .7 : global.valence) * 10) / 10,
    energy: global.energy, fatigue, sleeping: fatigueLevel === 'sleeping', fatigueLevel }
}

export class AgentStateService {
  constructor(private readonly store: ProductStore) {}
  /** Internal input only: the reflection selector must apply current memory/source policy. */
  async emotionHistory(agentId: string) {
    return (await this.store.load<import('../../../shared/domain/agent-profile').AgentEmotionHistory>('agentEmotionHistory')).filter(item => item.agentId === agentId)
  }
  private async validTravel(tx: RecordTransaction, agentId: string, trip: AgentTravel) {
    const forgotten = (await tx.list<MemoryForget>('memoryForgets')).filter(item => item.ownerAgentId === agentId)
    if (forgotten.some(item => item.sourceMessageIds.some(id => trip.sourceMessageIds?.includes(id)) || item.sourceMemoryIds.some(id => trip.sourceMemories?.some(source => source.id === id)))) return false
    for (const id of trip.sourceMessageIds ?? []) {
      const message = await tx.get<Message>('messages', id)
      if (!message || !(await tx.get<Conversation>('conversations', message.conversationId))?.agentIds.includes(agentId)) return false
    }
    for (const source of trip.sourceMemories ?? []) {
      const memory = await tx.get<MemoryEntry>('memory', source.id)
      if (!memory || memory.ownerAgentId !== agentId || memory.version !== source.version || memoryStatus(memory) !== 'active') return false
    }
    return true
  }
  private async filterTravel(tx: RecordTransaction, state: AgentPersonalityState) {
    if (state.travel && !await this.validTravel(tx, state.agentId, state.travel)) state.travel = undefined
    if (state.travelHistory) {
      const valid: AgentTravel[] = []
      for (const trip of state.travelHistory) if (await this.validTravel(tx, state.agentId, trip)) valid.push(trip)
      state.travelHistory = valid
    }
  }
  private async assertScope(tx: RecordTransaction, agentId: string, conversationId?: string) {
    if (!await tx.get<DigitalAgent>('agents', agentId)) throw new Error('员工不存在')
    if (conversationId) {
      const room = await tx.get<Conversation>('conversations', conversationId)
      if (!room?.agentIds.includes(agentId)) throw new Error('员工不属于该会话')
    }
  }
  /** IDs are hints for the memory policy, never permission to read their contents. */
  async growthMemoryIds(agentId: string) {
    const state = await this.store.get<AgentPersonalityState>(collection, key(agentId))
    return state?.traits?.flatMap(trait => trait.memory ? [trait.memory.id] : []) ?? []
  }
  async view(agentId: string, conversationId?: string, at = Date.now(), recall?: MemoryView): Promise<AgentStateView> {
    return this.store.transaction(async tx => {
      await this.assertScope(tx, agentId, conversationId)
      const base = await tx.get<AgentPersonalityState>(collection, key(agentId)) ?? empty(agentId)
      await this.filterTravel(tx, base)
      if (conversationId) {
        if (base.travel) base.travel = projectTravel(base.travel, conversationId)
        base.travelHistory = base.travelHistory?.filter(trip => !trip.conversationId || trip.conversationId === conversationId).map(trip => projectTravel(trip, conversationId))
      }
      const context = conversationId ? await tx.get<AgentPersonalityState>(collection, key(agentId, conversationId)) ?? empty(agentId, conversationId) : undefined
      // New growth follows the exact recalled memory version; legacy growth stays in its original chat.
      if (base.traits) {
        const forgotten = (await tx.list<MemoryForget>('memoryForgets')).filter(item => item.ownerAgentId === agentId)
        const valid = []
        for (const item of base.traits) {
          if (!item.sourceMessageIds.length && !item.memory) continue
          if (item.memory) {
            const row = await tx.get<MemoryEntry>('memory', item.memory.id)
            if (!row || row.ownerAgentId !== agentId || row.version !== item.memory.version || memoryStatus(row, at) !== 'active' || !item.sourceMessageIds.length && !row.sourceMemoryIds?.length) continue
            if (recall) {
              if (!conversationId || !validRecallProjection(recall, agentId, conversationId) || !recall.entries.some(entry => entry.id === item.memory!.id && entry.version === item.memory!.version)) continue
            } else if (item.sourceConversationId !== conversationId) continue
          } else if (item.sourceConversationId !== conversationId) continue
          if (forgotten.some(row => row.sourceMessageIds.some(id => item.sourceMessageIds.includes(id)) || row.sourceMemoryIds.some(id => item.sourceMemories?.some(parent => parent.id === id)))) continue
          const sourceRooms = new Set([item.sourceConversationId, ...item.sourceConversationIds ?? []])
          if ((await Promise.all(item.sourceMessageIds.map(async id => { const message = await tx.get<Message>('messages', id); return !!message && sourceRooms.has(message.conversationId) && message.status === 'completed' && !!(await tx.get<Conversation>('conversations', message.conversationId))?.agentIds.includes(agentId) }))).some(valid => !valid)) continue
          if ((await Promise.all((item.sourceMemories ?? []).map(async parent => { const row = await tx.get<MemoryEntry>('memory', parent.id); return !!row && row.ownerAgentId === agentId && row.version === parent.version && memoryStatus(row) === 'active' }))).some(valid => !valid)) continue
          valid.push(item)
        }
        base.traits = valid
      }
      return { base, context, effective: effectiveAgentState(base, context, at), observedAt: new Date(at).toISOString() }
    })
  }
  async update(raw: unknown, at = Date.now(), originConversationId?: string, sources?: Pick<AgentTravel, 'sourceMessageIds' | 'sourceMemories'>) {
    const input = updateAgentStateSchema.parse(raw), timestamp = new Date(at).toISOString()
    return this.store.transaction(async tx => {
      await this.assertScope(tx, input.agentId, input.conversationId)
      const current = await tx.get<AgentPersonalityState>(collection, key(input.agentId, input.conversationId)) ?? empty(input.agentId, input.conversationId)
      if (current.revision !== input.expectedRevision) throw new Error('员工状态已变化，请读取当前版本后保存')
      await this.filterTravel(tx, current)
      const change = input.change
      if (input.conversationId && !['emotion', 'reset'].includes(change.action)) throw new Error('疲劳和旅行属于员工全局状态')
      let next = { ...current, revision: current.revision + 1, updatedAt: timestamp }
      if (change.action === 'reset') next = { ...empty(input.agentId, input.conversationId), revision: next.revision, updatedAt: timestamp }
      else if (change.action === 'emotion') next.emotion = { ...change.emotion, updatedAt: timestamp }
      else if (change.action === 'sleep' || change.action === 'wake' || change.action === 'rest') {
        const fatigue = current.fatigue, { value } = recoveredFatigue(fatigue, at)
        next.fatigue = { value: change.action === 'rest' ? 0 : change.action === 'wake' ? Math.max(0, value - 30) : value,
          messageCount: change.action === 'rest' ? 0 : fatigue?.messageCount ?? 0, updatedAt: timestamp, sleeping: change.action === 'sleep', awake: change.action === 'wake',
          ...(change.action === 'sleep' ? { sleepStartedAt: timestamp } : change.action === 'wake' ? { wakeStartedAt: timestamp } : {}) }
      } else if (change.action.startsWith('travel-')) next = { ...next, ...travelTransition(current, change, timestamp, originConversationId) }
      if (change.action.startsWith('travel-') && next.travel && sources) {
        next.travel.sourceMessageIds = [...new Set([...(next.travel.sourceMessageIds ?? []), ...(sources.sourceMessageIds ?? [])])]
        next.travel.sourceMemories = [...new Map([...(next.travel.sourceMemories ?? []), ...(sources.sourceMemories ?? [])].map(item => [item.id, item])).values()]
        if (!await this.validTravel(tx, input.agentId, next.travel)) throw new Error('旅行来源已失效')
        if (!next.travel.active) next.travelHistory = next.travelHistory?.map(trip => trip.startedAt === next.travel!.startedAt ? next.travel! : trip)
      }
      await tx.put({ collection, id: next.id, value: next })
      if (change.action === 'emotion' && (sources?.sourceMessageIds?.length || sources?.sourceMemories?.length)) {
        const sourceMessageIds = [...new Set(sources.sourceMessageIds ?? [])], sourceConversationIds = new Set<string>()
        for (const id of sourceMessageIds) {
          const message = await tx.get<Message>('messages', id)
          if (!message || message.status !== 'completed' || !(await tx.get<Conversation>('conversations', message.conversationId))?.agentIds.includes(input.agentId)) throw new Error('情绪来源已失效')
          sourceConversationIds.add(message.conversationId)
        }
        const sourceMemories = [...new Map((sources.sourceMemories ?? []).map(parent => [parent.id, parent])).values()]
        if ((await tx.list<MemoryForget>('memoryForgets')).some(item => item.ownerAgentId === input.agentId && (item.sourceMessageIds.some(id => sourceMessageIds.includes(id)) || item.sourceMemoryIds.some(id => sourceMemories.some(parent => parent.id === id))))) throw new Error('情绪来源已被忘记')
        for (const parent of sourceMemories) {
          const entry = await tx.get<MemoryEntry>('memory', parent.id)
          if (!entry || entry.ownerAgentId !== input.agentId || entry.version !== parent.version || memoryStatus(entry, at) !== 'active') throw new Error('情绪使用的记忆已失效')
          for (const id of entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])) sourceConversationIds.add(id)
        }
        const event: import('../../../shared/domain/agent-profile').AgentEmotionHistory = { id: digest([next.id, next.revision]), agentId: input.agentId,
          stateId: next.id, stateRevision: next.revision, conversationId: input.conversationId, sourceConversationIds: [...sourceConversationIds],
          sourceMessageIds, sourceMemories, emotion: next.emotion! }
        await tx.put({ collection: 'agentEmotionHistory', id: event.id, value: event })
      }
      return next
    })
  }
  async recordMessage(agentId: string, conversationId: string, messageId: string, at = Date.now()) {
    return this.store.transaction(async tx => {
      await this.assertScope(tx, agentId, conversationId)
      const message = await tx.get<Message>('messages', messageId)
      if (!message || message.conversationId !== conversationId || message.status !== 'completed') return
      const eventId = digest([agentId, messageId])
      if (await tx.get('agentStateEvents', eventId)) return
      const state = await tx.get<AgentPersonalityState>(collection, key(agentId)) ?? empty(agentId)
      const fatigue = state.fatigue, recovered = recoveredFatigue(fatigue, at)
      state.fatigue = { ...recovered, value: Math.min(100, recovered.value + 1.5), messageCount: (fatigue?.messageCount ?? 0) + 1, updatedAt: new Date(at).toISOString() }
      state.revision++; state.updatedAt = new Date(at).toISOString()
      await tx.put({ collection, id: state.id, value: state })
      await tx.put({ collection: 'agentStateEvents', id: eventId, value: { id: eventId, agentId, conversationId, messageId } })
    })
  }
  async addTrait(agentId: string, conversationId: string, messageIds: string[], text: string, at = Date.now(), sourceMemories: { id: string; version: number }[] = [], memory?: { id: string; version: number }) {
    return this.store.transaction(async tx => {
      await this.assertScope(tx, agentId, conversationId)
      if (!messageIds.length && !memory || !text.trim() || text.length > 300) throw new Error('成长条目需要真实来源和一句简短描述')
      for (const id of messageIds) { const message = await tx.get<Message>('messages', id); if (!message || !memory && message.conversationId !== conversationId || message.status !== 'completed' || !(await tx.get<Conversation>('conversations', message.conversationId))?.agentIds.includes(agentId)) throw new Error('成长来源已失效') }
      let sourceConversationIds: string[] | undefined
      if (memory) {
        const row = await tx.get<MemoryEntry>('memory', memory.id)
        if (!row || row.ownerAgentId !== agentId || row.version !== memory.version || memoryStatus(row, at) !== 'active' || row.conversationId !== conversationId || !messageIds.length && !row.sourceMemoryIds?.length || messageIds.some(id => !row.sourceMessageIds.includes(id))) throw new Error('成长记忆来源已失效')
        sourceConversationIds = row.sourceConversationIds
      }
      for (const parent of sourceMemories) { const row = await tx.get<MemoryEntry>('memory', parent.id); if (!row || row.ownerAgentId !== agentId || row.version !== parent.version || memoryStatus(row) !== 'active') throw new Error('成长记忆来源已失效') }
      if ((await tx.list<MemoryForget>('memoryForgets')).some(row => row.ownerAgentId === agentId && (row.sourceMessageIds.some(id => messageIds.includes(id)) || row.sourceMemoryIds.some(id => sourceMemories.some(parent => parent.id === id))))) throw new Error('成长来源已被忘记')
      const state = await tx.get<AgentPersonalityState>(collection, key(agentId)) ?? empty(agentId)
      const timestamp = new Date(at).toISOString(), day = localDay(at)
      if (state.traits?.some(item => localDay(item.createdAt) === day || item.text === text.trim())) return
      state.traits = [...(state.traits ?? []), { id: digest([agentId, conversationId, messageIds, text]), text: text.trim(), createdAt: timestamp, sourceConversationId: conversationId, sourceConversationIds, sourceMessageIds: messageIds, sourceMemories, ...(memory ? { memory } : {}) }].slice(-15)
      state.revision++; state.updatedAt = timestamp
      await tx.put({ collection, id: state.id, value: state })
    })
  }
}
