/*
 * [INPUT]: 真实运行事件、用户原生交互回应、产品SQLite事务。
 * [OUTPUT]: 完整执行证据分块合并/稳定位置/代际；待决原生请求只接受明确回答，重启标为中断且不重放。
 * [POS]: 执行事实仓库，不承担原生工具循环或另建业务调度。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { recordValue } from '../../adapters/native-events'
import { createHash } from 'node:crypto'
import type { AgentRun } from '../../../shared/domain'
import type { ExecutionEvent, ExecutionEvidence, NativeAction, NativeActionInput, NativeActionResponse } from '../../../shared/domain/execution'
import type { ProductStore } from '../../adapters/storage/product-store'

const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export class ExecutionRepository {
  private pending = new Map<string, { resolve(response: NativeActionResponse): void; reject(error: unknown): void }>()
  constructor(private readonly store: ProductStore, private readonly changed: (conversationId: string) => void) {}
  async recover() {
    await this.store.transaction(async tx => {
      for (const action of await tx.list<NativeAction>('nativeActions')) if (action.status === 'pending') await tx.put({ collection: 'nativeActions', id: action.id, value: { ...action, status: 'interrupted' } })
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
        const field = event.eventType === 'agent.text.block' ? 'text' : 'delta'
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
  async request(run: AgentRun, input: NativeActionInput, signal: AbortSignal, onReady?: () => Promise<void>): Promise<NativeActionResponse> {
    signal.throwIfAborted()
    const id = identity(run.id, input.id), action: NativeAction = { ...input, id, runId: run.id, conversationId: run.conversationId, agentId: run.agentId, createdAt: new Date().toISOString(), status: 'pending' }
    if (this.pending.has(id) || await this.store.get<NativeAction>('nativeActions', id)) throw new Error('原生请求身份已使用，不能重复执行')
    let resolve!: (response: NativeActionResponse) => void, reject!: (error: unknown) => void
    const response = new Promise<NativeActionResponse>((done, fail) => { resolve = done; reject = fail }); void response.catch(() => {})
    const abort = () => reject(signal.reason)
    this.pending.set(id, { resolve, reject }); signal.addEventListener('abort', abort, { once: true })
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
    const candidates = (await this.store.load<NativeAction>('nativeActions')).filter(action => action.conversationId === conversationId && action.kind === 'input' && action.status === 'pending' && this.pending.has(action.id) && !action.questions?.some(question => question.isSecret) && (!recipients.length || recipients.includes(action.agentId)))
    return candidates.length === 1 ? candidates[0] : undefined
  }
  async respond(id: string, response: NativeActionResponse, responseMessageId?: string) {
    const waiting = this.pending.get(id)
    if (!waiting) throw new Error('此请求已结束，请查看原执行结果')
    const action = await this.store.transaction(async tx => {
      const action = await tx.get<NativeAction>('nativeActions', id)
      if (!action || action.status !== 'pending') throw new Error('原生请求已被回答或中断')
      if (action.kind === 'approval' && !action.options.some(option => option.id === response.option)) throw new Error('批准选项不属于此请求')
      if (action.kind === 'input' && action.questions?.some(question => !response.answers?.[question.id]?.length)) throw new Error('请回答原生请求的问题')
      const persisted = action.questions?.some(question => question.isSecret) ? undefined : response
      await tx.put({ collection: 'nativeActions', id, value: { ...action, status: 'answered', response: persisted, responseMessageId } }); return action
    })
    waiting.resolve(response); this.changed(action.conversationId)
  }
}
