/*
 * [OUTPUT]: 按现行 Bobo 高权限预设区分核心明确权限与普通员工缺省，CLI 仅核对不改权。
 * [OUTPUT]: 实际owner RPC取消上传等待原准备，同时无关会话创建继续；零模型。
 * [OUTPUT]: CLI原问题回答必须保留问题版本和原Work/预算，查询与未知核对不重发。
 * [OUTPUT]: 显式权限核对三模式/三发送入口、异权群、旧回执及当前权限失效，不修改保存策略。
 * [OUTPUT]: 核心首发附件原子发布、坏材料无空会话/副作用，兼容原prepared selection回执。
 * [OUTPUT]: Owner附件真实字节与原会话授权/准备及发送回执，错聊天/路径注入与改附件拒绝。
 * [OUTPUT]: API overrides follow original send/employee/core receipts and every phase, preserve defaults and exclude credentials from records.
 * [OUTPUT]: 显式工作位置在普通/core消息中持久保留，目录删除不重解释旧请求，原正文保持。
 * [OUTPUT]: CLI source selection shares Composer authorization/version checks and preserves original run/core receipts after source updates.
 * [OUTPUT]: CLI原执行文本增量/快照替换废弃和工具结果接线；receipt --follow只读原请求，待审批/输入与未知结果给出核对入口。
 * [OUTPUT]: CLI消息游标复用原历史双向分页；app/session:event沿公共发布器隔离会话，订阅确认及中断/断开退出可核对。
 * [OUTPUT]: 运行时版本查询复用程序身份/原验证与插件内容核验；未知明确、零启动，CLI区分自身及服务版本，验证归21组01 §12.9。
 * [OUTPUT]: 精确取消隔离群同事/顺序前置/独立工作，等待实际退出并保留丢失应答未知和新任务。
 * [OUTPUT]: 会话创建/清空隐藏持久回执、丢失提交应答、重启续清和重复删除不影响新消息。
 * [INPUT]: Real AppService/SQLite, desktop CLI adapter and isolated local discovery files.
 * [OUTPUT]: Same-service receipts, send/output/timeout/detach, actual-exit cancellation and private metadata lifecycle.
 * [POS]: CLI business integration without external models, personal data or a second scheduler.
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, lstat, chmod, symlink, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import type { MaterialUploads } from '../packages/runtime/src/modules/materials/material-upload'
import { AppService } from '../packages/runtime/src/service'
import { CliRpcClient } from '../packages/transport/src/client'
import { readLocalConnection } from '../packages/transport/src/discovery'
import { openDesktopCli } from '../apps/electron/src/main/cli-service'
import type { AppEvent } from '../packages/shared/src/ipc'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot } from '../packages/shared/src/domain'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import { executeMessage, executionWriter, readPrompt, type ExecutionEvent } from '../apps/cli/src/execution'
import type { MessageExecution } from '../packages/shared/src/domain/message-execution'
import { Readable } from 'node:stream'
import { executeSessionOperation } from '../apps/cli/src/session'
import { executeRunCancellation } from '../apps/cli/src/cancel'
import type { RunCancellation, CancellationTarget } from '../packages/shared/src/domain/run-cancellation'
import { CliError, PROTOCOL_VERSION } from '../packages/shared/src/cli/protocol'
import type { SessionOperationReceipt } from '../packages/shared/src/domain/session-operation'
import type { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { ConversationMessagePage } from '../packages/shared/src/domain/reading'
import { historyQuery } from '../packages/transport/src/history'
import { selectSources } from '../apps/cli/src/sources'
import { selectAttachments, uploadEmployeeAttachments } from '../apps/cli/src/attachments'
import type { DataSource } from '../packages/shared/src/domain/sources'
import type { ComposerReference } from '../packages/shared/src/domain/composer-references'

const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(overrides: Partial<AgentEngine> = {}, permission?: DigitalAgent['executionPermission']) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-service-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  let runs = 0, desktop: Awaited<ReturnType<typeof openDesktopCli>> | undefined
  const engine: AgentEngine = { test: async () => 'unused', decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => { runs++; await ctx.onDelta('CLI 原会话回复') }, ...overrides }
  const app = new AppService({ dataPath: root, skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: event => desktop?.publish(event) }); cleanup.push(() => app.close()); await app.init()
  const connection = await app.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234', defaultModel: 'fixture' }) as Connection
  const agent = (await app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...definition } = agent
  await app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: connection.id, modelId: 'fixture', ...(permission ? { executionPermission: permission } : {}) })
  const room = await app.handle('createConversation', { kind: 'direct', title: 'CLI 原会话', agentIds: [agent.id] }) as Conversation
  desktop = await openDesktopCli(root, 'test', { request: async (method, input) => app.handle(method, input) as never }); cleanup.push(() => desktop!.close())
  const metadata = await readLocalConnection(root)
  const client = new CliRpcClient(metadata.url, metadata); cleanup.push(() => client.destroy()); await client.connect()
  return { root, app, desktop, room, client, metadata, get runs() { return runs } }
}

it.each(['chat', 'task'] as const)('continues the exact pending %s question through the original answer transaction', async kind => {
  let decisions = 0, executions = 0, answering = false
  const f = await fixture({
    decide: async ctx => { decisions++; return { action: answering ? 'reply' : 'ask', responseKind: kind, observedThroughSequence: ctx.participation!.observedThroughSequence, ...(kind === 'task' ? { work: { key: 'original', scope: '原始目标', deliverable: '原始交付' } } : {}) } },
    run: async ctx => {
      executions++
      const answer = ctx.continuation ? '已按原问题补充交付。' : '请明确交付给谁？'
      await ctx.onDelta(answer); await ctx.onUsage?.({ inputTokens: 5, outputTokens: 3, totalTokens: 8 })
      if (ctx.continuation && kind === 'task') await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '交付', evidence: [{ kind: 'answer', reference: answer }] })
    },
  })
  const requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '原始用户目标', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(3)
  const before = await f.app.handle('getConversation', { id: f.room.id }) as ConversationDetail
  const recovery = events.at(-1)?.recovery as { questions: { channel: string; identity: { questionId: string; expectedRevision: number }; required: string[] }[] }
  expect(recovery.questions).toHaveLength(1)
  const question = recovery.questions[0]
  expect(question).toMatchObject({ channel: 'replyInboxQuestion', required: ['content', 'requestId'] })
  const count = { decisions, executions }
  const input = { ...question.identity, content: '交付给本人。', requestId: randomUUID() }
  await expect(f.client.invoke(question.channel, { ...input, expectedRevision: question.identity.expectedRevision + 1 })).rejects.toThrow()
  expect(await f.client.invoke('getMessageReceipt', { requestId: input.requestId })).toBeNull()
  answering = true
  const accepted = await f.client.invoke(question.channel, input) as Message
  expect(accepted.inboxReply).toMatchObject({ questionId: question.identity.questionId, questionRevision: question.identity.expectedRevision })
  expect(await executeMessage(f.client, { kind: 'observe' }, { requestId: input.requestId, waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(await f.client.invoke(question.channel, input)).toEqual(accepted)
  expect(executions).toBe(count.executions + 1); expect(decisions).toBe(count.decisions + (kind === 'chat' ? 1 : 0))
  await expect(f.client.invoke(question.channel, { ...input, requestId: randomUUID() })).rejects.toThrow('问题已回答')
  const after = await f.app.handle('getConversation', { id: f.room.id }) as ConversationDetail
  expect(after.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
  expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).state).toBe('completed')
  if (kind === 'task') {
    expect(after.workItems).toHaveLength(1)
    expect(after.workItems![0]).toMatchObject({ id: before.workItems![0].id, budgetId: before.workItems![0].budgetId, sourceMessageId: before.workItems![0].sourceMessageId, status: 'delivered' })
    expect(after.workBudgets![0]).toMatchObject({ id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt })
  } else expect(after.workItems).toEqual([])
})

it('uses the same original employee/chat and stable message receipt across desktop and CLI', async () => {
  const f = await fixture(), events: AppEvent[] = []
  expect(await f.client.invoke('health')).toMatchObject({ service: 'ready', browserAvailable: true, credentialProvider: 'desktop-vault' })
  const employees = await f.client.invoke('employees') as DigitalAgent[]
  expect(employees.map(employee => employee.id)).toEqual((await f.app.handle('snapshot', undefined) as Snapshot).agents.map(employee => employee.id))
  f.client.on('app', event => events.push(event as AppEvent))
  await f.client.invoke('events:subscribe', { channel: 'app', conversationId: f.room.id })
  const input = { conversationId: f.room.id, requestId: randomUUID(), content: '中文\n第二行', mentionIds: [] }
  const accepted = await f.client.invoke('sendMessage', input) as Message
  expect(accepted.content).toBe(input.content)
  expect((await f.client.invoke('sendMessage', input) as Message).id).toBe(accepted.id)
  expect((await f.client.invoke('getMessageReceipt', { requestId: input.requestId }) as Message).id).toBe(accepted.id)
  await expect(f.client.invoke('sendMessage', { ...input, content: 'different' })).rejects.toThrow()
  await vi.waitFor(async () => {
    const detail = await f.app.handle('getConversation', { id: f.room.id }) as ConversationDetail
    expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
    expect(detail.messages.some(message => message.content === 'CLI 原会话回复' && message.status === 'completed')).toBe(true)
    expect(detail.workItems).toEqual([])
  })
  expect(f.runs).toBe(1)
  await vi.waitFor(() => expect(events.some(event => event.type === 'message' && event.message.id === accepted.id)).toBe(true))
  const sessions = await f.client.invoke('sessions', { employeeId: 'researcher', limit: 1 }) as { items: Conversation[] }
  expect(sessions.items.map(room => room.id)).toEqual([f.room.id]); expect(sessions.items[0]).not.toHaveProperty('workspacePath')
  await f.client.invoke('events:unsubscribe', { channel: 'app' })
})

it('returns runtime provenance through the original authenticated service without starting an employee', async () => {
  const f = await fixture(), before = await f.app.handle('snapshot', undefined)
  const result = await f.client.invoke('versions') as { runtimes: { node: string; programs: unknown[] } }
  expect(result).toMatchObject({ service: 'test', protocol: PROTOCOL_VERSION, runtimes: { node: process.versions.node, programs: [], mastra: { source: 'installed-package' } } })
  expect(result.runtimes).not.toHaveProperty('executable')
  await expect(f.client.invoke('versions', { executable: '/outside' })).rejects.toThrow()
  expect(await f.app.handle('snapshot', undefined)).toEqual(before)
  expect(f.runs).toBe(0)
})

it('isolates session events from other conversations and global changes, then really unsubscribes', async () => {
  const f = await fixture(), selected: AppEvent[] = [], all: AppEvent[] = []
  f.client.on('session:event', event => selected.push(event as AppEvent)); f.client.on('app', event => all.push(event as AppEvent))
  await expect(f.client.invoke('events:subscribe', { channel: 'session:event', conversationId: 'missing' })).rejects.toThrow()
  await expect(f.client.invoke('events:subscribe', { channel: 'private:credentials' })).rejects.toThrow()
  await f.client.invoke('events:subscribe', { channel: 'session:event', conversationId: f.room.id })
  await f.client.invoke('events:subscribe', { channel: 'app' })
  f.desktop!.publish({ type: 'changed', conversationId: f.room.id })
  f.desktop!.publish({ type: 'changed', conversationId: 'another-conversation' })
  f.desktop!.publish({ type: 'changed' })
  await f.client.invoke('ping')
  expect(selected).toEqual([{ type: 'changed', conversationId: f.room.id }]); expect(all).toHaveLength(3)
  await f.client.invoke('events:unsubscribe', { channel: 'session:event' })
  f.desktop!.publish({ type: 'changed', conversationId: f.room.id }); await f.client.invoke('ping')
  expect(selected).toHaveLength(1); expect(all).toHaveLength(4); expect(f.runs).toBe(0)
})

it('pages the original message history both ways and excludes newer arrivals from an older cursor window', async () => {
  const f = await fixture()
  const send = async (content: string) => expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content, mentionIds: [] }, { requestId: randomUUID(), waitTimeout: 5000, emit: () => {} })).toBe(0)
  for (const text of ['first', 'second', 'third']) await send(text)
  const query = async (cursor?: string, direction?: string) => f.client.invoke('listConversationMessages', historyQuery(f.room.id, 2, cursor, direction)) as Promise<ConversationMessagePage>
  const original = await f.client.invoke('listConversationMessages', { conversationId: f.room.id }) as ConversationMessagePage
  const first = await query(); await send('later')
  const collected = [...first.items]; let page = first
  while (page.beforeCursor) {
    page = await query(JSON.stringify(page.beforeCursor)); collected.unshift(...page.items)
  }
  expect(collected.map(item => item.messageId)).toEqual(original.items.map(item => item.messageId))
  const forward = await query(JSON.stringify(first.afterCursor), 'after')
  expect(forward.items.map(item => item.message?.content)).toEqual(['later', 'CLI 原会话回复'])
  expect(() => historyQuery(f.room.id, 2, '{')).toThrow('JSON')
  expect(() => historyQuery(f.room.id, 2, '{"id":"bad","sequence":-1}')).toThrow('游标')
  expect(() => historyQuery(f.room.id, 2, undefined, 'after')).toThrow('--cursor')
})

it('creates one original employee private session atomically and rejects reuse with another title or target', async () => {
  const f = await fixture(), snapshot = await f.app.handle('snapshot', undefined) as Snapshot
  const employee = snapshot.agents.find(a => a.id !== 'researcher' && a.id !== 'bobo')!
  const input = { employeeId: employee.id, name: '专用会话', requestId: randomUUID() }
  const first = await f.client.invoke('createEmployeeSession', input) as SessionOperationReceipt
  expect(first).toMatchObject({ operation: 'create', created: true, state: 'completed', employeeId: employee.id })
  expect(await f.client.invoke('createEmployeeSession', input)).toEqual(first)
  const reused = await f.client.invoke('createEmployeeSession', { ...input, name: '不能重命名已有会话', requestId: randomUUID() }) as SessionOperationReceipt
  expect(reused).toMatchObject({ conversationId: first.conversationId, created: false })
  const detail = await f.app.handle('getConversation', { id: first.conversationId }) as ConversationDetail
  expect(detail.conversation.title).toBe('专用会话')
  await expect(f.client.invoke('createEmployeeSession', { ...input, name: '同ID不同名称' })).rejects.toThrow('requestId')
  await expect(f.client.invoke('deleteSession', { conversationId: first.conversationId, requestId: input.requestId })).rejects.toThrow('requestId')
  expect((await f.app.handle('snapshot', undefined) as Snapshot).conversations.filter(c => c.kind === 'direct' && c.agentIds.includes(employee.id))).toHaveLength(1)
  expect(f.runs).toBe(0)
})

it('keeps the core first-message gate and reuses its original conversation after that message', async () => {
  const f = await fixture()
  const requestId = randomUUID()
  await expect(f.client.invoke('createEmployeeSession', { employeeId: 'bobo', requestId })).rejects.toThrow('首条消息')
  expect(await f.client.invoke('getSessionReceipt', { requestId })).toBeNull()
  const message = await f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', content: '首条消息', requestId: randomUUID() }) as Message
  const receipt = await f.client.invoke('createEmployeeSession', { employeeId: 'bobo', requestId }) as SessionOperationReceipt
  expect(receipt).toMatchObject({ conversationId: message.conversationId, created: false, state: 'completed' })
})

it('reconciles a lost create commit acknowledgement and a lost RPC result without submitting a second operation', async () => {
  const f = await fixture(), store = (f.app as unknown as { store: ProductStore }).store
  const employee = (await f.app.handle('snapshot', undefined) as Snapshot).agents.find(a => !['researcher','bobo'].includes(a.id))!
  const requestId = randomUUID(), write = store.write.bind(store)
  let lost = false
  const spy = vi.spyOn(store, 'write').mockImplementation(async records => {
    await write(records)
    if (!lost && records.some(record => record.collection === 'sessionReceipts' && record.id === requestId)) { lost = true; throw new Error('lost create commit acknowledgement') }
  })
  const first = await f.client.invoke('createEmployeeSession', { employeeId: employee.id, requestId }) as SessionOperationReceipt
  spy.mockRestore()
  expect(lost).toBe(true); expect(first.created).toBe(true)
  expect((await f.app.handle('getConversation', { id: first.conversationId }) as ConversationDetail).conversation.id).toBe(first.conversationId)
  const invoke = f.client.invoke.bind(f.client), calls: string[] = []
  const network = vi.spyOn(f.client, 'invoke').mockImplementation(async (channel, ...args) => {
    calls.push(channel); const result = await invoke(channel, ...args)
    if (channel === 'createEmployeeSession') throw new CliError('HANDLER_ERROR', 'lost committed reply')
    return result
  })
  const outcome = await executeSessionOperation(f.client, { kind: 'create', employeeId: employee.id }, requestId)
  network.mockRestore()
  expect(outcome).toEqual({ result: first, exitCode: 0 })
  expect(calls).toEqual(['createEmployeeSession','getSessionReceipt'])
  await expect(executeSessionOperation(f.client, { kind: 'create', employeeId: employee.id, name: '不同请求' }, requestId)).rejects.toThrow('requestId')
})

it('deletes through original clear-and-hide and keeps later messages on an explicit duplicate deletion', async () => {
  const f = await fixture(), createId = randomUUID(), deleteId = randomUUID()
  await f.client.invoke('createEmployeeSession', { employeeId: 'researcher', requestId: createId })
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '原消息', mentionIds: [] }, { requestId: randomUUID(), emit: () => {} })).toBe(0)
  const employees = (await f.app.handle('snapshot', undefined) as Snapshot).agents
  const store = (f.app as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
  let lost = false
  const spy = vi.spyOn(store, 'transaction').mockImplementation(async operation => {
    const result = await transaction(operation)
    if (!lost && result && typeof result === 'object' && 'removals' in result && 'conversation' in result) { lost = true; throw new Error('lost cleanup commit acknowledgement') }
    return result
  })
  const deleted = await f.client.invoke('deleteSession', { conversationId: f.room.id, requestId: deleteId }) as SessionOperationReceipt
  spy.mockRestore()
  expect(lost).toBe(true); expect(deleted.state).toBe('completed')
  const detail = await f.app.handle('getConversation', { id: f.room.id }) as ConversationDetail
  expect(detail.messages).toEqual([]); expect(detail.conversation.list?.hidden).toBe(true)
  expect((await f.app.handle('snapshot', undefined) as Snapshot).agents).toEqual(employees)
  expect(await f.client.invoke('createEmployeeSession', { employeeId: 'researcher', requestId: createId })).toMatchObject({ state: 'cleared', conversationId: f.room.id })
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '删除之后的新消息', mentionIds: [] }, { requestId: randomUUID(), emit: () => {} })).toBe(0)
  expect(await f.client.invoke('deleteSession', { conversationId: f.room.id, requestId: deleteId })).toEqual(deleted)
  expect((await f.app.handle('getConversation', { id: f.room.id }) as ConversationDetail).messages.some(m => m.content === '删除之后的新消息')).toBe(true)
})

it('refuses deletion while the actual adapter is still exiting and leaves no accepted deletion receipt', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async () => { started = true; await gate } }); cleanup.push(release)
  const messageId = randomUUID(), deleteId = randomUUID()
  await f.client.invoke('sendMessage', { conversationId: f.room.id, requestId: messageId, content: '还在执行', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  await f.client.invoke('cancelMessageExecution', { requestId: messageId })
  await expect(f.client.invoke('deleteSession', { conversationId: f.room.id, requestId: deleteId })).rejects.toThrow('执行')
  expect(await f.client.invoke('getSessionReceipt', { requestId: deleteId })).toBeNull()
  release()
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId: messageId })).toMatchObject({ activeRunIds: [] }))
  expect(await f.client.invoke('deleteSession', { conversationId: f.room.id, requestId: deleteId })).toMatchObject({ state: 'completed' })
})

it('recovers an accepted deletion from the original cleanup journal after restart', async () => {
  const f = await fixture(), requestId = randomUUID()
  const store = (f.app as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
  let lost = false
  const spy = vi.spyOn(store, 'transaction').mockImplementation(async operation => {
    const result = await transaction(operation)
    if (!lost && result === requestId) { lost = true; throw new Error('lost prepared cleanup acknowledgement') }
    return result
  })
  await expect(f.client.invoke('deleteSession', { conversationId: f.room.id, requestId })).rejects.toThrow('lost prepared')
  spy.mockRestore()
  expect(await f.client.invoke('getSessionReceipt', { requestId })).toMatchObject({ state: 'pending' })
  f.client.destroy(); await f.desktop.close(); await f.app.close()
  const recovered = new AppService({ dataPath: f.root, skillDiscovery: { homeDir: f.root }, engine: { test: async () => '', decide: async () => { throw new Error('must not replay') }, run: async () => { throw new Error('must not replay') } }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanup.push(() => recovered.close()); await recovered.init()
  expect(await recovered.handle('getSessionReceipt', { requestId })).toMatchObject({ state: 'completed', conversationId: f.room.id })
  expect(await recovered.handle('deleteSession', { conversationId: f.room.id, requestId })).toMatchObject({ state: 'completed' })
  expect((await recovered.handle('getConversation', { id: f.room.id }) as ConversationDetail).conversation.list?.hidden).toBe(true)
})

it('send observes original completion and published output with no duplicate on explicit same-request retry', async () => {
  const f = await fixture(), requestId = randomUUID(), events: ExecutionEvent[] = []
  const operation = { kind: 'send' as const, conversationId: f.room.id, content: '中文\n多行', mentionIds: [] }
  expect(await executeMessage(f.client, operation, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(0)
  expect(events.find(event => event.type === 'accepted')).toMatchObject({ requestId, conversationId: f.room.id })
  expect(events.filter(event => event.type === 'message').at(-1)).toMatchObject({ message: { content: 'CLI 原会话回复', status: 'completed' } })
  expect(events.at(-1)).toMatchObject({ type: 'result', state: 'completed', exitCode: 0 })
  expect(events.some(event => event.type === 'execution')).toBe(true)
  expect(await executeMessage(f.client, operation, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(f.runs).toBe(1)
})

it('client timeout detaches and preserves the original task, which later completes without resending', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => { started = true; await gate; await ctx.onDelta('超时后正常完成') } })
  cleanup.push(release)
  const requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '等待', mentionIds: [] }, { requestId, waitTimeout: 150, emit: event => events.push(event) })).toBe(4)
  expect(started).toBe(true)
  expect(events.at(-1)).toMatchObject({ requestId, type: 'result', exitCode: 4 })
  const pending = await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution
  expect(pending.state).toBe('running'); expect(pending.activeRunIds.length).toBeGreaterThan(0)
  release()
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', activeRunIds: [] }))
})

it('cancel waits for actual adapter exit after the original run is already marked cancelled', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async () => { started = true; await gate } }); cleanup.push(release)
  const requestId = randomUUID()
  await f.client.invoke('sendMessage', { requestId, conversationId: f.room.id, content: '停止此消息', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  const stopped = await f.client.invoke('cancelMessageExecution', { requestId }) as MessageExecution
  expect(stopped.state).toBe('stopping'); expect(stopped.activeRunIds.length).toBeGreaterThan(0)
  expect(stopped.runs.some(run => run.status === 'cancelled')).toBe(true)
  const events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'cancel' }, { requestId, waitTimeout: 100, emit: event => events.push(event) })).toBe(4)
  release()
  expect(await executeMessage(f.client, { kind: 'cancel' }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(0)
  expect(events.at(-1)).toMatchObject({ state: 'cancelled', exitCode: 0 })
})

it('interrupting send ends only CLI observation and does not cancel the host execution', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => { await gate; await ctx.onDelta('继续执行') } }); cleanup.push(release)
  const requestId = randomUUID(), controller = new AbortController()
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '脱离终端', mentionIds: [] }, {
    requestId, signal: controller.signal, emit: event => { if (event.type === 'accepted') controller.abort(new Error('SIGINT')) },
  })).toBe(130)
  expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).state).not.toBe('cancelled')
  release()
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed' }))
})

it('cancelling one accepted message leaves a separately queued user request executable', async () => {
  let release!: () => void, started = false, calls = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => { calls++; if (calls === 1) { started = true; await gate } else await ctx.onDelta('第二条独立消息正常回复') } }); cleanup.push(release)
  const firstId = randomUUID(), secondId = randomUUID()
  await f.client.invoke('sendMessage', { requestId: firstId, conversationId: f.room.id, content: '第一条', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  await f.client.invoke('sendMessage', { requestId: secondId, conversationId: f.room.id, content: '第二条', mentionIds: [] })
  await f.client.invoke('cancelMessageExecution', { requestId: firstId })
  expect((await f.client.invoke('getMessageExecution', { requestId: secondId }) as MessageExecution).state).not.toBe('cancelled')
  release()
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId: secondId })).toMatchObject({ state: 'completed' }))
  expect(calls).toBe(2)
})

it('reports business rejection as failure only after reconciling that no message was accepted', async () => {
  const f = await fixture(), requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '不存在的成员', mentionIds: ['missing'] }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(1)
  expect(events.at(-1)).toMatchObject({ state: 'failed', exitCode: 1 })
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toBeNull(); expect(f.runs).toBe(0)
})

it('returns pending approval without approving and resumes only after the original owner approval', async () => {
  const f = await fixture({ run: async ctx => { if (await ctx.approveOperation!({ kind: 'file', description: '受控写入操作' })) await ctx.onDelta('本人批准后执行') } }, 'ask')
  const requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'send', expectedExecutionPermission: 'ask', conversationId: f.room.id, content: '需要批准', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(3)
  const pending = await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution
  expect(pending.state).toBe('waiting_approval'); expect(pending.approvals).toHaveLength(1)
  expect(events.at(-1)).toMatchObject({ state: 'waiting_approval', exitCode: 3 })
  expect(events.at(-1)?.recovery).toMatchObject({ inspect: { command: 'receipt', args: [requestId] }, approvals: [{ channel: 'approve', identity: { id: pending.approvals[0].id }, required: ['approved'] }] })
  await f.client.invoke('approve', { id: pending.approvals[0].id, approved: true })
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId })).toMatchObject({ state: 'completed', approvals: [] }))
  await expect(f.client.invoke('approve', { id: pending.approvals[0].id, approved: true })).rejects.toThrow()
  const calls = vi.spyOn(f.client, 'invoke')
  expect(await executeMessage(f.client, { kind: 'observe' }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(0)
  expect(calls.mock.calls.map(call => call[0])).not.toEqual(expect.arrayContaining(['sendMessage']))
  expect(calls.mock.calls.map(call => call[0])).not.toEqual(expect.arrayContaining(['cancelMessageExecution']))
})

it('streams original text before publication, delimits a replaced snapshot and preserves an earlier tool failure', async () => {
  let releaseOld!: () => void, releaseNew!: () => void
  const old = new Promise<void>(resolve => { releaseOld = resolve }), revised = new Promise<void>(resolve => { releaseNew = resolve })
  const f = await fixture({ run: async ctx => {
    await ctx.onExecutionEvent!({ id: 'stream', eventType: 'agent.text.block', payload: { text: '未完成的旧输出' } })
    await old
    await ctx.onTool({ id: 'failed-tool', name: 'Read', status: 'failed', detail: '原文件读取失败', createdAt: new Date().toISOString() })
    await ctx.onExecutionEvent!({ id: 'stream', eventType: 'agent.text.block', payload: { text: '修正后的回答' } })
    await revised; await ctx.onDelta('修正后的回答')
  } }); cleanup.push(() => { releaseOld(); releaseNew() })
  const requestId = randomUUID(), events: ExecutionEvent[] = []; let stdout = '', stderr = ''
  const writer = executionWriter('text', text => { stdout += text }, text => { stderr += text })
  const running = executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '逐步输出并修正', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: event => {
    events.push(event); writer(event)
    if (event.type === 'text_delta' && event.delta === '未完成的旧输出') releaseOld()
    if (event.type === 'text_delta' && event.delta === '修正后的回答') releaseNew()
  } })
  try {
    expect(await running).toBe(0)
    const replacement = events.findIndex(event => event.type === 'text_discard')
    expect(events[replacement]).toMatchObject({ reason: 'replaced', runId: expect.any(String), evidenceId: expect.any(String) })
    expect(events.findIndex(event => event.type === 'text_delta' && event.delta === '修正后的回答')).toBeGreaterThan(replacement)
    expect(stdout).toContain('未完成的旧输出'); expect(stdout).toContain('部分输出已废弃')
    expect(stdout.match(/修正后的回答/g)).toHaveLength(1)
    expect(stderr).toContain('原文件读取失败')
    expect(events.some(event => event.type === 'tool_result' && event.outcome === 'failed')).toBe(true)
    expect(events.at(-1)).toMatchObject({ state: 'completed', exitCode: 0 })
  } finally { releaseOld(); releaseNew(); await running }
})

it.each([false, true])('reads complete deferred Unicode text with one stable evidence revision (changed during read: %s)', async changeDuringRead => {
  const oldText = '旧正文🙂'.repeat(7000), currentText = changeDuringRead ? '新正文🙂'.repeat(7000) : oldText
  let release!: () => void, rewrite!: () => Promise<void>
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => {
    rewrite = () => ctx.onExecutionEvent!({ id: 'large-text', eventType: 'agent.text.block', payload: { text: currentText } })
    await ctx.onExecutionEvent!({ id: 'large-text', eventType: 'agent.text.block', payload: { text: oldText } })
    await gate; await ctx.onDelta(currentText)
  } }); cleanup.push(release)
  const invoke = f.client.invoke.bind(f.client); let changed = false, reads = 0
  vi.spyOn(f.client, 'invoke').mockImplementation(async (channel, ...args) => {
    const value = await invoke(channel, ...args)
    if (channel === 'getExecutionContent') {
      reads++
      if (changeDuringRead && !changed) { changed = true; await rewrite() }
    }
    return value
  })
  const events: ExecutionEvent[] = [], requestId = randomUUID(); let stdout = ''
  const writer = executionWriter('text', text => { stdout += text }, () => {})
  const observed = executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '完整正文', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: event => {
    events.push(event); writer(event); if (event.type === 'text_delta') release()
  } })
  try {
    expect(await observed).toBe(0); expect(reads).toBeGreaterThan(1)
    expect(events.filter(event => event.type === 'text_delta').map(event => event.delta).join('')).toBe(currentText)
    expect(stdout.split(currentText)).toHaveLength(2)
    if (changeDuringRead) expect(stdout).not.toContain('旧正文')
    expect(events.at(-1)).toMatchObject({ state: 'completed' })
  } finally { release(); await observed }
})

it('marks provisional output from a failed run discarded without publishing it as a completed answer', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => {
    await ctx.onExecutionEvent!({ id: 'partial', eventType: 'agent.text.block', payload: { text: '只写了一半' } })
    await gate; throw new Error('受控执行失败')
  } }); cleanup.push(release)
  const events: ExecutionEvent[] = [], requestId = randomUUID()
  const observed = executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '保留失败事实', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: event => { events.push(event); if (event.type === 'text_delta') release() } })
  try {
    expect(await observed).toBe(1)
    expect(events.find(event => event.type === 'text_discard')).toMatchObject({ reason: 'run_failed' })
    expect(events.at(-1)).toMatchObject({ state: 'failed', recovery: { observe: { command: 'receipt', args: [requestId, '--follow'] } } })
    expect(events.filter(event => event.type === 'message').some(event => (event.message as Message).status === 'completed' && (event.message as Message).content === '只写了一半')).toBe(false)
  } finally { release(); await observed }
})

it('observes an unknown request without creating a message, run or cancellation', async () => {
  const f = await fixture(), before = await f.app.handle('snapshot', undefined), requestId = randomUUID(), events: ExecutionEvent[] = []
  expect(await executeMessage(f.client, { kind: 'observe' }, { requestId, waitTimeout: 5000, emit: event => events.push(event) })).toBe(4)
  expect(events.at(-1)).toMatchObject({ state: 'unknown', recovery: { inspect: { command: 'receipt', args: [requestId] } } })
  expect(await f.app.handle('snapshot', undefined)).toEqual(before)
})

it('keeps an absent receipt absent and refuses cleared identities instead of replaying', async () => {
  const f = await fixture(), requestId = randomUUID()
  expect(await f.client.invoke('getMessageExecution', { requestId })).toBeNull()
  await expect(f.client.invoke('cancelMessageExecution', { requestId })).rejects.toThrow('原消息回执不存在')
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '已清理原件', mentionIds: [] }, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(0)
  await f.app.handle('clearConversationHistory', { id: f.room.id, hide: false })
  await expect(f.client.invoke('getMessageExecution', { requestId })).rejects.toThrow('原消息已清理')
  await expect(f.client.invoke('cancelMessageExecution', { requestId })).rejects.toThrow('原消息已清理')
})

it('reads split UTF-8 stdin without truncation and refuses malformed/oversized/blank input before submission', async () => {
  const bytes = Buffer.from('中文\n第二行')
  expect(await readPrompt(['补充'], Readable.from([bytes.subarray(0, 1), bytes.subarray(1, 5), bytes.subarray(5)]), true)).toBe('补充\n中文\n第二行')
  await expect(readPrompt([], Readable.from([Buffer.from([0xe4])]))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  await expect(readPrompt([], Readable.from(['x'.repeat(100001)]))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  await expect(readPrompt([], Readable.from([' \n']))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
})

it('never exposes private methods or credential reads through the public registry', async () => {
  const f = await fixture()
  for (const name of ['__backup', '__startBrowserAction', 'getConnectionApiKey', 'getDataSourceCredential', 'openPath', 'snapshot', 'saveAgent']) {
    expect(f.client.handshake!.registeredChannels).not.toContain(name)
    await expect(f.client.invoke(name, {})).rejects.toMatchObject({ code: 'CHANNEL_NOT_FOUND' })
  }
  await expect(f.client.invoke('sendMessage', { conversationId: f.room.id, requestId: randomUUID(), content: 'x', mentionIds: [], senderId: 'bobo' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  expect(f.runs).toBe(0)
})

it('publishes only private local metadata and removes its own record after actual endpoint close', async () => {
  const f = await fixture(), file = join(f.root, '.cli/connection.json')
  expect((await lstat(file)).mode & 0o777).toBe(0o600)
  expect((await lstat(join(f.root, '.cli'))).mode & 0o777).toBe(0o700)
  expect(f.metadata.token).not.toBe(f.metadata.serverId)
  const backup = await mkdtemp(join(tmpdir(), 'boai-cli-backup-')); cleanup.push(() => rm(backup, { recursive: true, force: true }))
  await f.app.backup(backup)
  await expect(lstat(join(backup, '.cli'))).rejects.toMatchObject({ code: 'ENOENT' })
  await f.desktop.close()
  await expect(readLocalConnection(f.root)).rejects.toMatchObject({ code: 'ENOENT' })
  await vi.waitFor(() => expect(f.client.isConnected).toBe(false))
})

it('refuses permissive/symlink discovery and preserves the next owner on old shutdown', async () => {
  const f = await fixture(), file = join(f.root, '.cli/connection.json')
  await chmod(file, 0o644); await expect(readLocalConnection(f.root)).rejects.toThrow('当前用户'); await chmod(file, 0o600)
  const target = join(f.root, 'linked.json'); await writeFile(target, await readFile(file), { mode: 0o600 }); await rm(file); await symlink(target, file)
  await expect(readLocalConnection(f.root)).rejects.toThrow('类型')
  await rm(file); const replacement = { ...f.metadata, serverId: randomUUID() }; await writeFile(file, JSON.stringify(replacement), { mode: 0o600 })
  await f.desktop.close(); expect(JSON.parse(await readFile(file, 'utf8')).serverId).toBe(replacement.serverId)
})

async function groupFixture(overrides: Partial<AgentEngine>) {
  const f = await fixture(overrides)
  const snapshot = await f.app.handle('snapshot', undefined) as Snapshot
  const agent = snapshot.agents.find(agent => agent.id === 'writer')!, configured = snapshot.agents.find(agent => agent.id === 'researcher')!
  const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...definition } = agent
  await f.app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: configured.connectionId, modelId: configured.modelId })
  const group = await f.app.handle('createConversation', { kind: 'group', title: '独立员工精确停止', agentIds: ['researcher', 'writer'] }) as Conversation
  return { ...f, group }
}

it('requires an explicit target in a parallel group and stops only that participant until its actual adapter exits', async () => {
  const release = new Map<string, () => void>(), signals = new Map<string, AbortSignal>(), calls: string[] = []
  const f = await groupFixture({ run: async ctx => {
    calls.push(ctx.agent.id); signals.set(ctx.agent.id, ctx.signal)
    await new Promise<void>(resolve => release.set(ctx.agent.id, resolve))
    await ctx.onDelta(`${ctx.agent.id}原回复`)
  } }); cleanup.push(() => { for (const done of release.values()) done() })
  const requestId = randomUUID()
  await f.client.invoke('sendMessage', { requestId, conversationId: f.group.id, content: '两人分别回复', mentionIds: [] })
  await vi.waitFor(() => expect(release.size).toBe(2))
  const targets = await f.client.invoke('getCancellationTargets', { conversationId: f.group.id }) as CancellationTarget[]
  const selected = targets.find(target => target.agentId === 'researcher')!, peer = targets.find(target => target.agentId === 'writer')!
  expect(targets).toHaveLength(2)
  const events: Record<string, unknown>[] = []
  expect(await executeRunCancellation(f.client, f.group.id, undefined, { emit: event => events.push(event) })).toBe(2)
  expect(events[0]).toMatchObject({ type: 'selection-required', targets })
  expect([...signals.values()].every(signal => !signal.aborted)).toBe(true)
  expect(await executeRunCancellation(f.client, f.group.id, selected.runId, { waitTimeout: 100, emit: event => events.push(event) })).toBe(4)
  expect(signals.get('researcher')!.aborted).toBe(true); expect(signals.get('writer')!.aborted).toBe(false)
  const stopping = await f.client.invoke('getRunCancellation', { conversationId: f.group.id, runId: selected.runId }) as RunCancellation
  expect(stopping).toMatchObject({ state: 'stopping', runIds: [selected.runId], activeRunIds: [selected.runId] })
  expect(stopping.runIds).not.toContain(peer.runId)
  release.get('researcher')!()
  expect(await executeRunCancellation(f.client, f.group.id, selected.runId, { waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(signals.get('writer')!.aborted).toBe(false)
  release.get('writer')!()
  await vi.waitFor(async () => expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).activeRunIds).toEqual([]))
  const detail = await f.app.handle('getConversation', { id: f.group.id }) as ConversationDetail
  expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.senderId)).toEqual(['writer'])
  expect(detail.deliveries?.filter(delivery => delivery.agentId === 'researcher').every(delivery => delivery.status === 'cancelled')).toBe(true)
  expect(detail.turns?.[0].status).toBe('cancelled')
  expect(calls.sort()).toEqual(['researcher', 'writer'])
  // A new explicit message may call this employee; the old anchor never cancels it.
  release.clear()
  await f.client.invoke('sendMessage', { requestId: randomUUID(), conversationId: f.group.id, content: 'researcher继续新消息', mentionIds: ['researcher'] })
  await vi.waitFor(() => expect(release.has('researcher')).toBe(true))
  expect(await executeRunCancellation(f.client, f.group.id, selected.runId, { emit: () => {} })).toBe(0)
  expect(signals.get('researcher')!.aborted).toBe(false)
  release.get('researcher')!()
})

it('cancels a decision before speaking and prevents peer publication from inviting it again', async () => {
  let releaseDecision!: () => void, deciding = false
  const gate = new Promise<void>(resolve => { releaseDecision = resolve }), calls: string[] = []
  const f = await groupFixture({ decide: async ctx => {
    if (ctx.agent.id === 'researcher') { deciding = true; await gate }
    return { action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence }
  }, run: async ctx => { calls.push(ctx.agent.id); await ctx.onDelta('同事完成') } }); cleanup.push(releaseDecision)
  const requestId = randomUUID()
  await f.client.invoke('sendMessage', { requestId, conversationId: f.group.id, content: '分别回复', mentionIds: [] })
  await vi.waitFor(() => expect(deciding).toBe(true))
  const target = (await f.client.invoke('getCancellationTargets', { conversationId: f.group.id }) as CancellationTarget[]).find(target => target.agentId === 'researcher')!
  const cancelled = await f.client.invoke('cancelRunExecution', { conversationId: f.group.id, runId: target.runId }) as RunCancellation
  expect(cancelled.state).toBe('stopping')
  releaseDecision()
  await vi.waitFor(async () => expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).activeRunIds).toEqual([]))
  expect(calls).toEqual(['writer'])
  expect(await executeRunCancellation(f.client, f.group.id, target.runId, { emit: () => {} })).toBe(0)
})

it('reconciles a lost cancellation acknowledgement by the same run and never sends a second mutation', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async () => { started = true; await gate } }); cleanup.push(release)
  await f.client.invoke('sendMessage', { requestId: randomUUID(), conversationId: f.room.id, content: 'stop', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  const target = (await f.client.invoke('getCancellationTargets', { conversationId: f.room.id }) as CancellationTarget[])[0]
  const invoke = f.client.invoke.bind(f.client), methods: string[] = []
  const spy = vi.spyOn(f.client, 'invoke').mockImplementation(async (channel, ...args) => {
    methods.push(channel); const result = await invoke(channel, ...args)
    if (channel === 'cancelRunExecution') { release(); throw new CliError('HANDLER_ERROR', 'lost cancellation response') }
    return result
  })
  expect(await executeRunCancellation(f.client, f.room.id, target.runId, { waitTimeout: 5000, emit: () => {} })).toBe(0)
  spy.mockRestore()
  expect(methods.filter(method => method === 'cancelRunExecution')).toHaveLength(1)
  expect(methods).toContain('getRunCancellation')
  await expect(f.client.invoke('cancelRunExecution', { conversationId: 'other', runId: target.runId })).rejects.toThrow()
})

it('leaves idle sessions unchanged and rejects a missing run', async () => {
  const f = await fixture()
  expect(await executeRunCancellation(f.client, f.room.id, undefined, { emit: () => {} })).toBe(0)
  expect(f.runs).toBe(0)
  await expect(f.client.invoke('cancelRunExecution', { conversationId: f.room.id, runId: 'missing' })).rejects.toThrow('原运行')
})

it('stops a work run through its original tree while the independent employee keeps working', async () => {
  const release = new Map<string, () => void>(), signals = new Map<string, AbortSignal>()
  const f = await groupFixture({ decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'task', work: { key: ctx.agent.id, scope: '独立原工作', deliverable: '各自结果' }, observedThroughSequence: ctx.participation!.observedThroughSequence }), run: async ctx => {
    signals.set(ctx.agent.id, ctx.signal)
    await new Promise<void>(resolve => release.set(ctx.agent.id, resolve))
    await ctx.onDelta('独立结果')
    await ctx.onWorkOutcome?.({ disposition: 'delivered', summary: '独立结果', evidence: [{ kind: 'answer', reference: '独立结果' }] })
  } }); cleanup.push(() => { for (const done of release.values()) done() })
  await f.client.invoke('sendMessage', { requestId: randomUUID(), conversationId: f.group.id, content: '各自完成工作', mentionIds: [] })
  await vi.waitFor(() => expect(release.size).toBe(2))
  const targets = await f.client.invoke('getCancellationTargets', { conversationId: f.group.id }) as CancellationTarget[]
  const selected = targets.find(target => target.agentId === 'researcher')!, peer = targets.find(target => target.agentId === 'writer')!
  const receipt = await f.client.invoke('cancelRunExecution', { conversationId: f.group.id, runId: selected.runId }) as RunCancellation
  expect(receipt).toMatchObject({ state: 'stopping', runIds: [selected.runId], workIds: [selected.workId] })
  expect(receipt.workIds).not.toContain(peer.workId); expect(signals.get('writer')!.aborted).toBe(false)
  release.get('researcher')!()
  expect(await executeRunCancellation(f.client, f.group.id, selected.runId, { waitTimeout: 5000, emit: () => {} })).toBe(0)
  release.get('writer')!()
  await vi.waitFor(async () => {
    const detail = await f.app.handle('getConversation', { id: f.group.id }) as ConversationDetail
    expect(detail.workItems?.find(work => work.id === selected.workId)?.status).toBe('cancelled')
    expect(detail.workItems?.find(work => work.id === peer.workId)?.status).toBe('delivered')
  })
})

it('keeps a partial cancellation unknown and does not replay it after a lost initial persistence response', async () => {
  let release!: () => void, signal!: AbortSignal
  const gate = new Promise<void>(resolve => { release = resolve })
  const f = await fixture({ run: async ctx => { signal = ctx.signal; await gate; await ctx.onDelta('原执行正常完成') } }); cleanup.push(release)
  await f.client.invoke('sendMessage', { requestId: randomUUID(), conversationId: f.room.id, content: '继续原执行', mentionIds: [] })
  await vi.waitFor(() => expect(signal).toBeTruthy())
  const target = (await f.client.invoke('getCancellationTargets', { conversationId: f.room.id }) as CancellationTarget[])[0]
  const store = (f.app as unknown as { store: ProductStore }).store, write = store.write.bind(store)
  let lost = false
  const spy = vi.spyOn(store, 'write').mockImplementation(async records => {
    await write(records)
    if (!lost && records.some(record => record.collection === 'runs' && record.id === target.runId && (record.value as { cancellation?: unknown }).cancellation)) { lost = true; throw new Error('lost prepared cancellation write') }
  })
  expect(await executeRunCancellation(f.client, f.room.id, target.runId, { emit: () => {} })).toBe(4)
  spy.mockRestore(); expect(lost).toBe(true); expect(signal.aborted).toBe(false)
  expect(await executeRunCancellation(f.client, f.room.id, target.runId, { emit: () => {} })).toBe(4)
  expect(signal.aborted).toBe(false)
  release()
})

it('does not advance an ordered group past a cancelled prerequisite', async () => {
  let release!: () => void, started = false
  const gate = new Promise<void>(resolve => { release = resolve }), calls: string[] = []
  const f = await groupFixture({ interpretGroup: async () => ({ mode: 'ordered', agentIds: ['researcher', 'writer'], instruction: '严格按前一个结果接续' }), run: async ctx => { calls.push(ctx.agent.id); started = true; await gate; await ctx.onDelta('已取消的前置结果') } }); cleanup.push(release)
  const requestId = randomUUID()
  await f.client.invoke('sendMessage', { requestId, conversationId: f.group.id, content: '按顺序执行', mentionIds: [] })
  await vi.waitFor(() => expect(started).toBe(true))
  const targets = await f.client.invoke('getCancellationTargets', { conversationId: f.group.id }) as CancellationTarget[]
  expect(targets.some(target => target.kind === 'participant' && target.agentId === 'writer')).toBe(true)
  const selected = targets.find(target => target.agentId === 'researcher' && target.runId)!
  await f.client.invoke('cancelRunExecution', { conversationId: f.group.id, runId: selected.runId })
  release()
  await vi.waitFor(async () => expect((await f.client.invoke('getMessageExecution', { requestId }) as MessageExecution).activeRunIds).toEqual([]))
  expect(calls).toEqual(['researcher'])
  const detail = await f.app.handle('getConversation', { id: f.group.id }) as ConversationDetail
  expect(detail.turns?.[0].status).toBe('cancelled')
  expect(detail.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
})

const cliSourceConfig = { name: '同名检索源', description: '', guide: '', enabled: true, type: 'mcp' as const, mcp: { transport: 'http' as const, url: 'http://127.0.0.1:1/mcp', authType: 'none' as const } }
async function sourceFixture(core = false) {
  let observed: ComposerReference[] | undefined
  const f = await fixture({ run: async context => { observed = context.messages.find(message => message.id === context.triggerMessageId)?.composerReferences; await context.onDelta('来源已核对') } })
  const source = await f.app.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: cliSourceConfig }) as DataSource
  const agent = (await f.app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === (core ? 'bobo' : 'researcher'))!
  const researcher = (await f.app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  await f.app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, connectionId: researcher.connectionId, modelId: 'fixture', sourceIds: core ? [] : [source.id] })
  return { ...f, source, employeeId: agent.id, get observed() { return observed } }
}

it.each(['send', 'employee', 'core'] as const)('retains explicit CLI source selection through original %s reception and repeat receipts', async kind => {
  const f = await sourceFixture(kind === 'core'), requestId = randomUUID()
  const target = kind === 'send' ? { conversationId: f.room.id } : { employeeId: f.employeeId }
  const composerReferences = await selectSources(f.client, [f.source.id, f.source.id], target, requestId)
  expect(composerReferences).toEqual([{ kind: 'source', id: f.source.id, name: f.source.name, revision: 1, agentId: f.employeeId }])
  const operation = kind === 'send' ? { kind: 'send' as const, conversationId: f.room.id, mentionIds: [], content: '使用明确来源' } : { kind: 'employee' as const, employeeId: f.employeeId, content: '使用明确来源' }
  expect(await executeMessage(f.client, { ...operation, composerReferences }, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(f.observed).toEqual(composerReferences)
  const before = await f.client.invoke('getMessageReceipt', { requestId }) as Message
  await f.app.handle('saveDataSource', { id: f.source.id, expectedRevision: 1, config: { ...cliSourceConfig, name: '新版名称' } })
  expect(await selectSources(f.client, [f.source.id], target, requestId)).toEqual(composerReferences)
  const channel = kind === 'send' ? 'sendMessage' : 'sendEmployeeMessage'
  const { kind: _kind, ...input } = operation
  expect((await f.client.invoke(channel, { ...input, composerReferences, requestId }) as Message).id).toBe(before.id)
  await expect(selectSources(f.client, ['different-source'], target, requestId)).rejects.toThrow('原requestId')
  await expect(f.client.invoke(channel, { ...input, composerReferences, requestId, content: '不同正文' })).rejects.toThrow('requestId')
})

it('rejects unbound, disabled, stale or group source selection before a user message is accepted', async () => {
  const f = await sourceFixture(), target = { conversationId: f.room.id }, requestId = randomUUID()
  const unbound = await f.app.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: cliSourceConfig }) as DataSource
  await expect(selectSources(f.client, [unbound.id], target, requestId)).rejects.toThrow('未授权')
  const references = await selectSources(f.client, [f.source.id], target, requestId)
  await f.app.handle('saveDataSource', { id: f.source.id, expectedRevision: 1, config: { ...cliSourceConfig, enabled: false } })
  await expect(selectSources(f.client, [f.source.id], target, requestId)).rejects.toThrow('未启用')
  await expect(f.client.invoke('sendMessage', { ...target, content: '禁止旧版本', mentionIds: [], requestId, composerReferences: references })).rejects.toThrow('变化')
  const group = await f.app.handle('createConversation', { kind: 'group', title: '多员工', agentIds: ['researcher', 'writer'] }) as Conversation
  await expect(selectSources(f.client, [unbound.id], { conversationId: group.id }, requestId)).rejects.toThrow('单员工')
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toBeNull()
  expect(f.observed).toBeUndefined()
})

it.each(['send', 'employee', 'core'] as const)('preserves a server working directory in %s reception without rewriting the message or prior receipt', async kind => {
  const f = await sourceFixture(kind === 'core')
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'boai-cli-working-position-'))); cleanup.push(() => rm(cwd, { recursive: true, force: true }))
  const requestId = randomUUID(), input = { content: '原始正文', requestId, workingDirectory: cwd, ...(kind === 'send' ? { conversationId: f.room.id, mentionIds: [] } : { employeeId: f.employeeId }) }, channel = kind === 'send' ? 'sendMessage' : 'sendEmployeeMessage'
  const first = await f.client.invoke(channel, input) as Message
  expect(first.content).toBe('原始正文'); expect(first.workingDirectory).toBe(cwd)
  await vi.waitFor(async () => { const detail = await f.app.handle('getConversation', { id: first.conversationId }) as ConversationDetail; expect(detail.runs.some(run => run.triggerMessageId === first.id && run.status === 'completed')).toBe(true) })
  await rm(cwd, { recursive: true })
  expect(await f.client.invoke(channel, input)).toEqual(first)
  await expect(f.client.invoke(channel, { ...input, workingDirectory: '/different' })).rejects.toThrow('requestId')
  await expect(f.client.invoke(channel, { ...input, requestId: randomUUID() })).rejects.toThrow()
})

it.each(['send', 'employee', 'core'] as const)('freezes a temporary API model in the original %s request without changing defaults or storing keys', async kind => {
  const seen: { phase: string; model: string; url?: string; key: string; employee: string }[] = []
  const observe = (ctx: EngineContext, phase: string) => seen.push({ phase, model: ctx.agent.modelId, url: ctx.connection?.baseUrl, key: ctx.apiKey, employee: ctx.agent.id })
  const f = await fixture({ decide: async ctx => { observe(ctx, 'decision'); return { action: 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation!.observedThroughSequence } }, run: async ctx => { observe(ctx, 'execution'); await ctx.onDelta('本轮模型已核对') } })
  const before = await f.app.handle('snapshot', undefined) as Snapshot
  const requestId = randomUUID(), employeeId = kind === 'core' ? 'bobo' : 'researcher'
  const apiModel = { provider: 'openai-compatible' as const, model: 'only-this-request', baseUrl: 'https://override.example/v1', apiKey: 'SYNTHETIC_REQUEST_SECRET_4091' }
  const operation = kind === 'send' ? { kind: 'send' as const, conversationId: f.room.id, mentionIds: [], content: '原始消息', apiModel } : { kind: 'employee' as const, employeeId, content: '原始消息', apiModel }
  expect(await executeMessage(f.client, operation, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(seen.some(item => item.phase === 'execution')).toBe(true)
  expect(seen.every(item => item.model === apiModel.model && item.url === apiModel.baseUrl && item.key === apiModel.apiKey && item.employee === employeeId)).toBe(true)
  const receipt = await f.client.invoke('getMessageReceipt', { requestId }) as Message
  expect(receipt).toMatchObject({ content: '原始消息', apiModelSource: { employeeId, connection: { defaultModel: apiModel.model, baseUrl: apiModel.baseUrl, hasApiKey: true } } })
  const count = seen.length
  expect(await executeMessage(f.client, operation, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(0); expect(seen).toHaveLength(count)
  const { kind: _kind, ...parameters } = operation
  await expect(f.client.invoke(kind === 'send' ? 'sendMessage' : 'sendEmployeeMessage', { ...parameters, requestId, apiModel: { ...apiModel, apiKey: 'different' } })).rejects.toThrow('不同')
  const after = await f.app.handle('snapshot', undefined) as Snapshot
  expect(after.connections).toEqual(before.connections)
  expect(after.agents.map(({ id, connectionId, modelId, configVersion }) => ({ id, connectionId, modelId, configVersion }))).toEqual(before.agents.map(({ id, connectionId, modelId, configVersion }) => ({ id, connectionId, modelId, configVersion })))
  const store = (f.app as unknown as { store: ProductStore }).store
  for (const collection of ['messages', 'requests', 'messageReceipts', 'coreConversationStarts', 'runs', 'snapshots']) expect(JSON.stringify(await store.load(collection))).not.toContain(apiModel.apiKey)
  if (kind !== 'core') {
    const normal = { kind: 'send' as const, conversationId: f.room.id, content: '下一条普通消息', mentionIds: [] }
    expect(await executeMessage(f.client, normal, { requestId: randomUUID(), waitTimeout: 5000, emit: () => {} })).toBe(0)
    expect(seen.at(-1)).toMatchObject({ model: 'fixture', url: 'http://localhost:1234', key: '' })
  }
})

it('keeps temporary model credentials out of original failure records', async () => {
  const key = 'SYNTHETIC_FAILURE_SECRET_4101', f = await fixture({ run: async ctx => { throw new Error('provider failure: ' + ctx.apiKey) } })
  const requestId = randomUUID()
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.room.id, content: '触发错误', mentionIds: [], apiModel: { model: 'once', apiKey: key } }, { requestId, waitTimeout: 5000, emit: () => {} })).toBe(1)
  const detail = await f.app.handle('getConversation', { id: f.room.id })
  expect(JSON.stringify(detail)).not.toContain(key)
  const store = (f.app as unknown as { store: ProductStore }).store
  for (const collection of ['requests', 'runs', 'snapshots']) expect(JSON.stringify(await store.load(collection))).not.toContain(key)
})

it('scopes a group API model override to its explicitly mentioned employee', async () => {
  const seen: { id: string; model: string }[] = []
  const f = await groupFixture({ run: async ctx => { seen.push({ id: ctx.agent.id, model: ctx.agent.modelId }); await ctx.onDelta('本人的模型已核对') } })
  const apiModel = { model: 'researcher-once' }, rejectedId = randomUUID()
  await expect(f.client.invoke('sendMessage', { requestId: rejectedId, conversationId: f.group.id, mentionIds: [], content: '无法确定覆盖对象', apiModel })).rejects.toThrow('明确选择一名')
  expect(await f.client.invoke('getMessageReceipt', { requestId: rejectedId })).toBeNull(); expect(seen).toEqual([])
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.group.id, mentionIds: ['researcher'], content: '请研究员回复', apiModel }, { requestId: randomUUID(), waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(seen).toContainEqual({ id: 'researcher', model: 'researcher-once' })
  expect(seen.filter(item => item.id === 'writer').every(item => item.model === 'fixture')).toBe(true)
  expect(await executeMessage(f.client, { kind: 'send', conversationId: f.group.id, mentionIds: ['writer'], content: '请作者正常回复' }, { requestId: randomUUID(), waitTimeout: 5000, emit: () => {} })).toBe(0)
  expect(seen).toContainEqual({ id: 'writer', model: 'fixture' })
})

it('uploads real local bytes through owner RPC and preserves material receipts without expanding conversation access', async () => {
  const f = await fixture(), path = join(f.root, '输入资料.md'), requestId = randomUUID()
  await writeFile(path, 'ATTACHMENT_REAL_BYTES_5829')
  const selections = await selectAttachments(f.client, [path], f.room.id, requestId)
  expect(selections).toHaveLength(1)
  const calls = vi.spyOn(f.client, 'invoke')
  expect(await selectAttachments(f.client, [path], f.room.id, requestId)).toEqual(selections)
  expect(calls.mock.calls.some(([name]) => name === 'transferMaterial')).toBe(false)
  calls.mockRestore()
  const preview = await f.app.handle('getMaterialPreview', { id: selections![0].id }) as import('../packages/shared/src/domain/materials').MaterialPreview
  expect(preview.text).toBe('ATTACHMENT_REAL_BYTES_5829'); expect(preview.material.deliveryScope).toBe('conversation')
  const other = await f.app.handle('createConversation', { kind: 'group', title: '其他群', agentIds: ['researcher', 'writer'] }) as Conversation
  await expect(f.client.invoke('sendMessage', { conversationId: other.id, content: '越过原聊天', mentionIds: [], materialSelections: selections, requestId: randomUUID() })).rejects.toThrow('不属于')
  const operation = { kind: 'send' as const, conversationId: f.room.id, content: '', mentionIds: [], materialSelections: selections }
  expect(await executeMessage(f.client, operation, { requestId, emit: () => {} })).toBe(0)
  const accepted = await f.client.invoke('getMessageReceipt', { requestId }) as Message
  expect(accepted.materialIds).toEqual(selections!.map(s => s.id)); expect(accepted.content).toBe('')
  expect(JSON.stringify(accepted)).not.toContain(path)
  expect(await selectAttachments(f.client, [path], f.room.id, requestId)).toEqual(selections)
  expect(await executeMessage(f.client, operation, { requestId, emit: () => {} })).toBe(0); expect(f.runs).toBe(1)
  await writeFile(path, 'CHANGED_ATTACHMENT')
  await expect(selectAttachments(f.client, [path], f.room.id, requestId)).rejects.toThrow('不同附件')
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toEqual(accepted)
})

it('carries prepared attachments through employee send and rejects public server path injection', async () => {
  const f = await fixture(), path = join(f.root, '原件.md'), requestId = randomUUID()
  await writeFile(path, 'EMPLOYEE_ATTACHMENT_6143')
  const selections = await selectAttachments(f.client, [path], f.room.id, requestId)
  await expect(f.client.invoke('prepareMaterial', { conversationId: f.room.id, path, requestId: randomUUID() })).rejects.toThrow()
  expect(await executeMessage(f.client, { kind: 'employee', employeeId: 'researcher', content: '', materialSelections: selections }, { requestId, emit: () => {} })).toBe(0)
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toMatchObject({ conversationId: f.room.id, materialIds: [selections![0].id] })
})


it('rejects local attachment links before uploading and reports an actionable file error', async () => {
  const f = await fixture(), source = join(f.root, 'source.md'), link = join(f.root, 'link.md')
  await writeFile(source, 'private source'); await symlink(source, link)
  const calls = vi.spyOn(f.client, 'invoke')
  await expect(selectAttachments(f.client, [link], f.room.id, randomUUID())).rejects.toThrow('符号链接')
  expect(calls.mock.calls.some(([name]) => name === 'transferMaterial')).toBe(false)
  calls.mockRestore()
})

it('publishes the first core conversation and uploaded originals together, with no empty room or token-dependent repeat', async () => {
  const f = await fixture(), file = join(f.root, '首次资料.md'), requestId = randomUUID()
  await writeFile(file, 'FIRST_CORE_MATERIAL_7701')
  const uploaded = await uploadEmployeeAttachments(f.client, [file], requestId)
  cleanup.push(uploaded.dispose)
  expect((await f.app.handle('snapshot', undefined) as Snapshot).conversations.filter(room => room.purpose === 'core')).toHaveLength(0)
  expect(await executeMessage(f.client, { kind: 'employee', employeeId: 'bobo', content: '', materialUploads: uploaded.materialUploads }, { requestId, emit: () => {} })).toBe(0)
  const message = await f.client.invoke('getMessageReceipt', { requestId }) as Message
  const detail = await f.app.handle('getConversation', { id: message.conversationId }) as ConversationDetail
  expect(detail.conversation).toMatchObject({ purpose: 'core', title: '首次资料.md', agentIds: ['bobo'] })
  expect(message.content).toBe(''); expect(message.materialIds).toHaveLength(1)
  expect(message.attachmentInputs).toEqual(uploaded.materialUploads!.map(({ selectionId: _id, ...file }) => file))
  expect(JSON.stringify(message)).not.toContain(uploaded.materialUploads![0].selectionId!)
  expect(await f.app.handle('getMaterialPreview', { id: message.materialIds![0] })).toMatchObject({ text: 'FIRST_CORE_MATERIAL_7701', material: { messageId: message.id, deliveryScope: 'conversation' } })
  const spy = vi.spyOn(f.client, 'invoke'), repeated = await uploadEmployeeAttachments(f.client, [file], requestId)
  expect(spy.mock.calls.some(([channel]) => channel === 'transferMaterial')).toBe(false); spy.mockRestore()
  expect(await executeMessage(f.client, { kind: 'employee', employeeId: 'bobo', content: '', materialUploads: repeated.materialUploads }, { requestId, emit: () => {} })).toBe(0)
  expect(f.runs).toBe(1)
  await expect(f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', content: '', requestId, materialUploads: repeated.materialUploads!.map(file => ({ ...file, size: file.size + 1 })) })).rejects.toThrow('不同核心')
  expect((await f.app.handle('snapshot', undefined) as Snapshot).conversations.filter(room => room.purpose === 'core')).toHaveLength(1)
})

it('rejects bad first attachments without publishing a core room, message or model run and cleans prepared originals', async () => {
  const f = await fixture(), first = join(f.root, 'ready.md'), second = join(f.root, 'invalid.md'), requestId = randomUUID()
  await writeFile(first, 'VALID_BUT_UNPUBLISHED'); await writeFile(second, Buffer.from([0xff, 0xfe]))
  const uploaded = await uploadEmployeeAttachments(f.client, [first, second], requestId); cleanup.push(uploaded.dispose)
  await expect(f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', content: '', requestId, materialUploads: uploaded.materialUploads })).rejects.toThrow('附件准备失败')
  expect(await f.client.invoke('getMessageReceipt', { requestId })).toBeNull()
  expect((await f.app.handle('snapshot', undefined) as Snapshot).conversations.filter(room => room.purpose === 'core')).toHaveLength(0)
  expect(f.runs).toBe(0)
  const store = (f.app as unknown as { store: ProductStore }).store
  const materials = await store.load<import('../packages/shared/src/domain/materials').ConversationMaterial>('materials')
  expect(materials).toHaveLength(2)
  for (const material of materials) {
    expect(material.status).toBe('removed'); expect(material.messageId).toBeUndefined()
    await expect(readFile(join(f.root, 'materials', material.conversationId, material.id, 'original'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  await expect(f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', content: '', requestId: randomUUID() })).rejects.toThrow('添加附件')
})

it('reconciles pre-upload CLI attachment receipts using their original material selections', async () => {
  const f = await fixture(), file = join(f.root, 'legacy.md'), requestId = randomUUID()
  await writeFile(file, 'LEGACY_PREPARED_ATTACHMENT')
  const materialSelections = await selectAttachments(f.client, [file], f.room.id, requestId)
  expect(await executeMessage(f.client, { kind: 'employee', employeeId: 'researcher', content: '', materialSelections }, { requestId, emit: () => {} })).toBe(0)
  const repeated = await uploadEmployeeAttachments(f.client, [file], requestId)
  expect(repeated.materialUploads).toBeUndefined(); expect(repeated.materialSelections).toEqual(materialSelections)
  expect(await executeMessage(f.client, { kind: 'employee', employeeId: 'researcher', content: '', materialSelections: repeated.materialSelections }, { requestId, emit: () => {} })).toBe(0)
  expect(f.runs).toBe(1)
})

it('retains first core attachment bytes after an unknown commit and recovers the same receipt without dispatching twice', async () => {
  const f = await fixture(), file = join(f.root, 'unknown.md'), requestId = randomUUID()
  await writeFile(file, 'CORE_UNKNOWN_COMMIT_ORIGINAL_7702')
  const uploaded = await uploadEmployeeAttachments(f.client, [file], requestId); cleanup.push(uploaded.dispose)
  const store = (f.app as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
  let injected = false
  const spy = vi.spyOn(store, 'transaction').mockImplementation(async operation => {
    let published = false
    const result = await transaction(tx => operation({ ...tx, put: async record => {
      if (record.collection === 'coreConversationStarts' && record.id === requestId) published = true
      return tx.put(record)
    } }))
    if (published && !injected) { injected = true; throw new Error('lost core attachment commit response') }
    return result
  })
  await expect(f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', content: '', requestId, materialUploads: uploaded.materialUploads })).rejects.toThrow('lost core attachment')
  spy.mockRestore(); expect(injected).toBe(true); expect(f.runs).toBe(0)
  const accepted = (await store.load<Message>('messages')).find(message => message.senderType === 'user' && message.attachmentInputs)!
  expect(await readFile(join(f.root, 'materials', accepted.conversationId, accepted.materialIds![0], 'original'), 'utf8')).toBe('CORE_UNKNOWN_COMMIT_ORIGINAL_7702')
  await expect(f.client.invoke('getMessageReceipt', { requestId })).rejects.toThrow('重启')
  await uploaded.dispose(); f.client.destroy(); await f.desktop.close(); await f.app.close()
  let modelCalls = 0
  const recovered = new AppService({ dataPath: f.root, skillDiscovery: { homeDir: f.root }, engine: { test: async () => '', decide: async () => { modelCalls++; throw new Error('must not replay') }, run: async () => { modelCalls++; throw new Error('must not replay') } }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
  cleanup.push(() => recovered.close()); await recovered.init()
  expect(await recovered.handle('getMessageReceipt', { requestId })).toEqual(accepted)
  expect(await recovered.handle('sendEmployeeMessage', { employeeId: 'bobo', content: '', requestId, materialUploads: accepted.attachmentInputs })).toEqual(accepted)
  expect(await recovered.handle('getMaterialPreview', { id: accepted.materialIds![0] })).toMatchObject({ text: 'CORE_UNKNOWN_COMMIT_ORIGINAL_7702' })
  expect(modelCalls).toBe(0)
})

async function savePermission(app: AppService, employeeId: string, permission: NonNullable<DigitalAgent['executionPermission']>) {
  const snapshot = await app.handle('snapshot', undefined) as Snapshot
  const agent = snapshot.agents.find(value => value.id === employeeId)!
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, systemRole: _s, creationSource: _c, ...definition } = agent
  return await app.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: permission }) as DigitalAgent
}

it.each((['read-only', 'ask', 'full-access'] as const).flatMap(permission => (['send', 'employee', 'core'] as const).map(kind => ({ permission, kind }))))('checks saved $permission in $kind without changing policy and preserves old receipts after permission changes', async ({ permission, kind }) => {
  let observed: EngineContext | undefined
  const f = await fixture({ run: async context => { observed = context; await context.onDelta('保存权限保持') } }, permission)
  const employeeId = kind === 'core' ? 'bobo' : 'researcher'
  if (kind === 'core') await savePermission(f.app, employeeId, permission)
  const before = (await f.app.handle('snapshot', undefined) as Snapshot).agents
  const input = { expectedExecutionPermission: permission, content: '核对权限', requestId: randomUUID(), ...(kind === 'send' ? { conversationId: f.room.id, mentionIds: [] } : { employeeId }) }
  const channel = kind === 'send' ? 'sendMessage' : 'sendEmployeeMessage'
  const first = await f.client.invoke(channel, input) as Message
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId: input.requestId })).toMatchObject({ state: 'completed' }))
  expect(first.permissionExpectation).toEqual({ permission, agentIds: [employeeId] })
  expect(observed?.agent.executionPermission).toBe(permission)
  // Core may lazily bind its original default connection; mode never changes its permission.
  const after = (await f.app.handle('snapshot', undefined) as Snapshot).agents
  expect(after.map(agent => [agent.id, agent.executionPermission, agent.nativeOptions])).toEqual(before.map(agent => [agent.id, agent.executionPermission, agent.nativeOptions]))
  const different = permission === 'read-only' ? 'full-access' : 'read-only'
  await expect(f.client.invoke(channel, { ...input, expectedExecutionPermission: different })).rejects.toThrow('requestId')
  await savePermission(f.app, employeeId, different)
  expect(await f.client.invoke(channel, input)).toEqual(first)
  const rejectedId = randomUUID()
  await expect(f.client.invoke(channel, { ...input, requestId: rejectedId })).rejects.toThrow('CLI不会临时改权')
  expect(await f.client.invoke('getMessageReceipt', { requestId: rejectedId })).toBeNull()
  // The actual model/tool gate checks current policy again with the original frozen context.
  await expect((f.app as unknown as { assertMaterialRefs(context: EngineContext): Promise<void> }).assertMaterialRefs(observed!)).rejects.toThrow('CLI不会临时改权')
})

it('rejects undefined saved permissions before creating an ordinary employee session', async () => {
  const f = await fixture()
  for (const employeeId of ['researcher', 'writer']) {
    const before = (await f.app.handle('snapshot', undefined) as Snapshot).conversations
    const requestId = randomUUID()
    await expect(f.client.invoke('sendEmployeeMessage', { employeeId, expectedExecutionPermission: 'full-access', content: '不得代改权限', requestId })).rejects.toThrow('尚未明确配置')
    expect((await f.app.handle('snapshot', undefined) as Snapshot).conversations).toEqual(before)
    expect(await f.client.invoke('getMessageReceipt', { requestId })).toBeNull()
  }
  expect(f.runs).toBe(0)
})

it('uses Bobo explicit default permission and rejects a different CLI expectation without changing it', async () => {
  const f = await fixture()
  const before = (await f.app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
  expect(before.executionPermission).toBe('full-access')
  const wrong = randomUUID()
  await expect(f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', expectedExecutionPermission: 'read-only', content: '错误模式不能发出', requestId: wrong })).rejects.toThrow('CLI不会临时改权')
  expect(await f.client.invoke('getMessageReceipt', { requestId: wrong })).toBeNull()
  const accepted = await f.client.invoke('sendEmployeeMessage', { employeeId: 'bobo', expectedExecutionPermission: 'full-access', content: '沿已保存权限', requestId: randomUUID() }) as Message
  expect(accepted.permissionExpectation).toEqual({ permission: 'full-access', agentIds: ['bobo'] })
  expect((await f.app.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')).toMatchObject({ executionPermission: before.executionPermission, allowCommands: before.allowCommands })
  await vi.waitFor(() => expect(f.runs).toBe(1))
})

it('checks every addressed group employee but does not change or borrow a peer permission', async () => {
  const observed: string[] = []
  const f = await groupFixture({ run: async ctx => { observed.push(ctx.agent.id); await ctx.onDelta('本人权限') } })
  await savePermission(f.app, 'researcher', 'full-access'); await savePermission(f.app, 'writer', 'ask')
  const input = { conversationId: f.group.id, expectedExecutionPermission: 'full-access', content: '只选择明确成员', requestId: randomUUID(), mentionIds: [] }
  await expect(f.client.invoke('sendMessage', input)).rejects.toThrow('CLI不会临时改权')
  expect(await f.client.invoke('getMessageReceipt', { requestId: input.requestId })).toBeNull()
  const message = await f.client.invoke('sendMessage', { ...input, mentionIds: ['researcher'] }) as Message
  expect(message.permissionExpectation).toEqual({ permission: 'full-access', agentIds: ['researcher'] })
  await vi.waitFor(async () => expect(await f.client.invoke('getMessageExecution', { requestId: input.requestId })).toMatchObject({ state: 'completed' }))
  expect(observed).toEqual(['researcher'])
  expect((await f.client.invoke('employees') as DigitalAgent[]).find(agent => agent.id === 'writer')?.executionPermission).toBe('ask')
})

it('checks session creation mode before mutation and reconciles the same receipt after a saved permission change', async () => {
  const f = await fixture({}, 'read-only'), requestId = randomUUID()
  const mismatch = { kind: 'create' as const, employeeId: 'researcher', expectedExecutionPermission: 'full-access' as const }
  await expect(executeSessionOperation(f.client, mismatch, requestId)).rejects.toThrow('CLI不会临时改权')
  expect(await f.client.invoke('getSessionReceipt', { requestId })).toBeNull()
  const operation = { ...mismatch, expectedExecutionPermission: 'read-only' as const }
  const accepted = await executeSessionOperation(f.client, operation, requestId)
  expect(accepted.exitCode).toBe(0)
  await savePermission(f.app, 'researcher', 'full-access')
  expect(await executeSessionOperation(f.client, operation, requestId)).toEqual(accepted)
  await expect(executeSessionOperation(f.client, mismatch, requestId)).rejects.toThrow()
  expect(f.runs).toBe(0)
})

it('drains retired upload preparation without blocking unrelated owner mutations', async () => {
  const f = await fixture(), bytes = Buffer.from('held uploaded original'), uploadId = randomUUID()
  await f.client.invoke('transferMaterial', { action: 'begin', uploadId, name: 'held.md', size: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex') })
  await f.client.invoke('transferMaterial', { action: 'chunk', uploadId, offset: 0, base64: bytes.toString('base64') })
  const selected = await f.client.invoke('transferMaterial', { action: 'finish', uploadId }) as { selectionId: string }
  const uploads = (f.app as unknown as { materialUploads: MaterialUploads }).materialUploads
  let release!: () => void, enter!: () => void, finished = false
  const gate = new Promise<void>(resolve => { release = resolve }), ready = new Promise<void>(resolve => { enter = resolve })
  const prepared = uploads.prepare(selected.selectionId, async source => { enter(); await gate; expect(await readFile(source.path)).toEqual(bytes) })
  cleanup.push(async () => { release(); await prepared })
  await ready
  const aborting = f.client.invoke('transferMaterial', { action: 'abort', uploadId }).then(() => { finished = true }); void aborting.catch(() => {})
  await vi.waitFor(() => expect(uploads.has(selected.selectionId)).toBe(false))
  let created = false
  const other = f.client.invoke('createEmployeeSession', { employeeId: 'writer', name: 'unrelated while draining', requestId: randomUUID() }).then(value => { created = true; return value })
  void other.catch(() => {})
  await vi.waitFor(() => expect(created).toBe(true), { timeout: 1000 })
  expect(finished).toBe(false); expect(uploads.busy).toBe(true)
  release(); await prepared; await aborting; await other
  expect(finished).toBe(true); expect(uploads.busy).toBe(false); expect(f.runs).toBe(0)
})
