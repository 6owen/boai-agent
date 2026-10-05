/*
 * [INPUT]: 固定 SQL 待处理来源、原 Work/问题事务和当前审批/成果只读核对。
 * [OUTPUT]: 有界稳定分页、当前资格/安全动作、原成果固定版本；自动化问题虚拟身份精确核对原消息/Work/触发版本及当前材料，失效零旧正文；查询零模型/零新工作。
 * [POS]: D5 只读收件箱投影；终态仍由原来源拥有。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import type { Approval, AutomationOccurrence, Conversation, DecisionRecord, DigitalAgent, DiscussionTurn, Message, WorkItem } from '../../../shared/domain'
import type { InboxItem, InboxPage, InboxQuery } from '../../../shared/domain/inbox'
import type { ArtifactAcceptance } from '../../../shared/domain/artifacts'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import { WorkRepository, WorkUnavailableError } from '../collaboration/work-repository'
import type { InboxSqlRow } from './inbox-sql'
import { automationQuestionSource, questionSource, validateQuestionReply, type QuestionSource } from './user-question'

const id = z.string().min(1).max(600)
export const inboxQuerySchema = z.object({ kind: z.enum(['question', 'approval', 'failure', 'acceptance']).optional(), search: z.string().trim().max(1000).optional(), before: z.object({ time: z.string().datetime(), id }).strict().optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
export const inboxReplySchema = z.object({ questionId: id, expectedRevision: z.number().int().positive(), content: z.string().trim().min(1).max(100000), requestId: z.string().trim().min(1).max(200) }).strict()
interface InboxHooks {
  approval(id: string): Approval | undefined
  acceptance(id: string): Promise<ArtifactAcceptance | null>
  validateQuestion(tx: RecordTransaction, message: Message, agentId: string): Promise<void>
  validateSource?(source: { materialSources?: Message['materialSources']; runId?: string }, message: Message | undefined, conversationId: string): Promise<void>
}
export class Inbox {
  constructor(private store: ProductStore, private works: WorkRepository, private hooks: InboxHooks) {}
  async list(query: InboxQuery): Promise<InboxPage> {
    const limit = query.limit ?? 30, items: InboxItem[] = []
    let before = query.before
    // A concurrently resolved source does not silently shorten a page or skip older items.
    for (let page = 0; page < 8 && items.length <= limit; page++) {
      const requested = limit + 1 - items.length
      const rows = await this.store.inboxRows({ ...query, before, limit: requested })
      if (!rows.length) return { items }
      for (const row of rows) { const item = await this.project(row); if (item) items.push(item) }
      const last = rows.at(-1)!
      before = { time: last.time, id: last.id }
      if (items.length > limit) break
      if (rows.length < requested) return { items }
    }
    const visible = items.slice(0, limit), last = visible.at(-1)
    return { items: visible, ...(items.length > limit && last ? { nextCursor: { time: last.time, id: last.id } } : before ? { nextCursor: before } : {}) }
  }
  async get(id: string): Promise<InboxItem | null> {
    const exact = /^question:occurrence:(.+):message:([^:]+)$/.exec(id)
    if (exact) return this.automationQuestion(id, exact[1], exact[2])
    const row = (await this.store.inboxRows({ id, limit: 1 }))[0]
    return row ? this.project(row) : null
  }
  private async automationQuestion(id: string, occurrenceId: string, messageId: string): Promise<InboxItem | null> {
    const read = async (tx: RecordTransaction, expected?: AutomationOccurrence) => {
      const occurrence = expected ?? await tx.get<AutomationOccurrence>('automationOccurrences', occurrenceId)
      if (!occurrence) return null
      let source: QuestionSource
      try { source = await automationQuestionSource(tx, occurrence, messageId) }
      catch (error) { if (error instanceof WorkUnavailableError) return null; throw error }
      if (source.conversation.list?.hidden || await tx.get('conversationCleanup', source.conversation.id)) return null
      const agent = await tx.get<DigitalAgent>('agents', source.agentId)
      return agent ? { occurrence, source, agent } : null
    }
    const first = await this.store.transaction(tx => read(tx))
    if (!first) return null
    // This hook owns its transaction. Never call it while holding the inbox read transaction.
    try { await this.hooks.validateSource?.({ materialSources: first.source.work?.materialSources, runId: first.source.message.runId }, first.source.message, first.source.conversation.id) }
    catch { return null }
    return this.store.transaction(async tx => {
      const current = await read(tx, first.occurrence)
      if (!current) return null
      const { occurrence, source, agent } = current, { message, conversation, work, question } = source
      if (work?.id !== first.source.work?.id || work?.version !== first.source.work?.version || question.id !== first.source.question.id || question.revision !== first.source.question.revision || message.content !== first.source.message.content || JSON.stringify(work?.materialSources) !== JSON.stringify(first.source.work?.materialSources)) return null
      try { await this.hooks.validateQuestion(tx, { ...message, materialSources: [...(work?.materialSources ?? []), ...(message.materialSources ?? [])] }, source.agentId) }
      catch { return null }
      return { id, kind: 'question', conversationId: conversation.id, conversationTitle: conversation.title, time: message.createdAt, summary: question.content, status: occurrence.status, agentId: agent.id, agentName: agent.name, messageId: message.id, turnId: source.turn.id, ...(message.runId ? { runId: message.runId } : {}), occurrenceId: occurrence.id, automationId: occurrence.automationId,
        question: { id: `occurrence:${occurrence.id}`, messageId: message.id, content: question.content, revision: occurrence.stateVersion, canReply: false, unavailableReason: '请从本次自动化运行明确补充，沿用原触发身份与预算' },
        ...(work ? { workId: work.id, work: { id: work.id, version: work.version, status: work.status, requiresReview: work.requiresReview } } : {}) } satisfies InboxItem
    })
  }
  private async project(row: InboxSqlRow): Promise<InboxItem | null> {
    const conversation = JSON.parse(row.conversation) as Conversation, agent = row.agent ? JSON.parse(row.agent) as DigitalAgent : undefined, message = row.message ? JSON.parse(row.message) as Message : undefined
    const source = JSON.parse(row.source)
    const base: InboxItem = { id: row.id, kind: row.kind as InboxItem['kind'], conversationId: conversation.id, conversationTitle: conversation.title, time: row.time, summary: source.reason ?? '', status: source.status ?? '', ...(agent ? { agentId: agent.id, agentName: agent.name } : {}), ...(message ? { messageId: message.id, turnId: message.turnId, runId: message.runId } : {}) }
    let sourceError: string | undefined
    if (row.kind !== 'acceptance') try { await this.hooks.validateSource?.(source, message, conversation.id) } catch { sourceError = '原来源内容或授权已失效，请先核对原记录' }
    if (row.kind === 'question') {
      if (row.sourceCollection === 'automationOccurrences') {
        const occurrence = source as AutomationOccurrence
        return { ...base, summary: sourceError ?? message!.content, occurrenceId: occurrence.id, automationId: occurrence.automationId, question: { id: `occurrence:${occurrence.id}`, messageId: message!.id, content: sourceError ? '' : message!.content, revision: occurrence.stateVersion, canReply: false, unavailableReason: sourceError ?? '请从本次自动化运行明确补充，沿用原触发身份与预算' } }
      }
      let question = (source as DecisionRecord | WorkItem).userQuestion!
      if (!question || question.answeredMessageId) return null
      let reason: string | undefined = sourceError
      let resolved = false
      await this.store.transaction(async tx => {
        const latest = await tx.get<DecisionRecord | WorkItem>(row.sourceCollection, row.sourceId)
        if (!latest?.userQuestion || latest.userQuestion.id !== question.id || latest.userQuestion.answeredMessageId) { resolved = true; return }
        Object.assign(source, latest); question = latest.userQuestion
        try { const current = await questionSource(tx, question.id); await validateQuestionReply(tx, current, question.revision, this.works); await this.hooks.validateQuestion(tx, current.message, current.agentId) }
        catch (error) { reason ??= error instanceof Error ? error.message : String(error) }
      })
      if (resolved) return null
      const work = row.sourceCollection === 'workItems' ? source as WorkItem : undefined
      return { ...base, summary: sourceError ?? question.content, question: { ...question, content: sourceError ? '' : question.content, canReply: !reason, ...(reason ? { unavailableReason: reason } : {}) }, ...(work ? { workId: work.id, work: { id: work.id, version: work.version, status: work.status, requiresReview: work.requiresReview } } : {}) }
    }
    if (row.kind === 'approval') {
      const approval = this.hooks.approval(source.id)
      if (!approval || approval.runId !== source.runId) return null
      if (sourceError) return { ...base, approvalId: approval.id, runId: approval.runId, summary: sourceError, reason: sourceError, status: 'needs_review' }
      return { ...base, approvalId: approval.id, runId: approval.runId, summary: approval.command, status: 'waiting_approval', approval: { id: approval.id, command: approval.command, cwd: approval.cwd } }
    }
    if (row.kind === 'acceptance') {
      const current = await this.hooks.acceptance(source.artifactId)
      if (!current || !['pending', 'unavailable'].includes(current.status)) return null
      const artifact = row.artifact ? JSON.parse(row.artifact) as { name: string; sourceWorkId?: string } : undefined
      return { ...base, summary: `${artifact?.name ?? '成果'} · 第 ${current.contentVersion} 版待本人验收`, status: current.status, reason: current.reason, ...(artifact?.sourceWorkId ? { workId: artifact.sourceWorkId } : {}), artifact: { id: current.artifactId, ...(artifact?.name ? { name: artifact.name } : {}), logicalArtifactId: current.logicalArtifactId, contentVersion: current.contentVersion, contentHash: current.contentHash, acceptanceRevision: current.revision } }
    }
    if (row.sourceCollection === 'automationOccurrences') {
      const occurrence = source as AutomationOccurrence
      return { ...base, summary: sourceError ?? occurrence.reason ?? occurrence.name, reason: sourceError ?? occurrence.reason, occurrenceId: occurrence.id, automationId: occurrence.automationId }
    }
    if (row.sourceCollection === 'workItems') {
      const work = source as WorkItem
      return { ...base, summary: sourceError ?? work.outcome?.summary ?? work.deliverable, reason: sourceError ?? (work.requiresReview ? '运行或副作用结果待核对，不能自动重试' : work.outcome?.summary), workId: work.id, work: { id: work.id, version: work.version, status: work.status, requiresReview: work.requiresReview } }
    }
    const turn = source as DiscussionTurn
    return { ...base, summary: sourceError ?? turn.reason ?? '轮次中断，需核对原执行记录', reason: sourceError ?? turn.reason, turnId: turn.id }
  }
}
