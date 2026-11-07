/*
 * [INPUT]: Explicit owner explanation request, durable request identity and original core/message receipts.
 * [OUTPUT]: Original-request viewing never sends; only a typed matching rejection clears pending for another explicit send.
 * [POS]: Task diagnosis explanation lifecycle; separate from the read-only snapshot reader.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md when this file changes.
 */
import { z } from 'zod'
import type { Conversation, Message } from '@boai/shared/domain'
import { taskDiagnosisExplanationResultSchema, taskDiagnosisTargetSchema, type StartTaskDiagnosisExplanationInput, type TaskDiagnosisTarget } from '@boai/shared/domain/task-diagnosis'

const sourceSchema = z.object({ conversationId: z.string().min(1), messageId: z.string().min(1) }).strict()
const savedSchema = z.object({ requestId: z.string().min(1), target: taskDiagnosisTargetSchema, source: sourceSchema.optional() }).strict()
type Saved = z.infer<typeof savedSchema>
export type DiagnosisExplanationState = { busy: boolean; pending: boolean; accepted: boolean; error?: string }
export type DiagnosisExplanationSource = z.infer<typeof sourceSchema>
type Ports = {
  read(): string | null
  write(value: string): void
  clear(): void
  requestId(): string
  start(input: StartTaskDiagnosisExplanationInput): Promise<unknown>
  receipts(requestId: string): Promise<[Conversation | null, Message | null]>
}
const sameTarget = (a: TaskDiagnosisTarget, b: TaskDiagnosisTarget) => a.kind === b.kind && a.employeeId === b.employeeId && (a.kind === 'task' ? b.kind === 'task' && a.taskId === b.taskId && a.occurrenceId === b.occurrenceId : b.kind === 'run' && a.runId === b.runId && a.conversationId === b.conversationId)
const unknown = 'bobo 请求结果尚未确定；原请求已保留，请核对回执。'
export function createTaskDiagnosisExplanation(ports: Ports, changed: (state: DiagnosisExplanationState) => void) {
  let generation = 0, busy = false, saved: Saved | undefined, storageError = false, error: string | undefined
  try { const value = ports.read(); if (value !== null) saved = savedSchema.parse(JSON.parse(value)) } catch { storageError = true }
  const state = (): DiagnosisExplanationState => ({ busy, pending: !!saved && !saved.source, accepted: !!saved?.source, ...(storageError ? { error: '原诊断请求记录不可读，未发送新请求。' } : error ? { error } : {}) })
  const publish = () => changed(state())
  const clearPersistedRequest = (requestId: string) => {
    const persisted = ports.read()
    if (persisted === null) return true
    if (savedSchema.parse(JSON.parse(persisted)).requestId !== requestId) return false
    ports.clear(); return true
  }
  return {
    state,
    invalidate() { generation++; busy = false },
    async explain(target: TaskDiagnosisTarget): Promise<DiagnosisExplanationSource | undefined> {
      if (busy || storageError) { publish(); return }
      const current = ++generation
      busy = true; error = undefined; publish()
      try {
        let record = saved
        if (!record) {
          record = { requestId: ports.requestId(), target: taskDiagnosisTargetSchema.parse(target) }
          // Persist before sending. An unavailable receipt never permits a second send.
          ports.write(JSON.stringify(record)); saved = record
          let response: unknown
          try { response = await ports.start({ requestId: record.requestId, diagnosisTarget: record.target }) } catch { /* Reconcile the original identity only. */ }
          const outcome = taskDiagnosisExplanationResultSchema.safeParse(response)
          if (outcome.success && outcome.data.status === 'rejected' && outcome.data.requestId === record.requestId) {
            const cleared = clearPersistedRequest(record.requestId)
            if (cleared && saved?.requestId === record.requestId && !saved.source) saved = undefined
            if (current === generation) error = cleared ? '本次解释请求未受理，请检查当前配置后重新发送。' : unknown
            return
          }
        }
        const [conversation, message] = await ports.receipts(record.requestId)
        if (!conversation || !message) throw new Error(unknown)
        const actual = taskDiagnosisTargetSchema.safeParse(message.diagnosisTarget)
        if (message.conversationId !== conversation.id || message.senderType !== 'user' || message.senderId !== 'user' || !actual.success || !sameTarget(record.target, actual.data)) throw new Error('原请求回执来源不匹配，未跳转或重新发送。')
        const source = { conversationId: conversation.id, messageId: message.id }
        // Another controller can have reconciled this request and submitted its successor.
        // Keep this read/check/clear synchronous, and only remove our own persisted identity.
        clearPersistedRequest(record.requestId)
        // A failed read or clear leaves the original request pending and cannot authorize a new send.
        if (saved?.requestId === record.requestId) saved = { ...record, source }
        if (current !== generation) return
        return source
      } catch (cause) {
        if (current === generation) error = saved ? (cause instanceof Error ? cause.message : unknown) : '无法保存原请求身份，未发送诊断消息。'
      } finally {
        if (current === generation) { busy = false; publish() }
      }
    },
  }
}
