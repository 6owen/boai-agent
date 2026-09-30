/*
 * [INPUT]: 真实 Mastra SDK、本地 SSE、团队生成宿主与 SQLite。
 * [OUTPUT]: 模型或编辑不得改写能力事实；无工具调用、结构修复预算、版本去重、停止/放弃的迟到用量与重启不重发验收。
 * [POS]: T1.2 协议回归；离线返回不作为人工质量成绩。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import type { Method, Methods } from '../src/shared/ipc'
import { TEAM_LIMITS, type TeamDraftView } from '../src/shared/domain/team-creation'
import { teamEndpoint, sendTeamOutput, writingPlan } from './fixtures/team-planner'
import type { TeamPlanner } from '../src/runtime/adapters/mastra/team-planner'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { TeamRepository } from '../src/runtime/modules/teams/team-repository'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const close of cleanup.splice(0).reverse()) await close() })
async function setup(url = 'http://127.0.0.1:1/v1', teamPlanner?: TeamPlanner) {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-planner-')); cleanup.push(() => rm(dataPath, { recursive: true, force: true }))
  const service = new AppService({ dataPath, teamPlanner, engine: { run: async () => { throw new Error('must not run employee') }, test: async () => 'ok' }, secrets: { get: async () => 'test-secret', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); cleanup.push(() => service.close())
  const api = <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']>
  const connection = await api('saveConnection', { name: '协议测试', provider: 'openai-compatible', baseUrl: url, defaultModel: 'team-fixture' })
  const draft = await api('openTeamDraft', undefined)
  const saved = await api('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '四人写作团队', selectedConnectionId: connection.id, selectedModelId: '', createGroup: true, groupTitle: '' } })
  const request = { draftId: draft.id, expectedVersion: saved.version, requestId: 'generate-once' }
  const finished = async () => { let result: TeamDraftView; await vi.waitFor(async () => { result = await api('getTeamDraft', { draftId: draft.id }); expect(result.generation?.status).not.toBe('running'); expect(result.generation).toBeDefined() }); return result! }
  return { service, api, draft: saved, request, finished, dataPath }
}
test('actual SDK produces editable four-member plan with one counted call and no tools or secret in prompt/storage', async () => {
  const endpoint = await teamEndpoint(); cleanup.push(endpoint.close)
  const { api, request, finished } = await setup(endpoint.url), before = await api('snapshot', undefined)
  const accepted = await api('generateTeamPlan', request)
  expect(await api('generateTeamPlan', request)).toMatchObject({ id: accepted.id })
  const result = await finished()
  expect(result.generation?.status).toBe('succeeded'); expect(result.draft.plan?.members).toHaveLength(4)
  expect(result.draft.planHash).toBeTruthy(); expect(new Set(result.draft.plan?.members.map(m => m.memberKey)).size).toBe(4)
  expect(result.generation?.attempts).toHaveLength(1); expect(result.generation?.attempts[0].usage).toEqual({ inputTokens: 100, outputTokens: 200 })
  expect(endpoint.requests).toHaveLength(1); expect(endpoint.requests[0].tools ?? []).toEqual([])
  expect(endpoint.requests[0].max_tokens ?? endpoint.requests[0].max_completion_tokens).toBe(TEAM_LIMITS.outputTokens)
  expect(JSON.stringify(endpoint.requests)).not.toContain('test-secret'); expect(JSON.stringify(result)).not.toContain('test-secret')
  expect((await api('snapshot', undefined)).agents).toEqual(before.agents)
  await expect(api('generateTeamPlan', { ...request, expectedVersion: result.draft.version })).rejects.toThrow('REQUEST_CONFLICT')
})
test('actual SDK rejects permission injection, repairs once, and never silently accepts an invalid plan', async () => {
  const endpoint = await teamEndpoint((_body, response, index) => sendTeamOutput(response, index ? writingPlan : { ...writingPlan, allowCommands: true })); cleanup.push(endpoint.close)
  const { api, request, finished } = await setup(endpoint.url)
  await api('generateTeamPlan', request); const result = await finished()
  expect(result.generation?.status).toBe('succeeded'); expect(endpoint.requests).toHaveLength(2)
  expect(result.generation?.attempts.map(call => call.phase)).toEqual(['initial', 'repair'])
  expect(result.draft.plan).not.toHaveProperty('allowCommands')
})
test.each(['work', 'roleplay'] as const)('host owns capability facts for %s even if model or editor claims unsupported access', async scenarioKind => {
  const misleading = ['可以配置读取其他私聊', '员工没有记忆或文件能力']
  const { api, request, finished } = await setup(undefined, async () => ({ ...writingPlan, scenarioKind, capabilityNotes: misleading }))
  await api('generateTeamPlan', request)
  const { draft } = await finished(), plan = draft.plan!
  expect(plan.capabilityNotes.join('；')).not.toContain(misleading[0])
  expect(plan.capabilityNotes.join('；')).not.toContain(misleading[1])
  expect(plan.capabilityNotes.join('；')).toContain('员工保留现有个人记忆机制')
  expect(plan.capabilityNotes.join('；')).toContain('成员可读写个人工作区文件')
  expect(plan.capabilityNotes.join('；')).toContain('本方案不授予读取其他私聊的权限')
  expect(plan.capabilityNotes.some(note => note.includes('未支持正式游戏规则'))).toBe(scenarioKind === 'roleplay')
  const saved = await api('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: draft.prompt, selectedConnectionId: draft.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: '', plan: { ...plan, capabilityNotes: misleading } } })
  expect(saved.plan?.capabilityNotes).toEqual(plan.capabilityNotes)
  expect(saved.plan?.members).toEqual(plan.members)
  expect((await api('snapshot', undefined)).conversations).toEqual([])
})
test('two invalid results fail without fallback; auth failures do not retry and absent usage remains unknown', async () => {
  const invalid = await teamEndpoint((_body, response) => sendTeamOutput(response, { ...writingPlan, members: [] }, false)); cleanup.push(invalid.close)
  const a = await setup(invalid.url); await a.api('generateTeamPlan', a.request)
  expect((await a.finished()).generation?.status).toBe('failed'); expect(invalid.requests).toHaveLength(2)
  expect((await a.finished()).draft.plan).toBeUndefined()
  const denied = await teamEndpoint((_body, response) => { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'test-secret rejected' } })) }); cleanup.push(denied.close)
  const b = await setup(denied.url); await b.api('generateTeamPlan', b.request); const result = await b.finished()
  expect(result.generation?.status).toBe('failed'); expect(denied.requests).toHaveLength(1); expect(result.generation?.attempts[0].usage).toBe('unknown'); expect(JSON.stringify(result)).not.toContain('test-secret')
})
test('stop gates a late result and keeps actual usage; a second generation waits for the adapter to exit', async () => {
  let finish!: () => void, started!: () => void; const began = new Promise<void>(resolve => { started = resolve })
  const { api, request } = await setup(undefined, async call => { started(); await new Promise<void>(resolve => { finish = resolve }); await call.usage({ inputTokens: 4, outputTokens: 8 }); return writingPlan })
  const generation = await api('generateTeamPlan', request); await began
  await api('cancelTeamGeneration', { generationId: generation.id })
  const stopped = await api('getTeamDraft', { draftId: request.draftId })
  await expect(api('generateTeamPlan', { ...request, expectedVersion: stopped.draft.version, requestId: 'second' })).rejects.toThrow('退出')
  finish(); await vi.waitFor(async () => { const value = await api('getTeamDraft', { draftId: request.draftId }); expect(value.generation?.attempts[0].usage).toEqual({ inputTokens: 4, outputTokens: 8 }); expect(value.draft.plan).toBeUndefined(); expect(value.generation?.status).toBe('cancelled') })
})
test.each(['写作', '单人助手', '不同性格的讨论组', '狼人杀玩家群', '写作并自动安装工具', '创建50人'])('protocol handles bounded scenario %s without creating entities', async prompt => {
  const output = prompt === '创建50人' ? { kind: 'needs_adjustment', schemaVersion: 1, reason: '最多12人', suggestedPrompt: '创建12人团队' } : { ...writingPlan, ...(prompt.includes('狼人杀') ? { scenarioKind: 'roleplay', capabilityNotes: ['未支持正式游戏规则、隐藏身份、投票和胜负'] } : {}), ...(prompt === '单人助手' ? { members: writingPlan.members.slice(0, 1) } : {}) }
  const endpoint = await teamEndpoint((_body, response) => sendTeamOutput(response, output)); cleanup.push(endpoint.close)
  const { api, request, draft, finished } = await setup(endpoint.url)
  const saved = await api('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt, selectedConnectionId: draft.selectedConnectionId, selectedModelId: '', createGroup: true, groupTitle: '' } })
  await api('generateTeamPlan', { ...request, expectedVersion: saved.version }); const result = await finished()
  expect(result.generation?.status).toBe(prompt === '创建50人' ? 'needs_adjustment' : 'succeeded')
  expect((await api('snapshot', undefined)).conversations).toEqual([])
})

test('absolute deadline cancels execution with unknown usage and no implicit retry', async () => {
  let started!: () => void; const began = new Promise<void>(resolve => { started = resolve })
  const { api, request } = await setup(undefined, async call => { started(); return new Promise((_, reject) => call.signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })) })
  vi.useFakeTimers()
  await api('generateTeamPlan', request); await began
  await vi.advanceTimersByTimeAsync(TEAM_LIMITS.deadlineMs + 1)
  vi.useRealTimers()
  await vi.waitFor(async () => {
    const view = await api('getTeamDraft', { draftId: request.draftId })
    expect(view.generation?.status).toBe('failed'); expect(view.generation?.attempts).toHaveLength(1)
    expect(view.generation?.attempts[0].usage).toBe('unknown'); expect(view.draft.plan).toBeUndefined()
  })
})

test('startup interrupts persisted in-flight generation, keeps its identity and never invokes the planner', async () => {
  const { api, request, dataPath, service, finished } = await setup(undefined, async () => writingPlan)
  const accepted = await api('generateTeamPlan', request); await finished(); await service.close()
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  const repo = new TeamRepository(store), view = await repo.get({ draftId: request.draftId })
  view.generation!.status = 'running'; view.generation!.attempts[0].status = 'running'; view.draft.generationStatus = 'running'
  await store.write([{ collection: 'teamGenerations', id: accepted.id, value: view.generation }, { collection: 'teamDrafts', id: view.draft.id, value: view.draft }]); await store.close()
  let calls = 0
  const next = new AppService({ dataPath, teamPlanner: async () => { calls++; return writingPlan }, engine: { run: async () => {}, test: async () => '' }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await next.init(); cleanup.push(() => next.close())
  const recovered = await next.handle('getTeamDraft', { draftId: request.draftId }) as TeamDraftView
  expect(recovered.generation?.id).toBe(accepted.id); expect(recovered.generation?.status).toBe('interrupted'); expect(recovered.generation?.attempts[0].usage).toBe('unknown'); expect(calls).toBe(0)
})

test('a newer persisted draft version cannot be overwritten by an old generation response', async () => {
  let release!: () => void, started!: () => void; const ready = new Promise<void>(resolve => { started = resolve })
  const { api, request, dataPath } = await setup(undefined, async () => { started(); await new Promise<void>(resolve => { release = resolve }); return writingPlan })
  await api('generateTeamPlan', request); await ready
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const draft = (await api('getTeamDraft', { draftId: request.draftId })).draft
  await store.write([{ collection: 'teamDrafts', id: draft.id, value: { ...draft, version: draft.version + 1, prompt: '另一窗口的新版本', generationStatus: 'idle' } }])
  release()
  await vi.waitFor(async () => { const result = await api('getTeamDraft', { draftId: draft.id }); expect(result.generation?.status).toBe('interrupted'); expect(result.draft.prompt).toBe('另一窗口的新版本'); expect(result.draft.plan).toBeUndefined() })
})
test('abandon waits for generation exit, scrubs private content and retains late usage', async () => {
  let release!: () => void, started!: () => void; const ready = new Promise<void>(resolve => { started = resolve })
  const { api, request, dataPath } = await setup(undefined, async call => { started(); await new Promise<void>(resolve => { release = resolve }); await call.usage({ inputTokens: 3, outputTokens: 6 }); return writingPlan })
  await api('generateTeamPlan', request); await ready
  const draft = (await api('getTeamDraft', { draftId: request.draftId })).draft
  const abandoning = api('abandonTeamDraft', { draftId: draft.id, expectedVersion: draft.version })
  await vi.waitFor(async () => expect((await api('getTeamDraft', { draftId: draft.id })).generation?.status).toBe('cancelled'))
  release(); await abandoning
  const view = await api('getTeamDraft', { draftId: draft.id })
  expect(view.draft.prompt).toBe(''); expect(view.draft.status).toBe('cancelled'); expect(view.draft.plan).toBeUndefined()
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const generations = await store.load<import('../src/shared/domain/team-creation').TeamGeneration>('teamGenerations')
  expect(generations[0].attempts[0].usage).toEqual({ inputTokens: 3, outputTokens: 6 })
})
