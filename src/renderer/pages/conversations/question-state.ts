/*
 * [INPUT]: 已公开原问题、明确会话/工作或自动化轮次来源（兼容旧员工消息缺 origin）、冻结补充与跨关闭/重启客户端请求记录。
 * [OUTPUT]: 原消息问题投影、自动化逐原公开问题/Work及精确答复关系；旧完成/同伴失败轮次仅匹配实际Run/Work已提交问题才补原卡入口；仅传输字段白名单、原 key/载荷 CAS 和本人原关系回执校验；新旧记录混合按原消息核读/标已答，纯旧无问题记录保留latest兼容，不保存第二套业务解决状态。
 * [POS]: conversations 问题补充合同；沿用旧 inbox 存储 key，使移除独立页面后仍能核对历史未知请求。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AutomationOrigin, ConversationDetail, Message, PublishedUserQuestion } from '@shared/domain'
import type { InboxQuestionReply } from '@shared/domain/inbox'
import { publishedWorkQuestionMatches } from '@shared/domain/inbox'

export const INBOX_QUESTION_PENDING_KEY = 'boai:inbox:question-pending'
export interface ChatQuestionTarget {
  itemId: string
  conversationId: string
  questionMessageId: string
  questionId: string
  revision: number
  workId?: string
  occurrenceId?: string
  automationId?: string
}
export interface ChatQuestion extends ChatQuestionTarget { content: string; answeredMessageId?: string }
export interface InboxQuestionRequest {
  itemId: string
  conversationId: string
  questionMessageId: string
  workId?: string
  occurrenceId?: string
  automationId?: string
  input: InboxQuestionReply
  status: 'pending' | 'unknown' | 'not_accepted'
}
export type InboxQuestionRequests = Record<string, InboxQuestionRequest>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 2000
const sameInput = (a: InboxQuestionRequest, b: InboxQuestionRequest) => a.itemId === b.itemId && a.conversationId === b.conversationId && a.workId === b.workId && a.occurrenceId === b.occurrenceId && a.automationId === b.automationId && a.questionMessageId === b.questionMessageId && a.input.questionId === b.input.questionId && a.input.requestId === b.input.requestId && a.input.expectedRevision === b.input.expectedRevision && a.input.content === b.input.content

export function restoreInboxQuestionRequests(value: unknown): InboxQuestionRequests {
  if (!object(value)) return {}
  const result: InboxQuestionRequests = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!object(entry) || !object(entry.input) || key !== entry.itemId || !identity(entry.itemId) || !identity(entry.conversationId) || !identity(entry.questionMessageId) || entry.workId !== undefined && !identity(entry.workId) || !['pending', 'unknown', 'not_accepted'].includes(String(entry.status))) continue
    if (entry.occurrenceId !== undefined && (!identity(entry.occurrenceId) || !identity(entry.automationId)) || entry.automationId !== undefined && !identity(entry.occurrenceId)) continue
    const input = entry.input
    if (!identity(input.questionId) || !identity(input.requestId) || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 100_000 || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) continue
    result[key] = { itemId: entry.itemId, conversationId: entry.conversationId, questionMessageId: entry.questionMessageId, ...(entry.workId ? { workId: entry.workId } : {}), ...(entry.occurrenceId ? { occurrenceId: entry.occurrenceId as string, automationId: entry.automationId as string } : {}), input: { questionId: input.questionId, expectedRevision: Number(input.expectedRevision), content: input.content, requestId: input.requestId }, status: 'unknown' }
  }
  return result
}

/** Reconciliation can clear only the same source and frozen request. */
export function updateInboxQuestionRequests(previous: InboxQuestionRequests, id: string, next: InboxQuestionRequest | undefined, expectedRequestId?: string): InboxQuestionRequests | undefined {
  if (expectedRequestId && previous[id]?.input.requestId !== expectedRequestId) return
  if (next && (next.itemId !== id || previous[id] && !sameInput(previous[id], next))) return
  const result = { ...previous }
  if (next) result[id] = next; else delete result[id]
  return result
}

export function inboxQuestionReceiptMatches(request: InboxQuestionRequest, message: Message) {
  if (message.conversationId !== request.conversationId || message.senderType !== 'user' || message.senderId !== 'user' || message.content !== request.input.content) return false
  const relation = message.inboxReply
  if (request.occurrenceId) return message.origin?.occurrenceId === request.occurrenceId && message.origin.automationId === request.automationId && relation?.questionId === request.input.questionId && relation.questionRevision === request.input.expectedRevision && relation.questionMessageId === request.questionMessageId && relation.workId === request.workId
  return !message.origin && relation?.questionId === request.input.questionId && relation.questionRevision === request.input.expectedRevision && relation.questionMessageId === request.questionMessageId && relation.workId === request.workId
}

export function questionRequestTarget(request: InboxQuestionRequest): ChatQuestionTarget {
  return { itemId: request.itemId, conversationId: request.conversationId, questionMessageId: request.questionMessageId, questionId: request.input.questionId, revision: request.input.expectedRevision, ...(request.workId ? { workId: request.workId } : {}), ...(request.occurrenceId ? { occurrenceId: request.occurrenceId, automationId: request.automationId } : {}) }
}

/** Message windows never invent questions or work; the host rechecks each source before submission. */
export function chatQuestions(detail: ConversationDetail): ChatQuestion[] {
  const result: ChatQuestion[] = [], seen = new Set<string>()
  const add = (question: NonNullable<ConversationDetail['workItems']>[number]['userQuestion'], workId?: string) => {
    if (!question || seen.has(question.id)) return
    const message = detail.messages.find(value => value.id === question.messageId)
    if (!message || message.status !== 'completed' || message.senderType !== 'agent' || message.origin || (detail.turns ?? []).some(turn => turn.id === message.turnId && turn.origin) || message.conversationId !== detail.conversation.id || !message.content.includes(question.content)) return
    seen.add(question.id)
    result.push({ itemId: `question:${question.id}`, conversationId: detail.conversation.id, questionMessageId: message.id, questionId: question.id, revision: question.revision, content: question.content, answeredMessageId: question.answeredMessageId, ...(workId ? { workId } : {}) })
  }
  for (const decision of detail.decisions ?? []) if (decision.action === 'ask' && decision.responseKind !== 'task') add(decision.userQuestion)
  for (const work of detail.workItems ?? []) if (!work.origin) add(work.userQuestion, work.id)
  // Each recorded automated question keeps its original message and Work, while submission still uses the occurrence API.
  const turns = new Map((detail.turns ?? []).filter(turn => turn.origin && turn.conversationId === detail.conversation.id).map(turn => [turn.id, turn]))
  const recordedOccurrences = new Set<string>(), recordedMessages = new Set<string>()
  const sameOrigin = (a: AutomationOrigin | undefined, b: AutomationOrigin) => a?.kind === 'automation' && a.occurrenceId === b.occurrenceId && a.automationId === b.automationId && a.authorizedFingerprint === b.authorizedFingerprint
  const exactAnswer = (message: Message, origin: AutomationOrigin, workId?: string) => detail.messages.find(reply => reply.conversationId === detail.conversation.id && reply.status === 'completed' && reply.senderType === 'user' && reply.senderId === 'user' && sameOrigin(reply.origin, origin) && reply.inboxReply?.questionId === `occurrence:${origin.occurrenceId}` && reply.inboxReply.questionMessageId === message.id && reply.inboxReply.workId === workId)?.id
  const addAutomated = (question: PublishedUserQuestion | undefined, ownerId: string, workId?: string, workOrigin?: AutomationOrigin) => {
    if (!question) return
    const message = detail.messages.find(value => value.id === question.messageId), turn = message?.turnId ? turns.get(message.turnId) : undefined, origin = turn?.origin
    if (!message || !origin || message.conversationId !== detail.conversation.id || message.status !== 'completed' || message.senderType !== 'agent') return
    recordedOccurrences.add(origin.occurrenceId)
    if (recordedMessages.has(message.id) || message.senderId !== ownerId || message.origin && !sameOrigin(message.origin, origin) || workId && !sameOrigin(workOrigin, origin) || !question.content.trim() || !message.content.includes(question.content)) return
    const answeredMessageId = question.answeredMessageId ?? exactAnswer(message, origin, workId)
    if (turn.status !== 'waiting_user' && !answeredMessageId) {
      const work = workId ? detail.workItems?.find(value => value.id === workId) : undefined, run = message.runId ? detail.runs.find(value => value.id === message.runId) : undefined
      if (!['completed', 'failed'].includes(turn.status) || !publishedWorkQuestionMatches(work, run, message)) return
    }
    recordedMessages.add(message.id)
    result.push({ itemId: `question:occurrence:${origin.occurrenceId}:message:${message.id}`, conversationId: detail.conversation.id, questionMessageId: message.id, questionId: `occurrence:${origin.occurrenceId}`, revision: 0, content: question.content, occurrenceId: origin.occurrenceId, automationId: origin.automationId, ...(workId ? { workId } : {}), ...(answeredMessageId ? { answeredMessageId } : {}) })
  }
  for (const work of detail.workItems ?? []) if (work.conversationId === detail.conversation.id && work.userQuestion && work.resultMessageIds.includes(work.userQuestion.messageId)) addAutomated(work.userQuestion, work.ownerAgentId, work.id, work.origin)
  for (const decision of detail.decisions ?? []) if (decision.action === 'ask' && decision.responseKind !== 'task' && decision.userQuestion && detail.messages.some(message => message.id === decision.userQuestion!.messageId && message.turnId === decision.turnId)) addAutomated(decision.userQuestion, decision.agentId)
  // Mixed records keep the old employee's original message; a peer's reply to the same turn does not answer it.
  const waitingTurns = new Map([...turns.values()].filter(turn => turn.status === 'waiting_user').map(turn => [turn.id, turn]))
  const automated = new Map<string, { message: Message; origin: NonNullable<Message['origin']> }>()
  for (const message of detail.messages) {
    const origin = message.turnId ? waitingTurns.get(message.turnId)?.origin : undefined
    if (!origin || recordedMessages.has(message.id) || message.origin && !sameOrigin(message.origin, origin) || message.conversationId !== detail.conversation.id || message.status !== 'completed' || message.senderType !== 'agent') continue
    const run = message.runId ? detail.runs.find(value => value.id === message.runId) : undefined
    if (run?.responseKind === 'task' || run?.workId || (detail.workItems ?? []).some(work => work.conversationId === detail.conversation.id && (work.resultMessageIds.includes(message.id) || work.userQuestion?.messageId === message.id)) || (detail.decisions ?? []).some(decision => decision.turnId === message.turnId && decision.agentId === message.senderId && (decision.action !== 'ask' || decision.responseKind === 'task' || decision.userQuestion))) continue
    const previous = automated.get(origin.occurrenceId)
    if (!previous || message.sequence > previous.message.sequence) automated.set(origin.occurrenceId, { message, origin })
  }
  for (const { message, origin } of automated.values()) {
    const mixed = recordedOccurrences.has(origin.occurrenceId)
    const answeredMessageId = mixed ? exactAnswer(message, origin) : (detail.turns ?? []).find(turn => turn.conversationId === detail.conversation.id && turn.origin?.occurrenceId === origin.occurrenceId && turn.origin.automationId === origin.automationId && turn.replyToTurnIds?.includes(message.turnId!))?.triggerMessageId
    result.push({ itemId: `question:occurrence:${origin.occurrenceId}${mixed ? `:message:${message.id}` : ''}`, conversationId: detail.conversation.id, questionMessageId: message.id, questionId: `occurrence:${origin.occurrenceId}`, revision: 0, content: message.content, occurrenceId: origin.occurrenceId, automationId: origin.automationId, ...(answeredMessageId ? { answeredMessageId } : {}) })
  }
  return result
}
