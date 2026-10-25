/*
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [INPUT]: 真实 SQLite、自动化事务账本、原生调度和固定时间策略。
 * [OUTPUT]: 系统时钟跳变不延长已启动预算、数日漏跑不补执行；独立连接的新任务聊天单次绑定与提交故障整体回滚；跨实例受理、版本/恢复/迁移、投递回滚、同步与 DST 不变量验证。
 * [POS]: A+0 持久化边界测试；不运行真实用户计划或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../packages/shared/src/domain'
import type { AutomationDefinition, AutomationDispatch, AutomationInput, AutomationOccurrence } from '../packages/shared/src/domain/automations'
import { ProductStore, type StoredRecord } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository, type AutomationTrigger } from '../packages/runtime/src/modules/automations/automation-repository'
import { AutomationService } from '../packages/runtime/src/modules/automations/automation-service'
import { NativeSchedules, AUTOMATION_WORKFLOW } from '../packages/runtime/src/modules/automations/native-schedules'
import { calendarSlot, matchesSchedule, nextTimes, automationCron } from '../packages/runtime/src/modules/automations/schedule-policy'

const roots: string[] = [], stores: ProductStore[] = [], services: AutomationService[] = [], natives: NativeSchedules[] = []
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks()
  for (const service of services.splice(0)) await service.close()
  for (const native of natives.splice(0)) await native.close()
  for (const store of stores.splice(0)) await store.close()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const input = (fields: Partial<AutomationInput> = {}): AutomationInput => ({ name: '每日报告', prompt: '汇总获准资料并返回可核对依据', conversationId: 'project', frequency: 'daily', time: new Date().toISOString().slice(11, 16), weekday: 1, timezone: 'UTC', enabled: true, notify: false, ...fields })
const editing = (d: AutomationDefinition, fields: Partial<AutomationInput> = {}) => input({ id: d.id, expectedRevision: d.revision, name: d.name, prompt: d.prompt, conversationId: d.conversationId, time: d.time, frequency: d.frequency, weekday: d.weekday, timezone: d.timezone, enabled: d.enabled, notify: d.notify, ...fields })
const manual = (d: AutomationDefinition, key = 'request-1'): AutomationTrigger => ({ automationId: d.id, source: 'manual', key, scheduledAt: Date.now() })
const scheduled = (d: AutomationDefinition, key = 'native-1', time = Date.now()): AutomationTrigger => ({ automationId: d.id, source: 'schedule', key, scheduledAt: time, revision: d.revision, executionRevision: d.executionRevision, scheduleGeneration: d.scheduleGeneration })
async function fixture(migrate = true) {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-ledger-')); roots.push(root)
  const connect = async (file = join(root, 'boai.sqlite')) => { const store = new ProductStore(file); await store.init(); stores.push(store); return store }
  const store = await connect(), repository = new AutomationRepository(store, root)
  if (migrate) await repository.migrate()
  return { root, store, repository, connect }
}
function frozen(iso: string) { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }
function publication(o: AutomationOccurrence, dispatch: AutomationDispatch) {
  const message: Message = { id: 'message-' + o.id, turnId: 'turn-' + o.id, conversationId: o.conversationId, senderType: 'user', senderId: 'automation:' + o.automationId, senderName: o.name, status: 'completed', content: dispatch.definition!.prompt, createdAt: new Date().toISOString(), sequence: 1, origin: dispatch.origin }
  const records = [row('messages', message), row('turns', { id: message.turnId! }), row('requests', { id: dispatch.requestId })]
  return { message, records }
}
it('binds a new task chat and admission atomically across independent claimers and database faults', async () => {
  const { root, store, repository, connect } = await fixture()
  const d = await repository.save(input({ conversationId: undefined, conversationPolicy: 'new-conversation', employeeIds: ['researcher'], enabled: false }), 'allowed')
  const other = new AutomationRepository(await connect(), root)
  let prepared = 0
  const prepare = async (_d: AutomationDefinition, o: AutomationOccurrence) => { prepared++; return [row('conversations', { id: o.conversationId, occurrenceId: o.id, purpose: 'automation' })] }
  const results = await Promise.all([repository.claim(manual(d), () => undefined, prepare), other.claim(manual(d), () => undefined, prepare)])
  expect(results.filter(r => r.created)).toHaveLength(1); expect(prepared).toBe(1)
  expect(results[0].occurrence.conversationId).toBe(results[1].occurrence.conversationId)
  expect(await store.load('conversations')).toHaveLength(1)
  await repository.updateOccurrence(results[0].occurrence.id, results[0].occurrence.stateVersion, { status: 'completed' })
  const transaction = store.transaction.bind(store)
  store.transaction = operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'workBudgets') throw new Error('budget insert fault'); await tx.put(record) } }))
  try { await expect(repository.claim(manual(d, 'failure'), () => undefined, prepare)).rejects.toThrow('budget insert fault') }
  finally { store.transaction = transaction }
  expect(await store.load('conversations')).toHaveLength(1)
  expect(await store.load('automationOccurrences')).toHaveLength(1)
  expect(await store.load('automationDispatches')).toHaveLength(1)
})

it('admits one durable dispatch when independent SQLite connections claim the same manual request', async () => {
  const { root, store, repository, connect } = await fixture(), second = new AutomationRepository(await connect(), root)
  const d = await repository.save(input(), 'allowed')
  const results = await Promise.all([repository.claim(manual(d), () => undefined), second.claim(manual(d), () => undefined)])
  expect(results.filter(result => result.created)).toHaveLength(1)
  expect(new Set(results.map(result => result.occurrence.id)).size).toBe(1)
  expect(await store.load('automationOccurrences')).toHaveLength(1)
  expect(await store.load('automationDispatches')).toHaveLength(1)
  expect((await store.load<AutomationDispatch>('automationDispatches'))[0]).toMatchObject({ status: 'pending', definition: { prompt: d.prompt }, origin: { occurrenceId: results[0].occurrence.id } })
})

it('checks edit versions in SQLite and never acknowledges an obsolete native projection', async () => {
  const { root, repository, connect } = await fixture(), second = new AutomationRepository(await connect(), root)
  const d = await repository.save(input(), 'allowed')
  const results = await Promise.allSettled([repository.save(editing(d, { name: '甲' }), 'allowed'), second.save(editing(d, { name: '乙' }), 'allowed')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: '任务配置已变更，请刷新' }) })
  expect(await repository.acknowledgeSync(d.id, d.revision)).toBeUndefined()
  const current = (await repository.view()).definitions[0]
  expect(current).toMatchObject({ revision: 2, executionRevision: 1, scheduleGeneration: 1, sync: 'pending' })
  expect(await second.acknowledgeSync(d.id, 2)).toMatchObject({ appliedRevision: 2, sync: 'synced' })
})

it('keeps a calendar admission stable across name, notification and prompt edits, but fences new stale execution inputs', async () => {
  const { repository } = await fixture(); frozen('2026-09-29T09:00:00Z')
  const d = await repository.save(input(), 'allowed'), first = await repository.claim(scheduled(d), () => undefined)
  const renamed = await repository.save(editing(d, { name: '改名', notify: true }), 'allowed')
  expect(renamed).toMatchObject({ revision: 2, executionRevision: 1, scheduleGeneration: 1 })
  const duplicate = await repository.claim(scheduled(d, 'another-native-id'), () => undefined)
  expect(duplicate).toMatchObject({ created: false, occurrence: { id: first.occurrence.id, name: d.name } })
  const changed = await repository.save(editing(renamed, { prompt: '新的报告范围' }), 'allowed')
  expect(changed).toMatchObject({ revision: 3, executionRevision: 2, scheduleGeneration: 1 })
  expect((await repository.claim(scheduled(changed, 'third-id'), () => undefined)).occurrence.id).toBe(first.occurrence.id)
  await repository.updateOccurrence(first.occurrence.id, 1, { status: 'completed', deliveryStatus: 'unknown' })
  vi.setSystemTime(new Date('2026-09-30T09:00:00Z'))
  const stale = await repository.claim(scheduled(d, 'old-execution'), () => undefined)
  expect(stale.occurrence.reason).toContain('旧版本')
  const reconfigured = await repository.save(editing(changed, { time: '10:00' }), 'allowed')
  expect(reconfigured).toMatchObject({ executionRevision: 2, scheduleGeneration: 2 })
})

it('reuses a manual request after edits and records archive/pause races without dispatching', async () => {
  const { repository } = await fixture(), d = await repository.save(input(), 'allowed')
  const first = await repository.claim(manual(d), () => undefined)
  await repository.pause(d.id, true)
  const duplicate = await repository.claim(manual(d), () => 'permission revoked')
  expect(duplicate.occurrence.id).toBe(first.occurrence.id)
  const after = await repository.claim(manual(d, 'later'), () => undefined)
  expect(after.occurrence).toMatchObject({ status: 'skipped', reason: '任务已删除' }); expect(after.dispatch).toBeUndefined()
  await expect(repository.save(editing(d), 'allowed')).rejects.toThrow('不存在')
})

it('claims global and conversation capacity atomically and keeps waiting plans blocked while freeing their slot', async () => {
  const { repository } = await fixture()
  const plans = await Promise.all(['a', 'b', 'c'].map(conversationId => repository.save(input({ conversationId }), 'allowed')))
  const first = await repository.claim(manual(plans[0]), () => undefined)
  await repository.updateOccurrence(first.occurrence.id, 1, { status: 'waiting_user' })
  const waiting = await repository.claim(manual(plans[0], 'new-period'), () => undefined)
  expect(waiting.occurrence.reason).toContain('等待上次处理')
  const allowed = await Promise.all(plans.slice(1).map(d => repository.claim(manual(d), () => undefined)))
  expect(allowed.every(result => result.occurrence.status === 'admitted')).toBe(true)
  const fourth = await repository.save(input({ conversationId: 'd' }), 'allowed')
  expect((await repository.claim(manual(fourth), () => undefined)).occurrence.reason).toContain('容量')
  const sameChat = await repository.save(input({ conversationId: 'b' }), 'allowed')
  expect((await repository.claim(manual(sameChat), () => undefined)).occurrence.reason).toContain('会话忙碌')
})

it('rolls back the occurrence and aliases if its dispatch intent cannot be committed', async () => {
  const { store, repository } = await fixture(), d = await repository.save(input(), 'allowed')
  const original = store.transaction.bind(store)
  const fault = vi.spyOn(store, 'transaction').mockImplementationOnce(operation => original(tx => operation({ ...tx, put: record => record.collection === 'automationDispatches' ? Promise.reject(new Error('injected dispatch disk failure')) : tx.put(record) })))
  await expect(repository.claim(manual(d), () => undefined)).rejects.toThrow('disk failure')
  fault.mockRestore()
  expect(await store.load('automationOccurrences')).toEqual([]); expect(await store.load('automationTriggerAliases')).toEqual([])
  expect((await repository.claim(manual(d), () => undefined)).created).toBe(true)
})

it('commits message, turn and consumed intent together; failed publication leaves a reviewable pending admission', async () => {
  const { store, repository } = await fixture(), d = await repository.save(input(), 'allowed')
  const claimed = await repository.claim(manual(d), () => undefined), { message, records } = publication(claimed.occurrence, claimed.dispatch!)
  const original = store.transaction.bind(store)
  const fault = vi.spyOn(store, 'transaction').mockImplementationOnce(operation => original(tx => operation({ ...tx, put: record => record.collection === 'turns' ? Promise.reject(new Error('injected turn failure')) : tx.put(record) })))
  await expect(repository.commitDispatch(claimed.occurrence.id, message, records)).rejects.toThrow('turn failure'); fault.mockRestore()
  expect(await store.load('messages')).toEqual([])
  expect((await store.load<AutomationOccurrence>('automationOccurrences'))[0].status).toBe('admitted')
  expect((await store.load<AutomationDispatch>('automationDispatches'))[0].status).toBe('pending')
  const started = await repository.commitDispatch(claimed.occurrence.id, message, records)
  expect(started).toMatchObject({ status: 'running', messageId: message.id, turnId: message.turnId, stateVersion: 2 })
  expect(await store.load('messages')).toEqual([message])
  await expect(repository.commitDispatch(started.id, message, records)).rejects.toThrow('已消费')
  expect(await repository.updateOccurrence(started.id, 1, { status: 'completed' })).toBeUndefined()
})

it('fences changed execution authorization between admission and publication', async () => {
  const { repository, store } = await fixture(), d = await repository.save(input(), 'allowed')
  const claim = await repository.claim(manual(d), () => undefined), publicationResult = publication(claim.occurrence, claim.dispatch!)
  await repository.save(editing(d), 'revoked-and-resaved')
  await expect(repository.commitDispatch(claim.occurrence.id, publicationResult.message, publicationResult.records)).rejects.toThrow('执行配置已变化')
  expect(await store.load('messages')).toHaveLength(0)
})

it.each(['pending', 'started'] as const)('recovers %s dispatches without creating another message or execution', async stage => {
  const { root, store, repository } = await fixture(), d = await repository.save(input(), 'allowed')
  const claim = await repository.claim(manual(d), () => undefined)
  if (stage === 'started') { const { message, records } = publication(claim.occurrence, claim.dispatch!); await repository.commitDispatch(claim.occurrence.id, message, records) }
  const restarted = new AutomationRepository(store, root); await restarted.migrate(); await restarted.recover()
  const result = await restarted.claim(manual(d), () => undefined)
  expect(result.created).toBe(false); expect(result.dispatch).toBeUndefined()
  expect(result.occurrence).toMatchObject({ id: claim.occurrence.id, status: stage === 'pending' ? 'needs_review' : 'interrupted', deliveryStatus: 'unknown' })
  expect(await store.load('messages')).toHaveLength(stage === 'pending' ? 0 : 1)
})

it('snapshots and migrates old records without inventing delivery, usage or history versions, retaining all duplicate aliases', async () => {
  const { root, store, repository, connect } = await fixture(false); frozen('2026-11-01T05:30:00Z')
  const old = { ...input({ id: 'old-plan', time: '01:30', timezone: 'America/New_York', notify: true }), id: 'old-plan', revision: 4, cron: '30 1 * * *', authorizedFingerprint: 'allowed', sync: 'synced', createdAt: '2026-01-01T00:00:00Z' }
  const occurrence = { id: 'old-identity', automationId: old.id, revision: 4, name: old.name, source: 'schedule', scheduledFor: new Date().toISOString(), startedAt: new Date().toISOString(), status: 'completed', conversationId: old.conversationId, nativeRunId: 'original-native', runIds: [], resultMessageIds: [], usage: { outputTokens: 3 } }
  await store.write([row('automations', old), row('automationOccurrences', occurrence)])
  await repository.migrate(); await repository.recover(); await repository.migrate()
  const view = await repository.view(), d = view.definitions[0]
  expect(d).toMatchObject({ schemaVersion: 1, enabled: true, conversationPolicy: 'existing-conversation', notificationPolicy: 'all_results', executionRevision: 4 })
  expect(view.occurrences[0]).toMatchObject({ id: 'old-identity', status: 'completed', deliveryStatus: 'unknown', usageIncomplete: true, usage: { outputTokens: 3 } })
  expect(view.occurrences[0].scheduleGeneration).toBeUndefined()
  vi.setSystemTime(new Date('2026-11-01T06:30:00Z'))
  expect((await repository.claim(scheduled(d, 'second-dst-fire'), () => undefined)).occurrence.id).toBe('old-identity')
  const snapshots = (await readdir(root)).filter(name => /^automation-before-v1-.*\.sqlite$/.test(name))
  expect(snapshots).toHaveLength(1)
  const backup = await connect(join(root, snapshots[0]))
  expect(await backup.load('automations')).toEqual([old]); expect(await backup.load('automationSchema')).toEqual([])
})

it('rejects unknown schema versions before creating a snapshot or mutating configuration', async () => {
  const { root, store, repository } = await fixture(false)
  await store.write([row('automationSchema', { id: 'automations', version: 999 })])
  await expect(repository.migrate()).rejects.toThrow('版本高于')
  expect((await readdir(root)).some(name => name.startsWith('automation-before'))).toBe(false)
  expect(await store.load('automationSchema')).toEqual([{ id: 'automations', version: 999 }])
})

it('pauses restored installations without changing logical schedule identity or reactivating archived definitions', async () => {
  const { root, repository, store } = await fixture(), d = await repository.save(input(), 'allowed')
  await repository.recover()
  expect((await repository.view()).definitions[0].enabled).toBe(true)
  await store.write([row('automationRuntime', { id: 'installation', root, restorePending: true })])
  await repository.recover()
  const paused = (await repository.view()).definitions[0]
  expect(paused).toMatchObject({ enabled: false, revision: d.revision + 1, executionRevision: d.executionRevision, scheduleGeneration: d.scheduleGeneration, sync: 'pending' })
  const manualRun = await repository.claim(manual(paused), () => undefined)
  expect(manualRun.occurrence.status).toBe('admitted')
})

it('only labels unaccounted native evidence as needing review and does not stamp it with the newest revision', async () => {
  const { repository } = await fixture(), d = await repository.save(input(), 'allowed')
  const o = await repository.recordUnaccountedTrigger(d.id, 'native-without-product', Date.now(), 'trigger-1')
  expect(o).toMatchObject({ nativeRunId: 'native-without-product', nativeTriggerId: 'trigger-1', status: 'needs_review', deliveryStatus: 'unknown' })
  expect(o?.revision).toBeUndefined(); expect(o?.executionRevision).toBeUndefined(); expect(o?.scheduleGeneration).toBeUndefined()
  expect((await repository.claim(scheduled(d, 'native-without-product'), () => undefined)).created).toBe(false)
})

it('uses one calendar rule for missing/repeated DST hours and future previews', () => {
  const d = { ...input({ time: '02:30', timezone: 'America/New_York' }), cron: '30 2 * * *' }
  const times = nextTimes(d, 5, new Date('2026-03-07T08:00:00Z'))
  expect(times).toHaveLength(5)
  expect(times.map(time => calendarSlot(Date.parse(time), d.timezone))).toEqual(['2026-03-09 02:30', '2026-03-10 02:30', '2026-03-11 02:30', '2026-03-12 02:30', '2026-03-13 02:30'])
  expect(times.every(time => matchesSchedule(d, Date.parse(time)))).toBe(true)
  expect(matchesSchedule(d, Date.parse('2026-03-08T07:30:00Z'))).toBe(false)
  const fall = { ...d, time: '01:30', cron: '30 1 * * *' }, repeated = nextTimes(fall, 5, new Date('2026-11-01T00:00:00Z'))
  expect(new Set(repeated.map(time => calendarSlot(Date.parse(time), fall.timezone))).size).toBe(5)
  expect(repeated.filter(time => calendarSlot(Date.parse(time), fall.timezone).startsWith('2026-11-01'))).toHaveLength(1)
  const weekly = { ...fall, frequency: 'weekly' as const, weekday: 1 }
  expect(automationCron(weekly)).toBe('30 1 * * 1')
  expect(matchesSchedule(weekly, Date.parse('2026-11-01T05:30:00Z'))).toBe(false)
})

it.each([9, 11, 3 * 24 * 60])('admits only native misfires within the ten-minute window (%i minutes)', async minutes => {
  const { repository } = await fixture(); frozen('2026-09-29T08:00:00Z')
  const d = await repository.save(input({ time: '09:00' }), 'allowed')
  vi.setSystemTime(Date.parse('2026-09-29T09:00:00Z') + minutes * 60_000)
  const result = await repository.claim(scheduled(d, 'late', Date.parse('2026-09-29T09:00:00Z')), () => undefined)
  expect(result.occurrence.status).toBe(minutes === 9 ? 'admitted' : 'skipped')
  if (minutes > 10) expect(result.occurrence.reason).toContain('补跑窗口')
})

it.each([-48, 48])('keeps automation running across elapsed time and wall-clock jumps of %i hours until explicitly stopped', async hours => {
  const { root, store } = await fixture()
  let cancellations = 0, dispatches = 0, exited = false
  const service = new AutomationService(store, root, {
    critical: fn => fn(), validate: () => 'allowed', busy: () => false,
    dispatch: async (d, o, origin, commit) => {
      dispatches++
      const message: Message = { id: `message-${o.id}`, turnId: `turn-${o.id}`, conversationId: o.conversationId, senderType: 'user', senderId: 'automation', senderName: d.name, content: d.prompt, status: 'completed', sequence: 1, createdAt: new Date().toISOString(), origin }
      await commit(message, [row('turns', { id: message.turnId! })]); return message
    },
    inspect: () => cancellations ? { status: exited ? 'cancelled' : 'cancelling', deliveryStatus: 'unknown' } : undefined,
    cancel: async () => { cancellations++ }, changed: () => {}, notify: () => {},
  })
  services.push(service); await service.init()
  const d = await service.save(input({ enabled: false }))
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const startedAt = Date.now(), o = await service.run(d.id, 'clock-jump')
  await service.view()
  expect(o.budget!.deadlineAt).toBeUndefined()
  const duration = 30 * 60_000
  vi.setSystemTime(startedAt + hours * 60 * 60_000)
  await vi.advanceTimersByTimeAsync(duration - 1)
  expect(cancellations).toBe(0)
  await vi.advanceTimersByTimeAsync(1)
  expect((await service.view()).occurrences[0]).toMatchObject({ id: o.id, status: 'running', budgetId: o.budgetId })
  expect(cancellations).toBe(0)
  await service.stop(o.id)
  const stopping = (await service.view()).occurrences[0]
  expect(stopping).toMatchObject({ id: o.id, status: 'cancelling', cancellationCause: 'user', budgetId: o.budgetId })
  expect(stopping.budget!.deadlineAt).toBe(o.budget!.deadlineAt)
  expect(cancellations).toBe(1)
  await expect(service.beforeBackup()).rejects.toThrow('正在执行')
  exited = true; service.observe()
  expect((await service.view()).occurrences[0].status).toBe('cancelled')
  expect((await service.run(d.id, 'clock-jump')).id).toBe(o.id)
  expect(dispatches).toBe(1)
})

it('exhausts native history past 1000 records including a page split across one timestamp', async () => {
  const { root } = await fixture(), native = new NativeSchedules(join(root, 'native.sqlite'), async () => {})
  natives.push(native); await native.init()
  const schedule = await native.mastra.schedules.create({ id: 'history', workflowId: AUTOMATION_WORKFLOW, cron: '0 9 * * *', timezone: 'UTC', status: 'paused', inputData: { automationId: 'history', revision: 1 } })
  const storage = (await native.storage.getStore('schedules'))!, total = 1205
  for (let i = 0; i < total; i++) await storage.recordTrigger({ scheduleId: schedule.id, id: String(i), runId: 'run-' + i, scheduledFireAt: i, actualFireAt: i < 405 ? 1 : i, outcome: 'published' })
  const seen = new Set<string>()
  for await (const trigger of native.history(schedule.id)) seen.add(trigger.runId!)
  expect(seen.size).toBe(total); expect(seen.has('run-0')).toBe(true); expect(seen.has('run-1204')).toBe(true)
}, 20000)

it('retries only failed native configuration sync without executing a business task', async () => {
  const { root, store } = await fixture(), init = vi.spyOn(NativeSchedules.prototype, 'init').mockRejectedValueOnce(new Error('native temporarily unavailable'))
  let dispatches = 0
  const service = new AutomationService(store, root, { critical: fn => fn(), validate: () => 'allowed', busy: () => false, dispatch: async () => { dispatches++; throw new Error('should not dispatch') }, inspect: () => undefined, cancel: async () => {}, changed: () => {}, notify: () => {} })
  services.push(service); await service.init()
  const saved = await service.save(input({ enabled: false }))
  expect(saved.sync).toBe('error'); expect(saved.syncError).toContain('temporarily unavailable')
  await vi.waitFor(async () => expect((await service.view()).definitions[0].sync).toBe('synced'), { timeout: 5000, interval: 50 })
  expect(init).toHaveBeenCalledTimes(2); expect(dispatches).toBe(0)
  expect((await service.view()).definitions).toHaveLength(1)
})

it('does not replay a transaction callback when an error occurs after write admission', async () => {
  const { store } = await fixture()
  let calls = 0
  await expect(store.transaction(async tx => {
    calls++
    await tx.put(row('sentinel', { id: 'must-rollback' }))
    throw Object.assign(new Error('injected busy after begin'), { code: 'SQLITE_BUSY' })
  })).rejects.toThrow('busy after begin')
  expect(calls).toBe(1); expect(await store.load('sentinel')).toEqual([])
})

it('retains the native due slot for display/execution edits and changes the clock only for schedule edits or resuming', async () => {
  const { root, store } = await fixture(), original = NativeSchedules.prototype.init
  let native!: NativeSchedules
  vi.spyOn(NativeSchedules.prototype, 'init').mockImplementation(async function(this: NativeSchedules) { native = this; await original.call(this) })
  const service = new AutomationService(store, root, { critical: fn => fn(), validate: () => 'allowed', busy: () => false, dispatch: async () => { throw new Error('should not run while paused') }, inspect: () => undefined, cancel: async () => {}, changed: () => {}, notify: () => {} })
  services.push(service); await service.init()
  let d = await service.save(input({ enabled: false })), due = Date.now() - 9 * 60_000
  const storage = (await native.storage.getStore('schedules'))!
  await storage.updateSchedule(d.scheduleId!, { nextFireAt: due })
  for (const changes of [{ name: '新的显示名称' }, { notify: true }, { prompt: '修改报告要求' }]) {
    d = await service.save(editing(d, changes))
    expect((await native.mastra.schedules.get(d.scheduleId!))?.nextFireAt).toBe(due)
  }
  d = await service.save(editing(d, { time: d.time === '23:59' ? '00:00' : '23:59' }))
  expect((await native.mastra.schedules.get(d.scheduleId!))!.nextFireAt).toBeGreaterThan(Date.now())
  await storage.updateSchedule(d.scheduleId!, { nextFireAt: due })
  d = await service.save(editing(d, { enabled: true }))
  expect((await native.mastra.schedules.get(d.scheduleId!))!.nextFireAt).toBeGreaterThan(Date.now())
  expect((await service.view()).occurrences).toHaveLength(0)
})
