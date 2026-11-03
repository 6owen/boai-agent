/*
 * [INPUT]: One owner settings snapshot and host-serialized authorized query execution.
 * [OUTPUT]: Shared tool search and optional local prefetch without another model request.
 * [POS]: History execution policy; source authorization and storage stay behind the supplied port.
 * [PROTOCOL]: Update Header and conversations/.folder.md on change.
 */
import { HISTORY_LIMITS, type HistorySearchQuery, type HistorySearchResult, type HistorySearchSettings, type HistoryPrefetchResult } from '@boai/shared/domain/history-search'
import { historyGuidance } from './history-guidance'
export interface HistorySearchCapability {
  settings: HistorySearchSettings
  guidance: string
  search(input: HistorySearchQuery): Promise<HistorySearchResult>
  prefetch(text: string, visibleIds: string[]): Promise<HistoryPrefetchResult>
}
const stopwords = new Set('我 你 他 她 它 我们 你们 他们 这个 那个 什么 怎么 怎么样 现在 知道 可以 一下 一个 之前 时候 事情 今天 请 帮 帮我 告诉 多少 有没有 hi hello 你好 早上好 谢谢 您好 晚安 the a an is are was were do did you i me my it this that what when how please'.split(' '))
export function historyKeywords(text: string): string[] {
  const words = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).map(part => part.segment.toLowerCase())
  return [...new Set(words.filter(word => [...word].length >= 2 && !/^\d+$/.test(word) && !stopwords.has(word)))].slice(0, HISTORY_LIMITS.prefetchQueries)
}
export function createHistoryCapability(settings: HistorySearchSettings, search: (input: HistorySearchQuery, options?: { excludeIds: ReadonlySet<string>; maxCharacters: number }) => Promise<HistorySearchResult>): HistorySearchCapability {
  return { settings, guidance: historyGuidance(settings), search: input => search(input), prefetch: async (text, visibleIds) => {
    const start = performance.now(), result: HistoryPrefetchResult = { queries: [], hits: [], hasMore: false, sqlMs: 0, elapsedMs: 0, revision: settings.revision }
    if (settings.mode !== 'prefetch') return result
    const queries = historyKeywords(text), seen = new Set<string>(), budget = Math.min(settings.maxCharacters, HISTORY_LIMITS.prefetchCharacters)
    let characters = 0
    for (const query of queries) {
      const found = await search({ query, limit: HISTORY_LIMITS.prefetchHits }, { excludeIds: new Set(visibleIds), maxCharacters: budget })
      result.queries.push(query); result.sqlMs += found.sqlMs; result.hasMore ||= found.hasMore
      for (const hit of found.hits) {
        if (seen.has(hit.evidence.messageId)) continue
        const unique = { ...hit, before: hit.before.filter(item => !seen.has(item.messageId)), after: hit.after.filter(item => !seen.has(item.messageId)) }
        if (result.hits.length >= HISTORY_LIMITS.prefetchHits || characters + JSON.stringify(unique).length > budget) { result.hasMore = true; continue }
        for (const item of [unique.evidence, ...unique.before, ...unique.after]) seen.add(item.messageId)
        characters += JSON.stringify(unique).length; result.hits.push(unique)
      }
    }
    result.elapsedMs = performance.now() - start
    return result
  } }
}
