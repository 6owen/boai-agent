/*
 * [OUTPUT]: 真实 SQLite 验证旧数字通知身份、顺序、索引定位和队列单语句快照。
 * [OUTPUT]: 任务面板、主聊天和应用操作共用 tasks/read-model 的受权分页和活动读取。
 * [OUTPUT]: 会话队列和调度准入使用同一持久顺序；执行器容量单独判断。
 * [OUTPUT]: 历史 SQLite 全部执行状态与共享在途判断使用同一七项业务集合。
 * [OUTPUT]: 真实在途任务在LIMIT前筛选，不被新卡或手动done遮蔽；同任务多次执行及重启身份保持。
 * [OUTPUT]: 人工委派看板在分页前隔离内部/旧进度，工具不能伪造或晋升委派；原只读分页与回执保持。
 * [INPUT]: Real SQLite/ProductStore, original task mutations and authenticated application actors.
 * [OUTPUT]: Bounded task pages, filter-before-LIMIT access, stable cursors/reopen, honest projection and zero read-side mutation.
 * [POS]: Task-entry data contract integration; no models, GUI or personal profile.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import type { Client, InArgs, InStatement } from '@libsql/client'
import type { Conversation } from '@boai/shared/domain'
import { listConversationQueue } from '../packages/runtime/src/modules/conversations/message-queue'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AUTOMATION_OCCURRENCE_STATUSES, compareQueuedOccurrences, isOngoingOccurrence } from '@boai/shared/domain/automations'
import type { ApplicationActor } from '../packages/shared/src/domain/application-protocol'
import { TASK_PAGE_LIMITS, isEmployeeTaskAssignment, type TrackedTask, type TrackedTaskPage } from '../packages/shared/src/domain/tracked-tasks'
import { readTaskPage, readTaskActivity } from '../packages/runtime/src/modules/tasks/read-model'
import { ProductStore, type StoredRecord } from '../packages/runtime/src/adapters/storage/product-store'
import { ApplicationService } from '../packages/runtime/src/modules/application/application-service'
import { taskOperations } from '../packages/runtime/src/modules/application/task-operations'
import { planCollection } from '../packages/runtime/src/modules/application/plan-weave'

it('orders queued occurrences by persisted priority, legacy time fallback and stable ID', () => {
  const rows = [
    { id: 'late', queueOrder: 2, startedAt: '01' },
    { id: 'b', admittedAt: '02', startedAt: '01' },
    { id: 'early', queueOrder: -1, startedAt: '03' },
    { id: 'a', startedAt: '02' },
    { id: 'first', startedAt: '01' },
  ]
  expect(rows.sort(compareQueuedOccurrences).map(row => row.id)).toEqual(['early', 'first', 'a', 'b', 'late'])
})

const time = '2026-10-22T00:00:00.000Z'
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })
const record = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const task = (id: string, changes: Partial<TrackedTask> = {}): TrackedTask => ({ id, agentId: 'a', conversationId: 'direct', title: id, steps: [], status: 'pending', note: '', revision: 1, createdAt: time, updatedAt: time, ...changes })
const room = (id: string, changes: Record<string, unknown> = {}) => ({ id, kind: 'direct', agentIds: ['a'], ...changes })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-page-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let store = new ProductStore(join(root, 'data.sqlite')); await store.init()
  cleanup.push(() => store.close())
  await store.write([record('agents', { id: 'a' }), record('agents', { id: 'b' }), record('conversations', room('direct')), record('conversations', room('other'))])
  let app = new ApplicationService(store, taskOperations(store), async () => {})
  const call = (operation: string, input: Record<string, unknown> = {}, actor: ApplicationActor = { kind: 'owner' }) => app.call({ operation, input, requestId: randomUUID() }, actor)
  const page = async (input: Record<string, unknown> = {}, actor?: ApplicationActor) => {
    const result = await call('tasks.page', input, actor)
    expect(result.status).toBe('succeeded')
    return result.data as TrackedTaskPage
  }
  return { get store() { return store }, app, call, page, reopen: async () => { await app.drain(); await store.close(); store = new ProductStore(join(root, 'data.sqlite')); await store.init(); app = new ApplicationService(store, taskOperations(store), async () => {}) } }
}

it('uses indexed task and notice identities and reads the queue in a single SQLite snapshot', async () => {
  const f = await fixture()
  const occurrence = { id: '7', conversationId: 'direct', taskId: 't', status: 'queued', startedAt: time, stateVersion: 2, plan: { employeeIds: ['a'] } }
  const pending = { id: '7', status: 'pending', definition: { prompt: 'original prompt' } }
  const linked = (id: string, occurrenceId: unknown) => ({ id, occurrenceId })
  const unrelated = { ...occurrence, id: 'other', conversationId: 'other', startedAt: undefined }
  const deleted = { ...occurrence, id: 'deleted', startedAt: undefined, deletedAt: time }
  await f.store.write([
    ...[occurrence, unrelated, deleted].map(value => record('automationOccurrences', value)),
    ...[pending, { ...pending, id: 'deleted' }, { ...pending, id: 'other' }].map(value => record('automationDispatches', value)),
    ...[linked('z', '7'), linked('a', 7), linked('b', '07'), linked('c', null)].map(value => record('automationNotices', value)),
  ])
  const client = (f.store as unknown as { client: Client }).client
  const execute = client.execute.bind(client)
  const plans: string[][] = []
  const inspection = vi.spyOn(client, 'execute').mockImplementation(async (statement: InStatement, args?: InArgs) => {
    if (typeof statement !== 'string' && statement.sql.trimStart().startsWith('SELECT')) {
      const plan = await execute({ ...statement, sql: `EXPLAIN QUERY PLAN ${statement.sql}` })
      plans.push(plan.rows.map(row => String(row.detail)))
    }
    return typeof statement === 'string' ? execute(statement, args) : execute(statement)
  })
  try {
    const page = await f.store.automationHistory({ taskId: 't', employeeId: 'a', limit: 5 })
    expect(page.occurrences.find(row => row.id === '7')?.notices?.map(notice => notice.id)).toEqual(['a', 'z'])
    expect(plans[0]?.join(' ')).toMatch(/automation_occurrence_task .*<expr>=\?/)
    expect(plans[0]?.join(' ')).toMatch(/automation_notice_occurrence .*<expr>=\?/)
    plans.length = 0
    const queue = await listConversationQueue(f.store, { id: 'direct', employeeTaskId: 't' } as Conversation)
    expect(queue.items).toEqual([{ id: '7', conversationId: 'direct', revision: 2, content: 'original prompt', createdAt: time, attachmentCount: 0 }])
    expect(plans).toHaveLength(1)
    expect(plans[0]?.join(' ')).toMatch(/automation_occurrence_task .*<expr>=\?/)
  } finally {
    inspection.mockRestore()
  }
})

it('reads persisted active history with the same occurrence states used by the task controls', async () => {
  const f = await fixture()
  const rows = AUTOMATION_OCCURRENCE_STATUSES.map(status => ({ id: status, status, startedAt: time }))
  await f.store.write(rows.map(row => record('automationOccurrences', row)))
  const page = await f.store.automationHistory({ status: 'active', limit: rows.length })
  const expected = ['admitted', 'cancelling', 'queued', 'running', 'waiting_approval', 'waiting_user', 'waiting_work']
  expect(rows.filter(row => isOngoingOccurrence(row.status)).map(row => row.id).sort()).toEqual(expected)
  expect(page.occurrences.map(row => row.id).sort()).toEqual(expected)
  expect(isOngoingOccurrence(undefined)).toBe(false)
})

it('finds older live executions before LIMIT and independently of the card display status after restart', async () => {
  const f = await fixture(), actor: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'direct', messageId: 'question' }
  await f.store.write([
    record('agentTasks', task('old-active', { kind: 'assignment', status: 'done', latestOccurrenceId: 'queued-next' })),
    ...Array.from({ length: 45 }, (_, index) => record('agentTasks', task(`new-${index}`, { kind: 'assignment', updatedAt: '2026-11-05T01:00:00.000Z' }))),
    ...['running', 'queued'].map((status, index) => record('automationOccurrences', { id: index ? 'queued-next' : 'running-first', taskId: 'old-active', status, plan: { employeeIds: ['a'] }, startedAt: time } as any)),
  ])
  const first = await readTaskActivity(f.store, { activeOnly: true, limit: 1 }, actor)
  expect(first.items).toHaveLength(1); expect(first.items[0]).toMatchObject({ id: 'old-active', status: 'done' })
  expect(first.items[0].activeExecutions.map(item => item.status).sort()).toEqual(['queued', 'running'])
  expect(first.nextCursor).toBeUndefined()
  expect((await f.page({ activeOnly: true, limit: 1 }, actor)).items[0].id).toBe('old-active')
  const recent = await readTaskActivity(f.store, { limit: 2 }, actor)
  expect(recent.items).toHaveLength(2); expect(recent.nextCursor).toBeTruthy()
  await expect(readTaskActivity(f.store, { activeOnly: true, cursor: recent.nextCursor }, actor)).rejects.toThrow('游标')
  await f.reopen()
  expect((await readTaskActivity(f.store, { activeOnly: true, taskId: 'old-active' }, actor)).items[0].activeExecutions).toEqual(first.items[0].activeExecutions)
})

it('filters internal progress before Kanban pagination and binds cursors to that boundary', async () => {
  const f = await fixture()
  const assignments = [task('a-explicit', { kind: 'assignment' }), task('b-manual', { sourceKind: 'manual' }), task('c-message', { sourceKind: 'message' })]
  const internal = Array.from({ length: 45 }, (_, index) => task(`z-progress-${index}`, { kind: 'progress' }))
  const legacy = [task('z-legacy'), task('z-fake-source', { kind: 'progress', sourceKind: 'manual' }), task('z-schedule', { sourceKind: 'schedule' })]
  await f.store.write([...assignments, ...internal, ...legacy].map(value => record('agentTasks', value)))
  const board = (cursor?: string) => readTaskPage(f.store, { agentId: 'a', limit: 2, cursor }, { kind: 'owner' }, 'assignments')
  const first = await board()
  expect(first.items.map(item => item.id)).toEqual(['c-message', 'b-manual'])
  // Captured before the task read model moved out of application operations.
  const legacyCursor = Buffer.from(JSON.stringify({
    version: 1, key: '7b99d93e68a40bcbf6294428aec7f4ce17cfccf33a6f24856ed7270a880c188e',
    updatedAt: time, id: 'b-manual',
  })).toString('base64url')
  expect(first.nextCursor).toBe(legacyCursor)
  const second = await board(legacyCursor)
  expect(second.items.map(item => item.id)).toEqual(['a-explicit'])
  expect(second.nextCursor).toBeUndefined()
  expect((await f.page({ includeDone: true, limit: 100 })).items).toHaveLength(51)
  expect(await f.call('tasks.page', { agentId: 'a', limit: 2, cursor: first.nextCursor })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(isEmployeeTaskAssignment(legacy[1])).toBe(false)
  await f.reopen()
  expect((await readTaskPage(f.store, { agentId: 'a', limit: 100 }, { kind: 'owner' }, 'assignments')).items).toHaveLength(3)
})

it('marks agent-created records as internal progress and rejects assignment promotion', async () => {
  const f = await fixture()
  await f.store.write([record('messages', { id: 'progress-message' })])
  const actor: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'direct', messageId: 'progress-message' }
  const created = await f.call('tasks.create', { agentId: 'a', title: 'Agent自己拆解的步骤', steps: [{ title: '定位CSS', done: false }] }, actor)
  expect(created).toMatchObject({ status: 'succeeded', data: { kind: 'progress', status: 'pending' } })
  const progress = created.data as TrackedTask
  expect(await f.call('tasks.update', { id: progress.id, expectedRevision: progress.revision, kind: 'assignment' }, actor)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await f.call('tasks.create', { agentId: 'a', title: '伪造委派', kind: 'assignment', sourceKind: 'manual' }, actor)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await f.call('tasks.update', { id: progress.id, expectedRevision: progress.revision, status: 'done' }, actor)).toMatchObject({ status: 'succeeded', data: { kind: 'progress', status: 'done' } })
  expect((await readTaskPage(f.store, { agentId: 'a', includeDone: true }, { kind: 'owner' }, 'assignments')).items).toEqual([])
  expect(await f.call('tasks.get', { id: progress.id }, actor)).toMatchObject({ status: 'succeeded', data: { id: progress.id, kind: 'progress' } })
})

it('keeps original create/update/list/get/delete receipts and treats done only as recorded progress', async () => {
  const f = await fixture()
  const created = await f.call('tasks.create', { agentId: 'a', conversationId: 'direct', title: '核对合同', steps: [{ title: '阅读原件', done: false }] })
  expect(created.status).toBe('succeeded'); const original = created.data as TrackedTask
  expect((await f.page()).items[0]).toMatchObject({ id: original.id, status: 'pending', stepCount: 1, nextStepTitle: '阅读原件' })
  expect(await f.call('tasks.update', { id: original.id, expectedRevision: 1, status: 'done' })).toMatchObject({ status: 'succeeded', data: { revision: 2, status: 'done' } })
  expect((await f.page()).items).toEqual([])
  const done = await f.page({ status: 'done' }); expect(done.items[0]).toMatchObject({ status: 'done', completedStepCount: 0, nextStepTitle: '阅读原件' })
  expect(done.items[0]).not.toHaveProperty('artifactIds'); expect(done.items[0]).not.toHaveProperty('accepted')
  expect(await f.call('tasks.list', { agentId: 'a', includeDone: true })).toMatchObject({ status: 'succeeded', data: [{ id: original.id, status: 'done' }] })
  expect(await f.call('tasks.get', { id: original.id })).toMatchObject({ status: 'succeeded', data: { steps: original.steps } })
  expect(await f.call('tasks.delete', { id: original.id, expectedRevision: 2 })).toMatchObject({ status: 'succeeded', data: { deleted: true } })
  expect((await f.page({ includeDone: true })).items).toEqual([])
})

it('pages equal timestamps deterministically and resumes the same cursor after reopening', async () => {
  const f = await fixture(), ids = Array.from({ length: 11 }, (_, i) => `task-${String(i).padStart(2, '0')}`)
  await f.store.write(ids.map(id => record('agentTasks', task(id))))
  const first = await f.page({ limit: 3 }); expect(first.items.map(t => t.id)).toEqual([...ids].reverse().slice(0, 3))
  await f.reopen()
  await f.store.write([record('agentTasks', task('newest', { updatedAt: '2026-10-23T00:00:00.000Z' }))])
  const seen = first.items.map(t => t.id); let cursor = first.nextCursor
  while (cursor) { const next = await f.page({ limit: 2, cursor }); seen.push(...next.items.map(t => t.id)); cursor = next.nextCursor }
  expect(seen).toEqual([...ids].reverse()); expect(new Set(seen).size).toBe(ids.length)
  expect((await f.page({ limit: 1 })).items[0].id).toBe('newest')
})

it('filters hidden/merged/cleaning/missing/member-revoked sources before applying LIMIT', async () => {
  const f = await fixture()
  await f.store.write([record('conversations', room('hidden', { list: { hidden: true } })), record('conversations', room('cleaning')), record('conversationCleanup', { id: 'cleaning' }), record('conversations', room('removed', { agentIds: ['b'] })), record('conversations', room('merged', { mergedInto: 'direct' }))])
  const invalid = ['hidden', 'cleaning', 'removed', 'merged', 'missing'].flatMap(source => Array.from({ length: 30 }, (_, i) => task(`${source}-${i}`, { conversationId: source, updatedAt: '2030-01-01T00:00:00.000Z' })))
  invalid.push(task('no-employee', { agentId: 'missing', conversationId: undefined }))
  await f.store.write([...invalid, task('good-1'), task('good-2'), task('done', { status: 'done' })].map(t => record('agentTasks', t)))
  const page = await f.page({ limit: 2 }); expect(page.items.map(t => t.id)).toEqual(['good-2', 'good-1']); expect(page.nextCursor).toBeUndefined()
  expect((await f.page({ status: 'done' })).items.map(t => t.id)).toEqual(['done'])
})

it('keeps employee/direct/group/channel and conversation-memory boundaries on every page', async () => {
  const f = await fixture()
  await f.store.write([record('conversations', room('group', { kind: 'group' })), record('conversations', room('channel', { channel: { platform: 'telegram' } })), record('conversations', room('exclusive', { memoryScope: 'conversation' })), record('conversations', room('b-direct', { agentIds: ['b'] }))])
  const records = [task('current'), task('cross-direct', { conversationId: 'other' }), task('unscoped', { conversationId: undefined }), task('group', { conversationId: 'group' }), task('channel', { conversationId: 'channel' }), task('exclusive', { conversationId: 'exclusive' }), task('foreign', { agentId: 'b', conversationId: 'b-direct' })]
  await f.store.write(records.map(t => record('agentTasks', t)))
  const employee: ApplicationActor = { kind: 'employee', employeeId: 'a', conversationId: 'direct', messageId: 'message' }
  expect((await f.page({}, employee)).items.map(t => t.id).sort()).toEqual(['cross-direct', 'current', 'unscoped'])
  expect((await f.page({}, { ...employee, conversationId: 'group' })).items.map(t => t.id)).toEqual(['group'])
  expect((await f.page({}, { kind: 'behavior', employeeId: 'a', conversationId: 'direct', behaviorRunId: 'behavior' })).items.map(t => t.id).sort()).toEqual(['cross-direct', 'current', 'unscoped'])
  expect(await f.call('tasks.page', { agentId: 'b' }, employee)).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } })
  expect((await f.page({ agentId: 'b' })).items.map(t => t.id)).toEqual(['foreign'])
  await f.store.write([record('conversations', room('direct', { agentIds: ['b'] }))])
  expect((await f.page({}, employee)).items).toEqual([])
})

it('rechecks source visibility and membership after a cursor was issued', async () => {
  const f = await fixture()
  await f.store.write([task('c-top'), task('b-hide', { conversationId: 'other' }), task('a-last')].map(t => record('agentTasks', t)))
  const first = await f.page({ limit: 1 }); expect(first.items[0].id).toBe('c-top')
  await f.store.write([record('conversations', room('other', { list: { hidden: true } }))])
  expect((await f.page({ limit: 1, cursor: first.nextCursor })).items.map(t => t.id)).toEqual(['a-last'])
  await f.store.write([record('conversations', room('other')), record('conversations', room('direct', { agentIds: ['b'] }))])
  expect((await f.page({ limit: 1, cursor: first.nextCursor })).items.map(t => t.id)).toEqual(['b-hide'])
})

it('rejects malformed or cross-filter/cross-viewer cursors and injected viewer fields', async () => {
  const f = await fixture(); await f.store.write([record('agentTasks', task('a')), record('agentTasks', task('b'))])
  const first = await f.page({ limit: 1 }); expect(first.nextCursor).toBeTruthy()
  for (const input of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: 'bad' }, { cursor: first.nextCursor, status: 'done' }, { cursor: first.nextCursor, conversationId: 'other' }, { cursor: first.nextCursor, agentId: 'b' }, { viewer: { employeeId: 'b' } }]) expect(await f.call('tasks.page', input)).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
  expect(await f.call('tasks.page', { cursor: first.nextCursor }, { kind: 'employee', employeeId: 'a', conversationId: 'direct', messageId: 'message' })).toMatchObject({ status: 'rejected', error: { code: 'INVALID_INPUT' } })
})

it('returns bounded note/step projections while original full records remain available', async () => {
  const f = await fixture(), note = 'N'.repeat(4000), steps = Array.from({ length: 50 }, (_, i) => ({ title: `${i}:` + 'S'.repeat(290), done: i < 17 }))
  await f.store.write([record('agentTasks', task('large', { note, steps, status: 'in_review' }))])
  const page = await f.page(), item = page.items[0]
  expect(item).toMatchObject({ status: 'in_review', stepCount: 50, completedStepCount: 17, nextStepTitle: steps[17].title, noteExcerpt: note.slice(0, TASK_PAGE_LIMITS.noteCharacters), noteTruncated: true })
  expect(item).not.toHaveProperty('steps'); expect(item).not.toHaveProperty('note'); expect(JSON.stringify(item).length).toBeLessThan(2500)
  expect(await f.call('tasks.get', { id: item.id })).toMatchObject({ status: 'succeeded', data: { note, steps } })
})

it('enforces default/maximum pages and does not include ordinary Work or plans as tasks', async () => {
  const f = await fixture()
  await f.store.write([...Array.from({ length: 103 }, (_, i) => record('agentTasks', task(`task-${String(i).padStart(3, '0')}`))), record('workItems', { id: 'not-a-task' }), record(planCollection, { id: 'not-a-task' })])
  expect((await f.page()).items).toHaveLength(TASK_PAGE_LIMITS.page)
  const first = await f.page({ limit: 100 }); expect(first.items).toHaveLength(100)
  const last = await f.page({ limit: 100, cursor: first.nextCursor }); expect(last.items).toHaveLength(3); expect(last.nextCursor).toBeUndefined()
  expect([...first.items, ...last.items].some(t => t.id === 'not-a-task')).toBe(false)
})

it('leaves task revisions, receipts, execution and source records unchanged across reads', async () => {
  const f = await fixture(); await f.call('tasks.create', { agentId: 'a', conversationId: 'direct', title: '只登记' })
  const collections = ['agentTasks', 'applicationOperations', 'runs', 'workItems', 'automations', 'conversations']
  const before = await Promise.all(collections.map(c => f.store.load(c)))
  await f.page(); await f.page({ agentId: 'a', conversationId: 'direct', includeDone: true })
  expect(await Promise.all(collections.map(c => f.store.load(c)))).toEqual(before)
})
