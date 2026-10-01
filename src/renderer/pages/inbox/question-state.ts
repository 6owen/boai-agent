/*
 * [INPUT]: 明确问题来源、已冻结补充输入与跨关闭/重启的客户端请求记录。
 * [OUTPUT]: 仅传输状态的字段白名单、原 key/原载荷更新和重启只读核对；不保存业务已解决状态。
 * [POS]: inbox 问题补充未决身份；正文仅为本人明确提交的原请求，不缓存问题或会话正文。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Message } from '@shared/domain'
import type { InboxQuestionReply } from '@shared/domain/inbox'
export const INBOX_QUESTION_PENDING_KEY = 'boai:inbox:question-pending'
export interface InboxQuestionRequest {
  itemId: string
  conversationId: string
  questionMessageId: string
  workId?: string
  input: InboxQuestionReply
  status: 'pending' | 'unknown' | 'not_accepted'
}
export type InboxQuestionRequests = Record<string, InboxQuestionRequest>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 2000
const sameInput = (a: InboxQuestionRequest, b: InboxQuestionRequest) => a.itemId === b.itemId && a.conversationId === b.conversationId && a.workId === b.workId && a.questionMessageId === b.questionMessageId && a.input.questionId === b.input.questionId && a.input.requestId === b.input.requestId && a.input.expectedRevision === b.input.expectedRevision && a.input.content === b.input.content

export function restoreInboxQuestionRequests(value: unknown): InboxQuestionRequests {
  if (!object(value)) return {}
  const result: InboxQuestionRequests = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!object(entry) || !object(entry.input) || key !== entry.itemId || !identity(entry.itemId) || !identity(entry.conversationId) || !identity(entry.questionMessageId) || entry.workId !== undefined && !identity(entry.workId) || !['pending', 'unknown', 'not_accepted'].includes(String(entry.status))) continue
    const input = entry.input
    if (!identity(input.questionId) || !identity(input.requestId) || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 100_000 || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) continue
    result[key] = { itemId: entry.itemId, conversationId: entry.conversationId, questionMessageId: entry.questionMessageId, ...(entry.workId ? { workId: entry.workId } : {}), input: { questionId: input.questionId, expectedRevision: Number(input.expectedRevision), content: input.content, requestId: input.requestId }, status: 'unknown' }
  }
  return result
}

/** Reconciliation can clear only the same source and frozen request, even after another tab rerenders. */
export function updateInboxQuestionRequests(previous: InboxQuestionRequests, id: string, next: InboxQuestionRequest | undefined, expectedRequestId?: string): InboxQuestionRequests | undefined {
  if (expectedRequestId && previous[id]?.input.requestId !== expectedRequestId) return
  if (next && (next.itemId !== id || previous[id] && !sameInput(previous[id], next))) return
  const result = { ...previous }
  if (next) result[id] = next; else delete result[id]
  return result
}

export function inboxQuestionReceiptMatches(request: InboxQuestionRequest, message: Message) {
  const relation = message.inboxReply
  return message.conversationId === request.conversationId && message.senderType === 'user' && message.senderId === 'user' && message.content === request.input.content && relation?.questionId === request.input.questionId && relation.questionRevision === request.input.expectedRevision && relation.questionMessageId === request.questionMessageId && relation.workId === request.workId
}
