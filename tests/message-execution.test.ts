/*
 * [OUTPUT]: 已完成轮次的真实Work问题保持待输入，其他根/会话或不可回答问题不借用执行权。
 * [INPUT]: Independent group work roots, scheduler wake triggers and original native input relations.
 * [OUTPUT]: Scope isolation and conservative approval/input/unknown/exit projection regressions.
 * [POS]: Shared execution-query semantics; actual AppService/RPC tested in cli-service.test.ts.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect, it } from 'vitest'
import type { AgentRun, DiscussionTurn, Message, WorkItem } from '../packages/shared/src/domain'
import type { NativeAction } from '../packages/shared/src/domain/execution'
import type { InboxItem } from '../packages/shared/src/domain/inbox'
import { messageExecutionScope, projectMessageExecution } from '../packages/runtime/src/modules/conversations/message-execution'

const message: Message = { id: 'm1', conversationId: 'group', senderType: 'user', senderId: 'user', senderName: 'User', content: 'first root', sequence: 1, createdAt: '2026-10-18T00:00:00Z', status: 'completed' }
function run(id: string, options: Partial<AgentRun> = {}): AgentRun { return { id, conversationId: 'group', triggerMessageId: 'm1', messageId: '', agentId: 'one', agentName: 'One', status: 'completed', createdAt: '2026-10-18T00:00:00Z', toolEvents: [], phase: 'execution', ...options } }
function turn(id: string, options: Partial<DiscussionTurn> = {}): DiscussionTurn { return { id, conversationId: 'group', triggerMessageId: 'm1', status: 'completed', generation: 1, createdAt: '2026-10-18T00:00:00Z', modelCalls: 1, publicMessages: 1, ...options } }
function work(id: string, options: Partial<WorkItem> = {}): WorkItem { return { id, schemaVersion: 2, conversationId: 'group', sourceMessageId: 'm1', key: 'main', scope: id, deliverable: id, ownerAgentId: 'one', version: 1, status: 'delivered', budgetId: 'budget', rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', ...options } }
function action(options: Partial<NativeAction> = {}): NativeAction { return { id: 'action', conversationId: 'group', runId: 'native', agentId: 'one', createdAt: '2026-10-18T00:00:00Z', kind: 'input', method: 'input', title: '需要输入', detail: {}, options: [], status: 'pending', ...options } }
const facts = { activeRunIds: new Set<string>(), approvals: [], nativeActions: [], messages: [] }

it('reports a published Work question after its turn ended without adopting unrelated or unavailable questions', () => {
  const scope = { runs: [run('r')], turns: [turn('t')], works: [work('ours', { status: 'waiting' })] }
  const question: InboxItem = { id: 'question:ours', kind: 'question', conversationId: 'group', conversationTitle: 'Group', time: message.createdAt, summary: '给谁？', status: 'waiting', turnId: 't', workId: 'ours', question: { id: 'work:ours:1', revision: 1, messageId: 'question-message', content: '给谁？', canReply: true } }
  const result = projectMessageExecution('r', message, scope, { ...facts, questions: [question, { ...question, workId: 'another-root' }, { ...question, conversationId: 'other-chat' }] })
  expect(result.state).toBe('waiting_input'); expect(result.questions).toEqual([question])
  expect(projectMessageExecution('r', message, scope, { ...facts, questions: [{ ...question, question: { ...question.question!, canReply: false, unavailableReason: '原来源已失效' } }] }).state).toBe('waiting')
})

it('does not adopt an unrelated group root merely because its work wake uses this latest user trigger', () => {
  const records = {
    works: [work('ours'), work('child', { parentWorkId: 'ours', rootWorkId: 'ours', sourceMessageId: 'delegation' }), work('other', { sourceMessageId: 'm2', status: 'running' })],
    turns: [turn('initial'), turn('ours-wake', { workId: 'ours' }), turn('other-wake', { workId: 'other', status: 'executing' })],
    runs: [run('own', { turnId: 'ours-wake', workId: 'ours' }), run('delegated', { workId: 'child' }), run('foreign', { turnId: 'other-wake', workId: 'other', status: 'running' })], nativeActions: [],
  }
  const scope = messageExecutionScope(message, records)
  expect(scope.works.map(work => work.id)).toEqual(['ours', 'child'])
  expect(scope.runs.map(run => run.id)).toEqual(['own', 'delegated'])
  expect(scope.turns.map(turn => turn.id)).toEqual(['initial', 'ours-wake'])
  expect(projectMessageExecution('request', message, scope, { ...facts, activeRunIds: new Set(['foreign']) }).state).toBe('completed')
})

it('a reply delivered to a native input follows the original run, not unrelated conversation activity', () => {
  const answered = action({ status: 'answered', responseMessageId: message.id, delivery: 'submitted' })
  const scope = messageExecutionScope(message, { runs: [run('native', { triggerMessageId: 'earlier', turnId: 'native-turn', status: 'running' }), run('other', { triggerMessageId: 'other', status: 'running' })], turns: [turn('native-turn', { triggerMessageId: 'earlier', status: 'executing' })], works: [], nativeActions: [answered] })
  expect(scope.runs.map(run => run.id)).toEqual(['native'])
  expect(projectMessageExecution('request', message, scope, { ...facts, nativeActions: [answered] }).state).toBe('running')
  expect(projectMessageExecution('request', message, scope, { ...facts, nativeActions: [{ ...answered, delivery: 'unknown' }] }).state).toBe('unknown')
})

it('reports pending native approval/input and interrupted execution without a fabricated successful completion', () => {
  const scope = { runs: [run('native', { status: 'running' })], turns: [turn('t', { status: 'executing' })], works: [] }
  expect(projectMessageExecution('r', message, scope, { ...facts, nativeActions: [action()] }).state).toBe('waiting_input')
  expect(projectMessageExecution('r', message, scope, { ...facts, nativeActions: [action({ kind: 'approval' })] }).state).toBe('waiting_approval')
  expect(projectMessageExecution('r', message, { runs: [run('native', { status: 'interrupted' })], turns: [turn('t', { status: 'interrupted' })], works: [] }, facts).state).toBe('unknown')
  expect(projectMessageExecution('r', message, { runs: [], turns: [], works: [] }, facts).state).toBe('accepted')
})

it('retains failures as evidence but permits a proven later successful recovery and separate human review', () => {
  const failed = run('failure', { status: 'failed', error: 'tool recovery required' }), recovered = run('recovered', { createdAt: '2026-10-18T00:00:01Z' })
  expect(projectMessageExecution('r', message, { runs: [failed], turns: [turn('t')], works: [] }, facts).state).toBe('failed')
  const result = projectMessageExecution('r', message, { runs: [failed, recovered], turns: [turn('t')], works: [work('review', { requiresReview: true })] }, facts)
  expect(result.state).toBe('completed'); expect(result.runs[0].error).toBe('tool recovery required'); expect(result.works[0].requiresReview).toBe(true)
})
