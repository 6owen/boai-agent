/*
 * [INPUT]: Employee-owned history preferences and per-query original-evidence requests.
 * [OUTPUT]: One configuration contract for settings, tools and prefetch; no model/storage dependency.
 * [POS]: Raw conversation search contracts, separate from extracted Memory and OM configuration.
 * [PROTOCOL]: Update Header, shared/domain/.folder.md and public exports on change.
 */
import type { Message } from './index'
export const HISTORY_LIMITS = { hits: 8, neighbors: 20, windowSeconds: 3600, characters: 20000, minCharacters: 1000, prefetchCharacters: 4000, prefetchHits: 2, prefetchQueries: 3 } as const
export type HistoryWindow = { kind: 'messages'; before: number; after: number } | { kind: 'time'; beforeSeconds: number; afterSeconds: number }
export interface HistorySearchOptions { mode: 'agent' | 'prefetch' | 'off'; window: HistoryWindow; limit: number; maxCharacters: number }
export interface HistorySearchSettings extends HistorySearchOptions { agentId: string; revision: number }
export const defaultHistorySettings = (agentId: string): HistorySearchSettings => ({ agentId, revision: 0, mode: 'agent', window: { kind: 'messages', before: 1, after: 1 }, limit: 3, maxCharacters: HISTORY_LIMITS.characters })
export interface HistorySearchQuery { query: string; from?: string; to?: string; limit?: number; context?: number; window?: HistoryWindow }
export interface HistorySearchMatch { id: string; content: string }
export interface HistoryEvidence { messageId: string; createdAt: string; senderType: Message['senderType']; senderName: string; content: string; truncated: boolean; charOffset?: number; totalCharacters?: number }
export interface HistorySearchHit { conversationId: string; conversationTitle: string; evidence: HistoryEvidence; before: HistoryEvidence[]; after: HistoryEvidence[]; contextTruncated?: boolean }
export interface HistorySearchResult { query: string; matching: 'fts5-trigram' | 'literal'; hasMore: boolean; elapsedMs: number; sqlMs: number; hits: HistorySearchHit[]; coverage: string; applied?: { revision: number; window: HistoryWindow; limit: number; maxCharacters: number } }
export interface HistoryPrefetchResult { queries: string[]; hits: HistorySearchHit[]; hasMore: boolean; elapsedMs: number; sqlMs: number; revision: number }
