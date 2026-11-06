/*
 * [INPUT]: Fixed host lifecycle categories and an already-authorized task identity.
 * [OUTPUT]: Bounded, payload-free desktop diagnosis snapshots with immutable provenance and explicit coverage.
 * [POS]: Private host diagnosis and direct owner summary contract; no runtime startup or log-file access.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { z } from 'zod'

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/)
export const desktopDiagnosticEvents = ['app-update-error', 'app-update-native', 'app-start', 'app-start-failed', 'app-quit', 'app-quit-failed', 'runtime-start', 'runtime-ready', 'runtime-exit', 'runtime-start-failed', 'runtime-error', 'request-failed', 'request-timeout', 'renderer-gone', 'renderer-unresponsive', 'child-gone', 'suspend', 'resume', 'lock-screen', 'unlock-screen', 'browser-warning', 'browser-error', 'uncaught-exception', 'unhandled-rejection', 'voice-usage'] as const
export const desktopApplicationSchema = z.discriminatedUnion('source', [
  z.object({ version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,99}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/), source: z.literal('compiled-inputs') }).strict(),
  z.object({ version: z.null(), inputHash: z.null(), source: z.literal('unknown') }).strict(),
])
const targetSchema = z.object({ employeeId: identifier, conversationId: identifier, workId: identifier.optional(), runId: identifier.optional() }).strict()
export const desktopDiagnosticsQuerySchema = z.object({
  target: targetSchema.optional(),
  limit: z.number().int().min(1).max(128).optional(),
}).strict().default({})
export type DesktopDiagnosticsQuery = z.infer<typeof desktopDiagnosticsQuerySchema>

export const desktopRuntimeIdentitySchema = z.object({
  mode: z.enum(['owned', 'attached', 'absent']),
  pid: z.number().int().positive().nullable(),
  serverId: identifier.nullable(),
  generation: identifier.nullable(),
}).strict()
export type DesktopRuntimeIdentity = z.infer<typeof desktopRuntimeIdentitySchema>

// Unrecognized codes are classified, never returned as model-visible arbitrary text.
export const desktopDiagnosticErrorCodes = ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOSPC', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'AUTH_FAILED', 'PERMISSION_DENIED', 'HOST_UNAVAILABLE', 'REVISION_CONFLICT', 'INVALID_ARGUMENT', 'OUTCOME_UNKNOWN', 'OTHER'] as const
export const desktopDiagnosticEventSchema = z.object({
  id: z.string().max(240), event: z.enum(desktopDiagnosticEvents), at: z.string().datetime(),
  sessionId: z.string().uuid(), sequence: z.number().int().positive(), application: desktopApplicationSchema,
  relation: z.enum(['target', 'environment']), runtimeMatch: z.enum(['current', 'previous', 'unknown']),
  pid: z.number().int().nonnegative().optional(), serverId: identifier.optional(), runtimeGeneration: identifier.optional(),
  requestId: identifier.optional(), operationId: identifier.optional(),
  errorCode: z.enum(desktopDiagnosticErrorCodes).optional(), exitCode: z.number().int().optional(),
  reason: z.enum(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'disconnected', 'unknown']).optional(),
}).strict()
export type DesktopDiagnosticEvent = z.infer<typeof desktopDiagnosticEventSchema>

export const desktopDiagnosticsSnapshotSchema = z.object({
  schemaVersion: z.literal(1), observedAt: z.string().datetime(), sessionId: z.string().uuid(),
  application: desktopApplicationSchema, runtime: desktopRuntimeIdentitySchema,
  target: targetSchema.optional(),
  events: z.array(desktopDiagnosticEventSchema).max(128),
  coverage: z.object({
    retention: z.literal('bounded'), maxFileBytes: z.number().int().positive(), retainedFiles: z.literal(2),
    previousFilePresent: z.boolean(), unreadableFiles: z.number().int().nonnegative(), rejectedRecords: z.number().int().nonnegative(),
    rejectedWrites: z.number().int().nonnegative(), persistenceError: z.enum(['unavailable']).nullable(),
    matchedRecords: z.number().int().nonnegative(), returnedRecords: z.number().int().nonnegative(), truncated: z.boolean(),
    oldestAt: z.string().datetime().nullable(), newestAt: z.string().datetime().nullable(),
    unknownBuildEntries: z.number().int().nonnegative(), missingRuntimeIdentity: z.number().int().nonnegative(),
    uncorrelatedRecords: z.number().int().nonnegative(), clockOrderUncertain: z.boolean(),
  }).strict(),
  summary: z.array(z.string().max(500)).max(10),
}).strict()
export type DesktopDiagnosticsSnapshot = z.infer<typeof desktopDiagnosticsSnapshotSchema>
