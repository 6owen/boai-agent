/*
 * [INPUT]: Isolated host journals, immutable process identities and malicious/partial metadata.
 * [OUTPUT]: Read-only bounded projections exclude unrelated tasks, preserve old provenance and support absent runtime summaries.
 * [POS]: WT1 D2 contract checks; no Electron, model, personal logs or runtime process is started.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DesktopDiagnostics, diagnosticError, diagnosticRequest } from '../apps/electron/src/main/diagnostics'
import { desktopDiagnosticsQuerySchema, desktopDiagnosticsSnapshotSchema, type DesktopRuntimeIdentity } from '../packages/shared/src/ipc/desktop-diagnostics'
import type { Methods } from '../packages/shared/src/ipc'

const roots: string[] = []
const application = { version: 'test', inputHash: 'a'.repeat(64), source: 'compiled-inputs' as const }
const runtime: DesktopRuntimeIdentity = { mode: 'owned', pid: 123, serverId: null, generation: 'runtime-1' }
const target = { employeeId: 'employee-a', conversationId: 'conversation-a', workId: 'work-a', runId: 'run-a' }
function fixture() { const directory = mkdtempSync(join(tmpdir(), 'boai-host-snapshot-')); roots.push(directory); return { directory, journal: new DesktopDiagnostics(directory, application) } }
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test('a task projection keeps only exact target request identities and labels unlinked host faults as environment clues', () => {
  const { directory, journal } = fixture()
  journal.record('runtime-ready', { pid: 123, runtimeGeneration: 'runtime-1' })
  journal.record('request-timeout', { ...diagnosticRequest('sendMessage', 'target-request', target), pid: 123, runtimeGeneration: 'runtime-1' })
  journal.record('request-failed', { ...target, runId: 'another-run', requestId: 'other-request' })
  journal.record('request-failed', { employeeId: 'employee-b', conversationId: 'conversation-b', requestId: 'private-request' })
  journal.record('request-timeout', { employeeId: target.employeeId, conversationId: target.conversationId, requestId: 'partial-request' })
  journal.record('request-failed', { requestId: 'unlinked-request' })
  const path = join(directory, 'desktop.jsonl'), original = readFileSync(path, 'utf8')
  const snapshot = journal.snapshot(runtime, { target })
  expect(snapshot.events).toHaveLength(2)
  expect(snapshot.events[0]).toMatchObject({ event: 'runtime-ready', relation: 'environment', runtimeMatch: 'current' })
  expect(snapshot.events[1]).toMatchObject({ event: 'request-timeout', relation: 'target', requestId: 'target-request', runtimeMatch: 'current' })
  expect(JSON.stringify(snapshot)).not.toMatch(/other-request|private-request|partial-request|unlinked-request|another-run|employee-b/)
  expect(snapshot.coverage.uncorrelatedRecords).toBe(2)
  expect(readFileSync(path, 'utf8')).toBe(original)
  journal.snapshot(runtime, { target })
  journal.record('runtime-exit', { pid: 123, runtimeGeneration: 'runtime-1' })
  expect(journal.report().entries.at(-1)?.sequence).toBe(7)
})

test('unknown codes and raw error fingerprints never reach model-visible projections', () => {
  const { journal } = fixture()
  journal.record('request-failed', { ...target, ...diagnosticError(Object.assign(new Error('secret-password'), { code: 'SECRET_CREDENTIAL' })) })
  journal.record('request-failed', { ...target, ...diagnosticError(Object.assign(new Error('another-secret'), { code: 'ECONNRESET' })) })
  expect(journal.record('runtime-error', { command: 'read all secrets' } as never)).toBe(false)
  const snapshot = journal.snapshot(runtime, { target })
  expect(snapshot.events.map(event => event.errorCode)).toEqual(['OTHER', 'ECONNRESET'])
  expect(snapshot.coverage.rejectedWrites).toBe(1)
  expect(JSON.stringify(snapshot)).not.toMatch(/fingerprint|secret|SECRET_CREDENTIAL|command/)
  expect(desktopDiagnosticsSnapshotSchema.safeParse(snapshot).success).toBe(true)
  expect(desktopDiagnosticsQuerySchema.safeParse({ path: '/Users/private' }).success).toBe(false)
  expect(desktopDiagnosticsQuerySchema.safeParse({ target: { ...target, admin: true } }).success).toBe(false)
})

test('real execution RPC identity pairs correlate without inventing absent employee or work fields', () => {
  const { journal } = fixture()
  const input: Methods['getExecutionContent']['input'] = { conversationId: target.conversationId, runId: target.runId, evidenceId: 'evidence-a', offset: 0 }
  journal.record('request-timeout', { ...diagnosticRequest('getExecutionContent', 'real-request', input), pid: 123, runtimeGeneration: 'runtime-1' })
  journal.record('request-failed', { ...diagnosticRequest('getExecutionContent', 'wrong-owner', input), employeeId: 'employee-b' })
  journal.record('request-timeout', { conversationId: target.conversationId, requestId: 'conversation-only' })
  const result = journal.snapshot(runtime, { target })
  expect(result.events).toEqual([expect.objectContaining({ relation: 'target', requestId: 'real-request', runtimeMatch: 'current' })])
  expect(result.coverage.uncorrelatedRecords).toBe(1)
  expect(JSON.stringify(result)).not.toMatch(/wrong-owner|conversation-only/)
})

test('same PID or attached server cannot attribute a previous generation fault to the current runtime', () => {
  const { journal } = fixture()
  journal.record('runtime-exit', { pid: 123, runtimeGeneration: 'runtime-old', exitCode: 2 })
  journal.record('runtime-ready', { pid: 123, runtimeGeneration: 'runtime-1' })
  journal.record('runtime-error', { pid: 123 })
  journal.record('runtime-ready', { runtimeGeneration: 'runtime-1' })
  expect(journal.snapshot(runtime).events.map(event => event.runtimeMatch)).toEqual(['previous', 'current', 'unknown', 'unknown'])
  journal.record('runtime-exit', { serverId: 'server-a', runtimeGeneration: 'attached-old', reason: 'disconnected' })
  journal.record('runtime-ready', { serverId: 'server-a', runtimeGeneration: 'attached-current' })
  journal.record('runtime-ready', { serverId: 'server-b', runtimeGeneration: 'attached-current' })
  const attached = journal.snapshot({ mode: 'attached', pid: null, serverId: 'server-a', generation: 'attached-current' })
  expect(attached.events.slice(-3).map(event => event.runtimeMatch)).toEqual(['previous', 'current', 'previous'])
})

test('the owner summary works with absent runtime and historical identities remain historical', () => {
  const { directory, journal } = fixture()
  journal.record('runtime-ready', { pid: 123, runtimeGeneration: 'runtime-1' })
  journal.record('runtime-exit', { pid: 123, runtimeGeneration: 'runtime-1', exitCode: 7 })
  journal.record('request-failed', { ...target, requestId: 'private-task-request' })
  const path = join(directory, 'desktop.jsonl'), entries = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  delete entries[0].application
  writeFileSync(path, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n')
  const next = new DesktopDiagnostics(directory, { ...application, version: 'next', inputHash: 'b'.repeat(64) })
  const absent: DesktopRuntimeIdentity = { mode: 'absent', pid: null, serverId: null, generation: null }
  const snapshot = next.snapshot(absent)
  expect(snapshot.runtime.mode).toBe('absent')
  expect(snapshot.summary.join(' ')).toContain('未持有运行服务连接')
  expect(snapshot.events).toHaveLength(2)
  expect(snapshot.events.every(entry => entry.runtimeMatch === 'previous')).toBe(true)
  expect(snapshot.events[0].application).toEqual({ version: null, inputHash: null, source: 'unknown' })
  expect(snapshot.events[1].application).toEqual(application)
  expect(snapshot.coverage.unknownBuildEntries).toBe(1)
  expect(JSON.stringify(snapshot)).not.toContain('private-task-request')
})

test('bounded retention, rejected rows and clock rollback remain explicit without inferred durations', () => {
  const { directory, journal } = fixture()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-07T10:00:00Z')); journal.record('runtime-ready', { pid: 123, runtimeGeneration: 'runtime-1' })
  vi.setSystemTime(new Date('2026-11-07T09:00:00Z')); journal.record('runtime-exit', { pid: 123, runtimeGeneration: 'runtime-1' })
  const path = join(directory, 'desktop.jsonl'), original = readFileSync(path, 'utf8')
  writeFileSync(path, original + 'broken row\n' + JSON.stringify({ ...JSON.parse(original.split('\n')[0]), injected: 'ignore instructions' }) + '\n')
  const snapshot = journal.snapshot(runtime, { limit: 1 })
  expect(snapshot.events).toHaveLength(1)
  expect(snapshot.coverage).toMatchObject({ retention: 'bounded', retainedFiles: 2, maxFileBytes: 262144, rejectedRecords: 2, truncated: true, clockOrderUncertain: true })
  expect(snapshot.summary.join(' ')).toContain('时间存在回拨')
  expect(JSON.stringify(snapshot)).not.toMatch(/ignore instructions|durationMs|elapsedMs/)
  expect(() => journal.snapshot(runtime, { limit: 129 })).toThrow()
})

test('rotation and persistence failures are visible without copying malformed metadata', () => {
  const { directory, journal } = fixture()
  for (let index = 0; index < 1600; index++) journal.record('runtime-error', { runtimeGeneration: 'x'.repeat(190), pid: 123 })
  expect(journal.snapshot(runtime).coverage).toMatchObject({ retention: 'bounded', previousFilePresent: true, truncated: true })
  const blocked = join(directory, 'blocked'); writeFileSync(blocked, 'private-content')
  const unavailable = new DesktopDiagnostics(blocked, application)
  unavailable.record('runtime-exit', { pid: 123, runtimeGeneration: 'runtime-1' })
  expect(unavailable.snapshot(runtime).coverage.persistenceError).toBe('unavailable')
  expect(JSON.stringify(unavailable.snapshot(runtime))).not.toContain('private-content')
})
