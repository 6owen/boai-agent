/*
 * [OUTPUT]: 历史预取边缘240px与跟随/已到边缘80px分别定义，分页保持有界窗口，不把预取范围当作最新跟随。
 * [INPUT]: 有界个人历史页、已捕获完成身份、当前阅读/锚点 CAS 与明确搜索目标。
 * [OUTPUT]: 流式更新不继承旧完成快照、可见完成去重、有界历史合并与独立版本合并；统一历史滚动边界距离；会话/消息/文件导航固定身份不漂移；搜索分页保持索引代际与最新覆盖回执，关键词摘录按多个原词有界高亮。
 * [POS]: D6 Renderer 的纯状态边界；不生成完成身份、不推测旧历史已读。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Message } from '@shared/domain'
import { READING_LIMITS, type ConversationCompletionIdentity, type ConversationMessageItem, type ConversationMessagePage, type ConversationReadingState, type ConversationSearchPage, type ConversationSearchQuery, type ConversationSearchResult, type ConversationSearchTarget } from '@shared/domain/reading'

export const READING_UI_LIMITS = { searchPages: 10, debounce: 200, observeDelay: 250, anchorDelay: 500, historyEdgeDistance: 80, historyPrefetchDistance: 240 } as const
const sameContent = (a: Message, b: Message) => a.id === b.id && a.conversationId === b.conversationId && a.senderType === b.senderType && a.senderId === b.senderId && a.content === b.content && JSON.stringify(a.materialIds ?? []) === JSON.stringify(b.materialIds ?? []) && JSON.stringify(a.materialSources ?? []) === JSON.stringify(b.materialSources ?? [])
export function visibleCompletions(page: ConversationMessagePage, reading: ConversationReadingState, visibleIds: ReadonlySet<string>, active: boolean, visible: boolean, focused: boolean): ConversationCompletionIdentity[] {
  if (!active || !visible || !focused || page.conversationId !== reading.conversationId) return []
  const seen = new Set(reading.sparseSeen)
  return page.items.flatMap(item => item.status === 'available' && item.message?.senderType === 'agent' && item.message.status === 'completed' && item.completion?.messageId === item.messageId && item.completion.epoch === reading.epoch && item.completion.ordinal > reading.boundary && !seen.has(item.completion.ordinal) && visibleIds.has(item.messageId) ? [{ ...item.completion }] : []).slice(0, READING_LIMITS.observedCompletions)
}
export function updateLiveMessage(page: ConversationMessagePage, message: Message, latest: boolean): ConversationMessagePage {
  if (message.conversationId !== page.conversationId) return page
  const previous = page.items.find(item => item.messageId === message.id)
  if (!previous && (!latest || message.sequence < (page.items.at(-1)?.sequence ?? 0))) return page
  if (previous?.status === 'unavailable') return page
  const item: ConversationMessageItem = { messageId: message.id, sequence: message.sequence, status: 'available', message, ...(previous?.completion && previous.message && message.status === 'completed' && sameContent(previous.message, message) ? { completion: previous.completion } : {}) }
  const items = [...page.items.filter(item => item.messageId !== message.id), item].sort((a, b) => a.sequence - b.sequence || a.messageId.localeCompare(b.messageId)).slice(-READING_LIMITS.maxPage)
  return pageWithItems(page, items)
}
export function pageWithItems(page: ConversationMessagePage, items: ConversationMessageItem[]): ConversationMessagePage {
  const first = items.at(0), last = items.at(-1)
  return { ...page, items, beforeCursor: first ? { id: first.messageId, sequence: first.sequence } : undefined, afterCursor: last ? { id: last.messageId, sequence: last.sequence } : undefined }
}
export function mergeMessagePages(previous: ConversationMessagePage, next: ConversationMessagePage, direction: 'before' | 'after'): ConversationMessagePage {
  if (previous.conversationId !== next.conversationId) throw new Error('不能把不同会话历史合并。')
  const unique = new Map(previous.items.map(item => [item.messageId, item]))
  for (const item of next.items) unique.set(item.messageId, item)
  const sorted = [...unique.values()].sort((a, b) => a.sequence - b.sequence || a.messageId.localeCompare(b.messageId))
  return pageWithItems(next, direction === 'before' ? sorted.slice(0, READING_LIMITS.maxPage) : sorted.slice(-READING_LIMITS.maxPage))
}
/** Reading and scroll anchors have independent revisions; a late response owns only its newer fields. */
export function mergeReadingState(previous: ConversationReadingState, next: ConversationReadingState): ConversationReadingState {
  if (previous.conversationId !== next.conversationId) throw new Error('阅读状态不属于当前会话。')
  if (next.epoch !== previous.epoch) return next.epoch > previous.epoch ? next : previous
  const read = next.revision > previous.revision || next.revision === previous.revision && next.completionCount >= previous.completionCount ? next : previous
  const anchor = (next.anchor?.revision ?? 0) >= (previous.anchor?.revision ?? 0) ? next.anchor : previous.anchor
  const completionCount = Math.max(previous.completionCount, next.completionCount)
  return { ...read, anchor, completionCount, unreadCount: completionCount - read.boundary - read.sparseSeen.length, legacyCompletedUnknown: previous.legacyCompletedUnknown || next.legacyCompletedUnknown }
}
export function sameSearchTarget(a: ConversationSearchTarget, b: ConversationSearchTarget) {
  if (a.kind !== b.kind || a.conversationId !== b.conversationId) return false
  if (a.kind === 'conversation' && b.kind === 'conversation') return true
  if (a.kind === 'message' && b.kind === 'message') return a.messageId === b.messageId
  if (a.kind === 'material' && b.kind === 'material') return a.materialId === b.materialId && a.revision === b.revision && a.contentHash === b.contentHash
  return a.kind === 'artifact' && b.kind === 'artifact' && a.artifactId === b.artifactId && a.logicalArtifactId === b.logicalArtifactId && a.contentVersion === b.contentVersion && a.contentHash === b.contentHash
}
export function readingSourceKey(target: ConversationSearchTarget) { return JSON.stringify([target.kind, target.conversationId, target.kind === 'conversation' ? target.conversationId : target.kind === 'message' ? target.messageId : target.kind === 'material' ? target.materialId : target.artifactId]) }
export async function readConversationSearchPages(input: ConversationSearchQuery, pages: number, current: () => boolean, load: (query: ConversationSearchQuery) => Promise<ConversationSearchPage>): Promise<ConversationSearchPage | undefined> {
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > READING_UI_LIMITS.searchPages) throw new Error('搜索页数超出本次上限。')
  const results = new Map<string, ConversationSearchResult>(); let before: ConversationSearchQuery['before'], queryKey = '', coverage: ConversationSearchPage['coverage']
  for (let page = 0; page < pages; page++) {
    if (!current()) return
    const next = await load({ ...input, before })
    if (!current()) return
    if (queryKey && next.queryKey !== queryKey) throw new Error('搜索条件已变化，请重新查询。')
    if (coverage && next.coverage && next.coverage.indexRevision !== coverage.indexRevision) throw new Error('文件正文索引已更新，请重新搜索。')
    queryKey = next.queryKey; coverage = next.coverage ?? coverage
    for (const item of next.results) results.set(`${item.kind}:${item.id}`, item)
    if (before && next.nextCursor && JSON.stringify(before) === JSON.stringify(next.nextCursor)) throw new Error('搜索游标未前进，请重新查询。')
    before = next.nextCursor; if (!before) break
  }
  return { results: [...results.values()], queryKey, nextCursor: before, coverage }
}

/** Highlight literal query words only; this never infers synonyms or changes source text. */
export function searchExcerptParts(text: string, keyword: string): { text: string; matched: boolean }[] {
  const words = [...new Set(keyword.trim().toLowerCase().split(/\s+/u).filter(Boolean))], lower = text.toLowerCase(), ranges: { start: number; end: number }[] = []
  for (const word of words) {
    let offset = 0
    while (offset < lower.length) {
      const start = lower.indexOf(word, offset); if (start < 0) break
      ranges.push({ start, end: start + word.length }); offset = start + word.length
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: typeof ranges = []
  for (const range of ranges) { const last = merged.at(-1); if (last && range.start <= last.end) last.end = Math.max(last.end, range.end); else merged.push({ ...range }) }
  const parts: { text: string; matched: boolean }[] = []; let offset = 0
  for (const range of merged) { if (range.start > offset) parts.push({ text: text.slice(offset, range.start), matched: false }); parts.push({ text: text.slice(range.start, range.end), matched: true }); offset = range.end }
  if (offset < text.length) parts.push({ text: text.slice(offset), matched: false })
  return parts
}
