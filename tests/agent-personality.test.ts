/*
 * [OUTPUT]: 实际工作区装配验证任务/问候叠加会话规则、独立关闭/修改hash与私有后台隔离。
 * [OUTPUT]: 仅笔记父版本可支撑真实情绪历史，来源删除后不可再用于反思。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 反思较早漏日/当日笔记与来源失效、十技能绑定；实际与撤回候选归架构§11.22。
 * [OUTPUT]: 新增旅行预算/最后一天/历史/清理/忘记与旧状态兼容检查。
 * [OUTPUT]: 全日70条保留、来源日追补/文件分日/外改保护、跨主聊天/旧回执去重与忘记屏障。
 * [INPUT]: Real ProductStore, workspace compiler and Mastra scheduler with isolated deterministic execution.
 * [OUTPUT]: Local-day growth quotas, detailed fatigue, stable sleep timing, feature gates, and scoped history cleanup across restart.
 * [POS]: Architecture verification; fixtures do not certify model personality quality.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import { AgentProfileService } from '../src/runtime/modules/employees/agent-profile-service'
import { AgentStateService, effectiveAgentState } from '../src/runtime/modules/agent-state/state-service'
import { clearAgentPersonality } from '../src/runtime/modules/agent-state/lifecycle'
import { AgentBehaviorService } from '../src/runtime/modules/automations/agent-behaviors'
import { NativeSchedules, BEHAVIOR_WORKFLOW } from '../src/runtime/modules/automations/native-schedules'
import { compileAgentContext } from '../src/runtime/modules/employees/context-compiler'
import { defaultAgentProfile, primaryPersonalityRoom, type AgentBehaviorRun, type AgentBehaviorDefinition } from '../src/shared/domain/agent-profile'
import { PERSONALITY_HEARTBEAT, personalityBehavior, personalityDue, reflectionRooms } from '../src/runtime/modules/automations/personality-policy'
import { reflectionContext } from '../src/runtime/modules/agent-state/reflection-context'
import { promptSourceDefaults } from '../src/shared/domain/agent-prompts'
import { BOBO_ALMA_SOUL } from '../src/shared/domain/bobo-persona'
import type { Conversation, DigitalAgent } from '../src/shared/domain'
const disposals: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of disposals.splice(0).reverse()) await close(); vi.useRealTimers() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-personality-')); disposals.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); disposals.push(() => store.close())
  const agent: DigitalAgent = { id: 'bobo', systemRole: 'core', name: 'bobo', role: '核心员工', instructions: '工作规则', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: true, executionPermission: 'full-access', active: true, configVersion: 1 }
  const room: Conversation = { id: 'room', mainPrivate: true, kind: 'direct', title: '聊天', agentIds: [agent.id], mode: 'natural', sharedKnowledgeIds: [], workspacePath: join(root, 'workspaces/room'), createdAt: '', updatedAt: '' }
  await store.write([{ collection: 'agents', id: agent.id, value: agent }, ...[room, { ...room, id: 'other', mainPrivate: false }].map(value => ({ collection: 'conversations', id: value.id, value })), { collection: 'messages', id: 'm1', value: { id: 'm1', conversationId: room.id, status: 'completed', senderType: 'user', createdAt: new Date().toISOString(), content: '我们喜欢具体的例子。' } }])
  return { root, store, agent, room, profiles: new AgentProfileService(store), states: new AgentStateService(store) }
}
const behavior = (patch: Partial<AgentBehaviorDefinition> = {}): AgentBehaviorDefinition => ({ id: 'check-in', kind: 'greeting', enabled: true, cron: '0 9 * * *', timezone: 'Asia/Shanghai', conversationId: 'room', instruction: '按原约定跟进', cooldownMinutes: 60, applicationAccess: 'none', maxModelCalls: 4, ...patch })
const config = () => { const { agentId: _id, revision: _revision, updatedAt: _time, ...value } = defaultAgentProfile('bobo', true); return value }

it('records source-backed emotion transitions atomically and clears them with any original chat', async () => {
  const f = await fixture(), at = new Date(2026, 9, 20, 12).getTime()
  const change = { action: 'emotion', emotion: { mood: 'curious', valence: 7, energy: 6, reason: '聊到了具体的例子。' } }
  const input = { agentId: 'bobo', expectedRevision: 0, change }
  await expect(f.states.update(input, at, 'room', { sourceMessageIds: ['missing'] })).rejects.toThrow('来源已失效')
  expect((await f.states.view('bobo')).base.revision).toBe(0)
  expect(await f.states.emotionHistory('bobo')).toEqual([])
  await f.states.update(input, at, 'room', { sourceMessageIds: ['m1', 'm1'] })
  const history = await f.states.emotionHistory('bobo')
  expect(history).toMatchObject([{ stateRevision: 1, sourceMessageIds: ['m1'], sourceConversationIds: ['room'], emotion: { updatedAt: new Date(at).toISOString(), mood: 'curious' } }])
  await expect(f.states.update(input, at + 1000, 'room', { sourceMessageIds: ['m1'] })).rejects.toThrow('已变化')
  expect(await f.states.emotionHistory('bobo')).toEqual(history)
  // An administrative edit without evidence cannot manufacture a historical observation.
  await f.states.update({ ...input, expectedRevision: 1 }, at + 2000)
  expect(await f.states.emotionHistory('bobo')).toEqual(history)
  await f.store.write([{ collection: 'memoryForgets', id: 'forgot', value: { id: 'forgot', ownerAgentId: 'bobo', sourceMessageIds: ['m1'], sourceMemoryIds: [] } }])
  await expect(f.states.update({ ...input, expectedRevision: 2 }, at + 3000, 'room', { sourceMessageIds: ['m1'] })).rejects.toThrow('被忘记')
  expect((await f.states.view('bobo')).base.revision).toBe(2)
  await f.store.transaction(tx => clearAgentPersonality(tx, { conversationId: 'room' }))
  expect(await f.states.emotionHistory('bobo')).toEqual([])
})

it('selects recorded emotion times with current source restrictions, parent versions and forget barriers', async () => {
  const f = await fixture(), at = new Date(2026, 9, 20, 12).toISOString()
  const parent = { id: 'parent', ownerAgentId: 'bobo', scope: 'employee', useScope: 'employee', content: '较早的依据', sourceMessageIds: ['older'], sourceResourceIds: [], sourceConversationIds: ['room'], origin: 'user', version: 2, status: 'active', createdAt: '2026-10-18T00:00:00Z', updatedAt: at } as import('../src/shared/domain').MemoryEntry
  const event = { id: 'event', agentId: 'bobo', stateId: 'state', stateRevision: 1, conversationId: 'other', sourceConversationIds: ['other'], sourceMessageIds: ['current'], sourceMemories: [{ id: 'parent', version: 2 }], emotion: { mood: 'curious', valence: 7, energy: 6, reason: '一个例子让我好奇', updatedAt: at } }
  const other = { ...f.room, id: 'other' }
  const input = { day: '2026-10-20', rooms: [f.room, other], messages: [], entries: [parent], emotions: [event], access: { agentId: 'bobo', conversationId: 'room', sourceAllowed: () => true, conversationRestricted: () => false }, forgotten: new Set<string>(), provenance: () => ({ memories: [], messageIds: [], resourceIds: [], conversationIds: [] }) }
  const selected = reflectionContext(input)
  expect(selected.emotions).toEqual([event])
  expect(selected.supportMessageIds).toEqual(['current', 'older'])
  expect(selected.supportConversationIds).toEqual(['other', 'room'])
  expect(selected.versions).toEqual([{ id: 'parent', version: 2 }])
  const noteOnly = { ...input, entries: [{ ...parent, sourceMessageIds: [] }], emotions: [{ ...event, sourceMessageIds: [] }] }
  expect(reflectionContext(noteOnly).emotions).toHaveLength(1)
  expect(reflectionContext({ ...noteOnly, entries: [{ ...noteOnly.entries[0], status: 'deleted' }] }).emotions).toEqual([])
  expect(reflectionContext({ ...input, day: '2026-10-19' }).emotions).toEqual([])
  expect(reflectionContext({ ...input, forgotten: new Set(['older']) }).emotions).toEqual([])
  expect(reflectionContext({ ...input, entries: [{ ...parent, version: 3 }] }).emotions).toEqual([])
  expect(reflectionContext({ ...input, rooms: [f.room, { ...other, memoryScope: 'conversation' }] }).emotions).toEqual([])
  expect(reflectionContext({ ...input, access: { ...input.access, sourceAllowed: () => false } }).emotions).toEqual([])
  expect(reflectionContext({ ...input, entries: [parent, { ...parent, id: 'restricted-source', sourceMessageIds: ['current'], useScope: 'conversation', conversationId: 'other' }] }).emotions).toEqual([])
})

it('persists virtual travel days, budget, mood and final diary atomically, keeps history and clears source-derived trips', async () => {
  const f = await fixture(), at = new Date(2026, 9, 20, 12).getTime()
  await f.states.update({ agentId: 'bobo', expectedRevision: 0, change: { action: 'travel-start', destination: '京都', budget: 120, mood: 'curious' } }, at, 'room')
  await expect(f.states.update({ agentId: 'bobo', expectedRevision: 0, change: { action: 'travel-return' } }, at)).rejects.toThrow('已变化')
  await expect(f.states.update({ agentId: 'bobo', expectedRevision: 1, change: { action: 'travel-advance', text: '无效花费', spend: 121 } }, at)).rejects.toThrow('超过')
  expect((await f.states.view('bobo')).base.travel?.day).toBe(1)
  await f.states.update({ agentId: 'bobo', expectedRevision: 1, change: { action: 'travel-advance', text: '想象雨中的散步', spend: 30, mood: 'content', journal: { text: '虚拟游记，没有查实时天气。', sources: [] } } }, at + 86400000, 'room')
  let view = await f.states.view('bobo')
  expect(view.base.travel).toMatchObject({ day: 2, budget: 90, active: false, mood: 'content', journals: [{ date: '2026-10-21', text: '虚拟游记，没有查实时天气。' }] })
  expect(view.base.travelHistory).toHaveLength(1)
  expect((await f.states.view('bobo', 'other')).base.travel?.journals).toEqual([])
  expect((await f.states.view('bobo', 'other')).base.travelHistory).toEqual([])
  await f.states.update({ agentId: 'bobo', expectedRevision: view.base.revision, change: { action: 'travel-start', destination: '大阪' } }, at + 86400000 * 2, 'other')
  view = await f.states.view('bobo')
  expect(view.base.travelHistory).toHaveLength(1)
  await f.store.transaction(tx => clearAgentPersonality(tx, { conversationId: 'room' }))
  view = await f.states.view('bobo')
  expect(view.base.travel?.destination).toBe('大阪'); expect(view.base.travelHistory).toEqual([])
  await f.store.transaction(tx => clearAgentPersonality(tx, { conversationId: 'other' }))
  expect((await f.states.view('bobo')).base.travel).toBeUndefined()
})

it('accepts legacy travel state and returns at day seven with the last event preserved', async () => {
  const f = await fixture(), base = (await f.states.view('bobo')).base
  await f.store.write([{ collection: 'agentPersonalityStates', id: base.id, value: { ...base, travel: { destination: '京都', day: 6, active: true, startedAt: '2026-10-14T04:00:00.000Z', events: [] } } }])
  const value = await f.states.update({ agentId: 'bobo', expectedRevision: 0, change: { action: 'travel-advance', text: '虚拟旅程最后一天', journal: { text: '准备回家', sources: [] } } })
  expect(value.travel).toMatchObject({ day: 7, active: false, budget: 1000, events: [{ text: '虚拟旅程最后一天' }] })
  expect(value.travelHistory?.[0].journals?.[0].text).toBe('准备回家')
})

it('stops returning trips derived from forgotten messages and permits a fresh trip without reviving them', async () => {
  const f = await fixture(), at = new Date(2026, 9, 20, 12).getTime()
  await f.states.update({ agentId: 'bobo', expectedRevision: 0, change: { action: 'travel-start', destination: '来源相关地点' } }, at, 'room', { sourceMessageIds: ['m1'] })
  await f.store.write([{ collection: 'memoryForgets', id: 'forget', value: { id: 'forget', ownerAgentId: 'bobo', sourceMessageIds: ['m1'], sourceMemoryIds: [] } }])
  const forgotten = (await f.states.view('bobo')).base
  expect(forgotten.travel).toBeUndefined()
  const next = await f.states.update({ agentId: 'bobo', expectedRevision: forgotten.revision, change: { action: 'travel-start', destination: '新地点' } }, at + 86400000)
  expect(next.travel?.destination).toBe('新地点'); expect(next.travelHistory).toEqual([])
})

it('projects catch-up diaries alongside that day notes and preserves externally edited views', async () => {
  const f = await fixture(), homes = new WorkspaceService(f.root)
  await homes.initialize(f.agent)
  const note: import('../src/shared/domain').MemoryEntry = { id: 'note', ownerAgentId: f.agent.id, scope: 'employee', content: '当日笔记', sourceMessageIds: [], sourceResourceIds: [], origin: 'user', version: 1, createdAt: new Date(2026, 9, 19, 8).toISOString(), updatedAt: new Date(2026, 9, 19, 8).toISOString(), useScope: 'employee', status: 'active' }
  const diary = { ...note, id: 'diary', content: '昨天的反思正文', origin: 'model' as const, createdAt: new Date(2026, 9, 20, 12).toISOString(), diary: { date: '2026-10-19', behaviorRunId: 'day-reflection' } }
  const today = { ...note, id: 'today', content: '次日笔记', createdAt: new Date(2026, 9, 20, 8).toISOString() }
  const memory = { namespace: 'employee:bobo', epoch: 1, entries: [today, diary, note] }
  await homes.regenerate(f.agent, memory)
  const before = await homes.read(f.agent, 'memory/2026-10-19.md')
  expect(before.content).toContain('昨天的反思正文'); expect(before.content).toContain('当日笔记'); expect(before.content).not.toContain('次日笔记')
  expect((await homes.read(f.agent, 'memory/2026-10-20.md')).content).not.toContain('昨天的反思正文')
  await homes.regenerate(f.agent, { ...memory, epoch: 2, entries: [today, note] })
  expect((await homes.read(f.agent, 'memory/2026-10-19.md')).content).not.toContain('昨天的反思正文')
  await writeFile(before.path, '用户外部修改')
  await homes.regenerate(f.agent, { ...memory, epoch: 3, entries: [] })
  expect(await homes.read(f.agent, 'memory/2026-10-19.md')).toMatchObject({ status: 'modified', content: '用户外部修改' })
})

it('keeps every authorized message of the source day and does not replay it after changing the primary chat', async () => {
  const f = await fixture(), day = new Date(2026, 9, 19, 9).getTime()
  const group = { ...f.room, id: 'group', kind: 'group' as const, mainPrivate: false }
  const rooms = reflectionRooms('bobo', f.room, [f.room, group, { ...group, id: 'restricted', memoryScope: 'conversation' }, { ...group, id: 'foreign', agentIds: ['peer'] }])
  expect(rooms.map(room => room.id)).toEqual(['room', 'group'])
  const messages = Array.from({ length: 70 }, (_, index) => ({ id: `day-${index}`, conversationId: index % 2 ? 'group' : 'room', sequence: index, senderType: 'user', status: 'completed', createdAt: new Date(day + index * 60_000).toISOString(), content: `当日内容${index}` })) as import('../src/shared/domain').Message[]
  const selected = reflectionContext({ day: '2026-10-19', rooms, messages, entries: [], access: { agentId: 'bobo', conversationId: 'room', sourceAllowed: () => true, conversationRestricted: () => false }, forgotten: new Set(['day-4']), provenance: () => ({ memories: [], messageIds: [], resourceIds: [], conversationIds: [] }) })
  expect(selected.messages).toHaveLength(69)
  expect(selected.messages[0].id).toBe('day-0')
  expect(selected.messages.at(-1)?.id).toBe('day-69')
  const reflection = behavior({ id: 'builtin-reflection', kind: 'reflection' })
  const profile = defaultAgentProfile('bobo', true)
  const due = personalityDue(profile, reflection, messages, [], undefined, new Date(2026, 9, 20, 12).getTime())!
  expect(due.reflectionDay).toBe('2026-10-19')
  const prior = { ...due, kind: 'reflection', behaviorId: reflection.id, conversationId: 'old-primary', status: 'interrupted' } as AgentBehaviorRun
  expect(personalityDue(profile, reflection, messages, [prior], undefined, new Date(2026, 9, 21, 12).getTime())).toBeUndefined()
  const legacy = { ...prior, reflectionDay: undefined, sourceMessageId: 'day-0', periodKey: '2026-10-20' }
  expect(personalityDue(profile, reflection, messages, [legacy], undefined, new Date(2026, 9, 21, 12).getTime())).toBeUndefined()
})

it('continues through older missed source days without replaying failed or already written diaries', async () => {
  const f = await fixture(), profile = defaultAgentProfile('bobo', true), reflection = behavior({ id: 'builtin-reflection', kind: 'reflection' })
  const messages = [16, 17, 18, 19, 20].map(day => ({ id: `day-${day}`, conversationId: f.room.id, status: 'completed', senderType: 'user', createdAt: new Date(2026, 9, day, 9).toISOString() })) as import('../src/shared/domain').Message[]
  const attempted = [{ behaviorId: 'builtin-reflection', sourceMessageId: 'day-19', reflectionDay: '2026-10-19', status: 'failed' }] as AgentBehaviorRun[]
  const at = new Date(2026, 9, 20, 12).getTime()
  const next = personalityDue(profile, reflection, messages, attempted, undefined, at, ['2026-10-18'])!
  expect(next).toMatchObject({ sourceMessageId: 'day-17', reflectionDay: '2026-10-17' })
  attempted.push({ ...next, behaviorId: reflection.id, status: 'interrupted' } as AgentBehaviorRun)
  expect(personalityDue(profile, reflection, messages, attempted, undefined, at, ['2026-10-18'])).toMatchObject({ reflectionDay: '2026-10-16' })
  expect(personalityDue(profile, reflection, messages, attempted, undefined, new Date(2026, 9, 20, 23).getTime(), ['2026-10-18'])).toMatchObject({ reflectionDay: '2026-10-20' })
  expect(personalityDue(profile, reflection, messages, attempted, undefined, new Date(2026, 9, 20, 8).getTime(), ['2026-10-18'])).toBeUndefined()
})

it('admits an older missed day through actual storage and keeps existing diary and attempt guards after restart', async () => {
  const f = await fixture()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 20, 12))
  const profile = config()
  await f.profiles.save({ agentId: 'bobo', expectedRevision: 0, config: { ...profile, features: { ...profile.features, growth: true } } })
  await f.store.write([18, 19].map(day => ({ collection: 'messages', id: day === 19 ? 'm1' : 'm2', value: { id: day === 19 ? 'm1' : 'm2', conversationId: 'room', senderType: 'user', status: 'completed', createdAt: new Date(2026, 9, day, 12).toISOString(), content: `第${day}天交流` } })))
  await f.store.write([{ collection: 'memory', id: 'existing-diary', value: { id: 'existing-diary', ownerAgentId: 'bobo', diary: { date: '2026-10-19', behaviorRunId: 'legacy-diary-without-receipt' } } }])
  const days: string[] = [], hooks = { available: () => true, execute: async (run: AgentBehaviorRun) => { days.push(run.reflectionDay!); return 'skip' }, changed() {} }
  const service = new AgentBehaviorService(f.store, hooks); await service.init(); disposals.push(() => service.close())
  const run = await service.run('bobo', 'builtin-reflection', 'catchup-one')
  expect(run?.reflectionDay).toBe('2026-10-18')
  await expect.poll(async () => (await service.list('bobo')).find(item => item.id === run?.id)?.status).toBe('skipped')
  await service.close()
  const restarted = new AgentBehaviorService(f.store, hooks); await restarted.init(); disposals.push(() => restarted.close())
  await restarted.run('bobo', 'builtin-reflection', 'catchup-one')
  expect(await restarted.run('bobo', 'builtin-reflection', 'catchup-two')).toBeUndefined()
  expect(days).toEqual(['2026-10-18'])
})

it('includes only actual dated notes with all authorized parent versions and keeps their original dates', async () => {
  const f = await fixture(), at = new Date(2026, 9, 19, 12).toISOString()
  const parent = { id: 'parent', ownerAgentId: 'bobo', scope: 'employee', useScope: 'employee', content: '原笔记', sourceMessageIds: ['older-source'], sourceResourceIds: [], sourceConversationIds: ['room'], origin: 'user', version: 2, status: 'active', createdAt: new Date(2026, 9, 18, 9).toISOString(), updatedAt: at } as import('../src/shared/domain').MemoryEntry
  const note = { ...parent, id: 'note', sourceMemoryIds: ['parent'], createdAt: at, content: '今天整理的旧笔记', version: 1 }
  const restricted = { ...note, id: 'restricted', conversationId: 'other', sourceConversationIds: ['other'], useScope: 'conversation' as const }
  const expired = { ...note, id: 'expired', expiresAt: '2000-01-01T00:00:00Z' }
  const cyclic = { ...note, id: 'cycle', sourceMemoryIds: ['cycle'] }
  const input = { day: '2026-10-19', rooms: [f.room], messages: [], entries: [parent, note, restricted, expired, cyclic], access: { agentId: 'bobo', conversationId: 'room', sourceAllowed: () => true, conversationRestricted: () => false }, forgotten: new Set<string>(), provenance: () => ({ memories: [], messageIds: [], resourceIds: [], conversationIds: [] }) }
  const selected = reflectionContext(input)
  expect(selected.notes.map(entry => entry.id)).toEqual(['note'])
  expect(selected.notes[0].createdAt).toBe(at)
  expect(selected.versions).toEqual(expect.arrayContaining([{ id: 'parent', version: 2 }, { id: 'note', version: 1 }]))
  expect(selected.supportMessageIds).toEqual(['older-source'])
  expect(selected.supportConversationIds).toEqual(['room'])
  expect(reflectionContext({ ...input, forgotten: new Set(['older-source']) }).notes).toEqual([])
  expect(reflectionContext({ ...input, entries: [note] }).notes).toEqual([])
})

it('deletes activity payloads while retaining event and freshness guards across restart', async () => {
  const f = await fixture(); let calls = 0
  const hooks = { available: () => true, execute: async () => { calls++; return 'private-result' }, changed() {} }
  const service = new AgentBehaviorService(f.store, hooks); await service.init(); disposals.push(() => service.close())
  const state = await f.states.view('bobo'), messages = await f.store.load('messages')
  const admitted = (await service.run('bobo', 'builtin-emotion', 'delete-event'))!
  await expect.poll(async () => (await service.list('bobo'))[0]?.status).toBe('completed')
  expect(await service.deleteHistory({ agentId: 'bobo', runId: admitted.id })).toEqual({ agentId: 'bobo', deletedCount: 1 })
  expect(await service.list('bobo')).toEqual([])
  expect(await service.deleteHistory({ agentId: 'bobo', runId: admitted.id })).toMatchObject({ deletedCount: 0 })
  const tombstone = await f.store.get<AgentBehaviorRun>('agentBehaviorRuns', admitted.id)
  expect(tombstone).toMatchObject({ deletedAt: expect.any(String), sourceMessageId: 'm1', status: 'completed' })
  for (const key of ['result', 'error', 'promptEvidence', 'usage', 'modelCalls']) expect(tombstone).not.toHaveProperty(key)
  await service.close()
  const restarted = new AgentBehaviorService(f.store, hooks); await restarted.init(); disposals.push(() => restarted.close())
  expect(await restarted.run('bobo', 'builtin-emotion', 'delete-event')).toBeUndefined()
  expect(await restarted.run('bobo', 'builtin-emotion', 'another-event')).toBeUndefined()
  expect(calls).toBe(1)
  expect((await f.states.view('bobo')).base).toEqual(state.base)
  expect(await f.store.load('messages')).toEqual(messages)
})

it('clears every older page for one employee, retains running/new records and strips payloads', async () => {
  const f = await fixture(), service = new AgentBehaviorService(f.store, { available: () => true, execute: async () => '', changed() {} })
  disposals.push(() => service.close())
  const before = new Date(Date.now() - 10_000).toISOString(), old = new Date(Date.now() - 20_000).toISOString()
  const record: AgentBehaviorRun = { id: 'old', agentId: 'bobo', behaviorId: 'builtin-greeting', kind: 'greeting', conversationId: 'room', profileRevision: 0, eventId: 'event', scheduledAt: old, startedAt: old, finishedAt: old, status: 'completed', result: 'private-result', error: 'private-error', usage: { inputTokens: 1, outputTokens: 2 }, modelCalls: 1, sourceMessageId: 'm1', periodKey: 'day', promptEvidence: { profileRevision: 0, preset: 'bobo-core', scene: 'greeting', modules: [], skipped: [], staticHash: '', capabilityHash: '', stateHash: '', stateRevision: 0 } }
  const records = [...Array.from({ length: 105 }, (_, i) => ({ ...record, id: `old-${i}` })), { ...record, id: 'running', status: 'running' as const, finishedAt: undefined }, { ...record, id: 'new', finishedAt: new Date().toISOString() }, { ...record, id: 'peer', agentId: 'peer' }]
  await f.store.write(records.map(value => ({ collection: 'agentBehaviorRuns', id: value.id, value })))
  expect(await service.list('bobo')).toHaveLength(100)
  await expect(service.deleteHistory({ agentId: 'bobo', runId: 'running' })).rejects.toThrow('仍在运行')
  await expect(service.deleteHistory({ agentId: 'bobo', runId: 'peer' })).rejects.toThrow('不属于')
  expect(await service.clearHistory({ agentId: 'bobo', before })).toEqual({ agentId: 'bobo', deletedCount: 105 })
  expect((await service.list('bobo')).map(run => run.id).sort()).toEqual(['new', 'running'])
  expect(await service.list('peer')).toHaveLength(1)
  const tombstone = await f.store.get<AgentBehaviorRun>('agentBehaviorRuns', 'old-0')
  expect(tombstone).toMatchObject({ sourceMessageId: 'm1', periodKey: 'day', deletedAt: expect.any(String) })
  for (const key of ['result', 'error', 'promptEvidence', 'usage', 'modelCalls']) expect(tombstone).not.toHaveProperty(key)
  expect(await service.clearHistory({ agentId: 'bobo', before })).toMatchObject({ deletedCount: 0 })
})

it('keeps independent profile CAS and validates target identity without modifying the employee', async () => {
  const f = await fixture(), defaults = await f.profiles.get('bobo')
  expect(defaults.features).toEqual({ emotions: true, fatigue: true, growth: false, travel: false })
  const saved = await f.profiles.save({ agentId: 'bobo', expectedRevision: 0, config: config() })
  expect(saved.revision).toBe(1)
  await expect(f.profiles.save({ agentId: 'bobo', expectedRevision: 0, config: config() })).rejects.toThrow('已变更')
  await expect(f.profiles.save({ agentId: 'bobo', expectedRevision: 1, config: { ...config(), behaviors: [behavior({ conversationId: 'missing' })] } })).rejects.toThrow('已退役')
  await expect(f.profiles.save({ agentId: 'bobo', expectedRevision: 1, config: { ...config(), proactive: { ...config().proactive, quietStart: 24 } } })).rejects.toThrow()
  expect(await f.store.get('agents', 'bobo')).toEqual(f.agent)
  await f.store.write([{ collection: 'agents', id: 'peer', value: { ...f.agent, id: 'peer', systemRole: undefined } }])
  await expect(f.profiles.save({ agentId: 'peer', expectedRevision: 0, config: { ...config(), preset: 'bobo-core' } })).rejects.toThrow('真实员工身份')
})

it('loads large independent source modules, preserves custom files, and selects only the current scene', async () => {
  const f = await fixture(), homes = new WorkspaceService(f.root)
  await homes.initialize(f.agent)
  const custom = '你有自己的判断。'.repeat(1200)
  await homes.save(f.agent, 'SOUL.md', custom, (await homes.read(f.agent, 'SOUL.md')).hash)
  await homes.initialize(f.agent)
  await homes.save(f.agent, 'prompts/direct.md', '私聊专用', (await homes.read(f.agent, 'prompts/direct.md')).hash)
  await homes.initialize(f.agent)
  expect((await homes.read(f.agent, 'SOUL.md')).content).toBe(custom)
  const loaded = await homes.load(f.agent, f.room, { entries: [], epoch: 0, namespace: 'employee:bobo' }, 'run', { profile: defaultAgentProfile('bobo', true), state: await f.states.view('bobo', 'room'), scene: 'direct' })
  expect(loaded.bootstrap.instructions).toContain(custom)
  expect(loaded.bootstrap.instructions).toContain('私聊专用')
  expect(loaded.bootstrap.instructions).not.toContain('Analyze the authorized conversation')
  expect(loaded.bootstrap.promptEvidence?.modules.map(item => item.source)).toEqual(['AGENTS.md', 'SOUL.md', 'prompts/direct.md'])
  expect(loaded.bootstrap.promptEvidence?.modules.at(-1)?.sourceIds).toEqual([])
  await expect(homes.read(f.agent, '../private.txt')).rejects.toThrow('不允许')
  await rm((await homes.read(f.agent, 'prompts/direct.md')).path)
  await homes.initialize(f.agent)
  expect((await homes.read(f.agent, 'prompts/direct.md')).status).toBe('missing')
})

it('separates static persona/capability fingerprints from per-turn mood and disabled scenes', async () => {
  const f = await fixture(), profile = defaultAgentProfile('bobo', true), sources = { ...promptSourceDefaults, 'AGENTS.md': '规则', 'SOUL.md': BOBO_ALMA_SOUL }
  const first = compileAgentContext(profile, 'direct', sources, await f.states.view('bobo', 'room'))
  await f.states.update({ agentId: 'bobo', conversationId: 'room', expectedRevision: 0, change: { action: 'emotion', emotion: { mood: 'curious', valence: 8, energy: 7, reason: 'private-sentinel' } } })
  const next = compileAgentContext(profile, 'direct', sources, await f.states.view('bobo', 'room'))
  expect(next.evidence.staticHash).toBe(first.evidence.staticHash)
  expect(next.evidence.capabilityHash).toBe(first.evidence.capabilityHash)
  expect(next.evidence.stateHash).not.toBe(first.evidence.stateHash)
  expect(next.dynamicInstructions).not.toContain('private-sentinel')
  const disabled = compileAgentContext({ ...profile, disabledPrompts: ['direct'] }, 'direct', sources)
  expect(disabled.evidence.modules).toHaveLength(2)
  expect(disabled.evidence.skipped).toContainEqual({ id: 'direct', reason: 'disabled in profile' })
  expect(compileAgentContext(profile, 'emotion', sources).instructions).not.toContain('[employee.rules]')
})

it('persists state with CAS, deduplicates fatigue, isolates context and honors forgotten growth sources', async () => {
  const f = await fixture(), at = Date.parse('2026-10-19T12:00:00Z')
  await f.states.recordMessage('bobo', 'room', 'm1', at)
  await f.states.recordMessage('bobo', 'room', 'm1', at)
  expect((await f.states.view('bobo', 'room', at)).base.fatigue?.messageCount).toBe(1)
  await f.states.update({ agentId: 'bobo', conversationId: 'room', expectedRevision: 0, change: { action: 'emotion', emotion: { mood: 'annoyed', valence: 2, energy: 4, reason: 'private' } } }, at)
  expect((await f.states.view('bobo', 'other', at)).effective.mood).toBe('cheerful')
  expect((await f.states.view('bobo', 'room', at + 3 * 3600_000)).effective.mood).toBe('cheerful')
  await expect(f.states.update({ agentId: 'bobo', conversationId: 'room', expectedRevision: 0, change: { action: 'reset' } })).rejects.toThrow('已变化')
  await f.states.addTrait('bobo', 'room', ['m1'], '更喜欢用具体例子解释。', at)
  expect((await new AgentStateService(f.store).view('bobo', 'room', at)).base.traits).toHaveLength(1)
  expect((await f.states.view('bobo', 'other', at)).base.traits).toEqual([])
  await f.store.write([{ collection: 'memoryForgets', id: 'forgot', value: { id: 'forgot', ownerAgentId: 'bobo', sourceMessageIds: ['m1'], sourceMemoryIds: [] } }])
  expect((await f.states.view('bobo', 'room', at)).base.traits).toEqual([])
  await expect(f.states.addTrait('bobo', 'room', ['m1'], '不应再次使用', at)).rejects.toThrow('忘记')
  let view = await f.states.view('bobo', undefined, at)
  await f.states.update({ agentId: 'bobo', expectedRevision: view.base.revision, change: { action: 'travel-start', destination: '京都' } }, at)
  view = await f.states.view('bobo', undefined, at)
  await f.states.update({ agentId: 'bobo', expectedRevision: view.base.revision, change: { action: 'travel-advance', text: '虚拟游记' } }, at)
  expect((await f.states.view('bobo')).base.travel?.day).toBe(2)
})

it('limits growth by local date and retains the latest fifteen distinct traits', async () => {
  const f = await fixture()
  await f.states.addTrait('bobo', 'room', ['m1'], '当天第一条', new Date(2026, 9, 19, 1).getTime())
  await f.states.addTrait('bobo', 'room', ['m1'], '同一天不能再加', new Date(2026, 9, 19, 23).getTime())
  expect((await f.states.view('bobo', 'room')).base.traits?.map(item => item.text)).toEqual(['当天第一条'])
  for (let day = 20; day < 36; day++) await f.states.addTrait('bobo', 'room', ['m1'], `第${day}天的变化`, new Date(2026, 9, day, 1).getTime())
  const traits = (await f.states.view('bobo', 'room')).base.traits!
  expect(traits).toHaveLength(15)
  expect(traits[0].text).toBe('第21天的变化')
  expect(traits.at(-1)?.text).toBe('第35天的变化')
})

it('registers one built-in heartbeat without manual plans, retires old schedules and deduplicates unchanged input', async () => {
  const f = await fixture(); let calls = 0
  const service = new AgentBehaviorService(f.store, { available: () => true, execute: async () => { calls++; return 'updated' }, changed() {} }); await service.init(); disposals.push(() => service.close())
  const native = new NativeSchedules(join(f.root, 'clock.sqlite'), async () => {}, (input, event, at) => service.dispatch(input, event, at)); await native.init(); disposals.push(() => native.close())
  const legacy = await native.mastra.schedules.create({ id: 'legacy-schedule', workflowId: BEHAVIOR_WORKFLOW, cron: '0 9 * * *', timezone: 'UTC', inputData: {}, status: 'active' })
  await service.synchronize(native)
  const schedules = await native.mastra.schedules.list({ workflowId: BEHAVIOR_WORKFLOW })
  expect(schedules.filter(row => row.status === 'active')).toHaveLength(1)
  expect(schedules.find(row => row.id === legacy.id)?.status).toBe('paused')
  const heartbeat = schedules.find(row => row.status === 'active')!
  const input = (heartbeat as unknown as { inputData: Parameters<typeof service.dispatch>[0] }).inputData
  expect(input.behaviorId).toBe(PERSONALITY_HEARTBEAT)
  await service.dispatch(input, 'clock-event', Date.now())
  await expect.poll(() => service.busy).toBe(false)
  expect(calls).toBe(1)
  await service.dispatch(input, 'clock-event', Date.now())
  await service.dispatch(input, 'next-clock-event', Date.now())
  expect(calls).toBe(1)
  expect((await service.list('bobo'))[0]).toMatchObject({ kind: 'emotion', sourceMessageId: 'm1', status: 'completed' })
  await f.profiles.save({ agentId: 'bobo', expectedRevision: 0, config: { ...config(), features: { emotions: false, fatigue: true, growth: false, travel: false } } })
  await service.synchronize(native)
  expect((await native.mastra.schedules.list({ workflowId: BEHAVIOR_WORKFLOW })).every(row => row.status === 'paused')).toBe(true)
  expect(await service.run('bobo', 'builtin-emotion', 'disabled')).toBeUndefined()
})

it('interrupts old runs without replay and refuses late result resurrection after history cleanup', async () => {
  const f = await fixture(); await f.profiles.save({ agentId: 'bobo', expectedRevision: 0, config: config() })
  const stale: AgentBehaviorRun = { id: 'old', agentId: 'bobo', behaviorId: 'check-in', profileRevision: 1, conversationId: 'room', eventId: 'old', scheduledAt: '', startedAt: '', status: 'running' }
  await f.store.write([{ collection: 'agentBehaviorRuns', id: stale.id, value: stale }])
  let release!: () => void, started = false
  const service = new AgentBehaviorService(f.store, { available: () => true, execute: async () => { started = true; await new Promise<void>(resolve => { release = resolve }); return 'private-result' }, changed() {} }); await service.init(); disposals.push(() => service.close())
  expect((await service.list('bobo'))[0].status).toBe('interrupted')
  const admitted = await service.run('bobo', 'builtin-emotion', 'manual:one')
  await expect.poll(() => started).toBe(true)
  expect(await service.run('bobo', 'builtin-emotion', 'manual:one')).toEqual(admitted)
  await f.store.transaction(async tx => { await clearAgentPersonality(tx, { conversationId: 'room' }); await tx.remove('messages', 'm1') })
  release()
  await expect.poll(() => service.busy).toBe(false)
  expect(await f.store.get('agentBehaviorRuns', admitted!.id)).toMatchObject({ status: 'cancelled' })
  expect(JSON.stringify(await service.list('bobo'))).not.toContain('private-result')
  expect(await service.run('bobo', 'builtin-emotion', 'after-clear')).toBeUndefined()
})

it('only addresses the main private chat and respects quiet hours, idle frequency and unanswered outreach', async () => {
  const f = await fixture(), at = new Date(2026, 9, 19, 12).getTime()
  const profile = { ...defaultAgentProfile('bobo', true), proactive: { enabled: true, frequency: 'normal' as const, quietStart: 22, quietEnd: 8 } }
  const rooms = [f.room, { ...f.room, id: 'group', mainPrivate: false, kind: 'group' as const }, { ...f.room, id: 'automation', mainPrivate: false, purpose: 'automation' as const }]
  expect(primaryPersonalityRoom('bobo', rooms)?.id).toBe('room')
  expect(primaryPersonalityRoom('bobo', [{ ...f.room, list: { hidden: true } }])).toBeUndefined()
  const greeting = personalityBehavior(profile, f.room, 'builtin-greeting')!
  const messages = [{ id: 'user', conversationId: 'room', senderType: 'user', status: 'completed', createdAt: new Date(at - 5 * 3600_000).toISOString() }] as import('../src/shared/domain').Message[]
  expect(personalityDue(profile, greeting, messages, [], undefined, at)?.sourceMessageId).toBe('user')
  expect(personalityDue(profile, greeting, messages, [], undefined, new Date(2026, 9, 19, 23).getTime())).toBeUndefined()
  expect(personalityDue(profile, greeting, [{ ...messages[0], createdAt: new Date(at - 60_000).toISOString() }], [], undefined, at)).toBeUndefined()
  const prior = { behaviorId: greeting.id, conversationId: 'room', sourceMessageId: 'user', status: 'completed', startedAt: new Date(at - 48 * 3600_000).toISOString() } as AgentBehaviorRun
  expect(personalityDue(profile, greeting, messages, [prior], undefined, at)).toBeUndefined()
  expect(personalityDue(profile, greeting, [{ ...messages[0], id: 'reply' }], [prior], undefined, at)).toBeDefined()
})

it('reflects at day end or catches up once, advances travel at most daily and preserves retired configuration', async () => {
  const f = await fixture(), at = new Date(2026, 9, 19, 23).getTime()
  const profile = { ...defaultAgentProfile('bobo', true), features: { emotions: true, fatigue: true, growth: true, travel: true }, behaviors: [behavior()] }
  await f.store.write([{ collection: 'agentProfiles', id: 'bobo', value: profile }])
  expect((await f.profiles.get('bobo')).behaviors).toEqual([behavior()])
  expect((await f.profiles.get('bobo')).proactive.enabled).toBe(false)
  const reflection = personalityBehavior(profile, f.room, 'builtin-reflection')!, travel = personalityBehavior(profile, f.room, 'builtin-travel')!
  const messages = [{ id: 'today', conversationId: 'room', senderType: 'user', status: 'completed', createdAt: new Date(2026, 9, 19, 12).toISOString() }] as import('../src/shared/domain').Message[]
  expect(personalityDue(profile, reflection, messages, [], undefined, new Date(2026, 9, 19, 20).getTime())).toBeUndefined()
  const due = personalityDue(profile, reflection, messages, [], undefined, at)!
  expect(due).toBeDefined()
  expect(personalityDue(profile, reflection, messages, [{ ...due, behaviorId: reflection.id, conversationId: 'room', status: 'interrupted' } as AgentBehaviorRun], undefined, at)).toBeUndefined()
  expect(personalityDue(profile, reflection, messages, [], undefined, new Date(2026, 9, 20, 12).getTime())).toBeDefined()
  const state: import('../src/shared/domain/agent-profile').AgentPersonalityState = { id: 'state', agentId: 'bobo', revision: 1, updatedAt: new Date(at).toISOString(), travel: { destination: '京都', active: true, day: 1, startedAt: new Date(at).toISOString(), events: [] } }
  expect(personalityDue(profile, travel, messages, [], state, at)).toBeUndefined()
  expect(personalityDue(profile, travel, messages, [], state, at + 24 * 3600_000)).toBeDefined()
  expect(personalityBehavior(profile, f.room, 'check-in')).toBeUndefined()
})

it('consumes a quiet heartbeat so a duplicate event cannot act on messages arriving later', async () => {
  const f = await fixture(); let calls = 0
  await f.store.transaction(tx => tx.remove('messages', 'm1'))
  const service = new AgentBehaviorService(f.store, { available: () => true, execute: async () => { calls++; return 'updated' }, changed() {} })
  await service.init(); disposals.push(() => service.close())
  expect(await service.run('bobo', PERSONALITY_HEARTBEAT, 'quiet-event')).toBeUndefined()
  expect(await service.list('bobo')).toEqual([])
  await f.store.write([{ collection: 'messages', id: 'new', value: { id: 'new', conversationId: 'room', senderType: 'user', status: 'completed', createdAt: new Date().toISOString(), content: '新话题' } }])
  expect(await service.run('bobo', PERSONALITY_HEARTBEAT, 'quiet-event')).toBeUndefined()
  expect(calls).toBe(0)
  await service.run('bobo', PERSONALITY_HEARTBEAT, 'new-event')
  await expect.poll(() => calls).toBe(1)
})


it('uses Alma fatigue stages and local time boosts without shortening actual work requirements', async () => {
  const f = await fixture(), profile = defaultAgentProfile('bobo', true)
  const at = new Date(2026, 9, 19, 16).getTime(), base = (await f.states.view('bobo')).base
  for (const [value, level] of [[0, 'awake'], [30, 'tired'], [50, 'sleepy'], [75, 'sleeping']] as const) {
    const state = { ...base, fatigue: { value, messageCount: 1, updatedAt: new Date(at).toISOString(), sleeping: false, awake: false } }
    const effective = effectiveAgentState(state, undefined, at)
    expect(effective).toMatchObject({ fatigue: value, fatigueLevel: level, sleeping: level === 'sleeping' })
    const compiled = compileAgentContext(profile, 'direct', { ...promptSourceDefaults, 'AGENTS.md': '规则', 'SOUL.md': BOBO_ALMA_SOUL }, { base: state, effective, observedAt: new Date(at).toISOString() })
    expect(JSON.parse(compiled.dynamicInstructions.split('\n').slice(1).join('\n')).find((item: { kind: string }) => item.kind === 'fatigue')).toMatchObject({ level, sourceIds: [expect.stringMatching(/^T-/)] })
    expect(compiled.dynamicInstructions).toContain('required depth')
  }
  for (const [hour, expected] of [[2, 30], [7, 15], [13, 8], [16, 0], [23, 15]]) {
    expect(effectiveAgentState(base, undefined, new Date(2026, 9, 19, hour).getTime()).fatigue).toBe(expected)
  }
  const off = compileAgentContext({ ...profile, features: { emotions: false, fatigue: false, growth: false, travel: false } }, 'direct', { ...promptSourceDefaults, 'AGENTS.md': '规则', 'SOUL.md': BOBO_ALMA_SOUL }, await f.states.view('bobo'))
  const offKinds = JSON.parse(off.dynamicInstructions.split('\n').slice(1).join('\n')).map((item: { kind: string }) => item.kind)
  for (const kind of ['emotion', 'fatigue', 'virtual-travel', 'evolved-traits']) expect(offKinds).not.toContain(kind)
  expect(offKinds).toContain('factual-continuity')
})

it('counts sleep from the actual sleep action and does not reset the clock on interruption', async () => {
  const f = await fixture(), start = new Date(2026, 9, 19, 10).getTime()
  const sleep = await f.states.update({ agentId: 'bobo', expectedRevision: 0, change: { action: 'sleep' } }, start)
  expect(sleep.fatigue?.sleepStartedAt).toBe(new Date(start).toISOString())
  await f.states.recordMessage('bobo', 'room', 'm1', start + 90 * 60_000)
  expect((await f.states.view('bobo', undefined, start + 119 * 60_000)).effective.sleeping).toBe(true)
  expect((await f.states.view('bobo', undefined, start + 121 * 60_000)).effective.sleeping).toBe(false)
  const state = (await f.states.view('bobo', undefined, start + 121 * 60_000)).base
  const awake = await f.states.update({ agentId: 'bobo', expectedRevision: state.revision, change: { action: 'wake' } }, start)
  const tired = { ...awake, fatigue: { ...awake.fatigue!, value: 100 } }
  expect(effectiveAgentState(tired, undefined, start).fatigueLevel).toBe('awake')
  const later = start + 121 * 60_000
  expect(effectiveAgentState({ ...tired, fatigue: { ...tired.fatigue, updatedAt: new Date(later).toISOString() } }, undefined, later).fatigueLevel).toBe('sleeping')
})

it.each([
  ['direct', false, 'task', ['direct', 'task']],
  ['group', false, 'task', ['group', 'task']],
  ['direct', true, 'task', ['direct', 'channel', 'task']],
  ['group', true, 'task', ['group', 'channel', 'task']],
  ['direct', false, 'greeting', ['direct', 'greeting']],
  ['group', true, 'channel', ['group', 'channel']],
] as const)('keeps actual %s/channel=%s communication rules during %s execution', async (kind, channel, scene, selected) => {
  const f = await fixture(), homes = new WorkspaceService(f.root)
  await homes.initialize(f.agent)
  const conversation: Conversation = { ...f.room, kind, ...(channel ? { channel: { platform: 'telegram', tenantId: 'tenant', chatId: 'external', kind } as const } : {}) }
  const loaded = await homes.load(f.agent, conversation, { entries: [], epoch: 0, namespace: 'employee:bobo' }, 'surface-run', { profile: defaultAgentProfile('bobo', true), scene })
  const evidence = loaded.bootstrap.promptEvidence!
  expect(evidence.scene).toBe(scene)
  expect(evidence.modules.map(item => item.id)).toEqual(['employee.rules', 'employee.personality', ...selected])
  expect(new Set(evidence.modules.map(item => item.id)).size).toBe(evidence.modules.length)
  for (const id of selected) {
    const name = `prompts/${id}.md`, source = await homes.read(f.agent, name)
    expect(loaded.bootstrap.instructions).toContain(source.content)
    expect(loaded.bootstrap.hashes[name]).toBe(source.hash)
  }
  if (kind === 'group') expect(loaded.bootstrap.instructions).not.toContain('PRIVATE CHAT FOCUS')
})

it('honors each communication/task source switch independently and fingerprints edited conversation rules', () => {
  const profile = defaultAgentProfile('bobo', true), sources = { ...promptSourceDefaults, 'AGENTS.md': 'Work rules', 'SOUL.md': 'Personality' }, conversation = { kind: 'direct' as const, channel: false }
  const compile = (disabledPrompts: typeof profile.disabledPrompts) => compileAgentContext({ ...profile, disabledPrompts }, 'task', sources, undefined, conversation)
  expect(compile(['direct']).evidence.modules.map(item => item.id)).toEqual(['employee.rules', 'employee.personality', 'task'])
  expect(compile(['task']).evidence.modules.map(item => item.id)).toEqual(['employee.rules', 'employee.personality', 'direct'])
  const both = compile(['direct', 'task'])
  expect(both.evidence.modules.map(item => item.id)).toEqual(['employee.rules', 'employee.personality'])
  expect(both.evidence.skipped.filter(item => item.reason === 'disabled in profile').map(item => item.id)).toEqual(['direct', 'task'])
  const custom = compileAgentContext(profile, 'task', { ...sources, 'prompts/direct.md': 'Custom conversation rule' }, undefined, conversation)
  expect(custom.instructions).toContain('Custom conversation rule')
  expect(custom.evidence.staticHash).not.toBe(compile([]).evidence.staticHash)
  expect(custom.evidence.modules.find(item => item.id === 'direct')?.sourceIds).toEqual([])
})

it.each(['emotion', 'reflection', 'travel'] as const)('keeps private %s output free of communication/task rules', scene => {
  const sources = { ...promptSourceDefaults, 'AGENTS.md': 'Work rules', 'SOUL.md': 'Personality' }
  const result = compileAgentContext(defaultAgentProfile('bobo', true), scene, sources, undefined, { kind: 'group', channel: true })
  expect(result.evidence.modules.map(item => item.id)).toEqual(['employee.personality', scene])
  expect(result.instructions).not.toContain('CHAT STYLE')
})
