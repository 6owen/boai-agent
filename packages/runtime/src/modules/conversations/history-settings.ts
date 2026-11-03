/*
 * [INPUT]: Shared history defaults, owner edits and the existing product store.
 * [OUTPUT]: Validated settings and revision-checked writes, without modifying Memory/OM.
 * [POS]: Single configuration authority for history tools and prefetch.
 * [PROTOCOL]: Update Header and conversations/.folder.md on change.
 */
import { z } from 'zod'
import { HISTORY_LIMITS, defaultHistorySettings, type HistorySearchSettings } from '@boai/shared/domain/history-search'
import type { ProductStore } from '../../adapters/storage/product-store'
const count = z.number().int().min(0).max(HISTORY_LIMITS.neighbors), seconds = z.number().int().min(0).max(HISTORY_LIMITS.windowSeconds)
export const historyWindowSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('messages'), before: count, after: count }).strict(), z.object({ kind: z.literal('time'), beforeSeconds: seconds, afterSeconds: seconds }).strict()])
export const historyOptionsSchema = z.object({ mode: z.enum(['agent', 'prefetch', 'off']), window: historyWindowSchema, limit: z.number().int().min(1).max(HISTORY_LIMITS.hits), maxCharacters: z.number().int().min(HISTORY_LIMITS.minCharacters).max(HISTORY_LIMITS.characters) }).strict()
export const configureHistorySchema = z.object({ agentId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), settings: historyOptionsSchema }).strict()
export async function readHistorySettings(store: ProductStore, agentId: string): Promise<HistorySearchSettings> {
  return await store.transaction(tx => tx.get<HistorySearchSettings>('historySearchSettings', agentId)) ?? defaultHistorySettings(agentId)
}
export async function configureHistorySettings(store: ProductStore, raw: unknown) {
  const input = configureHistorySchema.parse(raw)
  return store.transaction(async tx => {
    const previous = await tx.get<HistorySearchSettings>('historySearchSettings', input.agentId) ?? defaultHistorySettings(input.agentId)
    if (previous.revision !== input.expectedRevision) throw new Error('历史检索设置已变化，请刷新后再保存')
    const value: HistorySearchSettings = { ...input.settings, agentId: input.agentId, revision: previous.revision + 1 }
    await tx.put({ collection: 'historySearchSettings', id: input.agentId, value })
    return value
  })
}
