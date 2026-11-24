/*
 * [OUTPUT]: 2026-11-24 公开官方指标的用量、缓存/推理和估算费用投影，未知价格不填零。
 * [INPUT]: 本机资料、稳定发送者身份与逐请求活动证据。
 * [OUTPUT]: 个人资料/活动 DTO、固定小牛默认头像（复用历史 fox ID）、旧文字头像兼容及按稳定本人身份显示当前配置名称，不改写历史记录。
 * [POS]: shared/domain 的本机个人资料合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentAvatar } from './avatars'
import type { Message, ModelUsage } from './index'

/** Official Mastra model-span metrics; costs are estimates, missing prices stay unknown. */
export interface ModelMetricCall {
  scope?: 'utility'
  costComplete?: boolean
  id: string; runId: string; conversationId: string; startedAt: string; phase: string; usage: ModelUsage
  provider?: string; model?: string; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number
  costs: { currency: string; amount: number }[]
}

export type UserAvatar = AgentAvatar | { kind: 'text' }
export interface LocalUserProfile {
  schemaVersion: 1; id: 'user'; revision: number; displayName: string; username: string | null; avatar: UserAvatar; updatedAt: string | null
}
export const defaultUserAvatar = { kind: 'preset', id: 'fox' } as const satisfies AgentAvatar
export const defaultUserProfile: LocalUserProfile = { schemaVersion: 1, id: 'user', revision: 0, displayName: '我', username: null, avatar: defaultUserAvatar, updatedAt: null }
export interface UserProfileInput { expectedRevision: number; displayName: string; username: string | null; avatar: UserAvatar }
export const isPersonalMessage = (message: Pick<Message, 'senderType' | 'senderId'>) => message.senderType === 'user' && message.senderId === 'user'
export const messageDisplayName = (message: Pick<Message, 'senderType' | 'senderId' | 'senderName'>, profile: Pick<LocalUserProfile, 'displayName'> = defaultUserProfile) => isPersonalMessage(message) ? profile.displayName : message.senderName
export function profileInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean)
  const graphemes = (value: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(item => item.segment)
  return words.length > 1 ? words.slice(0, 2).map(word => graphemes(word)[0]).join('').toLocaleUpperCase() : graphemes(words[0] ?? '我').slice(0, 2).join('')
}
export interface ProfileActivityQuery { from: string; to: string; timezone: string }
export interface ActivityDay { date: string; tokens: number | null; unknownCalls: number; calls: number }
export interface ProfileActivity {
  modelCosts?: { currency: string; amount: number }[]
  unpricedCalls?: number
  schemaVersion: 1; dataVersion: string; generatedAt: string; range: ProfileActivityQuery; scope: 'retained-local'
  totalTokens: number | null; peak: { date: string; tokens: number } | null; longestTaskMs: number | null
  currentStreak: number | null; longestStreak: number | null; days: ActivityDay[]
  unknownCalls: number; unrecordedRuns: number; incomplete: boolean; limitations: string[]
  chats: number; exploredSkills: number; skillActivations: number
  thinking: { level: string; count: number; samples: number } | null
  skills: { id: string; name: string; count: number; available: boolean }[]
}
