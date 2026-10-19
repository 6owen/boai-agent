/*
 * [OUTPUT]: 资源派生记忆失效可限定当前员工，旧共享资料解绑不清除其他员工独立有效来源。
 * [INPUT]: SQLite 原子记录事务、统一记忆合同及确定性范围/生命周期策略。
 * [OUTPUT]: 召回同事务精确核对实际条目/获知授权/输入来源，旧快照保守代际门禁；无关清空不取消任务，相关忘记/纠正/范围/到期仍失效。
 * [OUTPUT]: 自动纠正与手工编辑共用多级派生失效，启动只修复旧失效来源投影且保留无关记忆；兼容旧命名空间的员工统一记忆、事务版本/回执、忘记屏障、来源失效和维护。
 * [POS]: runtime/modules/memory/memory-repository.ts；SQLite 唯一权威，无私有文本缓存。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import type { MemoryCandidate, MemoryEntry, MemoryForget, MemoryInput, MemoryObservation, MemoryQuery, MemoryView } from '../../../shared/domain'
import { MEMORY_ARCHIVE_DAYS, MEMORY_MAX_CANDIDATES, MEMORY_MAX_CONTENT, MEMORY_PAGE_SIZE } from '../../../shared/domain/memory'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { memoryAllowed, memoryStatus, memoryUseScope } from './memory-policy'
import { observationAuthorityFingerprint } from './memory-recall'

const stamp = () => new Date().toISOString()
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
interface Epoch { id: string; epoch: number; invalidationEpoch?: number }
interface Receipt { id: string; fingerprint: string }
export interface ExtractionPolicy {
  conversationId: string
  useScope: 'employee' | 'conversation'
  disclosure: 'private' | 'public'
  requestId: string
  expectedInvalidationEpoch: number
  userMessageIds: string[]
  sourceMemoryIds?: string[]
  messageMemoryIds?: Record<string, string[]>
  messageSourceIds?: Record<string, string[]>
  messageConversationIds?: Record<string, string[]>
  authorizedContexts?: import('../../../shared/domain').MemoryContextRef[]
  attribution?: string
}
export function memoryNamespace(query: Pick<MemoryQuery, 'agentId' | 'scope' | 'conversationId'>) {
  if (!query.agentId || query.agentId.length > 200) throw new Error('无效员工范围')
  if (query.scope === 'employee') return `employee:${query.agentId}`
  if (query.scope === 'profile') {
    if (query.conversationId) throw new Error('基础资料不能指定会话')
    return `employee:${query.agentId}:profile`
  }
  if (query.scope !== 'conversation' || !query.conversationId) throw new Error('请选择记忆所属会话')
  return `employee:${query.agentId}:conversation:${query.conversationId}`
}
const belongs = (entry: MemoryEntry, query: MemoryQuery) => entry.ownerAgentId === query.agentId && (query.scope === 'employee' || entry.scope === query.scope && entry.conversationId === query.conversationId)
const sourceConversations = (entry: MemoryEntry) => entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])

/** All checks and writes run under SQLite BEGIN IMMEDIATE, including other hosts/connections. */
export class MemoryRepository {
  constructor(private readonly store: ProductStore) {}
  async init() {
    return this.store.transaction(async tx => {
      let runtime = await tx.get<{ id: string; version: number; activatedAt: string }>('memoryRuntime', 'policy-v2')
      if (!runtime) { runtime = { id: 'policy-v2', version: 2, activatedAt: stamp() }; await tx.put({ collection: 'memoryRuntime', id: runtime.id, value: runtime }) }
      const entries = await tx.list<MemoryEntry>('memory')
      for (const agentId of new Set(entries.map(entry => entry.ownerAgentId))) {
        const roots = entries.filter(entry => entry.ownerAgentId === agentId && memoryStatus(entry) !== 'active').map(entry => entry.id)
        const descendants = this.expiredDescendants(entries.filter(entry => entry.ownerAgentId === agentId), roots)
        if (descendants.length) await this.put(tx, { agentId, scope: 'employee' }, descendants, true)
      }
      return runtime.activatedAt
    })
  }
  // Existing history cleanup callers need no cache repair: every read uses SQLite.
  forgetHistory(_ids: string[], _epochs: { id: string; epoch: number }[]) {}
  private async view(tx: RecordTransaction, query: MemoryQuery): Promise<MemoryView> {
    const namespace = memoryNamespace(query), epoch = await tx.get<Epoch>('memoryEpochs', namespace)
    const employee = await tx.get<Epoch>('memoryEpochs', `employee:${query.agentId}`)
    const activeWorks = new Set((await tx.list<import('../../../shared/domain').WorkItem>('workItems')).filter(work => !['delivered', 'failed', 'cancelled', 'interrupted'].includes(work.status)).map(work => work.id))
    const statusOf = (entry: MemoryEntry) => memoryStatus(entry) === 'active' && entry.contextRef?.kind === 'work' && !activeWorks.has(entry.contextRef.id) ? 'expired' as const : memoryStatus(entry)
    const all = (await tx.list<MemoryEntry>('memory')).filter(entry => {
      if (!belongs(entry, query) || memoryStatus(entry) === 'deleted') return false
      if (query.kind && (entry.kind ?? (entry.scope === 'profile' ? 'long_term' : 'experience')) !== query.kind) return false
      if (query.sourceConversationId && !sourceConversations(entry).includes(query.sourceConversationId)) return false
      if (query.search && !entry.content.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())) return false
      if (query.status === 'active' && statusOf(entry) !== 'active') return false
      if (query.status === 'history' && statusOf(entry) === 'active') return false
      return true
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const rows = query.before ? all.filter(entry => entry.createdAt < query.before!.createdAt || entry.createdAt === query.before!.createdAt && entry.id < query.before!.id) : all
    const limit = query.limit ? Math.min(MEMORY_PAGE_SIZE, Math.max(1, query.limit)) : rows.length
    const entries = rows.slice(0, limit).map(entry => ({ ...entry, status: statusOf(entry) })), last = entries.at(-1)
    return { namespace, epoch: epoch?.epoch ?? 0, invalidationEpoch: employee?.invalidationEpoch ?? 0, entries, total: all.length, ...(last && rows.length > limit ? { nextCursor: { createdAt: last.createdAt, id: last.id } } : {}) }
  }
  get(query: MemoryQuery) { return this.store.transaction(tx => this.view(tx, query)) }
  private async check(tx: RecordTransaction, query: MemoryQuery, expected: number) {
    const view = await this.view(tx, { ...query, before: undefined, limit: undefined, kind: undefined, status: undefined, search: undefined, sourceConversationId: undefined })
    if (view.epoch !== expected) throw new Error('记忆已变更，请刷新后再保存')
    return view
  }
  private async bump(tx: RecordTransaction, agentId: string, entries: MemoryEntry[], invalidation = false) {
    if (invalidation) await tx.put({ collection: 'memoryCleanup', id: agentId, value: { id: agentId } })
    const namespaces = new Set([`employee:${agentId}`, ...entries.filter(entry => entry.scope !== 'employee').map(entry => memoryNamespace({ agentId, scope: entry.scope, conversationId: entry.conversationId }))])
    for (const id of namespaces) {
      const prior = await tx.get<Epoch>('memoryEpochs', id)
      await tx.put({ collection: 'memoryEpochs', id, value: { id, epoch: (prior?.epoch ?? 0) + 1, invalidationEpoch: (prior?.invalidationEpoch ?? 0) + (invalidation ? 1 : 0) } })
    }
  }
  private async put(tx: RecordTransaction, query: MemoryQuery, entries: MemoryEntry[], invalidation = false) {
    for (const entry of entries) await tx.put({ collection: 'memory', id: entry.id, value: entry })
    await this.bump(tx, query.agentId, entries, invalidation)
    if (query.scope !== 'employee' && !entries.some(entry => memoryNamespace({ agentId: query.agentId, scope: entry.scope, conversationId: entry.conversationId }) === memoryNamespace(query))) {
      const id = memoryNamespace(query), prior = await tx.get<Epoch>('memoryEpochs', id)
      await tx.put({ collection: 'memoryEpochs', id, value: { id, epoch: (prior?.epoch ?? 0) + 1 } })
    }
    return this.view(tx, query)
  }
  private async receipt(tx: RecordTransaction, agentId: string, requestId: string | undefined, fingerprint: string) {
    if (!requestId) return false
    const id = `${agentId}:${requestId}`, prior = await tx.get<Receipt>('memoryReceipts', id)
    if (prior && prior.fingerprint !== fingerprint) throw new Error('CONFLICT：同一记忆请求不能提交不同内容')
    if (!prior) await tx.put({ collection: 'memoryReceipts', id, value: { id, fingerprint } })
    return !!prior
  }
  private async rememberForget(tx: RecordTransaction, entry: MemoryEntry) {
    const value: MemoryForget = { id: randomUUID(), ownerAgentId: entry.ownerAgentId, sourceMessageIds: [...entry.sourceMessageIds], sourceMemoryIds: [entry.id, ...(entry.sourceMemoryIds ?? [])], fingerprint: hash(entry.content), createdAt: stamp() }
    await tx.put({ collection: 'memoryForgets', id: value.id, value })
  }
  private async blocked(tx: RecordTransaction, agentId: string, messages: string[], memories: string[], content?: string) {
    return (await tx.list<MemoryForget>('memoryForgets')).some(item => item.ownerAgentId === agentId && (item.sourceMessageIds.some(id => messages.includes(id)) || item.sourceMemoryIds.some(id => memories.includes(id)) || !!content && !messages.length && item.fingerprint === hash(content)))
  }
  private descendants(entries: MemoryEntry[], roots: string[]) {
    const affected = new Set(roots)
    for (let changed = true; changed;) {
      changed = false
      for (const entry of entries) if (!affected.has(entry.id) && entry.sourceMemoryIds?.some(id => affected.has(id))) { affected.add(entry.id); changed = true }
    }
    return affected
  }
  private expiredDescendants(entries: MemoryEntry[], roots: string[]) {
    const affected = this.descendants(entries, roots), original = new Set(roots)
    return entries.filter(entry => !original.has(entry.id) && affected.has(entry.id) && memoryStatus(entry) === 'active')
      .map(entry => ({ ...entry, status: 'expired' as const, version: entry.version + 1, updatedAt: stamp() }))
  }
  save(input: MemoryInput): Promise<MemoryView> {
    return this.store.transaction(async tx => {
      if (await this.receipt(tx, input.agentId, input.requestId, hash(JSON.stringify(input)))) return this.view(tx, input)
      await this.check(tx, input, input.expectedEpoch)
      const content = input.content.trim()
      if (!content || content.length > MEMORY_MAX_CONTENT) throw new Error('记忆内容需为 1–4000 个字符')
      const previous = input.id ? await tx.get<MemoryEntry>('memory', input.id) : undefined
      if (input.id && (!previous || !belongs(previous, input) || previous.deletedAt)) throw new Error('记忆条目不存在或已删除')
      const conversationId = previous?.conversationId ?? input.conversationId ?? input.sourceConversationId
      const useScope = input.useScope ?? (previous ? memoryUseScope(previous) : input.scope === 'conversation' ? 'conversation' : 'employee')
      const contextRef = input.contextRef === null ? undefined : input.contextRef ?? previous?.contextRef
      if (useScope === 'conversation' && !conversationId) throw new Error('仅在此聊天使用的记忆需要来源会话')
      if (useScope === 'context' && !contextRef) throw new Error('请选择关联事项')
      const expiresAt = input.expiresAt === null ? undefined : input.expiresAt ?? previous?.expiresAt
      if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error('无效记忆到期时间')
      if ((input.kind ?? previous?.kind) === 'temporary' && !contextRef && !expiresAt && useScope !== 'conversation') throw new Error('临时记忆需要到期时间、关联事项或仅限本聊天')
      const entry: MemoryEntry = {
        ...previous, id: previous?.id ?? randomUUID(), ownerAgentId: input.agentId, scope: previous?.scope ?? input.scope,
        ...(conversationId ? { conversationId } : {}), content,
        sourceMessageIds: input.sourceMessageIds ?? previous?.sourceMessageIds ?? [], sourceResourceIds: input.sourceResourceIds ?? previous?.sourceResourceIds ?? [],
        origin: input.origin ?? (previous && previous.content === content ? previous.origin : 'user'), schemaVersion: 2, useScope, contextRef, expiresAt,
        kind: input.kind ?? previous?.kind ?? 'long_term', evidence: input.evidence ?? previous?.evidence ?? 'fact',
        disclosure: previous?.disclosure ?? 'private', sourceConversationIds: input.sourceConversationIds ?? previous?.sourceConversationIds ?? (conversationId ? [conversationId] : []),
        pinned: input.pinned ?? previous?.pinned ?? false, status: input.lifecycle ?? previous?.status ?? 'active',
        version: (previous?.version ?? 0) + 1, createdAt: previous?.createdAt ?? stamp(), updatedAt: stamp(),
      }
      if (previous && memoryUseScope(previous) !== 'employee' && useScope === 'employee' && !input.promote) throw new Error('请明确确认将这条记忆用于该员工相关聊天')
      // Editing a fact prevents the old evidence from being automatically extracted as its old version.
      if (previous && previous.content !== content) await this.rememberForget(tx, previous)
      const dependentUpdates: MemoryEntry[] = []
      if (previous && (input.useScope !== undefined || input.lifecycle !== undefined || previous.content !== content || input.expiresAt !== undefined)) {
        const all = (await tx.list<MemoryEntry>('memory')).filter(item => item.ownerAgentId === input.agentId)
        dependentUpdates.push(...this.expiredDescendants(all, [previous.id]))
      }
      return this.put(tx, input, [entry, ...dependentUpdates], !!previous)
    })
  }
  delete(query: MemoryQuery, id: string, expectedEpoch: number, requestId?: string): Promise<MemoryView> {
    return this.store.transaction(async tx => {
      if (await this.receipt(tx, query.agentId, requestId, hash(JSON.stringify({ query, id, expectedEpoch })))) return this.view(tx, query)
      await this.check(tx, query, expectedEpoch)
      const previous = await tx.get<MemoryEntry>('memory', id)
      if (!previous || !belongs(previous, query) || previous.deletedAt) throw new Error('记忆条目不存在或已删除')
      const all = (await tx.list<MemoryEntry>('memory')).filter(entry => entry.ownerAgentId === query.agentId)
      const targets = new Set([id])
      for (let changed = true; changed;) { changed = false; for (const entry of all) if (!targets.has(entry.id) && entry.sourceMemoryIds?.some(id => targets.has(id))) { targets.add(entry.id); changed = true } }
      const removed = all.filter(entry => targets.has(entry.id))
      for (const entry of removed) await this.rememberForget(tx, entry)
      return this.put(tx, query, removed.map(entry => ({ ...entry, content: '', deletedAt: stamp(), status: 'deleted', version: entry.version + 1, updatedAt: stamp() })), true)
    })
  }
  clear(query: MemoryQuery, expectedEpoch: number, requestId?: string): Promise<MemoryView> {
    return this.store.transaction(async tx => {
      if (await this.receipt(tx, query.agentId, requestId, hash(JSON.stringify({ query, expectedEpoch })))) return this.view(tx, query)
      const view = await this.check(tx, query, expectedEpoch)
      for (const entry of view.entries) await this.rememberForget(tx, entry)
      // Observations with no extracted entry are also forgotten by clearing a scope.
      const observations = (await tx.list<MemoryObservation>('memoryObservations')).filter(item => item.ownerAgentId === query.agentId && (query.scope === 'employee' || item.conversationId === query.conversationId))
      for (const item of observations) {
        const forgotten: MemoryForget = { id: randomUUID(), ownerAgentId: query.agentId, sourceMessageIds: item.sourceMessageIds, sourceMemoryIds: item.sourceMemoryIds, createdAt: stamp() }
        await tx.put({ collection: 'memoryForgets', id: forgotten.id, value: forgotten })
      }
      return this.put(tx, query, view.entries.map(entry => ({ ...entry, content: '', deletedAt: stamp(), status: 'deleted', updatedAt: stamp(), version: entry.version + 1 })), true)
    })
  }
  extract(query: MemoryQuery, candidates: MemoryCandidate[], expectedEpoch: number, validMessageIds: string[] | Set<string>, validResourceIds: string[] | Set<string>, policy?: ExtractionPolicy): Promise<MemoryView> {
    return this.store.transaction(async tx => {
      if (policy && await this.receipt(tx, query.agentId, policy.requestId, hash(JSON.stringify({ candidates, policy })))) return this.view(tx, query)
      const view = policy ? await this.view(tx, query) : await this.check(tx, query, expectedEpoch)
      if (policy && view.invalidationEpoch !== policy.expectedInvalidationEpoch) throw new Error('记忆已变更，旧提取结果不能保存')
      const messages = new Set(validMessageIds), resources = new Set(validResourceIds)
      if (!Array.isArray(candidates) || candidates.length > (policy ? MEMORY_MAX_CANDIDATES : 8)) throw new Error('记忆提取超过条目预算')
      const entries: MemoryEntry[] = [], seen = new Set(view.entries.filter(entry => memoryStatus(entry) === 'active').map(entry => entry.content))
      for (const item of candidates) {
        if (!item || typeof item.content !== 'string' || !item.content.trim() || item.content.length > MEMORY_MAX_CONTENT || !Array.isArray(item.sourceMessageIds) || !item.sourceMessageIds.length || item.sourceMessageIds.some(id => !messages.has(id)) || (item.sourceResourceIds ?? []).some(id => !resources.has(id))) throw new Error('记忆提取包含无效内容或未授权来源')
        const content = item.content.trim()
        const replaced = this.descendants(view.entries, (item.supersedes ?? []).map(target => target.id))
        const parents = [...new Set([...(policy?.sourceMemoryIds ?? []), ...item.sourceMessageIds.flatMap(id => policy?.messageMemoryIds?.[id] ?? [])])].filter(id => !replaced.has(id))
        const parentEntries: MemoryEntry[] = []
        for (const id of parents) {
          const parent = await tx.get<MemoryEntry>('memory', id)
          if (!parent || parent.ownerAgentId !== query.agentId || memoryStatus(parent) !== 'active') throw new Error('派生记忆来源已失效')
          parentEntries.push(parent)
        }
        const sourceMessageIds = [...new Set([...item.sourceMessageIds, ...item.sourceMessageIds.flatMap(id => policy?.messageSourceIds?.[id] ?? []), ...parentEntries.flatMap(entry => entry.sourceMessageIds)])]
        if (await this.blocked(tx, query.agentId, sourceMessageIds, parents, content)) continue
        if (seen.has(content)) continue
        const supersedes: string[] = []
        for (const target of item.supersedes ?? []) {
          const prior = await tx.get<MemoryEntry>('memory', target.id)
          if (!policy || !prior || prior.ownerAgentId !== query.agentId || prior.version !== target.version || prior.pinned || memoryStatus(prior) !== 'active' || !item.sourceMessageIds.some(id => policy.userMessageIds.includes(id))) throw new Error('纠正记忆缺少当前有效版本或用户证据')
          await this.rememberForget(tx, prior)
          entries.push({ ...prior, status: 'superseded', version: prior.version + 1, updatedAt: stamp() }); supersedes.push(prior.id)
        }
        let useScope = policy?.useScope ?? (query.scope === 'profile' ? 'employee' : 'conversation')
        if (item.useScope === 'conversation') useScope = 'conversation'
        let contextRef = item.contextRef
        if (contextRef && !policy) throw new Error('临时记忆缺少宿主事项范围')
        if (contextRef && !policy?.authorizedContexts?.some(ref => ref.kind === contextRef!.kind && ref.id === contextRef!.id)) throw new Error('未授权记忆事项')
        if (item.expiresAt && !Number.isFinite(Date.parse(item.expiresAt))) throw new Error('无效记忆到期时间')
        const restrictedParent = parentEntries.find(entry => memoryUseScope(entry) === 'conversation')
        if (restrictedParent) {
          if (restrictedParent.conversationId !== policy?.conversationId || parentEntries.some(entry => memoryUseScope(entry) === 'conversation' && entry.conversationId !== restrictedParent.conversationId)) throw new Error('派生记忆不能扩大来源会话范围')
          useScope = 'conversation'; contextRef = undefined
        } else {
          const contexts = parentEntries.filter(entry => memoryUseScope(entry) === 'context').map(entry => entry.contextRef!)
          if (contexts.some(ref => contexts[0].kind !== ref.kind || contexts[0].id !== ref.id) || contextRef && contexts.some(ref => ref.kind !== contextRef!.kind || ref.id !== contextRef!.id)) throw new Error('派生记忆不能合并不同事项')
          if (contexts.length) contextRef = contexts[0]
        }
        if (item.kind === 'temporary' && !contextRef && !item.expiresAt) useScope = 'conversation'
        seen.add(content)
        entries.push({
          id: randomUUID(), ownerAgentId: query.agentId, scope: query.scope,
          ...(policy?.conversationId ?? query.conversationId ? { conversationId: policy?.conversationId ?? query.conversationId } : {}),
          content, sourceMessageIds, sourceResourceIds: [...new Set([...(item.sourceResourceIds ?? []), ...parentEntries.flatMap(entry => entry.sourceResourceIds)])], origin: 'model',
          version: 1, createdAt: stamp(), updatedAt: stamp(),
          ...(policy ? { schemaVersion: 2 as const, kind: item.kind ?? 'experience', evidence: item.evidence ?? 'claim', useScope: contextRef && useScope !== 'conversation' ? 'context' as const : useScope,
            contextRef, expiresAt: [item.expiresAt, ...parentEntries.map(entry => entry.expiresAt)].filter((value): value is string => !!value).sort()[0], disclosure: parentEntries.some(entry => entry.disclosure === 'private') ? 'private' : policy.disclosure, attribution: policy.attribution,
            sourceConversationIds: [...new Set([policy.conversationId, ...item.sourceMessageIds.flatMap(id => policy.messageConversationIds?.[id] ?? []), ...parentEntries.flatMap(sourceConversations)])], sourceMemoryIds: parents, status: 'active' as const, supersedes } : {}),
        })
      }
      const superseded = entries.filter(entry => entry.status === 'superseded').map(entry => entry.id)
      if (superseded.length) entries.push(...this.expiredDescendants((await tx.list<MemoryEntry>('memory')).filter(entry => entry.ownerAgentId === query.agentId && !entries.some(update => update.id === entry.id)), superseded))
      return entries.length ? this.put(tx, query, entries, superseded.length > 0) : view
    })
  }
  observation(input: MemoryObservation) { return { collection: 'memoryObservations', id: input.id, value: input } }
  observations(agentId: string) {
    return this.store.transaction(async tx => {
      const runtime = await tx.get<{ activatedAt: string }>('memoryRuntime', 'policy-v2')
      const entries = (await tx.list<MemoryObservation>('memoryObservations')).filter(item => item.ownerAgentId === agentId && !!runtime && item.createdAt >= runtime.activatedAt)
      const allowed: MemoryObservation[] = []
      for (const item of entries) if (!await this.blocked(tx, agentId, item.sourceMessageIds, item.sourceMemoryIds)) allowed.push(item)
      return allowed.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    })
  }
  forgottenMessageIds(agentId: string) {
    return this.store.transaction(async tx => new Set((await tx.list<MemoryForget>('memoryForgets')).filter(item => item.ownerAgentId === agentId).flatMap(item => item.sourceMessageIds)))
  }
  recallValid(view: MemoryView) { return this.store.transaction(tx => this.recallValidInTransaction(tx, view)) }
  async recallValidInTransaction(tx: RecordTransaction, view: MemoryView) {
    if (!view.recall) return true
    const recall = view.recall
    const epoch = await tx.get<Epoch>('memoryEpochs', view.namespace)
    const tracked = recall.authorityVersion === 1
    if (recall.authorityVersion !== undefined && !tracked) return false
    if (tracked && (!recall.agentId || !Array.isArray(recall.observationVersions) || recall.observationIds.length !== recall.observationVersions.length || recall.observationIds.some(id => !recall.observationVersions!.some(version => version.id === id)) || !(view.namespace === `employee:${recall.agentId}` || view.namespace.startsWith(`employee:${recall.agentId}:`)))) return false
    // Legacy snapshots did not record enough actual authority to prove an unrelated change safe.
    if (!tracked && (epoch?.invalidationEpoch ?? 0) !== (view.invalidationEpoch ?? 0)) return false
    const allowed = (entry: MemoryEntry) => memoryAllowed(entry, { agentId: recall.agentId!, conversationId: recall.conversationId, contextRefs: recall.contextRefs, sourceAllowed: () => true, conversationRestricted: () => false })
    const messageValid = async (id: string, required = false) => {
      const message = await tx.get<{ status: string; runId?: string }>('messages', id)
      if (!message) return !required
      if (message.status !== 'completed') return false
      if (!message.runId) return true
      const snapshot = await tx.get<{ invalidated?: boolean }>('snapshots', message.runId)
      return !!snapshot && !snapshot.invalidated
    }
    for (const version of recall.versions) {
      const entry = await tx.get<MemoryEntry>('memory', version.id)
      if (!entry || entry.version !== version.version || memoryStatus(entry) !== 'active') return false
      if (tracked && (!allowed(entry) || await this.blocked(tx, entry.ownerAgentId, entry.origin === 'user' ? [] : entry.sourceMessageIds, entry.sourceMemoryIds ?? [], entry.origin === 'user' ? undefined : entry.content))) return false
      if (tracked) for (const id of entry.sourceMessageIds) if (!await messageValid(id)) return false
      if (entry.contextRef?.kind === 'work') {
        const work = await tx.get<import('../../../shared/domain').WorkItem>('workItems', entry.contextRef.id)
        if (!work || ['delivered', 'failed', 'cancelled', 'interrupted'].includes(work.status)) return false
      }
    }
    const retainedEntries = tracked && recall.observationIds.length ? await tx.list<MemoryEntry>('memory') : []
    for (const id of recall.observationIds) {
      const observation = await tx.get<MemoryObservation>('memoryObservations', id)
      if (!observation || await this.blocked(tx, observation.ownerAgentId, observation.sourceMessageIds, observation.sourceMemoryIds)) return false
      if (tracked) {
        const version = recall.observationVersions!.find(version => version.id === id)!
        if (observation.ownerAgentId !== recall.agentId || version.fingerprint !== observationAuthorityFingerprint(observation) || !Array.isArray(version.sourceMessageIds) || version.sourceMessageIds.some(id => !observation.sourceMessageIds.includes(id)) || observation.sourceMemoryIds.some(id => !recall.versions.some(version => version.id === id))) return false
        for (const messageId of version.sourceMessageIds) if (!await messageValid(messageId)) return false
        // A newly saved limit/correction must also fence raw evidence selected before it existed.
        for (const entry of retainedEntries) if (entry.ownerAgentId === recall.agentId && entry.sourceMessageIds.some(id => version.sourceMessageIds.includes(id)) && !allowed(entry)) return false
      }
      if (observation.contextRef?.kind === 'work') {
        const work = await tx.get<import('../../../shared/domain').WorkItem>('workItems', observation.contextRef.id)
        if (!work || ['delivered', 'failed', 'cancelled', 'interrupted'].includes(work.status)) return false
      }
    }
    if (tracked && recall.inputMessageIds !== undefined) {
      if (!Array.isArray(recall.inputMessageIds)) return false
      if (await this.blocked(tx, recall.agentId!, recall.inputMessageIds, [])) return false
      for (const id of recall.inputMessageIds) if (!await messageValid(id, true)) return false
    }
    return true
  }
  invalidateResources(ids: string[], ownerAgentId?: string) { return this.invalidate(entry => (!ownerAgentId || entry.ownerAgentId === ownerAgentId) && entry.sourceResourceIds.some(id => ids.includes(id)), observation => (!ownerAgentId || observation.ownerAgentId === ownerAgentId) && observation.sourceResourceIds.some(id => ids.includes(id))) }
  invalidateMessages(ids: string[]) { return this.invalidate(entry => entry.sourceMessageIds.some(id => ids.includes(id)), observation => observation.sourceMessageIds.some(id => ids.includes(id))) }
  invalidateConversation(agentId: string, conversationId: string) {
    return this.invalidate(entry => entry.ownerAgentId === agentId && sourceConversations(entry).includes(conversationId), item => item.ownerAgentId === agentId && (item.sourceConversationIds ?? [item.conversationId]).includes(conversationId))
  }
  restrictConversation(agentId: string, conversationId: string) {
    return this.store.transaction(async tx => {
      const entries = (await tx.list<MemoryEntry>('memory')).filter(entry => entry.ownerAgentId === agentId && sourceConversations(entry).includes(conversationId) && !entry.deletedAt && (entry.conversationId === conversationId ? memoryUseScope(entry) !== 'conversation' : memoryStatus(entry) !== 'expired'))
      const updated = entries.map(entry => ({ ...entry, ...(entry.conversationId === conversationId ? { useScope: 'conversation' as const } : { status: 'expired' as const }), version: entry.version + 1, updatedAt: stamp() }))
      let changed = updated.length > 0
      for (const entry of updated) await tx.put({ collection: 'memory', id: entry.id, value: entry })
      for (const observation of await tx.list<MemoryObservation>('memoryObservations')) if (observation.ownerAgentId === agentId && (observation.sourceConversationIds ?? [observation.conversationId]).includes(conversationId)) {
        if (observation.conversationId === conversationId) { if (observation.useScope !== 'conversation') { changed = true; await tx.put({ collection: 'memoryObservations', id: observation.id, value: { ...observation, useScope: 'conversation' } }) } }
        else { changed = true; await tx.remove('memoryObservations', observation.id) }
      }
      if (changed) await this.bump(tx, agentId, updated, true)
    })
  }
  private invalidate(matches: (entry: MemoryEntry) => boolean, observationMatches: (item: MemoryObservation) => boolean) {
    return this.store.transaction(async tx => {
      const all = await tx.list<MemoryEntry>('memory'), ids = new Set(all.filter(matches).map(entry => entry.id))
      for (let changed = true; changed;) { changed = false; for (const item of all) if (!ids.has(item.id) && item.sourceMemoryIds?.some(id => ids.has(id))) { ids.add(item.id); changed = true } }
      const byAgent = new Map<string, MemoryEntry[]>()
      for (const entry of all) if (ids.has(entry.id) && !entry.deletedAt) {
        const updated: MemoryEntry = { ...entry, content: '', status: 'deleted', deletedAt: stamp(), updatedAt: stamp(), version: entry.version + 1 }
        await this.rememberForget(tx, entry); await tx.put({ collection: 'memory', id: entry.id, value: updated })
        byAgent.set(entry.ownerAgentId, [...byAgent.get(entry.ownerAgentId) ?? [], updated])
      }
      for (const item of await tx.list<MemoryObservation>('memoryObservations')) if (observationMatches(item) || item.sourceMemoryIds.some(id => ids.has(id))) {
        const forgotten: MemoryForget = { id: randomUUID(), ownerAgentId: item.ownerAgentId, sourceMessageIds: item.sourceMessageIds, sourceMemoryIds: item.sourceMemoryIds, createdAt: stamp() }
        await tx.put({ collection: 'memoryForgets', id: forgotten.id, value: forgotten }); await tx.remove('memoryObservations', item.id)
        if (!byAgent.has(item.ownerAgentId)) byAgent.set(item.ownerAgentId, [])
      }
      for (const [agentId, entries] of byAgent) await this.bump(tx, agentId, entries, true)
    })
  }
  maintain(time = Date.now()) {
    return this.store.transaction(async tx => {
      const grouped = new Map<string, MemoryEntry[]>()
      for (const entry of await tx.list<MemoryEntry>('memory')) {
        const status = memoryStatus(entry, time)
        const archive = entry.schemaVersion === 2 && status === 'active' && entry.kind === 'experience' && !entry.pinned && Date.parse(entry.updatedAt) < time - MEMORY_ARCHIVE_DAYS * 86400000
        if (entry.deletedAt || (!archive && status === (entry.status ?? 'active'))) continue
        const updated = { ...entry, status: archive ? 'archived' as const : status, version: entry.version + 1, updatedAt: new Date(time).toISOString() }
        await tx.put({ collection: 'memory', id: entry.id, value: updated })
        grouped.set(entry.ownerAgentId, [...grouped.get(entry.ownerAgentId) ?? [], updated])
      }
      for (const [agentId, entries] of grouped) await this.bump(tx, agentId, entries, true)
      return grouped.size
    })
  }
}
