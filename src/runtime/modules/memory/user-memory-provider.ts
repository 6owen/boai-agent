/*
 * [INPUT]: ProductStore, owner vault and optional local Memmy Memory service.
 * [OUTPUT]: Internal CAS provider selection, bounded recall and a transactional public-turn outbox with explicit unknown receipts; persisted external mode suspends on restart.
 * [POS]: Global user-memory provider staging; public Memmy enablement waits for source-level forgetting support.
 * [PROTOCOL]: Update Header, owning .folder.md and Memory spec 15 when changed.
 */
import { z } from 'zod'
import type { ProductStore } from '../../adapters/storage/product-store'
import type { SecretStore } from '../../contracts'
import type { UserMemorySettings, UserMemoryStatus } from '../../../shared/domain/global-memory'
import type { Message } from '../../../shared/domain'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import { MemmyRestClient } from './providers/memmy-client'

const collection = 'userMemoryProvider'
const secretId = 'boai-user-memory-memmy-token'
const defaultEndpoint = 'http://127.0.0.1:18960'
type Saved = Omit<UserMemorySettings, 'hasToken'>
interface TurnSync {
  id: string
  conversationId: string
  turnId: string
  userMessageId: string
  assistantMessageId: string
  completedAt: string
  providerRevision: number
  sourceMemoryIds: string[]
  status: 'pending' | 'sending' | 'accepted' | 'unknown' | 'cleared'
  createdAt: string
  acceptedAt?: string
  externalIds?: string[]
  result?: string
}
const turnCollection = 'userMemoryTurns'
const defaults: Saved = { revision: 0, provider: 'local', endpoint: defaultEndpoint }
const updateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), provider: z.enum(['local', 'memmy']), endpoint: z.string().min(1).max(400).optional(), token: z.string().max(2000).nullable().optional() }).strict()

export class UserMemoryProvider {
  private value: Saved = defaults
  private externalSuspended = false
  private readonly inflight = new Map<string, Promise<void>>()
  get revision() { return this.value.revision }
  get mode() { return this.externalSuspended ? 'local' as const : this.value.provider }
  constructor(private readonly store: ProductStore, private readonly secrets: SecretStore, private readonly changed: () => void) {}
  async init() {
    this.value = await this.store.get<Saved>(collection, 'default') ?? defaults
    // No source-turn cascade revoke exists in the pinned service. A persisted
    // experimental setting cannot silently reactivate external reads/writes.
    this.externalSuspended = this.value.provider === 'memmy'
    await this.store.transaction(async tx => {
      for (const item of await tx.list<TurnSync>(turnCollection)) if (item.status === 'sending') await tx.put({ collection: turnCollection, id: item.id, value: { ...item, status: 'unknown' } })
    })
    if (!this.externalSuspended) for (const item of await this.store.load<TurnSync>(turnCollection)) if (item.status === 'pending') void this.flushTurn(item.id).catch(() => {})
  }
  async settings(): Promise<UserMemorySettings> { return { ...this.value, hasToken: this.secrets.has ? await this.secrets.has(secretId) : !!await this.secrets.get(secretId) } }
  private async client(endpoint = this.value.endpoint, token?: string) { return new MemmyRestClient({ endpoint, token: token ?? await this.secrets.get(secretId) }) }
  async status(): Promise<UserMemoryStatus> {
    const settings = await this.settings()
    const turns = await this.store.load<TurnSync>(turnCollection)
    const sync = { pending: turns.filter(item => item.status === 'pending' || item.status === 'sending').length, unknown: turns.filter(item => item.status === 'unknown').length }
    if (this.externalSuspended) return { settings, reachable: false, sync, error: '外部Memmy模式已暂停：当前版本缺少按来源轮次级联遗忘；本地记忆继续可用。' }
    if (settings.provider !== 'memmy') return { settings, reachable: false, sync }
    try {
      const health = await (await this.client()).health()
      return { settings, reachable: health.ok, serviceVersion: health.serviceVersion, storageReady: health.storage.ready, sync,
        modelsReady: health.models.summary.configured && health.models.embedding.configured }
    } catch (error) { return { settings, reachable: false, sync, error: error instanceof Error ? error.message : String(error) } }
  }
  async configuredClient() { return this.mode === 'memmy' ? this.client() : undefined }
  async recall(input: { conversationId: string; runId: string; query: string; signal: AbortSignal }) {
    if (this.mode !== 'memmy') return undefined
    const result = await (await this.client()).search({
      requestId: `boai-recall:${input.runId}`, adapterId: 'boai-agent',
      namespace: { source: 'boai', profileId: 'boai-local-owner', sessionKey: input.conversationId, userId: 'local-owner' },
      query: input.query, limit: 8, contextBudget: 1200, includeInjectedContext: true, verbose: true,
    }, input.signal)
    const parsed = z.object({ injectedContext: z.string().max(20000), debug: z.object({ sourceMemoryIds: z.array(z.string().max(200)).max(100).optional() }).passthrough().optional() }).passthrough().parse(result)
    return { text: parsed.injectedContext.slice(0, 8000), sourceMemoryIds: parsed.debug?.sourceMemoryIds ?? [], revision: this.value.revision }
  }
  pendingTurn(input: Omit<TurnSync, 'id' | 'status' | 'createdAt'> & { runId: string }) {
    const { runId, ...rest } = input
    return { collection: turnCollection, id: runId, value: { id: runId, ...rest, status: 'pending', createdAt: new Date().toISOString() } satisfies TurnSync }
  }
  flushTurn(id: string): Promise<void> {
    const existing = this.inflight.get(id)
    if (existing) return existing
    const task = this.sendTurn(id).finally(() => this.inflight.delete(id))
    this.inflight.set(id, task)
    return task
  }
  private async sendTurn(id: string) {
    const item = await this.store.get<TurnSync>(turnCollection, id)
    if (!item || item.status !== 'pending' || this.mode !== 'memmy' || item.providerRevision !== this.value.revision) return
    const user = await this.store.get<Message>('messages', item.userMessageId)
    const assistant = await this.store.get<Message>('messages', item.assistantMessageId)
    if (!user || !assistant || user.status !== 'completed' || assistant.status !== 'completed' || user.conversationId !== item.conversationId || assistant.conversationId !== item.conversationId) {
      await this.store.transaction(async tx => { const current = await tx.get<TurnSync>(turnCollection, id); if (current?.status === 'pending') await tx.put({ collection: turnCollection, id, value: { ...current, status: 'cleared' } }) })
      return
    }
    const claimed = await this.store.transaction(async tx => {
      const current = await tx.get<TurnSync>(turnCollection, id)
      if (current?.status !== 'pending') return false
      await tx.put({ collection: turnCollection, id, value: { ...current, status: 'sending' } })
      return true
    })
    if (!claimed) return
    try {
      const response = await (await this.client()).completeSourceTurn({
        requestId: `boai-source-turn:${id}`, adapterId: 'boai-agent',
        namespace: { source: 'boai', profileId: 'boai-local-owner', sessionKey: item.conversationId, userId: 'local-owner' },
        source: 'boai', sourceTurn: { source: 'boai', profileId: 'boai-local-owner', conversationId: item.conversationId, turnId: item.turnId,
          startedAt: user.createdAt, completedAt: item.completedAt, completionEvidence: `assistant_completed:${assistant.id}`, sequence: user.sequence }, channel: 'hook',
        query: user.content, answer: assistant.content, status: 'succeeded', ...(item.sourceMemoryIds.length ? { sourceMemoryIds: item.sourceMemoryIds } : {}),
      })
      const result = z.object({ status: z.enum(['stored', 'existing', 'rejected', 'pending', 'conflict']), reason: z.string().optional(),
        result: z.object({ userMemoryId: z.string().optional(), userMemoryIds: z.array(z.string()).optional(), l1MemoryId: z.string().optional(), l1MemoryIds: z.array(z.string()).optional() }).passthrough().optional() }).passthrough().parse(response)
      const externalIds = [...new Set([result.result?.userMemoryId, ...(result.result?.userMemoryIds ?? []), result.result?.l1MemoryId, ...(result.result?.l1MemoryIds ?? [])].filter((value): value is string => !!value))]
      const accepted = ['stored', 'existing', 'rejected'].includes(result.status)
      await this.store.transaction(async tx => { const current = await tx.get<TurnSync>(turnCollection, id); if (current?.status === 'sending') await tx.put({ collection: turnCollection, id, value: { ...current, status: accepted ? 'accepted' : 'unknown', ...(accepted ? { acceptedAt: new Date().toISOString() } : {}), externalIds, result: result.reason ?? result.status } }) })
    } catch {
      await this.store.transaction(async tx => { const current = await tx.get<TurnSync>(turnCollection, id); if (current?.status === 'sending') await tx.put({ collection: turnCollection, id, value: { ...current, status: 'unknown' } }) })
    }
    this.changed()
  }
  async close() { await Promise.allSettled([...this.inflight.values()]) }
  async configure(raw: z.infer<typeof updateSchema>) {
    const input = updateSchema.parse(raw)
    if (input.expectedRevision !== this.value.revision) throw new ApplicationValidationError('REVISION_CONFLICT', '记忆提供方设置已改变，请刷新后重试')
    const endpoint = input.endpoint ?? this.value.endpoint
    const priorToken = await this.secrets.get(secretId)
    const token = input.token === undefined ? priorToken : input.token || undefined
    // Validate endpoint even when local mode is selected; a later switch must not activate an arbitrary URL.
    const client = new MemmyRestClient({ endpoint, token })
    if (input.provider === 'memmy') {
      const health = await client.health()
      if (!health.ok || !health.storage.ready || !health.models.summary.configured || !health.models.embedding.configured) throw new ApplicationValidationError('INVALID_INPUT', 'Memmy服务、存储或模型尚未就绪')
    }
    const next: Saved = { revision: this.value.revision + 1, provider: input.provider, endpoint }
    try {
      if (input.token !== undefined) { if (token) await this.secrets.set(secretId, token); else await this.secrets.delete(secretId) }
      await this.store.transaction(async tx => {
        const saved = await tx.get<Saved>(collection, 'default') ?? defaults
        if (saved.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '记忆提供方设置已改变，请刷新后重试')
        await tx.put({ collection, id: 'default', value: next })
      })
    } catch (error) {
      if (input.token !== undefined) { if (priorToken) await this.secrets.set(secretId, priorToken); else await this.secrets.delete(secretId) }
      throw error
    }
    this.value = next; this.externalSuspended = false; this.changed()
    return this.settings()
  }
  operations(): ApplicationOperation[] { return [
    { name: 'memory.provider.status', description: '读取本人全局记忆提供方、服务状态与模型就绪状态；不返回凭据。', input: z.object({}).strict(), effect: 'read', resultType: 'UserMemoryStatus', ownerOnly: true, execute: () => this.status() },
  ] }
}
