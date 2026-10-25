/*
 * [OUTPUT]: 原问题恢复给出replyInboxQuestion与所见版本，不以引用消息冒充回答事务。
 * [INPUT]: Original execution blocks, revision-checked deferred content and published messages.
 * [OUTPUT]: Provisional text deltas/discards and observed tool transitions with exact run/evidence identities.
 * [POS]: CLI presentation projection; never changes or retries the original execution.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { Message } from '@boai/shared/domain'
import type { MessageExecution } from '@boai/shared/domain/message-execution'
import type { AgentRunExecutionBlock } from '@boai/shared/rovai/contracts'
import { CliError } from '@boai/shared/cli/protocol'

type Run = MessageExecution['runs'][number]
type Invoke = <T>(channel: string, input: unknown) => Promise<T>
type Emit = (type: string, payload?: Record<string, unknown>) => void
type Text = { runId: string; agentId: string; evidenceId: string; text: string; revision: number; discarded: boolean; published: boolean }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function outputProjection(emit: Emit, invoke: Invoke) {
  const texts = new Map<string, Text>()
  const tools = new Map<string, string>()
  const publications = new Map<string, Message>()
  const discard = (text: Text, reason: string) => {
    if (!text.text || text.discarded || text.published) return
    emit('text_discard', { runId: text.runId, agentId: text.agentId, evidenceId: text.evidenceId, revision: text.revision, reason })
    text.discarded = true
  }
  return {
    async block(run: Run, block: AgentRunExecutionBlock, conversationId: string) {
      let complete = true
      for (const evidence of block.evidence) {
        const key = `${run.id}:${evidence.id}`, revision = evidence.revision ?? block.changeSequence
        if (evidence.canonical) {
          const canonical = evidence.canonical, transition = `${canonical.phase}:${canonical.outcome}:${revision}`
          if (tools.get(key) !== transition) {
            tools.set(key, transition)
            emit(canonical.phase === 'terminal' ? 'tool_result' : canonical.phase === 'started' ? 'tool_start' : 'tool_progress', {
              runId: run.id, agentId: run.agentId, evidenceId: evidence.id, operationId: canonical.operationId,
              revision, toolName: canonical.toolName, outcome: canonical.outcome, payload: evidence.payload, deferred: evidence.isTruncated,
            })
          }
        }
        if (evidence.eventType !== 'agent.text.block' || run.phase !== 'execution') continue
        const previous = texts.get(key)
        if (previous?.revision === revision) continue
        let payload = object(evidence.payload)
        if (evidence.isTruncated) {
          let content = '', offset = 0, changed = false
          for (;;) {
            const page = await invoke<{ content: string; revision: number; next?: number }>('getExecutionContent', { conversationId, runId: run.id, evidenceId: evidence.id, offset })
            if (page.revision !== revision) { changed = true; break }
            content += page.content
            if (page.next === undefined) break
            if (!Number.isSafeInteger(page.next) || page.next <= offset) throw new CliError('INVALID_REQUEST', '执行内容游标无效')
            offset = page.next
          }
          if (changed) { complete = false; continue }
          const original = object(JSON.parse(content))
          if (original.id !== evidence.id || original.runId !== run.id || original.revision !== revision) throw new CliError('INVALID_REQUEST', '执行内容身份已变化')
          payload = object(original.payload)
        }
        if (typeof payload.text !== 'string') continue
        const text = payload.text
        const extendsPrevious = previous && !previous.discarded && text.startsWith(previous.text)
        if (previous && !extendsPrevious) discard(previous, 'replaced')
        const offset = extendsPrevious ? previous.text.length : 0
        const published = [...publications.values()].some(message => message.runId === run.id && message.content === text)
        const current = { runId: run.id, agentId: run.agentId, evidenceId: evidence.id, text, revision, discarded: false, published }
        texts.set(key, current)
        if (!published && text.length > offset) emit('text_delta', { runId: run.id, agentId: run.agentId, evidenceId: evidence.id, revision, offset, delta: text.slice(offset), provisional: true })
      }
      return complete
    },
    published(message: Message) {
      if (message.status !== 'completed') return
      publications.set(message.id, message)
      for (const text of texts.values()) if (text.runId === message.runId && !text.discarded && text.text === message.content) text.published = true
    },
    settle(status: MessageExecution) {
      for (const run of status.runs) if (['failed', 'cancelled'].includes(run.status)) {
        for (const text of texts.values()) if (text.runId === run.id) discard(text, run.status === 'failed' ? 'run_failed' : 'run_cancelled')
      }
    },
  }
}

export function executionRecovery(requestId: string, status?: MessageExecution) {
  return {
    inspect: { command: 'receipt', args: [requestId] },
    observe: { command: 'receipt', args: [requestId, '--follow'] },
    ...(status ? { runIds: status.runs.map(run => run.id),
      approvals: status.approvals.map(action => ({ channel: 'approve', identity: { id: action.id }, required: ['approved'], action })),
      nativeActions: status.nativeActions.map(action => ({ channel: 'respondNativeAction', identity: { conversationId: action.conversationId, runId: action.runId, actionId: action.id }, required: ['response'], action })),
      questions: (status.questions ?? []).flatMap(action => action.question?.canReply ? [{ channel: 'replyInboxQuestion', identity: { questionId: action.question.id, expectedRevision: action.question.revision }, required: ['content', 'requestId'], action }] : []),
    } : {}),
  }
}
