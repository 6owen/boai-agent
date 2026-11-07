/*
 * [INPUT]: The original worker parent port and explicit application-host replies.
 * [OUTPUT]: Only pure diagnosis reads have a deadline; settling removes pending state and preserves safe error codes.
 * [POS]: Owned runtime application host transport; configuration writes keep their original completion semantics.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { randomUUID } from 'node:crypto'
import type { Methods } from '@boai/shared/ipc'
import { ApplicationHostError, decodeApplicationHostError, type ApplicationHostMethod, type ApplicationHostPort } from '@boai/shared/ipc/application-host'

type Reply = { id: string; result?: unknown; error?: string; errorCode?: unknown }
type Request = { type: 'application-host'; id: string; method: ApplicationHostMethod; input: unknown }
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }

export class WorkerApplicationHost implements ApplicationHostPort {
  readonly available = true
  private pending = new Map<string, Pending>()
  constructor(private send: (message: Request) => void, private options: { diagnosisTimeoutMs?: number } = {}) {}
  request<K extends ApplicationHostMethod>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']> {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = method === 'getDiagnosticsSnapshot' ? setTimeout(() => {
        const pending = this.take(id)
        pending?.reject(new ApplicationHostError('CAPABILITY_UNAVAILABLE', '桌面诊断读取超时，当前证据不可用。'))
      }, this.options.diagnosisTimeoutMs ?? 5000) : undefined
      timer?.unref?.()
      this.pending.set(id, { resolve: value => resolve(value as Methods[K]['output']), reject, timer })
      try { this.send({ type: 'application-host', id, method, input }) }
      catch (error) { this.take(id)?.reject(error instanceof Error ? error : new Error('桌面宿主请求结果未知。')) }
    })
  }
  private take(id: string) {
    const pending = this.pending.get(id)
    if (pending) { this.pending.delete(id); clearTimeout(pending.timer) }
    return pending
  }
  accept(reply: Reply) {
    const pending = this.take(reply.id)
    if (!pending) return false
    if (reply.error) pending.reject(decodeApplicationHostError(reply.error, reply.errorCode))
    else pending.resolve(reply.result)
    return true
  }
}
