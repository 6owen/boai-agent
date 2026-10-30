/*
 * [INPUT]: 隔离AppService/SQLite与可控员工执行，不调用真实模型或个人数据。
 * [OUTPUT]: 员工FIFO、精确取消、退出围栏、重启/权限及普通任务与定时计划分流回归。
 * [POS]: 独立员工任务产品合同。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import type { AutomationDefinition, AutomationInput, AutomationOccurrence, Connection, ConversationDetail, Snapshot } from '../packages/shared/src/domain'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { AutomationRepository } from '../packages/runtime/src/modules/automations/automation-repository'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
async function setup(run: AgentEngine['run']) {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-queue-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const options: ConstructorParameters<typeof AppService>[0] = { dataPath: root, engine: { test: async () => '', decide: async ctx => ({ action: ctx.participation?.hasRespondedInTurn ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: ctx.participation?.observedThroughSequence ?? 1 }), run }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit() {} }
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
  expect(chat.messages.some(m => m.automationPublication)).toBe(false)
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
  await expect(f.service.handle('saveAutomation', { purpose: 'employee-task', owner: { kind: 'employee', employeeId: 'researcher' }, name: 'invalid', prompt: 'invalid', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false })).rejects.toThrow('员工任务必须归属单个员工并使用独立上下文')
})
