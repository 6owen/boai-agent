/*
 * [INPUT]: 真实 AppService/SQLite 与可控离线 Engine、原调度器/Work/审批/成果资格。
 * [OUTPUT]: 四来源分页前筛选/稳定游标、同 hash 材料恢复与撤权时代隔离、原成果真实文件名/作者与失效原因、零执行读取、已发布问题关系/回答事务与未知幂等、原 task 预算接续和停止/副作用/清理重启边界。
 * [POS]: D5 待处理宿主验收；不调用商业模型，不替代 Electron BDD。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../src/runtime/service'
import { ProductStore, type RecordTransaction } from '../src/runtime/adapters/storage/product-store'
import { Inbox } from '../src/runtime/modules/inbox/inbox'
import { WorkRepository } from '../src/runtime/modules/collaboration/work-repository'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { materialDirectory } from '../src/runtime/modules/materials/material-files'
import type { ConversationMaterial, MaterialPreview } from '../src/shared/domain/materials'
import { workEvidenceError } from '../src/runtime/modules/collaboration/work-protocol'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, InboxItem, InboxPage, Message, ParticipationDecision, Snapshot, WorkItem, WorkExecution, WorkBudget } from '../src/shared/domain'
import type { ArtifactAcceptance } from '../src/shared/domain/artifacts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
class FakeEngine implements AgentEngine {
  decisions: EngineContext[] = []
  contexts: EngineContext[] = []
  action: 'ask' | 'reply' = 'ask'
  kind: 'chat' | 'task' = 'chat'
  handler = async (context: EngineContext) => { await context.onDelta(this.action === 'ask' ? '请明确交付给谁？' : '已按原问题补充交付。'); await context.onUsage?.({ inputTokens: 5, outputTokens: 3, totalTokens: 8 }); if (this.kind === 'task' && this.action === 'reply') await context.onWorkOutcome?.({ disposition: 'delivered', summary: '已交付', evidence: [{ kind: 'answer', reference: '已按原问题补充交付。' }] }) }
  async decide(context: EngineContext): Promise<ParticipationDecision> { this.decisions.push(context); return context.participation?.hasRespondedInTurn ? { action: 'pass', observedThroughSequence: context.participation.observedThroughSequence } : { action: this.action, responseKind: this.kind, ...(this.kind === 'task' ? { work: { key: 'original', scope: '原始目标', deliverable: '原始交付' } } : {}), observedThroughSequence: context.participation!.observedThroughSequence } }
  async run(context: EngineContext) { this.contexts.push(context); await this.handler(context) }
  async test() { return 'ok' }
}
async function open(dataPath: string, engine = new FakeEngine()) {
  const service = new AppService({ dataPath, engine, secrets, emit: () => {} }); cleanups.push(() => service.close()); await service.init(); return { service, engine }
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-inbox-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const dataPath = join(root, 'data'), current = await open(dataPath)
  const connection = await current.service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test-model' }) as Connection
  for (const agent of (await current.service.handle('snapshot', undefined) as Snapshot).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await current.service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test-model' })
  }
  const conversation = await current.service.handle('createConversation', { kind: 'direct', title: '原问题聊天', agentIds: ['researcher'] }) as Conversation
  return { root, dataPath, conversation, ...current }
}
const storeOf = (service: AppService) => (service as unknown as { store: ProductStore }).store
const detail = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
const list = (service: AppService, input = {}) => service.handle('listInbox', input) as Promise<InboxPage>
async function idle(service: AppService, conversation: Conversation) { await vi.waitFor(async () => expect((await detail(service, conversation)).turns!.every(turn => ['completed', 'waiting_user', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true), { timeout: 5000, interval: 10 }) }
async function ask(service: AppService, conversation: Conversation, key = 'original') {
  const original = await service.handle('sendMessage', { conversationId: conversation.id, content: '原始用户目标', requestId: key, mentionIds: [] }) as Message
  await idle(service, conversation)
  const question = (await list(service, { kind: 'question' })).items.find(item => item.conversationId === conversation.id)!
  expect(question?.question?.canReply).toBe(true)
  return { original, question }
}
const reply = (item: InboxItem, requestId = 'answer') => ({ questionId: item.question!.id, expectedRevision: item.question!.revision, content: '交付给本人。', requestId })

describe('D5 original question ownership and safe continuation', () => {
  it('does not infer a pending question from question text or a task dependency wait', async () => {
    const { service, engine, conversation } = await fixture(); engine.action = 'reply'
    engine.handler = async context => { await context.onDelta('普通对话：你好吗？') }
    await service.handle('sendMessage', { conversationId: conversation.id, content: '你好', requestId: 'plain', mentionIds: [] }); await idle(service, conversation)
    expect((await list(service)).items).toEqual([])
    expect(workEvidenceError({ disposition: 'waiting', summary: '等待依赖', userQuestion: '你的答案？' }, { content: '你的答案？', artifactIds: [] }, true)).toContain('不能解除工作依赖')
    expect(workEvidenceError({ disposition: 'waiting', summary: '等待', userQuestion: '未发布的问题' }, { content: '不同正文', artifactIds: [] })).toContain('公开正文')
  })

  it('publishes the explicit chat question relation atomically and reads it without new model/work', async () => {
    const { service, engine, conversation } = await fixture(); const { question } = await ask(service, conversation)
    const before = { decisions: engine.decisions.length, contexts: engine.contexts.length }
    const rows = await storeOf(service).load<{ userQuestion?: { messageId: string } }>('decisions')
    expect(rows.some(row => row.userQuestion?.messageId === question.messageId)).toBe(true)
    expect((await detail(service, conversation)).workItems).toEqual([])
    for (let i = 0; i < 3; i++) expect(await service.handle('getInboxItem', { id: question.id })).toMatchObject({ messageId: question.messageId, question: { id: question.question!.id } })
    expect({ decisions: engine.decisions.length, contexts: engine.contexts.length }).toEqual(before)
  })

  it('plain chat never answers an old question; explicit reply commits its exact relation and remains chat', async () => {
    const { service, engine, conversation } = await fixture(); const { question } = await ask(service, conversation)
    engine.action = 'reply'
    await service.handle('sendMessage', { conversationId: conversation.id, content: '不相关交流', requestId: 'unrelated', mentionIds: [] }); await idle(service, conversation)
    expect(await service.handle('getInboxItem', { id: question.id })).not.toBeNull()
    const accepted = await service.handle('replyInboxQuestion', reply(question)) as Message; await idle(service, conversation)
    expect(accepted.inboxReply).toEqual({ questionId: question.question!.id, questionRevision: question.question!.revision, questionMessageId: question.messageId })
    expect(accepted.replyToMessageId).toBe(question.messageId)
    expect(await service.handle('getInboxItem', { id: question.id })).toBeNull()
    expect((await detail(service, conversation)).workItems).toEqual([])
    expect(engine.contexts.at(-1)?.continuation?.replyToTurnIds).toEqual([question.turnId])
  })

  it('unknown response is reconciled by the original key with no repeated model or changed payload', async () => {
    const { service, engine, conversation } = await fixture(); const { question } = await ask(service, conversation); engine.action = 'reply'
    const originalHandle = service.handle.bind(service)
    const drop = vi.spyOn(service, 'handle').mockImplementation(async (method, input) => { const result = await originalHandle(method, input); if (method === 'replyInboxQuestion') throw new Error('response lost after commit'); return result })
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow('response lost')
    drop.mockRestore(); await idle(service, conversation)
    const received = await service.handle('getMessageReceipt', { requestId: 'answer' }) as Message
    const calls = engine.contexts.length, decisions = engine.decisions.length
    expect(await service.handle('replyInboxQuestion', reply(question))).toEqual(received)
    expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
    await expect(service.handle('replyInboxQuestion', { ...reply(question), content: 'different' })).rejects.toThrow('不同补充')
    await expect(service.handle('replyInboxQuestion', reply(question, 'new-key'))).rejects.toThrow('问题已回答')
  })

  it('a failed answer transaction leaves no orphan user message/receipt or answered question', async () => {
    const { service, conversation } = await fixture(); const { question } = await ask(service, conversation)
    const store = storeOf(service), transaction = store.transaction.bind(store), messages = (await detail(service, conversation)).messages.length
    vi.spyOn(store, 'transaction').mockImplementation(operation => transaction(tx => operation({ ...tx, put: async record => { if (record.collection === 'messages' && (record.value as Message).inboxReply) throw new Error('answer rollback'); await tx.put(record) } })))
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow('answer rollback')
    vi.restoreAllMocks()
    expect((await detail(service, conversation)).messages).toHaveLength(messages)
    expect(await service.handle('getMessageReceipt', { requestId: 'answer' })).toBeNull()
    expect((await service.handle('getInboxItem', { id: question.id }) as InboxItem).question!.canReply).toBe(true)
  })

  it('task ask has no tools and the explicit answer retains original Work/budget, cumulative unknown usage and absolute deadline without another decision model', async () => {
    const { service, engine, conversation } = await fixture(); engine.kind = 'task'
    engine.handler = async context => { expect(context.resources).toEqual([]); expect(context.workspace).toBeUndefined(); expect(context.createTeam).toBeUndefined(); await expect(context.onArtifact!({ name: 'forbidden.md', path: '/no', size: 1 })).rejects.toThrow('不允许发布'); await context.onDelta('请明确交付给谁？') }
    const { original, question } = await ask(service, conversation)
    const before = (await detail(service, conversation)), work = before.workItems![0], budget = before.workBudgets![0]
    expect(work.status).toBe('waiting'); expect(work.sourceMessageId).toBe(original.id)
    expect(work.requiresReview).toBe(false); expect(budget.usageIncomplete).toBe(true)
    const decisionCalls = engine.decisions.length
    engine.action = 'reply'; engine.handler = async context => { expect(context.continuation?.originalRequestId).toBe(original.id); expect(context.work?.id).toBe(work.id); await context.onDelta('已按原问题补充交付。'); await context.onUsage?.({ inputTokens: 5, outputTokens: 3, totalTokens: 8 }); await context.onWorkOutcome!({ disposition: 'delivered', summary: '交付', evidence: [{ kind: 'answer', reference: '已按原问题补充交付。' }] }) }
    const accepted = await service.handle('replyInboxQuestion', reply(question)) as Message; await idle(service, conversation)
    const after = await detail(service, conversation)
    expect(accepted.inboxReply?.workId).toBe(work.id)
    expect(after.workItems).toHaveLength(1); expect(after.workItems![0]).toMatchObject({ id: work.id, budgetId: budget.id, sourceMessageId: original.id, status: 'delivered' })
    expect(after.workBudgets![0]).toMatchObject({ id: budget.id, deadlineAt: budget.deadlineAt, runs: budget.runs + 1, modelCalls: budget.modelCalls + 1, usageIncomplete: true })
    expect(after.workBudgets![0].usage.totalTokens).toBe((budget.usage.totalTokens ?? 0) + 8)
    expect(engine.decisions).toHaveLength(decisionCalls)
  })

  it.each(['requiresReview', 'pendingEffect', 'stopped', 'version', 'budget', 'dependency'] as const)('refuses %s original task without accepting a message or resetting budget', async boundary => {
    const { service, engine, conversation } = await fixture(); engine.kind = 'task'; const { question } = await ask(service, conversation)
    const store = storeOf(service), initial = await detail(service, conversation), work = initial.workItems![0], budget = initial.workBudgets![0]
    await store.transaction(async tx => {
      const current = (await tx.get<WorkItem>('workItems', work.id))!
      if (boundary === 'requiresReview') current.requiresReview = true
      if (boundary === 'stopped') { current.status = 'cancelled'; current.cancellationCause = 'user' }
      if (boundary === 'version') current.version++
      if (boundary === 'dependency') current.dependsOnWorkIds = ['another-work']
      if (boundary === 'pendingEffect') { const execution = (await tx.list<WorkExecution>('workExecutions'))[0]; execution.pendingEffects = 1; await tx.put({ collection: 'workExecutions', id: execution.id, value: execution }) }
      if (boundary === 'budget') { const current = (await tx.get<WorkBudget>('workBudgets', budget.id))!; current.modelCalls = current.maxModelCalls; await tx.put({ collection: 'workBudgets', id: current.id, value: current }) }
      await tx.put({ collection: 'workItems', id: current.id, value: current })
    })
    const calls = engine.contexts.length
    expect((await service.handle('getInboxItem', { id: question.id }) as InboxItem).question!.canReply).toBe(false)
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow()
    expect(await service.handle('getMessageReceipt', { requestId: 'answer' })).toBeNull(); expect(engine.contexts).toHaveLength(calls)
    expect((await detail(service, conversation)).workBudgets![0].deadlineAt).toBe(budget.deadlineAt)
  })

  it('restart only projects the interrupted original task and never silently resumes or replays the answered key', async () => {
    const { service, engine, conversation, dataPath } = await fixture(); engine.kind = 'task'; const { question } = await ask(service, conversation)
    await service.close(); const restored = await open(dataPath)
    const current = await restored.service.handle('getInboxItem', { id: question.id }) as InboxItem
    expect(current.question!.canReply).toBe(false); expect(current.work?.status).toBe('interrupted')
    await expect(restored.service.handle('replyInboxQuestion', reply(question))).rejects.toThrow('中断')
    expect(restored.engine.decisions).toEqual([]); expect(restored.engine.contexts).toEqual([])
  })

  it('safe task continuation sees the actual completed file receipt and does not replay its side effect', async () => {
    const { service, engine, conversation } = await fixture(); engine.kind = 'task'; engine.action = 'reply'
    let writes = 0, path = ''
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
      try {
        writes++; await runtime.tools.write_file.execute!({ path: `self:/runs/${context.runId}/draft.md`, content: 'original committed file bytes' }, invocation)
        path = join(context.workspace!.runPath, 'draft.md')
        await context.onTool({ id: 'actual-file-write', name: 'write_file', status: 'completed', detail: path, createdAt: new Date().toISOString() })
        await context.onDelta('请明确交付给谁？')
        await context.onWorkOutcome!({ disposition: 'waiting', summary: '需要具体补充', userQuestion: '请明确交付给谁？' })
      } finally { await runtime.workspace.destroy() }
    }
    const { question } = await ask(service, conversation)
    engine.handler = async context => {
      expect(context.completedWorkTools?.flatMap(receipt => receipt.tools).map(tool => tool.id)).toContain('actual-file-write')
      expect(await readFile(path, 'utf8')).toBe('original committed file bytes')
      await context.onDelta('已按原问题补充交付。'); await context.onWorkOutcome!({ disposition: 'delivered', summary: '交付', evidence: [{ kind: 'answer', reference: '已按原问题补充交付。' }] })
    }
    await service.handle('replyInboxQuestion', reply(question)); await idle(service, conversation)
    expect(writes).toBe(1); expect(await readFile(path, 'utf8')).toBe('original committed file bytes')
  })

  it('current live command approval disappears after restart and cannot be approved through a stale inbox item', async () => {
    const { service, engine, conversation, dataPath } = await fixture(); engine.kind = 'task'; engine.action = 'reply'
    const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'researcher')!
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
    await service.handle('saveAgent', { ...input, allowCommands: true })
    engine.handler = async context => { await context.approveCommand('pwd', context.workspace!.runPath); context.signal.throwIfAborted(); await context.onDelta('done') }
    await service.handle('sendMessage', { conversationId: conversation.id, content: '需要命令', requestId: 'command', mentionIds: [] })
    let approval!: InboxItem
    await vi.waitFor(async () => { approval = (await list(service, { kind: 'approval' })).items[0]; expect(approval?.approval?.command).toBe('pwd') }, { timeout: 5000, interval: 10 })
    expect(approval.runId).toBeDefined(); expect(approval.approval?.cwd).toContain('runs')
    await service.close(); const restored = await open(dataPath)
    expect(await restored.service.handle('getInboxItem', { id: approval.id })).toBeNull()
    await expect(restored.service.handle('approve', { id: approval.approvalId, approved: true })).rejects.toThrow()
    expect(restored.engine.contexts).toEqual([])
  })

  it('external material edit removes cached private question text and blocks the original answer', async () => {
    const { service, engine, conversation, root, dataPath } = await fixture()
    const source = join(root, 'source.md'); await writeFile(source, 'PRIVATE_QUESTION_CANARY')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    engine.handler = async context => { await context.onDelta('PRIVATE_QUESTION_CANARY：请本人补充用途。') }
    await service.handle('sendMessage', { conversationId: conversation.id, content: '参考原件', requestId: 'private-original', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }); await idle(service, conversation)
    const question = (await list(service, { kind: 'question' })).items[0]
    expect(question.summary).toContain('PRIVATE_QUESTION_CANARY')
    await writeFile(join(materialDirectory(dataPath, conversation.id, material.id), 'original'), 'external modification')
    const checked = await service.handle('getInboxItem', { id: question.id }) as InboxItem
    expect(JSON.stringify(checked)).not.toContain('PRIVATE_QUESTION_CANARY'); expect(checked.question?.canReply).toBe(false)
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow()
    expect(await service.handle('getMessageReceipt', { requestId: 'answer' })).toBeNull()
  })

  it.each(['chat', 'task'] as const)('same-hash material repair restores the original %s question and its fixed reply identity', async kind => {
    const { service, engine, conversation, root, dataPath } = await fixture(); engine.kind = kind
    const source = join(root, 'source.md'); await writeFile(source, '原问题的同一份材料')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    await service.handle('sendMessage', { conversationId: conversation.id, content: '参考原件', requestId: 'private-original', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }); await idle(service, conversation)
    const question = (await list(service, { kind: 'question' })).items[0], before = await detail(service, conversation)
    const original = join(materialDirectory(dataPath, conversation.id, material.id), 'original'), moved = join(root, 'original-away')
    await rename(original, moved)
    await expect(service.handle('getMaterialPreview', { id: material.id })).rejects.toThrow()
    const unavailable = await service.handle('getMaterialPreparation', { requestId: 'material' }) as ConversationMaterial
    expect(unavailable.status).toBe('unavailable')
    expect(await service.handle('getInboxItem', { id: question.id })).toBeNull()
    await rename(moved, original)
    const calls = { decisions: engine.decisions.length, runs: engine.contexts.length }
    const repaired = await service.handle('recheckMaterial', { id: material.id, expectedRevision: unavailable.revision }) as MaterialPreview
    expect(repaired.material).toMatchObject({ contentHash: material.contentHash, readableRevisionFrom: material.revision, revision: material.revision + 2 })
    const current = await service.handle('getInboxItem', { id: question.id }) as InboxItem
    expect(current).toMatchObject({ id: question.id, messageId: question.messageId, question: { id: question.question!.id, revision: question.question!.revision, canReply: true } })
    expect((await list(service, { kind: 'question', limit: 1 })).items.map(item => item.id)).toEqual([question.id])
    expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
    engine.action = 'reply'
    const accepted = await service.handle('replyInboxQuestion', reply(question)) as Message; await idle(service, conversation)
    expect(accepted.inboxReply?.questionId).toBe(question.question!.id)
    if (kind === 'task') {
      const after = await detail(service, conversation)
      expect(after.workItems).toHaveLength(1)
      expect(after.workItems![0]).toMatchObject({ id: before.workItems![0].id, budgetId: before.workItems![0].budgetId, status: 'delivered' })
      expect(after.workBudgets![0]).toMatchObject({ id: before.workBudgets![0].id, deadlineAt: before.workBudgets![0].deadlineAt })
    }
    expect(await service.handle('getInboxItem', { id: question.id })).toBeNull()
  })

  it('a restored material never revives an old question after authorization was revoked and granted again', async () => {
    const { service, engine, conversation, root, dataPath } = await fixture()
    const source = join(root, 'source.md'); await writeFile(source, '仅原授权时代可读')
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: 'material', authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    await service.handle('sendMessage', { conversationId: conversation.id, content: '参考原件', requestId: 'private-original', mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }); await idle(service, conversation)
    const question = (await list(service, { kind: 'question' })).items[0]
    const original = join(materialDirectory(dataPath, conversation.id, material.id), 'original'), moved = join(root, 'original-away')
    const repair = async () => {
      await rename(original, moved)
      await expect(service.handle('getMaterialPreview', { id: material.id })).rejects.toThrow()
      const unavailable = await service.handle('getMaterialPreparation', { requestId: 'material' }) as ConversationMaterial
      await rename(moved, original)
      return (await service.handle('recheckMaterial', { id: material.id, expectedRevision: unavailable.revision }) as MaterialPreview).material
    }
    const repaired = await repair()
    expect((await service.handle('getInboxItem', { id: question.id }) as InboxItem).question?.canReply).toBe(true)
    const revoked = await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: repaired.revision, authorizedAgentIds: [] }) as ConversationMaterial
    expect(revoked.readableRevisionFrom).toBeUndefined()
    expect(await service.handle('getInboxItem', { id: question.id })).toBeNull()
    await expect(service.handle('recheckMaterial', { id: material.id, expectedRevision: revoked.revision })).rejects.toThrow('撤权')
    const granted = await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: revoked.revision, authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    const calls = { decisions: engine.decisions.length, runs: engine.contexts.length }
    const repairedAgain = await repair()
    expect(repairedAgain.readableRevisionFrom).toBe(granted.revision)
    expect(await service.handle('getInboxItem', { id: question.id })).toBeNull()
    expect((await list(service, { kind: 'question' })).items).toEqual([])
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow()
    expect(await service.handle('getMessageReceipt', { requestId: 'answer' })).toBeNull()
    expect({ decisions: engine.decisions.length, runs: engine.contexts.length }).toEqual(calls)
  })

  it('a real backup into a different root keeps the explicit chat question/receipt without model replay', async () => {
    const { service, engine, conversation, root } = await fixture(); const { question } = await ask(service, conversation); engine.action = 'reply'
    const accepted = await service.handle('replyInboxQuestion', reply(question)) as Message; await idle(service, conversation)
    engine.action = 'ask'; const { question: unanswered } = await ask(service, conversation, 'second-question')
    const backup = join(root, 'backup'), restoredPath = join(root, 'restore')
    await service.backup(backup); await cp(backup, restoredPath, { recursive: true })
    const restored = await open(restoredPath)
    expect(await restored.service.handle('getMessageReceipt', { requestId: 'answer' })).toEqual(accepted)
    expect((await restored.service.handle('getInboxItem', { id: unanswered.id }) as InboxItem).question?.canReply).toBe(true)
    expect(await restored.service.handle('replyInboxQuestion', reply(question))).toEqual(accepted)
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  })

  it('clear removes private question data, retains cleared reply key and restores only new exchanges', async () => {
    const { service, engine, conversation, dataPath } = await fixture(); const { question } = await ask(service, conversation); engine.action = 'reply'
    await service.handle('replyInboxQuestion', reply(question)); await idle(service, conversation)
    await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect((await list(service)).items).toEqual([]); expect(await storeOf(service).load('decisions')).toEqual([])
    await expect(service.handle('replyInboxQuestion', reply(question))).rejects.toThrow('已清理')
    await service.close(); const restored = await open(dataPath)
    await expect(restored.service.handle('replyInboxQuestion', reply(question))).rejects.toThrow('已清理')
    expect(restored.engine.contexts).toEqual([])
  })
})

describe('D5 authoritative SQL before bounded pagination', () => {
  async function database() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-inbox-sql-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
    const store = new ProductStore(join(root, 'product.sqlite')); await store.init(); cleanups.push(() => store.close())
    await store.write([{ collection: 'conversations', id: 'chat', value: { id: 'chat', title: '中文项目', agentIds: ['owner'] } }, { collection: 'agents', id: 'owner', value: { id: 'owner', name: '负责人', active: true } }])
    return store
  }
  const failure = (id: string, time: string, status = 'failed') => ({ collection: 'workItems', id, value: { id, conversationId: 'chat', ownerAgentId: 'owner', status, updatedAt: time, deliverable: '中文交付', outcome: { summary: '需人工核对' } } })

  it('old unresolved work cannot be hidden by recent completed records; filters precede LIMIT and tie cursors never overlap', async () => {
    const store = await database()
    await store.write(Array.from({ length: 140 }, (_, i) => failure(`done-${i}`, '2026-10-01T12:00:00.000Z', 'delivered')))
    await store.write(['a', 'b', 'c', 'd'].map(id => failure(id, '2026-09-01T12:00:00.000Z')))
    const first = await store.inboxRows({ kind: 'failure', search: '负责人', limit: 2 })
    expect(first.map(row => row.id)).toEqual(['failure:work:d', 'failure:work:c'])
    await store.write([failure('new', '2026-10-01T13:00:00.000Z')])
    const second = await store.inboxRows({ kind: 'failure', search: '负责人', limit: 2, before: { time: first[1].time, id: first[1].id } })
    expect(second.map(row => row.id)).toEqual(['failure:work:b', 'failure:work:a'])
    expect(await store.inboxRows({ kind: 'failure', search: '无此内容', limit: 1 })).toEqual([])
  })

  it('only current approvals and explicit acceptance qualify; unadopted artifacts/requiresReview and dependency waiting alone are not acceptance/question', async () => {
    const store = await database()
    await store.write([
      { collection: 'artifacts', id: 'ordinary', value: { id: 'ordinary', conversationId: 'chat', requiresReview: true } },
      { collection: 'workItems', id: 'dependency', value: { id: 'dependency', conversationId: 'chat', status: 'waiting', requiresReview: true } },
      { collection: 'runs', id: 'live', value: { id: 'live', status: 'waiting_approval', agentId: 'owner', createdAt: '2026-10-01T00:00:00.000Z' } },
      { collection: 'runs', id: 'finished', value: { id: 'finished', status: 'completed' } },
      { collection: 'approvals', id: 'current', value: { id: 'current', runId: 'live', conversationId: 'chat', command: 'pwd' } },
      { collection: 'approvals', id: 'old', value: { id: 'old', runId: 'finished', conversationId: 'chat', command: 'old secret' } },
      { collection: 'artifactAcceptances', id: 'explicit', value: { id: 'explicit', conversationId: 'chat', artifactId: 'explicit', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' } },
    ])
    expect((await store.inboxRows({ limit: 30 })).map(row => row.id).sort()).toEqual(['acceptance:explicit', 'approval:current'])
  })

  it('cleared chats and revoked material versions are excluded in SQL; work failures do not duplicate their same failed turn', async () => {
    const store = await database()
    await store.write([failure('work', '2026-10-01T00:00:00.000Z'), { collection: 'turns', id: 'turn', value: { id: 'turn', conversationId: 'chat', workId: 'work', status: 'failed', createdAt: '2026-10-01T00:00:00.000Z' } }])
    expect((await store.inboxRows({ limit: 20 })).map(row => row.id)).toEqual(['failure:work:work'])
    await store.transaction(async tx => { const work = (await tx.get<WorkItem>('workItems', 'work'))!; work.materialSources = [{ id: 'private', conversationId: 'chat', revision: 1, contentHash: 'x', parseVersion: 'text-v1' }]; await tx.put({ collection: 'workItems', id: work.id, value: work }) })
    expect(await store.inboxRows({ limit: 20 })).toEqual([])
    await store.write([{ collection: 'conversationCleanup', id: 'chat', value: { id: 'chat' } }])
    expect(await store.inboxRows({ limit: 20 })).toEqual([])
  })

  it('material repair filters older grants, future and malformed revisions before the page limit', async () => {
    const store = await database()
    await store.write([{ collection: 'materials', id: 'private', value: { id: 'private', conversationId: 'chat', status: 'ready', messageId: 'sent', revision: 4, readableRevisionFrom: 2, contentHash: 'same-bytes', parseVersion: 'text-v1' } }])
    await store.write([1, 5, 2.5, '2', 2].map((revision, index) => {
      const row = failure(`work-${index}`, index === 4 ? '2026-09-01T00:00:00.000Z' : '2026-10-01T00:00:00.000Z')
      return { ...row, value: { ...row.value, materialSources: [{ id: 'private', conversationId: 'chat', revision, contentHash: 'same-bytes', parseVersion: 'text-v1' }] } }
    }))
    expect((await store.inboxRows({ kind: 'failure', limit: 1 })).map(row => row.id)).toEqual(['failure:work:work-4'])
  })

  it('fresh acceptance invalidation remains visible with the fixed version/hash and an explicit reason', async () => {
    const store = await database()
    const acceptance: ArtifactAcceptance = { id: 'a', artifactId: 'a', logicalArtifactId: 'family', contentVersion: 2, contentHash: 'f'.repeat(64), conversationId: 'chat', userId: 'user', requestId: 'request', revision: 1, status: 'pending', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }
    await store.write([{ collection: 'artifactAcceptances', id: 'a', value: acceptance }, { collection: 'artifacts', id: 'a', value: { id: 'a', conversationId: 'chat', name: '真实报告.md', ownerAgentId: 'owner', sourceWorkId: 'original-work', contentVersion: 2, contentHash: acceptance.contentHash } }])
    const inbox = new Inbox(store, new WorkRepository(store), { approval: () => undefined, validateQuestion: async () => {}, acceptance: async () => ({ ...acceptance, status: 'unavailable', reason: '原件外部修改' }) })
    expect((await inbox.list({ limit: 1, kind: 'acceptance', search: '真实报告.md' })).items[0]).toMatchObject({ status: 'unavailable', reason: '原件外部修改', summary: '真实报告.md · 第 2 版待本人验收', agentId: 'owner', agentName: '负责人', workId: 'original-work', artifact: { id: 'a', name: '真实报告.md', contentHash: acceptance.contentHash, contentVersion: 2 } })
    expect((await inbox.list({ limit: 1, kind: 'acceptance', search: '不存在.md' })).items).toEqual([])
  })
})
