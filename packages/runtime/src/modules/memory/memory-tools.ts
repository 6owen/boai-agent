/*
 * [INPUT]: Host-scoped memory recall callback, preserving source versions and forget barriers.
 * [OUTPUT]: On-demand relevant recall in ordinary chat and work, without exposing a management dump.
 * [POS]: API/native shared memory lookup; writes still use the original extraction/management workflow.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { z } from 'zod'
import type { EngineContext } from '../../contracts'
export const rememberMemorySchema = z.object({ sourceMessageId: z.string().min(1), quote: z.string().trim().min(1).max(4000) }).strict()
const query = z.object({ query: z.string().trim().min(1).max(1000) }).strict()
export function createMemoryOperations(context: EngineContext) {
  if (!context.recallMemory || context.work?.organization || ['ask', 'request_handoff'].includes(context.decision?.action ?? '')) return []
  return [...(context.rememberMemory ? [{ name: 'remember_memory', schema: rememberMemorySchema, description: 'Retain an exact quote from the current real user message when they ask you to remember it. Supply that actual source message ID. The host preserves source, attribution and scope; no invented facts, assistant claims, old forgotten text or arbitrary memory files. Returns whether the quote is actually retained.', execute: async (input: unknown) => context.rememberMemory!(rememberMemorySchema.parse(input)) }] : []), { name: 'search_memory', schema: query, description: 'Recall your own relevant authorized memories and source-message references. Use for earlier preferences, decisions and unfinished agreements before saying you do not remember. Try concrete keywords or names. Results retain attribution and original dates; planned actions are not completed actions. This is bounded relevance retrieval, not a complete history.', execute: async (input: unknown) => {
    context.signal.throwIfAborted()
    const result = await context.recallMemory!(query.parse(input).query)
    context.signal.throwIfAborted()
    return { entries: result.entries, coverage: 'bounded-authorized-recall' }
  } }]
}
