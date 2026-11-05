/*
 * [OUTPUT]: 普通API员工与Bobo共用原文检索入口，来源仍由宿主按员工授权。
 * [INPUT]: Host history capability and active API execution identity.
 * [OUTPUT]: Model-selectable raw history tool; no forced model call.
 * [POS]: Mastra adapter only; retrieval and prefetch share the source-neutral core.
 * [PROTOCOL]: Update Header and mastra/.folder.md on change.
 */
import type { EngineContext } from '../../contracts'
import { historySearchSchema } from '../../modules/conversations/history-search'
export function createHistorySearchOperations(context: EngineContext) {
  if (!context.historySearch || context.historySearch.settings.mode === 'off' || context.conversation.kind !== 'direct' || context.conversation.channel || context.work?.organization || context.groupCoordination?.mode === 'ordered' || context.decision && !['reply', 'ask'].includes(context.decision.action)) return []
  return [{ name: 'search_history', schema: historySearchSchema, description: 'Search the current employee’s authorized original chats and task conversations without embeddings. Proactively consider past exchanges when relevant; no explicit user request is required. Use short literal keywords, not the whole question. Returns original dates, attribution, neighbors and applied settings. Optional window overrides owner defaults by message count or original timestamp seconds; context is a symmetric message-count shorthand. Zero hits are not proof of absence. Historical plans are not proof of completion; old weather is an old reading.', execute: async (input: unknown) => {
    context.signal.throwIfAborted()
    const result = await context.historySearch!.search(historySearchSchema.parse(input))
    context.signal.throwIfAborted()
    return result
  } }]
}
