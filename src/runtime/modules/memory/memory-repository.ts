import { randomUUID } from 'node:crypto'
import type { MemoryCandidate, MemoryEntry, MemoryInput, MemoryQuery, MemoryView } from '../../../shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'

const stamp = () => new Date().toISOString()
export function memoryNamespace(query: MemoryQuery) {
  if (!query.agentId || query.agentId.length > 200) throw new Error('无效员工范围')
  if (query.scope === 'profile') {
    if (query.conversationId) throw new Error('基础资料不能指定会话')
    return `employee:${query.agentId}:profile`
  }
  if (query.scope !== 'conversation' || !query.conversationId) throw new Error('请选择记忆所属会话')
  return `employee:${query.agentId}:conversation:${query.conversationId}`
}
const belongs = (entry: MemoryEntry, query: MemoryQuery) => entry.ownerAgentId === query.agentId && entry.scope === query.scope && entry.conversationId === query.conversationId

/** SQLite is the sole memory authority. Tombstones and epochs reject stale model writes. */
export class MemoryRepository {
  private entries = new Map<string, MemoryEntry>()
  private epochs = new Map<string, number>()
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly store: ProductStore) {}
  async init() {
    this.entries = new Map((await this.store.load<MemoryEntry>('memory')).map(entry => [entry.id, entry]))
    this.epochs = new Map((await this.store.load<{ id: string; epoch: number }>('memoryEpochs')).map(row => [row.id, row.epoch]))
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.tail.then(operation); this.tail = promise.catch(() => undefined); return promise
  }
  private view(query: MemoryQuery): MemoryView {
    const namespace = memoryNamespace(query)
    return structuredClone({ namespace, epoch: this.epochs.get(namespace) ?? 0, entries: [...this.entries.values()].filter(entry => belongs(entry, query) && !entry.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) })
  }
  async get(query: MemoryQuery): Promise<MemoryView> { await this.tail; return this.view(query) }
  private check(query: MemoryQuery, expected: number) {
    const view = this.view(query)
    if (view.epoch !== expected) throw new Error('记忆已变更，请刷新后再保存')
    return view
  }
  private async persist(query: MemoryQuery, entries: MemoryEntry[]) {
    const namespace = memoryNamespace(query), epoch = (this.epochs.get(namespace) ?? 0) + 1
    await this.store.write([...entries.map(value => ({ collection: 'memory', id: value.id, value })), { collection: 'memoryEpochs', id: namespace, value: { id: namespace, epoch } }])
    for (const entry of entries) this.entries.set(entry.id, entry)
    this.epochs.set(namespace, epoch)
    return this.view(query)
  }
  save(input: MemoryInput): Promise<MemoryView> {
    return this.serial(async () => {
      this.check(input, input.expectedEpoch)
      const content = input.content.trim()
      if (!content || content.length > 4000) throw new Error('记忆内容需为 1–4000 个字符')
      const previous = input.id ? this.entries.get(input.id) : undefined
      if (input.id && (!previous || !belongs(previous, input) || previous.deletedAt)) throw new Error('记忆条目不存在或已删除')
      const time = stamp()
      const entry: MemoryEntry = { id: previous?.id ?? randomUUID(), ownerAgentId: input.agentId, scope: input.scope, ...(input.conversationId ? { conversationId: input.conversationId } : {}), content, sourceMessageIds: input.sourceMessageIds ?? previous?.sourceMessageIds ?? [], sourceResourceIds: input.sourceResourceIds ?? previous?.sourceResourceIds ?? [], origin: input.origin ?? 'user', version: (previous?.version ?? 0) + 1, createdAt: previous?.createdAt ?? time, updatedAt: time }
      return this.persist(input, [entry])
    })
  }
  delete(query: MemoryQuery, id: string, expectedEpoch: number): Promise<MemoryView> {
    return this.serial(async () => {
      this.check(query, expectedEpoch)
      const previous = this.entries.get(id)
      if (!previous || !belongs(previous, query) || previous.deletedAt) throw new Error('记忆条目不存在或已删除')
      return this.persist(query, [{ ...previous, deletedAt: stamp(), updatedAt: stamp(), version: previous.version + 1 }])
    })
  }
  clear(query: MemoryQuery, expectedEpoch: number): Promise<MemoryView> {
    return this.serial(async () => {
      const view = this.check(query, expectedEpoch)
      return this.persist(query, view.entries.map(entry => ({ ...entry, deletedAt: stamp(), updatedAt: stamp(), version: entry.version + 1 })))
    })
  }
  extract(query: MemoryQuery, candidates: MemoryCandidate[], expectedEpoch: number, validMessageIds: string[] | Set<string>, validResourceIds: string[] | Set<string>): Promise<MemoryView> {
    return this.serial(async () => {
      const view = this.check(query, expectedEpoch)
      const messages = new Set(validMessageIds), resources = new Set(validResourceIds)
      if (!Array.isArray(candidates) || candidates.length > 8) throw new Error('记忆提取超过条目预算')
      const entries: MemoryEntry[] = [], seen = new Set(view.entries.map(entry => entry.content))
      for (const item of candidates) {
        if (!item || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 4000 || !Array.isArray(item.sourceMessageIds) || !item.sourceMessageIds.length || item.sourceMessageIds.some(id => !messages.has(id)) || (item.sourceResourceIds ?? []).some(id => !resources.has(id))) throw new Error('记忆提取包含无效内容或未授权来源')
        const content = item.content.trim()
        if (seen.has(content)) continue
        seen.add(content)
        entries.push({ id: randomUUID(), ownerAgentId: query.agentId, scope: query.scope, ...(query.conversationId ? { conversationId: query.conversationId } : {}), content, sourceMessageIds: [...new Set(item.sourceMessageIds)], sourceResourceIds: [...new Set(item.sourceResourceIds ?? [])], origin: 'model', version: 1, createdAt: stamp(), updatedAt: stamp() })
      }
      return entries.length ? this.persist(query, entries) : view
    })
  }
  invalidateResources(ids: string[]): Promise<void> {
    return this.invalidateSources(ids, 'sourceResourceIds')
  }
  invalidateMessages(ids: string[]): Promise<void> {
    return this.invalidateSources(ids, 'sourceMessageIds')
  }
  private invalidateSources(ids: string[], field: 'sourceResourceIds' | 'sourceMessageIds'): Promise<void> {
    return this.serial(async () => {
      const scopes = new Map<string, { query: MemoryQuery; entries: MemoryEntry[] }>()
      for (const entry of this.entries.values()) if (!entry.deletedAt && entry[field].some(id => ids.includes(id))) {
        const query: MemoryQuery = { agentId: entry.ownerAgentId, scope: entry.scope, ...(entry.conversationId ? { conversationId: entry.conversationId } : {}) }, key = memoryNamespace(query)
        const group = scopes.get(key) ?? { query, entries: [] }
        group.entries.push({ ...entry, deletedAt: stamp(), updatedAt: stamp(), version: entry.version + 1 }); scopes.set(key, group)
      }
      for (const scope of scopes.values()) await this.persist(scope.query, scope.entries)
    })
  }
  async invalidateConversation(agentId: string, conversationId: string) {
    const query: MemoryQuery = { agentId, conversationId, scope: 'conversation' }
    // Keep the epoch guard inside the queue so revocation cannot race extraction.
    return this.serial(async () => this.persist(query, this.view(query).entries.map(entry => ({ ...entry, deletedAt: stamp(), updatedAt: stamp(), version: entry.version + 1 }))))
  }
}
