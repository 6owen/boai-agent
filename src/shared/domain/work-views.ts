/*
 * [INPUT]: 已提交Work、材料与成果身份；当前可见会话和来源版本。
 * [OUTPUT]: 会话/全局/员工共用有界只读清单、五组同口径计数及固定原消息/当前审批导航合同。
 * [POS]: shared/domain 工作视图合同；不创建任务、执行或用户认可。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { WorkItem } from './work'
type WorkStatus = WorkItem['status']

export const WORK_VIEW_LIMITS = { defaultPage: 30, maxPage: 100, searchCharacters: 200 } as const
export const WORK_VIEW_GROUPS = ['ready', 'running', 'waiting', 'delivered', 'ended'] as const
export type WorkViewGroup = typeof WORK_VIEW_GROUPS[number]
export type WorkViewSource = 'ordinary' | 'automation' | 'unknown'
export const WORK_VIEW_STATES: Record<WorkViewGroup, WorkStatus[]> = {
  ready: ['ready'], running: ['running'], waiting: ['waiting', 'blocked'],
  delivered: ['delivered'], ended: ['failed', 'cancelled', 'interrupted'],
}
export interface WorkViewQuery {
  conversationId?: string
  ownerAgentId?: string
  search?: string
  states?: WorkStatus[]
  group?: WorkViewGroup
  source?: WorkViewSource
  from?: string
  to?: string
  limit?: number
  cursor?: string
  /** Explicit children of one visible parent, without treating dependencies as children. */
  parentWorkId?: string
}
export interface WorkViewItem {
  work: WorkItem
  conversationTitle: string
  ownerName?: string
  source: WorkViewSource
  sourceAvailable: boolean
  childCount: number
  resultMessageIds: string[]
  approvalTargets?: WorkViewApprovalTarget[]
}
export interface WorkViewApprovalTarget {
  approvalId: string
  runId: string
  /** Missing for the original pending approval card before its run message is published. */
  messageId?: string
  kind?: 'command' | 'browser'
}
export interface WorkViewPage {
  items: WorkViewItem[]
  total: number
  rootTotal: number
  childTotal: number
  counts: Record<WorkViewGroup, number>
  nextCursor?: string
  revision: number
  /** Host startup/restore epoch; cursors cannot cross a reopened authority. */
  scopeEpoch?: string
}
export interface WorkViewTargetInput {
  workId: string
  kind: 'source' | 'result' | 'question' | 'approval'
  messageId?: string
  artifactId?: string
  contentHash?: string
  approvalId?: string
  runId?: string
}
export interface WorkViewTarget {
  conversationId: string
  workId: string
  /** Approval targets may instead identify the original pending card by approvalId/runId. */
  messageId?: string
  artifactId?: string
  contentHash?: string
  approvalId?: string
  runId?: string
}
export type ConversationFileKind = 'material' | 'artifact'
export interface ConversationFileQuery {
  conversationId: string
  name?: string
  kind?: ConversationFileKind
  actorId?: string
  /** Lowercase extension, or image/text/binary when no useful extension exists. */
  fileType?: string
  from?: string
  to?: string
  /** Explicit history of a real logical artifact; otherwise list the latest published version. */
  logicalArtifactId?: string
  limit?: number
  cursor?: string
}
export interface ConversationFileItem {
  id: string
  conversationId: string
  kind: ConversationFileKind
  name: string
  size: number
  fileType: string
  actorId?: string
  actorName?: string
  createdAt: string
  sourceMessageId?: string
  contentHash?: string
  revision?: number
  logicalArtifactId?: string
  contentVersion?: number
  versionCount?: number
  adopted?: { artifactId: string; contentVersion: number; contentHash: string }
  status: 'ready' | 'preparing' | 'failed' | 'unavailable' | 'removed' | 'unsupported'
  error?: string
}
export interface ConversationFilePage {
  items: ConversationFileItem[]
  total: number
  nextCursor?: string
  revision: number
  scopeEpoch?: string
}
export interface ConversationFileTargetInput {
  conversationId: string
  kind: ConversationFileKind
  id: string
  contentHash?: string
  revision?: number
}
export interface ConversationFileTarget {
  conversationId: string
  messageId: string
  kind: ConversationFileKind
  id: string
}
