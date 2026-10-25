/*
 * [INPUT]: 当前员工获准消息、记忆版本、资源元信息与模型候选。
 * [OUTPUT]: API和本机员工共享的增量记忆输入与来源校验；当前轮及本轮本人已交付Work的精确原用户来源作证据，其他历史不扩权，写入仍归MemoryRepository。
 * [POS]: employees私有记忆协议准备；不调用模型、不保存候选。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { MemoryCandidate } from '@boai/shared/domain'
import type { EngineContext } from '../../contracts'
import { messageData, partitionTurn, visibleMessages } from '../../adapters/mastra/message-projection'
import { bootstrapInstructions } from './phase-instructions'

/** One evidence scope for model preparation and the host's persistence checks. */
export function memoryEvidenceMessages(context: EngineContext) {
  const window = visibleMessages(context)
  const turn = partitionTurn(window, context.triggerMessageId, context.turnId)
  const current = context.turnId || context.triggerMessageId ? turn.current : window
  const work = context.work
  // A directed continuation reads the latest update as its trigger. Its original
  // request remains evidence only after this employee publishes the owned result.
  if (!work || work.status !== 'delivered' || work.requiresReview || work.ownerAgentId !== context.agent.id || work.conversationId !== context.conversation.id || !current.some(message => message.senderType === 'agent' && message.senderId === context.agent.id && work.resultMessageIds.includes(message.id))) return current
  const source = window.find(message => message.id === work.sourceMessageId && message.senderType === 'user' && message.senderId === 'user')
  if (!source || current.some(message => message.id === source.id)) return current
  return [...current, source].sort((a, b) => a.sequence - b.sequence)
}

export function prepareMemoryExtraction(context: EngineContext) {
  const window = visibleMessages(context)
  const turn = partitionTurn(window, context.triggerMessageId, context.turnId)
  const messages = memoryEvidenceMessages(context)
  if (!messages.length) return undefined
  const messageIds = new Set(messages.map(message => message.id))
  const resources = context.resources.filter(resource => (!resource.ownerAgentId || resource.ownerAgentId === context.agent.id) && (context.agent.skillIds.includes(resource.id) || context.agent.knowledgeIds.includes(resource.id) || context.conversation.sharedKnowledgeIds.includes(resource.id)))
  const resourceIds = new Set(resources.map(resource => resource.id))
  const retained = (context.memory?.entries ?? []).filter(entry => !entry.id.startsWith('observation:') && !entry.deletedAt && entry.ownerAgentId === context.agent.id && (context.memory?.recall?.conversationId === context.conversation.id || entry.scope === 'profile' || entry.conversationId === context.conversation.id))
  const bootstrap = bootstrapInstructions(context)
  const data = {
    currentTurn: { id: turn.id ?? null, rootMessageId: turn.root?.id },
    ...(context.work && messages.some(message => message.id === context.work!.sourceMessageId) && context.work.sourceMessageId !== turn.root?.id ? { completedWorkRequestId: context.work.sourceMessageId } : {}),
    currentTurnMessages: messages.map(message => messageData(message, turn.root?.id)),
    // Bootstrap may contain only a bounded memory projection. Keep all remaining
    // authorized facts intact, without repeating those already present in full.
    retainedVersions: retained.filter(entry => !entry.id.startsWith('observation:')).map(entry => ({ id: entry.id, version: entry.version })),
    additionalRetainedFacts: retained.filter(entry => !bootstrap.includes(entry.content)).map(entry => ({ id: entry.id, version: entry.version, content: entry.content })),
    authorizedContexts: context.memoryContexts ?? [],
    currentMemoryPolicy: { defaultUseScope: context.conversation.memoryScope ?? 'employee', linkedContext: context.conversation.memoryContextRef ?? null },
    retainedFactsInstruction: 'Existing facts are deduplication context, never candidate evidence. Only explicit current user correction may supersede an authorized retained version.',
    validResourceReferences: resources.map(resource => ({ id: resource.id, name: resource.name })),
  }
  return { data, validate: (candidates: MemoryCandidate[]): MemoryCandidate[] => {
      for (const candidate of candidates) {
        if (candidate.sourceMessageIds.some(id => !messageIds.has(id)) || candidate.sourceResourceIds?.some(id => !resourceIds.has(id))) throw new Error('记忆候选包含未授权或不存在的来源')
        if (context.apiKey && candidate.content.includes(context.apiKey)) throw new Error('记忆候选不能包含模型凭据')
      }
      const existing = new Set(retained.map(entry => entry.content.trim()))
      return candidates.filter(candidate => { const content = candidate.content.trim(); if (existing.has(content)) return false; existing.add(content); return true }).map(candidate => ({ ...candidate, content: candidate.content.trim(), sourceMessageIds: [...new Set(candidate.sourceMessageIds)], sourceResourceIds: [...new Set(candidate.sourceResourceIds ?? [])] }))
  } }
}
