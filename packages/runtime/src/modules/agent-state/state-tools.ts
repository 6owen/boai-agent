/*
 * [OUTPUT]: 自我状态按需读取旅行历史/日期游记；常规读写只返回短状态且宿主限定当前会话。
 * [INPUT]: Host-scoped employee state callbacks, never caller-selected employee identity.
 * [OUTPUT]: Common API/native self-state tools with expected-revision writes.
 * [POS]: Personality tools; do not grant application administration or create Work.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import { agentStateActionSchema, type AgentTravel, type AgentPersonalityState } from '@boai/shared/domain/agent-profile'
import type { EngineContext } from '../../contracts'
export const stateToolNames = ['agent_state', 'update_agent_state'] as const
export const stateToolInstructions = 'Your persisted emotion, fatigue and virtual journey are available through agent_state. When the conversation meaningfully changes your own mood, you may update_agent_state using the current revision. Scope context keeps the feeling in this chat; base affects your general state. Do not update on every greeting. State changes are not work completion or permanent factual memory. Disabled features must remain disabled.'
const readSchema = z.object({ travel: z.enum(['history', 'journal']).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict()
const tripSummary = (trip: AgentTravel) => { const { events: _events, journals: _journals, sourceMessageIds: _messages, sourceMemories: _memories, ...value } = trip; return value }
const compactState = (state: AgentPersonalityState) => ({ ...state, travelHistory: undefined, travel: state.travel ? { ...tripSummary(state.travel), events: state.travel.events.slice(-3) } : undefined })
export const selfStateUpdateSchema = z.object({ scope: z.enum(['base', 'context']), expectedRevision: z.number().int().nonnegative(), change: agentStateActionSchema }).strict()
export function createStateTools(context: EngineContext) {
  const access = context.personality
  if (!access) return []
  return [
    { name: 'agent_state', description: 'Read your own actual state and revisions. travel=history lists past virtual trips; travel=journal reads the current trip diary, optionally filtered by local YYYY-MM-DD date (with date, also checks past trips). Diaries are imagined experiences, not physical travel.', schema: readSchema, execute: async (input: unknown) => {
      const query = readSchema.parse(input), state = await access.read()
      if (query.travel === 'history') return { revision: state.base.revision, trips: (state.base.travelHistory ?? []).map(tripSummary) }
      if (query.travel === 'journal') {
        const trips = query.date ? [...(state.base.travelHistory ?? []), ...(state.base.travel ? [state.base.travel] : [])] : state.base.travel ? [state.base.travel] : []
        return { revision: state.base.revision, virtual: true, journals: [...new Map(trips.map(trip => [trip.startedAt, trip])).values()].flatMap(trip => (trip.journals ?? []).filter(entry => !query.date || entry.date === query.date).map(entry => ({ destination: trip.destination, ...entry }))).slice(-7) }
      }
      return { ...state, base: compactState(state.base) }
    } },
    { name: 'update_agent_state', description: 'Update only your own enabled role state, using the last observed revision. Context scope supports emotion/reset; fatigue/travel use base. No employee permission or factual memory is changed.', schema: selfStateUpdateSchema, execute: async (input: unknown) => compactState(await access.update(selfStateUpdateSchema.parse(input))) },
  ]
}
