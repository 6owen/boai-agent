/*
 * [OUTPUT]: 验证默认无执行配额、旧默认精确迁移、显式预算仍执行以及用户取消；不调用真实供应商。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 覆盖系统复制回执、员工配置入口、定时运行防连点、失败过程保留、严格私有判断修复及保留原预算的显式继续。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [OUTPUT]: 本机/API逐请求计量、部分回执未知与伪造运行/来源/阶段拒绝，保留原期限和唯一账本。
 * [INPUT]: 真实独立 SQLite 连接、自动化受理和复用的工作预算/逐调用账本。
 * [OUTPUT]: 追加额度竞争/故障回滚、累计与迟到用量、父子工作及已交付保护/待核对拒绝；补充不改变原工作身份或重放已交付结果；无工作判断预算、并发预留/回执幂等、未知用量/原始期限及等待恢复容量不变量验证。
 * [POS]: 自动化预算与执行容量的持久事务回归；不调用真实模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, AutomationOccurrence, BudgetModelCall, Message, WorkBudget } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { activateAutomationExecution, AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'
import { AutomationService } from '../packages/runtime/src/modules/automations/automation-service'
import { WorkRepository } from '../packages/runtime/src/modules/collaboration/work-repository'
import { workBudgetDeadline } from '../packages/runtime/src/modules/collaboration/work-budget'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-budget-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const connect = async () => { const store = new ProductStore(join(root, 'db.sqlite')); await store.init(); cleanups.push(() => store.close()); return store }
  const store = await connect(), repository = new AutomationRepository(store, root), works = new WorkRepository(store)
  await repository.migrate(); await works.init()
  const admit = async (conversationId = 'chat') => {
    const definition = await repository.save({ name: 'report', prompt: 'report', conversationId, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }, 'permission')
    const claim = await repository.claim({ automationId: definition.id, source: 'manual', key: 'once', scheduledAt: Date.now() }, () => undefined)
    const origin = claim.dispatch!.origin!
    const message: Message = { id: `message-${claim.occurrence.id}`, origin, conversationId, turnId: `turn-${claim.occurrence.id}`, senderType: 'user', senderId: 'automatic', senderName: 'report', sequence: 1, content: 'report', status: 'completed', createdAt: new Date().toISOString() }
    const occurrence = await repository.commitDispatch(claim.occurrence.id, message, [row('messages', message)])
    const run: AgentRun = { origin, id: `run-${occurrence.id}`, turnId: message.turnId, conversationId, agentId: 'lead', agentName: 'Lead', phase: 'decision', triggerMessageId: message.id, messageId: '', status: 'running', createdAt: message.createdAt, toolEvents: [] }
    return { definition, occurrence, message, run, origin }
  }
  const budget = async (id: string) => (await store.load<WorkBudget>('workBudgets')).find(budget => budget.id === id)!
  return { store, repository, works, connect, admit, budget }
}
const intent = { key: 'main', scope: '核查', deliverable: '可检查结果' }
it.each(['codex-local', 'claude-local'] as const)('excludes %s from API occurrence accounting while rejecting a forged runtime or source', async kind => {
  const f = await fixture(), entry = await f.admit()
  const native: AgentRun = { ...entry.run, backend: { kind, profileId: 'profile', profileRevision: 1, sessionPolicy: 'fresh', toolControl: 'none', externalInvocations: 0 } }
  const turn = { id: native.turnId!, conversationId: native.conversationId, origin: entry.origin, status: 'running' }
  await f.store.write([
    row('agents', { id: 'lead', active: true, allowCommands: false, executionBackend: { kind, profileId: 'profile' } }),
    row('agents', { id: 'api', active: true, allowCommands: false, executionBackend: { kind: 'mastra-model' } }),
    row('conversations', { id: 'chat', kind: 'group', agentIds: ['lead', 'api'] }), row('turns', turn), row('runs', native),
  ])
  const original = await f.budget(entry.occurrence.budgetId!)
  await f.works.reserveAutomationCall(native, 'native-decision', 'decision')
  const api = { ...entry.run, id: 'api-run', agentId: 'api' }
  await f.store.write([row('runs', api)])
  await f.works.reserveAutomationCall(api, 'api-decision', 'decision')
  const known = { inputTokens: 5, outputTokens: 7, totalTokens: 12 }
  await f.works.settleAutomationCall(native.id, 'native-decision', known)
  await f.works.settleAutomationCall(api.id, 'api-decision', known)
  expect(await f.budget(original.id)).toMatchObject({ modelCalls: 1, unknownCalls: 0, usageIncomplete: false, deadlineAt: original.deadlineAt, usage: known })
  await f.works.settleAutomationCall(native.id, 'native-decision', known, true)
  expect(await f.budget(original.id)).toMatchObject({ unknownCalls: 0, usageIncomplete: false })
  await f.works.settleAutomationCall(native.id, 'native-decision', { outputTokens: 9 }, true)
  expect(await f.budget(original.id)).toMatchObject({ unknownCalls: 0, usageIncomplete: false, usage: known })
  await f.works.reserveAutomationCall(native, 'native-decision', 'decision')
  await expect(f.works.reserveAutomationCall({ ...native, backend: undefined }, 'forged-kind', 'decision')).rejects.toThrow('运行方式')
  await expect(f.works.reserveAutomationCall({ ...native, origin: { ...entry.origin, authorizedFingerprint: 'forged' } }, 'forged-source', 'decision')).rejects.toThrow('来源')
  await expect(f.works.reserveAutomationCall(native, 'forged-phase', 'execution')).rejects.toThrow('阶段')
  await f.store.write([row('agents', { id: 'lead', active: false, executionBackend: { kind, profileId: 'profile' } })])
  await expect(f.works.reserveAutomationCall(native, 'disabled', 'decision')).rejects.toThrow('授权')
  expect((await f.store.load<BudgetModelCall>('budgetModelCalls')).sort((a, b) => a.id.localeCompare(b.id)).map(call => [call.id, call.callUnit])).toEqual([['api-decision', undefined]])
  expect(await f.budget(original.id)).toMatchObject({ modelCalls: 1, deadlineAt: original.deadlineAt })
})

it('creates a usage ledger without default ceilings before any work exists and gives a new occurrence its own budget', async () => {
  const f = await fixture(), first = await f.admit()
  expect((await f.works.view('chat')).workItems).toEqual([])
  const initial = await f.budget(first.occurrence.budgetId!)
  expect(initial).toMatchObject({ origin: first.origin, modelCalls: 0, runs: 0, usageIncomplete: false, accounting: 'model-calls-v1' })
  expect(initial.deadlineAt).toBe('')
  expect(workBudgetDeadline(initial)).toBeUndefined()
  await f.works.reserveAutomationCall(first.run, 'decision', 'decision')
  expect(await f.budget(initial.id)).toMatchObject({ modelCalls: 1, runs: 0, unknownCalls: 1, usageIncomplete: true })
  const current = (await f.repository.view()).occurrences[0]
  await f.repository.updateOccurrence(current.id, current.stateVersion, { status: 'completed' })
  const next = await f.repository.claim({ automationId: first.definition.id, source: 'manual', key: 'next', scheduledAt: Date.now() }, () => undefined)
  expect(next.occurrence.budgetId).not.toBe(initial.id)
  expect(await f.budget(next.occurrence.budgetId!)).toMatchObject({ modelCalls: 0, usage: {}, runs: 0 })
})
it('does not replay already delivered work under a clarification message with a new message identity', async () => {
  const f = await fixture(), entry = await f.admit()
  const work = await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'first-task', intent, origin: entry.origin })
  await f.works.settle('first-task', { disposition: 'delivered', summary: '已交付', evidence: [{ kind: 'answer', reference: '结果' }] }, { messageId: 'result', content: '结果', artifactIds: [] })
  await f.store.write([row('messages', { ...entry.message, id: 'clarification', senderId: 'user', content: '补充信息' })])
  await expect(f.works.claim({ conversationId: 'chat', sourceMessageId: 'clarification', agentId: 'lead', runId: 'second-task', intent, origin: entry.origin })).rejects.toThrow('delivered')
  const view = await f.works.view('chat')
  expect(view.workItems).toHaveLength(1)
  expect(view.workItems[0]).toMatchObject({ id: work.id, sourceMessageId: entry.message.id, status: 'delivered' })
  expect(view.workBudgets[0].runs).toBe(1)
})
it('reserves calls atomically across independent connections and does not charge a repeated identity twice', async () => {
  const f = await fixture(), entry = await f.admit(), budget = await f.budget(entry.occurrence.budgetId!)
  await f.store.write([row('workBudgets', { ...budget, maxModelCalls: 2 })])
  const other = new WorkRepository(await f.connect())
  const competing = await Promise.allSettled([f.works.reserveAutomationCall(entry.run, 'a', 'decision'), other.reserveAutomationCall(entry.run, 'b', 'decision'), f.works.reserveAutomationCall(entry.run, 'c', 'decision')])
  expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(2)
  expect(competing.filter(result => result.status === 'rejected')).toHaveLength(1)
  const calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
  expect(calls).toHaveLength(2)
  await other.reserveAutomationCall(entry.run, calls[0].id, 'decision')
  expect(await f.budget(budget.id)).toMatchObject({ modelCalls: 2, unknownCalls: 2 })
  await expect(other.reserveAutomationCall({ ...entry.run, id: 'other-run' }, calls[0].id, 'decision')).rejects.toThrow('标识')
})
it('shares one budget with roots/children, reports/retries and memory without adding turn or work totals again', async () => {
  const f = await fixture(), entry = await f.admit()
  await f.works.reserveAutomationCall(entry.run, 'decision', 'decision')
  const work = await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'task', intent, origin: entry.origin })
  const task = { ...entry.run, id: 'task', phase: 'execution' as const, workId: work.id }
  await f.works.reserveAutomationCall(task, 'task-call', 'execution')
  const child = await f.works.delegate('task', { ...intent, key: 'child', ownerAgentId: 'writer' })
  await f.works.reserveAutomationCall(task, 'report-call', 'report')
  await f.works.reserveAutomationCall({ ...entry.run, id: 'memory', phase: 'memory' }, 'memory-call', 'memory')
  expect(child.budgetId).toBe(entry.occurrence.budgetId)
  expect(await f.budget(child.budgetId)).toMatchObject({ modelCalls: 4, runs: 1, workItems: 2, unknownCalls: 4 })
  await f.works.release('task', 'failed')
  await f.works.authorizeRetry(work.id, 'lead')
  const updated = (await f.works.view('chat')).workItems.find(item => item.id === work.id)!
  await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'retry', intent: { ...intent, workId: work.id, expectedVersion: updated.version }, origin: entry.origin })
  await f.works.reserveAutomationCall({ ...task, id: 'retry' }, 'retry-call', 'execution')
  expect(await f.budget(child.budgetId)).toMatchObject({ modelCalls: 5, runs: 2, workItems: 2, retries: 1 })
})
it('keeps missing usage unknown and accepts late/repeated receipts after stop without recreating cleared records', async () => {
  const f = await fixture(), entry = await f.admit()
  for (const id of ['known', 'unknown']) await f.works.reserveAutomationCall(entry.run, id, 'decision')
  const usage = { inputTokens: 5, outputTokens: 7, totalTokens: 12 }
  await f.works.settleAutomationCall(entry.run.id, 'known', usage)
  await f.works.settleAutomationCall(entry.run.id, 'known', usage)
  await f.works.settleAutomationCall(entry.run.id, 'unknown', {})
  expect(await f.budget(entry.occurrence.budgetId!)).toMatchObject({ usage, unknownCalls: 1, usageIncomplete: true })
  const o = (await f.repository.view()).occurrences[0]
  await f.repository.updateOccurrence(o.id, o.stateVersion, { status: 'cancelled', cancellationRequestedAt: new Date().toISOString() })
  await expect(f.works.reserveAutomationCall(entry.run, 'late-request', 'decision')).rejects.toThrow('停止')
  await f.works.settleAutomationCall(entry.run.id, 'unknown', usage)
  expect(await f.budget(entry.occurrence.budgetId!)).toMatchObject({ usage: { inputTokens: 10, outputTokens: 14, totalTokens: 24 }, unknownCalls: 0, usageIncomplete: false })
  await f.store.write([], [{ collection: 'budgetModelCalls', id: 'unknown' }])
  await f.works.settleAutomationCall(entry.run.id, 'unknown', usage)
  expect(await f.store.load('budgetModelCalls')).toHaveLength(1)
})
it('ignores legacy automation deadlines while rejecting overspending before another request is reserved', async () => {
  const f = await fixture(), entry = await f.admit(), budget = { ...await f.budget(entry.occurrence.budgetId!), maxOutputTokens: 100 }
  await f.store.write([row('workBudgets', budget)])
  await f.works.reserveAutomationCall(entry.run, 'first', 'decision')
  await f.works.settleAutomationCall(entry.run.id, 'first', { inputTokens: 1, outputTokens: budget.maxOutputTokens, totalTokens: budget.maxOutputTokens + 1 })
  await expect(f.works.reserveAutomationCall(entry.run, 'over-output', 'decision')).rejects.toThrow('上限')
  const current = await f.budget(budget.id)
  await f.store.write([row('workBudgets', { ...current, usage: {}, deadlineAt: new Date(0).toISOString() })])
  await f.works.reserveAutomationCall(entry.run, 'after-legacy-deadline', 'decision')
  expect(await f.store.load('budgetModelCalls')).toHaveLength(2)
})
it('reacquires a released automation slot inside the wake transaction and cannot exceed two active occurrences', async () => {
  const f = await fixture(), waiting = await f.admit('waiting')
  const parent = await f.works.claim({ conversationId: 'waiting', sourceMessageId: waiting.message.id, agentId: 'lead', runId: 'parent', intent, origin: waiting.origin })
  const child = await f.works.delegate('parent', { ...intent, key: 'child', ownerAgentId: 'writer' })
  await f.works.waitFor('parent', { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '等待检查' })
  await f.works.settle('parent', { disposition: 'waiting', summary: '等待检查' }, { messageId: 'waiting', content: '等待检查', artifactIds: [] })
  const current = (await f.repository.view()).occurrences.find(o => o.id === waiting.occurrence.id)!
  await f.repository.updateOccurrence(current.id, current.stateVersion, { status: 'waiting_work' })
  const second = await f.admit('second'); await f.admit('third')
  expect(await f.works.scheduleWake(child.wakeId!, 'child-turn', [row('turns', { id: 'child-turn' })])).toBe(false)
  expect(await f.store.load('turns')).toEqual([])
  const active = (await f.repository.view()).occurrences.find(o => o.id === second.occurrence.id)!
  await f.repository.updateOccurrence(active.id, active.stateVersion, { status: 'completed' })
  expect(await f.works.scheduleWake(child.wakeId!, 'child-turn', [row('turns', { id: 'child-turn' })])).toBe(true)
  expect((await f.repository.view()).occurrences.filter(o => ['admitted', 'running'].includes(o.status))).toHaveLength(2)
  expect((await f.works.view('waiting')).workItems.find(work => work.id === parent.id)?.budgetId).toBe(waiting.occurrence.budgetId)
})
it('allows only one of two waiting occurrences to take the final slot across independent connections', async () => {
  const f = await fixture(), first = await f.admit('first'), second = await f.admit('second')
  for (const item of [first, second]) {
    const o = (await f.repository.view()).occurrences.find(o => o.id === item.occurrence.id)!
    await f.repository.updateOccurrence(o.id, o.stateVersion, { status: 'waiting_work' })
  }
  await f.admit('occupied')
  const other = await f.connect()
  const results = await Promise.allSettled([f.store.transaction(tx => activateAutomationExecution(tx, first.origin, 'first')), other.transaction(tx => activateAutomationExecution(tx, second.origin, 'second'))])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect((await f.store.load<AutomationOccurrence>('automationOccurrences')).filter(o => ['admitted', 'running'].includes(o.status))).toHaveLength(2)
})

function renewalRecords(entry: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['admit']>>, id: string) {
  const message: Message = { ...entry.message, id: `human-${id}`, turnId: `turn-${id}`, senderId: 'user', senderName: '我', content: '继续未完成部分' }
  const turn: import('../packages/shared/src/domain').DiscussionTurn = { id: message.turnId!, conversationId: message.conversationId, triggerMessageId: message.id, origin: entry.origin, status: 'queued', generation: 0, createdAt: message.createdAt, modelCalls: 0, publicMessages: 0 }
  return [row('messages', message), row('turns', turn), row('requests', { id, fingerprint: id, messageId: message.id })]
}
async function exhaustedFixture() {
  const f = await fixture(), entry = await f.admit()
  await f.works.reserveAutomationCall(entry.run, 'old-unknown', 'decision')
  const budget = { ...await f.budget(entry.occurrence.budgetId!), deadlineAt: new Date(0).toISOString(), maxOutputTokens: 0, maxModelCalls: 24, maxRuns: 8 }
  await f.store.write([row('workBudgets', budget)])
  const o = (await f.repository.updateOccurrence(entry.occurrence.id, entry.occurrence.stateVersion, { status: 'waiting_user', startedAt: new Date(0).toISOString() }))!
  return { ...f, entry, before: budget, o }
}
it('grants an allowance once across independent writers, keeps unknown usage and links successive explicit renewals', async () => {
  const f = await exhaustedFixture(), other = new WorkRepository(await f.connect())
  const input = { expectedVersion: f.o.stateVersion, allowance: 'standard-v1' as const }
  const results = await Promise.allSettled([f.works.renewAutomation(f.entry.origin, 'chat', input, renewalRecords(f.entry, 'grant-a')), other.renewAutomation(f.entry.origin, 'chat', input, renewalRecords(f.entry, 'grant-b'))])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  const budget = await f.budget(f.before.id)
  expect(budget).toMatchObject({ modelCalls: 1, unknownCalls: 1, usageIncomplete: true, runs: 0, maxModelCalls: f.before.maxModelCalls + 24, maxRuns: 16 })
  expect(budget.renewals).toHaveLength(1)
  expect(budget.renewals![0]).toMatchObject({ before: { deadlineAt: f.before.deadlineAt, maxModelCalls: f.before.maxModelCalls }, after: { maxModelCalls: f.before.maxModelCalls + 24 }, used: { modelCalls: 1, unknownCalls: 1 } })
  expect((await f.store.load<Message>('messages')).filter(m => m.senderId === 'user')).toHaveLength(1)
  // A late original request receipt still charges the same cumulative ledger, never the frozen grant snapshot.
  await f.works.settleAutomationCall(f.entry.run.id, 'old-unknown', { inputTokens: 2, outputTokens: 3, totalTokens: 5 })
  expect(await f.budget(budget.id)).toMatchObject({ usage: { totalTokens: 5 }, unknownCalls: 0, usageIncomplete: false })
  const current = (await f.repository.view()).occurrences[0]
  await f.store.write([row('workBudgets', { ...await f.budget(budget.id), deadlineAt: new Date(0).toISOString(), maxOutputTokens: 0 }), ...(await f.store.load<import('../packages/shared/src/domain').DiscussionTurn>('turns')).map(t => row('turns', { ...t, status: 'waiting_user' }))])
  const waiting = (await f.repository.updateOccurrence(current.id, current.stateVersion, { status: 'waiting_user' }))!
  await f.works.renewAutomation(f.entry.origin, 'chat', { ...input, expectedVersion: waiting.stateVersion }, renewalRecords(f.entry, 'second-grant'))
  const renewed = await f.budget(budget.id)
  expect(renewed.renewals).toHaveLength(2)
  expect(renewed.renewals![1]).toMatchObject({ previousId: budget.renewals![0].id, used: { modelCalls: 1, usage: { totalTokens: 5 } }, before: { maxModelCalls: f.before.maxModelCalls + 24 }, after: { maxModelCalls: f.before.maxModelCalls + 48 } })
})
it.each(['capacity', 'commit', 'user-stop', 'restart', 'legacy', 'not-exhausted'] as const)('does not commit an allowance or message when %s rejects renewal', async blocker => {
  const f = await exhaustedFixture()
  if (blocker === 'capacity') await f.store.write(['a', 'b'].map(id => row('automationOccurrences', { ...f.o, id, automationId: id, conversationId: id, status: 'running' })))
  if (blocker === 'user-stop') await f.store.write([row('automationOccurrences', { ...f.o, status: 'cancelled', cancellationCause: 'user', cancellationRequestedAt: new Date().toISOString() })])
  if (blocker === 'restart') await f.repository.recover()
  if (blocker === 'legacy') await f.store.write([row('workBudgets', { ...f.before, accounting: undefined })])
  if (blocker === 'not-exhausted') await f.store.write([row('workBudgets', { ...f.before, deadlineAt: new Date(Date.now() + 60000).toISOString(), maxOutputTokens: 16000 })])
  const before = await f.budget(f.before.id), transaction = f.store.transaction.bind(f.store)
  if (blocker === 'commit') f.store.transaction = operation => transaction(tx => operation({ ...tx, put: async r => { if (r.collection === 'messages') throw new Error('renewal commit fault'); await tx.put(r) } }))
  await expect(f.works.renewAutomation(f.entry.origin, 'chat', { expectedVersion: f.o.stateVersion, allowance: 'standard-v1' }, renewalRecords(f.entry, 'blocked'))).rejects.toThrow()
  f.store.transaction = transaction
  expect(await f.budget(f.before.id)).toEqual(before)
  expect((await f.store.load<Message>('messages')).some(m => m.id === 'human-blocked')).toBe(false)
  expect(await f.store.load('turns')).toEqual([])
})
it('continues the same parent and child after budget stop while preserving delivered work and old execution fences', async () => {
  const f = await fixture(), entry = await f.admit()
  const completed = await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'done', intent: { ...intent, key: 'completed' }, origin: entry.origin })
  await f.works.settle('done', { disposition: 'delivered', summary: '已有结果', evidence: [{ kind: 'answer', reference: '已有结果' }] }, { messageId: 'answer', content: '已有结果', artifactIds: [] })
  const delivered = (await f.works.view('chat')).workItems.find(w => w.id === completed.id)!
  const parent = await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'parent', intent, origin: entry.origin })
  const child = await f.works.delegate('parent', { ...intent, key: 'child', ownerAgentId: 'lead' })
  await f.works.waitFor('parent', { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '汇总已有子结果' })
  await f.works.settle('parent', { disposition: 'waiting', summary: '等待核查' }, { messageId: 'waiting', content: '等待核查', artifactIds: [] })
  const before = await f.budget(entry.occurrence.budgetId!)
  await f.works.cancelTree(parent.id, '预算到期', 'budget')
  await f.store.write([row('workBudgets', { ...before, deadlineAt: new Date(0).toISOString(), maxOutputTokens: 0 })])
  const o = (await f.repository.updateOccurrence(entry.occurrence.id, entry.occurrence.stateVersion, { status: 'cancelled', cancellationCause: 'budget', cancellationRequestedAt: new Date().toISOString() }))!
  await f.works.renewAutomation(entry.origin, 'chat', { expectedVersion: o.stateVersion, allowance: 'standard-v1' }, renewalRecords(entry, 'continue-tree'))
  const view = await f.works.view('chat'), childNow = view.workItems.find(w => w.id === child.id)!
  expect(view.workItems.find(w => w.id === completed.id)).toEqual(delivered)
  expect(view.workItems.find(w => w.id === parent.id)).toMatchObject({ id: parent.id, status: 'waiting', resultVersion: 1, nextStep: '汇总已有子结果' })
  expect(childNow).toMatchObject({ status: 'ready', parentWorkId: parent.id, budgetId: before.id })
  expect(view.workBudgets[0]).toMatchObject({ runs: before.runs, workItems: before.workItems, noProgress: before.noProgress })
  expect(view.workWakes.find(w => w.id === child.wakeId)?.status).toBe('cancelled')
  expect(childNow.wakeId).not.toBe(child.wakeId)
  expect(await f.works.scheduleWake(childNow.wakeId!, 'child-next', [])).toBe(true)
  await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'child-next', intent: { ...intent, workId: child.id, expectedVersion: childNow.version }, wakeId: childNow.wakeId, origin: entry.origin })
  await f.works.settle('child-next', { disposition: 'delivered', summary: '新子结果', evidence: [{ kind: 'answer', reference: '新子结果' }] }, { messageId: 'child-answer', content: '新子结果', artifactIds: [] })
  expect((await f.works.view('chat')).workItems.find(w => w.id === parent.id)?.status).toBe('ready')
  await expect(f.works.reserveCall('parent')).rejects.toThrow('执行权')
  await expect(f.works.claim({ conversationId: 'chat', sourceMessageId: 'human-continue-tree', agentId: 'lead', runId: 'repeat', intent: { ...intent, key: 'completed' }, origin: entry.origin })).rejects.toThrow('delivered')
})
it.each(['unconfirmed-effect', 'manually-stopped-work'] as const)('does not use budget renewal to replay %s', async blocker => {
  const f = await fixture(), entry = await f.admit()
  const work = await f.works.claim({ conversationId: 'chat', sourceMessageId: entry.message.id, agentId: 'lead', runId: 'task', intent, origin: entry.origin })
  if (blocker === 'unconfirmed-effect') { await f.works.markEffect('task'); await f.works.release('task', 'failed') }
  else await f.works.cancelTree(work.id, '用户停止')
  const before = { ...await f.budget(work.budgetId), deadlineAt: new Date(0).toISOString(), maxOutputTokens: 0 }
  await f.store.write([row('workBudgets', before)])
  const o = (await f.repository.updateOccurrence(entry.occurrence.id, entry.occurrence.stateVersion, { status: 'failed' }))!
  await expect(f.works.renewAutomation(entry.origin, 'chat', { expectedVersion: o.stateVersion, allowance: 'standard-v1' }, renewalRecords(entry, 'unsafe'))).rejects.toThrow('核对')
  expect(await f.budget(work.budgetId)).toEqual(before)
})

it.each(['native', 'mixed', 'api'] as const)('freezes %s automation scope and applies occurrence budget cancellation only to API-only execution', async scope => {
  const f = await fixture()
  const native = { id: 'lead', active: true, executionBackend: { kind: 'claude-local', profileId: 'profile' } }
  const api = { id: 'api', active: true, executionBackend: { kind: 'mastra-model' } }
  await f.store.write([row('agents', native), row('agents', api), row('conversations', { id: 'chat', agentIds: scope === 'native' ? ['lead'] : scope === 'mixed' ? ['lead', 'api'] : ['api'] })])
  const entry = await f.admit()
  expect(entry.occurrence.budgetScope).toBe(scope === 'api' ? undefined : scope)
  let cancellations = 0
  const service = new AutomationService(f.store, '', { critical: op => op(), validate: () => 'permission', busy: () => false, dispatch: async () => { throw Error('must not replay') }, inspect: async () => undefined, cancel: async () => { cancellations++ }, changed: () => {}, notify: () => {} })
  cleanups.push(() => service.close())
  await service.stop(entry.occurrence.id, '达到本次自动化的时间预算', 'budget')
  expect(cancellations).toBe(scope === 'api' ? 1 : 0)
  if (scope !== 'api') {
    expect((await f.repository.view()).occurrences[0].status).toBe('running')
    await service.stop(entry.occurrence.id)
    expect(cancellations).toBe(1)
    expect((await f.repository.view()).occurrences[0].cancellationCause).toBe('user')
  }
})
