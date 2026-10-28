/*
 * [INPUT]: Explicit owner message, exact active native run/turn and original message transaction.
 * [OUTPUT]: One native submission per accepted message; durable receipt and unknown recovery without replay.
 * [POS]: Live input delivery only; native execution and business scheduling remain with their original owners.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import type { AgentRun, Message } from '@boai/shared/domain'
import type { NativeSteeringTarget } from '@boai/shared/domain/execution'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'

type Prepared = { content: string; commit(): void; rollback(): Promise<void> }
type Binding = {
  run: AgentRun; signal: AbortSignal; pendingMessageId?: string
  validate(): Promise<unknown>
  prepare(tx: RecordTransaction, message: Message): Promise<Prepared>
  send(messageId: string, content: string): Promise<void>
  fail(error: Error): void
}
export class NativeSteering {
  private bindings = new Map<string, Binding>()
  private pending = new Map<string, { binding: Binding; content: string }>()
  private deliveries = new Map<string, Promise<Message>>()
  constructor(private store: ProductStore, private changed: (message: Message) => void) {}

  register(run: AgentRun, signal: AbortSignal, callbacks: Omit<Binding, 'run' | 'signal'>) {
    const binding = { run, signal, ...callbacks }
    this.bindings.set(run.id, binding)
    return () => { if (this.bindings.get(run.id) === binding) this.bindings.delete(run.id) }
  }
  private current(target: NativeSteeringTarget, conversationId: string, recipients: string[] = []) {
    const binding = this.bindings.get(target.runId), run = binding?.run
    if (!binding || binding.signal.aborted || !run || run.status !== 'running' || run.conversationId !== conversationId || run.backend?.kind !== 'codex-local' || run.backend.turnId !== target.turnId || !run.backend.inputAccepted || run.origin || recipients.some(id => id !== run.agentId)) throw new Error('此原生轮次已结束、正在等待或不支持补充，请查看当前执行')
    return binding
  }
  async validate(target: NativeSteeringTarget, conversationId: string, recipients: string[]) {
    await this.current(target, conversationId, recipients).validate()
  }
  async prepare(tx: RecordTransaction, target: NativeSteeringTarget, message: Message) {
    const binding = this.current(target, message.conversationId, message.mentionIds)
    if ((await tx.list<{ runId: string; status: string }>('nativeActions', { status: 'pending' })).some(action => action.runId === target.runId && action.status === 'pending')) throw new Error('请先回应原生执行中的批准或提问')
    if (binding.pendingMessageId) throw new Error('上一条补充尚未确认，请先核对原消息')
    const prepared = await binding.prepare(tx, message)
    message.nativeSteering = { ...target, delivery: 'accepted' }
    binding.pendingMessageId = message.id
    return { rollback: async () => { if (binding.pendingMessageId === message.id) delete binding.pendingMessageId; await prepared.rollback() }, deliver: async () => {
      prepared.commit()
      this.pending.set(message.id, { binding, content: prepared.content })
    } }
  }
  async deliver(message: Message): Promise<Message> {
    const active = this.deliveries.get(message.id)
    if (active) return active
    const pending = this.pending.get(message.id)
    // A repeated request or process restart only reads its receipt.
    if (!pending) return await this.store.get<Message>('messages', message.id) ?? message
    this.pending.delete(message.id)
    const operation = (async () => {
      let delivery: 'submitted' | 'unknown' = 'unknown'
      try {
        const current = this.current(message.nativeSteering!, message.conversationId)
        if (current !== pending.binding) throw new Error('原生执行已替换，未投递补充')
        await current.send(message.id, pending.content)
        delivery = 'submitted'
      } catch {
        pending.binding.fail(new Error('补充指令的原生接收结果未确认，已停止原执行；请核对原消息，未自动重发'))
      }
      const saved = await this.store.transaction(async tx => {
        const value = await tx.get<Message>('messages', message.id)
        if (!value?.nativeSteering || await tx.get('conversationCleanup', message.conversationId)) return undefined
        const updated: Message = { ...value, status: delivery === 'submitted' ? 'completed' : 'failed', nativeSteering: { ...value.nativeSteering, delivery } }
        await tx.put({ collection: 'messages', id: value.id, value: updated })
        return updated
      })
      if (saved) this.changed(saved)
      return saved ?? message
    })()
    this.deliveries.set(message.id, operation)
    try { return await operation } finally { this.deliveries.delete(message.id); if (pending.binding.pendingMessageId === message.id) delete pending.binding.pendingMessageId }
  }
  async recover() {
    await this.store.transaction(async tx => {
      for (const message of await tx.list<Message>('messages')) if (message.nativeSteering?.delivery === 'accepted') {
        await tx.put({ collection: 'messages', id: message.id, value: { ...message, status: 'failed', nativeSteering: { ...message.nativeSteering, delivery: 'unknown' } } })
      }
    })
  }
}
