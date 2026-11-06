/*
 * [INPUT]: Real temporary ProductStore records, explicit host checks and bounded public messages.
 * [OUTPUT]: Handoff budget/source/CAS/receipt/crash/deletion regressions without provider or GUI calls.
 * [POS]: WT3 H1 persistent context handoff targeted acceptance.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { Conversation, DigitalAgent, Message } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ContextHandoffRepository, HANDOFF_COLLECTION, clearContextHandoffs, handoffMessage, type ContextHandoff, type HandoffChecks, type HandoffTarget, type PrepareHandoff } from '../packages/runtime/src/modules/contexts/context-handoff'
import { handoffBudget, handoffCost, selectHandoffMaterial } from '../packages/runtime/src/modules/contexts/handoff-budget'
import { ConversationHistory } from '../packages/runtime/src/modules/conversations/history'
import { ContactDeletionService } from '../packages/runtime/src/modules/employees/contact-deletion'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const message = (id: string, sequence: number, content = `公开事实 ${id}`, senderType: 'agent' | 'user' = 'user'): Message => ({ id, sequence, content, senderType, senderId: senderType === 'user' ? 'owner' : 'employee-a', senderName: 'Sender', status: 'completed', conversationId: 'chat-a', createdAt: '2026-11-07T00:00:00.000Z' })
const target: HandoffTarget = { agentId: 'employee-a', conversationId: 'chat-a', providerId: 'native-a', configurationVersion: 'v1', workspace: '/project-a', nativeSessionId: 'native-thread-a' }
const messages = [message('request', 1), message('result', 2, '已完成工作，原件保持。', 'agent')]
function input(overrides: Partial<PrepareHandoff> = {}): PrepareHandoff {
  return { requestId: 'request-1', source: { agentId: 'employee-a', conversationId: 'chat-a', runId: 'run-a', version: 'result-v1' }, target, reason: 'context-rebuild', material: { goal: '继续讨论已经完成的工作', constraints: ['不得重跑旧命令'], entries: messages.map(handoffMessage), artifactRefs: [] }, budget: {}, ...overrides }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-handoff-')), store = new ProductStore(join(root, 'data.sqlite'))
  await store.init()
  cleanups.push(async () => { await store.close(); await rm(root, { recursive: true, force: true }) })
  await store.write(messages.map(value => ({ collection: 'messages', id: value.id, value })))
  const checks: HandoffChecks = { source: vi.fn(async () => {}), target: vi.fn(async () => {}) }
  return { root, store, checks, repository: new ContextHandoffRepository(store, checks) }
}
async function pending(repository: ContextHandoffRepository) {
  const prepared = await repository.prepare(input())
  const begun = await repository.beginDelivery(prepared.id, prepared.revision, target)
  return { ...begun, attempt: begun.transfer.attempts.at(-1)! }
}

it('selects intact multilingual history and records omitted oversized IDs within the actual encoded budget', () => {
  const oversized = message('oversized', 2, '非常长的中文🙂\\"\n'.repeat(2000), 'agent')
  const entries = [message('first', 1), oversized, message('latest', 3), message('done', 4, '完成', 'agent')].map(handoffMessage)
  const selected = selectHandoffMaterial({ ...input().material, entries }, { tokenCap: 2500 })
  expect(selected.coverage.omitted).toEqual([{ id: 'oversized', reason: 'budget' }])
  expect(selected.material.entries.map(entry => entry.id)).toEqual(['first', 'latest', 'done'])
  expect(selected.material.entries[0]?.text).toBe(entries[0]?.text)
  expect(handoffCost(selected.material, selected.coverage.omitted.length)).toBeLessThanOrEqual(2500)
  expect(selected.coverage).toMatchObject({ from: 'first', through: 'done', capacitySource: 'unknown-policy' })
  expect(selected.payload).not.toContain(oversized.content)
})
it('deducts current input, native occupancy, attachments and execution reserve from a known window', () => {
  expect(handoffBudget({ contextWindow: 20000, occupiedTokens: 1000, attachmentTokens: 1000, currentInput: '中', executionReserve: 16000 })).toEqual({ bytes: 1995, capacitySource: 'provider-declared' })
  expect(handoffBudget({ contextWindow: 16000, occupiedTokens: 20000 })).toMatchObject({ bytes: 0 })
  expect(() => handoffBudget({ occupiedTokens: NaN })).toThrow('无效')
  expect(() => selectHandoffMaterial(input().material, { tokenCap: 1 })).toThrow('超过可用容量')
})
it('persists one immutable preparation per request and refuses changed target or material under the same identity', async () => {
  const { store, repository } = await fixture()
  const first = await repository.prepare(input()), second = await repository.prepare(input())
  expect(second).toEqual(first)
  expect((await store.load(HANDOFF_COLLECTION))).toHaveLength(1)
  await expect(repository.prepare(input({ target: { ...target, workspace: '/other' } }))).rejects.toThrow('相同交接请求')
  await expect(repository.prepare(input({ material: { ...input().material, goal: '另一个目标' } }))).rejects.toThrow('相同交接请求')
  expect(await store.load<Message>('messages')).toEqual(messages)
})
it('serializes competing delivery attempts and durably records the attempt before transport can begin', async () => {
  const { store, repository } = await fixture(), prepared = await repository.prepare(input())
  const attempts = await Promise.all([repository.beginDelivery(prepared.id, prepared.revision, target), repository.beginDelivery(prepared.id, prepared.revision, target)])
  expect(attempts.map(attempt => attempt.shouldDeliver).sort()).toEqual([false, true])
  const saved = (await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]!
  expect(saved.status).toBe('pending')
  expect(saved.attempts).toHaveLength(1)
  expect(saved.attempts[0]?.payloadHash).toBe(saved.payloadHash)
  await expect(repository.cancel(saved.id, saved.revision)).rejects.toThrow('可能已被消费')
})
it('accepts only matching provider evidence and keeps delivered distinct from work acceptance', async () => {
  const { repository, store } = await fixture(), { transfer, attempt } = await pending(repository)
  await expect(repository.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: 'wrong', evidence: { kind: 'accepted', id: 'turn-a', nativeSessionId: target.nativeSessionId } })).rejects.toThrow('不属于')
  await expect(repository.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: 'turn-a', nativeSessionId: 'other' } })).rejects.toThrow('缺少目标')
  const delivered = await repository.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: 'turn-a', nativeSessionId: target.nativeSessionId } })
  expect(delivered.status).toBe('delivered')
  expect((await repository.beginDelivery(delivered.id, delivered.revision, target)).shouldDeliver).toBe(false)
  expect(await store.load('workItems')).toEqual([])
  expect(await store.load('runs')).toEqual([])
})
it('recovers pending delivery as unknown and never resends it after restart or target change', async () => {
  const { repository, store, checks } = await fixture(), { transfer, attempt } = await pending(repository)
  const restarted = new ContextHandoffRepository(store, checks)
  expect(await restarted.recover()).toBe(1)
  expect(await restarted.recover()).toBe(0)
  const unknown = await restarted.read(transfer.id)
  expect(unknown.status).toBe('unknown')
  expect((await restarted.beginDelivery(transfer.id, unknown.revision, target)).shouldDeliver).toBe(false)
  await expect(restarted.beginDelivery(transfer.id, unknown.revision, { ...target, nativeSessionId: 'fresh-bypass' })).rejects.toThrow('目标已变化')
  await expect(restarted.cancel(transfer.id, unknown.revision)).rejects.toThrow('可能已被消费')
  const reconciled = await restarted.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: 'original-turn', nativeSessionId: target.nativeSessionId } })
  expect(reconciled.status).toBe('delivered')
})
it('allows retry only after explicit non-consumption and rejects a late receipt from the older attempt', async () => {
  const { repository } = await fixture(), { transfer, attempt } = await pending(repository)
  const rejected = await repository.settle(transfer.id, attempt.id, { status: 'rejected', target, payloadHash: transfer.payloadHash, evidence: { kind: 'not-consumed', id: 'provider-refusal' }, reason: '目标拒绝，尚未消费输入' })
  const retried = await repository.beginDelivery(rejected.id, rejected.revision, target)
  expect(retried.shouldDeliver).toBe(true)
  expect(retried.transfer.attempts).toHaveLength(2)
  expect(retried.transfer.attempts[0]?.status).toBe('rejected')
  await expect(repository.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: 'late', nativeSessionId: target.nativeSessionId } })).rejects.toThrow('不属于当前')
})
it('cancels an unconsumed preparation with CAS and prevents sending it later', async () => {
  const { repository } = await fixture(), transfer = await repository.prepare(input())
  await expect(repository.cancel(transfer.id, 0)).rejects.toThrow('版本已变化')
  const cancelled = await repository.cancel(transfer.id, transfer.revision)
  expect(cancelled.status).toBe('cancelled')
  await expect(repository.beginDelivery(cancelled.id, cancelled.revision, target)).rejects.toThrow('已取消')
})
it('rechecks deletion, source edits and revoked cross-employee authorization before delivery', async () => {
  const { repository, store, checks } = await fixture(), transfer = await repository.prepare(input())
  vi.mocked(checks.source).mockRejectedValueOnce(new Error('目标不可读取A的私人来源'))
  await expect(repository.beginDelivery(transfer.id, transfer.revision, target)).rejects.toThrow('私人来源')
  await store.write([{ collection: 'messages', id: 'result', value: { ...messages[1]!, content: '修订后的结果' } }])
  await expect(repository.beginDelivery(transfer.id, transfer.revision, target)).rejects.toThrow('原消息已删除或变化')
  await store.write([], [{ collection: 'messages', id: 'result' }])
  await expect(repository.read(transfer.id)).rejects.toThrow('原消息已删除或变化')
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.attempts).toHaveLength(0)
})
it('checks omitted input at preparation and does not preserve unauthorized source IDs', async () => {
  const { repository, store } = await fixture()
  const absent = handoffMessage(message('missing', 3, '不可读'.repeat(10000)))
  await expect(repository.prepare(input({ material: { ...input().material, entries: [...input().material.entries, absent] } }))).rejects.toThrow('原消息已删除或变化')
  expect(await store.load(HANDOFF_COLLECTION)).toEqual([])
})
it('purges material on cleanup while retaining the stable request tombstone and isolating other employees', async () => {
  const { repository, store } = await fixture(), { transfer, attempt } = await pending(repository)
  await repository.forget({ agentId: 'unrelated' })
  expect((await repository.read(transfer.id)).payload).toBeTruthy()
  await repository.forget({ conversationId: 'chat-a' })
  const forgotten = (await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]!
  expect(forgotten.payload).toBeUndefined()
  expect(forgotten.material).toBeUndefined()
  expect(forgotten.coverage.selectedIds).toEqual([])
  await expect(repository.prepare(input())).rejects.toThrow('原请求不会重建')
  await expect(repository.settle(transfer.id, attempt.id, { status: 'delivered', target, payloadHash: transfer.payloadHash, evidence: { kind: 'accepted', id: 'late', nativeSessionId: target.nativeSessionId } })).rejects.toThrow('迟到回执')
  expect(await store.load<Message>('messages')).toEqual(messages)
})
it('retains no pending attempt if the transaction fails before durable delivery registration', async () => {
  const { repository, store, checks } = await fixture(), transfer = await repository.prepare(input())
  vi.mocked(checks.target).mockRejectedValueOnce(new Error('当前目标仍有活动执行'))
  await expect(repository.beginDelivery(transfer.id, transfer.revision, target)).rejects.toThrow('活动执行')
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.status).toBe('prepared')
  expect((await repository.read(transfer.id)).attempts).toHaveLength(0)
})
it('cannot bypass an unknown receipt by moving the same source to a new employee or conversation', async () => {
  const { repository } = await fixture(), { transfer, attempt } = await pending(repository)
  await repository.settle(transfer.id, attempt.id, { status: 'unknown', target, payloadHash: transfer.payloadHash, reason: '连接已断' })
  await expect(repository.prepare(input({ requestId: 'new-request', target: { ...target, agentId: 'employee-b', conversationId: 'other-room', nativeSessionId: 'other-native' } }))).rejects.toThrow('不能换请求或目标绕过')
})
it('clears assignment handoff bodies in the original deletion transaction and rolls back on failure', async () => {
  const { repository, store } = await fixture()
  const transfer = await repository.prepare(input({ source: { ...input().source, assignmentId: 'assignment' } }))
  await expect(store.transaction(async tx => { await clearContextHandoffs(tx, { assignmentId: 'assignment' }); throw new Error('delete failed') })).rejects.toThrow('delete failed')
  expect((await repository.read(transfer.id)).payload).toBeTruthy()
  expect(await store.transaction(tx => clearContextHandoffs(tx, { assignmentId: 'assignment' }))).toEqual([transfer.id])
  expect(await store.transaction(tx => clearContextHandoffs(tx, { assignmentId: 'assignment' }))).toEqual([])
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.payload).toBeUndefined()
})
it('purges both source and target handoffs before a conversation cleanup crash and completes offline recovery', async () => {
  const { repository, store, root } = await fixture(), transfer = await repository.prepare(input())
  const conversation: Conversation = { id: 'chat-a', kind: 'direct', title: 'Chat', agentIds: ['employee-a'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '2026-11-07', updatedAt: '2026-11-07' }
  await store.write([{ collection: 'conversations', id: conversation.id, value: conversation }])
  const history = new ConversationHistory(store, root), transaction = store.transaction.bind(store)
  let calls = 0
  const failure = vi.spyOn(store, 'transaction').mockImplementation(callback => { if (++calls === 2) return Promise.reject(new Error('crash after fence')); return transaction(callback) })
  await expect(history.clear(conversation, false)).rejects.toThrow('crash after fence')
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.payload).toBeUndefined()
  expect(await store.load('conversationCleanup')).toHaveLength(1)
  failure.mockRestore()
  expect(await history.recover()).toEqual([])
  expect(await store.load('conversationCleanup')).toEqual([])
  await expect(repository.prepare(input())).rejects.toThrow('原请求不会重建')
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.id).toBe(transfer.id)
})
it('purges employee handoffs inside contact deletion while preserving another group member', async () => {
  const { repository, store, root } = await fixture()
  await repository.prepare(input())
  const agent = (id: string): DigitalAgent => ({ id, name: id, role: '', instructions: '', color: '', connectionId: 'connection', modelId: 'model', skillIds: [], knowledgeIds: [], allowBrowser: false, allowCommands: true, active: true, configVersion: 1 })
  const conversation: Conversation = { id: 'chat-a', kind: 'group', title: 'Group', agentIds: ['employee-a', 'employee-b'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt: '2026-11-07', updatedAt: '2026-11-07' }
  await store.write([{ collection: 'conversations', id: conversation.id, value: conversation }, ...conversation.agentIds.map(id => ({ collection: 'agents', id, value: agent(id) }))])
  await new ContactDeletionService(store, root).delete({ agentIds: ['employee-a'] })
  expect((await store.load<ContextHandoff>(HANDOFF_COLLECTION))[0]?.payload).toBeUndefined()
  expect((await store.load<DigitalAgent>('agents')).map(agent => agent.id)).toEqual(['employee-b'])
  expect((await store.load<Conversation>('conversations'))[0]?.agentIds).toEqual(['employee-b'])
})
