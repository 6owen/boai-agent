/*
 * [OUTPUT]: 验证默认无执行配额、旧默认精确迁移、显式预算仍执行以及用户取消；不调用真实供应商。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 真实 SQLite、bobo 核心来源/组织工作、群启动 CAS、原调用回执和会话清理。
 * [OUTPUT]: 新完整协作48/其他24首次事务、根子同ID共原期限；人为旧24重启/明确重认领/群根/子工作保持24，模型无法指定额度，输出等原限制不变。
 * [OUTPUT]: 固定组织权限/真实证据、两会话无父子共预算、逐调用已知/未知记账、原子发布/启动回滚、子工作/成员边界与重启不自动开工。
 * [POS]: BC3 模块合同；真实模型/桌面群协作由 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { collaborationMessageHash } from '../src/runtime/modules/collaboration/work-collaboration'
import { newWorkBudget, reserveBudgetCall } from '../src/runtime/modules/collaboration/work-budget'
import { workIntentSchema } from '../src/runtime/modules/collaboration/work-protocol'
import { GroupScheduler, type SchedulerHooks } from '../src/runtime/group-scheduler'
import { ConversationHistory } from '../src/runtime/modules/conversations/history'
import type { AgentRun, BudgetModelCall, ClearedBudgetModelCall, CollaborationStartIntent, Conversation, DigitalAgent, DiscussionTurn, Message, WorkBudget, WorkItem, WorkOrganization } from '../src/shared/domain'
import type { BoboCollaborationOperation } from '../src/shared/domain/bobo-collaboration'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const now = () => new Date().toISOString()
const employee = (id: string): DigitalAgent => ({ id, name: id, role: '处理真实工作', instructions: '按本人授权处理', color: '#336699', connectionId: 'connection', modelId: 'model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1, ...(id === 'bobo' ? { systemRole: 'core' as const } : {}) })
async function fixture(mode: WorkOrganization['mode'] = 'organize_and_execute', prior = true, native = false) {
  const path = await mkdtemp(join(tmpdir(), 'boai-collaboration-budget-')); cleanup.push(() => rm(path, { recursive: true, force: true }))
  const store = new ProductStore(join(path, 'product.sqlite')); await store.init(); cleanup.push(() => store.close())
  const works = new WorkRepository(store); await works.init()
  const agents = ['bobo', 'researcher', 'writer'].map(employee)
  if (native) { agents[0].executionBackend = { kind: 'codex-local', profileId: 'native' }; agents[0].connectionId = '' }
  const core: Conversation = { id: 'core-chat', kind: 'direct', purpose: 'core', title: '与 bobo 讨论', agentIds: ['bobo'], mode: 'natural', sharedKnowledgeIds: [], workspacePath: join(path, 'workspaces', 'core-chat'), createdAt: now(), updatedAt: now() }
  const source: Message = { id: 'source-user', conversationId: core.id, senderType: 'user', senderId: 'user', senderName: '本人', content: '请找研究和写作员工建群，并配合交付报告。', status: 'completed', sequence: 1, createdAt: now() }
  const organization: WorkOrganization = { requestId: `bobo-collaboration:${source.id}`, mode, goal: '合作完成有依据的报告' }
  const coreTurn: DiscussionTurn = { id: 'core-turn', conversationId: core.id, triggerMessageId: source.id, status: 'responding', generation: 0, createdAt: now(), modelCalls: 1, publicMessages: 0, collaborationRequestId: organization.requestId }
  const run = (id: string, overrides: Partial<AgentRun> = {}): AgentRun => ({ id, conversationId: core.id, turnId: coreTurn.id, agentId: 'bobo', agentName: 'bobo', triggerMessageId: source.id, messageId: `${id}-reply`, status: 'running', createdAt: now(), toolEvents: [], phase: 'execution', collaborationRequestId: organization.requestId, ...(native ? { backend: { kind: 'codex-local' as const, profileId: 'native', profileRevision: 1, externalInvocations: 2, sessionPolicy: 'fresh' as const, toolControl: 'host-bridge' as const } } : {}), ...overrides })
  const decisionRun = run('decision-run', { phase: 'decision', status: 'completed' }), organizationRun = run('organization-run')
  await store.write([...agents.map(agent => row('agents', agent)), row('conversations', core), row('messages', source), row('turns', coreTurn), row('runs', decisionRun), row('runs', organizationRun), row('profileModelCalls', { id: 'decision-known', runId: decisionRun.id, conversationId: core.id, phase: 'decision', startedAt: now(), ...(native ? { callUnit: 'external-turn' } : {}), budgetOwned: false, usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 } }), row('profileModelCalls', { id: 'decision-unknown', runId: decisionRun.id, conversationId: core.id, phase: 'decision', startedAt: now(), ...(native ? { callUnit: 'external-turn' } : {}), budgetOwned: false, usage: { outputTokens: 3 } })])
  const claim = { conversationId: core.id, sourceMessageId: source.id, agentId: 'bobo', runId: organizationRun.id, intent: { key: 'main', scope: '查找并组织员工', deliverable: '发布真实员工/群与组织回执' }, organization, ...(prior ? { priorDecision: { runId: decisionRun.id, callIds: ['decision-known', 'decision-unknown'] } } : {}) }
  const work = await works.claim(claim); organizationRun.workId = work.id
  await store.write([row('runs', organizationRun)])
  const group: Conversation = { id: 'collaboration-group', kind: 'group', title: '研究写作协作', agentIds: ['bobo', 'researcher', 'writer'], mode: 'natural', sharedKnowledgeIds: [], workspacePath: join(path, 'workspaces', 'collaboration-group'), createdAt: now(), updatedAt: now() }
  const announcement: Message = { id: 'actual-announcement', conversationId: group.id, senderType: 'agent', senderId: 'bobo', senderName: 'bobo', content: '目标是完成有依据的报告。研究员核对资料，写作员整理报告。', status: 'completed', sequence: 1, createdAt: now(), collaborationRequestId: organization.requestId, collaborationSource: { operationId: 'organization-operation', sourceRunId: organizationRun.id, toolCallId: 'actual-organize-tool' } }
  const operation: BoboCollaborationOperation = { id: 'organization-operation', schemaVersion: 1, requestId: organization.requestId, payloadHash: 'frozen-hash', version: 1, organizationWorkId: work.id, sourceConversationId: core.id, sourceMessageId: source.id, sourceMessageHash: collaborationMessageHash(source), mode, goal: organization.goal, budgetId: work.budgetId, contactRevision: 1, authority: { workId: work.id, runId: organizationRun.id, workVersion: work.version, sourceConversationId: core.id, sourceMessageId: source.id, agentConfigVersion: 1 }, existingMembers: agents.slice(1).map(agent => ({ agentId: agent.id, configVersion: agent.configVersion, name: agent.name, role: agent.role })), existingConnectionFingerprints: [], agents: [], connectionId: 'connection', modelId: 'model', connectionFingerprint: 'connection-hash', groupConversationId: group.id, conversation: group, announcement, announcementSource: { runId: organizationRun.id, toolCallId: 'actual-organize-tool' }, status: 'ready_to_commit', createdAt: now(), files: [], directories: [] }
  if (mode === 'employee_creation') { delete operation.groupConversationId; delete operation.conversation; delete operation.announcement; operation.existingMembers = []; operation.agents = [employee('new-employee')] }
  const publish = () => store.transaction(async tx => {
    for (const agent of operation.agents) await tx.put(row('agents', agent))
    if (operation.conversation && operation.announcement) { await tx.put(row('conversations', operation.conversation)); await tx.put(row('messages', operation.announcement)) }
    const binding = await works.bindGroupStart(tx, operation, operation.announcement)
    const committed = { ...operation, ...binding, status: 'committed' as const, committedAt: now() }
    await tx.put(row('boboCollaborations', committed)); return committed
  })
  const hooks: SchedulerHooks = { critical: operation => operation(), conversation: id => id === core.id ? core : group, agent: id => agents.find(agent => agent.id === id)!, message: id => id === source.id ? source : id === announcement.id ? announcement : undefined, decide: vi.fn(async (_turn, _event, delivery) => ({ action: 'pass' as const, observedThroughSequence: delivery.observedThroughSequence })), speak: vi.fn(async () => 'deferred' as const), settled: async () => {}, changed: () => {}, error: () => {} }
  // Production startup precedes these live turns; init here would simulate an unrelated restart.
  const scheduler = new GroupScheduler(store, hooks); cleanup.push(() => scheduler.close())
  return { path, store, works, agents, core, source, organization, organizationRun, decisionRun, coreTurn, claim, work, group, announcement, operation, publish, scheduler, hooks, run }
}
async function start(f: Awaited<ReturnType<typeof fixture>>) {
  const operation = await f.publish(), prepared = await f.store.transaction(tx => f.scheduler.prepareCollaborationStart(tx, operation.startIntentId!))
  if (!prepared) throw new Error('首次真实群启动缺少受理结果')
  return { operation, prepared }
}
async function claimRoot(f: Awaited<ReturnType<typeof fixture>>) {
  const started = await start(f)
  const run = f.run('group-root-run', { conversationId: f.group.id, turnId: started.prepared.turn.id, triggerMessageId: f.announcement.id })
  await f.store.write([row('runs', run)])
  const root = await f.works.claim({ conversationId: f.group.id, sourceMessageId: f.announcement.id, agentId: 'bobo', runId: run.id, intent: started.prepared.event.work! })
  run.workId = root.id; await f.store.write([row('runs', run)])
  return { ...started, root, run }
}

describe('bobo fixed organization authority and genuine delivery', () => {
  it.each(['organize_and_execute', 'organize_only', 'employee_creation'] as const)('starts %s with accounting and no implicit execution ceilings', async mode => {
    const f = await fixture(mode, false), budget = (await f.works.view(f.core.id)).workBudgets[0]!
    expect(budget).toMatchObject({ maxModelCalls: null, maxRuns: null, maxOutputTokens: null, maxWorkItems: null, maxRetries: null, maxReportRefreshes: null, maxNoProgress: null })
    expect(budget.deadlineAt).toBe('')
    await f.works.claim(f.claim)
    expect((await f.works.view(f.core.id)).workBudgets[0]).toEqual(budget)
    expect(() => workIntentSchema.parse({ ...f.claim.intent, organization: { mode, goal: '合作', maxModelCalls: 48 } })).toThrow()
  })
  it('does not impose default limits on ordinary, automated or organization work', async () => {
    const f = await fixture('organize_only', false)
    const ordinary = await f.works.claim({ ...f.claim, sourceMessageId: 'ordinary-user', runId: 'ordinary-run', organization: undefined })
    expect((await f.works.view(f.core.id)).workBudgets.find(budget => budget.id === ordinary.budgetId)).toMatchObject({ executionAllowanceVersion: 2, maxModelCalls: null, maxOutputTokens: null, maxRuns: null })
    const automation = newWorkBudget('automation-budget', { conversationId: f.core.id, origin: { kind: 'automation', automationId: 'automation', occurrenceId: 'occurrence', name: '定时任务', authorizedFingerprint: 'explicit-source' } }, 'organize_and_execute')
    expect(automation).toMatchObject({ executionAllowanceVersion: 2, maxModelCalls: null, maxOutputTokens: null, maxRuns: null })
  })
  it('retains a stored old twenty-four-call full organization through restart and explicit reclaim', async () => {
    const f = await fixture('organize_and_execute', false)
    const budget = { ...(await f.works.view(f.core.id)).workBudgets[0]!, maxModelCalls: 24 }
    await f.store.write([row('workBudgets', budget)])
    await f.works.release(f.organizationRun.id, 'failed')
    const restarted = new WorkRepository(f.store); await restarted.init()
    expect((await restarted.view(f.core.id)).workBudgets[0]).toEqual(budget)
    await restarted.authorizeRetry(f.work.id, 'bobo')
    const retry = f.run('explicit-organization-retry', { workId: f.work.id })
    await f.store.write([row('runs', retry)])
    await restarted.claim({ ...f.claim, runId: retry.id })
    const retained = (await restarted.view(f.core.id)).workBudgets[0]!
    expect(retained).toMatchObject({ id: budget.id, maxModelCalls: 24, deadlineAt: budget.deadlineAt, maxOutputTokens: null, maxRuns: null, retries: 1, runs: 2 })
  })
  it('keeps model intent limited to judgment and refuses caller-owned request identity', () => {
    expect(workIntentSchema.parse({ key: 'main', scope: '组织', deliverable: '真实组织回执', organization: { mode: 'organize_only', goal: '合作讨论' } }).organization?.mode).toBe('organize_only')
    expect(() => workIntentSchema.parse({ key: 'main', scope: '组织', deliverable: '回执', organization: { mode: 'organize_only', goal: '讨论', requestId: 'model-owned' } })).toThrow()
  })
  it('adopts only real decision call receipts once and preserves partial usage as unknown', async () => {
    const f = await fixture(), budget = (await f.works.view(f.core.id)).workBudgets[0]!
    expect(budget).toMatchObject({ accounting: 'model-calls-v1', collaborationRequestId: f.organization.requestId, runs: 1, modelCalls: 2, unknownCalls: 1, usage: { inputTokens: 20, outputTokens: 8, totalTokens: 25 }, usageIncomplete: true })
    expect(await f.works.claim(f.claim)).toEqual(f.work)
    expect((await f.works.view(f.core.id)).workBudgets[0]!.modelCalls).toBe(2)
    expect((await f.store.load<{ budgetOwned: boolean }>('profileModelCalls')).every(call => call.budgetOwned)).toBe(true)
    await expect(f.works.claim({ ...f.claim, runId: 'outsider', agentId: 'researcher' })).rejects.toThrow('bobo')
    await expect(f.store.transaction(tx => f.works.assertOrganizationHolder(tx, { ...f.operation.authority, agentConfigVersion: 2 }))).rejects.toThrow('配置')
  })
  it('refuses fake prior calls and rolls back the organization and all new budget receipts', async () => {
    const f = await fixture('organize_only', false)
    await f.works.release(f.organizationRun.id, 'failed')
    await f.store.write([row('messages', { ...f.source, id: 'second-source' }), row('runs', { ...f.decisionRun, id: 'second-decision', triggerMessageId: 'second-source' })])
    await expect(f.works.claim({ ...f.claim, sourceMessageId: 'second-source', runId: 'second-org', organization: { ...f.organization, requestId: 'bobo-collaboration:second-source' }, priorDecision: { runId: 'second-decision', callIds: ['decision-known'] } })).rejects.toThrow('回执')
    expect((await f.store.load<WorkItem>('workItems'))).toHaveLength(1); expect(await f.store.load('budgetModelCalls')).toEqual([])
  })
  it('will not convert a claimed full business work into an organization work', async () => {
    const f = await fixture('organize_only', false)
    await f.store.write([row('messages', { ...f.source, id: 'business-source' })])
    const business = await f.works.claim({ ...f.claim, sourceMessageId: 'business-source', runId: 'business-run', organization: undefined, intent: { key: 'main', scope: '直接完成报告', deliverable: '业务成果' } })
    await expect(f.works.claim({ ...f.claim, sourceMessageId: 'business-source', runId: 'new-run', organization: { ...f.organization, requestId: 'bobo-collaboration:business-source' }, intent: { ...f.claim.intent, workId: business.id, expectedVersion: business.version } })).rejects.toThrow('转换')
  })
  it.each(['employee_creation', 'organize_only'] as const)('publishes %s without any business root or startup intent', async mode => {
    const f = await fixture(mode), published = await f.publish()
    expect(published.groupRootWorkId).toBeUndefined(); expect(await f.store.load('collaborationStarts')).toEqual([])
    expect((await f.store.load<WorkItem>('workItems'))).toHaveLength(1)
    if (mode === 'employee_creation') { expect(await f.store.load<Message>('messages')).toEqual([f.source]); expect((await f.store.load<DigitalAgent>('agents')).map(agent => agent.id)).toContain('new-employee') }
    else { const announcement = (await f.store.load<Message>('messages')).find(message => message.id === f.announcement.id); expect(announcement).toMatchObject({ senderType: 'agent', senderId: 'bobo' }); expect(announcement?.runId).toBeUndefined() }
  })
  it('requires committed actual organization evidence and never turns it into group business delivery', async () => {
    const f = await fixture(), receipt = { messageId: 'org-result', content: '员工与独立群已经建立。', artifactIds: [] }
    await expect(f.works.settle(f.organizationRun.id, { disposition: 'delivered', summary: '已组织', evidence: [{ kind: 'answer', reference: '员工与独立群已经建立。' }] }, receipt)).rejects.toThrow('真实已提交')
    await expect(f.works.settle(f.organizationRun.id, { disposition: 'delivered', summary: '已组织', evidence: [{ kind: 'collaboration', reference: 'invented' }] }, receipt)).rejects.toThrow('真实已提交')
    const published = await f.publish()
    const result = await f.works.settle(f.organizationRun.id, { disposition: 'delivered', summary: '已组织', evidence: [{ kind: 'collaboration', reference: published.id }] }, receipt)
    expect(result.status).toBe('delivered'); expect((await f.works.view(f.group.id)).workItems[0]!.status).toBe('ready')
  })
})

describe('independent group root and original shared budget', () => {
  it.each([false, true])('new group and children share the original full-work allowance, retaining an old budget=%s', async old => {
    const f = await fixture('organize_and_execute', false)
    const initial = (await f.works.view(f.core.id)).workBudgets[0]!
    const original = old ? { ...initial, maxModelCalls: 24 } : initial
    if (old) await f.store.write([row('workBudgets', original)])
    const { root, run } = await claimRoot(f)
    const child = await f.works.delegate(run.id, { key: 'facts', scope: '核对数据', deliverable: '真实事实文件', ownerAgentId: 'researcher' })
    expect(root.budgetId).toBe(f.work.budgetId); expect(child.budgetId).toBe(root.budgetId)
    expect(root.parentWorkId).toBeUndefined(); expect(child.parentWorkId).toBe(root.id)
    const budgets = await f.store.load<WorkBudget>('workBudgets')
    expect(budgets).toHaveLength(1)
    expect(budgets[0]).toMatchObject({ id: original.id, maxModelCalls: old ? 24 : null, deadlineAt: original.deadlineAt, maxOutputTokens: null, maxRuns: null, maxWorkItems: null, maxReportRefreshes: null })
  })
  it('binds one bobo root and one startup intent in the publication transaction, without a cross-conversation parent', async () => {
    const f = await fixture(), published = await f.publish(), root = (await f.works.view(f.group.id)).workItems[0]!
    expect(root).toMatchObject({ ownerAgentId: 'bobo', rootWorkId: root.id, budgetId: f.work.budgetId, collaborationRequestId: f.organization.requestId, sourceMessageId: f.announcement.id, status: 'ready' }); expect(root.parentWorkId).toBeUndefined()
    const prior = (await f.works.view(f.core.id)).workBudgets[0]!
    const duplicate = await f.store.transaction(tx => f.works.bindGroupStart(tx, published, f.announcement))
    expect(duplicate?.groupRootWorkId).toBe(root.id); expect((await f.works.view(f.core.id)).workBudgets[0]).toEqual(prior)
    expect(await f.store.load('collaborationStarts')).toHaveLength(1); expect((await f.store.load<Conversation>('conversations')).find(item => item.id === f.core.id)).toEqual(f.core)
  })
  it('rolls back group/root/start intent and counters together when publication fails', async () => {
    const f = await fixture(), prior = (await f.works.view(f.core.id)).workBudgets[0]!
    await expect(f.store.transaction(async tx => { await tx.put(row('conversations', f.group)); await tx.put(row('messages', f.announcement)); await f.works.bindGroupStart(tx, f.operation, f.announcement); await tx.put(row('boboCollaborations', { id: 'bad', value: BigInt(1) })) })).rejects.toThrow()
    expect((await f.store.load<Conversation>('conversations')).map(item => item.id)).toEqual([f.core.id]); expect(await f.store.load('collaborationStarts')).toEqual([]); expect((await f.works.view(f.core.id)).workBudgets[0]).toEqual(prior)
  })
  it('CAS consumes the actual bobo announcement only once and creates all member deliveries before any scheduling', async () => {
    const f = await fixture(), published = await f.publish()
    const results = await Promise.all([f.store.transaction(tx => f.scheduler.prepareCollaborationStart(tx, published.startIntentId!)), f.store.transaction(tx => f.scheduler.prepareCollaborationStart(tx, published.startIntentId!))])
    const prepared = results.find(Boolean)!
    expect(results.filter(Boolean)).toHaveLength(1); expect(prepared.event.type).toBe('collaboration_start'); expect(prepared.event.messageId).toBe(f.announcement.id); expect(prepared.turn.workId).toBe(published.groupRootWorkId)
    expect(prepared.deliveries.map(delivery => delivery.agentId)).toEqual(['bobo', 'researcher', 'writer']); expect(f.hooks.decide).not.toHaveBeenCalled(); expect(f.hooks.speak).not.toHaveBeenCalled()
    expect((await f.store.load<Message>('messages')).filter(message => message.senderType === 'user')).toEqual([f.source])
    expect((await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]).toMatchObject({ status: 'consumed', turnId: prepared.turn.id })
  })
  it('starts only the actual bobo root deterministically while preserving real member decision provenance', async () => {
    const f = await fixture(), { prepared } = await start(f)
    const decide = vi.mocked(f.hooks.decide)
    decide.mockImplementation(async (_turn, _event, delivery) => ({ action: 'pass', observedThroughSequence: delivery.observedThroughSequence, sourceDecisionRunId: `${delivery.agentId}-real-decision-run` }))
    f.scheduler.accept(prepared)
    await vi.waitFor(() => expect(f.hooks.speak).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(f.scheduler.decisions.size).toBe(3))
    expect(decide.mock.calls.map(call => call[2].agentId).sort()).toEqual(['researcher', 'writer'])
    const root = [...f.scheduler.decisions.values()].find(decision => decision.agentId === 'bobo')!
    expect(root).toMatchObject({ action: 'reply', responseKind: 'task', work: { workId: prepared.turn.workId } }); expect(root.sourceDecisionRunId).toBeUndefined()
    expect([...f.scheduler.decisions.values()].find(decision => decision.agentId === 'researcher')?.sourceDecisionRunId).toBe('researcher-real-decision-run')
    expect((f.scheduler.turns.get(prepared.turn.id) as DiscussionTurn & { decisionCalls: number }).decisionCalls).toBe(2)
  })
  it('does not consume a startup when its transaction rolls back and never auto-starts pending work after restart', async () => {
    const f = await fixture(), published = await f.publish()
    await expect(f.store.transaction(async tx => { await f.scheduler.prepareCollaborationStart(tx, published.startIntentId!); throw new Error('commit failed') })).rejects.toThrow('commit failed')
    expect((await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]!.status).toBe('pending'); expect((await f.store.load<DiscussionTurn>('turns')).filter(turn => turn.conversationId === f.group.id)).toEqual([])
    await new WorkRepository(f.store).init()
    expect((await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]!.status).toBe('interrupted')
    await expect(f.store.transaction(tx => f.scheduler.prepareCollaborationStart(tx, published.startIntentId!))).rejects.toThrow('不自动重放'); expect(f.hooks.decide).not.toHaveBeenCalled()
  })
  it('explicitly resumes an unconsumed restarted group with the same root, budget and deadline exactly once', async () => {
    const f = await fixture(), operation = await f.publish(), before = (await f.works.view(f.group.id)).workBudgets[0]!
    await new WorkRepository(f.store).init()
    const interrupted = (await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]!
    const prepared = await f.store.transaction(async tx => { await f.works.resumeCollaborationStart(tx, interrupted.id); return f.scheduler.prepareCollaborationStart(tx, interrupted.id) })
    expect(prepared?.turn.workId).toBe(operation.groupRootWorkId); expect(prepared?.event.messageId).toBe(f.announcement.id)
    expect((await f.works.view(f.group.id)).workBudgets[0]).toEqual(before)
    const consumed = (await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]!
    expect(await f.store.transaction(tx => f.works.resumeCollaborationStart(tx, interrupted.id))).toEqual(consumed)
    expect(await f.store.transaction(tx => f.scheduler.prepareCollaborationStart(tx, interrupted.id))).toBeNull()
    expect((await f.store.load<DiscussionTurn>('turns')).filter(turn => turn.conversationId === f.group.id)).toHaveLength(1)
    expect(f.hooks.decide).not.toHaveBeenCalled(); expect(f.hooks.speak).not.toHaveBeenCalled()
  })
  it('rolls back explicit startup restoration and refuses expired budgets or any previous execution', async () => {
    const f = await fixture(), operation = await f.publish(); await new WorkRepository(f.store).init()
    const root = (await f.works.view(f.group.id)).workItems[0]!, intent = (await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]!
    await expect(f.store.transaction(async tx => { await f.works.resumeCollaborationStart(tx, intent.id); throw new Error('rollback explicit start') })).rejects.toThrow('rollback explicit start')
    expect((await f.works.view(f.group.id)).workItems[0]).toEqual(root); expect((await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]).toEqual(intent)
    const budget = (await f.works.view(f.group.id)).workBudgets[0]!
    await f.store.write([row('workBudgets', { ...budget, deadlineAt: new Date(0).toISOString() })])
    await expect(f.store.transaction(tx => f.works.resumeCollaborationStart(tx, intent.id))).rejects.toThrow('上限')
    await f.store.write([row('workBudgets', budget), row('workExecutions', { id: 'already-executed', workId: operation.groupRootWorkId!, budgetId: budget.id, agentId: 'bobo', claimVersion: root.version, modelCalls: 1, usage: {}, status: 'released', pendingEffects: 1 })])
    await expect(f.store.transaction(tx => f.works.resumeCollaborationStart(tx, intent.id))).rejects.toThrow('已执行')
    expect((await f.store.load<CollaborationStartIntent>('collaborationStarts'))[0]?.status).toBe('interrupted')
  })
  it('resumes only audited original organization files and confirms their effects after actual publication', async () => {
    const f = await fixture(), before = (await f.works.view(f.core.id)).workBudgets[0]!
    await f.store.write([row('boboCollaborations', { ...f.operation, status: 'interrupted' })]); await f.works.markEffect(f.organizationRun.id); await f.works.release(f.organizationRun.id, 'interrupted')
    await f.store.write([row('runs', { ...f.organizationRun, status: 'interrupted' })])
    const recoveryTurn = { ...f.coreTurn, id: 'file-recovery-turn' }, recoveryRun = f.run('file-recovery-run', { turnId: recoveryTurn.id })
    const work = await f.store.transaction(async tx => { await tx.put(row('turns', recoveryTurn)); await tx.put(row('runs', recoveryRun)); return f.works.claimOrganizationRecovery(tx, f.operation, recoveryRun.id, recoveryTurn.id) })
    const authority = { ...f.operation.authority, runId: recoveryRun.id, workVersion: work.version }
    recoveryRun.workId = work.id; await f.store.write([row('runs', recoveryRun)]); f.operation.authority = authority
    const after = (await f.works.view(f.core.id)).workBudgets[0]!
    expect(after).toEqual({ ...before, runs: before.runs + 1 }); expect(work.id).toBe(f.work.id); expect(work.requiresReview).toBe(true)
    await expect(f.works.confirmEffect(recoveryRun.id)).rejects.toThrow('尚未真实提交')
    await expect(f.works.finishOrganizationRecovery(recoveryRun.id, f.operation.id)).rejects.toThrow('尚未真实交付')
    const published = await f.publish(); expect(published.announcementSource.runId).toBe(f.organizationRun.id); expect(published.authority.runId).toBe(recoveryRun.id)
    await f.works.confirmEffect(recoveryRun.id)
    const executions = await f.store.load<{ id: string; pendingEffects?: number }>('workExecutions'); expect(executions.every(execution => !execution.pendingEffects)).toBe(true)
    const priorMessages = await f.store.load<Message>('messages'), settled = await f.works.finishOrganizationRecovery(recoveryRun.id, published.id)
    expect(settled.status).toBe('delivered'); expect(settled.requiresReview).toBe(false); expect(settled.resultMessageIds).toEqual([]); expect(settled.outcome?.evidence).toEqual([{ kind: 'collaboration', reference: published.id }]); expect(await f.store.load<Message>('messages')).toEqual(priorMessages); expect(await f.store.load('budgetModelCalls')).toHaveLength(2)
    expect(f.hooks.decide).not.toHaveBeenCalled(); expect(f.hooks.speak).not.toHaveBeenCalled()
  })
  it('refuses organization recovery after a stop, a changed source, or an unrelated unknown effect', async () => {
    const f = await fixture('organize_only', false)
    await f.store.write([row('boboCollaborations', { ...f.operation, status: 'interrupted' })]); await f.works.release(f.organizationRun.id, 'failed')
    const recoveryTurn = { ...f.coreTurn, id: 'recovery-turn' }, run = f.run('recovery-run', { turnId: recoveryTurn.id })
    await f.store.write([row('turns', recoveryTurn), row('runs', run)])
    await f.store.write([row('messages', { ...f.source, content: '变更后的其它需求' })])
    await expect(f.store.transaction(tx => f.works.claimOrganizationRecovery(tx, f.operation, run.id, recoveryTurn.id))).rejects.toThrow('安全接续')
    await f.store.write([row('messages', f.source), row('workExecutions', { id: 'unknown-other', workId: f.work.id, budgetId: f.work.budgetId, agentId: 'bobo', claimVersion: 2, modelCalls: 1, usage: {}, status: 'released', pendingEffects: 1 })])
    await expect(f.store.transaction(tx => f.works.claimOrganizationRecovery(tx, f.operation, run.id, recoveryTurn.id))).rejects.toThrow('未知工具')
    const work = (await f.works.view(f.core.id)).workItems[0]!
    await f.store.write([row('workItems', { ...work, status: 'cancelled', cancellationCause: 'user' })])
    await expect(f.store.transaction(tx => f.works.claimOrganizationRecovery(tx, f.operation, run.id, recoveryTurn.id))).rejects.toThrow('安全接续')
    expect((await f.works.view(f.core.id)).workBudgets[0]!.runs).toBe(1)
  })
  it('admits an honestly blocked known publisher failure without replaying the model or clearing unknown file effects early', async () => {
    const f = await fixture('organize_only', false)
    await f.store.write([row('boboCollaborations', { ...f.operation, status: 'needs_attention' })]); await f.works.markEffect(f.organizationRun.id)
    const blocked = await f.works.settle(f.organizationRun.id, { disposition: 'blocked', summary: '受管员工文件发布失败，需要明确核对。' }, { messageId: 'failure-report', content: '受管员工文件发布失败，需要明确核对。', artifactIds: [] })
    const recoveryTurn = { ...f.coreTurn, id: 'blocked-recovery-turn' }, recoveryRun = f.run('blocked-recovery-run', { turnId: recoveryTurn.id })
    const restored = await f.store.transaction(async tx => { await tx.put(row('turns', recoveryTurn)); await tx.put(row('runs', recoveryRun)); return f.works.claimOrganizationRecovery(tx, f.operation, recoveryRun.id, recoveryTurn.id) })
    expect(restored).toMatchObject({ id: blocked.id, status: 'running', budgetId: blocked.budgetId, requiresReview: true })
    expect((await f.store.load<{ id: string; pendingEffects: number }>('workExecutions')).find(execution => execution.id === f.organizationRun.id)?.pendingEffects).toBe(1)
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toMatchObject({ runs: 2, modelCalls: 0, noProgress: 1 })
    await expect(f.works.confirmEffect(recoveryRun.id)).rejects.toThrow('尚未真实提交')
    expect(f.hooks.decide).not.toHaveBeenCalled(); expect(f.hooks.speak).not.toHaveBeenCalled()
  })
  it('refuses extra roots, missing original budgets and nonmember task owners', async () => {
    const f = await fixture(), { operation, prepared } = await start(f)
    await expect(f.works.claim({ conversationId: f.group.id, sourceMessageId: f.announcement.id, agentId: 'researcher', runId: 'freeform-task', intent: { key: 'whole-goal', scope: f.organization.goal, deliverable: '整个报告' } })).rejects.toThrow('固定')
    await f.store.write([{ collection: 'workBudgets', id: operation.budgetId, value: { id: operation.budgetId } }])
    await expect(f.works.claim({ conversationId: f.group.id, sourceMessageId: f.announcement.id, agentId: 'bobo', runId: 'root-run', intent: prepared.event.work! })).rejects.toThrow('预算')
    expect((await f.store.load<WorkItem>('workItems')).find(work => work.id === operation.groupRootWorkId)?.activeRunId).toBeUndefined()
  })
  it('charges all actual group phases to the same ledger, keeps unknown usage, and refuses ordinary/counterfeit turns', async () => {
    const f = await fixture(), { prepared, run } = await claimRoot(f)
    const original = (await f.works.view(f.core.id)).workBudgets[0]!
    await f.works.reserveCollaborationCall(f.organizationRun, 'organization-step', 'execution')
    await f.works.reserveCollaborationCall(run, 'group-step', 'execution'); await f.works.reserveCollaborationCall(run, 'group-step', 'execution')
    await f.works.settleCollaborationCall(run.id, 'group-step', { inputTokens: 10, outputTokens: 4, totalTokens: 14 }); await f.works.settleCollaborationCall(run.id, 'group-step', { inputTokens: 8, outputTokens: 4, totalTokens: 12 })
    await f.works.usage(run.id, { inputTokens: 9999, outputTokens: 9999, totalTokens: 19998 })
    const member = f.run('member-decision', { conversationId: f.group.id, agentId: 'researcher', turnId: prepared.turn.id, triggerMessageId: f.announcement.id, phase: 'decision' })
    await f.store.write([row('runs', member)]); await f.works.reserveCollaborationCall(member, 'member-call', 'decision')
    const budget = (await f.works.view(f.group.id)).workBudgets[0]!
    expect(budget).toMatchObject({ id: original.id, modelCalls: 5, runs: 2, unknownCalls: 3, deadlineAt: original.deadlineAt, usage: { inputTokens: 30, outputTokens: 12, totalTokens: 39 } })
    await expect(f.works.reserveCall(run.id)).rejects.toThrow('唯一请求账本')
    await expect(f.works.reserveCollaborationCall(run, 'pretend-memory', 'memory')).rejects.toThrow('阶段')
    const ordinary = { ...member, id: 'ordinary-chat', turnId: 'ordinary-turn' }
    await f.store.write([row('runs', ordinary), row('turns', { ...prepared.turn, id: 'ordinary-turn', collaborationRequestId: undefined, workId: undefined })])
    await expect(f.works.reserveCollaborationCall(ordinary, 'ordinary-call', 'decision')).rejects.toThrow('普通聊天')
  })
  it('inherits the group authority into real dependent children and never delegates employees from the core organization stage', async () => {
    const f = await fixture(), { root, run } = await claimRoot(f)
    await expect(f.works.delegate(f.organizationRun.id, { key: 'hidden', scope: '私下处理', deliverable: '报告', ownerAgentId: 'researcher' })).rejects.toThrow('后台')
    const first = await f.works.delegate(run.id, { key: 'research', scope: '核对资料', deliverable: '可核对研究', ownerAgentId: 'researcher' })
    const second = await f.works.delegate(run.id, { key: 'write', scope: '根据研究写作', deliverable: '报告', ownerAgentId: 'writer', dependencies: [{ workId: first.id, resultVersion: 1 }] })
    expect(first).toMatchObject({ budgetId: root.budgetId, rootWorkId: root.id, parentWorkId: root.id, collaborationRequestId: f.organization.requestId }); expect(second.status).toBe('waiting')
    const prepared = f.scheduler.prepareWork(f.group, f.announcement, first, first.wakeId!, 1)
    expect(prepared.turn.collaborationRequestId).toBe(f.organization.requestId); expect(prepared.event.collaborationRequestId).toBe(f.organization.requestId)
    const answer = { ...f.source, id: 'explicit-work-answer', conversationId: f.group.id }, continuation = f.scheduler.prepareQuestionReply(f.group, answer, prepared.turn.id, first.ownerAgentId, first)
    expect(continuation.turn.collaborationRequestId).toBe(f.organization.requestId); expect(continuation.event.collaborationRequestId).toBe(f.organization.requestId)
    await expect(f.works.delegate(run.id, { key: 'outsider', scope: '处理', deliverable: '报告', ownerAgentId: 'outside' })).rejects.toThrow('本群')
  })
  it('clears private source history while retaining group authority, cumulative budget and minimum old-call dedupe', async () => {
    const f = await fixture(), { prepared } = await start(f)
    await f.works.settle(f.organizationRun.id, { disposition: 'delivered', summary: '组织完成', evidence: [{ kind: 'collaboration', reference: f.operation.id }] }, { messageId: 'org-result', content: '组织完成', artifactIds: [] })
    const prior = (await f.works.view(f.group.id)).workBudgets[0]!
    await new ConversationHistory(f.store, f.path).clear(f.core, false)
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toEqual(prior); expect((await f.store.load<WorkItem>('workItems'))).toHaveLength(1)
    const tombstones = await f.store.load<ClearedBudgetModelCall>('budgetModelCalls')
    expect(tombstones).toHaveLength(2); expect(tombstones.every(call => call.status === 'cleared')).toBe(true); expect(JSON.stringify(tombstones)).not.toContain('source-user')
    await f.works.settleCollaborationCall(f.decisionRun.id, 'decision-unknown', { inputTokens: 1, outputTokens: 100, totalTokens: 101 })
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toEqual(prior)
    await expect(f.store.transaction(tx => reserveBudgetCall(tx, structuredClone(prior), { id: 'decision-known', runId: f.decisionRun.id, turnId: f.coreTurn.id, conversationId: f.core.id, phase: 'decision', collaborationRequestId: f.organization.requestId }))).rejects.toThrow('清理')
    const member = f.run('remaining-group-call', { conversationId: f.group.id, turnId: prepared.turn.id, agentId: 'researcher', triggerMessageId: f.announcement.id, phase: 'decision' })
    await f.store.write([row('runs', member)]); await f.works.reserveCollaborationCall(member, 'remaining-call', 'decision')
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]!.modelCalls).toBe(prior.modelCalls + 1)
    expect((await f.store.load<DigitalAgent>('agents')).map(agent => agent.id)).toEqual(['bobo', 'researcher', 'writer'])
    await new WorkRepository(f.store).init(); expect((await f.store.load<WorkBudget>('workBudgets'))[0]!.workItems).toBe(prior.workItems)
  })
})

it('native organization and an API child share ownership while only the API child consumes budget', async () => {
  const f = await fixture('organize_and_execute', true, true)
  const budget = () => f.store.transaction(tx => tx.get<WorkBudget>('workBudgets', f.work.budgetId))
  expect(await budget()).toMatchObject({ callUnit: 'mixed', modelCalls: 0, unknownCalls: 0 })
  expect((await budget())!.deadlineAt).toBe('')
  await f.works.reserveCollaborationCall(f.organizationRun, 'native-execution', 'execution')
  await f.works.settleCollaborationCall(f.organizationRun.id, 'native-execution', { inputTokens: 10, outputTokens: 2, totalTokens: 12 })
  expect((await budget())!.unknownCalls).toBe(0)
  await f.works.settleCollaborationCall(f.organizationRun.id, 'native-execution', { inputTokens: 10, outputTokens: 2, totalTokens: 12 }, true)
  expect((await budget())!.unknownCalls).toBe(0)
  await f.works.settleCollaborationCall(f.organizationRun.id, 'native-execution', { outputTokens: 4 }, true)
  expect((await budget())!.unknownCalls).toBe(0)
  const { root, run, prepared } = await claimRoot(f)
  const child = await f.works.delegate(run.id, { key: 'api-child', ownerAgentId: 'researcher', scope: '核查', deliverable: '核查结果' })
  const api = f.run('api-child-run', { agentId: 'researcher', backend: undefined, conversationId: f.group.id, turnId: prepared.turn.id, triggerMessageId: f.announcement.id, workId: child.id })
  await f.store.write([row('runs', api)])
  expect(await f.works.scheduleWake(child.wakeId!, prepared.turn.id, [])).toBe(true)
  await f.works.claim({ conversationId: f.group.id, sourceMessageId: f.announcement.id, agentId: 'researcher', runId: api.id, wakeId: child.wakeId, intent: { key: child.key, scope: child.scope, deliverable: child.deliverable, workId: child.id, expectedVersion: child.version } })
  await f.works.reserveCollaborationCall(api, 'api-call', 'execution')
  await f.works.settleCollaborationCall(api.id, 'api-call', { inputTokens: 2, outputTokens: 1, totalTokens: 3 })
  const call = (await f.store.load<BudgetModelCall>('budgetModelCalls')).find(call => call.id === 'api-call')!
  expect(call.callUnit).toBeUndefined(); expect(call.usageComplete).toBe(true)
  expect(child.budgetId).toBe(root.budgetId); expect(root.budgetId).toBe(f.work.budgetId)
  expect((await budget())!.deadlineAt).toBe('')
  const changed = { ...f.agents[0], executionBackend: { kind: 'mastra-model' as const } }
  await f.store.write([row('agents', changed)])
  await expect(f.works.reserveCollaborationCall(run, 'wrong-runtime', 'execution')).rejects.toThrow('运行方式')
})
