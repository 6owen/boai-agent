/*
 * [INPUT]: Real temporary ProductStore Work/Run records and native receipt callbacks.
 * [OUTPUT]: H2 dormant preparation, bounded public group transfer, exact acceptance and source reuse checks.
 * [POS]: Context handoff host-service targeted acceptance; no models or visible windows.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentRun, Conversation, DigitalAgent, Message, WorkItem } from '../packages/shared/src/domain'
import type { HandoffPrepareInput } from '../packages/shared/src/domain/context-handoff'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ContextHandoffService, type HandoffHostHooks } from '../packages/runtime/src/modules/contexts/context-handoff-service'
import { HANDOFF_COLLECTION, type ContextHandoff } from '../packages/runtime/src/modules/contexts/context-handoff'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const when = '2026-11-07T00:00:00.000Z'
const employee = (id: string): DigitalAgent => ({ id, name: id, role: '', instructions: '', color: '', connectionId: 'connection', modelId: 'model', skillIds: [], knowledgeIds: [], allowBrowser: false, allowCommands: true, active: true, configVersion: 1 })
const room = (group: boolean): Conversation => ({ id: 'room', kind: group ? 'group' : 'direct', title: 'Work', agentIds: group ? ['a', 'b'] : ['a'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: when, updatedAt: when })
const message = (id: string, senderType: 'user' | 'agent', sequence: number): Message => ({ id, conversationId: 'room', senderType, senderId: senderType === 'user' ? 'owner' : 'a', senderName: 'Sender', content: senderType === 'user' ? '私有任务原始需求' : '可以交接的公开结果', sequence, status: 'completed', createdAt: when })
const work: WorkItem = { id: 'work', schemaVersion: 2, conversationId: 'room', sourceMessageId: 'request', key: 'work', scope: 'scope', deliverable: 'work', ownerAgentId: 'a', version: 1, status: 'delivered', budgetId: 'budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: ['result'], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: when, updatedAt: when }
const run: AgentRun = { id: 'source-run', conversationId: 'room', agentId: 'a', agentName: 'A', workId: 'work', triggerMessageId: 'request', messageId: 'result', status: 'completed', toolEvents: [], createdAt: when, finishedAt: when }
const preparation = (targetAgentId = 'a'): HandoffPrepareInput => ({ requestId: 'handoff-1', sourceWorkId: 'work', sourceRunId: 'source-run', targetAgentId, targetConversationId: 'room', reason: targetAgentId === 'a' ? 'context-rebuild' : 'employee-handoff', goal: '按已有结果继续工作' })
async function fixture(group = false) {
  const root = await mkdtemp(join(tmpdir(), 'boai-handoff-service-')), store = new ProductStore(join(root, 'data.sqlite'))
  await store.init(); cleanups.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  await store.write([
    ...['a', 'b'].map(id => ({ collection: 'agents', id, value: employee(id) })),
    { collection: 'conversations', id: 'room', value: room(group) },
    { collection: 'workItems', id: work.id, value: work }, { collection: 'runs', id: run.id, value: run },
    ...[message('request', 'user', 1), message('result', 'agent', 2)].map(value => ({ collection: 'messages', id: value.id, value })),
  ])
  const hooks: HandoffHostHooks = {
    target: vi.fn(async () => ({ providerId: 'native-test', configurationVersion: 'v1', workspace: '/project' })),
    assertIdle: vi.fn(async () => {}), message: vi.fn(async () => {}), work: vi.fn(async () => {}), run: vi.fn(async () => {}), artifact: vi.fn(async () => {}),
  }
  return { store, hooks, service: new ContextHandoffService(store, hooks) }
}
const nextRun = { agentId: 'a', conversationId: 'room', runId: 'new-run', currentInput: '继续讨论结果', consumePrepared: true }
const query = { agentId: 'a', conversationId: 'room' }

it('carries a completed API source into an explicit native run without creating work or changing employee identity', async () => {
  const { service, store, hooks } = await fixture()
  const prepared = await service.prepare(preparation())
  expect(prepared.status).toBe('prepared')
  expect(await store.load<AgentRun>('runs')).toEqual([run])
  expect((await store.load<AgentRun>('runs'))[0]?.backend).toBeUndefined()
  expect(await store.load<WorkItem>('workItems')).toEqual([work])
  const callbacks = (await service.forRun(nextRun))!
  expect(callbacks.payload).toContain('可以交接的公开结果')
  expect((await service.list(query))[0]?.status).toBe('prepared')
  await callbacks.prepare({ runId: nextRun.runId })
  expect(hooks.assertIdle).toHaveBeenCalledWith('room', 'new-run')
  await callbacks.bindSession('fresh-thread')
  expect((await service.list(query))[0]?.status).toBe('pending')
  await callbacks.accepted('fresh-thread', 'accepted-turn')
  const delivered = (await service.list(query))[0]!
  expect(delivered).toMatchObject({ status: 'delivered', target: { runId: 'new-run', nativeSessionId: 'fresh-thread' } })
  expect(delivered.source.agentId).toBe(delivered.target.agentId)
  expect(await service.forRun({ ...nextRun, runId: 'later-run' })).toBeUndefined()
  expect(await store.load<WorkItem>('workItems')).toEqual([work])
})
it('refuses a private cross-employee handoff and shares only public results from a common group', async () => {
  const privateFixture = await fixture()
  await expect(privateFixture.service.prepare(preparation('b'))).rejects.toThrow()
  const { service, store } = await fixture(true)
  await service.prepare(preparation('b'))
  const transfer = (await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]!
  expect(transfer.material?.entries.map(entry => entry.id)).toEqual(['result'])
  expect(JSON.parse(transfer.payload!)).toMatchObject({ source: { agentId: 'a', conversationId: 'room', taskId: 'work', runId: 'source-run' }, target: { agentId: 'b', conversationId: 'room' } })
  expect(transfer.payload).not.toContain('私有任务原始需求')
  const callbacks = (await service.forRun({ ...nextRun, agentId: 'b' }))!
  await callbacks.prepare({ runId: nextRun.runId }); await callbacks.bindSession('employee-b-session'); await callbacks.accepted('employee-b-session', 'employee-b-turn')
  expect((await service.list({ ...query, agentId: 'b' }))[0]).toMatchObject({ source: { agentId: 'a', runId: 'source-run' }, target: { agentId: 'b', nativeSessionId: 'employee-b-session' }, status: 'delivered' })
  expect(await store.load<WorkItem>('workItems')).toEqual([work])
  await store.write([{ collection: 'conversations', id: 'room', value: { ...room(true), agentIds: ['b'] } }])
  await expect(service.repository.read(transfer.id)).rejects.toThrow('原员工或会话')
})
it('checks source hashes and authorization again on later runs after successful delivery', async () => {
  const { service, store, hooks } = await fixture()
  await service.prepare(preparation())
  const callbacks = (await service.forRun(nextRun))!
  await callbacks.prepare({ runId: nextRun.runId }); await callbacks.bindSession('thread'); await callbacks.accepted('thread', 'turn')
  vi.mocked(hooks.message).mockRejectedValueOnce(new Error('来源授权已撤销'))
  await expect(service.forRun({ ...nextRun, runId: 'next' })).rejects.toThrow('授权已撤销')
  await store.write([{ collection: 'messages', id: 'result', value: { ...message('result', 'agent', 2), content: '撤回后另写' } }])
  await expect(service.forRun({ ...nextRun, runId: 'next' })).rejects.toThrow('原消息已删除或变化')
})
it('keeps ambiguous delivery bound across restart, new request IDs and directory changes', async () => {
  const { service, store, hooks } = await fixture()
  await service.prepare(preparation())
  const callbacks = (await service.forRun(nextRun))!
  await callbacks.prepare({ runId: nextRun.runId }); await callbacks.bindSession('thread'); await callbacks.unknown('连接丢失')
  const restarted = new ContextHandoffService(store, hooks)
  await expect(restarted.forRun({ ...nextRun, runId: 'replacement' })).rejects.toThrow('接收状态未知')
  await expect(restarted.prepare({ ...preparation(), requestId: 'bypass' })).rejects.toThrow('目标已有')
  await expect(restarted.assertSwitchAllowed(nextRun)).rejects.toThrow('不能通过切换')
  vi.mocked(hooks.target).mockResolvedValue({ providerId: 'native-test', configurationVersion: 'v2', workspace: '/different' })
  await expect(restarted.forRun({ ...nextRun, runId: 'replacement' })).rejects.toThrow('接收状态未知')
})
it('rejects source runs without a completed work or with unconfirmed native operations', async () => {
  const { service, store } = await fixture()
  await store.write([{ collection: 'runs', id: run.id, value: { ...run, workId: undefined } }])
  await expect(service.prepare(preparation())).rejects.toThrow('已结束且结果确定')
  await store.write([{ collection: 'runs', id: run.id, value: run }, { collection: 'nativeActions', id: 'action', value: { id: 'action', runId: run.id, status: 'answered', delivery: 'unknown' } }])
  await expect(service.prepare(preparation())).rejects.toThrow('未知或未完成')
  expect(await store.load(HANDOFF_COLLECTION)).toEqual([])
})
it('does not silently rebind prepared material after the provider configuration changes', async () => {
  const { service, hooks } = await fixture()
  await service.prepare(preparation())
  vi.mocked(hooks.target).mockResolvedValue({ providerId: 'new-provider', configurationVersion: 'v2', workspace: '/project' })
  const callbacks = (await service.forRun(nextRun))!
  await expect(callbacks.prepare({ runId: nextRun.runId })).rejects.toThrow('目标已变化')
  expect((await service.list(query))[0]?.status).toBe('prepared')
})
it('rejects unsupported API targets and available capacity exhaustion instead of claiming native delivery', async () => {
  const { service, hooks } = await fixture()
  vi.mocked(hooks.target).mockRejectedValueOnce(new Error('API目标尚未接入交接投递'))
  await expect(service.prepare(preparation())).rejects.toThrow('API目标尚未接入')
  await service.prepare(preparation())
  vi.mocked(hooks.target).mockResolvedValue({ providerId: 'native-test', configurationVersion: 'v1', workspace: '/project', budget: { contextWindow: 17000 } })
  await expect(service.forRun({ ...nextRun, currentInput: '超出'.repeat(1000) })).rejects.toThrow('剩余容量不足')
})
it('keeps prepared transfers dormant for automation/recovery and permits reading receipts after switching to API', async () => {
  const { service, hooks } = await fixture()
  await service.prepare(preparation())
  expect(await service.forRun({ ...nextRun, consumePrepared: false })).toBeUndefined()
  vi.mocked(hooks.target).mockRejectedValue(new Error('API目标尚未接入'))
  expect((await service.list(query))[0]?.status).toBe('prepared')
  expect(await service.forRun({ ...nextRun, consumePrepared: false })).toBeUndefined()
})
it('serializes concurrent preparations for the same target and records only one pending intent', async () => {
  const { service, store } = await fixture()
  const outcomes = await Promise.allSettled([service.prepare(preparation()), service.prepare({ ...preparation(), requestId: 'competing' })])
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(await store.load(HANDOFF_COLLECTION)).toHaveLength(1)
})
it.each([{ requiresReview: true }, { activeRunId: 'unexited-run' }])('rejects a delivered work with unresolved side effects or an active owner: %s', async extra => {
  const { service, store } = await fixture()
  await store.write([{ collection: 'workItems', id: work.id, value: { ...work, ...extra } }])
  await expect(service.prepare(preparation())).rejects.toThrow('已结束且结果确定')
  expect(await store.load(HANDOFF_COLLECTION)).toEqual([])
})
