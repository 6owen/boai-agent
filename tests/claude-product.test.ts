/*
 * [OUTPUT]: 额度追加跳过原负责人普通判断，只保留原定向接续外部请求；本次全部运行完成，原副作用、账本和重启回执不重放。
 * [OUTPUT]: 原员工保存入口核对本机模型来源/模型ID在执行中和已停止待核对时的换绑门禁；拒绝不改配置、原Work及账本，重启不放行，姓名编辑保持原行为。
 * [OUTPUT]: 原IM认证拒绝保持一调用/未知用量及实际退出后的完成时间，原错误和重启零重放；合成协议进程不代表真实供应商/UI。群进度更新后的记忆仍引用原任务偏好。
 * [OUTPUT]: Claude明确修订通过原消息/固定hash/新根与新预算，旧成果/预算/采用记录保留；重复受理与重启零重放。
 * [OUTPUT]: 首次Work前的原问题/失败追加按实际continuation接续，普通继续无关联；原请求/预算、单次文件与重启不重放。
 * [OUTPUT]: 流式私有计量沿AppService进入原自动化预算并取消实际进程；普通聊天部分计量不计完整活动，重启不补发。
 * [OUTPUT]: Claude自动化沿原时钟/occurrence/预算交付；固定问题与明确追加沿原Work接续，拒绝陈旧关联、回执去重、准备文件不重写及重启零重放；期限到期注入仅为模块证据。
 * [INPUT]: 原AppService/SQLite、真实独立Claude协议进程与隔离的合成API来源。
 * [OUTPUT]: Claude核心三模式核对已验证模型组织低档与普通任务默认；具名团队继承真实运行绑定，原组织/业务工作与重启零重放；原IM材料/普通群独立身份、真实工具分工与共享预算；逐交付记忆归属/原来源/唯一账本与重启零重放，无API父模型，非真实CLI或UI。
 * [POS]: Claude产品接线模块验收，沿原handle入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AgentInput, AgentRun, AutomationDefinition, AutomationOccurrence, BudgetModelCall, Connection, Conversation, ConversationDetail, ConversationMaterial, DigitalAgent, LaunchProfile, LaunchProfileInput, MemoryEntry, Message, Snapshot, WorkBudget, WorkItem } from '../src/shared/domain'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { CORE_AGENT_ID } from '../src/shared/domain/core-agent'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(model: 'fixture-model' | 'deepseek-v4-pro' = 'fixture-model') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-claude-product-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const executable = join(root, 'claude.mjs'), dataPath = join(root, 'data')
  await copyFile(resolve('tests/fixtures/claude-employee.mjs'), executable); await chmod(executable, 0o700)
  const parentModel = vi.fn(async () => { throw new Error('Must not use API parent engine') })
  const options = { dataPath, engine: { run: parentModel, decide: parentModel, test: parentModel, extractMemory: parentModel },
    secrets: { get: async () => 'synthetic-provider-key', set: async () => {}, delete: async () => {} }, emit: () => {} }
  let service = new AppService(options); await service.init(); cleanup.push(() => service.close())
  const draft: LaunchProfileInput = { name: '本场Claude', executable, args: [], protocol: 'claude-cli', useExistingLogin: false, hostAccessAcknowledged: true }
  const connection = await service.handle('saveConnection', { name: 'Explicit source', provider: 'anthropic', baseUrl: model === 'deepseek-v4-pro' ? 'https://api.deepseek.com/anthropic' : 'http://127.0.0.1:9', defaultModel: model, apiKey: 'synthetic-provider-key' }) as Connection
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); cleanup.push(() => store.close())
  const agentInput = (profileId: string): AgentInput => ({ name: 'Claude员工', role: '文件核对', instructions: '仅处理明确授权工作。', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'claude-local', profileId }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
  const create = async () => {
    await service.handle('testLaunchProfileDraft', draft)
    const profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const agent = await service.handle('saveAgent', agentInput(profile.id)) as DigitalAgent
    const chat = await service.handle('createConversation', { kind: 'direct', title: 'Claude原IM', agentIds: [agent.id] }) as Conversation
    return { profile, agent, chat }
  }
  const detail = (id: string) => service.handle('getConversation', { id }) as Promise<ConversationDetail>
  const send = (chat: Conversation, content: string, requestId: string, mentionIds: string[] = []) => service.handle('sendMessage', { conversationId: chat.id, content, mentionIds, requestId })
  const settled = async (chat: Conversation, count: number, memoryCount?: number) => {
    await vi.waitFor(async () => {
      const d = await detail(chat.id)
      expect(d.runs.filter(r => r.phase === 'execution'), JSON.stringify({ runs: d.runs, turns: d.turns })).toHaveLength(count)
      if (memoryCount !== undefined) expect(d.runs.filter(r => r.phase === 'memory')).toHaveLength(memoryCount)
      expect(d.runs.filter(r => ['queued', 'running', 'waiting_approval'].includes(r.status))).toEqual([])
      expect(d.turns?.every(t => ['completed', 'failed', 'cancelled', 'waiting_user', 'interrupted', 'budget_exhausted'].includes(t.status))).toBe(true)
      expect(d.runs.filter(r => r.status === 'failed').map(r => r.error)).toEqual([])
    }, { timeout: 15_000, interval: 30 })
    return detail(chat.id)
  }
  return { root, dataPath, executable, parentModel, draft, connection, store, agentInput, create, detail, send, settled,
    get service() { return service }, restart: async (path = dataPath) => { await service.close(); service = new AppService({ ...options, dataPath: path }); await service.init() } }
}

async function claudeAutomation(f: Awaited<ReturnType<typeof fixture>>, employeeId: string, suffix = '') {
  return await f.service.handle('saveAutomation', { name: 'Claude定时交付', prompt: '模块文件任务 empty-memory ' + suffix, conversationPolicy: 'new-conversation', employeeIds: [employeeId], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
}
async function occurrenceState(f: Awaited<ReturnType<typeof fixture>>, id: string, status: AutomationOccurrence['status']) {
  await expect.poll(async () => (await f.service.handle('getAutomationOccurrence', { id }) as AutomationOccurrence).status, { timeout: 15000 }).toBe(status)
  return await f.service.handle('getAutomationOccurrence', { id }) as AutomationOccurrence
}

it.each([
  ['connection', 'active'], ['model', 'active'], ['connection', 'stopped'], ['model', 'stopped'],
] as const)('refuses native %s rebinding while the original work is %s without changing its identity or budget', async (change, stage) => {
  const f = await fixture(), { agent, profile } = await f.create()
  const target = await f.service.handle('saveConnection', { name: 'Other explicit source', provider: 'anthropic', baseUrl: 'http://127.0.0.1:9', defaultModel: 'fixture-model', apiKey: 'synthetic-other-key' }) as Connection
  const plan = await claudeAutomation(f, agent.id, 'CLAUDE_AUTOMATION_HOLD')
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'binding-original-work' }) as AutomationOccurrence
  await expect.poll(async () => (await f.store.load<AgentRun>('runs')).some(run => run.phase === 'execution' && run.status === 'running' && run.toolEvents.some(event => event.name === 'write_file' && event.status === 'completed')), { timeout: 10000 }).toBe(true)
  const input = { ...f.agentInput(profile.id), id: agent.id, expectedConfigVersion: agent.configVersion, ...(change === 'connection' ? { connectionId: target.id } : { modelId: 'other-fixture-model' }) }
  const facts = async () => Object.fromEntries(await Promise.all(['agents', 'runs', 'workItems', 'workBudgets', 'budgetModelCalls', 'profileModelCalls', 'claudeSessions', 'artifacts'].map(async name => [name, await f.store.load(name)])))
  if (stage === 'stopped') {
    await f.service.handle('stopAutomation', { id: occurrence.id })
    await occurrenceState(f, occurrence.id, 'cancelled')
    await expect.poll(() => {
      const service = f.service as unknown as { activeAdapters: Set<string>; runControllers: Map<string, AbortController> }
      return service.activeAdapters.size + service.runControllers.size
    }, { timeout: 5000 }).toBe(0)
  }
  const before = await facts(), reason = stage === 'active' ? '员工仍在执行' : '待核对工作'
  await expect(f.service.handle('saveAgent', { ...input, connectionId: f.connection.id, modelId: '', executionBackend: { kind: 'mastra-model' } })).rejects.toThrow(reason)
  expect(await facts()).toEqual(before)
  await expect(f.service.handle('saveAgent', input)).rejects.toThrow(reason)
  expect(await facts()).toEqual(before)
  expect(await f.store.load<WorkItem>('workItems')).toHaveLength(1)
  expect(await f.store.load<BudgetModelCall>('budgetModelCalls')).toHaveLength(2)
  if (stage === 'stopped') {
    expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toMatchObject({ unknownCalls: 1, usageIncomplete: true })
    await f.restart()
    expect(await facts()).toEqual(before)
    await expect(f.service.handle('saveAgent', input)).rejects.toThrow('待核对工作')
    expect(await facts()).toEqual(before)
    await expect(f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: agent.id, expectedConfigVersion: agent.configVersion, name: '仅修改姓名' })).resolves.toMatchObject({ id: agent.id, configVersion: agent.configVersion + 1, connectionId: agent.connectionId, modelId: agent.modelId, executionBackend: agent.executionBackend })
    const after = await facts()
    for (const name of ['workItems', 'workBudgets', 'budgetModelCalls', 'profileModelCalls', 'claudeSessions', 'artifacts']) expect(after[name]).toEqual(before[name])
  } else {
    await f.service.handle('stopAutomation', { id: occurrence.id })
    await occurrenceState(f, occurrence.id, 'cancelled')
  }
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30000)

it('native adapter authentication failure ends the original ordinary call and preserves its unknown usage across restart', async () => {
  const f = await fixture(), { chat } = await f.create()
  await f.send(chat, 'CLAUDE_API_AUTH_401', 'authentication-once')
  await expect.poll(async () => (await f.detail(chat.id)).runs[0]?.status, { timeout: 5000 }).toBe('failed')
  const detail = await f.detail(chat.id), calls = await f.store.load<import('../src/runtime/modules/profile/profile-activity').ProfileModelCall>('profileModelCalls')
  expect(detail.runs).toHaveLength(1); expect(detail.runs[0].error).toContain('认证失败（401）')
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ phase: 'decision', usageComplete: false, finishedAt: expect.any(String) })
  expect(calls[0].usage).toBeUndefined(); expect(await f.store.load('workItems')).toEqual([])
  expect(await f.store.load('budgetModelCalls')).toEqual([]); expect(await f.store.load('claudeSessions')).toEqual([])
  expect(JSON.stringify(detail)).not.toContain('sk-private-auth-error')
  const runs = await f.store.load('runs')
  await f.restart()
  expect(await f.store.load('runs')).toEqual(runs); expect(await f.store.load('profileModelCalls')).toEqual(calls)
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('keeps a stopped Claude private phase metered but unknown in ordinary activity, including restart', async () => {
  const f = await fixture(), { chat } = await f.create()
  await f.send(chat, 'CLAUDE_USAGE_STOP', 'meter-chat')
  await expect.poll(async () => (await f.store.load<{ usage?: { outputTokens?: number }; usageComplete?: boolean }>('profileModelCalls')).some(c => c.usage?.outputTokens === 7 && c.usageComplete === false), { timeout: 5000 }).toBe(true)
  await f.service.handle('cancelRun', { conversationId: chat.id })
  await expect.poll(async () => (await f.detail(chat.id)).runs.every(r => !['running', 'queued'].includes(r.status))).toBe(true)
  const calls = await f.store.load('profileModelCalls'), runs = await f.store.load('runs')
  const range = { from: '2026-01-01', to: '2026-12-31', timezone: 'UTC' }
  expect(await f.service.handle('getProfileActivity', range)).toMatchObject({ totalTokens: null, unknownCalls: 1, incomplete: true })
  expect(await f.store.load('workItems')).toEqual([])
  await f.restart()
  expect(await f.store.load('profileModelCalls')).toEqual(calls); expect(await f.store.load('runs')).toEqual(runs)
  expect(await f.service.handle('getProfileActivity', range)).toMatchObject({ totalTokens: null, unknownCalls: 1 })
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('enforces the original automation budget from partial Claude usage before any final receipt', async () => {
  const f = await fixture(), { agent } = await f.create()
  const plan = await claudeAutomation(f, agent.id, 'CLAUDE_USAGE_STOP CLAUDE_USAGE_LIMIT')
  const initial = await f.service.handle('runAutomation', { id: plan.id, requestId: 'partial-budget' }) as AutomationOccurrence
  await expect.poll(async () => (await f.store.load<AgentRun>('runs')).some(r => r.status === 'cancelled'), { timeout: 5000 }).toBe(true)
  const calls = await f.store.load<BudgetModelCall>('budgetModelCalls'), budgets = await f.store.load<WorkBudget>('workBudgets')
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ phase: 'decision', usageComplete: false, usage: { inputTokens: 18, outputTokens: 17000, totalTokens: 17018 } })
  expect(budgets[0]).toMatchObject({ maxOutputTokens: 16000, unknownCalls: 1, usageIncomplete: true, usage: calls[0].usage })
  expect(await f.store.load('artifacts')).toEqual([])
  await f.restart()
  expect(await f.store.load('budgetModelCalls')).toEqual(calls); expect(await f.store.load('workBudgets')).toEqual(budgets)
  expect((await f.service.handle('getAutomationOccurrence', { id: initial.id }) as AutomationOccurrence).status).not.toBe('running')
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('delivers a Claude automation in one dedicated chat and original ledger, deduplicates its request and never replays on restart', async () => {
  const f = await fixture(), { agent, chat } = await f.create(), plan = await claudeAutomation(f, agent.id)
  expect(await f.store.load('runs')).toEqual([])
  const request = { id: plan.id, requestId: 'claude-once' }
  const [first, duplicate] = await Promise.all([f.service.handle('runAutomation', request), f.service.handle('runAutomation', request)]) as AutomationOccurrence[]
  expect(duplicate.id).toBe(first.id); expect(first.conversationId).not.toBe(chat.id)
  const result = await occurrenceState(f, first.id, 'completed'), detail = await f.detail(first.conversationId)
  expect(result).toMatchObject({ deliveryStatus: 'delivered', usageIncomplete: false })
  expect(detail.conversation).toMatchObject({ purpose: 'automation', occurrenceId: first.id, agentIds: [agent.id] })
  expect(detail.workItems).toHaveLength(1)
  expect(detail.workItems![0]).toMatchObject({ status: 'delivered', sourceMessageId: result.messageId, budgetId: first.budgetId, origin: { occurrenceId: first.id } })
  expect(detail.runs.every(run => run.status === 'completed' && run.backend?.kind === 'claude-local')).toBe(true)
  expect(detail.artifacts).toHaveLength(1)
  expect(await readFile(detail.artifacts[0].path, 'utf8')).toBe('生产工具真实原件')
  const budgets = await f.store.load<WorkBudget>('workBudgets'), calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
  expect(budgets).toHaveLength(1)
  expect(budgets[0]).toMatchObject({ id: first.budgetId, callUnit: 'mixed', modelCalls: 3, unknownCalls: 0, usageIncomplete: false, deadlineAt: first.budget!.deadlineAt })
  expect(calls.map(call => call.phase).sort()).toEqual(['decision', 'execution', 'memory'])
  expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && call.origin?.occurrenceId === first.id)).toBe(true)
  const runs = await f.store.load('runs'), sessions = await f.store.load('claudeSessions')
  await f.restart()
  expect(await f.service.handle('runAutomation', request)).toMatchObject({ id: first.id, status: 'completed' })
  expect(await f.store.load('runs')).toEqual(runs); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  expect(await f.store.load('workBudgets')).toEqual(budgets); expect(await f.store.load('claudeSessions')).toEqual(sessions)
  expect((await f.detail(chat.id)).messages).toEqual([]); expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it.each(['fixed-question', 'explicit-renewal'] as const)('continues Claude automation through %s on the original work and ledger without replaying prior effects', async mode => {
  const f = await fixture(), { agent } = await f.create(), plan = await claudeAutomation(f, agent.id, 'CLAUDE_AUTOMATION_QUESTION')
  const initial = await f.service.handle('runAutomation', { id: plan.id, requestId: 'claude-question' }) as AutomationOccurrence
  const waiting = await occurrenceState(f, initial.id, 'waiting_user'), before = await f.detail(initial.conversationId)
  expect(before.workItems).toHaveLength(1); expect(before.workBudgets).toHaveLength(1); expect(before.artifacts).toEqual([])
  const work = before.workItems![0], budget = before.workBudgets![0]
  expect(work).toMatchObject({ status: 'waiting', origin: { occurrenceId: initial.id } })
  const question = before.messages.find(m => m.senderType === 'agent' && m.status === 'completed' && waiting.waitingTurnIds?.includes(m.turnId!))!
  expect(question.content).toContain('最终文件标题用什么？')
  const home = await f.service.handle('getAgentHome', { agentId: agent.id, conversationId: initial.conversationId }) as { sessionPath: string }
  const prepared = join(home.sessionPath, 'work', 'prepared.txt'), modified = (await stat(prepared)).mtimeMs
  expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
  const internal = f.service as unknown as { store: ProductStore; automations: import('../src/runtime/modules/automations/automation-service').AutomationService }
  const fixed = { expectedVersion: waiting.stateVersion, questionMessageId: question.id }
  const base = { occurrenceId: initial.id, content: '标题用 Claude proof，完成原文件。', requestId: 'claude-supplement' }
  await expect(f.service.handle('replyAutomation', { ...base, question: { ...fixed, questionMessageId: 'wrong-message' } })).rejects.toThrow()
  await expect(f.service.handle('replyAutomation', { ...base, question: { ...fixed, expectedVersion: waiting.stateVersion - 1 } })).rejects.toThrow()
  expect(await f.store.load('runs')).toHaveLength(before.runs.length)
  let request: typeof base & { question?: typeof fixed; renewBudget?: { expectedVersion: number; allowance: 'standard-v1' } }
  if (mode === 'explicit-renewal') {
    // Fault injection verifies grant transactions; actual deadline behavior is verified separately in Electron.
    await internal.store.write([{ collection: 'workBudgets', id: budget.id, value: { ...budget, deadlineAt: new Date(0).toISOString() } }])
    await internal.automations.stop(initial.id, '测试原时间预算已到期', 'budget')
    const stopped = await occurrenceState(f, initial.id, 'cancelled')
    request = { ...base, renewBudget: { expectedVersion: stopped.stateVersion, allowance: 'standard-v1' } }
  } else request = { ...base, question: fixed }
  const reply = await f.service.handle('replyAutomation', request) as Message
  expect(await f.service.handle('replyAutomation', request)).toEqual(reply)
  if (mode === 'explicit-renewal') await internal.automations.stop(initial.id, '旧期限迟到事件', 'budget', 0)
  await occurrenceState(f, initial.id, 'completed')
  const after = await f.detail(initial.conversationId), works = await f.store.load<WorkItem>('workItems'), budgets = await f.store.load<WorkBudget>('workBudgets'), calls = await f.store.load<BudgetModelCall>('budgetModelCalls')
  expect(works).toHaveLength(1); expect(budgets).toHaveLength(1)
  expect(works[0]).toMatchObject({ id: work.id, sourceMessageId: work.sourceMessageId, budgetId: budget.id, status: 'delivered', origin: work.origin })
  expect(budgets[0]).toMatchObject({ id: budget.id, callUnit: 'mixed', modelCalls: mode === 'explicit-renewal' ? 3 : 4, runs: 2, unknownCalls: 0, usageIncomplete: false })
  expect(calls).toHaveLength(budgets[0].modelCalls)
  expect(calls.every(call => call.callUnit === 'external-turn' && call.usageComplete && call.origin?.occurrenceId === initial.id)).toBe(true)
  if (mode === 'explicit-renewal') {
    expect(budgets[0].maxModelCalls).toBe(48); expect(budgets[0].renewals).toHaveLength(1)
    expect(budgets[0].renewals![0]).toMatchObject({ requestId: request.requestId, messageId: reply.id, used: { modelCalls: budget.modelCalls, usage: budget.usage, unknownCalls: budget.unknownCalls } })
  } else { expect(budgets[0].deadlineAt).toBe(budget.deadlineAt); expect(budgets[0].renewals).toBeUndefined() }
  expect(after.runs.flatMap(run => run.toolEvents).filter(event => event.name === 'write_file' && event.status === 'completed')).toHaveLength(2)
  expect((await stat(prepared)).mtimeMs).toBe(modified); expect(await readFile(prepared, 'utf8')).toBe('prepared-once')
  expect(after.artifacts).toHaveLength(1)
  expect(after.runs.every(r => r.backend?.kind === 'claude-local')).toBe(true)
  // Renewal routes only the persisted original wake; it does not judge a duplicate owner task.
  expect(after.runs.every(run => run.status === 'completed')).toBe(true)
  if (mode === 'explicit-renewal') expect(after.runs.filter(run => run.turnId === reply.turnId)).toEqual([])
  const runs = await f.store.load('runs'), sessions = await f.store.load('claudeSessions')
  await f.restart()
  expect(await f.service.handle('replyAutomation', request)).toEqual(reply)
  expect(await f.store.load('runs')).toEqual(runs); expect(await f.store.load('claudeSessions')).toEqual(sessions)
  expect(await f.store.load('workItems')).toEqual(works); expect(await f.store.load('workBudgets')).toEqual(budgets); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  expect((await stat(prepared)).mtimeMs).toBe(modified); expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it.each(['question', 'failed-decision'] as const)('passes explicit pre-work %s continuation to Claude without treating ordinary chat as a grant', async mode => {
  const f = await fixture(), { agent } = await f.create(), plan = await claudeAutomation(f, agent.id, mode === 'question' ? 'NATIVE_CONTINUATION_QUESTION' : 'NATIVE_CONTINUATION_FAILURE')
  const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'before-work' }) as AutomationOccurrence
  const initial = await occurrenceState(f, first.id, mode === 'question' ? 'waiting_user' : 'failed'), before = await f.detail(first.conversationId)
  expect(before.workItems).toEqual([]); expect(before.artifacts).toEqual([])
  const home = await f.service.handle('getAgentHome', { agentId: agent.id, conversationId: first.conversationId }) as { sessionPath: string }
  const decisions = async () => (await readFile(join(home.sessionPath, 'work', 'decision-continuation.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  const ordinary = await f.service.handle('sendMessage', { conversationId: first.conversationId, content: '继续', mentionIds: [], requestId: 'ordinary-continue' }) as Message
  await expect.poll(async () => (await f.detail(first.conversationId)).messages.some(m => m.senderType === 'agent' && m.status === 'completed' && m.turnId === ordinary.turnId)).toBe(true)
  await expect.poll(async () => (await f.detail(first.conversationId)).runs.every(r => ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status))).toBe(true)
  expect((await decisions()).filter(d => d.originalUserRequestId === ordinary.id)).not.toHaveLength(0)
  expect((await decisions()).filter(d => d.originalUserRequestId === ordinary.id).every(d => d.continuation === undefined)).toBe(true)
  expect((await f.detail(first.conversationId)).workItems).toEqual([])
  await occurrenceState(f, first.id, initial.status)
  const request = { occurrenceId: first.id, content: '标题用接续证明，请完成原文件。', requestId: 'explicit-continue' }
  let continuation: { question?: { expectedVersion: number; questionMessageId: string }; renewBudget?: { expectedVersion: number; allowance: 'standard-v1' } }
  if (mode === 'question') {
    const waiting = await occurrenceState(f, first.id, 'waiting_user')
    const question = before.messages.find(m => m.senderType === 'agent' && m.turnId === first.turnId && m.status === 'completed')!
    continuation = { question: { expectedVersion: waiting.stateVersion, questionMessageId: question.id } }
  } else {
    // Explicit expiry injection tests the continuation contract, not elapsed wall-clock behavior.
    const internal = f.service as unknown as { store: ProductStore }
    await internal.store.write([{ collection: 'workBudgets', id: first.budgetId!, value: { ...before.workBudgets![0], deadlineAt: new Date(0).toISOString() } }])
    const stopped = await occurrenceState(f, first.id, 'failed')
    continuation = { renewBudget: { expectedVersion: stopped.stateVersion, allowance: 'standard-v1' } }
  }
  const input = { ...request, ...continuation }, reply = await f.service.handle('replyAutomation', input) as Message
  expect(await f.service.handle('replyAutomation', input)).toEqual(reply)
  await expect.poll(async () => (await decisions()).some(d => d.originalUserRequestId === reply.id)).toBe(true)
  const data = (await decisions()).find(d => d.originalUserRequestId === reply.id)!
  expect(data.continuation).toMatchObject({ originalRequestId: first.messageId, replyToTurnIds: mode === 'question' ? [first.turnId] : [] })
  if (mode === 'failed-decision') expect(data.continuation.resumesTurnIds).toContain(first.turnId)
  const completed = await occurrenceState(f, first.id, 'completed'), after = await f.detail(first.conversationId)
  expect(completed.deliveryStatus).toBe('delivered')
  expect(after.workItems).toHaveLength(1); expect(after.artifacts).toHaveLength(1); expect(after.workBudgets).toHaveLength(1)
  expect(after.workItems![0]).toMatchObject({ sourceMessageId: first.messageId, budgetId: first.budgetId, status: 'delivered' })
  expect(after.runs.flatMap(r => r.toolEvents).filter(e => e.name === 'write_file' && e.status === 'completed')).toHaveLength(1)
  expect(after.workBudgets![0].modelCalls).toBe((await f.store.load('budgetModelCalls')).length)
  if (mode === 'question') expect(after.workBudgets![0].deadlineAt).toBe(before.workBudgets![0].deadlineAt)
  else expect(after.workBudgets![0].renewals).toHaveLength(1)
  const records = await Promise.all(['runs', 'workItems', 'workBudgets', 'budgetModelCalls'].map(name => f.store.load(name)))
  await f.restart()
  expect(await f.service.handle('replyAutomation', input)).toEqual(reply)
  expect(await Promise.all(['runs', 'workItems', 'workBudgets', 'budgetModelCalls'].map(name => f.store.load(name)))).toEqual(records)
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it.each(['program', 'profile', 'provider'] as const)('invalidates Claude automation after its reviewed %s changes, before any model or work admission', async changed => {
  const f = await fixture(), { agent, profile } = await f.create(), plan = await claudeAutomation(f, agent.id)
  if (changed === 'program') await writeFile(f.executable, '\n// replaced program', { flag: 'a' })
  if (changed === 'profile') await f.service.handle('saveLaunchProfile', { ...f.draft, id: profile.id, expectedRevision: profile.revision, name: 'Changed program profile' })
  if (changed === 'provider') await f.service.handle('saveConnection', { id: f.connection.id, name: f.connection.name, provider: f.connection.provider, baseUrl: f.connection.baseUrl, defaultModel: 'changed-model' })
  const result = await f.service.handle('runAutomation', { id: plan.id, requestId: 'changed-once' }) as AutomationOccurrence
  expect(result).toMatchObject({ status: 'skipped', attentionReason: 'authorization' })
  expect(result.budgetId).toBeUndefined()
  expect((await f.store.load<Conversation>('conversations')).filter(c => c.purpose === 'automation')).toEqual([])
  for (const collection of ['runs', 'workItems', 'budgetModelCalls']) expect(await f.store.load(collection)).toEqual([])
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('keeps unattended Claude command permissions closed and stops an active process without publishing or replaying its private file', async () => {
  const f = await fixture(), { agent, profile } = await f.create()
  await f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: agent.id, allowCommands: true })
  await expect(claudeAutomation(f, agent.id)).rejects.toThrow('命令权限')
  expect(await f.store.load('automations')).toEqual([])
  await f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: agent.id, allowCommands: false })
  const plan = await claudeAutomation(f, agent.id, 'CLAUDE_AUTOMATION_HOLD'), request = { id: plan.id, requestId: 'stop-once' }
  const first = await f.service.handle('runAutomation', request) as AutomationOccurrence
  await expect.poll(async () => (await f.store.load<AgentRun>('runs')).some(r => r.toolEvents.some(e => e.name === 'write_file' && e.status === 'completed')), { timeout: 10000 }).toBe(true)
  await f.service.handle('stopAutomation', { id: first.id })
  await occurrenceState(f, first.id, 'cancelled')
  const calls = await f.store.load<BudgetModelCall>('budgetModelCalls'), runs = await f.store.load('runs')
  expect(await f.store.load('artifacts')).toEqual([])
  expect(calls.some(c => c.phase === 'execution' && !c.usageComplete)).toBe(true)
  expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toMatchObject({ unknownCalls: 1, usageIncomplete: true })
  await f.restart()
  expect(await f.service.handle('runAutomation', request)).toMatchObject({ id: first.id, status: 'cancelled' })
  expect(await f.store.load('runs')).toEqual(runs); expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it('requires the exact verified program and explicit API source before employee creation, without invoking a model', async () => {
  const f = await fixture()
  for (const bad of [{ useExistingLogin: true }, { args: ['--dangerously-skip-permissions'] }, { codexHome: f.root }, { localConfigId: 'a'.repeat(64) }]) {
    await expect(f.service.handle('saveLaunchProfile', { ...f.draft, ...bad })).rejects.toThrow()
  }
  const unverified = await f.service.handle('saveLaunchProfile', f.draft) as LaunchProfile
  await expect(f.service.handle('saveAgent', f.agentInput(unverified.id))).rejects.toThrow('先核对')
  await f.service.handle('testLaunchProfile', { id: unverified.id })
  await expect(f.service.handle('saveAgent', { ...f.agentInput(unverified.id), connectionId: '' })).rejects.toThrow('API连接')
  await expect(f.service.handle('saveAgent', { ...f.agentInput(unverified.id), executionBackend: { kind: 'codex-local', profileId: unverified.id } })).rejects.toThrow('协议不一致')
  const agent = await f.service.handle('saveAgent', f.agentInput(unverified.id)) as DigitalAgent
  expect(agent).toMatchObject({ executionBackend: { kind: 'claude-local' }, connectionId: f.connection.id })
  expect(await f.store.load('runs')).toEqual([]); expect(f.parentModel).not.toHaveBeenCalled()
  await writeFile(f.executable, '\n// changed', { flag: 'a' })
  await expect(f.service.handle('saveAgent', f.agentInput(unverified.id))).rejects.toThrow('程序已变化')
})

it('runs original IM and Work through Claude, persists accounting and artifacts, and clears native history without an API parent', async () => {
  const f = await fixture(), { profile, agent, chat } = await f.create()
  await f.send(chat, 'empty-memory 首次聊天', 'first')
  await f.settled(chat, 1)
  const first = (await f.store.load<{ threadId: string }>('claudeSessions'))[0]
  expect(first.threadId).toBeTruthy(); expect(await f.store.load('workItems')).toEqual([])
  await f.restart()
  await f.send(chat, 'empty-memory 接着聊', 'second')
  const resumed = await f.settled(chat, 2)
  expect(resumed.messages.some(m => m.content === '只处理新增消息')).toBe(true)
  expect((await f.store.load<{ threadId: string }>('claudeSessions'))[0].threadId).toBe(first.threadId)
  await f.send(chat, '模块文件任务 empty-memory', 'task')
  const result = await f.settled(chat, 3)
  expect(result.workItems).toHaveLength(1); expect(result.workItems![0].status).toBe('delivered')
  expect(result.artifacts).toHaveLength(1)
  expect(await readFile(result.artifacts[0].path, 'utf8')).toBe('生产工具真实原件')
  const budgets = await f.store.load<WorkBudget>('workBudgets')
  expect(budgets).toHaveLength(1)
  expect(budgets[0]).toMatchObject({ callUnit: 'external-turn', accounting: 'model-calls-v1', unknownCalls: 0, modelCalls: 3 })
  expect(result.runs.every(r => r.backend?.kind === 'claude-local')).toBe(true)
  expect(await f.store.load('codexSessions')).toEqual([]); expect(f.parentModel).not.toHaveBeenCalled()
  await expect(f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: CORE_AGENT_ID, allowCommands: true })).rejects.toThrow('系统核心 Agent')
  await f.service.handle('clearConversationHistory', { id: chat.id, hide: false })
  expect(await f.store.load('claudeSessions')).toEqual([])
  await f.restart()
  expect((await f.detail(chat.id)).messages).toEqual([])
  expect(await f.store.load('claudeSessions')).toEqual([]); expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it('revises an explicitly selected Claude artifact in a new root and ledger without changing the original or replaying the request', async () => {
  const f = await fixture(), { agent, chat } = await f.create()
  await f.send(chat, '模块文件任务 empty-memory', 'original')
  const first = await f.settled(chat, 1, 1), original = first.artifacts[0], oldWork = first.workItems![0], oldBudget = first.workBudgets![0]
  await f.service.handle('adoptArtifact', { artifactId: original.id!, contentHash: original.contentHash!, expectedAdoptionRevision: 0, requestId: 'adopt-original' })
  const request = { conversationId: chat.id, artifactId: original.id!, contentHash: original.contentHash!, targetAgentId: agent.id, content: 'CLAUDE_REVISION empty-memory 交付固定原版的新版本', requestId: 'revision-original' }
  await expect(f.service.handle('reviseArtifact', { ...request, contentHash: '0'.repeat(64), requestId: 'stale-hash' })).rejects.toThrow()
  expect((await f.detail(chat.id)).workItems).toEqual(first.workItems)
  const accepted = await f.service.handle('reviseArtifact', request) as Message
  expect(await f.service.handle('reviseArtifact', request)).toEqual(accepted)
  const next = await f.settled(chat, 2, 2), replacement = next.artifacts.find(value => value.id !== original.id)!, newWork = next.workItems!.find(value => value.id !== oldWork.id)!
  expect(next.artifacts).toHaveLength(2); expect(next.workItems).toHaveLength(2); expect(next.workBudgets).toHaveLength(2)
  expect(replacement).toMatchObject({ logicalArtifactId: original.logicalArtifactId, contentVersion: 2, previousArtifactId: original.id, sourceWorkId: newWork.id })
  expect(newWork).toMatchObject({ status: 'delivered', rootWorkId: newWork.id, ownerAgentId: agent.id, sourceMessageId: accepted.id })
  expect(newWork.budgetId).not.toBe(oldWork.budgetId)
  expect(next.workItems!.find(value => value.id === oldWork.id)).toEqual(oldWork)
  expect(next.workBudgets!.find(value => value.id === oldBudget.id)).toEqual(oldBudget)
  expect(await readFile(original.path, 'utf8')).toBe('生产工具真实原件')
  expect(await readFile(replacement.path, 'utf8')).toBe('CLAUDE_REVISION\n生产工具真实新版\n')
  const revision = (await f.store.load<import('../src/shared/domain/artifacts').ArtifactRevisionRequest>('artifactRevisionRequests'))[0]
  expect(revision).toMatchObject({ artifactId: original.id, contentHash: original.contentHash, messageId: accepted.id, rootWorkId: newWork.id })
  expect(replacement.revisionRequestId).toBe(revision.id)
  const preview = await f.service.handle('getArtifactPreview', { id: replacement.id! }) as import('../src/shared/domain/artifacts').ArtifactPreview
  expect(preview.adoption.current?.artifactId).toBe(original.id)
  await f.service.handle('adoptArtifact', { artifactId: replacement.id!, contentHash: replacement.contentHash!, expectedAdoptionRevision: preview.adoption.revision, requestId: 'adopt-replacement' })
  const oldPreview = await f.service.handle('getArtifactPreview', { id: original.id! }) as import('../src/shared/domain/artifacts').ArtifactPreview
  expect(oldPreview.adoption.events.map(event => event.artifactId)).toEqual([original.id, replacement.id])
  const collections = ['messages', 'runs', 'workItems', 'workBudgets', 'budgetModelCalls', 'artifactRevisionRequests', 'artifactAdoptionEvents', 'claudeSessions'] as const
  const saved = await Promise.all(collections.map(name => f.store.load(name)))
  await f.restart()
  expect(await f.service.handle('reviseArtifact', request)).toEqual(accepted)
  expect(await Promise.all(collections.map(name => f.store.load(name)))).toEqual(saved)
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30000)

it('isolates two Claude group identities from their direct sessions and revokes a removed member until explicitly re-added', async () => {
  const f = await fixture(), { profile, agent, chat } = await f.create()
  const other = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), name: '另一位Claude' }) as DigitalAgent
  let group = await f.service.handle('createConversation', { kind: 'group', title: '独立员工群', agentIds: [agent.id, other.id] }) as Conversation
  await f.send(chat, 'empty-memory 私有单聊', 'direct-first'); await f.settled(chat, 1)
  await f.send(group, 'empty-memory 各自回答', 'group-first')
  const first = await f.settled(group, 2)
  expect(first.workItems).toEqual([])
  expect(new Set(first.messages.filter(m => m.senderType === 'agent').map(m => m.senderId))).toEqual(new Set([agent.id, other.id]))
  const sessions = await f.store.load<{ agentId: string; conversationId: string; threadId: string }>('claudeSessions')
  expect(sessions).toHaveLength(3); expect(new Set(sessions.map(s => s.threadId)).size).toBe(3)
  const old = sessions.find(s => s.agentId === other.id && s.conversationId === group.id)!
  expect(old).toBeTruthy()
  await expect(f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: agent.id, name: '群中编辑职责', instructions: '已明确更新的职责' })).resolves.toMatchObject({ id: agent.id })
  group = await f.service.handle('createConversation', { id: group.id, kind: 'group', title: group.title, agentIds: [agent.id] }) as Conversation
  await f.send(group, 'empty-memory 移除后的新消息', 'after-remove')
  const removed = await f.settled(group, 3)
  expect(removed.runs.filter(r => r.agentId === other.id)).toEqual(first.runs.filter(r => r.agentId === other.id))
  await f.restart()
  expect((await f.detail(group.id)).runs).toEqual(removed.runs)
  group = await f.service.handle('createConversation', { id: group.id, kind: 'group', title: group.title, agentIds: [agent.id, other.id] }) as Conversation
  await f.send(group, 'empty-memory 重新加入后的新消息', 'after-rejoin')
  await f.settled(group, 5)
  const next = (await f.store.load<typeof old>('claudeSessions')).find(s => s.agentId === other.id && s.conversationId === group.id)!
  expect(next.threadId).not.toBe(old.threadId)
  expect(await f.store.load('workItems')).toEqual([])
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it.each(['CLAUDE_GROUP_FILES', 'CLAUDE_GROUP_TASK'])('delivers %s through actual host tools with distinct owners, one original budget and no restart replay', async marker => {
  const f = await fixture(), { profile, agent } = await f.create()
  const other = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), name: 'Claude核查员' }) as DigitalAgent
  const group = await f.service.handle('createConversation', { kind: 'group', title: '真实分工', agentIds: [agent.id, other.id] }) as Conversation
  const delegated = marker === 'CLAUDE_GROUP_TASK'
  await f.send(group, `${marker} 交付原文件。请两位记住，我的长期偏好是简短答复。`, 'group-work', delegated ? [agent.id] : [])
  const result = await f.settled(group, delegated ? 3 : 2, 2)
  const works = result.workItems!
  expect(works).toHaveLength(2); expect(works.every(w => w.status === 'delivered' && !w.requiresReview)).toBe(true)
  expect(new Set(works.map(w => w.ownerAgentId))).toEqual(new Set([agent.id, other.id]))
  const source = result.messages.find(m => m.senderType === 'user')!
  expect(works.every(w => w.sourceMessageId === source.id)).toBe(true)
  expect(result.artifacts).toHaveLength(2)
  for (const artifact of result.artifacts) {
    const proof = JSON.parse(await readFile(artifact.path, 'utf8'))
    const work = works.find(w => w.id === proof.work)!
    expect(work).toBeTruthy(); expect(proof.owner).toBe(work.ownerAgentId)
    expect(work.artifactIds).toContain(artifact.id)
  }
  const budgets = await f.store.load<WorkBudget>('workBudgets')
  expect(budgets).toHaveLength(1)
  expect(budgets[0]).toMatchObject({ sourceMessageId: source.id, callUnit: 'external-turn', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
  expect(works.every(w => w.budgetId === budgets[0].id)).toBe(true)
  const calls = await f.store.load<{ id: string; budgetId?: string; runId: string; callUnit?: string }>('budgetModelCalls')
  const owned = calls.filter(c => c.budgetId === budgets[0].id)
  expect(owned).toHaveLength(budgets[0].modelCalls); expect(new Set(owned.map(c => c.id)).size).toBe(owned.length)
  expect(owned.every(c => c.callUnit === 'external-turn')).toBe(true)
  expect(new Set(owned.map(c => result.runs.find(r => r.id === c.runId)?.agentId))).toEqual(new Set([agent.id, other.id]))
  const memoryRuns = result.runs.filter(r => r.phase === 'memory')
  for (const work of works) {
    const maintenance = memoryRuns.filter(r => r.workId === work.id)
    expect(maintenance).toHaveLength(1)
    expect(maintenance[0]).toMatchObject({ status: 'completed', agentId: work.ownerAgentId })
    const published = result.runs.find(r => r.phase === 'execution' && r.disposition === 'delivered' && work.resultMessageIds.includes(r.messageId!))!
    expect(maintenance[0].turnId).toBe(published.turnId)
    expect(owned.filter(c => c.runId === maintenance[0].id)).toHaveLength(1)
  }
  const memories = await f.store.load<MemoryEntry>('memory')
  const preferences = memories.filter(m => m.content === '用户偏好简短答复' && !m.deletedAt)
  expect(preferences).toHaveLength(2)
  expect(new Set(preferences.map(m => m.ownerAgentId))).toEqual(new Set([agent.id, other.id]))
  expect(preferences.every(m => m.sourceMessageIds.includes(source.id) && m.conversationId === group.id)).toBe(true)
  if (delegated) {
    const parent = works.find(w => !w.parentWorkId)!, child = works.find(w => w.parentWorkId)!
    expect(child).toMatchObject({ parentWorkId: parent.id, rootWorkId: parent.id, ownerAgentId: other.id })
    expect(parent.waitRevision).toBeGreaterThan(0)
    expect(parent.requiredResults).toEqual([{ workId: child.id, resultVersion: 1 }])
    expect(parent.observedResults).toEqual([{ workId: child.id, resultVersion: child.resultVersion }])
  } else expect(works.every(w => !w.parentWorkId)).toBe(true)
  await f.restart()
  const after = await f.detail(group.id)
  expect(after.messages).toEqual(result.messages); expect(after.runs).toEqual(result.runs); expect(after.workItems).toEqual(works)
  expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  expect(await f.store.load('memory')).toEqual(memories)
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it('retains the original work preference after a progress update and directed delivery without opening a new task or budget', async () => {
  const f = await fixture(), { profile, agent } = await f.create()
  const other = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), name: 'Claude核查员' }) as DigitalAgent
  const group = await f.service.handle('createConversation', { kind: 'group', title: '原工作偏好来源', agentIds: [agent.id, other.id] }) as Conversation
  const source = await f.send(group, 'CLAUDE_GROUP_TASK CLAUDE_WITHHOLD_WAIT CLAUDE_WORK_MEMORY_SOURCE 交付原文件。我的长期偏好是简短答复。', 'work-preference', [agent.id]) as Message
  try {
    await expect.poll(() => readFile(join(f.root, 'withhold-parent-ready'), 'utf8').catch(() => ''), { timeout: 5000 }).not.toBe('')
    const before = await f.detail(group.id), budget = before.workBudgets![0]
    const update = await f.send(group, 'CLAUDE_WITHHOLD_UPDATE CLAUDE_WORK_MEMORY_SOURCE 只更新进度，不新增任务，不改变原分工。', 'progress-update') as Message
    await writeFile(join(f.root, 'withhold-parent-release'), '')
    await expect.poll(() => readFile(join(f.root, 'withhold-child-ready'), 'utf8').catch(() => ''), { timeout: 5000 }).not.toBe('')
    await writeFile(join(f.root, 'withhold-child-release'), '')
    const result = await f.settled(group, 3, 2), memories = await f.store.load<MemoryEntry>('memory')
    expect(result.workItems).toHaveLength(2)
    expect(result.workItems!.every(w => w.status === 'delivered' && w.sourceMessageId === source.id && w.budgetId === budget.id)).toBe(true)
    expect(result.workBudgets).toHaveLength(1)
    expect(result.workBudgets![0]).toMatchObject({ id: budget.id, deadlineAt: budget.deadlineAt, unknownCalls: 0, usageIncomplete: false })
    expect(result.artifacts).toHaveLength(2)
    const maintenance = result.runs.filter(r => r.phase === 'memory')
    expect(maintenance.every(r => r.status === 'completed' && r.triggerMessageId === update.id)).toBe(true)
    for (const employee of [agent, other]) {
      const saved = memories.filter(m => m.ownerAgentId === employee.id && !m.deletedAt)
      expect(saved).toEqual([expect.objectContaining({ content: '用户偏好简短答复', sourceMessageIds: [source.id], conversationId: group.id, evidence: 'preference' })])
    }
    const calls = await f.store.load<BudgetModelCall>('budgetModelCalls'), bytes = await Promise.all(result.artifacts.map(a => readFile(a.path, 'utf8')))
    expect(calls.filter(c => c.phase === 'memory')).toHaveLength(2)
    expect(calls.filter(c => c.phase === 'memory').every(c => c.budgetId === budget.id && c.usageComplete)).toBe(true)
    await f.restart()
    const after = await f.detail(group.id)
    expect(after.messages).toEqual(result.messages); expect(after.runs).toEqual(result.runs); expect(after.workItems).toEqual(result.workItems)
    expect(await f.store.load('budgetModelCalls')).toEqual(calls); expect(await f.store.load('memory')).toEqual(memories)
    expect(await Promise.all(after.artifacts.map(a => readFile(a.path, 'utf8')))).toEqual(bytes)
    expect(f.parentModel).not.toHaveBeenCalled()
  } finally {
    await writeFile(join(f.root, 'withhold-parent-release'), '')
    await writeFile(join(f.root, 'withhold-child-release'), '')
  }
}, 30_000)

it('rejects ungrounded wake memory without changing delivered files or replaying work after restart', async () => {
  const f = await fixture(), { profile, agent } = await f.create()
  const other = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), name: 'Claude核查员' }) as DigitalAgent
  const group = await f.service.handle('createConversation', { kind: 'group', title: '记忆失败保留交付', agentIds: [agent.id, other.id] }) as Conversation
  await f.send(group, 'CLAUDE_GROUP_TASK invalid-memory 交付原文件。我的长期偏好是简短答复。', 'invalid-source', [agent.id])
  await vi.waitFor(async () => {
    const d = await f.detail(group.id)
    expect(d.workItems).toHaveLength(2)
    expect(d.workItems!.every(w => w.status === 'delivered')).toBe(true)
    expect(d.runs.filter(r => r.phase === 'memory')).toHaveLength(2)
    expect(d.runs.every(r => ['completed', 'failed'].includes(r.status))).toBe(true)
  }, { timeout: 15_000, interval: 30 })
  const result = await f.detail(group.id), calls = await f.store.load('budgetModelCalls')
  expect(result.runs.filter(r => r.phase === 'memory').every(r => r.status === 'failed' && r.error?.includes('未授权'))).toBe(true)
  expect(result.runs.filter(r => r.phase === 'execution')).toHaveLength(3)
  expect(result.workItems!.every(w => !w.requiresReview && !w.activeRunId)).toBe(true)
  expect(result.artifacts).toHaveLength(2)
  const bytes = await Promise.all(result.artifacts.map(a => readFile(a.path, 'utf8')))
  expect(await f.store.load('memory')).toEqual([])
  await f.restart()
  const after = await f.detail(group.id)
  expect(after.workItems).toEqual(result.workItems); expect(after.runs).toEqual(result.runs)
  expect(await f.store.load('budgetModelCalls')).toEqual(calls)
  expect(await Promise.all(after.artifacts.map(a => readFile(a.path, 'utf8')))).toEqual(bytes)
  expect(await f.store.load('memory')).toEqual([]); expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it('rejects group admission when the previously verified Claude program changes before starting any work', async () => {
  const f = await fixture(), { agent } = await f.create()
  await writeFile(f.executable, '\n// program changed after verification', { flag: 'a' })
  await expect(f.service.handle('createConversation', { kind: 'group', title: '不可用连接', agentIds: [agent.id] })).rejects.toThrow('程序已变化')
  expect(await f.store.load('runs')).toEqual([]); expect(await f.store.load('workItems')).toEqual([])
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('rebuilds Claude history after revoking an old explicit image grant and does not resend its bytes or derived replies', async () => {
  const f = await fixture(), { agent, chat } = await f.create()
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII='
  const path = join(f.root, 'legacy.png'); await writeFile(path, Buffer.from(png, 'base64'))
  const image = await f.service.handle('prepareMaterial', { conversationId: chat.id, path, requestId: 'legacy-image', authorizedAgentIds: [agent.id] }) as ConversationMaterial
  await f.service.handle('sendMessage', { conversationId: chat.id, content: 'empty-memory 原图片', mentionIds: [], requestId: 'legacy-send', materialSelections: [{ id: image.id, revision: image.revision }] })
  const first = await f.settled(chat, 1)
  const prior = (await f.store.load<{ threadId: string }>('claudeSessions'))[0]
  const replies = first.messages.filter(message => message.senderType === 'agent').map(message => message.id)
  await f.service.handle('setMaterialAuthorization', { id: image.id, expectedRevision: image.revision, authorizedAgentIds: [] })
  await f.restart()
  expect((await f.detail(chat.id)).runs).toHaveLength(first.runs.length)
  await f.send(chat, 'empty-memory 撤权后的独立交流', 'revoked-chat')
  await f.settled(chat, 2)
  const current = (await f.store.load<{ threadId: string }>('claudeSessions'))[0]
  expect(current.threadId).not.toBe(prior.threadId)
  const directory = join(f.dataPath, 'agents', agent.id, 'workspace', 'sessions', chat.id, 'work')
  const received = JSON.parse(await readFile(join(directory, 'chat-received.json'), 'utf8'))
  expect(received.images).toEqual([])
  expect(received.payload.contextMode).toBe('initial')
  const prompt = JSON.stringify(received.payload)
  expect(prompt).not.toContain(png)
  for (const id of replies) expect(prompt).not.toContain(id)
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)

it('exports business records without Claude private files and restores with fresh-session eligibility and zero replay', async () => {
  const f = await fixture(), { agent, chat } = await f.create()
  await f.send(chat, 'empty-memory 首次聊天', 'before-backup')
  const original = await f.settled(chat, 1)
  const first = (await f.store.load<{ threadId: string }>('claudeSessions'))[0]
  const privateRelative = join('agents', agent.id, 'workspace', 'sessions', chat.id, '.claude-private')
  await mkdir(join(f.dataPath, privateRelative), { recursive: true })
  await writeFile(join(f.dataPath, privateRelative, 'private-sentinel'), 'synthetic-private-state')
  const backup = join(f.root, 'backup')
  await f.service.backup(backup)
  await expect(stat(join(backup, privateRelative))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(f.dataPath, privateRelative, 'private-sentinel'), 'utf8')).toBe('synthetic-private-state')
  const restored = await ProductStore.openReadOnly(join(backup, 'boai.sqlite')); cleanup.push(() => restored.close())
  expect(await restored.load('claudeRuntime')).toEqual([expect.objectContaining({ restorePending: true })])
  expect((await restored.load('claudeSessions')).length).toBe(1)
  await f.restart(backup)
  expect((await f.detail(chat.id)).messages).toEqual(original.messages)
  expect((await f.detail(chat.id)).runs).toHaveLength(original.runs.length)
  expect(await restored.load('claudeSessions')).toEqual([expect.objectContaining({ threadId: first.threadId, resumeInvalidated: 'restored-backup' })])
  expect(f.parentModel).not.toHaveBeenCalled()
  await f.send(chat, 'empty-memory 恢复后明确新交流', 'after-backup')
  const continued = await f.settled(chat, 2)
  expect(continued.messages.filter(m => m.content === '首次公开回复')).toHaveLength(2)
  expect((await restored.load<{ threadId: string }>('claudeSessions'))[0].threadId).not.toBe(first.threadId)
  expect(await restored.load('workItems')).toEqual([])
}, 30000)

it('passes original image bytes and text materials through Claude while keeping binary metadata honest, with restart and cleanup boundaries', async () => {
  const f = await fixture(), { agent, chat } = await f.create()
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII='
  const originals = [
    { name: 'image.png', bytes: Buffer.from(png, 'base64') },
    { name: 'reference.md', bytes: Buffer.from('明确材料原文 NATIVE_TEXT_CANARY') },
    { name: 'opaque.pdf', bytes: Buffer.from('%PDF-1.4\u0000NATIVE_BINARY_CANARY') },
  ], materials: ConversationMaterial[] = []
  for (const original of originals) {
    const path = join(f.root, original.name); await writeFile(path, original.bytes)
    materials.push(await f.service.handle('prepareMaterial', { conversationId: chat.id, path, requestId: original.name.replace('.', '-') }) as ConversationMaterial)
  }
  expect((await f.detail(chat.id)).messages).toEqual([])
  await f.service.handle('sendMessage', { conversationId: chat.id, content: 'empty-memory 读取附件', mentionIds: [], requestId: 'media', materialSelections: materials.map(({ id, revision }) => ({ id, revision })) })
  const first = await f.settled(chat, 1)
  const directory = join(f.dataPath, 'agents', agent.id, 'workspace', 'sessions', chat.id, 'work')
  const received = JSON.parse(await readFile(join(directory, 'media-received.json'), 'utf8'))
  expect(received).toMatchObject({ protocol: 'employee-chat-v1', images: [{ mime: 'image/png', hash: materials[0].contentHash }] })
  expect(first.workItems).toEqual([])
  const before = (await f.store.load<{ threadId: string }>('claudeSessions'))[0]
  for (const collection of ['messages', 'runs', 'snapshots', 'traceSpans', 'claudeSessions']) {
    const saved = JSON.stringify(await f.store.load(collection))
    expect(saved).not.toContain(png); expect(saved).not.toContain('NATIVE_BINARY_CANARY')
  }
  await f.restart()
  expect((await f.detail(chat.id)).runs).toHaveLength(first.runs.length)
  await f.send(chat, 'empty-memory 原图片接着聊', 'after-media')
  await f.settled(chat, 2)
  expect((await f.store.load<{ threadId: string }>('claudeSessions'))[0].threadId).toBe(before.threadId)
  await f.send(chat, '模块文件任务 empty-memory 使用原材料', 'media-task')
  const task = await f.settled(chat, 3)
  const artifact = task.artifacts[0]
  expect(artifact.materialSources?.map(source => source.id)).toEqual(expect.arrayContaining(materials.map(material => material.id)))
  const launch = JSON.parse(await readFile(join(directory, 'media-received.json'), 'utf8'))
  expect(launch.protocol).toBe('employee-task-v1')
  expect(launch.images).toEqual([{ mime: 'image/png', hash: materials[0].contentHash }])
  const prompt = JSON.stringify(launch.payload)
  expect(prompt).toContain('NATIVE_TEXT_CANARY'); expect(prompt).toContain('no text has been extracted')
  expect(prompt).not.toContain(png); expect(prompt).not.toContain('NATIVE_BINARY_CANARY')
  await f.service.handle('clearConversationHistory', { id: chat.id, hide: false })
  await f.restart()
  expect((await f.detail(chat.id)).materials?.every(material => material.status === 'removed')).toBe(true)
  expect(await f.store.load('claudeSessions')).toEqual([])
  expect(f.parentModel).not.toHaveBeenCalled()
}, 30_000)


it.each(([
  ['CLAUDE_BOBO_CREATE', 'employee_creation'],
  ['CLAUDE_BOBO_ONLY', 'organize_only'],
  ['CLAUDE_BOBO_EXECUTE', 'organize_and_execute'],
] as const).flatMap(([request, mode]) => (['fixture-model', 'deepseek-v4-pro'] as const).map(model => [request, mode, model] as const)))('runs Claude core organization %s / %s / %s with original identities and budget, without an API parent', async (request, mode, model) => {
  const f = await fixture(model), { profile, agent } = await f.create()
  const core = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: CORE_AGENT_ID, name: 'Claude核心助手' }) as DigitalAgent
  const chat = await f.service.handle('startCoreConversation', { requestId: request, content: request + ' empty-memory 按明确范围组织独立员工。' }) as Conversation
  await f.settled(chat, 1)
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const operations = await f.store.load<import('../src/shared/domain/bobo-collaboration').BoboCollaborationOperation>('boboCollaborations')
  expect(operations).toHaveLength(1)
  const operation = operations[0]
  expect(operation).toMatchObject({ mode, status: 'committed', executionBackend: core.executionBackend, connectionId: f.connection.id, modelId: model, sourceConversationId: chat.id })
  expect(snapshot.agents.find(a => a.id === agent.id)).toEqual(agent)
  expect(operation.agents).toHaveLength(1)
  expect(operation.agents[0]).toMatchObject({ executionBackend: core.executionBackend, connectionId: f.connection.id, modelId: model, allowBrowser: false, allowCommands: false })
  expect(new Set([core.id, agent.id, operation.agents[0].id]).size).toBe(3)
  const group = snapshot.conversations.find(c => c.id === operation.groupConversationId)
  if (mode === 'employee_creation') expect(group).toBeUndefined()
  else {
    expect(group!.agentIds).toEqual([core.id, agent.id, operation.agents[0].id])
    expect((await f.detail(group!.id)).messages[0]).toMatchObject({ senderId: core.id, content: operation.announcement!.content })
    await expect(f.service.handle('createConversation', { kind: 'group', title: '非法手动群', agentIds: [core.id, agent.id] })).rejects.toThrow('普通建群不能添加核心助手')
    if (mode === 'organize_and_execute') {
      await f.settled(group!, 3)
      const detail = await f.detail(group!.id)
      expect(detail.workItems).toHaveLength(2)
      expect(detail.workItems!.every(w => w.status === 'delivered' && w.budgetId === operation.budgetId)).toBe(true)
      expect(detail.artifacts).toHaveLength(2)
    } else {
      expect((await f.detail(group!.id)).workItems).toEqual([])
      expect((await f.detail(group!.id)).runs).toEqual([])
    }
  }
  const before = { works: await f.store.load('workItems'), calls: await f.store.load('budgetModelCalls'), runs: await f.store.load('runs'), operations: await f.store.load('boboCollaborations') }
  const phaseCalls = await f.store.load<import('../src/runtime/modules/profile/profile-activity').ProfileModelCall>('profileModelCalls')
  const runs = await f.store.load<AgentRun>('runs'), works = await f.store.load<WorkItem>('workItems')
  const taskCalls = phaseCalls.filter(call => call.phase === 'task')
  expect(taskCalls.length).toBeGreaterThan(0)
  for (const call of taskCalls) {
    const workId = runs.find(run => run.id === call.runId)?.workId
    const organization = works.find(work => work.id === workId)?.organization
    expect(call.thinking).toBe(model === 'deepseek-v4-pro' && organization ? 'low' : undefined)
  }
  expect(await f.store.load('workBudgets')).toHaveLength(1)
  expect(f.parentModel).not.toHaveBeenCalled()
  await f.restart()
  expect(await f.store.load('workItems')).toEqual(before.works)
  expect(await f.store.load('budgetModelCalls')).toEqual(before.calls)
  expect(await f.store.load('runs')).toEqual(before.runs)
  expect(await f.store.load('boboCollaborations')).toEqual(before.operations)
  expect(f.parentModel).not.toHaveBeenCalled()
})

it('creates a named team from Claude core while preserving the user name and explicit runtime source', async () => {
  const f = await fixture(), { profile } = await f.create()
  const core = await f.service.handle('saveAgent', { ...f.agentInput(profile.id), id: CORE_AGENT_ID }) as DigitalAgent
  const chat = await f.service.handle('startCoreConversation', { requestId: 'claude-named-team', team: { name: '用户指定团队', requirements: 'CLAUDE_NAMED_TEAM empty-memory 创建一个核查员工。' } }) as Conversation
  await f.settled(chat, 1)
  const operations = await f.store.load<import('../src/shared/domain/team-creation').TeamCreationOperation>('teamCreations')
  expect(operations).toHaveLength(1)
  const operation = operations[0]
  expect(operation).toMatchObject({ status: 'committed', executionBackend: core.executionBackend, connectionId: f.connection.id, modelId: 'fixture-model' })
  expect(operation.conversation!.title).toBe('用户指定团队')
  expect(operation.agents).toHaveLength(1)
  expect(operation.agents[0]).toMatchObject({ executionBackend: core.executionBackend, connectionId: f.connection.id, modelId: 'fixture-model', allowBrowser: false, allowCommands: false })
  expect(f.parentModel).not.toHaveBeenCalled()
  const works = await f.store.load('workItems'), calls = await f.store.load('budgetModelCalls')
  await f.restart()
  expect(await f.store.load('teamCreations')).toEqual(operations)
  expect(await f.store.load('workItems')).toEqual(works)
  expect(await f.store.load('budgetModelCalls')).toEqual(calls)
})
