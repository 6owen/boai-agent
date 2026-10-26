/*
 * [INPUT]: 已授权员工运行的SQLite执行行及Rovai窗口请求。
 * [OUTPUT]: Rovai原窗口合同的完整游标/变化投影，正文留在原记录按需读取。
 * [POS]: BOAI存储到迁入窗口的字段接线，不改原生事件或工具权限。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { ExecutionEvidence, ExecutionWindowQuery } from '@boai/shared/domain/execution'
import type { AgentRunExecutionBlock, AgentRunExecutionBlockPage, AgentRunExecutionBlockChanges } from '@boai/shared/rovai/contracts'
export function executionBlock(event: ExecutionEvidence): AgentRunExecutionBlock {
  const state = event.canonical?.phase === 'terminal' ? event.canonical.outcome === 'failed' ? 'failed' : event.canonical.outcome === 'cancelled' ? 'stopped' : 'completed' : event.canonical ? 'running' : 'recorded'
  return { key: event.id, kind: 'item', sequence: event.sequence, lastSequence: event.sequence, changeSequence: event.revision ?? 0, toolCount: event.canonical ? 1 : 0,
    counts: { completed: 0, failed: 0, stopped: 0, recorded: 0, running: 0, waiting: 0, [state]: 1 },
    evidence: [{ ...event, executionEpoch: 1, kind: event.eventType === 'agent.text.block' ? 'narration' : 'step', phase: event.canonical?.phase === 'terminal' ? 'completed' : 'updated', changeSequence: event.revision, contentBlobId: event.id, contentByteCount: event.contentLength, isTruncated: event.deferred, occurredAt: event.createdAt }],
  }
}
export function executionWindowPage(query: ExecutionWindowQuery, rows: ExecutionEvidence[], clock: { sequence: number; revision: number }, active: ExecutionEvidence[]): AgentRunExecutionBlockPage | AgentRunExecutionBlockChanges {
  const hasMore = rows.length > query.limit, selected = rows.slice(0, query.limit)
  const common = { schemaVersion: 3 as const, threadId: query.conversationId, agentRunId: query.runId, throughSequence: clock.sequence, throughChangeSequence: clock.revision, hasMore }
  if (query.afterChangeSequence !== undefined) return { ...common, requestedAfterChangeSequence: query.afterChangeSequence, nextAfterChangeSequence: hasMore ? selected.at(-1)!.revision! : clock.revision, blocks: selected.map(executionBlock), refreshedBlocks: [] }
  if (query.afterSequence === undefined) selected.reverse()
  return { ...common, requestedBeforeSequence: query.beforeSequence ?? null, ...(query.afterSequence !== undefined ? { requestedAfterSequence: query.afterSequence, nextAfterSequence: hasMore ? selected.at(-1)!.sequence : null } : {}), nextBeforeSequence: hasMore && query.afterSequence === undefined ? selected[0]!.sequence : null, blocks: selected.map(executionBlock), activeBlocks: active.filter(event => !selected.some(item => item.id === event.id)).map(executionBlock) }
}
