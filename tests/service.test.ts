/*
 * [INPUT]: AppService、产品存储、领域类型与内部执行合同。
 * [OUTPUT]: 独立聊天并行流式/完成顺序/容量与判断时限、认领/预算、独立子工作、私有草稿/证据/等待修复、实际调用容量及永久会话清理回归。
 * [POS]: tests/service.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine, EngineContext, SecretStore } from '../src/runtime/contracts'
import type { AgentInput, AgentRun, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Resource, Snapshot, ParticipationDecision, MemoryView, AgentFileContent } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'

const roots: string[] = []
const services: AppService[] = []
class MemorySecrets implements SecretStore {
  values = new Map<string, string>()
  async get(id: string) { return this.values.get(id) }
  async set(id: string, value: string) { this.values.set(id, value) }
  async delete(id: string) { this.values.delete(id) }
}
class FakeEngine implements AgentEngine {
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
    let releaseWriter!: () => void, releaseTask!: () => void, releaseReport!: () => void
    const writerHeld = new Promise<void>(resolve => { releaseWriter = resolve }), taskHeld = new Promise<void>(resolve => { releaseTask = resolve }), reportHeld = new Promise<void>(resolve => { releaseReport = resolve })
    const decide = engine.decisionHandler
    engine.decisionHandler = async context => ({ ...await decide(context), ...(context.agent.id === 'researcher' ? {} : { responseKind: 'chat', work: undefined }) })
    let reports = 0, effects = 0
    engine.handler = async context => {
      if (context.agent.id === 'researcher') { effects++; await taskHeld }
      if (context.agent.id === 'writer') await writerHeld
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
    } finally { releaseWriter(); releaseTask(); releaseReport() }
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

  it.each(['unchanged', 'execution', 'report'])('delegates once and resumes only its owner after repairing a waiting disposition changed in %s', async changedIn => {
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
        await context.onTool({ id: 'known-effect', name: 'write_file', status: 'completed', detail: '已写入 self:/work/input.md', createdAt: new Date().toISOString() })
        const input = { key: 'check', ownerAgentId: 'writer', scope: '检查数据', deliverable: '数据检查结果' }
        const child = await context.delegateWork!(input); childId = child.id
        expect((await context.delegateWork!(input)).id).toBe(childId)
        await context.waitForWork!({ dependencies: [{ workId: childId, resultVersion: 1 }], nextStep: '根据检查结果汇总' })
        if (changedIn === 'execution') await context.onWorkOutcome!({ disposition: 'progress', summary: '已安排检查' })
        if (changedIn === 'report') await context.onWorkOutcome!({ disposition: 'waiting', summary: '等待检查', evidence: [{ kind: 'answer', reference: '尚未出现在正文中的摘录' }] })
        await context.onDelta('等待检查结果'); return
      }
      expect(context.work!.nextStep).toBe('根据检查结果汇总')
      expect(context.completedWorkTools?.flatMap(item => item.tools)).toEqual([expect.objectContaining({ name: 'write_file', detail: '已写入 self:/work/input.md' })])
      expect(context.workItems!.find(work => work.id === childId)?.status).toBe('delivered')
      expect(context.messages.some(message => message.content === '检查结果为 42')).toBe(true)
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已汇总', evidence: [{ kind: 'answer', reference: '汇总：42' }] })
      await context.onDelta('汇总：42')
    }
    await send(service, group, '先委派检查，再由负责人汇总', 'delegate', ['researcher'])
    await idle(service, group, 3)
    const result = await detail(service, group)
    expect(result.workItems).toHaveLength(2); expect(result.workItems!.every(work => work.status === 'delivered')).toBe(true)
    expect(reports).toBe(changedIn === 'unchanged' ? 0 : changedIn === 'execution' ? 1 : 2)
    expect(result.workBudgets).toHaveLength(1); expect(result.workBudgets![0]).toMatchObject({ runs: 3, modelCalls: 3 + reports, reportRefreshes: reports, workItems: 2 })
    expect(result.workWakes?.map(wake => wake.status)).toEqual(['consumed', 'consumed'])
    expect(result.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4])
    expect(engine.contexts.map(context => context.agent.id)).toEqual(['researcher', 'writer', 'researcher'])
    expect(sideEffects).toBe(1)
    expect(result.turns?.filter(turn => turn.wakeId)).toHaveLength(2)
    expect(engine.decisions.filter(context => result.turns?.some(turn => turn.wakeId && turn.id === context.turnId))).toHaveLength(0)
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
    let release!: () => void, reports = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => { if (context.agent.id === 'researcher') await held; await context.onDelta(context.agent.id === 'researcher' ? '长任务结果' : '独立短任务结果') }
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

  it('keeps potentially conflicting host-command tasks serial even with different work IDs', async () => {
    const { service, engine } = await fixture(); await configure(service)
    for (const agent of (await snapshot(service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) await updateAgent(service, agent, { allowCommands: true })
    const group = await conversation(service, true)
    let release!: () => void, active = 0, highest = 0
    const held = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => {
      active++; highest = Math.max(highest, active)
      if (engine.contexts.length === 1) await held
      await context.onDelta('该独立工作的结果'); active--
    }
    await send(service, group, '处理两个可能访问同一宿主文件的任务', 'shared-resource', [])
    await until(async () => engine.contexts.length === 1 && (await detail(service, group)).runs.filter(run => run.phase === 'execution').length === 2)
    expect(engine.contexts).toHaveLength(1)
    release(); await idle(service, group, 2)
    expect(highest).toBe(1); expect(engine.contexts).toHaveLength(2)
    expect(new Set((await detail(service, group)).workItems!.map(work => work.id)).size).toBe(2)
  })
  it('does not start old-turn work still waiting for resources after a new user request', async () => {
    const { service, engine } = await fixture(); await configure(service)
    for (const agent of (await snapshot(service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) await updateAgent(service, agent, { allowCommands: true })
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

  it('keeps the original work and budget when the user retries a run without side effects', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.handler = async context => { await context.onUsage!({ outputTokens: 9 }); throw new Error('任务网络失败') }
    await send(service, direct, '计算', 'retry-work'); await idle(service, direct, 1)
    const before = await detail(service, direct), failed = before.runs.find(run => run.phase === 'execution')!
    engine.handler = async context => { await context.onDelta('计算结果'); await context.onUsage!({ outputTokens: 7 }) }
    await service.handle('retryRun', { id: failed.id, requestId: 'explicit-retry' }); await idle(service, direct, 2)
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
      vi.spyOn(store, 'transaction').mockRejectedValueOnce(new Error('注入发布写入失败'))
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
    expect(initial.agents.map(agent => agent.name)).toEqual(['研究员', '写手', '审核员'])
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

  it('denies additional decision requests once the shared turn budget is exhausted', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    let actualRequests = 1
    engine.decisionHandler = async context => { for (let i = 0; i < 20; i++) { await context.onAdditionalModelCall!(); actualRequests++ }; return { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence } }
    await send(service, direct, '请求格式异常', 'repair-budget'); await idle(service, direct, 0)
    const result = await detail(service, direct)
    expect(actualRequests).toBe(12)
    expect(result.turns?.[0]).toMatchObject({ status: 'budget_exhausted', modelCalls: 12 })
    expect(result.runs[0].error).toContain('判断调用上限')
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

  it('accounts cumulative model usage without double counting and stops a runaway tool response', async () => {
    const { service, engine } = await fixture(); await configure(service)
    const direct = await conversation(service)
    engine.decisionHandler = async context => { await context.onUsage?.({ inputTokens: 10, outputTokens: 3 }); return { action: 'reply', responseKind: 'task', observedThroughSequence: context.messages.at(-1)!.sequence } }
    engine.handler = async context => { await context.onDelta('partial'); await context.onUsage?.({ outputTokens: 100 }); await context.onUsage?.({ outputTokens: 16100 }); await context.onDelta('LATE') }
    await send(service, direct, 'large operation', 'usage'); await idle(service, direct, 1)
    const result = await detail(service, direct)
    expect(result.turns?.[0]).toMatchObject({ status: 'budget_exhausted', modelCalls: 2, tokenEstimate: 16103 })
    expect(result.runs.find(run => run.phase === 'execution')?.usage?.outputTokens).toBe(16100)
    expect(result.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
    expect(result.runs.find(run => run.phase === 'execution')?.draft).toMatchObject({ text: 'partial', status: 'withheld' })
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

  it('keeps personal preferences across chats but scopes learned memory and inherits resource provenance', async () => {
    const { service, engine, root } = await fixture(); await configure(service)
    await service.handle('saveMemory', { agentId: 'researcher', scope: 'profile', content: '用户喜欢简洁中文', expectedEpoch: 0 })
    const source = join(root, 'secret.txt'); await writeFile(source, '机密来源')
    const resource = await service.handle('importResource', { kind: 'knowledge', path: source }) as Resource
    await updateAgent(service, (await snapshot(service)).agents[0], { knowledgeIds: [resource.id] })
    const direct = await conversation(service), group = await conversation(service, true)
    engine.extractMemory = async context => context.conversation.id === direct.id ? [{ content: '只属于单聊的结论', sourceMessageIds: [context.messages.at(-1)!.id] }] : []
    await send(service, direct, '从资料学习', 'learn'); await idle(service, direct, 1)
    const query = { agentId: 'researcher', scope: 'conversation', conversationId: direct.id }
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
      const sourcePath = join(context.workspace!.runPath, 'owned.md'), destination = join(context.conversation.workspacePath, 'published.md')
      await writeFile(sourcePath, 'published'); await cp(sourcePath, destination)
      await context.onArtifact?.({ path: destination, sourcePath, name: 'published.md', size: 9 })
      await context.onDelta('done')
    }
    await send(service, direct, 'preserve me', 'backup-msg'); await idle(service, direct, 1)
    await writeFile(join(direct.workspacePath, 'output.md'), 'saved output')
    const destination = join(root, 'backup'); await service.backup(destination)
    expect(await readdir(destination)).toEqual(expect.arrayContaining(['boai.sqlite', 'skills', 'knowledge', 'workspaces', 'agents', 'data-version.json', 'backup.json']))
    expect(await readdir(destination)).not.toContain('credentials.json')
    expect(JSON.parse(await readFile(join(destination, 'backup.json'), 'utf8')).credentialsIncluded).toBe(false)
    expect(JSON.parse(await readFile(join(destination, 'data-version.json'), 'utf8')).schemaVersion).toBe(2)
    const restorePath = join(root, 'restored'); await cp(destination, restorePath, { recursive: true })
    const restored = new AppService({ dataPath: restorePath, engine, secrets: new MemorySecrets(), emit: () => {} }); services.push(restored); await restored.init()
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
    expect(published.path.startsWith(restorePath)).toBe(true); expect(published.sourcePath?.startsWith(restorePath)).toBe(true)
    expect(published.ownerAgentId).toBe('researcher')
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
    await send(restarted, target, '新的聊天', 'erase-request')
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
