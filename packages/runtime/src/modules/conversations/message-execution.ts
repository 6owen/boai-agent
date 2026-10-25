/*
 * [OUTPUT]: 只纳入原轮次/工作的问题，已发布且可接续的任务问题显示等待输入。
 * [INPUT]: Original message, Run/Turn/Work records, native input relations and live host ownership.
 * [OUTPUT]: Exact request scope and conservative execution state without replay or new storage.
 * [POS]: Shared business projection for CLI/desktop receipt inspection and scoped cancellation.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { AgentRun, Approval, DiscussionTurn, Message, WorkItem } from '@boai/shared/domain'
import type { NativeAction } from '@boai/shared/domain/execution'
import type { InboxItem } from '@boai/shared/domain/inbox'
import type { MessageExecution, MessageExecutionState } from '@boai/shared/domain/message-execution'

const runTerminal = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const turnTerminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'])
const workTerminal = new Set(['delivered', 'failed', 'cancelled', 'interrupted'])

export function messageExecutionScope(message: Message, records: { runs: AgentRun[]; turns: DiscussionTurn[]; works: WorkItem[]; nativeActions: NativeAction[] }) {
  const runs = records.runs.filter(run => run.conversationId === message.conversationId)
  const works = records.works.filter(work => work.conversationId === message.conversationId)
  const nativeRunIds = new Set(records.nativeActions.filter(action => action.conversationId === message.conversationId && action.responseMessageId === message.id).map(action => action.runId))
  const workIds = new Set(works.filter(work => work.sourceMessageId === message.id || work.id === message.inboxReply?.workId || runs.some(run => nativeRunIds.has(run.id) && run.workId === work.id)).map(work => work.id))
  // Follow owned descendants only, never another root merely woken by the latest user message.
  for (let size = -1; size !== workIds.size;) {
    size = workIds.size
    for (const work of works) if (work.parentWorkId && workIds.has(work.parentWorkId)) workIds.add(work.id)
  }
  const turns = records.turns.filter(turn => turn.conversationId === message.conversationId && (turn.workId ? workIds.has(turn.workId) : turn.triggerMessageId === message.id || runs.some(run => nativeRunIds.has(run.id) && run.turnId === turn.id)))
  const turnIds = new Set(turns.map(turn => turn.id))
  return {
    turns, works: works.filter(work => workIds.has(work.id)),
    runs: runs.filter(run => nativeRunIds.has(run.id) || (run.workId ? workIds.has(run.workId) : turnIds.has(run.turnId ?? '') || run.triggerMessageId === message.id)),
  }
}

export function projectMessageExecution(requestId: string, message: Message, scope: ReturnType<typeof messageExecutionScope>, facts: { activeRunIds: Set<string>; approvals: Approval[]; nativeActions: NativeAction[]; messages: Message[]; questions?: InboxItem[] }): MessageExecution {
  const runIds = new Set(scope.runs.map(run => run.id)), turnIds = new Set(scope.turns.map(turn => turn.id))
  const activeRunIds = [...runIds].filter(id => facts.activeRunIds.has(id))
  const approvals = facts.approvals.filter(approval => runIds.has(approval.runId))
  const nativeActions = facts.nativeActions.filter(action => runIds.has(action.runId) && (action.status === 'pending' || action.delivery === 'unknown'))
  const workIds = new Set(scope.works.map(work => work.id))
  const questions = (facts.questions ?? []).filter(item => item.kind === 'question' && item.conversationId === message.conversationId && (item.workId ? workIds.has(item.workId) : turnIds.has(item.turnId ?? '')))
  const stopped = scope.turns.some(turn => turn.status === 'cancelled') || scope.works.some(work => work.status === 'cancelled') || scope.runs.some(run => run.status === 'cancelled')
  let state: MessageExecutionState
  if (nativeActions.some(action => action.delivery === 'unknown')) state = 'unknown'
  else if (approvals.length || nativeActions.some(action => action.kind === 'approval' && action.status === 'pending')) state = 'waiting_approval'
  else if (questions.some(item => item.question?.canReply) || nativeActions.some(action => action.kind === 'input' && action.status === 'pending') || scope.turns.some(turn => turn.status === 'waiting_user')) state = 'waiting_input'
  else if (activeRunIds.length || scope.runs.some(run => !runTerminal.has(run.status))) state = stopped ? 'stopping' : 'running'
  else if (scope.turns.some(turn => !turnTerminal.has(turn.status))) state = 'running'
  else if (scope.works.some(work => !workTerminal.has(work.status))) state = 'waiting'
  else if (scope.turns.some(turn => turn.status === 'interrupted') || scope.works.some(work => work.status === 'interrupted') || scope.runs.some(run => run.status === 'interrupted')) state = 'unknown'
  else if (scope.turns.some(turn => ['failed', 'budget_exhausted'].includes(turn.status)) || scope.works.some(work => work.status === 'failed')) state = 'failed'
  else if (stopped) state = 'cancelled'
  else if (scope.runs.some(run => run.status === 'failed' && run.phase !== 'memory' && !scope.runs.some(later => later.agentId === run.agentId && later.phase === run.phase && later.workId === run.workId && later.createdAt > run.createdAt && later.status === 'completed'))) state = 'failed'
  else if (scope.turns.length || scope.runs.length || scope.works.length) state = 'completed'
  else state = 'accepted'
  const publishedIds = new Set(scope.works.flatMap(work => work.resultMessageIds))
  const replies = facts.messages.filter(reply => reply.conversationId === message.conversationId && reply.senderType === 'agent' && (runIds.has(reply.runId ?? '') || turnIds.has(reply.turnId ?? '') || publishedIds.has(reply.id))).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
  return {
    requestId, conversationId: message.conversationId, messageId: message.id, state, activeRunIds,
    runs: scope.runs.map(({ id, agentId, turnId, workId, phase, status, error }) => ({ id, agentId, turnId, workId, phase, status, error })),
    turns: scope.turns.map(({ id, status, reason }) => ({ id, status, reason })),
    works: scope.works.map(({ id, parentWorkId, status, requiresReview, resultMessageIds, artifactIds }) => ({ id, parentWorkId, status, requiresReview, resultMessageIds, artifactIds })),
    replyMessageIds: replies.map(reply => reply.id), approvals, nativeActions, questions,
  }
}
