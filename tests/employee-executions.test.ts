/*
 * [INPUT]: 隔离SQLite内的员工/成员/原消息/运行与冻结配置。
 * [OUTPUT]: 执行读取按当前成员和未清理来源前置过滤，稳定分页、历史配置不随换绑改变，秘密/提示/工具正文不进入清单，零业务写入。
 * [POS]: 员工执行详情读取的业务边界模块验证；不启动Agent或E2E。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore, type StoredRecord } from '../src/runtime/adapters/storage/product-store'
import { EMPLOYEE_EXECUTION_LIMITS } from '../src/shared/domain/employee-executions'

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
