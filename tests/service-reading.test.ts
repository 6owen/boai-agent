/*
 * [OUTPUT]: 清理开始先于changed且守卫持续至完成；真正失败不伪造完成，提交后的compact故障不重报删除失败。
 * [INPUT]: 真实 AppService/SQLite 发布事务、可控离线 Engine、材料原件与本机 ACP 协议夹具。
 * [OUTPUT]: 隐藏/显式恢复、真正清空与删除后的搜索/原目标门禁及重启零重放，隐藏仍允许原授权明确历史窗口但搜索 IPC 拒绝内部标记，清空保留可见配置名而旧正文不回流；名称/正文/文件统一搜索和原会话目标的真实 IPC 校验/零消息零模型零工作；历史轮次摘要80项/60字符、默认无摘要、真实来源外改失效和零全历史/零模型调用；无正文元信息的旧结果实际正文核对/材料撤权失效与零业务调用；chat/task/ACP 三条真实完成事务、开始/完成乱序与阅读缺口、来源失效无旧正文、清理同事务 epoch、独立锚点及异根备份重启零重放的宿主意图验收。
 * [POS]: D6 阅读/搜索服务集成测试；不调用商业模型，不替代 Electron 可见性验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../src/runtime/service'
import type { AppEvent } from '../src/shared/ipc'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { materialDirectory } from '../src/runtime/modules/materials/material-files'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Artifact, Connection, Conversation, ConversationDetail, LaunchProfile, Message, ParticipationDecision, Snapshot } from '../src/shared/domain'
import type { ConversationMaterial } from '../src/shared/domain/materials'
import type { ConversationCompletion, ConversationCompletionIdentity, ConversationMessagePage, ConversationReadingState, ConversationSearchPage, ConversationSearchResult, ConversationView } from '../src/shared/domain/reading'
import { READING_LIMITS } from '../src/shared/domain/reading'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
class FakeEngine implements AgentEngine {
  decisions: EngineContext[] = []
  contexts: EngineContext[] = []
  kind: 'chat' | 'task' = 'chat'
  report: AgentEngine['report'] = async (_context, draft) => ({ action: 'publish', text: draft.text })
  handler = async (context: EngineContext) => {
    await context.onDelta('可检查的完成正文。')
    await context.onUsage?.({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })
    if (this.kind === 'task') await context.onWorkOutcome?.({ disposition: 'delivered', summary: '已交付', evidence: [{ kind: 'answer', reference: '可检查的完成正文。' }] })
  }
  async decide(context: EngineContext): Promise<ParticipationDecision> {
    this.decisions.push(context)
    return context.participation?.hasRespondedInTurn
      ? { action: 'pass', observedThroughSequence: context.participation.observedThroughSequence }
      : { action: 'reply', responseKind: this.kind, observedThroughSequence: context.participation!.observedThroughSequence, ...(this.kind === 'task' ? { work: { key: 'original-task', scope: '完成原始交付', deliverable: '可检查的完成正文' } } : {}) }
  }
  async run(context: EngineContext) { this.contexts.push(context); await this.handler(context) }
  async test() { return 'ok' }
}
async function open(dataPath: string, engine = new FakeEngine()) {
  const events: AppEvent[] = []
  const service = new AppService({ dataPath, engine, secrets, emit: event => { events.push(event) } }); cleanups.push(() => service.close()); await service.init(); return { service, engine, events }
}
async function fixture(kind: 'direct' | 'group' = 'direct') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-service-reading-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const dataPath = join(root, 'data'), current = await open(dataPath)
  const connection = await current.service.handle('saveConnection', { name: 'offline fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test-model' }) as Connection
  for (const agent of (await current.service.handle('snapshot', undefined) as Snapshot).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await current.service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test-model' })
  }
  const conversation = await current.service.handle('createConversation', { kind, title: '真实阅读聊天', agentIds: kind === 'group' ? ['researcher', 'writer'] : ['researcher'] }) as Conversation
  return { root, dataPath, conversation, ...current }
}
const storeOf = (service: AppService) => (service as unknown as { store: ProductStore }).store
const detail = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
const reading = (service: AppService, conversation: Conversation) => service.handle('getConversationReading', { conversationId: conversation.id }) as Promise<ConversationReadingState>
const page = (service: AppService, conversation: Conversation) => service.handle('listConversationMessages', { conversationId: conversation.id }) as Promise<ConversationMessagePage>
const view = (service: AppService, conversation: Conversation) => service.handle('getConversationView', { conversationId: conversation.id }) as Promise<ConversationView>
const observe = (service: AppService, conversation: Conversation, state: ConversationReadingState, completions: ConversationCompletionIdentity[]) => service.handle('observeConversationReading', { conversationId: conversation.id, epoch: state.epoch, expectedRevision: state.revision, completions }) as Promise<ConversationReadingState>
async function idle(service: AppService, conversation: Conversation) {
  await vi.waitFor(async () => {
    const current = await detail(service, conversation)
    expect(current.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(current.turns!.every(turn => ['completed', 'waiting_user', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  }, { timeout: 8000, interval: 10 })
}
async function send(service: AppService, conversation: Conversation, requestId: string = crypto.randomUUID()) {
  await service.handle('sendMessage', { conversationId: conversation.id, content: '完成本次明确请求。', requestId, mentionIds: [] }); await idle(service, conversation)
}
function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
const identities = (current: ConversationMessagePage) => current.items.flatMap(item => item.completion ? [item.completion] : []).sort((a, b) => a.ordinal - b.ordinal)

describe('D6 real publication and user reading integration', () => {
  it('search excludes actual hidden history, resumes only after explicit show, and cannot reopen cleared or deleted old targets', async () => {
    const { service, engine, conversation, dataPath } = await fixture()
    await send(service, conversation, 'before-hidden')
    const initial = await detail(service, conversation), before = await reading(service, conversation), calls = { decisions: engine.decisions.length, runs: engine.contexts.length }
    const messages = await service.handle('searchConversations', { keyword: '可检查的完成正文', scope: 'all', kinds: ['message'] }) as ConversationSearchPage
    const names = await service.handle('searchConversations', { keyword: conversation.title, scope: 'all', kinds: ['conversation'] }) as ConversationSearchPage
    expect(messages.results).toHaveLength(1); expect(names.results).toHaveLength(1)
    const messageTarget = messages.results[0].target, nameTarget = names.results[0].target
    await service.handle('updateConversationList', { id: conversation.id, action: 'hide' })
    for (const keyword of ['可检查的完成正文', conversation.title]) expect((await service.handle('searchConversations', { keyword, scope: 'all' }) as ConversationSearchPage).results).toEqual([])
    expect((await service.handle('searchConversations', { keyword: '可检查的完成正文', scope: 'current', conversationId: conversation.id, agentId: 'researcher', kinds: ['message'] }) as ConversationSearchPage).results).toEqual([])
    for (const target of [messageTarget, nameTarget]) await expect(service.handle('resolveConversationSearchTarget', target)).rejects.toThrow('已被清理或不可用')
    await expect(service.handle('resolveConversationSearchTarget', { ...messageTarget, includeHidden: true })).rejects.toThrow()
    expect((await page(service, conversation)).items.flatMap(item => item.message ? [item.message.id] : [])).toEqual(initial.messages.map(item => item.id))
    expect((await service.handle('listConversationMessages', { conversationId: conversation.id, aroundMessageId: messages.results[0].id, limit: 1 }) as ConversationMessagePage).items[0]).toMatchObject({ status: 'available', message: { id: messages.results[0].id, content: '可检查的完成正文。' } })
    expect((await detail(service, conversation)).messages).toEqual(initial.messages); expect(await reading(service, conversation)).toEqual(before)
    expect((await service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === conversation.id)?.list?.hidden).toBe(true)
    expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
    await service.handle('updateConversationList', { id: conversation.id, action: 'show' })
    expect(await service.handle('resolveConversationSearchTarget', messageTarget)).toMatchObject({ status: 'available', id: messages.results[0].id })
    await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect((await service.handle('searchConversations', { keyword: '可检查的完成正文', scope: 'all' }) as ConversationSearchPage).results).toEqual([])
    await expect(service.handle('resolveConversationSearchTarget', messageTarget)).rejects.toThrow('已被清理或不可用')
    expect(await service.handle('resolveConversationSearchTarget', nameTarget)).toMatchObject({ status: 'available', name: conversation.title })
    expect((await detail(service, conversation)).messages).toEqual([]); expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
    await service.handle('clearConversationHistory', { id: conversation.id, hide: true })
    expect((await service.handle('searchConversations', { keyword: conversation.title, scope: 'all' }) as ConversationSearchPage).results).toEqual([])
    await expect(service.handle('resolveConversationSearchTarget', nameTarget)).rejects.toThrow('已被清理或不可用')
    expect((await service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === conversation.id)?.list?.hidden).toBe(true)
    expect(await storeOf(service).load('messages')).toEqual([]); expect(await storeOf(service).load('workItems')).toEqual([])
    await service.close(); const restored = await open(dataPath)
    expect((await restored.service.handle('searchConversations', { keyword: conversation.title, scope: 'all' }) as ConversationSearchPage).results).toEqual([])
    await expect(restored.service.handle('resolveConversationSearchTarget', messageTarget)).rejects.toThrow('已被清理或不可用')
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  })

  it('a real group deletion removes its name and old message targets instead of falling back to another matching conversation', async () => {
    const { service, engine, conversation } = await fixture('group')
    await send(service, conversation, 'before-deleted')
    const sameName = await service.handle('createConversation', { kind: 'group', title: conversation.title, agentIds: ['researcher', 'writer'] }) as Conversation
    const original = await service.handle('searchConversations', { keyword: '可检查的完成正文', scope: 'current', conversationId: conversation.id, kinds: ['message'] }) as ConversationSearchPage
    expect(original.results.length).toBeGreaterThan(0)
    const calls = { decisions: engine.decisions.length, runs: engine.contexts.length }
    await service.handle('deleteConversation', { id: conversation.id })
    const names = await service.handle('searchConversations', { keyword: conversation.title, scope: 'all', kinds: ['conversation'] }) as ConversationSearchPage
    expect(names.results.map(item => item.id)).toEqual([sameName.id])
    for (const target of [{ kind: 'conversation' as const, conversationId: conversation.id }, ...original.results.map(item => item.target)]) await expect(service.handle('resolveConversationSearchTarget', target)).rejects.toThrow('已被清理或不可用')
    expect((await service.handle('searchConversations', { keyword: '可检查的完成正文', scope: 'all' }) as ConversationSearchPage).results).toEqual([])
    expect((await service.handle('snapshot', undefined) as Snapshot).conversations.some(item => item.id === conversation.id)).toBe(false)
    expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
  })

  it('default search includes real conversation names and exact navigation remains a strictly read-only host operation', async () => {
    const { service, engine, conversation } = await fixture(), second = await service.handle('createConversation', { kind: 'direct', title: conversation.title, agentIds: ['writer'] }) as Conversation
    const before = await detail(service, conversation), state = await reading(service, conversation)
    const all = await service.handle('searchConversations', { keyword: conversation.title, scope: 'all' }) as ConversationSearchPage
    expect(new Set(all.results.map(result => result.id))).toEqual(new Set([conversation.id, second.id]))
    expect(all.results.every(result => result.kind === 'conversation' && result.status === 'available' && !result.excerpt && !result.completion)).toBe(true)
    const selected = await service.handle('searchConversations', { keyword: conversation.title, scope: 'all', agentId: 'researcher', kinds: ['conversation', 'message', 'material', 'artifact'] }) as ConversationSearchPage
    expect(selected.results.map(result => result.id)).toEqual([conversation.id])
    expect(await service.handle('resolveConversationSearchTarget', selected.results[0].target)).toMatchObject({ id: conversation.id, name: conversation.title, target: { kind: 'conversation', conversationId: conversation.id } })
    await expect(service.handle('resolveConversationSearchTarget', { kind: 'conversation', conversationId: conversation.id, messageId: 'invented' })).rejects.toThrow()
    expect(await detail(service, conversation)).toEqual(before); expect(await reading(service, conversation)).toEqual(state)
    expect(engine.contexts).toEqual([]); expect(engine.decisions).toEqual([])
    for (const collection of ['messages', 'workItems', 'runs', 'turns', 'conversationCompletions']) expect(await storeOf(service).load(collection)).toEqual([])
  })

  it('counts actual chat completion order, leaves an unseen gap and never makes a Work by reading', async () => {
    const { service, engine, conversation } = await fixture('group'), started = barrier(), finishA = barrier(), finishB = barrier()
    engine.handler = async context => {
      if (context.agent.id === 'researcher') { await context.onDelta('相同正文 SAME_BODY'); started.release(); await finishA.promise }
      else { await started.promise; await context.onDelta('相同正文 SAME_BODY'); await finishB.promise }
    }
    const decide = engine.decide.bind(engine)
    vi.spyOn(engine, 'decide').mockImplementation(async context => { if (context.agent.id === 'writer') await started.promise; return decide(context) })
    await service.handle('sendMessage', { conversationId: conversation.id, content: '两位各自回复', requestId: 'parallel', mentionIds: [] })
    await vi.waitFor(() => expect(engine.contexts).toHaveLength(2), { timeout: 5000 })
    expect(await reading(service, conversation)).toMatchObject({ completionCount: 0, unreadCount: 0 })
    const streaming = (await detail(service, conversation)).messages.filter(message => message.senderType === 'agent')
    expect(streaming).toHaveLength(2); expect(streaming.every(message => message.status === 'streaming')).toBe(true)
    finishB.release()
    await vi.waitFor(async () => expect((await reading(service, conversation)).completionCount).toBe(1), { timeout: 5000 })
    finishA.release(); await idle(service, conversation)
    const final = await detail(service, conversation), completions = await storeOf(service).load<ConversationCompletion>('conversationCompletions')
    const a = final.messages.find(message => message.senderId === 'researcher')!, b = final.messages.find(message => message.senderId === 'writer')!
    expect(a.sequence).toBeLessThan(b.sequence)
    expect(completions.find(value => value.messageId === b.id)?.ordinal).toBe(1)
    expect(completions.find(value => value.messageId === a.id)?.ordinal).toBe(2)
    const calls = { decisions: engine.decisions.length, runs: engine.contexts.length }
    const initial = await reading(service, conversation), currentView = await view(service, conversation), currentPage = await page(service, conversation)
    expect(currentView.reading).toEqual(initial); expect(initial).toMatchObject({ boundary: 0, completionCount: 2, unreadCount: 2, firstUnreadMessageId: b.id })
    const results = await service.handle('searchConversations', { keyword: 'SAME_BODY', scope: 'current', conversationId: conversation.id }) as ConversationSearchPage
    expect(new Set(results.results.map(result => result.id))).toEqual(new Set([a.id, b.id]))
    for (const result of results.results) expect(await service.handle('resolveConversationSearchTarget', result.target)).toMatchObject({ id: result.id, target: result.target, status: 'available' })
    expect(await reading(service, conversation)).toEqual(initial)
    const snapshot = identities(currentPage), gap = await observe(service, conversation, initial, [snapshot[1]])
    expect(gap).toMatchObject({ boundary: 0, sparseSeen: [2], unreadCount: 1, firstUnreadMessageId: b.id })
    const anchor = await service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: gap.epoch, expectedAnchorRevision: 0, messageId: a.id, offset: 123 }) as ConversationReadingState
    expect(anchor.revision).toBe(gap.revision); expect(anchor.unreadCount).toBe(1); expect(anchor.anchor).toEqual({ messageId: a.id, offset: 123, revision: 1 })
    const caughtUp = await observe(service, conversation, anchor, [snapshot[0]])
    expect(caughtUp).toMatchObject({ boundary: 2, sparseSeen: [], unreadCount: 0 }); expect(caughtUp.firstUnreadMessageId).toBeUndefined()
    expect(await observe(service, conversation, caughtUp, snapshot)).toEqual(caughtUp)
    expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
    expect((await detail(service, conversation)).workItems).toEqual([])
  })

  it('task draft is private and completed Work/message/event commit in the same transaction', async () => {
    const { service, engine, conversation } = await fixture(), started = barrier(), finish = barrier(); engine.kind = 'task'
    const original = engine.handler
    engine.handler = async context => { await context.onDelta('私有任务草稿'); started.release(); await finish.promise; await original(context) }
    await service.handle('sendMessage', { conversationId: conversation.id, content: '完成任务', requestId: 'task', mentionIds: [] }); await started.promise
    expect((await page(service, conversation)).items.some(item => item.message?.senderType === 'agent')).toBe(false)
    expect(await reading(service, conversation)).toMatchObject({ completionCount: 0, unreadCount: 0 })
    expect((await detail(service, conversation)).workItems![0].status).toBe('running')
    finish.release(); await idle(service, conversation)
    const current = await detail(service, conversation), event = (await storeOf(service).load<ConversationCompletion>('conversationCompletions'))[0]
    expect(current.workItems![0].status).toBe('delivered')
    expect(event.messageId).toBe(current.messages.find(message => message.senderType === 'agent' && message.status === 'completed')!.id)
    expect(await reading(service, conversation)).toMatchObject({ completionCount: 1, unreadCount: 1 })
    expect(engine.contexts).toHaveLength(1)
  })

  it.each(['chat', 'task'] as const)('a failed %s completion event rolls back the actual publication without retrying business', async kind => {
    const { service, engine, conversation } = await fixture(); engine.kind = kind
    const store = storeOf(service), transaction = store.transaction.bind(store)
    vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'conversationCompletions') throw new Error('completion rollback'); await tx.put(record) } })))
    await send(service, conversation, 'rollback')
    const current = await detail(service, conversation)
    expect(current.messages.some(message => message.senderType === 'agent' && message.status === 'completed')).toBe(false)
    expect(current.workItems?.some(work => work.status === 'delivered')).toBe(false)
    expect(current.runs.find(run => run.phase === 'execution')?.status).toBe('failed')
    expect(await store.load('conversationCompletions')).toEqual([])
    expect((await store.load<{ ordinal: number }>('conversationCompletionClocks')).every(clock => clock.ordinal === 0)).toBe(true)
    expect(engine.contexts).toHaveLength(1)
    vi.restoreAllMocks(); expect(await reading(service, conversation)).toMatchObject({ completionCount: 0, unreadCount: 0 })
  })

  it('current material bytes gate history/search/click and stale visible read/anchor facts', async () => {
    const { service, engine, conversation, root, dataPath } = await fixture()
    const source = join(root, 'PRIVATE_READ_CANARY.md'); await writeFile(source, 'PRIVATE_READ_CANARY 原件')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    engine.handler = async context => { await context.onDelta('PRIVATE_READ_CANARY 派生回复') }
    await service.handle('sendMessage', { conversationId: conversation.id, content: '参考材料', requestId: 'with-material', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }); await idle(service, conversation)
    const initial = await reading(service, conversation), currentPage = await page(service, conversation), seen = identities(currentPage)
    const before = await service.handle('searchConversations', { keyword: 'PRIVATE_READ_CANARY', scope: 'all' }) as ConversationSearchPage
    expect(before.results.map(result => result.kind).sort()).toEqual(['material', 'message'])
    expect(before.results.every(result => result.status === 'available')).toBe(true)
    await writeFile(join(materialDirectory(dataPath, conversation.id, material.id), 'original'), '外部修改不再是已提交原件')
    const invalidView = await view(service, conversation)
    expect(invalidView.messagePage.items.every(item => item.status === 'unavailable')).toBe(true)
    expect(invalidView.messages).toEqual([]); expect(JSON.stringify(invalidView.messagePage)).not.toContain('PRIVATE_READ_CANARY')
    const after = await service.handle('searchConversations', { keyword: 'PRIVATE_READ_CANARY', scope: 'all' }) as ConversationSearchPage
    expect(after.results).toHaveLength(2); expect(after.results.every(result => result.status === 'unavailable')).toBe(true)
    expect(JSON.stringify(after.results)).not.toContain('PRIVATE_READ_CANARY')
    for (const result of before.results) { const checked = await service.handle('resolveConversationSearchTarget', result.target) as ConversationSearchResult; expect(checked.status).toBe('unavailable'); expect(checked.excerpt).toBeUndefined(); expect(checked.name).toBeUndefined() }
    await expect(observe(service, conversation, initial, seen)).rejects.toThrow()
    await expect(service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: initial.epoch, expectedAnchorRevision: 0, messageId: seen[0].messageId, offset: 0 })).rejects.toThrow()
    expect(await reading(service, conversation)).toEqual(initial)
    expect(engine.contexts).toHaveLength(1)
  })

  it('material grant revision invalidates derived reading but preserves the user original under current authority', async () => {
    const { service, engine, conversation, root } = await fixture(), source = join(root, 'source.md'); await writeFile(source, 'REVISION_READ_CANARY')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'grant', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    engine.handler = async context => { await context.onDelta('REVISION_READ_CANARY 派生正文') }
    const submitted = await service.handle('sendMessage', { conversationId: conversation.id, content: '本人原请求', requestId: 'granted', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }) as Message
    await idle(service, conversation)
    const initial = await reading(service, conversation), snapshot = identities(await page(service, conversation))
    const updated = await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: [] }) as ConversationMaterial
    expect(updated.revision).toBe(material.revision + 1)
    const checked = await page(service, conversation)
    expect(checked.items.find(item => item.messageId === submitted.id)).toMatchObject({ status: 'available', message: { id: submitted.id, content: '本人原请求' } })
    expect(checked.items.find(item => item.messageId === snapshot[0].messageId)).toMatchObject({ status: 'unavailable' })
    expect(JSON.stringify(checked)).not.toContain('REVISION_READ_CANARY')
    await expect(observe(service, conversation, initial, snapshot)).rejects.toThrow('版本')
    const anchored = await service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: initial.epoch, expectedAnchorRevision: 0, messageId: submitted.id, offset: 0 }) as ConversationReadingState
    expect(anchored.revision).toBe(initial.revision); expect(anchored.unreadCount).toBe(1)
    expect(engine.contexts).toHaveLength(1)
  })

  it('registered artifact search and exact clicks verify real native publication bytes without marking adopted/read', async () => {
    const { service, engine, conversation } = await fixture(); engine.kind = 'task'
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
      try {
        const path = `self:/runs/${context.runId}/report.md`
        await runtime.tools.write_file.execute!({ path, content: '# 可检查原件\n\n真实报告。' }, invocation)
        const published = await runtime.tools.publish_artifact.execute!({ path, name: 'OWNER_REPORT.md' }, invocation) as { artifact: Artifact }
        await context.onDelta(`已交付成果 ${published.artifact.id}`)
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '报告已交付', evidence: [{ kind: 'artifact', reference: published.artifact.id! }] })
      } finally { await runtime.workspace.destroy() }
    }
    await send(service, conversation, 'real-artifact')
    const initial = await reading(service, conversation), results = await service.handle('searchConversations', { keyword: 'OWNER_REPORT', scope: 'current', conversationId: conversation.id, kinds: ['artifact'] }) as ConversationSearchPage
    expect(results.results).toHaveLength(1); const result = results.results[0]
    expect(result).toMatchObject({ kind: 'artifact', name: 'OWNER_REPORT.md', agentId: 'researcher', status: 'available' })
    expect(await service.handle('resolveConversationSearchTarget', result.target)).toMatchObject({ id: result.id, status: 'available', target: result.target })
    expect(await storeOf(service).load('artifactAdoptions')).toEqual([]); expect(await reading(service, conversation)).toEqual(initial)
    const artifact = (await detail(service, conversation)).artifacts.find(artifact => artifact.id === result.id)!
    await writeFile(artifact.path, '# 外部替换，不是登记原件')
    const after = await service.handle('resolveConversationSearchTarget', result.target) as ConversationSearchResult
    expect(after).toMatchObject({ id: result.id, status: 'unavailable', target: result.target }); expect(after.name).toBeUndefined(); expect(after.excerpt).toBeUndefined()
    const searched = await service.handle('searchConversations', { keyword: 'OWNER_REPORT', scope: 'all', kinds: ['artifact'] }) as ConversationSearchPage
    expect(searched.results[0]).toMatchObject({ id: result.id, status: 'unavailable' }); expect(searched.results[0].name).toBeUndefined()
    expect(await reading(service, conversation)).toEqual(initial); expect(engine.contexts).toHaveLength(1)
  })

  it('clear resets the original cleanup transaction and blocks old completion/anchor epochs across restart', async () => {
    const { service, conversation, dataPath } = await fixture(); await send(service, conversation, 'before-clear')
    const initial = await reading(service, conversation), snapshot = identities(await page(service, conversation)), state = await observe(service, conversation, initial, snapshot)
    await service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: state.epoch, expectedAnchorRevision: 0, messageId: snapshot[0].messageId, offset: 12 })
    const store = storeOf(service), transaction = store.transaction.bind(store)
    vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'conversationCompletionClocks' && (record.value as { epoch: number }).epoch > state.epoch) throw new Error('epoch rollback'); await tx.put(record) } })))
    await expect(service.handle('clearConversationHistory', { id: conversation.id, hide: false })).rejects.toThrow('epoch rollback')
    expect(await store.load('conversationCompletions')).toHaveLength(1)
    expect((await store.load<Message>('messages')).some(message => message.id === snapshot[0].messageId)).toBe(true)
    expect((await store.load<ConversationReadingState>('conversationReadingStates'))[0].boundary).toBe(1)
    vi.restoreAllMocks(); await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect(await store.load('conversationCompletions')).toEqual([]); expect(await store.load('conversationReadingStates')).toEqual([])
    expect((await store.load<{ epoch: number; ordinal: number }>('conversationCompletionClocks'))[0]).toMatchObject({ epoch: state.epoch + 1, ordinal: 0 })
    await service.close(); const restored = await open(dataPath)
    expect(await reading(restored.service, conversation)).toMatchObject({ epoch: state.epoch + 1, boundary: 0, completionCount: 0, unreadCount: 0, anchor: null })
    await expect(observe(restored.service, conversation, state, snapshot)).rejects.toThrow('迟到观测')
    await expect(restored.service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: state.epoch, expectedAnchorRevision: 1, messageId: snapshot[0].messageId, offset: 12 })).rejects.toThrow('迟到位置')
    await expect(restored.service.handle('resolveConversationSearchTarget', { kind: 'message', conversationId: conversation.id, messageId: snapshot[0].messageId })).rejects.toThrow('已被清理')
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  })

  it('different-root backup and restart retain only committed sparse reading and independent anchor without models', async () => {
    const { service, engine, conversation, root } = await fixture(); await send(service, conversation, 'one'); await send(service, conversation, 'two')
    const snapshot = identities(await page(service, conversation)), state = await reading(service, conversation), gap = await observe(service, conversation, state, [snapshot[1]])
    const saved = await service.handle('saveConversationAnchor', { conversationId: conversation.id, epoch: gap.epoch, expectedAnchorRevision: 0, messageId: snapshot[1].messageId, offset: 314 }) as ConversationReadingState
    const backup = join(root, 'backup'), restoredPath = join(root, 'restored')
    await service.backup(backup); await cp(backup, restoredPath, { recursive: true })
    const restored = await open(restoredPath)
    expect(await reading(restored.service, conversation)).toEqual(saved)
    expect(identities(await page(restored.service, conversation))).toEqual(snapshot)
    expect((await view(restored.service, conversation)).reading).toEqual(saved)
    await restored.service.close(); const restarted = await open(restoredPath)
    expect(await reading(restarted.service, conversation)).toEqual(saved)
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([]); expect(engine.contexts).toHaveLength(2)
  })

  it('bounded user browsing keeps old history independent from the model window and cannot invent legacy unread', async () => {
    const { service, conversation, dataPath } = await fixture(), store = storeOf(service)
    const messages: Message[] = Array.from({ length: 110 }, (_, index) => ({ id: `legacy-${index}`, conversationId: conversation.id, senderType: 'agent', senderId: 'researcher', senderName: '历史员工', content: `历史中文正文 ${index}`, status: 'completed', sequence: index + 1, createdAt: new Date(1_700_000_000_000 + index).toISOString() }))
    await store.write(messages.map(message => ({ collection: 'messages', id: message.id, value: message })))
    await service.close(); const restored = await open(dataPath)
    const current = await view(restored.service, conversation)
    expect(current.messages).toHaveLength(40); expect(current.messages.at(-1)?.id).toBe('legacy-109')
    expect((await detail(restored.service, conversation)).messages).toHaveLength(110)
    expect(current.reading).toMatchObject({ legacyCompletedUnknown: true, completionCount: 0, unreadCount: 0, boundary: 0 })
    expect(current.messagePage.items.every(item => !item.completion)).toBe(true)
    const earlier = await restored.service.handle('listConversationMessages', { conversationId: conversation.id, before: current.messagePage.beforeCursor }) as ConversationMessagePage
    expect(new Set([...earlier.items, ...current.messagePage.items].map(item => item.messageId)).size).toBe(80)
    for (const input of [{ conversationId: conversation.id, limit: 81 }, { conversationId: conversation.id, path: '/private' }]) await expect(restored.service.handle('getConversationView', input)).rejects.toThrow()
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
    expect((await detail(restored.service, conversation)).workItems).toEqual([])
  })

  it('metadata checks old exact delivery evidence without returning or walking all chat messages', async () => {
    const { service, engine, conversation } = await fixture(); engine.kind = 'task'; await send(service, conversation)
    const original = await detail(service, conversation), work = original.workItems![0], result = original.messages.find(message => work.resultMessageIds.includes(message.id))!, store = storeOf(service)
    expect(work.status).toBe('delivered')
    await store.write(Array.from({ length: 120 }, (_, index) => ({ collection: 'messages', id: `later-${index}`, value: { ...result, id: `later-${index}`, sequence: result.sequence + index + 1, content: 'UNREQUESTED_PRIVATE_HISTORY_CANARY' } })))
    expect((await page(service, conversation)).items.some(item => item.messageId === result.id)).toBe(false)
    const calls = { runs: engine.contexts.length, decisions: engine.decisions.length }
    vi.spyOn(service as unknown as { conversationMessages(id: string): Message[] }, 'conversationMessages').mockImplementation(() => { throw new Error('unbounded history must not be read') })
    const metadata = await service.handle('getConversationMetadata', { id: conversation.id }) as ConversationDetail
    expect(metadata.messages).toEqual([]); expect(metadata.workEvidenceVerified).toEqual({ [work.id]: true })
    expect(JSON.stringify(metadata)).not.toContain('UNREQUESTED_PRIVATE_HISTORY_CANARY')
    await store.write([{ collection: 'messages', id: result.id, value: { ...result, content: '原正文已变化' } }])
    expect((await service.handle('getConversationMetadata', { id: conversation.id }) as ConversationDetail).workEvidenceVerified?.[work.id]).toBe(false)
    expect({ runs: engine.contexts.length, decisions: engine.decisions.length }).toEqual(calls)
  })

  it('metadata cannot certify an old answer after its actual material grant is revoked', async () => {
    const { service, engine, conversation, root } = await fixture(); engine.kind = 'task'
    const source = join(root, 'evidence-source.md'); await writeFile(source, 'PRIVATE_EVIDENCE_SOURCE')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'evidence-material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    await service.handle('sendMessage', { conversationId: conversation.id, content: '完成真实材料工作', requestId: 'evidence-work', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }); await idle(service, conversation)
    const before = await service.handle('getConversationMetadata', { id: conversation.id }) as ConversationDetail, work = before.workItems![0]
    expect(before.messages).toEqual([]); expect(before.workEvidenceVerified?.[work.id]).toBe(true)
    const calls = engine.contexts.length
    await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: [] })
    const after = await service.handle('getConversationMetadata', { id: conversation.id }) as ConversationDetail
    expect(after.messages).toEqual([]); expect(after.workEvidenceVerified?.[work.id]).toBe(false)
    expect(engine.contexts).toHaveLength(calls)
  })

  it('execution labels use only bounded source-checked trigger excerpts and keep old identities', async () => {
    const { service, conversation, root, dataPath } = await fixture(), source = join(root, 'trigger-source.md')
    await writeFile(source, 'PRIVATE_TRIGGER_SOURCE')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'trigger-material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    const trigger = await service.handle('sendMessage', { conversationId: conversation.id, content: '当前明确请求', requestId: 'trigger-work', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }) as Message
    await idle(service, conversation)
    const store = storeOf(service), template = (await store.load<{ id: string; triggerMessageId: string }>('turns'))[0]
    const legacy = Array.from({ length: 90 }, (_, index): Message => ({ ...trigger, id: `old-trigger-${index}`, materialIds: undefined, materialSources: undefined, content: `${index === 89 ? '旧轮故障' : '历史明确请求'} ${index} ${'LONG_TRIGGER_CANARY_'.repeat(10)}`, sequence: index + 10, createdAt: new Date(1_700_000_000_000 + index).toISOString() }))
    await store.write(legacy.flatMap(message => [{ collection: 'messages', id: message.id, value: message }, { collection: 'turns', id: `old-turn-${message.id}`, value: { ...template, id: `old-turn-${message.id}`, triggerMessageId: message.id, createdAt: message.createdAt, status: 'completed', modelCalls: 0, publicMessages: 0 } }]))
    await service.close(); const restored = await open(dataPath)
    vi.spyOn(restored.service as unknown as { conversationMessages(id: string): Message[] }, 'conversationMessages').mockImplementation(() => { throw new Error('execution labels must not read all history') })
    const plain = await restored.service.handle('getConversationMetadata', { id: conversation.id }) as ConversationDetail
    expect(plain.triggerSummaries).toBeUndefined()
    const metadata = await restored.service.handle('getConversationMetadata', { id: conversation.id, includeTriggerSummaries: true }) as ConversationDetail
    expect(metadata.messages).toEqual([]); expect(Object.keys(metadata.triggerSummaries!)).toHaveLength(READING_LIMITS.triggerSummaries)
    expect(metadata.triggerSummaries?.['old-trigger-89']).toMatch(/^旧轮故障 89 /)
    expect(metadata.triggerSummaries?.['old-trigger-0']).toBeUndefined()
    expect(metadata.triggerSummaries?.[trigger.id]).toBe(trigger.content)
    expect(Object.values(metadata.triggerSummaries!).every(value => value.length <= READING_LIMITS.triggerSummaryCharacters)).toBe(true)
    expect(JSON.stringify(metadata.triggerSummaries)).not.toContain('LONG_TRIGGER_CANARY_'.repeat(4))
    await writeFile(join(materialDirectory(dataPath, conversation.id, material.id), 'original'), '原件已被外部修改')
    const invalid = await restored.service.handle('getConversationMetadata', { id: conversation.id, includeTriggerSummaries: true }) as ConversationDetail
    expect(invalid.triggerSummaries?.[trigger.id]).toBeUndefined(); expect(invalid.triggerSummaries?.['old-trigger-89']).toMatch(/^旧轮故障/)
    expect(invalid.messages).toEqual([])
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  })

  it('actual ACP final publication counts once; denied/cancelled runs cannot become completed reading', async () => {
    const { service, conversation, engine, dataPath } = await fixture()
    const profile = await service.handle('saveLaunchProfile', { name: 'ACP reading fixture', executable: process.execPath, args: [resolve('tests/fixtures/acp-agent.mjs')], useExistingLogin: false, hostAccessAcknowledged: true }) as LaunchProfile
    const tested = await service.handle('testLaunchProfile', { id: profile.id }) as LaunchProfile; expect(tested.verified?.version).toBe('1.0.0')
    const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, executionBackend: { kind: 'acp-local', profileId: profile.id } })
    await service.handle('sendExternalTask', { conversationId: conversation.id, content: 'complete actual external task', requestId: 'external' }); await idle(service, conversation)
    const first = await reading(service, conversation), current = await detail(service, conversation)
    expect(first).toMatchObject({ completionCount: 1, unreadCount: 1 }); expect(current.runs[0].status).toBe('completed')
    expect(identities(await page(service, conversation))[0].messageId).toBe(current.runs[0].messageId)
    expect(JSON.stringify(current)).not.toContain('PRIVATE_THOUGHT')
    await service.handle('sendExternalTask', { conversationId: conversation.id, content: 'complete actual external task', requestId: 'external' })
    expect(await reading(service, conversation)).toEqual(first); expect((await detail(service, conversation)).runs).toHaveLength(1)
    const store = storeOf(service), transaction = store.transaction.bind(store)
    vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'conversationCompletions') throw new Error('ACP completion rollback'); await tx.put(record) } })))
    await service.handle('sendExternalTask', { conversationId: conversation.id, content: 'complete once but fail publication', requestId: 'external-rollback' }); await idle(service, conversation)
    const failed = (await detail(service, conversation)).runs[1]
    expect(failed).toMatchObject({ status: 'failed', backend: { externalInvocations: 1 } }); expect(failed.error).toContain('ACP completion rollback')
    expect((await store.load<Message>('messages')).find(message => message.id === failed.messageId)).toBeUndefined()
    expect(await store.load('conversationCompletions')).toHaveLength(1)
    vi.restoreAllMocks()
    await service.handle('sendExternalTask', { conversationId: conversation.id, content: 'PERMISSION', requestId: 'denied' })
    await vi.waitFor(async () => expect((await service.handle('snapshot', undefined) as Snapshot).approvals).toHaveLength(1), { timeout: 5000 })
    const approval = (await service.handle('snapshot', undefined) as Snapshot).approvals[0]
    await service.handle('approve', { id: approval.id, approved: false }); await idle(service, conversation)
    await service.handle('sendExternalTask', { conversationId: conversation.id, content: 'WAIT_FOREVER', requestId: 'cancelled' }); await service.handle('cancelRun', { conversationId: conversation.id })
    expect((await detail(service, conversation)).runs.map(run => run.status)).toEqual(['completed', 'failed', 'failed', 'cancelled'])
    expect(await reading(service, conversation)).toEqual(first); expect(await storeOf(service).load('conversationCompletions')).toHaveLength(1)
    expect(engine.contexts).toEqual([]); expect(engine.decisions).toEqual([])
    await service.close(); const restored = await open(dataPath)
    expect(await reading(restored.service, conversation)).toEqual(first); expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  }, 15000)
})


describe('conversation cleanup feedback lifecycle', () => {
  it.each([true, false])('announces cleanup before invalidation and preserves the read guard until completion; hide=%s', async hide => {
    const { service, conversation, events } = await fixture()
    const entered = barrier(), release = barrier()
    const memory = (service as unknown as { memory: { invalidateConversation(agentId: string, conversationId: string): Promise<void> } }).memory
    const original = memory.invalidateConversation.bind(memory)
    vi.spyOn(memory, 'invalidateConversation').mockImplementationOnce(async (...args) => { entered.release(); await release.promise; await original(...args) })
    events.length = 0
    const operation = service.handle('clearConversationHistory', { id: conversation.id, hide })
    await entered.promise
    try {
      const start = events.findIndex(event => event.type === 'conversation:clearing' && event.conversationId === conversation.id)
      const changed = events.findIndex(event => event.type === 'changed' && event.conversationId === conversation.id)
      expect(start).toBeGreaterThanOrEqual(0); expect(changed).toBeGreaterThan(start)
      expect(events.some(event => event.type === 'conversation:cleared')).toBe(false)
      // Public reads are serialized behind the in-flight mutation; inspect the same
      // synchronous guard directly instead of deadlocking the deliberately held write.
      expect(() => (service as unknown as { getConversation(id: string): Conversation }).getConversation(conversation.id)).toThrow('此会话清理尚未完成')
    } finally { release.release() }
    await operation
    expect(events.filter(event => event.type === 'conversation:cleared')).toEqual([{ type: 'conversation:cleared', conversationId: conversation.id, hidden: hide }])
    expect((await detail(service, conversation)).conversation.list?.hidden ?? false).toBe(hide)
  })
  it('does not broadcast completion or unlock reads when real cleanup fails', async () => {
    const { service, conversation, events } = await fixture()
    const memory = (service as unknown as { memory: { invalidateConversation(): Promise<void> } }).memory
    vi.spyOn(memory, 'invalidateConversation').mockRejectedValueOnce(new Error('真实清理失败'))
    events.length = 0
    await expect(service.handle('clearConversationHistory', { id: conversation.id, hide: true })).rejects.toThrow('真实清理失败')
    expect(events.some(event => event.type === 'conversation:cleared')).toBe(false)
    await expect(detail(service, conversation)).rejects.toThrow('此会话清理尚未完成')
    await service.handle('clearConversationHistory', { id: conversation.id, hide: true })
    expect(events.filter(event => event.type === 'conversation:cleared')).toHaveLength(1)
  })
  it('reports post-commit maintenance failure separately without making deletion retryable', async () => {
    const { service, conversation, events } = await fixture()
    vi.spyOn(storeOf(service), 'compact').mockRejectedValueOnce(new Error('整理故障'))
    events.length = 0
    await expect(service.handle('clearConversationHistory', { id: conversation.id, hide: true })).resolves.toBeUndefined()
    expect((await detail(service, conversation)).conversation.list?.hidden).toBe(true)
    expect(events).toContainEqual({ type: 'conversation:cleared', conversationId: conversation.id, hidden: true })
    expect(events).toContainEqual({ type: 'runtime-error', error: '聊天记录已清理，但存储整理未完成：整理故障' })
  })
})
