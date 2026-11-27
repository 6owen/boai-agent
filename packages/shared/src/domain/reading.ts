/*
 * [OUTPUT]: 阅读、搜索和锚点 IPC 共用 domain/reading 的输入校验与推导类型。
 * [OUTPUT]: 会话窗口携带按运行标识的实时回复预览，发布及阅读身份继续来自消息页。
 * [INPUT]: 真实已提交员工完成事件、当前获准历史及本人可见快照。
 * [OUTPUT]: 本地多词 AND/确定性相关性、固定版本正文命中与有界覆盖进度/失败、绑定索引版本的稳定游标；执行轮次摘要最多80项/每项60字符；独立个人浏览与固定目标、阅读边界/缺口和独立锚点 CAS，不改变模型上下文或业务状态。
 * [POS]: shared/domain 的 D6 搜索与阅读合同；完成身份只由宿主发布事务产生。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { ConversationDetail, Message } from './index'

export const READING_LIMITS = { page: 40, maxPage: 80, keywordCharacters: 200, excerptCharacters: 240, sparseSeen: 256, observedCompletions: 80, anchorOffset: 1_000_000, triggerSummaries: 80, triggerSummaryCharacters: 60 } as const
export const SEARCH_INDEX_LIMITS = { formatVersion: 1, terms: 12, filesPerBatch: 12, bytesPerFile: 1024 * 1024, charactersPerFile: 200_000, bytesPerBatch: 2 * 1024 * 1024, batchMilliseconds: 250, failures: 5 } as const
const id = z.string().trim().min(1).max(200)
const nonnegativeInteger = z.number().int().nonnegative()
const positiveInteger = z.number().int().positive()
const contentHash = z.string().regex(/^[a-f0-9]{64}$/)
const pageLimit = z.number().int().min(1).max(READING_LIMITS.maxPage)

export const readingLookupSchema = z.object({ conversationId: id }).strict()
export type ConversationReadingLookup = z.infer<typeof readingLookupSchema>
export const conversationMetadataSchema = z.object({ id, includeTriggerSummaries: z.boolean().optional() }).strict()
export type ConversationMetadataQuery = z.infer<typeof conversationMetadataSchema>

const messageCursor = z.object({ id, sequence: nonnegativeInteger }).strict()
export type ConversationMessageCursor = z.infer<typeof messageCursor>
export const messagePageSchema = readingLookupSchema.extend({
  limit: pageLimit.optional(),
  before: messageCursor.optional(),
  after: messageCursor.optional(),
  aroundMessageId: id.optional(),
})
export type ConversationMessagePageQuery = z.infer<typeof messagePageSchema>

const completionIdentity = z.object({
  messageId: id, ordinal: positiveInteger, epoch: positiveInteger, contentHash,
}).strict()
export type ConversationCompletionIdentity = z.infer<typeof completionIdentity>
export const observeReadingSchema = readingLookupSchema.extend({
  epoch: positiveInteger,
  expectedRevision: nonnegativeInteger,
  completions: z.array(completionIdentity).max(READING_LIMITS.observedCompletions),
})
export type ConversationObserveInput = z.infer<typeof observeReadingSchema>
export const saveAnchorSchema = readingLookupSchema.extend({
  epoch: positiveInteger,
  expectedAnchorRevision: nonnegativeInteger,
  messageId: id,
  offset: nonnegativeInteger.max(READING_LIMITS.anchorOffset),
})
export type ConversationAnchorInput = z.infer<typeof saveAnchorSchema>

export const searchTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation'), conversationId: id }).strict(),
  z.object({ kind: z.literal('message'), conversationId: id, messageId: id }).strict(),
  z.object({
    kind: z.literal('material'), conversationId: id, materialId: id, revision: positiveInteger,
    contentHash: contentHash.optional(),
  }).strict(),
  z.object({
    kind: z.literal('artifact'), conversationId: id, artifactId: id, logicalArtifactId: id.optional(),
    contentVersion: positiveInteger.optional(), contentHash: contentHash.optional(),
  }).strict(),
])
export type ConversationSearchTarget = z.infer<typeof searchTargetSchema>
export type ConversationSearchKind = ConversationSearchTarget['kind']
export const conversationSearchKinds = Object.freeze(searchTargetSchema.options.map(option => option.shape.kind.value))
const searchKind = z.enum(conversationSearchKinds)

const searchCursor = z.object({
  time: z.string().max(100), id, kind: searchKind, queryKey: z.string().min(1).max(200),
  score: nonnegativeInteger.optional(), indexRevision: nonnegativeInteger.optional(),
}).strict()
export type ConversationSearchCursor = z.infer<typeof searchCursor>
export const searchSchema = z.object({
  keyword: z.string().trim().min(1).max(800),
  scope: z.enum(['all', 'current']),
  conversationId: id.optional(),
  agentId: id.optional(),
  from: z.string().max(100).optional(),
  to: z.string().max(100).optional(),
  kinds: z.array(searchKind).max(conversationSearchKinds.length).optional(),
  limit: pageLimit.optional(),
  before: searchCursor.optional(),
}).strict()
export type ConversationSearchQuery = z.infer<typeof searchSchema>

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
export interface ConversationMessageItem { messageId: string; sequence: number; status: 'available' | 'unavailable'; message?: Message; reason?: string; completion?: ConversationCompletionIdentity }
export interface ConversationMessagePage { conversationId: string; items: ConversationMessageItem[]; beforeCursor?: ConversationMessageCursor; afterCursor?: ConversationMessageCursor; targetMessageId?: string }
export interface ConversationView extends Omit<ConversationDetail, 'messages'> { messages: Message[]; messagePage: ConversationMessagePage; reading: ConversationReadingState; replyPreviews?: Record<string, string> }
export interface ConversationSearchResult { id: string; kind: ConversationSearchKind; conversationId: string; conversationTitle: string; time: string; agentId?: string; senderName?: string; name?: string; excerpt?: string; matchedIn?: 'name' | 'body' | 'name_and_body'; matchOffset?: number; status: 'available' | 'unavailable'; reason?: string; target: ConversationSearchTarget; completion?: ConversationCompletionIdentity }
export interface ConversationSearchCoverage { total: number; indexed: number; pending: number; failed: number; skipped: number; indexRevision: number; batchProcessed: number; hasMore: boolean; failures?: { kind: 'material' | 'artifact'; id: string; name: string; reason: string }[] }
export interface ConversationSearchPage { results: ConversationSearchResult[]; nextCursor?: ConversationSearchCursor; queryKey: string; coverage?: ConversationSearchCoverage }
