/*
 * [INPUT]: ProductStore 固定 SQL、当前会话及来源验证 hooks；有界个人搜索和稳定历史目标。
 * [OUTPUT]: 本地多词 AND/固定相关性、已核验正文片段与覆盖进度、绑定索引版本的分页；来源身份和来源 hooks 在查询/点击复核，失效不返回旧摘录；有界回填不创建 Work/模型；原明确历史窗口/完成事实和隐藏/清理门禁保留。
 * [POS]: conversations 的 D6 个人浏览读模型，独立于 getConversation/模型上下文窗口；不读取任意路径或制造业务动作。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { Artifact, Conversation, Message } from '@boai/shared/domain'
import type { ConversationMaterial } from '@boai/shared/domain/materials'
import { READING_LIMITS, type ConversationCompletion, type ConversationCompletionIdentity, type ConversationMessageCursor, type ConversationMessageItem, type ConversationMessagePage, type ConversationMessagePageQuery, type ConversationSearchKind, type ConversationSearchPage, type ConversationSearchQuery, type ConversationSearchResult, type ConversationSearchTarget } from '@boai/shared/domain/reading'
import { ProductStore } from '../../adapters/storage/product-store'
import type { ConversationMessageSqlRow, ConversationSearchSqlRow } from './reading-sql'
import { completionHash, readingIdentifier } from './reading-repository'
import { SearchBodyIndex, type SearchBodyHooks } from './search-body-index'
import { firstSearchMatch, searchTerms } from './search-matching'

export interface ConversationSourceHooks extends SearchBodyHooks {
  validateMessage(message: Message, conversation: Conversation): Promise<void>
  validateMaterial(material: ConversationMaterial, conversation: Conversation): Promise<void>
  validateArtifact(artifact: Artifact & { id: string; conversationId: string }, conversation: Conversation): Promise<void>
}
const kinds: ConversationSearchKind[] = ['conversation', 'message', 'material', 'artifact']
const limitOf = (value: number | undefined) => { const limit = value ?? READING_LIMITS.page; if (!Number.isSafeInteger(limit) || limit < 1 || limit > READING_LIMITS.maxPage) throw new Error('浏览页大小须为 1 至 80'); return limit }
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : '这条内容已被清理或不可用').slice(0, 500)
const cursorOf = (message: Pick<Message, 'id' | 'sequence'>): ConversationMessageCursor => ({ id: message.id, sequence: message.sequence })
const compareMessages = (a: Message, b: Message) => a.sequence - b.sequence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const fileIdentity = (target: ConversationSearchTarget) => JSON.stringify(target)

export class ConversationSearchRepository {
  private readonly index: SearchBodyIndex
  constructor(private store: ProductStore, private hooks: ConversationSourceHooks) { this.index = new SearchBodyIndex(store, hooks) }
  private async conversation(conversationId: string): Promise<void> {
    readingIdentifier(conversationId)
    await this.store.transaction(async tx => { if (!await tx.get('conversations', conversationId)) throw new Error('聊天已不存在'); if (await tx.get('conversationCleanup', conversationId)) throw new Error('聊天正在清理，历史内容不可用') })
  }
  private completion(raw: string | null, message: Message): ConversationCompletionIdentity | undefined {
    if (!raw || message.senderType !== 'agent' || message.status !== 'completed') return undefined
    const value = JSON.parse(raw) as ConversationCompletion
    if (value.messageId !== message.id || value.conversationId !== message.conversationId || value.contentHash !== completionHash(message)) return undefined
    return { messageId: message.id, ordinal: value.ordinal, epoch: value.epoch, contentHash: value.contentHash }
  }
  private target(row: ConversationSearchSqlRow): ConversationSearchTarget {
    const source = JSON.parse(row.source) as Message & ConversationMaterial & Artifact & { conversationId: string }, conversation = JSON.parse(row.conversation) as Conversation
    if (row.kind === 'conversation') return { kind: 'conversation', conversationId: conversation.id }
    if (row.kind === 'message') return { kind: 'message', conversationId: conversation.id, messageId: row.id }
    if (row.kind === 'material') return { kind: 'material', conversationId: conversation.id, materialId: row.id, revision: source.revision, ...(source.contentHash ? { contentHash: source.contentHash } : {}) }
    return { kind: 'artifact', conversationId: conversation.id, artifactId: row.id, ...(source.logicalArtifactId ? { logicalArtifactId: source.logicalArtifactId } : {}), ...(source.contentVersion ? { contentVersion: source.contentVersion } : {}), ...(source.contentHash ? { contentHash: source.contentHash } : {}) }
  }
  private targetId(target: ConversationSearchTarget): string { return target.kind === 'conversation' ? target.conversationId : target.kind === 'message' ? target.messageId : target.kind === 'material' ? target.materialId : target.artifactId }
  private async validate(row: ConversationSearchSqlRow, includeHidden = false): Promise<ConversationSearchSqlRow | null> {
    const target = this.target(row), source = JSON.parse(row.source), conversation = JSON.parse(row.conversation) as Conversation
    if (target.kind === 'message') await this.hooks.validateMessage(source as Message, conversation)
    else if (target.kind === 'material') await this.hooks.validateMaterial(source as ConversationMaterial, conversation)
    else if (target.kind === 'artifact') await this.hooks.validateArtifact(source as Artifact & { id: string; conversationId: string }, conversation)
    const fresh = await this.store.conversationSearchTarget({ kind: target.kind, id: row.id, conversationId: conversation.id, ...(includeHidden ? { includeHidden: true } : {}) })
    if (!fresh) return null
    if (fileIdentity(this.target(fresh)) !== fileIdentity(target) || target.kind === 'message' && completionHash(JSON.parse(fresh.source) as Message) !== completionHash(source as Message)) throw new Error('来源身份已更新，请重新读取原对象')
    return fresh
  }
  private excerpt(content: string, keyword: string): string {
    const index = keyword ? firstSearchMatch(content, keyword) : 0, start = Math.max(0, index - 60)
    return `${start > 0 ? '…' : ''}${content.slice(start, start + READING_LIMITS.excerptCharacters)}${content.length > start + READING_LIMITS.excerptCharacters ? '…' : ''}`
  }
  private result(row: ConversationSearchSqlRow, keyword: string, unavailableReason?: string): ConversationSearchResult {
    const source = JSON.parse(row.source) as Message & ConversationMaterial & Artifact, conversation = JSON.parse(row.conversation) as Conversation, kind = row.kind as ConversationSearchKind
    const base: ConversationSearchResult = { id: row.id, kind, conversationId: conversation.id, conversationTitle: conversation.title, time: row.time, target: this.target(row), status: unavailableReason ? 'unavailable' : 'available' }
    if (unavailableReason) return { ...base, reason: unavailableReason }
    if (kind === 'conversation') return { ...base, name: conversation.title }
    if (kind !== 'message') {
      const terms = keyword ? searchTerms(keyword) : [], name = source.name.toLowerCase(), body = row.body?.toLowerCase(), inName = terms.some(term => name.includes(term)), inBody = !!body && terms.some(term => body.includes(term))
      return { ...base, name: source.name, ...(kind === 'artifact' && source.ownerAgentId ? { agentId: source.ownerAgentId } : {}), ...(terms.length ? { matchedIn: inBody ? inName ? 'name_and_body' as const : 'body' as const : 'name' as const } : {}), ...(inBody && row.body ? { excerpt: this.excerpt(row.body, keyword), matchOffset: firstSearchMatch(row.body, keyword) } : {}) }
    }
    const completion = this.completion(row.completion, source)
    return { ...base, senderName: source.senderName, ...(source.senderType === 'agent' ? { agentId: source.senderId } : {}), excerpt: this.excerpt(source.content, keyword), ...(completion ? { completion } : {}) }
  }
  private normalize(query: ConversationSearchQuery) {
    const keyword = query.keyword.trim(), limit = limitOf(query.limit)
    if (!keyword || [...keyword].length > READING_LIMITS.keywordCharacters) throw new Error('搜索关键词须为 1 至 200 字符')
    searchTerms(keyword)
    if (query.scope !== 'all' && query.scope !== 'current') throw new Error('无效搜索范围')
    if (query.scope === 'current' && !query.conversationId) throw new Error('会话内搜索须明确聊天')
    if (query.conversationId) readingIdentifier(query.conversationId)
    if (query.agentId) readingIdentifier(query.agentId)
    const date = (value: string | undefined) => { if (value === undefined) return undefined; if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('搜索时间无效'); return new Date(value).toISOString() }
    const from = date(query.from), to = date(query.to)
    if (from && to && from > to) throw new Error('搜索开始时间不能晚于结束时间')
    const selected = query.kinds ? [...new Set(query.kinds)].sort() : undefined
    if (selected && (!selected.length || selected.some(kind => !kinds.includes(kind)))) throw new Error('无效搜索类型')
    const normalized = { keyword, scope: query.scope, ...(query.conversationId ? { conversationId: query.conversationId } : {}), ...(query.agentId ? { agentId: query.agentId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(selected ? { kinds: selected } : {}) }, queryKey = createHash('sha256').update(JSON.stringify({ ...normalized, ranking: 'and-fields-v1' })).digest('hex')
    if (query.before) { readingIdentifier(query.before.id); if (query.before.queryKey !== queryKey || !kinds.includes(query.before.kind) || typeof query.before.time !== 'string' || query.before.time.length > 100 || !Number.isSafeInteger(query.before.score) || query.before.score! < 0 || !Number.isSafeInteger(query.before.indexRevision) || query.before.indexRevision! < 0) throw new Error('搜索游标与当前条件不一致') }
    return { normalized, queryKey, limit }
  }
  async search(query: ConversationSearchQuery): Promise<ConversationSearchPage> {
    const { normalized, queryKey, limit } = this.normalize(query)
    if (normalized.conversationId) await this.conversation(normalized.conversationId)
    const processed = query.before ? 0 : await this.index.backfill(normalized), initialCoverage = await this.store.searchBodyCoverage(normalized)
    if (query.before && query.before.indexRevision !== initialCoverage.indexRevision) throw new Error('正文索引已更新，请重新搜索后继续翻页')
    const results: ConversationSearchResult[] = [], cursors: NonNullable<ConversationSearchQuery['before']>[] = []
    let before = query.before, exhausted = false
    for (let pass = 0; pass < 4 && results.length <= limit && !exhausted; pass++) {
      const rows = await this.store.conversationSearchRows({ ...normalized, ...(before ? { before } : {}), limit: limit + 1 })
      exhausted = rows.length < limit + 1
      for (const row of rows) {
        const cursor = { time: row.time, id: row.id, kind: row.kind as ConversationSearchKind, queryKey, score: row.score ?? 0, indexRevision: initialCoverage.indexRevision }; before = cursor
        try { const fresh = await this.validate(row); if (!fresh) continue; results.push(this.result(fresh, normalized.keyword)) }
        catch (error) {
          const current = await this.store.conversationSearchTarget({ kind: row.kind as ConversationSearchKind, id: row.id, conversationId: this.target(row).conversationId }); if (!current) continue
          if (row.kind === 'material' || row.kind === 'artifact') {
            const failedSource = JSON.parse(current.source)
            await this.index.invalidate({ id: row.id, kind: row.kind, conversationId: this.target(row).conversationId, source: failedSource.status === 'unavailable' ? current.source : row.source, conversation: current.conversation }, error)
          }
          results.push(this.result(row, normalized.keyword, reasonOf(error)))
        }
        cursors.push(cursor)
        if (results.length > limit) break
      }
    }
    const coverage = { ...await this.store.searchBodyCoverage(normalized), batchProcessed: processed }
    if (query.before && coverage.indexRevision !== initialCoverage.indexRevision) throw new Error('正文来源已变化，请重新搜索后继续翻页')
    const next = results.length > limit ? cursors[limit - 1] : !exhausted && before ? before : undefined
    return { results: results.slice(0, limit), queryKey, coverage, ...(next ? { nextCursor: { ...next, indexRevision: coverage.indexRevision } } : {}) }
  }
  async resolve(target: ConversationSearchTarget): Promise<ConversationSearchResult> {
    readingIdentifier(target.conversationId); readingIdentifier(this.targetId(target))
    if (!kinds.includes(target.kind)) throw new Error('无效搜索目标类型')
    const row = await this.store.conversationSearchTarget({ kind: target.kind, id: this.targetId(target), conversationId: target.conversationId })
    if (!row) throw new Error('这条内容已被清理或不可用')
    if ((target.kind === 'material' || target.kind === 'artifact') && fileIdentity(this.target(row)) !== fileIdentity(target)) return { ...this.result(row, '', '所见文件版本或内容身份已更新'), target: structuredClone(target) }
    try { const fresh = await this.validate(row); if (!fresh) throw new Error('这条内容已被清理或不可用'); return this.result(fresh, '') }
    catch (error) {
      const current = await this.store.conversationSearchTarget({ kind: target.kind, id: this.targetId(target), conversationId: target.conversationId })
      if (!current) throw new Error('这条内容已被清理、隐藏或不可用')
      return { ...this.result(current, '', reasonOf(error)), target: structuredClone(target) }
    }
  }
  private checkCursor(cursor: ConversationMessageCursor | undefined) { if (cursor) { readingIdentifier(cursor.id); if (!Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0) throw new Error('消息游标无效') } }
  private async messageItem(row: ConversationMessageSqlRow): Promise<ConversationMessageItem | null> {
    const original = JSON.parse(row.source) as Message
    const target = await this.store.conversationSearchTarget({ kind: 'message', id: original.id, conversationId: original.conversationId, includeHidden: true })
    if (!target) return null
    try {
      if (completionHash(JSON.parse(target.source) as Message) !== completionHash(original)) throw new Error('消息正文已变化，请重新读取')
      const fresh = await this.validate(target, true); if (!fresh) return null
      const message = JSON.parse(fresh.source) as Message, completion = this.completion(fresh.completion, message)
      return { messageId: message.id, sequence: message.sequence, status: 'available', message, ...(completion ? { completion } : {}) }
    } catch (error) { return { messageId: original.id, sequence: original.sequence, status: 'unavailable', reason: reasonOf(error) } }
  }
  async messagePage(query: ConversationMessagePageQuery): Promise<ConversationMessagePage> {
    const limit = limitOf(query.limit); this.checkCursor(query.before); this.checkCursor(query.after)
    if ([query.before, query.after, query.aroundMessageId].filter(Boolean).length > 1) throw new Error('消息页只能选择向前、向后或明确目标窗口')
    await this.conversation(query.conversationId)
    let rows: ConversationMessageSqlRow[]
    if (query.aroundMessageId) {
      readingIdentifier(query.aroundMessageId)
      const target = await this.store.conversationSearchTarget({ kind: 'message', id: query.aroundMessageId, conversationId: query.conversationId, includeHidden: true })
      if (!target) return { conversationId: query.conversationId, items: [], targetMessageId: query.aroundMessageId }
      const message = JSON.parse(target.source) as Message, beforeCount = Math.floor((limit - 1) / 2), afterCount = limit - beforeCount - 1
      const older = beforeCount ? await this.store.conversationMessageRows({ conversationId: query.conversationId, before: cursorOf(message), limit: beforeCount }) : [], newer = afterCount ? await this.store.conversationMessageRows({ conversationId: query.conversationId, after: cursorOf(message), limit: afterCount }) : []
      rows = [...older, { source: target.source, completion: target.completion }, ...newer]
    } else rows = await this.store.conversationMessageRows({ conversationId: query.conversationId, ...(query.before ? { before: query.before } : {}), ...(query.after ? { after: query.after } : {}), limit })
    rows.sort((a, b) => compareMessages(JSON.parse(a.source) as Message, JSON.parse(b.source) as Message))
    const items: ConversationMessageItem[] = []
    for (const row of rows) { const item = await this.messageItem(row); if (item) items.push(item) }
    if (!query.aroundMessageId) {
      // Deletion between SELECT and validation cannot hide an older matching row.
      // Invalid but still-existing sources retain a visible reason and consume a row.
      let boundary = rows.length ? cursorOf(JSON.parse((query.after ? rows.at(-1) : rows.at(0))!.source) as Message) : undefined
      for (let pass = 0; pass < 3 && items.length < limit && rows.length && boundary; pass++) {
        rows = await this.store.conversationMessageRows({ conversationId: query.conversationId, ...(query.after ? { after: boundary } : { before: boundary }), limit: limit - items.length })
        boundary = rows.length ? cursorOf(JSON.parse(rows.at(-1)!.source) as Message) : undefined
        for (const row of rows) { const item = await this.messageItem(row); if (item) items.push(item) }
      }
      items.sort((a, b) => a.sequence - b.sequence || (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0))
    }
    if (query.aroundMessageId && (!items.some(item => item.messageId === query.aroundMessageId) || !await this.store.conversationSearchTarget({ kind: 'message', id: query.aroundMessageId, conversationId: query.conversationId, includeHidden: true }))) return { conversationId: query.conversationId, items: [], targetMessageId: query.aroundMessageId }
    const first = items.at(0), last = items.at(-1)
    return { conversationId: query.conversationId, items, ...(first ? { beforeCursor: { id: first.messageId, sequence: first.sequence } } : {}), ...(last ? { afterCursor: { id: last.messageId, sequence: last.sequence } } : {}), ...(query.aroundMessageId ? { targetMessageId: query.aroundMessageId } : {}) }
  }
}
