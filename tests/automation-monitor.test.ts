/*
 * [INPUT]: 确定性比较器、冻结来源/规则、真实 SQLite 和故障注入。
 * [OUTPUT]: 数据失败不推进、累计阈值/冷却、证据与检查点/通知原子提交、版本/取消隔离及重启/恢复不重放验证。
 * [POS]: 自动化监控规则与持久化验收；不访问真实数据源或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AutomationDefinition, AutomationInput, AutomationMonitorCheckpoint, AutomationMonitorPolicy, AutomationMonitorRead, AutomationNotice, AutomationOccurrence } from '../src/shared/domain'
import { compareMonitorObservation, monitorPolicyFingerprint } from '../src/runtime/modules/automations/automation-monitor'
import { AutomationRepository } from '../src/runtime/modules/automations/automation-repository'
import { AutomationNotifications } from '../src/runtime/modules/automations/automation-notifications'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const dispose of disposers.splice(0).reverse()) await dispose() })
const policy: AutomationMonitorPolicy = { comparator: 'json-fields-v1', source: { kind: 'conversation-artifact', conversationId: 'chat', name: 'metrics.json' }, maxAgeSeconds: 300, cooldownSeconds: 60, rules: [{ pointer: '/count', mode: 'numeric_delta', threshold: 10 }] }
const instant = (seconds = 0) => new Date(Date.UTC(2026, 8, 29, 0, 0, seconds)).toISOString()
const observation = (count: unknown, seconds = 0) => ({ schemaVersion: 1, observedAt: instant(seconds), complete: true, data: { count } })
const compare = (count: unknown, seconds: number, prior?: AutomationMonitorCheckpoint, p = policy) => compareMonitorObservation(p, observation(count, seconds), prior, { automationId: 'plan', occurrenceId: `check-${seconds}`, checkedAt: instant(seconds) })

it('accumulates small changes from a released baseline and rechecks suppressed changes after cooldown', () => {
  const baseline = compare(100, 0)
  expect(baseline.result).toMatchObject({ outcome: 'baseline', notification: 'quiet', important: false })
  const small = compare(106, 10, baseline.checkpoint)
  expect(small.result).toMatchObject({ outcome: 'change', important: false, comparisons: [{ previous: 100, reference: 100, current: 106, delta: 6 }] })
  expect(small.checkpoint?.referenceValues).toEqual([100])
  const big = compare(111, 20, small.checkpoint)
  expect(big.result).toMatchObject({ important: true, notification: 'eligible', comparisons: [{ previous: 106, reference: 100, delta: 11 }] })
  const suppressed = compare(125, 30, big.checkpoint)
  expect(suppressed.result.notification).toBe('cooldown')
  expect(suppressed.checkpoint?.referenceValues).toEqual([111])
  const released = compare(125, 80, suppressed.checkpoint)
  expect(released.result).toMatchObject({ outcome: 'change', notification: 'eligible', comparisons: [{ changed: false, significant: true }] })
  expect(compare(125, 81, released.checkpoint).result).toMatchObject({ outcome: 'no_change', notification: 'quiet' })
  const reverted = compare(111, 40, suppressed.checkpoint)
  expect(reverted.result.important).toBe(false)
  expect(compare(111, 90, reverted.checkpoint).result.notification).toBe('quiet')
})

it('compares canonical JSON and escaped pointers without treating absent fields as null', () => {
  const p: AutomationMonitorPolicy = { ...policy, rules: [{ pointer: '/a~1b/~0key', mode: 'changed' }] }
  const value = (data: unknown, n: number, prior?: AutomationMonitorCheckpoint) => compareMonitorObservation(p, { ...observation(0, n), data }, prior, { automationId: 'plan', occurrenceId: `v-${n}`, checkedAt: instant(n) })
  const first = value({ 'a/b': { '~key': { a: null, b: [1, 2] } } }, 0)
  expect(value({ 'a/b': { '~key': { b: [1, 2], a: null } } }, 1, first.checkpoint).result.outcome).toBe('no_change')
  expect(value({ 'a/b': { '~key': { b: [2, 1], a: null } } }, 2, first.checkpoint).result.important).toBe(true)
  expect(value({ 'a/b': {} }, 3, first.checkpoint)).toMatchObject({ result: { outcome: 'data_error' } })
})

it('rejects incomplete, stale, future, malformed, excessive or numerically unsafe data without a successful checkpoint', () => {
  const base = observation(10)
  const invalid: unknown[] = [undefined, {}, { ...base, complete: false }, { ...base, data: {} }, { ...base, data: { count: '10' } }, { ...base, data: { count: NaN } }, { ...base, observedAt: '2026-09-28T00:00:00Z' }, { ...base, observedAt: instant(1) }, { ...base, data: { count: 1, huge: 'x'.repeat(65536) } }, { ...base, data: { count: 1, other: undefined } }]
  const cyclic: Record<string, unknown> = { count: 1 }; cyclic.self = cyclic; invalid.push({ ...base, data: cyclic })
  for (const input of invalid) {
    const result = compareMonitorObservation(policy, input, undefined, { automationId: 'plan', occurrenceId: 'check', checkedAt: instant() })
    expect(result.result.outcome).toBe('data_error'); expect(result.checkpoint).toBeUndefined()
  }
  const overflow = compare(-1e308, 0).checkpoint
  expect(compare(1e308, 1, overflow).result.outcome).toBe('data_error')
  const prior = compare(1, 0).checkpoint!
  for (const corrupt of [{ ...prior, checkedAt: 'invalid' }, { ...prior, referenceValues: ['1'] }, { ...prior, values: [] }, { ...prior, lastImportantAt: instant(100) }]) expect(compare(1, 1, corrupt).checkpoint).toBeUndefined()
})

it('rejects time rollback and inconsistent revisions while source or comparison changes establish a new baseline', () => {
  const prior = compare(10, 10).checkpoint!
  expect(compare(11, 10, prior).result.reason).toContain('同一观测时间')
  expect(compareMonitorObservation(policy, { ...observation(11, 10), observedAt: instant(10).replace('.000Z', 'Z') }, prior, { automationId: 'plan', occurrenceId: 'same-time', checkedAt: instant(11) }).result.reason).toContain('同一观测时间')
  expect(compare(10, 9, prior).result.reason).toContain('回拨')
  const older = compareMonitorObservation(policy, observation(10, 9), prior, { automationId: 'plan', occurrenceId: 'old', checkedAt: instant(11) })
  expect(older.result.reason).toContain('倒退')
  const changed = { ...policy, rules: [{ pointer: '/count', mode: 'changed' as const }] }
  expect(compare(20, 11, prior, changed).result.outcome).toBe('baseline')
  const source = { ...policy, source: { ...policy.source, name: 'new.json' } }
  expect(compare(20, 11, prior, source).result.outcome).toBe('baseline')
  expect(monitorPolicyFingerprint(source)).not.toBe(monitorPolicyFingerprint(policy))
})

async function fixture(notificationPolicy: AutomationInput['notificationPolicy'] = 'important_only') {
  const root = await mkdtemp(join(tmpdir(), 'boai-monitor-')); disposers.push(() => rm(root, { recursive: true, force: true }))
  const connect = async () => { const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); disposers.push(() => store.close()); return store }
  const store = await connect(), repository = new AutomationRepository(store, root)
  await repository.migrate(); await repository.recover()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(instant())
  const input: AutomationInput = { name: '检查计数变化', prompt: '关注计数变化', taskKind: 'monitor', monitor: policy, conversationPolicy: 'existing-conversation', conversationId: 'chat', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: notificationPolicy !== 'muted', notificationPolicy }
  const d = await repository.save(input, 'authorized')
  let sequence = 0
  const start = async () => { const { occurrence } = await repository.claim({ automationId: d.id, source: 'manual', key: `check-${sequence++}`, scheduledAt: Date.now() }, () => undefined); return repository.beginMonitor(occurrence.id) }
  const complete = (o: AutomationOccurrence, count: number, seconds: number, override?: AutomationMonitorRead) => { vi.setSystemTime(instant(seconds)); return repository.completeMonitor(o.id, o.stateVersion, override ?? { observation: observation(count, seconds), evidence: { artifactId: `artifact-${seconds}`, name: 'metrics.json', publishedAt: instant(seconds), fileHash: 'a'.repeat(64) } }) }
  const check = async (count: number, seconds: number) => complete(await start(), count, seconds)
  return { root, store, repository, connect, input, d, start, complete, check, checkpoints: () => store.load<AutomationMonitorCheckpoint>('automationMonitorCheckpoints'), notices: () => store.load<AutomationNotice>('automationNotices') }
}

it('persists quiet checks and failures distinctly, then atomically stores important evidence and a single notification', async () => {
  const f = await fixture()
  const baseline = await f.check(100, 0), first = (await f.checkpoints())[0]
  expect(baseline).toMatchObject({ status: 'completed', modelCalls: 0, usageIncomplete: false, monitor: { outcome: 'baseline' } })
  expect(baseline.messageId).toBeUndefined(); expect(await f.notices()).toEqual([])
  const failed = await f.complete(await f.start(), 100, 1, { observation: { ...observation(100, 1), complete: false }, evidence: { artifactId: 'incomplete', name: 'metrics.json', publishedAt: instant(1), fileHash: 'b'.repeat(64) } })
  expect(failed).toMatchObject({ status: 'failed', deliveryStatus: 'blocked', monitor: { outcome: 'data_error' } })
  expect((await f.checkpoints())[0]).toEqual(first)
  expect((await f.notices())[0].kind).toBe('attention')
  const same = await f.check(100, 2)
  expect(same).toMatchObject({ deliveryStatus: 'no_change', monitor: { outcome: 'no_change' } })
  const changed = await f.check(111, 3)
  expect(changed.monitor).toMatchObject({ notification: 'eligible', policy, comparisons: [{ previous: 100, reference: 100, current: 111 }], evidence: { artifactId: 'artifact-3' } })
  expect((await f.checkpoints())[0].occurrenceId).toBe(changed.id)
  expect(await f.notices()).toHaveLength(2)
  await expect(f.complete(changed, 500, 4)).rejects.toThrow('运行状态')
  expect(await f.notices()).toHaveLength(2)
  expect((await f.repository.claim({ automationId: f.d.id, source: 'manual', key: 'check-0', scheduledAt: Date.now() }, () => undefined)).occurrence.id).toBe(baseline.id)
})

it('rolls back checkpoint, result and notification together when the final write fails', async () => {
  const f = await fixture(), baseline = await f.check(100, 0), checkpoint = (await f.checkpoints())[0], next = await f.start()
  const transaction = f.store.transaction.bind(f.store)
  f.store.transaction = action => transaction(tx => action({ ...tx, put: async row => { if (row.collection === 'automationNotices') throw new Error('outbox failed'); await tx.put(row) } }))
  await expect(f.complete(next, 120, 1)).rejects.toThrow('outbox failed')
  f.store.transaction = transaction
  expect((await f.checkpoints())[0]).toEqual(checkpoint)
  expect((await f.repository.view()).occurrences.find(o => o.id === next.id)).toMatchObject({ status: 'running', stateVersion: next.stateVersion })
  expect(await f.notices()).toEqual([])
  await f.repository.recover()
  expect((await f.repository.view()).occurrences.find(o => o.id === next.id)).toMatchObject({ status: 'interrupted', deliveryStatus: 'unknown' })
  expect((await f.checkpoints())[0].occurrenceId).toBe(baseline.id)
  await expect(f.complete(next, 120, 2)).rejects.toThrow()
})

it('fences late completions after rule edits or stop, and resets only incomparable checkpoints', async () => {
  const f = await fixture(); await f.check(100, 0)
  const rename = await f.repository.save({ ...f.input, id: f.d.id, expectedRevision: f.d.revision, name: '新名称' }, 'authorized')
  expect(rename.executionRevision).toBe(f.d.executionRevision); expect(await f.checkpoints()).toHaveLength(1)
  const old = await f.start()
  const updated = await f.repository.save({ ...f.input, id: f.d.id, expectedRevision: rename.revision, monitor: { ...policy, rules: [{ pointer: '/count', mode: 'changed' }] } }, 'authorized')
  expect(updated.executionRevision).toBe(f.d.executionRevision + 1); expect(updated.scheduleGeneration).toBe(f.d.scheduleGeneration)
  expect(await f.checkpoints()).toEqual([])
  await expect(f.complete(old, 120, 1)).rejects.toThrow('配置或运行状态')
  await f.repository.updateOccurrence(old.id, old.stateVersion, { status: 'failed', deliveryStatus: 'unknown' })
  const fresh = await f.check(120, 2)
  expect(fresh.monitor?.outcome).toBe('baseline')
  const stopped = await f.start()
  await f.repository.updateOccurrence(stopped.id, stopped.stateVersion, { status: 'cancelling', cancellationRequestedAt: instant(3) })
  await expect(f.complete(stopped, 130, 3)).rejects.toThrow()
  expect((await f.checkpoints())[0].occurrenceId).toBe(fresh.id)
})

it('allows only one completion across independent connections and obeys explicit all-results or muted preferences', async () => {
  const f = await fixture('all_results'), second = new AutomationRepository(await f.connect(), f.root), o = await f.start()
  const results = await Promise.allSettled([f.complete(o, 10, 0), second.completeMonitor(o.id, o.stateVersion, { observation: observation(10), evidence: { artifactId: 'same', name: 'metrics.json', publishedAt: instant(), fileHash: 'c'.repeat(64) } })])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(await f.notices()).toHaveLength(1)
  await f.check(10, 1); expect(await f.notices()).toHaveLength(2)
  const muted = await f.repository.save({ ...f.input, id: f.d.id, expectedRevision: f.d.revision, notify: false, notificationPolicy: 'muted' }, 'authorized')
  await f.check(20, 2); expect(await f.notices()).toHaveLength(2)
  expect(await new AutomationNotifications(f.store).take()).toBeNull()
  await f.repository.save({ ...f.input, id: muted.id, expectedRevision: muted.revision, notificationPolicy: 'important_only' }, 'authorized')
  const cooling = await f.check(30, 3); expect(cooling.monitor?.notification).toBe('cooldown'); expect(await f.notices()).toHaveLength(2)
})

it('retains checkpoints on ordinary restart but clears them on restored installations and pauses plans', async () => {
  const f = await fixture(); await f.check(100, 0)
  await f.repository.recover(); expect(await f.checkpoints()).toHaveLength(1)
  await f.store.write([{ collection: 'automationRuntime', id: 'installation', value: { id: 'installation', root: f.root, restorePending: true } }])
  await f.repository.recover(); expect(await f.checkpoints()).toEqual([])
  expect((await f.repository.view()).definitions[0].enabled).toBe(false)
  expect((await f.check(120, 1)).monitor?.outcome).toBe('baseline')
})
