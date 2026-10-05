/*
 * [INPUT]: 真实SQLite中的原自动化消息/轮次/运行/Work、问题和当前独立员工。
 * [OUTPUT]: 固定原问题版本/来源/负责人，task不降级chat或改派；旧完成/同伴失败轮次只读核对真实已提交原Work问题，chat无Work不借此兼容；同轮只拒绝已答原消息，旧chat缺记录仅保守兼容；来源读取零突变。
 * [POS]: 自动化原问题来源的专项模块意图测试，执行与接续事务仍由原宿主验收覆盖。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, AutomationOccurrence, AutomationOrigin, Conversation, DecisionRecord, DigitalAgent, DiscussionTurn, Message, WorkItem } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { automationQuestionSource } from '../src/runtime/modules/inbox/user-question'

const stores: ProductStore[] = [], roots: string[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const time = '2026-10-05T00:00:00.000Z'
async function fixture(kind: 'task' | 'chat' | 'legacy' = 'task') {
  const root = await mkdtemp(join(tmpdir(), 'boai-automation-question-source-')); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); stores.push(store); await store.init()
  const origin: AutomationOrigin = { kind: 'automation', occurrenceId: 'occurrence', automationId: 'plan', name: '原计划', authorizedFingerprint: 'original-authorization' }
  const agent: DigitalAgent = { id: 'alice', name: 'Alice', role: '原负责人', instructions: '', color: 'blue', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], active: true, allowCommands: false, configVersion: 1 }
  const conversation: Conversation = { id: 'conversation', kind: 'group', title: '原聊天', agentIds: ['alice', 'bob'], mode: 'natural', workspacePath: '/unused', sharedKnowledgeIds: [], createdAt: time, updatedAt: time }
  const original: Message = { id: 'original', conversationId: conversation.id, senderType: 'user', senderId: 'automation:plan', senderName: '原计划', content: '原始交付目标', status: 'completed', origin, createdAt: time, sequence: 1 }
  const turn: DiscussionTurn = { id: 'turn', conversationId: conversation.id, triggerMessageId: original.id, origin, status: 'waiting_user', generation: 1, createdAt: time, modelCalls: 2, publicMessages: 1 }
  const message: Message = { id: 'question', conversationId: conversation.id, senderType: 'agent', senderId: agent.id, senderName: agent.name, content: '请明确交付给谁？', status: 'completed', origin, turnId: turn.id, runId: 'run', createdAt: time, sequence: 2 }
  const run: AgentRun = { id: 'run', conversationId: conversation.id, turnId: turn.id, origin, agentId: agent.id, agentName: agent.name, triggerMessageId: original.id, messageId: message.id, status: 'completed', responseKind: kind === 'task' ? 'task' : 'chat', ...(kind === 'task' ? { workId: 'work' } : {}), createdAt: time, toolEvents: [] }
  const work: WorkItem = { id: 'work', schemaVersion: 2, conversationId: conversation.id, sourceMessageId: original.id, origin, key: 'original-work', scope: '原始目标', deliverable: '原交付', ownerAgentId: agent.id, version: 4, status: 'waiting', budgetId: 'original-budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [message.id], artifactIds: [], resultVersion: 1, requiresReview: false, createdAt: time, updatedAt: time, userQuestion: { id: 'work:work:1', messageId: message.id, revision: 4, content: message.content } }
  const decision: DecisionRecord = { id: 'decision', turnId: turn.id, agentId: agent.id, deliveryId: 'delivery', action: 'ask', responseKind: 'chat', observedThroughSequence: 1, createdAt: time, userQuestion: { id: 'decision:decision', messageId: message.id, revision: 1, content: message.content } }
  const occurrence: AutomationOccurrence = { schemaVersion: 1, id: origin.occurrenceId, automationId: origin.automationId, stateVersion: 8, name: origin.name, source: 'manual', scheduledFor: time, startedAt: time, status: 'waiting_user', deliveryStatus: 'pending', conversationId: conversation.id, messageId: original.id, turnId: turn.id, waitingTurnIds: [turn.id], runIds: [run.id], resultMessageIds: [message.id], budgetId: work.budgetId, usageIncomplete: false }
  await store.write([row('agents', agent), row('agents', { ...agent, id: 'bob', name: 'Bob' }), row('conversations', conversation), row('messages', original), row('messages', message), row('turns', turn), row('runs', run), row('automationOccurrences', occurrence), ...(kind === 'task' ? [row('workItems', work)] : kind === 'chat' ? [row('decisions', decision)] : [])])
  return { store, origin, agent, conversation, original, turn, message, run, work, decision, occurrence, read: (messageId = message.id, observed = occurrence) => store.transaction(tx => automationQuestionSource(tx, observed, messageId)) }
}

describe('固定自动化原问题的只读来源', () => {
  it('task沿已公开原消息的同负责人运行和原Work读取，不变更状态或预算', async () => {
    const f = await fixture(), collections = ['messages', 'turns', 'runs', 'workItems', 'workBudgets', 'automationOccurrences']
    const before = await Promise.all(collections.map(collection => f.store.load(collection)))
    const source = await f.read()
    expect(source).toMatchObject({ agentId: 'alice', message: f.message, turn: f.turn, conversation: f.conversation, work: f.work, question: f.work.userQuestion })
    expect(source.decision).toBeUndefined()
    expect(await Promise.all(collections.map(collection => f.store.load(collection)))).toEqual(before)
  })
  it.each(['completed', 'failed'] as const)('旧%s轮次仅读取实际已公开未答Work问题，不恢复或改写轮次', async status => {
    const f = await fixture(), oldTurn = { ...f.turn, status }
    await f.store.write([row('turns', oldTurn)])
    const before = await Promise.all(['turns', 'runs', 'workItems', 'automationOccurrences'].map(collection => f.store.load(collection)))
    expect(await f.read()).toMatchObject({ turn: oldTurn, work: f.work, message: f.message })
    expect(await Promise.all(['turns', 'runs', 'workItems', 'automationOccurrences'].map(collection => f.store.load(collection)))).toEqual(before)
    for (const patch of [{ status: 'cancelled' as const }, { status: 'interrupted' as const }]) { await f.store.write([row('turns', { ...oldTurn, ...patch })]); await expect(f.read()).rejects.toThrow('原问题消息') }
  })
  it.each(['chat', 'legacy'] as const)('旧完成%s无Work问题不借task兼容重新开放', async kind => {
    const f = await fixture(kind)
    await f.store.write([row('turns', { ...f.turn, status: 'completed' })])
    await expect(f.read()).rejects.toThrow('原聊天问题不属于本次等待')
  })
  it('同轮两个task问题只拒绝已答原消息，另一个原负责人问题继续可读', async () => {
    const f = await fixture(), secondMessage = { ...f.message, id: 'second-question', senderId: 'bob', senderName: 'Bob', runId: 'second-run', sequence: 3 }
    const secondRun = { ...f.run, id: secondMessage.runId, agentId: 'bob', agentName: 'Bob', messageId: secondMessage.id, workId: 'second-work' }
    const secondWork = { ...f.work, id: 'second-work', rootWorkId: 'second-work', ownerAgentId: 'bob', resultMessageIds: [secondMessage.id], userQuestion: { ...f.work.userQuestion!, id: 'work:second-work:1', messageId: secondMessage.id } }
    await f.store.write([row('messages', secondMessage), row('runs', secondRun), row('workItems', secondWork), row('workItems', { ...f.work, userQuestion: { ...f.work.userQuestion!, answeredMessageId: 'explicit-answer' } })])
    await expect(f.read()).rejects.toThrow('已回答')
    expect(await f.read(secondMessage.id)).toMatchObject({ agentId: 'bob', work: secondWork, message: secondMessage })
  })
  it('拒绝同名或相似问题的错误Work owner、结果消息、question版本及来源', async () => {
    const f = await fixture(), variants: WorkItem[] = [
      { ...f.work, ownerAgentId: 'bob' }, { ...f.work, resultMessageIds: ['another-message'] },
      { ...f.work, origin: { ...f.origin, authorizedFingerprint: 'other-permission' } }, { ...f.work, origin: undefined },
      { ...f.work, userQuestion: { ...f.work.userQuestion!, id: 'work:other:1' } },
      { ...f.work, userQuestion: { ...f.work.userQuestion!, revision: 3 } },
      { ...f.work, userQuestion: { ...f.work.userQuestion!, messageId: 'another-message' } },
      { ...f.work, userQuestion: { ...f.work.userQuestion!, content: '未公开的问题' } },
    ]
    for (const variant of variants) { await f.store.write([row('workItems', variant)]); await expect(f.read()).rejects.toThrow() }
  })
  it('task原运行缺失、跨员工/轮次/消息或失去Work关系均不降级旧chat兼容', async () => {
    const f = await fixture()
    await f.store.transaction(tx => tx.remove('runs', f.run.id)); await expect(f.read()).rejects.toThrow('运行关系')
    for (const variant of [{ ...f.run, agentId: 'bob' }, { ...f.run, turnId: 'other-turn' }, { ...f.run, messageId: 'other-message' }, { ...f.run, workId: undefined }]) {
      await f.store.write([row('runs', variant)]); await expect(f.read()).rejects.toThrow()
    }
    await f.store.write([row('runs', { ...f.run, workId: undefined, responseKind: 'chat' as const })])
    await expect(f.read()).rejects.toThrow('旧聊天问题')
  })
  it('当前occurrence版本、停止、waitingTurnIds和公开来源均为事务权威', async () => {
    const f = await fixture()
    for (const variant of [{ ...f.occurrence, stateVersion: 9 }, { ...f.occurrence, status: 'cancelled' as const }, { ...f.occurrence, cancellationRequestedAt: time }, { ...f.occurrence, waitingTurnIds: [] }]) {
      await f.store.write([row('automationOccurrences', variant)]); await expect(f.read()).rejects.toThrow()
    }
    await f.store.write([row('automationOccurrences', f.occurrence)])
    await f.store.write([row('messages', { ...f.message, status: 'streaming' as const })]); await expect(f.read()).rejects.toThrow('原问题消息')
    await f.store.write([row('messages', { ...f.message, origin: { ...f.origin, occurrenceId: 'other-occurrence' } })]); await expect(f.read()).rejects.toThrow('原问题消息')
    await f.store.write([row('messages', f.message), row('turns', { ...f.turn, origin: { ...f.origin, authorizedFingerprint: 'changed' } })]); await expect(f.read()).rejects.toThrow('原问题消息')
  })
  it('员工停用/移出、外部身份或原聊天清理不能改派或续用原问题', async () => {
    const f = await fixture()
    for (const variant of [{ ...f.agent, active: false }, { ...f.agent, executionBackend: { kind: 'acp-local' as const, profileId: 'profile' } }]) {
      await f.store.write([row('agents', variant)]); await expect(f.read()).rejects.toThrow('原负责人')
    }
    await f.store.write([row('agents', f.agent), row('conversations', { ...f.conversation, agentIds: ['bob'] })]); await expect(f.read()).rejects.toThrow('原负责人')
    await f.store.write([row('conversations', f.conversation), row('conversationCleanup', { id: f.conversation.id })]); await expect(f.read()).rejects.toThrow('原问题消息')
  })
  it('chat只读取实际ask Decision的原公开问题，已答或其他消息不可替代', async () => {
    const f = await fixture('chat'), source = await f.read()
    expect(source.decision).toEqual(f.decision); expect(source.work).toBeUndefined()
    for (const variant of [{ ...f.decision, action: 'reply' as const }, { ...f.decision, userQuestion: { ...f.decision.userQuestion!, answeredMessageId: 'answer' } }, { ...f.decision, userQuestion: { ...f.decision.userQuestion!, messageId: 'another-message' } }]) {
      await f.store.write([row('decisions', variant)]); await expect(f.read()).rejects.toThrow()
    }
  })
  it('旧chat缺问题记录只兼容原已公开等待消息，并按原明确回复拒绝已答消息', async () => {
    const f = await fixture('legacy')
    expect(await f.read()).toMatchObject({ question: { id: 'occurrence:occurrence', messageId: f.message.id, revision: f.occurrence.stateVersion }, agentId: 'alice' })
    const answer: Message = { ...f.original, id: 'answer', senderId: 'user', inboxReply: { questionId: 'occurrence:occurrence', questionRevision: f.occurrence.stateVersion, questionMessageId: f.message.id }, sequence: 3 }
    await f.store.write([row('messages', answer)])
    await expect(f.read()).rejects.toThrow('已经回答')
  })
  it('明确非ask或缺原Work的task记录不能冒充历史chat问题', async () => {
    const f = await fixture('legacy')
    await f.store.write([row('decisions', { ...f.decision, action: 'reply', userQuestion: undefined })]); await expect(f.read()).rejects.toThrow('旧聊天问题')
    await f.store.write([row('decisions', { ...f.decision, responseKind: 'task', userQuestion: undefined })]); await expect(f.read()).rejects.toThrow('旧聊天问题')
  })
})
