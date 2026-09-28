/*
 * [INPUT]: 隔离 SQLite 工作图、并发结果提交与根预算。
 * [OUTPUT]: 父子/依赖分离、通知去重、循环/失败隔离、停止范围及版本迁移验证。
 * [POS]: tests/work-dependencies.test.ts，使用真实持久事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import type { WorkItem, WorkWake } from '../src/shared/domain'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-dependencies-')), store = new ProductStore(join(root, 'db.sqlite'))
  await store.init(); const works = new WorkRepository(store); await works.init()
  disposers.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  const parent = await works.claim({ conversationId: 'group', sourceMessageId: 'request', runId: 'parent-run', agentId: 'lead', intent: { key: 'main', scope: '检查数据后汇总', deliverable: '计算报告' } })
  return { root, store, works, parent }
}
const childInput = { key: 'check', ownerAgentId: 'analyst', scope: '检查输入数据', deliverable: '检查结果' }
async function claimWake(works: WorkRepository, work: WorkItem, runId: string) {
  const latest = (await works.view('group')).workItems.find(item => item.id === work.id)!
  const wakeId = latest.wakeId!
  await works.scheduleWake(wakeId, `turn-${runId}`, [])
  return works.claim({ conversationId: 'group', sourceMessageId: 'request', runId, agentId: latest.ownerAgentId, wakeId, intent: { key: latest.key, scope: latest.scope, deliverable: latest.deliverable, workId: latest.id, expectedVersion: latest.version } })
}
const deliver = (works: WorkRepository, runId: string) => works.settle(runId, { disposition: 'delivered', summary: '检查已完成', evidence: [{ kind: 'answer', reference: '42' }] }, { messageId: `${runId}-result`, content: '结果为 42', artifactIds: [] })
const wait = (works: WorkRepository, runId: string, child: WorkItem) => works.waitFor(runId, { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '根据检查结果完成汇总' })
const finishWaiting = (works: WorkRepository, runId: string) => works.settle(runId, { disposition: 'waiting', summary: '等待检查结果' }, { messageId: `${runId}-waiting`, content: '检查完成后汇总', artifactIds: [] })

it('does not turn decomposition into a dependency or complete a parent when a child delivers', async () => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  expect(child).toMatchObject({ parentWorkId: parent.id, rootWorkId: parent.id, budgetId: parent.budgetId, dependsOnWorkIds: [], status: 'ready' })
  expect(await works.delegate('parent-run', childInput)).toEqual(child)
  await claimWake(works, child, 'child-run'); await deliver(works, 'child-run')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('running')
  expect((await works.view('group')).workBudgets[0]).toMatchObject({ workItems: 2, runs: 2, modelCalls: 2 })
  await expect(works.delegate('parent-run', { ...childInput, deliverable: '另一目标' })).rejects.toThrow('标识')
})

it('releases execution while waiting and admits exactly one continuation for each wait revision', async () => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await wait(works, 'parent-run', child); const waiting = await finishWaiting(works, 'parent-run')
  expect(waiting).toMatchObject({ status: 'waiting', waitRevision: 1, ownerAgentId: 'lead', nextStep: '根据检查结果完成汇总' })
  expect(waiting.activeRunId).toBeUndefined()
  await claimWake(works, child, 'child-run'); await deliver(works, 'child-run')
  await expect(deliver(works, 'child-run')).rejects.toThrow('执行权')
  const notifications = (await works.view('group')).workWakes.filter(wake => wake.workId === parent.id)
  expect(notifications).toHaveLength(1); expect(notifications[0]).toMatchObject({ ownerAgentId: 'lead', sourceAgentId: 'analyst', sourceRunId: 'child-run', kind: 'ready' })
  const admitted = await Promise.all([works.scheduleWake(notifications[0].id, 'one', []), works.scheduleWake(notifications[0].id, 'two', [])])
  expect(admitted.filter(Boolean)).toHaveLength(1)
  await claimWake(works, parent, 'continued')
  await wait(works, 'continued', child); await finishWaiting(works, 'continued')
  const next = (await works.view('group')).workWakes.filter(wake => wake.workId === parent.id)
  expect(next).toHaveLength(2); expect(next.map(wake => wake.waitRevision)).toEqual([1, 2])
  await claimWake(works, parent, 'continued-again')
  expect((await works.view('group')).workBudgets[0].runs).toBe(4)
})

it.each(['failed', 'cancelled'] as const)('records a targeted block when a dependency is %s, never treating it as success', async status => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run')
  await claimWake(works, child, 'child-run'); await works.release('child-run', status)
  const view = await works.view('group'), blocked = view.workItems.find(item => item.id === parent.id)!
  expect(blocked.status).toBe('blocked'); expect(blocked.outcome?.disposition).toBe('blocked')
  const wake = view.workWakes.find(wake => wake.workId === parent.id)!
  expect(wake).toMatchObject({ kind: 'blocked', status: 'pending', ownerAgentId: 'lead' })
  expect(await works.scheduleWake(wake.id, 'must-not-run', [])).toBe(false)
})

it('rejects cross-conversation dependencies and a cycle created by concurrent wait registrations', async () => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await claimWake(works, child, 'child-run')
  const attempts = await Promise.allSettled([wait(works, 'parent-run', child), wait(works, 'child-run', parent)])
  expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
  const foreign = await works.claim({ conversationId: 'private', sourceMessageId: 'private-user', runId: 'foreign', agentId: 'lead', intent: { key: 'main', scope: 'private', deliverable: 'private' } })
  await expect(wait(works, 'parent-run', foreign)).rejects.toThrow('会话')
  await expect(wait(works, 'parent-run', parent)).rejects.toThrow('循环')
})

it('does not wake for an insufficient result version and bounds dependency waiting by the original deadline', async () => {
  const { works, store, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await works.waitFor('parent-run', { dependencies: [{ workId: child.id, resultVersion: 2 }], nextStep: '等第二版' }); await finishWaiting(works, 'parent-run')
  await claimWake(works, child, 'child-run'); await deliver(works, 'child-run')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('waiting')
  const budget = (await works.view('group')).workBudgets[0]
  await store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, deadlineAt: new Date(0).toISOString() } }])
  await works.expire('group')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)).toMatchObject({ status: 'blocked', outcome: { summary: '等待已超过原始工作的时间上限' } })
})

it('atomically rolls back the result and wake when final publication fails', async () => {
  const { works, store, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run'); await claimWake(works, child, 'child-run')
  await expect(works.settle('child-run', { disposition: 'delivered', summary: '完成', evidence: [{ kind: 'answer', reference: '42' }] }, { messageId: 'bad-result', content: '42', artifactIds: [] }, [{ collection: 'messages', id: 'bad-result', value: BigInt(1) }])).rejects.toThrow()
  const view = await works.view('group')
  expect(view.workWakes.filter(wake => wake.workId === parent.id)).toEqual([])
  expect(view.workItems.find(item => item.id === child.id)?.status).toBe('running')
  expect(await store.load('messages')).toEqual([])
})

it('stops descendants and queued continuations without cancelling a dependency shared by another root', async () => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  const shared = await works.claim({ conversationId: 'group', sourceMessageId: 'other-request', runId: 'shared-run', agentId: 'other', intent: { key: 'shared', scope: '共享检查', deliverable: '共享数据' } })
  await wait(works, 'parent-run', shared); await finishWaiting(works, 'parent-run')
  expect(await works.cancelTree(parent.id, '用户停止')).toEqual(expect.arrayContaining([parent.id, child.id]))
  const view = await works.view('group')
  expect(view.workItems.find(item => item.id === shared.id)?.status).toBe('running')
  expect(view.workItems.find(item => item.id === child.id)?.status).toBe('cancelled')
  expect(view.workWakes.find(wake => wake.workId === child.id)?.status).toBe('cancelled')
  await deliver(works, 'shared-run')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('cancelled')
})

it('cannot evade shared limits by creating new children or repeatedly waiting for an unchanged result', async () => {
  const { works, store, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  const budget = (await works.view('group')).workBudgets[0]
  await store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, maxWorkItems: 2, maxNoProgress: 2 } }])
  await expect(works.delegate('parent-run', { ...childInput, key: 'another' })).rejects.toThrow('上限')
  await claimWake(works, child, 'child-run'); await deliver(works, 'child-run')
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run')
  await claimWake(works, parent, 'repeat-1'); await wait(works, 'repeat-1', child); await finishWaiting(works, 'repeat-1')
  await claimWake(works, parent, 'repeat-2'); await wait(works, 'repeat-2', child); await finishWaiting(works, 'repeat-2')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('blocked')
  expect((await works.view('group')).workBudgets[0]).toMatchObject({ noProgress: 2, workItems: 2, runs: 4 })
})

it('ends queued continuations when the root run budget is exhausted and propagates the block', async () => {
  const { works, store, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run')
  const budget = (await works.view('group')).workBudgets[0]
  await store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, maxRuns: 1 } }])
  expect(await works.scheduleWake(child.wakeId!, 'must-not-loop', [])).toBe(false)
  const view = await works.view('group')
  expect(view.workItems.find(item => item.id === child.id)?.status).toBe('blocked')
  expect(view.workItems.find(item => item.id === parent.id)?.status).toBe('blocked')
  expect(view.workWakes.find(wake => wake.id === child.wakeId)?.status).toBe('cancelled')
  expect(await works.scheduleWake(child.wakeId!, 'duplicate', [])).toBe(false)
})

it('counts report refreshes and retries separately across new runs without resetting either allowance', async () => {
  const { works, parent } = await fixture()
  for (let i = 0; i < 4; i++) await works.reserveReport('parent-run')
  await expect(works.reserveReport('parent-run')).rejects.toThrow('重新汇报上限')
  await works.release('parent-run', 'failed')
  for (let i = 0; i < 3; i++) {
    await works.authorizeRetry(parent.id, 'lead')
    await works.claim({ conversationId: 'group', sourceMessageId: 'request', agentId: 'lead', runId: `retry-${i}`, intent: { key: 'main', scope: parent.scope, deliverable: parent.deliverable } })
    await expect(works.reserveReport(`retry-${i}`)).rejects.toThrow('重新汇报上限')
    await works.release(`retry-${i}`, 'failed')
  }
  await expect(works.authorizeRetry(parent.id, 'lead')).rejects.toThrow('重试上限')
  expect((await works.view('group')).workBudgets[0]).toMatchObject({ retries: 3, reportRefreshes: 4, noProgress: 0, runs: 4 })
})

it('requires uncertain effects to be reviewed but permits continuation after confirmed effects', async () => {
  const { works, parent } = await fixture(), child = await works.delegate('parent-run', childInput)
  await works.markEffect('parent-run'); await works.confirmEffect('parent-run')
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run')
  await claimWake(works, child, 'child-run'); await deliver(works, 'child-run')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('ready')
  await claimWake(works, parent, 'continued'); await works.markEffect('continued')
  await wait(works, 'continued', child); await finishWaiting(works, 'continued')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)).toMatchObject({ status: 'blocked', requiresReview: true })
})

it('migrates a v1 database copy and interrupts pending v2 continuations without replay', async () => {
  const { works, store, parent, root } = await fixture(), child = await works.delegate('parent-run', childInput)
  await wait(works, 'parent-run', child); await finishWaiting(works, 'parent-run')
  const legacy = { ...parent, schemaVersion: 1, id: 'old', status: 'delivered', activeRunId: undefined, rootWorkId: undefined, requiredResults: undefined, observedResults: undefined, dependsOnWorkIds: undefined, waitRevision: undefined }
  await store.write([{ collection: 'workItems', id: 'old', value: legacy }, { collection: 'collaborationSchema', id: 'work', value: { id: 'work', version: 1 } }])
  const copy = new ProductStore(join(root, 'copy.sqlite')); await store.backup(copy.filename); await copy.init()
  disposers.unshift(() => copy.close())
  const restored = new WorkRepository(copy); await restored.init()
  const view = await restored.view('group')
  expect(view.workItems.find(item => item.id === 'old')).toMatchObject({ schemaVersion: 2, rootWorkId: 'old', status: 'delivered', requiredResults: [], waitRevision: 0 })
  expect(view.workItems.find(item => item.id === parent.id)?.status).toBe('interrupted')
  expect((await copy.load<WorkWake>('workWakes'))[0].status).toBe('interrupted')
  expect((await works.view('group')).workItems.find(item => item.id === parent.id)?.status).toBe('waiting')
  expect(await restored.scheduleWake(child.wakeId!, 'restart', [])).toBe(false)
})
