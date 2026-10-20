/*
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [INPUT]: A fixed local date, employee-owned chat history and the original memory access policy.
 * [OUTPUT]: Full authorized day text and saved notes with exact parent memory/message provenance; never a last-N sample.
 * [POS]: Private reflection context selection; no new conversation, identity, memory store or tool authority.
 * [PROTOCOL]: Update this Header and owning .folder.md when changed.
 */
import type { Conversation, MemoryEntry, Message } from '../../../shared/domain'
import type { AgentEmotionHistory } from '../../../shared/domain/agent-profile'
import { memoryAllowed, type MemoryAccess } from '../memory/memory-policy'
import { personalityDate } from '../automations/personality-policy'

export function reflectionContext(input: {
  day: string
  messages: Message[]
  rooms: Conversation[]
  entries: MemoryEntry[]
  emotions?: AgentEmotionHistory[]
  access: MemoryAccess
  forgotten: Set<string>
  provenance(message: Message): { memories: { id: string; version: number }[]; messageIds: string[]; resourceIds: string[]; conversationIds: string[] }
}) {
  const messages: Message[] = [], versions = new Map<string, { id: string; version: number }>()
  const messageMemoryIds: Record<string, string[]> = {}, messageSourceIds: Record<string, string[]> = {}, messageConversationIds: Record<string, string[]> = {}
  const noteParents = (entry: MemoryEntry, visiting = new Set<string>()): MemoryEntry[] | undefined => {
    if (visiting.has(entry.id) || !memoryAllowed(entry, input.access) || entry.sourceMessageIds.some(id => input.forgotten.has(id)) ||
      (entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : [])).some(id => !input.rooms.some(room => room.id === id))) return
    const next = new Set(visiting).add(entry.id), result = [entry]
    for (const id of entry.sourceMemoryIds ?? []) {
      const parent = input.entries.find(item => item.id === id), ancestors = parent && noteParents(parent, next)
      if (!ancestors) return
      result.push(...ancestors)
    }
    return result
  }
  const notes: MemoryEntry[] = [], noteSources = new Map<string, MemoryEntry>()
  const emotions: AgentEmotionHistory[] = [], emotionMessageIds = new Set<string>(), emotionConversationIds = new Set<string>()
  for (const event of input.emotions ?? []) {
    if (event.agentId !== input.access.agentId || !event.sourceMessageIds.length && !event.sourceMemories.length || !Number.isFinite(Date.parse(event.emotion.updatedAt)) || personalityDate(Date.parse(event.emotion.updatedAt)) !== input.day) continue
    const room = event.conversationId ? input.rooms.find(room => room.id === event.conversationId) : undefined
    if (event.conversationId && !room || input.entries.some(entry => entry.sourceMessageIds.some(id => event.sourceMessageIds.includes(id)) && !memoryAllowed(entry, input.access))) continue
    const evidence: MemoryEntry = { id: 'emotion:' + event.id, ownerAgentId: event.agentId, scope: 'employee',
      useScope: room?.memoryScope === 'conversation' ? 'conversation' : room?.memoryContextRef ? 'context' : 'employee', contextRef: room?.memoryContextRef ?? undefined, conversationId: event.conversationId,
      sourceConversationIds: event.sourceConversationIds, sourceMessageIds: event.sourceMessageIds, sourceResourceIds: [], sourceMemoryIds: event.sourceMemories.map(parent => parent.id),
      content: event.emotion.reason, origin: 'model', version: 1, createdAt: event.emotion.updatedAt, updatedAt: event.emotion.updatedAt }
    if (event.sourceMemories.some(parent => !input.entries.some(entry => entry.id === parent.id && entry.version === parent.version))) continue
    const parents = noteParents(evidence)
    if (!parents) continue
    emotions.push(event)
    for (const id of event.sourceMessageIds) emotionMessageIds.add(id)
    for (const id of event.sourceConversationIds) emotionConversationIds.add(id)
    for (const parent of parents.slice(1)) { versions.set(parent.id, { id: parent.id, version: parent.version }); noteSources.set(parent.id, parent) }
  }
  for (const entry of input.entries) {
    if (entry.diary || !Number.isFinite(Date.parse(entry.createdAt)) || personalityDate(Date.parse(entry.createdAt)) !== input.day) continue
    const parents = noteParents(entry)
    if (!parents) continue
    notes.push(entry)
    for (const parent of parents) { versions.set(parent.id, { id: parent.id, version: parent.version }); noteSources.set(parent.id, parent) }
  }
  for (const message of input.messages) {
    if (message.status !== 'completed' || input.forgotten.has(message.id) || !Number.isFinite(Date.parse(message.createdAt)) || personalityDate(Date.parse(message.createdAt)) !== input.day) continue
    const room = input.rooms.find(room => room.id === message.conversationId)
    if (!room || !room.agentIds.includes(input.access.agentId)) continue
    const source = input.provenance(message)
    const parents = source.memories.map(version => input.entries.find(entry => entry.id === version.id && entry.version === version.version))
    if (parents.some(entry => !entry || !memoryAllowed(entry, input.access))) continue
    // Saved restrictions/expiry/forget barriers also apply when rereading raw chat logs.
    if (input.entries.some(entry => entry.sourceMessageIds.includes(message.id) && !memoryAllowed(entry, input.access))) continue
    const sourceIds = [...new Set([message.id, ...source.messageIds])]
    if (sourceIds.some(id => input.forgotten.has(id))) continue
    const evidence: MemoryEntry = { id: 'reflection-source:' + message.id, ownerAgentId: input.access.agentId, scope: 'employee', conversationId: room.id,
      content: message.content, sourceMessageIds: sourceIds, sourceResourceIds: source.resourceIds, sourceConversationIds: [...new Set([room.id, ...source.conversationIds])], sourceMemoryIds: source.memories.map(item => item.id),
      origin: 'model', version: 1, createdAt: message.createdAt, updatedAt: message.createdAt, status: 'active', schemaVersion: 2, kind: 'experience', evidence: 'claim',
      useScope: room.memoryScope === 'conversation' ? 'conversation' : room.memoryContextRef ? 'context' : 'employee', contextRef: room.memoryContextRef ?? undefined }
    if (!memoryAllowed(evidence, input.access)) continue
    messages.push(message)
    for (const parent of source.memories) versions.set(parent.id, parent)
    messageMemoryIds[message.id] = source.memories.map(item => item.id)
    messageSourceIds[message.id] = sourceIds
    messageConversationIds[message.id] = [...new Set([room.id, ...source.conversationIds])]
  }
  messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.conversationId.localeCompare(b.conversationId) || a.sequence - b.sequence)
  notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  emotions.sort((a, b) => a.emotion.updatedAt.localeCompare(b.emotion.updatedAt) || a.id.localeCompare(b.id))
  return { messages, notes, emotions, supportMessageIds: [...new Set([...emotionMessageIds, ...[...noteSources.values()].flatMap(entry => entry.sourceMessageIds)])],
    supportConversationIds: [...new Set([...emotionConversationIds, ...[...noteSources.values()].flatMap(entry => entry.sourceConversationIds ?? (entry.conversationId ? [entry.conversationId] : []))])],
    versions: [...versions.values()], messageMemoryIds, messageSourceIds, messageConversationIds }
}
