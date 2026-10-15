/*
 * [OUTPUT]: 手动和真实Mastra到点分别核对完整AppService双采集→结果唤醒→计算汇总→重启去重与跨员工重复创建/恢复身份验证。
 * [INPUT]: 自动化归属/分工合同、真实SQLite/WorkRepository及隔离AppService。
 * [OUTPUT]: 旧归属保守迁移、不可变执行快照、单负责人投递、真实依赖/重复委派/失败和撤权验证。
 * [POS]: 员工与群自动化EA0/EA2模块及宿主集成检查，不调用真实供应商。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore, type StoredRecord } from '../src/runtime/adapters/storage/product-store'
import { AutomationRepository } from '../src/runtime/modules/automations/automation-repository'
import { automationSchema } from '../src/runtime/modules/automations/automation-service'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { AppService } from '../src/runtime/service'
import type { EngineContext, AgentEngine } from '../src/runtime/contracts'
import type { AutomationCollaboration, AutomationDefinition, AutomationInput, AutomationOccurrence, AutomationOrigin, Conversation, ConversationDetail, Message, Snapshot, WorkItem } from '../src/shared/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const row = <T extends { id: string }>(collection: string, value: T): StoredRecord => ({ collection, id: value.id, value })
const collaboration: AutomationCollaboration = { coordinatorId: 'writer', assignments: [
  { employeeId: 'researcher', instruction: '采集本次销售数据', deliverable: '本次销售数据和来源', dependsOn: [] },
  { employeeId: 'reviewer', instruction: '采集本次成本数据', deliverable: '本次成本数据和来源', dependsOn: [] },
  { employeeId: 'writer', instruction: '读取本次销售和成本数据后汇总', deliverable: '本次利润分析', dependsOn: ['researcher', 'reviewer'] },
] }
const planInput = (patch: Partial<AutomationInput> = {}): AutomationInput => ({ owner: { kind: 'group', conversationId: 'owner-group' }, collaboration, name: '经营分析', prompt: '采集本次销售和成本，再总结利润', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false, ...patch })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-owners-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const automations = new AutomationRepository(store, root); await automations.migrate()
  return { root, store, automations }
}

it('requires a complete acyclic group plan and defaults explicit employee ownership to an isolated context', () => {
  expect(automationSchema.parse(planInput())).toMatchObject({ conversationPolicy: 'new-conversation', employeeIds: ['researcher', 'reviewer', 'writer'] })
  expect(automationSchema.parse(planInput({ owner: { kind: 'employee', employeeId: 'researcher' }, collaboration: undefined }))).toMatchObject({ conversationPolicy: 'new-conversation', employeeIds: ['researcher'] })
  for (const patch of [
    { collaboration: undefined }, { employeeIds: ['researcher', 'writer'] },
    { owner: { kind: 'employee' as const, employeeId: 'writer' } },
    { collaboration: { ...collaboration, coordinatorId: 'missing' } },
    { collaboration: { ...collaboration, assignments: [...collaboration.assignments, collaboration.assignments[0]] } },
    { collaboration: { ...collaboration, assignments: collaboration.assignments.map(a => a.employeeId === 'researcher' ? { ...a, dependsOn: ['writer'] } : a) } },
    { collaboration: { ...collaboration, assignments: collaboration.assignments.map(a => a.employeeId === 'writer' ? { ...a, dependsOn: ['researcher'] } : a) } },
  ]) expect(automationSchema.safeParse(planInput(patch)).success).toBe(false)
})

it('backfills only provable owners without changing legacy execution location, enabled state, receipts or history', async () => {
  const f = await fixture()
  const rooms = [{ id: 'direct', kind: 'direct', purpose: 'personal', agentIds: ['researcher'] }, { id: 'group', kind: 'group', agentIds: ['researcher', 'writer'] }, { id: 'channel', kind: 'group', purpose: 'channel', channel: { kind: 'group' }, agentIds: ['researcher'] }, { id: 'core', kind: 'direct', purpose: 'core', agentIds: ['researcher'] }]
  await f.store.write([...rooms.map(value => row('conversations', value)), ...['researcher', 'writer'].map(id => row('agents', { id, active: true }))])
  const definitions: AutomationDefinition[] = []
  for (const room of [...rooms, { id: 'deleted' }]) {
    const definition = await f.automations.save(automationSchema.parse(planInput({ owner: undefined, collaboration: undefined, conversationId: room.id, conversationPolicy: 'existing-conversation' })), 'original-authority')
    delete definition.owner; await f.store.write([row('automations', definition)]); definitions.push(definition)
  }
  await f.automations.migrateOwners()
  const migrated = await f.store.load<AutomationDefinition>('automations')
  for (const before of definitions) {
    const after = migrated.find(d => d.id === before.id)!
    const { owner, ...rest } = after; expect(rest).toEqual(before)
    expect(owner).toEqual(before.conversationId === 'direct' ? { kind: 'employee', employeeId: 'researcher' } : before.conversationId === 'group' ? { kind: 'group', conversationId: 'group' } : undefined)
  }
  expect(await f.store.load('automationOccurrences')).toEqual([])
  expect(await f.store.load('automationDispatches')).toEqual([])
  await f.automations.migrateOwners(); expect(await f.store.load('automations')).toEqual(migrated)
})

async function admitted() {
  const f = await fixture()
  await f.store.write([row('conversations', { id: 'owner-group', kind: 'group', agentIds: ['researcher', 'reviewer', 'writer'] }), ...['researcher', 'reviewer', 'writer'].map(id => row('agents', { id, active: true }))])
  const definition = await f.automations.save(automationSchema.parse(planInput()), 'allowed')
  const admitted = await f.automations.claim({ automationId: definition.id, source: 'manual', key: 'once', scheduledAt: Date.now() }, () => undefined, async (d, o) => [row('conversations', { id: o.conversationId, kind: 'group', purpose: 'automation', agentIds: d.employeeIds })])
  const o = admitted.occurrence, origin = admitted.dispatch!.origin!
  const message: Message = { id: 'source', turnId: 'first-turn', conversationId: o.conversationId, senderType: 'user', senderId: 'automation:' + definition.id, senderName: '计划', content: definition.prompt, status: 'completed', sequence: 1, createdAt: new Date().toISOString(), origin }
  await f.automations.commitDispatch(o.id, message, [row('messages', message)])
  const works = new WorkRepository(f.store); await works.init()
  return { ...f, definition, occurrence: o, origin, works, message }
}
async function claimNext(f: Awaited<ReturnType<typeof admitted>>, item: WorkItem, runId: string) {
  const current = (await f.works.view(f.occurrence.conversationId)).workItems.find(w => w.id === item.id)!
  expect(await f.works.scheduleWake(current.wakeId!, 'turn-' + runId, [])).toBe(true)
  return f.works.claim({ conversationId: current.conversationId, sourceMessageId: f.message.id, agentId: current.ownerAgentId, origin: f.origin, runId, wakeId: current.wakeId, intent: { key: current.key, scope: current.scope, deliverable: current.deliverable, workId: current.id, expectedVersion: current.version } })
}
const deliver = (works: WorkRepository, runId: string, content: string) => works.settle(runId, { disposition: 'delivered', summary: content, evidence: [{ kind: 'answer', reference: content }] }, { messageId: runId + '-result', content, artifactIds: [] })

it.each([false, true])('runs one frozen group root and waits for both actual collection results; failed dependency=%s', async failed => {
  const f = await admitted(), base = { conversationId: f.occurrence.conversationId, sourceMessageId: f.message.id, origin: f.origin, intent: { key: 'model-key', scope: '本次任务', deliverable: '分析报告' } }
  await expect(f.works.claim({ ...base, runId: 'intruder', agentId: 'researcher' })).rejects.toThrow('负责人')
  const parent = await f.works.claim({ ...base, runId: 'root', agentId: 'writer' })
  await expect(deliver(f.works, 'root', '已汇总')).rejects.toThrow('必需分工')
  const proposal = { key: 'first', scope: '模型改写', deliverable: '模型改写', ownerAgentId: 'researcher' }
  const first = await f.works.delegate('root', proposal), second = await f.works.delegate('root', { ...proposal, ownerAgentId: 'reviewer' })
  expect(first.scope).toBe(collaboration.assignments[0].instruction)
  expect((await f.works.delegate('root', { ...proposal, key: 'different-model-key' })).id).toBe(first.id)
  await expect(f.works.delegate('root', { ...proposal, ownerAgentId: 'writer' })).rejects.toThrow('固定分工')
  const changed = { ...collaboration, assignments: collaboration.assignments.map(a => ({ ...a, instruction: '明天的新要求' })) }
  await f.automations.save(automationSchema.parse(planInput({ id: f.definition.id, expectedRevision: f.definition.revision, collaboration: changed })), 'allowed')
  expect((await f.store.get<AutomationOccurrence>('automationOccurrences', f.occurrence.id))!.plan?.collaboration).toEqual(collaboration)
  await f.works.waitFor('root', { dependencies: [first, second].map(work => ({ workId: work.id, resultVersion: 1 })), nextStep: '使用本次两份数据汇总' })
  await f.works.settle('root', { disposition: 'waiting', summary: '等待采集' }, { messageId: 'waiting', content: '等待采集', artifactIds: [] })
  await claimNext(f, first, 'collect-sales'); await deliver(f.works, 'collect-sales', '销售100')
  expect((await f.works.view(f.occurrence.conversationId)).workItems.find(w => w.id === parent.id)!.status).toBe('waiting')
  await claimNext(f, second, 'collect-cost')
  if (failed) {
    await f.works.release('collect-cost', 'failed')
    const view = await f.works.view(f.occurrence.conversationId)
    expect(view.workItems.find(w => w.id === parent.id)!.status).toBe('blocked')
    expect(view.workWakes.find(w => w.workId === parent.id)?.kind).toBe('blocked')
  } else {
    await deliver(f.works, 'collect-cost', '成本40')
    await claimNext(f, parent, 'summary'); await deliver(f.works, 'summary', '本次利润60')
    expect((await f.works.view(f.occurrence.conversationId)).workItems).toHaveLength(3)
    expect((await f.works.view(f.occurrence.conversationId)).workItems.every(w => w.status === 'delivered')).toBe(true)
  }
})

it('revokes the running group plan when a required employee leaves the owner group', async () => {
  const f = await admitted()
  await f.store.write([row('conversations', { id: 'owner-group', kind: 'group', agentIds: ['writer', 'reviewer'] })])
  await expect(f.works.claim({ conversationId: f.occurrence.conversationId, sourceMessageId: f.message.id, origin: f.origin, agentId: 'writer', runId: 'root', intent: { key: 'main', scope: '汇总', deliverable: '报告' } })).rejects.toThrow('成员已失效')
})

it('deduplicates one group message across different employees and validates a resumed receipt identity', async () => {
  const f = await fixture(), source = { conversationId: 'owner-group', messageId: 'shared-message', agentId: 'writer' }
  const saved = await f.automations.save(automationSchema.parse(planInput({ requestId: 'writer-key' })), 'allowed', source)
  await expect(f.automations.save(automationSchema.parse(planInput({ requestId: 'other-key' })), 'allowed', { ...source, agentId: 'researcher' })).rejects.toThrow(saved.id)
  expect((await f.automations.view()).definitions).toHaveLength(1)
  await f.automations.save(automationSchema.parse(planInput({ id: saved.id, expectedRevision: 1, requestId: 'resume', enabled: true })), 'allowed')
  expect(await f.automations.mutation('resume', { id: saved.id, expectedRevision: 1 })).toMatchObject({ id: saved.id, revision: 2, enabled: true })
  await expect(f.automations.mutation('resume', { id: saved.id, expectedRevision: 2 })).rejects.toThrow('不同请求')
  await expect(f.automations.mutation('resume', { id: 'another', expectedRevision: 1 })).rejects.toThrow('不同请求')
})

it('dispatches only the coordinator in an isolated group and refuses to label chat-only output as the completed group job', async () => {
  const f = await fixture(), called: string[] = []
  const service = new AppService({ dataPath: f.root, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, engine: { test: async () => '', decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => { called.push(ctx.agent.id); await ctx.onDelta('尚未采集数据') } } })
  cleanup.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as { id: string }
  for (const id of ['researcher', 'writer', 'reviewer']) {
    const a = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === id)!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = a
    await service.handle('saveAgent', { ...input, connectionId: connection.id, allowCommands: false })
  }
  const group = await service.handle('createConversation', { kind: 'group', title: '经营组', agentIds: ['researcher', 'reviewer', 'writer'] }) as Conversation
  const definition = await service.handle('saveAutomation', planInput({ owner: { kind: 'group', conversationId: group.id } })) as AutomationDefinition
  const occurrence = await service.handle('runAutomation', { id: definition.id, requestId: 'first' }) as AutomationOccurrence
  const deadline = Date.now() + 8000
  let ended: AutomationOccurrence | undefined
  while (Date.now() < deadline) {
    ended = await f.store.get('automationOccurrences', occurrence.id)
    if (ended?.finishedAt) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(called).toEqual(['writer'])
  expect(ended).toMatchObject({ status: 'failed', deliveryStatus: 'unknown', reason: '本次群分工尚未全部交付' })
  expect(occurrence.conversationId).not.toBe(group.id)
  expect(await f.store.get('conversations', occurrence.conversationId)).toMatchObject({ kind: 'group', purpose: 'automation', agentIds: ['researcher', 'reviewer', 'writer'] })
})

it.each(['manual', 'calendar'] as const)('completes the actual %s group dispatch, dependency wake and final delivery once, then restarts without replay', async trigger => {
  const f = await fixture(), calls: string[] = []
  const finish = async (ctx: EngineContext, text: string) => { await ctx.onDelta(text); await ctx.onWorkOutcome!({ disposition: 'delivered', summary: text, evidence: [{ kind: 'answer', reference: text }] }) }
  const engine: AgentEngine = {
    report: async (_ctx, draft) => ({ action: 'publish', text: draft.text }),
    test: async () => '',
    decide: async (ctx: EngineContext) => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' as const : 'reply' as const, responseKind: 'task' as const, work: { key: 'analysis', scope: '采集后汇总', deliverable: '利润分析' }, observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }),
    run: async (ctx: EngineContext) => {
      calls.push(ctx.agent.id)
      if (ctx.agent.id === 'researcher') { await finish(ctx, '本次销售额：127'); return }
      if (ctx.agent.id === 'reviewer') { await finish(ctx, '本次成本额：43'); return }
      if (!ctx.work?.requiredResults.length) {
        const children = []
        for (const employeeId of ['researcher', 'reviewer']) children.push(await ctx.delegateWork!({ key: employeeId, ownerAgentId: employeeId, scope: '按冻结分工采集', deliverable: '本次数据' }))
        await ctx.waitForWork!({ dependencies: children.map(child => ({ workId: child.id, resultVersion: 1 })), nextStep: '读取两份本次数据计算利润' })
        await ctx.onDelta('已委派采集，等待两项真实结果。'); return
      }
      const texts = ctx.messages.filter(m => m.senderType === 'agent').map(m => m.content).join('\n')
      const sales = /本次销售额：(\d+)/.exec(texts), cost = /本次成本额：(\d+)/.exec(texts)
      expect(sales).not.toBeNull(); expect(cost).not.toBeNull()
      await finish(ctx, `本次利润：${Number(sales![1]) - Number(cost![1])}`)
    },
  }
  const make = async () => {
    const service = new AppService({ dataPath: f.root, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, engine })
    cleanup.push(() => service.close()); await service.init(); return service
  }
  const service = await make()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as { id: string }
  for (const id of ['researcher', 'reviewer', 'writer']) {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === id)!
    await service.handle('saveAgent', { ...input, connectionId: connection.id, allowCommands: false })
  }
  const group = await service.handle('createConversation', { kind: 'group', title: '本次数据组', agentIds: ['researcher', 'reviewer', 'writer'] }) as Conversation
  const due = new Date(Math.ceil((Date.now() + 4000) / 60000) * 60000)
  const definition = await service.handle('saveAutomation', planInput({ owner: { kind: 'group', conversationId: group.id }, ...(trigger === 'calendar' ? { enabled: true, timezone: 'UTC', time: due.toISOString().slice(11, 16) } : {}) })) as AutomationDefinition
  let occurrence: AutomationOccurrence
  if (trigger === 'manual') occurrence = await service.handle('runAutomation', { id: definition.id, requestId: 'actual-dispatch' }) as AutomationOccurrence
  else {
    await expect.poll(async () => (await f.store.load<AutomationOccurrence>('automationOccurrences')).length, { timeout: 75000, interval: 100 }).toBe(1)
    occurrence = (await f.store.load<AutomationOccurrence>('automationOccurrences'))[0]
    expect(occurrence).toMatchObject({ source: 'schedule', scheduledFor: due.toISOString() })
    expect(occurrence.nativeRunId).toBeTruthy()
  }
  await expect.poll(async () => (await f.store.get<AutomationOccurrence>('automationOccurrences', occurrence.id))?.finishedAt, { timeout: 10000 }).toBeTruthy()
  const detail = await service.handle('getConversation', { id: occurrence.conversationId }) as ConversationDetail
  expect(await f.store.get('automationOccurrences', occurrence.id), JSON.stringify({ calls, works: detail.workItems, runs: detail.runs.map(r => ({ agent: r.agentId, status: r.status, error: r.error })), messages: detail.messages.map(m => m.content) })).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
  expect(calls[0]).toBe('writer'); expect(calls.at(-1)).toBe('writer')
  expect(calls.filter(id => id === 'researcher')).toHaveLength(1); expect(calls.filter(id => id === 'reviewer')).toHaveLength(1)
  expect(detail.workItems).toHaveLength(3); expect(detail.workItems!.every(w => w.status === 'delivered')).toBe(true)
  expect(detail.messages.some(m => m.content === '本次利润：84')).toBe(true)
  const before = [...calls]
  await service.close(); const restored = await make()
  if (trigger === 'manual') expect(await restored.handle('runAutomation', { id: definition.id, requestId: 'actual-dispatch' })).toMatchObject({ id: occurrence.id })
  expect((await f.store.load<AutomationOccurrence>('automationOccurrences')).map(o => o.id)).toEqual([occurrence.id])
  expect(calls).toEqual(before)
  expect(await restored.handle('getConversation', { id: group.id })).toMatchObject({ messages: [], workItems: [] })
}, 90000)
