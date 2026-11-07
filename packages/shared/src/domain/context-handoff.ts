/*
 * [INPUT]: Explicit owner request to carry a completed work result into a target employee conversation.
 * [OUTPUT]: Bounded handoff commands and receipt-only projections; preparation does not execute work.
 * [POS]: WT3 context transfer contract, separate from task acceptance and native provider state.
 * [PROTOCOL]: Update Header and domain/.folder.md when changed.
 */
import { z } from 'zod'
const id = z.string().trim().min(1).max(256)
export const handoffPrepareSchema = z.object({
  requestId: id, sourceWorkId: id, sourceRunId: id, targetAgentId: id, targetConversationId: id,
  reason: z.enum(['runtime-changed', 'working-directory-changed', 'context-rebuild', 'employee-handoff']),
  goal: z.string().trim().min(1).max(16000), constraints: z.array(z.string().max(2000)).max(64).optional(),
}).strict()
export const handoffQuerySchema = z.object({ agentId: id, conversationId: id }).strict()
export const handoffCancelSchema = z.object({ id, revision: z.number().int().positive() }).strict()
export type HandoffPrepareInput = z.infer<typeof handoffPrepareSchema>
export type HandoffQuery = z.infer<typeof handoffQuerySchema>
export type HandoffCancelInput = z.infer<typeof handoffCancelSchema>
export interface HandoffSummary {
  id: string
  revision: number
  source: { agentId: string; conversationId: string; taskId?: string; assignmentId?: string; runId?: string; version: string }
  target: { agentId: string; conversationId: string; taskId?: string; assignmentId?: string; runId?: string; providerId: string; configurationVersion: string; workspace: string; nativeSessionId?: string }
  reason: HandoffPrepareInput['reason']
  status: 'prepared' | 'pending' | 'delivered' | 'rejected' | 'unknown' | 'cancelled'
  coverage: { strategy: 'intact-public-history-v1'; from?: string; through?: string; selectedIds: string[]; omitted: { id: string; reason: 'budget' }[]; budget: number; used: number; capacitySource: 'provider-declared' | 'unknown-policy' }
  payloadHash: string
  attemptId?: string
  available: boolean
  unavailableReason?: string
  createdAt: string
  updatedAt: string
}
export interface ContextHandoffMethods {
  prepareContextHandoff: { input: HandoffPrepareInput; output: HandoffSummary }
  listContextHandoffs: { input: HandoffQuery; output: HandoffSummary[] }
  cancelContextHandoff: { input: HandoffCancelInput; output: HandoffSummary }
}
