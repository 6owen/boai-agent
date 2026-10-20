/*
 * [INPUT]: Actual ProductStore/ApplicationService and controlled AppService runtime.
 * [OUTPUT]: DAG validity, claim/CAS persistence, review/rework limits, scope and cleanup regression.
 * [POS]: Engineering checks; reports are caller claims, not independent task or personality certification.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService, clearApplicationReceipts } from '../src/runtime/modules/application/application-service'
import { planOperations } from '../src/runtime/modules/application/plan-operations'
import type { ApplicationActor } from '../src/shared/domain/application-protocol'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import type { Conversation, Snapshot } from '../src/shared/domain'

const clean: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of clean.splice(0).reverse()) await action() })
const manifest = (maxReviewCycles = 3) => ({ title: '核对计划', goal: '形成有证据的结论', tasks: [
  { id: 'T1', title: '检查', acceptance: ['依据材料'], blocks: [
    { id: 'B1', type: 'implementation', title: '读取', instructions: '只读材料' },
    { id: 'R1', type: 'review', title: '核对', instructions: '核对依据，不代修', deps: ['B1'], maxReviewCycles },
  ] },
  { id: 'T2', title: '汇总', deps: ['T1'], blocks: [{ id: 'B1', type: 'implementation', title: '结论', instructions: '依据已审核报告汇总' }] },
] })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-plan-')), filename = join(root, 'boai.sqlite')
  clean.push(() => rm(root, { recursive: true, force: true }))
  let store = new ProductStore(filename); await store.init(); clean.push(() => store.close())
  await store.write([
    { collection: 'agents', id: 'a', value: { id: 'a', workspaceRef: 'employee-a' } },
    { collection: 'agents', id: 'b', value: { id: 'b', workspaceRef: 'employee-b' } },
    ...['room', 'other'].map(id => ({ collection: 'conversations', id, value: { id, agentIds: ['a', 'b'] } })),
    { collection: 'messages', id: 'message', value: { id: 'message' } },
  ])
  let service = new ApplicationService(store, planOperations(store), async () => {})
  let serial = 0
  const call = (operation: string, input: any = {}, requestId = `request-${++serial}`, actor: ApplicationActor = { kind: 'owner' }) => service.call({ operation: `plans.${operation}`, input, requestId }, actor)
  const ok = async (operation: string, input: any = {}, requestId?: string, actor?: ApplicationActor) => { const result = await call(operation, input, requestId, actor); expect(result.status, JSON.stringify(result)).toBe('succeeded'); return result.data as any }
  const create = (value = manifest(), actor?: ApplicationActor) => ok('set', { agentId: 'a', conversationId: 'room', manifest: value }, undefined, actor)
  return { get store() { return store }, get service() { return service }, call, ok, create, restart: async () => { await store.close(); store = new ProductStore(filename); await store.init(); service = new ApplicationService(store, planOperations(store), async () => {}) } }
}
const target = (plan: any) => ({ id: plan.id, expectedRevision: plan.revision })
const claimed = (packet: any) => ({ ...target(packet), claimToken: packet.token, ref: packet.ref })

it.each(['duplicate-task', 'task-cycle', 'block-cycle', 'unknown-task', 'unknown-block', 'review-without-deps', 'review-of-review', 'no-implementation', 'prototype-id', 'zero-cycles'])('rejects invalid graph before any write: %s', async kind => {
  const value: any = manifest()
  if (kind === 'duplicate-task') value.tasks.push(value.tasks[0])
  if (kind === 'task-cycle') value.tasks[0].deps = ['T2']
  if (kind === 'block-cycle') value.tasks[0].blocks[0].deps = ['R1']
  if (kind === 'unknown-task') value.tasks[1].deps = ['missing']
  if (kind === 'unknown-block') value.tasks[0].blocks[0].deps = ['missing']
  if (kind === 'review-without-deps') delete value.tasks[0].blocks[1].deps
  if (kind === 'review-of-review') value.tasks[0].blocks.push({ ...value.tasks[0].blocks[1], id: 'R2', deps: ['R1'] })
  if (kind === 'no-implementation') value.tasks[0].blocks.shift()
  if (kind === 'prototype-id') value.tasks[0].id = '__proto__'
  if (kind === 'zero-cycles') value.tasks[0].blocks[1].maxReviewCycles = 0
  const f = await fixture()
  expect((await f.call('set', { agentId: 'a', conversationId: 'room', manifest: value })).error?.code).toBe('INVALID_INPUT')
  expect(await f.store.load('agentPlans')).toEqual([])
  expect(await f.store.load('applicationOperations')).toEqual([])
})

it('persists idempotent claims over restart, gates downstream tasks and prioritizes rework with reports', async () => {
  const f = await fixture(), plan = await f.create()
  expect(plan.tasks[1].blocks[0].status).toBe('pending')
  const first = await f.ok('claim', target(plan), 'claim-first')
  expect(first).toMatchObject({ kind: 'block', ref: 'T1:B1', task: { acceptance: ['依据材料'] }, nextOperation: 'plans.submit' })
  await f.restart()
  expect(await f.ok('claim', target(plan), 'claim-first')).toEqual(first)
  expect(await f.ok('claim', target(first))).toMatchObject({ token: first.token, revision: first.revision, alreadyClaimed: true })
  const submitted = await f.ok('submit', { ...claimed(first), report: '读取原材料，缺少日期。' })
  const review = await f.ok('claim', target(submitted))
  expect(review).toMatchObject({ ref: 'T1:R1', nextOperation: 'plans.review', upstreamReports: [{ ref: 'T1:B1', text: '读取原材料，缺少日期。', truncated: false }] })
  const rejected = await f.ok('review', { ...claimed(review), verdict: 'needs_changes', notes: '补充原材料日期。' })
  expect(rejected.tasks[1].blocks[0].status).toBe('pending')
  const feedback = await f.ok('claim', target(rejected))
  expect(feedback).toMatchObject({ kind: 'feedback', id: plan.id, itemId: 'FB-1', ref: 'T1:R1', nextOperation: 'plans.resolve', instructions: '补充原材料日期。' })
  // Claim packet's work-item ID must not replace the plan identity used by protocol calls.
  const resolved = await f.ok('resolve', { id: plan.id, expectedRevision: feedback.revision, claimToken: feedback.token, report: '回读原材料：日期为2026-10-20。' })
  const again = await f.ok('claim', target(resolved))
  expect(again).toMatchObject({ ref: 'T1:R1', reviewAttempt: 2, reworkReports: [{ feedbackId: 'FB-1', text: '回读原材料：日期为2026-10-20。', truncated: false }] })
  const passed = await f.ok('review', { ...claimed(again), verdict: 'passed', notes: '原材料日期已核对。' })
  const summary = await f.ok('claim', target(passed))
  expect(summary).toMatchObject({ ref: 'T2:B1', upstreamReports: expect.arrayContaining([expect.objectContaining({ ref: 'T1:R1', outcome: 'passed' })]) })
  const done = await f.ok('submit', { ...claimed(summary), report: '完成结论。' })
  expect(done).toMatchObject({ status: 'completed', progress: { done: 3, total: 3 }, unapprovedReviews: [] })
  expect(await f.ok('show', { id: plan.id, ref: 'T1:R1' })).toMatchObject({ cycles: 1, reviews: [{ verdict: 'needs_changes' }, { verdict: 'passed' }], feedback: [{ status: 'resolved', report: '回读原材料：日期为2026-10-20。' }] })
  for (const collection of ['runs', 'workItems', 'automations']) expect(await f.store.load(collection)).toEqual([])
})

it('keeps cycle-limit rejection distinct from approval even after all blocks finish', async () => {
  const f = await fixture(), plan = await f.create(manifest(1))
  const work = await f.ok('claim', target(plan)), submitted = await f.ok('submit', { ...claimed(work), report: '初稿' })
  const review = await f.ok('claim', target(submitted)), rejected = await f.ok('review', { ...claimed(review), verdict: 'needs_changes', notes: '没有原文证据。' })
  expect(rejected).toMatchObject({ unapprovedReviews: ['T1:R1'], openFeedback: [] })
  const next = await f.ok('claim', target(rejected)), done = await f.ok('submit', { ...claimed(next), report: '保留审核未通过的结论。' })
  expect(done.status).toBe('completed_with_unapproved_reviews')
  expect(await f.ok('claim', target(done))).toMatchObject({ kind: 'none', reason: expect.stringContaining('不代表审核通过') })
})

it('serializes concurrent claims and rejects wrong/stale/unclaimed submissions without unknown outcomes', async () => {
  const f = await fixture(), plan = await f.create()
  const before = await f.call('submit', { ...target(plan), ref: 'T1:B1', claimToken: crypto.randomUUID(), report: '不能跳过领取' })
  expect(before).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  const results = await Promise.all([f.call('claim', target(plan), 'left'), f.call('claim', target(plan), 'right')])
  expect(results.map(item => item.status).sort()).toEqual(['rejected', 'succeeded'])
  const packet: any = results.find(item => item.status === 'succeeded')!.data
  expect(await f.call('submit', { ...claimed(packet), ref: 'T2:B1', report: 'wrong' }, 'wrong')).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  const rejection = await f.service.receipt('wrong')
  expect(await f.call('submit', { ...claimed(packet), ref: 'T2:B1', report: 'wrong' }, 'wrong')).toEqual(rejection)
  expect((await f.ok('get', { id: plan.id })).revision).toBe(packet.revision)
  expect(await f.call('review', { ...claimed(packet), verdict: 'passed', notes: 'wrong type' })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
})

it('blocks/releases claims, unblocks with new token, and reset invalidates tokens and old report receipts', async () => {
  const f = await fixture(), plan = await f.create(), first = await f.ok('claim', target(plan))
  const blocked = await f.ok('block', { ...target(first), ref: first.ref, reason: '缺少来源' })
  expect(await f.ok('claim', target(blocked))).toMatchObject({ kind: 'none' })
  const ready = await f.ok('unblock', { ...target(blocked), ref: first.ref }), second = await f.ok('claim', target(ready))
  expect(second.token).not.toBe(first.token)
  expect((await f.call('submit', { ...claimed(second), claimToken: first.token, report: '过期提交' })).status).toBe('rejected')
  const submitted = await f.ok('submit', { ...claimed(second), report: 'REPORT-SENTINEL' }, 'submit-before-reset')
  const reset = await f.ok('reset', target(submitted))
  expect(reset).toMatchObject({ progress: { done: 0, total: 3 }, current: null })
  expect(reset.epoch).not.toBe(plan.epoch)
  expect(await f.service.receipt('submit-before-reset')).toMatchObject({ status: 'cleared' })
  expect(JSON.stringify(await f.store.load('agentPlans'))).not.toContain('REPORT-SENTINEL')
  expect(JSON.stringify(await f.store.load('applicationOperations'))).not.toContain('REPORT-SENTINEL')
})

it('enforces employee/conversation scope including shared rooms, hidden rooms and independent plans', async () => {
  const f = await fixture(), actor: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'room', messageId: 'message' }
  const plan = await f.ok('set', { manifest: manifest() }, 'self', actor)
  expect(await f.ok('list', {}, undefined, actor)).toHaveLength(1)
  for (const other of [{ ...actor, employeeId: 'b' }, { ...actor, conversationId: 'other' }]) {
    expect((await f.call('get', { id: plan.id }, undefined, other)).error?.code).toBe('NOT_FOUND')
    expect((await f.call('claim', target(plan), undefined, other)).error?.code).toBe('NOT_FOUND')
  }
  expect((await f.call('set', { manifest: manifest(), agentId: 'b' }, undefined, actor)).error?.code).toBe('NOT_FOUND')
  expect((await f.call('set', { manifest: manifest(), agentId: 'b', conversationId: 'room' })).status).toBe('succeeded')
  expect((await f.call('set', { manifest: manifest(), agentId: 'a', conversationId: 'other' })).status).toBe('succeeded')
  await f.store.write([{ collection: 'conversations', id: 'room', value: { id: 'room', agentIds: ['a', 'b'], list: { hidden: true } } }])
  expect((await f.call('get', { id: plan.id })).error?.code).toBe('NOT_FOUND')
})

it('archives without overwriting, deletes reports and clears owner receipts with the source lifecycle', async () => {
  const f = await fixture(), plan = await f.create()
  expect((await f.call('set', { agentId: 'a', conversationId: 'room', manifest: manifest() })).status).toBe('rejected')
  const archived = await f.ok('archive', target(plan))
  expect((await f.call('claim', target(archived))).status).toBe('rejected')
  expect(await f.ok('list', { agentId: 'a', conversationId: 'room' })).toEqual([])
  expect(await f.ok('list', { agentId: 'a', conversationId: 'room', includeArchived: true })).toHaveLength(1)
  const next = await f.create()
  await f.ok('delete', target(archived), 'delete-plan')
  expect((await f.call('get', { id: archived.id })).error?.code).toBe('NOT_FOUND')
  const claimed = await f.ok('claim', target(next), 'current-claim')
  await f.store.transaction(tx => clearApplicationReceipts(tx, { conversationId: 'room' }))
  expect(await f.store.load('agentPlans')).toEqual([])
  expect(await f.service.receipt('current-claim')).toMatchObject({ status: 'cleared' })
  expect((await f.call('claim', target(next), 'current-claim')).status).toBe('cleared')
  expect(claimed.kind).toBe('block')
})

it('publishes schemas and restores a real AppService plan into the next turn then clears it with history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-plan-runtime-')); clean.push(() => rm(root, { recursive: true, force: true }))
  let count = 0, failure: unknown, planId = '', restored = false
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine: { test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => {
    try {
      if (++count === 1) {
        const catalog = await ctx.application!.catalog({ domain: 'plans', includeSchemas: true })
        expect(catalog.operations).toHaveLength(13)
        const result = await ctx.application!.call({ operation: 'plans.set', input: { manifest: manifest() }, requestId: 'create' })
        expect(result.status).toBe('succeeded'); planId = (result.data as any).id
      } else {
        restored = JSON.stringify(ctx).includes('Persisted Plan Weave state')
        expect(await ctx.application!.call({ operation: 'plans.list', input: {} })).toMatchObject({ status: 'succeeded', data: [{ id: planId }] })
      }
      await ctx.onDelta('计划已保存。')
    } catch (error) { failure = error; throw error }
  } }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); clean.push(owned.close)
  await owned.service.handle('executeApplicationOperation', { operation: 'connections.create', input: { name: 'unused', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }, requestId: 'connection' })
  const room = await owned.service.handle('startCoreConversation', { content: '只登记计划', requestId: 'first' }) as Conversation
  const idle = async () => { await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity).toBe('idle'); expect(failure).toBeUndefined() }
  await idle()
  await owned.service.handle('sendMessage', { conversationId: room.id, content: '读取计划', mentionIds: [], requestId: 'second' })
  await idle(); expect(restored).toBe(true)
  await owned.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await owned.service.handle('executeApplicationOperation', { operation: 'plans.list', input: { agentId: 'bobo', conversationId: room.id } })).toMatchObject({ data: [] })
})

it.each(['reset', 'source-clear'] as const)('does not restore report bodies when %s races receipt completion', async action => {
  const f = await fixture(), plan = await f.create(), packet = await f.ok('claim', target(plan))
  const operations = planOperations(f.store).map(operation => operation.name !== 'plans.submit' ? operation : { ...operation, execute: async (...args: Parameters<typeof operation.execute>) => {
    const data: any = await operation.execute(...args)
    if (action === 'reset') await f.ok('reset', target(data))
    else await f.store.transaction(tx => clearApplicationReceipts(tx, { employeeIds: new Set(['a']) }))
    return data
  } })
  const delayed = new ApplicationService(f.store, operations, async () => {})
  expect(await delayed.call({ operation: 'plans.submit', input: { ...claimed(packet), report: 'PRIVATE-REPORT' }, requestId: 'delayed' })).toMatchObject({ status: 'cleared' })
  expect(await delayed.receipt('delayed')).toMatchObject({ status: 'cleared' })
  expect(JSON.stringify(await f.store.load('agentPlans'))).not.toContain('PRIVATE-REPORT')
  expect(JSON.stringify(await f.store.load('applicationOperations'))).not.toContain('PRIVATE-REPORT')
})
