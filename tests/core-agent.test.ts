/*
 * [OUTPUT]: API专用夹具保留明确connection前提，兼容运行时上下文的可选API连接。
 * [INPUT]: 核心员工身份、真实 SQLite/工作区与已安装 Mastra 工具和阶段工厂。
 * [OUTPUT]: 新旧库唯一核心身份、改名/省略标识重启保留、权限伪造拒绝及核心工具的调用身份/副作用门禁与真实 Mastra SDK 任务/普通阶段工具隔离回归。
 * [POS]: 预置核心 Agent 的模块测试；端到端团队会话/交付由宿主测试验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { noopObserve, type ToolExecutionContext } from '@mastra/core/tools'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { EmployeeService, agentSchema } from '../src/runtime/modules/employees/employee-service'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { createStageAgent } from '../src/runtime/adapters/mastra/agent-factory'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { coreEndpoint } from './fixtures/core-model'
import { writingPlan } from './fixtures/team-planner'
import { CORE_AGENT_ID, isCoreAgent } from '../src/shared/domain/core-agent'
import type { AgentInput, DigitalAgent } from '../src/shared/domain'
import type { EngineContext } from '../src/runtime/contracts'
import type { TeamPlannerOutput } from '../src/shared/domain/team-creation'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function root() { const directory = await mkdtemp(join(tmpdir(), 'boai-core-')); cleanup.push(() => rm(directory, { recursive: true, force: true })); return directory }
async function registry(initial: DigitalAgent[] = []) {
  const directory = await root(), store = new ProductStore(join(directory, 'product.sqlite'))
  await store.init(); cleanup.push(() => store.close())
  if (initial.length) await store.write(initial.map(agent => ({ collection: 'agents', id: agent.id, value: agent })))
  const reopen = async () => {
    const employees = new EmployeeService(store, new WorkspaceService(directory), {
      connection: id => ({ id, name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test', hasApiKey: false }),
      resource: () => undefined, cancel: async () => {}, invalidateMemory: async () => {}, changed() {},
    })
    await store.write(await employees.initialize()); return employees
  }
  return { store, reopen, employees: await reopen() }
}
function editable(agent: DigitalAgent): AgentInput {
  const { configVersion: _version, workspaceRef: _workspace, memoryNamespace: _namespace, policyVersion: _policy, creationSource: _source, systemRole: _role, ...input } = agent
  return input
}
test('new and existing databases have one stable core; renaming and an older client keep identity, model and memory on restart', async () => {
  const { employees, reopen } = await registry()
  const core = employees.get(CORE_AGENT_ID)
  expect(employees.values().filter(isCoreAgent)).toHaveLength(1)
  expect(core).toMatchObject({ name: 'bobo', systemRole: 'core', connectionId: '', active: true, allowCommands: false, memoryNamespace: 'employee:bobo', executionBackend: { kind: 'mastra-model' } })
  expect(employees.values().filter(agent => !isCoreAgent(agent)).map(agent => agent.id)).toEqual(['researcher', 'writer', 'reviewer'])
  await employees.save({ ...editable(core), name: '波波', connectionId: 'chosen', modelId: 'chosen-model' })
  let reopened = await reopen()
  expect(reopened.get(CORE_AGENT_ID)).toMatchObject({ name: '波波', systemRole: 'core', connectionId: 'chosen', modelId: 'chosen-model', memoryNamespace: core.memoryNamespace })
  const snapshot = reopened.get(CORE_AGENT_ID)
  await reopened.save(agentSchema.parse({ ...editable(snapshot), systemRole: snapshot.systemRole, role: '我的系统助手' }))
  reopened = await reopen()
  expect(reopened.values().filter(isCoreAgent)).toHaveLength(1)
  expect(reopened.get(CORE_AGENT_ID)).toMatchObject({ name: '波波', role: '我的系统助手', systemRole: 'core', connectionId: 'chosen' })
})
test('a legacy database retains its employees while core authority cannot be supplied by a normal employee or changed to external execution', async () => {
  const legacy: DigitalAgent = { id: 'legacy', name: '原员工', role: '', instructions: '保留工作规则', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
  const { employees, store } = await registry([legacy]), core = employees.get(CORE_AGENT_ID)
  expect(employees.get('legacy')).toMatchObject({ ...legacy, executionBackend: { kind: 'mastra-model' }, configVersion: 2 })
  expect(employees.values()).toHaveLength(2)
  await expect(employees.save({ ...editable(legacy), systemRole: 'core' })).rejects.toThrow('只能由应用预置')
  for (const patch of [{ active: false }, { allowCommands: true }, { executionBackend: { kind: 'acp-local' as const, profileId: 'external' } }]) {
    await expect(employees.save({ ...editable(core), ...patch })).rejects.toThrow('系统核心 Agent')
  }
  expect(employees.get(CORE_AGENT_ID)).toEqual(core)
  expect((await store.load<DigitalAgent>('agents')).find(agent => agent.id === CORE_AGENT_ID)).toEqual(core)
})

async function context(): Promise<EngineContext> {
  const directory = await root(), session = join(directory, 'bobo/sessions/core-chat')
  return {
    agent: { id: CORE_AGENT_ID, systemRole: 'core', name: '波波', role: '系统核心', instructions: '协助用户创建团队。', color: '#638ac5', connectionId: 'c', modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1, policyVersion: 2 },
    conversation: { id: 'core-chat', kind: 'direct', purpose: 'core', title: '团队创建', agentIds: [CORE_AGENT_ID], mode: 'natural', workspacePath: join(directory, 'shared'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    connection: { id: 'c', name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test', hasApiKey: false },
    apiKey: '', messages: [], resources: [], runId: 'run-a', signal: new AbortController().signal,
    workspace: { root: session, workPath: join(session, 'work'), runPath: join(session, 'runs/run-a'), sharedPath: join(directory, 'shared') },
    onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
  }
}
const plan: Extract<TeamPlannerOutput, { kind: 'plan' }> = { kind: 'plan', schemaVersion: 1, name: '编辑团队', purpose: '撰写和审核文章', scenarioKind: 'work', assumptions: [], collaborationGuide: '先写作，再审核。', capabilityNotes: [], members: [{ name: '编辑', role: '撰写文章', instructions: '根据用户需求完成文章。' }] }
const invocation: ToolExecutionContext = { observe: noopObserve, agent: { agentId: CORE_AGENT_ID, toolCallId: 'call-a', messages: [], suspend: async () => {} } }

test('only a host-authorized core task has create_team; private and ordinary chat stages never receive it', async () => {
  const ctx = await context()
  ctx.createTeam = vi.fn(async () => ({ operationId: 'op-a', conversationId: 'group-a', title: plan.name, members: [{ id: 'editor', name: '编辑', role: '撰写文章' }] }))
  const runtime = await createTaskRuntime(ctx); cleanup.push(() => runtime.workspace.destroy())
  expect(runtime.tools.create_team).toBeDefined()
  const withoutGrant = await createTaskRuntime({ ...ctx, createTeam: undefined }); cleanup.push(() => withoutGrant.workspace.destroy())
  expect(withoutGrant.tools.create_team).toBeUndefined()
  const ordinary = await createTaskRuntime({ ...ctx, agent: { ...ctx.agent, id: 'ordinary', systemRole: undefined }, conversation: { ...ctx.conversation, agentIds: ['ordinary'] } }); cleanup.push(() => ordinary.workspace.destroy())
  expect(ordinary.tools.create_team).toBeUndefined()
  for (const phase of ['chat', 'decision', 'memory', 'report'] as const) {
    const stage = await createStageAgent(phase, ctx); cleanup.push(() => stage.dispose())
    expect(stage.agent.listTools()).not.toHaveProperty('create_team')
  }
})
test('team tool supplies the real SDK invocation identity and a failed or cancelled operation cannot clear the effect marker', async () => {
  const ctx = await context(), effects: string[] = []
  ctx.beforeEffect = async () => { effects.push('before') }
  ctx.afterEffect = async () => { effects.push('after') }
  const receipt = { operationId: 'op-a', conversationId: 'group-a', title: plan.name, members: [{ id: 'editor', name: '编辑', role: '撰写文章' }] }
  ctx.createTeam = vi.fn(async (_plan, callId) => { effects.push(callId); return receipt })
  const runtime = await createTaskRuntime(ctx); cleanup.push(() => runtime.workspace.destroy())
  expect(await runtime.tools.create_team!.execute!(plan, invocation)).toEqual(receipt)
  expect(effects).toEqual(['before', 'call-a', 'after'])
  expect(ctx.createTeam).toHaveBeenCalledWith(plan, 'call-a')
  effects.length = 0
  await expect(runtime.tools.create_team!.execute!(plan, { observe: noopObserve })).rejects.toThrow('工具调用身份')
  expect(effects).toEqual([])
  ctx.createTeam = async () => { throw new Error('publication failed') }
  await expect(runtime.tools.create_team!.execute!(plan, invocation)).rejects.toThrow('publication failed')
  expect(effects).toEqual(['before'])
  effects.length = 0
  ctx.beforeEffect = async () => { effects.push('before'); throw new Error('cancelled') }
  ctx.createTeam = vi.fn(async () => receipt)
  await expect(runtime.tools.create_team!.execute!(plan, invocation)).rejects.toThrow('cancelled')
  expect(ctx.createTeam).not.toHaveBeenCalled(); expect(effects).toEqual(['before'])
})

test('real Mastra SDK advertises and executes create_team only in the core task, recording the tool receipt before public success', async () => {
  const endpoint = await coreEndpoint(); cleanup.push(() => endpoint.close())
  const ctx = await context(), engine = new MastraEngine(), events: { name: string; status: string }[] = []
  ctx.connection!.baseUrl = endpoint.url
  ctx.messages = [{ id: 'user-a', conversationId: ctx.conversation.id, senderType: 'user', senderId: 'user', senderName: '用户', content: '请创建四人写作团队', status: 'completed', sequence: 1, createdAt: new Date().toISOString() }]
  ctx.triggerMessageId = 'user-a'; ctx.responseKind = 'task'
  ctx.onAdditionalModelCall = async () => {}
  ctx.beforeEffect = vi.fn(async () => {}); ctx.afterEffect = vi.fn(async () => {})
  ctx.onWorkOutcome = vi.fn(async () => {})
  ctx.onTool = async event => { events.push(event) }
  ctx.onDelta = vi.fn(async () => {})
  const receipt = { operationId: 'op-real', conversationId: 'group-real', title: writingPlan.name, members: writingPlan.members.map((member, index) => ({ id: `member-${index}`, name: member.name, role: member.role })) }
  ctx.createTeam = vi.fn(async () => receipt)
  await engine.run(ctx)
  expect(ctx.createTeam).toHaveBeenCalledTimes(1)
  expect(ctx.createTeam).toHaveBeenCalledWith(writingPlan, 'core-tool-0')
  expect(ctx.beforeEffect).toHaveBeenCalledTimes(1); expect(ctx.afterEffect).toHaveBeenCalledTimes(1)
  expect(events.filter(event => event.name === 'create_team').map(event => event.status)).toEqual(['running', 'completed'])
  expect(ctx.onWorkOutcome).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'delivered' }))
  expect(ctx.onDelta).toHaveBeenCalledWith(expect.stringContaining(writingPlan.name))
  expect(endpoint.requests).toHaveLength(3)
  const results = (endpoint.requests[1].messages as { role: string; content: string }[]).filter(message => message.role === 'tool').map(message => JSON.parse(message.content))
  expect(results).toContainEqual(receipt)
  const before = endpoint.requests.length
  ctx.createTeam = vi.fn(async () => receipt)
  await engine.run({ ...ctx, responseKind: 'chat' })
  const decision = await engine.decide({ ...ctx, participation: { isFirstDecision: true, hasRespondedInTurn: false, triggerEventType: 'user_message', observedThroughSequence: 1, sourceEventIds: [] } })
  expect(decision.responseKind).toBe('task')
  await engine.run({ ...ctx, agent: { ...ctx.agent, id: 'writer', systemRole: undefined }, conversation: { ...ctx.conversation, agentIds: ['writer'] } })
  expect(ctx.createTeam).not.toHaveBeenCalled()
  expect(endpoint.requests[before].tools).toBeUndefined()
  expect(endpoint.requests[before + 1].tools).toBeUndefined()
  expect(endpoint.requests[before + 2].tools).not.toEqual(expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: 'create_team' }) })]))
})
