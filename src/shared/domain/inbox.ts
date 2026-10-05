/*
 * [INPUT]: 已发布补充问题、实时命令审批、失败来源与显式成果验收资格。
 * [OUTPUT]: 已提交原Message/Run/Work问题链的共享纯核验，不授予接续权限；权威来源的稳定游标/精确导航、原成果文件名与固定版、普通问题及明确自动化问题补充的本人消息回执关系，保留所见版本与原问题消息；无独立待办完成状态。
 * [POS]: D5 跨聊天待处理领域合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { WorkItem } from './work'
import type { AgentRun, Message } from './index'

export type InboxKind = 'question' | 'approval' | 'failure' | 'acceptance'
export interface InboxCursor { time: string; id: string }
export interface InboxQuery { kind?: InboxKind; search?: string; before?: InboxCursor; limit?: number }
export interface PublishedUserQuestion { id: string; messageId: string; content: string; revision: number; answeredMessageId?: string }
/** A completed/failed turn may contain a real task question. Text alone never supplies this relationship. */
export function publishedWorkQuestionMatches(work: WorkItem | undefined, run: AgentRun | undefined, message: Message | undefined): boolean {
  const question = work?.userQuestion
  if (!work || !question || !run || !message || work.status !== 'waiting' || work.activeRunId || work.cancellationCause || question.answeredMessageId || work.dependsOnWorkIds.length || work.requiredResults.length) return false
  const origin = work.origin
  for (const source of [run.origin, message.origin]) if (source && (!origin || source.automationId !== origin.automationId || source.occurrenceId !== origin.occurrenceId || source.authorizedFingerprint !== origin.authorizedFingerprint)) return false
  return run.status === 'completed' && run.responseKind !== 'chat' && run.workId === work.id && run.conversationId === work.conversationId && run.agentId === work.ownerAgentId && run.messageId === message.id && message.status === 'completed' && message.conversationId === run.conversationId && Boolean(message.turnId) && message.turnId === run.turnId && message.runId === run.id && message.senderType === 'agent' && message.senderId === run.agentId && question.id === `work:${work.id}:${work.resultVersion}` && question.revision === work.version && question.messageId === message.id && work.resultMessageIds.includes(message.id) && Boolean(question.content.trim()) && message.content.includes(question.content)
}
export interface InboxQuestionReply { questionId: string; expectedRevision: number; content: string; requestId: string }
/** Stored by the host on the committed reply; occurrence questions also retain the viewed version and message. */
export interface InboxReplyRelation { questionId: string; questionRevision: number; questionMessageId: string; workId?: string }
export interface InboxItem {
  id: string
  kind: InboxKind
  conversationId: string
  conversationTitle: string
  time: string
  summary: string
  reason?: string
  status: string
  agentId?: string
  agentName?: string
  messageId?: string
  turnId?: string
  runId?: string
  workId?: string
  approvalId?: string
  occurrenceId?: string
  automationId?: string
  question?: PublishedUserQuestion & { canReply: boolean; unavailableReason?: string }
  work?: { id: string; version: number; status: WorkItem['status']; requiresReview: boolean }
  approval?: { id: string; command: string; cwd: string }
  artifact?: { id: string; name?: string; logicalArtifactId: string; contentVersion: number; contentHash: string; acceptanceRevision: number }
}
export interface InboxPage { items: InboxItem[]; nextCursor?: InboxCursor }
