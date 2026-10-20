/*
 * [INPUT]: Persisted virtual journey and validated state action, host clock and source room.
 * [OUTPUT]: Atomic day/event/budget/mood/journal transitions and retained trip history.
 * [POS]: Pure travel state rules; virtual expenses never perform payments or alter work.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { z } from 'zod'
import type { AgentPersonalityState, AgentTravel, agentStateActionSchema } from '../../../shared/domain/agent-profile'

export const DEFAULT_TRAVEL_BUDGET = 1000
const date = (at: string) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function travelTransition(state: AgentPersonalityState, change: z.infer<typeof agentStateActionSchema>, timestamp: string, conversationId?: string): Pick<AgentPersonalityState, 'travel' | 'travelHistory'> {
  let travel = state.travel, history = state.travelHistory ?? []
  const archive = (trip: AgentTravel) => { history = [...history.filter(item => item.startedAt !== trip.startedAt), trip].slice(-50) }
  if (change.action === 'travel-start') {
    if (travel?.active) throw new Error('当前旅行尚未结束')
    if (travel) archive(travel)
    const budget = change.budget ?? DEFAULT_TRAVEL_BUDGET
    if (budget < 100) throw new Error('虚拟旅行预算至少需要 100')
    travel = { destination: change.destination, active: true, day: 1, startedAt: timestamp, budget, initialBudget: budget, mood: change.mood ?? 'curious', events: [], journals: [], ...(conversationId ? { conversationId } : {}) }
  } else if (change.action === 'travel-advance') {
    if (!travel?.active) throw new Error('尚未开始旅行')
    const budget = travel.budget ?? DEFAULT_TRAVEL_BUDGET, spend = change.spend ?? 0
    if (spend > budget) throw new Error('虚拟花费超过旅行剩余预算')
    const scope = conversationId ? { conversationId } : {}
    travel = { ...travel, initialBudget: travel.initialBudget ?? budget, budget: Math.round((budget - spend) * 100) / 100,
      day: Math.min(7, travel.day + 1), mood: change.mood ?? travel.mood ?? 'curious',
      events: [...travel.events, { at: timestamp, text: change.text, ...scope }].slice(-30),
      journals: [...(travel.journals ?? []), ...(change.journal ? [{ at: timestamp, date: date(timestamp), text: change.journal.text, sources: change.journal.sources, ...scope }] : [])].slice(-30) }
    if (change.returnHome || travel.day >= 7 || travel.budget! < 100) travel = { ...travel, active: false, returnedAt: timestamp }
  } else if (change.action === 'travel-mood') {
    if (!travel?.active) throw new Error('尚未开始旅行')
    travel = { ...travel, mood: change.mood }
  } else if (change.action === 'travel-return') {
    if (!travel?.active) throw new Error('没有进行中的旅行')
    travel = { ...travel, active: false, returnedAt: timestamp }
  }
  if (travel && !travel.active) archive(travel)
  return { travel, travelHistory: history }
}

export const tripUsesRoom = (trip: AgentTravel, room: string) => trip.conversationId === room || trip.events.some(item => item.conversationId === room) || !!trip.journals?.some(item => item.conversationId === room)
export function projectTravel(trip: AgentTravel, room: string): AgentTravel {
  return { ...trip, events: trip.events.filter(item => !item.conversationId || item.conversationId === room), journals: trip.journals?.filter(item => !item.conversationId || item.conversationId === room) }
}
