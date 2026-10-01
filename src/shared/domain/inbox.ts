/*
 * [INPUT]: 已发布补充问题、实时命令审批、失败来源与显式成果验收资格。
 * [OUTPUT]: 权威来源的稳定游标/精确导航、原成果文件名与固定版、定向问题补充和本人消息回执关系；无独立待办完成状态。
 * [POS]: D5 跨聊天待处理领域合同。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { WorkItem } from './work'

export type InboxKind = 'question' | 'approval' | 'failure' | 'acceptance'
export interface InboxCursor { time: string; id: string }
export interface InboxQuery { kind?: InboxKind; search?: string; before?: InboxCursor; limit?: number }
export interface PublishedUserQuestion { id: string; messageId: string; content: string; revision: number; answeredMessageId?: string }
export interface InboxQuestionReply { questionId: string; expectedRevision: number; content: string; requestId: string }
/** Stored only by the host on the actual committed user message. */
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
