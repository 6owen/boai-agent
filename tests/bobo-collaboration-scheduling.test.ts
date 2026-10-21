/*
 * [OUTPUT]: 调度夹具经公共saveAgent核对命令关闭实际保存，原权限/并发/退出/超时断言保持。
 * [OUTPUT]: 已交付员工的后续判断沿真实业务消息事件，Run仍保留原公告身份；原首轮和已分工等待的跳过合同不混为一谈。
 * [OUTPUT]: API专用夹具保留明确connection前提，兼容运行时上下文的可选API连接。
 * [INPUT]: 真实 AppService/SQLite/组织发布和工作接续，带明确开始/实际退出屏障的内部模型协议。
 * [OUTPUT]: 失败群业务根重试的判断/执行继续原预算；群内bobo未选连接沿首个有效默认模型且不获得组织权限。
 * [OUTPUT]: 无关历史清理后组织继续并真实交付；依赖成果经宿主来源/hash 核对后提供确切路径，依赖引用不变成本人产物。
 * [OUTPUT]: 新完整组织的原共享额度固定48次，真实定向执行仍验证24次内完成和零未知账本；原存储预算不提升。
 * [OUTPUT]: 已分工员工的真实广播更新在模型计数前跳过，合并邀请/普通聊天/用户/未分工及来源本人问题/待核对仍保持判断；同请求定向工作在慢开场结束前交付、未拥有工作/普通 peer 无权抢 wake、同员工取消后实际退出再接续；普通用户群仍单 lane、原预算与一次认领保持。
 * [POS]: BC 群工作调度业务意图；内部确定性模型不计为真实供应商或人工质量验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import { publishArtifact } from '../src/runtime/modules/workspaces/file-access'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { AgentDelivery, AgentRun, Connection, Conversation, ConversationDetail, ConversationEvent, DigitalAgent, DiscussionTurn, Message, ParticipationDecision, Snapshot, WorkItem } from '../src/shared/domain'
import type { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { BoboCollaborationReceipt } from '../src/shared/domain/bobo-collaboration'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  cleanup.push(async () => release())
  return { promise, release }
}
async function account(context: EngineContext, phase: 'decision' | 'task' | 'chat' | 'report') {
  await context.onModelCallStarted!(context.modelCallId!, phase)
  await context.onModelCallUsage!(context.modelCallId!, { inputTokens: 10, outputTokens: 5, totalTokens: 15 })
}
async function fixture(options: { ordinary?: boolean; rootWait?: ReturnType<typeof barrier>; chatOwner?: 'researcher' | 'writer'; chatWait?: ReturnType<typeof barrier>; childWait?: ReturnType<typeof barrier>; secondChild?: boolean; dependentWriter?: boolean; delegateAfterChat?: boolean; clearUnrelatedDuringOrganization?: boolean; publishChildArtifact?: boolean; failRootOnce?:boolean } = {}) {
  const path = await mkdtemp(join(tmpdir(), 'boai-bobo-scheduling-')); cleanup.push(() => rm(path, { recursive: true, force: true }))
  const state = { receipt: undefined as BoboCollaborationReceipt | undefined, group: undefined as Conversation | undefined, children: [] as WorkItem[], rootEntered: false, rootFailed:false, chatEntered: false, childRuns: [] as EngineContext[], tasklessResponses: [] as string[], decisions: [] as EngineContext[], illegalDecision: undefined as WorkItem | 'no-work' | undefined }
  const chatStarted = barrier()
  const engine: AgentEngine = {
    test: async () => 'connected',
    decide: async context => {
      await account(context, 'decision'); state.decisions.push(context)
      const observedThroughSequence = context.participation!.observedThroughSequence
      if (context.conversation.purpose === 'core') return { action: 'reply', responseKind: 'task', observedThroughSequence, work: { key: 'main', scope: '组织独立员工', deliverable: '真实组织回执', organization: { mode: 'organize_and_execute', goal: '核查数据后汇总' } } }
      if (options.failRootOnce && state.rootFailed && context.agent.id==='bobo' && context.participation?.isFirstDecision) {
        const work=context.workItems!.find(work=>work.ownerAgentId==='bobo' && !work.parentWorkId)!
        return {action:'reply',responseKind:'task',observedThroughSequence,work:{workId:work.id,expectedVersion:work.version,key:work.key,scope:work.scope,deliverable:work.deliverable}}
      }
      if (state.illegalDecision) {
        const work = state.illegalDecision === 'no-work' ? undefined : state.illegalDecision
        return { action: 'reply', responseKind: 'task', observedThroughSequence, ...(work ? { work: { key: work.key, scope: work.scope, deliverable: work.deliverable, workId: work.id, expectedVersion: work.version } } : {}) }
      }
      if (options.ordinary && context.agent.id === 'researcher' && context.participation!.isFirstDecision) return { action: 'reply', responseKind: 'task', observedThroughSequence }
      if (context.participation!.isFirstDecision && context.agent.id === options.chatOwner) return { action: 'reply', responseKind: 'chat', observedThroughSequence }
      // This proposed business request has no host-owned Work. It must pass, never become a chat execution.
      if (!options.ordinary && context.agent.id === 'researcher' && !options.chatOwner && context.participation!.isFirstDecision) return { action: 'reply', responseKind: 'task', observedThroughSequence }
      return { action: 'pass', observedThroughSequence }
    },
    report: async (context, draft) => { await account(context, 'report'); return { action: 'publish', text: draft.text } },
    run: async context => {
      await account(context, context.responseKind === 'task' ? 'task' : 'chat')
      if (context.work?.organization) {
        const candidates = await context.findEmployees!({ search: '', limit: 20 })
        if (options.clearUnrelatedDuringOrganization) {
          const unrelated = await service.handle('createConversation', { kind: 'direct', title: '无关旧会话', agentIds: ['writer'] }) as Conversation
          await service.handle('clearConversationHistory', { id: unrelated.id, hide: false })
          expect(context.signal.aborted).toBe(false)
        }
        await context.beforeEffect!()
        const receipt = await context.organizeCollaboration!({ existingMembers: candidates.employees.filter(employee => ['researcher', 'writer'].includes(employee.agentId)).map(employee => ({ agentId: employee.agentId, configVersion: employee.configVersion })), newEmployees: [], groupTitle: '实际调度协作群', announcement: '研究员核查数据，写作员讨论表达方式。bobo汇总真实结果。' }, 'actual-organize-scheduling-call')
        state.receipt = receipt; state.group = (await service.handle('snapshot', undefined) as Snapshot).conversations.find(group => group.id === receipt.groupConversationId)!
        expect(receipt.status).toBe('committed'); await context.afterEffect!()
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '组织已提交', evidence: [{ kind: 'collaboration', reference: receipt.id }] }); await context.onDelta('实际员工和群已经创建'); return
      }
      if (!context.work) {
        state.tasklessResponses.push(context.agent.id); state.chatEntered = true; chatStarted.release()
        await options.chatWait?.promise; await context.onDelta('我会在群里讨论表达方式'); return
      }
      if (context.work.parentWorkId) {
        state.childRuns.push(context)
        if (context.work.key === 'check') await options.childWait?.promise
        if (options.publishChildArtifact && context.work.key === 'check') {
          await mkdir(context.workspace!.runPath, { recursive: true })
          await writeFile(join(context.workspace!.runPath, '事实.md'), '# 实际研究原件\n合计79。')
          await context.beforeEffect!()
          const result = await publishArtifact(context, context.workspace!, `self:/runs/${context.runId}/事实.md`)
          await context.afterEffect!()
          await context.onWorkOutcome!({ disposition: 'delivered', summary: '研究原件已实际发布', evidence: [{ kind: 'artifact', reference: result.artifact.id! }] })
          await context.onDelta('核查结果为79'); return
        }
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '实际核查完成', evidence: [{ kind: 'answer', reference: '核查结果为79' }] }); await context.onDelta('核查结果为79'); return
      }
      state.rootEntered = true
      if (options.failRootOnce) {
        if (!state.rootFailed) {state.rootFailed=true;throw new Error('受控原根执行失败，可明确重试')}
        await context.onWorkOutcome!({disposition:'delivered',summary:'原根重试完成',evidence:[{kind:'answer',reference:'核查结果为79'}]});await context.onDelta('核查结果为79');return
      }
      if (!context.work.waitRevision) {
        if (options.delegateAfterChat) await chatStarted.promise
        state.children.push(await context.delegateWork!({ key: 'check', ownerAgentId: options.ordinary ? 'writer' : 'researcher', scope: '实际核查12、27、40', deliverable: '实际数据结果' }))
        if (options.secondChild) state.children.push(await context.delegateWork!({ key: 'second', ownerAgentId: options.ordinary ? 'writer' : 'researcher', scope: '核查另一项', deliverable: '独立核查结果' }))
        if (options.dependentWriter) state.children.push(await context.delegateWork!({ key: 'writer', ownerAgentId: 'writer', scope: '读取实际数据再核查', deliverable: '有依赖的核查结果', dependencies: [{ workId: state.children[0]!.id, resultVersion: 1 }] }))
        await options.rootWait?.promise
        await context.waitForWork!({ dependencies: state.children.map(work => ({ workId: work.id, resultVersion: 1 })), nextStep: '核对原结果后汇总' }); await context.onDelta('等待实际核查结果'); return
      }
      expect(context.workItems!.filter(work => state.children.some(child => child.id === work.id)).every(work => work.status === 'delivered')).toBe(true)
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '核对汇总完成', evidence: [{ kind: 'answer', reference: '汇总核查结果为79' }] }); await context.onDelta('汇总核查结果为79')
    },
  }
  const service = new AppService({ dataPath: path, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  await service.init(); cleanup.push(() => service.close())
  // Release held adapters before closing the service, even when an assertion fails.
  cleanup.push(async () => { options.rootWait?.release(); options.chatWait?.release(); options.childWait?.release(); chatStarted.release() })
  const connection = await service.handle('saveConnection', { name: '调度协议', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'scheduling-fixture' }) as Connection
  for (const employee of (await service.handle('snapshot', undefined) as Snapshot).agents) {
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = employee
    const saved = await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'scheduling-fixture', allowCommands: false, expectedConfigVersion: configVersion }) as DigitalAgent
    expect(saved.allowCommands).toBe(false); expect(saved.executionPermission).toBe(employee.executionPermission)
  }
  const core = options.ordinary ? undefined : await service.handle('startCoreConversation', { requestId: 'original-scheduling-organization', content: '请组织研究员和写作员拉群完成核查与汇总。' }) as Conversation
  if (options.ordinary) {
    state.group = await service.handle('createConversation', { kind: 'group', title: '普通用户群', agentIds: ['researcher', 'writer'] }) as Conversation
    await service.handle('sendMessage', { conversationId: state.group.id, requestId: 'ordinary-root', content: '研究员先安排写作员核查，再汇总', mentionIds: ['researcher'] })
  }
  await vi.waitFor(async () => {
    if (options.failRootOnce) expect(state.rootFailed).toBe(true)
    else {
      const view = await service.handle('getConversation', { id: (core ?? state.group!).id }) as ConversationDetail
      expect(view.runs.filter(run => run.status === 'failed').map(run => run.error)).toEqual([])
      expect(state.children.length).toBe(options.secondChild || options.dependentWriter ? 2 : 1)
    }
  }, { timeout: 5000, interval: 10 })
  const detail = () => service.handle('getConversation', { id: state.group!.id }) as Promise<ConversationDetail>
  const settled = () => vi.waitFor(async () => {
    const view = await detail()
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'].includes(turn.status))).toBe(true)
  }, { timeout: 5000, interval: 10 })
  return { service, state, core, detail, settled }
}

describe('bobo opening and real directed work scheduling', () => {
  it('keeps an already delivered employee peer decision tied to its actual event while preserving the original announcement identity', async () => {
    const rootWait = barrier(), f = await fixture({ rootWait })
    await vi.waitFor(async () => expect((await f.detail()).workItems!.find(work => work.id === f.state.children[0]!.id)?.status).toBe('delivered'), { timeout: 5000, interval: 10 })
    rootWait.release(); await f.settled()
    const view = await f.detail(), opening = view.turns!.find(turn => turn.startIntentId)!
    const first = f.state.decisions.find(context => context.agent.id === 'researcher' && context.participation?.triggerEventType === 'collaboration_start')!
    const follow = f.state.decisions.filter(context => context.agent.id === 'researcher' && context.participation?.triggerEventType === 'agent_message')
    expect(first.triggerMessageId).toBe(opening.triggerMessageId)
    expect(first.participation?.eventMessageId).toBe(opening.triggerMessageId)
    expect(follow.length).toBeGreaterThan(0)
    for (const context of follow) {
      expect(context.triggerMessageId).toBe(opening.triggerMessageId)
      expect(context.participation?.eventMessageId).not.toBe(opening.triggerMessageId)
      expect(context.workItems!.find(work => work.id === f.state.children[0]!.id)?.status).toBe('delivered')
      const decision = view.decisions!.find(decision => decision.sourceDecisionRunId === context.runId)!
      const delivery = view.deliveries!.find(delivery => delivery.id === decision.deliveryId)!
      const source = view.events!.find(event => event.id === delivery.eventId)!
      expect(source).toMatchObject({ type: 'agent_message', messageId: context.participation!.eventMessageId })
      expect(context.participation!.sourceEventIds).toEqual(delivery.eventIds ?? [delivery.eventId])
      expect(view.runs.find(run => run.id === context.runId)).toMatchObject({ phase: 'decision', status: 'completed', triggerMessageId: opening.triggerMessageId })
    }
    expect(view.workItems!.every(work => work.status === 'delivered')).toBe(true)
    expect(f.state.childRuns).toHaveLength(1)
    expect(view.workBudgets).toHaveLength(1)
    expect(view.workBudgets![0]).toMatchObject({ usageIncomplete: false, unknownCalls: 0 })
  })

  it('keeps the actual bobo organization and independent group work alive when an unrelated old conversation is cleared', async () => {
    const f = await fixture({ clearUnrelatedDuringOrganization: true })
    await f.settled()
    const core = await f.service.handle('getConversation', { id: f.core!.id }) as ConversationDetail
    expect(core.runs.find(run => run.phase === 'execution')?.status).toBe('completed')
    expect(f.state.receipt?.status).toBe('committed')
    expect((await f.detail()).workItems!.find(work => work.ownerAgentId === 'bobo')?.status).toBe('delivered')
  })

  it('supplies the dependent employee exact verified logical artifact identities without inventing paths or replacing file reads', async () => {
    const f = await fixture({ dependentWriter: true, publishChildArtifact: true })
    await f.settled()
    const view = await f.detail(), artifact = view.artifacts[0]!
    const writer = f.state.childRuns.find(context => context.work!.key === 'writer')!
    expect(writer.dependencyArtifacts).toEqual([{ artifactId: artifact.id, name: artifact.name, logicalPath: `shared:/${artifact.managedRelativePath}`, contentHash: artifact.contentHash, workId: artifact.sourceWorkId, resultVersion: 1 }])
    expect(writer.dependencyArtifacts![0]!.logicalPath).toMatch(/^shared:\/artifacts\//)
    expect(writer.work!.artifactIds).toEqual([])
  })

  it('keeps a published work status as context for an assigned waiting employee without spending another decision or stealing its ready wake', async () => {
    const childWait = barrier(), f = await fixture({ childWait, dependentWriter: true })
    await vi.waitFor(async () => {
      const view = await f.detail()
      expect(view.workItems!.find(work => work.ownerAgentId === 'bobo')?.status).toBe('waiting')
      expect(view.deliveries!.some(delivery => delivery.agentId === 'writer' && delivery.status === 'skipped' && delivery.error?.includes('真实工作更新已保留'))).toBe(true)
    }, { timeout: 5000, interval: 10 })
    const held = await f.detail(), opening = held.turns!.find(turn => turn.startIntentId)!
    expect(f.state.decisions.filter(context => context.agent.id === 'writer')).toHaveLength(1)
    expect(held.runs.filter(run => run.agentId === 'writer' && run.phase === 'decision')).toHaveLength(1)
    expect((opening as DiscussionTurn & { decisionCalls: number }).decisionCalls).toBe(2)
    const skipped = held.deliveries!.find(delivery => delivery.agentId === 'writer' && delivery.error?.includes('真实工作更新已保留'))!
    expect(held.decisions!.some(decision => decision.deliveryId === skipped.id)).toBe(false)
    expect(held.events!.find(event => event.id === skipped.eventId)?.type).toBe('agent_message')
    expect(held.messages.some(message => message.content === '等待实际核查结果' && message.status === 'completed')).toBe(true)
    expect(held.workItems!.find(work => work.ownerAgentId === 'writer')?.status).toBe('waiting')
    childWait.release(); await f.settled()
    const final = await f.detail()
    expect(final.workItems!.every(work => work.status === 'delivered')).toBe(true)
    expect(f.state.childRuns.filter(context => context.agent.id === 'writer')).toHaveLength(1)
    expect(final.workWakes!.every(wake => wake.status === 'consumed')).toBe(true)
    expect(final.workBudgets![0]).toMatchObject({ maxModelCalls: 48, usageIncomplete: false, unknownCalls: 0 })
  })
  it('preserves genuine invitations, ordinary conversation and uncertain work instead of treating them as redundant business broadcasts', async () => {
    const childWait = barrier(), f = await fixture({ childWait, dependentWriter: true })
    await vi.waitFor(async () => expect((await f.detail()).deliveries!.some(delivery => delivery.agentId === 'writer' && delivery.error?.includes('真实工作更新已保留'))).toBe(true), { timeout: 5000, interval: 10 })
    const view = await f.detail(), delivery = view.deliveries!.find(delivery => delivery.agentId === 'writer' && delivery.error?.includes('真实工作更新已保留'))!
    const turn = view.turns!.find(turn => turn.id === delivery.turnId)!, event = view.events!.find(event => event.id === delivery.eventId)!
    const message = view.messages.find(message => message.id === event.messageId)!, run = view.runs.find(run => run.id === message.runId)!, source = view.workItems!.find(work => work.id === run.workId)!, owned = view.workItems!.find(work => work.ownerAgentId === 'writer')!
    const host = f.service as unknown as { store: ProductStore; contextOnlyPeerDelivery(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery): Promise<string | undefined> }
    expect(await host.contextOnlyPeerDelivery(turn, event, delivery)).toContain('真实工作更新已保留')
    for (const type of ['user_message', 'collaboration_start', 'work_ready', 'handoff'] as const) expect(await host.contextOnlyPeerDelivery(turn, { ...event, type }, delivery), type).toBeUndefined()
    const baseline = [{ collection: 'events', value: event }, { collection: 'deliveries', value: delivery }, { collection: 'messages', value: message }, { collection: 'runs', value: run }, { collection: 'workItems', value: source }, { collection: 'workItems', value: owned }]
    const cases: { reason: string; changes: { collection: string; value: { id: string } }[] }[] = [
      { reason: '合并来源中的明确收件人必须保留', changes: [{ collection: 'events', value: { ...event, id: 'actual-merged-invitation', recipientAgentIds: ['writer'] } as ConversationEvent }, { collection: 'deliveries', value: { ...delivery, eventIds: [event.id, 'actual-merged-invitation'] } as AgentDelivery }] },
      { reason: '消息中的明确提及必须保留', changes: [{ collection: 'messages', value: { ...message, mentionIds: ['writer'] } as Message }] },
      { reason: '普通聊天不是工作状态广播', changes: [{ collection: 'runs', value: { ...run, responseKind: 'chat' } as AgentRun }] },
      { reason: '未事务登记的正文不能冒充工作结果', changes: [{ collection: 'workItems', value: { ...source, resultMessageIds: [] } as WorkItem }] },
      { reason: '来源工作明确公开的本人问题仍保留参与判断', changes: [{ collection: 'messages', value: { ...message, content: '请提供资料' } as Message }, { collection: 'workItems', value: { ...source, outcome: { disposition: 'waiting', summary: '缺少资料', userQuestion: '请提供资料' }, userQuestion: { id: 'actual-source-question', messageId: message.id, content: '请提供资料', revision: source.version } } as WorkItem }] },
      { reason: '来源工作尚待核对不能被当作普通状态广播', changes: [{ collection: 'workItems', value: { ...source, requiresReview: true } as WorkItem }] },
      { reason: '非完整公开消息不能充当来源', changes: [{ collection: 'messages', value: { ...message, status: 'streaming' } as Message }] },
      { reason: '其他请求的工作不构成本次分工', changes: [{ collection: 'workItems', value: { ...owned, collaborationRequestId: 'another-request' } as WorkItem }] },
      { reason: '已交付员工仍可独立判断交流', changes: [{ collection: 'workItems', value: { ...owned, status: 'delivered' } as WorkItem }] },
      { reason: '取消的员工工作不能静默接续', changes: [{ collection: 'workItems', value: { ...owned, cancellationCause: 'user' } as WorkItem }] },
      { reason: '待核对工作不能静默接续', changes: [{ collection: 'workItems', value: { ...owned, requiresReview: true } as WorkItem }] },
      { reason: '等待本人问题的工作保留原判断边界', changes: [{ collection: 'workItems', value: { ...owned, outcome: { disposition: 'waiting', summary: '缺少资料', userQuestion: '请提供资料' } } as WorkItem }] },
      { reason: '尚未分工成员保留独立参与机会', changes: [{ collection: 'workItems', value: { ...owned, ownerAgentId: 'researcher' } as WorkItem }] },
    ]
    for (const item of cases) {
      await host.store.write([...baseline, ...item.changes].map(record => ({ ...record, id: record.value.id })))
      expect(await host.contextOnlyPeerDelivery(turn, event, delivery), item.reason).toBeUndefined()
    }
    await host.store.write(baseline.map(record => ({ ...record, id: record.value.id })))
    childWait.release(); await f.settled()
    expect((await f.detail()).workItems!.every(work => work.status === 'delivered')).toBe(true)
  })
  it('delivers assigned work before a slow opening root and another member chat finish, using only the original budget', async () => {
    const rootWait = barrier(), chatWait = barrier(), f = await fixture({ rootWait, chatWait, chatOwner: 'writer' })
    await vi.waitFor(async () => {
      const view = await f.detail()
      expect(view.workItems!.find(work => work.id === f.state.children[0]!.id)?.status).toBe('delivered')
      expect(f.state.chatEntered).toBe(true)
    }, { timeout: 5000, interval: 10 })
    const active = await f.detail(), root = active.workItems!.find(work => work.ownerAgentId === 'bobo')!
    expect(root.status).toBe('running'); expect(active.runs.find(run => run.agentId === 'writer' && run.phase === 'execution')?.status).toBe('running')
    expect(f.state.childRuns).toHaveLength(1); expect(f.state.childRuns[0]!.work!.budgetId).toBe(root.budgetId)
    rootWait.release(); chatWait.release(); await f.settled()
    const final = await f.detail()
    expect(final.workItems!.every(work => work.status === 'delivered')).toBe(true); expect(final.workBudgets).toHaveLength(1)
    expect(final.workBudgets![0]).toMatchObject({ id: root.budgetId, maxModelCalls: 48, usageIncomplete: false, unknownCalls: 0 })
    expect(final.workBudgets![0]!.modelCalls).toBeLessThanOrEqual(24)
    expect(final.workWakes!.every(wake => wake.status === 'consumed')).toBe(true)
    expect((await f.service.handle('getConversation', { id: f.core!.id }) as ConversationDetail).conversation).toMatchObject({ id: f.core!.id, purpose: 'core', agentIds: ['bobo'] })
  })
  it('passes an unowned task instead of executing it as a chat answer', async () => {
    const f = await fixture(); await f.settled()
    const view = await f.detail(), decisionRuns = view.runs.filter(run => run.agentId === 'researcher' && run.phase === 'decision')
    expect(decisionRuns.length).toBeGreaterThan(0)
    expect(view.decisions!.some(decision => decision.agentId === 'researcher' && decision.action === 'pass')).toBe(true)
    expect(f.state.tasklessResponses).not.toContain('researcher'); expect(f.state.childRuns).toHaveLength(1)
    expect(view.workItems!.filter(work => work.ownerAgentId === 'researcher')).toHaveLength(1)
  })
  it('keeps a pending assigned wake exclusive when an ordinary peer decision quotes that Work', async () => {
    const chatWait = barrier(), f = await fixture({ chatOwner: 'researcher', chatWait, delegateAfterChat: true })
    const view = await f.detail(), child = view.workItems!.find(work => work.id === f.state.children[0]!.id)!
    expect(child).toMatchObject({ status: 'ready', ownerAgentId: 'researcher' }); expect(child.wakeId).toBeTypeOf('string'); expect(f.state.childRuns).toEqual([])
    f.state.illegalDecision = child
    const turn = view.turns!.find(turn => turn.startIntentId)!, event: ConversationEvent = { id: 'actual-peer-observation', type: 'agent_message', turnId: turn.id, conversationId: f.state.group!.id, messageId: view.messages[0]!.id, createdAt: new Date().toISOString() }
    const delivery: AgentDelivery = { id: 'actual-peer-delivery', turnId: turn.id, conversationId: event.conversationId, agentId: child.ownerAgentId, eventId: event.id, status: 'evaluating', observedThroughSequence: view.messages.at(-1)!.sequence, updatedAt: new Date().toISOString() }
    const host = f.service as unknown as { executeDecision(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery, signal: AbortSignal): Promise<ParticipationDecision> }
    expect(await host.executeDecision(turn, event, delivery, new AbortController().signal)).toMatchObject({ action: 'pass' })
    expect((await f.detail()).workItems!.find(work => work.id === child.id)).toMatchObject({ status: 'ready', wakeId: child.wakeId })
    f.state.illegalDecision = undefined; chatWait.release(); await f.settled()
    expect(f.state.childRuns).toHaveLength(1); expect((await f.detail()).workItems!.find(work => work.id === child.id)?.status).toBe('delivered')
  })
  it('retains the single lane for an ordinary user group until its original root response exits', async () => {
    const rootWait = barrier(), f = await fixture({ ordinary: true, rootWait })
    await vi.waitFor(async () => expect((await f.detail()).workWakes!.find(wake => wake.workId === f.state.children[0]!.id)?.status).toBe('scheduled'), { timeout: 3000, interval: 10 })
    expect(f.state.childRuns).toEqual([]); expect((await f.detail()).workItems!.find(work => !work.parentWorkId)?.status).toBe('running')
    rootWait.release(); await f.settled()
    expect(f.state.childRuns).toHaveLength(1); expect((await f.detail()).workItems!.every(work => work.status === 'delivered')).toBe(true)
  })
  it('waits for a cancelled employee adapter to actually exit before starting its next assigned work', async () => {
    const childWait = barrier(), f = await fixture({ childWait, secondChild: true })
    await vi.waitFor(() => expect(f.state.childRuns).toHaveLength(1), { timeout: 5000, interval: 10 })
    const first = f.state.children[0]!, second = f.state.children[1]!
    await f.service.handle('cancelRun', { conversationId: f.state.group!.id, workId: first.id })
    await vi.waitFor(async () => {
      const view = await f.detail()
      expect(view.workItems!.find(work => work.id === first.id)?.status).toBe('cancelled')
      expect(view.workWakes!.find(wake => wake.workId === second.id)?.status).toBe('scheduled')
    }, { timeout: 3000, interval: 10 })
    expect(f.state.childRuns).toHaveLength(1); expect(f.state.childRuns[0]!.signal.aborted).toBe(true)
    childWait.release(); await vi.waitFor(() => expect(f.state.childRuns).toHaveLength(2), { timeout: 3000, interval: 10 }); await f.settled()
    const view = await f.detail()
    expect(view.workItems!.find(work => work.id === first.id)?.status).toBe('cancelled'); expect(view.workItems!.find(work => work.id === second.id)?.status).toBe('delivered')
    expect(view.messages.filter(message => message.senderId === 'researcher' && message.content === '核查结果为79')).toHaveLength(1)
  })
})

it('charges retry decision and task calls to the same original collaboration budget before either model phase starts',async()=>{
 const f=await fixture({failRootOnce:true});await f.settled()
 const before=await f.detail(),failed=before.runs.find(run=>run.agentId==='bobo' && run.status==='failed')!,budget=before.workBudgets![0]!
 expect(failed).toBeDefined()
 await f.service.handle('retryRun',{id:failed.id,requestId:'retry-original-root'})
 await f.settled()
 const after=await f.detail(),newRuns=after.runs.filter(run=>!before.runs.some(old=>old.id===run.id))
 expect(newRuns.some(run=>run.phase==='decision')).toBe(true)
 expect(newRuns.some(run=>run.phase==='execution'),JSON.stringify(newRuns)).toBe(true)
 expect(newRuns.every(run=>run.status==='completed' && run.collaborationRequestId===failed.collaborationRequestId)).toBe(true)
 const calls=await (f.service as unknown as {store:ProductStore}).store.load<{runId:string;budgetId:string}>('budgetModelCalls')
 for(const run of newRuns) expect(calls.filter(call=>call.runId===run.id)).toHaveLength(1)
 expect(after.workBudgets![0]).toMatchObject({id:budget.id,deadlineAt:budget.deadlineAt,maxModelCalls:budget.maxModelCalls,modelCalls:budget.modelCalls+newRuns.length,unknownCalls:0})
 expect(calls.filter(call=>newRuns.some(run=>run.id===call.runId)).every(call=>call.budgetId===budget.id)).toBe(true)
})
it('uses the core default connection in an existing authorized group after clearing explicit selection without granting management tools',async()=>{
 const f=await fixture();await f.settled()
 const snapshot=await f.service.handle('snapshot',undefined)as Snapshot,bobo=snapshot.agents.find(agent=>agent.id==='bobo')!
 const {configVersion,workspaceRef,memoryNamespace,policyVersion,creationSource,...input}=bobo
 await f.service.handle('saveAgent',{...input,connectionId:'',modelId:'',expectedConfigVersion:configVersion})
 const sent=await f.service.handle('sendMessage',{conversationId:f.state.group!.id,content:'bobo，仅讨论下一步',mentionIds:['bobo'],requestId:'core-default-in-group'})as Message
 await f.settled()
 const contexts=f.state.decisions.filter(context=>context.agent.id==='bobo' && context.triggerMessageId===sent.id)
 expect(contexts.length,JSON.stringify((await f.detail()).runs.filter(run=>run.triggerMessageId===sent.id))).toBeGreaterThan(0)
 for(const context of contexts){expect(context.connection!.id).toBe(snapshot.connections[0]!.id);expect(context.findEmployees).toBeUndefined();expect(context.organizeCollaboration).toBeUndefined()}
 expect((await f.detail()).runs.filter(run=>run.triggerMessageId===sent.id).every(run=>run.status==='completed')).toBe(true)
})

it.each(['calls','deadline'] as const)('refuses a retry decision before calling the model when the original collaboration %s budget is exhausted',async boundary=>{
 const f=await fixture({failRootOnce:true});await f.settled()
 const before=await f.detail(),failed=before.runs.find(run=>run.agentId==='bobo' && run.status==='failed')!,budget=before.workBudgets![0]!,calls=f.state.decisions.length
 const next={...budget,...(boundary==='calls'?{modelCalls:budget.maxModelCalls}:{deadlineAt:new Date(0).toISOString()})}
 await (f.service as unknown as {store:ProductStore}).store.write([{collection:'workBudgets',id:budget.id,value:next}])
 await expect(f.service.handle('retryRun',{id:failed.id,requestId:'exhausted-root-retry'})).rejects.toThrow()
 expect(f.state.decisions).toHaveLength(calls);expect((await f.detail()).runs).toEqual(before.runs)
})
it('reserves retry judgment on the original core organization budget before taking an execution holder',async()=>{
 const path=await mkdtemp(join(tmpdir(),'boai-core-retry-budget-'));cleanup.push(()=>rm(path,{recursive:true,force:true}))
 const engine:AgentEngine={test:async()=>'',decide:async context=>{await account(context,'decision');return {action:'reply',responseKind:'task',observedThroughSequence:context.participation!.observedThroughSequence,work:{key:'original',scope:'创建独立员工',deliverable:'员工',organization:{mode:'employee_creation',goal:'创建独立员工'}}}},run:async context=>{await account(context,'task');throw new Error('受控组织执行失败，尚无副作用')}}
 const service=new AppService({dataPath:path,engine,secrets:{get:async()=>'',set:async()=>{},delete:async()=>{}},emit:()=>{}});await service.init();cleanup.push(()=>service.close())
 await service.handle('saveConnection',{name:'fixture',provider:'openai-compatible',baseUrl:'http://localhost:1234',defaultModel:'fixture'})
 const core=await service.handle('startCoreConversation',{requestId:'core-original',content:'请创建独立员工'})as Conversation
 const detail=()=>service.handle('getConversation',{id:core.id})as Promise<ConversationDetail>
 await vi.waitFor(async()=>{const d=await detail();expect(d.runs.some(run=>run.phase==='execution'&&run.status==='failed')).toBe(true);expect(d.turns!.every(turn=>turn.status==='failed')).toBe(true)})
 const before=await detail(),failed=before.runs.find(run=>run.phase==='execution')!,budget=before.workBudgets![0]!
 await service.handle('retryRun',{id:failed.id,requestId:'explicit-core-retry'})
 await vi.waitFor(async()=>{const d=await detail();expect(d.turns!.every(turn=>turn.status==='failed')).toBe(true);expect(d.runs.filter(run=>run.phase==='execution')).toHaveLength(2)})
 const after=await detail(),newRuns=after.runs.filter(run=>!before.runs.some(old=>old.id===run.id))
 expect(newRuns.map(run=>run.phase).sort()).toEqual(['decision','execution'])
 expect(after.workBudgets![0]).toMatchObject({id:budget.id,modelCalls:budget.modelCalls+2,deadlineAt:budget.deadlineAt,maxModelCalls:24})
})
