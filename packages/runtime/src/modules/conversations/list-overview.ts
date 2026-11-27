/*
 * [INPUT]: One snapshot of resident conversations, messages, runs and turns, plus authoritative channel rows.
 * [OUTPUT]: List timestamps, completed previews and activity, preserving channel and historical ordering rules.
 * [POS]: Conversation list read model. All derived state lives only for the current request.
 * [PROTOCOL]: Update this header and the conversations directory map when changing the snapshot contract.
 */
import type { AgentRun, Conversation, DiscussionTurn, Message } from '@boai/shared/domain'

type MessageHeads = { latest?: Message; completed?: Message }

function includeMessage(heads: MessageHeads, message: Message) {
  // Equal sequence numbers preserve the original stable sort's last entry.
  if (!heads.latest || message.sequence >= heads.latest.sequence) heads.latest = message
  if (message.status === 'completed' && (!heads.completed || message.sequence >= heads.completed.sequence)) heads.completed = message
}

function messageHeads(messages: Iterable<Message>) {
  const result = new Map<string, MessageHeads>()
  for (const message of messages) {
    let heads = result.get(message.conversationId)
    if (!heads) { heads = {}; result.set(message.conversationId, heads) }
    includeMessage(heads, message)
  }
  return result
}

export function conversationMessageTimes(messages: Iterable<Message>): Record<string, string> {
  return Object.fromEntries(Array.from(messageHeads(messages), ([id, heads]) => [id, heads.latest!.createdAt]))
}

type TimedStatus = { status: string; createdAt: string }
type Activity = { run?: TimedStatus; turn?: TimedStatus; waiting?: boolean; running?: boolean; queued?: boolean }

function activities(runs: Iterable<AgentRun>, turns: Iterable<DiscussionTurn>) {
  const states = new Map<string, Activity>()
  function add(item: AgentRun | DiscussionTurn, kind: 'run' | 'turn') {
    let state = states.get(item.conversationId)
    if (!state) { state = {}; states.set(item.conversationId, state) }
    if (item.status === 'queued') state.queued = true
    if (kind === 'run') {
      if (item.status === 'waiting_approval') state.waiting = true
      if (item.status === 'running') state.running = true
    }
    const latest = state[kind]
    if (!latest || item.createdAt.localeCompare(latest.createdAt) >= 0) state[kind] = item
  }
  for (const run of runs) add(run, 'run')
  for (const turn of turns) add(turn, 'turn')
  return states
}

function activity(state?: Activity): Conversation['activity'] {
  if (state?.waiting) return 'waiting_approval'
  if (state?.running) return 'running'
  if (state?.queued) return 'queued'
  if (state?.run?.status === 'failed' || state?.turn?.status === 'failed') return 'failed'
  return 'idle'
}

export function conversationOverviews(input: {
  rooms: Conversation[]; messages: Iterable<Message>; runs: Iterable<AgentRun>; turns: Iterable<DiscussionTurn>
  channelMessages: ReadonlyMap<string, Message[]>; channelUnread: ReadonlyMap<string, number>
}): Conversation[] {
  const heads = messageHeads(input.messages)
  const states = activities(input.runs, input.turns)
  // Channel histories may be evicted from memory. Even an empty database page takes precedence.
  for (const [id, recent] of input.channelMessages) {
    const persisted: MessageHeads = {}
    for (const message of recent) includeMessage(persisted, message)
    heads.set(id, persisted)
  }
  return input.rooms.map(room => {
    const messages = heads.get(room.id)
    return {
      ...room,
      ...(input.channelMessages.has(room.id) ? { channelUnreadCount: input.channelUnread.get(room.id) ?? 0 } : {}),
      activity: activity(states.get(room.id)),
      lastMessageAt: messages?.latest?.createdAt,
      lastMessagePreview: messages?.completed?.content.slice(0, 120) ?? '',
    }
  }).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || b.createdAt.localeCompare(a.createdAt))
}
