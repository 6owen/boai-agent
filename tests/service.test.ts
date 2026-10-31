/*
 * [OUTPUT]: 等待同事期间私有汇报的schema错误保持原依赖、预算和一次性副作用；无效正文不发布。
 * [OUTPUT]: 2026-10-27 普通/bobo聊天与重复反馈通过原决策链；执行工具仍限执行阶段，停止/改权后的旧进度回调拒绝。
 * [OUTPUT]: 2026-10-27 本轮相关回归合同/源码更新；执行状态另行记录，不以源码存在判通过。
 * [OUTPUT]: 判断追加请求超过旧12次仍完成；多轮定向群协作跨过旧发言和代数阈值，不改变停止与来源校验。
 * [OUTPUT]: 待批准任务不堵无关员工；命令互斥在实际执行阶段，六席资源排队取消合同保持。
 * [OUTPUT]: 完整备份恢复默认关闭桌面截图保存，并保留受管截图目录。
 * [OUTPUT]: 真实服务链路超过300次模型预留和旧累计token边界仍完成，停止与明确预算另行覆盖。
 * [OUTPUT]: 五项反馈的调度额度/取消接续或历史展示回归；具体验证边界以本文件用例为准。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [OUTPUT]: 整体权限经真实AppService/SQLite保存、审批/拒绝/直接执行及重启持久化，命令与文件使用真实任务工具。
 * [OUTPUT]: 步骤上限后新消息接续覆盖同进程/重启、发送去重、原Work/调用数/绝对期限及历史工具保留。
 * [OUTPUT]: 已忘记历史不重入汇报修复；员工命令永久授权保持配置版本，隔离其他员工并支持重启、撤销与关闭清理。
 * [OUTPUT]: API执行文本不重复登记最终答复或旧task_step摘要，最终上下文消息独立发布。
 * [OUTPUT]: 工作接续保留已完成 edit_file 原身份，原等待/修复/不重复副作用回归。
 * [OUTPUT]: 顺序发言不把执行触发来源保存为引用回复，流式、完成与重启保持真实接续关系。
 * [OUTPUT]: 群接续字数约束随原轮次冻结、下游上下文和重启保持。
 * [OUTPUT]: API依赖接续必须提交本次结果声明；漏报复用原有界只读汇报，失败保留草稿且零操作重放，历史等待不冒充当前结果。
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [OUTPUT]: 独立长短任务以长任务实际进入屏障后发布短结果，原并行/草稿/次序/零重放断言保持；不以短结果可见猜测另一适配器已开始。
 * [OUTPUT]: 原群新消息后的三种汇报退出沿实际AppService保留等待，子工作仅唤醒原负责人，共原预算/期限且已确认工具只执行一次。
 * [INPUT]: AppService、产品存储、领域类型与内部执行合同；隔离完整备份与异路径恢复。
 * [OUTPUT]: 完整备份同时核对已保存员工源文件/配置、带来源记忆、原消息/Run/成果和双次启动零重放。
 * [OUTPUT]: 核心会话仅标题及更新时间的严格保存、非法输入零写/隐藏与普通会话拒绝、写失败内存不污染和重启保留原配置/历史/工作/记忆且零模型；用明确 writer 开始屏障验证流式起始/完成乱序与只汇报补判；真实不可覆盖发布/内容 hash 随备份搬迁的验证；清空后旧发送请求拒绝重放、新请求仍可从序号一开始；核心预置身份与普通员工场景隔离，保留原业务断言；显式仅此聊天兼容隔离与员工统一范围；活动观测落库失败不重放运行或阻止消息发布；发布故障精准注入消息事件事务，允许独立活动观测先提交；表情回应幂等/失败回滚/重启/清理与不触发模型；员工思考强度校验/隔离/重启与旧表单保留；Trace 跨会话/轮次隔离、重试归属、重启和清理；独立聊天并行流式/完成顺序/容量与判断时限、认领/预算、独立子工作、私有草稿/证据/等待修复、实际调用容量及永久会话清理回归。
 * [POS]: tests/service.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { withHostCommandAdmission } from '../packages/runtime/src/adapters/mastra/host-command'
import { TaskAdmission } from '../packages/runtime/src/modules/collaboration/task-admission'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine, EngineContext, SecretStore } from '../packages/runtime/src/contracts'
import type { AgentInput, AgentRun, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Resource, Snapshot, ParticipationDecision, MemoryView, AgentFileContent } from '../packages/shared/src/domain'
import type { StoredTraceSpan } from '../packages/shared/src/domain/traces'
import type { AgentProfile } from '../packages/shared/src/domain/agent-profile'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { publishArtifact } from '../packages/runtime/src/modules/workspaces/file-access'
import { ProgressMonitor } from '../packages/runtime/src/modules/contexts/progress-monitor'
import { progressBoundary } from '../packages/runtime/src/adapters/mastra/progress-review'

const roots: string[] = []
const services: AppService[] = []
class MemorySecrets implements SecretStore {
  values = new Map<string, string>()
  async get(id: string) { return this.values.get(id) }
  async set(id: string, value: string) { this.values.set(id, value) }
  async delete(id: string) { this.values.delete(id) }
}
class FakeEngine implements AgentEngine {
  interpretGroup?: AgentEngine['interpretGroup']
  extractMemory?: AgentEngine['extractMemory']
  report: AgentEngine['report'] = async (_context, draft) => ({ action: 'publish', text: draft.text })
  contexts: EngineContext[] = []
  handler: (context: EngineContext) => Promise<void> = async context => { await context.onDelta(`${context.agent.name}回复`) }
  decisions: EngineContext[] = []
  decisionHandler: (context: EngineContext) => Promise<ParticipationDecision> = async context => {
    const root = context.messages.find(message => message.id === context.triggerMessageId)
    return { action: context.messages.some(message => message.senderId === context.agent.id && message.turnId === root?.turnId && message.status === 'completed') ? 'pass' : 'reply', responseKind: 'task', work: { key: `fixture-${context.agent.id}`, scope: '独立验证该员工的授权执行路径', deliverable: '返回该员工的验证结果' }, observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) }
  }
  async decide(context: EngineContext) { this.decisions.push(context); return this.decisionHandler(context) }
  async run(context: EngineContext) { this.contexts.push(context); await this.handler(context) }
  async test() { return 'connected' }
}
async function fixture(engine = new FakeEngine()) {
  const root = await mkdtemp(join(tmpdir(), 'boai-service-')); roots.push(root)
  const secrets = new MemorySecrets()
  const service = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(service)
  await service.init()
  return { root, engine, secrets, service }
}
async function snapshot(service: AppService) { return service.handle('snapshot', undefined) as Promise<Snapshot> }
async function detail(service: AppService, conversation: Conversation) { return service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail> }
async function configure(service: AppService, agentIds = ['researcher', 'writer', 'reviewer']) {
  const connection = await service.handle('saveConnection', { name: 'Local test', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test-model' }) as Connection
  for (const agent of (await snapshot(service)).agents.filter(agent => agentIds.includes(agent.id))) await updateAgent(service, agent, { connectionId: connection.id, modelId: 'test-model' })
  return connection
}
async function updateAgent(service: AppService, agent: DigitalAgent, updates: Partial<AgentInput>) {
  const { configVersion: _, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
  return service.handle('saveAgent', { ...input, ...updates }) as Promise<DigitalAgent>
}
async function conversation(service: AppService, group = false, sharedKnowledgeIds: string[] = []) {
  return service.handle('createConversation', { kind: group ? 'group' : 'direct', title: group ? '项目讨论' : '研究', agentIds: group ? ['researcher', 'writer'] : ['researcher'], mode: 'mention', sharedKnowledgeIds }) as Promise<Conversation>
}
async function send(service: AppService, conversation: Conversation, content: string, requestId: string, mentionIds = conversation.kind === 'group' ? ['researcher', 'writer'] : []) {
  return service.handle('sendMessage', { conversationId: conversation.id, content, requestId, mentionIds }) as Promise<Message>
}
async function until(predicate: () => Promise<boolean> | boolean, timeout = 3000) {
  const start = Date.now()
  while (!await predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for service'); await new Promise(resolve => setTimeout(resolve, 10)) }
}
async function idle(service: AppService, conversation: Conversation, count: number) {
  await until(async () => { const result = await detail(service, conversation); const runs = result.runs.filter(run => run.phase === 'execution'); return runs.length === count && result.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) && result.turns?.every(turn => ['completed', 'waiting_user', 'cancelled', 'failed', 'interrupted', 'budget_exhausted'].includes(turn.status)) === true }).catch(async error => {
    const state = await detail(service, conversation)
    throw new Error(`${error.message}; expected ${count} execution runs; ${JSON.stringify({ runs: state.runs.filter(run => run.phase === 'execution').map(run => ({ agent: run.agentId, status: run.status, error: run.error })), turns: state.turns?.map(turn => ({ status: turn.status, reason: turn.reason })), deliveries: state.deliveries?.map(delivery => ({ agent: delivery.agentId, status: delivery.status, error: delivery.error })) })}`)
  })
  // Let the per-conversation queue finish its durable job record too.
  await new Promise(resolve => setTimeout(resolve, 20))
}
function waitForAbort(context: EngineContext) { return new Promise<void>(resolve => { if (context.signal.aborted) resolve(); else context.signal.addEventListener('abort', () => resolve(), { once: true }) }) }
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('local product service', () => {
  it.each(['bobo', 'researcher'])('allows %s chat decisions and repeat feedback without granting execution tools', async agentId => {
    const { service, engine } = await fixture(); await configure(service, [agentId])
    engine.decisionHandler = async context => {
      expect(await context.progressCurrent!()).toBe(true)
      await expect(context.assertSkillAccess!([])).rejects.toThrow('当前执行已失去访问权限')
      const progress = new ProgressMonitor()
      for (let i = 0; i < 3; i++) progress.observe(`decision-${i}`, 'group_reply', { text: 'same reply' })
      expect(await progressBoundary(context, progress)).toContain('Private execution feedback')
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    engine.handler = async context => {
      expect(await context.progressCurrent!()).toBe(true)
      await context.assertSkillAccess!([])
      await context.onDelta('你好，已收到')
    }
    const direct = agentId === 'bobo'
      ? await service.handle('startCoreConversation', { requestId: 'decision-access-core', content: 'hi' }) as Conversation
      : await conversation(service)
    if (agentId !== 'bobo') await send(service, direct, 'hi', 'decision-access-direct')
    await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(engine.decisions).toHaveLength(1)
    expect(result.runs.filter(run => run.phase === 'decision' || run.phase === 'execution').map(run => [run.phase, run.status])).toEqual([['decision', 'completed'], ['execution', 'completed']])
    expect(result.messages.map(message => message.content)).toEqual(['hi', '你好，已收到'])
    await expect(engine.decisions[0].progressCurrent!()).rejects.toThrow()
    await expect(engine.contexts[0].progressCurrent!()).rejects.toThrow()
  })

  it.each(['stop', 'permission'] as const)('rejects stale decision progress after %s without starting execution', async change => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let entered = false, checked = false
    engine.decisionHandler = async context => {
      expect(await context.progressCurrent!()).toBe(true)
      entered = true
      await waitForAbort(context)
      await expect(context.progressCurrent!()).rejects.toThrow()
      checked = true
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, direct, 'hi', `decision-access-${change}`)
    await until(() => entered)
    if (change === 'stop') await service.handle('cancelRun', { conversationId: direct.id })
    else await updateAgent(service, (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!, { executionPermission: 'read-only' })
    await idle(service, direct, 0)
    expect(checked).toBe(true)
    expect(engine.contexts).toHaveLength(0)
    expect((await detail(service, direct)).messages.map(message => message.content)).toEqual(['hi'])
  })

  it.each([[false, 'write_file', 'failed'], [true, 'write_file', 'failed'], [false, 'call_data_source', 'failed'], [false, 'browser_tool', 'failed'], [false, 'write_file', 'cancelled'], [true, 'write_file', 'interrupted']] as const)('continues unfinished work from a new user message with its original identity (restart=%s, effect=%s, status=%s)', async (restart, effectTool, status) => {
    const { service: initialService, engine, root, secrets } = await fixture(); await configure(initialService)
    let service = initialService
    const direct = await conversation(service)
    engine.handler = async context => {
      for (let step = 1; step < 12; step++) await context.onAdditionalModelCall!()
      await context.beforeEffect!(); await context.afterEffect!()
      await context.onTool({ id: 'confirmed-effect', name: effectTool, status: 'completed', detail: '已完成本次操作', createdAt: new Date().toISOString() })
      if (status === 'failed') throw new Error('已达到单次任务的工具步骤上限，请继续发送消息')
      await waitForAbort(context)
    }
    await send(service, direct, '查看目录并汇总内容', 'step-limit-initial')
    if (status !== 'failed') {
      await until(async () => (await detail(service, direct)).runs.some(run => run.toolEvents.some(tool => tool.id === 'confirmed-effect')))
      if (status === 'cancelled') await service.handle('cancelRun', { conversationId: direct.id })
      else {
        await service.close()
        service = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(service); await service.init()
      }
    }
    await idle(service, direct, 1)
    const before = await detail(service, direct)
    const original = before.runs.find(run => run.phase === 'execution')!
    expect(before.workBudgets![0].modelCalls).toBe(12)
    expect(before.workItems![0].requiresReview).toBe(true)
    if (restart && status !== 'interrupted') {
      await service.close()
      service = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(service); await service.init()
      expect(engine.contexts).toHaveLength(1)
    }
    engine.decisionHandler = async context => {
      const work = context.workItems!.find(work => work.id === original.workId)!
      return { action: 'reply', responseKind: 'task', work: { key: work.key, scope: work.scope, deliverable: work.deliverable, workId: work.id, expectedVersion: work.version }, observedThroughSequence: context.participation!.observedThroughSequence }
    }
    engine.handler = async context => {
      expect(context.completedWorkTools?.flatMap(run => run.tools)).toEqual([expect.objectContaining({ id: 'confirmed-effect', name: effectTool })])
      await context.onDelta('目录汇总完成')
    }
    await send(service, direct, '继续', 'step-limit-continue')
    await send(service, direct, '继续', 'step-limit-continue'); await idle(service, direct, 2)
    const after = await detail(service, direct)
    const runs = after.runs.filter(run => run.phase === 'execution')
    expect(runs.map(run => ({ status: run.status, error: run.error }))).toEqual([
      { status, error: original.error }, { status: 'completed', error: undefined },
    ])
    expect(engine.contexts).toHaveLength(2)
    expect(runs[1].workId).toBe(original.workId)
    expect(runs[0].toolEvents).toEqual(original.toolEvents)
    expect(engine.contexts[1].work?.budgetId).toBe(engine.contexts[0].work?.budgetId)
    expect(after.workItems).toHaveLength(1)
    expect(after.workItems![0].sourceMessageId).toBe(before.workItems![0].sourceMessageId)
    expect(after.workBudgets![0]).toMatchObject({ id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt, modelCalls: 13, retries: 1, runs: 2 })
  })

  it('runs past the former 24/256-call turn ceilings with its original ledger', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => {
      for (let step = 0; step < 300; step++) await context.onAdditionalModelCall!()
      await context.onDelta('检查完成')
    }
    await send(service, direct, '执行多步检查', 'expanded-turn-limit'); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed' })
    expect(result.turns![0].modelCalls).toBeGreaterThan(300)
    expect(result.workBudgets![0]).toMatchObject({ modelCalls: 301, maxModelCalls: null })
  })

  it('lets another employee finish while a command-capable task waits for approval', async () => {
    const { service, engine } = await fixture(); await configure(service)
    for (const agent of (await snapshot(service)).agents.filter(a => ['researcher', 'writer'].includes(a.id))) await updateAgent(service, agent, { allowCommands: true, executionPermission: 'ask' })
    const first = await conversation(service)
    const second = await service.handle('createConversation', { kind: 'direct', title: '后续任务', agentIds: ['writer'] }) as Conversation
    engine.handler = async context => { if (context.conversation.id === first.id) await context.approveCommand('printf approved', context.workspace!.runPath); await context.onDelta('检查完成') }
    await send(service, first, '等待本人批准', 'approval-first')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    const approval = (await snapshot(service)).approvals[0]
    try {
      await send(service, second, '查询天气', 'independent-second'); await idle(service, second, 1)
      expect(engine.contexts).toHaveLength(2)
      expect((await detail(service, first)).runs.find(run => run.phase === 'execution')?.status).toBe('waiting_approval')
      expect((await detail(service, second)).runs.find(run => run.phase === 'execution')?.status).toBe('completed')
    } finally { await service.handle('approve', { id: approval.id, approved: false }) }
    await idle(service, first, 1)
  })
  it('shows resource admission as queued and starts automatically after actual capacity releases', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const admission = (service as unknown as { taskAdmission: TaskAdmission }).taskAdmission
    const releases = await Promise.all(Array.from({ length: 6 }, (_, i) => admission.acquire(false, new AbortController().signal, `occupied-${i}`)))
    const direct = await conversation(service)
    engine.handler = async context => { await context.onDelta('检查完成') }
    try {
      await send(service, direct, '等待资源', 'admission-wait')
      await until(async () => (await detail(service, direct)).runs.some(run => run.phase === 'execution' && run.status === 'queued'))
      expect(engine.contexts).toHaveLength(0)
      expect((await snapshot(service)).conversations.find(room => room.id === direct.id)?.activity).toBe('queued')
    } finally { releases.forEach(release => release()) }
    await idle(service, direct, 1)
    expect(engine.contexts).toHaveLength(1)
    expect((await detail(service, direct)).runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed', taskQueueMs: expect.any(Number) })
  })

  it('rejects a failed-work continuation when its confirmed operation context was invalidated', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => { await context.beforeEffect!(); await context.afterEffect!(); throw new Error('已达到单次任务的工具步骤上限，请继续发送消息') }
    await send(service, direct, '处理本次材料', 'invalid-context-initial'); await idle(service, direct, 1)
    const before = await detail(service, direct)
    const original = before.runs.find(run => run.phase === 'execution')!
    const snapshots = (service as unknown as { snapshots: Map<string, { invalidated?: boolean }> }).snapshots
    snapshots.get(original.id)!.invalidated = true
    engine.decisionHandler = async context => {
      const work = context.workItems!.find(work => work.id === original.workId)!
      return { action: 'reply', responseKind: 'task', work: { key: work.key, scope: work.scope, deliverable: work.deliverable, workId: work.id, expectedVersion: work.version }, observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, direct, '继续', 'invalid-context-continue'); await idle(service, direct, 2)
    const after = await detail(service, direct)
    expect(after.runs.filter(run => run.phase === 'execution').at(-1)?.error).toBe('原执行记录或资源已失效，不能接续已有操作')
    expect(engine.contexts).toHaveLength(1)
    expect(after.workItems).toEqual(before.workItems)
    expect(after.workBudgets).toEqual(before.workBudgets)
  })

  it.each(['new-input', 'evidence-repair'] as const)('excludes forgotten history from %s reports without replaying work', async mode => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.decisionHandler = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '查询天气' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    const forgotten = await send(service, direct, '已忘记的旧消息', 'forgotten-history'); await idle(service, direct, 0)
    const store = (service as unknown as { store: ProductStore }).store
    await store.write([{ collection: 'memoryForgets', id: 'forgotten-source', value: { id: 'forgotten-source', ownerAgentId: 'researcher', sourceMessageIds: [forgotten.id], sourceMemoryIds: [], createdAt: new Date().toISOString() } }])
    let release!: () => void, effects = 0, reports = 0
    const hold = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => {
      expect(context.messages.some(message => message.id === forgotten.id)).toBe(false)
      await context.beforeEffect!(); effects++; await context.afterEffect!()
      await context.onDelta('天气已查到')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '查询结束', evidence: [{ kind: 'answer', reference: mode === 'evidence-repair' ? '不匹配的摘录' : '天气已查到' }] })
      await hold
    }
    engine.report = async context => {
      reports++; expect(context.messages.some(message => message.id === forgotten.id)).toBe(false)
      expect(context.memory?.recall?.inputMessageIds).not.toContain(forgotten.id)
      return { action: 'publish', text: '天气查询完成', outcome: { disposition: 'delivered', summary: '查询结束', evidence: [{ kind: 'answer', reference: '天气查询完成' }] } }
    }
    await send(service, direct, '查询天气', 'current-weather'); await until(() => effects === 1)
    if (mode === 'new-input') await send(service, direct, '请简短回复', 'new-report-input')
    release(); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(effects).toBe(1); expect(reports).toBe(1)
    expect(result.runs.find(run => run.phase === 'execution')?.status).toBe('completed')
    expect(result.messages.filter(message => message.senderType === 'agent').at(-1)?.content).toBe('天气查询完成')
  })

  it('allows the same operation kind for the current run only, preserving other approvals and employee policy', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const agent = await updateAgent(service, (await snapshot(service)).agents.find(item => item.id === 'researcher')!, { allowCommands: true, executionPermission: 'ask' })
    const direct = await conversation(service), decisions: boolean[] = []
    engine.handler = async context => {
      decisions.push(await context.approveCommand('printf first', context.workspace!.runPath))
      decisions.push(await context.approveCommand('printf second', context.workspace!.runPath))
      decisions.push(await context.approveOperation!({ kind: 'file', description: '写入报告' }))
      await context.onDelta('检查结束')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '检查结束', evidence: [{ kind: 'answer', reference: '检查结束' }] })
    }
    await send(service, direct, '执行检查', 'same-kind-first')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    const command = (await snapshot(service)).approvals[0]
    expect(command).toMatchObject({ kind: 'command', sameKindAllowed: true, rememberAllowed: false })
    await expect(service.handle('approve', { id: command.id, approved: false, allowSameKind: true })).rejects.toThrow('不能允许所有同类')
    expect(decisions).toEqual([])
    await service.handle('approve', { id: command.id, approved: true, allowSameKind: true })
    await until(async () => (await snapshot(service)).approvals.some(item => item.kind === 'file'))
    expect(decisions).toEqual([true, true])
    await service.handle('approve', { id: (await snapshot(service)).approvals[0].id, approved: false })
    await idle(service, direct, 1)
    expect(decisions).toEqual([true, true, false])
    expect((await snapshot(service)).commandPermissions).toEqual([])
    expect((await snapshot(service)).agents.find(item => item.id === agent.id)).toEqual(agent)
    engine.handler = async context => { decisions.push(await context.approveCommand('printf third', context.workspace!.runPath)); await context.onDelta('已处理') }
    await send(service, direct, '再执行一次', 'same-kind-next')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    expect((await snapshot(service)).approvals[0].runId).not.toBe(command.runId)
    expect(decisions).toHaveLength(3)
    await service.handle('approve', { id: (await snapshot(service)).approvals[0].id, approved: false })
    await idle(service, direct, 2)
    expect(decisions.at(-1)).toBe(false)
  })

  it('remembers command approval per employee across runs and restart, with explicit revocation', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    for (const id of ['researcher', 'writer']) await updateAgent(service, (await snapshot(service)).agents.find(agent => agent.id === id)!, { allowCommands: true })
    const agent = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
    const direct = await conversation(service)
    const decisions: boolean[] = []
    engine.handler = async context => {
      decisions.push(await context.approveCommand('printf first', context.workspace!.runPath))
      if (decisions.at(-1)) decisions.push(await context.approveCommand('printf second', context.workspace!.runPath))
      await context.onDelta('检查结束'); await context.onWorkOutcome!({ disposition: 'delivered', summary: '检查结束', evidence: [{ kind: 'answer', reference: '检查结束' }] })
    }
    await send(service, direct, '执行检查', 'remember-first')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    const approval = (await snapshot(service)).approvals[0]
    expect(approval.rememberAllowed).toBe(true)
    await expect(service.handle('approve', { id: approval.id, approved: false, always: true })).rejects.toThrow('不能保存')
    expect((await snapshot(service)).commandPermissions).toEqual([])
    const permissions = (service as unknown as { commandPermissions: import('../packages/runtime/src/modules/employees/command-permissions').CommandPermissions }).commandPermissions
    const grant = permissions.grant.bind(permissions)
    const failure = vi.spyOn(permissions, 'grant').mockImplementationOnce(async (tx, employee) => { await grant(tx, employee); throw new Error('授权事务提交失败') })
    await expect(service.handle('approve', { id: approval.id, approved: true, always: true })).rejects.toThrow('授权事务提交失败')
    failure.mockRestore()
    expect((await snapshot(service)).commandPermissions).toEqual([])
    expect((await snapshot(service)).approvals[0].id).toBe(approval.id); expect(decisions).toEqual([])
    await service.handle('approve', { id: approval.id, approved: true, always: true }); await idle(service, direct, 1)
    expect(decisions).toEqual([true, true])
    expect((await snapshot(service)).agents.find(item => item.id === agent.id)?.configVersion).toBe(agent.configVersion)
    await send(service, direct, '再次执行检查', 'remember-next'); await idle(service, direct, 2)
    expect(decisions).toEqual([true, true, true, true])
    const other = await service.handle('createConversation', { kind: 'direct', title: '另一个员工', agentIds: ['writer'] }) as Conversation
    await send(service, other, '检查', 'other-employee')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    await service.handle('approve', { id: (await snapshot(service)).approvals[0].id, approved: false }); await idle(service, other, 1)
    expect(decisions.at(-1)).toBe(false)
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    const permission = (await snapshot(reopened)).commandPermissions![0]
    expect(permission.agentId).toBe(agent.id)
    await send(reopened, direct, '重启后执行检查', 'remember-restart'); await idle(reopened, direct, 3)
    await expect(reopened.handle('revokeCommandPermission', { agentId: agent.id, revision: 'stale' })).rejects.toThrow('已变化')
    await reopened.handle('revokeCommandPermission', { agentId: agent.id, revision: permission.revision })
    await send(reopened, direct, '恢复确认后检查', 'remember-revoked')
    await until(async () => (await snapshot(reopened)).approvals.length === 1)
    await reopened.handle('approve', { id: (await snapshot(reopened)).approvals[0].id, approved: true, always: true }); await idle(reopened, direct, 4)
    await updateAgent(reopened, (await snapshot(reopened)).agents.find(item => item.id === agent.id)!, { allowCommands: false })
    expect((await snapshot(reopened)).commandPermissions).toEqual([])
  })

  it('starts each ordered participant only after the preceding complete reply is committed', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const ids = ['researcher', 'writer', 'reviewer']
    for (let i = 0; i < 2; i++) ids.push((await service.handle('saveAgent', { name: `接续成员${i}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const group = await service.handle('createConversation', { kind: 'group', title: '依次接续', agentIds: ids, mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    let interpretations = 0
    engine.interpretGroup = async () => { interpretations++; return { mode: 'ordered', instruction: '依次读取本轮前一位的完整回复并递增报数，每位只报一次。', agentIds: ids } }
    engine.decisionHandler = async context => ({ action: context.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => {
      const previous = context.messages.filter(message => message.turnId === context.turnId && message.senderType === 'agent' && message.status === 'completed')
      if (context.agent.id === 'researcher') { await context.onDelta('1'); await barrier }
      else await context.onDelta(String(previous.length + 1))
    }
    try {
      await send(service, group, '大家开始报数', 'ordered-count', [])
      await until(() => engine.contexts.some(context => context.agent.id === 'researcher'))
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher'])
      expect((await detail(service, group)).messages.find(message => message.senderType === 'agent')?.replyToMessageId).toBeUndefined()
    } finally { release() }
    await idle(service, group, 5)
    const result = await detail(service, group)
    expect(result.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => [message.senderId, message.content])).toEqual(ids.map((id, index) => [id, String(index + 1)]))
    expect(result.messages.filter(message => message.senderType === 'agent').every(message => !message.replyToMessageId)).toBe(true)
    expect(interpretations).toBe(1)
    expect(engine.decisions).toHaveLength(0)
    expect(result.workItems ?? []).toHaveLength(0)
    expect(result.turns?.[0]).toMatchObject({ status: 'completed', publicMessages: 5, modelCalls: 6 })
  })

  it('relays unpredictable content in the interpreted order, deduplicates receipt and never replays after restart', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.interpretGroup = async () => ({ mode: 'ordered', instruction: '写手选一个词，研究员复述其实际选择。每人80字以内。', agentIds: ['writer', 'researcher'], maxReplyCharacters: 80 })
    const word = `随机词-${Math.random().toString(36).slice(2)}`
    engine.handler = async context => {
      const predecessor = context.messages.find(message => message.turnId === context.turnId && message.senderId === 'writer' && message.status === 'completed')
      await context.onDelta(context.agent.id === 'writer' ? word : `收到：${predecessor?.content}`)
    }
    const first = await send(service, group, '写手先选词，研究员接着复述', 'ordered-relay', [])
    expect((await send(service, group, first.content, 'ordered-relay', [])).id).toBe(first.id)
    await idle(service, group, 2)
    const result = await detail(service, group)
    expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual([word, `收到：${word}`])
    expect(result.turns?.[0].coordination).toMatchObject({ mode: 'ordered', revision: 3, completed: [{ agentId: 'writer' }, { agentId: 'researcher' }] })
    expect(engine.contexts[1].groupCoordination?.completed).toHaveLength(1)
    expect(engine.contexts.every(context => context.groupCoordination?.maxReplyCharacters === 80)).toBe(true)
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(engine.contexts).toHaveLength(2)
    expect((await detail(reopened, group)).turns?.[0].coordination).toEqual(result.turns?.[0].coordination)
    expect((await detail(reopened, group)).messages.filter(message => message.senderType === 'agent').every(message => !message.replyToMessageId)).toBe(true)
  })

  it.each(['publication failure', 'cancellation', 'restart'] as const)('does not advance an ordered chain on %s', async fault => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.interpretGroup = async () => ({ mode: 'ordered', instruction: '前一位完整完成后再接续', agentIds: group.agentIds })
    engine.handler = async context => { await context.onDelta('未完成前不得接续'); if (fault !== 'publication failure') await waitForAbort(context) }
    const store = (service as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
    const spy = fault === 'publication failure' ? vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => {
      if (record.collection === 'events' && (record.value as { type?: string }).type === 'agent_message') throw new Error('publication disk failure')
      await tx.put(record)
    } }))) : undefined
    await send(service, group, '依次接续', `ordered-${fault}`, [])
    await until(() => engine.contexts.length === 1)
    if (fault === 'cancellation') await service.handle('cancelRun', { conversationId: group.id })
    if (fault === 'restart') await service.close()
    else await idle(service, group, 1)
    spy?.mockRestore()
    const reopened = fault === 'restart' ? new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }) : service
    if (reopened !== service) { services.push(reopened); await reopened.init() }
    const result = await detail(reopened, group)
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher'])
    expect(result.turns?.[0].coordination?.completed).toEqual([])
    expect(result.turns?.[0].status).toBe(fault === 'publication failure' ? 'failed' : fault === 'cancellation' ? 'cancelled' : 'interrupted')
    expect(result.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toEqual([])
  })

  it('retains parallel independent replies after one group interpretation', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let calls = 0
    engine.interpretGroup = async () => { calls++; return { mode: 'independent' } }
    engine.decisionHandler = async context => ({ action: context.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { await context.onDelta(context.agent.name); await barrier }
    try {
      await send(service, group, '大家各自介绍自己', 'group-independent', [])
      await until(() => engine.contexts.length === 2)
      expect((await detail(service, group)).messages.filter(message => message.status === 'streaming')).toHaveLength(2)
    } finally { release() }
    await idle(service, group, 2)
    expect(calls).toBe(1)
  })

  it('interrupts the unstarted ordered remainder when the user sends a new request', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.interpretGroup = async context => context.messages.find(message => message.id === context.triggerMessageId)?.content === '第一轮接续' ? { mode: 'ordered', instruction: '依次接续', agentIds: group.agentIds } : { mode: 'independent' }
    engine.decisionHandler = async context => ({ action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence })
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { await context.onDelta('原第一步'); await barrier }
    const original = await send(service, group, '第一轮接续', 'ordered-old-request', [])
    try {
      await until(() => engine.contexts.length === 1)
      await send(service, group, '暂停接龙，讨论别的', 'ordered-new-request', [])
    } finally { release() }
    await idle(service, group, 1)
    const result = await detail(service, group)
    expect(engine.contexts).toHaveLength(1)
    expect(result.turns?.find(turn => turn.triggerMessageId === original.id)).toMatchObject({ status: 'interrupted', coordination: { completed: [{ agentId: 'researcher' }] } })
  })

  it('rejects an invalid group plan instead of falling back to unrelated concurrent answers', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.interpretGroup = async () => ({ mode: 'ordered', instruction: '接续', agentIds: ['researcher', 'outside'] })
    await send(service, group, '依次接龙', 'invalid-group-plan', []); await idle(service, group, 0)
    expect(engine.decisions).toHaveLength(0); expect(engine.contexts).toHaveLength(0)
    const result = await detail(service, group)
    expect(result.turns?.[0]).toMatchObject({ status: 'failed', modelCalls: 1 })
    await expect(service.handle('retryRun', { id: result.runs[0].id, requestId: 'invalid-plan-retry' })).rejects.toThrow('新的接续请求')
  })

  it('does not interpret direct chats or an explicitly single-addressed group request', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service), group = await conversation(service, true)
    let interpretations = 0
    engine.interpretGroup = async () => { interpretations++; return { mode: 'independent' } }
    engine.decisionHandler = async context => ({ action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence })
    await send(service, direct, '你好', 'no-plan-direct'); await idle(service, direct, 0)
    await send(service, group, '你好', 'no-plan-one-member', ['writer']); await idle(service, group, 0)
    expect(interpretations).toBe(0)
  })

  it('records an activity gap without replaying a business operation or blocking a reply', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service), store = (service as unknown as { store: ProductStore }).store
    engine.decisionHandler = async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    const transaction = store.transaction.bind(store)
    const failure = vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => {
      if (record.collection === 'profileModelCalls') throw new Error('activity disk failure')
      await tx.put(record)
    } })))
    let operations = 0
    engine.handler = async context => {
      operations++
      await context.onModelCallStarted!(context.modelCallId!, 'chat')
      await context.onModelCallUsage!(context.modelCallId!, { totalTokens: 12 })
      await context.onDelta('观测失败仍保留本次答复')
    }
    try {
      await send(service, direct, '你好', 'profile-observation-failure'); await idle(service, direct, 1)
      const result = await detail(service, direct)
      expect(operations).toBe(1); expect(result.workItems ?? []).toHaveLength(0)
      expect(result.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content === '观测失败仍保留本次答复')).toBe(true)
      expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed', activityError: '活动记录保存失败，部分统计未记录。' })
      const today = new Date().toISOString().slice(0, 10)
      expect(await service.handle('getProfileActivity', { from: today, to: today, timezone: 'UTC' })).toMatchObject({ totalTokens: null, incomplete: true })
    } finally { failure.mockRestore() }
  })

  it('persists message reactions idempotently without new turns, model calls or changing the last message', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    engine.decisionHandler = async context => ({ action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence })
    const group = await conversation(service, true), other = await conversation(service)
    const first = await send(service, group, '第一条消息', 'reaction-first', [])
    await idle(service, group, 0)
    await send(service, group, '最后一条消息', 'reaction-last', [])
    await idle(service, group, 0)
    const before = await detail(service, group), calls = engine.decisions.length
    const input = { conversationId: group.id, messageId: first.id, emoji: '👍', active: true }
    await Promise.all([service.handle('setMessageReaction', input), service.handle('setMessageReaction', input)])
    const after = await detail(service, group)
    expect(after.messages[0].reactions).toEqual([{ emoji: '👍', senderId: 'user', senderName: '我' }])
    expect(after.messages.at(-1)).toEqual(before.messages.at(-1))
    expect(after.turns).toEqual(before.turns); expect(after.runs).toEqual(before.runs)
    expect(engine.decisions).toHaveLength(calls)
    await expect(service.handle('setMessageReaction', { ...input, conversationId: other.id })).rejects.toThrow('消息不属于此会话')
    await expect(service.handle('setMessageReaction', { ...input, emoji: 'invalid' })).rejects.toThrow('不支持的表情')
    const write = vi.spyOn(ProductStore.prototype, 'write').mockRejectedValueOnce(new Error('reaction storage failed'))
    await expect(service.handle('setMessageReaction', { ...input, emoji: '❤️' })).rejects.toThrow('reaction storage failed')
    write.mockRestore()
    expect((await detail(service, group)).messages[0].reactions).toEqual(after.messages[0].reactions)
    await service.close()
    const restarted = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(restarted); await restarted.init()
    expect((await detail(restarted, group)).messages[0].reactions).toEqual(after.messages[0].reactions)
    await restarted.handle('setMessageReaction', { ...input, active: false })
    await restarted.handle('setMessageReaction', { ...input, active: false })
    expect((await detail(restarted, group)).messages[0].reactions).toEqual([])
    await restarted.handle('clearConversationHistory', { id: group.id, hide: false })
    await expect(restarted.handle('setMessageReaction', input)).rejects.toThrow('消息不属于此会话')
    expect(engine.decisions).toHaveLength(calls)
  })
  it('persists thinking per employee across old-form saves and restart, and rejects unsupported levels', async () => {
    const { service, root, secrets, engine } = await fixture()
    await configure(service)
    let agent = (await snapshot(service)).agents.find(item => item.id === 'researcher')!
    agent = await updateAgent(service, agent, { thinkingLevel: 'off' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, thinkingLevel, ...oldForm } = agent
    await service.handle('saveAgent', { ...oldForm, name: 'Researcher renamed', expectedConfigVersion: configVersion })
    expect((await snapshot(service)).agents.find(item => item.id === agent.id)?.thinkingLevel).toBe('off')
    expect((await snapshot(service)).agents.find(item => item.id === 'writer')?.thinkingLevel).toBeUndefined()
    await expect(service.handle('saveAgent', { ...oldForm, thinkingLevel: 'ultra' })).rejects.toThrow()
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} })
    services.push(reopened); await reopened.init()
    expect((await snapshot(reopened)).agents.find(item => item.id === agent.id)?.thinkingLevel).toBe('off')
    const current = (await snapshot(reopened)).agents.find(item => item.id === agent.id)!
    expect((await updateAgent(reopened, current, { thinkingLevel: 'auto' })).thinkingLevel).toBe('auto')
  })

  it('keeps trace queries scoped to the anchored turn, including explicit retries, restart and conversation cleanup', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const direct = await conversation(service), group = await conversation(service, true)
    const emitSpan = async (context: EngineContext) => context.onTrace?.({ id: context.runId, traceId: context.runId, spanId: context.runId, name: 'recorded-call', spanType: 'agent_run', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), input: context.triggerMessageId })
    engine.handler = async context => { await emitSpan(context); throw new Error('first attempt failed') }
    const first = await send(service, direct, '需要结果', 'trace-first'); await idle(service, direct, 1)
    const failed = (await detail(service, direct)).runs.find(run => run.phase === 'execution')!
    engine.handler = async context => { await emitSpan(context); await context.onDelta('已完成回复') }
    await service.handle('retryRun', { id: failed.id, requestId: 'trace-retry' }); await idle(service, direct, 2)
    const retried = await detail(service, direct), reply = retried.messages.find(message => message.senderType === 'agent' && message.status === 'completed')!
    const query = (messageId: string, turnId?: string) => service.handle('getConversationTrace', { conversationId: direct.id, messageId, turnId }) as Promise<StoredTraceSpan[]>
    expect((await query(first.id)).map(span => span.runId)).toEqual([failed.id])
    const retrySpans = await query(first.id, reply.turnId)
    expect(retrySpans).toHaveLength(1)
    expect(retrySpans[0]).toMatchObject({ runId: reply.runId, agentId: 'researcher', conversationId: direct.id, turnId: reply.turnId })
    expect(await query(reply.id)).toEqual(retrySpans)
    const other = await send(service, group, '其他会话', 'trace-other'); await idle(service, group, 2)
    await expect(query(other.id)).rejects.toThrow('消息不属于此会话')
    await expect(query(first.id, other.turnId)).rejects.toThrow('轮次不属于此消息')
    await service.close()
    const restarted = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(restarted); await restarted.init()
    expect(await restarted.handle('getConversationTrace', { conversationId: direct.id, messageId: reply.id })).toEqual(retrySpans)
    const calls = engine.contexts.length
    await restarted.handle('clearConversationHistory', { id: direct.id, hide: false })
    await expect(restarted.handle('getConversationTrace', { conversationId: direct.id, messageId: reply.id })).rejects.toThrow('消息不属于此会话')
    expect(await restarted.handle('getConversationTrace', { conversationId: group.id, messageId: other.id })).toHaveLength(2)
    expect(engine.contexts).toHaveLength(calls)
  })

  it('streams five independent member replies concurrently without restarting their first decisions', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const memberIds = ['researcher', 'writer', 'reviewer']
    for (let index = 3; index < 5; index++) memberIds.push((await service.handle('saveAgent', { name: `成员 ${index}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const group = await service.handle('createConversation', { kind: 'group', title: '成员同时交流', agentIds: memberIds }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => { await context.onDelta(`${context.agent.name}：`); await held; await context.onDelta('你好') }
    try {
      await send(service, group, '大家好', 'concurrent-chat', [])
      await until(() => engine.contexts.length === 5)
      const intermediate = await detail(service, group)
      expect(intermediate.messages.filter(message => message.status === 'streaming')).toHaveLength(5)
      expect(new Set(engine.contexts.map(context => context.agent.id))).toEqual(new Set(memberIds))
      release(); await idle(service, group, 5)
      const result = await detail(service, group)
      expect(result.turns![0].status).toBe('completed'); expect(result.workItems).toEqual([])
      expect(result.messages.filter(message => message.senderType === 'agent').every(message => message.content === `${message.senderName}：你好`)).toBe(true)
      expect(engine.decisions.filter(context => context.participation!.isFirstDecision)).toHaveLength(5)
      expect(engine.decisions.length).toBeLessThanOrEqual(10)
    } finally { release() }
  })

  it('executes five private workspaces concurrently without cross-writing or withholding independent results', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const memberIds = ['researcher', 'writer', 'reviewer']
    for (let index = 3; index < 5; index++) memberIds.push((await service.handle('saveAgent', { name: `成员 ${index}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const group = await service.handle('createConversation', { kind: 'group', title: '独立工作区并发', agentIds: memberIds }) as Conversation
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve }), paths = new Map<string, string>()
    engine.handler = async context => {
      const path = join(context.workspace!.workPath, 'result.txt')
      await writeFile(path, context.agent.id); paths.set(context.agent.id, path)
      await held; await context.onDelta(`${context.agent.name}独立结果`)
    }
    try {
      await send(service, group, '各自在自己的工作区保存 result.txt 并汇报，不需要互相等待', 'parallel-workspaces', [])
      await until(() => paths.size === 5)
      expect(new Set(paths.values()).size).toBe(5)
      for (const [id, path] of paths) expect(await readFile(path, 'utf8')).toBe(id)
      release(); await idle(service, group, 5)
      expect((await detail(service, group)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(5)
    } finally { release() }
  })

  it('keeps a slow original chat decision valid after a peer reply and generates from current context', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'researcher' && context.participation!.isFirstDecision) await held
      return { action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    try {
      await send(service, group, '大家好', 'slow-original-chat', [])
      await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed'))
      release(); await idle(service, group, 2)
      expect(engine.decisions.filter(context => context.agent.id === 'researcher')).toHaveLength(1)
      expect(engine.contexts.find(context => context.agent.id === 'researcher')!.messages.some(message => message.senderId === 'writer')).toBe(true)
    } finally { release() }
  })

  it('rechecks a task report when an earlier streaming message completes after a later message', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '并行完成顺序', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let releaseWriter!: () => void, releaseTask!: () => void, releaseReport!: () => void, markWriterEntered!: () => void
    const writerHeld = new Promise<void>(resolve => { releaseWriter = resolve }), taskHeld = new Promise<void>(resolve => { releaseTask = resolve }), reportHeld = new Promise<void>(resolve => { releaseReport = resolve })
    const writerEntered = new Promise<void>(resolve => { markWriterEntered = resolve })
    const decide = engine.decisionHandler
    engine.decisionHandler = async context => {
      if (context.agent.id === 'reviewer') await writerEntered
      return { ...await decide(context), ...(context.agent.id === 'researcher' ? {} : { responseKind: 'chat', work: undefined }) }
    }
    let reports = 0, effects = 0
    engine.handler = async context => {
      if (context.agent.id === 'researcher') { effects++; await taskHeld }
      if (context.agent.id === 'writer') { markWriterEntered(); await writerHeld }
      await context.onDelta(`${context.agent.name}结果`)
    }
    engine.report = async context => {
      reports++
      if (reports === 1) await reportHeld
      else expect(context.messages.some(message => message.senderId === 'writer' && message.status === 'completed')).toBe(true)
      return { action: 'publish', text: '汇总结果' }
    }
    try {
      await send(service, group, '各自提交结果后汇总', 'completion-order', [])
      await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'reviewer' && message.status === 'completed'))
      const intermediate = await detail(service, group)
      expect(intermediate.messages.find(message => message.senderId === 'writer')!.sequence).toBeLessThan(intermediate.messages.find(message => message.senderId === 'reviewer')!.sequence)
      releaseTask(); await until(() => reports === 1)
      releaseWriter(); await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed'))
      releaseReport(); await idle(service, group, 3)
      expect(reports).toBe(2); expect(effects).toBe(1)
    } finally { markWriterEntered(); releaseWriter(); releaseTask(); releaseReport() }
  })

  it.each([true, false])('requires a fresh business declaration after dependency continuation, bounded repair succeeds=%s', async succeeds => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let reports = 0, delegations = 0, effects = 0
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', work: { key: 'main', scope: '委派检查后汇总', deliverable: '检查汇总' }, observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (context.work!.parentWorkId) {
        effects++
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '检查完成', evidence: [{ kind: 'answer', reference: '实际检查结果42' }] })
        await context.onDelta('实际检查结果42'); return
      }
      if (!context.work!.waitRevision) {
        const child = await context.delegateWork!({ key: 'check', ownerAgentId: 'writer', scope: '检查数据', deliverable: '检查结果' }); delegations++
        await context.waitForWork!({ dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '汇总实际结果' })
        await context.onDelta('等待实际检查结果'); return
      }
      expect(context.pendingWorkWait).toBeUndefined()
      // A prior wait is not this resumed execution's result declaration.
      await context.onDelta('已完成汇总：实际检查结果42')
    }
    engine.report = async (context, draft) => {
      reports++
      expect(draft.reason).toContain('接续执行缺少本次业务结果声明')
      expect(context.beforeEffect).toBeUndefined(); expect(context.delegateWork).toBeUndefined(); expect(context.waitForWork).toBeUndefined()
      expect(context.messages.some(message => message.content === '实际检查结果42')).toBe(true)
      return { action: 'publish', text: '已完成汇总：实际检查结果42', ...(succeeds ? { outcome: { disposition: 'delivered' as const, summary: '实际汇总完成', evidence: [{ kind: 'answer' as const, reference: '实际检查结果42' }] } } : {}) }
    }
    await send(service, group, '请委派检查，收到结果后汇总', `missing-resumed-outcome-${succeeds}`, ['researcher']); await idle(service, group, 3)
    const result = await detail(service, group), parent = result.workItems!.find(work => !work.parentWorkId)!
    expect(parent.status).toBe(succeeds ? 'delivered' : 'blocked')
    expect(result.workItems!.find(work => work.parentWorkId)?.status).toBe('delivered')
    expect(reports).toBe(succeeds ? 1 : 2); expect(delegations).toBe(1); expect(effects).toBe(1)
    expect(result.messages.some(message => message.content.startsWith('已完成汇总'))).toBe(succeeds)
    expect(result.workBudgets![0]).toMatchObject({ runs: 3, modelCalls: 3 + reports, reportRefreshes: reports })
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    expect((await detail(reopened, group)).workItems).toEqual(result.workItems)
    expect(reports).toBe(succeeds ? 1 : 2); expect(effects).toBe(1)
  })

  it('maintains distinct member memories concurrently after their replies', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve }), entered: string[] = []
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.extractMemory = async context => { entered.push(context.agent.id); await held; return [] }
    try {
      await send(service, group, '大家好', 'parallel-memory', [])
      await until(() => entered.length === 2)
      expect(new Set(entered)).toEqual(new Set(group.agentIds))
      release(); await idle(service, group, 2)
    } finally { release() }
  })

  it.each(['unchanged', 'execution', 'report', 'edit'])('delegates once and resumes only its owner after repairing a waiting disposition changed in %s', async changedIn => {
    const fileTool = changedIn === 'edit' ? 'edit_file' : 'write_file'
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let childId = '', sideEffects = 0, reports = 0
    engine.report = async (context, draft) => {
      reports++
      expect(context.pendingWorkWait).toEqual({ dependencies: [{ workId: childId, resultVersion: 1 }], nextStep: '根据检查结果汇总' })
      expect(context.delegateWork).toBeUndefined(); expect(context.waitForWork).toBeUndefined()
      expect(draft.reason).toContain(changedIn === 'report' && reports === 1 ? '答复证据' : '必须为 waiting')
      return { action: 'publish', text: '等待检查结果', outcome: { disposition: changedIn === 'report' && reports === 1 ? 'progress' : 'waiting', summary: '等待写手检查后汇总' } }
    }
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', work: { key: 'main', scope: '先检查再汇总', deliverable: '汇总报告' }, observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (context.work!.parentWorkId) {
        expect(context.agent.id).toBe('writer')
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '检查已交付', evidence: [{ kind: 'answer', reference: '检查结果为 42' }] })
        await context.onDelta('检查结果为 42'); return
      }
      if (!context.work!.waitRevision) {
        await context.beforeEffect!(); sideEffects++; await context.afterEffect!()
        await context.onTool({ id: 'known-effect', name: fileTool, status: 'completed', detail: '已写入 self:/work/input.md', createdAt: new Date().toISOString() })
        const input = { key: 'check', ownerAgentId: 'writer', scope: '检查数据', deliverable: '数据检查结果' }
        const child = await context.delegateWork!(input); childId = child.id
        expect((await context.delegateWork!(input)).id).toBe(childId)
        await context.waitForWork!({ dependencies: [{ workId: childId, resultVersion: 1 }], nextStep: '根据检查结果汇总' })
        if (changedIn === 'execution') await context.onWorkOutcome!({ disposition: 'progress', summary: '已安排检查' })
        if (changedIn === 'report') await context.onWorkOutcome!({ disposition: 'waiting', summary: '等待检查', evidence: [{ kind: 'answer', reference: '尚未出现在正文中的摘录' }] })
        await context.onDelta('等待检查结果'); return
      }
      expect(context.work!.nextStep).toBe('根据检查结果汇总')
      expect(context.completedWorkTools?.flatMap(item => item.tools)).toEqual([expect.objectContaining({ name: fileTool, detail: '已写入 self:/work/input.md' })])
      expect(context.workItems!.find(work => work.id === childId)?.status).toBe('delivered')
      expect(context.messages.some(message => message.content === '检查结果为 42')).toBe(true)
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已汇总', evidence: [{ kind: 'answer', reference: '汇总：42' }] })
      await context.onDelta('汇总：42')
    }
    await send(service, group, '先委派检查，再由负责人汇总', 'delegate', ['researcher'])
    await idle(service, group, 3)
    const result = await detail(service, group)
    expect(result.workItems).toHaveLength(2); expect(result.workItems!.every(work => work.status === 'delivered')).toBe(true)
    expect(reports).toBe(['unchanged', 'edit'].includes(changedIn) ? 0 : changedIn === 'execution' ? 1 : 2)
    expect(result.workBudgets).toHaveLength(1); expect(result.workBudgets![0]).toMatchObject({ runs: 3, modelCalls: 3 + reports, reportRefreshes: reports, workItems: 2 })
    expect(result.workWakes?.map(wake => wake.status)).toEqual(['consumed', 'consumed'])
    expect(result.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4])
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer', 'researcher'])
    expect(sideEffects).toBe(1)
    expect(result.turns?.filter(turn => turn.wakeId)).toHaveLength(2)
    expect(engine.decisions.filter(context => result.turns?.some(turn => turn.wakeId && turn.id === context.turnId))).toHaveLength(0)
  })

  it.each(['discard', 'unsupported', 'limit', 'schema-error'])('preserves the original dependency wait when a stale private report is withheld by %s', async mode => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let releaseParent!: () => void, releaseChild!: () => void, childId = '', effects = 0, reports = 0
    const parentHeld = new Promise<void>(resolve => { releaseParent = resolve }), childHeld = new Promise<void>(resolve => { releaseChild = resolve })
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.messages.find(message => message.id === context.triggerMessageId)?.content === '原任务' && context.participation!.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', work: { key: 'withheld-wait', scope: '检查后汇总', deliverable: '汇总数字' }, observedThroughSequence: context.participation!.observedThroughSequence })
    engine.report = mode === 'unsupported' ? undefined : async context => {
      reports++
      expect(context.pendingWorkWait).toEqual({ dependencies: [{ workId: childId, resultVersion: 1 }], nextStep: '根据检查结果汇总' })
      expect(context.delegateWork).toBeUndefined(); expect(context.waitForWork).toBeUndefined(); expect(context.beforeEffect).toBeUndefined()
      if (mode === 'schema-error') {
        const { z } = await import('zod')
        z.object({ answerEvidence: z.never().optional() }).parse({ answerEvidence: true })
      }
      return mode === 'discard' ? { action: 'discard' } : { action: 'publish', text: '错误的旧汇报', outcome: { disposition: 'progress', summary: '错误地解除等待' } }
    }
    engine.handler = async context => {
      if (context.work!.parentWorkId) {
        await childHeld
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '检查已交付', evidence: [{ kind: 'answer', reference: '检查结果为 42' }] })
        await context.onDelta('检查结果为 42'); return
      }
      if (!context.work!.waitRevision) {
        await context.beforeEffect!(); effects++; await context.afterEffect!()
        await context.onTool({ id: 'known-effect', name: 'write_file', status: 'completed', detail: '已写入 self:/work/input.md', createdAt: new Date().toISOString() })
        const child = await context.delegateWork!({ key: 'check', ownerAgentId: 'writer', scope: '检查数据', deliverable: '数据检查结果' }); childId = child.id
        await context.waitForWork!({ dependencies: [{ workId: childId, resultVersion: 1 }], nextStep: '根据检查结果汇总' })
        await context.onDelta('基于旧输入的等待草稿'); await parentHeld; return
      }
      expect(context.agent.id).toBe('researcher'); expect(context.work!.nextStep).toBe('根据检查结果汇总')
      expect(context.workItems!.find(work => work.id === childId)?.status).toBe('delivered')
      expect(context.completedWorkTools?.flatMap(item => item.tools)).toEqual([expect.objectContaining({ id: 'known-effect' })])
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已汇总', evidence: [{ kind: 'answer', reference: '汇总：42' }] })
      await context.onDelta('汇总：42')
    }
    try {
      const source = await send(service, group, '原任务', `withheld-wait-${mode}`, ['researcher'])
      await until(async () => !!childId && (await detail(service, group)).workItems!.some(work => work.dependsOnWorkIds.includes(childId)))
      const before = await detail(service, group), original = before.workItems!.find(work => !work.parentWorkId)!, budget = before.workBudgets![0]
      await send(service, group, '补充：完成后只汇总数字', `withheld-wait-change-${mode}`, [])
      releaseParent()
      await until(async () => (await detail(service, group)).runs.some(run => run.workId === original.id && run.draft?.status === 'withheld'))
      const waiting = await detail(service, group)
      expect(waiting.workItems!.find(work => work.id === original.id)).toMatchObject({ status: 'waiting', waitRevision: 1, requiresReview: false, requiredResults: [{ workId: childId, resultVersion: 1 }], resultVersion: 0, resultMessageIds: [], sourceMessageId: source.id })
      expect(waiting.runs.find(run => run.workId === original.id && run.phase === 'execution')).toMatchObject({ status: 'completed', disposition: 'waiting', draft: { status: 'withheld', text: mode === 'limit' ? '错误的旧汇报' : '基于旧输入的等待草稿', revisions: reports } })
      if (mode === 'schema-error') expect(waiting.runs.find(run => run.workId === original.id && run.phase === 'execution')?.draft?.reason).toContain('answerEvidence')
      expect(waiting.messages.some(message => message.content === '基于旧输入的等待草稿' || message.content === '错误的旧汇报')).toBe(false)
      releaseChild(); await idle(service, group, 3)
      const result = await detail(service, group), parent = result.workItems!.find(work => work.id === original.id)!
      expect(parent).toMatchObject({ status: 'delivered', waitRevision: 1, resultVersion: 1, sourceMessageId: source.id, budgetId: budget.id, ownerAgentId: 'researcher' })
      expect(result.workBudgets).toHaveLength(1); expect(result.workBudgets![0]).toMatchObject({ id: budget.id, deadlineAt: budget.deadlineAt, runs: 3, workItems: 2, modelCalls: 3 + reports, reportRefreshes: reports })
      expect(reports).toBe(['discard', 'schema-error'].includes(mode) ? 1 : mode === 'limit' ? 2 : 0); expect(effects).toBe(1)
      expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer', 'researcher'])
      expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual(['检查结果为 42', '汇总：42'])
      expect(result.workWakes?.map(wake => wake.status)).toEqual(['consumed', 'consumed'])
      expect(engine.decisions.filter(context => result.turns?.some(turn => turn.wakeId && turn.id === context.turnId))).toHaveLength(0)
    } finally { releaseParent(); releaseChild() }
  })

  it('lets an independent delegated short task finish while its sibling is still running', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '并行子工作', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (!context.work!.parentWorkId && !context.work!.waitRevision) {
        const slow = await context.delegateWork!({ key: 'slow', ownerAgentId: 'writer', scope: '独立的长任务', deliverable: '长结果' })
        const fast = await context.delegateWork!({ key: 'fast', ownerAgentId: 'reviewer', scope: '独立的短任务', deliverable: '短结果' })
        await context.waitForWork!({ dependencies: [slow, fast].map(work => ({ workId: work.id, resultVersion: 1 })), nextStep: '合并两个实际结果' })
        await context.onDelta('等待两个独立结果'); return
      }
      if (context.work!.key === 'slow') await held
      const text = context.work!.parentWorkId ? context.work!.deliverable : '已经合并两个结果'
      await context.onWorkOutcome!({ disposition: 'delivered', summary: text, evidence: [{ kind: 'answer', reference: text }] }); await context.onDelta(text)
    }
    try {
      await send(service, group, '拆分两个独立部分并汇总', 'parallel-children', ['researcher'])
      await until(async () => (await detail(service, group)).messages.some(message => message.content === '短结果'))
      const intermediate = await detail(service, group)
      expect(intermediate.workItems!.find(work => work.key === 'slow')?.status).toBe('running')
      expect(intermediate.workItems!.find(work => !work.parentWorkId)?.status).toBe('waiting')
      release(); await idle(service, group, 4)
      const result = await detail(service, group)
      expect(result.workItems!.every(work => work.status === 'delivered')).toBe(true)
      expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual(['等待两个独立结果', '短结果', '长结果', '已经合并两个结果'])
      expect(result.workBudgets![0].runs).toBe(4)
    } finally { release() }
  })

  it('stops concurrent descendants and a queued sibling when their root is cancelled', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '停止并行工作树', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (!context.work!.parentWorkId) {
        const children = []
        for (const [key, ownerAgentId] of [['one', 'writer'], ['two', 'reviewer'], ['later', 'writer']]) children.push(await context.delegateWork!({ key, ownerAgentId, scope: key, deliverable: key }))
        await context.waitForWork!({ dependencies: children.map(work => ({ workId: work.id, resultVersion: 1 })), nextStep: '整合结果' }); await context.onDelta('等待三个结果'); return
      }
      await waitForAbort(context); await context.onDelta('不可发布的迟到内容')
    }
    await send(service, group, '完成三个子工作', 'stop-descendants', ['researcher'])
    await until(() => engine.contexts.filter(context => context.work?.parentWorkId).length === 2)
    const root = (await detail(service, group)).workItems!.find(work => !work.parentWorkId)!
    await service.handle('cancelRun', { conversationId: group.id, workId: root.id }); await idle(service, group, 3)
    const result = await detail(service, group)
    expect(result.workItems!.every(work => work.status === 'cancelled')).toBe(true)
    expect(result.workWakes!.every(wake => ['consumed', 'cancelled'].includes(wake.status))).toBe(true)
    expect(engine.contexts.filter(context => context.work?.parentWorkId).every(context => context.signal.aborted)).toBe(true)
    expect(engine.contexts.some(context => context.work?.key === 'later')).toBe(false)
    expect(result.messages.some(message => message.content.includes('不可发布'))).toBe(false)
  })

  it('preserves identical independently requested chat answers without creating shared work', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => context.onDelta('同意')
    await send(service, group, '请每位成员独立投票', 'independent-votes', []); await idle(service, group, 2)
    const result = await detail(service, group), messages = result.messages.filter(message => message.senderType === 'agent')
    expect(messages.map(message => message.content)).toEqual(['同意', '同意'])
    expect(new Set(messages.map(message => message.senderId)).size).toBe(2)
    expect(messages.map(message => message.sequence)).toEqual([2, 3])
    expect(result.workItems).toEqual([])
  })

  it('refreshes a queued delegated task with newer user instructions before starting its tools', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision && context.messages.find(message => message.id === context.triggerMessageId)?.content === '拆成两个部分' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (!context.work!.parentWorkId) {
        for (const key of ['first', 'second']) await context.delegateWork!({ key, ownerAgentId: 'writer', scope: key, deliverable: key })
        await context.onWorkOutcome!({ disposition: 'waiting', summary: '已分配两部分' }); await context.onDelta('两部分已分配'); return
      }
      if (context.work!.key === 'first') await held
      else expect(context.messages.find(message => message.id === context.triggerMessageId)?.content).toBe('新增约束：只报告结果')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '完成', evidence: [{ kind: 'answer', reference: '结果' }] }); await context.onDelta('结果')
    }
    await send(service, group, '拆成两个部分', 'two-children', ['researcher'])
    await until(() => engine.contexts.some(context => context.work?.key === 'first'))
    await send(service, group, '新增约束：只报告结果', 'latest-user', [])
    release(); await idle(service, group, 3)
    expect(engine.contexts.filter(context => context.work?.key === 'second')).toHaveLength(1)
  })

  it('keeps failed child dependencies blocked without running the waiting owner again', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' && context.participation?.isFirstDecision ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      if (context.work!.parentWorkId) throw new Error('输入损坏，不能交付')
      const child = await context.delegateWork!({ key: 'child', ownerAgentId: 'writer', scope: '检查数据', deliverable: '数据结果' })
      await context.waitForWork!({ dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '读取成功结果' }); await context.onDelta('等待结果')
    }
    await send(service, group, '检查后汇总', 'failed-child', ['researcher']); await idle(service, group, 2)
    const result = await detail(service, group)
    expect(result.workItems?.find(work => !work.parentWorkId)?.status).toBe('blocked')
    expect(result.workWakes?.find(wake => wake.kind === 'blocked')).toMatchObject({ ownerAgentId: 'researcher', status: 'pending' })
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer'])
  })

  it('can stop one work tree while another independent work keeps running', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { if (context.agent.id === 'researcher') await waitForAbort(context); else await held; await context.onDelta(context.agent.id + '完成') }
    await send(service, group, '两个独立部分', 'stop-one')
    await until(() => engine.contexts.length === 2)
    const before = await detail(service, group), target = before.workItems!.find(work => work.ownerAgentId === 'researcher')!
    await service.handle('cancelRun', { conversationId: group.id, workId: target.id })
    expect(engine.contexts.find(context => context.agent.id === 'writer')!.signal.aborted).toBe(false)
    release(); await idle(service, group, 2)
    const result = await detail(service, group)
    expect(result.workItems!.find(work => work.id === target.id)?.status).toBe('cancelled')
    expect(result.runs.find(run => run.phase === 'execution' && run.agentId === 'writer')?.status).toBe('completed')
  })

  it('does not let normal comments or thanks reopen delivered work', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let workId = ''
    engine.decisionHandler = async context => ({ action: context.agent.id === 'researcher' ? 'reply' : 'pass', responseKind: 'task', work: workId ? { key: 'main', scope: '已完成的工作', deliverable: '结果', workId, expectedVersion: context.workItems!.find(work => work.id === workId)!.version } : { key: 'main', scope: '结果', deliverable: '结果' }, observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => { workId = context.work!.id; await context.onWorkOutcome!({ disposition: 'delivered', summary: '完成', evidence: [{ kind: 'answer', reference: '42' }] }); await context.onDelta('42') }
    await send(service, group, '返回计算结果', 'first', ['researcher']); await idle(service, group, 1)
    await send(service, group, '谢谢', 'thanks', ['researcher']); await idle(service, group, 2)
    expect(engine.contexts).toHaveLength(1)
    const result = await detail(service, group)
    expect(result.workItems).toHaveLength(1); expect(result.workItems![0].status).toBe('delivered'); expect(result.workWakes).toEqual([])
  })

  it('lets independent short and long tasks publish without invalidating each other or replaying execution', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void, started!: () => void, reports = 0
    const held = new Promise<void>(resolve => { release = resolve })
    const longStarted = new Promise<void>(resolve => { started = resolve })
    engine.handler = async context => {
      if (context.agent.id === 'researcher') { started(); await held } else await longStarted
      await context.onDelta(context.agent.id === 'researcher' ? '长任务结果' : '独立短任务结果')
    }
    engine.report = async (context, draft) => {
      reports++; expect(context.messages.some(message => message.content === '独立短任务结果')).toBe(true)
      return { action: 'publish', text: draft.text }
    }
    await send(service, group, '分别完成两个独立部分', 'parallel-parts', [])
    await until(async () => (await detail(service, group)).messages.some(message => message.content === '独立短任务结果'))
    const whileRunning = await detail(service, group)
    expect(engine.contexts).toHaveLength(2)
    expect(whileRunning.runs.find(run => run.phase === 'execution' && run.agentId === 'researcher')?.status).toBe('running')
    expect(whileRunning.messages.filter(message => message.senderType === 'agent').map(message => message.senderId)).toEqual(['writer'])
    release(); await idle(service, group, 2)
    const result = await detail(service, group)
    expect(result.messages.map(message => message.sequence)).toEqual([1, 2, 3])
    expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.senderId)).toEqual(['writer', 'researcher'])
    expect(reports).toBe(0); expect(engine.contexts).toHaveLength(2)
  })

  it('runs independent task reasoning concurrently while serializing actual host commands', async () => {
    const { service, engine } = await fixture(); await configure(service)
    for (const agent of (await snapshot(service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) await updateAgent(service, agent, { allowCommands: true })
    const group = await conversation(service, true)
    let release!: () => void, active = 0, highest = 0, commands = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => {
      await withHostCommandAdmission(context.signal, async () => { active++; highest = Math.max(highest, active); if (++commands === 1) await held; active-- })
      await context.onDelta('该独立工作的结果')
    }
    await send(service, group, '处理两个可能访问同一宿主文件的任务', 'shared-resource', [])
    await until(async () => engine.contexts.length === 2 && (await detail(service, group)).runs.filter(run => run.phase === 'execution').length === 2)
    expect(engine.contexts).toHaveLength(2)
    expect(commands).toBe(1)
    release(); await idle(service, group, 2)
    expect(highest).toBe(1); expect(engine.contexts).toHaveLength(2)
    expect(new Set((await detail(service, group)).workItems!.map(work => work.id)).size).toBe(2)
  })
  it('does not start old-turn work still waiting for resources after a new user request', async () => {
    const { service, engine } = await fixture(); await configure(service)
    for (const agent of (await snapshot(service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) await updateAgent(service, agent, { allowCommands: true })
    const admission = (service as unknown as { taskAdmission: TaskAdmission }).taskAdmission
    const occupied = await Promise.all(Array.from({ length: 5 }, (_, i) => admission.acquire(false, new AbortController().signal, `occupied-${i}`)))
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    const decide = engine.decisionHandler
    engine.decisionHandler = async context => context.messages.find(message => message.id === context.triggerMessageId)?.content === '新的要求' ? { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence } : decide(context)
    engine.handler = async context => { await held; await context.onDelta('当前已执行任务的结果') }
    await send(service, group, '原来两个部分', 'old-queued', [])
    await until(async () => engine.contexts.length === 1 && (await detail(service, group)).runs.filter(run => run.phase === 'execution').length === 2)
    await send(service, group, '新的要求', 'new-priority', []); release(); await idle(service, group, 2)
    const result = await detail(service, group)
    expect(engine.contexts).toHaveLength(1)
    expect(result.runs.filter(run => run.phase === 'execution').some(run => run.status === 'cancelled' && run.error?.includes('新消息'))).toBe(true)
    expect(result.workItems).toHaveLength(1)
    occupied.forEach(release => release())
  })

  it('keeps task text private and revises only the report after new user input, without replaying effects', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let release!: () => void, writes = 0, reports = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '写结果' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      await context.beforeEffect!(); writes++; await writeFile(join(root, 'result.txt'), '已执行一次')
      await context.onDelta('原始结果'); await context.onUsage!({ outputTokens: 5 }); await held
    }
    engine.report = async (context, draft) => {
      reports++
      expect(context.messages.some(message => message.content === '请补充说明已做了什么')).toBe(true)
      expect(context.resources).toEqual([]); expect(context.workspace).toBeUndefined(); expect(context.beforeEffect).toBeUndefined()
      expect(draft.text).toBe('原始结果')
      await context.onUsage!({ outputTokens: 3 })
      return { action: 'publish', text: '文件已经写好一次；这是补充说明。' }
    }
    await send(service, direct, '写结果', 'private-task')
    await until(async () => (await detail(service, direct)).runs.some(run => run.draft?.text === '原始结果'))
    const before = await detail(service, direct)
    expect(before.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
    const incoming = await send(service, direct, '请补充说明已做了什么', 'new-facts')
    release(); await idle(service, direct, 1)
    const result = await detail(service, direct), execution = result.runs.find(run => run.phase === 'execution')!
    expect(writes).toBe(1); expect(reports).toBe(1); expect(engine.contexts).toHaveLength(1)
    expect(execution).toMatchObject({ status: 'completed', usage: { outputTokens: 8 }, draft: { status: 'published', revisions: 1 } })
    expect(result.workBudgets![0]).toMatchObject({ modelCalls: 2, runs: 1, usage: { outputTokens: 8 } })
    const answer = result.messages.find(message => message.senderType === 'agent')!
    expect(answer.content).toBe('文件已经写好一次；这是补充说明。')
    expect(answer.sequence).toBeGreaterThan(incoming.sequence)
    expect(result.messages.map(message => message.sequence)).toEqual([1, 2, 3])
  })

  it.each([true, false])('repairs mismatched delivery evidence without repeating effects, bounded even when repair succeeds=%s', async succeeds => {
    const { service, engine, root } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let writes = 0, reports = 0
    engine.handler = async context => {
      await context.beforeEffect!(); writes++; await writeFile(join(root, 'evidence-result.txt'), '60'); await context.afterEffect!()
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已计算', evidence: [{ kind: 'answer', reference: '总和：60' }] })
      await context.onDelta('总和为 **60**。')
    }
    engine.report = async (context, draft) => {
      reports++; expect(context.beforeEffect).toBeUndefined(); expect(context.onArtifact).toBeUndefined()
      expect(draft.reason).toContain('答复证据')
      expect(context.work?.outcome?.evidence).toEqual([{ kind: 'answer', reference: '总和：60' }])
      return { action: 'publish', text: succeeds ? '总和：60' : '总和为 **60**。', outcome: { disposition: 'delivered', summary: '已计算', evidence: [{ kind: 'answer', reference: '总和：60' }] } }
    }
    await send(service, direct, '计算结果并写入文件', `evidence-${succeeds}`); await idle(service, direct, 1)
    const result = await detail(service, direct), work = result.workItems![0]
    expect(writes).toBe(1); expect(await readFile(join(root, 'evidence-result.txt'), 'utf8')).toBe('60')
    expect(engine.contexts).toHaveLength(1); expect(reports).toBe(succeeds ? 1 : 2)
    expect(work.status).toBe(succeeds ? 'delivered' : 'blocked')
    expect(result.workBudgets![0]).toMatchObject({ runs: 1, modelCalls: succeeds ? 2 : 3, reportRefreshes: succeeds ? 1 : 2 })
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(succeeds ? 1 : 0)
    expect(result.runs.find(run => run.phase === 'execution')?.draft?.status).toBe(succeeds ? 'published' : 'withheld')
  })

  it('preserves a stale draft without public output when the adapter cannot safely re-report', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.report = undefined
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '原任务' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => { await context.onDelta('已完成的操作结果'); await held }
    await send(service, direct, '原任务', 'original-draft'); await until(() => engine.contexts.length === 1)
    await send(service, direct, '现在改了要求', 'changed-request'); release(); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed', disposition: 'blocked', draft: { status: 'withheld', text: '已完成的操作结果' } })
    expect(result.workItems![0]).toMatchObject({ status: 'blocked', resultMessageIds: [] })
    expect(engine.contexts).toHaveLength(1)
  })

  it('does not publish a late re-report after the user stops the task', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let finishExecution!: () => void, finishReport!: () => void, reporting = false
    const execution = new Promise<void>(resolve => { finishExecution = resolve })
    const report = new Promise<void>(resolve => { finishReport = resolve })
    engine.decisionHandler = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '执行任务' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => { await context.onDelta('已有结果'); await execution }
    engine.report = async () => { reporting = true; await report; return { action: 'publish', text: '迟到正文' } }
    await send(service, direct, '执行任务', 'stop-report-original'); await until(() => engine.contexts.length === 1)
    await send(service, direct, '更新汇报格式', 'stop-report-change'); finishExecution(); await until(() => reporting)
    await service.handle('cancelRun', { conversationId: direct.id }); finishReport(); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'cancelled', draft: { status: 'withheld' } })
    expect(result.workItems![0].status).toBe('cancelled'); expect(engine.contexts).toHaveLength(1)
  })

  it('bounds repeated stale reports without rerunning a completed task', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let release!: () => void, reports = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '原任务' ? 'reply' : 'pass', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => { await context.onDelta('已经执行'); await held }
    engine.report = async () => { reports++; await send(service, direct, `新增要求 ${reports}`, `changing-${reports}`); return { action: 'publish', text: '已更新汇报' } }
    await send(service, direct, '原任务', 'report-limit-original'); await until(() => engine.contexts.length === 1)
    await send(service, direct, '开始更改要求', 'report-limit-change'); release(); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(reports).toBe(2); expect(engine.contexts).toHaveLength(1)
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
    expect(result.runs.find(run => run.phase === 'execution')?.draft).toMatchObject({ status: 'withheld', revisions: 2 })
    expect(result.workBudgets![0].modelCalls).toBe(3)
  })

  it('creates no work for chat and admits only one execution for the shared requested task', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: context.messages[0].content === '你好' ? 'chat' : 'task', observedThroughSequence: context.participation!.observedThroughSequence })
    await send(service, group, '你好', 'no-work', []); await idle(service, group, 2)
    expect((await detail(service, group)).workItems).toEqual([])
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'task', work: { key: 'main', scope: '计算一次', deliverable: '结果' }, observedThroughSequence: context.participation!.observedThroughSequence })
    const before = engine.contexts.length
    await send(service, group, '请计算一次', 'shared-work', []); await idle(service, group, 4)
    const result = await detail(service, group)
    expect(engine.contexts.length - before).toBe(1)
    expect(result.workItems).toHaveLength(1)
    expect(result.workBudgets?.[0]).toMatchObject({ modelCalls: 1, runs: 1 })
    expect(result.deliveries!.some(delivery => delivery.error?.includes('未获得执行权'))).toBe(true)
  })

  it('records a successful run separately from a delivered business result', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => { await context.onDelta('我准备开始。') }
    await send(service, direct, '执行计算', 'intention-only'); await idle(service, direct, 1)
    let result = await detail(service, direct)
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed', disposition: 'no_progress' })
    expect(result.workItems?.[0].status).toBe('blocked')
    engine.handler = async context => {
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '提供计划', evidence: [{ kind: 'answer', reference: '第一步收集样本，第二步计算均值。' }] })
      await context.onDelta('第一步收集样本，第二步计算均值。')
    }
    await send(service, direct, '只需要计划', 'plan-only'); await idle(service, direct, 2)
    result = await detail(service, direct)
    const work = result.workItems!.find(work => work.status === 'delivered')!
    expect(work.resultMessageIds).toHaveLength(1)
    expect(result.messages.find(message => message.id === work.resultMessageIds[0])?.status).toBe('completed')
  })

  it.each([false, true])('keeps the original work and budget when the user retries a run without side effects (continuation=%s)', async continuation => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => { await context.onUsage!({ outputTokens: 9 }); throw new Error('任务网络失败') }
    await send(service, direct, '计算', 'retry-work'); await idle(service, direct, 1)
    const before = await detail(service, direct), failed = before.runs.find(run => run.phase === 'execution')!
    engine.handler = async context => { await context.onDelta('计算结果'); await context.onUsage!({ outputTokens: 7 }) }
    await service.handle('retryRun', { id: failed.id, requestId: 'explicit-retry', continuation }); await idle(service, direct, 2)
    const result = await detail(service, direct)
    expect(result.workItems).toHaveLength(1)
    expect(result.workItems![0].id).toBe(before.workItems![0].id)
    expect(result.workBudgets?.[0]).toMatchObject({ modelCalls: 2, runs: 2, usage: { outputTokens: 16 } })
  })

  it('does not acknowledge a publication whose database commit failed', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => {
      await context.onDelta('待提交的答复')
      const store = (service as unknown as { store: ProductStore }).store
      const transaction = store.transaction.bind(store)
      let rejected = false
      vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => {
        if (!rejected && record.collection === 'events' && (record.value as { type?: string }).type === 'agent_message') { rejected = true; throw new Error('注入发布写入失败') }
        await tx.put(record)
      } })))
    }
    await send(service, direct, '计算', 'failed-publication'); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.turns![0].publicMessages).toBe(0)
    expect(result.events!.filter(event => event.type === 'agent_message')).toHaveLength(0)
    expect(result.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'failed', error: '注入发布写入失败' })
    expect(result.workItems![0]).toMatchObject({ status: 'failed', resultMessageIds: [] })
    expect(result.deliveries!.some(delivery => delivery.status === 'failed')).toBe(true)
  })

  it('coalesces peer events without losing source references or the first decision opportunity', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const fourth = await service.handle('saveAgent', { name: '第四位', role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    const group = await service.handle('createConversation', { kind: 'group', title: '合并输入', agentIds: ['researcher', 'writer', 'reviewer', fourth.id] }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'reviewer' && !context.participation!.isFirstDecision) await held
      const reply = context.agent.id !== 'reviewer' && !context.participation!.hasRespondedInTurn
      return { action: reply ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    try {
      await send(service, group, '分别贡献自己的信息', 'coalesced-inputs', [])
      // Hold one member while two peer publications accumulate for it.
      await until(async () => (await detail(service, group)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length === 3)
      release(); await idle(service, group, 3)
    } finally { release() }
    const result = await detail(service, group)
    expect(engine.decisions.filter(context => context.participation?.isFirstDecision)).toHaveLength(4)
    const merged = result.deliveries!.filter(delivery => (delivery.eventIds?.length ?? 0) > 1)
    expect(merged.length).toBeGreaterThan(0)
    for (const delivery of merged) {
      expect(new Set(delivery.eventIds).size).toBe(delivery.eventIds!.length)
      expect(delivery.eventIds!.every(id => result.events!.some(event => event.id === id && event.turnId === delivery.turnId))).toBe(true)
    }
    const consumed = engine.decisions.find(context => (context.participation?.sourceEventIds?.length ?? 0) > 1)
    expect(consumed).toBeDefined()
    for (const old of result.deliveries!.filter(delivery => delivery.supersededByDeliveryId)) {
      const next = result.deliveries!.find(delivery => delivery.id === old.supersededByDeliveryId)!
      expect(next.eventIds).toEqual(expect.arrayContaining(old.eventIds!))
    }
  })

  it('retains connection capacity until cancelled adapters actually settle', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const memberIds = ['researcher', 'writer', 'reviewer']
    for (let index = 3; index < 6; index++) memberIds.push((await service.handle('saveAgent', { name: `成员 ${index}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const first = await service.handle('createConversation', { kind: 'group', title: '取消但模型尚未退出', agentIds: memberIds }) as Conversation
    const releases: (() => void)[] = []
    let physical = 0, peak = 0
    engine.decisionHandler = async context => {
      physical++; peak = Math.max(peak, physical)
      try {
        if (context.conversation.id === first.id) await new Promise<void>(resolve => releases.push(resolve))
        return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
      } finally { physical-- }
    }
    try {
      await send(service, first, '先判断', 'physical-first', []); await until(() => releases.length === 6)
      await service.handle('cancelRun', { conversationId: first.id })
      const second = await conversation(service, true)
      await send(service, second, '另一个会话的判断', 'physical-second', [])
      await until(async () => (await detail(service, second)).runs.filter(run => run.phase === 'decision').length === 2)
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(engine.decisions).toHaveLength(6)
      releases.forEach(release => release()); await idle(service, second, 0)
      expect(engine.decisions).toHaveLength(8); expect(peak).toBe(6)
    } finally { releases.forEach(release => release()) }
  })

  it('bounds one model connection across independent groups and exposes separate queue timing', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const groups = await Promise.all(Array.from({ length: 4 }, (_, index) => service.handle('createConversation', { kind: 'group', title: `共享连接 ${index}`, agentIds: ['researcher', 'writer'] }) as Promise<Conversation>))
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve }); let active = 0, highest = 0
    engine.decisionHandler = async context => {
      active++; highest = Math.max(highest, active)
      await held; active--
      return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await Promise.all(groups.map((group, index) => send(service, group, '各自判断', `capacity-${index}`, [])))
    await until(() => engine.decisions.length === 6)
    expect(highest).toBe(6); release()
    await Promise.all(groups.map(group => idle(service, group, 0)))
    expect(engine.decisions).toHaveLength(8); expect(highest).toBe(6)
    for (const group of groups) for (const run of (await detail(service, group)).runs) expect(run.timing).toMatchObject({ queueMs: expect.any(Number), executionMs: expect.any(Number), rateLimitRetries: 0 })
  })

  it('seeds only employee definitions, keeps credentials out of snapshots and reopens SQLite data', async () => {
    const { service, root, engine, secrets } = await fixture()
    const initial = await snapshot(service)
    expect(initial.agents.map(agent => agent.name)).toEqual(['研究员', '写手', '审核员', 'bobo'])
    expect(initial.conversations).toEqual([]); expect(initial.connections).toEqual([])
    const connection = await service.handle('saveConnection', { name: 'Cloud', provider: 'openai', baseUrl: '', defaultModel: 'test-model', apiKey: 'super-secret-123' }) as Connection
    expect(connection.hasApiKey).toBe(true)
    expect(JSON.stringify(await snapshot(service))).not.toContain('super-secret-123')
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    expect((await snapshot(reopened)).connections[0].id).toBe(connection.id)
    expect((await readFile(join(root, 'data', 'boai.sqlite'))).includes(Buffer.from('super-secret-123'))).toBe(false)
  })

  it('reuses one direct chat per employee and keeps independent group histories and attribution', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service); expect((await conversation(service)).id).toBe(direct.id)
    const groupA = await conversation(service, true), groupB = await conversation(service, true)
    expect(groupA.id).not.toBe(groupB.id)
    await send(service, direct, 'private direct topic', 'direct'); await idle(service, direct, 1)
    await send(service, groupA, 'group A question', 'a'); await idle(service, groupA, 2)
    await send(service, groupB, 'group B question', 'b', ['writer']); await idle(service, groupB, 1)
    const responses = (await detail(service, groupA)).messages.filter(message => message.senderType === 'agent')
    expect(new Set(responses.map(message => message.senderName))).toEqual(new Set(['研究员', '写手']))
    expect(responses.map(message => message.sequence)).toEqual([...responses.map(message => message.sequence)].sort((a, b) => a - b))
    expect(new Set(responses.map(message => message.runId)).size).toBe(2)
    for (const context of engine.contexts.filter(context => context.conversation.id === groupA.id)) {
      expect(context.messages.every(message => message.conversationId === groupA.id)).toBe(true)
      expect(JSON.stringify(context.messages)).not.toContain('private direct topic')
      expect(new Set(context.messages.map(message => message.id)).size).toBe(context.messages.length)
    }
    expect(engine.contexts.find(context => context.conversation.id === groupB.id)?.messages.map(message => message.content)).toEqual(['group B question'])
  })

  it('persists idempotency, serializes messages and excludes future queued messages from context', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { if (engine.contexts.length === 1) await held; await context.onDelta('answer') }
    const first = await send(service, group, 'first', 'same', ['researcher'])
    const duplicate = await send(service, group, 'first', 'same', ['researcher'])
    expect(duplicate.id).toBe(first.id)
    await until(() => engine.contexts.length === 1)
    await send(service, group, 'second', 'second', ['writer'])
    expect(engine.contexts.length).toBe(1)
    expect(engine.contexts[0].messages.map(message => message.content)).toEqual(['first'])
    release(); await idle(service, group, 2)
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer'])
    expect((await detail(service, group)).messages.filter(message => message.senderType === 'user')).toHaveLength(2)
    await expect(send(service, group, 'different', 'same', ['researcher'])).rejects.toThrow('requestId')
    await expect(send(service, group, 'invalid mention', 'invalid', ['reviewer'])).rejects.toThrow('有效成员')
    await send(service, group, 'normal group message', 'none', []); await idle(service, group, 4)
  })

  it('lets every member decide and permits all-pass without invoking a coordinator or tool run', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: 'pass', observedThroughSequence: context.messages.at(-1)!.sequence })
    await send(service, group, '你们好', 'all-pass', []); await idle(service, group, 0)
    expect(new Set(engine.decisions.map(context => context.agent.id))).toEqual(new Set(['researcher', 'writer']))
    expect(engine.contexts).toEqual([])
    expect((await detail(service, group)).messages.map(message => message.senderType)).toEqual(['user'])
  })

  it('preserves every first user delivery when one employee greets before the rest finish deciding', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const memberIds = ['researcher', 'writer', 'reviewer']
    for (let i = 3; i < 6; i++) memberIds.push((await service.handle('saveAgent', { name: `成员 ${i}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const group = await service.handle('createConversation', { kind: 'group', title: '问候回归', agentIds: memberIds }) as Conversation
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id !== 'writer' && context.participation?.isFirstDecision) await held
      return { action: context.agent.id === 'writer' && !context.participation?.hasRespondedInTurn ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    const userMessage = await send(service, group, '你们好', 'greeting-first-delivery', [])
    await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed'))
    release(); await idle(service, group, 1)
    const firstDecisions = engine.decisions.filter(context => context.participation?.isFirstDecision)
    expect(new Set(firstDecisions.map(context => context.agent.id))).toEqual(new Set(memberIds))
    for (const context of firstDecisions) {
      expect(context.participation).toMatchObject({ triggerEventType: 'user_message', eventMessageId: userMessage.id, hasRespondedInTurn: false })
      expect(context.messages.map(message => message.id)).toEqual([userMessage.id])
    }
    expect(engine.contexts).toHaveLength(1)
    expect((await detail(service, group)).turns?.[0].status).toBe('completed')
  })

  it('reports a partial group failure even though another member successfully replied', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '格式错误回归', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id !== 'writer') { await held; throw new Error('参与决定格式仍不正确，修复请求未能恢复') }
      return { action: context.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, group, '你们好', 'partial-decision-failure', [])
    await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed'))
    release(); await idle(service, group, 1)
    const result = await detail(service, group)
    expect(result.turns?.[0]).toMatchObject({ status: 'failed', publicMessages: 1 })
    expect(result.turns?.[0].reason).toContain('2 名员工')
    expect(new Set(result.deliveries?.filter(delivery => result.unresolvedFailureDeliveryIds?.includes(delivery.id)).map(delivery => delivery.agentId))).toEqual(new Set(['researcher', 'reviewer']))
    expect((await snapshot(service)).conversations.find(conversation => conversation.id === group.id)?.activity).toBe('failed')
    expect(new Set(result.deliveries?.filter(delivery => delivery.status === 'failed').map(delivery => delivery.agentId))).toEqual(new Set(['researcher', 'reviewer']))
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(1)
  })

  it.each(['reply', 'pass'] as const)('recovers an earlier decision failure after the same employee later makes a valid %s', async recovery => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'researcher' && context.participation!.isFirstDecision) { await held; throw new Error('首轮协议失败') }
      return { action: context.participation!.hasRespondedInTurn ? 'pass' : context.agent.id === 'writer' ? 'reply' : recovery, responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, group, '一起聊聊', `recover-decision-${recovery}`, [])
    await until(async () => (await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed'))
    release(); await idle(service, group, recovery === 'reply' ? 2 : 1)
    const result = await detail(service, group)
    expect(result.deliveries!.some(delivery => delivery.agentId === 'researcher' && delivery.status === 'failed')).toBe(true)
    expect(result.turns?.[0].status).toBe('completed')
    expect(result.turns?.[0].reason).toBeUndefined()
    expect(result.unresolvedFailureDeliveryIds).toEqual([])
    expect((await snapshot(service)).conversations[0].activity).toBe('idle')
    // Reproduce the previous version's persisted aggregate, retaining the old error.
    await service.close()
    const store = new ProductStore(join(root, 'data', 'boai.sqlite')); await store.init()
    const turn = { ...result.turns![0], status: 'failed', deliveryFailure: true, reason: '1 名员工未完成本轮判断或执行；已收到的回复会保留' }
    await store.write([{ collection: 'turns', id: turn.id, value: turn }]); await store.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    const restored = await detail(reopened, group)
    expect(restored.turns?.[0].status).toBe('completed'); expect(restored.turns?.[0].reason).toBeUndefined()
    expect(restored.unresolvedFailureDeliveryIds).toEqual([])
    expect(restored.deliveries!.some(delivery => delivery.status === 'failed')).toBe(true)
  })

  it('does not use an earlier valid pass to hide a later decision failure', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'writer') { await held; return { action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence } }
      if (!context.participation!.isFirstDecision) throw new Error('后续判断失败')
      return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, group, '继续聊聊', 'success-before-failure', [])
    await until(async () => (await detail(service, group)).deliveries!.some(delivery => delivery.agentId === 'researcher' && delivery.status === 'passed'))
    release(); await idle(service, group, 1)
    expect((await detail(service, group)).turns?.[0]).toMatchObject({ status: 'failed', reason: '1 名员工未完成本轮判断或执行；已收到的回复会保留' })
  })

  it.each(['pass', 'reply'] as const)('requires a later completed reply, rather than %s alone, to recover execution failure', async recovery => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void, researchRuns = 0; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'writer') await held
      return { action: context.participation!.hasRespondedInTurn ? 'pass' : context.agent.id === 'researcher' && !context.participation!.isFirstDecision ? recovery : 'reply', responseKind: context.agent.id === 'researcher' && context.participation!.isFirstDecision ? 'task' : 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    engine.handler = async context => { if (context.agent.id === 'researcher' && researchRuns++ === 0) throw new Error('研究任务执行失败'); await context.onDelta('任务回复') }
    await send(service, group, '研究后讨论', `execution-recovery-${recovery}`, [])
    await until(async () => (await detail(service, group)).runs.some(run => run.error === '研究任务执行失败'))
    release(); await idle(service, group, recovery === 'reply' ? 3 : 2)
    const result = await detail(service, group)
    expect(result.turns?.[0].status).toBe(recovery === 'reply' ? 'completed' : 'failed')
    expect(result.unresolvedFailureDeliveryIds?.length).toBe(recovery === 'reply' ? 0 : 1)
    expect(result.deliveries!.some(delivery => delivery.agentId === 'researcher' && delivery.status === 'failed')).toBe(true)
  })

  it('accounts a decision repair request and cumulative usage without exposing control text as a chat message', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.decisionHandler = async context => {
      await context.onUsage?.({ outputTokens: 3 })
      await context.onAdditionalModelCall!()
      await context.onUsage?.({ outputTokens: 7 })
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    engine.handler = async context => { await context.onDelta('你好'); await context.onUsage?.({ outputTokens: 2 }) }
    await send(service, direct, '你好', 'decision-repair-accounting'); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.turns?.[0]).toMatchObject({ status: 'completed', modelCalls: 3, tokenEstimate: 9 })
    expect(result.runs.find(run => run.phase === 'decision')?.usage?.outputTokens).toBe(7)
    expect(result.messages.map(message => message.content)).toEqual(['你好', '你好'])
  })
  it('retains reported usage from a rate-limited attempt when a read-only retry succeeds', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let calls = 0
    engine.decisionHandler = async context => {
      calls++; await context.onUsage!({ outputTokens: calls === 1 ? 5 : 3 })
      if (calls === 1) throw Object.assign(new Error('供应商限流'), { status: 429 })
      return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    await send(service, direct, '独立判断', 'retry-usage'); await idle(service, direct, 0)
    const result = await detail(service, direct)
    expect(calls).toBe(2)
    expect(result.runs.find(run => run.phase === 'decision')).toMatchObject({ usage: { outputTokens: 8 }, timing: { rateLimitRetries: 1 } })
    expect(result.turns![0]).toMatchObject({ modelCalls: 2, tokenEstimate: 8 })
  })

  it('rejects a repair after cancellation before another model request can start', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let release!: () => void, repaired = 0; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => { await held; await context.onAdditionalModelCall!(); repaired++; return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence } }
    await send(service, direct, '你好', 'cancel-repair'); await until(() => engine.decisions.length === 1)
    await service.handle('cancelRun', { conversationId: direct.id }); release(); await idle(service, direct, 0)
    expect(repaired).toBe(0); expect((await detail(service, direct)).turns?.[0].modelCalls).toBe(1)
  })

  it('continues additional decision requests beyond the former shared turn ceiling', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let actualRequests = 1
    engine.decisionHandler = async context => { for (let i = 0; i < 20; i++) { await context.onAdditionalModelCall!(); actualRequests++ }; return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence } }
    await send(service, direct, '请求格式异常', 'repair-budget'); await idle(service, direct, 0)
    const result = await detail(service, direct)
    expect(actualRequests).toBe(21)
    expect(result.turns?.[0]).toMatchObject({ status: 'completed', modelCalls: 21 })
    expect(result.runs[0]).toMatchObject({ status: 'completed' })
    expect(result.runs[0].error).toBeUndefined()
  })

  it('orders chats by real messages while settings edits and newer empty chats do not jump above them', async () => {
    const { service, engine } = await fixture(); await configure(service)
    engine.decisionHandler = async context => ({ action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence })
    const older = await conversation(service, true), newer = await conversation(service, true)
    const oldMessage = await send(service, older, '较早消息', 'older-message', []); await idle(service, older, 0)
    const newMessage = await send(service, newer, '最近消息', 'newer-message', []); await idle(service, newer, 0)
    const empty = await conversation(service, true)
    await service.handle('createConversation', { id: older.id, kind: 'group', title: '刚改的标题', agentIds: older.agentIds, sharedKnowledgeIds: [] })
    let state = await snapshot(service)
    expect(state.conversations.map(conversation => conversation.id)).toEqual([newer.id, older.id, empty.id])
    expect(state.conversations[0].lastMessageAt).toBe(newMessage.createdAt)
    expect(state.conversations[1].lastMessageAt).toBe(oldMessage.createdAt)
    expect(state.conversations[2].lastMessageAt).toBeUndefined()
    const latest = await send(service, older, '现在的新消息', 'latest-message', []); await idle(service, older, 0)
    state = await snapshot(service)
    expect(state.conversations[0]).toMatchObject({ id: older.id, lastMessageAt: latest.createdAt, lastMessagePreview: '现在的新消息' })
  })

  it('keeps past greetings as history without counting them as a response in a new turn', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: context.participation!.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    const first = await send(service, group, '你们好', 'greeting-round-one', []); await idle(service, group, 2)
    const second = await send(service, group, '你们好', 'greeting-round-two', []); await idle(service, group, 4)
    const firstDecisions = engine.decisions.filter(context => context.turnId === second.turnId && context.participation?.isFirstDecision)
    expect(firstDecisions).toHaveLength(2)
    for (const context of firstDecisions) {
      expect(context.participation!.hasRespondedInTurn).toBe(false)
      expect(context.triggerMessageId).toBe(second.id)
      expect(context.messages.some(message => message.turnId === first.turnId && message.senderId === context.agent.id)).toBe(true)
      expect(context.messages.filter(message => message.turnId === second.turnId).map(message => message.id)).toEqual([second.id])
    }
  })

  it('sorts persisted turns, runs and decisions chronologically instead of relying on insertion order', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const direct = await conversation(service); await service.close()
    const store = new ProductStore(join(root, 'data', 'boai.sqlite')); await store.init()
    for (const [suffix, createdAt, status] of [['new', '2026-09-27T02:00:00.000Z', 'completed'], ['old', '2026-09-27T01:00:00.000Z', 'failed']] as const) {
      const turn = { id: `${suffix}-turn`, conversationId: direct.id, triggerMessageId: `${suffix}-user`, epoch: 1, status, generation: 0, modelCalls: 1, publicMessages: 0, createdAt }
      const run = { id: `${suffix}-run`, conversationId: direct.id, agentId: 'researcher', agentName: '研究员', phase: 'decision', turnId: turn.id, triggerMessageId: turn.triggerMessageId, messageId: '', status, toolEvents: [], createdAt }
      const decision = { id: `${suffix}-decision`, turnId: turn.id, agentId: 'researcher', deliveryId: `${suffix}-delivery`, action: 'pass', observedThroughSequence: suffix === 'new' ? 2 : 1, createdAt }
      await store.write([{ collection: 'turns', id: turn.id, value: turn }, { collection: 'runs', id: run.id, value: run }, { collection: 'decisions', id: decision.id, value: decision }])
    }
    await store.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    const result = await detail(reopened, direct)
    expect(result.turns!.map(turn => turn.id)).toEqual(['old-turn', 'new-turn'])
    expect(result.runs.map(run => run.id)).toEqual(['old-run', 'new-run'])
    expect(result.decisions!.map(decision => decision.id)).toEqual(['old-decision', 'new-decision'])
    expect((await snapshot(reopened)).conversations[0].activity).toBe('idle')
  })

  it('finishes the current parallel replies then processes a new user turn before optional group continuations', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    const decide = engine.decisionHandler
    engine.decisionHandler = async context => ({ ...await decide(context), responseKind: 'chat', work: undefined })
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { if (engine.contexts.length <= 2) await held; await context.onDelta('回答当前用户') }
    const first = await send(service, group, '第一轮全员讨论', 'priority-first', [])
    await until(() => engine.contexts.length === 2)
    const second = await send(service, group, '请写手先处理这个', 'priority-second', ['writer'])
    const before = await detail(service, group)
    expect(before.messages.some(message => message.id === second.id)).toBe(true)
    release(); await idle(service, group, 3)
    expect(engine.contexts.filter(context => context.triggerMessageId === first.id)).toHaveLength(2)
    expect(engine.contexts[2]).toMatchObject({ triggerMessageId: second.id, agent: { id: 'writer' } })
  })

  it('allows the first ready member to speak without waiting for a slow decision', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'researcher') await held
      return { action: context.agent.id === 'writer' && !context.messages.some(message => message.senderId === 'writer') ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.messages.at(-1)!.sequence }
    }
    await send(service, group, '你们好', 'fast-ready', [])
    await until(() => engine.contexts.length === 1)
    expect(engine.contexts[0].agent.id).toBe('writer'); expect(engine.contexts[0].responseKind).toBe('chat'); expect(engine.contexts[0].resources).toEqual([])
    release(); await idle(service, group, 1)
    expect((await detail(service, group)).deliveries?.filter(item => item.agentId === 'researcher').length).toBeGreaterThan(1)
  })

  it('creates a new participation decision when another employee publishes a new message', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => {
      const own = context.messages.some(message => message.senderId === context.agent.id)
      const research = context.messages.some(message => message.senderId === 'researcher')
      return { action: own ? 'pass' : context.agent.id === 'researcher' || research ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.messages.at(-1)!.sequence }
    }
    await send(service, group, '讨论标题', 'follow-on', []); await idle(service, group, 2)
    const writerDecisions = engine.decisions.filter(context => context.agent.id === 'writer')
    expect(writerDecisions.length).toBeGreaterThan(1)
    expect(writerDecisions[0].messages.some(message => message.senderId === 'researcher')).toBe(false)
    expect(writerDecisions.at(-1)?.messages.some(message => message.senderId === 'researcher')).toBe(true)
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer'])
  })

  it('evaluates independent follow-up decisions concurrently after a greeting reply', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '大家好', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (!context.participation!.isFirstDecision && context.agent.id === 'researcher') await held
      const reply = !context.participation!.hasRespondedInTurn && (context.agent.id === 'writer' || (context.agent.id === 'reviewer' && !context.participation!.isFirstDecision))
      return { action: reply ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    engine.handler = async context => { await context.onDelta(`${context.agent.name}：你好`) }
    try {
      await send(service, group, '大家好', 'parallel-greeting-follow-up', [])
      await until(() => engine.decisions.some(context => context.agent.id === 'researcher' && !context.participation!.isFirstDecision))
      await until(() => engine.contexts.some(context => context.agent.id === 'reviewer'))
      const intermediate = await detail(service, group)
      expect(intermediate.runs.some(run => run.agentId === 'researcher' && run.phase === 'decision' && run.status === 'running')).toBe(true)
      expect(intermediate.messages.some(message => message.senderId === 'reviewer' && message.status === 'completed')).toBe(true)
      release(); await idle(service, group, 2)
      expect((await detail(service, group)).runs.every(run => run.status === 'completed')).toBe(true)
    } finally { release() }
  })

  it('coalesces follow-ups for a member who already replied while peers prepare their first reply', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '问候输入合并', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'researcher') await held
      const reply = !context.participation!.hasRespondedInTurn
      return { action: reply ? 'reply' : 'pass', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    try {
      await send(service, group, '大家好', 'coalesced-greeting-follow-ups', [])
      await until(async () => (await detail(service, group)).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length === 2)
      // The slow first response must not cause repeated background passes by fast peers.
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(engine.decisions.filter(context => context.participation!.hasRespondedInTurn)).toHaveLength(0)
      release(); await idle(service, group, 3)
      const result = await detail(service, group)
      expect(result.turns![0].status).toBe('completed')
      expect(result.workItems).toEqual([])
      const followUps = engine.decisions.filter(context => context.participation!.hasRespondedInTurn)
      expect(followUps).toHaveLength(2)
      for (const context of followUps) expect(context.messages.filter(message => message.senderType === 'agent')).toHaveLength(3)
    } finally { release() }
  })

  it.each(['reply', 'request_handoff'] as const)('keeps an explicit %s recipient eligible while another first response is pending', async action => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '定向接续不等待旁观成员', agentIds: ['researcher', 'writer', 'reviewer'] }) as Conversation
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      if (context.agent.id === 'researcher') await held
      const own = context.messages.filter(message => message.senderId === context.agent.id).length
      const base = { responseKind: 'chat' as const, observedThroughSequence: context.participation!.observedThroughSequence }
      if (context.agent.id === 'reviewer' && !context.participation!.isFirstDecision && own === 0) return { ...base, action, recipientAgentIds: ['writer'] }
      return { ...base, action: context.agent.id === 'writer' && own < 2 ? 'reply' : 'pass' }
    }
    try {
      await send(service, group, '写手先介绍，审核员再请写手补充', `directed-follow-up-${action}`, [])
      await until(() => engine.contexts.filter(context => context.agent.id === 'writer').length === 2)
      expect((await detail(service, group)).runs.some(run => run.agentId === 'researcher' && run.phase === 'decision' && run.status === 'running')).toBe(true)
      release(); await idle(service, group, 3)
      expect((await detail(service, group)).turns![0].status).toBe('completed')
    } finally { release() }
  })

  it.each(['reply', 'timeout'] as const)('gives a slow greeting decision the shared 30-second deadline: %s', async outcome => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let enter!: (context: EngineContext) => void, release!: () => void
    const entered = new Promise<EngineContext>(resolve => { enter = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => {
      enter(context)
      await held
      context.signal.throwIfAborted()
      return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await send(service, direct, '大家好', `slow-greeting-${outcome}`)
      const context = await entered
      await vi.advanceTimersByTimeAsync(20_000)
      expect(context.signal.aborted).toBe(false)
      if (outcome === 'timeout') {
        await vi.advanceTimersByTimeAsync(10_000)
        expect(context.signal.aborted).toBe(true)
      }
    } finally { release(); vi.useRealTimers() }
    await idle(service, direct, outcome === 'reply' ? 1 : 0)
    const result = await detail(service, direct)
    expect(result.runs.find(run => run.phase === 'decision')?.status).toBe(outcome === 'reply' ? 'completed' : 'failed')
    if (outcome === 'timeout') expect(result.runs.find(run => run.phase === 'decision')?.error).toContain('超时')
  })

  it('bounds participation decisions to six concurrent models without dropping other members', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const memberIds = ['researcher', 'writer', 'reviewer']
    for (let index = 3; index < 7; index++) memberIds.push((await service.handle('saveAgent', { name: `成员 ${index}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent).id)
    const group = await service.handle('createConversation', { kind: 'group', title: '七人群', agentIds: memberIds }) as Conversation
    let release!: () => void, concurrent = 0, highest = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => { concurrent++; highest = Math.max(highest, concurrent); await held; concurrent--; return { action: 'pass', observedThroughSequence: context.messages.at(-1)!.sequence } }
    await send(service, group, '无需工作', 'bounded', [])
    await until(() => engine.decisions.length === 6)
    expect(engine.decisions).toHaveLength(6); release(); await idle(service, group, 0)
    expect(highest).toBe(6); expect(engine.decisions).toHaveLength(7)
  })

  it.each([6, 12])('gives %i members a first contribution without treating three messages as a depth limit', async size => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    const members = ['researcher', 'writer', 'reviewer']
    for (let index = 3; index < size; index++) {
      const agent = await service.handle('saveAgent', { name: `成员 ${index}`, role: '', instructions: '', color: '#aabbcc', connectionId: connection.id, modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
      members.push(agent.id)
    }
    const group = await service.handle('createConversation', { kind: 'group', title: '各位介绍自己', agentIds: members }) as Conversation
    const decide = engine.decisionHandler
    engine.decisionHandler = async context => ({ ...await decide(context), responseKind: 'chat', work: undefined })
    await send(service, group, '请各位介绍自己', `all-first-${size}`, [])
    await idle(service, group, size)
    const result = await detail(service, group)
    expect(new Set(engine.contexts.map(context => context.agent.id))).toEqual(new Set(members))
    expect(new Set(engine.decisions.map(context => context.agent.id))).toEqual(new Set(members))
    expect(result.turns![0].generation).toBe(1)
    expect(result.deliveries!.every(delivery => ['completed', 'passed', 'skipped'].includes(delivery.status))).toBe(true)
    expect(result.turns![0].modelCalls).toBeLessThanOrEqual(Math.max(24, size * 8))
    expect(engine.decisions.length).toBeLessThanOrEqual(Math.max(12, size * 4))
  })

  it('completes a directed group exchange beyond former decision, contribution and generation ceilings', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    const total = 16
    engine.decisionHandler = async context => {
      const completed = context.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length
      const nextAgent = completed % 2 === 0 ? 'researcher' : 'writer'
      const base = { responseKind: 'chat' as const, observedThroughSequence: context.participation!.observedThroughSequence }
      return completed >= total || context.agent.id !== nextAgent ? { ...base, action: 'pass' } : {
        ...base, action: 'request_handoff', recipientAgentIds: [nextAgent === 'researcher' ? 'writer' : 'researcher'],
      }
    }
    engine.handler = async context => {
      const completed = context.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length
      await context.onDelta(`已完成协作步骤 ${completed + 1}`)
    }
    await send(service, group, '请研究员和写作员依次交接，完成十六个协作步骤', 'long-directed-exchange', ['researcher'])
    await idle(service, group, total)
    const result = await detail(service, group)
    expect(result.turns![0].status).toBe('completed')
    expect(result.turns![0].generation).toBeGreaterThan(3)
    expect(engine.decisions.length).toBeGreaterThan(12)
    for (const id of group.agentIds) expect(engine.contexts.filter(context => context.agent.id === id)).toHaveLength(8)
    expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual(Array.from({ length: total }, (_, index) => `已完成协作步骤 ${index + 1}`))
    expect(result.events!.filter(event => event.type === 'handoff')).toHaveLength(total)
    expect(result.deliveries!.some(delivery => delivery.error?.includes('上限'))).toBe(false)
  })

  it('resolves a future main-work dependency and asks the waiting employee to decide again', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => {
      const base = { observedThroughSequence: context.messages.at(-1)!.sequence }
      if (context.messages.some(message => message.senderId === context.agent.id)) return { ...base, action: 'pass' }
      if (context.agent.id === 'researcher') return { ...base, action: 'reply', responseKind: 'task', work: { key: 'research', scope: '查找事实', deliverable: '事实依据' }, proposedContribution: { key: 'main', purpose: '找到事实' } }
      const ready = context.contributions?.some(item => item.agentId === 'researcher' && item.status === 'completed')
      return { ...base, action: ready ? 'reply' : 'wait', responseKind: 'task', work: { key: 'write', scope: '根据事实撰稿', deliverable: '文章' }, proposedContribution: { key: 'main', purpose: '根据事实撰稿' }, dependsOnContributions: [{ agentId: 'researcher', key: 'main' }] }
    }
    await send(service, group, '先研究再写稿', 'main-dependency', []); await idle(service, group, 2)
    const result = await detail(service, group)
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer'])
    expect(engine.decisions.filter(context => context.agent.id === 'writer').length).toBeGreaterThan(1)
    const researcher = result.contributions!.find(item => item.agentId === 'researcher')!, writer = result.contributions!.find(item => item.agentId === 'writer')!
    expect(researcher.status).toBe('completed'); expect(writer).toMatchObject({ status: 'completed', dependsOn: [researcher.id] })
    expect(writer.resultMessageIds).toHaveLength(1)
    expect(new Set(result.deliveries!.map(delivery => delivery.id)).size).toBe(result.deliveries!.length)
    expect(result.events!.filter(event => event.type === 'agent_message')).toHaveLength(2)
  })

  it('makes upstream failures visible and gives a dependent one decision to stop waiting', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => {
      const base = { observedThroughSequence: context.messages.at(-1)!.sequence }
      if (context.agent.id === 'researcher') return { ...base, action: 'reply', responseKind: 'task', proposedContribution: { key: 'main', purpose: '研究' } }
      const failed = context.contributions?.some(item => item.agentId === 'researcher' && item.status === 'failed')
      return failed ? { ...base, action: 'ask', responseKind: 'chat', purpose: '缺少研究结果，需要澄清' } : { ...base, action: 'wait', proposedContribution: { key: 'main', purpose: '写稿' }, dependsOnContributions: [{ agentId: 'researcher', key: 'main' }] }
    }
    engine.handler = async context => { if (context.agent.id === 'researcher') throw new Error('研究服务离线'); await context.onDelta('研究服务离线，请提供资料。') }
    await send(service, group, '研究后写稿', 'dependency-failure', [])
    await until(async () => (await detail(service, group)).turns!.every(turn => ['waiting_user', 'budget_exhausted', 'completed', 'failed'].includes(turn.status)))
    const result = await detail(service, group)
    expect(result.runs.some(run => run.error === '研究服务离线')).toBe(true)
    expect(result.events?.some(event => event.type === 'dependency_resolved')).toBe(true)
    expect(result.messages.some(message => message.content.includes('请提供资料'))).toBe(true)
    expect(engine.decisions.length).toBeLessThanOrEqual(12)
  })

  it('rejects dependency cycles without leaving a waiting turn running forever', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: 'wait', proposedContribution: { key: 'main', purpose: '等待对方' }, dependsOnContributions: [{ agentId: context.agent.id === 'researcher' ? 'writer' : 'researcher', key: 'main' }], observedThroughSequence: context.messages.at(-1)!.sequence })
    await send(service, group, '相互等待', 'cycle', []); await idle(service, group, 0)
    expect((await detail(service, group)).deliveries?.some(delivery => delivery.error?.includes('循环'))).toBe(true)
    expect(engine.decisions.length).toBeLessThanOrEqual(4)
  })

  it('lets a handoff recipient decline independently and keeps explicit mentions from being抢答', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    engine.decisionHandler = async context => ({ action: context.agent.id === 'writer' ? 'pass' : 'request_handoff', responseKind: 'chat', recipientAgentIds: context.agent.id === 'researcher' ? ['writer'] : undefined, observedThroughSequence: context.messages.at(-1)!.sequence })
    await send(service, group, '请研究员交接', 'handoff', ['researcher']); await idle(service, group, 1)
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher'])
    expect(engine.decisions.filter(context => context.agent.id === 'writer')).toHaveLength(2)
    expect((await detail(service, group)).events?.filter(event => event.type === 'handoff')).toHaveLength(1)
  })

  it('accounts cumulative usage without double counting or aborting a default task', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.decisionHandler = async context => { await context.onUsage?.({ inputTokens: 10, outputTokens: 3 }); return { action: 'reply', responseKind: 'task', observedThroughSequence: context.messages.at(-1)!.sequence } }
    engine.handler = async context => { await context.onDelta('partial'); await context.onUsage?.({ outputTokens: 100 }); await context.onUsage?.({ outputTokens: 128100 }); await context.onDelta('LATE') }
    await send(service, direct, 'large operation', 'usage'); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.turns?.[0]).toMatchObject({ status: 'completed', modelCalls: 2, tokenEstimate: 128103 })
    expect(result.runs.find(run => run.phase === 'execution')?.usage?.outputTokens).toBe(128100)
    expect(result.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual(['partialLATE'])
    expect(result.runs.find(run => run.phase === 'execution')).toMatchObject({ status: 'completed' })
  })

  it('cancels ignored-signal decisions and prevents a late decision from reviving a stopped turn', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const group = await conversation(service, true)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
    engine.decisionHandler = async context => { await held; return { action: 'reply', responseKind: 'chat', observedThroughSequence: context.messages.at(-1)!.sequence } }
    await send(service, group, '慢判断', 'late-decision', []); await until(() => engine.decisions.length === 2)
    await service.handle('cancelRun', { conversationId: group.id }); release(); await idle(service, group, 0)
    const result = await detail(service, group)
    expect(result.turns?.[0].status).toBe('cancelled'); expect(result.messages).toHaveLength(1)
    expect(result.deliveries?.every(delivery => delivery.status === 'cancelled')).toBe(true)
  })

  it('cancels queued turn deliveries as well as the current speaker', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => { await context.onDelta('进行中'); await waitForAbort(context) }
    await send(service, direct, '当前任务', 'cancel-active'); await until(() => engine.contexts.length === 1)
    await send(service, direct, '等待任务', 'cancel-queued')
    await service.handle('cancelRun', { conversationId: direct.id }); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.turns?.map(turn => turn.status)).toEqual(['cancelled', 'cancelled'])
    expect(result.deliveries?.every(delivery => ['completed', 'cancelled'].includes(delivery.status))).toBe(true)
    expect(engine.contexts).toHaveLength(1)
  })

  it('saves streamed text incrementally and rejects late events after cancellation', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.decisionHandler = async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    engine.handler = async context => {
      await context.onDelta('partial')
      await waitForAbort(context)
      await context.onDelta('LATE')
      await context.onTool({ id: 'late', name: 'late-tool', detail: 'late', status: 'completed', createdAt: new Date().toISOString() })
    }
    await send(service, direct, 'question', 'cancel')
    await until(async () => (await detail(service, direct)).messages.some(message => message.content === 'partial'))
    const reader = new ProductStore(join(service.dataPath, 'boai.sqlite')); await reader.init()
    expect((await reader.load<Message>('messages')).some(message => message.content === 'partial' && message.status === 'streaming')).toBe(true); await reader.close()
    await service.handle('cancelRun', { conversationId: direct.id }); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.runs.find(run => run.phase === 'execution')?.status).toBe('cancelled'); expect(result.runs.find(run => run.phase === 'execution')?.toolEvents).toEqual([])
    expect(result.messages.at(-1)).toMatchObject({ content: 'partial', status: 'cancelled' })
  })

  it('persists approvals, resolves one decision, and aborts pending approvals on close', async () => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const researcher = (await snapshot(service)).agents[0]; await updateAgent(service, researcher, { allowCommands: true })
    const direct = await conversation(service)
    const decisions: boolean[] = []
    engine.handler = async context => { decisions.push(await context.approveCommand('node task.js', context.workspace!.runPath)); if (decisions.at(-1)) await context.onDelta('approved') }
    await send(service, direct, 'execute', 'approve')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    const approval = (await snapshot(service)).approvals[0]
    const reader = new ProductStore(join(service.dataPath, 'boai.sqlite')); await reader.init(); expect(await reader.load('approvals')).toHaveLength(1); await reader.close()
    await expect(service.backup(join(root, 'busy-backup'))).rejects.toThrow('请先停止')
    await service.handle('approve', { id: approval.id, approved: true }); await idle(service, direct, 1)
    expect(decisions).toEqual([true]); expect((await snapshot(service)).approvals).toEqual([])
    await send(service, direct, 'again', 'approve-close')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    await service.close(); expect(decisions).toEqual([true, false])
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    expect((await snapshot(reopened)).approvals).toEqual([])
    expect((await detail(reopened, direct)).runs.at(-1)?.status).toBe('interrupted')
  })

  it('does not let a slow connection test block tool approvals or cancellation', async () => {
    const { service, engine } = await fixture(); const connection = await configure(service)
    await updateAgent(service, (await snapshot(service)).agents[0], { allowCommands: true })
    const direct = await conversation(service)
    engine.handler = async context => { await context.approveCommand('echo ok', context.workspace!.runPath) }
    await send(service, direct, 'await approval', 'approval-network')
    await until(async () => (await snapshot(service)).approvals.length === 1)
    const approval = (await snapshot(service)).approvals[0]
    let release!: () => void, testStarted = false
    const held = new Promise<void>(resolve => { release = resolve })
    engine.test = async () => { testStarted = true; await held; return 'connected' }
    const pendingTest = service.handle('testConnection', { id: connection.id })
    await until(() => testStarted)
    try {
      await Promise.race([service.handle('approve', { id: approval.id, approved: false }), new Promise((_, reject) => setTimeout(() => reject(new Error('Network test blocked approval')), 500))])
      await idle(service, direct, 1)
    } finally { release(); await pendingTest }
  })

  it('recovers persisted queued, running and waiting runs as interrupted without replaying tools', async () => {
    const { service, root, engine, secrets } = await fixture(); await configure(service)
    const direct = await conversation(service); await service.close()
    const store = new ProductStore(join(root, 'data', 'boai.sqlite')); await store.init()
    const runs: AgentRun[] = ['queued', 'running', 'waiting_approval'].map((status, i) => ({ id: `old-${i}`, conversationId: direct.id, agentId: 'researcher', agentName: '研究员', triggerMessageId: 'old-user', messageId: `old-msg-${i}`, status: status as AgentRun['status'], createdAt: new Date().toISOString(), toolEvents: [] }))
    const messages: Message[] = runs.map((run, i) => ({ id: run.messageId, conversationId: direct.id, senderType: 'agent', senderId: 'researcher', senderName: '研究员', content: 'partial', status: 'streaming', sequence: i + 1, runId: run.id, createdAt: new Date().toISOString() }))
    const schedulerRecords = [
      { collection: 'turns', id: 'unfinished-turn', value: { id: 'unfinished-turn', conversationId: direct.id, triggerMessageId: 'old-user', epoch: 1, status: 'responding', generation: 1, createdAt: new Date().toISOString(), modelCalls: 2, publicMessages: 0 } },
      { collection: 'deliveries', id: 'unfinished-delivery', value: { id: 'unfinished-delivery', turnId: 'unfinished-turn', conversationId: direct.id, agentId: 'researcher', eventId: 'old-event', status: 'responding', observedThroughSequence: 1, updatedAt: new Date().toISOString() } },
      { collection: 'contributions', id: 'unfinished-main', value: { id: 'unfinished-main', turnId: 'unfinished-turn', agentId: 'researcher', key: 'main', purpose: '旧任务', status: 'running', dependsOn: [], resultMessageIds: [], artifactIds: [] } },
      { collection: 'grants', id: 'unfinished-grant', value: { id: 'unfinished-grant', turnId: 'unfinished-turn', agentId: 'researcher', decisionId: 'old-decision', contextVersion: 1, status: 'active' } },
      { collection: 'turns', id: 'old-partial-success', value: { id: 'old-partial-success', conversationId: direct.id, triggerMessageId: 'old-user', epoch: 1, status: 'completed', generation: 1, createdAt: new Date().toISOString(), modelCalls: 3, publicMessages: 1 } },
      { collection: 'deliveries', id: 'old-partial-failure', value: { id: 'old-partial-failure', turnId: 'old-partial-success', conversationId: direct.id, agentId: 'researcher', eventId: 'old-event', status: 'failed', error: '无效参与决定', observedThroughSequence: 1, updatedAt: new Date().toISOString() } },
    ]
    await store.write([...runs.map(value => ({ collection: 'runs', id: value.id, value })), ...messages.map(value => ({ collection: 'messages', id: value.id, value })), ...schedulerRecords]); await store.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    const result = await detail(reopened, direct)
    expect(result.runs.every(run => run.status === 'interrupted')).toBe(true)
    expect(result.messages.every(message => message.status === 'interrupted')).toBe(true)
    expect(result.turns?.[0].status).toBe('interrupted'); expect(result.deliveries?.[0].status).toBe('interrupted'); expect(result.contributions?.[0].status).toBe('cancelled')
    expect(result.turns?.find(turn => turn.id === 'old-partial-success')).toMatchObject({ status: 'failed', publicMessages: 1 })
    const reader = new ProductStore(join(root, 'data', 'boai.sqlite')); await reader.init()
    expect((await reader.load<{ status: string }>('grants'))[0].status).toBe('expired'); await reader.close()
    expect(engine.contexts).toEqual([])
  })

  it('limits group knowledge to bound shared resources and excludes revoked resource-derived history', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    const file = join(root, 'knowledge.md'); await writeFile(file, 'private reference')
    const knowledge = await service.handle('importResource', { kind: 'knowledge', path: file }) as Resource
    const researcher = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
    await updateAgent(service, researcher, { knowledgeIds: [knowledge.id] })
    const group = await conversation(service, true, [knowledge.id])
    engine.handler = async context => { await context.onDelta(context.resources.length ? 'derived-private-answer' : 'public-answer') }
    await send(service, group, 'research this', 'shared', ['researcher']); await idle(service, group, 1)
    expect(engine.contexts[0].resources.map(resource => resource.id)).toEqual([knowledge.id])
    await service.handle('createConversation', { id: group.id, kind: 'group', title: group.title, agentIds: group.agentIds, mode: 'mention', sharedKnowledgeIds: [] })
    await send(service, group, 'follow up', 'unshared', ['researcher']); await idle(service, group, 2)
    expect(engine.contexts[1].resources).toEqual([])
    expect(JSON.stringify(engine.contexts[1].messages)).not.toContain('derived-private-answer')
    // Preserve the original transcript as an audit record; only model context loses access.
    expect((await detail(service, group)).messages.some(message => message.content === 'derived-private-answer')).toBe(true)
    await service.handle('removeResource', { id: knowledge.id })
    expect((await snapshot(service)).agents.find(agent => agent.id === 'researcher')?.knowledgeIds).toEqual([])
  })

  it('does not give a member another employee’s knowledge even when the group shares it', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    const source = join(root, 'research.md'); await writeFile(source, 'research notes')
    const knowledge = await service.handle('importResource', { kind: 'knowledge', path: source }) as Resource
    await updateAgent(service, (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!, { knowledgeIds: [knowledge.id] })
    const group = await conversation(service, true, [knowledge.id])
    await send(service, group, 'write independently', 'writer-knowledge', ['writer']); await idle(service, group, 1)
    expect(engine.contexts[0].resources).toEqual([])
    const direct = await conversation(service)
    await send(service, direct, 'research independently', 'researcher-knowledge'); await idle(service, direct, 1)
    expect(engine.contexts[1].resources.map(resource => resource.id)).toEqual([knowledge.id])
  })

  it('keeps personal preferences across chats while explicit chat-only memory inherits resource provenance', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    await service.handle('saveMemory', { agentId: 'researcher', scope: 'profile', content: '用户喜欢简洁中文', expectedEpoch: 0 })
    const source = join(root, 'secret.txt'); await writeFile(source, '机密来源')
    const resource = await service.handle('importResource', { kind: 'knowledge', path: source }) as Resource
    await updateAgent(service, (await snapshot(service)).agents[0], { knowledgeIds: [resource.id] })
    const direct = await conversation(service), group = await conversation(service, true)
    await service.handle('createConversation', { kind: 'direct', title: direct.title, agentIds: direct.agentIds, id: direct.id, memoryScope: 'conversation' })
    engine.extractMemory = async context => context.conversation.id === direct.id ? [{ content: '只属于单聊的结论', sourceMessageIds: [context.messages.at(-1)!.id] }] : []
    await send(service, direct, '从资料学习', 'learn'); await idle(service, direct, 1)
    const query = { agentId: 'researcher', scope: 'employee', sourceConversationId: direct.id }
    const learned = await service.handle('getMemory', query) as MemoryView
    expect(learned.entries[0]).toMatchObject({ content: '只属于单聊的结论', sourceResourceIds: [resource.id] })
    expect((await detail(service, direct)).turns?.[0].modelCalls).toBe(3)
    await send(service, group, '群里打招呼', 'other-scope', ['researcher']); await idle(service, group, 1)
    const groupContext = engine.contexts.find(context => context.conversation.id === group.id)!
    expect(groupContext.memory?.entries.map(entry => entry.content)).toEqual(['用户喜欢简洁中文'])
    expect(groupContext.workspace?.root).not.toBe(engine.contexts[0].workspace?.root)
    expect(groupContext.workspace?.runPath).toContain(join('agents', 'researcher', 'workspace', 'sessions', group.id, 'runs'))
    await service.handle('removeResource', { id: resource.id })
    expect((await service.handle('getMemory', query) as MemoryView).entries).toEqual([])
  })

  it('does not resurrect cleared memory when an old extraction finishes late', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service), query = { agentId: 'researcher', scope: 'conversation', conversationId: direct.id }
    const initial = await service.handle('saveMemory', { ...query, content: '即将删除的记忆', expectedEpoch: 0 }) as MemoryView
    let release!: () => void, started = false; const held = new Promise<void>(resolve => { release = resolve })
    engine.extractMemory = async context => { started = true; await held; return [{ content: '迟到的旧记忆', sourceMessageIds: [context.messages.at(-1)!.id] }] }
    await send(service, direct, '提取记忆', 'memory-race'); await until(() => started)
    const cleared = await service.handle('clearMemory', { ...query, expectedEpoch: initial.epoch }) as MemoryView
    release(); await idle(service, direct, 1)
    expect((await service.handle('getMemory', query) as MemoryView).entries).toEqual([])
    expect(cleared.epoch).toBeGreaterThan(initial.epoch)
    expect((await detail(service, direct)).runs.find(run => run.phase === 'memory')?.status).toBe('cancelled')
  })

  it('gives a new user message priority over a slow memory maintenance call', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let release!: () => void, calls = 0; const held = new Promise<void>(resolve => { release = resolve })
    engine.extractMemory = async () => { calls++; if (calls === 1) await held; return [] }
    await send(service, direct, '第一条', 'memory-first'); await until(() => calls === 1)
    await send(service, direct, '第二条', 'memory-next')
    await until(() => engine.contexts.length === 2)
    release(); await idle(service, direct, 2)
    expect((await detail(service, direct)).runs.filter(run => run.phase === 'memory').map(run => run.status)).toEqual(['cancelled', 'completed'])
    expect(engine.contexts[1].messages.some(message => message.content === '第二条')).toBe(true)
  })

  it('restores a missing source with an empty hash and snapshots an external edit once across groups', async () => {
    const { service, engine } = await fixture(); await configure(service)
    let agent = (await snapshot(service)).agents[0]
    const soulPath = join(service.dataPath, agent.workspaceRef!, 'SOUL.md'); await rm(soulPath)
    const missing = await service.handle('readAgentFile', { agentId: agent.id, name: 'SOUL.md' }) as AgentFileContent
    expect(missing).toMatchObject({ status: 'missing', hash: '' })
    await service.handle('saveAgentFile', { agentId: agent.id, name: 'SOUL.md', content: '请简洁表达', expectedHash: '', expectedConfigVersion: agent.configVersion })
    await expect(service.handle('saveAgentFile', { agentId: agent.id, name: 'SOUL.md', content: 'stale', expectedHash: '', expectedConfigVersion: agent.configVersion })).rejects.toThrow('员工配置已变更')
    agent = (await snapshot(service)).agents[0]
    await writeFile(join(service.dataPath, agent.workspaceRef!, 'AGENTS.md'), '这是外部编辑后的规则')
    const groupA = await conversation(service, true), groupB = await conversation(service, true)
    await Promise.all([send(service, groupA, 'A', 'external-A', ['researcher']), send(service, groupB, 'B', 'external-B', ['researcher'])])
    await Promise.all([idle(service, groupA, 1), idle(service, groupB, 1)])
    const researcherContexts = engine.contexts.filter(context => context.agent.id === agent.id)
    expect(researcherContexts.every(context => context.agent.instructions === '这是外部编辑后的规则')).toBe(true)
    expect(new Set(researcherContexts.map(context => context.bootstrap?.configVersion))).toEqual(new Set([agent.configVersion + 1]))
    expect((await snapshot(service)).agents[0].configVersion).toBe(agent.configVersion + 1)
  })

  it('cancels an older group run when another phase discovers an external source edit', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const groupA = await conversation(service, true), groupB = await conversation(service, true)
    engine.handler = async context => {
      if (context.conversation.id === groupA.id) { await waitForAbort(context); await context.onDelta('LATE_OLD_RULES') }
      else await context.onDelta(context.agent.instructions)
    }
    await send(service, groupA, 'first', 'old-source', ['researcher'])
    await until(() => engine.contexts.length === 1)
    const agent = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
    await writeFile(join(service.dataPath, agent.workspaceRef!, 'AGENTS.md'), 'NEW_EXTERNAL_RULES')
    await send(service, groupB, 'second', 'new-source', ['researcher'])
    await Promise.all([idle(service, groupA, 1), idle(service, groupB, 1)])
    expect(engine.contexts[0].signal.aborted).toBe(true)
    expect((await detail(service, groupA)).messages.some(message => message.content.includes('LATE_OLD_RULES'))).toBe(false)
    expect((await detail(service, groupB)).messages.some(message => message.content.includes('NEW_EXTERNAL_RULES'))).toBe(true)
    expect(engine.contexts[0].agent.configVersion).toBe(agent.configVersion)
    expect(engine.contexts[1].agent.configVersion).toBe(agent.configVersion + 1)
  })

  it('cancels a removed member and revokes an active resource binding', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    engine.handler = async context => { await context.onDelta('working'); await waitForAbort(context); await context.onDelta('late') }
    const group = await conversation(service, true)
    await send(service, group, 'work', 'remove-member', ['researcher']); await until(() => engine.contexts.length === 1)
    await service.handle('createConversation', { id: group.id, kind: 'group', title: group.title, agentIds: ['writer'], mode: 'mention', sharedKnowledgeIds: [] })
    await idle(service, group, 1); expect(engine.contexts[0].signal.aborted).toBe(true)
    const source = join(root, 'skill'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), '---\nname: check\ndescription: Check data\n---\nRead carefully.')
    const skill = await service.handle('importResource', { kind: 'skill', path: source }) as Resource
    const writer = (await snapshot(service)).agents.find(agent => agent.id === 'writer')!
    await updateAgent(service, writer, { skillIds: [skill.id] })
    await send(service, group, 'use skill', 'remove-resource', ['writer']); await until(() => engine.contexts.length === 2)
    await service.handle('removeResource', { id: skill.id }); await idle(service, group, 2)
    expect(engine.contexts[1].signal.aborted).toBe(true)
    expect((await detail(service, group)).runs.filter(run => run.phase === 'execution').every(run => run.status === 'cancelled')).toBe(true)
    expect((await detail(service, group)).messages.every(message => !message.content.includes('late'))).toBe(true)
  })

  it('retries only failed runs idempotently with a new execution and original user message', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async () => { throw new Error('upstream failed') }
    await send(service, direct, 'retry me', 'initial'); await idle(service, direct, 1)
    const original = (await detail(service, direct)).runs.find(run => run.phase === 'execution')!
    engine.handler = async context => { await context.onDelta('recovered') }
    await service.handle('retryRun', { id: original.id, requestId: 'retry-once' })
    await service.handle('retryRun', { id: original.id, requestId: 'retry-once' }); await idle(service, direct, 2)
    const result = await detail(service, direct)
    expect(result.runs.filter(run => run.phase === 'execution').map(run => run.status)).toEqual(['failed', 'completed'])
    expect(result.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    expect(engine.contexts[1].messages.map(message => message.content)).toEqual(['retry me'])
    expect(engine.contexts[1].turnId).toBe(result.turns?.[1].id)
    expect(engine.contexts[1].turnId).not.toBe(engine.contexts[1].messages[0].turnId)
    expect(engine.decisions.at(-1)?.participation?.hasRespondedInTurn).toBe(false)
  })

  it.each(['failed', 'interrupted'] as const)('rejects ordinary retry of a %s memory run without replaying the user task', async status => {
    const { service, engine, root, secrets } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let memoryCalls = 0
    engine.extractMemory = async context => {
      memoryCalls++
      if (status === 'failed') throw new Error('memory extraction failed')
      await waitForAbort(context)
      return []
    }
    await send(service, direct, '完成这项任务', `memory-${status}`)
    await until(() => memoryCalls === 1)
    if (status === 'failed') await idle(service, direct, 1)
    await service.close()
    const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
    const before = await detail(reopened, direct)
    const memoryRun = before.runs.find(run => run.phase === 'memory')!
    expect(memoryRun.status).toBe(status)
    expect(before.runs.find(run => run.phase === 'execution')?.status).toBe('completed')
    const callsBefore = { decisions: engine.decisions.length, executions: engine.contexts.length, memory: memoryCalls }

    await expect(reopened.handle('retryRun', { id: memoryRun.id, requestId: `retry-memory-${status}` })).rejects.toThrow('记忆整理不支持此重试操作')

    const after = await detail(reopened, direct)
    expect(after.turns).toEqual(before.turns)
    expect(after.messages).toEqual(before.messages)
    expect(after.runs).toEqual(before.runs)
    expect({ decisions: engine.decisions.length, executions: engine.contexts.length, memory: memoryCalls }).toEqual(callsBefore)
  })

  it('imports skills safely, rejects unsupported knowledge, and lists only contained artifacts', async () => {
    const { service, root } = await fixture()
    const source = join(root, 'skill'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), '---\nname: check\ndescription: Check data\n---\nUse this skill.')
    const imported = await service.handle('importResource', { kind: 'skill', path: source }) as Resource
    expect(imported.name).toBe('check'); expect(await readFile(join(imported.path, 'SKILL.md'), 'utf8')).toContain('Use this skill')
    expect(imported.path).toBe(join(service.dataPath, 'skills', imported.id, 'check'))
    const sameName = await service.handle('importResource', { kind: 'skill', path: source }) as Resource
    await expect(updateAgent(service, (await snapshot(service)).agents[0], { skillIds: [imported.id, sameName.id] })).rejects.toThrow('名称相同')
    await symlink(join(root, 'data'), join(source, 'escape'))
    await expect(service.handle('importResource', { kind: 'skill', path: source })).rejects.toThrow('符号链接')
    const pdf = join(root, 'file.pdf'); await writeFile(pdf, '%PDF')
    await expect(service.handle('importResource', { kind: 'knowledge', path: pdf })).rejects.toThrow('Markdown 和 TXT')
    const direct = await conversation(service)
    await writeFile(join(direct.workspacePath, 'result.md'), 'artifact')
    await symlink(join(root, 'data', 'boai.sqlite'), join(direct.workspacePath, 'secret.sqlite'))
    expect((await detail(service, direct)).artifacts.map(artifact => artifact.name)).toEqual(['result.md'])
    await expect(service.handle('saveAgent', { ...((await snapshot(service)).agents[0]), apiKey: 'injected' })).rejects.toThrow()
  })

  it('exports a consistent credential-free backup that opens from a different data directory', async () => {
    const { service, root, engine } = await fixture(); await configure(service)
    await writeFile(join(service.dataPath, 'credentials.json'), '{"key":"must-never-back-up"}')
    const source = join(root, 'notes.txt'); await writeFile(source, 'durable source')
    const resource = await service.handle('importResource', { kind: 'knowledge', path: source }) as Resource
    const skillSource = join(root, 'backup-skill'); await mkdir(skillSource); await writeFile(join(skillSource, 'SKILL.md'), '---\nname: backup-test\ndescription: test skill\n---\nInstructions')
    const skill = await service.handle('importResource', { kind: 'skill', path: skillSource }) as Resource
    const direct = await conversation(service)
    engine.handler = async context => {
      const sourcePath = join(context.workspace!.runPath, 'owned.md')
      await writeFile(sourcePath, 'published')
      await publishArtifact(context, context.workspace!, `self:/runs/${context.runId}/owned.md`, 'published.md')
      await context.onDelta('done')
    }
    await send(service, direct, 'preserve me', 'backup-msg'); await idle(service, direct, 1)
    const original = await detail(service, direct), query = { agentId: 'researcher', scope: 'employee' as const }
    const memory = await service.handle('getMemory', query) as MemoryView
    await service.handle('saveMemory', { ...query, expectedEpoch: memory.epoch, content: '备份恢复后保留的明确偏好', sourceMessageIds: [original.messages[0].id], origin: 'user' })
    const memoryBefore = await service.handle('getMemory', query) as MemoryView
    const employee = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
    const sourceFile = await service.handle('readAgentFile', { agentId: employee.id, name: 'SOUL.md' }) as AgentFileContent
    await service.handle('saveAgentFile', { agentId: employee.id, name: 'SOUL.md', content: '只根据实际材料回答，未知时直说。', expectedHash: sourceFile.hash, expectedConfigVersion: employee.configVersion })
    const savedEmployee = (await snapshot(service)).agents.find(agent => agent.id === employee.id)!
    const savedSource = await service.handle('readAgentFile', { agentId: employee.id, name: 'SOUL.md' }) as AgentFileContent
    const profile = async (current: AppService) => {
      const result = await current.handle('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: 'bobo' } }) as { status: string; data: AgentProfile }
      expect(result.status).toBe('succeeded'); return result.data
    }
    const originalProfile = await profile(service)
    expect(originalProfile.features.emotions).toBe(true)
    const calls = { decisions: engine.decisions.length, executions: engine.contexts.length }
    await writeFile(join(direct.workspacePath, 'output.md'), 'saved output')
    expect(await service.handle('executeApplicationOperation', { operation: 'activity.configure', input: { expectedRevision: 0, saveScreenshots: true }, requestId: 'backup-activity-settings' })).toMatchObject({ status: 'succeeded' })
    const destination = join(root, 'backup'); await service.backup(destination)
    expect(await readdir(destination)).toEqual(expect.arrayContaining(['boai.sqlite', 'skills', 'knowledge', 'workspaces', 'agents', 'data-version.json', 'backup.json', 'activity-records']))
    expect(await readdir(destination)).not.toContain('credentials.json')
    expect(JSON.parse(await readFile(join(destination, 'backup.json'), 'utf8'))).toMatchObject({ credentialsIncluded: false, automationRestorePolicy: 'paused', agentBehaviorRestorePolicy: 'paused' })
    expect(await readFile(join(destination, 'RESTORE.txt'), 'utf8')).toContain('情绪/成长/旅行自动行为默认暂停')
    expect(JSON.parse(await readFile(join(destination, 'data-version.json'), 'utf8')).schemaVersion).toBe(2)
    const restorePath = join(root, 'restored'); await cp(destination, restorePath, { recursive: true })
    const restored = new AppService({ dataPath: restorePath, engine, secrets: new MemorySecrets(), emit: () => {} }); services.push(restored); await restored.init()
    expect(await restored.handle('executeApplicationOperation', { operation: 'activity.status', input: {} })).toMatchObject({ status: 'succeeded', data: { settings: { enabled: false, saveScreenshots: false, enableInputMonitor: false } } })
    const state = await snapshot(restored)
    expect(state.resources[0].id).toBe(resource.id); expect(state.resources[0].path.startsWith(restorePath)).toBe(true)
    expect(await readFile(state.resources[0].path, 'utf8')).toBe('durable source')
    const restoredSkill = state.resources.find(resource => resource.id === skill.id)!
    expect(restoredSkill.path).toBe(join(restorePath, 'skills', skill.id, 'backup-test'))
    expect(await readFile(join(restoredSkill.path, 'SKILL.md'), 'utf8')).toContain('Instructions')
    const restoredConversation = state.conversations[0]
    expect((await detail(restored, restoredConversation)).messages.some(message => message.content === 'preserve me')).toBe(true)
    expect(await readFile(join(restoredConversation.workspacePath, 'output.md'), 'utf8')).toBe('saved output')
    const published = (await detail(restored, restoredConversation)).artifacts.find(artifact => artifact.name === 'published.md')!
    const restoredRoot = await realpath(restorePath)
    expect((await realpath(published.path)).startsWith(restoredRoot)).toBe(true); expect((await realpath(published.sourcePath!)).startsWith(restoredRoot)).toBe(true)
    expect(published.ownerAgentId).toBe('researcher')
    const verifyRetainedState = async (current: AppService) => {
      const conversation = await detail(current, restoredConversation)
      expect(conversation.messages).toEqual(original.messages)
      expect(conversation.runs.map(run => [run.id, run.status])).toEqual(original.runs.map(run => [run.id, run.status]))
      expect((await snapshot(current)).agents.find(agent => agent.id === employee.id)).toEqual(savedEmployee)
      const source = await current.handle('readAgentFile', { agentId: employee.id, name: 'SOUL.md' }) as AgentFileContent
      expect([source.content, source.hash, source.status]).toEqual([savedSource.content, savedSource.hash, savedSource.status])
      expect((await current.handle('getMemory', query) as MemoryView).entries).toEqual(memoryBefore.entries)
      expect(await profile(current)).toEqual({ ...originalProfile, revision: originalProfile.revision + 1, proactive: { ...originalProfile.proactive, enabled: false }, features: { ...originalProfile.features, emotions: false, growth: false, travel: false }, behaviors: originalProfile.behaviors.map(item => ({ ...item, enabled: false })) })
      expect({ decisions: engine.decisions.length, executions: engine.contexts.length }).toEqual(calls)
    }
    await verifyRetainedState(restored)
    await restored.close()
    const restarted = new AppService({ dataPath: restorePath, engine, secrets: new MemorySecrets(), emit: () => {} }); services.push(restarted); await restarted.init()
    await verifyRetainedState(restarted)
  })
})

describe('core conversation title editing', () => {
  it('persists only the core title and update time across restart while preserving history, work, memory and authorization', async () => {
    const { service, root, engine, secrets } = await fixture(); await configure(service, ['bobo'])
    const ordinary = await conversation(service)
    const core = await service.handle('startCoreConversation', { requestId: 'core-title-first', content: '核对现有订单' }) as Conversation
    await idle(service, core, 1)
    await service.handle('updateConversationList', { id: core.id, action: 'pin', pinned: true })
    const before = await detail(service, core), initial = await snapshot(service)
    expect(before.workItems).toHaveLength(1)
    const query = { agentId: 'bobo', scope: 'employee' as const }
    const memory = await service.handle('getMemory', query) as MemoryView
    await service.handle('saveMemory', { ...query, expectedEpoch: memory.epoch, content: '这段会话已有的订单记忆', sourceMessageIds: [before.messages[0].id], origin: 'user' })
    const store = (service as unknown as { store: ProductStore }).store
    const memoryRecords = await store.load('memory'), receipts = await store.load('coreConversationStarts')
    expect(memoryRecords).not.toHaveLength(0)
    const calls = { decisions: engine.decisions.length, executions: engine.contexts.length }
    const write = vi.spyOn(store, 'write')
    try {
      await service.handle('updateConversationList', { id: core.id, action: 'rename', title: '  订单处理记录  ' })
      for (const title of ['', ' \n ', 'x'.repeat(201), 7]) await expect(service.handle('updateConversationList', { id: core.id, action: 'rename', title })).rejects.toThrow()
      await expect(service.handle('updateConversationList', { id: core.id, action: 'rename', title: '合法但额外改配置', agentIds: ['researcher'] })).rejects.toThrow()
      await expect(service.handle('updateConversationList', { id: ordinary.id, action: 'rename', title: '不可改普通员工' })).rejects.toThrow('仅核心助手')
      expect(write).toHaveBeenCalledTimes(1)
    } finally { write.mockRestore() }
    const renamed = await detail(service, core)
    expect(renamed.conversation).toEqual({ ...before.conversation, title: '订单处理记录', updatedAt: renamed.conversation.updatedAt })
    expect(Date.parse(renamed.conversation.updatedAt)).toBeGreaterThan(Date.parse(before.conversation.updatedAt))
    expect(renamed).toEqual({ ...before, conversation: renamed.conversation })
    expect((await snapshot(service)).agents).toEqual(initial.agents)
    expect(await store.load('memory')).toEqual(memoryRecords)
    expect(await store.load('coreConversationStarts')).toEqual(receipts)
    expect({ decisions: engine.decisions.length, executions: engine.contexts.length }).toEqual(calls)
    await service.close(); services.splice(services.indexOf(service), 1)
    const restarted = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(restarted); await restarted.init()
    expect(await detail(restarted, core)).toEqual(renamed)
    expect((await snapshot(restarted)).agents).toEqual(initial.agents)
    expect(await restarted.handle('getCoreConversationStart', { requestId: 'core-title-first' })).toEqual(renamed.conversation)
    expect({ decisions: engine.decisions.length, executions: engine.contexts.length }).toEqual(calls)
    const reopenedStore = (restarted as unknown as { store: ProductStore }).store
    expect(await reopenedStore.load('memory')).toEqual(memoryRecords)
    await restarted.handle('updateConversationList', { id: core.id, action: 'hide' })
    const hidden = await detail(restarted, core)
    await expect(restarted.handle('updateConversationList', { id: core.id, action: 'rename', title: '不能恢复旧会话' })).rejects.toThrow('通讯录')
    expect(await detail(restarted, core)).toEqual(hidden)
  })

  it('keeps the committed core title when storage fails and lets the same rename be explicitly retried', async () => {
    const { service, engine } = await fixture(); await configure(service, ['bobo'])
    const core = await service.handle('startCoreConversation', { requestId: 'core-title-write-failure', content: '保留旧标题' }) as Conversation
    await idle(service, core, 1)
    const before = await detail(service, core), calls = engine.contexts.length
    const store = (service as unknown as { store: ProductStore }).store
    const write = vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('title storage failed'))
    try { await expect(service.handle('updateConversationList', { id: core.id, action: 'rename', title: '新标题' })).rejects.toThrow('title storage failed') }
    finally { write.mockRestore() }
    expect(await detail(service, core)).toEqual(before)
    expect((await store.load<Conversation>('conversations')).find(item => item.id === core.id)).toEqual(before.conversation)
    await service.handle('updateConversationList', { id: core.id, action: 'rename', title: '新标题' })
    expect((await detail(service, core)).conversation).toEqual({ ...before.conversation, title: '新标题', updatedAt: expect.any(String) })
    expect(engine.contexts).toHaveLength(calls)
  })
})

describe('conversation history cleanup', () => {
  it('permanently clears conversation data, files and caches; restores the same empty conversation after restart', async () => {
    const { service, root, engine, secrets } = await fixture()
    await configure(service)
    const target = await conversation(service), other = await conversation(service, true)
    await send(service, target, '仅在这段聊天出现的内容', 'erase-request')
    await idle(service, target, 1)
    const before = await detail(service, target)
    const query = { agentId: 'researcher', conversationId: target.id, scope: 'conversation' as const }
    const memory = await service.handle('getMemory', query) as MemoryView
    await service.handle('saveMemory', { ...query, expectedEpoch: memory.epoch, content: '需要一并清理的记忆', sourceMessageIds: [before.messages[0].id], origin: 'user' })
    const session = join(root, 'data', 'agents', 'researcher', 'workspace', 'sessions', target.id)
    await mkdir(session, { recursive: true })
    await writeFile(join(session, 'private.txt'), 'private')
    await writeFile(join(target.workspacePath, 'media.png'), 'media')
    await writeFile(join(other.workspacePath, 'keep.txt'), 'keep')
    await service.handle('clearConversationHistory', { id: target.id, hide: true })
    const cleared = await detail(service, target)
    for (const collection of ['messages', 'runs', 'turns', 'events', 'deliveries', 'decisions', 'contributions', 'workItems', 'workBudgets', 'workWakes', 'artifacts'] as const) expect(cleared[collection]).toEqual([])
    expect(cleared.conversation.list?.hidden).toBe(true)
    expect((await service.handle('getMemory', query) as MemoryView).entries).toEqual([])
    await expect(readFile(join(session, 'private.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(target.workspacePath, 'media.png'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(other.workspacePath, 'keep.txt'), 'utf8')).toBe('keep')
    await service.close(); services.splice(services.indexOf(service), 1)
    const restarted = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(restarted)
    await restarted.init()
    const restored = await restarted.handle('createConversation', { kind: 'direct', title: '研究', agentIds: ['researcher'] }) as Conversation
    expect(restored.id).toBe(target.id)
    expect((await detail(restarted, target)).messages).toEqual([])
    await restarted.handle('updateConversationList', { id: target.id, action: 'show' })
    await expect(send(restarted, target, '新的聊天', 'erase-request')).rejects.toThrow('旧请求不能重放')
    await send(restarted, target, '新的聊天', 'fresh-after-clear')
    await idle(restarted, target, 1)
    const fresh = await detail(restarted, target)
    expect(fresh.messages[0].sequence).toBe(1)
    expect(fresh.messages.every(message => !before.messages.some(old => old.id === message.id))).toBe(true)
  })
  it('refuses cleanup while a cancelled adapter is still exiting', async () => {
    const { service, engine } = await fixture()
    await configure(service)
    const target = await conversation(service)
    let release!: () => void
    engine.handler = () => new Promise<void>(resolve => { release = resolve })
    await send(service, target, '尚未结束的任务', 'running-cleanup')
    await until(() => Boolean(release))
    await expect(service.handle('clearConversationHistory', { id: target.id, hide: false })).rejects.toThrow('先停止')
    await service.handle('cancelRun', { conversationId: target.id })
    await expect(service.handle('clearConversationHistory', { id: target.id, hide: false })).rejects.toThrow('先停止')
    release()
    await until(async () => { try { await service.handle('clearConversationHistory', { id: target.id, hide: false }); return true } catch { return false } })
    expect((await detail(service, target)).messages).toEqual([])
  })
})

it('stores streamed API narration once, independently from the final message and legacy task summary', async () => {
 const { service, engine } = await fixture(); await configure(service)
 const chat = await conversation(service)
 engine.handler = async context => {
  await context.onExecutionEvent?.({ id: 'live-text', eventType: 'agent.text.block', payload: { text: '' }, appendText: '正在读取' })
  await context.onExecutionEvent?.({ id: 'live-text', eventType: 'agent.text.block', payload: { text: '' }, appendText: '文件' })
  await context.onTool({ id: 'step', name: 'task_step', status: 'completed', detail: '正在读取文件', createdAt: new Date().toISOString() })
  await context.onDelta('最终答复')
 }
 await send(service, chat, '处理文件', 'stream-once'); await idle(service, chat, 1)
 const state = await detail(service, chat), run = state.runs.find(run => run.phase === 'execution')!
 const evidence = await service.handle('listExecutionEvidence', { conversationId: chat.id, runId: run.id }) as import('../packages/shared/src/domain/execution').ExecutionEvidencePage
 expect(evidence.items.map(event => event.payload)).toEqual([{ text: '正在读取文件' }])
 expect(state.messages.filter(message => message.senderType === 'agent').map(message => message.content)).toEqual(['最终答复'])
})


it('persists execution modes and applies actual operation approvals before file and command effects', async () => {
  const { service, engine, root, secrets } = await fixture(); await configure(service)
  let employee = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
  employee = await updateAgent(service, employee, { executionPermission: 'ask', allowCommands: true, modelId: '' })
  const direct = await conversation(service)
  let activeContext!: EngineContext
  engine.handler = async context => {
    activeContext = context
    const runtime = await createTaskRuntime(context)
    const invocation = { requestContext: new RequestContext(), observe: noopObserve }
    try {
      await runtime.tools.write_file.execute!({ path: `self:/runs/${context.runId}/proof.txt`, content: 'file effect' }, invocation)
      await runtime.tools.execute_command!.execute!({ command: "printf 'command effect' > command.txt" }, invocation)
      await context.onDelta('实际操作完成')
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '实际操作完成', evidence: [{ kind: 'answer', reference: '实际操作完成' }] })
    } finally { await runtime.dispose() }
  }
  await send(service, direct, '执行权限检查', 'permission-ask')
  await until(async () => (await snapshot(service)).approvals.length === 1)
  const fileApproval = (await snapshot(service)).approvals[0]
  expect(fileApproval).toMatchObject({ kind: 'file', rememberAllowed: false })
  const askedDirectory = activeContext.workspace!.runPath
  await expect(readFile(join(askedDirectory, 'proof.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  await service.handle('approve', { id: fileApproval.id, approved: true })
  await until(async () => (await snapshot(service)).approvals.some(approval => approval.kind === 'command'))
  const commandApproval = (await snapshot(service)).approvals[0]
  expect(commandApproval.rememberAllowed).toBe(false)
  expect(await readFile(join(askedDirectory, 'proof.txt'), 'utf8')).toBe('file effect')
  await expect(readFile(join(askedDirectory, 'command.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  await service.handle('approve', { id: commandApproval.id, approved: false }); await idle(service, direct, 1)
  await expect(readFile(join(askedDirectory, 'command.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  employee = await updateAgent(service, employee, { executionPermission: 'full-access' })
  await send(service, direct, '按完全访问执行检查', 'permission-full'); await idle(service, direct, 2)
  expect((await snapshot(service)).approvals).toEqual([])
  expect(await readFile(join(activeContext.workspace!.runPath, 'command.txt'), 'utf8')).toBe('command effect')
  employee = await updateAgent(service, employee, { executionPermission: 'read-only', allowCommands: true })
  expect(employee.allowCommands).toBe(false)
  await send(service, direct, '只读权限检查', 'permission-read'); await idle(service, direct, 3)
  await expect(readFile(join(activeContext.workspace!.runPath, 'proof.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await snapshot(service)).approvals).toEqual([])
  expect((await detail(service, direct)).runs.find(run => run.id === activeContext.runId)?.error).toContain('只读')
  await service.close()
  const reopened = new AppService({ dataPath: join(root, 'data'), engine, secrets, emit: () => {} }); services.push(reopened); await reopened.init()
  expect((await snapshot(reopened)).agents.find(agent => agent.id === employee.id)).toMatchObject({ executionPermission: 'read-only', allowCommands: false, modelId: '' })
})
