/*
 * [OUTPUT]: 日期夹具只冻结Date，轮询沿真实计时；保留历史/追补精确时间断言，避免假时钟被poll推进。
 * [OUTPUT]: 公共目录固定核对27个明确业务域，包含memory.provider；不靠数量掩盖域替换，原拒绝/回执断言保持。
 * [OUTPUT]: 应用目录包含 terminal/preview/workspace/activity 四个新增能力域。
 * [OUTPUT]: PPT 专用配置域纳入实际目录和 schema；配置保存与模型执行分开。
 * [OUTPUT]: 独立selfies相册元信息/删除纳入公共目录，原图保持任务私聊权限。
 * [OUTPUT]: 独立生图设置域纳入公共目录；生成仍由原任务工具执行。
 * [OUTPUT]: refs真实引用域纳入协议目录；权限与稳定回执保持。
 * [OUTPUT]: 业务发现包含plans依赖计划域及其schema，原回执/来源合同保持。
 * [OUTPUT]: 仅笔记日期可反思；沿真实版本化笔记来源保存日记/成长/心情，删除失效且不伪造聊天。
 * [OUTPUT]: 规划状态实际协议/上下文/跨聊天拒绝/重启/清理与旧回执不重放。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 反思较早漏日/当日笔记与来源失效、十技能绑定；实际与撤回候选归架构§11.22。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [OUTPUT]: 实际宿主旅行末日保存、无搜索时虚假引用拒绝且不公开游记。
 * [OUTPUT]: 全日/次日追补日记按原经历日期生成文件，任一实际来源清空后清理；真实AppService普通员工与bobo同合同。
 * [OUTPUT]: Growth crosses chats only through authorized recall and stops on source restriction/forget; shipped prompt upgrades preserve custom files.
 * [OUTPUT]: 人格历史删除/清空走真实协议、SQLite和稳定回执；保留状态/聊天，删除后不重复执行。
 * [OUTPUT]: 内置人格活动真实宿主发布/免管理/停止/反思/清理/备份恢复；源消息与Work不伪造，零外部模型。
 * [INPUT]: Actual owned AppService/SQLite and deterministic unused model fixture.
 * [OUTPUT]: Independent creation, schema discovery, persona migration, durable receipts and attached desktop settings.
 * [POS]: Application protocol integration tests, not evidence of real model behavior.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startHeadlessServer } from '../src/runtime/headless'
import { findAttachedRuntime } from '../src/main/attached-runtime'
import { AppearanceStore } from '../src/main/appearance'
import { readLocalConnection } from '../src/cli/discovery'
import { CliRpcClient } from '../src/cli/client'
import type { AppearancePatch } from '../src/shared/appearance'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import { createNativeProducts } from '../src/runtime/adapters/native-products'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ApplicationService } from '../src/runtime/modules/application/application-service'
import { z } from 'zod'
import type { ApplicationResult } from '../src/shared/domain/application-protocol'
import type { AgentEngine } from '../src/runtime/contracts'
import type { Connection, DigitalAgent, Conversation, Snapshot } from '../src/shared/domain'
import { BOBO_RULES, BOBO_SOUL, LEGACY_BOBO_RULES, DEFAULT_EMPLOYEE_SOUL } from '../src/shared/domain/agent-presets'
import { promptSourceDefaults } from '../src/shared/domain/agent-prompts'
import type { AgentBehaviorRun, AgentProfile, AgentStateView } from '../src/shared/domain/agent-profile'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.useRealTimers() })
async function fixture(overrides: Partial<AgentEngine> = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-application-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const keys = new Map<string, string>()
  const engine: AgentEngine = { test: async () => 'test', decide: async () => { throw new Error('No model expected') }, run: async () => { throw new Error('No model expected') } }
  const options = { dataPath: root, skillDiscovery: { homeDir: root }, engine: { ...engine, ...overrides }, secrets: { get: async (id: string) => keys.get(id), set: async (id: string, key: string) => { keys.set(id, key) }, delete: async (id: string) => { keys.delete(id) } }, emit: () => {} }
  const owned = await startOwnedRuntime(options); cleanup.push(owned.close)
  const call = (operation: string, input = {}, requestId?: string) => owned.service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  return { root, options, owned, call }
}
const connection = { name: 'API', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' }

async function prepareBehavior(f: Awaited<ReturnType<typeof fixture>>) {
  const day = new Date(2026, 9, 19, 12)
  // expect.poll advances active fake timers; freeze only the wall date here.
  vi.setSystemTime(day)
  expect(vi.isFakeTimers()).toBe(false)
  await f.call('connections.create', connection, 'behavior-model')
  const room = await f.owned.service.handle('startCoreConversation', { content: '保留我们关于具体例子的约定。', requestId: 'behavior-context' }) as Conversation
  await expect.poll(async () => (await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail).messages.some(message => message.senderType === 'agent'), { timeout: 10_000 }).toBe(true)
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(value => value.id === room.id)?.activity).toBe('idle')
  expect(Date.now()).toBe(day.getTime())
  const profile = (await f.call('employees.profile', { agentId: 'bobo' })).data as AgentProfile
  const { agentId: _agentId, revision, updatedAt: _time, ...config } = profile
  expect(await f.call('employees.configure', { agentId: 'bobo', expectedRevision: revision, config: { ...config, features: { emotions: true, fatigue: true, growth: true, travel: false }, proactive: { enabled: true, frequency: 'normal', quietStart: 22, quietEnd: 8 } } }, 'configure-behavior')).toMatchObject({ status: 'succeeded' })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  return room
}
const chatFixture: Partial<AgentEngine> = { decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }), run: async context => { await context.onDelta('记下这轮约定，继续用具体例子交流。') } }

it('persists scoped planning through restart, feeds actual context, and clears mode/receipts with its chat', async () => {
  const contexts: import('../src/runtime/contracts').EngineContext[] = []
  let entered: ApplicationResult | undefined, otherId: string | undefined, foreign: ApplicationResult | undefined
  const f = await fixture({ ...chatFixture, run: async context => {
    contexts.push(context)
    if (context.messages.at(-1)?.content === '进入规划，先不执行') {
      expect(await context.application!.call({ operation: 'planning.get', input: {} })).toMatchObject({ status: 'succeeded', data: { agentId: context.agent.id, conversationId: context.conversation.id, active: false } })
      entered = await context.application!.call({ operation: 'planning.enter', input: { agentId: 'bobo', conversationId: context.conversation.id, expectedRevision: 0 }, requestId: 'employee-enter' })
    }
    if (context.messages.at(-1)?.content === '检查其他会话' && otherId) foreign = await context.application!.call({ operation: 'planning.get', input: { agentId: 'bobo', conversationId: otherId } })
    await context.onDelta('只讨论计划。')
  } })
  await f.call('connections.create', connection, 'planning-model')
  const room = await f.owned.service.handle('startCoreConversation', { content: '进入规划，先不执行', requestId: 'enter-chat' }) as Conversation
  const idle = (service: typeof f.owned.service, id: string) => expect.poll(async () => (await service.handle('snapshot', undefined) as Snapshot).conversations.find(value => value.id === id)?.activity).toBe('idle')
  await idle(f.owned.service, room.id)
  expect(entered).toMatchObject({ status: 'succeeded', data: { active: true, revision: 1, since: expect.any(String) } })
  const input = { agentId: 'bobo', conversationId: room.id }
  const first = await f.call('planning.get', input)
  const repeated = await f.call('planning.enter', { ...input, expectedRevision: 1 }, 'owner-repeat')
  expect(repeated.data).toEqual(first.data)
  expect(await f.call('planning.exit', { ...input, expectedRevision: 0 }, 'stale-exit')).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  const other = await f.owned.service.handle('startCoreConversation', { content: '另一聊天', requestId: 'other-chat' }) as Conversation
  otherId = other.id; await idle(f.owned.service, other.id)
  expect(contexts.at(-1)?.bootstrap?.dynamicInstructions).not.toContain('[Current conversation planning mode]')
  expect(await f.call('planning.get', { agentId: 'bobo', conversationId: other.id })).toMatchObject({ data: { active: false, revision: 0 } })
  await f.owned.service.handle('sendMessage', { conversationId: room.id, content: '检查其他会话', mentionIds: [], requestId: 'foreign-mode' }); await idle(f.owned.service, room.id)
  expect(foreign?.status).toBe('rejected')
  await f.owned.close()
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  await restarted.service.handle('sendMessage', { conversationId: room.id, content: '继续推敲计划', mentionIds: [], requestId: 'resume-plan' }); await idle(restarted.service, room.id)
  expect(contexts.at(-1)?.bootstrap?.dynamicInstructions).toContain('[Current conversation planning mode]')
  expect(contexts.at(-1)?.bootstrap?.dynamicInstructions).toContain('"revision":1')
  expect(contexts.every(context => !context.work)).toBe(true)
  const call = (operation: string, input = {}, requestId?: string) => restarted.service.handle('executeApplicationOperation', { operation, input, requestId }) as Promise<ApplicationResult>
  expect(await call('planning.exit', { ...input, expectedRevision: 1 }, 'exit-plan')).toMatchObject({ status: 'succeeded', data: { active: false, since: null, revision: 2 } })
  expect(await call('planning.enter', { ...input, expectedRevision: 1 }, 'owner-repeat')).toEqual(repeated)
  expect(await call('planning.get', input)).toMatchObject({ data: { active: false, revision: 2 } })
  await restarted.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await call('planning.get', input)).toMatchObject({ data: { active: false, revision: 0 } })
  expect(await restarted.service.handle('getApplicationReceipt', { requestId: 'owner-repeat' })).toMatchObject({ status: 'cleared' })
  const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite')); cleanup.push(() => store.close())
  expect(await store.load('agentPlanningModes')).toEqual([])
  // Even an already-inactive exit has a receipt, but may have no state row to enumerate.
  expect(await call('planning.exit', { agentId: 'bobo', conversationId: other.id, expectedRevision: 0 }, 'already-inactive')).toMatchObject({ status: 'succeeded', data: { active: false, revision: 0 } })
  await restarted.service.handle('clearConversationHistory', { id: other.id, hide: false })
  expect(await restarted.service.handle('getApplicationReceipt', { requestId: 'already-inactive' })).toMatchObject({ status: 'cleared' })
})

it('deletes and clears personality history through durable operations without replaying activity or deleting chats', async () => {
  let calls = 0
  const f = await fixture({ ...chatFixture, runBehavior: async context => { calls++; return { decision: 'apply', reason: '跟进约定', message: '继续聊具体例子。', sourceMessageIds: context.messages.filter(message => message.senderType === 'user').map(message => message.id) } } })
  const room = await prepareBehavior(f)
  const run = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'history-activity')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[])[0]?.status).toBe('completed')
  const messages = (await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail).messages
  const input = { agentId: 'bobo', runId: (run.data as AgentBehaviorRun).id }
  const deleted = await f.call('employees.deleteBehaviorHistory', input, 'delete-history')
  expect(deleted).toMatchObject({ status: 'succeeded', data: { agentId: 'bobo', deletedCount: 1 } })
  expect(await f.call('employees.deleteBehaviorHistory', input, 'delete-history')).toEqual(deleted)
  expect(await f.call('employees.behaviorHistory', { agentId: 'bobo' })).toMatchObject({ data: [] })
  expect(await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'after-history-delete')).toMatchObject({ status: 'succeeded', data: null })
  expect(await f.call('employees.deleteBehaviorHistory', { ...input, agentId: 'another-agent' }, 'wrong-owner')).toMatchObject({ status: 'rejected' })
  expect(await f.call('employees.clearBehaviorHistory', { agentId: 'bobo', before: 'invalid' }, 'bad-cutoff')).toMatchObject({ status: 'rejected' })
  const clearInput = { agentId: 'bobo', before: new Date().toISOString() }
  const cleared = await f.call('employees.clearBehaviorHistory', clearInput, 'clear-history')
  expect(cleared).toMatchObject({ status: 'succeeded', data: { agentId: 'bobo', deletedCount: 0 } })
  expect(await f.call('employees.clearBehaviorHistory', clearInput, 'clear-history')).toEqual(cleared)
  expect((await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail).messages).toEqual(messages)
  expect(calls).toBe(1)
})

it('publishes eligible built-in outreach as the employee, retains actual prompt evidence, and never invents a user turn or Work', async () => {
  let calls = 0
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    calls++
    expect(context.application).toBeUndefined()
    expect(context.bootstrap?.promptEvidence?.scene).toBe('greeting')
    expect(context.bootstrap?.instructions).toContain(BOBO_SOUL)
    return { decision: 'apply', reason: '按具体约定跟进', message: '上次说的具体例子，我想到一个。', sourceMessageIds: context.messages.filter(message => message.senderType === 'user').map(message => message.id) }
  } })
  const room = await prepareBehavior(f)
  const before = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'once')
  expect(admitted.status).toBe('succeeded')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).slice(0, 1)).toEqual([expect.objectContaining({ status: 'completed' })])
  expect(await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'once')).toEqual(admitted)
  const after = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  expect(after.messages.filter(message => message.senderType === 'user')).toEqual(before.messages.filter(message => message.senderType === 'user'))
  expect(after.messages.at(-1)).toMatchObject({ senderId: 'bobo', senderType: 'agent', content: '上次说的具体例子，我想到一个。' })
  expect(after.workItems).toEqual([])
  const history = (await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]
  expect(history[0].promptEvidence?.modules.map(module => module.source)).toContain('prompts/greeting.md')
  await f.owned.close()
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  expect(calls).toBe(1)
  expect(await restarted.service.handle('getApplicationReceipt', { requestId: 'once' })).toEqual(admitted)
})

it('keeps personality activity separate from application management and preserves stop without replay', async () => {
  let calls = 0, entered = false
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    calls++
    expect(context.application).toBeUndefined()
    entered = true
    await new Promise<void>((resolve, reject) => { if (context.signal.aborted) reject(context.signal.reason); else context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true }) })
    return { decision: 'skip', reason: '', sourceMessageIds: [] }
  } })
  await prepareBehavior(f)
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'manage-once')
  expect(admitted.status).toBe('succeeded')
  await expect.poll(async () => entered ? 'entered' : (await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data).toBe('entered')
  expect(await f.call('employees.stopBehavior', { runId: (admitted.data as AgentBehaviorRun).id }, 'stop')).toMatchObject({ status: 'succeeded' })
  expect(((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[])[0].status).toBe('cancelled')
  expect(await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'manage-once')).toEqual(admitted)
  expect(calls).toBe(1)
  expect(((await f.call('employees.list')).data as DigitalAgent[]).filter(agent => agent.name === '行为创建的研究员')).toHaveLength(0)
})

it('commits a final travel day with its diary and rejects made-up research without publishing chat', async () => {
  let invented = false
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    expect(context.callWebSearch).toBeUndefined() // Browser preference cannot silently switch to an API.
    return { decision: 'apply', reason: '虚拟旅程已结束', travelEvent: '想象在京都雨中散步', travelSpend: 40, travelMood: 'content', travelReturn: true,
      travelJournal: { text: '这是未查询实时天气的虚拟游记。', sources: invented ? ['https://example.com/invented'] : [] }, sourceMessageIds: [] }
  } })
  const room = await prepareBehavior(f)
  const profile = (await f.call('employees.profile', { agentId: 'bobo' })).data as AgentProfile
  const { agentId: _id, revision, updatedAt: _at, ...config } = profile
  await f.call('employees.configure', { agentId: 'bobo', expectedRevision: revision, config: { ...config, features: { ...config.features, travel: true } } }, 'travel-on')
  const state = async () => (await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView
  const start = async (requestId: string) => f.call('employees.updateState', { agentId: 'bobo', expectedRevision: (await state()).base.revision, change: { action: 'travel-start', destination: '京都' } }, requestId)
  expect(await start('trip-one')).toMatchObject({ status: 'succeeded' })
  vi.setSystemTime(new Date(2026, 9, 21, 12))
  const run = (await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-travel' }, 'travel-day')).data as AgentBehaviorRun
  expect(run?.id).toBeTruthy()
  const history = async () => (await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]
  await expect.poll(async () => (await history()).find(row => row.id === run.id)?.status).toBe('completed')
  expect((await state()).base.travel).toMatchObject({ active: false, day: 2, budget: 960, mood: 'content', journals: [{ text: '这是未查询实时天气的虚拟游记。' }] })
  expect((await state()).base.travelHistory).toHaveLength(1)
  expect(await start('trip-two')).toMatchObject({ status: 'succeeded' })
  invented = true; vi.setSystemTime(new Date(2026, 9, 22, 12))
  const rejected = (await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-travel' }, 'travel-fake-source')).data as AgentBehaviorRun
  await expect.poll(async () => (await history()).find(row => row.id === rejected.id)?.status).toBe('failed')
  expect((await state()).base.travel).toMatchObject({ active: true, day: 1, budget: 1000, events: [] })
  const detail = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  expect(detail.messages.some(message => message.content.includes('虚拟游记'))).toBe(false)
})

it('persists scoped reflection and growth, then clears derived state and pauses behavior with its source history', async () => {
  const f = await fixture({ ...chatFixture, runBehavior: async context => ({ decision: 'apply', reason: '具体例子有帮助', reflection: '本次交流发现具体例子更容易理解。', trait: '说明观点时更愿意给具体例子。', emotion: { mood: 'curious', valence: 8, energy: 7, reason: '讨论很有趣' }, sourceMessageIds: context.messages.filter(message => message.senderType === 'user').map(message => message.id) }) })
  const room = await prepareBehavior(f)
  expect(await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'reflect')).toMatchObject({ status: 'succeeded' })
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).slice(0, 1)).toEqual([expect.objectContaining({ status: 'completed' })])
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toHaveLength(1)
  const memory = await f.owned.service.handle('getMemory', { agentId: 'bobo', scope: 'employee' }) as import('../src/shared/domain').MemoryView
  expect(memory.entries.some(entry => entry.content.includes('具体例子更容易'))).toBe(true)
  await f.owned.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect((await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'after-clear')).data).toBeNull()
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toEqual([])
  expect(JSON.stringify((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data)).not.toContain('具体例子有帮助')
})

it.each(['employee', 'conversation'] as const)('carries growth through actual recall for %s sources and revokes it when forgotten', async scope => {
  const contexts: import('../src/runtime/contracts').EngineContext[] = []
  const trait = '说明观点时更愿意给具体例子。'
  const f = await fixture({ ...chatFixture,
    run: async context => { contexts.push(context); await context.onDelta('你好。') },
    runBehavior: async context => ({ decision: 'apply', reason: '有来源的反思', reflection: '这次通过具体事例理解了复杂概念。'.repeat(100), trait, sourceMessageIds: context.messages.filter(message => message.senderType === 'user').map(message => message.id) }),
  })
  const room = await prepareBehavior(f)
  if (scope === 'conversation') await f.owned.service.handle('createConversation', { id: room.id, kind: room.kind, title: room.title, agentIds: room.agentIds, memoryScope: scope })
  await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'reflect-continuity')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[])[0]?.status).toBe('completed')
  const inspectNewChat = async (requestId: string) => {
    const other = await f.owned.service.handle('startCoreConversation', { content: '早，今天天气不错。', requestId }) as Conversation
    await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(value => value.id === other.id)?.activity).toBe('idle')
    return contexts.find(context => context.conversation.id === other.id)!
  }
  const next = await inspectNewChat('next-chat')
  expect(next).toBeDefined()
  expect(next.bootstrap?.dynamicInstructions?.includes(trait)).toBe(scope === 'employee')
  if (scope === 'employee') {
    expect(next.memory?.recall?.versions.length).toBeGreaterThan(0)
    await f.owned.service.handle('createConversation', { id: room.id, kind: room.kind, title: room.title, agentIds: room.agentIds, memoryScope: 'conversation' })
    expect((await inspectNewChat('after-restriction')).bootstrap?.dynamicInstructions).not.toContain(trait)
  }
  const memory = await f.owned.service.handle('getMemory', { agentId: 'bobo', scope: 'employee' }) as import('../src/shared/domain').MemoryView
  const entry = memory.entries.find(item => item.content.includes('通过具体事例'))!
  await f.owned.service.handle('deleteMemory', { agentId: 'bobo', scope: 'employee', id: entry.id, expectedEpoch: memory.epoch, requestId: 'forget-growth' })
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toEqual([])
  expect((await inspectNewChat('after-forget')).bootstrap?.dynamicInstructions).not.toContain(trait)
})

it.each([false, true])('reflects the full source day across private/group chats, including catch-up=%s, and clears derivatives with any source', async catchup => {
  let observed: import('../src/runtime/contracts').EngineContext | undefined
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    observed = context
    return { decision: 'apply', reason: 'day-source-result', reflection: '今天私聊和群里都学到了把讨论落到例子上。', trait: '我更喜欢先摆出一个具体例子。', sourceMessageIds: [context.messages.find(message => message.content === '早上的私聊经历')!.id] }
  } })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 19, 9))
  await f.call('connections.create', connection, 'day-model')
  const employee = (await f.call('employees.create', { name: '小研', role: '共同研究' }, 'day-employee')).data as DigitalAgent
  const first = await f.owned.service.handle('sendEmployeeMessage', { employeeId: employee.id, content: '早上的私聊经历', requestId: 'day-private' }) as import('../src/shared/domain').Message
  const idle = async (id: string) => expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(room => room.id === id)?.activity).toBe('idle')
  await idle(first.conversationId)
  const group = await f.owned.service.handle('createConversation', { kind: 'group', title: '公开讨论', agentIds: [employee.id] }) as Conversation
  vi.setSystemTime(new Date(2026, 9, 19, 14))
  await f.owned.service.handle('sendMessage', { conversationId: group.id, content: '下午群聊一起找到了关键例子', mentionIds: [employee.id], requestId: 'day-group' }); await idle(group.id)
  const restricted = await f.owned.service.handle('createConversation', { kind: 'group', title: '限定讨论', agentIds: [employee.id], memoryScope: 'conversation' }) as Conversation
  await f.owned.service.handle('sendMessage', { conversationId: restricted.id, content: 'LIMITED_DAY_SENTINEL', mentionIds: [employee.id], requestId: 'day-restricted' }); await idle(restricted.id)
  const dayMemory = await f.owned.service.handle('getMemory', { agentId: employee.id, scope: 'employee' }) as import('../src/shared/domain').MemoryView
  await f.owned.service.handle('saveMemory', { agentId: employee.id, scope: 'employee', content: '当日笔记：举例前先说清适用范围，先区分观察与推测。', kind: 'long_term', useScope: 'employee', expectedEpoch: dayMemory.epoch, requestId: 'day-note' })
  const profile = (await f.call('employees.profile', { agentId: employee.id })).data as AgentProfile
  const { agentId: _id, revision, updatedAt: _time, ...config } = profile
  await f.call('employees.configure', { agentId: employee.id, expectedRevision: revision, config: { ...config, features: { ...config.features, growth: true } } }, 'enable-day-reflection')
  vi.setSystemTime(catchup ? new Date(2026, 9, 20, 12) : new Date(2026, 9, 19, 23, 10))
  const admitted = await f.call('employees.runBehavior', { agentId: employee.id, behaviorId: 'builtin-reflection' }, 'whole-day')
  expect(admitted.data).toMatchObject({ reflectionDay: '2026-10-19' })
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: employee.id })).data as AgentBehaviorRun[])[0]?.status).toBe('completed')
  expect(observed?.messages.map(message => message.content)).toContain('早上的私聊经历')
  expect(observed?.messages.map(message => message.content)).toContain('下午群聊一起找到了关键例子')
  expect(JSON.stringify(observed)).not.toContain('LIMITED_DAY_SENTINEL')
  expect(observed?.personalityReflection?.conversations.map(room => room.kind).sort()).toEqual(['direct', 'group'])
  expect(observed?.personalityReflection?.notes).toEqual(expect.arrayContaining([expect.objectContaining({ content: '当日笔记：举例前先说清适用范围，先区分观察与推测。', evidence: 'fact' })]))
  const memory = await f.owned.service.handle('getMemory', { agentId: employee.id, scope: 'employee' }) as import('../src/shared/domain').MemoryView
  const diary = memory.entries.find(entry => entry.content.startsWith('今天私聊'))!
  const note = memory.entries.find(entry => entry.content.startsWith('当日笔记'))!
  expect(diary.sourceMemoryIds).toContain(note.id)
  expect(observed?.memory?.recall?.versions).toContainEqual({ id: note.id, version: note.version })
  expect(diary.diary).toEqual({ date: '2026-10-19', behaviorRunId: (admitted.data as AgentBehaviorRun).id })
  expect(diary.createdAt.slice(0, 16)).toBe(new Date().toISOString().slice(0, 16))
  expect(diary.sourceConversationIds).toEqual(expect.arrayContaining([first.conversationId, group.id]))
  expect(diary.sourceMessageIds).toContain(observed!.messages.find(message => message.content === '下午群聊一起找到了关键例子')!.id)
  expect(((await f.call('employees.state', { agentId: employee.id, conversationId: first.conversationId })).data as AgentStateView).base.traits).toHaveLength(1)
  await f.call('employees.files', { agentId: employee.id })
  const file = await f.call('employees.readFile', { agentId: employee.id, name: 'memory/2026-10-19.md' })
  expect(file).toMatchObject({ status: 'succeeded', data: { status: 'current', kind: 'generated', content: expect.stringContaining(diary.content) } })
  expect(await f.call('employees.readFile', { agentId: employee.id, name: '../state/secrets.json' })).toMatchObject({ status: 'rejected' })
  expect(await f.call('employees.writeFile', { agentId: employee.id, name: 'memory/2026-10-19.md', content: '覆盖日记', expectedHash: '', expectedConfigVersion: employee.configVersion }, 'reject-diary-file-write')).toMatchObject({ status: 'rejected' })
  await f.owned.service.handle('clearConversationHistory', { id: group.id, hide: false })
  expect(((await f.call('employees.state', { agentId: employee.id, conversationId: first.conversationId })).data as AgentStateView).base.traits).toEqual([])
  expect(JSON.stringify((await f.call('employees.behaviorHistory', { agentId: employee.id })).data)).not.toContain('day-source-result')
  await f.call('employees.files', { agentId: employee.id })
  expect(JSON.stringify(await f.call('employees.readFile', { agentId: employee.id, name: 'memory/2026-10-19.md' }))).not.toContain(diary.content)
  expect((await f.call('employees.runBehavior', { agentId: employee.id, behaviorId: 'builtin-reflection' }, 'after-group-clear')).data).toBeNull()
})

it('continues reflection after an actual correction invalidates a sibling memory of the same message', async () => {
  let extraction = 0, prior: { id: string; version: number } | undefined
  let observed: import('../src/runtime/contracts').EngineContext | undefined
  const f = await fixture({ ...chatFixture, extractMemory: async context => {
    const source = context.messages.filter(message => message.senderType === 'user').at(-1)!.id
    if (++extraction === 1) return [
      { content: '旧判断：工具已完整跑通', sourceMessageIds: [source], kind: 'long_term' },
      { content: '同源偏好：希望具体的反思', sourceMessageIds: [source], kind: 'long_term' },
    ]
    return [{ content: '当前判断：结果有遗漏', sourceMessageIds: [source], kind: 'long_term', supersedes: [prior!] }]
  }, runBehavior: async context => {
    observed = context
    return { decision: 'apply', reason: '只使用纠正后来源', reflection: '需要以当前已经核对的事实为准。', sourceMessageIds: context.messages.filter(message => message.senderType === 'user').map(message => message.id) }
  } })
  const room = await prepareBehavior(f), query = { agentId: 'bobo', scope: 'employee' }
  let memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  const target = memory.entries.find(entry => entry.content.startsWith('旧判断'))!
  prior = { id: target.id, version: target.version }
  vi.setSystemTime(new Date(2026, 9, 19, 14))
  await f.owned.service.handle('sendMessage', { conversationId: room.id, content: '纠正刚才的判断，结果有遗漏。', mentionIds: [], requestId: 'actual-correction' })
  await expect.poll(async () => (await f.owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(value => value.id === room.id)?.activity).toBe('idle')
  memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  expect(memory.entries.find(entry => entry.id === prior!.id)?.status).toBe('superseded')
  expect(memory.entries.find(entry => entry.content.startsWith('同源偏好'))?.status).toBe('active')
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'reflect-after-correction')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(item => item.id === (admitted.data as AgentBehaviorRun).id)?.status).toBe('completed')
  expect(observed?.memory?.entries.map(entry => entry.content)).toContain('当前判断：结果有遗漏')
  expect(observed?.memory?.entries.some(entry => entry.content.startsWith('同源偏好'))).toBe(false)
  expect(observed?.personalityReflection?.notes?.some(entry => entry.content.startsWith('同源偏好'))).toBe(false)
})

it('reflects actual self-state history and timestamps catch-up emotion now instead of rewriting yesterday', async () => {
  let observed: import('../src/runtime/contracts').EngineContext | undefined
  const f = await fixture({ ...chatFixture, run: async context => {
    const state = await context.personality!.read()
    await context.personality!.update({ scope: 'context', expectedRevision: state.context!.revision, change: { action: 'emotion', emotion: { mood: 'curious', valence: 7, energy: 6, reason: '具体例子激起了我的好奇。' } } })
    await context.onDelta('这次的例子让我好奇。')
  }, runBehavior: async context => {
    observed = context
    return { decision: 'apply', reason: '读取真实状态记录', reflection: '昨天讨论具体例子时记录了好奇的心情。', emotion: { mood: 'content', valence: 7, energy: 6, reason: '现在回想那次交流。' }, sourceMessageIds: [context.messages.find(message => message.senderType === 'user')!.id] }
  } })
  const room = await prepareBehavior(f)
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'emotion-history-reflection')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(item => item.id === (admitted.data as AgentBehaviorRun).id)?.status).toBe('completed')
  const history = observed?.personalityReflection?.emotions
  expect(history).toHaveLength(1)
  expect(history![0]).toMatchObject({ conversationId: room.id, emotion: { mood: 'curious', updatedAt: new Date(2026, 9, 19, 12).toISOString() } })
  expect(observed?.personalityReflection?.date).toBe('2026-10-19')
  expect(observed?.memory?.recall?.inputMessageIds).toEqual(expect.arrayContaining(history![0].sourceMessageIds))
  const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite')); cleanup.push(() => store.close())
  const recorded = await store.load<import('../src/shared/domain/agent-profile').AgentEmotionHistory>('agentEmotionHistory')
  expect(recorded).toHaveLength(2)
  expect(recorded[1]).toMatchObject({ emotion: { mood: 'content', updatedAt: new Date(2026, 9, 20, 12).toISOString() } })
  const memory = await f.owned.service.handle('getMemory', { agentId: 'bobo', scope: 'employee' }) as import('../src/shared/domain').MemoryView
  const diary = memory.entries.find(entry => entry.diary)!
  expect(diary.diary?.date).toBe('2026-10-19')
  expect(diary.sourceMessageIds).toEqual(expect.arrayContaining(history![0].sourceMessageIds))
  await f.owned.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await store.load('agentEmotionHistory')).toEqual([])
})

it('reflects on a note-only day without manufacturing chat and invalidates its derived diary, growth and emotion', async () => {
  let observed: import('../src/runtime/contracts').EngineContext | undefined
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    observed = context
    return { decision: 'apply', reason: '回顾实际保存的笔记', reflection: '这份笔记让我重新考虑如何解释判断。', trait: '我愿意先说明判断的依据。', emotion: { mood: 'curious', valence: 7, energy: 6, reason: '笔记提出了一个值得思考的问题。' }, sourceMessageIds: [] }
  } })
  const room = await prepareBehavior(f), query = { agentId: 'bobo', scope: 'employee' }
  // Chat was yesterday; today has a directly saved note and no message at all.
  let memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  memory = await f.owned.service.handle('saveMemory', { ...query, content: '判断需区分证据和假设。', kind: 'experience', evidence: 'preference', useScope: 'employee', expectedEpoch: memory.epoch, requestId: 'notes-only-source' }) as import('../src/shared/domain').MemoryView
  const note = memory.entries.find(entry => entry.content === '判断需区分证据和假设。')!
  const before = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  vi.setSystemTime(new Date(2026, 9, 21, 12))
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'note-only-day')
  expect(admitted.data).toMatchObject({ reflectionDay: '2026-10-20', sourceMemoryId: note.id })
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(item => item.id === (admitted.data as AgentBehaviorRun).id)?.status).toBe('completed')
  expect(observed?.messages).toEqual([])
  expect(observed?.personalityReflection?.notes).toMatchObject([{ id: note.id, version: note.version, origin: 'user' }])
  const after = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  expect(after.messages).toEqual(before.messages)
  memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  const diary = memory.entries.find(entry => entry.diary?.date === '2026-10-20')!
  expect(diary.sourceMessageIds).toEqual([]); expect(diary.sourceMemoryIds).toContain(note.id)
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toHaveLength(1)
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const emotion = (await store.load<import('../src/shared/domain/agent-profile').AgentEmotionHistory>('agentEmotionHistory'))[0]
  expect(emotion).toMatchObject({ sourceMessageIds: [], sourceMemories: expect.arrayContaining([{ id: note.id, version: note.version }]) })
  await f.owned.service.handle('deleteMemory', { ...query, id: note.id, expectedEpoch: memory.epoch, requestId: 'delete-only-note' })
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toEqual([])
  memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  expect(memory.entries.find(entry => entry.id === diary.id)?.status).not.toBe('active')
  expect((await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'note-only-day')).data).toMatchObject({ id: (admitted.data as AgentBehaviorRun).id })
})

it('invalidates a diary and growth when a dated note used only by reflection is forgotten', async () => {
  let observed: import('../src/runtime/contracts').EngineContext | undefined
  const f = await fixture({ ...chatFixture, runBehavior: async context => {
    observed = context
    return { decision: 'apply', reason: '结合当日笔记', reflection: '当日笔记提醒我在表达看法前分清依据。', trait: '我更愿意明确说出判断的依据。', sourceMessageIds: [context.messages.find(message => message.senderType === 'user')!.id] }
  } })
  const room = await prepareBehavior(f)
  vi.setSystemTime(new Date(2026, 9, 19, 14))
  const query = { agentId: 'bobo', scope: 'employee' }
  let memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  await f.owned.service.handle('saveMemory', { ...query, content: '笔记专属的依据要求，不在聊天正文里。', kind: 'experience', evidence: 'preference', useScope: 'employee', expectedEpoch: memory.epoch, requestId: 'reflection-only-note' })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  const admitted = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'reflect-note')
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(item => item.id === (admitted.data as AgentBehaviorRun).id)?.status).toBe('completed')
  memory = await f.owned.service.handle('getMemory', query) as import('../src/shared/domain').MemoryView
  const note = memory.entries.find(entry => entry.content.startsWith('笔记专属'))!, diary = memory.entries.find(entry => entry.diary)!
  expect(observed?.personalityReflection?.notes?.some(entry => entry.id === note.id)).toBe(true)
  expect(observed?.messages.some(message => message.content.includes('笔记专属'))).toBe(false)
  expect(diary.sourceMemoryIds).toContain(note.id)
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toHaveLength(1)
  await f.owned.service.handle('deleteMemory', { ...query, id: note.id, expectedEpoch: memory.epoch, requestId: 'forget-reflection-note' })
  expect(((await f.call('employees.state', { agentId: 'bobo', conversationId: room.id })).data as AgentStateView).base.traits).toEqual([])
  await f.call('employees.files', { agentId: 'bobo' })
  expect(JSON.stringify(await f.call('employees.readFile', { agentId: 'bobo', name: 'memory/2026-10-19.md' }))).not.toContain(diary.content)
  expect((await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-reflection' }, 'no-reflection-replay')).data).toBeNull()
})

it('exports background features and proactive contact disabled and restores without model calls', async () => {
  let calls = 0
  const f = await fixture({ ...chatFixture, runBehavior: async () => { calls++; return { decision: 'skip', reason: '', sourceMessageIds: [] } } })
  await prepareBehavior(f)
  const destination = await realpath(await mkdtemp(join(tmpdir(), 'boai-personality-backup-'))); cleanup.push(() => rm(destination, { recursive: true, force: true }))
  await f.owned.service.backup(destination)
  expect(((await f.call('employees.profile', { agentId: 'bobo' })).data as AgentProfile).proactive.enabled).toBe(true)
  const restored = await startOwnedRuntime({ ...f.options, dataPath: destination }); cleanup.push(restored.close)
  const profile = await restored.service.handle('executeApplicationOperation', { operation: 'employees.profile', input: { agentId: 'bobo' } }) as ApplicationResult
  expect((profile.data as AgentProfile).proactive.enabled).toBe(false)
  expect((profile.data as AgentProfile).features).toMatchObject({ emotions: false, growth: false, travel: false })
  expect(calls).toBe(0)
  expect(await restored.service.handle('executeApplicationOperation', { operation: 'employees.behaviorHistory', input: { agentId: 'bobo' } })).toMatchObject({ data: [] })
})

it('starts and advances a virtual journey from its feature switch, without a manually authored plan', async () => {
  let calls = 0
  const f = await fixture({ ...chatFixture, runBehavior: async () => {
    calls++
    return { decision: 'apply', reason: '虚拟旅行记录', sourceMessageIds: [], ...(calls === 1 ? { travelDestination: '京都' } : calls === 2 ? { travelEvent: '虚构经历：沿着河边散步。' } : { travelReturn: true }) }
  } })
  await prepareBehavior(f)
  const profile = (await f.call('employees.profile', { agentId: 'bobo' })).data as AgentProfile
  const { agentId: _id, revision, updatedAt: _time, ...config } = profile
  expect(await f.call('employees.configure', { agentId: 'bobo', expectedRevision: revision, config: { ...config, features: { ...config.features, travel: true } } }, 'enable-travel')).toMatchObject({ status: 'succeeded' })
  const travel = async (id: string) => {
    const result = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-travel' }, id)
    expect(result).toMatchObject({ status: 'succeeded', data: { kind: 'travel' } })
    await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(run => run.id === (result.data as AgentBehaviorRun).id)?.status).toBe('completed')
    return ((await f.call('employees.state', { agentId: 'bobo' })).data as AgentStateView).base.travel!
  }
  expect(await travel('travel-start')).toMatchObject({ destination: '京都', day: 1, active: true })
  expect((await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-travel' }, 'same-day')).data).toBeNull()
  vi.setSystemTime(new Date(2026, 9, 21, 12))
  expect(await travel('travel-day')).toMatchObject({ day: 2, events: [{ text: '虚构经历：沿着河边散步。' }] })
  vi.setSystemTime(new Date(2026, 9, 22, 12))
  expect(await travel('travel-home')).toMatchObject({ day: 2, active: false })
  expect(calls).toBe(3)
})

it('rechecks quiet hours before publishing an already running proactive draft', async () => {
  let release!: () => void
  const f = await fixture({ ...chatFixture, runBehavior: async () => {
    await new Promise<void>(resolve => { release = resolve })
    return { decision: 'apply', reason: '话题延续', message: '这条草稿不应在免打扰时发出。', sourceMessageIds: [] }
  } })
  const room = await prepareBehavior(f)
  const result = await f.call('employees.runBehavior', { agentId: 'bobo', behaviorId: 'builtin-greeting' }, 'late-greeting')
  expect(result.status).toBe('succeeded')
  await expect.poll(() => typeof release).toBe('function')
  vi.setSystemTime(new Date(2026, 9, 20, 23))
  release()
  await expect.poll(async () => ((await f.call('employees.behaviorHistory', { agentId: 'bobo' })).data as AgentBehaviorRun[]).find(run => run.id === (result.data as AgentBehaviorRun).id)?.status).toBe('skipped')
  const detail = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
  expect(detail.messages.some(message => message.content.includes('不应在免打扰时发出'))).toBe(false)
})

it('creates independent connection/employee/group/source/session/schedule with original services and no model work', async () => {
  const f = await fixture()
  const model = await f.call('connections.create', { ...connection, apiKey: 'secret-marker' }, 'model')
  expect(model.status).toBe('succeeded')
  expect(JSON.stringify(model)).not.toContain('secret-marker')
  const employee = await f.call('employees.create', { name: '小研', role: '研究行业动态' }, 'employee')
  expect(employee).toMatchObject({ status: 'succeeded', data: { name: '小研', connectionId: (model.data as Connection).id, modelId: 'fixture-model', skillIds: [], knowledgeIds: [] } })
  const agent = employee.data as DigitalAgent
  const group = await f.call('groups.create', { title: '行业观察', agentIds: [agent.id, 'researcher'] }, 'group')
  expect(group).toMatchObject({ status: 'succeeded', data: { kind: 'group', title: '行业观察' } })
  expect(await f.call('sessions.create', { employeeId: agent.id }, 'session')).toMatchObject({ status: 'succeeded', data: { operation: 'create', employeeId: agent.id, state: 'completed' } })
  expect(await f.call('automations.create', { name: '每日观察', prompt: '整理行业动态', owner: { kind: 'employee', employeeId: agent.id }, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Shanghai', enabled: false, notify: false }, 'schedule')).toMatchObject({ status: 'succeeded', data: { name: '每日观察', enabled: false } })
  const source = await f.call('sources.create', { config: { type: 'local', name: '资料', description: '', guide: '', enabled: true, local: { path: f.root } } }, 'source')
  expect(source).toMatchObject({ status: 'succeeded', data: { type: 'local', name: '资料' } })
  const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite')); cleanup.push(() => store.close())
  expect(await store.load('workItems')).toEqual([])
  expect(await store.load('runs')).toEqual([])
  expect(await store.load('automationOccurrences')).toEqual([])
  expect(JSON.stringify(await store.load('applicationOperations'))).not.toContain('secret-marker')
  expect((group.data as Conversation).agentIds).toEqual([agent.id, 'researcher'])
})

it('deduplicates concurrent writes, rejects changed requests, and returns the old receipt after restart', async () => {
  const f = await fixture()
  const results = await Promise.all([f.call('employees.create', { name: '一次创建' }, 'same'), f.call('employees.create', { name: '一次创建' }, 'same')])
  expect(results.some(result => result.status === 'succeeded')).toBe(true)
  const receipt = await f.owned.service.handle('getApplicationReceipt', { requestId: 'same' }) as ApplicationResult
  expect(receipt.status).toBe('succeeded')
  expect(await f.call('employees.create', { name: '不同参数' }, 'same')).toMatchObject({ status: 'rejected', error: { code: 'REQUEST_CONFLICT' } })
  expect((await f.call('employees.list')).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: (receipt.data as DigitalAgent).id })]))
  expect(((await f.call('employees.list')).data as DigitalAgent[]).filter(agent => agent.name === '一次创建')).toHaveLength(1)
  await f.owned.close()
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  expect(await restarted.service.handle('executeApplicationOperation', { operation: 'employees.create', input: { name: '一次创建' }, requestId: 'same' })).toEqual(receipt)
})

it('rejects absent identity, forged core ownership and unknown input before invoking a mutation', async () => {
  const f = await fixture()
  expect(await f.call('employees.create', { name: 'missing id' })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await f.call('employees.create', { name: 'fake', systemRole: 'core' }, 'forged')).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await f.call('system.raw', {}, 'hidden')).toMatchObject({ status: 'rejected', error: { code: 'UNKNOWN_OPERATION' } })
  const catalog = await f.owned.service.handle('getApplicationCatalog', { domain: 'employees' }) as { operations: { name: string; inputSchema?: unknown }[] }
  expect(catalog.operations.map(item => item.name)).toContain('employees.create')
  expect(catalog.operations.every(item => item.name.startsWith('employees.') && !item.inputSchema)).toBe(true)
  const described = await f.owned.service.handle('getApplicationCatalog', { operation: 'employees.create' }) as typeof catalog
  expect(described.operations).toHaveLength(1)
  expect(described.operations[0].inputSchema).toMatchObject({ type: 'object' })
  const complete = await f.owned.service.handle('getApplicationCatalog', { includeSchemas: true }) as { operations: { name: string; inputSchema: unknown; available: boolean }[] }
  expect([...new Set(complete.operations.map(operation => operation.name.split('.')[0]))].sort()).toEqual(['activity', 'appearance', 'application', 'automations', 'channels', 'connections', 'employees', 'groups', 'images', 'knowledge', 'memory', 'planning', 'plans', 'plugins', 'presentations', 'preview', 'refs', 'runtimePlugins', 'runtimes', 'selfies', 'sessions', 'skills', 'sources', 'tasks', 'terminal', 'webSearch', 'workspace'])
  expect(complete.operations.find(operation => operation.name === 'plans.set')?.inputSchema).toMatchObject({ type: 'object' })
  expect(complete.operations.find(operation => operation.name === 'presentations.configure')?.inputSchema).toMatchObject({ type: 'object' })
  expect(complete.operations.every(operation => !!operation.inputSchema)).toBe(true)
  expect(complete.operations.find(operation => operation.name === 'appearance.update')?.available).toBe(false)
  expect(await f.call('appearance.update', { patch: { mode: 'dark' }, expectedRevision: 0 }, 'no-host')).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
})

it('preserves an unknown post-effect failure, never persists credentials, and never replays it', async () => {
  const f = await fixture()
  const store = new ProductStore(join(f.root, 'operation-fixture.sqlite')); await store.init(); cleanup.push(() => store.close())
  let effects = 0
  const operations = [{ name: 'fixture.write', description: 'fixture', effect: 'write' as const, input: z.object({ credential: z.string() }).strict(), resultType: 'void', execute: async () => { effects++; throw new Error('secret-canary') } }]
  const service = new ApplicationService(store, operations, async actor => { if (actor.kind !== 'owner') throw new Error('denied') })
  const request = { operation: 'fixture.write', input: { credential: 'secret-canary' }, requestId: 'write-once' }
  expect(await service.call(request, { kind: 'employee', employeeId: 'fake', conversationId: 'fake', messageId: 'fake' })).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  expect(await service.call(request)).toMatchObject({ status: 'unknown', error: { code: 'OUTCOME_UNKNOWN' } })
  expect(await new ApplicationService(store, operations, async () => {}).call(request)).toMatchObject({ status: 'unknown' })
  expect(effects).toBe(1)
  expect(JSON.stringify(await store.load('applicationOperations'))).not.toContain('secret-canary')
})


it('runs real bobo host callbacks for independent employee and future schedule creation in ordinary chat', async () => {
  const f = await fixture({
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => {
      if (!context.application) throw new Error('missing application tools')
      expect((await context.application.catalog({ domain: 'sessions' })).operations.some(operation => operation.name === 'sessions.send')).toBe(false)
      expect(await context.application.call({ operation: 'sessions.send', input: { conversationId: context.conversation.id, content: '不能冒充本人' }, requestId: 'forged-owner' })).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
      const native = createNativeProducts(context)
      const call = native.tools.find(tool => tool.name === 'boai_call')!
      expect(call.inputSchema.type).toBe('object')
      const employee = await call.execute({ operation: 'employees.create', input: { name: 'bobo创建的小研' }, requestId: 'employee' }, 'native-product-call') as ApplicationResult
      expect(employee.status).toBe('succeeded')
      const receipt = await context.application.receipt({ receiptId: employee.receiptId! })
      expect(receipt).toEqual(employee)
      const plan = await context.application.call({ operation: 'automations.create', input: { name: '九点研究', prompt: '整理行业动态', owner: { kind: 'employee', employeeId: (employee.data as DigitalAgent).id }, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Shanghai', enabled: false, notify: false }, requestId: 'plan' })
      expect(plan.status).toBe('succeeded')
      await native.dispose()
      await context.onDelta('已创建小研和九点研究计划，计划暂未启用。')
    },
  })
  const model = (await f.call('connections.create', connection, 'model')).data as Connection
  const core = ((await f.call('employees.list')).data as DigitalAgent[]).find(agent => agent.id === 'bobo')!
  await f.owned.service.handle('saveAgent', { id: core.id, expectedConfigVersion: core.configVersion, name: core.name, role: core.role, instructions: core.instructions, color: core.color, connectionId: model.id, modelId: model.defaultModel, skillIds: [], knowledgeIds: [], active: true, allowCommands: false })
  const room = await f.owned.service.handle('startCoreConversation', { content: '创建小研，再给他建一个每天九点执行的研究计划，先不要启用。', requestId: 'user-intent' }) as Conversation
  await expect.poll(async () => {
    const detail = await f.owned.service.handle('getConversation', { id: room.id }) as import('../src/shared/domain').ConversationDetail
    return detail.messages.some(message => message.senderType === 'agent' && message.content.includes('已创建小研'))
  }, { timeout: 10000 }).toBe(true)
  expect(((await f.call('employees.list')).data as DigitalAgent[]).filter(agent => agent.name === 'bobo创建的小研')).toHaveLength(1)
  const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite')); cleanup.push(() => store.close())
  expect(await store.load('workItems')).toEqual([])
  expect(await store.load('automationOccurrences')).toEqual([])
  const receipts = await store.load<{ result: ApplicationResult }>('applicationOperations')
  const employee = receipts.find(item => item.result.requestId === 'employee')!.result
  expect(await f.owned.service.handle('getApplicationReceipt', { receiptId: employee.receiptId })).toEqual(employee)
})

it('keeps a custom employee persona across restart and rejects stale configuration without writing', async () => {
  const f = await fixture()
  const result = await f.call('employees.create', { name: '独立人格', initialSoul: '表达直接、克制；保留自己的判断。' }, 'persona')
  expect(result.status).toBe('succeeded')
  const agent = result.data as DigitalAgent
  expect(agent).not.toHaveProperty('initialSoul')
  expect(await readFile(join(f.root, 'agents', agent.id, 'workspace/SOUL.md'), 'utf8')).toBe('表达直接、克制；保留自己的判断。')
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision: _d, ...definition } = agent
  expect(await f.call('employees.update', { ...definition, expectedConfigVersion: configVersion + 1 }, 'stale')).toMatchObject({ status: 'rejected', error: { code: 'REVISION_CONFLICT' } })
  await writeFile(join(f.root, 'agents/bobo/workspace/SOUL.md'), '用户自定义 bobo 人格')
  await f.owned.close()
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  expect(await readFile(join(f.root, 'agents/bobo/workspace/SOUL.md'), 'utf8')).toBe('用户自定义 bobo 人格')
  expect(await readFile(join(f.root, 'agents', agent.id, 'workspace/SOUL.md'), 'utf8')).toBe('表达直接、克制；保留自己的判断。')
})


it('clears deleted employee configuration from receipts while retaining non-replaying request identity', async () => {
  const f = await fixture()
  const request = { name: '将删除', instructions: 'PRIVATE_EMPLOYEE_RULE_CANARY' }
  const created = await f.call('employees.create', request, 'create-before-delete')
  expect(created.status).toBe('succeeded')
  expect(await f.call('employees.delete', { id: (created.data as DigitalAgent).id }, 'delete-employee')).toMatchObject({ status: 'succeeded' })
  expect(await f.call('employees.create', request, 'create-before-delete')).toMatchObject({ status: 'cleared' })
  const store = await ProductStore.openReadOnly(join(f.root, 'boai.sqlite')); cleanup.push(() => store.close())
  expect(JSON.stringify(await store.load('applicationOperations'))).not.toContain('PRIVATE_EMPLOYEE_RULE_CANARY')
})

it('upgrades exact shipped bobo defaults once and retains the resulting configuration after another restart', async () => {
  const f = await fixture()
  const rules = join(f.root, 'agents/bobo/workspace/AGENTS.md')
  const soul = join(f.root, 'agents/bobo/workspace/SOUL.md')
  await f.owned.close()
  await writeFile(rules, LEGACY_BOBO_RULES)
  await writeFile(soul, DEFAULT_EMPLOYEE_SOUL)
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  expect(await readFile(rules, 'utf8')).toBe(BOBO_RULES)
  expect(await readFile(soul, 'utf8')).toBe(BOBO_SOUL)
  const first = (await restarted.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  await restarted.close()
  const again = await startOwnedRuntime(f.options); cleanup.push(again.close)
  const second = (await again.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  expect(second.configVersion).toBe(first.configVersion)
  expect(second.instructions).toBe(BOBO_RULES)
})

it('upgrades old structured emotion defaults once without overwriting custom or missing scenes', async () => {
  const f = await fixture()
  const emotion = join(f.root, 'agents/bobo/workspace/prompts/emotion.md')
  const direct = join(f.root, 'agents/bobo/workspace/prompts/direct.md')
  const group = join(f.root, 'agents/bobo/workspace/prompts/group.md')
  const old = promptSourceDefaults['prompts/emotion.md'].replace("Put the result in the emotion field of the host's structured response: mood is one word, valence and energy range from 0 to 10, reason is brief.", 'Return only JSON: {"mood":"one word","valence":0..10,"energy":0..10,"reason":"brief reason"}.')
  await f.owned.close()
  await writeFile(emotion, old)
  await writeFile(direct, '用户自己的交流方式：简洁、冷幽默。\n')
  await rm(group)
  const restarted = await startOwnedRuntime(f.options); cleanup.push(restarted.close)
  expect(await readFile(emotion, 'utf8')).toBe(promptSourceDefaults['prompts/emotion.md'])
  expect(await readFile(direct, 'utf8')).toBe('用户自己的交流方式：简洁、冷幽默。\n')
  await expect(readFile(group, 'utf8')).rejects.toThrow()
  const first = (await restarted.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  await restarted.close()
  const again = await startOwnedRuntime(f.options); cleanup.push(again.close)
  expect((await again.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!.configVersion).toBe(first.configVersion)
  expect(await readFile(emotion, 'utf8')).toBe(promptSourceDefaults['prompts/emotion.md'])
})

it('routes independent owner calls to the attached desktop settings writer and keeps receipts after detach', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-application-attached-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const server = await startHeadlessServer({ dataPath: root, version: 'application-test', skillHome: root, engine: { run: async () => {}, test: async () => '' } })
  cleanup.push(server.close)
  const client = new CliRpcClient((await readLocalConnection(root)).url, await readLocalConnection(root))
  cleanup.push(async () => client.destroy()); await client.connect()
  const request = { operation: 'appearance.update', input: { patch: { mode: 'dark' }, expectedRevision: 0 }, requestId: 'attached-theme' }
  expect(await client.invoke('application:call', request)).toMatchObject({ status: 'rejected', error: { code: 'CAPABILITY_UNAVAILABLE' } })
  const appearance = new AppearanceStore(root, () => false, () => {}, () => ({ width: 1, height: 1 })); await appearance.init()
  const host = (await findAttachedRuntime(root, 'application-test', randomUUID()))!
  cleanup.push(() => host.detach())
  host.on('message', async message => {
    if (message.type === 'application-host') {
      try {
        const input = message.input as { patch: AppearancePatch; expectedRevision: number }
        const result = message.method === 'getAppearance' ? appearance.snapshot() : message.method === 'updateAppearance' ? await appearance.update(input.patch, input.expectedRevision) : undefined
        host.postMessage({ type: 'application-host-result', id: message.id, result })
      } catch (error) { host.postMessage({ type: 'application-host-result', id: message.id, error: String(error) }) }
    } else if (message.type === 'browser-host') host.postMessage({ type: 'browser-host-result', id: message.id })
  })
  await host.start()
  const result = await client.invoke('application:call', request)
  expect(result).toMatchObject({ status: 'succeeded', data: { preferences: { mode: 'dark' } } })
  expect(appearance.snapshot().revision).toBe(1)
  await host.detach()
  expect(await client.invoke('application:call', request)).toEqual(result)
  expect(await client.invoke('application:catalog', { operation: 'appearance.update' })).toMatchObject({ operations: [{ available: false }] })
  expect(appearance.snapshot().revision).toBe(1)
})
