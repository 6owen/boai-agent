/*
 * [OUTPUT]: 配置变更后的任务经明确编辑保存恢复执行；更换执行员工仅作用后续运行，历史归属/旧触发回执保持。
 * [OUTPUT]: 手动触发真实自动化来源沿员工数据源绑定，不再填退役的source检索偏好；私有判断零源调用，查询/正文与重复触发/重启不重放。
 * [OUTPUT]: 执行历史删除核对真实目录/日志释放、主聊和其他记录保留、过期/运行门禁、重启续清与旧触发不重放。
 * [OUTPUT]: IM聊天在无公开正文时投影同一次任务执行，读取原思考证据；清空后撤去镜像，不复制或重跑Run。
 * [OUTPUT]: 任务浏览器经过真实宿主上下文/工具/SQLite动作回执；普通与任务消息定位、清空后拒绝均回归。
 * [OUTPUT]: 增加员工尚未回复时任务指令已在IM可见的屏障断言，公共提交替代完成后补发。
 * [OUTPUT]: 任务消息在清空后重新显示主私聊，流式原位完成和阅读索引可见；重启无重复、清空不复活，旧结果补齐不重跑模型。
 * [OUTPUT]: 清空主私聊后立即运行，旧mergedInto会话不进入后台工作调度；生产AppService同文案红绿回归，任务原消息保持。
 * [OUTPUT]: 命令权限开关不影响计划保存/执行，定时命令走真实批准与拒绝；日历规则、暂停恢复与原权限核验保持。
 * [INPUT]: 独立产品数据库、真实 AppService、受控模型及固定日历规则。
 * [OUTPUT]: 核心预置身份与普通员工场景隔离，保留原业务断言；连接地址变化/删除后拒绝旧授权且重启不补执行；超过摘要上限的待处理分类/稳定分页/解除与旧触发最新结束结果；真实结果入通知账本、宿主回执与业务交付/预算隔离；超过 300 条持久历史的稳定边界/筛选/重启；独立任务聊天/普通单聊复用、原始权限/来源、初始化失败、时间预览与星期规则不变量验证。
 * [POS]: 自动化产品目标与任务上下文集成验收；不运行用户真实计划或外部模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile, access } from 'node:fs/promises'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { AutomationDefinition, AutomationHistoryPage, AutomationInput, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, Snapshot } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { AppService } from '../src/runtime/service'
import { automationCron, matchesSchedule, nextTimes } from '../src/runtime/modules/automations/schedule-policy'
import { automationNeedsAttention } from '../src/shared/domain/automations'
import type { AppEvent } from '../src/shared/ipc'
import { mainConversations } from '../src/shared/domain/conversation-list'
import type { BrowserActionEnvelope, BrowserHostBridge, BrowserLease } from '../src/shared/ipc/browser'
import type { BrowserRepository } from '../src/runtime/modules/browser/repository'
import type { ConversationView } from '../src/shared/domain/reading'
import type { DataSource } from '../src/shared/domain/sources'
import { webSearchServer, webSourceConfig, resultUrl, pageText } from './fixtures/web-search-server'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
async function until(check: () => Promise<boolean>) { const start = Date.now(); while (!await check()) { if (Date.now() - start > 8000) throw new Error('condition did not settle'); await new Promise(resolve => setTimeout(resolve, 20)) } }
async function setup({ allowCommands = false, engine: customEngine, browserHost }: { allowCommands?: boolean; engine?: AgentEngine; browserHost?: BrowserHostBridge } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-product-')); disposers.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = []
  const events: AppEvent[] = []
  const engine: AgentEngine = customEngine ?? { test: async () => '', decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => { contexts.push(ctx); await ctx.onDelta('当前聊天的回复') } }
  const make = async () => { const service = new AppService({ dataPath: root, engine, browserHost, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: event => events.push(event) }); disposers.push(() => service.close()); await service.init(); return service }
  const service = await make()
  const connection = await service.handle('saveConnection', { name: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'local' }) as Connection
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await service.handle('saveAgent', { ...agent, connectionId: connection.id, allowCommands })
  const input: AutomationInput = { name: '独立日报', prompt: '整理本次获准资料', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }
  const view = () => service.handle('listAutomations', undefined) as Promise<AutomationsView>
  const detail = (id: string) => service.handle('getConversation', { id }) as Promise<ConversationDetail>
  return { root, service, make, input, view, detail, contexts, events }
}

async function stagedDownload(f: Awaited<ReturnType<typeof setup>>, conversationId: string, runId: string) {
  const store = (f.service as unknown as { store: ProductStore }).store
  const run = await store.get<import('../src/shared/domain').AgentRun>('runs', runId)
  const directory = join(f.root, 'browser-downloads', runId), path = join(directory, 'report.txt'), bytes = 'downloaded report'
  await mkdir(directory, { recursive: true }); await writeFile(path, bytes)
  const lease = { id: runId, scopeKey: 'application', conversationId, agentId: run!.agentId, runId, downloadDirectory: directory }
  await store.write([
    { collection: 'runs', id: runId, value: { ...run, browserDownloadIsolation: 'isolated' } },
    { collection: 'browserScopes', id: runId, value: lease },
    { collection: 'browserActions', id: `download-${runId}`, value: { id: `download-${runId}`, argumentHash: 'fixture-hash', lease, status: 'completed', reply: { status: 'completed', downloads: [{ path, size: Buffer.byteLength(bytes), hash: createHash('sha256').update(bytes).digest('hex') }] } } },
  ])
  return { directory, path, bytes }
}
it('retrieves public web facts in an automation with the executing employee binding and no duplicate or restart calls', async () => {
  const server = await webSearchServer()
  try {
    let source: DataSource, other: DataSource, error: unknown, executed = 0, decisionDenied = 0
    const f = await setup({ engine: {
      test: async () => 'unused', decide: async ctx => {
        if (ctx.participation?.hasRespondedInTurn) return { action: 'pass', observedThroughSequence: ctx.participation.observedThroughSequence }
        try { await expect(ctx.inspectDataSource!(source.id)).rejects.toThrow('权限'); decisionDenied++ } catch (failure) { error = failure; throw failure }
        return { action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }
      },
      run: async ctx => {
        try {
          expect(ctx.agent.id).toBe('researcher'); expect(ctx.dataSources?.map(source => source.id)).toEqual([source.id])
          await expect(ctx.inspectDataSource!(other.id)).rejects.toThrow('权限')
          await ctx.inspectDataSource!(source.id)
          expect(JSON.stringify(await ctx.callDataSource!({ sourceId: source.id, tool: 'tavily_search', arguments: { query: 'public Orion launch schedule' } }))).toContain(resultUrl)
          expect(JSON.stringify(await ctx.callDataSource!({ sourceId: source.id, tool: 'tavily_extract', arguments: { urls: [resultUrl] } }))).toContain(pageText)
          executed++; await ctx.onDelta(pageText + ' ' + resultUrl)
        } catch (failure) { error = failure; throw failure }
      },
    } })
    source = await f.service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: webSourceConfig }) as DataSource
    other = await f.service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { ...webSourceConfig, name: 'Unbound search' } }) as DataSource
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...agent } = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
    await f.service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, sourceIds: [source.id] })
    const plan = await f.service.handle('saveAutomation', { ...f.input, prompt: '通过本人搜索源查证公开资料', notify: false }) as AutomationDefinition
    const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'search-once' }) as AutomationOccurrence
    await vi.waitFor(async () => { if (error) throw error; expect((await f.view()).occurrences.find(row => row.id === occurrence.id)?.status).toBe('completed') }, { timeout: 10000 })
    expect(executed).toBe(1); expect(decisionDenied).toBe(1); expect(server.calls.map(call => call.name)).toEqual(['tavily_search', 'tavily_extract'])
    const detail = await f.detail(occurrence.conversationId)
    expect(detail.messages.some(message => message.senderType === 'agent' && message.content === pageText + ' ' + resultUrl)).toBe(true)
    expect(detail.runs.every(run => run.origin?.occurrenceId === occurrence.id)).toBe(true)
    expect((await f.service.handle('runAutomation', { id: plan.id, requestId: 'search-once' }) as AutomationOccurrence).id).toBe(occurrence.id)
    await f.service.close(); const restored = await f.make()
    expect((await restored.handle('getConversation', { id: occurrence.conversationId }) as ConversationDetail).messages).toEqual(detail.messages)
    expect((await restored.handle('runAutomation', { id: plan.id, requestId: 'search-once' }) as AutomationOccurrence).id).toBe(occurrence.id)
    expect(executed).toBe(1); expect(server.calls).toHaveLength(2)
    if (process.env.BOAI_REVIEW_RUN_DIR) { const dir = join(process.env.BOAI_REVIEW_RUN_DIR, 'search-entries'); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'automation.json'), JSON.stringify({ executed, decisionDenied, calls: server.calls, detail, occurrence: await restored.handle('getAutomationOccurrence', { id: occurrence.id }), externalRequests: 0, trigger: 'manual-original-automation-path', modelMode: 'controlled-engine-real-MCP-SDK' }, null, 2)) }
  } finally { await server.close() }
})
it('deletes one completed execution and its private files while preserving the plan, other runs and IM messages', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'delete-first' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.status === 'completed')
  const second = await f.service.handle('runAutomation', { id: plan.id, requestId: 'keep-second' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === second.id)?.status === 'completed')
  const source = await f.detail(first.conversationId), other = await f.detail(second.conversationId)
  const main = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations).find(room => room.kind === 'direct' && room.agentIds[0] === 'researcher')!
  const published = (await f.detail(main.id)).messages
  const run = source.runs.find(run => run.phase === 'execution')!
  const paths = [source.conversation.workspacePath, join(f.root, 'external-runtime', run.id), join(f.root, 'external-workspaces', run.agentId, first.conversationId)]
  for (const path of paths) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'temporary.txt'), 'task temporary data') }
  await writeFile(join(other.conversation.workspacePath, 'keep.txt'), 'keep')
  const current = await f.service.handle('getAutomationOccurrence', { id: first.id }) as AutomationOccurrence
  await expect(f.service.handle('deleteAutomationOccurrence', { id: first.id, expectedVersion: current.stateVersion - 1 })).rejects.toThrow('已更新')
  await f.service.handle('deleteAutomationOccurrence', { id: first.id, expectedVersion: current.stateVersion })
  for (const path of paths) await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(other.conversation.workspacePath, 'keep.txt'), 'utf8')).toBe('keep')
  expect((await f.detail(main.id)).messages).toEqual(published)
  expect((await f.view()).occurrences.map(o => o.id)).toEqual([second.id])
  expect((await f.view()).definitions[0]).toMatchObject({ id: plan.id, enabled: plan.enabled, prompt: plan.prompt })
  expect((await f.service.handle('listAutomationHistory', { automationId: plan.id }) as AutomationHistoryPage).occurrences.map(o => o.id)).toEqual([second.id])
  await expect(f.service.handle('getAutomationOccurrence', { id: first.id })).rejects.toThrow('不存在')
  const store = (f.service as unknown as { store: ProductStore }).store
  expect(await store.get('runs', run.id)).toBeUndefined()
  expect(await store.get('snapshots', run.id)).toBeUndefined()
  expect(await store.get('automationOccurrences', first.id)).toMatchObject({ name: '', runIds: [], resultMessageIds: [], deletedAt: expect.any(String) })
  expect(f.events).toContainEqual({ type: 'automation:history-deleted', occurrenceId: first.id })
  const calls = f.contexts.length
  await f.service.handle('deleteAutomationOccurrence', { id: first.id, expectedVersion: current.stateVersion })
  await f.service.close(); const restarted = await f.make()
  await expect(restarted.handle('runAutomation', { id: plan.id, requestId: 'delete-first' })).rejects.toThrow('已删除')
  expect(f.contexts).toHaveLength(calls)
  expect((await restarted.handle('listAutomationHistory', {}) as AutomationHistoryPage).occurrences.map(o => o.id)).toEqual([second.id])
})

it('resumes a failed history cleanup after restart without executing the task again', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'cleanup-recovery' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  const current = (await f.view()).occurrences[0]
  const host = f.service as unknown as { history: { remove(...args: unknown[]): Promise<unknown> }; store: ProductStore }
  vi.spyOn(host.history, 'remove').mockRejectedValueOnce(new Error('fixture filesystem failure'))
  await expect(f.service.handle('deleteAutomationOccurrence', { id: occurrence.id, expectedVersion: current.stateVersion })).rejects.toThrow('fixture filesystem failure')
  expect(await host.store.get('automationHistoryCleanups', occurrence.id)).toBeDefined()
  await f.service.close(); const restored = await f.make()
  expect((await restored.handle('listAutomationHistory', {}) as AutomationHistoryPage).occurrences).toEqual([])
  await expect(access(join(f.root, 'workspaces', occurrence.conversationId))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.contexts).toHaveLength(1)
})

it('deletes shared-chat execution logs without removing the original messages, files or another run', async () => {
  const f = await setup(), room = await f.service.handle('createConversation', { kind: 'direct', title: '共享聊天', agentIds: ['researcher'] }) as Conversation
  await f.service.handle('sendMessage', { conversationId: room.id, content: '普通消息', requestId: 'ordinary-before-delete', mentionIds: [] })
  await until(async () => (await f.detail(room.id)).turns?.every(turn => turn.status === 'completed') === true)
  const ordinary = (await f.detail(room.id)).runs.map(run => run.id)
  const plan = await f.service.handle('saveAutomation', { ...f.input, conversationPolicy: 'existing-conversation', conversationId: room.id, employeeIds: undefined }) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'shared-delete' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  const before = await f.detail(room.id)
  const taskRun = before.runs.find(run => run.origin?.occurrenceId === occurrence.id)!
  const ownDownload = await stagedDownload(f, room.id, taskRun.id), otherDownload = await stagedDownload(f, room.id, ordinary[0])
  await writeFile(join(room.workspacePath, 'shared.txt'), 'shared user file')
  await f.service.handle('deleteAutomationOccurrence', { id: occurrence.id, expectedVersion: (await f.view()).occurrences[0].stateVersion })
  const after = await f.detail(room.id)
  expect(after.messages).toEqual(before.messages)
  expect(after.runs.map(run => run.id)).toEqual(ordinary)
  expect(await readFile(join(room.workspacePath, 'shared.txt'), 'utf8')).toBe('shared user file')
  await expect(access(ownDownload.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(otherDownload.path, 'utf8')).toBe(otherDownload.bytes)
  expect(f.contexts).toHaveLength(2)
})

it('retains externally changed download files and the execution until cleanup can be retried', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'download-conflict' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  const source = await f.detail(occurrence.conversationId), run = source.runs[0]
  const download = await stagedDownload(f, occurrence.conversationId, run.id)
  await writeFile(download.path, 'external changes must survive')
  const request = { id: occurrence.id, expectedVersion: (await f.view()).occurrences[0].stateVersion }
  await expect(f.service.handle('deleteAutomationOccurrence', request)).rejects.toThrow('外部修改')
  expect(await readFile(download.path, 'utf8')).toBe('external changes must survive')
  expect((await f.view()).occurrences.map(o => o.id)).toContain(occurrence.id)
  expect(f.events).not.toContainEqual({ type: 'automation:history-deleted', occurrenceId: occurrence.id })
  await writeFile(download.path, download.bytes)
  await f.service.handle('deleteAutomationOccurrence', request)
  await expect(access(download.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await f.view()).occurrences).toEqual([])
})

it('rejects deleting an executing occurrence without beginning file cleanup', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await setup({ engine: { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async () => { started = true; await gate } } })
  disposers.push(async () => release())
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'active-delete' }) as AutomationOccurrence
  await until(async () => started)
  await expect(f.service.handle('deleteAutomationOccurrence', { id: occurrence.id, expectedVersion: occurrence.stateVersion })).rejects.toThrow(/停止|结束/)
  const store = (f.service as unknown as { store: ProductStore }).store
  expect(await store.get('automationHistoryCleanups', occurrence.id)).toBeUndefined()
  await expect(access(join(f.root, 'workspaces', occurrence.conversationId))).resolves.toBeUndefined()
  release()
})
it('runs after clearing the employee chat without scheduling archived conversation aliases', async () => {
  const f = await setup(), personal = await f.service.handle('createConversation', { kind: 'direct', title: '员工主私聊', agentIds: ['researcher'] }) as Conversation
  const host = f.service as unknown as { store: ProductStore; conversations: Map<string, Conversation>; mutations: Promise<unknown>; workTimers: Map<string, ReturnType<typeof setTimeout>> }
  const alias: Conversation = { ...personal, id: 'archived-chat', mainPrivate: undefined, mergedInto: personal.id, list: { hidden: true } }
  await host.store.write([{ collection: 'conversations', id: alias.id, value: alias }]); host.conversations.set(alias.id, alias)
  await f.service.handle('clearConversationHistory', { id: personal.id, hide: true })
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const run = await f.service.handle('runAutomation', { id: plan.id, requestId: 'after-clear' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === run.id)?.status === 'completed')
  await until(async () => { await host.mutations; return host.workTimers.size === 0 })
  expect((await f.detail(run.conversationId)).messages.some(message => message.senderType === 'agent')).toBe(true)
  expect(f.events.filter(event => event.type === 'runtime-error')).toEqual([])
})
it('shows scheduled instructions and replies in the employee main chat after cleanup without inheriting its context or replaying cleared publications', async () => {
  const f = await setup(), personal = await f.service.handle('createConversation', { kind: 'direct', title: '员工主私聊', agentIds: ['researcher'] }) as Conversation
  await f.service.handle('sendMessage', { conversationId: personal.id, content: '旧主私聊上下文', mentionIds: [], requestId: 'ordinary-context' })
  await until(async () => (await f.detail(personal.id)).turns?.every(turn => turn.status === 'completed') === true)
  const ordinary = (await f.detail(personal.id)).runs.find(run => run.phase === 'execution')!
  expect(await f.service.handle('resolveExecutionMessage', { conversationId: personal.id, runId: ordinary.id })).toEqual({ conversationId: personal.id, messageId: ordinary.triggerMessageId })
  await f.service.handle('clearConversationHistory', { id: personal.id, hide: true })
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'visible-task' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.status === 'completed')
  await (f.service as unknown as { mutations: Promise<unknown> }).mutations
  const visible = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations)
  expect(visible.some(room => room.id === personal.id)).toBe(true)
  const messages = (await f.detail(personal.id)).messages
  const execution = (await f.detail(first.conversationId)).runs.find(run => run.phase === 'execution')!
  expect(await f.service.handle('resolveExecutionMessage', { conversationId: first.conversationId, runId: execution.id })).toEqual({ conversationId: personal.id, messageId: messages[0].id })
  expect(messages.map(message => message.content)).toEqual([f.input.prompt, '当前聊天的回复'])
  const chat = await f.service.handle('getConversationView', { conversationId: personal.id }) as import('../src/shared/domain/reading').ConversationView
  expect(chat.messages).toEqual(messages)
  expect(chat.messagePage.items.every(item => item.status === 'available')).toBe(true)
  expect(messages.every(message => message.automationPublication?.occurrenceId === first.id && !message.runId && !message.turnId)).toBe(true)
  expect(f.contexts.find(ctx => ctx.conversation.id === first.conversationId)!.messages.map(message => message.content)).toEqual([f.input.prompt])
  expect(first.conversationId).not.toBe(personal.id)
  const calls = f.contexts.length
  await f.service.close()
  const restarted = await f.make()
  expect((await restarted.handle('getConversation', { id: personal.id }) as ConversationDetail).messages).toEqual(messages)
  expect(f.contexts).toHaveLength(calls)
  await restarted.handle('clearConversationHistory', { id: personal.id, hide: true })
  await expect(restarted.handle('resolveExecutionMessage', { conversationId: first.conversationId, runId: execution.id })).rejects.toThrow('对应聊天记录已删除或不可用')
  await restarted.close()
  const restored = await f.make()
  expect((await restored.handle('getConversation', { id: personal.id }) as ConversationDetail).messages).toEqual([])
  expect(mainConversations((await restored.handle('snapshot', undefined) as Snapshot).conversations).some(room => room.id === personal.id)).toBe(false)
  const second = await restored.handle('runAutomation', { id: plan.id, requestId: 'new-visible-task' }) as AutomationOccurrence
  await until(async () => (await restored.handle('getAutomationOccurrence', { id: second.id }) as AutomationOccurrence).status === 'completed')
  await (restored as unknown as { mutations: Promise<unknown> }).mutations
  const next = await restored.handle('getConversation', { id: personal.id }) as ConversationDetail
  expect(next.messages.map(message => message.content)).toEqual([f.input.prompt, '当前聊天的回复'])
  expect(next.messages.every(message => message.automationPublication?.occurrenceId === second.id)).toBe(true)
  expect(f.contexts.filter(ctx => ctx.conversation.purpose === 'automation')).toHaveLength(2)
})
it('creates the employee main chat for public streaming task replies and updates the same published message', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await setup({ engine: { test: async () => '', decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => { await ctx.onDelta('正在整理'); await gate; await ctx.onDelta('，已完成') } } })
  disposers.push(async () => release())
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  await f.service.handle('runAutomation', { id: plan.id, requestId: 'stream-to-main' })
  let main: Conversation | undefined
  await until(async () => {
    main = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations).find(c => c.kind === 'direct' && c.agentIds[0] === 'researcher')
    return !!main && (await f.detail(main.id)).messages.some(message => message.content === '正在整理' && message.status === 'streaming')
  })
  const streamed = (await f.detail(main!.id)).messages.find(message => message.senderType === 'agent')!
  release()
  await until(async () => (await f.detail(main!.id)).messages.some(message => message.id === streamed.id && message.status === 'completed'))
  const complete = (await f.detail(main!.id)).messages
  expect(complete.map(message => message.content)).toEqual([f.input.prompt, '正在整理，已完成'])
  expect(complete[1].id).toBe(streamed.id)
  expect(await f.service.handle('getConversationReading', { conversationId: main!.id })).toMatchObject({ completionCount: 1 })
  expect(f.events.filter(event => event.type === 'runtime-error')).toEqual([])
})
it('mirrors the original live task execution in IM before any public reply and revokes it after clearing', async () => {
  let release!: () => void, started = false, calls = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await setup({ engine: { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async ctx => {
    calls++
    await ctx.onExecutionEvent?.({ id: 'reasoning', eventType: 'agent.reasoning.block', payload: { text: '核对天气来源', itemId: 'reasoning' } })
    started = true; await gate
  } } })
  disposers.push(async () => release())
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'mirror-live-run' }) as AutomationOccurrence
  await until(async () => started)
  const main = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations).find(room => room.kind === 'direct' && room.agentIds[0] === 'researcher')!
  const source = await f.detail(occurrence.conversationId)
  const run = source.runs.find(run => run.phase === 'execution')!
  const noHistoryScan = vi.spyOn(f.service as unknown as { conversationMessages(id: string): unknown[] }, 'conversationMessages').mockImplementation(() => { throw new Error('mirrors must not scan chat history') })
  const view = await f.service.handle('getConversationView', { conversationId: main.id }) as ConversationView
  noHistoryScan.mockRestore()
  expect(view.executionMirrors, '聊天必须有原执行的实时投影，不能只复制公开消息').toHaveLength(1)
  expect(view.executionMirrors![0]).toMatchObject({ run: { id: run.id, conversationId: occurrence.conversationId, status: 'running' }, triggerMessage: { conversationId: main.id, automationPublication: { sourceMessageId: run.triggerMessageId } } })
  expect(view.runs).toEqual([]); expect(view.workItems).toEqual([])
  const evidence = await f.service.handle('listExecutionEvidence', { conversationId: view.executionMirrors![0].run.conversationId, runId: run.id })
  expect(JSON.stringify(evidence)).toContain('核对天气来源')
  await f.service.handle('clearConversationHistory', { id: main.id, hide: true })
  expect((await f.service.handle('getConversationView', { conversationId: main.id }) as ConversationView).executionMirrors).toEqual([])
  expect((await f.detail(occurrence.conversationId)).runs.find(value => value.id === run.id)?.status).toBe('running')
  expect(calls).toBe(1)
  release()
})
it('commits the task instruction to the IM conversation before the employee starts replying', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await setup({ engine: { test: async () => '', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }), run: async () => { started = true; await gate } } })
  disposers.push(async () => release())
  const plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'receive-before-reply' }) as AutomationOccurrence
  await until(async () => started)
  const main = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations).find(room => room.kind === 'direct' && room.agentIds[0] === 'researcher')!
  expect(main).toBeDefined()
  const messages = (await f.detail(main.id)).messages
  expect(messages.find(message => message.senderType === 'user')).toMatchObject({ content: f.input.prompt, automationPublication: { occurrenceId: occurrence.id } })
  expect(messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
  release()
})
it('publishes existing isolated task results on startup without invoking the employee again', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'old-isolated-task' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences[0]?.status === 'completed')
  await (f.service as unknown as { mutations: Promise<unknown> }).mutations
  const main = mainConversations((await f.service.handle('snapshot', undefined) as Snapshot).conversations).find(c => c.kind === 'direct' && c.agentIds[0] === 'researcher')!
  const published = (await f.detail(main.id)).messages
  await f.service.close()
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
  // A pre-fix installation has the original task results but no chat publications or their receipts.
  await store.write([{ collection: 'conversations', id: main.id, value: { ...main, list: { hidden: true } } }], [
    ...published.flatMap(message => ['messages', 'messageReceipts', 'conversationCompletions'].map(collection => ({ collection, id: message.id }))),
    ...['conversationCompletionClocks', 'conversationReadingStates'].map(collection => ({ collection, id: main.id })),
  ])
  await store.close()
  const restarted = await f.make()
  expect(mainConversations((await restarted.handle('snapshot', undefined) as Snapshot).conversations).some(room => room.id === main.id)).toBe(true)
  const restored = await restarted.handle('getConversation', { id: main.id }) as ConversationDetail
  expect(restored.messages.map(message => message.content)).toEqual([f.input.prompt, '当前聊天的回复'])
  expect(restored.messages.every(message => message.automationPublication?.occurrenceId === occurrence.id)).toBe(true)
  expect(f.contexts).toHaveLength(1)
})
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
  await f.service.handle('saveAgent', { ...agent, active: false })
  expect(await f.service.handle('runAutomation', { id: plan.id, requestId: 'revoked' })).toMatchObject({ status: 'skipped' })
  expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations.some(c => c.automationId === plan.id)).toBe(false)
})
it.each([false, true])('saves and runs a scheduled employee independently of command permission %s', async allowCommands => {
  const f = await setup({ allowCommands })
  const plan = await f.service.handle('saveAutomation', { ...f.input, frequency: 'manual' }) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'permission-independent' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === occurrence.id)?.status === 'completed')
  expect(f.contexts).toHaveLength(1)
  expect(f.contexts[0].agent.allowCommands).toBe(allowCommands)
  expect((await f.detail(occurrence.conversationId)).messages.some(message => message.content === '当前聊天的回复')).toBe(true)
})
it('runs a scheduled browser call through the real host context, task tool and original occurrence Work receipt', async () => {
  const available: boolean[] = [], calls: BrowserActionEnvelope[] = [], leases: BrowserLease[] = []
  let repository!: BrowserRepository
  const browserHost: BrowserHostBridge = { request: (async (method: string, input: unknown) => {
    if (method === 'acquire') { leases.push(input as BrowserLease); return }
    if (method === 'disconnect') return
    if (method === 'inspect') return null
    if (method === 'drain') return { drained: true }
    if (method === 'executeSingle') {
      const envelope = input as BrowserActionEnvelope; calls.push(envelope)
      await repository.start({ actionId: envelope.actionId, generation: envelope.lease.generation, runId: envelope.lease.runId, workId: envelope.lease.workId })
      return { actionId: envelope.actionId, generation: envelope.lease.generation, status: 'completed', result: { output: '南京天气页面已读取', appendReleaseHint: false } }
    }
    throw new Error(`Unexpected browser request: ${method}`)
  }) as BrowserHostBridge['request'] }
  const engine: AgentEngine = {
    test: async () => '',
    decide: async ctx => { available.push(ctx.browserAvailable === true); return { action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'task', work: { key: 'weather', scope: '用BOAI浏览器查询南京天气', deliverable: '天气和来源' }, observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) } },
    run: async ctx => {
      const runtime = await createTaskRuntime(ctx)
      try {
        expect(ctx.work?.origin?.occurrenceId).toBeTruthy()
        await runtime.tools.browser_tool!.execute!({ command: 'navigate https://weather.example.test/nanjing' }, { requestContext: new RequestContext(), observe: noopObserve, agent: { agentId: ctx.agent.id, toolCallId: 'weather-call', messages: [], suspend: async () => {} } })
        await ctx.onDelta('南京天气页面已读取')
        await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '南京天气页面已读取', evidence: [{ kind: 'answer', reference: '南京天气页面已读取' }] })
      } finally { await runtime.dispose() }
    },
  }
  const f = await setup({ engine, browserHost })
  repository = (f.service as unknown as { browser: BrowserRepository }).browser
  const plan = await f.service.handle('saveAutomation', { ...f.input, frequency: 'manual', prompt: '用BOAI浏览器查询南京天气' }) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'scheduled-browser' }) as AutomationOccurrence
  await until(async () => !!(await f.view()).occurrences.find(item => item.id === occurrence.id)?.finishedAt)
  expect(available.length).toBeGreaterThan(0); expect(available.every(Boolean)).toBe(true)
  expect((await f.view()).occurrences.find(item => item.id === occurrence.id)).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
  expect(calls).toHaveLength(1); expect(leases).toHaveLength(1)
  expect(leases[0]).toMatchObject({ conversationId: occurrence.conversationId, workId: expect.any(String) })
  expect(await repository.get(calls[0].actionId)).toMatchObject({ status: 'completed', lease: { workId: leases[0].workId } })
  await expect(repository.registerTask(leases[0])).rejects.toThrow()
  expect(f.events.filter(event => event.type === 'runtime-error')).toEqual([])
})
it.each([false, true])('uses the same approval for scheduled shell commands and honors approved=%s', async approved => {
  let proof = '', result: unknown
  const engine: AgentEngine = {
    test: async () => '',
    decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'task', work: { key: 'scheduled-command', scope: '核验任务命令', deliverable: '命令执行结果' }, observedThroughSequence: Math.max(...ctx.messages.map(m => m.sequence)) }),
    run: async ctx => {
      const runtime = await createTaskRuntime(ctx)
      try {
        proof = join(ctx.workspace!.runPath, 'permission-proof.txt')
        result = await runtime.tools.execute_command!.execute!({ command: "printf 'scheduled-ok' > permission-proof.txt" }, { requestContext: new RequestContext(), observe: noopObserve })
        const text = approved ? '命令已执行' : '命令已拒绝，未执行'
        await ctx.onDelta(text)
        await ctx.onWorkOutcome!({ disposition: 'delivered', summary: text, evidence: [{ kind: 'answer', reference: text }] })
      } finally { await runtime.workspace.destroy() }
    },
  }
  const f = await setup({ allowCommands: true, engine })
  const plan = await f.service.handle('saveAutomation', { ...f.input, frequency: 'manual' }) as AutomationDefinition
  const occurrence = await f.service.handle('runAutomation', { id: plan.id, requestId: 'scheduled-command' }) as AutomationOccurrence
  await until(async () => (await f.service.handle('snapshot', undefined) as Snapshot).approvals.length === 1)
  const approval = (await f.service.handle('snapshot', undefined) as Snapshot).approvals[0]
  expect(approval.conversationId).toBe(occurrence.conversationId)
  await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await f.service.handle('approve', { id: approval.id, approved })
  await until(async () => (await f.view()).occurrences.find(o => o.id === occurrence.id)?.status === 'completed')
  expect(result).toMatchObject({ approved })
  if (approved) expect(await readFile(proof, 'utf8')).toBe('scheduled-ok')
  else await expect(readFile(proof, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await f.service.handle('snapshot', undefined) as Snapshot).approvals).toEqual([])
}, 20_000)
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

it('reauthorizes an existing task by explicitly saving it after its employee configuration changes without replaying the skipped request', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await f.service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await f.service.handle('saveAgent', { ...agent, role: `${agent.role}（已调整）` })
  const request = { id: plan.id, requestId: 'old-authority' }
  const skipped = await f.service.handle('runAutomation', request) as AutomationOccurrence
  expect(skipped).toMatchObject({ status: 'skipped', attentionReason: 'authorization', runIds: [] })
  const saved = await f.service.handle('saveAutomation', { ...f.input, id: plan.id, expectedRevision: plan.revision }) as AutomationDefinition
  expect(saved.authorizedFingerprint).not.toBe(plan.authorizedFingerprint)
  const executed = await f.service.handle('runAutomation', { id: plan.id, requestId: 'explicit-new-run' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === executed.id)?.status === 'completed')
  expect(f.contexts).toHaveLength(1)
  expect(await f.service.handle('runAutomation', request)).toMatchObject({ id: skipped.id, status: 'skipped' })
  expect(f.contexts).toHaveLength(1)
})

it('changes an existing task employee for future runs while preserving the previous execution assignment', async () => {
  const f = await setup(), plan = await f.service.handle('saveAutomation', f.input) as AutomationDefinition
  const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'original-employee' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === first.id)?.status === 'completed')
  const before = await f.service.handle('snapshot', undefined) as Snapshot
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...writer } = before.agents.find(a => a.id === 'writer')!
  await f.service.handle('saveAgent', { ...writer, connectionId: before.agents.find(a => a.id === 'researcher')!.connectionId })
  const saved = await f.service.handle('saveAutomation', { ...f.input, id: plan.id, expectedRevision: plan.revision, owner: { kind: 'employee', employeeId: 'writer' }, employeeIds: ['writer'] }) as AutomationDefinition
  expect(saved.executionRevision).toBe(plan.executionRevision + 1)
  const second = await f.service.handle('runAutomation', { id: plan.id, requestId: 'replacement-employee' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === second.id)?.status === 'completed')
  expect(f.contexts.map(ctx => ctx.agent.id)).toEqual(['researcher', 'writer'])
  expect(await f.service.handle('getAutomationOccurrence', { id: first.id })).toMatchObject({ plan: { owner: { kind: 'employee', employeeId: 'researcher' }, employeeIds: ['researcher'] } })
  expect(await f.service.handle('getAutomationOccurrence', { id: second.id })).toMatchObject({ plan: { owner: { kind: 'employee', employeeId: 'writer' }, employeeIds: ['writer'] } })
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

it('keeps manual plans timer-free and previews hourly/monthly rules across local dates', async () => {
  const f = await setup()
  const manual = await f.service.handle('saveAutomation', { ...f.input, frequency: 'manual', enabled: true }) as AutomationDefinition
  expect(manual).toMatchObject({ frequency: 'manual', cron: '', sync: 'synced' })
  expect((await f.view()).definitions.find(d => d.id === manual.id)?.nextTimes).toEqual([])
  expect(matchesSchedule(manual, Date.now())).toBe(false)
  const hourly = { ...f.input, frequency: 'hourly' as const, startsOn: '2027-01-01', time: '00:15', timezone: 'Pacific/Kiritimati' }
  expect(nextTimes({ ...hourly, cron: automationCron(hourly) }, 2, new Date('2026-01-01T00:00:00Z'))).toEqual(['2026-12-31T10:15:00.000Z', '2026-12-31T11:15:00.000Z'])
  expect(matchesSchedule(hourly, Date.parse('2026-12-31T09:15:00Z'))).toBe(false)
  const monthly = { ...f.input, frequency: 'monthly' as const, dayOfMonth: 31, time: '09:00', timezone: 'UTC', startsOn: '2026-02-01' }
  expect(nextTimes({ ...monthly, cron: automationCron(monthly) }, 3, new Date('2026-01-01T00:00:00Z'))).toEqual(['2026-03-31T09:00:00.000Z', '2026-05-31T09:00:00.000Z', '2026-07-31T09:00:00.000Z'])
  expect(matchesSchedule(monthly, Date.parse('2026-02-28T09:00:00Z'))).toBe(false)
  const savedMonthly = await f.service.handle('saveAutomation', { ...monthly, startsOn: '2027-03-31', description: '月底报告' }) as AutomationDefinition
  const resumedMonthly = await f.service.handle('resumeAutomation', { id: savedMonthly.id }) as AutomationDefinition
  expect(resumedMonthly).toMatchObject({ enabled: true, description: '月底报告', startsOn: '2027-03-31', dayOfMonth: 31, cron: '0 9 31 * *' })
  expect(resumedMonthly.scheduleGeneration).toBe(savedMonthly.scheduleGeneration)
  await expect(f.service.handle('previewAutomation', { frequency: 'monthly', time: '09:00', weekday: 1, timezone: 'UTC', dayOfMonth: 32 })).rejects.toThrow()
  await expect(f.service.handle('previewAutomation', { frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', startsOn: '2026-02-30' })).rejects.toThrow()
  const daily = await f.service.handle('saveAutomation', { ...f.input, requestId: 'future-plan', startsOn: '2027-01-01' }) as AutomationDefinition
  const changed = await f.service.handle('saveAutomation', { ...f.input, id: daily.id, expectedRevision: daily.revision, startsOn: '2027-02-01' }) as AutomationDefinition
  expect(changed.scheduleGeneration).toBe(daily.scheduleGeneration + 1)
  expect(changed.executionRevision).toBe(daily.executionRevision)
  expect(f.contexts).toEqual([])
  const occurrence = await f.service.handle('runAutomation', { id: manual.id, requestId: 'manual-run' }) as AutomationOccurrence
  await until(async () => (await f.view()).occurrences.find(o => o.id === occurrence.id)?.status === 'completed')
  expect(f.contexts).toHaveLength(1)
  expect(await f.service.handle('runAutomation', { id: manual.id, requestId: 'manual-run' })).toMatchObject({ id: occurrence.id })
  expect(f.contexts).toHaveLength(1)
})
