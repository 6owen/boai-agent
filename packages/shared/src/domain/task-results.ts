/*
 * [INPUT]: Original Work, source-checked messages/artifacts and current Run guards.
 * [OUTPUT]: Bounded owner task-result projection shared by desktop and CLI; reading never continues a task.
 * [POS]: Task results describe execution Work, distinct from tasks.* tracking records.
 * [PROTOCOL]: Update Header and domain/.folder.md on change.
 */
import { z } from 'zod'
import type { AgentRun, WorkItem } from './index'
export const TASK_RESULT_LIMITS = { files: 20, messages: 20, runs: 20, excerpt: 2000 } as const
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
export const taskResultQuerySchema = z.object({ workId: id }).strict()
export const taskResultListSchema = z.object({ conversationId: id.optional(), ownerAgentId: id.optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(3000).optional() }).strict()
export interface TaskResultFile {
  id: string; name?: string; size?: number; contentHash?: string; contentVersion?: number
  status: 'available' | 'unavailable'; reason?: string
}
export interface TaskResultMessage { id: string; status: 'available' | 'unavailable'; excerpt?: string; truncated?: boolean; reason?: string }
export type TaskResultRun = Pick<AgentRun, 'id' | 'conversationId' | 'agentId' | 'status' | 'phase' | 'createdAt' | 'finishedAt' | 'messageId' | 'triggerMessageId'> & {
  error?: string; errorTruncated?: boolean; toolCounts: { completed: number; failed: number; running: number }
}
export interface TaskResult {
  schemaVersion: 1
  work: Pick<WorkItem, 'id' | 'conversationId' | 'ownerAgentId' | 'sourceMessageId' | 'deliverable' | 'status' | 'version' | 'resultVersion' | 'updatedAt' | 'nextStep'>
  summary?: string
  files: { items: TaskResultFile[]; total: number; truncated: boolean }
  messages: { items: TaskResultMessage[]; total: number; truncated: boolean }
  runs: { items: TaskResultRun[]; total: number; truncated: boolean; unavailable: number }
  continuation: { state: 'available' | 'blocked' | 'review_required' | 'not_applicable'; reason?: string; runId?: string }
}
