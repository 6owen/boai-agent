/*
 * [INPUT]: 真实AppService/ProductStore、隔离目录与仅替换模型层的可控Engine。
 * [OUTPUT]: 默认复制与群成员隔离、定时occurrence/任务/主聊快照、活动默认修改不取消、发送CAS与执行门禁、重启/旧记录、路径失效及真实Mastra文件和命令落点验收。
 * [POS]: WT3 W1/W3服务定向验收；不调用外部模型、个人数据或Electron。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { AgentInput, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot } from '../packages/shared/src/domain'
import type { AutomationDefinition, AutomationOccurrence } from '../packages/shared/src/domain/automations'
import type { EmployeeTaskDetail } from '../packages/shared/src/domain/employee-tasks'
import type { TrackedTask } from '../packages/shared/src/domain/tracked-tasks'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const snapshot = (service: AppService) => service.handle('snapshot', undefined) as Promise<Snapshot>
const detail = (service: AppService, room: Conversation) => service.handle('getConversation', { id: room.id }) as Promise<ConversationDetail>
function agentInput(agent: DigitalAgent, patch: Partial<AgentInput> = {}): AgentInput {
  return { id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds, allowCommands: agent.allowCommands, active: agent.active, executionPermission: agent.executionPermission, ...patch }
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-project-service-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const a = join(root, '项目A'), b = join(root, '项目B'), dataPath = join(root, 'profile')
  await mkdir(a); await mkdir(b)
  const contexts: EngineContext[] = []
  const control = { run: async (_ctx: EngineContext) => {}, task: false }
  const engine: AgentEngine = {
    test: async () => 'isolated',
    decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: control.task ? 'task' : 'chat', ...(control.task ? { work: { key: ctx.triggerMessageId!, scope: '核对当前项目位置', deliverable: '实际文件与命令证据' } } : {}), observedThroughSequence: Math.max(0, ...ctx.messages.map(message => message.sequence)) }),
    run: async ctx => { contexts.push(ctx); await control.run(ctx); await ctx.onDelta('项目操作完成') },
    report: async (_ctx, draft) => ({ action: 'publish', text: draft.text }),
  }
  const open = async () => {
    const service = new AppService({ dataPath, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    cleanup.push(() => service.close()); await service.init(); return service
  }
  const service = await open()
  const connection = await service.handle('saveConnection', { name: 'isolated', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const createAgent = (extra: Partial<AgentInput> = {}) => service.handle('saveAgent', { name: '项目员工', role: '验证项目目录', instructions: '', color: '#6366f1', connectionId: connection.id, modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: true, executionPermission: 'full-access', active: true, ...extra }) as Promise<DigitalAgent>
  const createRoom = (agent: DigitalAgent) => service.handle('createConversation', { kind: 'direct', title: '项目聊天', agentIds: [agent.id] }) as Promise<Conversation>
  const createTask = (agent: DigitalAgent, key: string) => service.handle('createEmployeeTask', { employeeId: agent.id, description: '项目中的独立任务', requestId: key }) as Promise<TrackedTask>
  let seq = 0
  const send = (room: Conversation, target = service) => target.handle('sendMessage', { conversationId: room.id, content: '在此项目继续', mentionIds: [], requestId: `project-${++seq}`, expectedProjectRevision: room.projectSelection?.revision ?? 0 }) as Promise<Message>
  const sendTask = (room: Conversation, target = service) => target.handle('sendEmployeeTaskMessage', { conversationId: room.id, content: '在原任务项目继续', mentionIds: [], requestId: `project-task-${++seq}`, expectedProjectRevision: room.projectSelection?.revision ?? 0 }) as Promise<AutomationOccurrence>
  const taskIdle = (occurrence: AutomationOccurrence, target = service) => vi.waitFor(async () => { const current = await target.handle('getAutomationOccurrence', { id: occurrence.id }) as AutomationOccurrence; expect(current.status, `${current.id}: ${current.reason ?? ''}`).toBe('completed') }, { timeout: 10000 })
  const idle = (room: Conversation, target = service) => vi.waitFor(async () => {
    const runs = (await detail(target, room)).runs
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
  }, { timeout: 10000 })
  return { root, a, b, dataPath, contexts, control, open, service, createAgent, createRoom, createTask, send, sendTask, taskIdle, idle }
}

it('copies defaults when work is created and retains both untouched and started tasks across default changes and restart', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a })
  const main = await f.createRoom(agent), untouched = await f.createTask(agent, 'untouched'), started = await f.createTask(agent, 'started')
  const taskRoom = await f.service.handle('openEmployeeTaskSession', { employeeId: agent.id, id: started.id }) as Conversation
  const firstRun = await f.sendTask(taskRoom); await f.taskIdle(firstRun)
  expect([main.projectSelection, untouched.projectSelection, started.projectSelection, taskRoom.projectSelection]).toEqual(Array(4).fill(expect.objectContaining({ mode: 'directory', directory: f.a, source: 'employee-default' })))
  const updated = await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.b })) as DigitalAgent
  const later = await f.createTask(updated, 'later')
  expect(later.projectSelection?.directory).toBe(f.b)
  expect((await detail(f.service, main)).conversation.projectSelection?.directory).toBe(f.a)
  for (const task of [untouched, started]) {
    expect(((await f.service.handle('getEmployeeTask', { employeeId: agent.id, id: task.id })) as EmployeeTaskDetail).task.projectSelection?.directory).toBe(f.a)
  }
  await f.service.close(); const restarted = await f.open(), count = f.contexts.length
  const restored = await restarted.handle('openEmployeeTaskSession', { employeeId: agent.id, id: started.id }) as Conversation
  expect(restored.id).toBe(taskRoom.id); expect(restored.projectSelection).toEqual(taskRoom.projectSelection)
  expect(f.contexts).toHaveLength(count)
  const continued = await f.sendTask(restored, restarted); await f.taskIdle(continued, restarted)
  expect(f.contexts.at(-1)?.workingDirectory).toBe(f.a)
})

it('keeps managed work independent of directory grants and lets a task override the employee default without changing main chat', async () => {
  const f = await fixture(), agent = await f.createAgent({ directoryGrants: [{ path: f.a, access: 'read-write' }, { path: f.b, access: 'read-write' }] })
  const main = await f.createRoom(agent), oldTask = await f.createTask(agent, 'managed')
  expect(main.projectSelection).toMatchObject({ mode: 'managed' }); expect(oldTask.projectSelection).toMatchObject({ mode: 'managed' })
  const updated = await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.a })) as DigitalAgent
  const task = await f.createTask(updated, 'directory'), room = await f.service.handle('openEmployeeTaskSession', { employeeId: agent.id, id: task.id }) as Conversation
  const overridden = await f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'directory', directory: f.b }) as Conversation
  expect(overridden.projectSelection).toMatchObject({ directory: f.b, source: 'explicit' })
  const managed = await f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: overridden.projectSelection!.revision, mode: 'managed' }) as Conversation
  const managedRun = await f.sendTask(managed); await f.taskIdle(managedRun)
  expect(f.contexts.at(-1)?.workingDirectory).toBeUndefined()
  const read = await f.service.handle('getEmployeeTask', { employeeId: agent.id, id: task.id }) as EmployeeTaskDetail
  expect(read.task.projectSelection).toEqual(managed.projectSelection)
  expect((await detail(f.service, main)).conversation.projectSelection?.mode).toBe('managed')
  expect((await f.service.handle('getEmployeeTask', { employeeId: agent.id, id: oldTask.id }) as EmployeeTaskDetail).task.projectSelection?.mode).toBe('managed')
})

it('snapshots each scheduled occurrence default and keeps the original task location and receipt after restart without replay', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a })
  const plan = await f.service.handle('saveAutomation', { name: '每日项目检查', prompt: '检查项目文件', conversationPolicy: 'new-conversation', employeeIds: [agent.id], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  const originalInput = { id: plan.id, requestId: 'scheduled-original' }
  const first = await f.service.handle('runAutomation', originalInput) as AutomationOccurrence
  await f.taskIdle(first)
  const oldTask = (await f.service.handle('getEmployeeTask', { employeeId: agent.id, occurrenceId: first.id }) as EmployeeTaskDetail).task
  const firstRoom = await f.service.handle('openEmployeeTaskSession', { employeeId: agent.id, id: oldTask.id }) as Conversation
  expect(oldTask).toMatchObject({ sourceKind: 'schedule', projectSelection: { directory: f.a, source: 'employee-default' } })
  expect((await detail(f.service, firstRoom)).messages.filter(message => message.senderType === 'user')).toEqual(expect.arrayContaining([expect.objectContaining({ workingDirectory: f.a, projectSelection: oldTask.projectSelection })]))
  expect(f.contexts.at(-1)?.workingDirectory).toBe(f.a)
  await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.b }))
  await f.service.close()
  const count = f.contexts.length, restarted = await f.open()
  const replayed = await restarted.handle('runAutomation', originalInput) as AutomationOccurrence
  expect(replayed).toMatchObject({ id: first.id, taskId: oldTask.id, conversationId: firstRoom.id, status: 'completed' })
  expect(f.contexts).toHaveLength(count)
  const restored = await restarted.handle('openEmployeeTaskSession', { employeeId: agent.id, id: oldTask.id }) as Conversation
  expect(restored.id).toBe(firstRoom.id); expect(restored.projectSelection).toEqual(firstRoom.projectSelection)
  const continued = await f.sendTask(restored, restarted); await f.taskIdle(continued, restarted)
  expect(continued.taskId).toBe(oldTask.id); expect(f.contexts.at(-1)?.workingDirectory).toBe(f.a)
  const next = await restarted.handle('runAutomation', { id: plan.id, requestId: 'scheduled-next' }) as AutomationOccurrence
  expect(next.status, next.reason).not.toBe('skipped')
  await f.taskIdle(next, restarted)
  expect(next.taskId).not.toBe(oldTask.id); expect(next.conversationId).not.toBe(firstRoom.id)
  expect((await restarted.handle('getEmployeeTask', { employeeId: agent.id, occurrenceId: next.id }) as EmployeeTaskDetail).task.projectSelection).toMatchObject({ directory: f.b, source: 'employee-default' })
  expect(f.contexts.at(-1)?.workingDirectory).toBe(f.b)
  expect(f.contexts).toHaveLength(count + 2)
  const current = (await snapshot(restarted)).agents.find(value => value.id === agent.id)!
  await restarted.handle('saveAgent', agentInput(current, { role: '职责已经改变' }))
  const revoked = await restarted.handle('runAutomation', { id: plan.id, requestId: 'scheduled-after-role-change' }) as AutomationOccurrence
  expect(revoked).toMatchObject({ status: 'skipped', reason: expect.stringContaining('权限已变更') })
  expect(f.contexts).toHaveLength(count + 2)
})

it.each(['main', 'task'] as const)('changing only the employee default preserves an active %s run and its real file tool location', async scope => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a })
  const task = scope === 'task' ? await f.createTask(agent, 'active-default-change') : undefined
  const room = task ? await f.service.handle('openEmployeeTaskSession', { employeeId: agent.id, id: task.id }) as Conversation : await f.createRoom(agent)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve }); cleanup.push(() => release())
  let ready = false, output: unknown
  f.control.task = true
  f.control.run = async ctx => {
    const runtime = await createTaskRuntime(ctx)
    try {
      ready = true; await hold
      ctx.signal.throwIfAborted()
      output = await runtime.tools.write_file.execute!({ path: 'after-default-change.txt', content: '仍在原项目' }, { requestContext: new RequestContext(), observe: noopObserve })
      await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '原项目写入完成', evidence: [{ kind: 'answer', reference: '原项目写入完成' }] })
    } finally { await runtime.dispose() }
  }
  if (task) await f.sendTask(room)
  else await f.service.handle('sendMessage', { conversationId: room.id, content: '保持在途项目', mentionIds: [], requestId: 'active-main-default' })
  await vi.waitFor(() => expect(ready).toBe(true), { timeout: 10000 })
  const running = f.contexts[0]
  const updated = await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.b })) as DigitalAgent
  expect(updated.defaultProjectDirectory).toBe(f.b)
  expect(running.signal.aborted).toBe(false); expect(running.workingDirectory).toBe(f.a)
  expect((await detail(f.service, room)).messages.find(message => message.senderType === 'user')?.workingDirectory).toBe(f.a)
  expect((await detail(f.service, room)).conversation.projectSelection).toEqual(room.projectSelection)
  release(); await f.idle(room)
  expect((await detail(f.service, room)).runs.filter(run => run.phase === 'execution').map(run => run.status)).toEqual(['completed'])
  expect(output).toBeDefined(); expect(output).not.toHaveProperty('error')
  expect(await readFile(join(f.a, 'after-default-change.txt'), 'utf8')).toBe('仍在原项目')
  await expect(readFile(join(f.b, 'after-default-change.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.contexts).toHaveLength(1)
})

it('rejects stale versions and active project switches while supplemental messages keep the original location', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a }), room = await f.createRoom(agent)
  const changed = await f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'directory', directory: f.b }) as Conversation
  await expect(f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'managed' })).rejects.toThrow('项目目录已更新')
  await expect(f.send(room)).rejects.toThrow('项目目录已更新')
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve }); cleanup.push(() => release())
  f.control.run = async () => hold
  const message = await f.send(changed)
  await vi.waitFor(() => expect(f.contexts).toHaveLength(1))
  expect(message.workingDirectory).toBe(f.b)
  await expect(f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: changed.projectSelection!.revision, mode: 'managed' })).rejects.toThrow(/执行|待决|结束/)
  const supplemental = await f.send(changed)
  expect(supplemental.workingDirectory).toBe(f.b); expect(supplemental.projectSelection).toEqual(message.projectSelection)
  release(); await vi.waitFor(() => expect(f.contexts).toHaveLength(2)); await f.idle(changed)
  expect(f.contexts.every(ctx => ctx.workingDirectory === f.b)).toBe(true)
})

it('forwards employee message project revisions to the original admission and rejects a stale selection before execution', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a }), room = await f.createRoom(agent)
  const changed = await f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'directory', directory: f.b }) as Conversation
  await expect(f.service.handle('sendEmployeeMessage', { employeeId: agent.id, content: '旧窗口发送', requestId: 'employee-stale-project', expectedProjectRevision: room.projectSelection!.revision })).rejects.toThrow('项目目录已更新')
  expect((await detail(f.service, room)).messages).toHaveLength(0); expect(f.contexts).toHaveLength(0)
  const accepted = await f.service.handle('sendEmployeeMessage', { employeeId: agent.id, content: '当前项目发送', requestId: 'employee-current-project', expectedProjectRevision: changed.projectSelection!.revision }) as Message
  expect(accepted).toMatchObject({ conversationId: room.id, workingDirectory: f.b, projectSelection: changed.projectSelection })
  await f.idle(room); expect(f.contexts.at(-1)?.workingDirectory).toBe(f.b)
})

it('keeps group members project snapshots independent and reconciles added and removed members', async () => {
  const f = await fixture(), departed = await f.createAgent({ name: '离组员工', defaultProjectDirectory: f.a }), retained = await f.createAgent({ name: '保留员工', defaultProjectDirectory: f.b }), added = await f.createAgent({ name: '新增员工', defaultProjectDirectory: f.b })
  const room = await f.service.handle('createConversation', { kind: 'group', title: '独立项目群', agentIds: [departed.id, retained.id] }) as Conversation
  expect(room.projectSelections).toMatchObject({ [departed.id]: { directory: f.a }, [retained.id]: { directory: f.b } })
  const nextProject = join(f.root, '新项目'); await mkdir(nextProject)
  await f.service.handle('saveAgent', agentInput(retained, { defaultProjectDirectory: nextProject }))
  await rm(f.a, { recursive: true })
  const accepted = await f.service.handle('sendMessage', { conversationId: room.id, content: '请保留员工检查自己的项目', mentionIds: [retained.id], requestId: 'group-independent-project' }) as Message
  expect(accepted.projectSelections?.[retained.id]?.directory).toBe(nextProject)
  await f.idle(room)
  expect(f.contexts.filter(ctx => ctx.agent.id === retained.id).map(ctx => ctx.workingDirectory)).toEqual([nextProject])
  expect(f.contexts.some(ctx => ctx.agent.id === departed.id)).toBe(false)
  const changed = await f.service.handle('createConversation', { id: room.id, expectedConfigVersion: room.configVersion, kind: 'group', title: room.title, agentIds: [retained.id, added.id] }) as Conversation
  expect(Object.keys(changed.projectSelections!).sort()).toEqual([retained.id, added.id].sort())
  expect(changed.projectSelections?.[retained.id]).toEqual(accepted.projectSelections?.[retained.id])
  expect(changed.projectSelections?.[added.id]).toMatchObject({ directory: f.b, source: 'employee-default', revision: 1 })
  expect((await detail(f.service, changed)).conversation.projectSelections).toEqual(changed.projectSelections)
})

it('refuses changed symbolic links, missing directories and protected data roots without falling back or erasing the choice', async () => {
  const f = await fixture(), link = join(f.root, 'project-link'); await symlink(f.a, link)
  const agent = await f.createAgent({ defaultProjectDirectory: link }), room = await f.createRoom(agent)
  expect(room.projectSelection).toMatchObject({ directory: f.a, requestedDirectory: link })
  await unlink(link); await symlink(f.b, link)
  await expect(f.send(room)).rejects.toThrow('实际目标已变化')
  expect(f.contexts).toHaveLength(0)
  expect((await detail(f.service, room)).conversation.projectSelection).toEqual(room.projectSelection)
  await expect(f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'directory', directory: f.dataPath })).rejects.toThrow('受管数据目录')
  const changed = await f.service.handle('updateConversationProject', { conversationId: room.id, expectedRevision: room.projectSelection!.revision, mode: 'directory', directory: f.b }) as Conversation
  await rm(f.b, { recursive: true })
  await expect(f.send(changed)).rejects.toThrow()
  expect((await detail(f.service, room)).conversation.projectSelection).toEqual(changed.projectSelection)
  expect(f.contexts).toHaveLength(0)
})

it('restores a legacy message cwd from its own history instead of applying todays employee default', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a }), room = await f.createRoom(agent)
  const message = await f.send(room); await f.idle(room)
  await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.b }))
  await f.service.close()
  const store = new ProductStore(join(f.dataPath, 'boai.sqlite')); await store.init()
  try {
    const saved = (await store.get<Conversation>('conversations', room.id))!, original = (await store.get<Message>('messages', message.id))!
    delete saved.projectSelection; delete original.projectSelection
    await store.write([{ collection: 'conversations', id: saved.id, value: saved }, { collection: 'messages', id: original.id, value: original }])
  } finally { await store.close() }
  const restarted = await f.open(), old = (await detail(restarted, room)).conversation
  const accepted = await f.send(old, restarted); await vi.waitFor(() => expect(f.contexts).toHaveLength(2)); await f.idle(old, restarted)
  expect(accepted.workingDirectory).toBe(f.a); expect(accepted.projectSelection).toMatchObject({ source: 'legacy', revision: 0 })
  expect(f.contexts.at(-1)?.workingDirectory).toBe(f.a)
})

it('uses the saved project for real API relative file writes, command cwd and publication while retaining the original', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a }), room = await f.createRoom(agent)
  f.control.task = true
  const outputs: unknown[] = []
  f.control.run = async ctx => {
    const runtime = await createTaskRuntime(ctx)
    const call = async (name: keyof typeof runtime.tools, input: unknown) => {
      const result = await runtime.tools[name]!.execute!(input as never, { requestContext: new RequestContext(), observe: noopObserve })
      if (result && typeof result === 'object' && 'error' in result) throw new Error(String(result.error))
      outputs.push(result); return result
    }
    try {
      await call('write_file', { path: 'result.md', content: '项目原件' })
      await call('execute_command', { command: "pwd; printf 'command output' > command.txt" })
      await call('publish_artifact', { path: 'result.md', name: 'result.md' })
      await ctx.onWorkOutcome!({ disposition: 'delivered', summary: '项目操作完成', evidence: [{ kind: 'answer', reference: '项目操作完成' }] })
    } finally { await runtime.dispose() }
  }
  const accepted = await f.send(room); await f.idle(room)
  expect((await detail(f.service, room)).runs.filter(run => run.phase === 'execution').map(run => run.status)).toEqual(['completed'])
  expect(accepted.workingDirectory).toBe(f.a)
  expect(await readFile(join(f.a, 'result.md'), 'utf8')).toBe('项目原件')
  expect(await readFile(join(f.a, 'command.txt'), 'utf8')).toBe('command output')
  expect(outputs[1]).toMatchObject({ approved: true, stdout: `${f.a}\n` })
  const artifacts = (await detail(f.service, room)).artifacts
  expect(artifacts).toHaveLength(1)
  expect(artifacts[0].path.startsWith(f.dataPath)).toBe(true)
  expect(await readFile(artifacts[0].path, 'utf8')).toBe('项目原件')
  await writeFile(join(f.a, 'result.md'), '用户继续修改')
  expect(await readFile(artifacts[0].path, 'utf8')).toBe('项目原件')
  expect((await snapshot(f.service)).agents.find(value => value.id === agent.id)?.directoryGrants).toEqual(agent.directoryGrants)
}, 20000)

it('an extra directory still requires authorization and refusal never redirects the read', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a, executionPermission: 'ask', directoryGrants: [] }), room = await f.createRoom(agent)
  await writeFile(join(f.b, 'private.txt'), '需要批准的项目资料')
  f.control.task = true
  let received: unknown
  f.control.run = async ctx => {
    const runtime = await createTaskRuntime(ctx)
    try { received = await runtime.tools.read_file.execute!({ path: join(f.b, 'private.txt') }, { requestContext: new RequestContext(), observe: noopObserve }) }
    finally { await runtime.dispose() }
  }
  await f.send(room)
  await vi.waitFor(async () => expect((await snapshot(f.service)).approvals).toHaveLength(1), { timeout: 10000 })
  expect(received).toBeUndefined()
  const before = await snapshot(f.service), approval = before.approvals[0]
  expect(approval.directory).toMatchObject({ directory: f.b, access: 'read-only' })
  expect(before.agents.find(value => value.id === agent.id)?.directoryGrants).toEqual([])
  await f.service.handle('approve', { id: approval.id, approved: false })
  await f.idle(room)
  expect(received).toBeUndefined()
  expect((await detail(f.service, room)).conversation.projectSelection?.directory).toBe(f.a)
  expect((await snapshot(f.service)).agents.find(value => value.id === agent.id)?.directoryGrants).toEqual([])
  expect(await readFile(join(f.b, 'private.txt'), 'utf8')).toBe('需要批准的项目资料')
})


it('ordinary owner messages follow employee configuration while accepted tasks keep their original project', async () => {
  const f = await fixture(), agent = await f.createAgent(), room = await f.createRoom(agent)
  const first = await f.service.handle('sendMessage', { conversationId: room.id, content: '工作区', mentionIds: [], requestId: 'default-workspace' }) as Message
  await f.idle(room); expect(first.workingDirectory).toBeUndefined()
  const updated = await f.service.handle('saveAgent', agentInput(agent, { defaultProjectDirectory: f.a })) as DigitalAgent
  const second = await f.service.handle('sendMessage', { conversationId: room.id, content: '项目目录', mentionIds: [], requestId: 'default-project' }) as Message
  await vi.waitFor(() => expect(f.contexts).toHaveLength(2)); await f.idle(room)
  expect(second.workingDirectory).toBe(f.a); expect(f.contexts.at(-1)?.workingDirectory).toBe(f.a)
  await f.service.handle('saveAgent', agentInput(updated, { defaultProjectDirectory: '' }))
  const third = await f.service.handle('sendMessage', { conversationId: room.id, content: '回到工作区', mentionIds: [], requestId: 'default-cleared' }) as Message
  await vi.waitFor(() => expect(f.contexts).toHaveLength(3)); await f.idle(room)
  expect(third.workingDirectory).toBeUndefined(); expect(f.contexts.at(-1)?.workingDirectory).toBeUndefined()
  expect((await detail(f.service, room)).messages.find(message => message.id === second.id)?.workingDirectory).toBe(f.a)
})

it('configured project reads need no extra grant, including legacy employees without a grants list', async () => {
  const f = await fixture(), agent = await f.createAgent({ defaultProjectDirectory: f.a, executionPermission: 'ask' }), room = await f.createRoom(agent)
  await writeFile(join(f.a, 'project.txt'), '项目资料')
  let received: unknown
  f.control.run = async ctx => {
    const runtime = await createTaskRuntime(ctx)
    try { received = await runtime.tools.read_file.execute!({ path: 'project.txt' }, { requestContext: new RequestContext(), observe: noopObserve }) }
    finally { await runtime.dispose() }
  }
  await f.send(room); await f.idle(room)
  expect(received).toBeDefined(); expect(received).not.toHaveProperty('error')
  expect(JSON.stringify(received)).toContain('项目资料')
  expect((await snapshot(f.service)).approvals).toHaveLength(0)
  expect((await snapshot(f.service)).agents.find(value => value.id === agent.id)?.directoryGrants).toBeUndefined()
})

it('bobo ignores an old or newly supplied project default and starts in its default workspace', async () => {
  const f = await fixture(), core = (await snapshot(f.service)).agents.find(agent => agent.systemRole === 'core')!
  const saved = await f.service.handle('saveAgent', agentInput(core, { defaultProjectDirectory: f.a })) as DigitalAgent
  expect(saved.defaultProjectDirectory).toBeUndefined()
  const room = await f.service.handle('startCoreConversation', { requestId: 'core-default-directory', content: '默认目录工作' }) as Conversation
  expect(room.projectSelection?.mode).toBe('managed')
  await f.idle(room)
  expect(f.contexts.at(-1)?.workingDirectory).toBeUndefined()
})
