/*
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 旅行按员工/来源日去重，返程两周后可重新考虑；不混入员工自动化。
 * [OUTPUT]: 员工全日反思以实际来源日期去重；旧来源/失败/换主聊天不重放。
 * [OUTPUT]: 每次心跳选择最近一个尚未处理的来源日，继续补较早漏日；已有日记和失败日期均不重放。
 * [INPUT]: Feature switches, primary private chat, actual messages/state and previous activity receipts.
 * [OUTPUT]: Built-in background cadence; reflection writes a private diary independently of rare personality growth.
 * [POS]: Pure personality policy for the shared Mastra heartbeat; not employee business automation.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { Conversation, MemoryEntry, Message } from '../../../shared/domain'
import { normalizeAgentProfile, type AgentProfile, type AgentBehaviorDefinition, type AgentBehaviorRun, type AgentPersonalityState } from '../../../shared/domain/agent-profile'

export const PERSONALITY_HEARTBEAT = 'personality-heartbeat'
export const personalityKinds = ['reflection', 'travel', 'emotion', 'greeting'] as const
export const hasPersonalityActivity = (profile: AgentProfile) => profile.features.emotions || profile.features.growth || profile.features.travel || normalizeAgentProfile(profile).proactive.enabled
export const personalityDate = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const localDay = personalityDate
const normalizeDay = (value?: string) => { const parts = value?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return parts ? `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}` : undefined }
/** Admission only. Actual message/material/memory authority is checked by the host before reading. */
export function reflectionRooms(agentId: string, target: Conversation, rooms: Conversation[]) {
  return rooms.filter(room => room.agentIds.includes(agentId) && !room.mergedInto && !room.list?.hidden &&
    (room.id === target.id || room.memoryScope !== 'conversation' && !room.channel && !room.channelDiscussion && (!room.memoryContextRef || room.memoryContextRef.kind === target.memoryContextRef?.kind && room.memoryContextRef.id === target.memoryContextRef.id)))
}
export function quietTime(profile: AgentProfile, at: number) {
  const { quietStart: start, quietEnd: end } = normalizeAgentProfile(profile).proactive, hour = new Date(at).getHours()
  return start !== end && (start < end ? hour >= start && hour < end : hour >= start || hour < end)
}
export function personalityBehavior(profile: AgentProfile, room: Conversation, id: string): AgentBehaviorDefinition | undefined {
  const kind = personalityKinds.find(value => id === `builtin-${value}`)
  if (!kind || !(kind === 'emotion' ? profile.features.emotions : kind === 'reflection' ? profile.features.growth : kind === 'travel' ? profile.features.travel : normalizeAgentProfile(profile).proactive.enabled)) return
  const instruction = {
    emotion: '根据最近真实对话更新自己的心情，只返回 emotion；没有变化就 skip。不要发送消息。',
    reflection: '按反思规则回顾尚未反思的真实交流，在 reflection 写私人日记；日记不要求产生性格变化。有新的细微性格变化才返回 trait，有心情变化可返回 emotion。有聊天来源时引用真实 sourceMessageIds；只有宿主提供的笔记时可为空，宿主会保留笔记来源。没有新经历才 skip。不发送聊天消息。',
    travel: '按旅行规则与当前状态决定出发、探索或返程。已有旅程时可用本次实际提供的只读检索工具查真实地点，再返回 travelEvent、travelJournal、travelMood、travelSpend；返程可同次保存最后一天。没有检索工具就明确未核实，不伪造搜索和新鲜事实。所有体验为虚拟，不发送聊天消息。',
    greeting: '根据最近真实交流判断现在是否值得主动联系。只在有具体话题或真实约定时返回 message；没有合适内容就 skip，不机械问好，不虚构用户需求或另行创建任务。',
  }[kind]
  return { id, kind, enabled: true, cron: '*/30 * * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, conversationId: room.id, instruction, cooldownMinutes: kind === 'greeting' ? ({ low: 720, normal: 240, high: 120 }[normalizeAgentProfile(profile).proactive.frequency]) : 30, applicationAccess: 'none', maxModelCalls: 4 }
}
export function personalityDue(profile: AgentProfile, behavior: AgentBehaviorDefinition, messages: Message[], runs: AgentBehaviorRun[], state: AgentPersonalityState | undefined, at: number, reflectedDays: readonly string[] = [], notes: readonly MemoryEntry[] = []): { sourceMessageId?: string; sourceMemoryId?: string; periodKey?: string; reflectionDay?: string } | undefined {
  const completed = messages.filter(message => (behavior.kind === 'reflection' || message.conversationId === behavior.conversationId) && message.status === 'completed').sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  if (behavior.kind === 'reflection') {
    const hour = new Date(at).getHours(), today = localDay(at)
    if (hour < 10) return
    const eligible = completed.filter(message => Number.isFinite(Date.parse(message.createdAt)) && (hour >= 23 ? localDay(Date.parse(message.createdAt)) <= today : localDay(Date.parse(message.createdAt)) < today))
    const relevant = runs.filter(run => run.kind === 'reflection' || run.behaviorId === 'builtin-reflection')
    const consumed = new Set(reflectedDays)
    // One employee diary per actual source day, including failed/interrupted attempts. Legacy guards remain consumed.
    for (const run of relevant) {
      const legacySource = !run.reflectionDay && completed.find(message => message.id === run.sourceMessageId)
      const day = run.reflectionDay ?? (legacySource ? localDay(Date.parse(legacySource.createdAt)) : normalizeDay(run.periodKey))
      if (day) consumed.add(day)
    }
    const sources = [
      ...eligible.filter(message => !relevant.some(run => run.sourceMessageId === message.id)).map(message => ({ at: message.createdAt, sourceMessageId: message.id })),
      ...notes.filter(note => !note.diary && Number.isFinite(Date.parse(note.createdAt)) && (hour >= 23 ? localDay(Date.parse(note.createdAt)) <= today : localDay(Date.parse(note.createdAt)) < today)).map(note => ({ at: note.createdAt, sourceMemoryId: note.id })),
    ].sort((a, b) => b.at.localeCompare(a.at))
    const last = sources.find(source => !consumed.has(localDay(Date.parse(source.at))))
    if (!last) return
    const reflectionDay = localDay(Date.parse(last.at)), { at: _at, ...source } = last
    return { ...source, periodKey: reflectionDay, reflectionDay }
  }
  const lastUser = completed.filter(message => message.senderType === 'user').at(-1)
  if (!lastUser || !Number.isFinite(Date.parse(lastUser.createdAt))) return
  const relevant = runs.filter(run => run.behaviorId === behavior.id && (behavior.kind === 'travel' || run.conversationId === behavior.conversationId))
  // An attempted decision consumes its input/day, including failed or interrupted outcomes. Never replay on restart.
  if (behavior.kind === 'emotion' && relevant.some(run => run.sourceMessageId === lastUser.id)) return
  const hour = new Date(at).getHours(), day = localDay(at)
  let periodKey: string | undefined
  if (behavior.kind === 'travel') {
    if (hour < 10) return
    if (!state?.travel?.active && relevant.some(run => run.sourceMessageId === lastUser.id) && (!state?.travel?.returnedAt || at - Date.parse(state.travel.returnedAt) < 14 * 24 * 3600_000)) return
    if (state?.travel?.active && localDay(Date.parse(state.travel.startedAt)) === day && !state.travel.events.length) return
    const lastEvent = state?.travel?.events.at(-1)
    if (lastEvent && localDay(Date.parse(lastEvent.at)) === day) return
    periodKey = day
  }
  if (periodKey && relevant.some(run => normalizeDay(run.periodKey) === periodKey)) return
  if (behavior.kind === 'greeting') {
    if (quietTime(profile, at) || profile.features.fatigue && state?.fatigue?.sleeping) return
    if (relevant.some(run => run.status === 'completed' && run.sourceMessageId === lastUser.id)) return
    const last = completed.at(-1)!
    const idleSince = Date.parse(last.createdAt)
    if (!Number.isFinite(idleSince) || at - idleSince < behavior.cooldownMinutes * 60_000) return
    if (relevant.some(run => at - Date.parse(run.startedAt) < behavior.cooldownMinutes * 60_000)) return
  }
  return { sourceMessageId: lastUser.id, ...(periodKey ? { periodKey } : {}) }
}
