/*
 * [OUTPUT]: 群计划误填employeeId须给出可执行纠错，拒绝期间零创建；同key省略归属字段后沿原群保存。
 * [OUTPUT]: bobo专用创建会话单员工保存、同请求幂等和普通核心/员工越权拒绝。
 * [OUTPUT]: 模型目录对象根和跨供应商regex保持运行时动作/路径拒绝，不放松校验。
 * [OUTPUT]: 官方MCP工具列表schema验证所有产品工具，防止一个非法根schema使整份目录不可用。
 * [INPUT]: 真实AppService/SQLite、隔离员工消息与共享API/native产品工具。
 * [OUTPUT]: 原消息计划保存/编辑/暂停回执、过期版本/跨归属/终态撤权及分页前筛选验证。
 * [POS]: 员工对话自动化管理合同检查，无真实供应商请求。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createNativeProducts } from '../packages/runtime/src/adapters/native-products'
import { z } from 'zod'
import { automationCommandSchema, automationCommandToolSchema } from '../packages/runtime/src/modules/automations/automation-commands'
import { monitorPolicySchema } from '../packages/runtime/src/modules/automations/automation-monitor'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { AutomationDefinition, AutomationInput, AutomationListPage, Conversation, ConversationDetail, Snapshot } from '../packages/shared/src/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const plan: AutomationInput = { name: '日报', prompt: '总结获准资料', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-plan-commands-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  let handler: (ctx: EngineContext) => Promise<void> = async () => {}, current: EngineContext | undefined
  const service = new AppService({ dataPath: root, emit: () => {}, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, engine: { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => { current = ctx; await handler(ctx); await ctx.onDelta('根据实际回执回复') } } })
  cleanup.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as { id: string }
  for (const id of ['researcher', 'writer']) {
    const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === id)!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...fields } = agent
    await service.handle('saveAgent', { ...fields, connectionId: connection.id, allowCommands: false })
  }
  const chat = await service.handle('createConversation', { kind: 'direct', title: '计划对话', agentIds: ['researcher'] }) as Conversation
  const send = async (fn: typeof handler, conversationId = chat.id) => {
    handler = fn
    await service.handle('sendMessage', { conversationId, content: '按本轮明确要求管理自动化', mentionIds: [], requestId: crypto.randomUUID() })
    await expect.poll(async () => (await service.handle('getConversation', { id: conversationId }) as ConversationDetail).turns?.every(t => ['completed', 'failed', 'cancelled'].includes(t.status)), { timeout: 8000 }).toBe(true)
    const detail = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
    expect(detail.runs.filter(run => run.phase === 'execution' || !run.phase).every(run => run.status === 'completed'), JSON.stringify(detail.runs.filter(run => run.error).map(run => run.error))).toBe(true)
    return detail
  }
  return { root, service, chat, send, setHandler(fn: typeof handler) { handler = fn }, get context() { return current! } }
}

it('saves from the original employee chat, deduplicates mutations and refuses stale/cross-owner or ended-source calls', async () => {
  const f = await setup(); let saved: AutomationDefinition
  const detail = await f.send(async ctx => {
    expect(ctx.work).toBeUndefined()
    saved = await ctx.manageAutomation!({ action: 'save', key: 'daily', plan }) as AutomationDefinition
    expect(await ctx.manageAutomation!({ action: 'save', key: 'daily', plan })).toMatchObject({ id: saved.id, revision: 1 })
    expect(saved.owner).toEqual({ kind: 'employee', employeeId: 'researcher' })
    expect(saved.creationSource).toEqual({ conversationId: f.chat.id, messageId: ctx.triggerMessageId, agentId: 'researcher' })
  })
  expect(detail.workItems).toHaveLength(0)
  await expect(f.context.manageAutomation!({ action: 'list', limit: 20 })).rejects.toThrow('已失效')
  const other = await f.service.handle('saveAutomation', { ...plan, owner: { kind: 'employee', employeeId: 'writer' } }) as AutomationDefinition
  await f.send(async ctx => {
    await expect(ctx.manageAutomation!({ action: 'get', id: other.id })).rejects.toThrow('不属于')
    const edited = await ctx.manageAutomation!({ action: 'save', key: 'edit', plan: { ...plan, id: saved.id, expectedRevision: 1, time: '10:00' } }) as AutomationDefinition
    expect(edited).toMatchObject({ id: saved.id, revision: 2, time: '10:00' })
    const paused = await ctx.manageAutomation!({ action: 'pause', id: saved.id, key: 'pause', expectedRevision: 2 }) as AutomationDefinition
    expect(paused.revision).toBe(3)
    expect(await ctx.manageAutomation!({ action: 'pause', id: saved.id, key: 'pause', expectedRevision: 2 })).toMatchObject({ revision: 3 })
    expect(await ctx.manageAutomation!({ action: 'save', key: 'edit', plan: { ...plan, id: saved.id, expectedRevision: 1, time: '10:00' } })).toMatchObject({ revision: 2 })
    await expect(ctx.manageAutomation!({ action: 'save', key: 'stale', plan: { ...plan, id: saved.id, expectedRevision: 1 } })).rejects.toThrow('配置已变更')
    expect((await ctx.manageAutomation!({ action: 'list', limit: 20 }) as AutomationListPage).definitions.map(d => d.id)).toEqual([saved.id])
  })
  expect(await f.service.handle('getAutomation', { id: saved!.id })).toMatchObject({ revision: 3, time: '10:00', enabled: false })
})

it('explains a misplaced group employeeId and saves the corrected same-key request without changing ownership', async () => {
  const f = await setup()
  const group = await f.service.handle('createConversation', { kind: 'group', title: '群计划归属', agentIds: ['researcher', 'writer'] }) as Conversation
  let saved: AutomationDefinition | undefined
  await f.send(async ctx => {
    if (ctx.agent.id !== 'researcher' || !ctx.manageAutomation) return
    expect(ctx.automationOwner).toEqual({ kind: 'group', conversationId: group.id })
    const collaboration = { coordinatorId: 'researcher', assignments: [{ employeeId: 'writer', instruction: '采集一个数字', deliverable: '数字', dependsOn: [] }, { employeeId: 'researcher', instruction: '汇总实际数字', deliverable: '汇总', dependsOn: ['writer'] }] }
    const request = { action: 'save' as const, key: 'group-plan', plan: { ...plan, conversationPolicy: 'new-conversation' as const, collaboration } }
    await expect(ctx.manageAutomation!({ ...request, employeeId: 'researcher' })).rejects.toThrow('删除 employeeId')
    expect((await ctx.manageAutomation!({ action: 'list', limit: 20 }) as AutomationListPage).definitions).toEqual([])
    saved = await ctx.manageAutomation!(request) as AutomationDefinition
    expect(await ctx.manageAutomation!(request)).toMatchObject({ id: saved.id, revision: 1 })
  }, group.id)
  expect(saved).toMatchObject({ owner: { kind: 'group', conversationId: group.id }, collaboration: { coordinatorId: 'researcher' }, enabled: false })
  expect((await f.service.handle('listOwnerAutomations', { owner: { kind: 'group', conversationId: group.id } }) as AutomationListPage).definitions).toHaveLength(1)
})

it('native product management uses the same host receipt without lazy Work or file tools', async () => {
  const f = await setup()
  await f.send(async ctx => {
    const products = createNativeProducts({ ...ctx, ensureNativeWork: async () => { throw new Error('unexpected file Work') } })
    try {
      expect(() => ListToolsResultSchema.parse({ tools: products.tools })).not.toThrow()
      const tool = products.tools.find(t => t.name === 'manage_automation')!
      const result = await tool.execute({ action: 'save', key: 'native-daily', plan }, 'native-call') as AutomationDefinition
      expect(result).toMatchObject({ owner: { kind: 'employee', employeeId: 'researcher' }, revision: 1 })
      expect(ctx.work).toBeUndefined()
    } finally { await products.dispose() }
  })
})

it('filters owner before LIMIT and preserves stable pagination across unrelated newer plans', async () => {
  const f = await setup(), store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  const original = await f.service.handle('saveAutomation', { ...plan, owner: { kind: 'employee', employeeId: 'researcher' } }) as AutomationDefinition
  await store.write(Array.from({ length: 120 }, (_, i) => {
    const value = { ...original, id: `fixture-${String(i).padStart(3, '0')}`, owner: { kind: 'employee' as const, employeeId: i % 3 === 0 ? 'researcher' : 'writer' }, updatedAt: '2026-10-14T00:00:00.000Z' }
    return { collection: 'automations', id: value.id, value }
  }))
  const ids = new Set<string>(); let before: AutomationListPage['nextCursor']
  do {
    const page = await f.service.handle('listOwnerAutomations', { owner: { kind: 'employee', employeeId: 'researcher' }, before, limit: 7 }) as AutomationListPage
    expect(page.definitions.length).toBeLessThanOrEqual(7)
    for (const d of page.definitions) { expect(ids.has(d.id)).toBe(false); ids.add(d.id); expect(d.owner).toEqual({ kind: 'employee', employeeId: 'researcher' }) }
    before = page.nextCursor
  } while (before)
  expect(ids.size).toBe(41)
})

it('exports provider-compatible JSON filename patterns without weakening path or NUL rejection', () => {
  const name = monitorPolicySchema.shape.source.shape.name
  const pattern = z.toJSONSchema(name).pattern!
  expect(pattern).not.toMatch(/\\0/)
  const exported = new RegExp(pattern, 'u')
  for (const value of ['metrics.json', '报告.JSON', 'a.Json']) { expect(name.safeParse(value).success).toBe(true); expect(exported.test(value)).toBe(true) }
  for (const value of ['../a.json', 'a/b.json', 'a\\b.json', 'a:b.json', 'a\0.json', 'a.txt']) { expect(name.safeParse(value).success).toBe(false); expect(exported.test(value)).toBe(false) }
})

it('publishes an object-root tool schema while execution still rejects fields from other actions', () => {
  const schema = z.toJSONSchema(automationCommandToolSchema, { io: 'input' })
  expect(schema.type).toBe('object'); expect(schema.properties?.action).toBeDefined(); expect(schema.oneOf).toBeUndefined()
  const projected = automationCommandToolSchema.parse({ action: 'pause', id: 'a', key: 'pause', expectedRevision: 1, plan })
  expect(automationCommandSchema.safeParse(projected).success).toBe(false)
  expect(automationCommandSchema.parse({ action: 'list' })).toEqual({ action: 'list', limit: 20 })
})

it('lets only dedicated bobo creation chats save a chosen employee plan with the same durable receipt', async () => {
  const f = await setup()
  let saved: AutomationDefinition | undefined
  f.setHandler(async ctx => {
    expect(ctx.conversation.automationCreation).toBe(true)
    expect(ctx.manageAutomation).toBeTypeOf('function')
    await expect(ctx.manageAutomation!({ action: 'save', key: 'missing', plan })).rejects.toThrow('请选择')
    await expect(ctx.manageAutomation!({ action: 'save', key: 'self', employeeId: 'bobo', plan })).rejects.toThrow('请选择')
    saved = await ctx.manageAutomation!({ action: 'save', key: 'monthly', employeeId: 'researcher', plan: { ...plan, frequency: 'monthly', dayOfMonth: 15, startsOn: '2027-01-01', description: '月度计划' } }) as AutomationDefinition
    expect(await ctx.manageAutomation!({ action: 'save', key: 'monthly', employeeId: 'researcher', plan: { ...plan, frequency: 'monthly', dayOfMonth: 15, startsOn: '2027-01-01', description: '月度计划' } })).toMatchObject({ id: saved.id, revision: 1 })
  })
  const input = { requestId: 'bobo-create-monthly', content: '请让研究员每月15日整理报告', automationCreation: true }
  const conversation = await f.service.handle('startCoreConversation', input) as Conversation
  await expect.poll(() => saved?.id, { timeout: 8000 }).toBeTruthy()
  expect(saved).toMatchObject({ owner: { kind: 'employee', employeeId: 'researcher' }, employeeIds: ['researcher'], conversationPolicy: 'new-conversation', creationSource: { conversationId: conversation.id, agentId: 'bobo' }, frequency: 'monthly', dayOfMonth: 15 })
  await expect.poll(async () => (await f.service.handle('getConversation', { id: conversation.id }) as ConversationDetail).turns?.every(t => t.status === 'completed'), { timeout: 8000 }).toBe(true)
  expect(await f.service.handle('startCoreConversation', input)).toMatchObject({ id: conversation.id })
  expect((await f.service.handle('listOwnerAutomations', { owner: { kind: 'employee', employeeId: 'researcher' } }) as AutomationListPage).definitions).toHaveLength(1)
  f.setHandler(async ctx => { expect(ctx.manageAutomation).toBeUndefined() })
  const ordinary = await f.service.handle('startCoreConversation', { requestId: 'ordinary-core', content: '聊一聊' }) as Conversation
  await expect.poll(async () => (await f.service.handle('getConversation', { id: ordinary.id }) as ConversationDetail).turns?.every(t => t.status === 'completed'), { timeout: 8000 }).toBe(true)
  await f.send(async ctx => { await expect(ctx.manageAutomation!({ action: 'save', key: 'other', employeeId: 'writer', plan })).rejects.toThrow('不能更改') })
})
