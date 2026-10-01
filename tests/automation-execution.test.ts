/*
 * [INPUT]: 隔离 SQLite、真实 AppService/工作接续、受控模型与已提交交付证据。
 * [OUTPUT]: 实际受管发布原件/复制 hash 与未知/缺失交付证据；到期续行/重复提交/原始身份/重启、初始判断重试归并和已交付工作不重跑；两次等待隔离/多轮补充/幂等提交、权限/容量/到期/提交回滚；完整宿主调用链的判断/限流重试/执行/记忆预算去重与未知用量验证；跨工作归属/无证据不交付、取消等待退出/人工任务隔离、无重放恢复与事务执行门禁验证。
 * [POS]: 自动化执行意图回归；不调用外部模型或真实用户计划。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { AgentRun, AutomationDefinition, AutomationOccurrence, AutomationOrigin, AutomationsView, BudgetModelCall, Connection, Conversation, ConversationDetail, DiscussionTurn, Message, Snapshot, WorkExecution, WorkItem } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { AutomationRepository } from '../src/runtime/modules/automations/automation-repository'
import { aggregateAutomation } from '../src/runtime/modules/automations/automation-results'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
const stamp = new Date().toISOString()
const origin: AutomationOrigin = { kind: 'automation', automationId: 'plan', occurrenceId: 'occurrence', name: 'report', authorizedFingerprint: 'fingerprint' }
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const occurrence = (): AutomationOccurrence => ({ schemaVersion: 1, id: origin.occurrenceId, stateVersion: 1, automationId: origin.automationId, name: 'report', source: 'manual', scheduledFor: stamp, startedAt: stamp, status: 'running', deliveryStatus: 'pending', conversationId: 'chat', turnId: 'turn', runIds: [], resultMessageIds: [], usageIncomplete: true })
function resultFixture() {
  const turn: DiscussionTurn = { id: 'turn', conversationId: 'chat', triggerMessageId: 'request', origin, status: 'completed', generation: 0, createdAt: stamp, finishedAt: stamp, modelCalls: 2, publicMessages: 1 }
  const run: AgentRun = { id: 'run', turnId: turn.id, origin, phase: 'execution', responseKind: 'task', workId: 'work', conversationId: 'chat', agentId: 'lead', agentName: 'Lead', triggerMessageId: 'request', messageId: 'answer', status: 'completed', createdAt: stamp, finishedAt: stamp, toolEvents: [], usage: { outputTokens: 10 } }
  const message: Message = { id: 'answer', conversationId: 'chat', turnId: turn.id, runId: run.id, senderType: 'agent', senderId: 'lead', senderName: 'Lead', content: '数据核查为 42', status: 'completed', sequence: 2, createdAt: stamp }
  const work: WorkItem = { schemaVersion: 2, id: 'work', origin, conversationId: 'chat', sourceMessageId: 'request', key: 'main', scope: '核查数据', deliverable: '核查结果', ownerAgentId: 'lead', version: 3, status: 'delivered', budgetId: 'budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [message.id], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: stamp, updatedAt: stamp, outcome: { disposition: 'delivered', summary: '数据已核查', evidence: [{ kind: 'answer', reference: '42' }] } }
  return { turns: [turn], runs: [run], messages: [message], works: [work], wakes: [], artifacts: [], verifiedArtifactIds: new Set<string>(), activeRunIds: new Set<string>(), activeTurnIds: new Set<string>() }
}
it('requires current committed evidence and excludes an independent required result from ownership', () => {
  const input = resultFixture()
  input.works[0].requiredResults = [{ workId: 'independent', resultVersion: 1 }]
  input.works.push({ ...input.works[0], id: 'independent', rootWorkId: 'independent', origin: undefined, status: 'failed' })
  const result = aggregateAutomation(occurrence(), input)!
  expect(result).toMatchObject({ status: 'completed', deliveryStatus: 'delivered', workIds: ['work'], rootWorkIds: ['work'], modelCalls: 2, usage: { outputTokens: 10 }, usageIncomplete: true })
  expect(result.resultEvidence).toEqual([{ kind: 'answer', reference: '42', workId: 'work', resultVersion: 1, messageId: 'answer' }])
  input.works[0].requiresReview = true
  expect(aggregateAutomation(occurrence(), input)).toMatchObject({ deliveryStatus: 'blocked', resultEvidence: [] })
  input.works[0].requiresReview = false
  input.works[0].resultMessageIds.push('missing-new-version')
  expect(aggregateAutomation(occurrence(), input)).toMatchObject({ status: 'completed', deliveryStatus: 'blocked', resultEvidence: [] })
})
it('does not label all-pass, ordinary chat, or an unverified artifact as delivered', () => {
  const input = resultFixture()
  expect(aggregateAutomation(occurrence(), { ...input, works: [], runs: [], messages: [] })).toMatchObject({ status: 'completed', deliveryStatus: 'unknown' })
  expect(aggregateAutomation(occurrence(), { ...input, works: [] })).toMatchObject({ status: 'completed', deliveryStatus: 'unknown', resultMessageIds: ['answer'] })
  input.works[0].outcome!.evidence = [{ kind: 'artifact', reference: 'file' }]
  input.works[0].artifactIds = ['file']
  const artifacts = [{ id: 'file', name: 'report.txt', path: '/not-verified', size: 1, runId: 'run' }]
  expect(aggregateAutomation(occurrence(), { ...input, artifacts })).toMatchObject({ deliveryStatus: 'blocked' })
  expect(aggregateAutomation(occurrence(), { ...input, artifacts, verifiedArtifactIds: new Set(['file']) })).toMatchObject({ deliveryStatus: 'delivered' })
  expect(aggregateAutomation(occurrence(), { ...input, artifacts: [{ ...artifacts[0], runId: 'another-work' }], verifiedArtifactIds: new Set(['file']) })).toMatchObject({ deliveryStatus: 'blocked' })
})
it('keeps pending children and an unexited adapter open while retaining verified partial results', () => {
  const input = resultFixture()
  input.works.push({ ...input.works[0], id: 'child', parentWorkId: 'work', status: 'ready', outcome: undefined, resultMessageIds: [] })
  expect(aggregateAutomation(occurrence(), input)).toMatchObject({ status: 'waiting_work', deliveryStatus: 'partial', rootWorkIds: ['work'] })
  const stopped = { ...occurrence(), status: 'cancelling' as const, cancellationRequestedAt: stamp, reason: '用户停止本次执行' }
  expect(aggregateAutomation(stopped, { ...input, activeRunIds: new Set(['run']) })).toMatchObject({ status: 'cancelling', deliveryStatus: 'partial', finishedAt: undefined })
  expect(aggregateAutomation(stopped, input)).toMatchObject({ status: 'cancelled', deliveryStatus: 'partial', reason: stopped.reason })
})

async function until(check: () => Promise<boolean>, timeout = 10000) {
  const started = Date.now()
  while (!await check()) { if (Date.now() - started > timeout) throw new Error('Condition did not settle'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); disposers.push(async () => release()); return { promise, release } }
async function setup(engine: AgentEngine) {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-execution-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const make = async () => {
    const service = new AppService({ dataPath: root, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    disposers.push(() => service.close()); await service.init(); return service
  }
  const service = await make()
  const connection = await service.handle('saveConnection', { name: 'test', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'test' }) as Connection
  for (const agent of (await service.handle('snapshot', undefined) as Snapshot).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await service.handle('saveAgent', { ...input, connectionId: connection.id, allowCommands: false })
  }
  const conversation = await service.handle('createConversation', { kind: 'group', title: 'automated report', agentIds: ['researcher', 'writer'] }) as Conversation
  const plan = await service.handle('saveAutomation', { name: 'report', prompt: 'automatic request', conversationId: conversation.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  return { root, service, make, conversation, plan, detail: () => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>, view: () => service.handle('listAutomations', undefined) as Promise<AutomationsView> }
}
const decide: NonNullable<AgentEngine['decide']> = async context => {
  const trigger = context.messages.find(message => message.id === context.triggerMessageId)!
  return { action: context.agent.id === 'researcher' && !context.participation?.hasRespondedInTurn && trigger.content !== 'context update' ? 'reply' : 'pass', responseKind: 'task', work: { key: 'main', scope: trigger.content, deliverable: '可检查的结果' }, observedThroughSequence: Math.max(...context.messages.map(message => message.sequence)) }
}
async function deliver(context: EngineContext, text: string) { await context.onDelta(text); await context.onWorkOutcome!({ disposition: 'delivered', summary: text, evidence: [{ kind: 'answer', reference: text }] }) }
async function delegate(context: EngineContext) {
  const child = await context.delegateWork!({ key: 'child', ownerAgentId: 'writer', scope: '核查数据', deliverable: '数据核查结果' })
  await context.waitForWork!({ dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '核查后完成总结' })
  await context.onDelta('等待核查数据')
}
function clarificationEngine(): AgentEngine {
  return { test: async () => '', decide: async context => {
    const trigger = context.messages.find(message => message.id === context.triggerMessageId)!
    const action = context.agent.id !== 'researcher' || context.participation?.hasRespondedInTurn || trigger.content === 'context update' ? 'pass' : trigger.content === '42' ? 'reply' : 'ask'
    return { action, responseKind: action === 'reply' ? 'task' : 'chat', work: { key: 'main', scope: '原始自动化核查', deliverable: '核查结果' }, observedThroughSequence: Math.max(...context.messages.map(message => message.sequence)) }
  }, run: async context => {
    if (context.responseKind === 'task') await deliver(context, '核查结果 42')
    else await context.onDelta('请补充本次需要核查的数字。')
  } }
}
it('replies to exactly one waiting occurrence, keeps its original budget/source, and deduplicates a submitted reply', async () => {
  const f = await setup(clarificationEngine())
  const first = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'first' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.status === 'waiting_user')
  const plan2 = await f.service.handle('saveAutomation', { name: 'other', prompt: 'other request', conversationId: f.conversation.id, frequency: 'daily', time: '10:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  const second = await f.service.handle('runAutomation', { id: plan2.id, requestId: 'second' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === second.id)?.status === 'waiting_user')
  const before = await f.detail(), budget = before.workBudgets!.find(b => b.id === first.budgetId)!
  expect(before.workItems).toEqual([])
  const human = await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'context update', mentionIds: [], requestId: 'ordinary' }) as Message
  await until(async () => (await f.detail()).turns!.find(turn => turn.id === human.turnId)?.status === 'completed')
  expect((await f.view()).occurrences.filter(o => o.status === 'waiting_user')).toHaveLength(2)
  const input = { occurrenceId: first.id, content: '42', requestId: 'reply-first' }
  const reply = await f.service.handle('replyAutomation', input) as Message
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.deliveryStatus === 'delivered')
  expect(await f.service.handle('replyAutomation', input)).toEqual(reply)
  await expect(f.service.handle('replyAutomation', { ...input, content: 'different' })).rejects.toThrow('requestId')
  const after = await f.detail(), view = await f.view()
  expect(reply).toMatchObject({ senderId: 'user', senderName: '我', origin: { occurrenceId: first.id } })
  expect(after.turns!.find(turn => turn.id === reply.turnId)?.replyToTurnIds).toEqual([first.turnId])
  expect(after.turns!.find(turn => turn.id === first.turnId)?.status).toBe('waiting_user')
  expect(after.messages.filter(message => message.id === reply.id)).toHaveLength(1)
  expect(after.workItems).toHaveLength(1)
  expect(after.workItems![0]).toMatchObject({ sourceMessageId: first.messageId, budgetId: budget.id, origin: { occurrenceId: first.id } })
  expect(after.workBudgets!.find(b => b.id === budget.id)).toMatchObject({ deadlineAt: budget.deadlineAt, maxModelCalls: budget.maxModelCalls })
  expect(after.workBudgets!.find(b => b.id === budget.id)!.modelCalls).toBeGreaterThan(budget.modelCalls)
  expect(view.occurrences.find(o => o.id === first.id)).toMatchObject({ status: 'completed', waitingTurnIds: [] })
  expect(view.occurrences.find(o => o.id === second.id)).toMatchObject({ status: 'waiting_user', waitingTurnIds: [second.turnId] })
})
it('records each clarification cycle explicitly instead of leaving an old question permanently waiting', async () => {
  const f = await setup(clarificationEngine())
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'cycle' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'waiting_user')
  const firstReply = await f.service.handle('replyAutomation', { occurrenceId: o.id, content: '需要再次确认', requestId: 'clarify' }) as Message
  await until(async () => (await f.view()).occurrences[0]?.waitingTurnIds?.includes(firstReply.turnId!) === true)
  const secondReply = await f.service.handle('replyAutomation', { occurrenceId: o.id, content: '42', requestId: 'answer' }) as Message
  await until(async () => (await f.view()).occurrences[0]?.deliveryStatus === 'delivered')
  const detail = await f.detail()
  expect(detail.turns!.find(turn => turn.id === secondReply.turnId)?.replyToTurnIds).toEqual([firstReply.turnId])
  expect(detail.workBudgets).toHaveLength(1)
  expect(detail.workItems).toHaveLength(1)
})
it.each(['deadline', 'capacity', 'permission', 'commit'] as const)('rejects a clarification without a partial message or budget reset when %s blocks admission', async blocker => {
  const f = await setup(clarificationEngine())
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'blocked' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'waiting_user')
  const store = (f.service as unknown as { store: ProductStore }).store
  const budget = (await f.detail()).workBudgets![0]
  if (blocker === 'deadline') await store.write([row('workBudgets', { ...budget, deadlineAt: new Date(0).toISOString() })])
  if (blocker === 'capacity') await store.write(['a', 'b'].map(id => row('automationOccurrences', { ...o, id, conversationId: id, status: 'running' })))
  if (blocker === 'permission') {
    const agent = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await f.service.handle('saveAgent', { ...input, name: agent.name + ' changed' })
  }
  const transaction = store.transaction.bind(store)
  if (blocker === 'commit') store.transaction = operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'messages') throw new Error('reply commit fault'); await tx.put(record) } }))
  try { await expect(f.service.handle('replyAutomation', { occurrenceId: o.id, content: '42', requestId: 'blocked-reply' })).rejects.toThrow() }
  finally { store.transaction = transaction }
  const detail = await f.detail()
  expect(detail.messages.some(message => message.content === '42')).toBe(false)
  expect(detail.turns).toHaveLength(1)
  expect(detail.workBudgets).toHaveLength(1)
  expect(detail.workBudgets![0].modelCalls).toBe(budget.modelCalls)
  expect((await f.view()).occurrences.find(item => item.id === o.id)?.status).toBe('waiting_user')
  if (blocker === 'commit') {
    await f.service.handle('replyAutomation', { occurrenceId: o.id, content: '42', requestId: 'blocked-reply' })
    await until(async () => (await f.view()).occurrences[0]?.deliveryStatus === 'delivered')
  }
})
it.each([true, false])('validates that a registered artifact is still an inspectable file (present=%s)', async present => {
  const f = await setup({ test: async () => '', decide, run: async context => {
    await mkdir(join(context.workspace!.sharedPath, 'artifacts'), { recursive: true })
    const path = join(context.workspace!.sharedPath, 'artifacts', 'file-result.txt')
    await writeFile(path, '42')
    await context.onArtifact!({ id: 'file', path, name: 'result.txt', size: 2, contentHash: createHash('sha256').update('42').digest('hex') })
    if (!present) await rm(path)
    await context.onDelta('核查结果已保存')
    await context.onWorkOutcome!({ disposition: 'delivered', summary: '核查结果', evidence: [{ kind: 'artifact', reference: 'file' }] })
  } })
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'artifact' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'completed')
  const result = (await f.view()).occurrences.find(item => item.id === o.id)!
  expect(result.deliveryStatus).toBe(present ? 'delivered' : 'blocked')
  expect(result.resultEvidence).toHaveLength(present ? 1 : 0)
  expect((await f.detail()).workItems![0].status).toBe('delivered')
})
it('attributes child and continuation turns to the original occurrence even after a new human message', async () => {
  const child = gate(); let childStarted = false
  const engine: AgentEngine = { test: async () => '', decide, report: async (_context, draft) => ({ action: 'publish', text: draft.text }), run: async context => {
    if (context.work!.parentWorkId) { childStarted = true; await child.promise; await deliver(context, '子工作数据 42') }
    else if (!context.work!.resultVersion) await delegate(context)
    else await deliver(context, '最终总结 42')
  } }
  const f = await setup(engine), o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'once' }) as AutomationOccurrence
  await until(async () => childStarted)
  const human = await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'context update', mentionIds: [], requestId: 'human-context' }) as Message
  child.release()
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.deliveryStatus === 'delivered')
  const detail = await f.detail(), result = (await f.view()).occurrences.find(item => item.id === o.id)!
  expect(detail.workItems).toHaveLength(2)
  expect(detail.workItems!.every(work => work.origin?.occurrenceId === o.id)).toBe(true)
  expect(detail.workWakes!.every(wake => wake.origin?.occurrenceId === o.id)).toBe(true)
  expect(result.turnIds).toHaveLength(3)
  expect(result.rootWorkIds).toHaveLength(1)
  expect(result.workIds).toHaveLength(2)
  expect(result.resultMessageIds).toHaveLength(3)
  expect(result.resultEvidence).toHaveLength(2)
  const resumed = detail.runs.find(run => run.disposition === 'delivered' && run.agentId === 'researcher')!
  expect(resumed.triggerMessageId).toBe(human.id)
  expect(resumed.origin?.occurrenceId).toBe(o.id)
  expect(result.turnIds).not.toContain(human.turnId)
  expect(detail.runs.filter(run => run.turnId === human.turnId).every(run => !run.origin)).toBe(true)
})
it('stops only this occurrence, stays cancelling until the adapter exits, and rejects late publication', async () => {
  const child = gate(), human = gate(); let childStarted = false, humanStarted = false, lateArtifactRejected = false
  const engine: AgentEngine = { test: async () => '', decide, report: async (_context, draft) => ({ action: 'publish', text: draft.text }), run: async context => {
    if (context.work!.parentWorkId) {
      childStarted = true; await child.promise
      await context.onDelta('不应发布的迟到回复')
      try { await context.onArtifact!({ name: 'late', path: join(context.workspace!.sharedPath, 'late'), size: 0 }) } catch { lateArtifactRejected = true }
    } else if (context.work!.scope === 'human task') { humanStarted = true; await human.promise; await deliver(context, '人工任务完成') }
    else await delegate(context)
  } }
  const f = await setup(engine), o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'once' }) as AutomationOccurrence
  await until(async () => childStarted)
  await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: 'human task', mentionIds: [], requestId: 'human-task' })
  await f.service.handle('stopAutomation', { id: o.id })
  // The normal conversation lane starts the queued human request once the directed turn stops.
  await until(async () => humanStarted)
  await f.service.handle('stopAutomation', { id: o.id })
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'cancelling')
  const humanWork = (await f.detail()).workItems!.find(work => work.scope === 'human task')!
  expect(humanWork.status).toBe('running')
  expect(humanWork.origin).toBeUndefined()
  const overlap = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'while-adapter-lives' }) as AutomationOccurrence
  expect(overlap.status).toBe('skipped')
  child.release()
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'cancelled')
  expect(lateArtifactRejected).toBe(true)
  expect((await f.detail()).messages.some(message => message.content.includes('迟到'))).toBe(false)
  human.release()
  await until(async () => (await f.detail()).workItems!.some(work => work.scope === 'human task' && work.status === 'delivered'))
  const result = (await f.view()).occurrences.find(item => item.id === o.id)!
  expect(result.workIds).toHaveLength(2)
  expect(result.deliveryStatus).not.toBe('delivered')
})
it('reconstructs committed delivery after a crash window without invoking the model', async () => {
  let calls = 0
  const f = await setup({ test: async () => '', decide, run: async context => { calls++; await deliver(context, '已提交结果') } })
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'once' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.deliveryStatus === 'delivered')
  await f.service.close()
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
  const persisted = (await store.load<AutomationOccurrence>('automationOccurrences')).find(item => item.id === o.id)!
  // Simulate a committed work/turn whose occurrence projection was never updated before the crash.
  await store.write([row('automationOccurrences', { ...persisted, status: 'running', deliveryStatus: 'pending', resultEvidence: [], resultMessageIds: [] })]); await store.close()
  const before = calls, restored = await f.make()
  const result = (await restored.handle('listAutomations', undefined) as AutomationsView).occurrences.find(item => item.id === o.id)!
  expect(result).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
  expect(result.resultEvidence).toHaveLength(1)
  expect(calls).toBe(before)
})
it('keeps an explicitly retried work in the same occurrence and budget without hiding its earlier failure', async () => {
  let attempts = 0
  const f = await setup({ test: async () => '', decide, run: async context => { if (++attempts === 1) throw new Error('没有执行工具的临时失败'); await deliver(context, '显式重试交付') } })
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'retry-test' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'failed')
  const before = await f.detail(), failed = before.runs.find(run => run.phase === 'execution' && run.status === 'failed')!
  await f.service.handle('retryRun', { id: failed.id, requestId: 'explicit-retry' })
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.deliveryStatus === 'delivered')
  const after = await f.detail(), result = (await f.view()).occurrences.find(item => item.id === o.id)!
  expect(after.workItems).toHaveLength(1)
  expect(after.workBudgets).toHaveLength(1)
  expect(after.workBudgets![0]).toMatchObject({ id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt, runs: 2, retries: 1 })
  expect(after.runs.find(run => run.id === failed.id)?.status).toBe('failed')
  expect(result.runIds).toContain(failed.id)
  expect(result.turnIds).toHaveLength(2)
  expect(attempts).toBe(2)
})
it('accounts initial decisions, task steps and memory once while preserving unknown rate-limit attempts', async () => {
  const requests: { id: string; phase: string }[] = []
  let rejected = false
  const account = async (context: EngineContext, phase: string) => {
    expect(context.modelCallId).toBeTruthy()
    requests.push({ id: context.modelCallId!, phase })
    if (phase === 'decision' && context.agent.id === 'researcher' && !rejected) { rejected = true; throw Object.assign(new Error('rate limit'), { status: 429 }) }
    await context.onModelCallUsage!(context.modelCallId!, { inputTokens: 5, outputTokens: 7, totalTokens: 12 })
  }
  const f = await setup({ test: async () => '',
    decide: async context => { await account(context, 'decision'); return decide(context) },
    run: async context => {
      await account(context, 'execution')
      const extra = await context.onAdditionalModelCall!()
      requests.push({ id: extra as string, phase: 'execution' })
      await context.onModelCallUsage!(extra as string, { inputTokens: 5, outputTokens: 7, totalTokens: 12 })
      await deliver(context, '已交付结果')
    },
    extractMemory: async context => { await account(context, 'memory'); return [] },
  })
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'accounted' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'completed')
  const result = (await f.view()).occurrences.find(item => item.id === o.id)!
  expect(new Set(requests.map(request => request.id)).size).toBe(requests.length)
  expect(new Set(requests.map(request => request.phase))).toEqual(new Set(['decision', 'execution', 'memory']))
  expect(result).toMatchObject({ modelCalls: requests.length, usage: { inputTokens: (requests.length - 1) * 5, outputTokens: (requests.length - 1) * 7, totalTokens: (requests.length - 1) * 12 }, usageIncomplete: true })
  expect((await f.detail()).workBudgets![0]).toMatchObject({ id: o.budgetId, modelCalls: requests.length, unknownCalls: 1, runs: 1 })
  await f.service.close()
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
  try { expect((await store.load<BudgetModelCall>('budgetModelCalls')).map(call => call.id).sort()).toEqual(requests.map(request => request.id).sort()) } finally { await store.close() }
})
it('marks complete usage only when every request supplied its own usage receipt', async () => {
  let requests = 0
  const account = async (context: EngineContext) => { requests++; await context.onModelCallUsage!(context.modelCallId!, { inputTokens: 3, outputTokens: 2, totalTokens: 5 }) }
  const f = await setup({ test: async () => '', decide: async context => { await account(context); return decide(context) }, run: async context => { await account(context); await deliver(context, '完整用量结果') }, extractMemory: async context => { await account(context); return [] } })
  const o = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'all-known' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'completed')
  expect((await f.view()).occurrences.find(item => item.id === o.id)).toMatchObject({ usageIncomplete: false, modelCalls: requests, usage: { inputTokens: requests * 3, outputTokens: requests * 2, totalTokens: requests * 5 } })
})
it('atomically fences work publication after stop and preserves independent dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-fence-')), store = new ProductStore(join(root, 'db.sqlite'))
  await store.init(); disposers.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  const works = new WorkRepository(store); await works.init()
  const request: Message = { id: 'request', conversationId: 'chat', sequence: 1, senderType: 'user', senderId: 'automation', senderName: 'report', content: 'report', status: 'completed', createdAt: stamp, origin }
  await store.write([row('messages', request), row('automationOccurrences', occurrence())])
  const intent = { key: 'main', scope: '核查', deliverable: '结果' }
  const parent = await works.claim({ conversationId: 'chat', sourceMessageId: request.id, runId: 'root', agentId: 'lead', intent, origin })
  const child = await works.delegate('root', { ...intent, key: 'child', ownerAgentId: 'writer' })
  const independent = await works.claim({ conversationId: 'chat', sourceMessageId: 'human', runId: 'independent', agentId: 'writer', intent })
  await works.waitFor('root', { dependencies: [{ workId: independent.id, resultVersion: 1 }], nextStep: '等待独立结果' })
  await expect(works.claim({ conversationId: 'chat', sourceMessageId: 'human', agentId: 'lead', runId: 'adopt', intent: { ...intent, workId: parent.id, expectedVersion: parent.version } })).rejects.toThrow('改绑')
  await store.write([row('automationOccurrences', { ...occurrence(), status: 'cancelling', cancellationRequestedAt: stamp })])
  await expect(works.settle('root', { disposition: 'delivered', summary: 'late', evidence: [{ kind: 'answer', reference: 'late' }] }, { messageId: 'late', content: 'late', artifactIds: [] }, [row('messages', { ...request, id: 'late' })])).rejects.toThrow('停止')
  expect((await store.load<Message>('messages')).some(message => message.id === 'late')).toBe(false)
  const cancelled = await works.cancelTree(parent.id, '停止本次')
  expect(new Set(cancelled)).toEqual(new Set([parent.id, child.id]))
  expect((await works.view('chat')).workItems.find(work => work.id === independent.id)?.status).toBe('running')
  expect((await store.load<WorkExecution>('workExecutions')).find(run => run.id === 'root')?.origin).toEqual(origin)
  const repository = new AutomationRepository(store, root)
  await expect(repository.resume(origin, 'chat', [])).rejects.toThrow('停止或需要核对')
})

it('explicitly renews an expired clarification, keeps all accounting and ignores the previous deadline after delivery and restart', async () => {
  const engine = clarificationEngine(), contexts: EngineContext[] = [], baseDecide = engine.decide!
  engine.decide = async context => { contexts.push(context); return baseDecide(context) }
  const f = await setup(engine), first = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'expire-clarification' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'waiting_user')
  const internal = f.service as unknown as { store: ProductStore; automations: import('../src/runtime/modules/automations/automation-service').AutomationService }
  const before = (await f.detail()).workBudgets![0]
  await internal.store.write([row('workBudgets', { ...before, deadlineAt: new Date(0).toISOString() })])
  await internal.automations.stop(first.id, '时间预算到期', 'budget')
  const stopped = (await f.view()).occurrences[0]
  expect(stopped).toMatchObject({ status: 'cancelled', cancellationCause: 'budget' })
  await expect(f.service.handle('replyAutomation', { occurrenceId: first.id, content: '42', requestId: 'without-grant' })).rejects.toThrow()
  const input = { occurrenceId: first.id, content: '42', requestId: 'with-grant', renewBudget: { expectedVersion: stopped.stateVersion, allowance: 'standard-v1' } }
  const reply = await f.service.handle('replyAutomation', input) as Message
  await internal.automations.stop(first.id, '迟到的旧计时器', 'budget', 0)
  await until(async () => (await f.view()).occurrences[0]?.deliveryStatus === 'delivered')
  expect(await f.service.handle('replyAutomation', input)).toEqual(reply)
  await expect(f.service.handle('replyAutomation', { ...input, renewBudget: undefined })).rejects.toThrow('requestId')
  const detail = await f.detail(), after = (await f.view()).occurrences[0], budget = detail.workBudgets![0]
  expect(detail.workBudgets).toHaveLength(1)
  expect(budget).toMatchObject({ id: before.id, maxModelCalls: 48, maxRuns: 16, usageIncomplete: true })
  expect(budget.modelCalls).toBeGreaterThan(before.modelCalls)
  expect(budget.renewals).toHaveLength(1)
  expect(budget.renewals![0]).toMatchObject({ requestId: input.requestId, messageId: reply.id, turnId: reply.turnId, used: { modelCalls: before.modelCalls }, previousStatus: 'cancelled' })
  expect(after).toMatchObject({ id: first.id, budgetId: first.budgetId, status: 'completed', deliveryStatus: 'delivered' })
  expect(after.cancellationRequestedAt).toBeUndefined()
  expect(detail.workItems![0].sourceMessageId).toBe(first.messageId)
  expect(contexts.filter(c => c.triggerMessageId === reply.id).every(c => c.continuation?.originalRequestId === first.messageId && c.continuation?.replyToTurnIds.includes(first.turnId!))).toBe(true)
  const calls = contexts.length
  await f.service.close(); const restarted = await f.make()
  const restored = await restarted.handle('getConversation', { id: f.conversation.id }) as ConversationDetail
  expect(restored.workBudgets![0]).toEqual(budget)
  expect(contexts).toHaveLength(calls)
  expect(await restarted.handle('replyAutomation', input)).toEqual(reply)
})
it('resolves an explicitly retried initial judgment without hiding an unrelated failed judgment', async () => {
  let rejected = false
  const f = await setup({ test: async () => '', decide: async context => {
    if (context.agent.id === 'researcher' && !rejected) { rejected = true; throw new Error('最初判断未调用任何工具') }
    return decide(context)
  }, run: context => deliver(context, '初始判断续行后的结果') })
  const first = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'decision-failure' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'failed')
  const failed = (await f.detail()).runs.find(r => r.status === 'failed')!
  expect(failed.workId).toBeUndefined()
  await f.service.handle('retryRun', { id: failed.id, requestId: 'retry-decision' })
  await until(async () => (await f.view()).occurrences[0]?.deliveryStatus === 'delivered')
  const detail = await f.detail()
  expect(detail.runs.find(r => r.id === failed.id)?.status).toBe('failed')
  expect(detail.turns!.some(t => t.resumesRunIds?.includes(failed.id))).toBe(true)
  expect(detail.workBudgets).toHaveLength(1)
  const otherFailure = { ...failed, id: 'other-failed-decision', agentId: 'writer' }
  const projected = aggregateAutomation(first, { turns: detail.turns!, runs: [...detail.runs, otherFailure], messages: detail.messages, works: detail.workItems!, wakes: [], artifacts: [], verifiedArtifactIds: new Set(), activeRunIds: new Set(), activeTurnIds: new Set(), budget: detail.workBudgets![0] })
  expect(projected?.status).toBe('failed')
})
it('renews failed unfinished work under its original identity without repeating an already delivered independent work', async () => {
  const counts = new Map<string, number>()
  const f = await setup({ test: async () => '', decide: async context => {
    const decision = await decide(context)
    if (context.agent.id === 'writer' && !context.participation?.hasRespondedInTurn) return { ...decision, action: 'reply', responseKind: 'task', work: { key: 'other', scope: '独立交付', deliverable: '独立结果' } }
    return decision
  }, run: async context => {
    const key = context.work!.key
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (key === 'main' && counts.get(key) === 1) throw new Error('执行前失败，没有副作用')
    await deliver(context, `${key} 可检查结果`)
  } })
  const first = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'mixed-work' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'failed' && (await f.detail()).workItems?.some(w => w.status === 'delivered') === true)
  const internal = f.service as unknown as { store: ProductStore }, before = await f.detail()
  await internal.store.write([row('workBudgets', { ...before.workBudgets![0], deadlineAt: new Date(0).toISOString() })])
  const o = (await f.view()).occurrences[0]
  await f.service.handle('replyAutomation', { occurrenceId: first.id, content: '继续未完成部分，保留已交付结果', requestId: 'continue-mixed', renewBudget: { expectedVersion: o.stateVersion, allowance: 'standard-v1' } })
  await until(async () => (await f.view()).occurrences[0]?.deliveryStatus === 'delivered')
  const after = await f.detail()
  expect(after.workItems!.map(w => w.id).sort()).toEqual(before.workItems!.map(w => w.id).sort())
  expect(after.workItems!.find(w => w.key === 'other')).toEqual(before.workItems!.find(w => w.key === 'other'))
  expect(counts.get('other')).toBe(1)
  expect(counts.get('main')).toBe(2)
  expect(after.workBudgets).toHaveLength(1)
  expect(after.workBudgets![0].runs).toBe(3)
})
it('does not append a human message or grant after the occurrence authorization changes', async () => {
  const f = await setup(clarificationEngine()), first = await f.service.handle('runAutomation', { id: f.plan.id, requestId: 'renew-authorization' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'waiting_user')
  const store = (f.service as unknown as { store: ProductStore }).store, budget = (await f.detail()).workBudgets![0]
  await store.write([row('workBudgets', { ...budget, deadlineAt: new Date(0).toISOString() })])
  const agent = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
  await f.service.handle('saveAgent', { ...input, name: '配置已变更' })
  const o = (await f.view()).occurrences[0]
  await expect(f.service.handle('replyAutomation', { occurrenceId: first.id, content: '42', requestId: 'no-renew', renewBudget: { expectedVersion: o.stateVersion, allowance: 'standard-v1' } })).rejects.toThrow('配置已变更')
  const detail = await f.detail()
  expect(detail.workBudgets![0].renewals).toBeUndefined()
  expect(detail.messages.some(m => m.content === '42')).toBe(false)
})
