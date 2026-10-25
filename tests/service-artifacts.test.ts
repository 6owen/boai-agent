/*
 * [OUTPUT]: 指定另一员工修订时按修订员工目录批准，原作者许可不外借，旧成果和外部原件保持。
 * [OUTPUT]: 2026-10-11 第13组原生生产合同回归与旧阶段兼容分开；夹具成功不冒充真实模型验收。
 * [INPUT]: 真实 AppService/SQLite/受管成果原件、受控模型判断与原生 createTaskRuntime 文件发布。
 * [OUTPUT]: 复制未提交时不伪造历史成果、宿主核读后不二次读取外改、独立成果身份/明确修订版本、新根预算与目标隔离、核心新请求模型回退而旧回执只读、消息关系/最终回复事务与未知提交核对、发布工具权限和逐工具原版 hash 门禁、采用幂等与历史、材料授权失效、hash 清理冲突及封闭 SQLite 的异路径备份恢复不重放验收。
 * [POS]: D2 成果宿主集成验收；不调用真实模型，不替代 renderer 交互或 Electron BDD。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Artifact, AutomationDefinition, AutomationOccurrence, AutomationsView, Connection, Conversation, ConversationDetail, Message, ParticipationDecision, Snapshot, WorkIntent, WorkItem } from '../packages/shared/src/domain'
import type { ArtifactAdoptionInput, ArtifactAdoptionReceipt, ArtifactPreview, ArtifactRevisionInput, ArtifactRevisionRequest, ArtifactVersion } from '../packages/shared/src/domain/artifacts'
import type { ConversationMaterial } from '../packages/shared/src/domain/materials'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
const row = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const V1 = '# 报告\n\n结论为第一版。\n验收尚待补充。'
const V2 = '# 报告\n\n结论为第二版。\n验收：检查原件和来源。'
class FakeEngine implements AgentEngine {
  contexts: EngineContext[] = []
  decisions: EngineContext[] = []
  defaultTarget = 'researcher'
  responseKind: 'chat' | 'task' = 'task'
  report: AgentEngine['report'] = async (_context, draft) => ({ action: 'publish', text: draft.text })
  work = (_context: EngineContext): WorkIntent => ({ key: 'model-selected-key', scope: '处理本次明确请求', deliverable: '可检查的 Markdown 报告' })
  handler = async (context: EngineContext) => { await context.onDelta('普通回复。') }
  async decide(context: EngineContext): Promise<ParticipationDecision> {
    this.decisions.push(context)
    const target = context.artifactRevision?.targetAgentId ?? this.defaultTarget
    return context.agent.id !== target || context.participation?.hasRespondedInTurn
      ? { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
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
const preview = (service: AppService, artifact: ArtifactVersion) => service.handle('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash }) as Promise<ArtifactPreview>
const storeOf = (service: AppService) => (service as unknown as { store: ProductStore }).store
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-service-artifacts-'))); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const dataPath = join(root, 'data'), current = await open(dataPath)
  const connection = await current.service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test-model' }) as Connection
  for (const agent of (await snapshot(current.service)).agents.filter(agent => ['researcher', 'writer'].includes(agent.id))) {
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = agent
    await current.service.handle('saveAgent', { ...definition, connectionId: connection.id, modelId: 'test-model' })
  }
  const direct = await current.service.handle('createConversation', { kind: 'direct', title: '成果单聊', agentIds: ['researcher'] }) as Conversation
  const group = await current.service.handle('createConversation', { kind: 'group', title: '成果群聊', agentIds: ['researcher', 'writer'], mode: 'mention' }) as Conversation
  return { root, dataPath, direct, group, ...current }
}
function request(conversation: Conversation, content = '生成报告') {
  return { conversationId: conversation.id, content, mentionIds: ['researcher'], requestId: crypto.randomUUID() }
}
function revision(conversation: Conversation, artifact: ArtifactVersion, overrides: Partial<ArtifactRevisionInput> = {}): ArtifactRevisionInput {
  return { conversationId: conversation.id, artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: 'researcher', content: '补充明确验收条件，并发布修订后的报告。', requestId: crypto.randomUUID(), ...overrides }
}
function adoption(artifact: ArtifactVersion, expectedAdoptionRevision = 0, overrides: Partial<ArtifactAdoptionInput> = {}): ArtifactAdoptionInput {
  return { artifactId: artifact.id, contentHash: artifact.contentHash, expectedAdoptionRevision, requestId: crypto.randomUUID(), ...overrides }
}
async function settled(service: AppService, conversation: Conversation) {
  await vi.waitFor(async () => {
    const view = await detail(service, conversation)
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  }, { timeout: 5000, interval: 10 })
  await new Promise(resolve => setTimeout(resolve, 20))
}
async function publish(service: AppService, context: EngineContext, outputs: { text: string; name?: string; replacement?: boolean }[]) {
  const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
  const published: ArtifactVersion[] = []
  try {
    for (const [index, output] of outputs.entries()) {
      const path = `self:/runs/${context.runId}/report-${index}.md`
      await runtime.tools.write_file.execute!({ path, content: output.text }, invocation)
      const result = await runtime.tools.publish_artifact.execute!({ path, name: output.name ?? 'report.md', ...(output.replacement && context.artifactRevision ? { revisionRequestId: context.artifactRevision.id } : {}) }, invocation) as { artifact: Artifact }
      const artifact = (await storeOf(service).load<ArtifactVersion>('artifacts')).find(value => value.id === result.artifact.id)!
      expect(artifact).toBeDefined(); published.push(artifact)
    }
    const answer = `已发布可检查成果 ${published.map(value => value.id).join('、')}。`
    await context.onDelta(answer)
    await context.onWorkOutcome!({ disposition: 'delivered', summary: answer, evidence: published.map(value => ({ kind: 'artifact' as const, reference: value.id })) })
    return published
  } finally { await runtime.workspace.destroy() }
}
function publisher(service: AppService, engine: FakeEngine, supporting = false) {
  engine.handler = context => publish(service, context, [{ text: context.artifactRevision ? V2 : V1, replacement: true }, ...(supporting && context.artifactRevision ? [{ text: '独立支持资料', name: 'support.md' }] : [])]).then(() => {})
}
async function original(service: AppService, engine: FakeEngine, conversation: Conversation) {
  publisher(service, engine)
  const input = request(conversation), message = await service.handle('sendMessage', input) as Message
  await settled(service, conversation)
  const view = await detail(service, conversation), source = view.workItems?.find(value => value.sourceMessageId === message.id), artifact = view.artifacts.find(value => value.sourceWorkId === source?.id) as ArtifactVersion
  expect(artifact).toBeDefined(); expect(view.workItems?.find(work => work.id === artifact.sourceWorkId)?.status).toBe('delivered')
  return { artifact, message, input, view }
}
async function revise(service: AppService, conversation: Conversation, input: ArtifactRevisionInput) {
  const message = await service.handle('reviseArtifact', input) as Message; await settled(service, conversation)
  return message
}

describe('service artifact delivery boundaries', () => {
  it('requests directory access for the revision employee without inheriting the original author grant', async () => {
    const f = await fixture(), business = join(f.root, 'coding'); await mkdir(business)
    const path = join(business, 'source.txt'); await writeFile(path, 'REVISION-DIRECTORY-ORIGINAL')
    const first = await original(f.service, f.engine, f.group)
    for (const id of ['researcher', 'writer']) {
      const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...agent } = (await snapshot(f.service)).agents.find(agent => agent.id === id)!
      await f.service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, executionPermission: 'ask', directoryGrants: id === 'researcher' ? [{ path: business, access: 'read-write' }] : [] })
    }
    const input = revision(f.group, first.artifact, { targetAgentId: 'writer' }), reads: string[] = []
    f.engine.handler = async context => {
      expect(context.agent.id).toBe('writer'); expect(context.artifactRevision?.id).toBe(input.requestId)
      const runtime = await createTaskRuntime(context)
      try {
        const result = await runtime.tools.read_file.execute!({ path }, { requestContext: new RequestContext(), observe: noopObserve }) as { content: string }
        reads.push(result.content)
      } finally { await runtime.dispose() }
      await publish(f.service, context, [{ text: V2, replacement: true }])
    }
    await f.service.handle('reviseArtifact', input)
    await vi.waitFor(async () => expect((await snapshot(f.service)).approvals).toHaveLength(1))
    const approval = (await snapshot(f.service)).approvals[0]
    expect((await detail(f.service, f.group)).runs.find(run => run.id === approval.runId)?.agentId).toBe('writer')
    expect(approval.directory).toMatchObject({ directory: business, access: 'read-only' }); expect(reads).toEqual([])
    expect((await detail(f.service, f.group)).artifacts).toHaveLength(1)
    await f.service.handle('approve', { id: approval.id, approved: true, always: false })
    const fileApprovals = []
    for (const description of ['写入文件', '发布文件']) {
      await vi.waitFor(async () => expect((await snapshot(f.service)).approvals.some(item => item.kind === 'file')).toBe(true))
      const pending = (await snapshot(f.service)).approvals.find(item => item.kind === 'file')!
      expect(pending.command).toContain(description); fileApprovals.push(pending)
      await f.service.handle('approve', { id: pending.id, approved: true })
    }
    await settled(f.service, f.group)
    const current = await detail(f.service, f.group), replacement = current.artifacts.find(artifact => artifact.revisionRequestId === input.requestId)!
    expect(reads).toEqual(['REVISION-DIRECTORY-ORIGINAL']); expect(replacement.ownerAgentId).toBe('writer')
    expect(await readFile(replacement.path, 'utf8')).toBe(V2); expect(await readFile(first.artifact.path, 'utf8')).toBe(V1)
    expect(await readFile(path, 'utf8')).toBe('REVISION-DIRECTORY-ORIGINAL')
    if (process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR) {
      const output = join(process.env.BOAI_DIRECTORY_LIFECYCLE_EVIDENCE_DIR, 'revision'); await mkdir(output, { recursive: true })
      await storeOf(f.service).backup(join(output, 'boai.sqlite'))
      await writeFile(join(output, 'facts.json'), JSON.stringify({ externalRequests: 0, reads, approval, fileApprovals, first: first.artifact, replacement, current, state: await snapshot(f.service) }, null, 2))
    }
  })

  it('does not infer a legacy artifact while a real publication is copied but not yet committed', async () => {
    const { service, engine, direct } = await fixture()
    let copied!: Artifact, release!: () => void, markCopied!: () => void
    const reached = new Promise<void>(resolve => { markCopied = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    cleanups.push(async () => release())
    engine.handler = async context => {
      const accepted = context.onArtifact!
      context.onArtifact = async artifact => { copied = artifact; markCopied(); await gate; await accepted(artifact) }
      await publish(service, context, [{ text: V1 }])
    }
    await service.handle('sendMessage', request(direct)); await reached
    expect(await readFile(copied.path, 'utf8')).toBe(V1)
    await detail(service, direct)
    const beforeCommit = await storeOf(service).load<ArtifactVersion>('artifacts')
    release(); await settled(service, direct)
    expect(beforeCommit).toEqual([])
    expect(await storeOf(service).load('artifacts')).toEqual([expect.objectContaining({ id: copied.id, logicalArtifactId: copied.id, registrationSource: 'publication' })])
  })

  it('publishes real V1/V2 bytes with explicit lineage, bounded work summaries and a targeted new root', async () => {
    const { service, engine, group } = await fixture(), first = await original(service, engine, group)
    publisher(service, engine, true)
    engine.work = () => ({ key: 'model-reused-original', workId: first.artifact.sourceWorkId, expectedVersion: first.view.workItems![0].version, scope: '模型尝试沿用旧工作', deliverable: '沿用原工作' })
    const input = revision(group, first.artifact, { targetAgentId: 'writer', content: '具体修订要求：' + '补充验证步骤。'.repeat(700) }), message = await revise(service, group, input)
    const view = await detail(service, group), replacement = view.artifacts.find(value => value.revisionRequestId === input.requestId) as ArtifactVersion
    const supporting = view.artifacts.find(value => value.name === 'support.md') as ArtifactVersion
    expect(message).toMatchObject({ senderType: 'user', senderId: 'user', content: input.content, artifactRevisionRequestId: input.requestId, mentionIds: ['writer'] })
    expect(message.origin).toBeUndefined()
    expect(replacement).toMatchObject({ logicalArtifactId: first.artifact.logicalArtifactId, previousArtifactId: first.artifact.id, contentVersion: 2, contentHash: hash(V2), ownerAgentId: 'writer' })
    expect(first.artifact).toMatchObject({ logicalArtifactId: first.artifact.id, contentVersion: 1, contentHash: hash(V1) })
    expect(await readFile(first.artifact.path, 'utf8')).toBe(V1); expect(await readFile(replacement.path, 'utf8')).toBe(V2)
    expect(supporting.logicalArtifactId).toBe(supporting.id); expect(supporting.contentVersion).toBe(1); expect(supporting.previousArtifactId).toBeUndefined(); expect(supporting.revisionRequestId).toBeUndefined()
    const work = view.workItems!.find(value => value.id === replacement.sourceWorkId)!, old = view.workItems!.find(value => value.id === first.artifact.sourceWorkId)!
    expect(work).toMatchObject({ rootWorkId: work.id, sourceMessageId: message.id, revisionRequestId: input.requestId, ownerAgentId: 'writer', key: 'artifact-revision', status: 'delivered', requiresReview: false, resultVersion: 1 })
    expect(work.parentWorkId).toBeUndefined(); expect(work.origin).toBeUndefined(); expect(work.scope.length).toBeLessThanOrEqual(2000); expect(work.budgetId).not.toBe(old.budgetId)
    expect(old).toEqual(first.view.workItems!.find(value => value.id === old.id)); expect(view.workBudgets!.find(value => value.id === old.budgetId)).toEqual(first.view.workBudgets!.find(value => value.id === old.budgetId))
    expect(engine.contexts.filter(context => context.triggerMessageId === message.id).map(context => context.agent.id)).toEqual(['writer'])
    const submitted = (await storeOf(service).load<ArtifactRevisionRequest>('artifactRevisionRequests'))[0]
    expect(submitted).toMatchObject({ id: input.requestId, artifactId: first.artifact.id, contentHash: first.artifact.contentHash, messageId: message.id, rootWorkId: work.id, targetAgentId: 'writer' })
    const final = view.messages.find(value => work.resultMessageIds.includes(value.id))!
    expect(final).toMatchObject({ id: replacement.sourceMessageId, senderId: 'writer', status: 'completed', runId: replacement.runId }); expect(final.content).toContain(replacement.id)
    expect((await preview(service, replacement)).versions.map(value => value.id)).toEqual([first.artifact.id, replacement.id])
    expect((await preview(service, first.artifact)).text).toBe(V1)
  })

  it('keeps same-name ordinary publications independent without inferring a revision chain', async () => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct)
    engine.work = () => ({ key: 'second-independent', scope: '新的普通请求', deliverable: '独立报告' })
    await service.handle('sendMessage', request(direct, '生成另一份同名报告')); await settled(service, direct)
    const artifacts = (await detail(service, direct)).artifacts as ArtifactVersion[]
    expect(artifacts).toHaveLength(2); expect(artifacts.map(value => value.name)).toEqual(['report.md', 'report.md'])
    for (const artifact of artifacts) { expect(artifact.logicalArtifactId).toBe(artifact.id); expect(artifact.contentVersion).toBe(1); expect(artifact.revisionRequestId).toBeUndefined(); expect(artifact.previousArtifactId).toBeUndefined() }
    expect(new Set(artifacts.map(value => value.id)).size).toBe(2)
    expect(await storeOf(service).load('artifactRevisionRequests')).toEqual([])
    expect((await preview(service, first.artifact)).versions.map(value => value.id)).toEqual([first.artifact.id])
  })

  it('returns the exact host-verified bytes if the original changes before the file tool receives them', async () => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct)
    const canary = 'UNVERIFIED_SECOND_OPEN_ARTIFACT_CANARY'
    engine.work = () => ({ key: 'read-verified-artifact', scope: '检查已发布原件的可信读取', deliverable: '报告读取是否保留已核对正文' })
    let verifiedReads = 0
    engine.handler = async context => {
      const hostRead = context.readTaskFile!
      expect(hostRead).toBeTypeOf('function')
      context.readTaskFile = async path => {
        const verified = await hostRead(path)
        expect(verified?.content).toBe(V1); verifiedReads++
        await writeFile(first.artifact.path, canary)
        return verified
      }
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }, path = `shared:/${first.artifact.managedRelativePath}`
      try {
        const result = await runtime.tools.read_file.execute!({ path }, invocation)
        expect(result).toMatchObject({ path, content: V1 }); expect(JSON.stringify(result)).not.toContain(canary)
        expect(await readFile(first.artifact.path, 'utf8')).toBe(canary)
        await expect(runtime.tools.read_file.execute!({ path }, invocation)).rejects.toThrow()
        await context.onDelta('已核对正文保持完整，后改原件的再次读取已拒绝。')
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '已检查可信原件读取', evidence: [{ kind: 'answer', reference: '已核对正文保持完整，后改原件的再次读取已拒绝。' }] })
      } finally { await runtime.workspace.destroy() }
    }
    await service.handle('sendMessage', request(direct, '读取已经核对的报告原件')); await settled(service, direct)
    expect(verifiedReads).toBe(1); expect(engine.contexts).toHaveLength(2)
    expect((await detail(service, direct)).workItems!.find(value => value.key === 'read-verified-artifact')?.status).toBe('delivered')
    await expect(preview(service, first.artifact)).rejects.toThrow('外部修改')
  })

  it('chooses the core fallback model for a new revision while leaving accepted receipts read-only', async () => {
    const { service, engine } = await fixture(); engine.defaultTarget = 'bobo'; publisher(service, engine)
    const coreChat = await service.handle('startCoreConversation', { requestId: 'core-artifact-original', content: '生成核心会话报告' }) as Conversation
    await settled(service, coreChat)
    const artifact = (await detail(service, coreChat)).artifacts.find(value => value.ownerAgentId === 'bobo') as ArtifactVersion
    expect(artifact).toBeDefined()
    const clearCoreModel = async () => {
      const core = (await snapshot(service)).agents.find(value => value.id === 'bobo')!
      const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = core
      await service.handle('saveAgent', { ...definition, expectedConfigVersion: configVersion, connectionId: '', modelId: '' })
    }
    await clearCoreModel()
    expect((await snapshot(service)).agents.find(value => value.id === 'bobo')?.connectionId).toBe('')
    const input = revision(coreChat, artifact, { targetAgentId: 'bobo' }), message = await revise(service, coreChat, input), core = (await snapshot(service)).agents.find(value => value.id === 'bobo')!
    expect(core.connectionId).toBeTruthy(); expect((await snapshot(service)).connections.find(value => value.id === core.connectionId)?.defaultModel).toBe('test-model')
    expect((await detail(service, coreChat)).artifacts.filter(value => value.revisionRequestId === input.requestId)).toHaveLength(1)
    expect(engine.contexts).toHaveLength(2)
    await clearCoreModel(); const calls = engine.contexts.length, decisions = engine.decisions.length
    expect(await service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await service.handle('reviseArtifact', input)).toEqual(message)
    expect((await snapshot(service)).agents.find(value => value.id === 'bobo')?.connectionId).toBe('')
    expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
  })

  it('does not grant a later ordinary task the publication authority of a historical revision request', async () => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct), input = revision(direct, first.artifact)
    await revise(service, direct, input)
    engine.work = () => ({ key: 'fresh-independent-task', scope: '新的普通任务', deliverable: '说明可用发布边界' })
    engine.handler = async context => {
      expect(context.artifactRevision).toBeUndefined()
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }, path = `self:/runs/${context.runId}/attempt.md`
      try {
        await runtime.tools.write_file.execute!({ path, content: '普通任务不能替代旧版' }, invocation)
        await expect(runtime.tools.publish_artifact.execute!({ path, revisionRequestId: input.requestId }, invocation)).rejects.toThrow('修订发布身份')
        await context.onDelta('旧修订发布身份未获得本次任务授权。')
        await context.onWorkOutcome!({ disposition: 'delivered', summary: '已检查发布权限', evidence: [{ kind: 'answer', reference: '旧修订发布身份未获得本次任务授权。' }] })
      } finally { await runtime.workspace.destroy() }
    }
    await service.handle('sendMessage', request(direct, '检查历史修订发布权限')); await settled(service, direct)
    expect(await storeOf(service).load('artifacts')).toHaveLength(2)
    expect(await storeOf(service).load('artifactRevisionRequests')).toHaveLength(1)
    const work = (await detail(service, direct)).workItems!.find(value => value.key === 'fresh-independent-task')!
    expect(work.revisionRequestId).toBeUndefined(); expect(work.artifactIds).toEqual([])
  })

  it.each(['write', 'publish'])('rechecks the original hash before a revision %s and preserves a late external edit', async operation => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct), input = revision(direct, first.artifact)
    engine.handler = async context => {
      const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }, path = `self:/runs/${context.runId}/late-source.md`
      try {
        if (operation === 'publish') await runtime.tools.write_file.execute!({ path, content: V2 }, invocation)
        await writeFile(first.artifact.path, 'LATE_EXTERNAL_ORIGINAL_CANARY')
        if (operation === 'write') await expect(runtime.tools.write_file.execute!({ path, content: V2 }, invocation)).rejects.toThrow()
        else await expect(runtime.tools.publish_artifact.execute!({ path, revisionRequestId: input.requestId }, invocation)).rejects.toThrow()
      } finally { await runtime.workspace.destroy() }
    }
    await revise(service, direct, input)
    const view = await detail(service, direct), work = view.workItems!.find(value => value.revisionRequestId === input.requestId)!
    expect(await readFile(first.artifact.path, 'utf8')).toBe('LATE_EXTERNAL_ORIGINAL_CANARY')
    expect((await storeOf(service).load<ArtifactVersion>('artifacts')).map(value => ({ id: value.id, name: value.name, path: value.path, managedRelativePath: value.managedRelativePath }))).toEqual([expect.objectContaining({ id: first.artifact.id })]); expect(work.status).not.toBe('delivered'); expect(work.artifactIds).toEqual([])
    expect(engine.contexts).toHaveLength(2)
  })

  it('keeps a published revision unlinked to a final reply when that reply transaction rolls back', async () => {
    const { service, engine, dataPath, direct } = await fixture(), first = await original(service, engine, direct), input = revision(direct, first.artifact), store = storeOf(service), transaction = store.transaction.bind(store)
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
      const value = record.value as Partial<Message>
      if (armed && record.collection === 'messages' && value.senderType === 'agent' && value.status === 'completed') { armed = false; throw new Error('final revision reply commit fault') }
      await tx.put(record)
    } })))
    const message = await revise(service, direct, input); fault.mockRestore()
    const artifacts = await store.load<ArtifactVersion>('artifacts'), replacement = artifacts.find(value => value.revisionRequestId === input.requestId)!, work = (await store.load<WorkItem>('workItems')).find(value => value.id === replacement.sourceWorkId)!
    expect(replacement).toBeDefined(); expect(replacement.sourceMessageId).toBeUndefined(); expect(await readFile(replacement.path, 'utf8')).toBe(V2)
    expect(work.status).not.toBe('delivered'); expect(work.resultMessageIds).toEqual([])
    expect((await store.load<Message>('messages')).filter(value => value.senderType === 'agent' && value.status === 'completed')).toEqual(first.view.messages.filter(value => value.senderType === 'agent' && value.status === 'completed'))
    await service.close(); const restarted = await open(dataPath)
    expect(await restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await restarted.service.handle('reviseArtifact', input)).toEqual(message)
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
    expect((await storeOf(restarted.service).load<ArtifactVersion>('artifacts')).find(value => value.id === replacement.id)?.sourceMessageId).toBeUndefined()
  })

  it.each(['artifactRevisionRequests', 'turns'])('rolls back the user message, relation and turn if %s writing fails', async collection => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct), store = storeOf(service), transaction = store.transaction.bind(store)
    const collections = ['messages', 'requests', 'messageReceipts', 'turns', 'conversationEvents', 'conversations', 'artifactRevisionRequests', 'artifactRevisionReceipts', 'workItems', 'workBudgets']
    const before = await Promise.all(collections.map(name => store.load(name))), calls = engine.contexts.length, decisions = engine.decisions.length, input = revision(direct, first.artifact)
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
      if (armed && record.collection === collection) { armed = false; throw new Error('revision atomic commit fault') }
      await tx.put(record)
    } })))
    await expect(service.handle('reviseArtifact', input)).rejects.toThrow('revision atomic commit fault'); fault.mockRestore()
    expect(await Promise.all(collections.map(name => store.load(name)))).toEqual(before)
    expect(await service.handle('getMessageReceipt', { requestId: input.requestId })).toBeNull(); expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
    const message = await revise(service, direct, input)
    expect(message.artifactRevisionRequestId).toBe(input.requestId); expect(await store.load('artifactRevisionRequests')).toHaveLength(1)
  })

  it('reconciles a lost revision response read-only and never reschedules duplicates across restart', async () => {
    const { service, engine, dataPath, direct } = await fixture(), first = await original(service, engine, direct), input = revision(direct, first.artifact)
    await expect((async () => { await service.handle('reviseArtifact', input); throw new Error('revision response lost') })()).rejects.toThrow('revision response lost')
    await settled(service, direct)
    const message = (await detail(service, direct)).messages.find(value => value.artifactRevisionRequestId === input.requestId)!, calls = engine.contexts.length, decisions = engine.decisions.length
    for (let index = 0; index < 3; index++) expect(await service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await Promise.all([service.handle('reviseArtifact', input), service.handle('reviseArtifact', input)])).toEqual([message, message])
    await expect(service.handle('reviseArtifact', { ...input, content: '不同返工要求' })).rejects.toThrow('requestId')
    expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
    expect(await storeOf(service).load('artifactRevisionRequests')).toHaveLength(1)
    await service.close(); const restarted = await open(dataPath)
    expect(await restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await restarted.service.handle('reviseArtifact', input)).toEqual(message)
    expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
    expect((await detail(restarted.service, direct)).artifacts.map(value => ({ id: value.id, name: value.name, managedRelativePath: value.managedRelativePath }))).toEqual([
      expect.objectContaining({ id: first.artifact.id }), expect.objectContaining({ name: 'report.md' }),
    ])
  })

  it('preserves an unknown revision SQLite commit for restart reconciliation without claiming or publishing twice', async () => {
    const { service, engine, dataPath, direct } = await fixture(), first = await original(service, engine, direct), input = revision(direct, first.artifact)
    const store = storeOf(service), transaction = store.transaction.bind(store), calls = engine.contexts.length, decisions = engine.decisions.length
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      let accepted = false
      const result = await transaction(tx => action({ ...tx, put: async record => { await tx.put(record); if (armed && record.collection === 'artifactRevisionReceipts') accepted = true } }))
      if (accepted) { armed = false; throw new Error('revision SQLite response lost after commit') }
      return result
    })
    await expect(service.handle('reviseArtifact', input)).rejects.toThrow('revision SQLite response lost after commit'); fault.mockRestore()
    const message = (await store.load<Message>('messages')).find(value => value.artifactRevisionRequestId === input.requestId)!
    expect(await store.load('artifactRevisionRequests')).toEqual([expect.objectContaining({ id: input.requestId, messageId: message.id })])
    await expect(service.handle('getMessageReceipt', { requestId: input.requestId })).rejects.toThrow('重启核对')
    await expect(service.handle('reviseArtifact', input)).rejects.toThrow('重启核对')
    expect(engine.contexts).toHaveLength(calls); expect(engine.decisions).toHaveLength(decisions)
    await service.close(); const restarted = await open(dataPath)
    expect(await restarted.service.handle('getMessageReceipt', { requestId: input.requestId })).toEqual(message)
    expect(await restarted.service.handle('reviseArtifact', input)).toEqual(message)
    const requests = await storeOf(restarted.service).load<ArtifactRevisionRequest>('artifactRevisionRequests')
    expect(requests).toEqual([expect.objectContaining({ id: input.requestId, messageId: message.id })]); expect(requests[0].rootWorkId).toBeUndefined()
    expect((await detail(restarted.service, direct)).artifacts.map(value => ({ id: value.id, name: value.name, managedRelativePath: value.managedRelativePath }))).toEqual([expect.objectContaining({ id: first.artifact.id })]); expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
  })

  it('separates user revision from the original automatic occurrence and its shared budget', async () => {
    const { service, engine, group } = await fixture(); publisher(service, engine)
    const plan = await service.handle('saveAutomation', { name: '自动报告', prompt: '生成原始报告', conversationId: group.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false }) as AutomationDefinition
    const occurrence = await service.handle('runAutomation', { id: plan.id, requestId: 'artifact-original-automatic' }) as AutomationOccurrence
    await vi.waitFor(async () => expect((await service.handle('listAutomations', undefined) as AutomationsView).occurrences.find(value => value.id === occurrence.id)?.status).toBe('completed'), { timeout: 5000, interval: 10 })
    await settled(service, group)
    const before = await detail(service, group), artifact = before.artifacts[0] as ArtifactVersion, source = before.workItems!.find(value => value.id === artifact.sourceWorkId)!
    expect(source.origin?.occurrenceId).toBe(occurrence.id)
    const store = storeOf(service), occurrenceBefore = (await store.load<AutomationOccurrence>('automationOccurrences')).find(value => value.id === occurrence.id), callsBefore = await store.load('budgetModelCalls')
    const input = revision(group, artifact), message = await revise(service, group, input), after = await detail(service, group), newWork = after.workItems!.find(value => value.revisionRequestId === input.requestId)!
    expect(newWork).toMatchObject({ rootWorkId: newWork.id, sourceMessageId: message.id }); expect(newWork.origin).toBeUndefined(); expect(newWork.budgetId).not.toBe(source.budgetId)
    expect(after.workItems!.find(value => value.id === source.id)).toEqual(source); expect(after.workBudgets!.find(value => value.id === source.budgetId)).toEqual(before.workBudgets!.find(value => value.id === source.budgetId))
    expect((await store.load<AutomationOccurrence>('automationOccurrences')).find(value => value.id === occurrence.id)).toEqual(occurrenceBefore)
    expect((await store.load<{ id: string; budgetId: string }>('budgetModelCalls')).filter(value => value.budgetId === source.budgetId)).toEqual((callsBefore as { id: string; budgetId: string }[]).filter(value => value.budgetId === source.budgetId))
  })

  it('adopts by exact version, coalesces double clicks and preserves history without changing work delivery', async () => {
    const { service, engine, dataPath, direct } = await fixture(), first = await original(service, engine, direct), input = adoption(first.artifact)
    const initial = await preview(service, first.artifact); expect(initial.adoption).toMatchObject({ revision: 0, current: null, events: [] })
    const [accepted, repeated, doubleClick] = await Promise.all([service.handle('adoptArtifact', input), service.handle('adoptArtifact', input), service.handle('adoptArtifact', adoption(first.artifact))]) as ArtifactAdoptionReceipt[]
    expect(repeated).toEqual(accepted); expect(doubleClick).toMatchObject({ eventId: accepted.eventId, adoptionRevision: 1, artifactId: first.artifact.id, contentHash: first.artifact.contentHash, userId: 'user' })
    expect(await service.handle('getArtifactAdoptionReceipt', { requestId: input.requestId })).toEqual(accepted)
    expect(await service.handle('getArtifactAdoptionReceipt', { requestId: 'never-submitted' })).toBeNull()
    await expect(service.handle('adoptArtifact', { ...input, contentHash: 'f'.repeat(64) })).rejects.toThrow('requestId')
    const revised = revision(direct, first.artifact); await revise(service, direct, revised)
    const view = await detail(service, direct), second = view.artifacts.find(value => value.revisionRequestId === revised.requestId) as ArtifactVersion
    expect((await preview(service, second)).adoption.current?.artifactId).toBe(first.artifact.id)
    const workBeforeAdoption = await storeOf(service).load<WorkItem>('workItems'), budgetBeforeAdoption = await storeOf(service).load('workBudgets'), calls = engine.contexts.length
    const secondReceipt = await service.handle('adoptArtifact', adoption(second, 1)) as ArtifactAdoptionReceipt
    await expect(service.handle('adoptArtifact', adoption(first.artifact, 1))).rejects.toThrow('已更新')
    const oldReceipt = await service.handle('adoptArtifact', adoption(first.artifact, 2)) as ArtifactAdoptionReceipt
    const latest = await preview(service, second)
    expect(latest.text).toBe(V2); expect(latest.adoption.current?.artifactId).toBe(first.artifact.id); expect(latest.adoption.revision).toBe(3)
    expect(latest.adoption.events.map(value => value.artifactId)).toEqual([first.artifact.id, second.id, first.artifact.id]); expect(secondReceipt.adoptionRevision).toBe(2); expect(oldReceipt.adoptionRevision).toBe(3)
    expect(await storeOf(service).load('workItems')).toEqual(workBeforeAdoption); expect(await storeOf(service).load('workBudgets')).toEqual(budgetBeforeAdoption); expect(engine.contexts).toHaveLength(calls)
    await service.close(); const restarted = await open(dataPath)
    expect(await restarted.service.handle('getArtifactAdoptionReceipt', { requestId: input.requestId })).toEqual(accepted)
    expect(await restarted.service.handle('adoptArtifact', input)).toEqual(accepted)
    expect((await preview(restarted.service, first.artifact)).adoption).toEqual(latest.adoption); expect(restarted.engine.contexts).toEqual([])
  })

  it('rolls back adoption event, current pointer and receipt together and reads a committed lost response without replay', async () => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct), input = adoption(first.artifact), store = storeOf(service), transaction = store.transaction.bind(store), calls = engine.contexts.length
    let armed = true
    const fault = vi.spyOn(store, 'transaction').mockImplementation(action => transaction(tx => action({ ...tx, put: async record => {
      if (armed && record.collection === 'artifactAdoptionReceipts') { armed = false; throw new Error('adoption atomic commit fault') }
      await tx.put(record)
    } })))
    await expect(service.handle('adoptArtifact', input)).rejects.toThrow('adoption atomic commit fault'); fault.mockRestore()
    for (const collection of ['artifactAdoptionEvents', 'artifactAdoptionCurrent', 'artifactAdoptionReceipts']) expect(await store.load(collection)).toEqual([])
    expect(await service.handle('getArtifactAdoptionReceipt', { requestId: input.requestId })).toBeNull()
    const lost = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      let accepted = false
      const result = await transaction(tx => action({ ...tx, put: async record => { await tx.put(record); if (record.collection === 'artifactAdoptionReceipts') accepted = true } }))
      if (accepted) throw new Error('adoption response lost after SQLite commit')
      return result
    })
    await expect(service.handle('adoptArtifact', input)).rejects.toThrow('adoption response lost after SQLite commit'); lost.mockRestore()
    const receipt = await service.handle('getArtifactAdoptionReceipt', { requestId: input.requestId }) as ArtifactAdoptionReceipt
    expect(receipt).toMatchObject({ artifactId: first.artifact.id, adoptionRevision: 1 }); expect(await service.handle('adoptArtifact', input)).toEqual(receipt)
    expect(await store.load('artifactAdoptionEvents')).toHaveLength(1); expect(engine.contexts).toHaveLength(calls)
  })

  it.each(['edited', 'missing'])('never serves cached original text or readopts an %s file', async mode => {
    const { service, engine, direct } = await fixture(), first = await original(service, engine, direct)
    const accepted = await service.handle('adoptArtifact', adoption(first.artifact)) as ArtifactAdoptionReceipt
    expect((await preview(service, first.artifact)).text).toBe(V1)
    if (mode === 'edited') await writeFile(first.artifact.path, 'EXTERNAL_ARTIFACT_MUST_SURVIVE'); else await rm(first.artifact.path)
    await expect(preview(service, first.artifact)).rejects.toThrow(mode === 'edited' ? '外部修改' : '不存在')
    await expect(service.handle('adoptArtifact', adoption(first.artifact, accepted.adoptionRevision))).rejects.toThrow()
    await expect(service.handle('reviseArtifact', revision(direct, first.artifact))).rejects.toThrow()
    const visible = (await detail(service, direct)).artifacts.find(value => value.id === first.artifact.id) as ArtifactVersion
    expect(visible).toMatchObject({ contentStatus: 'unavailable', contentHash: first.artifact.contentHash })
    expect(await storeOf(service).load('artifactAdoptionEvents')).toHaveLength(1); expect(await storeOf(service).load('artifactRevisionRequests')).toEqual([]); expect(engine.contexts).toHaveLength(1)
    if (mode === 'edited') expect(await readFile(first.artifact.path, 'utf8')).toBe('EXTERNAL_ARTIFACT_MUST_SURVIVE')
  })

  it('fences a material-backed original, its revision and adoption after source authorization changes', async () => {
    const { service, engine, root, group } = await fixture(); publisher(service, engine)
    const source = join(root, 'source.md'); await writeFile(source, '限定来源 SOURCE_PERMISSION_CANARY')
    const material = await service.handle('prepareMaterial', { conversationId: group.id, path: source, requestId: crypto.randomUUID(), authorizedAgentIds: ['researcher'] }) as ConversationMaterial
    await service.handle('sendMessage', { ...request(group), materialSelections: [{ id: material.id, revision: material.revision }] }); await settled(service, group)
    const artifact = (await detail(service, group)).artifacts[0] as ArtifactVersion
    expect(artifact.materialSources).toEqual([expect.objectContaining({ id: material.id, revision: material.revision, contentHash: material.contentHash })])
    await expect(service.handle('reviseArtifact', revision(group, artifact, { targetAgentId: 'writer' }))).rejects.toThrow()
    await revise(service, group, revision(group, artifact))
    const before = await detail(service, group), descendant = before.artifacts.find(value => value.previousArtifactId === artifact.id) as ArtifactVersion
    expect(descendant.materialSources).toEqual(artifact.materialSources)
    const adopted = await service.handle('adoptArtifact', adoption(descendant)) as ArtifactAdoptionReceipt
    await service.handle('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: ['writer'] })
    for (const value of [artifact, descendant]) { await expect(preview(service, value)).rejects.toThrow(); await expect(service.handle('adoptArtifact', adoption(value, adopted.adoptionRevision))).rejects.toThrow(); await expect(service.handle('reviseArtifact', revision(group, value))).rejects.toThrow() }
    expect((await storeOf(service).load<ArtifactRevisionRequest>('artifactRevisionRequests'))).toHaveLength(1)
    expect(await storeOf(service).load('artifactAdoptionEvents')).toHaveLength(1); expect(engine.contexts).toHaveLength(2)
  })

  it('keeps an external artifact edit through cleanup restart and allows only explicit repaired cleanup', async () => {
    const { service, engine, dataPath, direct, group } = await fixture(), first = await original(service, engine, direct)
    const reviseInput = revision(direct, first.artifact); await revise(service, direct, reviseInput)
    const adoptInput = adoption(first.artifact); await service.handle('adoptArtifact', adoptInput)
    await writeFile(first.artifact.path, 'EXTERNAL_ARTIFACT_CLEANUP_CANARY')
    await expect(service.handle('clearConversationHistory', { id: direct.id, hide: false })).rejects.toThrow('成果清理未完成')
    expect(await readFile(first.artifact.path, 'utf8')).toBe('EXTERNAL_ARTIFACT_CLEANUP_CANARY')
    expect(await storeOf(service).load('artifactCleanups')).toContainEqual(expect.objectContaining({ id: first.artifact.id, status: 'conflict' }))
    expect(await storeOf(service).load('artifactRevisionRequests')).toEqual([]); expect(await storeOf(service).load('artifactAdoptionEvents')).toEqual([])
    expect(await storeOf(service).load('artifactRevisionReceipts')).toEqual([expect.objectContaining({ id: reviseInput.requestId, cleared: true })])
    await service.close(); const restarted = await open(dataPath)
    await expect(detail(restarted.service, direct)).rejects.toThrow('清理'); await expect(restarted.service.handle('sendMessage', request(direct))).rejects.toThrow('清理')
    await expect(restarted.service.handle('reviseArtifact', reviseInput)).rejects.toThrow('清理'); await expect(restarted.service.handle('adoptArtifact', adoptInput)).rejects.toThrow('清理')
    publisher(restarted.service, restarted.engine); await restarted.service.handle('sendMessage', request(group)); await settled(restarted.service, group)
    expect(restarted.engine.contexts).toHaveLength(1); expect(await readFile(first.artifact.path, 'utf8')).toBe('EXTERNAL_ARTIFACT_CLEANUP_CANARY')
    await writeFile(first.artifact.path, V1); await restarted.service.handle('clearConversationHistory', { id: direct.id, hide: false })
    await expect(readFile(first.artifact.path)).rejects.toThrow(); expect((await detail(restarted.service, direct)).messages).toEqual([])
    await expect(restarted.service.handle('getMessageReceipt', { requestId: reviseInput.requestId })).rejects.toThrow('清理')
    await expect(restarted.service.handle('getArtifactAdoptionReceipt', { requestId: adoptInput.requestId })).rejects.toThrow('清理')
    expect(engine.contexts).toHaveLength(2)
  })

  it('verifies legacy IDs and bytes once without inferring chains, adoption or work ownership', async () => {
    const { service, dataPath, direct } = await fixture(), directory = join(direct.workspacePath, 'artifacts')
    await mkdir(directory, { recursive: true })
    const legacy = ['legacy-a', 'legacy-b'].map(id => ({ id, conversationId: direct.id, name: 'report.md', path: join(directory, `${id}-report.md`), size: Buffer.byteLength(V1), contentHash: 'e'.repeat(64) }))
    for (const artifact of legacy) await writeFile(artifact.path, V1)
    await storeOf(service).write(legacy.map(value => row('artifacts', value)))
    await service.close(); const restarted = await open(dataPath)
    const view = await detail(restarted.service, direct)
    expect(view.artifacts).toHaveLength(2)
    for (const old of legacy) {
      const artifact = view.artifacts.find(value => value.id === old.id) as ArtifactVersion
      expect(artifact).toMatchObject({ id: old.id, logicalArtifactId: old.id, contentVersion: 1, contentHash: hash(V1), registrationSource: 'legacy_verified', contentStatus: 'ready' })
      expect(artifact.sourceWorkId).toBeUndefined(); expect(artifact.sourceMessageId).toBeUndefined(); expect(artifact.previousArtifactId).toBeUndefined()
      const state = await preview(restarted.service, artifact)
      expect(state.text).toBe(V1); expect(state.versions.map(value => value.id)).toEqual([old.id]); expect(state.adoption).toMatchObject({ current: null, events: [] })
    }
    expect(view.workItems).toEqual([]); expect(restarted.engine.contexts).toEqual([]); expect(restarted.engine.decisions).toEqual([])
  })

  it('restores authoritative version paths, relations and adoption at a different data root without replay', async () => {
    const { service, engine, root, dataPath, direct } = await fixture(), first = await original(service, engine, direct)
    const reviseInput = revision(direct, first.artifact); await revise(service, direct, reviseInput)
    const second = (await detail(service, direct)).artifacts.find(value => value.revisionRequestId === reviseInput.requestId) as ArtifactVersion
    const adoptInput = adoption(second), receipt = await service.handle('adoptArtifact', adoptInput) as ArtifactAdoptionReceipt
    const saved = await preview(service, second), backupRoot = join(root, 'backup'), restoredRoot = join(root, 'restored')
    await service.backup(backupRoot)
    const files = await readdir(backupRoot)
    expect(files).toContain('boai.sqlite'); expect(files).not.toContain('boai.sqlite-wal'); expect(files).not.toContain('boai.sqlite-shm')
    await cp(backupRoot, restoredRoot, { recursive: true }); await service.close(); await rm(dataPath, { recursive: true, force: true })
    const restored = await open(restoredRoot), restoredView = await detail(restored.service, direct), restoredArtifact = restoredView.artifacts.find(value => value.id === second.id) as ArtifactVersion
    expect(restoredArtifact.path).toBe(join(restoredRoot, 'workspaces', direct.id, second.managedRelativePath)); expect(restoredArtifact.path).not.toBe(second.path)
    expect(await readFile(restoredArtifact.path, 'utf8')).toBe(V2)
    const restoredPreview = await preview(restored.service, second)
    expect(restoredPreview.text).toBe(V2); expect(restoredPreview.artifact).toMatchObject({ id: second.id, contentHash: second.contentHash, logicalArtifactId: first.artifact.logicalArtifactId, previousArtifactId: first.artifact.id, revisionRequestId: reviseInput.requestId })
    expect(restoredPreview.adoption).toEqual(saved.adoption)
    expect(await restored.service.handle('getArtifactAdoptionReceipt', { requestId: adoptInput.requestId })).toEqual(receipt)
    expect(await restored.service.handle('adoptArtifact', adoptInput)).toEqual(receipt)
    const revisedMessage = restoredView.messages.find(value => value.artifactRevisionRequestId === reviseInput.requestId)!
    expect(await restored.service.handle('getMessageReceipt', { requestId: reviseInput.requestId })).toEqual(revisedMessage)
    expect(await restored.service.handle('reviseArtifact', reviseInput)).toEqual(revisedMessage)
    expect(restored.engine.contexts).toEqual([]); expect(restored.engine.decisions).toEqual([])
  })
})
