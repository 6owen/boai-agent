/*
 * [INPUT]: Host-authorized source/target identities, public messages and original ProductStore transactions.
 * [OUTPUT]: Durable immutable handoffs, CAS delivery receipts, source invalidation and crash recovery without replay.
 * [POS]: Product context transfer; provider/private state and work acceptance remain separate.
 * [PROTOCOL]: Update Header and contexts/.folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Message } from '@boai/shared/domain'
import type { ArtifactVersion } from '@boai/shared/domain/artifacts'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { selectHandoffMaterial, type HandoffBudgetInput, type HandoffCoverage, type HandoffMaterial } from './handoff-budget'

export const HANDOFF_COLLECTION = 'contextHandoffs'
export const handoffHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export interface HandoffIdentity { agentId: string; conversationId: string; taskId?: string; assignmentId?: string; runId?: string }
export interface HandoffTarget extends HandoffIdentity { providerId: string; configurationVersion: string; workspace: string; nativeSessionId?: string }
export interface HandoffSource extends HandoffIdentity { version: string }
export type HandoffStatus = 'prepared' | 'pending' | 'delivered' | 'rejected' | 'unknown' | 'cancelled'
export interface HandoffAttempt {
  id: string
  target: HandoffTarget
  payloadHash: string
  status: Exclude<HandoffStatus, 'prepared'>
  startedAt: string
  settledAt?: string
  evidence?: { kind: 'accepted' | 'injected' | 'not-consumed'; id: string; nativeSessionId?: string }
  reason?: string
}
export interface ContextHandoff {
  id: string
  /** Existing SQL identity lookup indexes the target conversation without loading unrelated payloads. */
  conversationId: string
  requestHash: string
  inputHash: string
  revision: number
  source: HandoffSource
  target: HandoffTarget
  reason: 'runtime-changed' | 'working-directory-changed' | 'context-rebuild' | 'employee-handoff'
  status: HandoffStatus
  material?: HandoffMaterial
  sourceMessages: { id: string; hash: string }[]
  coverage: HandoffCoverage
  payload?: string
  payloadHash: string
  attempts: HandoffAttempt[]
  invalidated?: string
  createdAt: string
  updatedAt: string
}
export interface PrepareHandoff {
  requestId: string
  source: HandoffSource
  target: HandoffTarget
  reason: ContextHandoff['reason']
  material: HandoffMaterial
  budget: HandoffBudgetInput
}
/** Callbacks run within the original store transaction; never reenter the outer store. */
export interface HandoffChecks {
  source(tx: RecordTransaction, transfer: ContextHandoff): Promise<void>
  target(tx: RecordTransaction, transfer: ContextHandoff, target: HandoffTarget): Promise<void>
}
export type HandoffSettlement = {
  status: 'delivered'
  target: HandoffTarget
  payloadHash: string
  evidence: { kind: 'accepted' | 'injected'; id: string; nativeSessionId?: string }
} | {
  status: 'rejected' | 'cancelled'
  target: HandoffTarget
  payloadHash: string
  evidence: { kind: 'not-consumed'; id: string }
  reason: string
} | { status: 'unknown'; target: HandoffTarget; payloadHash: string; reason: string }
export class HandoffConflictError extends Error {
  constructor(message = '交接身份、来源或版本已变化') { super(message); this.name = 'HandoffConflictError' }
}
export interface HandoffCleanupScope { agentId?: string; conversationId?: string; taskId?: string; assignmentId?: string; runIds?: string[] }
/** Use inside the original deletion/fence transaction, including offline cleanup recovery. */
export async function clearContextHandoffs(tx: RecordTransaction, scope: HandoffCleanupScope) {
  if (!scope.agentId && !scope.conversationId && !scope.taskId && !scope.assignmentId && !scope.runIds?.length) return []
  const cleared: string[] = []
  for (const transfer of await tx.list<ContextHandoff>(HANDOFF_COLLECTION)) {
    const matches = [transfer.source, transfer.target].some(identity => (scope.agentId && identity.agentId === scope.agentId)
      || (scope.conversationId && identity.conversationId === scope.conversationId) || (scope.taskId && identity.taskId === scope.taskId)
      || (scope.assignmentId && identity.assignmentId === scope.assignmentId) || scope.runIds?.includes(identity.runId ?? ''))
    if (!matches || transfer.invalidated) continue
    const value: ContextHandoff = { ...transfer, material: undefined, sourceMessages: [], payload: undefined,
      coverage: { ...transfer.coverage, from: undefined, through: undefined, selectedIds: [], omitted: [] },
      attempts: transfer.attempts.map(attempt => ({ ...attempt, reason: undefined })),
      invalidated: '来源或目标已清理', revision: transfer.revision + 1, updatedAt: new Date().toISOString() }
    await tx.put({ collection: HANDOFF_COLLECTION, id: transfer.id, value }); cleared.push(transfer.id)
  }
  return cleared
}
export function handoffMessage(message: Message) {
  if (message.status !== 'completed' || !['user', 'agent'].includes(message.senderType)) throw new HandoffConflictError('交接只接受已完成的公开用户/员工消息')
  return { id: message.id, role: message.senderType === 'user' ? 'user' as const : 'assistant' as const, text: message.content, sequence: message.sequence, hash: handoffHash(message) }
}
const sameTarget = (left: HandoffTarget, right: HandoffTarget, bindNative = false) =>
  left.agentId === right.agentId && left.conversationId === right.conversationId && left.taskId === right.taskId && left.assignmentId === right.assignmentId
  && (bindNative && !left.runId || left.runId === right.runId) && left.providerId === right.providerId && left.configurationVersion === right.configurationVersion && left.workspace === right.workspace
  && (bindNative && !left.nativeSessionId || left.nativeSessionId === right.nativeSessionId)

export class ContextHandoffRepository {
  constructor(private readonly store: ProductStore, private readonly checks: HandoffChecks) {}
  private async put(tx: RecordTransaction, transfer: ContextHandoff) { await tx.put({ collection: HANDOFF_COLLECTION, id: transfer.id, value: transfer }) }
  private async required(tx: RecordTransaction, id: string) {
    const transfer = await tx.get<ContextHandoff>(HANDOFF_COLLECTION, id)
    if (!transfer) throw new HandoffConflictError('交接不存在')
    return transfer
  }
  private async validate(tx: RecordTransaction, transfer: ContextHandoff, target: HandoffTarget) {
    if (transfer.invalidated || !transfer.material || !transfer.payload || handoffHash(transfer.payload) !== transfer.payloadHash) throw new HandoffConflictError('交接材料已失效')
    if (await tx.get('conversationCleanup', transfer.source.conversationId) || await tx.get('conversationCleanup', target.conversationId)) throw new HandoffConflictError('交接会话已清理')
    for (const ref of transfer.sourceMessages) {
      const message = await tx.get<Message>('messages', ref.id)
      if (!message || message.conversationId !== transfer.source.conversationId || handoffHash(message) !== ref.hash) throw new HandoffConflictError('交接原消息已删除或变化')
    }
    for (const entry of transfer.material.entries) {
      const message = await tx.get<Message>('messages', entry.id)
      if (!message || message.conversationId !== transfer.source.conversationId || handoffHash(message) !== entry.hash || handoffHash(handoffMessage(message)) !== handoffHash(entry)) throw new HandoffConflictError('交接原消息已删除或变化')
    }
    for (const ref of transfer.material.artifactRefs) {
      const artifact = await tx.get<ArtifactVersion>('artifacts', ref.id)
      if (!artifact || artifact.conversationId !== transfer.source.conversationId || artifact.contentStatus !== 'ready' || !artifact.registrationSource || artifact.contentHash !== ref.contentHash || artifact.contentVersion !== ref.contentVersion) throw new HandoffConflictError('交接成果版本已失效')
    }
    await this.checks.source(tx, transfer)
    await this.checks.target(tx, transfer, target)
  }
  async prepare(input: PrepareHandoff): Promise<ContextHandoff> {
    if (!input.requestId.trim() || input.requestId.length > 256) throw new HandoffConflictError('交接请求身份无效')
    const requestHash = handoffHash([input.source.agentId, input.requestId]), id = requestHash
    const inputHash = handoffHash(input)
    return this.store.transaction(async tx => {
      const previous = await tx.get<ContextHandoff>(HANDOFF_COLLECTION, id)
      if (previous) {
        if (previous.inputHash !== inputHash) throw new HandoffConflictError('相同交接请求不能更改材料或目标')
        if (previous.invalidated) throw new HandoffConflictError('交接已清理，原请求不会重建')
        await this.validate(tx, previous, previous.target)
        return previous
      }
      const unsettled = [...await tx.list<ContextHandoff>(HANDOFF_COLLECTION, { status: 'pending' }), ...await tx.list<ContextHandoff>(HANDOFF_COLLECTION, { status: 'unknown' })]
      if (unsettled.some(transfer => transfer.source.agentId === input.source.agentId && transfer.source.conversationId === input.source.conversationId && transfer.source.taskId === input.source.taskId && transfer.source.runId === input.source.runId)) throw new HandoffConflictError('原来源交接投递未确定，不能换请求或目标绕过')
      for (const currentId of await tx.relatedIds(HANDOFF_COLLECTION, { conversationId: input.target.conversationId })) {
        const current = await tx.get<ContextHandoff>(HANDOFF_COLLECTION, currentId)
        if (current && current.target.agentId === input.target.agentId && !current.invalidated && !['delivered', 'cancelled'].includes(current.status)) throw new HandoffConflictError('目标已有待交接或未知投递')
      }
      const material: HandoffMaterial = { ...input.material,
        source: { agentId: input.source.agentId, conversationId: input.source.conversationId, taskId: input.source.taskId, runId: input.source.runId },
        target: { agentId: input.target.agentId, conversationId: input.target.conversationId, taskId: input.target.taskId } }
      const selected = selectHandoffMaterial(material, input.budget), now = new Date().toISOString()
      const transfer: ContextHandoff = { id, conversationId: input.target.conversationId, requestHash, inputHash, revision: 1, source: input.source, target: input.target, reason: input.reason, status: 'prepared', ...selected, sourceMessages: input.material.entries.map(({ id, hash }) => ({ id, hash })), payloadHash: handoffHash(selected.payload), attempts: [], createdAt: now, updatedAt: now }
      // Even omitted input is checked at preparation; it must not leak unauthorized source identities.
      await this.validate(tx, { ...transfer, material: input.material }, input.target)
      await this.put(tx, transfer)
      return transfer
    })
  }
  async read(id: string): Promise<ContextHandoff> {
    return this.store.transaction(async tx => {
      const transfer = await this.required(tx, id)
      await this.validate(tx, transfer, transfer.target)
      return transfer
    })
  }
  async beginDelivery(id: string, revision: number, target: HandoffTarget) {
    return this.store.transaction(async tx => {
      const transfer = await this.required(tx, id)
      if (!sameTarget(transfer.target, target, true)) throw new HandoffConflictError('交接目标已变化')
      await this.validate(tx, transfer, target)
      if (transfer.status === 'pending' || transfer.status === 'unknown' || transfer.status === 'delivered') return { transfer, shouldDeliver: false }
      if (transfer.revision !== revision) throw new HandoffConflictError()
      if (transfer.status === 'cancelled') throw new HandoffConflictError('交接已取消')
      if (transfer.attempts.length >= 8) throw new HandoffConflictError('交接投递尝试已达上限')
      const now = new Date().toISOString()
      const attempt: HandoffAttempt = { id: randomUUID(), target, payloadHash: transfer.payloadHash, status: 'pending', startedAt: now }
      const next: ContextHandoff = { ...transfer, target, status: 'pending', revision: transfer.revision + 1, attempts: [...transfer.attempts, attempt], updatedAt: now }
      await this.put(tx, next)
      return { transfer: next, shouldDeliver: true }
    })
  }
  async settle(id: string, attemptId: string, result: HandoffSettlement) {
    return this.store.transaction(async tx => {
      const transfer = await this.required(tx, id), current = transfer.attempts.at(-1)
      if (!current || current.id !== attemptId || !sameTarget(current.target, result.target, true) || current.payloadHash !== result.payloadHash) throw new HandoffConflictError('交接回执不属于当前投递')
      if (transfer.invalidated) throw new HandoffConflictError('交接已失效，迟到回执不能恢复材料')
      if (current.status === result.status) return transfer
      if (current.status !== 'pending' && current.status !== 'unknown') throw new HandoffConflictError('交接已有确定回执')
      if (result.status !== 'unknown' && (!result.evidence.id.trim() || (result.status === 'delivered' && result.target.nativeSessionId !== result.evidence.nativeSessionId))) throw new HandoffConflictError('缺少目标接受或未消费证据')
      const now = new Date().toISOString()
      const settled: HandoffAttempt = { ...current, target: result.target, status: result.status, settledAt: now, ...('evidence' in result ? { evidence: result.evidence } : {}), ...('reason' in result ? { reason: result.reason.slice(0, 300) } : {}) }
      const next: ContextHandoff = { ...transfer, target: result.target, status: result.status, revision: transfer.revision + 1, attempts: [...transfer.attempts.slice(0, -1), settled], updatedAt: now }
      await this.put(tx, next)
      return next
    })
  }
  async bindSession(id: string, attemptId: string, nativeSessionId: string) {
    if (!nativeSessionId.trim()) throw new HandoffConflictError('原生会话身份无效')
    return this.store.transaction(async tx => {
      const transfer = await this.required(tx, id), attempt = transfer.attempts.at(-1)
      if (transfer.invalidated || transfer.status !== 'pending' || attempt?.id !== attemptId) throw new HandoffConflictError('当前投递已变化')
      if (attempt.target.nativeSessionId && attempt.target.nativeSessionId !== nativeSessionId) throw new HandoffConflictError('投递已绑定其他原生会话')
      if (attempt.target.nativeSessionId === nativeSessionId) return transfer
      const target = { ...attempt.target, nativeSessionId }
      const next = { ...transfer, target, revision: transfer.revision + 1, attempts: [...transfer.attempts.slice(0, -1), { ...attempt, target }], updatedAt: new Date().toISOString() }
      await this.put(tx, next)
      return next
    })
  }
  async cancel(id: string, revision: number) {
    return this.store.transaction(async tx => {
      const transfer = await this.required(tx, id)
      if (transfer.revision !== revision) throw new HandoffConflictError()
      if (transfer.status === 'cancelled') return transfer
      if (!['prepared', 'rejected'].includes(transfer.status)) throw new HandoffConflictError('投递可能已被消费，必须核对原投递或停止原运行')
      const next: ContextHandoff = { ...transfer, status: 'cancelled', revision: transfer.revision + 1, updatedAt: new Date().toISOString() }
      await this.put(tx, next)
      return next
    })
  }
  async recover() {
    return this.store.transaction(async tx => {
      const pending = await tx.list<ContextHandoff>(HANDOFF_COLLECTION, { status: 'pending' })
      for (const transfer of pending) {
        const attempt = transfer.attempts.at(-1), now = new Date().toISOString()
        await this.put(tx, { ...transfer, status: 'unknown', revision: transfer.revision + 1, updatedAt: now,
          attempts: attempt ? [...transfer.attempts.slice(0, -1), { ...attempt, status: 'unknown', settledAt: now, reason: '宿主重启，目标是否接受未知；不自动重投' }] : [] })
      }
      return pending.length
    })
  }
  /** Purges bodies but retains request hashes so deletion cannot recreate an old intent. */
  async forget(scope: HandoffCleanupScope) { await this.store.transaction(tx => clearContextHandoffs(tx, scope)) }
}
