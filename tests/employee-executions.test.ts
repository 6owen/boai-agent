/*
 * [OUTPUT]: 单次运行判断失败及全部阶段在分页前保留；普通历史不混入成功的内部判断。
 * [OUTPUT]: 主聊普通/定时执行合并分页，精确原身份和发布/成员/清理边界回归。
 * [OUTPUT]: 定时记录按持久occurrence和会话身份在分页前筛选；相邻运行、缺失身份和隐藏来源不可混入。
 * [INPUT]: 隔离SQLite内的员工/成员/原消息/运行与冻结配置。
 * [OUTPUT]: 执行读取按当前成员和未清理来源前置过滤，稳定分页、历史配置不随换绑改变，秘密/提示/工具正文不进入清单，零业务写入。
 * [POS]: 员工执行详情读取的业务边界模块验证；不启动Agent或E2E。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore, type StoredRecord } from '../packages/runtime/src/adapters/storage/product-store'
import { EMPLOYEE_EXECUTION_LIMITS } from '../packages/shared/src/domain/employee-executions'

const fixtures: { store: ProductStore; root: string }[] = []
afterEach(async () => { for (const { store, root } of fixtures.splice(0)) { await store.close(); await rm(root, { recursive: true, force: true }) } })
const record = (collection: string, id: string, value: object): StoredRecord => ({ collection, id, value: { id, ...value } })
async function fixture(count = 1) {
  const root = await mkdtemp(join(tmpdir(), 'boai-employee-executions-')), store = new ProductStore(join(root, 'product.sqlite'))
  await store.init(); fixtures.push({ store, root })
  await store.write([record('agents', 'employee', { name: '编辑', executionBackend: { kind: 'mastra-model' } }), record('conversations', 'chat', { title: '编辑部', agentIds: ['employee'] }), record('messages', 'request', { conversationId: 'chat', content: '原工作' }), ...Array.from({ length: count }, (_, index) => {
    const id = `run-${String(index).padStart(3, '0')}`
    return record('runs', id, { agentId: 'employee', agentName: '编辑', conversationId: 'chat', triggerMessageId: 'request', status: 'completed', createdAt: '2026-10-10T00:00:00.000Z', toolEvents: [{ id: 'tool', detail: 'private-tool-body' }], draft: { text: 'private-draft' } })
  }), record('snapshots', 'run-000', { agent: { executionBackend: { kind: 'codex-local', profileId: 'codex' }, modelId: '', configVersion: 7, instructions: 'private-instructions' }, runtimeProfile: { id: 'codex', name: '原执行能力', revision: 2, verified: { version: '0.161.0' } }, apiKey: 'private-secret' })])
  return store
}
it('reads the frozen engine after employee rebinding, without leaking private configuration or list bodies', async () => {
  const store = await fixture()
  await store.write([record('runs', 'run-000', { agentId: 'employee', agentName: '编辑', conversationId: 'chat', triggerMessageId: 'request', status: 'completed', createdAt: '2026-10-10T00:00:00.000Z', backend: { kind: 'codex-local', modelId: 'actual-default' }, toolEvents: [], draft: { text: 'private-draft' } })])
  const before = await store.load('runs')
  const [item] = await store.queryEmployeeExecutions({ agentId: 'employee' })
  expect(item.configuration).toEqual({ kind: 'codex-local', label: '原执行能力', modelId: 'actual-default', configVersion: 7, profileId: 'codex', profileRevision: 2, programVersion: '0.161.0' })
  expect(JSON.stringify(item)).not.toMatch(/private-secret|private-instructions|private-draft|private-tool-body/)
  expect(item.run).not.toHaveProperty('toolEvents')
  expect(await store.load('runs')).toEqual(before)
})
it('paginates tied timestamps by fixed run identity without duplicates or an unbounded history response', async () => {
  const store = await fixture(EMPLOYEE_EXECUTION_LIMITS.pageSize + 3)
  const first = await store.queryEmployeeExecutions({ agentId: 'employee' })
  expect(first).toHaveLength(EMPLOYEE_EXECUTION_LIMITS.pageSize + 1)
  const last = first[EMPLOYEE_EXECUTION_LIMITS.pageSize - 1]
  const next = await store.queryEmployeeExecutions({ agentId: 'employee', cursor: { id: last.run.id, createdAt: last.run.createdAt } })
  expect(next).toHaveLength(3)
  expect(new Set([...first.slice(0, EMPLOYEE_EXECUTION_LIMITS.pageSize), ...next].map(item => item.run.id)).size).toBe(23)
})
it.each(['member-removed', 'employee-removed', 'source-removed', 'source-moved', 'conversation-hidden', 'cleanup-pending'])('refuses lists and fixed detail after %s', async change => {
  const store = await fixture()
  if (change === 'member-removed') await store.write([record('conversations', 'chat', { title: '编辑部', agentIds: ['other'] })])
  if (change === 'employee-removed') await store.write([], [{ collection: 'agents', id: 'employee' }])
  if (change === 'source-removed') await store.write([], [{ collection: 'messages', id: 'request' }])
  if (change === 'source-moved') await store.write([record('messages', 'request', { conversationId: 'other' })])
  if (change === 'conversation-hidden') await store.write([record('conversations', 'chat', { title: '编辑部', agentIds: ['employee'], list: { hidden: true } })])
  if (change === 'cleanup-pending') await store.write([record('conversationCleanup', 'chat', {})])
  expect(await store.queryEmployeeExecutions({ agentId: 'employee' })).toEqual([])
  expect(await store.queryEmployeeExecutions({ agentId: 'employee' }, 'run-000')).toEqual([])
})
it('does not borrow current employee configuration for a run without a frozen snapshot', async () => {
  const store = await fixture(2)
  const [item] = await store.queryEmployeeExecutions({ agentId: 'employee' }, 'run-001')
  expect(item.configuration).toEqual({ kind: 'unknown', label: '执行配置尚未记录', modelId: '' })
})

it('filters an occurrence before paging even when newer runs share the same conversation', async () => {
  const store = await fixture(60)
  const ids = Array.from({ length: 25 }, (_, i) => `run-${String(i).padStart(3, '0')}`)
  await store.write([record('automationOccurrences', 'selected', { conversationId: 'chat', runIds: ids }), record('automationOccurrences', 'wrong-room', { conversationId: 'other', runIds: ids })])
  const first = await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'selected' })
  expect(first).toHaveLength(21)
  expect(first.map(item => item.run.id)).toEqual([...ids].reverse().slice(0, 21))
  const last = first[19].run
  const next = await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'selected', before: { id: last.id, createdAt: last.createdAt } })
  expect([...first.slice(0, 20), ...next].map(item => item.run.id)).toEqual([...ids].reverse())
  expect(await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'missing' })).toEqual([])
  expect(await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'wrong-room' })).toEqual([])
  expect((await store.queryExecutionHistory({ conversationId: 'chat' }))[0].run.id).toBe('run-059')
  await store.write([record('conversations', 'chat', { agentIds: ['employee'], list: { hidden: true } })])
  expect(await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'selected' })).toEqual([])
})

async function publishedHistory(count = 25) {
  const store = await fixture(count)
  await store.write([
    record('conversations', 'chat', { purpose: 'automation', automationId: 'plan', occurrenceId: 'occurrence', agentIds: ['employee'] }),
    record('conversations', 'main', { agentIds: ['employee'] }),
    record('messages', 'published', { conversationId: 'main', automationPublication: { automationId: 'plan', occurrenceId: 'occurrence', sourceConversationId: 'chat', sourceMessageId: 'request' } }),
    record('messages', 'ordinary-request', { conversationId: 'main', content: '普通请求' }),
    record('runs', 'ordinary', { agentId: 'employee', conversationId: 'main', triggerMessageId: 'ordinary-request', status: 'completed', createdAt: '2026-10-11T00:00:00.000Z' }),
  ])
  return store
}

it('includes every owned phase in occurrence details and keeps failed decisions in ordinary history', async () => {
  const store = await fixture(0)
  const phases = ['decision', 'coordination', 'memory', 'execution'] as const
  const runs = Array.from({ length: 25 }, (_, i) => record('runs', `phase-${String(i).padStart(2, '0')}`, { agentId: 'employee', conversationId: 'chat', triggerMessageId: 'request', phase: phases[i % phases.length], status: i === 24 ? 'failed' : 'completed', error: i === 24 ? 'getaddrinfo ENOTFOUND api.deepseek.com' : undefined, createdAt: '2026-10-26T01:00:06Z' }))
  await store.write([...runs, record('automationOccurrences', 'selected', { conversationId: 'chat', runIds: runs.map(run => run.id) })])
  const first = await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'selected' })
  expect(first).toHaveLength(21)
  expect(first[0].run).toMatchObject({ id: 'phase-24', phase: 'decision', error: 'getaddrinfo ENOTFOUND api.deepseek.com' })
  const last = first[19].run
  const next = await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'selected', before: { createdAt: last.createdAt, id: last.id } })
  expect([...first.slice(0, 20), ...next].map(item => item.run.id)).toEqual(runs.map(run => run.id).reverse())
  const ordinary = await store.queryExecutionHistory({ conversationId: 'chat' })
  expect(ordinary.map(item => item.run.id)).toEqual(['phase-24', 'phase-23', 'phase-19', 'phase-15', 'phase-11', 'phase-07', 'phase-03'])
  expect(await store.queryExecutionHistory({ conversationId: 'chat', occurrenceId: 'unrelated' })).toEqual([])
})
it('pages ordinary and published scheduled runs together without copying their source identities', async () => {
  const store = await publishedHistory()
  const first = await store.queryExecutionHistory({ conversationId: 'main' })
  expect(first).toHaveLength(21)
  expect(first[0].run.id).toBe('ordinary')
  expect(first.slice(1).every(item => item.run.conversationId === 'chat' && item.run.triggerMessageId === 'request')).toBe(true)
  const last = first[19].run
  const next = await store.queryExecutionHistory({ conversationId: 'main', before: { id: last.id, createdAt: last.createdAt } })
  expect([...first.slice(0, 20), ...next].map(item => item.run.id)).toEqual(['ordinary', ...Array.from({ length: 25 }, (_, i) => `run-${String(24 - i).padStart(3, '0')}`)])
  expect(await store.queryExecutionHistory({ conversationId: 'main', agentId: 'other' })).toEqual([])
  expect(JSON.stringify(first)).not.toMatch(/private-tool-body|private-draft/)
})
it.each([
  ['missing publication', undefined, { collection: 'messages', id: 'published' }],
  ['wrong occurrence', record('messages', 'published', { conversationId: 'main', automationPublication: { automationId: 'plan', occurrenceId: 'other', sourceConversationId: 'chat', sourceMessageId: 'request' } })],
  ['unrelated publication', record('messages', 'published', { conversationId: 'elsewhere', automationPublication: { automationId: 'plan', occurrenceId: 'occurrence', sourceConversationId: 'chat', sourceMessageId: 'request' } })],
  ['source cleanup', record('conversationCleanup', 'chat', {})],
  ['target cleanup', record('conversationCleanup', 'main', {})],
  ['revoked member', record('conversations', 'main', { agentIds: [] })],
  ['hidden target', record('conversations', 'main', { agentIds: ['employee'], list: { hidden: true } })],
  ['hidden source', record('conversations', 'chat', { purpose: 'automation', automationId: 'plan', occurrenceId: 'occurrence', agentIds: ['employee'], list: { hidden: true } })],
  ['missing original', undefined, { collection: 'messages', id: 'request' }],
] as const)('does not expose scheduled history after %s', async (_label, updated, deleted?: { collection: string; id: string }) => {
  const store = await publishedHistory(1)
  await store.write(updated ? [updated] : [], deleted ? [deleted] : [])
  expect((await store.queryExecutionHistory({ conversationId: 'main' })).some(item => item.run.conversationId === 'chat')).toBe(false)
})
