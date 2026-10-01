/*
 * [INPUT]: 真实已提交员工完成事件、当前获准历史及本人可见快照。
 * [OUTPUT]: 本地多词 AND/确定性相关性、固定版本正文命中与有界覆盖进度/失败、绑定索引版本的稳定游标；执行轮次摘要最多80项/每项60字符；独立个人浏览与固定目标、阅读边界/缺口和独立锚点 CAS，不改变模型上下文或业务状态。
 * [POS]: shared/domain 的 D6 搜索与阅读合同；完成身份只由宿主发布事务产生。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ConversationDetail, Message } from './index'

export const READING_LIMITS = { page: 40, maxPage: 80, keywordCharacters: 200, excerptCharacters: 240, sparseSeen: 256, observedCompletions: 80, anchorOffset: 1_000_000, triggerSummaries: 80, triggerSummaryCharacters: 60 } as const
export const SEARCH_INDEX_LIMITS = { formatVersion: 1, terms: 12, filesPerBatch: 12, bytesPerFile: 1024 * 1024, charactersPerFile: 200_000, bytesPerBatch: 2 * 1024 * 1024, batchMilliseconds: 250, failures: 5 } as const
export interface ConversationCompletionIdentity { messageId: string; ordinal: number; epoch: number; contentHash: string }
export interface ConversationCompletion extends ConversationCompletionIdentity { id: string; conversationId: string; completedAt: string }
export interface ConversationReadingAnchor { messageId: string; offset: number; revision: number }
export interface ConversationReadingState {
  id: string
  conversationId: string
  userId: 'user'
  epoch: number
  revision: number
  boundary: number
  sparseSeen: number[]
  completionCount: number
  unreadCount: number
  legacyCompletedUnknown: boolean
  firstUnreadMessageId?: string
  anchor: ConversationReadingAnchor | null
}
export interface ConversationObserveInput { conversationId: string; epoch: number; expectedRevision: number; completions: ConversationCompletionIdentity[] }
export interface ConversationAnchorInput { conversationId: string; epoch: number; expectedAnchorRevision: number; messageId: string; offset: number }
export interface ConversationMessageCursor { sequence: number; id: string }
export interface ConversationMessagePageQuery { conversationId: string; limit?: number; before?: ConversationMessageCursor; after?: ConversationMessageCursor; aroundMessageId?: string }
export interface ConversationMessageItem { messageId: string; sequence: number; status: 'available' | 'unavailable'; message?: Message; reason?: string; completion?: ConversationCompletionIdentity }
export interface ConversationMessagePage { conversationId: string; items: ConversationMessageItem[]; beforeCursor?: ConversationMessageCursor; afterCursor?: ConversationMessageCursor; targetMessageId?: string }
export interface ConversationView extends Omit<ConversationDetail, 'messages'> { messages: Message[]; messagePage: ConversationMessagePage; reading: ConversationReadingState }
export type ConversationSearchKind = 'conversation' | 'message' | 'material' | 'artifact'
export interface ConversationSearchCursor { time: string; id: string; kind: ConversationSearchKind; queryKey: string; score?: number; indexRevision?: number }
export interface ConversationSearchQuery { keyword: string; scope: 'all' | 'current'; conversationId?: string; agentId?: string; from?: string; to?: string; kinds?: ConversationSearchKind[]; limit?: number; before?: ConversationSearchCursor }
export type ConversationSearchTarget =
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'message'; conversationId: string; messageId: string }
  | { kind: 'material'; conversationId: string; materialId: string; revision: number; contentHash?: string }
  | { kind: 'artifact'; conversationId: string; artifactId: string; logicalArtifactId?: string; contentVersion?: number; contentHash?: string }
export interface ConversationSearchResult { id: string; kind: ConversationSearchKind; conversationId: string; conversationTitle: string; time: string; agentId?: string; senderName?: string; name?: string; excerpt?: string; matchedIn?: 'name' | 'body' | 'name_and_body'; matchOffset?: number; status: 'available' | 'unavailable'; reason?: string; target: ConversationSearchTarget; completion?: ConversationCompletionIdentity }
export interface ConversationSearchCoverage { total: number; indexed: number; pending: number; failed: number; skipped: number; indexRevision: number; batchProcessed: number; hasMore: boolean; failures?: { kind: 'material' | 'artifact'; id: string; name: string; reason: string }[] }
export interface ConversationSearchPage { results: ConversationSearchResult[]; nextCursor?: ConversationSearchCursor; queryKey: string; coverage?: ConversationSearchCoverage }
