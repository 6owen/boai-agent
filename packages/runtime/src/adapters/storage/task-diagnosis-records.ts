/*
 * [INPUT]: Existing record table and an already authorized exact Run/source identity.
 * [OUTPUT]: Bounded SQL metadata projections for approvals, native actions and original-source receipts.
 * [POS]: Pure diagnosis read adapter; never recovers a receipt or opens a write transaction.
 * [PROTOCOL]: Update Header and storage/.folder.md when this file changes.
 */
import type { Client } from '@libsql/client'

export interface TaskDiagnosisRecordScope { employeeId: string; conversationId: string; runId: string; triggerMessageId: string }
export interface TaskDiagnosisRecords {
  receipts: { id: string; requestId?: string; operation: string; status: string; startedAt?: string; finishedAt?: string; errorCode?: string }[]
  nativeActions: { id: string; kind: 'approval' | 'input'; status: string; createdAt: string; delivery?: string }[]
  approvals: { id: string; kind?: string }[]
  truncated: { receipts: boolean; nativeActions: boolean; approvals: boolean }
}
export async function queryTaskDiagnosisRecords(client: Pick<Client, 'execute'>, scope: TaskDiagnosisRecordScope, limit: number): Promise<TaskDiagnosisRecords> {
  const size = Math.min(100, Math.max(1, Math.trunc(limit)))
  if (!Number.isFinite(size)) throw new Error('诊断记录页大小无效')
  const queries = [
    { sql: `SELECT json_object('id',id,'requestId',json_extract(value,'$.result.requestId'),'operation',json_extract(value,'$.result.operation'),'status',json_extract(value,'$.result.status'),'startedAt',json_extract(value,'$.result.startedAt'),'finishedAt',json_extract(value,'$.result.finishedAt'),'errorCode',json_extract(value,'$.result.error.code')) AS value FROM records WHERE collection='applicationOperations' AND json_extract(value,'$.actor.kind')='employee' AND json_extract(value,'$.actor.employeeId')=? AND json_extract(value,'$.actor.conversationId')=? AND json_extract(value,'$.actor.messageId')=? ORDER BY id LIMIT ?`, args: [scope.employeeId, scope.conversationId, scope.triggerMessageId, size + 1] },
    { sql: `SELECT json_object('id',id,'kind',json_extract(value,'$.kind'),'status',json_extract(value,'$.status'),'createdAt',json_extract(value,'$.createdAt'),'delivery',json_extract(value,'$.delivery')) AS value FROM records WHERE collection='nativeActions' AND json_extract(value,'$.agentId')=? AND json_extract(value,'$.conversationId')=? AND json_extract(value,'$.runId')=? ORDER BY id LIMIT ?`, args: [scope.employeeId, scope.conversationId, scope.runId, size + 1] },
    { sql: `SELECT json_object('id',id,'kind',json_extract(value,'$.kind')) AS value FROM records WHERE collection='approvals' AND json_extract(value,'$.conversationId')=? AND json_extract(value,'$.runId')=? ORDER BY id LIMIT ?`, args: [scope.conversationId, scope.runId, size + 1] },
  ]
  const [receipts, nativeActions, approvals] = await Promise.all(queries.map(async query => (await client.execute(query)).rows.map(row => JSON.parse(String(row.value)))))
  return { receipts: receipts!.slice(0, size), nativeActions: nativeActions!.slice(0, size), approvals: approvals!.slice(0, size), truncated: { receipts: receipts!.length > size, nativeActions: nativeActions!.length > size, approvals: approvals!.length > size } }
}
