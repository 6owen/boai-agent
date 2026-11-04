/*
 * [OUTPUT]: 列清空覆盖跨分页/员工状态隔离/稳定回执/在途保护及定时任务重启不回填。
 * [OUTPUT]: bobo无需先建核心聊天即可创建、执行及持续修改独立任务；共用连接、状态、验收和重启回执，不产生主聊天投影。
 * [OUTPUT]: 任意平级状态创建零执行，会话创建沿原任务补全标题/要求、稳定续做和重启，不进入主聊天。
 * [OUTPUT]: 持续任务会话、轻量状态、批量FIFO与重试快照；完成后继续问答/返工/再次执行，人工任务不回灌主聊天。
 * [OUTPUT]: 五状态独立任务会话、原计划授权/工具schema与稳定消息回执按最新用户合同验证。
 * [OUTPUT]: 持久任务多次执行/完成重开/重启、消息转换不重跑与清空后来源失效保持任务。
 * [OUTPUT]: 覆盖主聊天连续工作、聊天忙碌排队与旧独立任务公开消息关联。
 * [INPUT]: 隔离AppService/SQLite与可控员工执行，不调用真实模型或个人数据。
 * [OUTPUT]: 定时生成任务进入同一看板/任务会话，覆盖旧记录晋升、内部进度隔离、完成后续做与排队要求快照。
 * [POS]: 独立员工任务产品合同。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import { EMPLOYEE_TASK_STATUSES, type TrackedTask } from '../packages/shared/src/domain/tracked-tasks'
import type { AutomationDefinition, AutomationInput, AutomationOccurrence, Connection, ConversationDetail, Snapshot } from '../packages/shared/src/domain'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
async function employeeTaskStatus(ctx: EngineContext, status: 'in_progress' | 'in_review' | 'done' | 'closed') {
  const id = ctx.conversation.employeeTaskId!
  const current = await ctx.application!.call({ operation: 'tasks.get', input: { id } })
  expect(current.status).toBe('succeeded')
  const task = current.data as TrackedTask
  const result = await ctx.application!.call({ operation: 'tasks.update', requestId: `${ctx.runId}-${status}`, input: { id, expectedRevision: task.revision, status } })
  expect(result.status).toBe('succeeded')
}
async function setup(run: AgentEngine['run'], decide?: AgentEngine['decide']) {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-queue-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const options: ConstructorParameters<typeof AppService>[0] = { dataPath: root, engine: { test: async () => '', decide: decide ?? (async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation?.observedThroughSequence ?? 1 })), run }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit() {} }
  const service = new AppService(options)
  cleanup.push(() => service.close()); await service.init()
  const connection = await service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await service.handle('snapshot', undefined) as Snapshot).agents.find(a => a.id === 'researcher')!
  await service.handle('saveAgent', { ...agent, connectionId: connection.id })
  await service.handle('createConversation', { kind: 'direct', title: '日常聊天', agentIds: ['researcher'], mode: 'natural' })
  const create = (name: string, employeeId = 'researcher') => service.handle('saveAutomation', { name, prompt: name, conversationPolicy: 'new-conversation', employeeIds: [employeeId], frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false }) as Promise<AutomationDefinition>
  const start = (d: AutomationDefinition, key = d.id) => service.handle('runAutomation', { id: d.id, requestId: key }) as Promise<AutomationOccurrence>
  const read = (id: string) => service.handle('getAutomationOccurrence', { id }) as Promise<AutomationOccurrence>
  return { service, create, start, read, restart: async () => { const next = new AppService(options); cleanup.push(() => next.close()); await next.init(); return next } }
}
it('runs bobo assignments before its first core chat and continues revisions in the same task conversation', async () => {
  const contexts: EngineContext[] = [], f = await setup(async ctx => {
    contexts.push(ctx)
    expect(ctx.agent.id).toBe('bobo')
    await employeeTaskStatus(ctx, 'in_progress')
    await ctx.onDelta('任务交付')
    await employeeTaskStatus(ctx, 'in_review')
  })
  const initial = await f.service.handle('snapshot', undefined) as Snapshot
  expect(initial.agents.find(agent => agent.id === 'bobo')?.connectionId).toBeFalsy()
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'bobo', title: '核心员工的任务', description: '输出结果供我验收', requestId: 'bobo-create' }) as TrackedTask
  expect(task).toMatchObject({ agentId: 'bobo', kind: 'assignment', status: 'pending' })
  expect(contexts).toHaveLength(0)
  const input = { employeeId: 'bobo', id: task.id, expectedRevision: task.revision, requestId: 'bobo-run' }
  const first = await f.service.handle('runEmployeeTask', input) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const detail = await f.service.handle('getEmployeeTask', { employeeId: 'bobo', id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(detail.task).toMatchObject({ status: 'in_review', sessionConversationId: first.conversationId })
  const accepted = await f.service.handle('updateEmployeeTask', { employeeId: 'bobo', id: task.id, expectedRevision: detail.task.revision, status: 'done' }) as TrackedTask
  expect(accepted.status).toBe('done')
  const next = await f.service.handle('sendEmployeeTaskMessage', { conversationId: first.conversationId, content: '继续修改结果', mentionIds: [], requestId: 'bobo-revise' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(next.id)).status).toBe('completed'), { timeout: 10000 })
  expect(next.conversationId).toBe(first.conversationId)
  expect(contexts).toHaveLength(2)
  expect((await f.service.handle('getEmployeeTask', { employeeId: 'bobo', id: task.id }) as typeof detail).task.status).toBe('in_review')
  const state = await f.service.handle('snapshot', undefined) as Snapshot
  expect(state.agents.find(agent => agent.id === 'bobo')?.connectionId).toBe(initial.connections[0].id)
  expect(state.conversations.filter(room => room.agentIds.includes('bobo') && (room.purpose === 'core' || room.mainPrivate))).toEqual([])
  await f.service.close(); const restarted = await f.restart()
  expect(await restarted.handle('runEmployeeTask', input)).toMatchObject({ id: first.id, conversationId: first.conversationId })
  expect(contexts).toHaveLength(2)
})
it('shows each scheduled execution as an employee assignment and continues accepted tasks in their own session', async () => {
  const contexts: EngineContext[] = [], f = await setup(async ctx => {
    contexts.push(ctx)
    expect(ctx.bootstrap?.dynamicInstructions).toContain('[Current employee task]')
    await employeeTaskStatus(ctx, 'in_progress')
    await ctx.onDelta('scheduled assignment output')
    await employeeTaskStatus(ctx, 'in_review')
  })
  const plan = await f.create('visible scheduled assignment'), first = await f.start(plan)
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const detail = () => f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: first.taskId }) as Promise<import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail>
  const task = (await detail()).task
  expect(task).toMatchObject({ kind: 'assignment', sourceKind: 'schedule', status: 'in_review', sessionConversationId: first.conversationId })
  const page = await f.service.handle('listEmployeeTasks', { employeeId: 'researcher', status: 'in_review' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage
  expect(page.items.map(t => t.id)).toContain(first.taskId)
  expect((await f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain').Conversation).id).toBe(first.conversationId)
  await f.service.handle('updateEmployeeTask', { employeeId: 'researcher', id: task.id, expectedRevision: task.revision, status: 'done' })
  const followup = await f.service.handle('sendEmployeeTaskMessage', { conversationId: first.conversationId, content: 'revise the accepted result', mentionIds: [], requestId: 'scheduled-task-revision' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(followup.id)).status).toBe('completed'), { timeout: 10000 })
  expect(followup).toMatchObject({ taskId: task.id, conversationId: first.conversationId })
  expect((await detail()).task.status).toBe('in_review')
  const second = await f.start(plan, 'separate-trigger')
  await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(second.taskId).not.toBe(first.taskId); expect(second.conversationId).not.toBe(first.conversationId)
  // An old plan pointing at a prior execution chat still produces a new task session.
  const old = await f.service.handle('saveAutomation', { owner: { kind: 'employee', employeeId: 'researcher' }, conversationPolicy: 'existing-conversation', conversationId: first.conversationId, name: 'old chat target', prompt: 'separate scheduled goal', frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false }) as AutomationDefinition
  const isolated = await f.start(old)
  await vi.waitFor(async () => expect((await f.read(isolated.id)).status).toBe('completed'), { timeout: 10000 })
  expect(isolated.taskId).not.toBe(first.taskId); expect(isolated.conversationId).not.toBe(first.conversationId)
  expect((await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: isolated.taskId }) as Awaited<ReturnType<typeof detail>>).task.sessionConversationId).toBe(isolated.conversationId)
  const board = await f.service.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }) as typeof page
  expect(board.items.map(t => t.id)).toEqual(expect.arrayContaining([first.taskId, second.taskId, isolated.taskId]))
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  expect((await f.service.handle('getConversation', { id: main.id }) as ConversationDetail).messages.some(m => m.content === 'scheduled assignment output')).toBe(false)
  expect(contexts).toHaveLength(4)
})
it('adopts only backed legacy schedule tasks without changing identity, acceptance or internal progress', async () => {
  const invoked = vi.fn(async (ctx: EngineContext) => { await ctx.onDelta('legacy scheduled output'); await employeeTaskStatus(ctx, 'in_review') })
  const f = await setup(invoked), occurrence = await f.start(await f.create('legacy scheduled task'))
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('completed'), { timeout: 10000 })
  const task = (await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: occurrence.taskId }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  const dataPath = (await f.service.handle('snapshot', undefined) as Snapshot).dataPath
  await f.service.close()
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  const legacy = { ...task, kind: undefined, status: 'done' as const, statusSource: 'manual' as const }
  const room = (await store.get<import('../packages/shared/src/domain').Conversation>('conversations', occurrence.conversationId))!
  await store.write([
    { collection: 'agentTasks', id: task.id, value: legacy },
    { collection: 'agentTasks', id: 'scheduled-progress', value: { ...legacy, id: 'scheduled-progress', kind: 'progress' } },
    { collection: 'agentTasks', id: 'unbacked-schedule', value: { ...legacy, id: 'unbacked-schedule', latestOccurrenceId: 'missing' } },
    { collection: 'agentTasks', id: 'session-only', value: { ...legacy, id: 'session-only', latestOccurrenceId: 'deleted-history', sessionConversationId: 'legacy-task-session' } },
    { collection: 'conversations', id: 'legacy-task-session', value: { ...room, id: 'legacy-task-session', employeeTaskId: 'session-only' } },
  ]); await store.close()
  const restarted = await f.restart()
  const adopted = (await restarted.handle('getEmployeeTask', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  expect(adopted).toMatchObject({ id: task.id, kind: 'assignment', sourceKind: 'schedule', sessionConversationId: occurrence.conversationId, status: 'done', statusSource: 'manual' })
  const board = await restarted.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage
  expect(board.items.map(t => t.id).sort()).toEqual([task.id, 'session-only'].sort()); expect(invoked).toHaveBeenCalledTimes(1)
  await restarted.close(); const again = await f.restart()
  expect((await again.handle('getEmployeeTask', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.revision).toBe(adopted.revision)
  expect(invoked).toHaveBeenCalledTimes(1)
})
it('keeps the accepted schedule instruction frozen while a queued task brief is edited', async () => {
  const hold = gate(), contexts: EngineContext[] = []
  const f = await setup(async ctx => {
    contexts.push(ctx)
    if (contexts.length === 1) await hold.promise
    else expect(ctx.bootstrap?.dynamicInstructions).toContain('frozen scheduled instruction')
    await ctx.onDelta('delivered'); await employeeTaskStatus(ctx, 'in_review')
  }); cleanup.push(hold.release)
  const first = await f.start(await f.create('busy employee'))
  await vi.waitFor(() => expect(contexts).toHaveLength(1))
  const queued = await f.start(await f.create('frozen scheduled instruction'))
  expect(queued.status).toBe('queued')
  const task = (await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: queued.taskId }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, description: 'new saved brief for a later execution' })
  hold.release()
  await vi.waitFor(async () => expect((await f.read(queued.id)).status).toBe('completed'), { timeout: 10000 })
  expect((await f.read(first.id)).status).toBe('completed')
  expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.description).toBe('new saved brief for a later execution')
})
it('creates in every peer status and allows arbitrary manual transitions without execution', async () => {
  const run = vi.fn(async () => {}), f = await setup(run)
  for (const [index, status] of EMPLOYEE_TASK_STATUSES.entries()) {
    const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: `平级任务${index}`, status, requestId: `peer-${index}` }) as TrackedTask
    expect(task).toMatchObject({ status, statusSource: 'manual' })
    for (const next of [...EMPLOYEE_TASK_STATUSES].reverse()) {
      const current = (await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
      expect(await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.revision, status: next })).toMatchObject({ status: next })
    }
  }
  expect(run).not.toHaveBeenCalled()
})
it('conversation intake enriches the same task then continues normal work with stable creation/run receipts', async () => {
  const contexts: EngineContext[] = [], hold = gate()
  const f = await setup(async ctx => {
    contexts.push(ctx)
    if (contexts.length === 1) {
      expect(ctx.bootstrap?.dynamicInstructions).toContain('explicitly created this task through conversation')
      expect(ctx.bootstrap?.dynamicInstructions).toContain('同一个任务里查询南京天气')
      const current = await ctx.application!.call({ operation: 'tasks.get', input: { id: ctx.conversation.employeeTaskId } })
      const task = current.data as TrackedTask
      const updated = await ctx.application!.call({ operation: 'tasks.update', requestId: 'enrich-current-brief', input: { id: task.id, expectedRevision: task.revision, title: '查询南京天气', description: '目标：查询南京天气。验收：提供查询结果和来源。' } })
      expect(updated).toMatchObject({ status: 'succeeded', data: { id: task.id, kind: 'assignment', briefPending: false } })
      await hold.promise
      await ctx.onDelta('天气查询结果及来源')
      await employeeTaskStatus(ctx, 'in_review')
    } else { expect(ctx.bootstrap?.dynamicInstructions).not.toContain('explicitly created this task through conversation'); await ctx.onDelta('继续在同一个任务里回答') }
  }); cleanup.push(hold.release)
  const input = { employeeId: 'researcher', description: '同一个任务里查询南京天气，输出结果和来源', status: 'done' as const, conversation: true, requestId: 'create-conversation' }
  const task = await f.service.handle('createEmployeeTask', input) as TrackedTask
  expect(task.briefPending).toBe(true); expect(contexts).toHaveLength(0)
  const runInput = { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, requestId: input.requestId }
  const first = await f.service.handle('runEmployeeTask', runInput) as AutomationOccurrence
  await vi.waitFor(() => expect(contexts).toHaveLength(1))
  await vi.waitFor(async () => expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.briefPending).toBe(false))
  const enriched = await f.service.handle('createEmployeeTask', input) as TrackedTask
  expect(enriched).toMatchObject({ id: task.id, title: '查询南京天气', description: '目标：查询南京天气。验收：提供查询结果和来源。', status: 'in_progress', briefPending: false })
  expect((await f.service.handle('getConversation', { id: first.conversationId }) as ConversationDetail).conversation.title).toBe('查询南京天气')
  expect(await f.service.handle('runEmployeeTask', runInput)).toMatchObject({ id: first.id })
  hold.release()
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'))
  const next = await f.service.handle('sendEmployeeTaskMessage', { conversationId: first.conversationId, content: '解释一下来源', mentionIds: [], requestId: 'intake-followup' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(next.id)).status).toBe('completed'))
  expect(next.conversationId).toBe(first.conversationId); expect(contexts).toHaveLength(2)
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(room => room.mainPrivate && room.agentIds[0] === task.agentId)!
  expect((await f.service.handle('getConversation', { id: main.id }) as ConversationDetail).messages).toEqual([])
  await f.service.close(); const restarted = await f.restart()
  expect(await restarted.handle('createEmployeeTask', input)).toMatchObject({ id: task.id, title: '查询南京天气', briefPending: false })
  expect(await restarted.handle('runEmployeeTask', runInput)).toMatchObject({ id: first.id })
  expect(contexts).toHaveLength(2)
})
it('dispatches selected tasks FIFO without review gates, freezes briefs and reuses completed conversations', async () => {
  const hold = gate(), inputs: { id: string; room: string; context: string }[] = []
  const f = await setup(async ctx => {
    inputs.push({ id: ctx.conversation.employeeTaskId!, room: ctx.conversation.id, context: ctx.bootstrap?.dynamicInstructions ?? '' })
    await employeeTaskStatus(ctx, 'in_progress')
    if (inputs.length === 1) await hold.promise
    await ctx.onDelta('已交付：' + ctx.conversation.employeeTaskId)
    await employeeTaskStatus(ctx, 'in_review')
  }); cleanup.push(hold.release)
  const tasks: TrackedTask[] = []
  for (const [index, title] of ['修复font-family', '重新build', '修改font-size后build'].entries()) {
    const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', title, description: `${title}；验收版本1`, requestId: `batch-create-${index}` }) as TrackedTask
    tasks.push(await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, status: index === 0 ? 'done' : index === 1 ? 'closed' : 'pending' }) as TrackedTask)
  }
  const input = { employeeId: 'researcher', requestId: 'dispatch-three', tasks: tasks.map(task => ({ id: task.id, expectedRevision: task.revision })) }
  type Batch = import('../packages/shared/src/domain/employee-tasks').EmployeeTaskMethods['runEmployeeTasks']['output']
  const batch = await f.service.handle('runEmployeeTasks', input) as Batch
  expect(batch.items.every(item => 'execution' in item)).toBe(true)
  const executions = batch.items.map(item => { if (!('execution' in item)) throw new Error(item.error); return item.execution })
  await vi.waitFor(() => expect(inputs).toHaveLength(1))
  expect((await f.read(executions[1].id)).status).toBe('queued')
  expect(await f.service.handle('runEmployeeTasks', input)).toEqual(batch)
  await expect(f.service.handle('runEmployeeTasks', { ...input, tasks: [...input.tasks].reverse() })).rejects.toThrow('同一批次')
  const second = (await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: tasks[1].id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  await f.service.handle('updateEmployeeTask', { employeeId: second.agentId, id: second.id, expectedRevision: second.revision, description: '重新build；验收版本2' })
  expect(inputs).toHaveLength(1)
  hold.release()
  await vi.waitFor(async () => expect((await f.read(executions[2].id)).status).toBe('completed'), { timeout: 10000 })
  expect(inputs.map(input => input.id)).toEqual(tasks.map(task => task.id))
  expect(inputs[1].context).toContain('验收版本1'); expect(inputs[1].context).not.toContain('验收版本2')
  for (const task of tasks) expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.status).toBe('in_review')
  const current = (await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: tasks[1].id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  const accepted = await f.service.handle('updateEmployeeTask', { employeeId: current.agentId, id: current.id, expectedRevision: current.revision, status: 'done' }) as TrackedTask
  const again = await f.service.handle('runEmployeeTask', { employeeId: accepted.agentId, id: accepted.id, expectedRevision: accepted.revision, requestId: 'next-day-same-task' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(again.id)).status).toBe('completed'))
  expect(inputs[3].context).toContain('验收版本2'); expect(inputs[3].room).toBe(inputs[1].room)
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(room => room.mainPrivate && room.agentIds[0] === 'researcher')!
  expect((await f.service.handle('getConversation', { id: main.id }) as ConversationDetail).messages).toEqual([])
  await f.service.close(); const restarted = await f.restart()
  expect(await restarted.handle('runEmployeeTasks', input)).toEqual(batch)
  expect(inputs).toHaveLength(4)
})

it('keeps batch admission failures separate and never replays successful items', async () => {
  const calls: string[] = [], f = await setup(async ctx => { calls.push(ctx.conversation.employeeTaskId!); await ctx.onDelta('结果') })
  const first = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: 'A', requestId: 'partial-a' }) as TrackedTask
  const foreign = await f.service.handle('createEmployeeTask', { employeeId: 'writer', description: 'foreign', requestId: 'partial-foreign' }) as TrackedTask
  const last = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: 'B', requestId: 'partial-b' }) as TrackedTask
  const selected = [first, foreign, last].map(task => ({ id: task.id, expectedRevision: task.revision }))
  await expect(f.service.handle('runEmployeeTasks', { employeeId: 'researcher', requestId: 'duplicate-batch', tasks: [selected[0], selected[0]] })).rejects.toThrow('重复')
  expect(calls).toEqual([])
  const input = { employeeId: 'researcher', requestId: 'partial-batch', tasks: selected }
  const result = await f.service.handle('runEmployeeTasks', input) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskMethods['runEmployeeTasks']['output']
  expect(result.items[1]).toMatchObject({ id: foreign.id, error: expect.stringContaining('不属于') })
  await vi.waitFor(() => expect(calls).toEqual([first.id, last.id]))
  expect(await f.service.handle('runEmployeeTasks', input)).toEqual(result)
  expect(calls).toHaveLength(2)
})

it('keeps three user-defined goals separate and never turns internal plans into Kanban assignments', async () => {
  let calls = 0
  const f = await setup(async ctx => { calls++; await employeeTaskStatus(ctx, 'in_progress'); await ctx.onDelta('已完成font-family修复'); await employeeTaskStatus(ctx, 'in_review') })
  const goals = [
    { title: '修复字体的font-family', description: '目标：修复font-family\n验收：指定字体在页面实际生效' },
    { title: '修改好了重新build', description: '目标：修改后重新build\n验收：构建成功并保留结果' },
    { title: '再修改font-size然后build', description: '目标：调整font-size然后build\n验收：字号符合要求且构建成功' },
  ]
  const tasks: TrackedTask[] = []
  for (const [index, goal] of goals.entries()) tasks.push(await f.service.handle('createEmployeeTask', { employeeId: 'researcher', requestId: `human-goal-${index}`, ...goal }) as TrackedTask)
  expect(new Set(tasks.map(task => task.id)).size).toBe(3)
  expect(tasks.map(task => [task.title, task.description, task.kind])).toEqual(goals.map(goal => [goal.title, goal.description, 'assignment']))
  const created = await f.service.handle('executeApplicationOperation', { operation: 'tasks.create', requestId: 'internal-plan', input: { agentId: 'researcher', title: '内部：找文件、编辑、验证', steps: [{ title: '定位CSS', done: false }] } }) as import('../packages/shared/src/domain/application-protocol').ApplicationResult
  expect(created.status).toBe('succeeded')
  const internal = created.data as TrackedTask
  expect(internal.kind).toBe('progress')
  const board = async () => (await f.service.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage).items
  expect((await board()).map(task => task.id).sort()).toEqual(tasks.map(task => task.id).sort())
  await expect(f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: internal.id })).rejects.toThrow('内部进度')
  await expect(f.service.handle('runEmployeeTask', { employeeId: 'researcher', id: internal.id, expectedRevision: internal.revision, requestId: 'cannot-run-progress' })).rejects.toThrow('内部进度')
  expect(calls).toBe(0)
  const execution = await f.service.handle('runEmployeeTask', { employeeId: 'researcher', id: tasks[0].id, expectedRevision: tasks[0].revision, requestId: 'human-first-start' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(execution.id)).status).toBe('completed'))
  expect(calls).toBe(1)
  expect((await board()).find(task => task.id === tasks[0].id)?.status).toBe('in_review')
  expect((await board()).filter(task => task.id !== tasks[0].id).every(task => task.status === 'pending')).toBe(true)
  await f.service.close()
  const restarted = await f.restart()
  expect((await restarted.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage).items).toHaveLength(3)
  expect(await restarted.handle('executeApplicationOperation', { operation: 'tasks.get', input: { id: internal.id } })).toMatchObject({ status: 'succeeded', data: { kind: 'progress' } })
})

it('keeps one conversation through delivery, user acceptance, questions and new revisions', async () => {
  const outcomes: string[] = []
  let calls = 0, other: TrackedTask
  const f = await setup(async ctx => {
    const id = ctx.conversation.employeeTaskId!
    expect(ctx.bootstrap?.dynamicInstructions).toContain(id)
    expect(ctx.bootstrap?.dynamicInstructions).toContain('A run ending does not prove delivery')
    if (++calls === 1) {
      const catalog = await ctx.application!.catalog({})
      expect(catalog.operations.length).toBeGreaterThan(0)
      expect(catalog.operations.every(operation => operation.name.startsWith('tasks.'))).toBe(true)
      outcomes.push((await ctx.application!.call({ operation: 'employees.list', input: {} })).status)
      outcomes.push((await ctx.application!.call({ operation: 'tasks.page', input: { agentId: ctx.agent.id } })).status)
      outcomes.push((await ctx.application!.call({ operation: 'tasks.update', requestId: 'other-task', input: { id: other.id, expectedRevision: other.revision, status: 'in_review' } })).status)
      const duplicate = await ctx.application!.call({ operation: 'tasks.create', requestId: 'duplicate-progress', input: { agentId: ctx.agent.id, title: '重复进度' } })
      outcomes.push(duplicate.status)
      await employeeTaskStatus(ctx, 'in_progress')
      await ctx.onDelta('已交付报告')
      await employeeTaskStatus(ctx, 'in_review')
    } else if (calls === 3) { await ctx.onDelta('按你的验收意见标记完成'); await employeeTaskStatus(ctx, 'done') }
    else if (calls === 5) { await employeeTaskStatus(ctx, 'in_progress'); await ctx.onDelta('已按新要求修改'); await employeeTaskStatus(ctx, 'in_review') }
    else await ctx.onDelta('报告已经交付，等待你确认')
  })
  other = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: '另一项工作', requestId: 'other-task-create' }) as TrackedTask
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: '整理报告', requestId: 'delivery-task' }) as TrackedTask
  const room = await f.service.handle('openEmployeeTaskSession', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain').Conversation
  const send = (content: string, requestId: string) => f.service.handle('sendEmployeeTaskMessage', { conversationId: room.id, content, mentionIds: [], requestId }) as Promise<AutomationOccurrence>
  const detail = () => f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as Promise<import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail>
  const first = await send('开始', 'deliver-first')
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'))
  expect(outcomes).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
  expect((await detail()).task).toMatchObject({ status: 'in_review', statusSource: 'employee' })
  const question = await send('现在进度如何？', 'progress-question')
  await vi.waitFor(async () => expect((await f.read(question.id)).status).toBe('completed'))
  expect((await detail()).task.status).toBe('in_review')
  const accepted = await send('结果可以了，标记完成', 'user-accepted')
  await vi.waitFor(async () => expect((await f.read(accepted.id)).status).toBe('completed'))
  expect((await detail()).task.status).toBe('done')
  const explanation = await send('解释一下报告中的价格', 'done-question')
  await vi.waitFor(async () => expect((await f.read(explanation.id)).status).toBe('completed'))
  expect((await detail()).task.status).toBe('done')
  const revision = await send('再补充一项对比', 'done-revision')
  await vi.waitFor(async () => expect((await f.read(revision.id)).status).toBe('completed'))
  expect((await detail()).task.status).toBe('in_review')
  expect((await detail()).executions.occurrences.every(item => item.conversationId === room.id)).toBe(true)
  expect((await f.service.handle('listEmployeeTasks', { employeeId: task.agentId, includeDone: true }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage).items).toHaveLength(2)
  expect((await f.service.handle('getEmployeeTask', { employeeId: other.agentId, id: other.id }) as Awaited<ReturnType<typeof detail>>).task.status).toBe('pending')
  await f.service.close()
  const restarted = await f.restart()
  const persisted = await restarted.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as Awaited<ReturnType<typeof detail>>
  expect(persisted.task.status).toBe('in_review')
  await restarted.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: persisted.task.revision, status: 'done' })
  expect((await restarted.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as typeof persisted).task.status).toBe('done')
})

it.each(['failed', 'cancelled'] as const)('returns unfinished employee work to pending after %s without inventing a delivery', async outcome => {
  let started = false
  const f = await setup(async ctx => {
    await employeeTaskStatus(ctx, 'in_progress'); started = true
    if (outcome === 'cancelled') await new Promise<void>(resolve => {
      if (ctx.signal.aborted) resolve()
      else ctx.signal.addEventListener('abort', () => resolve(), { once: true })
    })
    throw new Error('controlled execution failure')
  })
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: 'unfinished work', requestId: 'failure-task' }) as TrackedTask
  const occurrence = await f.service.handle('runEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, requestId: 'failure-start' }) as AutomationOccurrence
  await vi.waitFor(() => expect(started).toBe(true))
  if (outcome === 'cancelled') await f.service.handle('stopAutomation', { id: occurrence.id })
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe(outcome))
  const detail = await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(detail.task.status).toBe('pending')
  expect(detail.executions.occurrences[0].status).toBe(outcome)
})

it('does not infer task delivery or in-progress work from a completed acknowledgement', async () => {
  let calls = 0
  const f = await setup(async ctx => { if (++calls > 1) await employeeTaskStatus(ctx, 'in_progress'); await ctx.onDelta('收到，先讨论要求') })
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: '稍后再做报告', requestId: 'acknowledgement-task' }) as TrackedTask
  const room = await f.service.handle('openEmployeeTaskSession', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain').Conversation
  const occurrence = await f.service.handle('sendEmployeeTaskMessage', { conversationId: room.id, content: '先讨论要求', mentionIds: [], requestId: 'acknowledgement-start' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('completed'))
  expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.status).toBe('pending')
  const partial = await f.service.handle('sendEmployeeTaskMessage', { conversationId: occurrence.conversationId, content: '先做资料收集，报告稍后完成', mentionIds: [], requestId: 'partial-work' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(partial.id)).status).toBe('completed'))
  await f.service.close()
  const restarted = await f.restart()
  expect((await restarted.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.status).toBe('in_progress')
})

it('executes separate tasks FIFO, cancels a queued task without invoking it, and continues after failure', async () => {
  const hold = gate(), calls: string[] = [], contexts: string[] = []
  const f = await setup(async ctx => {
    const prompt = ctx.messages.find(m => m.senderType === 'user')!.content
    calls.push(prompt); contexts.push(ctx.conversation.id)
    if (prompt === 'first') await hold.promise
    if (prompt === 'second') throw new Error('controlled task failure')
    await ctx.onDelta('result: ' + prompt)
  }); cleanup.push(hold.release)
  const defs = await Promise.all(['first', 'cancel me', 'second', 'last'].map(name => f.create(name)))
  const first = await f.start(defs[0]); await vi.waitFor(() => expect(calls).toEqual(['first']))
  const cancelled = await f.start(defs[1]), second = await f.start(defs[2]), last = await f.start(defs[3])
  expect([cancelled, second, last].map(o => o.status)).toEqual(['queued', 'queued', 'queued'])
  expect((await f.start(defs[2])).id).toBe(second.id)
  await f.service.handle('stopAutomation', { id: cancelled.id })
  expect((await f.read(cancelled.id)).status).toBe('cancelled')
  hold.release()
  await vi.waitFor(async () => expect((await f.read(last.id)).status).toBe('completed'), { timeout: 10000 })
  expect(calls).toEqual(['first', 'second', 'last']); expect(new Set(contexts).size).toBe(3)
  expect((await f.read(second.id)).status).toBe('failed')
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const main = snapshot.conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  const chat = await f.service.handle('getConversation', { id: main.id }) as ConversationDetail
  expect(chat.messages.some(m => m.automationPublication?.occurrenceId === first.id && m.content === 'result: first')).toBe(false)
  const task = await f.service.handle('getConversation', { id: first.conversationId }) as ConversationDetail
  expect(task.messages.some(m => m.content === 'result: first')).toBe(true)
  const run = task.runs.at(-1)!
  expect(await f.service.handle('resolveExecutionMessage', { conversationId: first.conversationId, runId: run.id })).toMatchObject({ conversationId: first.conversationId })
  const history = await f.service.handle('listAutomationHistory', { employeeId: 'researcher', limit: 1 }) as { occurrences: AutomationOccurrence[]; nextCursor?: unknown }
  expect(history.occurrences).toHaveLength(1); expect(history.nextCursor).toBeDefined()
  expect((await f.service.handle('listAutomationHistory', { employeeId: 'absent', limit: 1 }) as { occurrences: unknown[] }).occurrences).toEqual([])
})
it('does not start the next employee task until the cancelled adapter actually exits', async () => {
  const exit = gate(), entered: string[] = []
  const f = await setup(async ctx => { const text = ctx.messages[0].content; entered.push(text); if (text === 'held') await exit.promise; else await ctx.onDelta('done') }); cleanup.push(exit.release)
  const first = await f.start(await f.create('held')); await vi.waitFor(() => expect(entered).toEqual(['held']))
  const second = await f.start(await f.create('next'))
  await f.service.handle('stopAutomation', { id: first.id })
  expect((await f.read(first.id)).status).toBe('cancelling'); expect((await f.read(second.id)).status).toBe('queued'); expect(entered).toEqual(['held'])
  exit.release()
  await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(entered).toEqual(['held', 'next'])
})
it('recovers only never-started queue entries, fences changed permissions and restored backups', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-queue-ledger-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'test.sqlite')); await store.init(); cleanup.push(() => store.close())
  const repo = new AutomationRepository(store, root); await repo.migrate(); await repo.recover()
  const input = (id: string): AutomationInput => ({ name: id, prompt: id, conversationPolicy: 'existing-conversation', conversationId: id, owner: { kind: 'employee', employeeId: 'employee' }, frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false })
  for (const id of ['one', 'two', 'three']) await store.write([{ collection: 'conversations', id, value: { id, agentIds: ['employee'] } }])
  const defs = await Promise.all(['one', 'two', 'three'].map(id => repo.save(input(id), 'allowed')))
  const claim = (d: AutomationDefinition) => repo.claim({ automationId: d.id, source: 'manual', key: d.id, scheduledAt: Date.now() }, () => undefined)
  const first = await claim(defs[0]), second = await claim(defs[1]), third = await claim(defs[2])
  expect(second.occurrence.status).toBe('queued')
  await repo.recover()
  expect((await store.get<AutomationOccurrence>('automationOccurrences', first.occurrence.id))?.status).toBe('needs_review')
  expect((await store.get<AutomationOccurrence>('automationOccurrences', second.occurrence.id))?.status).toBe('queued')
  expect((await repo.startQueued(second.occurrence.id, async () => { throw new Error('permission revoked') }, () => false))?.occurrence.status).toBe('needs_review')
  const ready = await repo.startQueued(third.occurrence.id, async () => {}, () => false)
  expect(ready?.occurrence.status).toBe('admitted'); expect(await repo.startQueued(third.occurrence.id, async () => {}, () => false)).toBeUndefined()
  const again = await repo.claim({ automationId: defs[1].id, source: 'manual', key: 'new', scheduledAt: Date.now() }, () => undefined)
  expect(again.occurrence.status).toBe('queued')
  await new AutomationRepository(store, root + '-restored').recover()
  expect((await store.get<AutomationOccurrence>('automationOccurrences', again.occurrence.id))?.status).toBe('interrupted')
})

it('lets a different employee execute while the first employee queue is occupied', async () => {
  const hold = gate(), entered: string[] = []
  const f = await setup(async ctx => { entered.push(ctx.agent.id); await hold.promise; await ctx.onDelta('done') }); cleanup.push(hold.release)
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...writer } = snapshot.agents.find(a => a.id === 'writer')!
  await f.service.handle('saveAgent', { ...writer, connectionId: snapshot.agents.find(a => a.id === 'researcher')!.connectionId })
  const first = await f.start(await f.create('research'))
  await vi.waitFor(() => expect(entered).toEqual(['researcher']))
  const second = await f.start(await f.create('write', 'writer'))
  await vi.waitFor(() => expect(entered).toEqual(['researcher', 'writer']))
  expect((await f.read(first.id)).status).toBe('running'); expect(second.status).toBe('running')
  const queued = await f.start(await f.create('research later')); expect(queued.status).toBe('queued')
  hold.release(); await vi.waitFor(async () => expect((await f.read(queued.id)).status).toBe('completed'), { timeout: 10000 })
})

it('starts the durable queued task after an application restart without replaying the previous execution', async () => {
  const hold = gate(), entered: string[] = []
  const f = await setup(async ctx => { const name = ctx.messages[0].content; entered.push(name); if (name === 'before restart') await hold.promise; await ctx.onDelta(name) }); cleanup.push(hold.release)
  await f.start(await f.create('before restart')); await vi.waitFor(() => expect(entered).toEqual(['before restart']))
  const queued = await f.start(await f.create('after restart')); expect(queued.status).toBe('queued')
  const closing = f.service.close(); hold.release(); await closing
  expect(entered).toEqual(['before restart'])
  const restarted = await f.restart()
  await vi.waitFor(async () => expect((await restarted.handle('getAutomationOccurrence', { id: queued.id }) as AutomationOccurrence).status).toBe('completed'), { timeout: 10000 })
  expect(entered).toEqual(['before restart', 'after restart'])
})


it('keeps ordinary employee assignments out of scheduled plans and retains both origins in the employee task history', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('done') })
  const scheduled = await f.create('weather schedule')
  const task = await f.service.handle('saveAutomation', { purpose: 'employee-task', owner: { kind: 'employee', employeeId: 'researcher' }, name: 'employee assignment', prompt: 'independent work', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false }) as AutomationDefinition
  const run = await f.start(task)
  await vi.waitFor(async () => expect((await f.read(run.id)).status).toBe('completed'), { timeout: 10000 })
  const scheduledRun = await f.start(scheduled)
  await vi.waitFor(async () => expect((await f.read(scheduledRun.id)).status).toBe('completed'), { timeout: 10000 })
  const plans = await f.service.handle('listAutomations', undefined) as { definitions: AutomationDefinition[]; occurrences: AutomationOccurrence[] }
  expect(plans.definitions.map(d => d.id)).toContain(scheduled.id)
  expect(plans.definitions.map(d => d.id)).not.toContain(task.id)
  expect(plans.occurrences.map(o => o.id)).not.toContain(run.id)
  const history = await f.service.handle('listAutomationHistory', { limit: 100 }) as { occurrences: AutomationOccurrence[] }
  expect(history.occurrences.map(o => o.id)).not.toContain(run.id)
  const employeeHistory = await f.service.handle('listAutomationHistory', { employeeId: 'researcher', limit: 100 }) as { occurrences: AutomationOccurrence[] }
  expect(employeeHistory.occurrences.map(o => o.id)).toEqual(expect.arrayContaining([run.id, scheduledRun.id]))
  expect(await f.service.handle('listOwnerAutomations', { owner: { kind: 'employee', employeeId: 'researcher' }, purpose: 'employee-task', limit: 1 })).toMatchObject({ definitions: [{ id: task.id }] })
  expect(await f.service.handle('listOwnerAutomations', { owner: { kind: 'employee', employeeId: 'writer' }, purpose: 'employee-task', limit: 1 })).toMatchObject({ definitions: [] })
  await expect(f.service.handle('saveAutomation', { purpose: 'employee-task', owner: { kind: 'employee', employeeId: 'researcher' }, name: 'invalid', prompt: 'invalid', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false })).rejects.toThrow('员工任务必须归属单个员工并手动执行')
})

it('isolates scheduled employee tasks and their delivered results from the main chat', async () => {
  const contexts: { id: string; inputs: string[] }[] = []
  const f = await setup(async ctx => { contexts.push({ id: ctx.conversation.id, inputs: ctx.messages.map(m => m.content) }); await ctx.onDelta('reply: ' + ctx.messages.filter(m => m.senderType === 'user').at(-1)!.content) })
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  await f.service.handle('sendMessage', { conversationId: main.id, content: 'Main-chat-only context', mentionIds: [], requestId: 'intro' })
  await vi.waitFor(async () => expect((await f.service.handle('getConversation', { id: main.id }) as ConversationDetail).messages.some(m => m.content === 'reply: Main-chat-only context')).toBe(true))
  const input = { owner: { kind: 'employee' as const, employeeId: 'researcher' }, name: 'daily news', prompt: 'Summarize today', frequency: 'daily' as const, time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }
  const plan = await f.service.handle('saveAutomation', input) as AutomationDefinition
  expect(plan.conversationPolicy).toBe('new-conversation')
  const first = await f.start(plan)
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const second = await f.start(plan, 'next-day')
  await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(new Set(contexts.map(c => c.id)).size).toBe(3)
  expect(contexts[2].inputs).not.toContain('Main-chat-only context')
  expect(contexts[2].inputs).not.toContain('reply: Summarize today')
  const chat = await f.service.handle('getConversation', { id: main.id }) as ConversationDetail
  expect(chat.messages.some(m => m.automationPublication?.occurrenceId === first.id)).toBe(false)
  expect(chat.messages.some(m => m.automationPublication?.occurrenceId === second.id)).toBe(false)
  for (const occurrence of [first, second]) {
    const task = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: occurrence.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
    expect(task.task.sessionConversationId).toBe(occurrence.conversationId)
  }
})

it('queues a dedicated task while ordinary conversation is active and delivers it once that execution exits', async () => {
  const hold = gate(), calls: string[] = []
  const f = await setup(async ctx => {
    const prompt = ctx.messages.filter(m => m.senderType === 'user').at(-1)!.content
    calls.push(prompt)
    if (prompt === 'ordinary chat') await hold.promise
    await ctx.onDelta('reply: ' + prompt)
  }); cleanup.push(hold.release)
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  const task = await f.service.handle('saveAutomation', { purpose: 'employee-task', owner: { kind: 'employee', employeeId: 'researcher' }, name: 'queued work', prompt: 'queued work', frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false }) as AutomationDefinition
  await f.service.handle('sendMessage', { conversationId: main.id, content: 'ordinary chat', mentionIds: [], requestId: 'ordinary-busy' })
  await vi.waitFor(() => expect(calls).toEqual(['ordinary chat']))
  const queued = await f.start(task)
  expect(queued.status).toBe('queued')
  hold.release()
  await vi.waitFor(async () => expect((await f.read(queued.id)).status).toBe('completed'), { timeout: 10000 })
  expect(calls).toEqual(['ordinary chat', 'queued work'])
  expect((await f.read(queued.id)).conversationId).not.toBe(main.id)
})

it('keeps one employee task through two executions, explicit completion and reopening, with idempotent admission', async () => {
  const inputs: { text: string; conversationId: string }[] = []
  const f = await setup(async ctx => { await employeeTaskStatus(ctx, 'in_progress'); inputs.push({ text: ctx.messages.at(-1)!.content, conversationId: ctx.conversation.id }); await ctx.onDelta('已整理报告'); await employeeTaskStatus(ctx, 'in_review') })
  const create = { employeeId: 'researcher', requestId: 'task-report-create', title: '竞品报告', description: '整理竞品报告' }
  const task = await f.service.handle('createEmployeeTask', create) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  expect(task.status).toBe('pending'); expect(inputs).toHaveLength(0)
  expect((await f.service.handle('createEmployeeTask', create) as typeof task).id).toBe(task.id)
  await expect(f.service.handle('createEmployeeTask', { ...create, title: 'changed' })).rejects.toThrow('同一请求')
  const firstRequest = { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, requestId: 'task-first' }
  const first = await f.service.handle('runEmployeeTask', firstRequest) as AutomationOccurrence
  expect(first.taskId).toBe(task.id)
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const detail = () => f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as Promise<import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail>
  let current = await detail()
  expect(current.task.status).toBe('in_review') // A finished run is not a declaration that the task is done.
  const secondRequest = { ...firstRequest, expectedRevision: current.task.revision, requestId: 'task-second', supplement: '补充价格比较' }
  const second = await f.service.handle('runEmployeeTask', secondRequest) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(second.taskId).toBe(task.id); expect(second.conversationId).toBe(first.conversationId)
  expect(inputs).toHaveLength(2); expect(inputs[1].text).toContain('补充价格比较')
  expect((await f.service.handle('runEmployeeTask', secondRequest) as AutomationOccurrence).id).toBe(second.id)
  expect(inputs).toHaveLength(2)
  await expect(f.service.handle('runEmployeeTask', { ...secondRequest, supplement: '其他内容' })).rejects.toThrow('同一提交')
  current = await detail(); expect(current.executions.occurrences.map(o => o.id)).toEqual([second.id, first.id])
  const done = await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.task.revision, status: 'done' }) as typeof task
  const active = await f.service.handle('listEmployeeTasks', { employeeId: task.agentId }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage
  expect(active.items.some(t => t.id === task.id)).toBe(false)
  const completed = await f.service.handle('listEmployeeTasks', { employeeId: task.agentId, status: 'done' }) as typeof active
  expect(completed.items.map(t => t.id)).toContain(task.id)
  const third = await f.service.handle('runEmployeeTask', { ...firstRequest, expectedRevision: done.revision, requestId: 'done-again' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(third.id)).status).toBe('completed'))
  current = await detail()
  const closed = await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.task.revision, status: 'closed' }) as typeof task
  const fourth = await f.service.handle('runEmployeeTask', { ...firstRequest, expectedRevision: closed.revision, requestId: 'closed-again' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(fourth.id)).status).toBe('completed'))
  expect(third.conversationId).toBe(first.conversationId); expect(fourth.conversationId).toBe(first.conversationId)
  await f.service.close(); const restarted = await f.restart()
  expect((await restarted.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as typeof current).executions.occurrences).toHaveLength(4)
  expect(inputs).toHaveLength(4)
})

it('converts a main-chat message without executing it again and retains the task after chat history is cleared', async () => {
  const calls: string[] = []
  const f = await setup(async ctx => { calls.push(ctx.messages.at(-1)!.content); await ctx.onDelta('已收到') })
  const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
  const main = snapshot.conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  await f.service.handle('sendMessage', { conversationId: main.id, content: '整理竞品报告，下周继续完善', mentionIds: [], requestId: 'convert-source' })
  await vi.waitFor(async () => expect((await f.service.handle('getConversation', { id: main.id }) as ConversationDetail).runs.at(-1)?.status).toBe('completed'), { timeout: 10000 })
  const chat = await f.service.handle('getConversation', { id: main.id }) as ConversationDetail
  const source = chat.messages.find(m => m.senderType === 'user')!
  const input = { employeeId: 'researcher', requestId: 'conversion', source: { conversationId: main.id, messageId: source.id } }
  const task = await f.service.handle('createEmployeeTask', input) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  expect(task).toMatchObject({ source: input.source, status: 'pending', description: source.content })
  const same = await f.service.handle('createEmployeeTask', { ...input, requestId: 'conversion-again' }) as typeof task
  expect(same.id).toBe(task.id); expect(calls).toHaveLength(1)
  const tracked = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(tracked.sourceExecution?.runs.map(r => r.id).sort()).toEqual(chat.runs.map(r => r.id).sort())
  const reread = await f.service.handle('getConversation', { id: main.id }) as ConversationDetail
  expect(reread.messages.find(m => m.id === source.id)?.employeeTaskId).toBe(task.id)
  await expect(f.service.handle('createEmployeeTask', { ...input, employeeId: 'writer', requestId: 'wrong-owner' })).rejects.toThrow()
  await expect(f.service.handle('getEmployeeTask', { employeeId: 'writer', id: task.id })).rejects.toThrow('不属于')
  await f.service.handle('clearConversationHistory', { id: main.id, hide: false })
  const page = await f.service.handle('listEmployeeTasks', { employeeId: 'researcher' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage
  expect(page.items.map(t => t.id)).toContain(task.id)
  expect((await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: task.id }) as typeof tracked).sourceExecution).toEqual({ available: false, runs: [] })
  expect(calls).toHaveLength(1)
})

it('links a scheduled-plan execution to a durable employee task without changing the schedule page contract', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('天气结果') })
  const definition = await f.service.handle('saveAutomation', { owner: { kind: 'employee', employeeId: 'researcher' }, name: '每日天气', prompt: '查询天气', frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  const occurrence = await f.start(definition)
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('completed'), { timeout: 10000 })
  const task = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: occurrence.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(task.task.sourceKind).toBe('schedule'); expect(task.executions.occurrences[0].id).toBe(occurrence.id)
  const history = await f.service.handle('listAutomationHistory', { automationId: definition.id }) as import('../packages/shared/src/domain').AutomationHistoryPage
  expect(history.occurrences[0].id).toBe(occurrence.id)
  expect((await f.service.handle('getAutomation', { id: definition.id }) as AutomationDefinition).frequency).toBe('daily')
})

it('continues an explicitly isolated legacy task and resolves its result inside the task conversation', async () => {
  const contexts: string[] = []
  const f = await setup(async ctx => { contexts.push(ctx.conversation.id); await ctx.onDelta('已继续') })
  const first = await f.start(await f.create('旧任务的明确上下文'))
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const detail = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: first.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  const task = detail.task.status === 'done' ? await f.service.handle('updateEmployeeTask', { employeeId: 'researcher', id: detail.task.id, expectedRevision: detail.task.revision, status: 'pending' }) as typeof detail.task : detail.task
  const next = await f.service.handle('runEmployeeTask', { employeeId: 'researcher', id: task.id, expectedRevision: task.revision, requestId: 'legacy-followup', supplement: '在上次工作上补充' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(next.id)).status).toBe('completed'), { timeout: 10000 })
  expect(next.taskId).toBe(task.id); expect(contexts).toEqual([first.conversationId, first.conversationId])
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  expect(main.id).not.toBe(first.conversationId)
  const chat = await f.service.handle('getConversation', { id: main.id }) as ConversationDetail
  expect(chat.messages.some(m => m.automationPublication?.occurrenceId === next.id)).toBe(false)
  const run = (await f.service.handle('getConversation', { id: next.conversationId }) as ConversationDetail).runs.filter(r => r.origin?.occurrenceId === next.id).at(-1)!
  expect(await f.service.handle('resolveExecutionMessage', { conversationId: next.conversationId, runId: run.id })).toMatchObject({ conversationId: next.conversationId })
})

it('opens exactly one session per task without running, resumes it after restart and sends queued messages once', async () => {
  const hold = gate(), calls: { id: string; inputs: string[] }[] = []
  const f = await setup(async ctx => { calls.push({ id: ctx.conversation.id, inputs: ctx.messages.map(m => m.content) }); if (calls.length === 1) await hold.promise; await ctx.onDelta('报告结果') }); cleanup.push(hold.release)
  const a = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', title: 'A', description: '任务A的要求', requestId: 'task-a' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  const b = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', title: 'B', description: '任务B的要求', requestId: 'task-b' }) as typeof a
  const open = (id: string) => f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id }) as Promise<import('../packages/shared/src/domain').Conversation>
  const [ra, rb] = await Promise.all([open(a.id), open(b.id)])
  expect(ra.id).not.toBe(rb.id); expect((await open(a.id)).id).toBe(ra.id); expect(calls).toHaveLength(0)
  const input = { conversationId: ra.id, content: '请开始', mentionIds: [], requestId: 'dialog-first' }
  const first = await f.service.handle('sendEmployeeTaskMessage', input) as AutomationOccurrence
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  const second = await f.service.handle('sendEmployeeTaskMessage', { ...input, content: '补充价格', requestId: 'dialog-followup' }) as AutomationOccurrence
  expect(second.status).toBe('queued'); expect(second.taskId).toBe(a.id); expect(second.conversationId).toBe(ra.id)
  expect((await f.service.handle('sendEmployeeTaskMessage', input) as AutomationOccurrence).id).toBe(first.id)
  expect((await f.service.handle('getEmployeeTaskMessageReceipt', { requestId: 'dialog-first' }) as AutomationOccurrence).id).toBe(first.id)
  await expect(f.service.handle('sendEmployeeTaskMessage', { ...input, content: 'different' })).rejects.toThrow('同一消息请求')
  hold.release(); await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(calls.map(c => c.id)).toEqual([ra.id, ra.id])
  expect(calls[0].inputs).toContain('任务A的要求\n\n请开始')
  expect(calls[1].inputs).toContain('报告结果'); expect(calls[1].inputs).toContain('补充价格')
  await f.service.close(); const next = await f.restart()
  expect((await next.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: a.id }) as typeof ra).id).toBe(ra.id)
  expect((await next.handle('getEmployeeTaskMessageReceipt', { requestId: 'dialog-first' }) as AutomationOccurrence).id).toBe(first.id)
  expect(calls).toHaveLength(2)
})

it('keeps manual task states after execution finishes and scopes all five status filters to the owner', async () => {
  const hold = gate(), f = await setup(async ctx => { await hold.promise; await ctx.onDelta('finished') }); cleanup.push(hold.release)
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: 'state check', requestId: 'manual-status-task' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  const occurrence = await f.service.handle('runEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, requestId: 'manual-status-run' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('running'))
  let current = (await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  for (const status of ['pending', 'in_progress', 'in_review', 'done', 'closed'] as const) {
    current = await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: current.revision, status }) as typeof task
    expect(current.status).toBe(status)
    expect((await f.service.handle('listEmployeeTasks', { employeeId: task.agentId, status }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage).items.map(t => t.id)).toContain(task.id)
    await expect(f.service.handle('updateEmployeeTask', { employeeId: 'writer', id: task.id, expectedRevision: current.revision, status })).rejects.toThrow('不属于')
  }
  expect((await f.read(occurrence.id)).status).toBe('running')
  hold.release(); await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('completed'), { timeout: 10000 })
  expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.status).toBe('closed')
})

it('projects an existing main-chat schedule into a task session without editing its persisted plan', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('scheduled result') })
  const main = (await f.service.handle('snapshot', undefined) as Snapshot).conversations.find(c => c.mainPrivate && c.agentIds[0] === 'researcher')!
  const plan = await f.service.handle('saveAutomation', { owner: { kind: 'employee', employeeId: 'researcher' }, name: 'legacy plan', prompt: 'legacy plan', conversationPolicy: 'existing-conversation', conversationId: main.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
  const occurrence = await f.start(plan)
  await vi.waitFor(async () => expect((await f.read(occurrence.id)).status).toBe('completed'), { timeout: 10000 })
  expect(occurrence.conversationId).not.toBe(main.id)
  expect(await f.service.handle('getAutomation', { id: plan.id })).toEqual(plan)
  const detail = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: occurrence.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(detail.task.sessionConversationId).toBe(occurrence.conversationId)
  expect((await f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: detail.task.id }) as import('../packages/shared/src/domain').Conversation).id).toBe(occurrence.conversationId)
})

it('keeps the task session and its conversation when a completed execution log is removed', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('保留任务对话') })
  const first = await f.start(await f.create('task history'))
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const task = (await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: first.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task
  const before = await f.service.handle('getConversation', { id: first.conversationId }) as ConversationDetail
  await f.service.handle('deleteAutomationOccurrence', { id: first.id, expectedVersion: (await f.read(first.id)).stateVersion })
  expect((await f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain').Conversation).id).toBe(first.conversationId)
  expect((await f.service.handle('getConversation', { id: first.conversationId }) as ConversationDetail).messages).toEqual(before.messages)
  const detail = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  expect(detail.executions.occurrences).toEqual([])
  const second = await f.service.handle('sendEmployeeTaskMessage', { conversationId: first.conversationId, content: '继续', mentionIds: [], requestId: 'after-log-removal' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await f.read(second.id)).status).toBe('completed'), { timeout: 10000 })
  expect(second.taskId).toBe(task.id); expect(second.conversationId).toBe(first.conversationId)
})

it('keeps a task question on the original reply protocol and does not dispatch queued follow-ups over it', async () => {
  const hold = gate(), calls: string[] = []
  const f = await setup(async ctx => { await employeeTaskStatus(ctx, 'in_progress'); const prompt = ctx.messages.find(m => m.id === ctx.triggerMessageId)!.content; calls.push(prompt); if (calls.length === 1) await hold.promise; await ctx.onDelta(ctx.responseKind === 'chat' ? '请确认城市' : '确认结果'); if (ctx.onWorkOutcome) await ctx.onWorkOutcome({ disposition: 'delivered', summary: '确认结果', evidence: [{ kind: 'answer', reference: '确认结果' }] }) }, async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : ctx.messages.find(m => m.id === ctx.triggerMessageId)?.content.includes('初始') ? 'ask' : 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation?.observedThroughSequence ?? 1 }))
  cleanup.push(hold.release)
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', description: '初始要求', requestId: 'question-task' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  const room = await f.service.handle('openEmployeeTaskSession', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain').Conversation
  const input = { conversationId: room.id, content: '开始', mentionIds: [], requestId: 'question-start' }
  const first = await f.service.handle('sendEmployeeTaskMessage', input) as AutomationOccurrence
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  const next = await f.service.handle('sendEmployeeTaskMessage', { ...input, content: '后续要求', requestId: 'after-question' }) as AutomationOccurrence
  expect(next.status).toBe('queued')
  hold.release(); await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('waiting_user'), { timeout: 10000 })
  expect((await f.read(next.id)).status).toBe('queued'); expect(calls).toHaveLength(1)
  expect((await f.service.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail).task.status).toBe('in_progress')
  expect((await f.service.handle('sendEmployeeTaskMessage', input) as AutomationOccurrence).id).toBe(first.id)
  await expect(f.service.handle('sendEmployeeTaskMessage', { ...input, content: '不绑定原问题的回复', requestId: 'unbound-question' })).rejects.toThrow('原问题卡')
  expect(await f.service.handle('getEmployeeTaskMessageReceipt', { requestId: 'unbound-question' })).toBeNull()
  const chat = await f.service.handle('getConversation', { id: room.id }) as ConversationDetail
  const question = chat.messages.find(m => m.senderType === 'agent' && m.turnId === first.turnId)!
  await f.service.handle('replyAutomation', { occurrenceId: first.id, requestId: 'bound-answer', content: '南京', question: { expectedVersion: (await f.read(first.id)).stateVersion, questionMessageId: question.id } })
  await vi.waitFor(async () => expect((await f.read(next.id)).status).toBe('completed'), { timeout: 10000 })
  expect(calls).toHaveLength(3)
})

it('renames a task and its session without changing execution-owned status or starting work', async () => {
  const run = vi.fn(async ctx => { await ctx.onDelta('done') }), f = await setup(run)
  const task = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', requestId: 'rename', title: '旧名称', description: '原要求' }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTask
  const room = await f.service.handle('openEmployeeTaskSession', { employeeId: task.agentId, id: task.id }) as import('../packages/shared/src/domain').Conversation
  const input = { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, title: ' 新名称 ' }
  await expect(f.service.handle('updateEmployeeTask', { ...input, employeeId: 'writer' })).rejects.toThrow('不属于')
  await expect(f.service.handle('updateEmployeeTask', { ...input, title: '  ' })).rejects.toThrow()
  await expect(f.service.handle('updateEmployeeTask', { ...input, title: 'x'.repeat(301) })).rejects.toThrow()
  const renamed = await f.service.handle('updateEmployeeTask', input) as typeof task
  expect(renamed).toMatchObject({ title: '新名称', status: task.status, revision: task.revision + 1, description: '原要求', sessionConversationId: room.id })
  expect(renamed.statusSource).toBe(task.statusSource)
  expect((await f.service.handle('getConversation', { id: room.id }) as ConversationDetail).conversation.title).toBe('新名称')
  await expect(f.service.handle('updateEmployeeTask', { ...input, title: '覆盖' })).rejects.toThrow('已经改变')
  expect(run).not.toHaveBeenCalled()
})
it('deletes a finished employee task without deleting its plan/history and never re-adopts it after restart', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('保留结果') })
  const plan = await f.create('weather schedule'), first = await f.start(plan)
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const detail = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: first.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  const input = { employeeId: 'researcher', id: detail.task.id, expectedRevision: detail.task.revision }
  await expect(f.service.handle('deleteEmployeeTask', { ...input, employeeId: 'writer' })).rejects.toThrow('不属于')
  await expect(f.service.handle('deleteEmployeeTask', { ...input, expectedRevision: detail.task.revision + 1 })).rejects.toThrow('已经改变')
  expect(await f.service.handle('deleteEmployeeTask', input)).toEqual({ deleted: true })
  expect(await f.service.handle('deleteEmployeeTask', input)).toEqual({ deleted: true })
  await expect(f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: detail.task.id })).rejects.toThrow('不存在')
  await expect(f.service.handle('openEmployeeTaskSession', { employeeId: 'researcher', id: detail.task.id })).rejects.toThrow('不存在')
  expect((await f.read(first.id)).status).toBe('completed')
  expect((await f.service.handle('getConversation', { id: first.conversationId }) as ConversationDetail).messages.some(m => m.content === '保留结果')).toBe(true)
  await f.service.close(); const restarted = await f.restart()
  expect(await restarted.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true })).toMatchObject({ items: [] })
  expect((await restarted.handle('listAutomationHistory', { automationId: plan.id, limit: 30 }) as { occurrences: AutomationOccurrence[] }).occurrences.map(o => o.id)).toContain(first.id)
  const next = await restarted.handle('runAutomation', { id: plan.id, requestId: 'next-scheduled-run' }) as AutomationOccurrence
  await vi.waitFor(async () => expect((await restarted.handle('getAutomationOccurrence', { id: next.id }) as AutomationOccurrence).status).toBe('completed'), { timeout: 10000 })
  expect(next.taskId).not.toBe(first.taskId)
  expect(await restarted.handle('listEmployeeTasks', { employeeId: 'researcher', includeDone: true })).toMatchObject({ items: [{ id: next.taskId, kind: 'assignment' }] })
  expect(await restarted.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: next.id })).toMatchObject({ task: { id: next.taskId, sourceKind: 'schedule' } })
  expect((await restarted.handle('listAutomationHistory', { automationId: plan.id, limit: 30 }) as { occurrences: AutomationOccurrence[] }).occurrences.map(item => item.id)).toEqual(expect.arrayContaining([first.id, next.id]))
})
it('rejects deletion of running or queued tasks even when their manual state is done', async () => {
  const hold = gate(), f = await setup(async ctx => { await hold.promise; await ctx.onDelta('done') }); cleanup.push(hold.release)
  const first = await f.start(await f.create('busy')), queued = await f.start(await f.create('queued'))
  expect(queued.status).toBe('queued')
  for (const occurrence of [first, queued]) {
    const { task } = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: occurrence.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
    const updated = await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, status: 'done' }) as typeof task
    await expect(f.service.handle('deleteEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: updated.revision })).rejects.toThrow('请先停止')
  }
  hold.release()
  await vi.waitFor(async () => expect((await f.read(queued.id)).status).toBe('completed'), { timeout: 10000 })
})

it('clears all task pages in one employee status and replays the receipt without deleting newer tasks', async () => {
  const f = await setup(async ctx => { await ctx.onDelta('保留定时结果') })
  const first = await f.start(await f.create('保留定时计划'))
  await vi.waitFor(async () => expect((await f.read(first.id)).status).toBe('completed'), { timeout: 10000 })
  const { task: scheduled } = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: first.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
  await f.service.handle('updateEmployeeTask', { employeeId: scheduled.agentId, id: scheduled.id, expectedRevision: scheduled.revision, status: 'done' })
  const create = (requestId: string, employeeId = 'researcher', status: TrackedTask['status'] = 'done') => f.service.handle('createEmployeeTask', { employeeId, requestId, title: requestId, description: '保留任务要求', status }) as Promise<TrackedTask>
  const tasks: TrackedTask[] = []
  for (let i = 0; i < 35; i++) tasks.push(await create(`clear-page-${i}`))
  const otherStatus = await create('keep-pending', 'researcher', 'pending'), otherEmployee = await create('keep-writer', 'writer')
  const page = await f.service.handle('listEmployeeTasks', { employeeId: 'researcher', status: 'done', limit: 30 }) as import('../packages/shared/src/domain/tracked-tasks').TrackedTaskPage
  expect(page.items).toHaveLength(30); expect(page.nextCursor).toBeTruthy()
  const input = { employeeId: 'researcher', status: 'done' as const, requestId: 'clear-all-done' }
  const result = await f.service.handle('clearEmployeeTasks', input) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskMethods['clearEmployeeTasks']['output']
  expect([...result.deletedIds].sort()).toEqual([scheduled.id, ...tasks.map(task => task.id)].sort())
  expect(result.skippedIds).toEqual([])
  expect(await f.service.handle('listEmployeeTasks', { employeeId: 'researcher', status: 'done' })).toEqual({ items: [] })
  const newer = await create('created-after-clear')
  expect(await f.service.handle('clearEmployeeTasks', input)).toEqual(result)
  await expect(f.service.handle('clearEmployeeTasks', { ...input, status: 'pending' })).rejects.toThrow('同一清空请求')
  await expect(f.service.handle('clearEmployeeTasks', { employeeId: 'researcher', requestId: 'no-status' })).rejects.toThrow()
  await f.service.close(); const restarted = await f.restart()
  expect(await restarted.handle('clearEmployeeTasks', input)).toEqual(result)
  expect(await restarted.handle('listEmployeeTasks', { employeeId: 'researcher', status: 'done' })).toMatchObject({ items: [{ id: newer.id }] })
  for (const task of [otherStatus, otherEmployee]) expect(await restarted.handle('getEmployeeTask', { employeeId: task.agentId, id: task.id })).toMatchObject({ task: { id: task.id } })
  expect(await restarted.handle('getAutomationOccurrence', { id: first.id })).toMatchObject({ status: 'completed' })
  expect((await restarted.handle('getConversation', { id: first.conversationId }) as ConversationDetail).messages.some(m => m.content === '保留定时结果')).toBe(true)
  expect((await restarted.handle('listAutomations', undefined) as import('../packages/shared/src/domain/automations').AutomationsView).definitions.some(plan => plan.id === first.automationId)).toBe(true)
})
it('preserves running and queued tasks during column clear even when manually marked done', async () => {
  const hold = gate(), f = await setup(async ctx => { await hold.promise; await ctx.onDelta('done') }); cleanup.push(hold.release)
  const first = await f.start(await f.create('clear-busy')), queued = await f.start(await f.create('clear-queued'))
  expect(queued.status).toBe('queued')
  for (const occurrence of [first, queued]) {
    const { task } = await f.service.handle('getEmployeeTask', { employeeId: 'researcher', occurrenceId: occurrence.id }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskDetail
    await f.service.handle('updateEmployeeTask', { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, status: 'done' })
  }
  const idle = await f.service.handle('createEmployeeTask', { employeeId: 'researcher', requestId: 'clear-idle', title: '可清空任务', description: '已完成', status: 'done' }) as TrackedTask
  const result = await f.service.handle('clearEmployeeTasks', { employeeId: 'researcher', status: 'done', requestId: 'clear-with-active' }) as import('../packages/shared/src/domain/employee-tasks').EmployeeTaskMethods['clearEmployeeTasks']['output']
  expect(result.deletedIds).toEqual([idle.id])
  expect(result.skippedIds.sort()).toEqual([first.taskId, queued.taskId].sort())
  expect((await f.read(queued.id)).status).toBe('queued')
  hold.release()
  await vi.waitFor(async () => expect((await f.read(queued.id)).status).toBe('completed'), { timeout: 10000 })
})
