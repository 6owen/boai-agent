/*
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 虚拟旅行新增预算/心情/日记/历史及宿主来源；旧状态可读，模型不能指定来源身份。
 * [OUTPUT]: 反思保存来源日期/多会话身份，成长保留完整来源会话；旧记录兼容。
 * [OUTPUT]: Fatigue carries sleep/wake timestamps; growth references authorized memory versions for continuity across chats.
 * [INPUT]: Employee configuration, bounded source modules and explicit behavior settings.
 * [OUTPUT]: Feature-driven activity, proactive preferences and scoped history cleanup; deleted receipts keep only replay guards.
 * [POS]: Employee extension of the original DigitalAgent, not a second identity or model registry.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import type { Conversation } from './index'

export const AGENT_SOURCE_MAX_BYTES = 64 * 1024
export const promptScenes = ['direct', 'group', 'channel', 'task', 'emotion', 'reflection', 'greeting', 'travel'] as const
export type PromptScene = typeof promptScenes[number]
export const promptSourceNames = ['AGENTS.md', 'SOUL.md', ...promptScenes.map(scene => `prompts/${scene}.md`)] as const
export const agentSourceNameSchema = z.enum(['AGENTS.md', 'SOUL.md', 'prompts/direct.md', 'prompts/group.md', 'prompts/channel.md', 'prompts/task.md', 'prompts/emotion.md', 'prompts/reflection.md', 'prompts/greeting.md', 'prompts/travel.md'])
export type AgentSourceName = z.infer<typeof agentSourceNameSchema>
export const isAgentSourceName = (name: string): name is AgentSourceName => agentSourceNameSchema.safeParse(name).success
const id = z.string().min(1).max(200)
const behaviorBase = {
  id: id.regex(/^[a-zA-Z0-9_-]+$/),
  kind: z.enum(['emotion', 'reflection', 'greeting', 'travel', 'follow-up']),
  enabled: z.boolean(),
  cron: z.string().min(1).max(120),
  timezone: z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, '无效时区'),
  conversationId: id,
  instruction: z.string().max(4000),
  cooldownMinutes: z.number().int().min(1).max(10080),
  applicationAccess: z.enum(['none', 'manage']).default('none'),
  maxModelCalls: z.number().int().min(1).max(16).default(4),
}
export const agentBehaviorSchema = z.object(behaviorBase).strict()
export type AgentBehaviorDefinition = z.infer<typeof agentBehaviorSchema>
export const proactiveSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  frequency: z.enum(['low', 'normal', 'high']).default('normal'),
  quietStart: z.number().int().min(0).max(23).default(22),
  quietEnd: z.number().int().min(0).max(23).default(8),
}).strict()
export type ProactiveSettings = z.infer<typeof proactiveSettingsSchema>
export const defaultProactiveSettings = (): ProactiveSettings => proactiveSettingsSchema.parse({})
export const agentProfileConfigSchema = z.object({
  preset: z.enum(['bobo-core', 'employee']),
  presetVersion: z.literal(1),
  disabledPrompts: z.array(z.enum(promptScenes)).max(8).refine(value => new Set(value).size === value.length),
  features: z.object({ emotions: z.boolean(), fatigue: z.boolean(), growth: z.boolean(), travel: z.boolean() }).strict(),
  proactive: proactiveSettingsSchema.default(defaultProactiveSettings),
  // Kept for lossless reads of old configuration; never scheduled or editable again.
  behaviors: z.array(agentBehaviorSchema).max(20).refine(value => new Set(value.map(item => item.id)).size === value.length, '行为ID不能重复').describe('旧版手工计划存档，只读并原样回传；新配置传空数组。后台活动由 features 和 proactive 管理。'),
}).strict()
export type AgentProfileConfig = z.infer<typeof agentProfileConfigSchema>
export interface AgentProfile extends AgentProfileConfig { agentId: string; revision: number; updatedAt: string }
export const saveAgentProfileSchema = z.object({ agentId: id, expectedRevision: z.number().int().nonnegative(), config: agentProfileConfigSchema }).strict()
export function defaultAgentProfile(agentId: string, core: boolean): AgentProfile {
  return { agentId, revision: 0, updatedAt: '', preset: core ? 'bobo-core' : 'employee', presetVersion: 1, disabledPrompts: [],
    features: { emotions: core, fatigue: core, growth: false, travel: false }, proactive: defaultProactiveSettings(), behaviors: [] }
}
export function normalizeAgentProfile(profile: AgentProfile): AgentProfile {
  return { ...profile, proactive: profile.proactive ?? defaultProactiveSettings() }
}
export interface PromptModuleEvidence { id: string; version: number; source: string; hash: string; sourceIds: string[]; characters: number; reason: string }
export interface AgentPromptEvidence { profileRevision: number; preset: string; scene: PromptScene; modules: PromptModuleEvidence[]; skipped: { id: string; reason: string }[]; staticHash: string; capabilityHash: string; stateRevision: number; stateHash: string }

export const emotionSchema = z.object({ mood: z.string().trim().min(1).max(40), valence: z.number().min(0).max(10), energy: z.number().min(0).max(10), reason: z.string().max(200) }).strict()
export interface AgentEmotion extends z.infer<typeof emotionSchema> { updatedAt: string }
/** Actual source-backed state changes, not an inferred continuous mood timeline. */
export interface AgentEmotionHistory {
  id: string; agentId: string; stateId: string; stateRevision: number
  conversationId?: string; sourceConversationIds: string[]
  sourceMessageIds: string[]; sourceMemories: { id: string; version: number }[]
  emotion: AgentEmotion
}
/** Virtual experiences, separate from factual employee memory and real payments. */
export interface AgentTravel {
  destination: string; day: number; active: boolean; startedAt: string; returnedAt?: string
  conversationId?: string
  sourceMessageIds?: string[]; sourceMemories?: { id: string; version: number }[]
  budget?: number; initialBudget?: number; mood?: string
  events: { at: string; text: string; conversationId?: string }[]
  journals?: { at: string; date: string; text: string; conversationId?: string; sources: string[] }[]
}
export interface AgentPersonalityState {
  id: string; agentId: string; conversationId?: string; revision: number; updatedAt: string
  emotion?: AgentEmotion
  fatigue?: { value: number; messageCount: number; updatedAt: string; sleeping: boolean; awake: boolean; sleepStartedAt?: string; wakeStartedAt?: string }
  travel?: AgentTravel
  travelHistory?: AgentTravel[]
  traits?: { id: string; text: string; createdAt: string; sourceConversationId: string; sourceConversationIds?: string[]; sourceMessageIds: string[]; sourceMemories?: { id: string; version: number }[]; memory?: { id: string; version: number } }[]
}
const travelMood = z.string().trim().min(1).max(100)
const travelBudget = z.number().min(0).max(100000)
export const travelJournalSchema = z.object({ text: z.string().trim().min(1).max(4000), sources: z.array(z.url().refine(url => /^https?:\/\//.test(url))).max(10).default([]) }).strict()
export const agentStateActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('emotion'), emotion: emotionSchema }).strict(),
  z.object({ action: z.enum(['sleep', 'wake', 'rest']) }).strict(),
  z.object({ action: z.literal('travel-start'), destination: z.string().trim().min(1).max(200), budget: travelBudget.optional(), mood: travelMood.optional() }).strict(),
  z.object({ action: z.literal('travel-advance'), text: z.string().trim().min(1).max(2000), spend: travelBudget.optional(), mood: travelMood.optional(), journal: travelJournalSchema.optional(), returnHome: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('travel-mood'), mood: travelMood }).strict(),
  z.object({ action: z.literal('travel-return') }).strict(),
  z.object({ action: z.literal('reset') }).strict(),
])
export const updateAgentStateSchema = z.object({ agentId: id, conversationId: id.optional(), expectedRevision: z.number().int().nonnegative(), change: agentStateActionSchema }).strict()
export interface AgentStateView { base: AgentPersonalityState; context?: AgentPersonalityState; effective: { mood: string; valence: number; energy: number; fatigue: number; sleeping: boolean; fatigueLevel?: 'awake' | 'tired' | 'sleepy' | 'sleeping' }; observedAt: string }
export interface AgentBehaviorRun {
  id: string; agentId: string; behaviorId: string; profileRevision: number; conversationId: string; eventId: string; scheduledAt: string
  status: 'running' | 'completed' | 'skipped' | 'failed' | 'interrupted' | 'cancelled'; startedAt: string; finishedAt?: string; result?: string; error?: string
  promptEvidence?: AgentPromptEvidence
  kind?: AgentBehaviorDefinition['kind']
  sourceMessageId?: string
  sourceMemoryId?: string
  periodKey?: string
  reflectionDay?: string
  sourceConversationIds?: string[]
  modelCalls?: number
  usage?: { inputTokens: number; outputTokens: number }
  /** Internal replay/cadence guard; deleted records are excluded from visible history. */
  deletedAt?: string
}
export const deleteAgentBehaviorHistorySchema = z.object({ agentId: id, runId: id }).strict()
export const clearAgentBehaviorHistorySchema = z.object({ agentId: id, before: z.iso.datetime() }).strict()
export interface AgentBehaviorHistoryCleanup { agentId: string; deletedCount: number }
export const agentBehaviorResultSchema = z.object({
  decision: z.enum(['skip', 'apply']),
  reason: z.string().max(500),
  message: z.string().max(4000).optional(),
  emotion: emotionSchema.optional(),
  reflection: z.string().max(4000).optional(),
  trait: z.string().max(300).optional(),
  travelEvent: z.string().max(2000).optional(),
  travelDestination: z.string().trim().min(1).max(200).optional(),
  travelReturn: z.boolean().optional(),
  travelMood: travelMood.optional(),
  travelSpend: travelBudget.optional(),
  travelJournal: travelJournalSchema.optional(),
  sourceMessageIds: z.array(id).max(30),
}).strict()
export type AgentBehaviorResult = z.infer<typeof agentBehaviorResultSchema>

/** Select the employee's main private chat; never redirect background activity into a group or task room. */
export function primaryPersonalityRoom(agentId: string, rooms: Conversation[]) {
  const owned = rooms.filter(room => room.kind === 'direct' && !room.channel && !room.mergedInto && (!room.purpose || room.purpose === 'personal') && room.agentIds.length === 1 && room.agentIds[0] === agentId)
  const main = owned.find(room => room.mainPrivate)
  if (main) return main.list?.hidden ? undefined : main
  const visible = owned.filter(room => !room.list?.hidden)
  if (visible.length === 1) return visible[0]
  if (visible.length > 1) return
  // Bobo has multiple core conversations rather than one mainPrivate room. Use only its latest ordinary private chat.
  return rooms.filter(room => room.kind === 'direct' && room.purpose === 'core' && !room.channel && !room.mergedInto && !room.list?.hidden && !room.automationCreation && !room.sourceCreation && room.agentIds.length === 1 && room.agentIds[0] === agentId).sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt))[0]
}
