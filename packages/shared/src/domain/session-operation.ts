/*
 * [OUTPUT]: session create显式模式核对保存权限并进入稳定请求身份，旧回执不受后来改权影响。
 * [INPUT]: Explicit owner session creation/deletion and original Conversation identity.
 * [OUTPUT]: Durable operation receipt without a duplicate conversation or history store.
 * [POS]: Shared desktop/CLI receipt; deletion means the original clear-and-hide operation.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
export interface SessionOperationReceipt {
  requestId: string
  fingerprint: string
  operation: 'create' | 'delete'
  conversationId: string
  employeeId?: string
  created?: boolean
  state: 'pending' | 'completed' | 'cleared'
}

/** Canonical request identity; the hash is computed in the Node host/client. */
export function sessionOperationContent(input: { expectedExecutionPermission?: import('./execution').ExecutionPermission; operation: 'create'; employeeId: string; name?: string } | { operation: 'delete'; conversationId: string }) {
  return JSON.stringify(input.operation === 'create' ? { operation: input.operation, employeeId: input.employeeId, ...(input.expectedExecutionPermission ? { expectedExecutionPermission: input.expectedExecutionPermission } : {}), ...(input.name === undefined ? {} : { name: input.name.trim() }) } : { operation: input.operation, conversationId: input.conversationId })
}
