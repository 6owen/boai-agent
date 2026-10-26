/*
 * [INPUT]: 真实 SQLite/自动化事务、持久通知账本和可控系统提交端口。
 * [OUTPUT]: 已结束但未交付/部分结果的重要通知；通知策略/语义去重、同事务回滚、跨连接领取、状态回执/崩溃/恢复/静音与清理不重发验证。
 * [POS]: 通知可靠性回归；不调用真实系统通知或用户计划。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'
import { AutomationNotifications } from '../packages/runtime/src/modules/automations/automation-notifications'
import { AutomationNotificationConsumer } from '../apps/electron/src/main/automation-notifications'
import type { AutomationDefinition, AutomationInput, AutomationNotice, AutomationNoticeReceipt, AutomationOccurrence } from '../packages/shared/src/domain'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const input = (notificationPolicy: AutomationInput['notificationPolicy'] = 'important_only'): AutomationInput => ({ name: '通知验收', prompt: '汇总资料', conversationId: 'chat', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: notificationPolicy !== 'muted', notificationPolicy })
const edit = (d: AutomationDefinition, fields: Partial<AutomationInput> = {}): AutomationInput => ({ ...input(d.notificationPolicy), id: d.id, expectedRevision: d.revision, ...fields })
async function fixture(policy?: AutomationInput['notificationPolicy']) {
  const root = await mkdtemp(join(tmpdir(), 'boai-notices-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const connect = async () => { const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close()); return store }
  const store = await connect(), repository = new AutomationRepository(store, root), notices = new AutomationNotifications(store)
  await repository.migrate(); await repository.recover()
  const d = await repository.save(input(policy), 'authorized')
  const claim = async (key = 'run') => (await repository.claim({ automationId: d.id, source: 'manual', key, scheduledAt: Date.now() }, () => undefined)).occurrence
  const change = (o: AutomationOccurrence, patch: Partial<AutomationOccurrence>) => repository.updateOccurrence(o.id, o.stateVersion, patch) as Promise<AutomationOccurrence>
  return { root, store, repository, notices, d, claim, change, connect, list: () => store.load<AutomationNotice>('automationNotices') }
}
it('queues only important delivery or attention, preserves legacy choices, and ignores accounting-only updates', async () => {
  const f = await fixture()
  let o = await f.claim()
  o = await f.change(o, { status: 'completed', deliveryStatus: 'unknown', resultMessageIds: ['answer'] })
  expect(await f.list()).toEqual([])
  o = await f.change(o, { deliveryStatus: 'delivered' })
  expect(await f.list()).toHaveLength(1)
  await f.change(o, { modelCalls: 5, usage: { inputTokens: 20 } })
  expect(await f.list()).toHaveLength(1)
  let second = await f.claim('second')
  second = await f.change(second, { status: 'completed', deliveryStatus: 'no_change' })
  expect(await f.list()).toHaveLength(1)
  const oldClient = { ...edit(f.d), notificationPolicy: undefined }
  const retained = await f.repository.save(oldClient, 'authorized')
  expect(retained.notificationPolicy).toBe('important_only')
  const muted = await f.repository.save({ ...edit(retained), notificationPolicy: undefined, notify: false }, 'authorized')
  expect(muted.notificationPolicy).toBe('muted')
  expect(muted.executionRevision).toBe(f.d.executionRevision)
  expect(muted.scheduleGeneration).toBe(f.d.scheduleGeneration)
  await f.change(second, { status: 'failed', reason: 'failure' })
  expect(await f.list()).toHaveLength(1)
  expect(await f.notices.take()).toBeNull()
  expect((await f.list())[0].status).toBe('suppressed')
})
it('creates attention for waiting but suppresses a question answered before OS submission', async () => {
  const f = await fixture()
  let o = await f.claim()
  o = await f.change(o, { status: 'waiting_work' })
  expect(await f.list()).toEqual([])
  o = await f.change(o, { status: 'waiting_user', waitingTurnIds: ['question-one'] })
  expect((await f.list())[0]).toMatchObject({ kind: 'attention', status: 'pending' })
  o = await f.change(o, { status: 'running', waitingTurnIds: [] })
  expect(await f.notices.take()).toBeNull()
  o = await f.change(o, { status: 'waiting_user', waitingTurnIds: ['question-two'] })
  expect(await f.list()).toHaveLength(2)
  expect(await f.notices.take()).toMatchObject({ occurrenceId: o.id, status: 'submitting' })
})
it('treats an ended but undelivered result as attention under important-only notifications', async () => {
  const f = await fixture()
  const blocked = await f.change(await f.claim('blocked'), { status: 'completed', deliveryStatus: 'blocked' })
  expect(await f.notices.take()).toMatchObject({ occurrenceId: blocked.id, kind: 'attention', deliveryStatus: 'blocked' })
  const partial = await f.change(await f.claim('partial'), { status: 'completed', deliveryStatus: 'partial' })
  expect(await f.notices.take()).toMatchObject({ occurrenceId: partial.id, kind: 'attention', deliveryStatus: 'partial' })
})
it('claims an OS submission once across independent connections and fences stale or contradictory receipts', async () => {
  const f = await fixture('all_results'), other = new AutomationNotifications(await f.connect())
  const o = await f.change(await f.claim(), { status: 'completed', resultMessageIds: ['result-message'] })
  const claims = await Promise.all([f.notices.take(), other.take()])
  expect(claims.filter(Boolean)).toHaveLength(1)
  const claimed = claims.find(Boolean)!
  const receipt = { id: claimed.id, attemptId: claimed.attemptId! }
  expect(claimed).toMatchObject({ occurrenceId: o.id, messageId: 'result-message' })
  expect(await other.settle({ ...receipt, attemptId: 'stale', status: 'submitted' })).toBe(false)
  expect(await f.notices.settle({ ...receipt, status: 'submitted' })).toBe(true)
  expect(await other.settle({ ...receipt, status: 'failed', error: 'OS rejected' })).toBe(true)
  expect(await f.notices.settle({ ...receipt, status: 'submitted' })).toBe(false)
  const history = await f.store.automationHistory({ limit: 10 })
  expect(history.occurrences[0].notices).toMatchObject([{ status: 'failed', error: 'OS rejected' }])
  expect(history.occurrences[0].deliveryStatus).toBe('pending')
  expect(history.occurrences[0].notificationDelivered).toBeUndefined()
})
it('rolls back the result when its notification intent cannot commit', async () => {
  const f = await fixture('all_results'), o = await f.claim(), transaction = f.store.transaction.bind(f.store)
  f.store.transaction = operation => transaction(tx => operation({ ...tx, put: async row => { if (row.collection === 'automationNotices') throw new Error('outbox unavailable'); await tx.put(row) } }))
  await expect(f.change(o, { status: 'completed', deliveryStatus: 'delivered' })).rejects.toThrow('outbox unavailable')
  f.store.transaction = transaction
  expect((await f.repository.view()).occurrences[0]).toMatchObject({ status: 'admitted', deliveryStatus: 'pending', stateVersion: o.stateVersion })
  expect(await f.list()).toEqual([])
})
it('keeps submitted-but-unacknowledged attempts unknown after restart and suppresses pending backup reminders', async () => {
  const f = await fixture('all_results')
  await f.change(await f.claim(), { status: 'completed' })
  const claimed = (await f.notices.take())!
  await f.repository.recover()
  expect((await f.list())[0].status).toBe('unknown')
  expect(await f.notices.take()).toBeNull()
  expect(await f.notices.settle({ id: claimed.id, attemptId: claimed.attemptId!, status: 'submitted' })).toBe(false)
  await f.change(await f.claim('second'), { status: 'completed' })
  await f.store.write([{ collection: 'automationRuntime', id: 'installation', value: { id: 'installation', root: f.root, restorePending: true } }])
  await f.repository.recover()
  expect((await f.list()).map(n => n.status).sort()).toEqual(['suppressed', 'unknown'])
  expect(await f.notices.take()).toBeNull()
  expect((await f.repository.view()).definitions[0].enabled).toBe(false)
})
it('deduplicates repeated permission failures until execution authorization changes', async () => {
  const f = await fixture()
  const denied = (key: string) => f.repository.claim({ automationId: f.d.id, source: 'manual', key, scheduledAt: Date.now() }, () => ({ reason: '权限已变更', attention: 'authorization' }))
  await denied('first'); await denied('second')
  expect(await f.list()).toHaveLength(1)
  await f.repository.save(edit(f.d, { prompt: '重新授权的任务' }), 'authorized-v2')
  expect(await f.notices.take()).toBeNull()
  await denied('third')
  expect(await f.list()).toHaveLength(2)
  expect(await f.notices.take()).toMatchObject({ status: 'submitting', kind: 'attention' })
})
it('does not submit again when the OS call succeeds but saving its receipt fails', async () => {
  const f = await fixture('all_results')
  await f.change(await f.claim(), { status: 'completed' })
  let submissions = 0
  const consumer = new AutomationNotificationConsumer({ take: () => f.notices.take(), settle: async () => { throw new Error('receipt disconnected') }, submit: () => { submissions++ }, error: () => {} })
  await expect(consumer.flush()).rejects.toThrow('receipt disconnected')
  await consumer.flush()
  expect(submissions).toBe(1)
  expect((await f.list())[0].status).toBe('submitting')
  await f.repository.recover()
  expect((await f.list())[0].status).toBe('unknown')
})
it('records synchronous OS failure separately from business outcome and handles a later rejection', async () => {
  const f = await fixture('all_results')
  await f.change(await f.claim(), { status: 'completed', deliveryStatus: 'delivered' })
  let reject: ((error: string) => void) | undefined
  let throwNow = true
  const receipts: AutomationNoticeReceipt[] = []
  const consumer = new AutomationNotificationConsumer({ take: () => f.notices.take(), settle: async receipt => { receipts.push(receipt); await f.notices.settle(receipt) }, submit: (_notice, failed) => { if (throwNow) throw new Error('unsupported'); reject = failed }, error: error => { throw error } })
  await Promise.all([consumer.flush(), consumer.flush()])
  expect((await f.list())[0]).toMatchObject({ status: 'failed', error: 'unsupported' })
  throwNow = false
  await f.change(await f.claim('second'), { status: 'completed', deliveryStatus: 'delivered' })
  await consumer.flush(); reject!('rejected later')
  await f.store.load('automationNotices') // Queue behind the asynchronous late receipt transaction.
  expect((await f.list()).map(n => n.status)).toEqual(['failed', 'failed'])
  expect((await f.repository.view()).occurrences.every(o => o.deliveryStatus === 'delivered')).toBe(true)
  expect(receipts.some(r => r.status === 'submitted')).toBe(true)
})

it('treats a budget stop as attention and records an unconfirmed receipt without retrying OS submission', async () => {
  const f = await fixture()
  await f.change(await f.claim(), { status: 'cancelled', cancellationCause: 'budget', deliveryStatus: 'unknown' })
  expect((await f.list())[0].kind).toBe('attention')
  let submissions = 0
  const consumer = new AutomationNotificationConsumer({ take: () => f.notices.take(), settle: async receipt => { if (receipt.status === 'submitted') throw new Error('lost acknowledgement'); await f.notices.settle(receipt) }, submit: () => { submissions++ }, error: () => {} })
  await expect(consumer.flush()).rejects.toThrow('lost acknowledgement')
  expect((await f.list())[0].status).toBe('unknown')
  await consumer.flush()
  expect(submissions).toBe(1)
})
