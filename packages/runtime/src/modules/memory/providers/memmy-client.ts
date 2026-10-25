/*
 * [INPUT]: R-E1/R-E2 Memmy MemoryRestClient and request types at 8cd095c7f67300b6582a912bdd7fd33163d5e5b4.
 * [OUTPUT]: Narrow Memmy service client for conversation, memory and passive evidence routes.
 * [POS]: External provider transport; adapted from Memory/src/client/rest-client.ts and Memory/src/types.ts.
 * [PROTOCOL]: Keep upstream identity, MEMMY-LICENSE.txt, this Header, .folder.md and Memory spec 15 in sync.
 */
// Adaptations: only required routes/types, bounded timeout, AbortSignal, loopback-only endpoint.
// Copyright (c) MemTensor contributors. Licensed under the MIT license in MEMMY-LICENSE.txt.
export interface MemmyNamespace { source: string; profileId: string; sessionKey?: string; userId?: string; projectId?: string }
export interface MemmyEnvelope { requestId?: string; adapterId?: string; namespace?: MemmyNamespace; timeZone?: string }
export interface MemmySessionOpen extends MemmyEnvelope { sessionId?: string; source?: string; profileId?: string; meta?: Record<string, unknown> }
export interface MemmyTurnStart extends MemmyEnvelope { sessionId: string; query: string; turnId?: string; contextBudget?: number }
export interface MemmyTurnComplete extends MemmyEnvelope { sessionId: string; query: string; answer: string; status?: 'succeeded' | 'failed' | 'cancelled'; recallApplied?: boolean; sourceMemoryIds?: string[] }
export interface MemmySearch extends MemmyEnvelope { query: string; sessionId?: string; turnId?: string; limit?: number; contextBudget?: number; includeInjectedContext?: boolean; verbose?: boolean }
export interface MemmyAdd extends MemmyEnvelope { content: string; source?: string; sessionId?: string; turnId?: string; createdAt?: string }
export interface MemmyEvidenceSync extends MemmyEnvelope { action: 'upsert' | 'delete'; source: string; sourceRecordId: string; revision: string; title?: string; summary?: string; content?: string; startedAt?: string; endedAt?: string; provenance?: Record<string, unknown>; parentSourceRecordIds?: string[] }
export interface MemmyEvidenceStatus extends MemmyEnvelope { source: string; sourceRecordIds: string[] }
export interface MemmySourceTurnComplete extends MemmyEnvelope {
  source: string
  sourceTurn: { source: string; profileId: string; conversationId: string; turnId: string; startedAt: string; completedAt: string; completionEvidence: string; sequence?: number }
  channel: 'hook'
  query: string
  answer: string
  status: 'succeeded'
  sourceMemoryIds?: string[]
}
export interface MemmyHealth { ok: boolean; serviceVersion: string; protocolVersion: number; storage: { ready: boolean }; models: { summary: { configured: boolean }; embedding: { configured: boolean } }; capabilities: { routes: string[] } }

export class MemmyRestClientError extends Error {
  constructor(readonly status: number, readonly payload: unknown, readonly rawBody: string) {
    super(`Memmy service HTTP ${status}: ${rawBody}`)
  }
}
export class MemmyRestClient {
  private readonly endpoint: string
  private readonly timeZone: string
  constructor(private readonly options: { endpoint: string; token?: string; timeZone?: string; timeoutMs?: number }) {
    const url = new URL(options.endpoint)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Memmy首期只连接本机HTTP服务')
    this.endpoint = url.href.replace(/\/+$/, '')
    this.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  health(signal?: AbortSignal) { return this.request<MemmyHealth>('GET', '/api/v1/health', undefined, signal) }
  openSession(input: MemmySessionOpen, signal?: AbortSignal) { return this.request('POST', '/api/v1/sessions/open', input, signal) }
  startTurn(input: MemmyTurnStart, signal?: AbortSignal) { return this.request('POST', '/api/v1/turns/start', input, signal) }
  completeTurn(turnId: string, input: MemmyTurnComplete, signal?: AbortSignal) { return this.request('POST', `/api/v1/turns/${encodeURIComponent(turnId)}/complete`, input, signal) }
  completeSourceTurn(input: MemmySourceTurnComplete, signal?: AbortSignal) { return this.request('POST', '/api/v1/source-turns/complete', input, signal) }
  search(input: MemmySearch, signal?: AbortSignal) { return this.request('POST', '/api/v1/memory/search', input, signal) }
  getMemory(id: string, signal?: AbortSignal) { return this.request('GET', `/api/v1/memory/${encodeURIComponent(id)}`, undefined, signal) }
  addMemory(input: MemmyAdd, signal?: AbortSignal) { return this.request('POST', '/api/v1/memory/add', input, signal) }
  deleteMemory(id: string, input: MemmyEnvelope & { reason?: string }, signal?: AbortSignal) { return this.request('DELETE', `/api/v1/memory/${encodeURIComponent(id)}`, input, signal) }
  syncEvidence(input: MemmyEvidenceSync, signal?: AbortSignal) { return this.request('POST', '/api/v1/evidence/sync', input, signal) }
  evidenceStatus(input: MemmyEvidenceStatus, signal?: AbortSignal) { return this.request('POST', '/api/v1/evidence/status', input, signal) }
  private async request<T = unknown>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(this.options.timeoutMs ?? 10_000)]),
      headers: { 'x-memmy-time-zone': this.timeZone, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const raw = await response.text()
    let payload: unknown
    try { payload = raw ? JSON.parse(raw) : undefined } catch { throw new Error(`Memmy返回了非JSON响应（HTTP ${response.status}）`) }
    if (!response.ok) throw new MemmyRestClientError(response.status, payload, raw.slice(0, 1000))
    return payload as T
  }
}
