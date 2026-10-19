/*
 * [INPUT]: Original Run/Work identities and actual adapter activity.
 * [OUTPUT]: Frozen cancellation scope on the original run; read-only stop verification and selectable targets.
 * [POS]: Shared runtime/CLI cancellation contract, not a second execution ledger.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
export interface RunCancellationScope {
  requestedAt: string
  appliedAt?: string
  runIds: string[]
  workIds: string[]
  participants: { turnId: string; agentId: string }[]
}
export interface RunCancellation {
  conversationId: string
  runId: string
  agentId: string
  requested: boolean
  state: 'running' | 'stopping' | 'stopped' | 'unknown'
  runIds: string[]
  workIds: string[]
  activeRunIds: string[]
}
export interface CancellationTarget {
  kind: 'run' | 'participant' | 'work'
  agentId: string
  runId?: string
  turnId?: string
  workId?: string
  requestId?: string
  status: string
}
