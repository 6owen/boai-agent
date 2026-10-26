/*
 * [OUTPUT]: 实际AppService记忆装配保持用户原文与保存时间/内容主体边界，不虚构事件时间。
 * [INPUT]: 真实 AppService/SQLite/工作区和无工具可控模型，独立持久目录。
 * [OUTPUT]: 双向即时接续、员工隔离/范围收紧、忘记发布门禁/清理冲突、纠正/临时失效与重启/备份回归；真实运行只随实际使用来源清理失效，无关清空继续交付且派生回复保持可用。
 * [OUTPUT]: 真实AppService持有重新汇报时新增派生回复的相关/无关清理门禁、持久获知来源与后续传播；可控时钟超过30秒仍沿原Work绝对期限，不续期、不增加额度或重放执行。
 * [POS]: T2 宿主验收，读取实际 EngineContext 和文件，普通聊天不产生 Work。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../packages/runtime/src/service'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, MemoryCandidate, MemoryView, Snapshot, ParticipationDecision } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
class Model implements AgentEngine {
  contexts: EngineContext[] = []
  extractMemory?: AgentEngine['extractMemory']
  report?: AgentEngine['report']
  handler = async (context: EngineContext) => { await context.onDelta('已收到当前消息。') }
  async decide(context: EngineContext): Promise<ParticipationDecision> { return { action: context.messages.some(message => message.turnId === context.turnId && message.senderId === context.agent.id && message.status === 'completed') ? 'pass' as const : 'reply' as const, responseKind: 'chat' as const, observedThroughSequence: context.participation!.observedThroughSequence } }
  async run(context: EngineContext) { this.contexts.push(context); await this.handler(context) }
  async test() { return 'ok' }
}
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-unified-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const engine = new Model(), service = await open(root, engine)
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test' }) as Connection
  const snapshot = await service.handle('snapshot', undefined) as Snapshot
  for (const a of snapshot.agents) { const { workspaceRef: _, configVersion: _v, memoryNamespace: _n, policyVersion: _p, ...input } = a; await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test' }) }
  const direct = await service.handle('createConversation', { kind: 'direct', title: '私聊', agentIds: ['researcher'] }) as Conversation
  const group = await service.handle('createConversation', { kind: 'group', title: '项目甲', agentIds: ['researcher', 'writer'] }) as Conversation
  return { root, service, engine, direct, group }
}
async function open(root: string, engine: Model) { const service = new AppService({ dataPath: root, engine, secrets, emit: () => {} }); await service.init(); cleanup.push(() => service.close()); return service }
async function detail(service: AppService, c: Conversation) { return service.handle('getConversation', { id: c.id }) as Promise<ConversationDetail> }
async function send(service: AppService, c: Conversation, content: string, members = ['researcher']) {
  await service.handle('sendMessage', { conversationId: c.id, content, mentionIds: c.kind === 'group' ? members : [], requestId: crypto.randomUUID() })
  await vi.waitFor(async () => { const d = await detail(service, c); expect(d.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true); expect(d.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true) }, { timeout: 5000, interval: 10 })
}
const query = { agentId: 'researcher', scope: 'employee' as const }
async function memories(service: AppService) { return service.handle('getMemory', query) as Promise<MemoryView> }
const body = (context: EngineContext) => context.bootstrap!.instructions + JSON.stringify(context.memory)
test.each([false, true])('UM report actual new input source cleared=%s fences late reports without replaying task effects', async related => {
  const { service, engine, direct, group } = await setup()
  const source = await service.handle('createConversation', { kind: 'direct', title: '写作员原资料C', agentIds: ['writer'] }) as Conversation
  const unrelated = await service.handle('createConversation', { kind: 'group', title: '无关聊天D', agentIds: ['reviewer'] }) as Conversation
  await send(service, direct, '橙色原任务资料 ORIGINAL_REPORT_A。')
  await send(service, source, '蓝鲸新资料 REPORT_SOURCE_C，合计为79。', ['writer'])
  await send(service, unrelated, '无关晚饭 OTHER_REPORT_D。', ['reviewer'])
  let execution: EngineContext | undefined, report: EngineContext | undefined, effects = 0, reports = 0
  let finishExecution!: () => void, finishReport!: () => void
  let enteredExecution!: () => void
  const executionStarted = new Promise<void>(resolve => { enteredExecution = resolve })
  const heldExecution = new Promise<void>(resolve => { finishExecution = resolve })
  const heldReport = new Promise<void>(resolve => { finishReport = resolve })
  cleanup.push(async () => { finishExecution(); finishReport() })
  engine.decide = async context => {
    const current = context.messages.find(message => message.id === context.triggerMessageId)
    const replied = context.messages.some(message => message.turnId === context.turnId && message.senderId === context.agent.id && message.status === 'completed')
    const task = current?.content === '执行橙色任务，并请写作员补充蓝鲸新资料' && context.agent.id === 'researcher'
    const chat = current?.content === '执行橙色任务，并请写作员补充蓝鲸新资料' && context.agent.id === 'writer'
    return { action: !replied && (task || chat) ? 'reply' : 'pass', responseKind: task ? 'task' : 'chat', ...(task ? { work: { key: 'orange-report', scope: '执行橙色任务并按新资料汇报', deliverable: '实际任务汇报' } } : {}), observedThroughSequence: context.participation!.observedThroughSequence }
  }
  engine.handler = async context => {
    if (context.agent.id === 'researcher') {
      execution = context
      expect(body(context)).toContain('ORIGINAL_REPORT_A')
      expect(body(context)).not.toContain('REPORT_SOURCE_C')
      enteredExecution()
      await context.beforeEffect!(); effects++; await context.afterEffect!()
      await context.onDelta('原始任务草稿'); await heldExecution
    } else {
      await executionStarted
      expect(body(context)).toContain('REPORT_SOURCE_C')
      await context.onDelta('写作员蓝鲸补充 REPORT_DERIVED_B，合计79。')
    }
  }
  engine.report = async context => {
    reports++; report = context
    expect(context.messages.some(message => message.content.includes('REPORT_DERIVED_B'))).toBe(true)
    await heldReport
    return { action: 'publish', text: '已按新资料完成 REPORT_LATE_COMPLETE。', outcome: { disposition: 'delivered', summary: '实际执行后更新汇报', evidence: [{ kind: 'answer', reference: 'REPORT_LATE_COMPLETE' }] } }
  }
  await service.handle('sendMessage', { conversationId: group.id, content: '执行橙色任务，并请写作员补充蓝鲸新资料', mentionIds: ['researcher', 'writer'], requestId: 'report-original-a' })
  await vi.waitFor(() => expect(execution).toBeDefined())
  await vi.waitFor(async () => expect((await detail(service, group)).messages.some(message => message.senderId === 'writer' && message.status === 'completed' && message.content.includes('REPORT_DERIVED_B'))).toBe(true))
  const b = (await detail(service, group)).messages.find(message => message.content.includes('REPORT_DERIVED_B'))!
  finishExecution(); await vi.waitFor(() => expect(report).toBeDefined())
  await service.handle('clearConversationHistory', { id: related ? source.id : unrelated.id, hide: false })
  expect(report!.signal.aborted).toBe(related)
  finishReport()
  await vi.waitFor(async () => expect((await detail(service, group)).runs.find(run => run.id === execution!.runId)?.status).toBe(related ? 'cancelled' : 'completed'))
  const result = await detail(service, group)
  expect(result.messages.some(message => message.content.includes('REPORT_LATE_COMPLETE'))).toBe(!related)
  expect(effects).toBe(1); expect(reports).toBe(1)
  expect(engine.contexts.filter(context => context.agent.id === 'researcher')).toHaveLength(2) // A's original chat and this one execution.
  if (!related) {
    const store = (service as unknown as { store: ProductStore }).store
    const snapshot = (await store.load<{ id: string; memoryRecall: MemoryView }>('snapshots')).find(value => value.id === execution!.runId)!
    const observation = (await store.load<import('../packages/shared/src/domain/memory').MemoryObservation>('memoryObservations')).find(value => value.id === execution!.runId)!
    expect(snapshot.memoryRecall.recall?.inputMessageIds).toContain(b.id)
    expect(observation.sourceMessageIds).toContain(b.id)
    // Clearing C later must also invalidate the published re-report, through B's actual run snapshot.
    await service.handle('clearConversationHistory', { id: source.id, hide: false })
    expect((await store.load<{ id: string; invalidated?: boolean }>('snapshots')).find(value => value.id === execution!.runId)?.invalidated).toBe(true)
  }
})
test.each([false, true])('UM report uses original absolute work deadline exceeded=%s rather than a separate thirty-second timeout', async exceeded => {
  const { service, engine, direct } = await setup()
  let finishExecution!: () => void, finishReport!: () => void, execution: EngineContext | undefined, report: EngineContext | undefined
  const heldExecution = new Promise<void>(resolve => { finishExecution = resolve })
  const heldReport = new Promise<void>(resolve => { finishReport = resolve })
  cleanup.push(async () => { finishExecution(); finishReport(); vi.useRealTimers() })
  engine.decide = async context => ({ action: context.messages.find(message => message.id === context.triggerMessageId)?.content === '执行时限任务' ? 'reply' : 'pass', responseKind: 'task', work: { key: 'original-report-deadline', scope: '在原任务期限内完成汇报', deliverable: '真实执行结果' }, observedThroughSequence: context.participation!.observedThroughSequence })
  engine.handler = async context => { execution = context; await context.onDelta('已有实际结果'); await heldExecution }
  engine.report = async context => { report = context; await heldReport; return { action: 'publish', text: '原预算中的完整汇报。', outcome: { disposition: 'delivered', summary: '完整汇报', evidence: [{ kind: 'answer', reference: '原预算中的完整汇报' }] } } }
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  try {
    await service.handle('sendMessage', { conversationId: direct.id, content: '执行时限任务', mentionIds: [], requestId: 'deadline-original' })
    await vi.waitFor(() => expect(execution).toBeDefined())
    await service.handle('sendMessage', { conversationId: direct.id, content: '请更新汇报格式', mentionIds: [], requestId: 'deadline-report-update' })
    finishExecution(); await vi.waitFor(() => expect(report).toBeDefined())
    const before = (await detail(service, direct)).workBudgets![0]
    const remaining = Date.parse(before.deadlineAt) - Date.now()
    expect(remaining).toBeGreaterThan(31_000)
    await vi.advanceTimersByTimeAsync(exceeded ? remaining + 1 : 31_000)
    expect(report!.signal.aborted).toBe(exceeded)
    finishReport()
    await vi.waitFor(async () => expect((await detail(service, direct)).runs.find(run => run.id === execution!.runId)?.status).toBe(exceeded ? 'cancelled' : 'completed'))
    const after = await detail(service, direct)
    expect(after.messages.some(message => message.content === '原预算中的完整汇报。')).toBe(!exceeded)
    expect(after.workBudgets![0]).toMatchObject({ deadlineAt: before.deadlineAt, maxModelCalls: before.maxModelCalls, modelCalls: before.modelCalls })
    expect(engine.contexts).toHaveLength(1)
  } finally { vi.useRealTimers() }
})
test.each([false, true])('clearing a source used by an in-flight reply=%s cancels only the reply that actually used it', async related => {
  const { service, engine, direct, group } = await setup()
  await send(service, direct, '蓝鲸核查资料 UNIQUE_BLUE_SOURCE，合计结果为79。')
  const unrelated = await service.handle('createConversation', { kind: 'group', title: '无关旧讨论', agentIds: ['researcher'] }) as Conversation
  await send(service, unrelated, '红花晚饭 UNIQUE_RED_OTHER，今天看电影。')
  let entered: EngineContext | undefined, release!: () => void
  const held = new Promise<void>(resolve => { release = resolve }); cleanup.push(async () => release())
  engine.handler = async context => { entered = context; await held; await context.onDelta('蓝鲸核查已完成。') }
  await service.handle('sendMessage', { conversationId: group.id, content: '继续蓝鲸核查资料，按资料汇总。', mentionIds: ['researcher'], requestId: 'exact-source-check' })
  await vi.waitFor(() => expect(entered).toBeDefined())
  expect(body(entered!)).toContain('UNIQUE_BLUE_SOURCE')
  expect(entered!.memory?.recall?.inputMessageIds).toContain(entered!.triggerMessageId)
  await service.handle('clearConversationHistory', { id: related ? direct.id : unrelated.id, hide: false })
  expect(entered!.signal.aborted).toBe(related)
  release()
  await vi.waitFor(async () => expect((await detail(service, group)).runs.filter(run => run.phase === 'execution').every(run => ['completed', 'cancelled', 'failed'].includes(run.status))).toBe(true))
  const view = await detail(service, group)
  expect(view.runs.find(run => run.id === entered!.runId)?.status).toBe(related ? 'cancelled' : 'completed')
  expect(view.messages.some(message => message.senderId === 'researcher' && message.content === '蓝鲸核查已完成。')).toBe(!related)
  if (!related) {
    const original = await detail(service, direct)
    expect(original.messages.some(message => message.senderId === 'researcher' && message.status === 'completed')).toBe(true)
    await send(service, direct, '继续蓝鲸核查资料')
    expect(body(engine.contexts.at(-1)!)).toContain('UNIQUE_BLUE_SOURCE')
  }
})
test('UM01/02/05 instant DM→group→DM uses acknowledged evidence without extraction; other employee stays isolated and restart retains it', async () => {
  const { root, service, engine, direct, group } = await setup()
  await send(service, direct, '海报偏好：用简洁中文，暗号 PAPER_CANARY。')
  await send(service, group, '继续按海报偏好写中文', ['researcher', 'writer'])
  const own = engine.contexts.find(c => c.conversation.id === group.id && c.agent.id === 'researcher')!
  const other = engine.contexts.find(c => c.conversation.id === group.id && c.agent.id === 'writer')!
  expect(body(own)).toContain('PAPER_CANARY'); expect(body(other)).not.toContain('PAPER_CANARY')
  await send(service, group, '海报提纲：主题、受众、行动。')
  await send(service, direct, '继续群里的海报提纲')
  expect(body(engine.contexts.at(-1)!)).toContain('主题、受众、行动')
  expect((await detail(service, direct)).workItems).toHaveLength(0)
  await service.close(); const restarted = new Model(), next = await open(root, restarted)
  await send(next, direct, '继续群里海报提纲')
  expect(body(restarted.contexts.at(-1)!)).toContain('主题、受众、行动')
})
test('UM03 same-named groups never infer a temporary context; an explicit authorized link enables only its target', async () => {
  const { service, engine, direct, group } = await setup()
  const other = await service.handle('createConversation', { kind: 'group', title: group.title, agentIds: ['researcher'] }) as Conversation
  const view = await memories(service)
  await service.handle('saveMemory', { ...query, content: '本局角色女巫 CONTEXT_CANARY', kind: 'temporary', useScope: 'context', contextRef: { kind: 'conversation', id: group.id }, expectedEpoch: view.epoch })
  await send(service, other, '这个项目里本局角色是什么？')
  expect(body(engine.contexts.at(-1)!)).not.toContain('CONTEXT_CANARY')
  await send(service, direct, '这个项目里本局角色是什么？')
  expect(body(engine.contexts.at(-1)!)).not.toContain('CONTEXT_CANARY')
  await service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryContextRef: { kind: 'conversation', id: group.id } })
  await send(service, direct, '这个项目里本局角色是什么？')
  expect(body(engine.contexts.at(-1)!)).toContain('CONTEXT_CANARY')
  expect((await detail(service, direct)).workItems).toHaveLength(0)
  await expect(service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryContextRef: { kind: 'conversation', id: 'unknown' } })).rejects.toThrow()
})
test('UM04/18 source tightening blocks assembled late replies and raw fallback; loosening never promotes old observations', async () => {
  const { service, engine, direct, group } = await setup()
  await send(service, direct, '海报机密 STRICT_CANARY')
  let entered = false, release!: () => void; const held = new Promise<void>(resolve => { release = resolve })
  engine.handler = async context => { entered = true; await held; await context.onDelta('迟到 STRICT_CANARY') }
  await service.handle('sendMessage', { conversationId: group.id, content: '继续海报机密', mentionIds: ['researcher'], requestId: 'held' })
  await vi.waitFor(() => expect(entered).toBe(true))
  await service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryScope: 'conversation' })
  release(); engine.handler = async context => { await context.onDelta('安全答复') }
  await vi.waitFor(async () => expect((await detail(service, group)).runs.filter(run => run.phase === 'execution').every(run => run.status === 'cancelled')).toBe(true))
  await send(service, group, '继续海报机密')
  expect(body(engine.contexts.at(-1)!)).not.toContain('STRICT_CANARY')
  await service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryScope: 'employee' })
  await send(service, group, '继续海报机密')
  expect(body(engine.contexts.at(-1)!)).not.toContain('STRICT_CANARY')
})
test('UM07/20 candidate metadata and explicit correction persist; temporary identity expires without touching personality', async () => {
  const { service, engine, direct, group } = await setup()
  engine.extractMemory = async context => {
    expect(context.memory!.entries.some(entry => entry.id.startsWith('observation:'))).toBe(false)
    expect(context.bootstrap!.instructions).not.toContain('请记住临时角色陈述')
    const user = context.messages.find(message => message.id === context.triggerMessageId)!
    const previous = context.memory!.entries.find(entry => entry.content === '海报使用简洁中文')
    const candidate: MemoryCandidate = user.content.includes('纠正') ? { content: '海报使用详细中文', kind: 'long_term', evidence: 'preference', sourceMessageIds: [user.id], supersedes: previous ? [{ id: previous.id, version: previous.version }] : [] }
      : user.content.includes('女巫') ? { content: '本局角色女巫', kind: 'temporary', evidence: 'claim', expiresAt: new Date(Date.now() + 100).toISOString(), sourceMessageIds: [user.id] }
      : { content: '海报使用简洁中文', kind: 'long_term', evidence: 'preference', sourceMessageIds: [user.id] }
    return [candidate]
  }
  await send(service, direct, '海报使用简洁中文')
  await send(service, direct, '纠正：海报使用详细中文')
  expect((await detail(service, direct)).runs.filter(run => run.phase === 'memory').every(run => run.status === 'completed')).toBe(true)
  expect((await memories(service)).entries.map(entry => [entry.content, entry.status])).toEqual(expect.arrayContaining([['海报使用简洁中文', 'superseded'], ['海报使用详细中文', 'active']]))
  engine.extractMemory = async context => context.messages.some(message => message.id === context.triggerMessageId && message.content.includes('女巫')) ? [{ content: '本局角色女巫', kind: 'temporary', evidence: 'claim', expiresAt: new Date(Date.now() + 100).toISOString(), sourceMessageIds: [context.triggerMessageId!] }] : []
  const before = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!.instructions
  await send(service, direct, '这一局角色是女巫')
  await new Promise(resolve => setTimeout(resolve, 130))
  await send(service, group, '现在是什么角色，女巫吗')
  expect(body(engine.contexts.at(-1)!)).not.toContain('本局角色女巫')
  expect((await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!.instructions).toBe(before)
})
test('UM09/10 forget blocks late maintenance and old raw evidence; source clear removes all cross-chat derived records and projections', async () => {
  const { root, service, engine, direct, group } = await setup()
  engine.extractMemory = async context => [{ content: '海报主题 CLEAR_CANARY', sourceMessageIds: [context.triggerMessageId!], kind: 'experience', evidence: 'claim' }]
  await send(service, direct, '海报主题 CLEAR_CANARY')
  const view = await memories(service), source = view.entries[0]
  await send(service, group, '继续海报主题')
  const projection = join(root, 'agents/researcher/workspace/sessions', group.id, 'MEMORY.md')
  expect(await readFile(projection, 'utf8')).toContain('CLEAR_CANARY')
  await writeFile(projection, '外部修改 CLEAR_CANARY')
  await service.handle('deleteMemory', { ...query, id: source.id, expectedEpoch: (await memories(service)).epoch, requestId: 'forget' })
  expect(await readFile(projection, 'utf8')).toBe('外部修改 CLEAR_CANARY')
  engine.extractMemory = undefined
  await send(service, group, '继续海报主题')
  expect(body(engine.contexts.at(-1)!)).not.toContain('CLEAR_CANARY')
  await service.handle('clearConversationHistory', { id: direct.id, hide: false })
  expect((await memories(service)).entries.filter(entry => entry.sourceConversationIds?.includes(direct.id))).toHaveLength(0)
})
test('UM06 leaving a source chat invalidates learned evidence and all dependent memory', async () => {
  const { service, engine, direct, group } = await setup()
  engine.extractMemory = async context => context.conversation.id === group.id ? [{ content: '群海报提纲 LEFT_CANARY', sourceMessageIds: [context.triggerMessageId!] }] : []
  await send(service, group, '群海报提纲 LEFT_CANARY')
  await service.handle('createConversation', { id: group.id, kind: 'group', title: group.title, agentIds: ['writer'] })
  await send(service, direct, '继续群海报提纲')
  expect(body(engine.contexts.at(-1)!)).not.toContain('LEFT_CANARY')
})
test('UM15 management receipt survives restart and backup restores its historical deletion state without replay', async () => {
  const { root, service } = await setup()
  const input = { ...query, content: '备份时的用户偏好', kind: 'long_term' as const, expectedEpoch: 0, requestId: 'persistent' }
  await service.handle('saveMemory', input)
  const backup = root + '-backup'; cleanup.push(() => rm(backup, { recursive: true, force: true })); await service.backup(backup)
  const view = await memories(service); await service.handle('deleteMemory', { ...query, id: view.entries[0].id, expectedEpoch: view.epoch })
  await service.close(); const next = await open(root, new Model()); expect((await memories(next)).entries).toHaveLength(0)
  const restore = root + '-restore'; cleanup.push(() => rm(restore, { recursive: true, force: true })); await cp(backup, restore, { recursive: true })
  const restoredEngine = new Model(), restored = await open(restore, restoredEngine)
  expect((await memories(restored)).entries[0].content).toBe('备份时的用户偏好')
  expect(restoredEngine.contexts).toHaveLength(0)
  await restored.handle('saveMemory', input); expect((await memories(restored)).entries).toHaveLength(1)
})

test('stored user notes reach the actual employee context as source text, not new autobiography or event time', async () => {
  const { service, engine, direct } = await setup()
  const content = '去年我报名了陶艺课，但没有去上；下个月可能重新报名，目前还没决定。'
  const before = await memories(service)
  await service.handle('saveMemory', { ...query, expectedEpoch: before.epoch, content, kind: 'experience', evidence: 'claim', useScope: 'employee', requestId: 'source-time-note' })
  const saved = (await memories(service)).entries.find(entry => entry.content === content)!
  await send(service, direct, '陶艺课那条笔记到底说了什么？请区分报名、上课和计划。')
  const context = engine.contexts.at(-1)!, rendered = context.bootstrap!.instructions
  expect(rendered).toContain(content); expect(rendered).toContain(`保存于 ${saved.createdAt}`)
  expect(rendered).toContain('用户提供'); expect(rendered).toContain('存入你的记忆不代表内容是你的经历')
  expect(rendered).not.toContain(`发生于 ${saved.createdAt}`)
  expect(context.memory!.entries.find(entry => entry.id === saved.id)).toEqual(saved)
})
