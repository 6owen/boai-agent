/*
 * [OUTPUT]: 当前原问题及可回答资格随请求状态返回，旧服务缺项保持兼容。
 * [INPUT]: A persisted user-message receipt and its original Run/Turn/Work identities.
 * [OUTPUT]: Request-scoped execution facts, including actual host activity and pending actions.
 * [POS]: Shared desktop/CLI status contract; no independent execution ledger.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { AgentRun, Approval, DiscussionTurn, WorkItem } from './index'
import type { NativeAction } from './execution'
import type { InboxItem } from './inbox'

export type MessageExecutionState = 'accepted' | 'running' | 'stopping' | 'waiting_approval' | 'waiting_input' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'unknown'
export interface MessageExecution {
  requestId: string
  conversationId: string
  messageId: string
  state: MessageExecutionState
  /** Controllers/adapter lifetimes still owned by the host, even after a terminal status was written. */
  activeRunIds: string[]
  runs: Pick<AgentRun, 'id' | 'agentId' | 'turnId' | 'workId' | 'phase' | 'status' | 'error'>[]
  turns: Pick<DiscussionTurn, 'id' | 'status' | 'reason'>[]
  works: Pick<WorkItem, 'id' | 'parentWorkId' | 'status' | 'requiresReview' | 'resultMessageIds' | 'artifactIds'>[]
  replyMessageIds: string[]
  approvals: Approval[]
  nativeActions: NativeAction[]
  questions?: InboxItem[]
}
