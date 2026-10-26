/*
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 核心员工现行默认完全权限；显式配置不改变普通员工原审批权限。
 * [OUTPUT]: API完整/审批权限下的命令关闭跨其他字段保存与重启保持，整体只读不能借命令开关扩权。
 * [OUTPUT]: API群只读并发/命令互斥两种准入保持独立批准；自动化持久许可与备份原件保持。
 * [OUTPUT]: 绑定本地源仍须当前员工目录批准；拒绝/完全访问/只读及审批前零写入沿真实AppService核对。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 原生产品目录申请走真实AppService/SQLite，普通聊天无Work；本次/持久/拒绝/取消及只读/完全权限回执分别核对。
 * [OUTPUT]: 显式cwd实际命令/相对文件、合并审批、临时许可/拒绝及目录替换零写入。
 * [OUTPUT]: 命令与多个目录共用一次批准，验证拒绝/永久授权/下一命令再批准及全权限；保留原文件业务验证。
 * [INPUT]: 真实AppService/SQLite、Mastra文件工具、隔离业务目录与可控员工执行。
 * [OUTPUT]: 目录审批前零访问、临时/持久授权、重启/拒绝/撤销及原任务接续的业务验证。
 * [POS]: WS1/WS2目录批准端到端服务回归；不冒充模型或Electron实际验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readlink, realpath, rename, rm, symlink, writeFile, cp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import { createNativeProducts } from '../packages/runtime/src/adapters/native-products'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { AgentInput, Approval, Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import type { DataSource } from '../packages/shared/src/domain/sources'
import type { AutomationDefinition, AutomationOccurrence } from '../packages/shared/src/domain/automations'

const roots: string[] = [], services: AppService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) await service.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function until(predicate: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 6000
  while (!await predicate()) { if (Date.now() > deadline) throw new Error('Expected service state was not reached'); await new Promise(resolve => setTimeout(resolve, 10)) }
}
const snapshot = (service: AppService) => service.handle('snapshot', undefined) as Promise<Snapshot>
const details = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
function input(agent: DigitalAgent, patch: Partial<AgentInput> = {}): AgentInput {
  const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...fields } = agent
  return { ...fields, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, ...patch }
}
class DirectoryEngine implements AgentEngine {
  errors: unknown[] = []
  contexts: EngineContext[] = []
  handler: (context: EngineContext) => Promise<void> = async () => {}
  decide: AgentEngine['decide'] = async context => ({ action: 'reply', responseKind: 'task', work: { key: context.triggerMessageId!, scope: '验证目录授权', deliverable: '返回实际结果' }, observedThroughSequence: Math.max(0, ...context.messages.map(message => message.sequence)) })
  report: AgentEngine['report'] = async (_context, draft) => ({ action: 'publish', text: draft.text })
  async run(context: EngineContext) { this.contexts.push(context); try { await this.handler(context) } catch (error) { this.errors.push(error); throw error } await context.onDelta('已完成目录操作') }
  async test() { return 'connected' }
}
async function task(context: EngineContext, action: (call: (name: string, args: unknown) => Promise<any>) => Promise<void>) {
  const runtime = await createTaskRuntime(context)
  try { await action(async (name, args) => {
    const tool = runtime.tools[name as keyof typeof runtime.tools]
    if (!tool?.execute) throw new Error(`Missing tool ${name}`)
    const result = await tool.execute(args as never, { requestContext: new RequestContext(), observe: noopObserve })
    if (result && typeof result === 'object' && 'error' in result) throw new Error(String(result.error))
    return result
  }) } finally { await runtime.dispose() }
}
async function fixture(permission: DigitalAgent['executionPermission'] = 'ask') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-directory-approval-'))); roots.push(root)
  const a = join(root, 'coding'), b = join(root, 'reports'), dataPath = join(root, 'data')
  await mkdir(a); await mkdir(b); await writeFile(join(a, 'original.txt'), 'A'); await writeFile(join(b, 'original.txt'), 'B')
  const engine = new DirectoryEngine(), secrets = { get: async () => undefined, set: async () => {}, delete: async () => {} }
  const open = async () => { const service = new AppService({ dataPath, engine, secrets, emit: () => {} }); services.push(service); await service.init(); return service }
  const service = await open()
  const connection = await service.handle('saveConnection', { name: 'Isolated fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' }) as Connection
  let agent = (await snapshot(service)).agents.find(agent => agent.id === 'researcher')!
  agent = await service.handle('saveAgent', input(agent, { connectionId: connection.id, modelId: 'fixture', executionPermission: permission, allowCommands: permission !== 'read-only', directoryGrants: [{ path: a, access: 'read-write' }] })) as DigitalAgent
  const conversation = await service.handle('createConversation', { kind: 'direct', title: '目录测试', agentIds: [agent.id] }) as Conversation
  let sequence = 0
  const send = (target = service, chat = conversation) => target.handle('sendMessage', { conversationId: chat.id, content: '按明确路径执行验证', requestId: `directory-request-${++sequence}`, mentionIds: [] })
  const pending = async (target = service) => { await until(async () => (await snapshot(target)).approvals.length === 1); return (await snapshot(target)).approvals[0] }
  const idle = async (count: number, target = service, chat = conversation) => until(async () => { const runs = (await details(target, chat)).runs.filter(run => run.phase === 'execution'); return runs.length === count && runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) })
  const approve = (approval: Approval, approved = true, always = false, target = service) => target.handle('approve', { id: approval.id, approved, always })
  return { root, a, b, dataPath, engine, open, service, agent, conversation, send, pending, idle, approve }
}

async function evidence(name: string, f: Awaited<ReturnType<typeof fixture>>, facts: unknown, dataPath = f.dataPath) {
  if (!process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR) return
  const output = join(process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR, name); await mkdir(output, { recursive: true })
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  try { await store.backup(join(output, 'boai.sqlite')) } finally { await store.close() }
  await writeFile(join(output, 'facts.json'), JSON.stringify({ externalRequests: 0, facts }, null, 2))
}

describe('目录许可跨原业务生命周期', () => {
  it.each(['ask', 'read-only'] as const)('群内每位员工沿自己的目录授权，一个员工的批准不授权另一员工：%s', async permission => {
    const f = await fixture(permission), writer = (await snapshot(f.service)).agents.find(agent => agent.id === 'writer')!
    await f.service.handle('saveAgent', input(writer, { connectionId: f.agent.connectionId, modelId: f.agent.modelId, executionPermission: permission, directoryGrants: [{ path: f.b, access: 'read-write' }] }))
    const group = await f.service.handle('createConversation', { kind: 'group', title: '独立目录', agentIds: [f.agent.id, writer.id] }) as Conversation
    const reads: Record<string, string[]> = {}
    f.engine.decide = async context => context.participation?.hasRespondedInTurn ? { action: 'pass', observedThroughSequence: context.participation.observedThroughSequence } : { action: 'reply', responseKind: 'task', work: { key: `directory-${context.agent.id}`, scope: `${context.agent.name}独立核对本人目录许可`, deliverable: `${context.agent.name}的读取结果` }, observedThroughSequence: context.participation!.observedThroughSequence }
    f.engine.handler = context => task(context, async call => {
      const own = context.agent.id === f.agent.id ? f.a : f.b, other = own === f.a ? f.b : f.a
      reads[context.agent.id] = [(await call('read_file', { path: join(own, 'original.txt') })).content]
      reads[context.agent.id].push((await call('read_file', { path: join(other, 'original.txt') })).content)
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已完成目录操作', evidence: [{ kind: 'answer', reference: '已完成目录操作' }] })
    })
    await f.send(f.service, group)
    try { await until(async () => (await snapshot(f.service)).approvals.length === (permission === 'read-only' ? 2 : 1)) }
    catch (error) { await evidence(`group-${permission}-failed`, f, { reads, errors: f.engine.errors.map(String), state: await snapshot(f.service), detail: await details(f.service, group) }); throw error }
    const pending = (await snapshot(f.service)).approvals, runs = (await details(f.service, group)).runs
    const first = pending.find(approval => runs.find(run => run.id === approval.runId)?.agentId === f.agent.id)!
    expect(first).toBeDefined()
    expect(reads).toEqual(permission === 'read-only' ? { researcher: ['A'], writer: ['B'] } : { researcher: ['A'] })
    await f.approve(first, true, true)
    await until(() => reads.researcher?.length === 2)
    await until(async () => (await snapshot(f.service)).approvals.some(approval => approval.id !== first.id))
    const second = (await snapshot(f.service)).approvals.find(approval => approval.id !== first.id)!
    expect((await details(f.service, group)).runs.find(run => run.id === second.runId)?.agentId).toBe(writer.id)
    expect(second.directory).toMatchObject({ directory: f.a, access: 'read-only' })
    expect(reads.writer).toEqual(['B'])
    expect((await snapshot(f.service)).approvals.map(approval => approval.id)).toContain(second.id)
    await f.approve(second, false)
    await until(async () => (await details(f.service, group)).runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)))
    const state = await snapshot(f.service)
    expect(state.agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toContainEqual({ path: f.b, access: 'read-only' })
    expect(state.agents.find(agent => agent.id === writer.id)?.directoryGrants).toEqual([{ path: f.b, access: 'read-write' }])
    expect(f.engine.errors).toHaveLength(1); expect(String(f.engine.errors[0])).toContain('拒绝')
    expect(await readFile(join(f.a, 'original.txt'), 'utf8')).toBe('A'); expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('B')
    await evidence(`group-${permission}`, f, { reads, pending: [first, second], state, detail: await details(f.service, group) })
  })

  it('原自动化目录批准接续同一次执行，持久许可在新触发使用且重启不重复触发', async () => {
    const f = await fixture(), observed: { runId: string; occurrenceId: string; content: string }[] = []
    const plan = await f.service.handle('saveAutomation', { name: '目录定时核对', prompt: '读取报告目录原件', conversationPolicy: 'new-conversation', employeeIds: [f.agent.id], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }) as AutomationDefinition
    f.engine.handler = context => task(context, async call => {
      const result = await call('read_file', { path: join(f.b, 'original.txt') })
      observed.push({ runId: context.runId, occurrenceId: context.work!.origin!.occurrenceId, content: result.content })
      await context.onWorkOutcome!({ disposition: 'delivered', summary: '已完成目录操作', evidence: [{ kind: 'answer', reference: '已完成目录操作' }] })
    })
    const first = await f.service.handle('runAutomation', { id: plan.id, requestId: 'directory-auto-first' }) as AutomationOccurrence
    const approval = await f.pending(); expect(observed).toEqual([])
    await f.approve(approval, true, true)
    await until(async () => (await f.service.handle('getAutomationOccurrence', { id: first.id }) as AutomationOccurrence).status === 'completed')
    expect(observed).toEqual([{ runId: approval.runId, occurrenceId: first.id, content: 'B' }])
    await f.service.close(); const restarted = await f.open()
    expect((await restarted.handle('runAutomation', { id: plan.id, requestId: 'directory-auto-first' }) as AutomationOccurrence).id).toBe(first.id)
    expect(observed).toHaveLength(1)
    const second = await restarted.handle('runAutomation', { id: plan.id, requestId: 'directory-auto-second' }) as AutomationOccurrence
    await until(async () => (await restarted.handle('getAutomationOccurrence', { id: second.id }) as AutomationOccurrence).status === 'completed')
    expect(observed).toHaveLength(2); expect(observed[1]).toMatchObject({ occurrenceId: second.id, content: 'B' })
    expect((await snapshot(restarted)).approvals).toEqual([]); expect(f.engine.errors).toEqual([])
    await evidence('automation', f, { first, second, observed, state: await snapshot(restarted) })
  })

  it('备份保存目录许可但不复制业务目录，恢复后不改写原件或恢复临时授权', async () => {
    const f = await fixture(), backup = join(f.root, 'backup'), restoredPath = join(f.root, 'restored')
    f.engine.handler = context => task(context, async call => { await call('read_file', { path: join(f.b, 'original.txt') }) })
    await f.send(); await f.approve(await f.pending()); await f.idle(1)
    await f.service.backup(backup)
    expect((await readdir(backup, { recursive: true })).some(name => String(name).endsWith('original.txt'))).toBe(false)
    await writeFile(join(f.b, 'original.txt'), 'EXTERNAL-AFTER-BACKUP')
    await cp(backup, restoredPath, { recursive: true })
    const restored = new AppService({ dataPath: restoredPath, engine: f.engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    services.push(restored); const before = f.engine.contexts.length; await restored.init()
    expect(f.engine.contexts).toHaveLength(before)
    expect((await snapshot(restored)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    expect((await snapshot(restored)).approvals).toEqual([])
    expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('EXTERNAL-AFTER-BACKUP')
    await f.send(restored); const approval = await f.pending(restored)
    expect(approval.directory?.directory).toBe(f.b)
    await f.approve(approval, false, false, restored); await f.idle(2, restored)
    expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('EXTERNAL-AFTER-BACKUP')
    await evidence('backup', f, { backupEntries: await readdir(backup, { recursive: true }), restored: await snapshot(restored), approval, originalContent: await readFile(join(f.b, 'original.txt'), 'utf8') }, restoredPath)
  })
})

describe('API目录申请沿原宿主事务', () => {
  it.each(['approve', 'deny', 'full-access', 'read-only'] as const)('本地数据源绑定不能越过目录授权：%s', async mode => {
    const f = await fixture(mode === 'full-access' || mode === 'read-only' ? mode : 'ask')
    const source = await f.service.handle('saveDataSource', { id: randomUUID(), expectedRevision: 0, config: { type: 'local', name: '报告', description: '', guide: '', enabled: true, local: { path: f.b } } }) as DataSource
    await f.service.handle('saveAgent', input(f.agent, { sourceIds: [source.id] }))
    const read: unknown[] = [], target = join(f.b, 'sub/result.txt')
    f.engine.handler = async context => {
      await context.inspectDataSource!(source.id)
      read.push(await context.callDataSource!({ sourceId: source.id, tool: 'files', arguments: { operation: 'read', path: 'original.txt' } }))
      const write = context.callDataSource!({ sourceId: source.id, tool: 'files', arguments: { operation: 'write', path: 'sub/result.txt', content: 'SOURCE-AUTHORIZED', expectedHash: null } })
      if (mode === 'read-only') await expect(write).rejects.toThrow('只读')
      else await write
    }
    await f.send()
    if (mode !== 'full-access') {
      const approval = await f.pending()
      expect(approval).toMatchObject({ kind: 'directory', directory: { directory: f.b, access: 'read-only' } })
      expect(read).toEqual([])
      await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
      await f.approve(approval, mode !== 'deny')
      if (mode === 'approve') {
        const writeApproval = await f.pending()
        expect(writeApproval.kind).toBe('source')
        await f.approve(writeApproval)
        const directory = await f.pending()
        expect(directory).toMatchObject({ kind: 'directory', directory: { directory: f.b, access: 'read-write' } })
        await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
        await f.approve(directory)
      }
    }
    await f.idle(1)
    expect(f.engine.errors).toHaveLength(mode === 'deny' ? 1 : 0)
    expect(read).toHaveLength(mode === 'deny' ? 0 : 1)
    if (read.length) expect(read[0]).toMatchObject({ content: 'B' })
    if (mode === 'approve' || mode === 'full-access') expect(await readFile(target, 'utf8')).toBe('SOURCE-AUTHORIZED')
    else await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    expect((await snapshot(f.service)).approvals).toEqual([])
  })
  it.each(['run', 'employee', 'deny', 'cancel'] as const)('普通聊天申请目录不创建Work，保留%s原回执与重启状态', async choice => {
    const f = await fixture(), results: unknown[] = []
    f.engine.decide = async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    f.engine.handler = async context => {
      expect(context.work).toBeUndefined()
      const products = createNativeProducts({ ...context, ensureNativeWork: async () => { throw new Error('目录申请不应认领Work') } })
      try { results.push(await products.tools.find(tool => tool.name === 'request_directory')!.execute({ directory: f.b, access: 'read-only', reason: '查阅报告目录' }, 'directory-01')) }
      finally { await products.dispose() }
    }
    await f.send(); const approval = await f.pending()
    expect(approval).toMatchObject({ kind: 'directory', directory: { directory: f.b, access: 'read-only', reason: '查阅报告目录' } })
    expect((await details(f.service, f.conversation)).runs.find(run => run.id === approval.runId)?.workId).toBeUndefined()
    expect(results).toEqual([])
    if (choice === 'cancel') await f.service.handle('cancelRunExecution', { conversationId: f.conversation.id, runId: approval.runId })
    else await f.approve(approval, choice !== 'deny', choice === 'employee')
    await f.idle(1)
    const granted = choice === 'run' || choice === 'employee'
    expect(results).toEqual(granted ? [{ directory: f.b, access: 'read-only', authorized: true }] : [])
    expect(f.engine.errors).toHaveLength(granted ? 0 : 1)
    if (choice === 'cancel') await expect(f.approve(approval)).rejects.toThrow()
    else expect(await f.service.handle('getDirectoryApprovalReceipt', { id: approval.id })).toMatchObject({ choice })
    expect((await details(f.service, f.conversation)).runs.every(run => !run.workId)).toBe(true)
    expect((await snapshot(f.service)).commandPermissions ?? []).toEqual([])
    const after = (await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)!
    expect(after.configVersion).toBe(f.agent.configVersion)
    expect(after.directoryGrants).toEqual(choice === 'employee' ? [...f.agent.directoryGrants!, { path: f.b, access: 'read-only' }] : f.agent.directoryGrants)
    await f.service.close(); const restarted = await f.open()
    expect((await snapshot(restarted)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(after.directoryGrants)
    expect((await snapshot(restarted)).approvals).toEqual([]); expect(f.engine.contexts).toHaveLength(1)
    expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('B')
  })
  it.each(['read-only', 'full-access'] as const)('普通聊天申请遵守员工%s权限', async permission => {
    const f = await fixture(permission), results: unknown[] = []
    f.engine.decide = async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence })
    f.engine.handler = async context => {
      const products = createNativeProducts(context), tool = products.tools.find(tool => tool.name === 'request_directory')!
      try {
        results.push(await tool.execute({ directory: f.b, access: 'read-only', reason: '读取报告' }, 'read'))
        const write = tool.execute({ directory: f.b, access: 'read-write', reason: '编辑报告' }, 'write')
        if (permission === 'read-only') await expect(write).rejects.toThrow('只读')
        else results.push(await write)
        expect(context.work).toBeUndefined()
      } finally { await products.dispose() }
    }
    await f.send()
    if (permission === 'read-only') await f.approve(await f.pending())
    await f.idle(1); expect(f.engine.errors).toEqual([]); expect(results).toHaveLength(permission === 'read-only' ? 1 : 2)
    expect((await snapshot(f.service)).approvals).toEqual([])
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
})

describe('真实目录审批与文件接续', () => {
  it.skipIf(process.platform !== 'darwin')('一条命令的多个新目录只出现一次批准，之前不执行任何命令副作用', async () => {
    const f = await fixture(), c = join(f.root, 'outputs'), result = join(c, 'copied.txt'), marker = join(f.a, 'started.txt')
    await mkdir(c)
    const command = `printf started > ${shellQuote(marker)}; /bin/cat ${shellQuote(join(f.b, 'original.txt'))} > ${shellQuote(result)}`
    f.engine.handler = context => task(context, async call => {
      expect(await call('execute_command', { command, directories: [{ path: f.b, access: 'read-only' }, { path: c, access: 'read-write' }] })).toMatchObject({ approved: true, exitCode: 0 })
    })
    await f.send(); const approval = await f.pending()
    expect(approval).toMatchObject({ kind: 'command', command, commandDirectories: [{ directory: f.b, access: 'read-only' }, { directory: c, access: 'read-write' }] })
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(readFile(result)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.approve(approval); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(await readFile(result, 'utf8')).toBe('B')
    expect((await snapshot(f.service)).approvals).toEqual([])
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
  it.skipIf(process.platform !== 'darwin')('拒绝组合审批不授予任何新目录也不执行命令', async () => {
    const f = await fixture(), marker = join(f.a, 'must-not-exist')
    f.engine.handler = context => task(context, async call => { await call('execute_command', { command: `printf no > ${shellQuote(marker)}`, directories: [{ path: f.b, access: 'read-write' }] }) })
    await f.send(); const approval = await f.pending(); expect(approval.kind).toBe('command')
    await f.approve(approval, false); await f.idle(1)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: approval.id })).toMatchObject({ choice: 'deny' })
  })
  it.skipIf(process.platform !== 'darwin')('本次同类批准沿用已批准目录，新目录仍确认且不保存永久权限', async () => {
    const f = await fixture(), c = join(f.root, 'next-directory'), output = join(f.b, 'same-kind.txt')
    await mkdir(c)
    f.engine.handler = context => task(context, async call => {
      await call('execute_command', { command: `printf first > ${shellQuote(output)}`, directories: [{ path: f.b, access: 'read-write' }] })
      await call('execute_command', { command: `printf second >> ${shellQuote(output)}`, directories: [{ path: f.b, access: 'read-write' }] })
      await call('execute_command', { command: `printf third >> ${shellQuote(output)}`, directories: [{ path: c, access: 'read-write' }] })
    })
    await f.send(); const first = await f.pending()
    expect(first).toMatchObject({ kind: 'command', sameKindAllowed: true })
    const answer = { id: first.id, approved: true, allowSameKind: true }
    await f.service.handle('approve', answer)
    const next = await f.pending()
    expect(next.id).not.toBe(first.id)
    expect(next.commandDirectories).toMatchObject([{ directory: c }])
    expect(await readFile(output, 'utf8')).toBe('firstsecond')
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: first.id })).toMatchObject({ choice: 'run', allowSameKind: true })
    await f.service.handle('approve', answer)
    await expect(f.approve(first)).rejects.toThrow('不同的回答')
    await f.approve(next, false); await f.idle(1)
    expect(await readFile(output, 'utf8')).toBe('firstsecond')
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    expect((await snapshot(f.service)).commandPermissions).toEqual([])
  })
  it.skipIf(process.platform !== 'darwin')('永久组合批准只保留目录，下一条命令仍需批准；重启只恢复目录而不重放命令', async () => {
    const f = await fixture(), c = join(f.root, 'results'), output = join(c, 'out.txt')
    await mkdir(c)
    const directories = [{ path: f.b, access: 'read-only' }, { path: c, access: 'read-write' }]
    f.engine.handler = context => task(context, async call => {
      await call('execute_command', { command: `/bin/cat ${shellQuote(join(f.b, 'original.txt'))} > ${shellQuote(output)}`, directories })
      await call('execute_command', { command: `printf second >> ${shellQuote(output)}`, directories })
    })
    await f.send(); const first = await f.pending(); await f.approve(first, true, true)
    const second = await f.pending(); expect(second.id).not.toBe(first.id); expect(second.kind).toBe('command'); expect(second).not.toHaveProperty('commandDirectories')
    expect(await readFile(output, 'utf8')).toBe('B')
    await f.approve(first, true, true)
    await expect(f.approve(first, true, false)).rejects.toThrow('不同的回答')
    await f.approve(second, false); await f.idle(1)
    const saved = (await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)!
    expect(saved.directoryGrants).toEqual(expect.arrayContaining(directories)); expect(saved.configVersion).toBe(f.agent.configVersion)
    expect((await snapshot(f.service)).commandPermissions ?? []).toEqual([])
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: first.id })).toMatchObject({ choice: 'employee', directories })
    await f.service.close(); const restarted = await f.open()
    expect((await snapshot(restarted)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(saved.directoryGrants)
    expect(await readFile(output, 'utf8')).toBe('B'); expect((await snapshot(restarted)).approvals).toEqual([])
  })
  it.skipIf(process.platform !== 'darwin')('组合审批的任一目录被替换后整组拒绝，不部分保存权限或运行命令', async () => {
    const f = await fixture(), c = join(f.root, 'second'), marker = join(f.a, 'marker')
    await mkdir(c)
    f.engine.handler = context => task(context, async call => { await call('execute_command', { command: `printf bad > ${shellQuote(marker)}`, directories: [{ path: f.b, access: 'read-only' }, { path: c, access: 'read-write' }] }) })
    await f.send(); const approval = await f.pending()
    await rename(c, `${c}-old`); await mkdir(c)
    await expect(f.approve(approval, true, true)).rejects.toThrow('授权目标已变化')
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.approve(approval, false); await f.idle(1)
  })
  it.skipIf(process.platform !== 'darwin')('完全权限命令访问声明的新目录自动授权且不写永久目录配置', async () => {
    const f = await fixture('full-access'), target = join(f.b, 'full-command.txt')
    f.engine.handler = context => task(context, async call => { expect(await call('execute_command', { command: `printf allowed > ${shellQuote(target)}`, directories: [{ path: f.b, access: 'read-write' }] })).toMatchObject({ approved: true, exitCode: 0 }) })
    await f.send(); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(await readFile(target, 'utf8')).toBe('allowed')
    expect((await snapshot(f.service)).approvals).toEqual([])
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
  it.skipIf(process.platform !== 'darwin')('组合批准保存超出目录上限时整组事务回滚，不留下首个新目录', async () => {
    const f = await fixture(), c = join(f.root, 'next-output'), marker = join(f.a, 'not-run')
    await mkdir(c)
    const grants = [...f.agent.directoryGrants!]
    for (let index = 0; index < 30; index++) { const directory = join(f.root, `existing-${index}`); await mkdir(directory); grants.push({ path: directory, access: 'read-only' }) }
    const saved = await f.service.handle('saveAgent', input(f.agent, { directoryGrants: grants })) as DigitalAgent
    f.engine.handler = context => task(context, async call => { await call('execute_command', { command: `printf bad > ${shellQuote(marker)}`, directories: [{ path: f.b, access: 'read-only' }, { path: c, access: 'read-write' }] }) })
    await f.send(); const approval = await f.pending()
    await expect(f.approve(approval, true, true)).rejects.toThrow()
    const after = (await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)!
    expect(after.directoryGrants).toEqual(saved.directoryGrants); expect(after.directoryRevision).toBe(saved.directoryRevision)
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: approval.id })).toBeNull()
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.approve(approval, false); await f.idle(1)
  })
  it.skipIf(process.platform !== 'darwin')('取消等待的组合审批后不执行，下一运行重新申请且迟到回答无效', async () => {
    const f = await fixture(), marker = join(f.b, 'not-run')
    f.engine.handler = context => task(context, async call => { await call('execute_command', { command: `printf bad > ${shellQuote(marker)}`, directories: [{ path: f.b, access: 'read-write' }] }) })
    await f.send(); const first = await f.pending()
    await f.service.handle('cancelRun', { conversationId: f.conversation.id, workId: (await details(f.service, f.conversation)).runs.find(run => run.id === first.runId)!.workId }); await f.idle(1)
    await expect(f.approve(first, true, true)).rejects.toThrow()
    await f.send(); const second = await f.pending(); expect(second.commandDirectories).toMatchObject([{ directory: f.b, access: 'read-write' }])
    await f.approve(second, false); await f.idle(2)
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
  it.skipIf(process.platform !== 'darwin')('批准后到实际进程启动前再次核对目录，替换后不启动命令', async () => {
    const f = await fixture(), marker = join(f.a, 'not-started')
    f.engine.handler = context => task({ ...context, beforeEffect: async () => { await context.beforeEffect?.(); await rename(f.b, `${f.b}-old`); await mkdir(f.b) } }, async call => {
      await call('execute_command', { command: `printf bad > ${shellQuote(marker)}`, directories: [{ path: f.b, access: 'read-only' }] })
    })
    await f.send(); await f.approve(await f.pending()); await f.idle(1)
    expect(String(f.engine.errors[0])).toContain('授权目标已变化'); await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('预授权目录直接读写；B批准前不建父目录，批准后同一运行读写不重复询问', async () => {
    const f = await fixture(), target = join(f.b, 'new/result.txt'), observed: string[] = []
    f.engine.handler = context => task(context, async call => {
      observed.push((await call('read_file', { path: join(f.a, 'original.txt') })).content)
      await call('write_file', { path: join(f.a, 'new.txt'), content: 'LOCAL' })
      await call('write_file', { path: target, content: 'APPROVED' })
      observed.push((await call('read_file', { path: target })).content)
      await call('edit_file', { path: target, oldText: 'APPROVED', newText: 'DONE' })
    })
    await f.send(); const approval = await f.pending()
    expect(approval).toMatchObject({ kind: 'directory', directory: { directory: f.b, target, access: 'read-write' } })
    expect(observed).toEqual(['A']); expect(await readFile(join(f.a, 'new.txt'), 'utf8')).toBe('LOCAL')
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.approve(approval); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(observed).toEqual(['A', 'APPROVED']); expect(await readFile(target, 'utf8')).toBe('DONE')
    expect((await snapshot(f.service)).agents.find(a => a.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
    f.engine.handler = context => task(context, async call => { await call('read_file', { path: target }) })
    await f.send(); const next = await f.pending(); expect(next.id).not.toBe(approval.id)
    await f.approve(next, false); await f.idle(2)
    expect(await readFile(target, 'utf8')).toBe('DONE')
  })
  it('永久批准不改变执行配置或中止原任务，重启后可用，旧目录草稿不能覆盖新许可', async () => {
    const f = await fixture(), target = join(f.b, 'original.txt'), observed: string[] = []
    f.engine.handler = context => task(context, async call => { observed.push((await call('read_file', { path: target })).content) })
    await f.send(); const approval = await f.pending(); await f.approve(approval, true, true); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(observed).toEqual(['B'])
    const updated = (await snapshot(f.service)).agents.find(a => a.id === f.agent.id)!
    expect(updated.configVersion).toBe(f.agent.configVersion); expect(updated.directoryRevision).toBe(f.agent.directoryRevision! + 1)
    expect(updated.directoryGrants).toContainEqual({ path: f.b, access: 'read-only' })
    await expect(f.service.handle('saveAgent', input(f.agent, { name: '未保存姓名' }))).rejects.toThrow('目录授权已变化')
    await f.approve(approval, true, true)
    await expect(f.approve(approval, true, false)).rejects.toThrow('不同的回答')
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: approval.id })).toMatchObject({ choice: 'employee', directory: f.b })
    await f.service.close(); const reopened = await f.open()
    await f.send(reopened); await f.idle(2, reopened); expect(observed).toEqual(['B', 'B']); expect((await snapshot(reopened)).approvals).toEqual([])
  })
  it('拒绝和取消都不修改原文件；运行级授权不在重启后恢复', async () => {
    const f = await fixture(), target = join(f.b, 'new.txt')
    f.engine.handler = context => task(context, async call => { await call('write_file', { path: target, content: 'NEW' }) })
    await f.send(); const first = await f.pending(); await f.approve(first, false); await f.idle(1)
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: first.id })).toMatchObject({ choice: 'deny' })
    await f.send(); const second = await f.pending(); await f.service.handle('cancelRun', { conversationId: f.conversation.id, workId: (await details(f.service, f.conversation)).runs.find(run => run.id === second.runId)!.workId }); await f.idle(2)
    await expect(f.approve(second)).rejects.toThrow(); await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.send(); const third = await f.pending(); await f.approve(third); await f.idle(3)
    await f.service.close(); const reopened = await f.open()
    f.engine.handler = context => task(context, async call => { await call('read_file', { path: target }) })
    await f.send(reopened); const fourth = await f.pending(reopened); await f.approve(fourth, false, false, reopened); await f.idle(4, reopened)
    expect(await readFile(target, 'utf8')).toBe('NEW')
  })
  it('只读员工可申请读取，但目录许可不能允许写入', async () => {
    const f = await fixture('read-only'), results: string[] = []
    f.engine.handler = context => task(context, async call => {
      results.push((await call('read_file', { path: join(f.b, 'original.txt') })).content)
      await call('write_file', { path: join(f.a, 'new.txt'), content: 'NO' })
    })
    await f.send(); const approval = await f.pending(); expect(approval.directory?.access).toBe('read-only')
    await f.approve(approval, true, true); await f.idle(1)
    expect(results).toEqual(['B']); expect(String(f.engine.errors[0])).toContain('只读')
    await expect(readFile(join(f.a, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await snapshot(f.service)).approvals).toEqual([])
  })
  it('完全访问自动授权额外目录；不会写入新的持久许可', async () => {
    const f = await fixture('full-access'), target = join(f.b, 'new.txt')
    f.engine.handler = context => task(context, async call => { await call('write_file', { path: target, content: 'FULL' }) })
    await f.send(); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(await readFile(target, 'utf8')).toBe('FULL'); expect((await snapshot(f.service)).approvals).toEqual([])
    expect((await snapshot(f.service)).agents.find(a => a.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
  it('审批期间真实目标替换为链接时拒绝批准，不能跟随新位置执行', async () => {
    const f = await fixture(), target = join(f.b, 'new.txt')
    f.engine.handler = context => task(context, async call => { await call('write_file', { path: target, content: 'NO' }) })
    await f.send(); const approval = await f.pending()
    await rename(f.b, `${f.b}-original`); await symlink(f.a, f.b)
    await expect(f.approve(approval, true, true)).rejects.toThrow('目标已变化')
    await f.approve(approval, false); await f.idle(1)
    await expect(readFile(join(f.a, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await snapshot(f.service)).agents.find(a => a.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
  })
  it('员工权限变更使旧审批失效；业务目录的原文件保持', async () => {
    const f = await fixture(), target = join(f.b, 'new.txt')
    f.engine.handler = context => task(context, async call => { await call('write_file', { path: target, content: 'NO' }) })
    await f.send(); const approval = await f.pending()
    await f.service.handle('saveAgent', input(f.agent, { executionPermission: 'read-only' })); await f.idle(1)
    await expect(f.approve(approval)).rejects.toThrow()
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(join(f.a, 'original.txt'), 'utf8')).toBe('A')
  })
  it('搜索先授权实际目录，返回真实行号/hash并跳过链接，不把摘录当完整阅读', async () => {
    const f = await fixture(), found: any[] = []
    await writeFile(join(f.b, 'notes.md'), '标题\n这是需求说明\n附录需求')
    await symlink(f.a, join(f.b, 'linked-coding'))
    f.engine.handler = context => task(context, async call => {
      found.push(await call('search_files', { path: f.b, query: '需求', recursive: true, caseSensitive: false }))
    })
    await f.send(); const approval = await f.pending(); expect(found).toEqual([]); expect(approval.directory?.access).toBe('read-only')
    await f.approve(approval); await f.idle(1); expect(f.engine.errors).toEqual([])
    expect(found[0]).toMatchObject({ scannedFiles: 2, skippedSymlinks: 1, truncated: false, matches: [{ path: join(f.b, 'notes.md'), line: 2, excerpt: '这是需求说明' }, { line: 3 }] })
    expect(found[0].matches[0].contentHash).toMatch(/^[a-f0-9]{64}$/)
  })
  it('跨目录移动在目标批准前保留源，批准后不覆盖其他文件', async () => {
    const f = await fixture(), source = join(f.a, 'original.txt'), target = join(f.b, 'nested/moved.txt'), moved: any[] = []
    f.engine.handler = context => task(context, async call => { moved.push(await call('move_file', { from: source, to: target })) })
    await f.send(); const approval = await f.pending()
    expect(approval.directory?.access).toBe('read-write'); expect(await readFile(source, 'utf8')).toBe('A'); await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await f.approve(approval); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(moved[0]).toMatchObject({ moved: true, sourceRetained: false })
    await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(target, 'utf8')).toBe('A'); expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('B')
  })
  it('删除和移动符号链接只操作目录项，不申请或修改链接目标', async () => {
    const f = await fixture(), link = join(f.a, 'outside-link'), moved = join(f.a, 'moved-link'); await symlink(join(f.b, 'original.txt'), link)
    f.engine.handler = context => task(context, async call => {
      expect(await call('move_file', { from: link, to: moved })).toMatchObject({ moved: true })
      expect(await readlink(moved)).toBe(join(f.b, 'original.txt'))
      expect(await call('delete_file', { path: moved })).toMatchObject({ deleted: true, kind: 'symlink' })
    })
    await f.send(); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect((await snapshot(f.service)).approvals).toEqual([]); expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('B')
  })
  it('拒绝删除不改原件；删除审批期间替换目标会使旧批准失效', async () => {
    const f = await fixture(), target = join(f.b, 'original.txt')
    f.engine.handler = context => task(context, async call => { await call('delete_file', { path: target }) })
    await f.send(); const first = await f.pending(); await f.approve(first, false); await f.idle(1); expect(await readFile(target, 'utf8')).toBe('B')
    await f.send(); const second = await f.pending(); await rename(target, `${target}.original`); await writeFile(target, 'REPLACED')
    await expect(f.approve(second)).rejects.toThrow('文件已变化'); await f.approve(second, false); await f.idle(2)
    expect(await readFile(target, 'utf8')).toBe('REPLACED'); expect(await readFile(`${target}.original`, 'utf8')).toBe('B')
  })
  it('已有目标拒绝覆盖，非空目录不隐式递归删除', async () => {
    const f = await fixture('full-access'), errors: string[] = []
    f.engine.handler = context => task(context, async call => {
      for (const [name, input] of [['move_file', { from: join(f.a, 'original.txt'), to: join(f.b, 'original.txt') }], ['delete_file', { path: f.b }]] as const) {
        try { await call(name, input) } catch (error) { errors.push(String(error)) }
      }
    })
    await f.send(); await f.idle(1)
    expect(errors[0]).toContain('目标已存在'); expect(errors[1]).toContain('ENOTEMPTY')
    expect(await readFile(join(f.a, 'original.txt'), 'utf8')).toBe('A'); expect(await readFile(join(f.b, 'original.txt'), 'utf8')).toBe('B')
  })
  it('外部二进制交付走独立受管原件，聊天清理与外部修改互不删除或覆盖', async () => {
    const f = await fixture('full-access'), original = join(f.b, 'delivery.bin'), bytes = Buffer.from([0, 1, 2, 255, 13, 10]), published: any[] = []
    await writeFile(original, bytes)
    f.engine.handler = context => task(context, async call => {
      const result = await call('publish_artifact', { path: original, name: '文件.bin' }); published.push(result.artifact)
      await call('report_work', { disposition: 'delivered', summary: '已交付文件', evidence: [{ kind: 'artifact', reference: result.artifact.id }] })
    })
    await f.send(); await f.idle(1)
    expect(f.engine.errors).toEqual([]); expect(published).toHaveLength(1)
    const artifact = published[0]; expect(artifact.sourcePath).not.toBe(original); expect(artifact.sourcePath.startsWith(f.dataPath)).toBe(true)
    expect(await readFile(artifact.sourcePath)).toEqual(bytes); expect(await readFile(artifact.path)).toEqual(bytes)
    await writeFile(original, 'EXTERNAL-CHANGED'); expect(await readFile(artifact.sourcePath)).toEqual(bytes)
    await f.service.handle('clearConversationHistory', { id: f.conversation.id, hide: false })
    expect(await readFile(original, 'utf8')).toBe('EXTERNAL-CHANGED')
    await expect(readFile(artifact.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(artifact.path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('外部文件发布准备失败后，重启不会把受管临时副本冒充已交付成果', async () => {
    const f = await fixture('full-access'), original = join(f.b, 'original.txt')
    f.engine.handler = context => task({ ...context, onArtifactPreparing: async () => { throw new Error('准备记录失败') } }, async call => { await call('publish_artifact', { path: original }) })
    await f.send(); await f.idle(1); expect(String(f.engine.errors[0])).toContain('准备记录失败')
    expect((await details(f.service, f.conversation)).artifacts).toEqual([]); expect(await readFile(original, 'utf8')).toBe('B')
    await f.service.close(); const reopened = await f.open()
    expect((await details(reopened, f.conversation)).artifacts).toEqual([]); expect(await readFile(original, 'utf8')).toBe('B')
  })
  it('清空会话移除目录审批详情，保留持久授权与业务原件', async () => {
    const f = await fixture(), target = join(f.b, 'original.txt')
    f.engine.handler = context => task(context, async call => { await call('read_file', { path: target }) })
    await f.send(); const approval = await f.pending(); await f.approve(approval, true, true); await f.idle(1)
    await f.service.handle('clearConversationHistory', { id: f.conversation.id, hide: false })
    expect(await f.service.handle('getDirectoryApprovalReceipt', { id: approval.id })).toBeNull()
    await expect(f.approve(approval, true, true)).rejects.toThrow('失效')
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toContainEqual({ path: f.b, access: 'read-only' })
    expect(await readFile(target, 'utf8')).toBe('B')
  })
  it('核心员工默认完全权限，保存配置不升级普通员工原审批权限', async () => {
    const f = await fixture(), core = (await snapshot(f.service)).agents.find(agent => agent.systemRole === 'core')!
    expect(core.executionPermission).toBe('full-access'); expect(f.agent.executionPermission).toBe('ask')
    const authorized = await f.service.handle('saveAgent', input(core, { executionPermission: 'full-access', directoryGrants: [{ path: f.a, access: 'read-write' }] })) as DigitalAgent
    expect(authorized.executionPermission).toBe('full-access'); expect(authorized.allowCommands).toBe(core.allowCommands)
    const { executionPermission: _permission, ...otherDraft } = input(authorized, { role: '常用工作助手' })
    expect((await f.service.handle('saveAgent', otherDraft) as DigitalAgent).executionPermission).toBe('full-access')
    expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.executionPermission).toBe('ask')
  })
  it.each([['bobo', 'ask'], ['bobo', 'full-access'], ['researcher', 'ask'], ['researcher', 'full-access']] as const)('API员工%s在%s权限下关闭命令，改名及重启均不能自动重新启用', async (agentId, permission) => {
    const f = await fixture(), agent = (await snapshot(f.service)).agents.find(value => value.id === agentId)!
    const disabled = await f.service.handle('saveAgent', input(agent, { executionPermission: permission, allowCommands: false })) as DigitalAgent
    expect(disabled.executionPermission).toBe(permission); expect(disabled.allowCommands).toBe(false)
    const renamed = await f.service.handle('saveAgent', input(disabled, { name: '只修改姓名' })) as DigitalAgent
    expect(renamed.allowCommands).toBe(false); expect(renamed.executionPermission).toBe(permission)
    await f.service.close(); const restarted = await f.open()
    expect((await snapshot(restarted)).agents.find(value => value.id === agentId)).toMatchObject({ name: '只修改姓名', executionPermission: permission, allowCommands: false })
  })
  it('API整体只读不能通过单独启用命令扩大权限', async () => {
    const f = await fixture('read-only')
    const saved = await f.service.handle('saveAgent', input(f.agent, { allowCommands: true })) as DigitalAgent
    expect(saved.executionPermission).toBe('read-only'); expect(saved.allowCommands).toBe(false)
  })
  it.skipIf(process.platform !== 'darwin')('明确申请的临时目录许可交给真实命令进程，其他运行不继承', async () => {
    const f = await fixture(), outputs: string[] = []
    f.engine.handler = context => task(context, async call => {
      await call('request_directory', { directory: f.b, access: 'read-only', reason: '读取报告目录' })
      const command = `/bin/cat '${join(f.b, 'original.txt')}'`
      outputs.push((await call('execute_command', { command })).stdout)
    })
    await f.send(); const directory = await f.pending(); expect(directory.kind).toBe('directory'); await f.approve(directory)
    const command = await f.pending(); expect(command.kind).toBe('command'); await f.approve(command)
    await f.idle(1); expect(outputs).toEqual(['B']); expect(f.engine.errors).toEqual([])
    await f.send(); const again = await f.pending(); expect(again.kind).toBe('directory'); await f.approve(again, false); await f.idle(2)
    expect(outputs).toEqual(['B'])
  })
  it('业务授权不能读取BOAI内部员工/会话数据', async () => {
    const f = await fixture('full-access'), target = join(f.dataPath, 'private.txt'); await writeFile(target, 'PRIVATE')
    f.engine.handler = context => task(context, async call => { await call('read_file', { path: target }) })
    await f.send(); await f.idle(1)
    expect(String(f.engine.errors[0])).toContain('BOAI受管文件'); expect((await snapshot(f.service)).approvals).toEqual([])
  })
})

it.skipIf(process.platform !== 'darwin')('明确业务cwd的命令与目录同次批准，批准前不创建文件且命令实际位于该目录', async () => {
  const f = await fixture(), outputs: string[] = [], target = join(f.b, 'cwd-created.txt')
  f.engine.handler = context => task(context, async call => {
    expect(context.workingDirectory).toBe(f.b)
    const result = await call('execute_command', { command: "pwd; printf 'CWD_WRITE' > cwd-created.txt", directories: [{ path: f.b, access: 'read-write' }] })
    expect(result.exitCode).toBe(0); outputs.push(result.stdout.trim())
    await call('report_work', { disposition: 'delivered', summary: '已完成目录操作', evidence: [{ kind: 'answer', reference: '已完成目录操作' }] })
  })
  await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '在指定位置执行', workingDirectory: f.b, requestId: 'cwd-command-01', mentionIds: [] })
  const pending = await f.pending(); expect(pending).toMatchObject({ kind: 'command', cwd: f.b, commandDirectories: [{ directory: f.b, access: 'read-write' }] })
  await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
  await f.approve(pending); await f.idle(1)
  expect(outputs).toEqual([f.b]); expect(f.engine.errors).toEqual([])
  expect(await readFile(target, 'utf8')).toBe('CWD_WRITE')
  expect((await snapshot(f.service)).agents.find(agent => agent.id === f.agent.id)?.directoryGrants).toEqual(f.agent.directoryGrants)
})

it('所选cwd的相对文件仍需目录批准，临时批准不影响后续运行', async () => {
  const f = await fixture(), target = join(f.b, 'relative.txt')
  f.engine.handler = context => task(context, async call => {
    await call('write_file', { path: 'relative.txt', content: 'RELATIVE' })
    expect((await call('read_file', { path: 'relative.txt' })).content).toBe('RELATIVE')
    await call('report_work', { disposition: 'delivered', summary: '已完成目录操作', evidence: [{ kind: 'answer', reference: '已完成目录操作' }] })
  })
  const send = (requestId: string) => f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '写入指定位置', workingDirectory: f.b, requestId, mentionIds: [] })
  await send('cwd-file-01'); const approval = await f.pending(); expect(approval.directory).toMatchObject({ directory: f.b, access: 'read-write' })
  await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' }); await f.approve(approval); await f.idle(1)
  expect(await readFile(target, 'utf8')).toBe('RELATIVE'); expect(f.engine.errors).toEqual([])
  await writeFile(target, 'EXTERNAL_CHANGE')
  await send('cwd-file-02'); const again = await f.pending(); await f.approve(again, false); await f.idle(2)
  expect(await readFile(target, 'utf8')).toBe('EXTERNAL_CHANGE'); expect(String(f.engine.errors[0])).toContain('拒绝')
})

it('完整权限使用指定cwd相对文件无需批准，删除后仍可只核对原消息回执', async () => {
  const f = await fixture('full-access'), requestId = 'cwd-full-01'
  f.engine.handler = context => task(context, async call => {
    await call('write_file', { path: 'full.txt', content: 'FULL_CWD' })
    await call('report_work', { disposition: 'delivered', summary: '已完成目录操作', evidence: [{ kind: 'answer', reference: '已完成目录操作' }] })
  })
  const input = { conversationId: f.conversation.id, content: '直接操作指定位置', workingDirectory: f.b, requestId, mentionIds: [] }
  const first = await f.service.handle('sendMessage', input); await f.idle(1)
  expect(await readFile(join(f.b, 'full.txt'), 'utf8')).toBe('FULL_CWD'); expect((await snapshot(f.service)).approvals).toEqual([])
  await rm(f.b, { recursive: true }); expect(await f.service.handle('sendMessage', input)).toEqual(first)
  await expect(f.service.handle('sendMessage', { ...input, requestId: 'cwd-missing' })).rejects.toThrow()
  await expect(f.service.handle('sendMessage', { ...input, requestId: 'cwd-protected', workingDirectory: f.dataPath })).rejects.toThrow('受管')
})

it('业务cwd在工具阶段被替换后不能写入替代目录', async () => {
  const f = await fixture('full-access')
  f.engine.handler = context => task(context, async call => {
    await rename(f.b, f.b + '-old'); await mkdir(f.b)
    await call('write_file', { path: 'must-not-exist.txt', content: 'NO' })
  })
  await f.service.handle('sendMessage', { conversationId: f.conversation.id, content: '核对目录替换', workingDirectory: f.b, requestId: 'cwd-replaced', mentionIds: [] }); await f.idle(1)
  expect(String(f.engine.errors[0])).toContain('目标已变化')
  await expect(readFile(join(f.b, 'must-not-exist.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
