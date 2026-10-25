/*
 * [OUTPUT]: 验证默认无执行配额、旧默认精确迁移、显式预算仍执行以及用户取消；不调用真实供应商。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [OUTPUT]: 新消息重试覆盖来源/成员/版本/已消费消息、待核对操作、额度和认领后失败的完整事务回滚。
 * [INPUT]: 真实 SQLite 产品存储和工作控制协议。
 * [OUTPUT]: 认领竞争、预算、旧运行隔离、事务回滚与副本迁移验证。
 * [POS]: tests/work-repository.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { WorkRepository } from '../packages/runtime/src/modules/collaboration/work-repository'
import type { WorkBudget, WorkItem } from '../packages/shared/src/domain'

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
  it.each(['legacy', 'v1', 'custom', 'organization', 'organization48', 'renewed'] as const)('migrates only legacy default execution allowances without resetting used counters (%s)', async mode => {
    const { works, store } = await fixture()
    await works.claim(request('legacy-run'))
    await works.release('legacy-run', 'failed')
    const current = (await works.view('group')).workBudgets[0]
    const { executionAllowanceVersion: _, ...original } = current
    const saved = { ...original, maxModelCalls: mode === 'custom' ? 30 : mode === 'v1' ? 256 : mode === 'organization48' ? 48 : 24,
      maxOutputTokens: mode === 'v1' ? 128000 : 16000, maxRuns: 8, maxWorkItems: 8, maxRetries: 3, maxReportRefreshes: 4, maxNoProgress: 3,
      deadlineAt: new Date(Date.now() + 300000).toISOString(), modelCalls: 12, usage: { outputTokens: 4000 },
      ...(mode === 'v1' ? { executionAllowanceVersion: 1 as const } : {}),
      ...(mode.startsWith('organization') ? { collaborationRequestId: 'organization-request' } : {}),
      ...(mode === 'renewed' ? { renewals: [{ id: 'explicit-renewal' }] as WorkBudget['renewals'] } : {}) }
    await store.write([{ collection: 'workBudgets', id: saved.id, value: saved }])
    const restarted = new WorkRepository(store); await restarted.init()
    const expected = ['custom', 'renewed'].includes(mode) ? saved : { ...saved, executionAllowanceVersion: 2, maxModelCalls: null, maxOutputTokens: null,
      maxRuns: null, maxWorkItems: null, maxRetries: null, maxReportRefreshes: null, maxNoProgress: null, deadlineAt: '' }
    expect((await restarted.view('group')).workBudgets[0]).toEqual(expected)
    await restarted.init()
    expect((await restarted.view('group')).workBudgets[0]).toEqual(expected)
  })
  it('continues confirmed progress after a connection repair without resetting usage or repeating ownership', async () => {
    const { works, store } = await fixture()
    const original = await works.claim(request('run-a'))
    await works.markEffect('run-a'); await works.confirmEffect('run-a')
    await works.release('run-a', 'failed')
    const before = (await works.view('group')).workBudgets[0]
    await store.write([{ collection: 'workBudgets', id: before.id, value: { ...before, deadlineAt: new Date(0).toISOString() } }])
    await works.authorizeRetry(original.id, 'researcher', [], true)
    const after = await works.view('group')
    expect(after.workItems).toHaveLength(1)
    expect(after.workItems[0]).toMatchObject({ id: original.id, sourceMessageId: original.sourceMessageId, status: 'ready', requiresReview: false })
    expect(after.workBudgets[0]).toMatchObject({ id: before.id, modelCalls: before.modelCalls, runs: before.runs, usage: before.usage, retries: before.retries + 1 })
    expect(Date.parse(after.workBudgets[0].deadlineAt)).toBeGreaterThan(Date.now())
    await expect(works.authorizeRetry(original.id, 'researcher', [], true)).rejects.toThrow('不能重试')
  })
  it.each([
    ['pending-effect', /已有工具操作需要核对/],
    ['unknown-effects', /已有工具操作需要核对/],
    ['confirmed-effects-rollback', /该运行已释放执行权/],
    ['exhausted-calls', /调用、用量或时间上限/],
    ['stale-version', /工作版本已变化/],
    ['peer-message', /新的用户消息/],
    ['channel-message', /新的用户消息/],
    ['old-source', /新的用户消息/],
    ['removed-member', /新的用户消息/],
    ['consumed-message', /这条接续消息已执行/],
    ['released-execution', /该运行已释放执行权/],
  ] as const)('rejects %s message retries atomically without resetting work or budget', async (reason, error) => {
    const { works, store } = await fixture()
    const first = await works.claim(request('run-a'))
    if (['pending-effect', 'unknown-effects', 'confirmed-effects-rollback'].includes(reason)) await works.markEffect('run-a')
    if (reason === 'confirmed-effects-rollback') await works.confirmEffect('run-a')
    await works.release('run-a', 'failed')
    const sourceMessageId = reason === 'old-source' ? 'user-request' : 'continue-request'
    await store.write([
      { collection: 'messages', id: 'user-request', value: { id: 'user-request', conversationId: 'group', sequence: 1, senderId: 'user', senderType: 'user', status: 'completed' } },
      { collection: 'messages', id: sourceMessageId, value: { id: sourceMessageId, conversationId: 'group', sequence: 2, senderId: reason === 'peer-message' ? 'writer' : 'user', senderType: reason === 'peer-message' ? 'agent' : 'user', status: 'completed', ...(reason === 'channel-message' ? { channel: { id: 'external' } } : {}) } },
      { collection: 'runs', id: 'run-b', value: { id: 'run-b', conversationId: 'group', agentId: 'researcher', phase: 'execution', status: 'running', triggerMessageId: sourceMessageId, turnId: 'continue-turn' } },
      { collection: 'turns', id: 'continue-turn', value: { id: 'continue-turn', triggerMessageId: sourceMessageId } },
      { collection: 'conversations', id: 'group', value: { id: 'group', agentIds: reason === 'removed-member' ? [] : ['researcher'] } },
      { collection: 'agents', id: 'researcher', value: { id: 'researcher', active: true } },
    ])
    if (reason === 'exhausted-calls') {
      const budget = (await works.view('group')).workBudgets[0]
      budget.maxModelCalls = 2; budget.modelCalls = 2
      await store.write([{ collection: 'workBudgets', id: budget.id, value: budget }])
    }
    if (reason === 'consumed-message') await store.write([{ collection: 'runs', id: 'earlier-continue', value: { id: 'earlier-continue', workId: first.id, triggerMessageId: sourceMessageId } }])
    if (reason === 'unknown-effects') await store.transaction(async tx => {
      const execution = (await tx.get<import('../packages/shared/src/domain').WorkExecution>('workExecutions', 'run-a'))!
      delete execution.pendingEffects
      await tx.put({ collection: 'workExecutions', id: execution.id, value: execution })
    })
    if (reason === 'released-execution' || reason === 'confirmed-effects-rollback') await store.write([{ collection: 'workExecutions', id: 'run-b', value: { id: 'run-b', workId: first.id, status: 'released', pendingEffects: 0 } }])
    const before = await works.view('group'), work = before.workItems[0]
    await expect(works.claim({ ...request('run-b'), sourceMessageId, retryFromUserMessage: true, intent: { ...request('run-b').intent, workId: work.id, expectedVersion: reason === 'stale-version' ? work.version - 1 : work.version } })).rejects.toThrow(error)
    expect(await works.view('group')).toEqual(before)
  })

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
    for (const change of [{ maxModelCalls: 1 }, { maxOutputTokens: 100, usage: { outputTokens: 100 } }, { deadlineAt: new Date(0).toISOString() }]) {
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
    await expect(works.authorizeRetry(work.id, 'researcher', [], true)).rejects.toThrow('核对')
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
