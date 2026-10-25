/*
 * [OUTPUT]: 自动化新会话跨重启沿员工知识授权，拒绝他人资料；移除使原计划失效，重新保存后无知识工具、旧触发不重放。
 * [OUTPUT]: 资料引用随异路径备份恢复仍按当前受管副本核验；旧路径不读、原授权不扩大、零模型重放。
 * [OUTPUT]: 实际知识读取引用持久化与重启，更新/同字节替换/外改/撤权/清空拒绝旧引用。
 * [OUTPUT]: 群共享/成员/资料解绑及内容更新期间的实际读取与迟到发布失效回归。
 * [OUTPUT]: 旧共享知识文件/目录预览与员工独立替换、原共享范围/CAS/应答丢失及原件保留回归。
 * [OUTPUT]: 宿主普通问答保留知识工具/版本；员工绑定与群共享取交集，读取不创建Work。
 * [INPUT]: 隔离AppService/SQLite、真实文件与受控员工执行。
 * [OUTPUT]: 知识保留/替换/共享/按员工移除及去重清理；提交应答丢失恢复投影，旧共享原件/他人绑定保持，导出一致性数据库和原件。
 * [POS]: 知识资料存储/授权回归；不调用真实模型，不替代桌面操作和本机Agent验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { AgentEngine, EngineContext } from '../packages/runtime/src/contracts'
import type { Artifact, AutomationDefinition, AutomationInput, AutomationOccurrence, Connection, Conversation, ConversationDetail, DigitalAgent, Resource, Snapshot } from '../packages/shared/src/domain'
import type { ArtifactVersion } from '../packages/shared/src/domain/artifacts'
import type { ConversationMaterial } from '../packages/shared/src/domain/materials'
import type { KnowledgeFilesView, KnowledgePreview, KnowledgeReceipt, SaveEmployeeKnowledgeRuntimeInput } from '../packages/shared/src/domain/knowledge'
import { KnowledgeFiles, knowledgePath } from '../packages/runtime/src/modules/resources/knowledge-files'
import { KnowledgeManagement, type KnowledgeOperation } from '../packages/runtime/src/modules/resources/knowledge-management'
import { assertEnvironmentScope, authorizedResources, prepareEnvironment } from '../packages/runtime/src/modules/workspaces/environment-plan'
import { createKnowledgeOperations } from '../packages/runtime/src/modules/resources/knowledge-tools'
import { searchKnowledge } from '../packages/runtime/src/modules/resources/knowledge-search'
import { createTaskRuntime } from '../packages/runtime/src/adapters/mastra/task-runtime'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const secrets = { get: async () => '', set: async () => {}, delete: async () => {} }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const storeOf = (service: AppService) => (service as unknown as { store: ProductStore }).store
const snapshot = (service: AppService) => service.handle('snapshot', undefined) as Promise<Snapshot>
const list = (service: AppService, agentId = 'researcher') => service.handle('listEmployeeKnowledge', { agentId }) as Promise<Resource[]>
const employee = async (service: AppService, agentId = 'researcher') => (await snapshot(service)).agents.find(value => value.id === agentId)!
const detail = (service: AppService, conversation: Conversation) => service.handle('getConversation', { id: conversation.id }) as Promise<ConversationDetail>
const preview = (service: AppService, resource: Resource) => service.handle('getEmployeeKnowledgePreview', { agentId: resource.ownerAgentId!, resourceId: resource.id, contentHash: resource.knowledge!.contentHash }) as Promise<KnowledgePreview>
const receipt = (service: AppService, requestId: string) => service.handle('getEmployeeKnowledgeReceipt', { requestId }) as Promise<KnowledgeReceipt | null>
class FixtureEngine implements AgentEngine {
  calls = 0
  responseKind: 'chat' | 'task' = 'chat'
  handler = async (context: EngineContext) => { await context.onDelta('已收到。') }
  report: AgentEngine['report'] = async (_, draft) => ({ action: 'publish', text: draft.text })
  decide: AgentEngine['decide'] = async context => {
    this.calls++
    return context.participation?.hasRespondedInTurn || context.agent.id !== 'researcher'
      ? { action: 'pass', observedThroughSequence: context.participation!.observedThroughSequence }
      : { action: 'reply', responseKind: this.responseKind, observedThroughSequence: context.participation!.observedThroughSequence, ...(this.responseKind === 'task' ? { work: { key: 'knowledge-artifact', scope: '生成参考文件', deliverable: '可检查文本文件' } } : {}) }
  }
  async run(context: EngineContext) { this.calls++; await this.handler(context) }
  async test() { return 'ok' }
}
async function open(dataPath: string) {
  const engine = new FixtureEngine(), errors: string[] = []
  const service = new AppService({ dataPath, engine, secrets, emit: event => { if (event.type === 'runtime-error') errors.push(event.error) } })
  cleanups.push(() => service.close()); await service.init()
  return { service, engine, errors }
}
async function exportEvidence(source: string, target: string) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    // libsql finalizes native WAL handles after close returns. Capture a consistent
    // SQLite snapshot instead of racing the disappearance of -wal/-shm files.
    if (/\.sqlite-(wal|shm)$/.test(entry.name)) continue
    const from = join(source, entry.name), to = join(target, entry.name)
    if (entry.isDirectory()) await exportEvidence(from, to)
    else if (!entry.isFile()) throw new Error('留证目录存在非普通文件')
    else if (entry.name.endsWith('.sqlite')) {
      const client = createClient({ url: pathToFileURL(from).href })
      try { await client.execute({ sql: 'VACUUM INTO ?', args: [to] }) } finally { client.close() }
    } else await copyFile(from, to)
  }
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-knowledge-'))), testName = expect.getState().currentTestName
  cleanups.push(async () => {
    if (process.env.BOAI_REVIEW_RUN_DIR) {
      const target = join(process.env.BOAI_REVIEW_RUN_DIR, basename(root))
      await exportEvidence(root, target)
      await writeFile(join(target, 'test-context.json'), JSON.stringify({ testName, sourceRoot: root, classification: 'isolated-module-integration', realProviderRequests: 0 }, null, 2))
    }
    await rm(root, { recursive: true, force: true })
  })
  const dataPath = join(root, 'data'), current = await open(dataPath)
  const connection = await current.service.handle('saveConnection', { name: 'fixture', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture-model' }) as Connection
  for (const agentId of ['researcher', 'writer']) {
    const { configVersion: _v, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = await employee(current.service, agentId)
    await current.service.handle('saveAgent', { ...definition, connectionId: connection.id, modelId: 'fixture-model' })
  }
  return { root, dataPath, ...current }
}
async function direct(service: AppService) { return service.handle('createConversation', { kind: 'direct', title: '知识保留来源', agentIds: ['researcher'] }) as Promise<Conversation> }
async function save(service: AppService, source: SaveEmployeeKnowledgeRuntimeInput['source'], agentId = 'researcher', requestId = randomUUID()) {
  const input = { requestId, agentId, expectedConfigVersion: (await employee(service, agentId)).configVersion, source }
  const result = await service.handle('saveEmployeeKnowledge', input) as KnowledgeReceipt
  return { input, receipt: result, resource: (await list(service, agentId)).find(item => item.id === result.resourceId)! }
}
async function file(service: AppService, root: string, content = '# 品牌规范\n请使用蓝色标题。', agentId = 'researcher') {
  const path = join(root, `${randomUUID()}.md`); await writeFile(path, content)
  return { ...await save(service, { kind: 'file', path, name: '品牌规范.md' }, agentId), path, content }
}
async function settled(service: AppService, conversation: Conversation) {
  await vi.waitFor(async () => {
    const view = await detail(service, conversation)
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
  }, { timeout: 5000, interval: 10 })
  await new Promise(resolve => setTimeout(resolve, 20))
}
async function sentMaterial(service: AppService, root: string, conversation: Conversation, authorizedAgentIds?: string[]) {
  const path = join(root, `${randomUUID()}.md`); await writeFile(path, '# 客户规范\n甲方要求保留来源。')
  const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path, requestId: randomUUID(), ...(authorizedAgentIds ? { authorizedAgentIds } : {}) }) as ConversationMaterial
  await service.handle('sendMessage', { conversationId: conversation.id, content: '', mentionIds: ['researcher'], requestId: randomUUID(), materialSelections: [{ id: material.id, revision: material.revision }] }); await settled(service, conversation)
  return { material, source: { kind: 'material' as const, conversationId: conversation.id, id: material.id, contentHash: material.contentHash!, revision: material.revision } }
}
function environment(root: string, agent: DigitalAgent, conversation: Conversation, resources: Resource[]) {
  const session = join(root, 'env', agent.id, conversation.id), runId = randomUUID()
  return prepareEnvironment({ agent, conversation, resources, runId, signal: new AbortController().signal, workspace: { root: session, workPath: join(session, 'work'), runPath: join(session, 'runs', runId), sharedPath: join(root, 'shared-env', conversation.id) } })
}
async function publishManual(context: EngineContext) {
  const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
  try {
    const path = `self:/runs/${context.runId}/manual.md`
    await runtime.tools.write_file.execute!({ path, content: '# 产品手册\n蓝色版本。' }, invocation)
    const result = await runtime.tools.publish_artifact.execute!({ path, name: '产品手册.md' }, invocation) as { artifact: Artifact }
    await context.onDelta('已发布手册。'); expect(result.artifact.id).toBeTruthy()
    await context.onWorkOutcome!({ disposition: 'delivered', summary: '手册已发布', evidence: [{ kind: 'artifact', reference: result.artifact.id! }] })
  } finally { await runtime.workspace.destroy() }
}

describe('employee knowledge independent retention', () => {
  it.each([false, true])('updates only one employee reference to legacy knowledge and retains shared scopes after ack loss=%s', async lost => {
    const { service, root, dataPath } = await fixture(), originalPath = join(root, 'legacy.md'), nextPath = join(root, 'new.md')
    await writeFile(originalPath, '旧共用资料'); await writeFile(nextPath, '更新后专属资料')
    const legacy = await service.handle('importResource', { kind: 'knowledge', path: originalPath }) as Resource
    for (const agentId of ['researcher', 'writer']) {
      const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...agent } = await employee(service, agentId)
      await service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, knowledgeIds: [legacy.id] })
    }
    const group = await service.handle('createConversation', { kind: 'group', title: '旧共享组', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [legacy.id] }) as Conversation
    const writerConfig = await employee(service, 'writer')
    const extra = await service.handle('saveAgent', { name: '其他员工', role: '审阅', instructions: '', color: '#00AABB', connectionId: writerConfig.connectionId, modelId: writerConfig.modelId, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    const other = await service.handle('createConversation', { kind: 'group', title: '无当前员工', agentIds: ['writer', extra.id], sharedKnowledgeIds: [legacy.id] }) as Conversation
    const inspected = await service.handle('getEmployeeKnowledgeFiles', { agentId: 'researcher', resourceId: legacy.id }) as KnowledgeFilesView
    expect(inspected).toMatchObject({ revision: 0, resource: { id: legacy.id } }); expect(inspected.files).toHaveLength(1)
    const read = await service.handle('getEmployeeKnowledgePreview', { agentId: 'researcher', resourceId: legacy.id, contentHash: inspected.contentHash, fileKey: inspected.files[0].key }) as KnowledgePreview
    expect(read.filePreview.text).toBe('旧共用资料')
    const input = { requestId: randomUUID(), agentId: 'researcher', expectedConfigVersion: (await employee(service)).configVersion, replace: { resourceId: legacy.id, revision: 0, contentHash: inspected.contentHash }, source: { kind: 'file' as const, path: nextPath, name: '新资料.md' } }
    const writerBefore = await employee(service, 'writer'), store = storeOf(service), original = store.transaction.bind(store); let injected = false
    const fault = lost ? vi.spyOn(store, 'transaction').mockImplementation(async action => {
      const result = await original(action)
      if (!injected && result && typeof result === 'object' && 'knowledgeIds' in result) { injected = true; throw new Error('legacy update acknowledgement lost') }
      return result
    }) : undefined
    if (lost) await expect(service.handle('saveEmployeeKnowledge', input)).rejects.toThrow('legacy update acknowledgement lost')
    else await service.handle('saveEmployeeKnowledge', input)
    fault?.mockRestore()
    const saved = (await receipt(service, input.requestId))!, resource = (await list(service))[0]
    expect(saved.status).toBe('completed'); expect(resource.id).not.toBe(legacy.id); expect(resource.ownerAgentId).toBe('researcher')
    expect(await employee(service, 'writer')).toEqual(writerBefore); expect((await list(service, 'writer')).map(value => value.id)).toEqual([legacy.id])
    expect((await detail(service, group)).conversation.sharedKnowledgeIds).toEqual([legacy.id, resource.id])
    expect((await detail(service, other)).conversation).toEqual(other)
    expect(await readFile(originalPath, 'utf8')).toBe('旧共用资料'); expect(await readFile(legacy.path, 'utf8')).toBe('旧共用资料')
    expect((await preview(service, resource)).filePreview.text).toBe('更新后专属资料')
    await expect(service.handle('getEmployeeKnowledgeFiles', { agentId: 'researcher', resourceId: legacy.id })).rejects.toThrow('未绑定')
    expect(await service.handle('saveEmployeeKnowledge', input)).toEqual(saved)
    await service.close(); const reopened = await open(dataPath)
    expect(await receipt(reopened.service, input.requestId)).toEqual(saved)
    expect((await detail(reopened.service, group)).conversation.sharedKnowledgeIds).toEqual([legacy.id, resource.id])
    expect((await list(reopened.service)).map(value => value.id)).toEqual([resource.id]); expect((await list(reopened.service, 'writer')).map(value => value.id)).toEqual([legacy.id])
    expect(reopened.engine.calls).toBe(0)
  })

  it('previews a historical directory by frozen relative file identity and refuses stale changes or link escapes', async () => {
    const initial = await fixture(), legacyId = randomUUID(), directory = join(initial.dataPath, 'knowledge', legacyId, 'legacy-directory'); await mkdir(directory, { recursive: true }); await mkdir(join(directory, 'nested'))
    await writeFile(join(directory, 'a.md'), '目录第一份'); await writeFile(join(directory, 'nested/b.txt'), '目录第二份')
    const legacy: Resource = { id: legacyId, kind: 'knowledge', name: '历史资料目录', description: '', path: directory, createdAt: new Date().toISOString() }
    await storeOf(initial.service).write([{ collection: 'resources', id: legacy.id, value: legacy }]); await initial.service.close()
    const { service } = await open(initial.dataPath)
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...agent } = await employee(service)
    await service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, knowledgeIds: [legacy.id] })
    const inspected = await service.handle('getEmployeeKnowledgeFiles', { agentId: agent.id, resourceId: legacy.id }) as KnowledgeFilesView
    expect(inspected.files.map(file => file.key)).toEqual(['a.md', 'nested/b.txt'])
    const request = { agentId: agent.id, resourceId: legacy.id, contentHash: inspected.contentHash, fileKey: 'nested/b.txt' }
    expect((await service.handle('getEmployeeKnowledgePreview', request) as KnowledgePreview).filePreview.text).toBe('目录第二份')
    await expect(service.handle('getEmployeeKnowledgePreview', { ...request, fileKey: '../outside.md' })).rejects.toThrow('实际文件')
    await writeFile(join(directory, 'a.md'), '外部变化')
    await expect(service.handle('getEmployeeKnowledgePreview', request)).rejects.toThrow('内容已变化')
    await expect(service.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: agent.id, expectedConfigVersion: (await employee(service)).configVersion, replace: { resourceId: legacy.id, revision: 0, contentHash: inspected.contentHash }, source: { kind: 'file', path: join(directory, 'a.md') } })).rejects.toThrow('旧知识资料内容已变化')
    const outside = join(initial.root, 'outside.md'); await writeFile(outside, '目录外内容'); await symlink(outside, join(directory, 'escape.md'))
    await expect(service.handle('getEmployeeKnowledgeFiles', { agentId: agent.id, resourceId: legacy.id })).rejects.toThrow('links')
    expect((await list(service)).map(resource => resource.id)).toEqual([legacy.id]); expect(await readFile(outside, 'utf8')).toBe('目录外内容')
    await rm(join(directory, 'escape.md'))
    const current = await service.handle('getEmployeeKnowledgeFiles', { agentId: agent.id, resourceId: legacy.id }) as KnowledgeFilesView
    const saved = await service.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: agent.id, expectedConfigVersion: (await employee(service)).configVersion, replace: { resourceId: legacy.id, revision: 0, contentHash: current.contentHash }, source: { kind: 'file', path: join(directory, 'a.md') } }) as KnowledgeReceipt
    expect(saved.resourceId).not.toBe(legacy.id); expect((await list(service)).map(resource => resource.id)).toEqual([saved.resourceId])
    expect(await readFile(join(directory, 'nested/b.txt'), 'utf8')).toBe('目录第二份')
  })

  it.each(['unshare', 'remove-member', 'unbind', 'replace'] as const)('stops an in-flight group knowledge read and late answer after %s', async change => {
    const { service, root, engine } = await fixture(), added = await file(service, root)
    const group = await service.handle('createConversation', { kind: 'group', title: '活动知识共享', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [added.resource.id] }) as Conversation
    let held: EngineContext | undefined, returned = false, done = false, failure = ''
    let release!: () => void
    const pause = new Promise<void>(resolve => { release = resolve })
    engine.handler = async context => {
      const access = context.assertKnowledgeAccess!, read = createKnowledgeOperations(context).find(tool => tool.name === 'read_knowledge')!
      let checks = 0
      context.assertKnowledgeAccess = async ids => {
        if (++checks === 3) { held = context; await pause }
        await access(ids)
      }
      try {
        try { await read.execute({ resourceId: added.resource.id, path: added.resource.path, contentHash: added.resource.knowledge!.contentHash }); returned = true } catch (error) { failure = String(error) }
        await context.onDelta('旧资料迟到回答')
      } finally { done = true }
    }
    try {
      await service.handle('sendMessage', { conversationId: group.id, content: '请读取品牌资料', mentionIds: ['researcher'], requestId: randomUUID() })
      await vi.waitFor(() => expect(held).toBeTruthy())
      const current = await employee(service), room = (await detail(service, group)).conversation
      if (change === 'unshare') await service.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: current.id, resourceId: added.resource.id, conversationId: room.id, expectedConfigVersion: room.configVersion, shared: false })
      if (change === 'remove-member') await service.handle('createConversation', { id: room.id, kind: 'group', title: room.title, agentIds: ['writer'], sharedKnowledgeIds: room.sharedKnowledgeIds, expectedConfigVersion: room.configVersion })
      if (change === 'unbind') await service.handle('removeEmployeeKnowledge', { requestId: randomUUID(), agentId: current.id, resourceId: added.resource.id, expectedConfigVersion: current.configVersion })
      if (change === 'replace') {
        const path = join(root, 'updated-in-flight.md'); await writeFile(path, '新版知识资料')
        await service.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: current.id, expectedConfigVersion: current.configVersion, replace: { resourceId: added.resource.id, revision: added.resource.knowledge!.revision, contentHash: added.resource.knowledge!.contentHash }, source: { kind: 'file', path, name: '新版.md' } })
      }
      release(); await vi.waitFor(() => expect(done).toBe(true)); await settled(service, group)
      expect(held!.signal.aborted).toBe(true); expect(returned).toBe(false); expect(failure).not.toBe('')
      const final = await detail(service, group)
      expect(final.messages.some(message => message.status === 'completed' && message.content.includes('旧资料迟到回答'))).toBe(false)
      expect(final.workItems).toEqual([])
      expect(await readFile(added.path, 'utf8')).toBe(added.content)
      if (change === 'replace') expect((await preview(service, (await list(service))[0])).filePreview.text).toBe('新版知识资料')
    } finally { release() }
  })

  it('reads retained knowledge in ordinary host chat, requires group sharing, and refuses changed or unbound file identities', async () => {
    const { service, root, engine } = await fixture(), added = await file(service, root, '# 品牌规范\n标题蓝色，正文黑色。')
    const chat = await direct(service)
    const observations: { conversation: string; names: string[]; content?: string }[] = []
    engine.handler = async context => {
      expect(context.work).toBeUndefined()
      const tools = createKnowledgeOperations(context), observation = { conversation: context.conversation.id, names: tools.map(tool => tool.name), content: undefined as string | undefined }
      observations.push(observation)
      if (tools.length) {
        const read = tools.find(tool => tool.name === 'read_knowledge')!
        const args = { resourceId: added.resource.id, path: added.resource.path, contentHash: added.resource.knowledge!.contentHash }
        await expect(read.execute({ ...args, resourceId: 'other-employee-file' })).rejects.toThrow('不属于本次授权')
        await expect(read.execute({ ...args, contentHash: 'old-version' })).rejects.toThrow('不属于本次授权')
        const result = await read.execute(args) as { content: string; contentHash: string; citation: string }
        expect(result.contentHash).toBe(hash(added.content)); expect(result.citation).toContain(added.resource.path)
        observation.content = result.content
      }
      await context.onDelta(observation.content ?? '当前会话无获准知识资料。')
    }
    const ask = async (conversation: Conversation) => { await service.handle('sendMessage', { conversationId: conversation.id, requestId: randomUUID(), content: '查阅知识资料的品牌规范', mentionIds: ['researcher'] }); await settled(service, conversation) }
    await ask(chat)
    expect(observations.at(-1)).toMatchObject({ content: added.content, names: ['inspect_knowledge', 'search_knowledge', 'read_knowledge'] })
    const group = await service.handle('createConversation', { kind: 'group', title: '知识授权', agentIds: ['researcher', 'writer'] }) as Conversation
    await ask(group); expect(observations.at(-1)?.names).toEqual([])
    const shared = await service.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, conversationId: group.id, expectedConfigVersion: group.configVersion, shared: true })
    expect(shared).toBeTruthy(); await ask(group); expect(observations.at(-1)?.content).toBe(added.content)
    expect((await detail(service, chat)).workItems).toEqual([]); expect((await detail(service, group)).workItems).toEqual([])
    engine.handler = async context => {
      await writeFile(added.resource.path, '外部修改内容，不应提供给模型')
      const read = createKnowledgeOperations(context).find(tool => tool.name === 'read_knowledge')!
      await expect(read.execute({ resourceId: added.resource.id, path: added.resource.path, contentHash: added.resource.knowledge!.contentHash })).rejects.toThrow('资源内容已变更')
      await context.onDelta('资料已经变化，请重新核对。')
    }
    await ask(chat)
    expect((await detail(service, chat)).messages.at(-1)?.content).toBe('资料已经变化，请重新核对。')
  })

  it('removes owned knowledge atomically, preserves external bytes and resolves duplicate requests after deletion and restart', async () => {
    const { service, root, dataPath, engine } = await fixture(), added = await file(service, root)
    const group = await service.handle('createConversation', { kind: 'group', title: '移除共享', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [added.resource.id] }) as Conversation
    const agent = await employee(service), input = { requestId: randomUUID(), agentId: agent.id, resourceId: added.resource.id, expectedConfigVersion: agent.configVersion }
    await expect(service.handle('removeEmployeeKnowledge', { ...input, expectedConfigVersion: agent.configVersion - 1 })).rejects.toThrow('员工配置已变更')
    expect(await list(service)).toHaveLength(1)
    const result = await service.handle('removeEmployeeKnowledge', input)
    expect(result).toMatchObject({ action: 'remove', status: 'completed', configVersion: agent.configVersion + 1 })
    expect(await receipt(service, input.requestId)).toEqual(result)
    expect(await service.handle('removeEmployeeKnowledge', input)).toEqual(result)
    expect(await list(service)).toEqual([])
    expect((await detail(service, group)).conversation).toMatchObject({ sharedKnowledgeIds: [], configVersion: group.configVersion! + 1 })
    await expect(readFile(added.resource.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(added.path, 'utf8')).toBe(added.content); expect(engine.calls).toBe(0)
    await service.close(); const reopened = await open(dataPath)
    expect(await receipt(reopened.service, input.requestId)).toEqual(result)
    expect(await reopened.service.handle('removeEmployeeKnowledge', input)).toEqual(result)
    expect(await list(reopened.service)).toEqual([]); expect(reopened.engine.calls).toBe(0)
  })

  it('unbinds a legacy shared file only from the chosen employee and keeps other bindings, group sharing and original files', async () => {
    const { service, root } = await fixture(), directory = join(root, 'legacy'); await mkdir(directory); await writeFile(join(directory, 'guide.md'), '旧知识资料正文')
    const resource = await service.handle('importResource', { kind: 'knowledge', path: join(directory, 'guide.md') }) as Resource
    for (const agentId of ['researcher', 'writer']) {
      const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...agent } = await employee(service, agentId)
      await service.handle('saveAgent', { ...agent, expectedConfigVersion: configVersion, knowledgeIds: [resource.id] })
    }
    const group = await service.handle('createConversation', { kind: 'group', title: '旧共享保持', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [resource.id] }) as Conversation
    const beforeWriter = await employee(service, 'writer'), agent = await employee(service)
    await service.handle('removeEmployeeKnowledge', { requestId: randomUUID(), agentId: agent.id, resourceId: resource.id, expectedConfigVersion: agent.configVersion })
    expect(await list(service)).toEqual([]); expect((await list(service, 'writer')).map(value => value.id)).toEqual([resource.id])
    expect(await employee(service, 'writer')).toEqual(beforeWriter)
    expect((await detail(service, group)).conversation).toEqual(group)
    expect(await readFile(resource.path, 'utf8')).toBe('旧知识资料正文')
    expect(await readFile(join(directory, 'guide.md'), 'utf8')).toBe('旧知识资料正文')
    expect(await service.handle('listResourceCleanups', undefined)).toEqual([])
  })

  it('restores the committed conversation projection after a lost sharing acknowledgement without submitting or incrementing twice', async () => {
    const { service, root } = await fixture(), added = await file(service, root)
    const group = await service.handle('createConversation', { kind: 'group', title: '共享未知回执', agentIds: ['researcher', 'writer'] }) as Conversation
    const input = { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, conversationId: group.id, expectedConfigVersion: group.configVersion!, shared: true }
    const store = storeOf(service), original = store.transaction.bind(store); let injected = false
    const fault = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      const result = await original(action)
      if (!injected && result && typeof result === 'object' && 'receipt' in result && 'conversation' in result) { injected = true; throw new Error('sharing acknowledgement lost') }
      return result
    })
    await expect(service.handle('setEmployeeKnowledgeSharing', input)).rejects.toThrow('sharing acknowledgement lost')
    fault.mockRestore(); expect(injected).toBe(true)
    const current = (await detail(service, group)).conversation, confirmed = await receipt(service, input.requestId)
    expect(current.sharedKnowledgeIds).toEqual([added.resource.id]); expect(current.configVersion).toBe(group.configVersion! + 1)
    expect(confirmed).toMatchObject({ status: 'completed', conversationVersion: current.configVersion })
    expect(await service.handle('setEmployeeKnowledgeSharing', input)).toEqual(confirmed)
    expect((await detail(service, group)).conversation).toEqual(current)
  })

  it('restores a committed removal after a lost acknowledgement and never deletes unrelated resources', async () => {
    const { service, root } = await fixture(), added = await file(service, root), kept = await file(service, root, '写手独立知识', 'writer')
    const input = { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, expectedConfigVersion: (await employee(service)).configVersion }
    const store = storeOf(service), original = store.transaction.bind(store); let injected = false
    const fault = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      const result = await original(action)
      if (!injected && result && typeof result === 'object' && 'removal' in result) { injected = true; throw new Error('removal acknowledgement lost') }
      return result
    })
    await expect(service.handle('removeEmployeeKnowledge', input)).rejects.toThrow('removal acknowledgement lost')
    fault.mockRestore(); expect(injected).toBe(true)
    expect(await receipt(service, input.requestId)).toMatchObject({ action: 'remove', status: 'completed' })
    expect((await snapshot(service)).resources.some(value => value.id === added.resource.id)).toBe(false)
    expect(await list(service)).toEqual([]); expect((await list(service, 'writer')).map(value => value.id)).toEqual([kept.resource.id])
    await expect(readFile(added.resource.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await preview(service, kept.resource)).filePreview.text).toBe(kept.content)
    expect(await service.handle('removeEmployeeKnowledge', input)).toEqual(await receipt(service, input.requestId))
  })

  it('replaces current contents under the same identity and sharing, rejecting stale writes and previously frozen reads', async () => {
    const { service, root } = await fixture(), added = await file(service, root), conversation = await direct(service)
    const group = await service.handle('createConversation', { kind: 'group', title: '共享更新', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [added.resource.id] }) as Conversation
    const agent = await employee(service), plan = await environment(root, agent, conversation, await list(service))
    const path = join(root, 'updated.md'); await writeFile(path, '新版资料：绿色标题')
    const input = { requestId: randomUUID(), agentId: agent.id, expectedConfigVersion: agent.configVersion, replace: { resourceId: added.resource.id, revision: 1, contentHash: added.resource.knowledge!.contentHash }, source: { kind: 'file', path, name: '品牌规范.md' } }
    const updated = await service.handle('saveEmployeeKnowledge', input) as KnowledgeReceipt
    const current = (await list(service))[0]
    expect(current.id).toBe(added.resource.id); expect(current.knowledge!.revision).toBe(2)
    expect((await employee(service)).configVersion).toBe(agent.configVersion)
    expect((await detail(service, group)).conversation.sharedKnowledgeIds).toEqual([current.id])
    expect((await preview(service, current)).filePreview.text).toBe('新版资料：绿色标题')
    await expect(readFile(added.resource.path)).rejects.toThrow()
    expect(() => assertEnvironmentScope(plan, { agent, conversation, runId: plan.runId, workspace: plan.workspace, resources: [current], signal: new AbortController().signal })).toThrow('知识资料内容已变更')
    await expect(preview(service, added.resource)).rejects.toThrow('内容已变化')
    expect(await service.handle('saveEmployeeKnowledge', input)).toEqual(updated)
    await expect(service.handle('saveEmployeeKnowledge', { ...input, requestId: randomUUID() })).rejects.toThrow('内容已变化')
  })

  it('cleans an interrupted replacement even while the old resource is still committed, preserving old content and binding', async () => {
    const { service, root, dataPath } = await fixture(), added = await file(service, root)
    const replacement = structuredClone(added.resource)
    replacement.knowledge = { ...replacement.knowledge!, revision: 2, copyId: randomUUID(), contentHash: hash('未提交新版'), size: Buffer.byteLength('未提交新版') }
    replacement.path = knowledgePath(dataPath, replacement.id, replacement.knowledge)
    await new KnowledgeFiles(dataPath).prepare(replacement.id, replacement.knowledge, Buffer.from('未提交新版'))
    const operation: KnowledgeOperation = { id: randomUUID(), fingerprint: 'isolated-prepare', receipt: { requestId: '', agentId: 'researcher', resourceId: replacement.id, status: 'preparing' }, resource: replacement, previous: added.resource }; operation.receipt.requestId = operation.id
    await storeOf(service).write([{ collection: 'knowledgeOperations', id: operation.id, value: operation }]); await service.close()
    const restarted = await open(dataPath)
    expect((await preview(restarted.service, added.resource)).filePreview.text).toBe(added.content)
    await expect(readFile(replacement.path)).rejects.toThrow()
    expect(await receipt(restarted.service, operation.id)).toMatchObject({ status: 'interrupted' })
    expect(restarted.engine.calls).toBe(0)
  })

  it('retains changed obsolete bytes after replacement, then transfers all copy identities into resource deletion recovery', async () => {
    const { service, root } = await fixture(), added = await file(service, root)
    await writeFile(added.resource.path, '外改旧版')
    const path = join(root, 'new.md'); await writeFile(path, '新版')
    const input = { requestId: randomUUID(), agentId: 'researcher', expectedConfigVersion: (await employee(service)).configVersion, replace: { resourceId: added.resource.id, revision: 1, contentHash: added.resource.knowledge!.contentHash }, source: { kind: 'file', path } }
    expect(await service.handle('saveEmployeeKnowledge', input)).toMatchObject({ status: 'completed', cleanupError: expect.stringContaining('外部修改') })
    const current = (await list(service))[0]; expect((await preview(service, current)).filePreview.text).toBe('新版')
    await expect(service.handle('removeResource', { id: current.id })).rejects.toThrow('清理未完成')
    expect(await readFile(added.resource.path, 'utf8')).toBe('外改旧版')
    await writeFile(added.resource.path, added.content); await service.handle('retryResourceCleanup', { id: current.id })
    await expect(readFile(added.resource.path)).rejects.toThrow(); await expect(readFile(current.path)).rejects.toThrow()
    expect(await receipt(service, input.requestId)).toMatchObject({ status: 'cleared' })
  })

  it('shares explicitly to one conversation with idempotent receipts, requiring both employee binding and conversation sharing', async () => {
    const { service, root } = await fixture(), added = await file(service, root)
    const group = await service.handle('createConversation', { kind: 'group', title: '共享目标', agentIds: ['researcher', 'writer'] }) as Conversation
    const agent = await employee(service), writer = await employee(service, 'writer')
    expect(authorizedResources(agent, group, [added.resource])).toEqual([])
    const input = { requestId: randomUUID(), agentId: agent.id, resourceId: added.resource.id, conversationId: group.id, expectedConfigVersion: group.configVersion!, shared: true }
    const confirmed = await service.handle('setEmployeeKnowledgeSharing', input)
    expect(await service.handle('setEmployeeKnowledgeSharing', input)).toEqual(confirmed)
    const shared = (await detail(service, group)).conversation
    expect(authorizedResources(agent, shared, [added.resource])).toHaveLength(1)
    expect(authorizedResources(writer, shared, [added.resource])).toEqual([])
    await expect(service.handle('setEmployeeKnowledgeSharing', { ...input, requestId: randomUUID() })).rejects.toThrow('会话配置已变更')
    await service.handle('setEmployeeKnowledgeSharing', { ...input, requestId: randomUUID(), expectedConfigVersion: shared.configVersion, shared: false })
    expect(authorizedResources(agent, (await detail(service, group)).conversation, [added.resource])).toEqual([])
    expect((await preview(service, added.resource)).filePreview.text).toBe(added.content)
  })

  it('saves verified independent bytes and an atomic binding/receipt without creating chat or executing a model', async () => {
    const { service, root, engine } = await fixture(), before = await employee(service), added = await file(service, root)
    expect(added.receipt).toMatchObject({ status: 'completed', configVersion: before.configVersion + 1 })
    expect(added.resource).toMatchObject({ kind: 'knowledge', ownerAgentId: before.id, knowledge: { contentHash: hash(added.content), size: Buffer.byteLength(added.content), source: { kind: 'file', name: '品牌规范.md' }, retainedBy: 'user' } })
    expect((await employee(service)).knowledgeIds).toEqual([...before.knowledgeIds, added.resource.id])
    await writeFile(added.path, '外部原文件的新内容')
    expect((await preview(service, added.resource)).filePreview).toEqual({ kind: 'markdown', text: added.content })
    expect(await service.handle('saveEmployeeKnowledge', added.input)).toEqual(added.receipt)
    expect(await list(service)).toHaveLength(1)
    await expect(service.handle('saveEmployeeKnowledge', { ...added.input, source: { ...added.input.source, name: '不同名字.md' } })).rejects.toThrow('请求身份')
    const stale = { ...added.input, requestId: randomUUID() }
    await expect(service.handle('saveEmployeeKnowledge', stale)).rejects.toThrow('配置已变更')
    expect(await receipt(service, stale.requestId)).toBeNull()
    for (const collection of ['conversations', 'messages', 'runs', 'workItems']) expect(await storeOf(service).load(collection)).toEqual([])
    expect(engine.calls).toBe(0)
  })

  it('does not expose another employee’s retained knowledge through list, preview or configuration binding', async () => {
    const { service, root } = await fixture(), added = await file(service, root), other = await employee(service, 'writer')
    expect(await list(service, other.id)).toEqual([])
    await expect(service.handle('getEmployeeKnowledgePreview', { agentId: other.id, resourceId: added.resource.id, contentHash: added.resource.knowledge!.contentHash })).rejects.toThrow()
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...definition } = other
    await expect(service.handle('saveAgent', { ...definition, knowledgeIds: [added.resource.id], expectedConfigVersion: configVersion })).rejects.toThrow('其他员工的知识资料')
    expect((await employee(service, other.id)).knowledgeIds).toEqual([])
  })

  it('retains a sent attachment after source history is cleared, with owner metadata and unchanged original content', async () => {
    const { service, root, engine } = await fixture(), conversation = await direct(service), material = await sentMaterial(service, root, conversation)
    const calls = engine.calls, added = await save(service, material.source)
    expect(added.resource.knowledge!.source).toMatchObject({ ...material.source, messageId: expect.any(String) })
    expect(engine.calls).toBe(calls)
    await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect((await detail(service, conversation)).messages).toEqual([])
    expect((await preview(service, added.resource)).filePreview.text).toContain('甲方要求保留来源')
    expect(await receipt(service, added.input.requestId)).toEqual(added.receipt)
    expect(engine.calls).toBe(calls)
  })

  it('checks room membership, actual attachment authorization and exact source hash before retention', async () => {
    const { service, root } = await fixture(), conversation = await direct(service), material = await sentMaterial(service, root, conversation)
    await expect(save(service, material.source, 'writer')).rejects.toThrow('当前会话')
    await expect(save(service, { ...material.source, contentHash: '0'.repeat(64) })).rejects.toThrow()
    const group = await service.handle('createConversation', { kind: 'group', title: '旧显式授权材料', agentIds: ['researcher', 'writer'], mode: 'mention' }) as Conversation
    const restricted = await sentMaterial(service, root, group, ['researcher'])
    await expect(save(service, restricted.source, 'writer')).rejects.toThrow()
    expect(await list(service)).toEqual([]); expect(await list(service, 'writer')).toEqual([])
    expect(await storeOf(service).load('knowledgeOperations')).toEqual([])
  })

  it('revokes a retained attachment only for the employee losing source access and never revives it by reopening the app or regranting the source', async () => {
    const { service, root, dataPath } = await fixture()
    const group = await service.handle('createConversation', { kind: 'group', title: '明确材料撤权', agentIds: ['researcher', 'writer'], mode: 'mention' }) as Conversation
    const source = await sentMaterial(service, root, group, ['researcher', 'writer'])
    const first = await save(service, source.source), second = await save(service, source.source, 'writer'), unrelated = await file(service, root, '独立参考资料')
    const writerVersion = (await employee(service, 'writer')).configVersion
    const revoked = await service.handle('setMaterialAuthorization', { id: source.material.id, expectedRevision: source.material.revision, authorizedAgentIds: ['writer'] }) as ConversationMaterial
    await expect(preview(service, first.resource)).rejects.toThrow('撤回')
    expect((await preview(service, second.resource)).filePreview.text).toContain('甲方要求')
    expect((await preview(service, unrelated.resource)).filePreview.text).toBe('独立参考资料')
    expect((await employee(service, 'writer')).configVersion).toBe(writerVersion)
    const conversation = await direct(service), plan = await environment(root, await employee(service), conversation, await list(service))
    expect(plan.knowledge.map(value => value.resource.id)).toEqual([unrelated.resource.id])
    await service.handle('setMaterialAuthorization', { id: source.material.id, expectedRevision: revoked.revision, authorizedAgentIds: ['researcher', 'writer'] })
    await expect(preview(service, first.resource)).rejects.toThrow('撤回')
    await service.close(); const restarted = await open(dataPath)
    await expect(preview(restarted.service, first.resource)).rejects.toThrow('撤回')
    expect((await preview(restarted.service, second.resource)).filePreview.text).toContain('甲方要求')
    expect(restarted.engine.calls).toBe(0)
  })

  it('retains a real published artifact independently of its source conversation and mutable employee work file', async () => {
    const { service, root, engine } = await fixture(), conversation = await direct(service)
    engine.responseKind = 'task'
    engine.handler = publishManual
    await service.handle('sendMessage', { conversationId: conversation.id, content: '生成产品手册', mentionIds: [], requestId: randomUUID() }); await settled(service, conversation)
    const artifact = (await storeOf(service).load<ArtifactVersion>('artifacts'))[0]
    expect(artifact).toBeDefined()
    const added = await save(service, { kind: 'artifact', conversationId: conversation.id, id: artifact.id, contentHash: artifact.contentHash! })
    expect(added.resource.path).not.toBe(artifact.path)
    await service.handle('clearConversationHistory', { id: conversation.id, hide: false })
    expect((await preview(service, added.resource)).filePreview.text).toBe('# 产品手册\n蓝色版本。')
    const plan = await environment(root, await employee(service), conversation, await list(service))
    const results = await searchKnowledge([added.resource], '蓝色版本', new AbortController().signal, plan.knowledge)
    expect(results.results[0]).toMatchObject({ name: '产品手册.md', excerpt: '# 产品手册\n蓝色版本。' })
  })

  it('propagates an explicit material revocation through a published artifact, with both changes in one transaction', async () => {
    const { service, root, engine } = await fixture()
    const group = await service.handle('createConversation', { kind: 'group', title: '成果派生撤权', agentIds: ['researcher', 'writer'], mode: 'mention' }) as Conversation
    engine.responseKind = 'task'; engine.handler = publishManual
    const source = await sentMaterial(service, root, group, ['researcher', 'writer'])
    const artifact = (await storeOf(service).load<ArtifactVersion>('artifacts'))[0]
    expect(artifact.materialSources).toEqual([expect.objectContaining({ id: source.material.id })])
    const added = await save(service, { kind: 'artifact', conversationId: group.id, id: artifact.id, contentHash: artifact.contentHash! })
    expect(added.resource.knowledge!.materialSources).toEqual(artifact.materialSources)
    const original = KnowledgeManagement.prototype.revokeMaterial
    const fault = vi.spyOn(KnowledgeManagement.prototype, 'revokeMaterial').mockImplementationOnce(async function (this: KnowledgeManagement, ...args) { await original.apply(this, args); throw new Error('injected transaction rollback') })
    const revoke = { id: source.material.id, expectedRevision: source.material.revision, authorizedAgentIds: ['writer'] }
    await expect(service.handle('setMaterialAuthorization', revoke)).rejects.toThrow('injected transaction rollback')
    expect((await storeOf(service).get<ConversationMaterial>('materials', source.material.id))!.authorizedAgentIds).toEqual(['researcher', 'writer'])
    expect((await preview(service, added.resource)).filePreview.text).toContain('蓝色版本')
    fault.mockRestore()
    await service.handle('setMaterialAuthorization', revoke)
    await expect(preview(service, added.resource)).rejects.toThrow('撤回')
    expect(await readFile(added.resource.path, 'utf8')).toContain('蓝色版本')
  })

  it('preserves a committed binding and copy when the transaction acknowledgement is lost, so receipt lookup can resolve the unknown', async () => {
    const { service, root } = await fixture(), path = join(root, 'receipt.md'); await writeFile(path, '已提交原件')
    const store = storeOf(service), original = store.transaction.bind(store)
    let injected = false
    const fault = vi.spyOn(store, 'transaction').mockImplementation(async action => {
      const result = await original(action)
      if (!injected && result && typeof result === 'object' && 'knowledgeIds' in result) { injected = true; throw new Error('injected acknowledgement lost') }
      return result
    })
    const input = { requestId: randomUUID(), agentId: 'researcher', expectedConfigVersion: (await employee(service)).configVersion, source: { kind: 'file', path, name: 'receipt.md' } }
    await expect(service.handle('saveEmployeeKnowledge', input)).rejects.toThrow('acknowledgement lost')
    fault.mockRestore(); expect(injected).toBe(true)
    const confirmed = await receipt(service, input.requestId), resource = (await list(service))[0]
    expect(confirmed).toMatchObject({ status: 'completed', resourceId: resource.id })
    expect((await snapshot(service)).resources.some(value => value.id === resource.id)).toBe(true)
    expect((await preview(service, resource)).filePreview.text).toBe('已提交原件')
    expect(await service.handle('saveEmployeeKnowledge', input)).toEqual(confirmed)
    expect(await list(service)).toHaveLength(1)
  })

  it('restores a portable independent copy and the same receipt without rereading deleted external files or executing a model', async () => {
    const { service, root, dataPath } = await fixture(), added = await file(service, root), backup = join(root, 'backup'), restoredPath = join(root, 'restore')
    await service.backup(backup); await service.close(); await rm(added.path); await rm(dataPath, { recursive: true, force: true }); await cp(backup, restoredPath, { recursive: true })
    const restored = await open(restoredPath), resource = (await list(restored.service))[0]
    expect(resource.id).toBe(added.resource.id); expect(resource.path.startsWith(restoredPath)).toBe(true)
    expect((await preview(restored.service, resource)).filePreview.text).toBe(added.content)
    expect(await receipt(restored.service, added.input.requestId)).toEqual(added.receipt)
    await restored.service.handle('removeResource', { id: resource.id })
    await expect(readFile(resource.path)).rejects.toThrow(); expect(await receipt(restored.service, added.input.requestId)).toMatchObject({ status: 'cleared' })
    expect(restored.engine.calls).toBe(0)
  })

  it('rejects externally changed copies in preview and execution, and preserves them when cleanup cannot verify bytes', async () => {
    const { service, root, dataPath } = await fixture(), added = await file(service, root), conversation = await direct(service)
    await writeFile(added.resource.path, '外部变更')
    await expect(preview(service, added.resource)).rejects.toThrow('外部修改')
    await expect(environment(root, await employee(service), conversation, await list(service))).rejects.toThrow('外部修改')
    await expect(service.handle('removeResource', { id: added.resource.id })).rejects.toThrow('清理未完成')
    expect(await list(service)).toEqual([]); expect(await readFile(added.resource.path, 'utf8')).toBe('外部变更')
    expect(await receipt(service, added.input.requestId)).toEqual({ requestId: added.input.requestId, agentId: 'researcher', status: 'cleared' })
    await service.close(); const restarted = await open(dataPath)
    expect(restarted.errors.some(error => error.includes('清理未完成'))).toBe(true)
    expect(await readFile(added.resource.path, 'utf8')).toBe('外部变更')
    await writeFile(added.resource.path, added.content)
    await restarted.service.handle('retryResourceCleanup', { id: added.resource.id })
    await expect(readFile(added.resource.path)).rejects.toThrow(); expect(await readFile(added.path, 'utf8')).toBe(added.content)
  })

  it('deletes only the selected employee’s owned copy and clears its receipt, preserving another employee’s identical content and external file', async () => {
    const { service, root } = await fixture(), first = await file(service, root), second = await save(service, { kind: 'file', path: first.path, name: '共享原件.md' }, 'writer')
    await service.handle('deleteAgent', { id: 'researcher' })
    await expect(readFile(first.resource.path)).rejects.toThrow()
    expect((await preview(service, second.resource)).filePreview.text).toBe(first.content)
    expect(await readFile(first.path, 'utf8')).toBe(first.content)
    expect(await receipt(service, first.input.requestId)).toEqual({ requestId: first.input.requestId, agentId: 'researcher', status: 'cleared' })
    const stored = await storeOf(service).get<KnowledgeOperation>('knowledgeOperations', first.input.requestId)
    expect(stored?.resource).toBeUndefined()
  })

  it('records an interrupted prepare and cleans only that uncommitted copy on restart, without reimporting the source', async () => {
    const { service, root, dataPath } = await fixture(), added = await file(service, root), store = storeOf(service)
    const operation = (await store.get<KnowledgeOperation>('knowledgeOperations', added.input.requestId))!
    operation.receipt.status = 'preparing'
    const agent = await employee(service)
    await store.write([{ collection: 'knowledgeOperations', id: operation.id, value: operation }, { collection: 'agents', id: agent.id, value: { ...agent, knowledgeIds: [] } }], [{ collection: 'resources', id: added.resource.id }])
    await service.close(); await rm(added.path)
    const restarted = await open(dataPath)
    expect(await receipt(restarted.service, added.input.requestId)).toMatchObject({ status: 'interrupted' })
    expect(await list(restarted.service)).toEqual([]); await expect(readFile(added.resource.path)).rejects.toThrow()
    expect(await restarted.service.handle('saveEmployeeKnowledge', added.input)).toMatchObject({ status: 'interrupted' })
    expect(restarted.engine.calls).toBe(0)
  })

  it('keeps unsupported binary bytes with truthful preview and never creates searchable text for them', async () => {
    const { service, root } = await fixture(), path = join(root, 'opaque.bin'), bytes = Buffer.from([0, 255, 1, 2])
    await writeFile(path, bytes)
    const added = await save(service, { kind: 'file', path, name: 'opaque.bin' })
    expect((await preview(service, added.resource)).filePreview).toMatchObject({ kind: 'unsupported', text: '' })
    expect(await readFile(added.resource.path)).toEqual(bytes)
    const conversation = await direct(service), plan = await environment(root, await employee(service), conversation, await list(service))
    expect((await searchKnowledge([added.resource], 'opaque', new AbortController().signal, plan.knowledge)).results).toEqual([])
  })

  it('does not commit a copy when its source changes during preparation and keeps a stable failed receipt', async () => {
    const { service, root } = await fixture(), path = join(root, 'changing.md'); await writeFile(path, '旧来源')
    const original = KnowledgeFiles.prototype.prepare
    vi.spyOn(KnowledgeFiles.prototype, 'prepare').mockImplementation(async function (this: KnowledgeFiles, ...args) { const result = await original.apply(this, args); await writeFile(path, '新来源'); return result })
    const input = { requestId: randomUUID(), agentId: 'researcher', expectedConfigVersion: (await employee(service)).configVersion, source: { kind: 'file', path, name: 'changing.md' } }
    await expect(service.handle('saveEmployeeKnowledge', input)).rejects.toThrow('保留期间已变化')
    expect(await list(service)).toEqual([])
    const operation = (await storeOf(service).get<KnowledgeOperation>('knowledgeOperations', input.requestId))!
    expect(await receipt(service, input.requestId)).toMatchObject({ status: 'failed' })
    await expect(readFile(operation.resource!.path)).rejects.toThrow()
    expect(await service.handle('saveEmployeeKnowledge', input)).toMatchObject({ status: 'failed' })
    expect(await readFile(path, 'utf8')).toBe('新来源')
    expect(dirname(operation.resource!.path)).toContain(operation.resource!.knowledge!.copyId)
  })
})


it.each(['sharing', 'remove', 'replace-same-bytes', 'external-edit', 'clear'] as const)('keeps actual read citations across restart and rejects %s without switching content', async change => {
  const { service, root, dataPath, engine } = await fixture()
  const content = '# 引用原文\n实际读取的蓝色标题\n未读取的第三行'
  const added = await file(service, root, content)
  const conversation = await service.handle('createConversation', { kind: 'group', title: '引用范围', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [added.resource.id] }) as Conversation
  engine.handler = async context => {
    const read = createKnowledgeOperations(context).find(operation => operation.name === 'read_knowledge')!
    await read.execute({ resourceId: added.resource.id, path: added.resource.path, contentHash: added.resource.knowledge!.contentHash, limit: Array.from(content.split('\n').slice(0, 2).join('\n')).length })
    await context.onDelta(`[已读行](<${added.resource.path}:2>) [未读行](<${added.resource.path}:3>)`)
  }
  await service.handle('sendMessage', { conversationId: conversation.id, content: '读取前两行并引用', mentionIds: ['researcher'], requestId: randomUUID() }); await settled(service, conversation)
  const before = await detail(service, conversation), message = before.messages.find(message => message.senderType === 'agent')!
  expect(message.knowledgeSources).toEqual([expect.objectContaining({ resourceId: added.resource.id, contentHash: hash(content), resourceHash: hash(content), copyId: added.resource.knowledge!.copyId, firstLine: 1, lastLine: 2, fileKey: '' })])
  const input = { messageId: message.id, referenceIndex: 0, line: 2 }
  expect(await service.handle('getKnowledgeCitationPreview', input)).toMatchObject({ contentHash: hash(content), filePreview: { text: content } })
  await expect(service.handle('getKnowledgeCitationPreview', { ...input, line: 3 })).rejects.toThrow('实际读取范围')
  await expect(service.handle('getKnowledgeCitationPreview', { ...input, referenceIndex: 1 })).rejects.toThrow('没有可核对')
  await expect(service.handle('getKnowledgeCitationPreview', { ...input, messageId: before.messages.find(message => message.senderType === 'user')!.id })).rejects.toThrow('没有可核对')
  expect(before.workItems).toEqual([])
  await service.close()
  const recovered = await open(dataPath), current = recovered.service
  expect(await current.handle('getKnowledgeCitationPreview', input)).toMatchObject({ contentHash: hash(content) })
  expect((await detail(current, conversation)).messages).toEqual(before.messages)
  expect(recovered.engine.calls).toBe(0)
  if (change === 'sharing') await current.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, conversationId: conversation.id, expectedConfigVersion: conversation.configVersion, shared: false })
  if (change === 'remove') await current.handle('removeEmployeeKnowledge', { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, expectedConfigVersion: (await employee(current)).configVersion })
  if (change === 'replace-same-bytes') await current.handle('saveEmployeeKnowledge', { requestId: randomUUID(), agentId: 'researcher', expectedConfigVersion: (await employee(current)).configVersion, replace: { resourceId: added.resource.id, revision: 1, contentHash: hash(content) }, source: { kind: 'file', path: added.path, name: '同字节的新副本.md' } })
  if (change === 'external-edit') await writeFile(added.resource.path, '被外部修改的内容')
  if (change === 'clear') await current.handle('clearConversationHistory', { id: conversation.id, hide: false })
  await expect(current.handle('getKnowledgeCitationPreview', input)).rejects.toThrow()
  expect(recovered.engine.calls).toBe(0); expect(await readFile(added.path, 'utf8')).toBe(content)
})

it('restores citations from a different backup root using the managed copy without widening the original sharing or replaying', async () => {
  const { service, root, dataPath, engine } = await fixture(), added = await file(service, root, '# 备份知识\n原行内容保持紫色。')
  const group = await service.handle('createConversation', { kind: 'group', title: '备份引用群', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [added.resource.id] }) as Conversation
  engine.handler = async context => {
    await createKnowledgeOperations(context).find(operation => operation.name === 'read_knowledge')!.execute({ resourceId: added.resource.id, path: added.resource.path, contentHash: added.resource.knowledge!.contentHash })
    await context.onDelta(`[知识原文](<${added.resource.path}:2>)`)
  }
  await service.handle('sendMessage', { conversationId: group.id, content: '查阅资料并引用第二行', mentionIds: ['researcher'], requestId: randomUUID() }); await settled(service, group)
  const before = await detail(service, group), message = before.messages.find(message => message.senderType === 'agent')!
  const input = { messageId: message.id, referenceIndex: 0, line: 2 }
  expect(await service.handle('getKnowledgeCitationPreview', input)).toMatchObject({ filePreview: { text: added.content } })
  const backup = join(root, 'citation-backup'), restoredPath = join(root, 'citation-restored')
  await service.backup(backup); await service.close(); await cp(backup, restoredPath, { recursive: true })
  await rm(dataPath, { recursive: true }); await rm(added.path)
  const restored = await open(restoredPath), resource = (await list(restored.service))[0]
  expect(resource.id).toBe(added.resource.id); expect(resource.path.startsWith(restoredPath)).toBe(true)
  expect(resource.knowledge).toEqual(added.resource.knowledge)
  const after = await detail(restored.service, group)
  expect(after.messages).toEqual(before.messages); expect(after.runs).toEqual(before.runs); expect(after.workItems).toEqual([])
  expect(after.conversation.sharedKnowledgeIds).toEqual([resource.id]); expect(await list(restored.service, 'writer')).toEqual([])
  expect(after.messages.find(value => value.id === message.id)!.knowledgeSources).toEqual(message.knowledgeSources)
  expect(await restored.service.handle('getKnowledgeCitationPreview', input)).toMatchObject({ resource: { id: resource.id, path: resource.path }, filePreview: { text: added.content } })
  await expect(restored.service.handle('getKnowledgeCitationPreview', { ...input, line: 3 })).rejects.toThrow('实际读取范围')
  await restored.service.handle('setEmployeeKnowledgeSharing', { requestId: randomUUID(), agentId: 'researcher', resourceId: resource.id, conversationId: group.id, expectedConfigVersion: after.conversation.configVersion, shared: false })
  await expect(restored.service.handle('getKnowledgeCitationPreview', input)).rejects.toThrow()
  expect(restored.engine.calls).toBe(0); await expect(readFile(added.resource.path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(resource.path, 'utf8')).toBe(added.content)
})

it('uses retained employee knowledge across automation conversations and restart, then removes access without replaying old triggers', async () => {
  const { service, root, dataPath, engine } = await fixture()
  const added = await file(service, root, '# 自动化资料\n本项目识别码是 ORION-AUTO；归档周期17天。')
  const other = await file(service, root, '# 他人资料\n私人识别码为 NOT-AUTHORIZED。', 'writer')
  const planInput: AutomationInput = { name: '知识资料核对', prompt: '查阅本人资料并回答识别码和归档周期', conversationPolicy: 'new-conversation', employeeIds: ['researcher'], frequency: 'daily', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: false, notify: false }
  const plan = await service.handle('saveAutomation', planInput) as AutomationDefinition
  const observations: { conversationId: string; names: string[]; content?: string }[] = []
  let failure: unknown
  const handler = (available: boolean) => async (context: EngineContext) => {
    try {
      expect(context.agent.id).toBe('researcher')
      const operations = createKnowledgeOperations(context), observation = { conversationId: context.conversation.id, names: operations.map(operation => operation.name), content: undefined as string | undefined }
      observations.push(observation)
      if (available) {
        const inspect = operations.find(operation => operation.name === 'inspect_knowledge')!
        await expect(inspect.execute({ resourceId: other.resource.id })).rejects.toThrow('授权')
        const catalog = await inspect.execute({}) as { files: { resourceId: string; path: string; contentHash: string }[] }
        expect(catalog.files).toHaveLength(1); expect(catalog.files[0].resourceId).toBe(added.resource.id)
        const { resourceId, path, contentHash } = catalog.files[0]
        const read = await operations.find(operation => operation.name === 'read_knowledge')!.execute({ resourceId, path, contentHash }) as { content: string; citation: string }
        expect(read.content).toBe(added.content); observation.content = read.content
        await context.onDelta(read.content + '\n' + read.citation)
      } else {
        expect(operations).toEqual([])
        await context.onDelta('当前没有获准知识资料，不能沿旧记录读取。')
      }
    } catch (error) { failure = error; throw error }
  }
  const execute = async (current: AppService, requestId: string) => {
    const accepted = await current.handle('runAutomation', { id: plan.id, requestId }) as AutomationOccurrence
    await vi.waitFor(async () => {
      if (failure) throw failure
      expect((await current.handle('getAutomationOccurrence', { id: accepted.id }) as AutomationOccurrence).status).toBe('completed')
    }, { timeout: 10000 })
    const view = await current.handle('getConversation', { id: accepted.conversationId }) as ConversationDetail
    expect(view.workItems).toEqual([])
    expect(view.runs.every(run => run.origin?.occurrenceId === accepted.id && run.status === 'completed')).toBe(true)
    expect((await current.handle('runAutomation', { id: plan.id, requestId }) as AutomationOccurrence).id).toBe(accepted.id)
    return { accepted, view }
  }
  engine.handler = handler(true)
  const first = await execute(service, 'knowledge-before-restart')
  expect(first.view.messages.filter(message => message.senderType === 'agent').at(-1)?.knowledgeSources?.[0]).toMatchObject({ resourceId: added.resource.id, contentHash: added.resource.knowledge!.contentHash })
  const originalCalls = engine.calls
  await service.close(); const reopened = await open(dataPath)
  expect(reopened.engine.calls).toBe(0)
  expect((await reopened.service.handle('runAutomation', { id: plan.id, requestId: 'knowledge-before-restart' }) as AutomationOccurrence).id).toBe(first.accepted.id)
  expect(reopened.engine.calls).toBe(0); expect(engine.calls).toBe(originalCalls)
  reopened.engine.handler = handler(true)
  const second = await execute(reopened.service, 'knowledge-after-restart')
  expect(second.accepted.conversationId).not.toBe(first.accepted.conversationId)
  expect(second.view.messages.filter(message => message.senderType === 'agent').at(-1)?.knowledgeSources?.[0]).toMatchObject({ resourceId: added.resource.id, contentHash: added.resource.knowledge!.contentHash })
  await reopened.service.handle('removeEmployeeKnowledge', { requestId: randomUUID(), agentId: 'researcher', resourceId: added.resource.id, expectedConfigVersion: (await employee(reopened.service)).configVersion })
  const callsBeforeSkipped = reopened.engine.calls
  const skipped = await reopened.service.handle('runAutomation', { id: plan.id, requestId: 'knowledge-stale-authorization' }) as AutomationOccurrence
  expect(skipped).toMatchObject({ status: 'skipped', attentionReason: 'authorization', runIds: [] })
  expect(reopened.engine.calls).toBe(callsBeforeSkipped)
  await reopened.service.handle('saveAutomation', { ...planInput, id: plan.id, expectedRevision: plan.revision })
  reopened.engine.handler = handler(false)
  const removed = await execute(reopened.service, 'knowledge-after-removal')
  expect(removed.view.messages.filter(message => message.senderType === 'agent').at(-1)?.knowledgeSources ?? []).toEqual([])
  expect(observations.map(item => item.content)).toEqual([added.content, added.content, undefined])
  expect(await readFile(added.path, 'utf8')).toBe(added.content)
  expect((await list(reopened.service, 'writer')).map(resource => resource.id)).toEqual([other.resource.id])
  await reopened.service.close(); const final = await open(dataPath)
  for (const [requestId, result] of [['knowledge-before-restart', first], ['knowledge-after-restart', second], ['knowledge-after-removal', removed]] as const) {
    expect((await final.service.handle('runAutomation', { id: plan.id, requestId }) as AutomationOccurrence).id).toBe(result.accepted.id)
    expect((await final.service.handle('getConversation', { id: result.accepted.conversationId }) as ConversationDetail).messages).toEqual(result.view.messages)
  }
  expect(final.engine.calls).toBe(0); expect(observations).toHaveLength(3)
  expect((await final.service.handle('runAutomation', { id: plan.id, requestId: 'knowledge-stale-authorization' }) as AutomationOccurrence)).toEqual(skipped)
  expect(final.engine.calls).toBe(0)
  await writeFile(join(root, 'automation-knowledge-facts.json'), JSON.stringify({ observations, first, second, skipped, removed, externalRequests: 0, trigger: 'original-manual-automation', restartReplays: 0, sourceContent: added.content, sourceHash: hash(added.content), retainedResourceId: added.resource.id, otherResourceId: other.resource.id }, null, 2))
})
