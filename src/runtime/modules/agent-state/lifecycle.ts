/*
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 来源聊天清空同时移除相关旅程和历史，防止游记残留。
 * [OUTPUT]: 清空任一日记来源会话时移除对应成长和活动正文/提示词证据。
 * [INPUT]: Original history/contact deletion transaction and authenticated scope.
 * [OUTPUT]: Removes derived state and behavior text; retains only occurrence deduplication.
 * [POS]: Agent profile/state extension of existing cleanup, not another deletion flow.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { RecordTransaction } from '../../adapters/storage/product-store'
import type { AgentProfile, AgentPersonalityState, AgentBehaviorRun, AgentEmotionHistory } from '../../../shared/domain/agent-profile'
import { tripUsesRoom } from './travel-state'

export async function clearAgentPersonality(tx: RecordTransaction, scope: { conversationId?: string; agentIds?: Set<string> }) {
  for (const event of await tx.list<AgentEmotionHistory>('agentEmotionHistory')) {
    if (scope.agentIds?.has(event.agentId) || scope.conversationId && (event.conversationId === scope.conversationId || event.sourceConversationIds.includes(scope.conversationId))) await tx.remove('agentEmotionHistory', event.id)
  }
  for (const state of await tx.list<AgentPersonalityState>('agentPersonalityStates')) {
    if (scope.agentIds?.has(state.agentId) || scope.conversationId && state.conversationId === scope.conversationId) await tx.remove('agentPersonalityStates', state.id)
    else if (scope.conversationId) {
      const room = scope.conversationId
      const traits = state.traits?.filter(item => item.sourceConversationId !== room && !item.sourceConversationIds?.includes(room))
      const travel = state.travel && !tripUsesRoom(state.travel, room) ? state.travel : undefined
      const travelHistory = state.travelHistory?.filter(trip => !tripUsesRoom(trip, room))
      if (traits?.length !== state.traits?.length || travel !== state.travel || travelHistory?.length !== state.travelHistory?.length) await tx.put({ collection: 'agentPersonalityStates', id: state.id, value: { ...state, traits, travel, travelHistory, revision: state.revision + 1 } })
    }
  }
  for (const event of await tx.list<{ id: string; agentId: string; conversationId: string }>('agentStateEvents')) {
    if (scope.agentIds?.has(event.agentId) || scope.conversationId === event.conversationId) await tx.remove('agentStateEvents', event.id)
  }
  for (const profile of await tx.list<AgentProfile>('agentProfiles')) {
    if (scope.agentIds?.has(profile.agentId)) await tx.remove('agentProfiles', profile.agentId)
    else if (scope.conversationId && profile.behaviors.some(item => item.conversationId === scope.conversationId)) await tx.put({ collection: 'agentProfiles', id: profile.agentId, value: { ...profile, revision: profile.revision + 1, updatedAt: new Date().toISOString(), behaviors: profile.behaviors.map(item => item.conversationId === scope.conversationId ? { ...item, enabled: false } : item) } })
  }
  for (const run of await tx.list<AgentBehaviorRun>('agentBehaviorRuns')) {
    if (scope.agentIds?.has(run.agentId)) await tx.remove('agentBehaviorRuns', run.id)
    else if (run.conversationId === scope.conversationId || scope.conversationId && run.sourceConversationIds?.includes(scope.conversationId)) {
      const { result: _result, error: _error, promptEvidence: _prompt, usage: _usage, ...minimal } = run
      await tx.put({ collection: 'agentBehaviorRuns', id: run.id, value: { ...minimal, status: 'cancelled', finishedAt: run.finishedAt ?? new Date().toISOString() } })
    }
  }
}
