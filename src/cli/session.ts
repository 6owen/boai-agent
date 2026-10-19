/*
 * [OUTPUT]: session create显式模式核对保存权限并进入稳定请求身份，旧回执不受后来改权影响。
 * [INPUT]: Explicit session mutation and original service receipt lookup.
 * [OUTPUT]: One submission, read-only reconciliation and stable identity on unknown results.
 * [POS]: CLI session commands; never replays a failed create or delete.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { CliRpcClient } from './client'
import { CliError } from '../shared/cli/protocol'
import { createHash } from 'node:crypto'
import { sessionOperationContent, type SessionOperationReceipt } from '../shared/domain/session-operation'

export async function executeSessionOperation(client: CliRpcClient, operation: { expectedExecutionPermission?: import('../shared/domain/execution').ExecutionPermission; kind: 'create'; employeeId: string; name?: string } | { kind: 'delete'; conversationId: string }, requestId: string) {
  const response = (receipt: SessionOperationReceipt) => ({ result: receipt.state === 'completed' ? receipt : { ...receipt, receiptCommand: `boai session receipt ${receipt.requestId}` }, exitCode: receipt.state === 'completed' ? 0 : 4 })
  const { kind, ...input } = operation
  const fingerprint = createHash('sha256').update(sessionOperationContent(operation.kind === 'create' ? { operation: 'create', employeeId: operation.employeeId, ...(operation.expectedExecutionPermission ? { expectedExecutionPermission: operation.expectedExecutionPermission } : {}), ...(operation.name === undefined ? {} : { name: operation.name }) } : { operation: 'delete', conversationId: operation.conversationId })).digest('hex')
  try {
    return response(await client.invoke(kind === 'create' ? 'createEmployeeSession' : 'deleteSession', { ...input, requestId }) as SessionOperationReceipt)
  } catch (error) {
    let checked = false
    if (client.isConnected) {
      try {
        const receipt = await client.invoke('getSessionReceipt', { requestId }) as SessionOperationReceipt | null
        checked = true
        // Do not reconcile a conflicting requestId using another operation's receipt.
        if (receipt?.fingerprint === fingerprint) return response(receipt)
      } catch { /* Connection/receipt lookup failed: preserve unknown. */ }
    }
    if (error instanceof CliError && (['INVALID_REQUEST', 'AUTH_FAILED', 'METHOD_NOT_FOUND'].includes(error.code) || error.code === 'HANDLER_ERROR' && checked)) throw error
    return { result: { requestId, operation: kind, ...input, state: 'unknown' as const, receiptCommand: `boai session receipt ${requestId}` }, exitCode: 4 }
  }
}
