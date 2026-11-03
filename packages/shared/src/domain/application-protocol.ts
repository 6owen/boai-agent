/*
 * [OUTPUT]: 定时业务错误、关联未决回执与契约版本公开；目录提供可信日期/时区，不泄漏内部参数。
 * [OUTPUT]: 宿主生成behavior调用身份；源消息与已启用行为分别核验，编辑人格不授予核心权限。
 * [INPUT]: Authenticated application callers and explicit registered business operations.
 * [OUTPUT]: Versioned discovery, invocation and durable receipts, independent of Agent Run/Work.
 * [POS]: Shared application protocol; transports and model tools are adapters of this contract.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { z } from 'zod'
import type { ScheduleErrorCode } from './schedules'

export const APPLICATION_PROTOCOL_VERSION = 'boai.application.v1' as const
export const applicationRequestSchema = z.object({
  operation: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/).max(100),
  input: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().min(1).max(200).optional(),
  /** Fixed external clients may select a supported input contract; model adapters bind the current version. */
  contractVersion: z.number().int().positive().optional(),
}).strict()
export const applicationCatalogQuerySchema = z.object({ domain: z.string().min(1).max(100).optional(), operation: z.string().min(1).max(100).optional(), includeSchemas: z.boolean().optional() }).strict().default({})
export type ApplicationRequest = z.input<typeof applicationRequestSchema>
export type ApplicationCatalogQuery = z.input<typeof applicationCatalogQuerySchema>
export interface ApplicationOperationDescriptor {
  contractVersion?: number
  schemaFingerprint?: string
  name: string
  description: string
  effect: 'read' | 'write'
  access: 'owner' | 'owner-or-core'
  available: boolean
  unavailableReason?: string
  inputSchema?: Record<string, unknown>
  resultType: string
  outputSchema?: Record<string, unknown>
}
export interface ApplicationCatalog {
  context?: { employeeId?: string; timezone: string; localDate: string; now: string }
  protocolVersion: typeof APPLICATION_PROTOCOL_VERSION
  operations: ApplicationOperationDescriptor[]
}
export type ApplicationErrorCode = ScheduleErrorCode | 'UNKNOWN_OPERATION' | 'CAPABILITY_UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'UNRESOLVED_WRITE' | 'NO_PROGRESS' | 'UNSUPPORTED_CONTRACT_VERSION'
export interface ApplicationError { code: ApplicationErrorCode; message: string; fields?: string[]; relatedReceiptId?: string }
export interface ApplicationResult {
  protocolVersion: typeof APPLICATION_PROTOCOL_VERSION
  operation: string
  requestId?: string
  status: 'succeeded' | 'rejected' | 'running' | 'unknown' | 'cleared'
  data?: unknown
  error?: ApplicationError
  receiptId?: string
  startedAt?: string
  finishedAt?: string
}
/** Constructed by the host. Never accepted as a field of a model/CLI request. */
export type ApplicationActor = { kind: 'owner' } | { kind: 'employee'; employeeId: string; conversationId: string; messageId: string } | { kind: 'behavior'; employeeId: string; conversationId: string; behaviorRunId: string }

export const applicationReceiptQuerySchema = z.object({ requestId: z.string().min(1).max(200).optional(), receiptId: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().refine(value => !!value.requestId !== !!value.receiptId, 'Provide exactly one receipt identity')
export type ApplicationReceiptQuery = z.infer<typeof applicationReceiptQuerySchema>
export const applicationResultSchema = z.object({ protocolVersion: z.literal(APPLICATION_PROTOCOL_VERSION), operation: z.string(), requestId: z.string().optional(), receiptId: z.string().optional(), status: z.enum(['succeeded', 'rejected', 'running', 'unknown', 'cleared']), data: z.unknown().optional(), error: z.object({ code: z.enum(['INVALID_INPUT', 'UNKNOWN_OPERATION', 'FORBIDDEN', 'CAPABILITY_UNAVAILABLE', 'REQUEST_CONFLICT', 'OUTCOME_UNKNOWN', 'REVISION_CONFLICT', 'NOT_FOUND', 'MISSING_FIELD', 'UNSUPPORTED_SCHEDULE', 'PAST_TRIGGER_TIME', 'AMBIGUOUS_LOCAL_TIME', 'UNRESOLVED_WRITE', 'NO_PROGRESS', 'UNSUPPORTED_CONTRACT_VERSION']), message: z.string(), fields: z.array(z.string()).optional(), relatedReceiptId: z.string().optional() }).strict().optional(), startedAt: z.string().optional(), finishedAt: z.string().optional() }).strict()
