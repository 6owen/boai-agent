/*
 * [INPUT]: 真实 SQLite/产品服务、隔离模型与结构化草稿候选。
 * [OUTPUT]: 创建跨连接/重启去重、删除不重建、全量分页搜索、无授权不选人及草稿零执行验收。
 * [POS]: 定时任务体验简化的合同和持久化测试，不调用真实模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'
import { validateAutomationDraft } from '../packages/runtime/src/modules/automations/automation-draft'
import { AppService } from '../packages/runtime/src/service'
import type { AutomationDraftRequest, AutomationDraftResult, AutomationInput, AutomationOccurrence } from '../packages/shared/src/domain/automations'
import type { Connection, Snapshot } from '../packages/shared/src/domain'
const dispose: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of dispose.splice(0).reverse()) await fn() })
async function database() {
  const root = await mkdtemp(join(tmpdir(), 'boai-schedules-simplified-')); dispose.push(() => rm(root, { recursive: true, force: true }))
  const connect = async () => { const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); dispose.push(() => store.close()); return store }
  return { root, connect, store: await connect() }
}
const input: AutomationInput = { requestId: 'one-intent', name: '日报', prompt: '整理项目', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], enabled: false, notify: false, notificationPolicy: 'muted' }
it('creates one plan across concurrent writers and restart, and never resurrects a deleted creation receipt', async () => {
  const f = await database(), first = new AutomationRepository(f.store, f.root), other = new AutomationRepository(await f.connect(), f.root)
  const results = await Promise.all([first.save(input, 'authorized'), other.save(input, 'authorized')])
  expect(results[0].id).toBe(results[1].id)
  expect(results.every(d => d.revision === 1)).toBe(true)
  expect(await f.store.load('automations')).toHaveLength(1)
  expect(await f.store.load('automationCreations')).toHaveLength(1)
  const restarted = new AutomationRepository(await f.connect(), f.root)
  expect((await restarted.save({ ...input, name: '迟到的不同内容' }, 'authorized')).id).toBe(results[0].id)
  expect(await restarted.creation(input.requestId)).toMatchObject({ name: '日报', enabled: false, notificationPolicy: 'muted' })
  await restarted.pause(results[0].id, true)
  await expect(first.save(input, 'authorized')).rejects.toThrow('已删除')
  await expect(first.creation(input.requestId)).rejects.toThrow('已删除')
  expect(await first.save({ ...input, requestId: 'new-intent' }, 'authorized')).not.toMatchObject({ id: results[0].id })
})
it('commits the creation receipt and plan together, never acknowledging a half-saved plan', async () => {
  const f = await database(), repository = new AutomationRepository(f.store, f.root)
  const transaction = f.store.transaction.bind(f.store)
  f.store.transaction = fn => transaction(tx => fn({ ...tx, put: async row => { if (row.collection === 'automationCreations') throw new Error('receipt fault'); await tx.put(row) } }))
  await expect(repository.save(input, 'authorized')).rejects.toThrow('receipt fault')
  expect(await f.store.load('automations')).toEqual([])
  f.store.transaction = transaction
  expect(await repository.creation(input.requestId)).toBeNull()
  await repository.save(input, 'authorized')
  expect(await f.store.load('automations')).toHaveLength(1)
})
it('searches all historical names before stable pagination and distinguishes completed runs from delivery', async () => {
  const f = await database()
  const records = Array.from({ length: 340 }, (_, n): AutomationOccurrence => ({ schemaVersion: 1, id: String(n).padStart(4, '0'), stateVersion: 1, automationId: 'deleted-plan', name: n < 36 ? '旧计划_%' : '新任务', source: 'manual', scheduledFor: '2026-09-20T09:00:00.000Z', startedAt: '2026-09-20T09:00:00.000Z', status: n === 0 ? 'cancelling' : n === 1 ? 'waiting_work' : 'completed', deliveryStatus: n === 2 ? 'partial' : 'unknown', conversationId: 'old-chat', runIds: [], resultMessageIds: [], usageIncomplete: true }))
  await f.store.write(records.map(value => ({ collection: 'automationOccurrences', id: value.id, value })))
  const a = await f.store.automationHistory({ search: '_%', status: 'completed', limit: 20 }), b = await f.store.automationHistory({ search: '_%', status: 'completed', before: a.nextCursor, limit: 20 })
  expect(a.occurrences).toHaveLength(20); expect(b.occurrences).toHaveLength(14)
  expect(new Set([...a.occurrences, ...b.occurrences].map(o => o.id)).size).toBe(34)
  expect(a.occurrences.every(o => o.deliveryStatus !== 'delivered')).toBe(true)
  expect((await f.store.automationHistory({ search: '_%', status: 'active', limit: 20 })).occurrences.map(o => o.status)).toEqual(['waiting_work', 'cancelling'])
  expect((await f.store.automationHistory({ search: '_%', status: 'attention', limit: 20 })).occurrences.map(o => o.id)).toEqual(['0002'])
  expect((await f.store.automationHistory({ search: "' OR 1=1", limit: 20 })).occurrences).toEqual([])
})
const request: AutomationDraftRequest = { draftId: 'draft', version: 3, requestId: 'generation', connectionId: 'connection', instruction: '让研究员每个工作日九点整理资料', timezone: 'Asia/Singapore' }
const candidate = { name: '资料日报', prompt: '整理资料', target: { kind: 'employee', name: '研究员' }, frequency: 'workdays', time: '09:00', daysOfWeek: [], timezone: null, notificationPolicy: 'important_only', unsupported: [] }
it('resolves only explicit unambiguous permitted targets and previews the exact supported calendar', () => {
  const targets = [{ kind: 'employee' as const, id: 'researcher', name: '研究员' }]
  const result = validateAutomationDraft(request, candidate, targets)
  expect(result.candidate).toMatchObject({ employeeIds: ['researcher'], frequency: 'weekly', daysOfWeek: [1,2,3,4,5], timezone: 'Asia/Singapore' })
  expect(result.nextTimes).toHaveLength(5); expect(result.questions).toEqual([])
  for (const [instruction, candidates] of [[request.instruction, [...targets, { ...targets[0], id: 'duplicate' }]], ['每个工作日九点整理资料', targets], [request.instruction, []]] as const) {
    expect(validateAutomationDraft({ ...request, instruction }, candidate, [...candidates]).candidate.employeeIds).toEqual([])
  }
  const incomplete = validateAutomationDraft(request, { ...candidate, target: null, time: null }, targets)
  expect(incomplete.questions).toHaveLength(2); expect(incomplete.candidate.time).toBe(''); expect(incomplete.nextTimes).toEqual([])
  const unsupported = validateAutomationDraft(request, { ...candidate, unsupported: ['暂不支持每月'] }, targets)
  expect(unsupported.nextTimes).toEqual([]); expect(unsupported.candidate.time).toBe('')
  expect(validateAutomationDraft(request, { ...candidate, timezone: 'Invalid/Zone' }, targets).questions.join('')).toContain('时区')
})
it('records extraction usage without creating plans, conversations, work or occurrences and rejects repeated model requests', async () => {
  const f = await database(); let calls = 0
  const service = new AppService({ dataPath: f.root, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {}, engine: { test: async () => '', run: async () => {}, draftAutomation: async ctx => { calls++; expect(ctx.targets).toContainEqual({ kind: 'employee', id: 'researcher', name: '研究员' }); await ctx.onUsage({ inputTokens: 17 }); return candidate } } })
  dispose.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: '草稿模型', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...fields } = agent
  await service.handle('saveAgent', { ...fields, connectionId: connection.id })
  const result = await service.handle('generateAutomationDraft', { ...request, connectionId: connection.id }) as AutomationDraftResult
  expect(result).toMatchObject({ draftId: request.draftId, version: 3, candidate: { employeeIds: ['researcher'] }, usage: { inputTokens: 17 } })
  for (const collection of ['automations', 'automationOccurrences', 'workItems', 'workBudgets', 'conversations']) expect(await f.store.load(collection)).toEqual([])
  expect(await f.store.load('automationDraftCalls')).toMatchObject([{ id: request.requestId, status: 'completed', usage: { inputTokens: 17 } }])
  await expect(service.handle('generateAutomationDraft', { ...request, connectionId: connection.id })).rejects.toThrow('已经受理')
  expect(calls).toBe(1)
})
