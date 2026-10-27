/*
 * [OUTPUT]: 2026-10-27 持续进展、配对/轮转/等待降级、旧额度来源与恢复现场回归源码。
 * [INPUT]: Complete/incomplete tool trajectories, current source ownership and historical budget ledgers.
 * [OUTPUT]: Repeat detection without count ceilings; unknown evidence, waiting and explicit limits keep their semantics.
 * [POS]: Targeted runtime regressions, no external model or Electron launch.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { expect, it } from 'vitest'
import { ProgressMonitor } from '../packages/runtime/src/modules/contexts/progress-monitor'
import { newWorkBudget, upgradeWorkExecutionAllowance, workBudgetExhausted } from '../packages/runtime/src/modules/collaboration/work-budget'
import { workingScene } from '../packages/runtime/src/modules/contexts/working-scene'
import type { AgentRun, Artifact, Message, WorkExecution, WorkItem } from '../packages/shared/src/domain'
const step = (monitor: ProgressMonitor, id: string, result: unknown = 'same', name = 'read_file') => { monitor.start(id, name, { path: '/authorized/a' }); monitor.finish(id, name, result) }

it('allows thousands of actual progress steps and does not infer failure from totals', () => {
  const monitor = new ProgressMonitor()
  for (let index = 0; index < 2000; index++) { step(monitor, String(index), { page: index, content: `new evidence ${index}` }); expect(monitor.candidate()).toBeUndefined() }
  expect(monitor.pauseRequested).toBe(false)
})
it('requires complete paired evidence and an adjustment opportunity before a review', () => {
  const monitor = new ProgressMonitor()
  for (let i = 0; i < 3; i++) step(monitor, `call-${i}`)
  const candidate = monitor.candidate()!
  expect(candidate.observations.map(row => row.id)).toEqual(['call-0', 'call-1', 'call-2'])
  expect(monitor.shouldReview(candidate)).toBe(false)
  monitor.feedback(candidate); expect(monitor.shouldReview(monitor.candidate()!)).toBe(false)
  step(monitor, 'call-3'); expect(monitor.shouldReview(monitor.candidate()!)).toBe(true)
  monitor.reviewedCandidate(monitor.candidate()!)
  for (let i = 4; i < 30; i++) step(monitor, `call-${i}`)
  expect(monitor.shouldReview(monitor.candidate()!)).toBe(false)
  step(monitor, 'changed', 'new evidence'); expect(monitor.valid(candidate)).toBe(false)
})
it('keeps rotations stable through multi-tool step completion, with separate run scopes', () => {
  const monitor = new ProgressMonitor(), other = new ProgressMonitor()
  for (let cycle = 0; cycle < 3; cycle++) for (const name of ['read_a', 'read_b']) step(monitor, `${cycle}-${name}`, name, name)
  const before = monitor.candidate()!; monitor.feedback(before)
  monitor.start('next-a', 'read_a', { path: '/authorized/a' }); monitor.start('next-b', 'read_b', { path: '/authorized/a' })
  monitor.finish('next-a', 'read_a', 'read_a'); expect(monitor.candidate()).toBeUndefined()
  monitor.finish('next-b', 'read_b', 'read_b')
  expect(monitor.candidate()?.fingerprint).toBe(before.fingerprint)
  expect(monitor.shouldReview(monitor.candidate()!)).toBe(true)
  expect(other.candidate()).toBeUndefined()
})
it('does not escalate waits, unpaired, truncated, binary or missing results', () => {
  for (const value of [{ truncated: true, content: 'same' }, new Uint8Array([1]), undefined]) {
    const monitor = new ProgressMonitor(); for (let i = 0; i < 8; i++) { monitor.start(String(i), 'read_file', {}); monitor.finish(String(i), 'read_file', value) }
    expect(monitor.candidate()).toBeUndefined()
  }
  const waits = new ProgressMonitor(); for (let i = 0; i < 200; i++) step(waits, String(i), 'pending', 'wait_process')
  expect(waits.candidate()).toBeUndefined()
  waits.finish('unpaired', 'read_file', 'same'); expect(waits.candidate()).toBeUndefined()
})
it('redacts review data and declines review when full evidence cannot fit a sample', () => {
  const monitor = new ProgressMonitor()
  for (let i = 0; i < 3; i++) step(monitor, String(i), { apiKey: 'private', result: 'same' })
  expect(JSON.stringify(monitor.candidate())).not.toContain('private')
  const big = new ProgressMonitor(); for (let i = 0; i < 3; i++) step(big, String(i), 'x'.repeat(5000))
  big.feedback(big.candidate()!); step(big, 'next', 'x'.repeat(5000))
  expect(big.shouldReview(big.candidate()!)).toBe(false)
})
it('discards an incomplete step so later complete observations remain usable', () => {
  const monitor = new ProgressMonitor()
  monitor.start('missing', 'read_file', {}); monitor.endStep()
  for (let i = 0; i < 3; i++) { step(monitor, `later-${i}`); monitor.endStep() }
  expect(monitor.candidate()?.observations.map(row => row.id)).toEqual(['later-0', 'later-1', 'later-2'])
  expect(monitor.pauseRequested).toBe(false)
})
it('preserves unknown historical limits at startup, archives them on explicit continue and never resets usage', () => {
  const budget = { ...newWorkBudget('budget'), limitAuthority: undefined, maxModelCalls: 24, modelCalls: 200, deadlineAt: '2020-01-01', usage: { outputTokens: 1234 } }
  const before = structuredClone(budget); upgradeWorkExecutionAllowance(budget); expect(budget).toEqual(before)
  upgradeWorkExecutionAllowance(budget, true)
  expect(budget).toMatchObject({ maxModelCalls: null, modelCalls: 200, deadlineAt: '', usage: { outputTokens: 1234 }, legacyLimits: { limits: { maxModelCalls: 24 }, reason: 'unverified-origin' } })
  expect(workBudgetExhausted(budget)).toBe(false)
  const explicit = { ...newWorkBudget('explicit'), limitAuthority: { kind: 'user' as const, requestId: 'receipt', messageId: 'user-message', version: 1 }, maxModelCalls: 0 }
  upgradeWorkExecutionAllowance(explicit, true); expect(workBudgetExhausted(explicit)).toBe(true)
})
it('projects confirmed files separately from failed tools, unknown effects and a plan', () => {
  const scene = JSON.parse(workingScene({
    work: { id: 'work', version: 3, scope: '完成报告', deliverable: '已发布文件', status: 'interrupted', sourceMessageId: 'request', nextStep: '核对发布回执', requiresReview: true, requiredResults: [] } as unknown as WorkItem,
    messages: [{ id: 'correction', senderType: 'user', sequence: 8, content: '金额改为 1234，先不要发布' }] as Message[],
    runs: [{ id: 'run', status: 'interrupted', toolEvents: [{ id: 'read', name: 'read_file', status: 'completed' }, { id: 'publish', name: 'publish_artifact', status: 'failed' }] }] as AgentRun[],
    artifacts: [{ id: 'ready', name: 'report.md', contentStatus: 'ready', contentHash: 'hash' }, { id: 'prepared', name: 'draft.md', contentStatus: 'unavailable' }] as Artifact[],
    executions: [{ id: 'run', status: 'released', pendingEffects: undefined }] as WorkExecution[],
  }))
  expect(scene.confirmedFiles.map((file: { id: string }) => file.id)).toEqual(['ready'])
  expect(scene.effects[0].pendingEffects).toBe('unknown')
  expect(scene.priorRuns[0].completed.map((tool: { id: string }) => tool.id)).toEqual(['read'])
  expect(scene.latestUserDirections[0].content.text).toContain('先不要发布')
  expect(scene.objective.status).toBe('interrupted')
})
