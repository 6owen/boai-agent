/*
 * [OUTPUT]: 正文与思考块按稳定身份累积text，重复快照覆盖原块而非追加重复内容。
 * [OUTPUT]: 2026-10-12消息回答可组合原事务，接受/提交/未知分别记录；多候选和私密输入不误入普通等待队列，重启不重放。
 * [INPUT]: 真实运行事件、用户原生交互回应、产品SQLite事务。
 * [OUTPUT]: 完整执行证据分块合并/稳定位置/代际；待决原生请求只接受明确回答，重启标为中断且不重放。
 * [POS]: 执行事实仓库，不承担原生工具循环或另建业务调度。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { recordValue } from '../../adapters/native-events'
import { createHash } from 'node:crypto'
import type { AgentRun, Message } from '../../../shared/domain'
import type { ExecutionEvent, ExecutionEvidence, NativeAction, NativeActionInput, NativeActionResponse } from '../../../shared/domain/execution'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
type MessageAnswer = { content: string; commit(): void; rollback(): Promise<void> }
export class ExecutionRepository {
  private pending = new Map<string, { resolve(response: NativeActionResponse): void; reject(error: unknown): void; message?(tx: RecordTransaction, message: Message): Promise<MessageAnswer> }>()
  constructor(private readonly store: ProductStore, private readonly changed: (conversationId: string) => void) {}
  async recover() {
    await this.store.transaction(async tx => {
      for (const action of await tx.list<NativeAction>('nativeActions')) {
        if (action.status === 'pending') await tx.put({ collection: 'nativeActions', id: action.id, value: { ...action, status: 'interrupted' } })
        else if (action.status === 'answered' && action.delivery && action.delivery !== 'unknown' && (await tx.get<AgentRun>('runs', action.runId))?.status !== 'completed') await tx.put({ collection: 'nativeActions', id: action.id, value: { ...action, delivery: 'unknown' } })
      }
    })
  }
  async append(run: AgentRun, event: ExecutionEvent) {
    await this.store.transaction(async tx => {
      const current = await tx.get<AgentRun>('runs', run.id)
      if (!current || current.conversationId !== run.conversationId || await tx.get('conversationCleanup', run.conversationId)) return
      const id = identity(run.id, event.id), previous = await tx.get<ExecutionEvidence>('executionEvidence', id)
      const clock = await tx.get<{ id: string; sequence: number; revision: number }>('executionClocks', run.id) ?? { id: run.id, sequence: 0, revision: 0 }
      const previousPayload = recordValue(previous?.payload), incomingPayload = recordValue(event.payload)
      const payload = { ...previousPayload, ...incomingPayload }
      if (event.appendText !== undefined) {
        const field = ['agent.text.block', 'agent.reasoning.block'].includes(event.eventType) ? 'text' : 'delta'
        payload[field] = String(previousPayload[field] ?? '') + event.appendText
      }
      // Item completion may omit the initial arguments; preserve those bytes.
      if (previousPayload.item && incomingPayload.item) payload.item = { ...(previousPayload.item as object), ...(incomingPayload.item as object) }
      if (event.appendOutput !== undefined) payload.item = { ...recordValue(payload.item), aggregatedOutput: String(recordValue(previousPayload.item).aggregatedOutput ?? '') + event.appendOutput }
      const timestamp = new Date().toISOString(), sequence = previous?.sequence ?? ++clock.sequence
      const value: ExecutionEvidence = { id, runId: run.id, agentRunId: run.id, conversationId: run.conversationId, agentId: run.agentId,
        sequence, revision: clock.revision + 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, eventType: event.appendOutput !== undefined ? previous?.eventType ?? 'activity.started' : event.eventType, payload,
        canonical: event.canonical ?? previous?.canonical, parentId: event.parentId ?? previous?.parentId, contentLength: JSON.stringify(payload).length, deferred: false }
      if (value.canonical) Object.assign(value.canonical, { firstEvidenceSequence: sequence, lastEvidenceSequence: sequence, revision: clock.revision + 1 })
      await tx.put({ collection: 'executionEvidence', id, value }); await tx.put({ collection: 'executionClocks', id: run.id, value: { ...clock, conversationId: run.conversationId, revision: clock.revision + 1 } })
    })
    this.changed(run.conversationId)
  }
  async request(run: AgentRun, input: NativeActionInput, signal: AbortSignal, onReady?: () => Promise<void>, message?: (tx: RecordTransaction, message: Message) => Promise<MessageAnswer>): Promise<NativeActionResponse> {
    signal.throwIfAborted()
    const id = identity(run.id, input.id), action: NativeAction = { ...input, id, runId: run.id, conversationId: run.conversationId, agentId: run.agentId, createdAt: new Date().toISOString(), status: 'pending' }
    if (this.pending.has(id) || await this.store.get<NativeAction>('nativeActions', id)) throw new Error('原生请求身份已使用，不能重复执行')
    let resolve!: (response: NativeActionResponse) => void, reject!: (error: unknown) => void
    const response = new Promise<NativeActionResponse>((done, fail) => { resolve = done; reject = fail }); void response.catch(() => {})
    const abort = () => reject(signal.reason)
    this.pending.set(id, { resolve, reject, message }); signal.addEventListener('abort', abort, { once: true })
    try {
      await this.store.write([{ collection: 'nativeActions', id, value: action }]); this.changed(run.conversationId)
      signal.throwIfAborted(); await onReady?.(); return await response
    } finally {
      signal.removeEventListener('abort', abort); this.pending.delete(id)
      await this.store.transaction(async tx => { const saved = await tx.get<NativeAction>('nativeActions', id); if (saved?.status === 'pending') await tx.put({ collection: 'nativeActions', id, value: { ...saved, status: 'interrupted' } }) })
      this.changed(run.conversationId)
    }
  }
  async hasPendingApproval(runId: string) {
    return (await this.store.load<NativeAction>('nativeActions')).some(action => action.runId === runId && action.kind === 'approval' && action.status === 'pending' && this.pending.has(action.id))
  }
  async inputForMessage(conversationId: string, recipients: string[]) {
    const candidates = (await this.store.load<NativeAction>('nativeActions')).filter(action => action.conversationId === conversationId && action.kind === 'input' && action.status === 'pending' && this.pending.has(action.id) && (!recipients.length || recipients.includes(action.agentId)))
    if (candidates.some(action => action.questions?.some(question => question.isSecret))) throw new Error('此原生请求包含私密输入，请在执行面板回应')
    if (candidates.length > 1) throw new Error('有多个原生问题正在等待，请@具体员工或在执行面板回应原请求')
    return candidates[0]
  }
  async answerMessage(tx: RecordTransaction, id: string, message: Message) {
    const waiting = this.pending.get(id), action = await tx.get<NativeAction>('nativeActions', id)
    if (!waiting?.message || action?.status !== 'pending' || action.kind !== 'input' || action.conversationId !== message.conversationId) throw new Error('原生问题已结束或不能接收此消息')
    const prepared = await waiting.message(tx, message)
    try {
      const deliver = await this.respondInTransaction(tx, id, { answers: Object.fromEntries((action.questions ?? []).map(question => [question.id, [prepared.content]])) }, message.id)
      return { deliver: async () => { prepared.commit(); await deliver() }, rollback: prepared.rollback }
    } catch (error) { await prepared.rollback(); throw error }
  }
  async respondInTransaction(tx: RecordTransaction, id: string, response: NativeActionResponse, responseMessageId?: string) {
    const waiting = this.pending.get(id)
    if (!waiting) throw new Error('此请求已结束，请查看原执行结果')
    const action = await tx.get<NativeAction>('nativeActions', id)
    if (!action || action.status !== 'pending') throw new Error('原生请求已被回答或中断')
    if (action.kind === 'approval' && !action.options.some(option => option.id === response.option)) throw new Error('批准选项不属于此请求')
    if (action.kind === 'input' && action.questions?.some(question => !response.answers?.[question.id]?.length)) throw new Error('请回答原生请求的问题')
    const persisted = action.questions?.some(question => question.isSecret) ? undefined : response
    await tx.put({ collection: 'nativeActions', id, value: { ...action, status: 'answered', response: persisted, responseMessageId, delivery: 'accepted' } })
    return async () => {
      if (this.pending.get(id) !== waiting) { await this.delivery(id, 'unknown'); return }
      waiting.resolve(response); this.changed(action.conversationId)
    }
  }
  async respond(id: string, response: NativeActionResponse, responseMessageId?: string) {
    const deliver = await this.store.transaction(tx => this.respondInTransaction(tx, id, response, responseMessageId))
    await deliver()
  }
  private async delivery(id: string, delivery: 'submitted' | 'unknown') {
    await this.store.transaction(async tx => {
      const action = await tx.get<NativeAction>('nativeActions', id)
      if (action?.status === 'answered') await tx.put({ collection: 'nativeActions', id, value: { ...action, delivery } })
    })
  }
  async submitted(runId: string, nativeId: string) {
    await this.delivery(identity(runId, nativeId), 'submitted')
  }
}
