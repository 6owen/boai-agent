/*
 * [INPUT]: 员工、会话和消息的稳定身份。
 * [OUTPUT]: 统一记忆、来源/范围/生命周期、版本化管理与有界召回合同；兼容旧会话记忆。
 * [POS]: shared/domain/memory.ts；纯跨进程合同，不含存储或模型执行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const MEMORY_SCHEMA_VERSION = 2
export const MEMORY_MAX_CONTENT = 4000
export const MEMORY_MAX_CANDIDATES = 6
export const MEMORY_PAGE_SIZE = 40
export const MEMORY_CONTEXT_TOKENS = 2400
export const MEMORY_RECENT_OBSERVATIONS = 24
export const MEMORY_ARCHIVE_DAYS = 90
export type MemoryScope = 'profile' | 'conversation' | 'employee'
export type MemoryKind = 'long_term' | 'experience' | 'temporary'
export type MemoryUseScope = 'employee' | 'conversation' | 'context'
export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'expired' | 'deleted'
export type MemoryEvidence = 'fact' | 'preference' | 'decision' | 'claim' | 'inference'
export interface MemoryContextRef { kind: 'conversation' | 'work'; id: string }
export interface MemoryEntry {
  id: string
  ownerAgentId: string
  scope: MemoryScope
  conversationId?: string
  content: string
  sourceMessageIds: string[]
  sourceResourceIds: string[]
  origin: 'model' | 'user' | 'import'
  version: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
  schemaVersion?: 2
  kind?: MemoryKind
  evidence?: MemoryEvidence
  useScope?: MemoryUseScope
  contextRef?: MemoryContextRef
  disclosure?: 'private' | 'public' | 'permitted'
  sourceConversationIds?: string[]
  sourceMemoryIds?: string[]
  attribution?: string
  status?: MemoryStatus
  expiresAt?: string
  pinned?: boolean
  supersedes?: string[]
}
export interface MemoryCursor { createdAt: string; id: string }
export interface MemoryQuery {
  agentId: string
  scope: MemoryScope
  conversationId?: string
  kind?: MemoryKind
  status?: 'active' | 'history' | 'all'
  sourceConversationId?: string
  before?: MemoryCursor
  limit?: number
  search?: string
}
export interface MemoryView {
  entries: MemoryEntry[]
  epoch: number
  namespace: string
  invalidationEpoch?: number
  nextCursor?: MemoryCursor
  total?: number
  /** Host-selected snapshot. Management views must never be passed as a recall view. */
  recall?: { conversationId: string; versions: { id: string; version: number }[]; observationIds: string[]; tokenEstimate: number }
}
export interface MemoryCandidate {
  content: string
  sourceMessageIds: string[]
  sourceResourceIds?: string[]
  kind?: MemoryKind
  evidence?: MemoryEvidence
  useScope?: 'conversation'
  contextRef?: MemoryContextRef
  expiresAt?: string
  supersedes?: { id: string; version: number }[]
}
export interface MemoryInput extends MemoryQuery {
  id?: string
  content: string
  sourceMessageIds?: string[]
  sourceResourceIds?: string[]
  /** Populated by the host, never accepted directly from renderer input. */
  sourceConversationIds?: string[]
  expectedEpoch: number
  origin?: 'user' | 'import'
  requestId?: string
  kind?: MemoryKind
  evidence?: MemoryEvidence
  useScope?: MemoryUseScope
  contextRef?: MemoryContextRef | null
  expiresAt?: string | null
  pinned?: boolean
  status?: 'active' | 'history' | 'all'
  lifecycle?: 'active' | 'archived' | 'expired'
  promote?: boolean
}
/** Evidence IDs only: the published messages remain the sole text authority. */
export interface MemoryObservation {
  id: string
  ownerAgentId: string
  conversationId: string
  sourceMessageIds: string[]
  sourceResourceIds: string[]
  sourceMemoryIds: string[]
  sourceConversationIds?: string[]
  useScope: 'employee' | 'conversation'
  contextRef?: MemoryContextRef
  disclosure?: 'private' | 'public'
  createdAt: string
}
export interface MemoryForget {
  id: string
  ownerAgentId: string
  sourceMessageIds: string[]
  sourceMemoryIds: string[]
  fingerprint?: string
  createdAt: string
}
