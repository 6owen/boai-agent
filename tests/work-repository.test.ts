/*
 * [INPUT]: 真实 SQLite 产品存储和工作控制协议。
 * [OUTPUT]: 认领竞争、预算、旧运行隔离、事务回滚与副本迁移验证。
 * [POS]: tests/work-repository.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import type { WorkBudget, WorkItem } from '../src/shared/domain'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-work-')); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  const works = new WorkRepository(store); await works.init()
  return { root, store, works }
}
const request = (runId: string, agentId = 'researcher', key = 'main') => ({
  conversationId: 'group', sourceMessageId: 'user-request', agentId, runId,
  intent: { key, scope: '分析用户提供的本地数据', deliverable: '返回计算结果及依据' },
})
const receipt = { messageId: 'answer-1', content: '计算结果为 42。', artifactIds: [] as string[] }

describe('durable work ownership', () => {
  it('admits one executor for a shared source key, independent of employee and purpose text', async () => {
    const { works } = await fixture()
    const second = request('run-b', 'writer'); second.intent.scope = '另一位员工描述的相同共享目标'
    const attempts = await Promise.allSettled([works.claim(request('run-a')), works.claim(second)])
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
    const { workItems, workBudgets } = await works.view('group')
    expect(workItems).toHaveLength(1); expect(workItems[0].activeRunId).toBe('run-a')
    expect(workBudgets[0]).toMatchObject({ runs: 1, modelCalls: 1, usage: {}, usageIncomplete: true })
  })
  it('keeps different explicit keys distinct even when their descriptions are identical', async () => {
    const { works } = await fixture()
    const first = await works.claim(request('run-a', 'researcher', 'collect'))
    const second = await works.claim(request('run-b', 'researcher', 'summarize'))
    expect(first.id).not.toBe(second.id); expect(first.budgetId).toBe(second.budgetId)
    expect((await works.view('group')).workBudgets[0].runs).toBe(2)
  })
  it('makes duplicate acquisition idempotent and keeps the long-term owner after release', async () => {
    const { works } = await fixture()
    const initial = await works.claim(request('run-a'))
    expect(await works.claim(request('run-a'))).toEqual(initial)
    await works.release('run-a', 'failed')
    const work = (await works.view('group')).workItems[0]
    expect(work.ownerAgentId).toBe('researcher'); expect(work.activeRunId).toBeUndefined()
    expect((await works.view('group')).workBudgets[0].runs).toBe(1)
    await expect(works.claim(request('run-b', 'writer'))).rejects.toThrow('负责人')
  })
  it('requires the observed version and conversation scope when referencing an existing work', async () => {
    const { works } = await fixture()
    const work = await works.claim(request('run-a'))
    await works.release('run-a', 'failed'); await works.authorizeRetry(work.id, 'researcher')
    await expect(works.claim({ ...request('run-b'), intent: { ...request('run-b').intent, workId: work.id } })).rejects.toThrow('版本')
    const current = (await works.view('group')).workItems[0]
    await expect(works.claim({ ...request('run-b'), conversationId: 'private-chat', intent: { ...request('run-b').intent, workId: work.id, expectedVersion: current.version } })).rejects.toThrow('会话')
    expect((await works.view('group')).workItems[0].status).toBe('ready')
  })
  it('rejects stale versions and never lets an old finally release or overwrite a successor', async () => {
    const { works } = await fixture()
    const initial = await works.claim(request('run-a'))
    await works.release('run-a', 'failed'); await works.authorizeRetry(initial.id, 'researcher')
    await expect(works.claim({ ...request('run-b'), intent: { ...request('run-b').intent, expectedVersion: initial.version } })).rejects.toThrow('版本')
    const successor = await works.claim(request('run-b'))
    await works.release('run-a', 'cancelled')
    await expect(works.settle('run-a', { disposition: 'no_progress', summary: '迟到结果' }, receipt)).rejects.toThrow('执行权')
    expect((await works.view('group')).workItems[0]).toEqual(successor)
  })
  it('retains calls and reported token usage across retries without inventing unknown usage', async () => {
    const { works } = await fixture()
    const work = await works.claim(request('run-a'))
    await works.reserveCall('run-a'); await works.usage('run-a', { outputTokens: 10 })
    await works.usage('run-a', { outputTokens: 10 }); await works.usage('run-a', { outputTokens: 8 })
    await works.release('run-a', 'failed'); await works.authorizeRetry(work.id, 'researcher')
    await works.claim(request('run-b')); await works.usage('run-b', { inputTokens: 30, outputTokens: 7 })
    expect((await works.view('group')).workBudgets[0]).toMatchObject({ runs: 2, modelCalls: 3, usage: { inputTokens: 30, outputTokens: 17 }, usageIncomplete: true })
    expect((await works.view('group')).workBudgets[0].usage.totalTokens).toBeUndefined()
  })
  it('reserves the remaining budget atomically before concurrent work begins', async () => {
    const { store, works } = await fixture()
    const work = await works.claim(request('seed'))
    const budget = (await works.view('group')).workBudgets[0]
    await store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, maxRuns: 2 } }])
    const results = await Promise.allSettled([works.claim(request('one', 'researcher', 'one')), works.claim(request('two', 'writer', 'two'))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await works.view('group')).workBudgets[0].runs).toBe(2)
    expect((await works.view('group')).workItems).toHaveLength(2)
    expect((await works.view('group')).workItems.some(item => item.id === work.id)).toBe(true)
  })
  it('checks call, token and time budgets without resetting them on a new run', async () => {
    const { store, works } = await fixture()
    await works.claim(request('seed'))
    const budget = (await works.view('group')).workBudgets[0]
    for (const change of [{ maxModelCalls: 1 }, { usage: { outputTokens: budget.maxOutputTokens } }, { deadlineAt: new Date(0).toISOString() }]) {
      await store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, ...change } }])
      await expect(works.claim(request('blocked', 'writer', 'new-key'))).rejects.toThrow('上限')
      await expect(works.reserveCall('seed')).rejects.toThrow('上限')
    }
  })
  it('does not call engine success business delivery and requires checkable result evidence', async () => {
    const { works } = await fixture()
    await works.claim(request('run-a'))
    await expect(works.settle('run-a', { disposition: 'delivered', summary: '准备开始' }, receipt)).rejects.toThrow('证据')
    await expect(works.settle('run-a', { disposition: 'delivered', summary: '完成', evidence: [{ kind: 'artifact', reference: 'invented' }] }, receipt)).rejects.toThrow('产物')
    const work = await works.settle('run-a', { disposition: 'no_progress', summary: '只有意向，没有结果' }, receipt)
    expect(work.status).toBe('blocked'); expect(work.activeRunId).toBeUndefined()
    expect(work.outcome?.disposition).toBe('no_progress')
  })
  it('commits valid evidence with publication records and prevents a duplicate completion', async () => {
    const { store, works } = await fixture()
    await works.claim(request('run-a'))
    const outcome = { disposition: 'delivered' as const, summary: '已计算', evidence: [{ kind: 'answer' as const, reference: '42' }] }
    const work = await works.settle('run-a', outcome, receipt, [{ collection: 'messages', id: receipt.messageId, value: receipt }])
    expect(work.status).toBe('delivered'); expect(work.resultVersion).toBe(1)
    expect(await store.load('messages')).toEqual([receipt])
    await expect(works.settle('run-a', outcome, receipt)).rejects.toThrow('执行权')
    await expect(works.claim(request('run-b'))).rejects.toThrow('重复执行')
  })
  it('rolls back work completion and ownership changes when publication serialization fails', async () => {
    const { works, store } = await fixture()
    const initial = await works.claim(request('run-a'))
    await expect(works.settle('run-a', { disposition: 'no_progress', summary: '未完成' }, receipt, [{ collection: 'messages', id: 'bad', value: { number: BigInt(1) } }])).rejects.toThrow()
    expect((await works.view('group')).workItems[0]).toEqual(initial)
    expect(await store.load('messages')).toEqual([])
  })
  it('refuses retries with effects that need review, without changing ownership or budget', async () => {
    const { works } = await fixture()
    const work = await works.claim(request('run-a'))
    await works.markEffect('run-a'); await works.release('run-a', 'failed')
    await expect(works.authorizeRetry(work.id, 'researcher')).rejects.toThrow('核对')
    expect((await works.view('group')).workBudgets[0].runs).toBe(1)
  })
  it('opens an isolated database copy, interrupts active work and preserves legacy contributions', async () => {
    const { works, store, root } = await fixture()
    const legacy = { id: 'legacy', status: 'completed', resultMessageIds: [] }
    await store.write([{ collection: 'contributions', id: legacy.id, value: legacy }])
    await works.claim(request('run-a')); await works.usage('run-a', { outputTokens: 19 })
    const copy = new ProductStore(join(root, 'backup.sqlite')); await store.backup(copy.filename)
    stores.push(copy); await copy.init(); const restored = new WorkRepository(copy); await restored.init()
    expect(await copy.load('contributions')).toEqual([legacy])
    expect((await restored.view('group')).workItems[0]).toMatchObject({ status: 'interrupted', requiresReview: true })
    expect((await restored.view('group')).workBudgets[0].usage.outputTokens).toBe(19)
    expect((await works.view('group')).workItems[0].status).toBe('running')
    await expect(restored.claim(request('run-b'))).rejects.toThrow('不能重复执行')
    const budget = (await copy.load<WorkBudget>('workBudgets'))[0]
    expect(budget.modelCalls).toBe(1)
    await copy.write([{ collection: 'collaborationSchema', id: 'work', value: { id: 'work', version: 3 } }])
    await expect(restored.init()).rejects.toThrow('版本')
    expect((await copy.load<WorkItem>('workItems'))[0].outcome).toBeUndefined()
  })
})
