/*
 * [INPUT]: Host-authorized public source cuts and the original ProductStore transaction authority.
 * [OUTPUT]: CAS context streams, checkpoints, sealed segments and durable maintenance receipts; no message consumption or tool replay.
 * [POS]: Mastra working-context persistence; summaries are derived, product conversations and work remain authoritative.
 * [PROTOCOL]: Update Header and contexts/.folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Message } from '../../../shared/domain'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'

export const CONTEXT_VERSION = 1
export const contextCollections = ['contextStreams', 'contextSessions', 'contextCheckpoints', 'contextMaintenance', 'contextStepCheckpoints'] as const
export const contextHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export interface ContextMetrics { basis: 'public-source' | 'provider-prompt'; estimatedInputTokens: number; estimatedRemainingTokens: number; windowSource: 'service-declared' | 'unknown-policy'; modelId: string; inputLimit: number; contextWindow?: number }
export interface ContextSource { id: string; conversationId: string; sequence: number; hash: string }
export const contextSource = (message: Message): ContextSource => ({ id: message.id, conversationId: message.conversationId, sequence: message.sequence, hash: contextHash(message) })
export interface ContextOwner { agentId: string; conversationId: string; scopeVersion: string }
export interface ContextStream extends ContextOwner { id: string; activeSessionId: string; revision: number; checkpointId?: string; maintenanceId?: string; version: number }
export interface ContextCheckpoint extends ContextOwner { id: string; streamId: string; sessionId: string; runId: string; summary: string; sources: ContextSource[]; previousCheckpointId?: string; version: number; createdAt: string }
const sourceSchema = z.object({ id: z.string().min(1), conversationId: z.string().min(1), sequence: z.number().int().nonnegative(), hash: z.string().regex(/^[a-f0-9]{64}$/) })
const checkpointSchema = z.object({ id: z.string(), agentId: z.string(), conversationId: z.string(), scopeVersion: z.string(), streamId: z.string(), sessionId: z.string(), runId: z.string(), summary: z.string().min(1).max(32000), sources: z.array(sourceSchema).max(20000), previousCheckpointId: z.string().optional(), version: z.literal(CONTEXT_VERSION), createdAt: z.string() })
const stepCheckpointSchema = checkpointSchema.omit({ createdAt: true }).extend({ updatedAt: z.string(), tools: z.array(z.object({ toolCallId: z.string().min(1), hash: z.string().min(1) })).min(1).max(20000) })
export interface ContextView { stream: ContextStream; checkpoint?: ContextCheckpoint; messages: Message[]; resumedSteps?: { runId: string; summary: string }[] }
export interface ContextMaintenance extends ContextOwner { id: string; streamId: string; runId: string; expectedRevision: number; action: 'compact' | 'rotate'; status: 'preparing' | 'committed' | 'failed'; startedAt: string; checkpointId?: string; previousCheckpointId?: string; reason?: string; estimatedInputTokens?: number; estimatedRemainingTokens?: number }
export interface ContextPort {
  read(): Promise<ContextView>
  begin(view: ContextView, action: ContextMaintenance['action']): Promise<ContextMaintenance>
  commit(operation: ContextMaintenance, summary: string, sources: ContextSource[], metrics: ContextMetrics): Promise<ContextView>
  fail(operation: ContextMaintenance, reason: string): Promise<void>
  recordStep?(summary: string, tools: { toolCallId: string; hash: string }[], metrics: ContextMetrics): Promise<void>
  history(input: { messageId?: string; afterSequence?: number; limit?: number; query?: string }): Promise<Message[]>
}
export class StaleContextError extends Error { constructor() { super('上下文来源或版本已变化，维护候选未提交'); this.name = 'StaleContextError' } }

export class ContextRepository {
  constructor(private readonly store: ProductStore) {}
  private key(owner: ContextOwner) { return contextHash([owner.agentId, owner.conversationId]) }
  private async valid(tx: RecordTransaction, owner: ContextOwner, sources: ContextSource[], allowed: Message[]) {
    if (await tx.get('conversationCleanup', owner.conversationId)) throw new StaleContextError()
    const current = new Map(allowed.map(message => [message.id, contextSource(message)]))
    for (const source of sources) {
      if (source.conversationId !== owner.conversationId || current.get(source.id)?.hash !== source.hash) throw new StaleContextError()
      const row = await tx.get<Message>('messages', source.id)
      if (!row || contextHash(row) !== source.hash) throw new StaleContextError()
    }
  }
  private async checkpoint(tx: RecordTransaction, owner: ContextOwner, id: string | undefined, messages: Message[], sessionId?: string): Promise<ContextCheckpoint | undefined> {
    const seen = new Set<string>(), sources = new Map<string, ContextSource>()
    let head: ContextCheckpoint | undefined
    while (id) {
      if (seen.has(id)) return
      seen.add(id)
      const parsed = checkpointSchema.safeParse(await tx.get('contextCheckpoints', id))
      if (!parsed.success) return
      const row = parsed.data
      if (row.id !== id || row.streamId !== this.key(owner) || row.agentId !== owner.agentId || row.conversationId !== owner.conversationId || row.scopeVersion !== owner.scopeVersion) return
      if (!head) { head = row; if (sessionId && row.sessionId !== sessionId) return }
      for (const source of row.sources) {
        if (sources.has(source.id) && sources.get(source.id)!.hash !== source.hash) return
        sources.set(source.id, source)
      }
      id = row.previousCheckpointId
    }
    if (!head || !sources.size) return
    try { await this.valid(tx, owner, [...sources.values()], messages) }
    catch (error) { if (error instanceof StaleContextError) return; throw error }
    return { ...head, sources: [...sources.values()] }
  }
  async read(owner: ContextOwner, messages: Message[]): Promise<ContextView> {
    return this.store.transaction(async tx => {
      if (await tx.get('conversationCleanup', owner.conversationId)) throw new StaleContextError()
      const id = this.key(owner)
      let stream = await tx.get<ContextStream>('contextStreams', id)
      if (!stream) {
        stream = { ...owner, id, activeSessionId: randomUUID(), revision: 0, version: CONTEXT_VERSION }
        await tx.put({ collection: 'contextStreams', id, value: stream })
        await tx.put({ collection: 'contextSessions', id: stream.activeSessionId, value: { ...owner, id: stream.activeSessionId, streamId: id, status: 'active', createdAt: new Date().toISOString() } })
      }
      const checkpoint = await this.checkpoint(tx, owner, stream.checkpointId, messages, stream.activeSessionId)
      return { stream, checkpoint, messages: structuredClone(messages) }
    })
  }
  async begin(owner: ContextOwner, runId: string, view: ContextView, action: ContextMaintenance['action']) {
    if (view.stream.id !== this.key(owner)) throw new StaleContextError()
    const operation: ContextMaintenance = { ...owner, id: randomUUID(), streamId: this.key(owner), runId, expectedRevision: view.stream.revision, action, previousCheckpointId: view.checkpoint?.id, status: 'preparing', startedAt: new Date().toISOString() }
    await this.store.transaction(async tx => {
      const current = await tx.get<ContextStream>('contextStreams', operation.streamId)
      if (!current || current.revision !== operation.expectedRevision || await tx.get('conversationCleanup', owner.conversationId)) throw new StaleContextError()
      const active = current.maintenanceId ? await tx.get<ContextMaintenance>('contextMaintenance', current.maintenanceId) : undefined
      if (active?.status === 'preparing') throw new StaleContextError()
      await tx.put({ collection: 'contextStreams', id: current.id, value: { ...current, maintenanceId: operation.id } })
      await tx.put({ collection: 'contextMaintenance', id: operation.id, value: operation })
    })
    return operation
  }
  async commit(operation: ContextMaintenance, summary: string, sources: ContextSource[], messages: Message[], metrics: ContextMetrics, guard?: () => void): Promise<ContextView> {
    if (!summary.trim() || summary.length > 32000) throw new Error('上下文摘要或来源范围无效')
    return this.store.transaction(async tx => {
      const previous = await tx.get<ContextStream>('contextStreams', operation.streamId)
      const saved = await tx.get<ContextMaintenance>('contextMaintenance', operation.id)
      if (!previous || previous.revision !== operation.expectedRevision || previous.maintenanceId !== operation.id || saved?.status !== 'preparing' || saved.scopeVersion !== operation.scopeVersion) throw new StaleContextError()
      const parent = operation.previousCheckpointId ? await this.checkpoint(tx, operation, operation.previousCheckpointId, messages) : undefined
      if (operation.previousCheckpointId && (!parent || previous.checkpointId !== operation.previousCheckpointId)) throw new StaleContextError()
      const inherited = new Map((parent?.sources ?? []).map(source => [source.id, source]))
      const additions = new Map<string, ContextSource>()
      for (const source of sources) {
        if (inherited.has(source.id)) { if (inherited.get(source.id)!.hash !== source.hash) throw new StaleContextError() }
        else additions.set(source.id, source)
      }
      if (additions.size > 20000 || inherited.size + additions.size === 0) throw new Error('单次上下文来源范围无效')
      await this.valid(tx, operation, [...additions.values()], messages)
      guard?.()
      const sessionId = operation.action === 'rotate' ? randomUUID() : previous.activeSessionId
      const checkpoint: ContextCheckpoint = { agentId: operation.agentId, conversationId: operation.conversationId, scopeVersion: operation.scopeVersion, id: randomUUID(), streamId: previous.id, sessionId, runId: operation.runId, version: CONTEXT_VERSION, summary, sources: [...additions.values()], previousCheckpointId: parent?.id, createdAt: new Date().toISOString() }
      if (operation.action === 'rotate') {
        const old = await tx.get<Record<string, unknown>>('contextSessions', previous.activeSessionId)
        await tx.put({ collection: 'contextSessions', id: previous.activeSessionId, value: { ...old, id: previous.activeSessionId, conversationId: operation.conversationId, agentId: operation.agentId, status: 'sealed', endedAt: checkpoint.createdAt, nextSessionId: sessionId } })
        await tx.put({ collection: 'contextSessions', id: sessionId, value: { id: sessionId, agentId: operation.agentId, conversationId: operation.conversationId, streamId: previous.id, status: 'active', previousSessionId: previous.activeSessionId, createdAt: checkpoint.createdAt, checkpointId: checkpoint.id } })
      }
      const stream: ContextStream = { ...previous, maintenanceId: undefined, scopeVersion: operation.scopeVersion, activeSessionId: sessionId, revision: previous.revision + 1, checkpointId: checkpoint.id, version: CONTEXT_VERSION }
      await tx.put({ collection: 'contextCheckpoints', id: checkpoint.id, value: checkpoint })
      await tx.put({ collection: 'contextStreams', id: stream.id, value: stream })
      await tx.put({ collection: 'contextMaintenance', id: operation.id, value: { ...saved, status: 'committed', checkpointId: checkpoint.id, ...metrics } })
      guard?.()
      return { stream, checkpoint: { ...checkpoint, sources: [...inherited.values(), ...additions.values()] }, messages: structuredClone(messages) }
    })
  }
  async fail(operation: ContextMaintenance, reason: string) {
    await this.store.transaction(async tx => {
      const saved = await tx.get<ContextMaintenance>('contextMaintenance', operation.id)
      if (saved?.status === 'preparing') await tx.put({ collection: 'contextMaintenance', id: saved.id, value: { ...saved, status: 'failed', reason: reason.slice(0, 300) } })
      const stream = await tx.get<ContextStream>('contextStreams', operation.streamId)
      if (stream?.maintenanceId === operation.id) await tx.put({ collection: 'contextStreams', id: stream.id, value: { ...stream, maintenanceId: undefined } })
    })
  }
  async recordStep(owner: ContextOwner, runId: string, summary: string, tools: { toolCallId: string; hash: string }[], messages: Message[], metrics: ContextMetrics, guard?: () => void) {
    if (!summary.trim() || summary.length > 32000) throw new Error('步骤交接摘要无效')
    await this.store.transaction(async tx => {
      const stream = await tx.get<ContextStream>('contextStreams', this.key(owner))
      if (!stream) throw new StaleContextError()
      const parent = await this.checkpoint(tx, owner, stream.checkpointId, messages, stream.activeSessionId)
      const covered = new Set(parent?.sources.map(source => source.id))
      const sources = messages.filter(message => !covered.has(message.id)).map(contextSource)
      await this.valid(tx, owner, sources, messages)
      guard?.()
      const id = contextHash([stream.id, runId])
      // A run checkpoint is never loaded as a public-history prefix in another run.
      await tx.put({ collection: 'contextStepCheckpoints', id, value: { ...owner, id, runId, streamId: stream.id, sessionId: stream.activeSessionId, version: CONTEXT_VERSION, summary, sources, previousCheckpointId: parent?.id, tools, ...metrics, updatedAt: new Date().toISOString() } })
      guard?.()
    })
  }
  async resumedSteps(owner: ContextOwner, completed: { runId: string; toolIds: string[] }[], messages: Message[]) {
    return this.store.transaction(async tx => {
      const results: { runId: string; summary: string }[] = []
      for (const entry of completed) {
        const parsed = stepCheckpointSchema.safeParse(await tx.get('contextStepCheckpoints', contextHash([this.key(owner), entry.runId])))
        if (!parsed.success) continue
        const row = parsed.data
        if (row.runId !== entry.runId || row.streamId !== this.key(owner) || row.agentId !== owner.agentId || row.conversationId !== owner.conversationId || row.scopeVersion !== owner.scopeVersion || !row.tools.every(tool => entry.toolIds.includes(tool.toolCallId))) continue
        if (row.previousCheckpointId && !await this.checkpoint(tx, owner, row.previousCheckpointId, messages)) continue
        try { await this.valid(tx, owner, row.sources, messages) }
        catch (error) { if (error instanceof StaleContextError) continue; throw error }
        results.push({ runId: entry.runId, summary: row.summary })
      }
      return results
    })
  }
  async forgetAgent(agentId: string) {
    for (const collection of contextCollections) {
      const rows = await this.store.load<{ id: string; agentId: string }>(collection)
      await this.store.write([], rows.filter(row => row.agentId === agentId).map(row => ({ collection, id: row.id })))
    }
  }
  async recover() {
    // A crashed candidate is never promoted or retried: only a committed pointer is active.
    for (const operation of await this.store.load<ContextMaintenance>('contextMaintenance')) if (operation.status === 'preparing') await this.fail(operation, '运行已中断，候选未提交；不重放请求')
  }
}
