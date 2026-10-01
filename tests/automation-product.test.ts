/*
 * [INPUT]: 独立产品数据库、真实 AppService、受控模型及固定日历规则。
 * [OUTPUT]: 核心预置身份与普通员工场景隔离，保留原业务断言；连接地址变化/删除后拒绝旧授权且重启不补执行；超过摘要上限的待处理分类/稳定分页/解除与旧触发最新结束结果；真实结果入通知账本、宿主回执与业务交付/预算隔离；超过 300 条持久历史的稳定边界/筛选/重启；独立任务聊天/普通单聊复用、原始权限/来源、初始化失败、时间预览与星期规则不变量验证。
 * [POS]: 自动化产品目标与任务上下文集成验收；不运行用户真实计划或外部模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { AutomationDefinition, AutomationHistoryPage, AutomationInput, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, Snapshot } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { AppService } from '../src/runtime/service'
import { automationCron, matchesSchedule, nextTimes } from '../src/runtime/modules/automations/schedule-policy'
import { automationNeedsAttention } from '../src/shared/domain/automations'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
async function until(check: () => Promise<boolean>) { const start = Date.now(); while (!await check()) { if (Date.now() - start > 8000) throw new Error('condition did not settle'); await new Promise(resolve => setTimeout(resolve, 20)) } }
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-product-')); disposers.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = []
  const engine: AgentEngine = { test: async () => '', decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => { contexts.push(ctx); await ctx.onDelta('当前聊天的回复') } }
  const make = async () => { const service = new AppService({ dataPath: root, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); disposers.push(() => service.close()); await service.init(); return service }
  const service = await make()
  const connection = await service.handle('saveConnection', { name: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'local' }) as Connection
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await service.handle('saveAgent', { ...agent, connectionId: connection.id, allowCommands: false })
  const input: AutomationInput = { name: '独立日报', prompt: '整理本次获准资料', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }
  const view = () => service.handle('listAutomations', undefined) as Promise<AutomationsView>
  const detail = (id: string) => service.handle('getConversation', { id }) as Promise<ConversationDetail>
  return { root, service, make, input, view, detail, contexts }
}
it('creates two isolated task chats for one employee and still reuses the ordinary personal chat', async () => {
  const f = await setup()
  const employeeIds = (await f.service.handle('snapshot', undefined) as Snapshot).agents.map(agent => agent.id)
  const personalInput = { kind: 'direct', title: '人工会话', agentIds: ['researcher'] }
  const personal = await f.service.handle('createConversation', personalInput) as Conversation
  await f.service.handle('sendMessage', { conversationId: personal.id, content: '这段人工历史不属于自动化', mentionIds: [], requestId: 'personal' })
  await until(async () => (await f.detail(personal.id)).turns?.every(t => t.status === 'completed') === true)
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'first' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.status === 'completed')
  const second = await f.service.handle('runAutomation', { id: plan.id, requestId: 'second' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === second.id)?.status === 'completed')
  expect(new Set([personal.id, first.conversationId, second.conversationId]).size).toBe(3)
  const one = await f.detail(first.conversationId), two = await f.detail(second.conversationId)
  expect(one.conversation).toMatchObject({ purpose: 'automation', automationId: plan.id, occurrenceId: first.id, agentIds: ['researcher'], sharedKnowledgeIds: [] })
  expect(two.conversation.workspacePath).not.toBe(one.conversation.workspacePath)
  expect(one.workBudgets![0].id).not.toBe(two.workBudgets![0].id)
  for (const id of [first.conversationId, second.conversationId]) {
    const ctx = f.contexts.find(ctx => ctx.conversation.id === id)!
    expect(ctx.messages.map(m => m.content)).toEqual([f.input.prompt])
    expect(ctx.messages.every(m => m.conversationId === id)).toBe(true)
    expect(ctx.workspace!.sharedPath).toBe(join(f.root, 'workspaces', id))
  }
  expect(await f.service.handle('createConversation', personalInput)).toMatchObject({ id: personal.id })
  expect((await f.service.handle('snapshot', undefined) as Snapshot).agents.map(agent => agent.id)).toEqual(employeeIds)
  await f.service.close()
  const restarted = await f.make()
  expect(await restarted.handle('createConversation', personalInput)).toMatchObject({ id: personal.id })
  const restored = await restarted.handle('listAutomations', undefined) as AutomationsView
  expect(restored.occurrences.map(o => o.conversationId).sort()).toEqual([first.conversationId, second.conversationId].sort())
  expect(f.contexts.filter(ctx => ctx.conversation.purpose === 'automation')).toHaveLength(2)
})
it('does not initialize another task chat for a repeated manual trigger, including after history cleanup', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const [a, b] = await Promise.all(['same', 'same'].map(requestId => f.service.handle('runAutomation', { id: plan.id, requestId }) as Promise<AutomationOccurrence>))
  expect(a.id).toBe(b.id); expect(a.conversationId).toBe(b.conversationId)
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  const before = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.length
  await f.service.handle('clearConversationHistory', { id: a.conversationId, hide: false })
  expect(await f.service.handle('runAutomation', { id: plan.id, requestId: 'same' })).toMatchObject({ id: a.id, conversationId: a.conversationId })
  expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations).toHaveLength(before)
  expect((await f.detail(a.conversationId)).messages).toEqual([])
  expect(f.contexts).toHaveLength(1)
})
it('records a failed workspace initialization without dispatching or allocating a model budget', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const before = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.length
  const path = join(f.root, 'workspaces'), backup = join(f.root, 'workspaces-held')
  await rename(path, backup); await writeFile(path, 'not a directory')
  try {
    const o = await f.service.handle('runAutomation', { id: plan.id, requestId: 'bad-directory' }) as AutomationOccurrence
    expect(o).toMatchObject({ status: 'failed', deliveryStatus: 'unknown' })
    expect(o.reason).toContain('初始化失败'); expect(o.messageId).toBeUndefined(); expect(o.budgetId).toBeUndefined()
    expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations).toHaveLength(before)
    expect(f.contexts).toEqual([])
    expect(await f.service.handle('runAutomation', { id: plan.id, requestId: 'bad-directory' })).toMatchObject({ id: o.id })
  } finally { await rm(path); await rename(backup, path) }
})
it('keeps old plans on their existing chat and rejects missing, ambiguous, or disallowed new-chat targets', async () => {
  const f = await setup(), personal = await f.service.handle('createConversation', { kind: 'direct', title: '原聊天', agentIds: ['researcher'] }) as Conversation
  const { conversationPolicy, employeeIds, ...legacy } = f.input
  const old = await f.service.handle('saveAutomation', { ...legacy, conversationId: personal.id }) as AutomationDefinition
  expect(old).toMatchObject({ conversationPolicy: 'existing-conversation', conversationId: personal.id })
  const run = await f.service.handle('runAutomation', { id: old.id, requestId: 'old-plan' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  expect(run.conversationId).toBe(personal.id)
  await expect(f.service.handle('saveAutomation', { ...f.input, employeeIds: [] })).rejects.toThrow()
  await expect(f.service.handle('saveAutomation', { ...f.input, conversationId: personal.id })).rejects.toThrow()
  await expect(f.service.handle('saveAutomation', { ...f.input, employeeIds: ['unknown'] })).rejects.toThrow()
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await f.service.handle('saveAgent', { ...agent, allowCommands: true })
  expect(await f.service.handle('runAutomation', { id: plan.id, requestId: 'revoked' })).toMatchObject({ status: 'skipped' })
  expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations.some(c => c.automationId === plan.id)).toBe(false)
})
it.each(['address-changed', 'removed'] as const)('does not reuse saved automation authority when its connection is %s, including after restart', async change => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const before = await f.service.handle('snapshot', undefined) as Snapshot
  const connection = before.connections.find(c => c.id === before.agents.find(a => a.id === 'researcher')!.connectionId)!
  if (change === 'removed') await f.service.handle('deleteConnection', { id: connection.id })
  else await f.service.handle('saveConnection', { id: connection.id, name: connection.name, provider: connection.provider, baseUrl: 'http://127.0.0.1:2', defaultModel: connection.defaultModel })
  const request = { id: plan.id, requestId: 'changed-authority' }
  const skipped = await f.service.handle('runAutomation', request) as AutomationOccurrence
  expect(skipped).toMatchObject({ status: 'skipped', attentionReason: 'authorization' })
  expect(skipped.budgetId).toBeUndefined()
  expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations).toEqual(before.conversations)
  expect(f.contexts).toEqual([])
  await f.service.close()
  const restarted = await f.make()
  expect(await restarted.handle('runAutomation', request)).toMatchObject({ id: skipped.id, status: 'skipped', attentionReason: 'authorization' })
  expect((await restarted.handle('snapshot', undefined) as Snapshot).conversations).toEqual(before.conversations)
  expect(f.contexts).toEqual([])
})

it('previews workdays and multiple weekdays using the same calendar rule without creating a plan or workspace', async () => {
  const f = await setup(), before = await readdir(join(f.root, 'workspaces'))
  const schedule = { frequency: 'weekly' as const, time: '09:15', weekday: 1, daysOfWeek: [1, 2, 3, 4, 5], timezone: 'Asia/Singapore' }
  const preview = await f.service.handle('previewAutomation', schedule) as { nextTimes: string[] }
  expect(preview.nextTimes).toHaveLength(5)
  expect(preview.nextTimes.every(t => matchesSchedule(schedule, Date.parse(t)))).toBe(true)
  expect(automationCron(schedule)).toBe('15 9 * * 1,2,3,4,5')
  const selected = { ...schedule, daysOfWeek: [4, 2, 2] }
  expect(automationCron(selected)).toBe('15 9 * * 2,4')
  const dates = nextTimes({ ...selected, cron: automationCron(selected) }, 3, new Date('2026-09-28T00:00:00Z'))
  expect(dates).toEqual(['2026-09-29T01:15:00.000Z', '2026-10-01T01:15:00.000Z', '2026-10-06T01:15:00.000Z'])
  await expect(f.service.handle('previewAutomation', { ...schedule, daysOfWeek: [] })).rejects.toThrow('至少选择')
  await expect(f.service.handle('previewAutomation', { ...schedule, timezone: 'invalid' })).rejects.toThrow('时区')
  expect((await f.view()).definitions).toEqual([])
  expect(await readdir(join(f.root, 'workspaces'))).toEqual(before)
  expect(f.contexts).toEqual([])
})

it('paginates all persisted history past the summary cap with stable ties, filters and insertion boundaries', async () => {
  const f = await setup(), store = new ProductStore(join(f.root, 'boai.sqlite'))
  await store.init(); disposers.push(() => store.close())
  const records: AutomationOccurrence[] = Array.from({ length: 365 }, (_, index) => ({ schemaVersion: 1, id: `history-${String(index).padStart(4, '0')}`, stateVersion: 1, automationId: index % 2 ? 'one' : 'two', name: '历史运行', source: 'manual', startedAt: new Date(Date.UTC(2025, 0, 1, 0, 0, Math.floor(index / 3))).toISOString(), scheduledFor: new Date(0).toISOString(), status: 'completed', deliveryStatus: 'unknown', conversationId: 'historical-chat', runIds: [], resultMessageIds: [], usageIncomplete: true }))
  await store.write(records.map(value => ({ collection: 'automationOccurrences', id: value.id, value })))
  const read = (before?: AutomationHistoryPage['nextCursor'], automationId?: string) => f.service.handle('listAutomationHistory', { before, automationId, limit: 17 }) as Promise<AutomationHistoryPage>
  const first = await read()
  const newest = { ...records[0], id: 'newer-insert', startedAt: new Date().toISOString() }
  await store.write([{ collection: 'automationOccurrences', id: newest.id, value: newest }])
  const ids = first.occurrences.map(o => o.id)
  let cursor = first.nextCursor
  while (cursor) { const page = await read(cursor); ids.push(...page.occurrences.map(o => o.id)); cursor = page.nextCursor }
  expect(ids).toEqual([...records].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)).map(o => o.id))
  expect(new Set(ids).size).toBe(365)
  expect((await read()).occurrences[0].id).toBe(newest.id)
  const filtered = await read(undefined, 'one')
  expect(filtered.occurrences.every(o => o.automationId === 'one')).toBe(true)
  expect((await read(undefined, 'missing')).occurrences).toEqual([])
  await expect(f.service.handle('listAutomationHistory', { limit: 0 })).rejects.toThrow()
  await expect(f.service.handle('listAutomationHistory', { limit: 101 })).rejects.toThrow()
  await expect(f.service.handle('listAutomationHistory', { before: { startedAt: 'invalid', id: 'x' } })).rejects.toThrow()
  // Removing the boundary row cannot make later pages shift or repeat records.
  await store.write([], [{ collection: 'automationOccurrences', id: first.nextCursor!.id }])
  expect((await read(first.nextCursor)).occurrences.map(o => o.id)).toEqual(ids.slice(17, 34))
  await f.service.close()
  const restarted = await f.make()
  expect((await restarted.handle('listAutomationHistory', { before: first.nextCursor, limit: 17 }) as AutomationHistoryPage).occurrences.map(o => o.id)).toEqual(ids.slice(17, 34))
  expect(f.contexts).toEqual([])
})

it('persists real result notification intents and host receipts without changing delivery or model usage', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', { ...f.input, notificationPolicy: 'all_results' }) as AutomationDefinition
  const o = await f.service.handle('runAutomation', { id: plan.id, requestId: 'notification' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(item => item.id === o.id)?.status === 'completed')
  const before = (await f.view()).occurrences[0], notice = await f.service.takeAutomationNotice()
  expect(notice).toMatchObject({ occurrenceId: o.id, conversationId: o.conversationId, messageId: before.resultMessageIds.at(-1), status: 'submitting' })
  await f.service.settleAutomationNotice({ id: notice!.id, attemptId: notice!.attemptId!, status: 'submitted' })
  const result = await f.service.handle('getAutomationOccurrence', { id: o.id }) as AutomationHistoryPage['occurrences'][number]
  expect(result.notices).toMatchObject([{ status: 'submitted' }])
  expect(result).toMatchObject({ deliveryStatus: 'unknown', budgetId: before.budgetId, modelCalls: before.modelCalls })
  expect(await f.service.takeAutomationNotice()).toBeNull()
  expect(f.contexts).toHaveLength(1)
  await expect(f.service.handle('__takeAutomationNotice' as never, undefined)).rejects.toThrow()
})

it('finds unresolved work beyond 300 recent records and promotes an older trigger when its result finishes later', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init(); disposers.push(() => store.close())
  const base: AutomationOccurrence = { schemaVersion: 1, id: 'old-waiting', stateVersion: 1, automationId: plan.id, name: '旧待处理事项', source: 'manual', startedAt: '2025-01-01T00:00:00.000Z', scheduledFor: '2025-01-01T00:00:00.000Z', status: 'waiting_user', deliveryStatus: 'pending', conversationId: 'historical-chat', runIds: [], resultMessageIds: [], usageIncomplete: true }
  const attention: AutomationOccurrence[] = [base,
    { ...base, id: 'approval', status: 'waiting_approval' }, { ...base, id: 'failed', status: 'failed' },
    { ...base, id: 'interrupted', status: 'interrupted' }, { ...base, id: 'review', status: 'needs_review' },
    { ...base, id: 'denied', status: 'skipped', attentionReason: 'authorization' },
    { ...base, id: 'exhausted', status: 'cancelled', cancellationCause: 'budget' },
    { ...base, id: 'undelivered', status: 'completed', deliveryStatus: 'blocked' },
    { ...base, id: 'partial', status: 'completed', deliveryStatus: 'partial' },
    { ...base, id: 'deleted-plan-failure', automationId: 'deleted-plan', status: 'failed' },
  ]
  const quiet: AutomationOccurrence[] = [
    ...Array.from({ length: 330 }, (_, index): AutomationOccurrence => ({ ...base, id: `recent-${String(index).padStart(4, '0')}`, startedAt: '2025-02-01T00:00:00.000Z', status: 'completed', deliveryStatus: 'unknown' })),
    { ...base, id: 'waiting-peer', status: 'waiting_work' }, { ...base, id: 'running', status: 'running' },
    { ...base, id: 'ordinary-skip', status: 'skipped' }, { ...base, id: 'user-stop', status: 'cancelled', cancellationCause: 'user' },
    { ...base, id: 'delivered', status: 'completed', deliveryStatus: 'delivered' },
    { ...base, id: 'unchanged', status: 'completed', deliveryStatus: 'no_change' },
  ]
  await store.write([...quiet, ...attention].map(value => ({ collection: 'automationOccurrences', id: value.id, value })))
  const view = await f.view()
  expect(view.occurrences).toHaveLength(300)
  expect(view.occurrences.every(o => o.id.startsWith('recent-'))).toBe(true)
  expect(view.attentionCount).toBe(10)
  expect(view.definitions[0]).toMatchObject({ attentionCount: 9, latestOccurrence: { id: 'recent-0329' } })
  const read = (before?: AutomationHistoryPage['nextCursor'], automationId?: string) => f.service.handle('listAutomationHistory', { attentionOnly: true, before, automationId, limit: 3 }) as Promise<AutomationHistoryPage>
  const ids: string[] = []; let cursor: AutomationHistoryPage['nextCursor']
  do { const page = await read(cursor); ids.push(...page.occurrences.map(o => o.id)); cursor = page.nextCursor } while (cursor)
  const expected = ['undelivered', 'review', 'partial', 'old-waiting', 'interrupted', 'failed', 'exhausted', 'denied', 'deleted-plan-failure', 'approval']
  expect(ids).toEqual(expected)
  expect([...quiet, ...attention].filter(automationNeedsAttention).map(o => o.id).sort()).toEqual([...expected].sort())
  expect((await read(undefined, 'deleted-plan')).occurrences.map(o => o.id)).toEqual(['deleted-plan-failure'])
  expect((await read(undefined, 'missing')).occurrences).toEqual([])
  await expect(f.service.handle('listAutomationHistory', { attentionOnly: 'true' })).rejects.toThrow()
  // Resolving a question removes it from attention, without resetting its original trigger identity.
  const completed = { ...base, stateVersion: 2, status: 'completed' as const, deliveryStatus: 'delivered' as const, finishedAt: '2025-03-01T00:00:00.000Z', resultMessageIds: ['actual-result'] }
  await store.write([{ collection: 'automationOccurrences', id: base.id, value: completed }])
  const after = await f.view()
  expect(after.attentionCount).toBe(9)
  expect(after.definitions[0]).toMatchObject({ attentionCount: 8, latestOccurrence: { id: base.id, resultMessageIds: ['actual-result'] } })
  expect(after.occurrences.some(o => o.id === base.id)).toBe(false)
  expect((await f.service.handle('listAutomationHistory', { attentionOnly: true, limit: 100 }) as AutomationHistoryPage).occurrences.map(o => o.id)).toEqual(expected.filter(id => id !== base.id))
  expect(f.contexts).toEqual([])
})
