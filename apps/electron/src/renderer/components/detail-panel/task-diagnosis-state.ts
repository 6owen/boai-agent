/*
 * [INPUT]: Explicit diagnosis selections and the existing read-only application call.
 * [OUTPUT]: One-shot reads with source checks, bounded page replacement and late-result invalidation.
 * [POS]: Task diagnosis UI lifecycle; no polling, restart or repair command.
 * [PROTOCOL]: Update Header and detail-panel/.folder.md when this file changes.
 */
import type { ApplicationResult } from '@boai/shared/domain/application-protocol'
import type { TaskDiagnosisQuery, TaskDiagnosisSnapshot, TaskDiagnosisTarget } from '@boai/shared/domain/task-diagnosis'

export type TaskDiagnosisReadState = { loading: boolean; target?: TaskDiagnosisTarget; snapshot?: TaskDiagnosisSnapshot; error?: string }
const matches = (target: TaskDiagnosisTarget, snapshot: TaskDiagnosisSnapshot) => target.kind === snapshot.target?.kind && target.employeeId === snapshot.target.employeeId && (target.kind === 'task' ? snapshot.target.kind === 'task' && target.taskId === snapshot.target.taskId && (!target.occurrenceId || snapshot.target.occurrenceId === target.occurrenceId) : snapshot.target.kind === 'run' && target.runId === snapshot.target.runId && target.conversationId === snapshot.target.conversationId)
export function createTaskDiagnosisReader(call: (query: TaskDiagnosisQuery) => Promise<ApplicationResult>, changed: (state: TaskDiagnosisReadState) => void) {
  let generation = 0, state: TaskDiagnosisReadState = { loading: false }
  return {
    reset() { generation++; state = { loading: false }; changed(state) },
    async read(target: TaskDiagnosisTarget, cursor?: string) {
      const request = ++generation, previous = state.snapshot
      state = { loading: true, target, ...(cursor ? { snapshot: previous } : {}) }; changed(state)
      try {
        const result = await call({ target, ...(cursor ? { cursor } : {}) })
        if (request !== generation) return
        if (result.status !== 'succeeded') throw new Error(result.error?.message ?? '当前任务证据不可读，原因仍未知。')
        const snapshot = result.data as TaskDiagnosisSnapshot
        if (!snapshot || !matches(target, snapshot) || !Array.isArray(snapshot.facts) || !Array.isArray(snapshot.candidates)) throw new Error('诊断返回来源已变化，请重新选择原任务。')
        // Keep one bounded page; never grow a history list indefinitely.
        state = { loading: false, target, snapshot }; changed(state)
      } catch (error) {
        if (request !== generation) return
        state = { loading: false, target, error: error instanceof Error ? error.message : '当前任务证据不可读，原因仍未知。' }; changed(state)
      }
    },
  }
}
