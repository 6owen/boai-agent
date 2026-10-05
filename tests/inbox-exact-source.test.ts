/*
 * [INPUT]: 明确SQLite预置的同触发两员工问题/Work/已公开Run与真实Inbox.get。
 * [OUTPUT]: 精确虚拟问题保留原员工/消息/Work和当前触发版本，旧SQL入口兼容；隐藏/清理/已答/停止/来源与材料失效拒绝，跨hook版本变化不返回旧正文，零业务写入。
 * [POS]: 精确自动化问题读取合同模块测试；预置不代表执行成功，不调用模型或补充业务。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, AutomationOccurrence, Conversation, DecisionRecord, DigitalAgent, DiscussionTurn, Message, WorkItem } from '../src/shared/domain'
import { ProductStore, type RecordTransaction } from '../src/runtime/adapters/storage/product-store'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { Inbox } from '../src/runtime/modules/inbox/inbox'

const stores: ProductStore[] = [], roots: string[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const time = '2026-10-05T00:00:00.000Z'
const target = (messageId: string) => `question:occurrence:occ:message:${messageId}`
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-inbox-exact-'))); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  const origin = { kind: 'automation' as const, automationId: 'plan', occurrenceId: 'occ', name: '原计划', authorizedFingerprint: 'original-fingerprint' }
  const conversation: Conversation = { id: 'chat', kind: 'group', title: '同触发双问题', agentIds: ['alice', 'bob'], sharedKnowledgeIds: [], mode: 'natural', workspacePath: '', createdAt: time, updatedAt: time }
  const occurrence: AutomationOccurrence = { schemaVersion: 1, id: 'occ', automationId: 'plan', stateVersion: 7, name: '原计划', source: 'manual', scheduledFor: time, startedAt: time, status: 'waiting_user', deliveryStatus: 'pending', conversationId: 'chat', messageId: 'original', waitingTurnIds: ['turn-alice', 'turn-bob'], runIds: ['run-alice', 'run-bob'], workIds: ['work-alice', 'work-bob'], resultMessageIds: ['message-alice', 'message-bob'], usageIncomplete: false }
  const original: Message = { id: 'original', conversationId: 'chat', senderType: 'user', senderId: 'user', senderName: '本人', content: '两位员工分别明确自己的交付问题', sequence: 1, createdAt: time, status: 'completed', origin }
  const records = [row('conversations', conversation), row('automationOccurrences', occurrence), row('messages', original)]
  for (const [index, id] of ['alice', 'bob'].entries()) {
    const agent: DigitalAgent = { id, name: id, role: 'writer', instructions: '', color: '#79719a', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
    const message: Message = { id: `message-${id}`, conversationId: 'chat', senderType: 'agent', senderId: id, senderName: id, content: `请明确${id}的交付范围？`, sequence: index + 2, createdAt: time, status: 'completed', turnId: `turn-${id}`, runId: `run-${id}`, origin }
    const turn: DiscussionTurn = { id: `turn-${id}`, conversationId: 'chat', triggerMessageId: 'original', status: 'waiting_user', generation: 1, createdAt: time, modelCalls: 1, publicMessages: 1, origin }
    const run: AgentRun = { id: `run-${id}`, conversationId: 'chat', agentId: id, agentName: id, triggerMessageId: 'original', messageId: message.id, turnId: turn.id, responseKind: 'task', workId: `work-${id}`, status: 'completed', createdAt: time, toolEvents: [], origin }
    const work: WorkItem = { id: `work-${id}`, schemaVersion: 2, conversationId: 'chat', sourceMessageId: 'original', key: `explicit-${id}`, scope: '本人问题', deliverable: `${id}独立交付`, ownerAgentId: id, version: 3, status: 'waiting', budgetId: 'original-budget', rootWorkId: `work-${id}`, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [message.id], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: time, updatedAt: time, origin, userQuestion: { id: `work:work-${id}:1`, messageId: message.id, content: message.content, revision: 3 } }
    await store.write([row('agents', agent), row('messages', message), row('turns', turn), row('runs', run), row('workItems', work)])
  }
  await store.write(records)
  const validateQuestion = vi.fn(async (_tx: RecordTransaction, _message: Message, _agentId: string) => {}), validateSource = vi.fn(async (_source: { materialSources?: Message['materialSources']; runId?: string }, _message: Message | undefined, _conversationId: string) => {})
  const inbox = new Inbox(store, new WorkRepository(store), { approval: () => undefined, acceptance: async () => null, validateQuestion, validateSource })
  return { store, inbox, conversation, occurrence, validateQuestion, validateSource }
}
async function facts(store: ProductStore) { return Promise.all(['workItems', 'runs', 'turns', 'decisions', 'messages', 'automationOccurrences', 'workBudgets'].map(collection => store.load(collection))) }

describe('精确自动化问题的只读虚拟身份', () => {
  it('同一次触发两位员工各回原问题与真实Work，当前stateVersion不借问题版本且不改任何业务', async () => {
    const f = await fixture(), before = await facts(f.store)
    for (const id of ['alice', 'bob']) {
      expect(await f.inbox.get(target(`message-${id}`))).toMatchObject({ id: target(`message-${id}`), agentId: id, agentName: id, messageId: `message-${id}`, turnId: `turn-${id}`, runId: `run-${id}`, workId: `work-${id}`, occurrenceId: 'occ', automationId: 'plan', question: { id: 'occurrence:occ', messageId: `message-${id}`, revision: 7, content: `请明确${id}的交付范围？`, canReply: false }, work: { id: `work-${id}`, version: 3, status: 'waiting' } })
    }
    // The old no-message-segment entry and list keep their established SQL compatibility.
    expect(await f.inbox.get('question:occurrence:occ')).toMatchObject({ messageId: 'message-bob', question: { id: 'occurrence:occ', canReply: false } })
    expect((await f.inbox.list({ kind: 'question' })).items.map(item => item.id)).toEqual(['question:occurrence:occ'])
    expect(await facts(f.store)).toEqual(before)
  })
  it('真实chat Decision问题不伪造Work，固定原消息仍使用occurrence提交身份', async () => {
    const f = await fixture()
    await f.store.transaction(async tx => {
      const run = (await tx.get<AgentRun>('runs', 'run-alice'))!; run.responseKind = 'chat'; delete run.workId
      const work = (await tx.get<WorkItem>('workItems', 'work-alice'))!
      const decision: DecisionRecord = { id: 'decision-alice', turnId: 'turn-alice', agentId: 'alice', deliveryId: 'delivery-alice', createdAt: time, action: 'ask', responseKind: 'chat', observedThroughSequence: 1, userQuestion: { ...work.userQuestion!, id: 'decision:decision-alice', revision: 1 } }
      await tx.remove('workItems', work.id); await tx.put(row('runs', run)); await tx.put(row('decisions', decision))
    })
    const item = await f.inbox.get(target('message-alice'))
    expect(item).toMatchObject({ agentId: 'alice', messageId: 'message-alice', occurrenceId: 'occ', question: { id: 'occurrence:occ', revision: 7, canReply: false } }); expect(item?.workId).toBeUndefined()
  })
  it.each(['stopped', 'answered', 'hidden', 'cleanup'] as const)('%s后的精确目标为null，不回退另一员工或恢复会话', async change => {
    const f = await fixture()
    await f.store.transaction(async tx => {
      if (change === 'stopped') await tx.put(row('automationOccurrences', { ...f.occurrence, status: 'cancelled' as const }))
      else if (change === 'answered') { const work = (await tx.get<WorkItem>('workItems', 'work-alice'))!; work.userQuestion!.answeredMessageId = 'answer'; await tx.put(row('workItems', work)) }
      else if (change === 'hidden') await tx.put(row('conversations', { ...f.conversation, list: { hidden: true } }))
      else await tx.put(row('conversationCleanup', { id: 'chat' }))
    })
    expect(await f.inbox.get(target('message-alice'))).toBeNull()
    expect(f.validateSource).not.toHaveBeenCalled()
  })
  it('来源hook自持事务而不死锁，期间触发版本变化后零旧正文返回', async () => {
    const f = await fixture()
    f.validateSource.mockImplementationOnce(async () => { await f.store.transaction(tx => tx.put(row('automationOccurrences', { ...f.occurrence, stateVersion: 8 }))) })
    expect(await f.inbox.get(target('message-alice'))).toBeNull(); expect(f.validateQuestion).not.toHaveBeenCalled()
  })
  it('当前来源核验失败立即返回null，不沿旧消息正文提交', async () => {
    const f = await fixture(); f.validateSource.mockRejectedValueOnce(new Error('原件hash变化'))
    expect(await f.inbox.get(target('message-alice'))).toBeNull(); expect(f.validateQuestion).not.toHaveBeenCalled()
  })
  it('最终tx材料核验包含Work与原Message，撤权拒绝且不改变问题事实', async () => {
    const f = await fixture(), reference = { id: 'material', conversationId: 'chat', revision: 1, contentHash: 'f'.repeat(64), parseVersion: 'text-v1' as const }
    await f.store.transaction(async tx => { const work = (await tx.get<WorkItem>('workItems', 'work-alice'))!; work.materialSources = [reference]; await tx.put(row('workItems', work)) })
    const before = await facts(f.store)
    f.validateQuestion.mockImplementationOnce(async (tx, message) => { expect(message.materialSources).toContainEqual(reference); expect(await tx.get('materials', reference.id)).toBeUndefined(); throw new Error('材料已撤权') })
    expect(await f.inbox.get(target('message-alice'))).toBeNull(); expect(await facts(f.store)).toEqual(before)
  })
})
