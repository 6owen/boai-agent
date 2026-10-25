/*
 * [OUTPUT]: Relevant saved memory precedes raw observed dialogue within the same budget; pinning, growth and source gates retain priority.
 * [INPUT]: SQLite 员工记忆/获知回执、宿主来源授权、已发布消息及当前请求。
 * [OUTPUT]: 有界召回携带实际来源版本；成长依赖仅在原授权与预算内优先召回，管理列表不进入模型。
 * [POS]: runtime/modules/memory/memory-recall.ts；不调用模型或读取其他员工目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'
import type { MemoryEntry, MemoryObservation, MemoryView, Message } from '@boai/shared/domain'
import { MEMORY_CONTEXT_TOKENS, MEMORY_RECENT_OBSERVATIONS } from '@boai/shared/domain/memory'
import { memoryAllowed, memoryRelevance, memoryStatus, memoryText, memoryTokenEstimate, type MemoryAccess } from './memory-policy'
export interface MemoryRecallInput {
  view: MemoryView
  observations: MemoryObservation[]
  access: MemoryAccess
  request: string
  messages: Map<string, Message>
  tokenBudget?: number
  preferredIds?: string[]
}
/** Authorization identity excludes text and is independent of object property insertion order. */
export function observationAuthorityFingerprint(observation: MemoryObservation) {
  return createHash('sha256').update(JSON.stringify({
    id: observation.id, ownerAgentId: observation.ownerAgentId, conversationId: observation.conversationId,
    sourceMessageIds: observation.sourceMessageIds, sourceResourceIds: observation.sourceResourceIds,
    sourceMemoryIds: observation.sourceMemoryIds, sourceConversationIds: observation.sourceConversationIds ?? [observation.conversationId],
    useScope: observation.useScope, contextRef: observation.contextRef ?? null, disclosure: observation.disclosure ?? 'private', createdAt: observation.createdAt,
  })).digest('hex')
}
export function recallMemory(input: MemoryRecallInput): MemoryView {
  const { view, access } = input
  const eligible = view.entries.filter(entry => memoryAllowed(entry, access))
  const raw: MemoryEntry[] = [], observationIds = new Map<string, string>()
  for (const observation of input.observations.slice(0, MEMORY_RECENT_OBSERVATIONS)) {
    if (observation.ownerAgentId !== access.agentId) continue
    for (const messageId of observation.sourceMessageIds) {
      const message = input.messages.get(messageId)
      if (!message || message.status !== 'completed' || !message.content.trim()) continue
      const retained = view.entries.filter(entry => entry.sourceMessageIds.includes(messageId))
      // Raw evidence cannot bypass a saved restriction, correction, expiry or archive.
      if (retained.some(entry => !memoryAllowed(entry, access))) continue
      if (eligible.some(entry => entry.sourceMessageIds.includes(messageId))) continue
      const parent = observation.sourceMemoryIds.map(id => view.entries.find(entry => entry.id === id))
      if (parent.some(entry => !entry || !memoryAllowed(entry, access))) continue
      const entry: MemoryEntry = {
        id: `observation:${observation.id}:${messageId}`, ownerAgentId: access.agentId, scope: 'employee', conversationId: observation.conversationId,
        schemaVersion: 2, kind: 'experience', evidence: 'claim', attribution: message.senderName,
        content: message.content, origin: 'model', version: 1, createdAt: message.createdAt, updatedAt: observation.createdAt,
        sourceMessageIds: [messageId], sourceResourceIds: observation.sourceResourceIds, sourceMemoryIds: observation.sourceMemoryIds,
        sourceConversationIds: observation.sourceConversationIds ?? [observation.conversationId], useScope: observation.contextRef && observation.useScope === 'employee' ? 'context' : observation.useScope,
        contextRef: observation.contextRef, disclosure: observation.disclosure ?? 'private', status: 'active',
      }
      if (!memoryAllowed(entry, access)) continue
      raw.push(entry); observationIds.set(entry.id, observation.id)
    }
  }
  const preferred = new Set(input.preferredIds ?? [])
  const ranked = [...eligible, ...raw].map(entry => { const relevance = memoryRelevance(entry.content, input.request); return { entry, relevance, relatedSaved: relevance > 0 && !observationIds.has(entry.id) } })
    .filter(({ entry, relevance }) => preferred.has(entry.id) || relevance > 0 || entry.pinned || entry.kind === 'long_term' || entry.scope === 'profile' || entry.kind === 'temporary' && entry.contextRef?.id === access.conversationId)
    .sort((a, b) => Number(!!b.entry.pinned) - Number(!!a.entry.pinned) || Number(preferred.has(b.entry.id)) - Number(preferred.has(a.entry.id)) || Number(b.relatedSaved) - Number(a.relatedSaved) || b.relevance - a.relevance || Number(b.entry.kind === 'long_term') - Number(a.entry.kind === 'long_term') || b.entry.createdAt.localeCompare(a.entry.createdAt) || b.entry.id.localeCompare(a.entry.id))
  const selected: MemoryEntry[] = [], seen = new Set<string>(), selectedObservations = new Set<string>()
  let tokenEstimate = 0
  for (const { entry } of ranked) {
    if (seen.has(entry.content)) continue
    const size = memoryTokenEstimate(memoryText(entry))
    if (tokenEstimate + size > (input.tokenBudget ?? MEMORY_CONTEXT_TOKENS)) continue
    selected.push(entry); seen.add(entry.content); tokenEstimate += size
    const observation = observationIds.get(entry.id); if (observation) selectedObservations.add(observation)
  }
  const versions = new Map(selected.filter(entry => !observationIds.has(entry.id)).map(entry => [entry.id, { id: entry.id, version: entry.version }]))
  const observationVersions = [...selectedObservations].map(id => {
    const observation = input.observations.find(item => item.id === id)!
    for (const parentId of observation.sourceMemoryIds) {
      const parent = view.entries.find(entry => entry.id === parentId)!
      versions.set(parent.id, { id: parent.id, version: parent.version })
    }
    return { id, fingerprint: observationAuthorityFingerprint(observation), sourceMessageIds: [...new Set(selected.filter(entry => observationIds.get(entry.id) === id).flatMap(entry => entry.sourceMessageIds))] }
  })
  return { ...view, entries: selected, nextCursor: undefined, total: undefined,
    recall: { authorityVersion: 1, agentId: access.agentId, conversationId: access.conversationId, contextRefs: access.contextRefs ?? [], versions: [...versions.values()], observationIds: [...selectedObservations], observationVersions, tokenEstimate } }
}
export function validRecallProjection(view: MemoryView, agentId: string, conversationId: string) {
  return !!view.recall && view.recall.conversationId === conversationId && view.entries.every(entry => entry.ownerAgentId === agentId && memoryStatus(entry) === 'active')
}
