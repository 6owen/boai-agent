/*
 * [INPUT]: 真实 AppService/SQLite/工作区和无工具可控模型，独立持久目录。
 * [OUTPUT]: 双向即时接续、员工隔离/范围收紧、忘记发布门禁/清理冲突、纠正/临时失效与重启/备份回归。
 * [POS]: T2 宿主验收，读取实际 EngineContext 和文件，普通聊天不产生 Work。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../src/runtime/service'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, MemoryCandidate, MemoryView, Snapshot } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
class Model implements AgentEngine {
  contexts: EngineContext[] = []
  extractMemory?: AgentEngine['extractMemory']
  handler = async (context: EngineContext) => { await context.onDelta('已收到当前消息。') }
  async decide(context: EngineContext) { return { action: context.messages.some(message => message.turnId === context.turnId && message.senderId === context.agent.id && message.status === 'completed') ? 'pass' as const : 'reply' as const, responseKind: 'chat' as const, observedThroughSequence: context.participation!.observedThroughSequence } }
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
