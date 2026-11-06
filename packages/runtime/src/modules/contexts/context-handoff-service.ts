/*
 * [INPUT]: Explicit owner preparation, completed Work/Run source facts and original authorization hooks.
 * [OUTPUT]: Target-bound handoffs consumed only by a later explicit native run, with exact provider receipts.
 * [POS]: H2 host bridge; cross-employee sources are restricted to shared-group public results.
 * [PROTOCOL]: Update Header and contexts/.folder.md when changed.
 */
import type { AgentRun, Conversation, DigitalAgent, Message, WorkItem } from '@boai/shared/domain'
import type { ArtifactVersion } from '@boai/shared/domain/artifacts'
import type { NativeAction } from '@boai/shared/domain/execution'
import { handoffPrepareSchema, handoffQuerySchema, handoffCancelSchema, type HandoffPrepareInput, type HandoffQuery, type HandoffCancelInput, type HandoffSummary } from '@boai/shared/domain/context-handoff'
import type { EngineContext } from '../../contracts'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ContextHandoffRepository, HANDOFF_COLLECTION, HandoffConflictError, handoffHash, handoffMessage, type ContextHandoff, type HandoffTarget } from './context-handoff'
import { handoffBudget, type HandoffBudgetInput } from './handoff-budget'

export interface HandoffHostHooks {
  /** Return actual selected provider/config/cwd; API targets must fail explicitly until supported. */
  target(tx: RecordTransaction, agent: DigitalAgent, conversation: Conversation): Promise<{ providerId: string; configurationVersion: string; workspace: string; budget?: HandoffBudgetInput }>
  assertIdle(conversationId: string, exceptRunId?: string): void | Promise<void>
  message(tx: RecordTransaction, message: Message, targetAgentId: string): Promise<void>
  work(tx: RecordTransaction, work: WorkItem, targetAgentId: string): Promise<void>
  run(tx: RecordTransaction, run: AgentRun, targetAgentId: string): Promise<void>
  artifact(tx: RecordTransaction, artifact: ArtifactVersion, targetAgentId: string): Promise<void>
}
const sourceVersion = (work: WorkItem, run: AgentRun) => handoffHash([work.version, work.resultVersion, run.id, run.status, run.messageId])
const summary = (transfer: ContextHandoff, unavailableReason?: string): HandoffSummary => ({ id: transfer.id, revision: transfer.revision, source: transfer.source, target: transfer.target, reason: transfer.reason,
  status: transfer.status, coverage: transfer.coverage, payloadHash: transfer.payloadHash, attemptId: transfer.attempts.at(-1)?.id, available: !transfer.invalidated && !unavailableReason,
  unavailableReason: unavailableReason ?? transfer.invalidated, createdAt: transfer.createdAt, updatedAt: transfer.updatedAt })

export class ContextHandoffService {
  readonly repository: ContextHandoffRepository
  constructor(private readonly store: ProductStore, private readonly hooks: HandoffHostHooks) {
    this.repository = new ContextHandoffRepository(store, {
      source: (tx, transfer) => this.checkSource(tx, transfer),
      target: async (tx, transfer, target) => {
        const current = await this.target(tx, target.agentId, target.conversationId)
        if (current.target.providerId !== target.providerId || current.target.configurationVersion !== target.configurationVersion || current.target.workspace !== target.workspace) throw new HandoffConflictError('交接目标运行配置或目录已变化')
        await this.hooks.assertIdle(target.conversationId, target.runId)
      },
    })
  }
  private async identity(tx: RecordTransaction, agentId: string, conversationId: string) {
    const agent = await tx.get<DigitalAgent>('agents', agentId), conversation = await tx.get<Conversation>('conversations', conversationId)
    if (!agent?.active || !conversation || conversation.mergedInto || conversation.list?.hidden || !conversation.agentIds.includes(agentId) || await tx.get('conversationCleanup', conversationId)) throw new HandoffConflictError('交接目标员工或会话不可用')
    return { agent, conversation }
  }
  private async target(tx: RecordTransaction, agentId: string, conversationId: string) {
    const { agent, conversation } = await this.identity(tx, agentId, conversationId)
    const configuration = await this.hooks.target(tx, agent, conversation)
    return { target: { agentId, conversationId, providerId: configuration.providerId, configurationVersion: configuration.configurationVersion, workspace: configuration.workspace } as HandoffTarget, budget: configuration.budget ?? {} }
  }
  private async source(tx: RecordTransaction, workId: string, runId: string, targetAgentId: string, targetConversationId: string) {
    const work = await tx.get<WorkItem>('workItems', workId), run = await tx.get<AgentRun>('runs', runId)
    if (!work || !run || run.workId !== work.id || run.conversationId !== work.conversationId || run.agentId !== work.ownerAgentId || work.status !== 'delivered' || work.requiresReview || work.activeRunId || run.status !== 'completed' || run.toolEvents.some(event => event.status === 'running')) throw new HandoffConflictError('首版交接只接受已结束且结果确定的任务')
    const agent = await tx.get<DigitalAgent>('agents', work.ownerAgentId), conversation = await tx.get<Conversation>('conversations', work.conversationId)
    if (!agent || !conversation || conversation.mergedInto || conversation.list?.hidden || !conversation.agentIds.includes(agent.id) || await tx.get('conversationCleanup', conversation.id)) throw new HandoffConflictError('交接原员工或会话已不可读取')
    if (agent.id !== targetAgentId && (conversation.kind !== 'group' || conversation.id !== targetConversationId || !conversation.agentIds.includes(targetAgentId))) throw new HandoffConflictError('跨员工交接仅允许双方当前可读的同群公开结果')
    for (const actionId of await tx.relatedIds('nativeActions', { runIds: [run.id] })) {
      const action = await tx.get<NativeAction>('nativeActions', actionId)
      if (action && (action.status !== 'answered' || action.delivery !== 'submitted')) throw new HandoffConflictError('原运行仍有未知或未完成的原生操作')
    }
    await this.hooks.work(tx, work, targetAgentId)
    await this.hooks.run(tx, run, targetAgentId)
    return { work, run, conversation }
  }
  private async checkSource(tx: RecordTransaction, transfer: ContextHandoff) {
    const { source, target } = transfer
    if (!source.taskId || !source.runId) throw new HandoffConflictError('交接缺少原工作或运行身份')
    const { work, run } = await this.source(tx, source.taskId, source.runId, target.agentId, target.conversationId)
    if (source.agentId !== work.ownerAgentId || source.conversationId !== work.conversationId || source.version !== sourceVersion(work, run)) throw new HandoffConflictError('交接原任务结果已修订')
    for (const entry of transfer.sourceMessages) {
      const message = await tx.get<Message>('messages', entry.id)
      if (!message || !work.resultMessageIds.includes(message.id) && !(target.agentId === source.agentId && message.id === work.sourceMessageId)) throw new HandoffConflictError('消息不属于获准交接的任务结果')
      if (message.conversationId !== source.conversationId || handoffHash(message) !== entry.hash) throw new HandoffConflictError('交接原消息已删除或变化')
      if (message.id !== work.sourceMessageId && (message.senderType !== 'agent' || message.senderId !== source.agentId)) throw new HandoffConflictError('结果消息并非原负责员工交付')
      await this.hooks.message(tx, message, target.agentId)
    }
    for (const ref of transfer.material?.artifactRefs ?? []) {
      const artifact = await tx.get<ArtifactVersion>('artifacts', ref.id)
      if (!artifact || !work.artifactIds.includes(ref.id) || artifact.ownerAgentId !== source.agentId || artifact.sourceWorkId !== work.id || artifact.contentHash !== ref.contentHash || artifact.contentVersion !== ref.contentVersion || artifact.contentStatus !== 'ready') throw new HandoffConflictError('成果不属于原工作或版本已变化')
      await this.hooks.artifact(tx, artifact, target.agentId)
    }
  }
  private async scoped(tx: RecordTransaction, query: HandoffQuery) {
    // The only loaded bodies belong to this target conversation; SQL resolves IDs first.
    const ids = await tx.relatedIds(HANDOFF_COLLECTION, { conversationId: query.conversationId })
    const result: ContextHandoff[] = []
    for (const id of ids) {
      const transfer = await tx.get<ContextHandoff>(HANDOFF_COLLECTION, id)
      if (transfer?.target.agentId === query.agentId) result.push(transfer)
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }
  async assertSwitchAllowed(query: HandoffQuery) {
    await this.store.transaction(async tx => {
      if ((await this.scoped(tx, query)).some(transfer => transfer.status === 'pending' || transfer.status === 'unknown')) throw new HandoffConflictError('原交接投递未确定，不能通过切换目录或会话重投')
    })
  }
  async prepare(raw: HandoffPrepareInput): Promise<HandoffSummary> {
    const input = handoffPrepareSchema.parse(raw)
    const preparation = await this.store.transaction(async tx => {
      const configured = await this.target(tx, input.targetAgentId, input.targetConversationId)
      const { work, run, conversation } = await this.source(tx, input.sourceWorkId, input.sourceRunId, input.targetAgentId, input.targetConversationId)
      await this.hooks.assertIdle(work.conversationId)
      const requestHash = handoffHash([work.ownerAgentId, input.requestId])
      const outstanding = (await this.scoped(tx, { agentId: input.targetAgentId, conversationId: input.targetConversationId })).find(transfer => !transfer.invalidated && !['delivered', 'cancelled'].includes(transfer.status) && transfer.id !== requestHash)
      if (outstanding) throw new HandoffConflictError('目标已有待交接或未知投递，请先核对原交接')
      const ids = [...new Set([...(work.ownerAgentId === input.targetAgentId ? [work.sourceMessageId] : []), ...work.resultMessageIds])]
      if (!work.resultMessageIds.length || ids.length > 2000 || work.artifactIds.length > 64) throw new HandoffConflictError('交接结果为空或超出首版材料范围')
      const entries = []
      for (const id of ids) {
        const message = await tx.get<Message>('messages', id)
        if (!message || message.conversationId !== conversation.id) throw new HandoffConflictError('交接原消息已缺失')
        entries.push(handoffMessage(message))
      }
      const artifactRefs = []
      for (const id of work.artifactIds) {
        const artifact = await tx.get<ArtifactVersion>('artifacts', id)
        if (!artifact?.contentHash || !artifact.contentVersion) throw new HandoffConflictError('交接成果缺少可信版本')
        artifactRefs.push({ id, contentHash: artifact.contentHash, contentVersion: artifact.contentVersion })
      }
      return { requestId: input.requestId, reason: input.reason, source: { agentId: work.ownerAgentId, conversationId: work.conversationId, taskId: work.id, assignmentId: conversation.employeeTaskId, runId: run.id, version: sourceVersion(work, run) },
        target: configured.target, material: { goal: input.goal, constraints: input.constraints ?? [], entries, artifactRefs }, budget: configured.budget }
    })
    return summary(await this.repository.prepare(preparation))
  }
  async list(raw: HandoffQuery): Promise<HandoffSummary[]> {
    const query = handoffQuerySchema.parse(raw)
    return this.store.transaction(async tx => {
      await this.identity(tx, query.agentId, query.conversationId)
      const result = []
      for (const transfer of (await this.scoped(tx, query)).slice(0, 100)) {
        let unavailableReason: string | undefined
        try { await this.checkSource(tx, transfer) } catch (error) { unavailableReason = error instanceof Error ? error.message : '交接来源已失效' }
        result.push(summary(transfer, unavailableReason))
      }
      return result
    })
  }
  async cancel(raw: HandoffCancelInput): Promise<HandoffSummary> {
    const input = handoffCancelSchema.parse(raw)
    return summary(await this.repository.cancel(input.id, input.revision))
  }
  async forRun(input: HandoffQuery & { runId: string; currentInput: string; attachmentTokens?: number; consumePrepared?: boolean }): Promise<EngineContext['nativeHandoff']> {
    const candidate = await this.store.transaction(async tx => {
      await this.identity(tx, input.agentId, input.conversationId)
      const existing = await this.scoped(tx, input)
      for (const delivered of existing.filter(transfer => transfer.status === 'delivered')) {
        if (delivered.invalidated) throw new HandoffConflictError('已接收交接的来源已清理，不能继续复用原上下文')
        // Imported source IDs do not become native transcript IDs. Recheck them on every later run.
        await this.checkSource(tx, delivered)
      }
      const outstanding = existing.filter(transfer => !transfer.invalidated && !['delivered', 'cancelled'].includes(transfer.status))
      if (outstanding.some(transfer => transfer.status === 'pending' || transfer.status === 'unknown')) throw new HandoffConflictError('原交接接收状态未知，不自动重新投递')
      if (!outstanding.length || !input.consumePrepared) return
      if (outstanding.length !== 1) throw new HandoffConflictError('目标存在多个交接，请先明确取消多余项')
      const transfer = outstanding[0]!
      const configured = await this.target(tx, input.agentId, input.conversationId)
      const available = handoffBudget({ ...configured.budget, currentInput: input.currentInput, attachmentTokens: input.attachmentTokens ?? 0 })
      if (transfer.coverage.used > available.bytes) throw new HandoffConflictError('当前输入后的剩余容量不足以投递已准备材料')
      return { transfer, target: { ...configured.target, runId: input.runId } }
    })
    if (!candidate) return
    let transfer = candidate.transfer, attemptId: string | undefined
    const requireAttempt = () => { if (!attemptId) throw new HandoffConflictError('交接尚未持久登记投递'); return attemptId }
    return {
      payload: transfer.payload!,
      prepare: async ({ threadId, runId }) => {
        if (runId !== input.runId || threadId) throw new HandoffConflictError('明确交接必须使用当前运行的新原生会话')
        const begun = await this.repository.beginDelivery(transfer.id, transfer.revision, candidate.target)
        if (!begun.shouldDeliver) throw new HandoffConflictError('交接已投递或结果未知，不能重投')
        transfer = begun.transfer; attemptId = transfer.attempts.at(-1)!.id
      },
      bindSession: async nativeSessionId => { transfer = await this.repository.bindSession(transfer.id, requireAttempt(), nativeSessionId) },
      accepted: async (nativeSessionId, turnId) => {
        transfer = await this.repository.settle(transfer.id, requireAttempt(), { status: 'delivered', target: { ...transfer.target, nativeSessionId }, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: turnId, nativeSessionId } })
      },
      unknown: async reason => {
        if (!attemptId || transfer.status === 'delivered') return
        transfer = await this.repository.settle(transfer.id, attemptId, { status: 'unknown', target: transfer.target, payloadHash: transfer.payloadHash, reason })
      },
    }
  }
}
