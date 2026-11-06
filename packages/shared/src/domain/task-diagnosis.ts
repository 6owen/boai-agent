/*
 * [INPUT]: Persisted task, occurrence, Work, Run and host-observed identities.
 * [OUTPUT]: Strict bounded diagnosis input and metadata-only read projections; no repair command.
 * [POS]: Shared task diagnosis contract; existing domains retain their own state authority.
 * [PROTOCOL]: Update this Header and domain/.folder.md when this file changes.
 */
import { z } from 'zod'
import type { DesktopDiagnosticsSnapshot } from '../ipc/desktop-diagnostics'

const id = z.string().min(1).max(200)
export const TASK_DIAGNOSIS_LIMITS = { facts: 40, maxFacts: 100, runs: 12, records: 40, occurrences: 10 } as const
export const taskDiagnosisTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), employeeId: id, taskId: id, occurrenceId: id.optional() }).strict(),
  z.object({ kind: z.literal('run'), employeeId: id, conversationId: id, runId: id }).strict(),
])
export const taskDiagnosisQuerySchema = z.object({
  target: taskDiagnosisTargetSchema,
  focus: z.enum(['status', 'duration']).default('status'),
  limit: z.number().int().min(1).max(TASK_DIAGNOSIS_LIMITS.maxFacts).default(TASK_DIAGNOSIS_LIMITS.facts),
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict()
export type TaskDiagnosisTarget = z.infer<typeof taskDiagnosisTargetSchema>
export type TaskDiagnosisQuery = z.input<typeof taskDiagnosisQuerySchema>
export type DiagnosisFact = {
  id: string
  kind: 'task' | 'occurrence' | 'run' | 'approval' | 'input' | 'dependency' | 'tool' | 'receipt'
  status: string
  at?: string
  evidence: { collection: string; id: string; runId?: string; revision?: number }
  visibility: 'diagnostic-metadata'
  relation: 'target' | 'source-message'
  errorCode?: string
}
export interface DiagnosisTiming {
  basis: 'observed-intervals'
  unionMs: number | null
  summedMs: number | null
  overlapMs: number | null
  intervals: { sourceId: string; runId: string; start: string; end: string; durationMs: number }[]
  unknownIntervals: number
  invalidClockIntervals: number
  complete: false
  explanation: string
}
export interface TaskDiagnosisSnapshot {
  schemaVersion: 1
  target: TaskDiagnosisTarget & { conversationId?: string; occurrenceId?: string; taskRevision?: number; occurrenceVersion?: number; runIds: string[]; workIds: string[] }
  observedAt: string
  sourceObservedAt: { runtime: string; host?: string }
  snapshotChanged: boolean
  selectionRequired: boolean
  candidates: { kind: 'occurrence' | 'run'; id: string; status: string; at: string }[]
  state: {
    task?: { status: string; statusSource?: string }
    occurrence?: { status: string; deliveryStatus: string }
    runs: { id: string; status: string; phase?: string }[]
    works: { id: string; status: string; version: number; resultVersion: number; requiresReview: boolean }[]
    waiting: { approval: boolean; input: boolean; dependency: boolean; queue: boolean; tool: boolean }
  }
  facts: DiagnosisFact[]
  nextCursor?: string
  assessment: { certainty: 'supported' | 'hypothesis' | 'unknown'; findings: string[]; evidenceIds: string[]; missingEvidence: string[]; suggestedNextSteps: string[] }
  timing: DiagnosisTiming
  coverage: { runsTruncated: boolean; evidenceTruncated: boolean; recordsTruncated: boolean; sourceUnavailable: number; receipts: 'source-message-only' | 'unavailable'; nativeActions: 'available' | 'unavailable'; host: 'available' | 'unavailable' | 'not-requested'; reasons: string[]; totalFacts: number }
  host?: DesktopDiagnosticsSnapshot
}
