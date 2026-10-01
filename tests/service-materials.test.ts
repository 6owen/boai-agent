/*
 * [INPUT]: 真实 AppService/SQLite/材料原件、可控 FakeEngine 与原生任务文件工具。
 * [OUTPUT]: 准备零消息/工作、发送事务回滚与未知回执核对、数量/版本/范围、原文/派生回复/Work 元数据/成果授权与动态来源继承、撤权取消、跨聊天记忆/根投影、hash 清理/外改冲突重启修复及仅已发材料备份迁移回归。
 * [POS]: D1 材料宿主集成验收；不调用真实模型，不替代 renderer 文件选择或 Electron BDD。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../src/runtime/service'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { createTaskRuntime } from '../src/runtime/adapters/mastra/task-runtime'
import { materialDirectory } from '../src/runtime/modules/materials/material-files'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, MemoryView, Message, ParticipationDecision, Snapshot } from '../src/shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '../src/shared/domain/materials'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
class FakeEngine implements AgentEngine {
  contexts: EngineContext[] = []
  decisions: EngineContext[] = []
  responseKind: 'chat' | 'task' = 'chat'
  extractMemory?: AgentEngine['extractMemory']
  report: AgentEngine['report'] = async (_context, draft) => ({ action: 'publish', text: draft.text })
  work = (context: EngineContext) => ({ key: `material-${context.agent.id}`, scope: '处理当前明确授权材料', deliverable: '可检查的材料处理结果' })
  handler = async (context: EngineContext) => { await context.onDelta('已收到当前请求。') }
  async decide(context: EngineContext): Promise<ParticipationDecision> {
    this.decisions.push(context)
    return context.participation?.hasRespondedInTurn
      ? { action: 'pass', observedThroughSequence: context.participation.observedThroughSequence }
      : { action: 'reply', responseKind: this.responseKind, observedThroughSequence: context.participation!.observedThroughSequence, ...(this.responseKind === 'task' ? { work: this.work(context) } : {}) }
  }
  async run(context: EngineContext) { this.contexts.push(context); await this.handler(context) }
  async test() { return 'ok' }
}
async function open(dataPath: string, engine = new FakeEngine()) {
  const service = new AppService({ dataPath, engine, secrets, emit: () => {} })
  cleanups.push(() => service.close()); await service.init()
  return { service, engine }
}
const snapshot = (service: AppService) => service.handle('snapshot', undefined) as Promise<Snapshot>
const detail = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
const storeOf = (service: AppService) => (service as unknown as { store: ProductStore }).store
const body = (context: EngineContext) => context.messages.map(message => message.content).join('\n') + '\n' + context.bootstrap!.instructions + JSON.stringify(context.memory)
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-service-materials-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const dataPath = join(root, 'data'), current = await open(dataPath)
  const connection = await current.service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test-model' }) as Connection
  for (const agent of (await snapshot(current.service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = agent
    await current.service.handle('saveAgent', { ...definition, connectionId: connection.id, modelId: 'test-model' })
  }
  const direct = await current.service.handle('createConversation', { kind: 'direct', title: '材料单聊', agentIds: ['researcher'] }) as Conversation
  const group = await current.service.handle('createConversation', { kind: 'group', title: '材料群聊', agentIds: ['researcher', 'writer'], mode: 'mention' }) as Conversation
  return { root, dataPath, direct, group, ...current }
}
async function prepare(service: AppService, root: string, conversation: Conversation, content = '材料原文 MATERIAL_CANARY', authorizedAgentIds = ['researcher']) {
  const requestId = crypto.randomUUID(), source = join(root, `${requestId}.md`); await writeFile(source, content)
  const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId, authorizedAgentIds }) as ConversationMaterial
  expect(material.status).toBe('ready')
  return { material, requestId, source }
}
function request(conversation: Conversation, material?: ConversationMaterial, overrides: Record<string, unknown> = {}) {
  return { conversationId: conversation.id, content: material ? '' : '继续当前材料处理', mentionIds: conversation.kind === 'group' ? ['researcher', 'writer'] : [], requestId: crypto.randomUUID(), ...(material ? { materialSelections: [{ id: material.id, revision: material.revision }] } : {}), ...overrides }
}
async function settled(service: AppService, conversation: Conversation) {
  await vi.waitFor(async () => {
    const view = await detail(service, conversation)
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  }, { timeout: 5000, interval: 10 })
  // The durable per-chat queue finishes after its turn reaches a terminal state.
  await new Promise(resolve => setTimeout(resolve, 20))
}
async function send(service: AppService, conversation: Conversation, input: ReturnType<typeof request>) {
  const message = await service.handle('sendMessage', input) as Message; await settled(service, conversation)
  return message
}

describe('service material delivery boundaries', () => {
  it('prepares one private material idempotently without messages, work or model calls', async () => {
    const { service, engine, root, dataPath, group } = await fixture()
    const { material, requestId, source } = await prepare(service, root, group)
    expect(await service.handle('prepareMaterial', { conversationId: group.id, path: source, requestId, authorizedAgentIds: ['researcher'] })).toEqual(material)
    expect(await service.handle('getMaterialPreparation', { requestId })).toEqual(material)
    expect(await service.handle('getMaterialPreview', { id: material.id, expectedRevision: material.revision })).toMatchObject({ material, text: '材料原文 MATERIAL_CANARY' })
    expect(await readFile(join(materialDirectory(dataPath, group.id, material.id), 'original'), 'utf8')).toBe('材料原文 MATERIAL_CANARY')
    expect(await readdir(group.workspacePath)).toEqual([])
    const view = await detail(service, group)
    expect(view.messages).toEqual([]); expect(view.runs).toEqual([]); expect(view.turns).toEqual([]); expect(view.workItems).toEqual([])
    expect(engine.contexts).toEqual([]); expect(engine.decisions).toEqual([])
    expect(await storeOf(service).load('materials')).toHaveLength(1)
    expect(JSON.stringify(await storeOf(service).load('materials'))).not.toContain(source)
  })

  it('rolls back message, receipt and material attachment together and permits an explicit same-key retry', async () => {
    const { service, engine, root, direct } = await fixture(); const { material } = await prepare(service, root, direct)
    const store = storeOf(service), original = store.transaction.bind(store)
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(action => original(tx => action({ ...tx, put: async record => {
      if (armed && record.collection === 'messageReceipts') { armed = false; throw new Error('message receipt transaction failed') }
      await tx.put(record)
    } })))
    const input = request(direct, material)
    await expect(service.handle('sendMessage', input)).rejects.toThrow('message receipt transaction failed'); fault.mockRestore()
    for (const collection of ['messages', 'requests', 'messageReceipts', 'turns', 'runs', 'workItems']) expect(await store.load(collection)).toEqual([])
    expect(await store.load('materials')).toEqual([material]); expect((await detail(service, direct)).messages).toEqual([])
    expect(engine.contexts).toEqual([]); expect(engine.decisions).toEqual([])
    expect(await service.handle('getMessageReceipt', { requestId: input.requestId })).toBeNull()
    const message = await send(service, direct, input)
    expect(message).toMatchObject({ content: '', materialIds: [material.id] })
    expect(await store.load('materials')).toEqual([expect.objectContaining({ id: material.id, messageId: message.id })]); expect(engine.contexts).toHaveLength(1)
  })

  it('reconciles a lost response through a read-only receipt and never reschedules duplicates across restart', async () => {
    const { service, engine, root, dataPath, direct } = await fixture(); const { material, source } = await prepare(service, root, direct)
    const input = request(direct, material)
    const lostResponse = async () => { await service.handle('sendMessage', input); throw new Error('response lost after service accepted') }
    await expect(lostResponse()).rejects.toThrow('response lost after service accepted'); await settled(service, direct)
    const view = await detail(service, direct), committed = view.messages.find(message => message.senderType === 'user')!
    const calls = engine.contexts.length, decisions = engine.decisions.length
    for (let index = 0; index < 3; index++) expect(await service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(committed)
    expect(await service.handle('getMessageReceipt', { requestId: 'never-submitted' })).toBeNull(); expect(await detail(service, direct)).toEqual(view)
    const duplicates = await Promise.all(Array.from({ length: 3 }, () => service.handle('sendMessage', input)))
    expect(duplicates).toEqual([committed, committed, committed])
    await expect(service.handle('sendMessage', { ...input, content: 'different body' })).rejects.toThrow('requestId')
    expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
    expect(await storeOf(service).load('messageReceipts')).toEqual([expect.objectContaining({ id: input.requestId, messageId: committed.id, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })])
    await rm(source); await service.close()
    const restarted = await open(dataPath)
    expect(await restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(committed)
    expect(await restarted.service.handle('sendMessage', input)).toEqual(committed)
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
    expect((await detail(restarted.service, direct)).messages.filter(message => message.senderType === 'user')).toEqual([committed])
  })

  it('reconciles a SQLite commit whose receipt was lost before host installation without replaying the model', async () => {
    const { service, engine, root, dataPath, direct } = await fixture(); const { material } = await prepare(service, root, direct)
    const store = storeOf(service), original = store.transaction.bind(store), input = request(direct, material)
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      let accepted = false
      const result = await original(tx => action({ ...tx, put: async record => { await tx.put(record); if (armed && record.collection === 'messageReceipts') accepted = true } }))
      if (accepted) { armed = false; throw new Error('SQLite receipt lost after commit') }
      return result
    })
    await expect(service.handle('sendMessage', input)).rejects.toThrow('SQLite receipt lost after commit'); fault.mockRestore()
    const committed = (await store.load<Message>('messages'))[0]
    expect(committed).toMatchObject({ materialIds: [material.id], content: '' })
    expect(await store.load('materials')).toEqual([expect.objectContaining({ id: material.id, messageId: committed.id })])
    expect(await store.load('messageReceipts')).toHaveLength(1)
    await expect(service.handle('getMessageReceipt', { requestId: input.requestId })).rejects.toThrow('重启核对')
    await expect(service.handle('sendMessage', input)).rejects.toThrow('重启核对')
    expect((await detail(service, direct)).messages).toEqual([]); expect(await store.load('messages')).toHaveLength(1)
    expect(engine.contexts).toEqual([]); expect(engine.decisions).toEqual([])
    await service.close(); const restarted = await open(dataPath)
    expect(await restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(committed)
    expect(await restarted.service.handle('sendMessage', input)).toEqual(committed)
    expect((await detail(restarted.service, direct)).messages).toEqual([committed])
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
  })

  it('rejects stale material revisions and foreign-chat selections before creating a message', async () => {
    const { service, engine, root, direct, group } = await fixture(); const { material } = await prepare(service, root, group)
    const updated = await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: ['writer'] }) as ConversationMaterial
    expect(updated.revision).toBeGreaterThan(material.revision)
    await expect(service.handle('sendMessage', request(group, material))).rejects.toThrow('材料版本已更新')
    await expect(service.handle('sendMessage', request(direct, updated))).rejects.toThrow('材料不属于当前聊天')
    await expect(service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: ['researcher'] })).rejects.toThrow('材料版本已更新')
    const source = join(root, 'outside-member.txt'); await writeFile(source, 'not authorized')
    await expect(service.handle('prepareMaterial', { conversationId: direct.id, path: source, requestId: 'foreign-member', authorizedAgentIds: ['writer'] })).rejects.toThrow('不属于当前聊天')
    expect(await storeOf(service).load('messages')).toEqual([]); expect(await storeOf(service).load('messageReceipts')).toEqual([])
    expect((await storeOf(service).load<ConversationMaterial>('materials'))[0].messageId).toBeUndefined(); expect(engine.contexts).toEqual([])
  })

  it('enforces count, aggregate material size and body limits without partial attachment', async () => {
    const { service, engine, root, direct } = await fixture(); const prepared: ConversationMaterial[] = []
    for (const text of ['甲'.repeat(MATERIAL_LIMITS.characters), '乙'.repeat(MATERIAL_LIMITS.characters), '丙', '丁']) prepared.push((await prepare(service, root, direct, text)).material)
    const selections = prepared.map(material => ({ id: material.id, revision: material.revision }))
    await expect(service.handle('sendMessage', request(direct, undefined, { content: '', materialSelections: selections }))).rejects.toThrow()
    await expect(service.handle('sendMessage', request(direct, undefined, { content: '', materialSelections: selections.slice(0, 3) }))).rejects.toThrow('32000')
    await expect(service.handle('sendMessage', request(direct, prepared[0], { content: '正文'.repeat(MATERIAL_LIMITS.messageTextCharacters) }))).rejects.toThrow('12000')
    expect((await storeOf(service).load<ConversationMaterial>('materials')).every(material => !material.messageId)).toBe(true)
    expect(await storeOf(service).load('messages')).toEqual([]); expect(await storeOf(service).load('messageReceipts')).toEqual([]); expect(engine.contexts).toEqual([])
  })

  it('exposes direct originals only in their chat and excludes unauthorized group originals and derived replies', async () => {
    const { service, engine, root, direct, group } = await fixture(); const own = await prepare(service, root, direct, '单聊正文 DIRECT_PRIVATE_CANARY')
    await send(service, direct, request(direct, own.material)); expect(body(engine.contexts.at(-1)!)).toContain('DIRECT_PRIVATE_CANARY')
    const shared = await prepare(service, root, group, '群限定正文 GROUP_PRIVATE_CANARY')
    engine.handler = async context => { await context.onDelta(context.agent.id === 'researcher' ? 'GROUP_DERIVED_CANARY' : '未获得该材料内容。') }
    const first = await send(service, group, request(group, shared.material))
    const firstContexts = engine.contexts.filter(context => context.triggerMessageId === first.id)
    const allowed = firstContexts.find(context => context.agent.id === 'researcher')!, denied = firstContexts.find(context => context.agent.id === 'writer')!
    expect(body(allowed)).toContain('GROUP_PRIVATE_CANARY'); expect(allowed.materialRefs).toEqual([expect.objectContaining({ id: shared.material.id, revision: shared.material.revision })])
    expect(body(denied)).not.toContain('GROUP_PRIVATE_CANARY'); expect(body(denied)).not.toContain('DIRECT_PRIVATE_CANARY'); expect(denied.materialRefs).toEqual([])
    expect(denied.messages.find(message => message.id === first.id)?.materialIds).toEqual([])
    expect((await detail(service, group)).messages.find(message => message.senderId === 'researcher')).toMatchObject({ status: 'completed', materialSources: [expect.objectContaining({ id: shared.material.id })] })
    const next = await send(service, group, request(group, undefined, { mentionIds: ['writer'] }))
    const followup = engine.contexts.find(context => context.triggerMessageId === next.id && context.agent.id === 'writer')!
    expect(body(followup)).not.toContain('GROUP_PRIVATE_CANARY'); expect(body(followup)).not.toContain('GROUP_DERIVED_CANARY')
  })

  it('guards published results and revoked old-run files through the real service file callback', async () => {
    const { service, engine, root, group } = await fixture(); const { material } = await prepare(service, root, group, '限定文件 FILE_PRIVATE_CANARY')
    engine.responseKind = 'task'
    let sourceRun = '', sharedFile = '', artifactId = ''
    const denials: string[] = [], listings: unknown[] = [], invocation = { requestContext: new RequestContext(), observe: noopObserve }
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context)
      try {
        if (!sourceRun) {
          sourceRun = context.runId
          await runtime.tools.write_file.execute!({ path: `self:/runs/${context.runId}/report.md`, content: 'FILE_PRIVATE_CANARY' }, invocation)
          await runtime.tools.publish_artifact.execute!({ path: `self:/runs/${context.runId}/report.md` }, invocation)
          const artifact = (await detail(service, group)).artifacts[0]
          expect(artifact.id).toBeTypeOf('string')
          sharedFile = `shared:/artifacts/${basename(artifact.path)}`; artifactId = artifact.id!
          await context.onDelta('已生成当前材料结果。')
          await context.onWorkOutcome!({ disposition: 'delivered', summary: '材料结果', evidence: [{ kind: 'artifact', reference: artifactId }] })
        } else {
          listings.push(await runtime.tools.list_files.execute!({ path: 'shared:/artifacts' }, invocation))
          const target = context.agent.id === 'writer' ? sharedFile : `self:/runs/${sourceRun}/report.md`
          try { await runtime.tools.read_file.execute!({ path: target }, invocation) } catch (error) { denials.push((error as Error).message) }
          await context.onDelta('材料文件未获准读取。'); await context.onWorkOutcome!({ disposition: 'no_progress', summary: '缺少材料授权' })
        }
      } finally { await runtime.workspace.destroy() }
    }
    await send(service, group, request(group, material, { mentionIds: ['researcher'] }))
    await send(service, group, request(group, undefined, { mentionIds: ['writer'] }))
    await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: ['writer'] })
    await send(service, group, request(group, undefined, { mentionIds: ['researcher'] }))
    expect(denials).toEqual(['Task file read access is not authorized', 'Task file read access is not authorized']); expect(listings).toEqual([[], []])
    expect((await detail(service, group)).artifacts).toEqual([expect.objectContaining({ id: artifactId, materialSources: [expect.objectContaining({ id: material.id })] })])
  })

  it('inherits material sources from a shared artifact into the current snapshot, reply, work and new artifact', async () => {
    const { service, engine, root, group } = await fixture(); const { material } = await prepare(service, root, group, '动态成果 DYNAMIC_FILE_CANARY', ['researcher', 'writer'])
    engine.responseKind = 'task'
    let sourceFile = '', secondRun = ''
    const invocation = { requestContext: new RequestContext(), observe: noopObserve }
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context)
      try {
        if (context.agent.id === 'writer') {
          expect(context.materialRefs).toEqual([]); expect(body(context)).not.toContain('DYNAMIC_FILE_CANARY')
          const read = await runtime.tools.read_file.execute!({ path: sourceFile }, invocation)
          expect(read).toMatchObject({ content: 'DYNAMIC_FILE_CANARY' })
          expect(context.materialRefs).toEqual([expect.objectContaining({ id: material.id, revision: material.revision })])
          secondRun = context.runId
        }
        await runtime.tools.write_file.execute!({ path: `self:/runs/${context.runId}/report.md`, content: 'DYNAMIC_FILE_CANARY' }, invocation)
        await runtime.tools.publish_artifact.execute!({ path: `self:/runs/${context.runId}/report.md` }, invocation)
        const artifact = (await detail(service, group)).artifacts.find(item => item.runId === context.runId)!
        sourceFile ||= `shared:/artifacts/${basename(artifact.path)}`
        await context.onDelta(context.agent.id === 'writer' ? 'DYNAMIC_DERIVED_CANARY' : '已发布第一份成果。')
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '当前成果', evidence: [{ kind: 'artifact', reference: artifact.id! }] })
      } finally { await runtime.workspace.destroy() }
    }
    await send(service, group, request(group, material, { mentionIds: ['researcher'] }))
    // Fill the bounded message window with the actual new user request so the source is acquired by the file read.
    await send(service, group, request(group, undefined, { content: '普通任务内容'.repeat(8000).slice(0, 47800), mentionIds: ['writer'] }))
    const view = await detail(service, group)
    expect(secondRun, JSON.stringify(view.runs.map(run => ({ agentId: run.agentId, phase: run.phase, status: run.status, error: run.error })))).not.toBe('')
    const sources = [expect.objectContaining({ id: material.id, revision: material.revision, contentHash: material.contentHash })]
    expect(view.messages.find(message => message.runId === secondRun)).toMatchObject({ content: 'DYNAMIC_DERIVED_CANARY', materialSources: sources })
    expect(view.artifacts.find(artifact => artifact.runId === secondRun)).toMatchObject({ materialSources: sources })
    expect(view.workItems?.find(work => work.ownerAgentId === 'writer')).toMatchObject({ materialSources: sources })
    expect((await storeOf(service).load<{ id: string; materialRefs?: unknown[] }>('snapshots')).find(snapshot => snapshot.id === secondRun)).toMatchObject({ materialRefs: sources })
  })

  it('hides private work metadata from ungranted employees and rejects delegation while preserving ordinary work visibility', async () => {
    const { service, engine, root, group } = await fixture(); const { material } = await prepare(service, root, group, '工作材料 WORK_SOURCE_CANARY')
    engine.responseKind = 'task'
    engine.work = context => ({ key: `material-${context.agent.id}`, scope: context.agent.id === 'researcher' ? 'PRIVATE_WORK_SCOPE_CANARY' : 'PUBLIC_WORK_SCOPE_CANARY', deliverable: context.agent.id === 'researcher' ? 'PRIVATE_WORK_DELIVERABLE_CANARY' : '普通结果' })
    const rejectedDelegations: string[] = []
    engine.handler = async context => {
      if (context.agent.id === 'researcher') {
        try { await context.delegateWork!({ key: 'private-child', ownerAgentId: 'writer', scope: 'PRIVATE_CHILD_SCOPE_CANARY', deliverable: 'PRIVATE_CHILD_RESULT_CANARY' }) }
        catch (error) { rejectedDelegations.push((error as Error).message) }
      }
      await context.onDelta('当前工作已记录。')
      await context.onWorkOutcome!({ disposition: 'progress', summary: context.agent.id === 'researcher' ? 'PRIVATE_WORK_OUTCOME_CANARY' : '普通工作进展' })
    }
    const first = await send(service, group, request(group, material, { mentionIds: ['researcher'] }))
    const privateWork = (await detail(service, group)).workItems!.find(work => work.sourceMessageId === first.id)!
    expect(privateWork).toMatchObject({ scope: 'PRIVATE_WORK_SCOPE_CANARY', materialSources: [expect.objectContaining({ id: material.id })] })
    const second = await send(service, group, request(group, undefined, { mentionIds: ['writer'] }))
    for (const context of [...engine.decisions, ...engine.contexts].filter(context => context.agent.id === 'writer' && context.triggerMessageId === second.id)) {
      const metadata = JSON.stringify(context.workItems)
      expect(metadata).not.toContain('PRIVATE_WORK_SCOPE_CANARY'); expect(metadata).not.toContain('PRIVATE_WORK_DELIVERABLE_CANARY'); expect(metadata).not.toContain('PRIVATE_WORK_OUTCOME_CANARY'); expect(metadata).not.toContain('PRIVATE_CHILD_SCOPE_CANARY')
    }
    expect(rejectedDelegations).toHaveLength(1); expect(rejectedDelegations[0]).toContain('材料')
    expect((await detail(service, group)).workItems!.some(work => work.parentWorkId === privateWork.id)).toBe(false)
    const third = await send(service, group, request(group, undefined, { mentionIds: ['researcher'] }))
    expect(JSON.stringify(engine.decisions.find(context => context.triggerMessageId === third.id)!.workItems)).toContain('PUBLIC_WORK_SCOPE_CANARY')
  })

  it('revokes an active task and rejects later model reservations, file tools and publication', async () => {
    const { service, engine, root, group } = await fixture(); const { material } = await prepare(service, root, group, '活动任务 ACTIVE_PRIVATE_CANARY')
    engine.responseKind = 'task'
    let entered: EngineContext | undefined, release!: () => void
    const held = new Promise<void>(resolve => { release = resolve }); cleanups.push(async () => release())
    const rejected: string[] = []
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
      try {
        await runtime.tools.write_file.execute!({ path: `self:/runs/${context.runId}/report.md`, content: 'ACTIVE_PRIVATE_CANARY' }, invocation)
        entered = context; await held
        for (const [name, attempt] of [
          ['model reservation', () => context.onAdditionalModelCall!()],
          ['model start', () => context.onModelCallStarted!('after-revocation', 'task')],
          ['file', () => runtime.tools.read_file.execute!({ path: `self:/runs/${context.runId}/report.md` }, invocation)],
          ['publication', () => runtime.tools.publish_artifact.execute!({ path: `self:/runs/${context.runId}/report.md` }, invocation)],
        ] as const) { try { await attempt() } catch { rejected.push(name) } }
        await context.onDelta('撤权后的迟到正文 ACTIVE_PRIVATE_CANARY')
      } finally { await runtime.workspace.destroy() }
    }
    await service.handle('sendMessage', request(group, material, { mentionIds: ['researcher'] }))
    await vi.waitFor(() => expect(entered).toBeDefined(), { timeout: 5000 })
    await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: ['writer'] })
    expect(entered!.signal.aborted).toBe(true); release()
    await vi.waitFor(() => expect(rejected).toEqual(['model reservation', 'model start', 'file', 'publication']), { timeout: 5000 }); await settled(service, group)
    const view = await detail(service, group)
    expect(view.runs.filter(run => run.phase === 'execution')).toEqual([expect.objectContaining({ status: 'cancelled' })]); expect(view.artifacts).toEqual([])
    expect(view.messages.some(message => message.senderType === 'agent' && message.status === 'completed' && message.content.includes('ACTIVE_PRIVATE_CANARY'))).toBe(false)
  })

  it('keeps extracted and raw material memory out of the same employee’s other chats and global projections', async () => {
    const { service, engine, root, dataPath, direct, group } = await fixture(); const { material } = await prepare(service, root, group, '长期材料 MATERIAL_MEMORY_CANARY')
    engine.handler = async context => { await context.onDelta('派生资料 MATERIAL_MEMORY_CANARY') }
    engine.extractMemory = async context => context.conversation.id === group.id ? [{ content: '材料结论 MATERIAL_MEMORY_CANARY', sourceMessageIds: [context.triggerMessageId!] }] : []
    await send(service, group, request(group, material, { mentionIds: ['researcher'] }))
    const memory = await service.handle('getMemory', { agentId: 'researcher', scope: 'employee' }) as MemoryView
    expect(memory.entries).toContainEqual(expect.objectContaining({ content: '材料结论 MATERIAL_MEMORY_CANARY', useScope: 'conversation', conversationId: group.id }))
    engine.handler = async context => { await context.onDelta('普通其他聊天回复。') }
    await send(service, direct, request(direct, undefined, { content: '继续材料结论' }))
    expect(body(engine.contexts.at(-1)!)).not.toContain('MATERIAL_MEMORY_CANARY'); expect(engine.contexts.at(-1)!.materialRefs).toEqual([])
    await service.handle('regenerateAgentViews', { agentId: 'researcher' })
    for (const name of ['MEMORY.md', 'USER.md']) expect(await readFile(join(dataPath, 'agents/researcher/workspace', name), 'utf8')).not.toContain('MATERIAL_MEMORY_CANARY')
    await service.close(); const restarted = await open(dataPath)
    await send(restarted.service, direct, request(direct, undefined, { content: '继续材料结论' })); expect(body(restarted.engine.contexts.at(-1)!)).not.toContain('MATERIAL_MEMORY_CANARY')
  })

  it('does not recall material observations in another chat even when no memory extraction ran', async () => {
    const { service, engine, root, direct, group } = await fixture(); const { material } = await prepare(service, root, group, '即时资料 RAW_MATERIAL_CANARY')
    engine.handler = async context => { await context.onDelta('即时派生 RAW_MATERIAL_DERIVED_CANARY') }
    await send(service, group, request(group, material, { mentionIds: ['researcher'] }))
    expect((await service.handle('getMemory', { agentId: 'researcher', scope: 'employee' }) as MemoryView).entries).toEqual([])
    expect(await storeOf(service).load('memoryObservations')).toEqual([expect.objectContaining({ ownerAgentId: 'researcher', conversationId: group.id, useScope: 'conversation' })])
    engine.handler = async context => { await context.onDelta('其他聊天的普通答复。') }
    await send(service, direct, request(direct, undefined, { content: '继续即时资料的结论' }))
    expect(body(engine.contexts.at(-1)!)).not.toContain('RAW_MATERIAL_CANARY'); expect(body(engine.contexts.at(-1)!)).not.toContain('RAW_MATERIAL_DERIVED_CANARY')
    expect(engine.contexts.at(-1)!.materialRefs).toEqual([])
  })

  it('backs up only sent material and restores hashes, grants, revisions and links at a different data root without replay', async () => {
    const { service, root, dataPath, direct, group } = await fixture()
    const sent = await prepare(service, root, group, '备份原件 BACKUP_MATERIAL_CANARY')
    const draft = await prepare(service, root, direct, '尚未发送 PRIVATE_DRAFT_CANARY')
    const granted = await service.handle('setMaterialAuthorization', { id: sent.material.id, expectedRevision: sent.material.revision, authorizedAgentIds: ['researcher', 'writer'] }) as ConversationMaterial
    const input = request(group, granted, { mentionIds: ['researcher'] }), message = await send(service, group, input)
    const committed = (await storeOf(service).load<ConversationMaterial>('materials')).find(material => material.id === granted.id)!
    const backupRoot = join(root, 'backup'), restoredRoot = join(root, 'relocated-restore')
    await service.backup(backupRoot)
    expect(await readFile(join(materialDirectory(backupRoot, group.id, granted.id), 'original'), 'utf8')).toBe('备份原件 BACKUP_MATERIAL_CANARY')
    await expect(readFile(join(materialDirectory(backupRoot, direct.id, draft.material.id), 'original'))).rejects.toThrow()
    expect(await service.handle('getMaterialPreview', { id: draft.material.id })).toMatchObject({ material: draft.material, text: '尚未发送 PRIVATE_DRAFT_CANARY' })
    await rm(sent.source); await rm(draft.source); await cp(backupRoot, restoredRoot, { recursive: true })
    const restored = await open(restoredRoot)
    expect(restoredRoot).not.toBe(dataPath); expect(restoredRoot).not.toBe(backupRoot)
    expect(await restored.service.handle('getMaterialPreview', { id: granted.id, expectedRevision: granted.revision })).toEqual({ material: committed, text: '备份原件 BACKUP_MATERIAL_CANARY' })
    expect(await storeOf(restored.service).load('materials')).toEqual([committed])
    expect(await restored.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await restored.service.handle('getMaterialPreparation', { requestId: draft.requestId })).toBeNull()
    await expect(restored.service.handle('prepareMaterial', { conversationId: direct.id, path: draft.source, requestId: draft.requestId, authorizedAgentIds: ['researcher'] })).rejects.toThrow('材料已清理')
    expect(await restored.service.handle('prepareMaterial', { conversationId: group.id, path: sent.source, requestId: sent.requestId, authorizedAgentIds: ['researcher'] })).toEqual(committed)
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
    expect((await detail(restored.service, group)).runs.every(run => run.toolEvents.length === 0)).toBe(true)
    await restored.service.close(); const restarted = await open(restoredRoot)
    expect(await restarted.service.handle('getMaterialPreview', { id: granted.id })).toEqual({ material: committed, text: '备份原件 BACKUP_MATERIAL_CANARY' })
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
  })

  it('clears tracked private originals and preserves tombstones across restart without replay', async () => {
    const { service, engine, root, dataPath, direct } = await fixture(); const { material } = await prepare(service, root, direct)
    const input = request(direct, material); await send(service, direct, input)
    const original = join(materialDirectory(dataPath, direct.id, material.id), 'original'), calls = engine.contexts.length
    await service.handle('clearConversationHistory', { id: direct.id, hide: false }); await expect(readFile(original)).rejects.toThrow()
    expect((await detail(service, direct)).messages).toEqual([])
    await expect(service.handle('sendMessage', input)).rejects.toThrow('清理'); await expect(service.handle('getMessageReceipt', { requestId: input.requestId })).rejects.toThrow('清理')
    await expect(service.handle('getMaterialPreview', { id: material.id })).rejects.toThrow(); expect(engine.contexts).toHaveLength(calls)
    await service.close(); const restarted = await open(dataPath)
    await expect(restarted.service.handle('sendMessage', input)).rejects.toThrow('清理'); await expect(restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).rejects.toThrow('清理')
    expect((await detail(restarted.service, direct)).messages).toEqual([]); expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
  })

  it('retains external changes through restart, fences only the conflicted chat and permits repaired cleanup', async () => {
    const { service, engine, root, dataPath, direct, group } = await fixture(); const { material } = await prepare(service, root, direct)
    const input = request(direct, material); await send(service, direct, input)
    const original = join(materialDirectory(dataPath, direct.id, material.id), 'original')
    await writeFile(original, 'EXTERNAL_MODIFICATION_MUST_SURVIVE')
    await expect(service.handle('clearConversationHistory', { id: direct.id, hide: false })).rejects.toThrow('材料清理未完成')
    expect(await readFile(original, 'utf8')).toBe('EXTERNAL_MODIFICATION_MUST_SURVIVE')
    expect(await storeOf(service).load('materials')).toEqual([expect.objectContaining({ id: material.id, status: 'removed', authorizedAgentIds: [], error: '聊天记录已清理' })])
    expect(await storeOf(service).load('materialCleanups')).toEqual([expect.objectContaining({ id: material.id, status: 'conflict', error: expect.stringContaining('外部修改') })])
    await expect(service.handle('getMaterialPreview', { id: material.id })).rejects.toThrow(); expect(engine.contexts).toHaveLength(1)
    await service.close(); const restarted = await open(dataPath)
    expect((await snapshot(restarted.service)).conversations).toContainEqual(expect.objectContaining({ id: direct.id }))
    expect(await readFile(original, 'utf8')).toBe('EXTERNAL_MODIFICATION_MUST_SURVIVE')
    await expect(detail(restarted.service, direct)).rejects.toThrow('清理')
    await expect(restarted.service.handle('sendMessage', request(direct))).rejects.toThrow('清理')
    await expect(restarted.service.handle('getMaterialPreview', { id: material.id })).rejects.toThrow()
    await send(restarted.service, group, request(group, undefined, { mentionIds: ['writer'] }))
    expect(restarted.engine.contexts).toHaveLength(1)
    await writeFile(original, '材料原文 MATERIAL_CANARY')
    await restarted.service.handle('clearConversationHistory', { id: direct.id, hide: false })
    await expect(readFile(original)).rejects.toThrow(); expect((await detail(restarted.service, direct)).messages).toEqual([])
    await expect(restarted.service.handle('sendMessage', input)).rejects.toThrow('清理')
  })
})
