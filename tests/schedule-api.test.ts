/*
 * [INPUT]: Isolated AppService/SQLite, public schemas and the real schedule repository.
 * [OUTPUT]: Public/internal boundary, one-time calendar/consumption, clear errors, original receipt recovery and source-scoped unresolved-write invariants.
 * [POS]: Schedule contract regressions; no real model, user data or system notification.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createScheduleSchema, scheduleInstant, ScheduleError } from '../packages/shared/src/domain/schedules'
import type { ApplicationActor, ApplicationCatalog, ApplicationResult } from '../packages/shared/src/domain/application-protocol'
import type { AutomationInput, AutomationDefinition } from '../packages/shared/src/domain/automations'
import { AppService } from '../packages/runtime/src/service'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'
import { automationCron, normalizeSchedule, nextTimes } from '../packages/runtime/src/modules/automations/schedule-policy'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function database() {
  const root = await mkdtemp(join(tmpdir(), 'boai-schedule-api-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  return { root, store }
}
it('exports a business-only discriminated schema and rejects invalid local times without shifting them', () => {
  const json = JSON.stringify(z.toJSONSchema(createScheduleSchema, { io: 'input' }))
  for (const field of ['purpose', 'employeeTask', 'owner', 'conversationPolicy', 'employeeIds', 'cron']) expect(json).not.toContain(`"${field}"`)
  expect(createScheduleSchema.safeParse({ instruction: '提醒提交材料', trigger: { kind: 'once', date: '2099-11-04', time: '09:00' } }).success).toBe(true)
  expect(createScheduleSchema.safeParse({ instruction: '提醒', trigger: { kind: 'once', date: '2099-11-04' } }).success).toBe(false)
  expect(new Date(scheduleInstant('2026-11-04', '09:00', 'Asia/Shanghai')).toISOString()).toBe('2026-11-04T01:00:00.000Z')
  expect(() => scheduleInstant('2026-03-08', '02:30', 'America/New_York')).toThrow(ScheduleError)
  expect(() => scheduleInstant('2026-11-01', '01:30', 'America/New_York')).toThrow('夏令时切换中重复')
})
it('creates a one-time bobo plan through the real public adapter, shares legacy storage, and never starts model work', async () => {
  const { root, store } = await database()
  await store.close(); cleanup.pop()
  const noModel = vi.fn(async () => { throw new Error('No model expected') })
  const service = new AppService({ dataPath: root, engine: { test: noModel, decide: noModel, run: noModel }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit() {} })
  await service.init(); cleanup.push(() => service.close())
  await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' })
  const call = (operation: string, input: Record<string, unknown>, requestId?: string) => service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  const catalog = await service.handle('getApplicationCatalog', { operation: 'automations.create' }) as ApplicationCatalog
  expect(catalog.operations[0]).toMatchObject({ contractVersion: 2, schemaFingerprint: expect.any(String) })
  expect(await call('automations.create', { instruction: '提醒', employeeId: 'bobo', trigger: { kind: 'once', date: '2099-11-04' } }, 'missing')).toMatchObject({ status: 'rejected', error: { code: 'MISSING_FIELD', fields: ['trigger.time'] } })
  expect(await call('automations.create', { instruction: '提醒', employeeId: 'bobo', purpose: 'employee-task', trigger: { kind: 'daily', time: '09:00' } }, 'internal')).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT', fields: ['purpose'] } })
  const input = { instruction: '提醒提交材料', employeeId: 'bobo', trigger: { kind: 'once', date: '2099-11-04', time: '09:00', timezone: 'Asia/Shanghai' } }
  const result = await call('automations.create', input, 'once')
  expect(result).toMatchObject({ status: 'succeeded', data: { employeeId: 'bobo', activation: 'ready', nextTriggerAt: '2099-11-04T01:00:00.000Z', trigger: { kind: 'once' } } })
  expect(await call('automations.create', input, 'once')).toEqual(result)
  const id = (result.data as { id: string }).id
  const saved = await service.handle('getAutomation', { id }) as AutomationDefinition
  expect(saved).toMatchObject({ frequency: 'once', onceAt: '2099-11-04T01:00:00.000Z', owner: { kind: 'employee', employeeId: 'bobo' } })
  expect(saved.purpose).toBeUndefined()
  expect(await call('automations.update', { id, expectedRevision: 999, instruction: '覆盖' }, 'stale')).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  const legacyInput = { name: '旧客户端', prompt: '整理材料', owner: { kind: 'employee', employeeId: 'bobo' }, frequency: 'daily', time: '09:00', weekday: 0, timezone: 'Asia/Shanghai', enabled: false, notify: false }
  expect(await call('automations.create', legacyInput, 'legacy-without-version')).toMatchObject({ status: 'rejected', error: { code: 'MISSING_FIELD' } })
  const legacy = await service.handle('executeApplicationOperation', { operation: 'automations.create', contractVersion: 1, input: legacyInput, requestId: 'legacy' }) as ApplicationResult
  expect(legacy).toMatchObject({ status: 'succeeded', data: { frequency: 'daily', prompt: '整理材料', owner: { kind: 'employee', employeeId: 'bobo' } } })
  expect(await service.handle('executeApplicationOperation', { operation: 'automations.create', contractVersion: 1, input: { ...legacyInput, purpose: 'employee-task' }, requestId: 'legacy-internal' })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await service.handle('executeApplicationOperation', { operation: 'automations.get', contractVersion: 99, input: { id } })).toMatchObject({ status: 'rejected', error: { code: 'UNSUPPORTED_CONTRACT_VERSION' } })
  expect(noModel).not.toHaveBeenCalled()
})
it('atomically consumes a single logical time across competing claims, while a manual trial leaves the appointment intact', async () => {
  const { root, store } = await database(), repo = new AutomationRepository(store, root)
  const raw: AutomationInput = normalizeSchedule({ name: '单次', prompt: '提醒', conversationId: 'room', frequency: 'once', startsOn: '2099-11-04', time: '09:00', weekday: 0, timezone: 'UTC', enabled: true, notify: false })
  const d = await repo.save(raw, 'allowed'), at = Date.parse(d.onceAt!)
  expect(nextTimes({ ...raw, cron: automationCron(raw) })).toEqual([d.onceAt])
  const manual = await repo.claim({ automationId: d.id, source: 'manual', key: 'trial', scheduledAt: Date.now() }, () => undefined)
  expect((await store.get<AutomationDefinition>('automations', d.id))?.onceConsumedAt).toBeUndefined()
  await repo.updateOccurrence(manual.occurrence.id, manual.occurrence.stateVersion, { status: 'completed' })
  vi.setSystemTime(at)
  const claim = (key: string) => repo.claim({ automationId: d.id, source: 'schedule', key, scheduledAt: at, revision: d.revision, executionRevision: d.executionRevision, scheduleGeneration: d.scheduleGeneration }, () => undefined)
  const outcomes = await Promise.all([claim('native'), claim('wake')])
  expect(outcomes.filter(value => value.created)).toHaveLength(1)
  expect(outcomes[0].occurrence.id).toBe(outcomes[1].occurrence.id)
  const consumed = (await store.get<AutomationDefinition>('automations', d.id))!
  expect(consumed).toMatchObject({ onceConsumedAt: expect.any(String), onceOccurrenceId: outcomes[0].occurrence.id, enabled: true })
  expect(nextTimes(consumed)).toEqual([])
  expect((await store.load('automationDispatches'))).toHaveLength(2)
})
it('records a missed one-time appointment once after the existing catch-up window, without dispatching it', async () => {
  const { root, store } = await database(), repo = new AutomationRepository(store, root)
  const raw: AutomationInput = normalizeSchedule({ name: '错过的单次提醒', prompt: '提醒', conversationId: 'room', frequency: 'once', startsOn: '2099-11-04', time: '09:00', weekday: 0, timezone: 'UTC', enabled: true, notify: false })
  const d = await repo.save(raw, 'allowed'), at = Date.parse(d.onceAt!)
  vi.setSystemTime(at + 11 * 60_000)
  const trigger = { automationId: d.id, source: 'schedule' as const, key: 'wake-after-window', scheduledAt: at, revision: d.revision, executionRevision: d.executionRevision, scheduleGeneration: d.scheduleGeneration }
  const missed = await repo.claim(trigger, () => undefined)
  expect(missed.occurrence).toMatchObject({ status: 'skipped', reason: '超过 10 分钟补跑窗口' })
  expect((await repo.claim({ ...trigger, key: 'late-native' }, () => undefined)).occurrence.id).toBe(missed.occurrence.id)
  expect((await store.get<AutomationDefinition>('automations', d.id))?.onceOccurrenceId).toBe(missed.occurrence.id)
  expect(await store.load('automationDispatches')).toHaveLength(0)
})
it('blocks replacement IDs while a source write is unresolved, then recovers a committed original without replay', async () => {
  const { store } = await database(), actor: ApplicationActor = { kind: 'employee', employeeId: 'bobo', conversationId: 'core', messageId: 'source' }
  await store.write([{ collection: 'messages', id: 'source', value: { id: 'source' } }])
  let release!: () => void, entered!: () => void, executions = 0
  const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  const committed = new Map<string, unknown>()
  const app = new ApplicationService(store, [{ name: 'automations.create', description: 'fixture', effect: 'write', input: z.object({}).strict(), resultType: 'object', exclusiveSource: true,
    execute: async (_input, key) => { executions++; entered(); await gate; committed.set(key!, { id: 'original' }); throw new Error('lost reply after domain commit') }, recover: async key => committed.get(key) }], async () => {})
  const first = app.call({ operation: 'automations.create', input: {}, requestId: 'first' }, actor)
  await started
  expect(await app.call({ operation: 'automations.create', input: {}, requestId: 'replacement' }, actor)).toMatchObject({ status: 'rejected', error: { code: 'UNRESOLVED_WRITE', relatedReceiptId: expect.any(String) } })
  release(); const unknown = await first
  expect(unknown.status).toBe('unknown')
  expect(await app.receipt({ receiptId: unknown.receiptId! }, actor)).toMatchObject({ status: 'succeeded', data: { id: 'original' } })
  expect(await app.call({ operation: 'automations.create', input: {}, requestId: 'first' }, actor)).toMatchObject({ status: 'succeeded', data: { id: 'original' } })
  expect(executions).toBe(1)
})
it('halts repeated schedule observations without adding a wall-clock limit or affecting owner reads', async () => {
  const { store } = await database(), halt = vi.fn(), actor: ApplicationActor = { kind: 'employee', employeeId: 'bobo', conversationId: 'core', messageId: 'source' }
  const app = new ApplicationService(store, [{ name: 'automations.list', description: 'fixture', effect: 'read', input: z.object({}).strict(), resultType: 'array', execute: async () => [] }], async () => {}, halt)
  for (let i = 0; i < 4; i++) await app.call({ operation: 'automations.list', input: {} }, actor)
  expect(halt).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 5; i++) await app.call({ operation: 'automations.list', input: {} })
  expect(halt).toHaveBeenCalledTimes(1)
})
