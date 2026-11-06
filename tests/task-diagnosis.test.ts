/*
 * [INPUT]: Isolated persisted employee/source/task/run facts and a deliberately recoverable unknown receipt.
 * [OUTPUT]: Permission, identity, wait classification, snapshot pagination and duration regression evidence.
 * [POS]: Deterministic diagnosis tests; no real model, browser or personal profile.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { diagnosisTiming, readTaskDiagnosis, taskDiagnosisOperation } from '../packages/runtime/src/modules/application/task-diagnosis'
import type { ApplicationActor } from '../packages/shared/src/domain/application-protocol'
import { ExecutionRepository } from '../packages/runtime/src/modules/conversations/execution'
import { nativeActivity } from '../packages/runtime/src/adapters/native-events'
import type { AgentRun } from '../packages/shared/src/domain'
import type { ExecutionEvidence } from '../packages/shared/src/domain/execution'
import type { ApplicationHostPort } from '../packages/shared/src/ipc/application-host'

const cleanup: (() => Promise<unknown>)[] = []
const owner: ApplicationActor = { kind: 'owner' }, bobo: ApplicationActor = { kind: 'employee', employeeId: 'bobo', conversationId: 'bobo-room', messageId: 'owner-message' }
const runTarget = { kind: 'run' as const, employeeId: 'bobo', conversationId: 'bobo-room', runId: 'run-1' }
const taskTarget = { kind: 'task' as const, employeeId: 'bobo', taskId: 'task-1' }
const instant = '2026-11-07T00:00:00.000Z'
const record = (collection: string, id: string, value: object) => ({ collection, id, value: { id, ...value } })
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); for (const action of cleanup.splice(0).reverse()) await action() })
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'boai-task-diagnosis-')), store = new ProductStore(join(dir, 'data.db'))
  cleanup.push(() => rm(dir, { recursive: true, force: true })); await store.init(); cleanup.push(() => store.close())
  await store.write([
    record('agents', 'bobo', { systemRole: 'core', active: true }), record('agents', 'alice', { active: true }),
    record('conversations', 'bobo-room', { agentIds: ['bobo'], purpose: 'core' }), record('conversations', 'alice-room', { agentIds: ['alice'] }),
    record('messages', 'owner-message', { conversationId: 'bobo-room', senderType: 'user', senderId: 'user', status: 'completed', content: '解释这个任务', createdAt: instant }),
    record('messages', 'alice-message', { conversationId: 'alice-room', senderType: 'user', senderId: 'user', status: 'completed', content: 'PRIVATE SOURCE', createdAt: instant }),
    record('runs', 'run-1', { agentId: 'bobo', conversationId: 'bobo-room', triggerMessageId: 'owner-message', status: 'running', createdAt: instant, toolEvents: [], error: 'SECRET ERROR', draft: { text: 'PRIVATE DRAFT' } }),
    record('runs', 'alice-run', { agentId: 'alice', conversationId: 'alice-room', triggerMessageId: 'alice-message', status: 'failed', failureKind: 'transport', createdAt: instant, toolEvents: [], error: 'SECRET ALICE ERROR' }),
    record('agentTasks', 'task-1', { agentId: 'bobo', kind: 'assignment', revision: 1, status: 'in_progress', title: 'PRIVATE TITLE', description: 'PRIVATE DESCRIPTION', createdAt: instant, updatedAt: instant }),
    record('agentTasks', 'alice-task', { agentId: 'alice', kind: 'assignment', revision: 1, status: 'in_progress', createdAt: instant, updatedAt: instant }),
  ])
  return store
}
const event = (id: string, duration: number, patch: Record<string, unknown> = {}): ExecutionEvidence => ({ id, runId: 'run-1', conversationId: 'bobo-room', agentId: 'bobo', sequence: 1, createdAt: instant, updatedAt: new Date(Date.parse(instant) + duration).toISOString(), observedTiming: { startedAt: instant, finishedAt: new Date(Date.parse(instant) + duration).toISOString() }, eventType: 'tool.execution', payload: { command: 'SECRET COMMAND' }, canonical: { operationId: id, activityDomain: 'tool', phase: 'terminal', outcome: 'succeeded', firstEvidenceSequence: 1, lastEvidenceSequence: 2 }, ...patch }) as ExecutionEvidence

it('denies ordinary employees, behavior, forged cross-employee targets and deleted source authorization', async () => {
  const store = await fixture(), target = { kind: 'run' as const, employeeId: 'alice', conversationId: 'alice-room', runId: 'alice-run' }
  for (const actor of [{ kind: 'employee', employeeId: 'alice', conversationId: 'alice-room', messageId: 'alice-message' }, { kind: 'behavior', employeeId: 'bobo', conversationId: 'bobo-room', behaviorRunId: 'behavior' }] as ApplicationActor[]) await expect(readTaskDiagnosis(store, { target }, actor)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(readTaskDiagnosis(store, { target }, bobo)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  const result = await readTaskDiagnosis(store, { target }, owner)
  expect(result.state.runs).toEqual([{ id: 'alice-run', status: 'failed', phase: 'unknown' }]); expect(JSON.stringify(result)).not.toContain('SECRET'); expect(JSON.stringify(result)).not.toContain('PRIVATE')
  await store.write([], [{ collection: 'messages', id: 'owner-message' }])
  await expect(readTaskDiagnosis(store, { target: runTarget }, bobo)).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

it('accepts only a persisted host-validated target on the current owner message and rechecks it on every read', async () => {
  const store = await fixture(), target = { kind: 'run' as const, employeeId: 'alice', conversationId: 'alice-room', runId: 'alice-run' }
  await store.write([record('messages', 'owner-message', { conversationId: 'bobo-room', senderType: 'user', senderId: 'user', status: 'completed', diagnosisTarget: target })])
  expect((await readTaskDiagnosis(store, { target }, bobo)).target.runIds).toEqual(['alice-run'])
  await store.write([record('messages', 'owner-message', { conversationId: 'bobo-room', senderType: 'user', senderId: 'user', status: 'completed' })])
  await expect(readTaskDiagnosis(store, { target }, bobo)).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

it('does not choose a latest occurrence when a task has multiple actual executions', async () => {
  const store = await fixture()
  for (const id of ['o-1', 'o-2']) await store.write([record('automationOccurrences', id, { taskId: 'task-1', conversationId: 'bobo-room', status: 'running', startedAt: instant, stateVersion: 1, runIds: ['run-1'], plan: { employeeIds: ['bobo'] } })])
  const first = await readTaskDiagnosis(store, { target: taskTarget }, bobo)
  expect(first.selectionRequired).toBe(true); expect(first.target.runIds).toEqual([]); expect(first.candidates.map(value => value.id).sort()).toEqual(['o-1', 'o-2'])
  await expect(readTaskDiagnosis(store, { target: { ...taskTarget, occurrenceId: 'does-not-exist' } }, bobo)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('keeps approval, input, dependency, queue and long-running tool waits separate without state changes', async () => {
  const store = await fixture(), run = await store.get<Record<string, unknown>>('runs', 'run-1')
  await store.write([
    record('runs', 'run-1', { ...run, status: 'queued', workId: 'work-1' }),
    record('workItems', 'work-1', { conversationId: 'bobo-room', ownerAgentId: 'bobo', status: 'waiting', version: 2, resultVersion: 0, requiresReview: false, requiredResults: [{ workId: 'missing-work', resultVersion: 1 }], userQuestion: { text: 'PRIVATE QUESTION' } }),
    record('nativeActions', 'input-1', { agentId: 'bobo', conversationId: 'bobo-room', runId: 'run-1', kind: 'input', status: 'pending', createdAt: instant, detail: 'PRIVATE INPUT' }),
    record('approvals', 'approval-1', { conversationId: 'bobo-room', runId: 'run-1', command: 'SECRET' }),
    record('executionEvidence', 'tool-1', event('tool-1', 86400000, { canonical: { phase: 'started', firstEvidenceSequence: 1, lastEvidenceSequence: 2 } })),
  ])
  const before = await store.load('runs'), write = vi.spyOn(store, 'write'), tx = vi.spyOn(store, 'transaction')
  const result = await readTaskDiagnosis(store, { target: runTarget }, bobo)
  expect(result.state.waiting).toEqual({ approval: true, input: true, dependency: true, queue: true, tool: true })
  expect(result.assessment.findings.join('')).toContain('不能仅因时间长'); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET/)
  expect(result.timing.unionMs).toBe(null); expect(await store.load('runs')).toEqual(before); expect(write).not.toHaveBeenCalled(); expect(tx).not.toHaveBeenCalled()
})

it('reads an unknown receipt without recover, observation or write even when recovery would succeed', async () => {
  const store = await fixture(), recover = vi.fn(async () => ({ changed: true })), observe = vi.fn()
  const app = new ApplicationService(store, [taskDiagnosisOperation(store), { name: 'fixture.change', effect: 'write', input: z.object({}), resultType: 'unknown', description: 'fixture', execute: async () => { throw new Error('unknown after effect') }, recover }], async () => {}, observe)
  await app.call({ operation: 'fixture.change', input: {}, requestId: 'original' }, bobo)
  const before = await store.load('applicationOperations'), write = vi.spyOn(store, 'write'), transaction = vi.spyOn(store, 'transaction')
  const read = await app.call({ operation: 'diagnostics.task', input: { target: runTarget } }, bobo)
  expect(read.status).toBe('succeeded'); expect(JSON.stringify(read.data)).toContain('尚未确认结果')
  expect(recover).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled(); expect(await store.load('applicationOperations')).toEqual(before)
})

it('binds evidence cursors to actor, target and current source versions; deletion never falls back', async () => {
  const store = await fixture()
  await store.write([record('executionEvidence', 'tool-1', event('tool-1', 10000)), record('executionClocks', 'run-1', { revision: 1 })])
  const first = await readTaskDiagnosis(store, { target: runTarget, limit: 1 }, bobo)
  expect(first.nextCursor).toBeTruthy()
  await expect(readTaskDiagnosis(store, { target: runTarget, limit: 1, cursor: first.nextCursor }, owner)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  const second = await readTaskDiagnosis(store, { target: runTarget, limit: 1, cursor: first.nextCursor }, bobo)
  expect(second.facts[0]!.id).not.toBe(first.facts[0]!.id)
  await store.write([record('executionClocks', 'run-1', { revision: 2 })])
  await expect(readTaskDiagnosis(store, { target: runTarget, limit: 1, cursor: first.nextCursor }, bobo)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  await store.write([], [{ collection: 'runs', id: 'run-1' }])
  await expect(readTaskDiagnosis(store, { target: runTarget }, bobo)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('reports concurrent reads and host failure without inferring retry, shutdown or root cause', async () => {
  const store = await fixture(), request = vi.fn(async () => { const run = await store.get<Record<string, unknown>>('runs', 'run-1'); await store.write([record('runs', 'run-1', { ...run, status: 'completed' })]); throw new Error('SECRET request timeout') })
  const result = await readTaskDiagnosis(store, { target: runTarget }, bobo, { host: { available: true, request } as unknown as ApplicationHostPort })
  expect(request).toHaveBeenCalledTimes(1); expect(result.coverage.host).toBe('unavailable'); expect(result.snapshotChanged).toBe(true); expect(result.assessment.certainty).toBe('unknown'); expect(result.nextCursor).toBeUndefined(); expect(JSON.stringify(result)).not.toContain('SECRET')
})

it('calculates the union of overlapping observed tool intervals and preserves missing or reversed clocks', () => {
  const result = diagnosisTiming([event('a', 10000), event('b', 15000), event('reversed', -1000), event('open', 20000, { canonical: { phase: 'started' } })])
  expect(result).toMatchObject({ unionMs: 15000, summedMs: 25000, overlapMs: 10000, invalidClockIntervals: 1, unknownIntervals: 1, complete: false })
})

it('does not report stale unfinished tools, pending native requests or answered questions as current waits after the run ends', async () => {
  const store = await fixture(), run = await store.get<Record<string, unknown>>('runs', 'run-1')
  await store.write([
    record('runs', 'run-1', { ...run, status: 'completed', workId: 'work-1' }),
    record('workItems', 'work-1', { conversationId: 'bobo-room', ownerAgentId: 'bobo', status: 'delivered', version: 3, resultVersion: 1, requiresReview: true, requiredResults: [{ workId: 'removed-old-dependency', resultVersion: 1 }], userQuestion: { messageId: 'removed-question', answeredMessageId: 'answer' } }),
    record('nativeActions', 'stale-input', { agentId: 'bobo', conversationId: 'bobo-room', runId: 'run-1', kind: 'input', status: 'pending', createdAt: instant }),
    record('executionEvidence', 'stale-tool', event('stale-tool', 86400000, { canonical: { phase: 'started' } })),
  ])
  const result = await readTaskDiagnosis(store, { target: runTarget }, bobo)
  expect(Object.values(result.state.waiting)).toEqual([false, false, false, false, false])
  expect(result.assessment.findings.join('')).toContain('运行结束不等于任务通过验收')
  expect(result.facts.some(value => value.id === 'tool:stale-tool')).toBe(true)
})

it('rejects a target reassigned during the read instead of returning the previous employee scope', async () => {
  const store = await fixture()
  await store.write([
    record('runs', 'run-1', { agentId: 'bobo', conversationId: 'bobo-room', triggerMessageId: 'owner-message', status: 'running', createdAt: instant, origin: { occurrenceId: 'o-1' } }),
    record('automationOccurrences', 'o-1', { taskId: 'task-1', conversationId: 'bobo-room', status: 'running', deliveryStatus: 'pending', startedAt: instant, stateVersion: 1, runIds: ['run-1'], plan: { employeeIds: ['bobo'] } }),
  ])
  const request = vi.fn(async () => { const task = await store.get<Record<string, unknown>>('agentTasks', 'task-1'); await store.write([record('agentTasks', 'task-1', { ...task, agentId: 'alice', revision: 2 })]); throw new Error('host unavailable') })
  await expect(readTaskDiagnosis(store, { target: { ...taskTarget, occurrenceId: 'o-1' } }, bobo, { host: { available: true, request } as unknown as ApplicationHostPort })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('rejects arbitrary filesystem, SQL, repair and authority fields at the public input boundary', async () => {
  const store = await fixture()
  for (const extra of [{ path: '/private/log' }, { sql: 'SELECT *' }, { repair: true }, { actor: 'owner' }]) await expect(readTaskDiagnosis(store, { target: runTarget, ...extra }, owner)).rejects.toBeDefined()
})

it('combines a task original message run and later occurrences instead of guessing the sole occurrence is the only execution', async () => {
  const store = await fixture(), task = await store.get<Record<string, unknown>>('agentTasks', 'task-1')
  await store.write([
    record('agentTasks', 'task-1', { ...task, source: { conversationId: 'bobo-room', messageId: 'owner-message' } }),
    record('automationOccurrences', 'later-occurrence', { taskId: 'task-1', conversationId: 'bobo-room', status: 'running', deliveryStatus: 'pending', startedAt: instant, stateVersion: 1, runIds: ['later-run'], plan: { employeeIds: ['bobo'] } }),
  ])
  const result = await readTaskDiagnosis(store, { target: taskTarget }, bobo)
  expect(result.selectionRequired).toBe(true)
  expect(result.candidates.map(value => [value.kind, value.id])).toEqual([['occurrence', 'later-occurrence'], ['run', 'run-1']])
  expect(result.target.runIds).toEqual([]); expect(result.target.conversationId).toBe('bobo-room')
})

it('uses real ExecutionRepository first lifecycle timestamps despite equal block sequences and repeated terminal events', async () => {
  const store = await fixture(), run = await store.get<AgentRun>('runs', 'run-1'), repository = new ExecutionRepository(store, () => {})
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(instant))
  await repository.append(run!, nativeActivity('a', { name: 'Read', input: { file_path: '/not-read' } }, false))
  await repository.append(run!, nativeActivity('b', { name: 'Read', input: { file_path: '/not-read' } }, false))
  vi.setSystemTime(new Date(Date.parse(instant) + 10000)); await repository.append(run!, nativeActivity('a', { name: 'Read', result: 'PRIVATE' }, true))
  vi.setSystemTime(new Date(Date.parse(instant) + 15000)); await repository.append(run!, nativeActivity('b', { name: 'Read', result: 'PRIVATE' }, true))
  vi.setSystemTime(new Date(Date.parse(instant) + 30000)); await repository.append(run!, nativeActivity('b', { name: 'Read', result: 'PRIVATE repeat' }, true))
  await repository.append(run!, nativeActivity('terminal-only', { name: 'Read', result: 'PRIVATE' }, true))
  const evidence = await store.queryExecutionEvidence(run!.id)
  expect(evidence.every(value => value.canonical?.firstEvidenceSequence === value.canonical?.lastEvidenceSequence)).toBe(true)
  const result = await readTaskDiagnosis(store, { target: runTarget }, bobo)
  expect(result.timing).toMatchObject({ unionMs: 15000, summedMs: 25000, overlapMs: 10000, unknownIntervals: 1 })
  expect(result.timing.intervals.map(value => value.durationMs)).toEqual([10000, 15000])
})

it('detects an absent execution clock created during the read and dependency completion during host collection', async () => {
  const store = await fixture(), run = await store.get<AgentRun>('runs', 'run-1')
  await store.write([
    record('runs', 'run-1', { ...run, workId: 'work-1' }),
    record('workItems', 'work-1', { conversationId: 'bobo-room', ownerAgentId: 'bobo', status: 'waiting', version: 1, resultVersion: 0, requiresReview: false, requiredResults: [{ workId: 'dependency', resultVersion: 1 }] }),
    record('workItems', 'dependency', { conversationId: 'bobo-room', ownerAgentId: 'alice', status: 'running', version: 1, resultVersion: 0 }),
  ])
  const repository = new ExecutionRepository(store, () => {}), request = vi.fn(async () => {
    await repository.append(run!, nativeActivity('new-tool', { name: 'Read' }, false))
    await store.write([record('workItems', 'dependency', { conversationId: 'bobo-room', ownerAgentId: 'alice', status: 'delivered', version: 2, resultVersion: 1 })])
    throw new Error('host unavailable')
  })
  const result = await readTaskDiagnosis(store, { target: runTarget, limit: 1 }, bobo, { host: { available: true, request } as unknown as ApplicationHostPort })
  expect(result.snapshotChanged).toBe(true); expect(result.nextCursor).toBeUndefined(); expect(result.assessment.certainty).toBe('unknown')
})

it('marks the original-message run query as bounded when the real SQL projection reaches its 30-run cap', async () => {
  const store = await fixture(), task = await store.get<Record<string, unknown>>('agentTasks', 'task-1'), original = await store.get<AgentRun>('runs', 'run-1')
  await store.write([
    record('agentTasks', 'task-1', { ...task, source: { conversationId: 'bobo-room', messageId: 'owner-message' } }),
    ...Array.from({ length: 30 }, (_, i) => record('runs', `old-${i}`, { ...original, id: `old-${i}`, createdAt: new Date(Date.parse(instant) + i + 1).toISOString() })),
  ])
  const result = await readTaskDiagnosis(store, { target: taskTarget }, bobo)
  expect(result.candidates).toHaveLength(30); expect(result.coverage.runsTruncated).toBe(true)
  expect(result.coverage.reasons.join('')).toContain('30项'); expect(result.selectionRequired).toBe(true); expect(result.target.runIds).toEqual([])
})
