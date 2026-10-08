/*
 * [INPUT]: 会话详情、消息和运行领域类型。
 * [OUTPUT]: 按轮次整理活动，并按原用户消息身份投影已持久化中断；不推断执行/交付，不生成消息或续跑。
 * [POS]: src/renderer/pages/conversations/activity.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentRun, ConversationDetail, DiscussionTurn, Message } from '@shared/domain'

export interface ActivityRound {
  id: string
  createdAt: string
  trigger?: Message
  turn?: DiscussionTurn
  runs: AgentRun[]
}

export function byCreatedAt<T extends { createdAt: string; id: string }>(a: T, b: T) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

/** A message keeps its own historical turn; another request cannot explain its interruption. */
export function interruptedTriggerTurn(detail: Pick<ConversationDetail, 'conversation' | 'turns'>, message: Message) {
  if (message.senderType !== 'user' || message.conversationId !== detail.conversation.id) return undefined
  const turns = (detail.turns ?? []).filter(turn => turn.conversationId === message.conversationId && turn.triggerMessageId === message.id)
  const turn = message.turnId ? turns.find(turn => turn.id === message.turnId) : [...turns].sort(byCreatedAt).at(-1)
  return turn?.status === 'interrupted' ? turn : undefined
}

/** Explicit chronology also works when persisted rows arrive in a different order. */
export function activityRounds(detail: ConversationDetail): ActivityRound[] {
  const messages = new Map(detail.messages.map(message => [message.id, message]))
  const rounds = new Map<string, ActivityRound>()
  for (const turn of detail.turns ?? []) {
    rounds.set(`turn:${turn.id}`, { id: `turn:${turn.id}`, createdAt: turn.createdAt, trigger: messages.get(turn.triggerMessageId), turn, runs: [] })
  }
  for (const run of [...detail.runs].sort(byCreatedAt)) {
    // Older direct conversations have no DiscussionTurn; their triggering user message is still a reliable boundary.
    const key = run.turnId ? `turn:${run.turnId}` : `message:${run.triggerMessageId}`
    let round = rounds.get(key)
    if (!round) {
      const trigger = messages.get(run.triggerMessageId)
      round = { id: key, createdAt: trigger?.createdAt ?? run.createdAt, trigger, runs: [] }
      rounds.set(key, round)
    }
    round.runs.push(run)
  }
  const latestUserMessage = detail.messages.filter(message => message.senderType === 'user').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence || a.id.localeCompare(b.id)).at(-1)
  if (latestUserMessage && ![...rounds.values()].some(round => round.trigger?.id === latestUserMessage.id)) {
    const key = `message:${latestUserMessage.id}`
    rounds.set(key, { id: key, createdAt: latestUserMessage.createdAt, trigger: latestUserMessage, runs: [] })
  }
  return [...rounds.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.trigger?.sequence ?? 0) - (a.trigger?.sequence ?? 0) || a.id.localeCompare(b.id))
}

export function roundTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
