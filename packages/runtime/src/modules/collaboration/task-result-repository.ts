/*
 * [INPUT]: ProductStore Work/Run identities and original message/artifact authorization checks.
 * [OUTPUT]: Bounded task-result projection; no business writes, scheduler calls or replay.
 * [POS]: Shared owner result reader for desktop and CLI.
 * [PROTOCOL]: Update Header and collaboration/.folder.md on change.
 */
import type { AgentRun, Conversation, Message, WorkItem } from '@boai/shared/domain'
import type { ArtifactVersion } from '@boai/shared/domain/artifacts'
import { TASK_RESULT_LIMITS as limits, type TaskResult, type TaskResultFile, type TaskResultMessage } from '@boai/shared/domain/task-results'
import type { RunCancellation } from '@boai/shared/domain/run-cancellation'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

/** Shared with getRunCancellation; a terminal label alone does not prove adapter exit. */
export function projectRunCancellation(current: AgentRun, lookup: (id: string) => AgentRun | undefined, active: Set<string>): RunCancellation {
  const scope = current.cancellation, runIds = scope?.runIds ?? [current.id]
  const activeRunIds = runIds.filter(id => active.has(id))
  const missing = runIds.some(id => !lookup(id))
  const ended = runIds.every(id => ['completed', 'failed', 'cancelled', 'interrupted'].includes(lookup(id)?.status ?? ''))
  return { conversationId: current.conversationId, runId: current.id, agentId: current.agentId, requested: !!scope, runIds, workIds: scope?.workIds ?? [], activeRunIds,
    state: missing || (scope && !scope.appliedAt) ? 'unknown' : activeRunIds.length ? (scope || ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status) ? 'stopping' : 'running') : ended ? 'stopped' : 'running' }
}
interface Checks {
  work(tx: RecordTransaction, work: WorkItem): Promise<void>
  message(tx: RecordTransaction, message: Message): Promise<void>
  run(tx: RecordTransaction, run: { id: string; conversationId: string }): Promise<void>
  artifact(tx: RecordTransaction, artifact: ArtifactVersion): Promise<void>
  continuation(tx: RecordTransaction, work: WorkItem, run?: AgentRun): Promise<TaskResult['continuation']>
}
export class TaskResultRepository {
  constructor(private store: ProductStore, private checks: Checks) {}
  async read(workId: string): Promise<TaskResult> {
    const visible = await this.store.workViewTarget(workId)
    if (!visible) throw new Error('任务或原来源已不可读取')
    return this.store.transaction(async tx => {
      const work = await tx.get<WorkItem>('workItems', workId)
      if (!work || work.version !== visible.version || work.conversationId !== visible.conversationId) throw new Error('任务已变化，请重新读取')
      const conversation = await tx.get<Conversation>('conversations', work.conversationId)
      if (!conversation || conversation.list?.hidden || conversation.mergedInto || !conversation.agentIds.includes(work.ownerAgentId) || !await tx.get('agents', work.ownerAgentId) || await tx.get('conversationCleanup', work.conversationId)) throw new Error('原聊天或任务负责人已不可读取')
      await this.checks.work(tx, work)
      const source = await tx.get<Message>('messages', work.sourceMessageId)
      if (!source || source.conversationId !== work.conversationId || source.status !== 'completed') throw new Error('任务原请求已不可读取')
      await this.checks.message(tx, source)
      const messages: TaskResultMessage[] = []
      for (const id of [...new Set(work.resultMessageIds)].slice(-limits.messages).reverse()) {
        try {
          const message = await tx.get<Message>('messages', id)
          if (!message || message.conversationId !== work.conversationId || message.senderType !== 'agent' || message.senderId !== work.ownerAgentId || message.status !== 'completed') throw new Error('结果消息来源已失效')
          await this.checks.message(tx, message)
          messages.push({ id, status: 'available', excerpt: message.content.slice(0, limits.excerpt), truncated: message.content.length > limits.excerpt })
        } catch { messages.push({ id, status: 'unavailable', reason: '结果消息已缺失或原来源授权失效' }) }
      }
      const files: TaskResultFile[] = []
      for (const id of [...new Set(work.artifactIds)].slice(-limits.files).reverse()) {
        try {
          const artifact = await tx.get<ArtifactVersion>('artifacts', id)
          if (!artifact || artifact.conversationId !== work.conversationId || artifact.ownerAgentId !== work.ownerAgentId || artifact.sourceWorkId !== work.id || !artifact.contentHash || !artifact.registrationSource) throw new Error('成果未绑定此工作的可信版本')
          if (artifact.sourceMessageId) {
            const publication = await tx.get<Message>('messages', artifact.sourceMessageId)
            if (!work.resultMessageIds.includes(artifact.sourceMessageId) || !publication || publication.conversationId !== work.conversationId || publication.senderType !== 'agent' || publication.senderId !== work.ownerAgentId || publication.status !== 'completed') throw new Error('成果原交付消息已失效')
            await this.checks.message(tx, publication)
          }
          await this.checks.artifact(tx, artifact)
          files.push({ id, name: artifact.name, size: artifact.size, contentHash: artifact.contentHash, contentVersion: artifact.contentVersion, status: 'available' })
        } catch { files.push({ id, status: 'unavailable', reason: '文件缺失、内容已变化或原来源授权失效' }) }
      }
      const runs = await tx.taskResultRuns(work, limits.runs), readableRuns: typeof runs.items = []
      for (const run of runs.items) {
        try {
          const trigger = await tx.get<Message>('messages', run.triggerMessageId)
          if (!trigger || trigger.conversationId !== work.conversationId || trigger.status !== 'completed') continue
          await this.checks.message(tx, trigger); await this.checks.run(tx, run)
          readableRuns.push(run)
        } catch { /* No unchecked error/tool details escape a revoked run source. */ }
      }
      const latest = runs.items[0] && await tx.get<AgentRun>('runs', runs.items[0].id)
      const continuation = await this.checks.continuation(tx, work, latest)
      const { id, conversationId, ownerAgentId, sourceMessageId, deliverable, status, version, resultVersion, updatedAt, nextStep } = work
      return { schemaVersion: 1, work: { id, conversationId, ownerAgentId, sourceMessageId, deliverable, status, version, resultVersion, updatedAt, nextStep }, summary: work.outcome?.summary,
        files: { items: files, total: new Set(work.artifactIds).size, truncated: new Set(work.artifactIds).size > limits.files },
        messages: { items: messages, total: new Set(work.resultMessageIds).size, truncated: new Set(work.resultMessageIds).size > limits.messages },
        runs: { items: readableRuns, total: runs.total, truncated: runs.total > limits.runs, unavailable: runs.items.length - readableRuns.length }, continuation }
    })
  }
}
