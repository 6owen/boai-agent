/*
 * [OUTPUT]: 新交互工作承接已知但不完整的本机判断用量，unknownCalls及完整性随原请求保持。
 * [OUTPUT]: 普通群支持API/本机Codex独立工作与分工等待；原消息共享预算逐请求保留计量，bobo组织群及本机自动化沿原授权与预算接入。
 * [INPUT]: 真实SQLite连接、本机判断回执及原Work公开交付。
 * [OUTPUT]: 原期限/唯一请求竞争、kind/profile隔离、本轮真实交付维护与旧waiting回执拒绝、不完整用量保持未知、旧账本及清理后迟到零复活。
 * [POS]: 本机预算事务验收，实际供应商与Electron另行留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, BudgetModelCall, Conversation, DigitalAgent, Message, WorkBudget, WorkItem } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { WORK_DURATION_MS } from '../src/runtime/modules/collaboration/work-budget'
import { aggregateActivity } from '../src/runtime/modules/profile/profile-activity'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const known = { inputTokens: 5, outputTokens: 7, totalTokens: 12 }
const intent = { key: 'main', scope: 'Read authorized sources', deliverable: 'An answer' }
async function fixture(native = true, mixed = false, decisionComplete?: boolean) {
  const directory = await mkdtemp(join(tmpdir(), 'boai-native-budget-')); cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const connect = async () => { const store = new ProductStore(join(directory, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close()); return store }
  const store = await connect(), works = new WorkRepository(store)
  await works.init()
  const createdAt = new Date(Date.now() - 1200).toISOString()
  const message: Message = { id: 'source', conversationId: 'chat', turnId: 'turn', senderType: 'user', senderId: 'user', senderName: 'User', content: 'Do the work', sequence: 1, status: 'completed', createdAt }
  const decision: AgentRun = { id: 'decision', conversationId: 'chat', turnId: 'turn', triggerMessageId: message.id, messageId: '', agentId: 'employee', agentName: 'Employee', phase: 'decision', status: 'completed', createdAt, toolEvents: [], ...(native ? { backend: { kind: 'codex-local' as const, profileId: 'profile', profileRevision: 1, externalInvocations: 1, sessionPolicy: 'fresh' as const, toolControl: 'none' as const } } : {}) }
  const backend = (native: boolean) => native ? { kind: 'codex-local' as const, profileId: 'profile' } : { kind: 'mastra-model' as const }
  await store.write([
    row('agents', { id: 'employee', active: true, executionBackend: backend(native) } as DigitalAgent),
    ...(mixed ? [row('agents', { id: 'other', active: true, executionBackend: backend(!native) } as DigitalAgent)] : []),
    row('conversations', { id: 'chat', kind: mixed ? 'group' : 'direct', agentIds: mixed ? ['employee', 'other'] : ['employee'] } as Conversation), row('messages', message), row('runs', decision),
    row('profileModelCalls', { id: 'decision-call', runId: decision.id, conversationId: 'chat', phase: 'decision', startedAt: createdAt, budgetOwned: false, ...(native ? { callUnit: 'external-turn', ...(decisionComplete !== undefined ? { usageComplete: decisionComplete } : {}) } : {}), usage: known }),
  ])
  const claim = { conversationId: 'chat', sourceMessageId: message.id, agentId: 'employee', runId: 'task', intent, priorDecision: { runId: decision.id, callIds: ['decision-call'] } }
  const work = await works.claim(claim)
  const task: AgentRun = { ...decision, id: 'task', phase: 'execution', status: 'running', workId: work.id, messageId: 'answer' }
  await store.write([row('runs', task)])
  const budget = async () => (await store.load<WorkBudget>('workBudgets'))[0]!
  const publish = async () => {
    await works.reserveInteractiveCall(task, 'task-call', 'execution'); await works.settleInteractiveCall(task.id, 'task-call', known, true)
    const answer: Message = { ...message, id: 'answer', senderType: 'agent', senderId: 'employee', senderName: 'Employee', runId: task.id, content: 'Verified answer' }
    await works.settle(task.id, { disposition: 'delivered', summary: 'Done', evidence: [{ kind: 'answer', reference: answer.content }] }, { messageId: answer.id, content: answer.content, artifactIds: [] }, [row('messages', answer), row('runs', { ...task, status: 'completed', disposition: 'delivered' })])
    const memory: AgentRun = { ...task, id: 'memory', phase: 'memory', messageId: '' }
    await store.write([row('runs', memory)])
    return memory
  }
  return { store, works, connect, work, task, decision, claim, budget, publish }
}

it('adopts known native decision usage without turning a partial receipt into complete budget accounting', async () => {
  const f = await fixture(true, false, false)
  expect(await f.budget()).toMatchObject({ usage: known, unknownCalls: 1, usageIncomplete: true })
  expect((await f.store.load<BudgetModelCall>('budgetModelCalls'))[0]).toMatchObject({ usage: known, usageComplete: false })
})

it('adopts the actual decision once, counts time from that decision, and atomically reserves the remaining allowance', async () => {
  const f = await fixture(), before = await f.budget()
  expect(before).toMatchObject({ sourceMessageId: 'source', callUnit: 'external-turn', accounting: 'model-calls-v1', modelCalls: 1, usage: known, unknownCalls: 0 })
  expect(Date.parse(before.deadlineAt)).toBe(Date.parse(f.decision.createdAt) + WORK_DURATION_MS)
  await f.store.write([row('workBudgets', { ...before, maxModelCalls: 3 })])
  const other = new WorkRepository(await f.connect())
  const results = await Promise.allSettled([f.works.reserveInteractiveCall(f.task, 'a', 'execution'), other.reserveInteractiveCall(f.task, 'b', 'execution'), f.works.reserveInteractiveCall(f.task, 'c', 'execution')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2)
  const calls = (await f.store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.phase === 'execution')
  await other.reserveInteractiveCall(f.task, calls[0].id, 'execution')
  expect(await f.budget()).toMatchObject({ modelCalls: 3, unknownCalls: 2, deadlineAt: before.deadlineAt })
})

it.each(['runtime', 'profile'] as const)('rejects a mismatched native %s in an invocation or changed employee binding without charging the original budget', async mismatch => {
  const f = await fixture(), before = await f.budget()
  const backend = { ...f.task.backend!, ...(mismatch === 'runtime' ? { kind: 'claude-local' as const } : { profileId: 'other-profile' }) }
  await expect(f.works.reserveInteractiveCall({ ...f.task, backend }, 'foreign-call', 'execution')).rejects.toThrow('原交互工作')
  expect(await f.budget()).toEqual(before)
  const agent = (await f.store.load<DigitalAgent>('agents'))[0]
  await f.store.write([row('agents', { ...agent, executionBackend: { kind: backend.kind, profileId: backend.profileId } })])
  await expect(f.works.reserveInteractiveCall(f.task, 'changed-binding-call', 'execution')).rejects.toThrow('原交互工作')
  expect(await f.budget()).toEqual(before)
  expect((await f.store.load<BudgetModelCall>('budgetModelCalls')).map(call => call.id)).toEqual(['decision-call'])
})

async function otherDecision(f: Awaited<ReturnType<typeof fixture>>, native: boolean) {
  const decision: AgentRun = { ...f.decision, id: 'other-decision', agentId: 'other', createdAt: new Date(Date.parse(f.decision.createdAt) - 1000).toISOString(), backend: native ? { kind: 'codex-local', profileId: 'profile', profileRevision: 1, externalInvocations: 1, sessionPolicy: 'fresh', toolControl: 'none' } : undefined }
  await f.store.write([row('runs', decision), row('profileModelCalls', { id: 'other-call', runId: decision.id, conversationId: 'chat', phase: 'decision', startedAt: decision.createdAt, budgetOwned: false, ...(native ? { callUnit: 'external-turn' } : {}), usage: known })])
  return { ...f.claim, agentId: 'other', runId: 'other-task', intent: { ...intent, key: 'independent' }, priorDecision: { runId: decision.id, callIds: ['other-call'] } }
}

it.each([true, false])('shares one original ledger when the first independent root is native=%s, while retaining per-call units and atomic limits', async native => {
  const f = await fixture(native, true), before = await f.budget(), claim = await otherDecision(f, !native)
  const work = await f.works.claim(claim)
  const other: AgentRun = { ...f.task, id: claim.runId, agentId: 'other', workId: work.id, backend: !native ? { ...f.decision.backend!, kind: 'codex-local', profileId: 'profile', profileRevision: 1, externalInvocations: 1, sessionPolicy: 'fresh', toolControl: 'none' } : undefined }
  await f.store.write([row('runs', other)])
  expect(work.budgetId).toBe(f.work.budgetId); expect(work.rootWorkId).toBe(work.id)
  expect(await f.budget()).toMatchObject({ callUnit: 'mixed', modelCalls: 2, runs: 2, unknownCalls: 0, deadlineAt: new Date(Date.parse(before.deadlineAt) - 1000).toISOString() })
  const budget = await f.budget(); await f.store.write([row('workBudgets', { ...budget, maxModelCalls: 4 })])
  const second = new WorkRepository(await f.connect())
  await Promise.all([f.works.reserveInteractiveCall(f.task, 'first-task-call', 'execution'), second.reserveInteractiveCall(other, 'other-task-call', 'execution')])
  await expect(second.reserveInteractiveCall(other, 'excess-call', 'execution')).rejects.toThrow('上限')
  await expect(second.reserveInteractiveCall(other, 'first-task-call', 'execution')).rejects.toThrow('另一请求')
  await f.works.settleInteractiveCall(f.task.id, 'first-task-call', known)
  await second.settleInteractiveCall(other.id, 'other-task-call', known)
  expect(await f.budget()).toMatchObject({ modelCalls: 4, unknownCalls: 1, usageIncomplete: true })
  const calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
  expect(calls.find(call => call.id === 'first-task-call')?.callUnit).toBe(native ? 'external-turn' : undefined)
  expect(calls.find(call => call.id === 'other-task-call')?.callUnit).toBe(native ? undefined : 'external-turn')
  await f.works.settleInteractiveCall(native ? f.task.id : other.id, native ? 'first-task-call' : 'other-task-call', known, true)
  expect(await f.budget()).toMatchObject({ unknownCalls: 0, usageIncomplete: false, usage: { inputTokens: 20, outputTokens: 28, totalTokens: 48 } })
  await f.works.cancelTree(f.work.id, 'Stop only this root')
  expect((await f.store.load<WorkItem>('workItems')).find(item => item.id === work.id)?.status).toBe('running')
})

it.each([true, false])('delegates native=%s parent to the other backend without replacing the root, source or budget and revokes removed members', async native => {
  const f = await fixture(native, true), before = await f.budget()
  const proposal = { key: 'child', scope: 'Check one fact', deliverable: 'A checked fact', ownerAgentId: 'other' }
  const child = await f.works.delegate(f.task.id, proposal)
  expect(await f.works.delegate(f.task.id, proposal)).toEqual(child)
  expect(child).toMatchObject({ parentWorkId: f.work.id, rootWorkId: f.work.id, budgetId: f.work.budgetId, sourceMessageId: 'source' })
  expect(await f.works.scheduleWake(child.wakeId!, 'child-turn', [])).toBe(true)
  const claimed = await f.works.claim({ conversationId: 'chat', sourceMessageId: 'source', agentId: 'other', runId: 'child-task', wakeId: child.wakeId, intent: { ...proposal, workId: child.id, expectedVersion: child.version } })
  const task: AgentRun = { ...f.task, id: 'child-task', workId: claimed.id, agentId: 'other', turnId: 'child-turn', backend: native ? undefined : { kind: 'codex-local', profileId: 'profile', profileRevision: 1, externalInvocations: 0, sessionPolicy: 'fresh', toolControl: 'host-bridge' } }
  await f.store.write([row('runs', task)]); await f.works.reserveInteractiveCall(task, 'child-call', 'execution')
  expect(await f.budget()).toMatchObject({ deadlineAt: before.deadlineAt, runs: 2, modelCalls: 2, workItems: 2 })
  const group = (await f.store.load<Conversation>('conversations'))[0]
  await f.store.write([row('conversations', { ...group, agentIds: ['employee'] })])
  await expect(f.works.reserveInteractiveCall(task, 'revoked-call', 'execution')).rejects.toThrow('原交互工作')
  await expect(f.works.delegate(f.task.id, { ...proposal, key: 'revoked' })).rejects.toThrow('当前有效员工')
  expect(await f.store.load('workBudgets')).toHaveLength(1)
})

it('rejects incomplete API decision adoption and a mismatched backend receipt without partial budget writes', async () => {
  const f = await fixture(true, true), claim = await otherDecision(f, false), before = await f.budget()
  await f.store.write([row('profileModelCalls', { id: 'repair-call', runId: 'other-decision', conversationId: 'chat', phase: 'decision', startedAt: f.decision.createdAt, budgetOwned: false, usage: known })])
  await expect(f.works.claim(claim)).rejects.toThrow('全部实际调用')
  expect(await f.budget()).toEqual(before)
  const calls = await f.store.load<{ id: string }>('profileModelCalls'), call = calls.find(item => item.id === 'repair-call')!
  await f.store.write([row('profileModelCalls', { ...call, callUnit: 'external-turn' })])
  await expect(f.works.claim({ ...claim, priorDecision: { ...claim.priorDecision, callIds: ['other-call', 'repair-call'] } })).rejects.toThrow('匹配计量')
  expect(await f.budget()).toEqual(before)
  await f.store.write([row('profileModelCalls', call)])
  await f.works.claim({ ...claim, priorDecision: { ...claim.priorDecision, callIds: ['other-call', 'repair-call'] } })
  expect(await f.budget()).toMatchObject({ modelCalls: 3, unknownCalls: 0 })
})

it('charges API post-delivery memory in a mixed group to the same ledger without another Work execution', async () => {
  const f = await fixture(false, true), memory = await f.publish(), before = await f.budget(), work = (await f.store.load<WorkItem>('workItems'))[0]
  await f.works.reserveInteractiveCall(memory, 'api-memory', 'memory')
  await f.works.settleInteractiveCall(memory.id, 'api-memory', known)
  expect(await f.budget()).toMatchObject({ modelCalls: 3, runs: 1, deadlineAt: before.deadlineAt, unknownCalls: 0 })
  expect((await f.store.load<WorkItem>('workItems'))[0]).toEqual(work)
  expect(await f.store.load('workExecutions')).toHaveLength(1)
})

it('charges one post-delivery memory request without reacquiring the Work or creating another budget', async () => {
  const f = await fixture(), memory = await f.publish(), before = (await f.store.load<WorkItem>('workItems'))[0], initial = await f.budget()
  await f.works.reserveInteractiveCall(memory, 'memory-call', 'memory')
  await f.works.reserveInteractiveCall(memory, 'memory-call', 'memory')
  await expect(f.works.reserveInteractiveCall(memory, 'another-memory', 'memory')).rejects.toThrow('已有请求')
  await f.works.settleInteractiveCall(memory.id, 'memory-call', known, true)
  expect(await f.budget()).toMatchObject({ id: initial.id, modelCalls: 3, runs: 1, deadlineAt: initial.deadlineAt, usage: { inputTokens: 15, outputTokens: 21, totalTokens: 36 } })
  expect((await f.store.load<WorkItem>('workItems'))[0]).toEqual(before)
  expect(await f.store.load('workExecutions')).toHaveLength(1)
  expect(await f.store.load('workBudgets')).toHaveLength(1)
})

it.each(['calls', 'deadline', 'foreign-turn', 'review', 'waiting-publication'])('refuses %s maintenance without changing delivered facts or making a new reservation', async condition => {
  const f = await fixture(), memory = await f.publish(), budget = await f.budget(), work = (await f.store.load<WorkItem>('workItems'))[0]
  if (condition === 'calls') await f.store.write([row('workBudgets', { ...budget, maxModelCalls: budget.modelCalls })])
  if (condition === 'deadline') await f.store.write([row('workBudgets', { ...budget, deadlineAt: new Date(0).toISOString() })])
  if (condition === 'foreign-turn') { memory.turnId = 'foreign'; await f.store.write([row('runs', memory)]) }
  if (condition === 'review') await f.store.write([row('workItems', { ...work, requiresReview: true })])
  if (condition === 'waiting-publication') await f.store.write([row('runs', { ...f.task, status: 'completed', disposition: 'waiting' })])
  const before = await f.store.load('workItems')
  await expect(f.works.reserveInteractiveCall(memory, 'forbidden-memory', 'memory')).rejects.toThrow()
  expect(await f.store.load('budgetModelCalls')).toHaveLength(2)
  expect(await f.store.load('workItems')).toEqual(before)
})

it('keeps observed usage incomplete until the external terminal receipt, including after stop and later missing fields', async () => {
  const f = await fixture()
  await f.works.reserveInteractiveCall(f.task, 'task-call', 'execution')
  await f.works.settleInteractiveCall(f.task.id, 'task-call', known)
  await f.works.release(f.task.id, 'failed')
  expect(await f.budget()).toMatchObject({ unknownCalls: 1, usageIncomplete: true, usage: { inputTokens: 10, outputTokens: 14, totalTokens: 24 } })
  await f.works.settleInteractiveCall(f.task.id, 'task-call', known, true)
  expect(await f.budget()).toMatchObject({ unknownCalls: 0, usageIncomplete: false })
  await f.works.settleInteractiveCall(f.task.id, 'task-call', { inputTokens: 6 }, true)
  await f.works.settleInteractiveCall(f.task.id, 'task-call', { inputTokens: 6 }, true)
  expect(await f.budget()).toMatchObject({ unknownCalls: 1, usageIncomplete: true, usage: { inputTokens: 11, outputTokens: 14, totalTokens: 24 } })
  const calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
  const activity = aggregateActivity({ calls: [], budgets: calls, messages: [], runs: [f.decision, f.task], works: [], intervals: [], skills: [], resources: [] }, { from: '2026-01-01', to: '2026-12-31', timezone: 'UTC' })
  expect(activity.totalTokens).toBe(12); expect(activity.unknownCalls).toBe(1)
  await f.store.write([], calls.map(call => ({ collection: 'budgetModelCalls', id: call.id })))
  await f.works.settleInteractiveCall(f.task.id, 'task-call', known, true)
  expect(await f.store.load('budgetModelCalls')).toEqual([])
})

it('does not reconstruct a legacy native budget or accept a new task without a real decision receipt', async () => {
  const f = await fixture()
  await f.works.release(f.task.id, 'failed'); await f.works.authorizeRetry(f.work.id, 'employee')
  const work = (await f.store.load<WorkItem>('workItems'))[0], budget = await f.budget()
  const { accounting: _, sourceMessageId: __, ...legacy } = budget
  await f.store.write([row('workBudgets', legacy)])
  await expect(f.works.claim({ ...f.claim, runId: 'retry', intent: { ...intent, workId: work.id, expectedVersion: work.version } })).rejects.toThrow('旧本机工作缺少可信请求账本')
  await expect(f.works.claim({ ...f.claim, sourceMessageId: 'new-source', runId: 'new-task', priorDecision: undefined })).rejects.toThrow('缺少原判断回执')
  expect(await f.store.load('workItems')).toHaveLength(1)
  expect(await f.budget()).toEqual(legacy)
})
