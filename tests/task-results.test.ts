/*
 * [OUTPUT]: 桌面任务结果Dialog已退役，保留只读服务/CLI数据及原文件核验回归。
 * [INPUT]: Real ProductStore/managed files, original Work continuation preflight and owner transport catalog.
 * [OUTPUT]: Result identity, revocation, file bytes, bounded history and zero business writes regression sources.
 * [POS]: Workspace task-result increment; no provider or GUI.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type { AgentRun, Conversation, Message, WorkItem } from '../packages/shared/src/domain'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { TaskResultRepository, projectRunCancellation } from '../packages/runtime/src/modules/collaboration/task-result-repository'
import { ArtifactRepository } from '../packages/runtime/src/modules/workspaces/artifact-repository'
import { WorkRepository } from '../packages/runtime/src/modules/collaboration/work-repository'
import { newWorkBudget } from '../packages/runtime/src/modules/collaboration/work-budget'
import { TASK_RESULT_LIMITS } from '../packages/shared/src/domain/task-results'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const time = '2026-10-25T00:00:00.000Z'
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const room: Conversation = { id: 'room', kind: 'direct', title: '原聊天', agentIds: ['alice'], mode: 'natural', workspacePath: '/unused', sharedKnowledgeIds: [], createdAt: time, updatedAt: time }
const source: Message = { id: 'source', conversationId: 'room', senderType: 'user', senderId: 'user', senderName: '本人', content: '分析数据', status: 'completed', createdAt: time, sequence: 1 }
const work: WorkItem = { id: 'work', schemaVersion: 2, conversationId: 'room', sourceMessageId: 'source', key: 'key', scope: '分析数据', deliverable: '结论', ownerAgentId: 'alice', version: 1, status: 'delivered', budgetId: 'budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: ['answer'], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: time, updatedAt: time }
function run(id = 'run', patch: Partial<AgentRun> = {}): AgentRun { return { id, conversationId: 'room', agentId: 'alice', agentName: 'Alice', triggerMessageId: 'source', messageId: 'answer', workId: 'work', status: 'failed', phase: 'execution', createdAt: time, toolEvents: [], ...patch } }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-result-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'product.sqlite')); await store.init(); cleanups.push(() => store.close())
  await store.write([row('conversations', room), row('agents', { id: 'alice', name: 'Alice', active: true }), row('messages', source), row('messages', { ...source, id: 'answer', senderType: 'agent', senderId: 'alice', content: '结论为42', sequence: 2 }), row('workItems', work), row('runs', run())])
  const artifacts = new ArtifactRepository(store, root), works = new WorkRepository(store)
  const rejected = new Set<string>()
  const repository = new TaskResultRepository(store, { work: async () => undefined, message: async (_, message) => { if (rejected.has(message.id)) throw new Error('撤权') }, run: async (_, run) => { if (rejected.has(run.id)) throw new Error('撤权') }, artifact: async (tx, artifact) => { if (rejected.has(artifact.id)) throw new Error('撤权'); await artifacts.inspectCurrentArtifact(tx, artifact.id, artifact.contentHash) }, continuation: async () => ({ state: 'not_applicable' }) })
  return { root, store, artifacts, works, repository, rejected }
}
it('文字交付不声称存在文件，结果查询不创建任务、回执或改变持久记录', async () => {
  const { store, repository } = await fixture()
  const collections = ['workItems', 'runs', 'messages', 'artifacts', 'requests', 'messageReceipts', 'workViewClock']
  const before = await Promise.all(collections.map(name => store.load(name)))
  const result = await repository.read('work')
  expect(result.work.status).toBe('delivered'); expect(result.files).toEqual({ items: [], total: 0, truncated: false })
  expect(result.messages.items[0]).toMatchObject({ id: 'answer', excerpt: '结论为42', status: 'available' })
  expect(await Promise.all(collections.map(name => store.load(name)))).toEqual(before)
})
it('文件必须按原hash实际核读；读取不把搬移后的path写回；外改/缺失/撤权均不可用', async () => {
  const { root, store, artifacts, repository, rejected } = await fixture()
  const file = join(root, 'workspaces/room/artifacts/result/report.md'), content = '# 真实结果', hash = createHash('sha256').update(content).digest('hex')
  await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, content)
  await store.transaction(tx => artifacts.register(tx, { id: 'artifact', name: 'report.md', path: file, size: Buffer.byteLength(content), ownerAgentId: 'alice', contentHash: hash }, { conversationId: 'room', sourceMessageId: 'answer', sourceWorkId: 'work', revisionRequestId: null }))
  await store.write([row('workItems', { ...work, artifactIds: ['artifact'] })])
  const original = await store.get<Record<string, unknown> & { id: string }>('artifacts', 'artifact')
  await store.write([row('artifacts', { ...original!, path: '/obsolete/path' })])
  expect((await repository.read('work')).files.items[0]).toMatchObject({ id: 'artifact', name: 'report.md', status: 'available', contentHash: hash })
  expect((await store.get<typeof original>('artifacts', 'artifact'))?.path).toBe('/obsolete/path')
  rejected.add('artifact'); expect((await repository.read('work')).files.items[0]).toEqual({ id: 'artifact', status: 'unavailable', reason: '文件缺失、内容已变化或原来源授权失效' }); rejected.clear()
  await writeFile(file, '外部修改'); expect((await repository.read('work')).files.items[0].status).toBe('unavailable')
  await rm(file); expect((await repository.read('work')).files.items[0].status).toBe('unavailable')
  expect((await store.get<typeof original>('artifacts', 'artifact'))?.contentHash).toBe(hash)
})
it.each(['hidden', 'cleanup', 'member', 'source'] as const)('来源变更拒绝整个结果，不恢复聊天：%s', async kind => {
  const { store, repository, rejected } = await fixture()
  if (kind === 'hidden') await store.write([row('conversations', { ...room, list: { hidden: true } })])
  if (kind === 'cleanup') await store.write([row('conversationCleanup', { id: 'room' })])
  if (kind === 'member') await store.write([row('conversations', { ...room, agentIds: [] })])
  if (kind === 'source') rejected.add('source')
  await expect(repository.read('work')).rejects.toThrow()
})
it('结果消息错员工/会话或撤权只返回不可用；Run不泄露工具参数或私有草稿', async () => {
  const { store, repository, rejected } = await fixture()
  await store.write([row('messages', { ...source, id: 'answer', senderType: 'agent', senderId: 'other', content: '私有内容' }), row('runs', run('run', { error: '真实错误', toolEvents: [{ id: 'tool', name: 'write', status: 'completed', detail: '私有详情', input: '秘密参数', createdAt: time }] }))])
  const result = await repository.read('work')
  expect(result.messages.items[0]).toMatchObject({ status: 'unavailable' }); expect(JSON.stringify(result)).not.toContain('私有内容')
  expect(result.runs.items[0].toolCounts).toEqual({ completed: 1, failed: 0, running: 0 }); expect(JSON.stringify(result)).not.toContain('秘密参数')
  rejected.add('run'); const redacted = await repository.read('work'); expect(redacted.runs.items).toEqual([]); expect(redacted.runs.unavailable).toBe(1); expect(JSON.stringify(redacted)).not.toContain('真实错误')
})
it('有界最新Run和结果消息显式截断，错Work/会话/员工不进入记录', async () => {
  const { store, repository } = await fixture()
  const ids = Array.from({ length: TASK_RESULT_LIMITS.messages + 1 }, (_, i) => `answer-${i}`)
  await store.write([row('workItems', { ...work, resultMessageIds: ids }), ...ids.map((id, i) => row('messages', { ...source, id, senderType: 'agent', senderId: 'alice', sequence: i + 2, content: '文'.repeat(2001) })), ...Array.from({ length: 22 }, (_, i) => row('runs', run(`run-${String(i).padStart(2, '0')}`))), row('runs', run('foreign', { conversationId: 'other' })), row('runs', run('wrong-owner', { agentId: 'other' }))])
  const result = await repository.read('work')
  expect(result.runs.total).toBe(23); expect(result.runs.items).toHaveLength(20); expect(result.runs.truncated).toBe(true)
  expect(result.runs.items.some(item => ['foreign', 'wrong-owner'].includes(item.id))).toBe(false)
  expect(result.messages.total).toBe(21); expect(result.messages.items).toHaveLength(20); expect(result.messages.truncated).toBe(true)
  expect(result.messages.items[0]).toMatchObject({ id: 'answer-20', truncated: true }); expect(result.messages.items[0].excerpt).toHaveLength(2000)
})
it('继续只读检查复用未知副作用/预算门禁，零持久重试和状态修改', async () => {
  const { store, works } = await fixture()
  const ended = { ...work, status: 'failed' as const, requiresReview: true }
  const budget = { ...newWorkBudget('budget'), deadlineAt: '2020-01-01T00:00:00.000Z' }
  await store.write([row('workItems', ended), row('workBudgets', budget), row('workExecutions', { id: 'run', workId: 'work', status: 'released', pendingEffects: 1 })])
  await expect(store.transaction(tx => works.checkRetry(tx, ended, 'alice', true))).rejects.toThrow('核对')
  await store.write([row('workExecutions', { id: 'run', workId: 'work', status: 'released', pendingEffects: 0 })])
  await store.transaction(tx => works.checkRetry(tx, ended, 'alice', true))
  expect(await store.get('workItems', 'work')).toEqual(ended); expect(await store.get('workBudgets', 'budget')).toEqual(budget)
})
it('终态仍有执行器/未应用取消/丢失冻结Run时，不声称已停止', () => {
  const stopped = run(); const lookup = (id: string) => id === stopped.id ? stopped : undefined
  expect(projectRunCancellation(stopped, lookup, new Set(['run'])).state).toBe('stopping')
  expect(projectRunCancellation({ ...stopped, cancellation: { requestedAt: time, runIds: ['run'], workIds: [], participants: [] } }, lookup, new Set()).state).toBe('unknown')
  expect(projectRunCancellation({ ...stopped, cancellation: { requestedAt: time, appliedAt: time, runIds: ['missing'], workIds: [], participants: [] } }, lookup, new Set()).state).toBe('unknown')
  expect(projectRunCancellation(stopped, lookup, new Set()).state).toBe('stopped')
})

it('同Work展示窗口外的旧资源撤权阻断继续，即使最新来源有效且副作用已全部确认', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-task-result-service-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  let calls = 0
  const create = () => new AppService({ dataPath: root, skillDiscovery: { homeDir: root }, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {}, engine: { test: async () => '', decide: async () => { calls++; throw new Error('结果读取不得调用模型') }, run: async () => { calls++; throw new Error('结果读取不得执行任务') } } })
  let app = create(); await app.init()
  const snapshot = await app.handle('snapshot', undefined) as import('../packages/shared/src/domain').Snapshot
  const agent = snapshot.agents.find(value => value.id === 'researcher')!
  const conversation = await app.handle('createConversation', { kind: 'group', title: '任务结果核源', agentIds: [agent.id] }) as Conversation
  await app.close()
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init()
  const ended: WorkItem = { ...work, conversationId: conversation.id, ownerAgentId: agent.id, status: 'failed', requiresReview: true, artifactIds: [], resultMessageIds: [] }
  const previous = Array.from({ length: 25 }, (_, index) => run(`source-run-${String(index).padStart(2, '0')}`, { conversationId: conversation.id, agentId: agent.id, createdAt: new Date(Date.parse(time) + index * 1000).toISOString(), messageId: '', finishedAt: time }))
  await store.write([row('messages', { ...source, conversationId: conversation.id }), row('workItems', ended), row('workBudgets', newWorkBudget(ended.budgetId)), row('workExecutions', { id: 'confirmed', workId: ended.id, status: 'released', pendingEffects: 0 }), ...previous.flatMap(value => [row('runs', value), row('snapshots', { id: value.id, agent, conversation, resources: [], materialRefs: [] })])])
  await store.close(); app = create(); cleanups.push(() => app.close()); await app.init()
  const before = await app.handle('getTaskResult', { workId: ended.id }) as import('../packages/shared/src/domain/task-results').TaskResult
  expect(before.runs.items).toHaveLength(20); expect(before.runs.total).toBe(25); expect(before.continuation.state).toBe('available')
  const authority = (app as unknown as { store: ProductStore }).store
  await authority.write([row('snapshots', { id: previous[0].id, agent, conversation, resources: [{ id: 'revoked-old-resource' }], materialRefs: [] })])
  const after = await app.handle('getTaskResult', { workId: ended.id }) as import('../packages/shared/src/domain/task-results').TaskResult
  expect(after.runs.items.map(item => item.id)).not.toContain(previous[0].id)
  expect(after.continuation).toMatchObject({ state: 'review_required', runId: previous.at(-1)!.id, reason: '原执行来源或资源已失效，请核对已有结果' })
  expect(await authority.get('workItems', ended.id)).toEqual(ended); expect(calls).toBe(0)
})
