/*
 * [OUTPUT]: 旧库夹具移除新版初始化标记，核对技能绑定及配置版本保持；普通核心首发装配所选管理文档，版本伪造/普通员工拒绝，下一轮无标签不继承。
 * [OUTPUT]: 核心首发技能引用必须已绑定，拒绝时不创建会话或请求回执。
 * [INPUT]: 真实 AppService、SQLite、工作区与可控核心助手执行。
 * [OUTPUT]: 非空首发/具名团队请求同事务与空输入零对象、权威回执只读核对、可靠回滚空目录清理/未知提交保留、清空/删除最小回执不重放；并发/重启幂等和用户名称不可被模型覆盖；文件准备阻塞时停止及时持久受理、实际退出前容量不释放且不发布；原子团队发布与跨会话分层记忆的业务不变量。
 * [POS]: bobo 宿主集成验收，不替代 Mastra 协议和 Electron BDD。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ConversationHistory } from '../src/runtime/modules/conversations/history'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Conversation, ConversationDetail, MemoryView, Snapshot } from '../src/shared/domain'
import { writingPlan } from './fixtures/team-planner'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
class CoreModel implements AgentEngine {
  contexts: EngineContext[] = []
  creations = 0
  task = false
  async decide(context: EngineContext) {
    return { action: context.participation?.hasRespondedInTurn ? 'pass' as const : 'reply' as const, responseKind: this.task ? 'task' as const : 'chat' as const, observedThroughSequence: context.participation!.observedThroughSequence }
  }
  async run(context: EngineContext) {
    this.contexts.push(context)
    if (!this.task) { await context.onDelta('记下了当前偏好。'); return }
    expect(context.createTeam).toBeTypeOf('function')
    await context.beforeEffect!()
    const receipt = await context.createTeam!(writingPlan as Parameters<NonNullable<EngineContext['createTeam']>>[0], 'team-call')
    this.creations++
    await context.afterEffect!()
    await context.onDelta(`已创建 ${receipt.title}，包括 ${receipt.members.length} 位成员。`)
    await context.onWorkOutcome!({ disposition: 'delivered', summary: receipt.title, evidence: [{ kind: 'answer', reference: receipt.title }] })
  }
  async test() { return 'ok' }
}
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
async function open(root: string, engine = new CoreModel(), bundledRoot?: string) {
  const service = new AppService({ dataPath: root, engine, secrets, emit: () => {}, skillDiscovery: { homeDir: root, bundledRoot } })
  await service.init(); cleanups.push(() => service.close())
  return { service, engine }
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-core-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const current = await open(root)
  await current.service.handle('saveConnection', { name: '默认连接', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'fixture' })
  return { root, ...current }
}
const snapshot = (service: AppService) => service.handle('snapshot', undefined) as Promise<Snapshot>
const detail = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
async function settled(service: AppService, conversation: Conversation) {
  await vi.waitFor(async () => {
    const view = await detail(service, conversation)
    expect(view.runs.length).toBeGreaterThan(0)
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  }, { timeout: 5000, interval: 10 })
}

test('生成受理一次创建新核心会话和原始需求；重入与重启均不重发模型', async () => {
  const { service, engine, root } = await setup()
  const request = { requestId: 'team-start', team: { name: '用户写作团队', requirements: '创建四人写作团队' } }
  const conversation = await service.handle('startCoreConversation', request) as Conversation
  await settled(service, conversation)
  expect(await service.handle('getCoreConversationStart', { requestId: request.requestId })).toMatchObject({ id: conversation.id })
  expect(conversation).toMatchObject({ purpose: 'core', kind: 'direct', agentIds: ['bobo'] })
  expect((await detail(service, conversation)).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect((await detail(service, conversation)).messages[0].content).toContain(request.team.requirements)
  expect(await service.handle('startCoreConversation', request)).toMatchObject({ id: conversation.id })
  await expect(service.handle('startCoreConversation', { ...request, team: { ...request.team, requirements: '另一个需求' } })).rejects.toThrow('requestId')
  expect(engine.contexts).toHaveLength(1)
  await service.close()
  const restarted = await open(root)
  expect(await restarted.service.handle('startCoreConversation', request)).toMatchObject({ id: conversation.id })
  expect(await restarted.service.handle('getCoreConversationStart', { requestId: request.requestId })).toMatchObject({ id: conversation.id })
  expect(restarted.engine.contexts).toHaveLength(0)
  expect((await snapshot(restarted.service)).agents.filter(agent => agent.systemRole === 'core')).toHaveLength(1)
})

test('核心工具创建所有成员并强制使用用户团队名，模型不能覆盖；生成不产生第二次 planner 调用', async () => {
  const { service, engine } = await setup(); engine.task = true
  const before = await snapshot(service)
  const conversation = await service.handle('startCoreConversation', { requestId: 'create', team: { name: '用户指定的写作组', requirements: '四人写作团队' } }) as Conversation
  await settled(service, conversation)
  const after = await snapshot(service), group = after.conversations.find(value => value.kind === 'group')!
  expect(after.agents).toHaveLength(before.agents.length + 4)
  expect(group.title).toBe('用户指定的写作组'); expect(group.title).not.toBe(writingPlan.name); expect(group.agentIds).toHaveLength(4)
  expect((await detail(service, group)).messages).toEqual([])
  expect((await detail(service, conversation)).workItems?.[0]).toMatchObject({ status: 'delivered' })
  expect(engine.creations).toBe(1)
  expect(await service.handle('startCoreConversation', { requestId: 'create', team: { name: '用户指定的写作组', requirements: '四人写作团队' } })).toMatchObject({ id: conversation.id })
  expect((await snapshot(service)).agents).toHaveLength(after.agents.length)
})

test('核心新会话不会复用普通单聊；改名保持身份和三层记忆，来源限制继续生效', async () => {
  const { service, engine, root } = await setup()
  const first = await service.handle('startCoreConversation', { requestId: 'first', content: '项目偏好：简洁中文 CORE_CANARY' }) as Conversation
  await settled(service, first)
  const core = (await snapshot(service)).agents.find(agent => agent.id === 'bobo')!
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = core
  await service.handle('saveAgent', { ...definition, name: '波波', expectedConfigVersion: configVersion })
  const query = { agentId: 'bobo', scope: 'employee' as const }
  for (const kind of ['long_term', 'experience', 'temporary'] as const) {
    const memory = await service.handle('getMemory', query) as MemoryView
    await service.handle('saveMemory', { ...query, kind, ...(kind === 'temporary' ? { expiresAt: new Date(Date.now() + 60_000).toISOString() } : {}), content: `${kind} 项目偏好 CORE_CANARY`, expectedEpoch: memory.epoch })
  }
  const second = await service.handle('startCoreConversation', { requestId: 'second', content: '继续项目偏好 CORE_CANARY' }) as Conversation
  expect(second.id).not.toBe(first.id); expect(second.title).toContain('继续项目偏好')
  await settled(service, second)
  expect(JSON.stringify(engine.contexts.at(-1)!.memory)).toContain('CORE_CANARY')
  expect((await detail(service, first)).workItems).toEqual([])
  expect((await detail(service, second)).workItems).toEqual([])
  await expect(service.handle('createConversation', { kind: 'group', title: '不合法群', agentIds: ['bobo', 'writer'] })).rejects.toThrow('核心')
  await service.close()
  const restarted = await open(root)
  expect((await snapshot(restarted.service)).agents.find(agent => agent.id === 'bobo')!.name).toBe('波波')
  const memory = await restarted.service.handle('getMemory', query) as MemoryView
  expect(new Set(memory.entries.map(entry => entry.kind))).toEqual(new Set(['long_term', 'experience', 'temporary']))
})

test('没有可用默认模型时不留空团队会话或调用模型', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-core-empty-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { service, engine } = await open(root)
  await expect(service.handle('startCoreConversation', { requestId: 'no-model', team: { name: '新团队', requirements: '创建团队' } })).rejects.toThrow('模型连接')
  expect((await snapshot(service)).conversations).toEqual([]); expect(engine.contexts).toEqual([])
  expect(await service.handle('getCoreConversationStart', { requestId: 'unsubmitted' })).toBeNull()
  expect((await snapshot(service)).conversations).toEqual([]); expect(engine.contexts).toEqual([])
})

test('空首发和缺少团队字段均不能持久化空会话，普通单聊接口也不能绕过', async () => {
  const { service, engine } = await setup()
  for (const input of [
    { requestId: 'empty' }, { requestId: 'empty', content: ' \n ' },
    { requestId: 'empty', team: { name: '', requirements: '明确需求' } },
    { requestId: 'empty', team: { name: '明确名称', requirements: ' ' } },
    { requestId: 'empty', team: { requirements: '明确需求' } },
    { requestId: 'empty', team: { name: '明确名称' } },
    { requestId: 'empty', content: '普通消息', team: { name: '明确名称', requirements: '明确需求' } },
  ]) await expect(service.handle('startCoreConversation', input)).rejects.toThrow()
  await expect(service.handle('createConversation', { kind: 'direct', title: '空核心会话', agentIds: ['bobo'] })).rejects.toThrow('首条消息')
  expect((await snapshot(service)).conversations).toEqual([]); expect(engine.contexts).toEqual([])
})

test('普通非空首发按用户正文创建会话；并发/重启同请求只保存一次首条消息且不制造团队工作', async () => {
  const { service, engine, root } = await setup()
  const input = { requestId: 'ordinary-first', content: '普通问候，不是团队请求。' }
  const results = await Promise.all(Array.from({ length: 4 }, () => service.handle('startCoreConversation', input) as Promise<Conversation>))
  expect(new Set(results.map(value => value.id)).size).toBe(1)
  const conversation = results[0]; await settled(service, conversation)
  const view = await detail(service, conversation)
  expect(view.messages.filter(message => message.senderType === 'user').map(message => message.content)).toEqual([input.content])
  expect(view.workItems).toEqual([]); expect((await snapshot(service)).conversations.filter(value => value.kind === 'group')).toEqual([])
  expect(engine.contexts).toHaveLength(1)
  await service.close()
  const restarted = await open(root)
  expect(await restarted.service.handle('startCoreConversation', input)).toMatchObject({ id: conversation.id })
  expect(restarted.engine.contexts).toEqual([])
  await expect(restarted.service.handle('startCoreConversation', { ...input, content: '不同内容' })).rejects.toThrow('requestId')
})

test('首发事务写入失败同时回滚会话、消息与受理回执；同请求可明确重试且名称留在权威回执', async () => {
  const { service, engine, root } = await setup()
  const original = ProductStore.prototype.transaction
  let inject = true
  const interception = vi.spyOn(ProductStore.prototype, 'transaction').mockImplementation(function (this: ProductStore, action) {
    return original.call(this, tx => action({ ...tx, put: async record => {
      if (inject && record.collection === 'messages') { inject = false; throw new Error('first message transaction fault') }
      await tx.put(record)
    } }))
  })
  const request = { requestId: 'atomic-first', team: { name: '用户最终名称', requirements: '四人写作团队' } }
  await expect(service.handle('startCoreConversation', request)).rejects.toThrow('first message transaction fault')
  interception.mockRestore()
  const inspection = new ProductStore(join(root, 'boai.sqlite')); await inspection.init(); cleanups.push(() => inspection.close())
  for (const collection of ['conversations', 'messages', 'coreConversationStarts', 'turns']) expect(await inspection.load(collection)).toEqual([])
  expect(await readdir(join(root, 'workspaces'))).toEqual([])
  expect(engine.contexts).toEqual([])
  const conversation = await service.handle('startCoreConversation', request) as Conversation; await settled(service, conversation)
  const message = (await detail(service, conversation)).messages.find(value => value.senderType === 'user')!
  expect(message.content).toContain(request.team.name); expect(message.content).toContain(request.team.requirements)
  expect(await inspection.load('coreConversationStarts')).toEqual([expect.objectContaining({ id: request.requestId, conversationId: conversation.id, messageId: message.id, teamName: request.team.name, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })])
})

test('首发提交回执失联时保留已提交会话的目录；重启只返回权威回执而不重放模型', async () => {
  const { service, engine, root } = await setup()
  const original = ProductStore.prototype.transaction
  let armed = true
  const interception = vi.spyOn(ProductStore.prototype, 'transaction').mockImplementation(async function (this: ProductStore, action) {
    let accepted = false
    const result = await original.call(this, tx => action({ ...tx, put: async record => {
      await tx.put(record)
      if (armed && record.collection === 'coreConversationStarts') accepted = true
    } }))
    if (accepted) { armed = false; throw new Error('first receipt lost after commit') }
    return result
  })
  const request = { requestId: 'unknown-commit', content: '首次提交的普通正文' }
  await expect(service.handle('startCoreConversation', request)).rejects.toThrow('first receipt lost after commit')
  interception.mockRestore()
  const inspection = new ProductStore(join(root, 'boai.sqlite')); await inspection.init(); cleanups.push(() => inspection.close())
  const committed = (await inspection.load<Conversation>('conversations'))[0]
  expect(await readdir(join(root, 'workspaces'))).toEqual([committed.id])
  expect((await inspection.load('messages'))).toHaveLength(1); expect(engine.contexts).toEqual([])
  await expect(service.handle('getCoreConversationStart', { requestId: request.requestId })).rejects.toThrow('已受理，需要重启')
  await expect(service.handle('startCoreConversation', request)).rejects.toThrow('已受理，需要重启')
  expect((await snapshot(service)).conversations).toEqual([])
  await service.close()
  const restarted = await open(root)
  expect(await restarted.service.handle('startCoreConversation', request)).toMatchObject({ id: committed.id })
  expect(await restarted.service.handle('getCoreConversationStart', { requestId: request.requestId })).toMatchObject({ id: committed.id })
  expect((await snapshot(restarted.service)).conversations).toContainEqual(expect.objectContaining({ id: committed.id }))
  expect((await detail(restarted.service, committed)).messages.filter(message => message.senderType === 'user')).toEqual([expect.objectContaining({ content: request.content })])
  expect(restarted.engine.contexts).toEqual([])
})

test.each([false, true])('清空或删除核心历史保留最小停止重放回执，旧格式正文也不能残留；remove=%s', async remove => {
  const { service, engine, root } = await setup()
  const request = { requestId: 'clear-first', team: { name: '须清除的私有名称', requirements: '须清除的私有团队需求' } }
  const conversation = await service.handle('startCoreConversation', request) as Conversation; await settled(service, conversation)
  const inspection = new ProductStore(join(root, 'boai.sqlite')); await inspection.init(); cleanups.push(() => inspection.close())
  await inspection.write([{ collection: 'coreConversationStarts', id: 'legacy-request', value: { id: 'legacy-request', conversationId: conversation.id, fingerprint: JSON.stringify({ prompt: request.team.requirements }), messageId: 'legacy-message', teamName: request.team.name } }])
  if (remove) await new ConversationHistory(inspection, root).remove(conversation)
  else await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
  const receipts = await inspection.load('coreConversationStarts')
  expect(receipts).toEqual([
    { id: request.requestId, conversationId: conversation.id, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), cleared: true },
    { id: 'legacy-request', conversationId: conversation.id, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), cleared: true },
  ])
  expect(await inspection.load('messages')).toEqual([])
  const calls = engine.contexts.length
  await expect(service.handle('startCoreConversation', request)).rejects.toThrow('首条消息已清理')
  await expect(service.handle('getCoreConversationStart', { requestId: request.requestId })).rejects.toThrow('首条消息已清理')
  await expect(service.handle('startCoreConversation', { requestId: 'legacy-request', content: '旧 key 也不能重放' })).rejects.toThrow('首条消息已清理')
  expect(engine.contexts).toHaveLength(calls)
  await service.close()
  const restarted = await open(root)
  await expect(restarted.service.handle('startCoreConversation', request)).rejects.toThrow('首条消息已清理')
  await expect(restarted.service.handle('getCoreConversationStart', { requestId: request.requestId })).rejects.toThrow('首条消息已清理')
  expect(restarted.engine.contexts).toEqual([])
})

test('文件准备暂停时仍及时受理用户停止；实际退出前不释放执行占用，退出后不发布团队', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-core-cancel-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  let entered!: () => void, release!: () => void, operationId = '', held = false
  const reached = new Promise<void>(resolve => { entered = resolve }), exit = new Promise<void>(resolve => { release = resolve })
  const engine = new CoreModel(); engine.task = true
  const service = new AppService({ dataPath: root, engine, secrets, emit: () => {}, teamFileCheckpoint: async (phase, operation) => {
    if (phase !== 'after-move' || held) return
    held = true; operationId = operation.id; entered(); await exit
  } })
  await service.init(); cleanups.push(async () => { release(); await service.close() })
  await service.handle('saveConnection', { name: '取消验收模型', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'fixture' })
  const originalIds = (await snapshot(service)).agents.map(agent => agent.id)
  const conversation = await service.handle('startCoreConversation', { requestId: 'held-creation', team: { name: '取消中的写作组', requirements: '四人写作团队' } }) as Conversation
  try {
    await reached
    let stopped = false
    const stop = service.handle('cancelRun', { conversationId: conversation.id }).then(() => { stopped = true })
    await vi.waitFor(() => expect(stopped).toBe(true), { timeout: 1500, interval: 10 })
    await stop
    await vi.waitFor(async () => expect(await service.handle('getTeamCreation', { operationId })).toMatchObject({ cancelRequested: true }), { timeout: 1500, interval: 10 })
    expect((await snapshot(service)).agents.map(agent => agent.id)).toEqual(originalIds)
    expect((await snapshot(service)).conversations.filter(value => value.kind === 'group')).toEqual([])
    expect((await detail(service, conversation)).workItems?.[0]).toMatchObject({ status: 'cancelled', requiresReview: true })
    await expect(service.handle('clearConversationHistory', { id: conversation.id, hide: false })).rejects.toThrow('执行')
    release()
    await vi.waitFor(async () => expect(await service.handle('getTeamCreation', { operationId })).toMatchObject({ status: 'cancelled' }), { timeout: 5000, interval: 10 })
    await vi.waitFor(async () => { await service.handle('clearConversationHistory', { id: conversation.id, hide: false }) }, { timeout: 5000, interval: 10 })
    expect((await snapshot(service)).agents.map(agent => agent.id)).toEqual(originalIds)
    expect((await snapshot(service)).conversations.filter(value => value.kind === 'group')).toEqual([])
    expect(engine.creations).toBe(0)
  } finally { release() }
})


test('核心首发拒绝未绑定技能且不创建会话或回执', async () => {
  const { service, engine } = await setup()
  const before = await snapshot(service), core = before.agents.find(agent => agent.id === 'bobo')!
  await expect(service.handle('startCoreConversation', { requestId: 'invalid-skill', content: '@不存在', composerReferences: [{ kind: 'skill', id: 'missing', agentId: core.id, name: '不存在', configVersion: core.configVersion }] })).rejects.toThrow('技能绑定已变化')
  expect((await snapshot(service)).conversations).toEqual(before.conversations)
  expect(await service.handle('getCoreConversationStart', { requestId: 'invalid-skill' })).toBeNull()
  expect(engine.contexts).toEqual([])
})

test('旧库普通 bobo 会话按本轮管理标签加载随包文档，下一轮不自动继承，伪造版本拒绝且不留空会话', async () => {
  const old = await setup()
  // Profiles predating bundled default skills have no initialization marker.
  const oldStore = (old.service as unknown as { store: ProductStore }).store
  await oldStore.transaction(tx => tx.remove('defaultSkillSeeds', 'bobo'))
  const oldCore = (await snapshot(old.service)).agents.find(agent => agent.id === 'bobo')!
  await old.service.close()
  const { service, engine } = await open(old.root, new CoreModel(), resolve('resources/agent-skills'))
  expect((await snapshot(service)).agents.find(agent => agent.id === 'bobo')!.skillIds).toEqual(oldCore.skillIds)
  expect((await snapshot(service)).agents.find(agent => agent.id === 'bobo')!.configVersion).toBe(oldCore.configVersion)
  const reference = { kind: 'builtin-skill' as const, id: 'automations' as const, name: '管理定时任务', agentId: 'bobo', version: 1 }
  await expect(service.handle('startCoreConversation', { requestId: 'bad-management', content: '查看计划', composerReferences: [{ ...reference, version: 999 }] })).rejects.toThrow('管理技能已变化')
  expect(await service.handle('getCoreConversationStart', { requestId: 'bad-management' })).toBeNull()
  expect((await snapshot(service)).conversations).toHaveLength(0)
  const conversation = await service.handle('startCoreConversation', { requestId: 'management', content: '$管理定时任务 查看现有计划', composerReferences: [reference] }) as Conversation
  expect(conversation.automationCreation).toBeUndefined()
  await settled(service, conversation)
  expect(engine.contexts[0].bootstrap?.dynamicInstructions).toContain('[Selected BOAI management skills]')
  expect(engine.contexts[0].bootstrap?.dynamicInstructions).toContain('automations.preview')
  expect(engine.contexts[0].application).toBeDefined()
  expect((await detail(service, conversation)).messages.find(message => message.senderType === 'user')?.composerReferences).toEqual([reference])
  await service.handle('sendMessage', { conversationId: conversation.id, content: '下一轮普通交流', requestId: 'management-next' })
  await settled(service, conversation)
  expect(engine.contexts).toHaveLength(2)
  expect(engine.contexts[1].bootstrap?.dynamicInstructions).not.toContain('[Selected BOAI management skills]')
  expect((await snapshot(service)).agents.find(agent => agent.id === 'bobo')).toMatchObject({ skillIds: oldCore.skillIds, configVersion: oldCore.configVersion })
  const ordinary = (await snapshot(service)).agents.find(agent => agent.id !== 'bobo')!
  const room = await service.handle('createConversation', { kind: 'direct', title: ordinary.name, agentIds: [ordinary.id] }) as Conversation
  await expect(service.handle('sendMessage', { conversationId: room.id, content: '查看计划', requestId: 'ordinary-management', composerReferences: [{ ...reference, agentId: ordinary.id }] })).rejects.toThrow('管理技能仅用于')
})
