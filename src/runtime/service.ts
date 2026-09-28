/*
 * [INPUT]: 领域类型、IPC 合同、工作认领/预算、协作模型容量与业务模块。
 * [OUTPUT]: 会话历史及专属文件清理、列表偏好的批量持久化、工作认领/接续/停止、实际调用容量、草稿/证据/等待声明的有界修复与原子发布。
 * [POS]: src/runtime/service.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { conversationListUpdates, type ConversationListChange } from '../shared/domain/conversation-list'
import { ConversationHistory } from './modules/conversations/history'
import { RequestError } from '@agentclientprotocol/sdk'
import { publishArtifact, restrictedPath } from './modules/workspaces/file-access'
import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { AutomationService, automationSchema } from './modules/automations/automation-service'
import type { AutomationOrigin, AutomationOccurrence } from '../shared/domain/automations'
import { LaunchProfiles, profileSchema } from './modules/backends/profiles'
import { runAcp } from './adapters/acp/client'
import { authorizedResources } from './modules/workspaces/environment-plan'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { AgentInput, AgentRun, Approval, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Resource, Snapshot, DiscussionTurn, ConversationEvent, AgentDelivery, DecisionRecord, MemoryQuery, MemoryView, MemoryEntry, Artifact } from '../shared/domain'
import type { AppEvent, Method } from '../shared/ipc'
import type { AgentEngine, EngineContext, SecretStore } from './contracts'
import { importLocalResource, isWithin, listArtifacts } from './modules/resources/local-resources'
import { ProductStore, type StoredRecord } from './adapters/storage/product-store'
import { GroupScheduler, type PublishReply } from './group-scheduler'
import { WorkspaceService } from './modules/workspaces/workspace-service'
import { EmployeeService, agentSchema } from './modules/employees/employee-service'
import { MemoryRepository } from './modules/memory/memory-repository'
import { ModelCapacity } from './modules/collaboration/model-capacity'
import { WorkRepository, WorkUnavailableError } from './modules/collaboration/work-repository'
import { TaskAdmission } from './modules/collaboration/task-admission'
import { workOutcomeSchema, workDelegationSchema, workWaitSchema, workEvidenceError } from './modules/collaboration/work-protocol'
import type { WorkOutcome, ModelUsage } from '../shared/domain'

const id = z.string().trim().min(1).max(200)
const ids = z.array(id).max(100).refine(value => new Set(value).size === value.length, '不能包含重复 ID')
const text = (max: number) => z.string().trim().min(1).max(max)
const connectionSchema = z.object({ id: id.optional(), name: text(100), provider: z.enum(['openai', 'anthropic', 'openai-compatible']), baseUrl: z.string().max(2000), defaultModel: text(300), apiKey: z.string().max(12000).optional() }).strict()
const conversationSchema = z.object({ id: id.optional(), expectedConfigVersion: z.number().int().positive().optional(), kind: z.enum(['direct', 'group']), title: text(200), agentIds: ids.min(1).max(12), mode: z.enum(['natural', 'mention', 'coordinator']).optional(), sharedKnowledgeIds: ids.optional() }).strict()
const conversationListSchema = z.discriminatedUnion('action', [
  z.object({ id, action: z.literal('pin'), pinned: z.boolean() }).strict(),
  z.object({ id, action: z.enum(['hide', 'show']) }).strict(),
  z.object({ id, action: z.literal('move'), targetId: id, placement: z.enum(['before', 'after']) }).strict(),
])
const sendSchema = z.object({ conversationId: id, content: text(100000), mentionIds: ids, requestId: id, replyToMessageId: id.optional(), stopPrevious: z.boolean().optional() }).strict()
const lookupSchema = z.object({ id }).strict()
const memoryQuerySchema = z.object({ agentId: id, scope: z.enum(['profile', 'conversation']), conversationId: id.optional() }).strict()
type RequestRecord = { id: string; fingerprint: string; messageId?: string }
type RunSnapshot = { id: string; agent: DigitalAgent; connection: Connection; resources: Resource[]; conversation: Conversation; memoryEntryIds?: string[]; invalidated?: boolean }
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const now = () => new Date().toISOString()
const clone = <T>(value: T): T => structuredClone(value)
const record = (collection: string, value: { id: string }): StoredRecord => ({ collection, id: value.id, value })
const fail = (message: string): never => { throw new Error(message) }

export class AppService {
  private readonly history: ConversationHistory
  private readonly clearingConversations = new Set<string>()
  private readonly store: ProductStore
  private readonly automations: AutomationService
  private readonly profiles: LaunchProfiles
  private externalTests=new Set<AbortController>()
  private externalTasks=new Set<Promise<void>>()
  private readonly employees: EmployeeService
  private connections = new Map<string, Connection>()
  private conversations = new Map<string, Conversation>()
  private resources = new Map<string, Resource>()
  private messages = new Map<string, Message>()
  private runs = new Map<string, AgentRun>()
  private requests = new Map<string, RequestRecord>()
  private snapshots = new Map<string, RunSnapshot>()
  private approvals = new Map<string, Approval>()
  private pendingApprovals = new Map<string, (approved: boolean) => void>()
  private activeAdapters = new Set<string>()
  private runControllers = new Map<string, AbortController>()
  private runDirectories = new Map<string, string>()
  private artifacts = new Map<string, Artifact & { id: string; conversationId: string }>()
  private readonly homes: WorkspaceService
  private readonly memory: MemoryRepository
  private readonly scheduler: GroupScheduler
  private readonly modelCapacity = new ModelCapacity()
  private readonly taskAdmission = new TaskAdmission()
  private readonly works: WorkRepository
  private workTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private mutations: Promise<unknown> = Promise.resolve()
  private closing = false
  private backingUp = false
  private initialized = false
  readonly dataPath: string

  constructor(private readonly options: { dataPath: string; engine: AgentEngine; secrets: SecretStore; emit: (event: AppEvent) => void }) {
    this.dataPath = resolve(options.dataPath)
    this.store = new ProductStore(join(this.dataPath, 'boai.sqlite'))
    this.history = new ConversationHistory(this.store, this.dataPath)
    this.works = new WorkRepository(this.store)
    this.profiles=new LaunchProfiles(this.store)
    this.homes = new WorkspaceService(this.dataPath)
    this.memory = new MemoryRepository(this.store)
    this.employees = new EmployeeService(this.store, this.homes, {
      connection: id => this.getConnection(id), resource: id => this.resources.get(id),
      cancel: (id, reason) => this.cancelEmployee(id, reason),
      invalidateMemory: (id, matches) => this.invalidateEmployeeMemory(id, matches), changed: () => this.changed(),
    })
    this.scheduler = new GroupScheduler(this.store, {
      critical: operation => this.serialize(operation),
      conversation: id => this.getConversation(id), agent: id => this.getAgent(id), message: id => this.messages.get(id),
      decide: (turn, event, delivery, signal) => this.executeDecision(turn, event, delivery, signal),
      speak: (turn, event, decision, signal, publish) => this.executeResponse(turn, event, decision, signal, publish),
      settled: (turn, participants, signal) => turn.wakeId ? Promise.resolve() : this.updateMemories(turn, participants, signal), idle: id => this.scheduleWork(id), changed: id => this.changed(id), error: error => this.emit({ type: 'runtime-error', error: this.errorMessage(error) }),
    })
    this.automations=new AutomationService(this.store,this.dataPath,{
      validate:id=>this.automationFingerprint(id),busy:id=>this.conversationBusy(id),
      dispatch:(definition,occurrence,origin)=>this.serialize(async()=>{if(this.closing||this.backingUp)fail('服务正在退出或备份');if(this.automationFingerprint(definition.conversationId)!==definition.authorizedFingerprint)fail('自动化权限已变化');if(this.conversationBusy(definition.conversationId))fail('会话忙碌');return this.sendMessage({conversationId:definition.conversationId,content:definition.prompt,mentionIds:[],requestId:'automation-'+occurrence.id},origin)}),
      inspect:occurrence=>this.inspectAutomation(occurrence),cancel:occurrence=>this.serialize(async()=>{const turn=occurrence.turnId?this.scheduler.turns.get(occurrence.turnId):undefined;if(turn&&(this.scheduler.hasActiveTurn(turn.id)||!['completed','failed','cancelled','interrupted','waiting_user','budget_exhausted'].includes(turn.status)))await this.cancelConversation(occurrence.conversationId)}),
      changed:()=>this.emit({type:'changed'}),notify:occurrence=>this.emit({type:'automation:notice',occurrence}),
    })
  }

  async init() {
    if (this.initialized) return
    await this.store.init()
    await this.history.recover()
    await this.profiles.init()
    const collections = ['connections', 'conversations', 'resources', 'messages', 'runs', 'requests', 'snapshots', 'approvals', 'artifacts'] as const
    for (const name of collections) {
      const values = await this.store.load<{ id: string }>(name)
      ;(this[name] as Map<string, { id: string }>) = new Map(values.map(value => [value.id, value]))
    }
    const updates: StoredRecord[] = []
    for (const job of await this.store.load<{ id: string; status: string; error?: string }>('jobs')) if (['queued', 'running', 'waiting_approval'].includes(job.status)) { job.status = 'interrupted'; job.error = '旧版任务已中断，不会在升级后重放'; updates.push(record('jobs', job)) }
    for (const artifact of this.artifacts.values()) {
      const oldWorkspace = this.conversations.get(artifact.conversationId)?.workspacePath
      if (!oldWorkspace) continue
      if (isWithin(oldWorkspace, artifact.path)) artifact.path = join(this.dataPath, 'workspaces', artifact.conversationId, relative(oldWorkspace, artifact.path))
      const oldDataPath = resolve(oldWorkspace, '../..')
      if (artifact.sourcePath && isWithin(oldDataPath, artifact.sourcePath)) artifact.sourcePath = join(this.dataPath, relative(oldDataPath, artifact.sourcePath))
      updates.push(record('artifacts', artifact))
    }
    // All imported assets are managed copies, so a backup can move to a new data directory.
    for (const resource of this.resources.values()) {
      resource.path = resource.ownerAgentId ? join(this.dataPath, 'agents', resource.ownerAgentId, 'workspace', 'skills', resource.name) : join(this.dataPath, resource.kind === 'skill' ? 'skills' : 'knowledge', resource.id, basename(resource.path))
      updates.push(record('resources', resource))
    }
    for (const conversation of this.conversations.values()) {
      conversation.workspacePath = join(this.dataPath, 'workspaces', conversation.id)
      if (conversation.mode !== 'natural') Object.assign(conversation, { legacyMode: conversation.mode })
      conversation.mode = 'natural'
      await mkdir(conversation.workspacePath, { recursive: true })
      updates.push(record('conversations', conversation))
    }
    for (const run of this.runs.values()) if (!terminal.has(run.status)) {
      run.status = 'interrupted'; run.error = '应用退出时任务尚未完成，可重新执行'; run.finishedAt = now()
      updates.push(record('runs', run))
    }
    for (const message of this.messages.values()) if (message.status === 'streaming') { message.status = 'interrupted'; updates.push(record('messages', message)) }
    const removed = [...this.approvals.keys()].map(id => ({ collection: 'approvals', id }))
    this.approvals.clear()
    updates.push(...await this.employees.initialize())
    await this.store.write(updates, removed)
    await this.memory.init(); await this.works.init(); await this.scheduler.init()
    await Promise.all(['skills', 'knowledge', 'workspaces', 'agents', 'external-workspaces'].map(folder => mkdir(join(this.dataPath, folder), { recursive: true })))
    this.initialized = true
    await this.automations.init()
  }

  private emit(event: AppEvent) { if (!this.closing) this.options.emit(clone(event)) }
  private changed(conversationId?: string) { this.automations?.observe(); this.emit({ type: 'changed', ...(conversationId ? { conversationId } : {}) }) }
  private getConversation(id: string): Conversation { if (this.clearingConversations.has(id)) fail('此会话清理尚未完成，请重试清空聊天记录'); return this.conversations.get(id) ?? fail('会话不存在') }
  private getAgent(id: string): DigitalAgent { return this.employees.get(id) }
  private getConnection(id: string): Connection { return this.connections.get(id) ?? fail('请先为员工配置模型连接') }
  private validateResources(resourceIds: string[], kind: Resource['kind']) {
    for (const id of resourceIds) if (this.resources.get(id)?.kind !== kind) fail(kind === 'skill' ? 'Skill 不存在或类型不匹配' : '知识资源不存在或类型不匹配')
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation)
    this.mutations = next.catch(() => undefined)
    return next
  }

  async handle(method: Method, input: unknown): Promise<unknown> {
    if (!this.initialized || this.closing) fail('运行服务尚未就绪或正在退出')
    if (this.backingUp) fail('正在生成备份，请稍后再试')
    if(method==='listAutomations'){z.undefined().parse(input);return this.automations.view()}
    if(method==='saveAutomation')return this.automations.save(automationSchema.parse(input))
    if(method==='pauseAutomation'||method==='deleteAutomation')return this.automations.pause(lookupSchema.parse(input).id,method==='deleteAutomation')
    if(method==='stopAutomation')return this.automations.stop(lookupSchema.parse(input).id)
    if(method==='runAutomation'){const value=z.object({id,requestId:id}).strict().parse(input);return this.automations.run(value.id,value.requestId)}
    if(method==='testLaunchProfile') { const profile=this.profiles.get(lookupSchema.parse(input).id),controller=new AbortController();this.externalTests.add(controller);try{const result=await runAcp({profile,cwd:join(this.dataPath,'external-probes',profile.id),signal:controller.signal,approve:async()=>false,onTool:async()=>{}});return await this.serialize(()=>{if(this.closing||this.backingUp)fail('服务正在退出或备份，请重新测试');return this.profiles.verified(profile.id,profile.revision,result.verified)})}finally{this.externalTests.delete(controller)} }
    if (method === 'testConnection') {
      const connectionId = lookupSchema.parse(input).id
      const connection = await this.serialize(async () => clone(this.getConnection(connectionId)))
      const key = await this.apiKey(connection)
      try { return { text: this.redact(await this.options.engine.test(connection, key), key) } }
      catch (error) { throw new Error(this.redact(this.errorMessage(error), key)) }
    }
    return this.serialize(async () => {
      switch (method) {
        case 'listExternalFiles': {const value=z.object({runId:id}).strict().parse(input);return this.externalFiles(value.runId)}
        case 'publishExternalArtifact': {const value=z.object({runId:id,relativePath:text(8000)}).strict().parse(input);return this.publishExternal(value.runId,value.relativePath)}
        case 'listLaunchProfiles': z.undefined().parse(input); return this.profiles.list()
        case 'saveLaunchProfile': { const p=await this.profiles.save(profileSchema.parse(input));for(const a of this.employees.values())if(a.executionBackend?.kind==='acp-local'&&a.executionBackend.profileId===p.id)await this.cancelEmployee(a.id,'外部启动配置已更新');this.changed();return p }
        case 'sendExternalTask': return this.sendExternalTask(z.object({conversationId:id,content:text(100000),requestId:id}).strict().parse(input))
        case 'snapshot': z.undefined().parse(input); return this.snapshot()
        case 'saveAgent': {const value=agentSchema.parse(input);if(value.executionBackend?.kind==='acp-local'){this.profiles.get(value.executionBackend.profileId);if(value.id&&[...this.conversations.values()].some(c=>c.kind==='group'&&c.agentIds.includes(value.id!)))fail('请先将员工移出群聊，再切换为外部任务后端')}return this.employees.save(value)}
        case 'saveConnection': return this.saveConnection(connectionSchema.parse(input))
        case 'deleteConnection': return this.deleteConnection(lookupSchema.parse(input).id)
        case 'createConversation': return this.saveConversation(conversationSchema.parse(input))
        case 'updateConversationList': return this.updateConversationList(conversationListSchema.parse(input))
        case 'clearConversationHistory': { const value = z.object({ id, hide: z.boolean() }).strict().parse(input); return this.clearConversationHistory(value.id, value.hide) }
        case 'getConversation': return this.detail(lookupSchema.parse(input).id)
        case 'sendMessage': return this.sendMessage(sendSchema.parse(input))
        case 'cancelRun': { const { conversationId, workId } = z.object({ conversationId: id, workId: id.optional() }).strict().parse(input); this.getConversation(conversationId); return workId ? this.cancelWork(conversationId, workId) : this.cancelConversation(conversationId) }
        case 'approve': { const value = z.object({ id, approved: z.boolean() }).strict().parse(input); return this.resolveApproval(value.id, value.approved) }
        case 'importResource': {
          const value = z.object({ kind: z.enum(['skill', 'knowledge']), path: text(8000), ownerAgentId: id.optional() }).strict().parse(input)
          if (value.ownerAgentId) { this.getAgent(value.ownerAgentId); if (value.kind !== 'skill') fail('员工专属导入仅支持 Skill') }
          const resource = await importLocalResource(this.dataPath, value.kind, value.path)
          if (value.ownerAgentId) {
            const destination = join(this.dataPath, 'agents', value.ownerAgentId, 'workspace', 'skills', resource.name)
            await cp(resource.path, destination, { recursive: true, errorOnExist: true, force: false }); await rm(join(this.dataPath, 'skills', resource.id), { recursive: true, force: true })
            resource.path = destination; resource.ownerAgentId = value.ownerAgentId
          }
          await this.store.write([record('resources', resource)]); this.resources.set(resource.id, resource); this.changed(); return clone(resource)
        }
        case 'removeResource': return this.removeResource(lookupSchema.parse(input).id)
        case 'retryRun': { const value = z.object({ id, requestId: id }).strict().parse(input); return this.retry(value.id, value.requestId) }
        case 'getAgentHome': case 'readAgentFile': case 'regenerateAgentViews': case 'saveAgentFile': return this.agentFiles(method, input)
        case 'getMemory': case 'saveMemory': case 'deleteMemory': case 'clearMemory': return this.memoryOperation(method, input)
        default: fail('此操作必须由桌面主进程处理')
      }
    })
  }

  private async snapshot(): Promise<Snapshot> {
    const connections = await Promise.all([...this.connections.values()].map(async connection => ({ ...connection, hasApiKey: !!await this.options.secrets.get(connection.id) })))
    const conversations = [...this.conversations.values()].map(conversation => {
      const runs = [...this.runs.values()].filter(run => run.conversationId === conversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), turns = [...this.scheduler.turns.values()].filter(turn => turn.conversationId === conversation.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const messages = this.conversationMessages(conversation.id)
      const activity: Conversation['activity'] = runs.some(run => run.status === 'waiting_approval') ? 'waiting_approval' : runs.some(run => run.status === 'running') ? 'running' : turns.some(turn => turn.status === 'queued') ? 'queued' : turns.at(-1)?.status === 'failed' || runs.at(-1)?.status === 'failed' ? 'failed' : 'idle'
      return { ...conversation, activity, lastMessageAt: messages.at(-1)?.createdAt, lastMessagePreview: messages.filter(message => message.status === 'completed').at(-1)?.content.slice(0, 120) ?? '' }
    }).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || b.createdAt.localeCompare(a.createdAt))
    return clone({ agents: [...this.employees.values()], conversations, connections, resources: [...this.resources.values()], approvals: [...this.approvals.values()], dataPath: this.dataPath })
  }
  private async detail(id: string): Promise<ConversationDetail> {
    const conversation = this.getConversation(id)
    const listed = await listArtifacts(conversation.workspacePath)
    return clone({ conversation, messages: this.conversationMessages(id), runs: [...this.runs.values()].filter(run => run.conversationId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), artifacts: listed.map(artifact => ({ ...artifact, ...[...this.artifacts.values()].find(saved => saved.conversationId === id && saved.path === artifact.path) })), ...this.scheduler.detail(id), ...await this.works.view(id) })
  }
  private conversationMessages(id: string) { return [...this.messages.values()].filter(message => message.conversationId === id).sort((a, b) => a.sequence - b.sequence) }

  private validateMemoryQuery(query: MemoryQuery) {
    this.getAgent(query.agentId)
    if (query.scope === 'profile' && query.conversationId) fail('基础资料不能指定会话')
    if (query.scope === 'conversation' && (!query.conversationId || !this.getConversation(query.conversationId).agentIds.includes(query.agentId))) fail('记忆范围不属于该员工当前会话')
  }
  private inheritedResources(messageIds: string[], resourceIds: string[]) {
    return [...new Set([...resourceIds, ...messageIds.flatMap(id => { const runId = this.messages.get(id)?.runId; return runId ? this.snapshots.get(runId)?.resources.map(resource => resource.id) ?? [] : [] })])]
  }
  private async invalidateEmployeeMemory(agentId: string, matches: (entry: MemoryEntry) => boolean, conversationId?: string) {
    const queries: MemoryQuery[] = conversationId ? [{ agentId, scope: 'conversation', conversationId }] : [{ agentId, scope: 'profile' }, ...[...this.conversations.values()].map(conversation => ({ agentId, scope: 'conversation' as const, conversationId: conversation.id }))]
    for (const query of queries) {
      let view = await this.memory.get(query)
      for (const entry of view.entries.filter(matches)) view = await this.memory.delete(query, entry.id, view.epoch)
    }
  }
  private async agentFiles(method: Method, input: unknown) {
    if (method === 'saveAgentFile') {
      const value = z.object({ agentId: id, name: z.enum(['AGENTS.md', 'SOUL.md']), content: z.string().max(64000), expectedHash: z.string().max(128), expectedConfigVersion: z.number().int().positive() }).strict().parse(input)
      return this.employees.saveFile(value)
    }
    const value = z.object({ agentId: id, conversationId: id.optional(), ...(method === 'readAgentFile' ? { name: text(200) } : {}) }).strict().parse(input)
    const agent = this.getAgent(value.agentId)
    const query: MemoryQuery = { agentId: agent.id, scope: value.conversationId ? 'conversation' : 'profile', ...(value.conversationId ? { conversationId: value.conversationId } : {}) }
    this.validateMemoryQuery(query)
    if (method === 'readAgentFile') return this.homes.read(agent, (value as typeof value & { name: string }).name, value.conversationId)
    await this.homes.regenerate(agent, await this.memory.get(query), value.conversationId, method === 'regenerateAgentViews')
    return { ...await this.homes.inspect(agent, value.conversationId), environment: await this.homes.describeEnvironment(agent, this.resources.values()) }
  }
  private async memoryOperation(method: Method, input: unknown) {
    const extra = method === 'saveMemory' ? { id: id.optional(), content: text(4000), sourceMessageIds: ids.optional(), sourceResourceIds: ids.optional(), expectedEpoch: z.number().int().nonnegative(), origin: z.enum(['user', 'import']).optional() } : method === 'deleteMemory' ? { id, expectedEpoch: z.number().int().nonnegative() } : method === 'clearMemory' ? { expectedEpoch: z.number().int().nonnegative() } : {}
    const value = memoryQuerySchema.extend(extra).strict().parse(input)
    const query: MemoryQuery = { agentId: value.agentId, scope: value.scope, ...(value.conversationId ? { conversationId: value.conversationId } : {}) }
    this.validateMemoryQuery(query)
    const previous = await this.memory.get(query)
    if (method === 'getMemory') return previous
    const expectedEpoch = z.number().int().nonnegative().parse((value as Record<string, unknown>).expectedEpoch)
    let result: MemoryView
    if (method === 'saveMemory') {
      const input = value as Parameters<MemoryRepository['save']>[0]
      for (const messageId of input.sourceMessageIds ?? []) if (!this.messages.has(messageId) || (query.scope === 'conversation' && this.messages.get(messageId)?.conversationId !== query.conversationId)) fail('记忆来源消息不属于当前范围')
      for (const resourceId of input.sourceResourceIds ?? []) if (!this.resources.has(resourceId)) fail('记忆来源资料不存在')
      const prior = previous.entries.find(entry => entry.id === input.id)
      input.sourceMessageIds ??= prior?.sourceMessageIds ?? []
      input.sourceResourceIds = this.inheritedResources(input.sourceMessageIds, input.sourceResourceIds ?? prior?.sourceResourceIds ?? [])
      const permitted = new Set(query.conversationId ? this.authorizedResources(this.getAgent(query.agentId), this.getConversation(query.conversationId)).map(resource => resource.id) : [...this.getAgent(query.agentId).skillIds, ...this.getAgent(query.agentId).knowledgeIds])
      if (input.sourceResourceIds.some(resourceId => !permitted.has(resourceId))) fail('记忆来源包含当前未授权资料')
      result = await this.memory.save(input)
    } else if (method === 'deleteMemory') result = await this.memory.delete(query, (value as typeof value & { id: string }).id, expectedEpoch)
    else result = await this.memory.clear(query, expectedEpoch)
    const retained = new Set(result.entries.map(entry => `${entry.id}:${entry.version}`))
    const changedIds = new Set(previous.entries.filter(entry => !retained.has(`${entry.id}:${entry.version}`)).map(entry => entry.id))
    const updates: StoredRecord[] = []
    for (const snapshot of this.snapshots.values()) if (snapshot.memoryEntryIds?.some(id => changedIds.has(id))) { snapshot.invalidated = true; updates.push(record('snapshots', snapshot)) }
    await this.store.write(updates)
    await this.cancelEmployee(query.agentId, '记忆已更新，旧版本运行失效', query.conversationId)
    await this.homes.regenerate(this.getAgent(query.agentId), result, query.conversationId)
    this.changed(query.conversationId); return result
  }

  private async saveConnection(input: z.infer<typeof connectionSchema>) {
    const previous = input.id ? this.getConnection(input.id) : undefined
    if (input.baseUrl) { let url: URL; try { url = new URL(input.baseUrl) } catch { return fail('模型地址不是有效 URL') }; if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('模型地址必须为不含凭据的 HTTP 或 HTTPS URL') }
    if (input.provider === 'openai-compatible' && !input.baseUrl) fail('兼容模型需要填写 API 地址')
    const connection: Connection = { id: previous?.id ?? randomUUID(), name: input.name, provider: input.provider, baseUrl: input.baseUrl, defaultModel: input.defaultModel, hasApiKey: false }
    if (input.apiKey !== undefined) {
      if (input.apiKey.trim()) await this.options.secrets.set(connection.id, input.apiKey.trim())
      else await this.options.secrets.delete(connection.id)
    }
    connection.hasApiKey = !!await this.options.secrets.get(connection.id)
    await this.store.write([record('connections', connection)]); this.connections.set(connection.id, connection)
    if (previous) for (const agent of this.employees.values()) if (agent.connectionId === connection.id) await this.cancelEmployee(agent.id, '模型连接已变更')
    this.changed(); return clone(connection)
  }
  private async deleteConnection(id: string) {
    this.getConnection(id)
    for (const agent of this.employees.values()) if (agent.connectionId === id) await this.cancelEmployee(agent.id, '模型连接已删除')
    await this.options.secrets.delete(id)
    const updates: StoredRecord[] = []
    for (const agent of this.employees.values()) if (agent.connectionId === id) { agent.connectionId = ''; agent.configVersion++; updates.push(record('agents', agent)) }
    await this.store.write(updates, [{ collection: 'connections', id }]); for (const update of updates) this.employees.install(update.id, update.value as DigitalAgent); this.connections.delete(id); this.changed()
  }
  private async apiKey(connection: Connection): Promise<string> {
    const key = await this.options.secrets.get(connection.id)
    if (!key && connection.provider !== 'openai-compatible') fail('该模型连接尚未设置 API Key')
    return key ?? ''
  }

  private async updateConversationList(change: ConversationListChange) {
    const times = Object.fromEntries([...this.conversations.keys()].map(id => [id, this.conversationMessages(id).at(-1)?.createdAt ?? '']))
    const updates = conversationListUpdates([...this.conversations.values()], change, times)
    await this.store.write(updates.map(item => record('conversations', item)))
    for (const item of updates) this.conversations.set(item.id, item)
    if (updates.length) this.changed(change.id)
  }

  private async clearConversationHistory(id: string, hide: boolean) {
    const conversation = this.conversations.get(id) ?? fail('会话不存在')
    const running = [...this.runs.values()].some(run => run.conversationId === id && (this.runControllers.has(run.id) || this.activeAdapters.has(run.id)))
    if ((!this.clearingConversations.has(id) && this.conversationBusy(id)) || running || this.automations.hasActiveConversation(id)) fail('会话仍有任务执行或收尾，请先停止并等待结束后再清空')
    this.clearingConversations.add(id)
    const timer = this.workTimers.get(id)
    if (timer) clearTimeout(timer)
    this.workTimers.delete(id)
    const result = await this.history.clear(conversation, hide)
    for (const item of result.removals) {
      switch (item.collection) {
        case 'messages': this.messages.delete(item.id); break
        case 'runs': this.runs.delete(item.id); this.runDirectories.delete(item.id); break
        case 'requests': this.requests.delete(item.id); break
        case 'snapshots': this.snapshots.delete(item.id); break
        case 'approvals': this.approvals.delete(item.id); break
        case 'artifacts': this.artifacts.delete(item.id); break
      }
    }
    this.scheduler.forgetHistory(result.removals)
    this.memory.forgetHistory(result.removals.filter(item => item.collection === 'memory').map(item => item.id), result.memoryEpochs)
    this.automations.replaceHistory(result.occurrences)
    this.conversations.set(id, result.conversation)
    this.clearingConversations.delete(id)
    this.emit({ type: 'conversation:cleared', conversationId: id })
    this.changed(id)
    await this.store.compact()
  }

  private async saveConversation(input: z.infer<typeof conversationSchema>) {
    if (input.kind === 'direct' && input.agentIds.length !== 1) fail('单聊只能选择一名员工')
    for (const id of input.agentIds) {const a=this.getAgent(id);if(input.kind==='group'&&a.executionBackend?.kind==='acp-local')fail('外部任务员工暂不支持自主群聊，请使用单聊任务入口')}
    this.validateResources(input.sharedKnowledgeIds ?? [], 'knowledge')
    const previous = input.id ? this.getConversation(input.id) : undefined
    if (previous && input.expectedConfigVersion !== undefined && (previous.configVersion ?? 1) !== input.expectedConfigVersion) fail('群设置已更新，请刷新后保存')
    if (previous && previous.kind !== input.kind) fail('不能修改会话类型')
    if (!previous && input.kind === 'direct') {
      const existing = [...this.conversations.values()].find(conversation => conversation.kind === 'direct' && conversation.agentIds[0] === input.agentIds[0])
      if (existing) return clone(existing)
    }
    const conversationId = previous?.id ?? randomUUID()
    const { expectedConfigVersion: _, ...definition } = input
    const conversation: Conversation = { ...previous, ...definition, configVersion: (previous?.configVersion ?? 0) + 1, mode: 'natural', id: conversationId, sharedKnowledgeIds: input.sharedKnowledgeIds ?? [], workspacePath: previous?.workspacePath ?? join(this.dataPath, 'workspaces', conversationId), createdAt: previous?.createdAt ?? now(), updatedAt: now() }
    await mkdir(conversation.workspacePath, { recursive: true })
    await this.store.write([record('conversations', conversation)]); this.conversations.set(conversation.id, conversation)
    if (previous) {
      const removed = previous.agentIds.filter(id => !conversation.agentIds.includes(id))
      const revoked = previous.sharedKnowledgeIds.filter(id => !conversation.sharedKnowledgeIds.includes(id))
      await this.cancelWhere(run => run.conversationId === conversation.id && (removed.includes(run.agentId) || !!this.snapshots.get(run.id)?.resources.some(resource => revoked.includes(resource.id)) || (run.phase === 'coordination' && (removed.length > 0 || revoked.length > 0))), '群成员或共享资料权限已变更')
      if (removed.length || revoked.length) {
        for (const work of (await this.works.view(conversation.id)).workItems) if (removed.includes(work.ownerAgentId) || revoked.length) await this.works.cancelTree(work.id, '群成员或共享资料权限已变更')
        await this.scheduler.cancel(conversation.id, '群成员或共享资料权限已变更')
      }
      for (const member of removed) await this.memory.invalidateConversation(member, conversation.id)
      if (revoked.length) for (const member of conversation.agentIds) await this.memory.invalidateConversation(member, conversation.id)
      if (removed.length) for (const member of conversation.agentIds) await this.invalidateEmployeeMemory(member, entry => entry.sourceMessageIds.some(id => removed.includes(this.messages.get(id)?.senderId ?? '')), conversation.id)
    }
    this.changed(conversation.id); return clone(conversation)
  }

  private nextMessage(conversationId: string, values: Pick<Message, 'senderType' | 'senderId' | 'senderName' | 'content' | 'status'> & Partial<Pick<Message, 'runId' | 'id'>>): Message {
    return { id: randomUUID(), conversationId, sequence: Math.max(0, ...this.conversationMessages(conversationId).map(message => message.sequence)) + 1, createdAt: now(), ...values }
  }
  private newRun(conversation: Conversation, agentId: string, triggerMessageId: string, turnId?: string, phase: AgentRun['phase'] = 'execution'): AgentRun {
    const agent = this.getAgent(agentId)
    return { id: randomUUID(), conversationId: conversation.id, phase, turnId, agentId, agentName: agent.name, triggerMessageId, messageId: phase === 'execution' ? randomUUID() : '', status: 'queued', createdAt: now(), toolEvents: [] }
  }
  private async sendMessage(input: z.infer<typeof sendSchema>, origin?: AutomationOrigin) {
    const fingerprint = JSON.stringify({ kind: 'message', ...input, ...(origin?{origin}:{}) })
    const existing = this.requests.get(input.requestId)
    if (existing) { if (existing.fingerprint !== fingerprint) fail('requestId 已用于不同请求'); return clone(this.messages.get(existing.messageId!) ?? fail('原请求消息不存在')) }
    const conversation = this.getConversation(input.conversationId)
    if(conversation.agentIds.some(id=>this.getAgent(id).executionBackend?.kind==='acp-local'))fail('此外部员工只支持显式任务，请点击执行外部任务。')
    for (const member of input.mentionIds) if (!conversation.agentIds.includes(member)) fail('@ 的员工不是当前会话的有效成员')
    if (input.replyToMessageId && this.messages.get(input.replyToMessageId)?.conversationId !== conversation.id) fail('引用消息不属于当前会话')
    if (input.stopPrevious) await this.cancelConversation(conversation.id)
    const message = this.nextMessage(conversation.id, { senderType: 'user', senderId: 'user', senderName: '我', content: input.content, status: 'completed' })
    if(origin){message.origin=origin;message.senderName='定时任务 · '+origin.name;message.senderId='automation:'+origin.automationId}
    message.mentionIds = input.mentionIds; message.replyToMessageId = input.replyToMessageId
    const prepared = this.scheduler.prepare(conversation, message)
    const request: RequestRecord = { id: input.requestId, fingerprint, messageId: message.id }
    conversation.lastMessageAt = message.createdAt
    await this.store.write([record('messages', message), record('requests', request), record('conversations', conversation), ...prepared.records])
    this.messages.set(message.id, message); this.requests.set(request.id, request)
    this.emit({ type: 'message', message }); this.changed(conversation.id); this.scheduler.accept(prepared)
    return clone(message)
  }

  private externalWorkspace(run:AgentRun){const root=join(this.dataPath,'external-workspaces',run.agentId,run.conversationId);return {root,runPath:join(root,'runs',run.id),workPath:join(root,'work'),sharedPath:this.getConversation(run.conversationId).workspacePath}}
  private externalRun(id:string){const run=this.runs.get(id);if(!run?.backend||run.status!=='completed')fail('只能发布已完成的外部任务文件');if(!this.getConversation(run!.conversationId).agentIds.includes(run!.agentId))fail('员工已移出会话');return run!}
  private async externalFiles(id:string){const run=this.externalRun(id),directory=this.externalWorkspace(run).runPath;const files:{name:string;relativePath:string}[]=[];const walk=async(path:string,prefix='',depth=0):Promise<void>=>{if(depth>3||files.length>=100)return;for(const entry of await readdir(path,{withFileTypes:true})){if(files.length>=100)break;if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;const relativePath=prefix+entry.name;if(entry.isFile())files.push({name:relativePath,relativePath});else if(entry.isDirectory())await walk(join(path,entry.name),relativePath+'/',depth+1)}};await restrictedPath([directory],directory);await walk(directory);return {directory,files}}
  private async publishExternal(id:string,relativePath:string){const run=this.externalRun(id),agent=this.getAgent(run.agentId),workspace=this.externalWorkspace(run);await publishArtifact({agent,runId:run.id,signal:new AbortController().signal,onArtifact:async artifact=>{const saved={...artifact,id:artifact.id!,conversationId:run.conversationId};await this.store.write([record('artifacts',saved)]);this.artifacts.set(saved.id,saved)}},workspace,`self:/runs/${run.id}/${relativePath}`);this.changed(run.conversationId)}

  private conversationBusy(conversationId:string){return this.clearingConversations.has(conversationId)||[...this.scheduler.turns.values()].some(t=>t.conversationId===conversationId&&(this.scheduler.hasActiveTurn(t.id)||!['completed','failed','cancelled','interrupted','budget_exhausted','waiting_user'].includes(t.status)))||[...this.runs.values()].some(r=>r.conversationId===conversationId&&!terminal.has(r.status))}
  private automationFingerprint(conversationId:string){const c=this.getConversation(conversationId);const agents=c.agentIds.map(id=>this.getAgent(id));for(const a of agents){if(!a.active||a.executionBackend?.kind==='acp-local')fail('自动化只支持启用的模型 API 员工');if(a.allowCommands)fail('自动化暂不支持命令执行；请先关闭员工的命令权限');const connection=this.getConnection(a.connectionId);if(!a.modelId&&!connection.defaultModel)fail('员工尚未配置模型')}return createHash('sha256').update(JSON.stringify({conversation:{id:c.id,version:c.configVersion,members:c.agentIds,shared:c.sharedKnowledgeIds},agents:agents.map(a=>({id:a.id,version:a.configVersion,connection:this.getConnection(a.connectionId)}))})).digest('hex')}
  private inspectAutomation(o:AutomationOccurrence):Partial<AutomationOccurrence>|undefined {if(!o.turnId)return;const turn=this.scheduler.turns.get(o.turnId);if(!turn)return;const runs=[...this.runs.values()].filter(r=>r.turnId===turn.id),messages=[...this.messages.values()].filter(m=>m.turnId===turn.id&&m.senderType==='agent'&&m.status==='completed');const ended=['completed','failed','cancelled','interrupted','budget_exhausted','waiting_user'].includes(turn.status)&&!this.scheduler.hasActiveTurn(turn.id)&&runs.every(r=>terminal.has(r.status));const status:AutomationOccurrence['status']=ended?(turn.status==='budget_exhausted'?'failed':turn.status as AutomationOccurrence['status']):runs.some(r=>r.status==='waiting_approval')?'waiting_approval':'running';const usage:NonNullable<AutomationOccurrence['usage']>={};for(const key of ['inputTokens','outputTokens','totalTokens']as const){const values=runs.map(r=>r.usage?.[key]).filter((v):v is number=>v!==undefined);if(values.length)usage[key]=values.reduce((a,b)=>a+b,0)}return {status,runIds:runs.map(r=>r.id),resultMessageIds:messages.map(m=>m.id),modelCalls:turn.modelCalls,usage,...(ended?{finishedAt:turn.finishedAt??now(),reason:turn.reason}:{})}}

  private async sendExternalTask(input: {conversationId:string;content:string;requestId:string}) {
    const fingerprint=JSON.stringify({kind:'external-task',...input}),existing=this.requests.get(input.requestId)
    if(existing){if(existing.fingerprint!==fingerprint)fail('requestId 已用于不同请求');return clone(this.messages.get(existing.messageId!)!)}
    const conversation=this.getConversation(input.conversationId),agent=await this.employees.reconcile(conversation.agentIds[0]!)
    if(conversation.kind!=='direct'||agent.executionBackend?.kind!=='acp-local'||!agent.active)fail('请选择已启用的外部员工单聊')
    if([...this.runs.values()].some(r=>r.conversationId===conversation.id&&!terminal.has(r.status)))fail('本会话已有任务，请先停止或等待完成')
    if(this.externalTasks.size>=2)fail('同时最多运行两个外部任务')
    const profile=this.profiles.get((agent.executionBackend as {profileId:string}).profileId)
    const verified=profile.verified??fail('请先在设置中测试外部启动项')
    const message=this.nextMessage(conversation.id,{senderType:'user',senderId:'user',senderName:'我',content:input.content,status:'completed'})
    const run=this.newRun(conversation,agent.id,message.id);run.responseKind='task';run.status='running';run.backend={program:{name:verified.name,version:verified.version,executableHash:profile.executableHash},kind:'acp-local',profileId:profile.id,profileRevision:profile.revision,externalInvocations:1,sessionPolicy:'fresh',toolControl:'external'}
    const request={id:input.requestId,fingerprint,messageId:message.id},controller=new AbortController()
    await this.store.write([record('messages',message),record('runs',run),record('requests',request)])
    this.runControllers.set(run.id,controller);this.messages.set(message.id,message);this.runs.set(run.id,run);this.requests.set(request.id,request);this.changed(conversation.id)
    const task=this.executeExternal(run,clone(agent),profile,message,controller).catch(error=>this.emit({type:'runtime-error',error:this.errorMessage(error)}));this.externalTasks.add(task);void task.finally(()=>this.externalTasks.delete(task))
    return clone(message)
  }
  private async executeExternal(run:AgentRun,agent:DigitalAgent,profile:import('../shared/domain/backends').LaunchProfile,trigger:Message,controller:AbortController){
    const deadline=setTimeout(()=>controller.abort(new Error('外部任务超过 15 分钟，已停止')),15*60_000),signal=controller.signal
    try{
      const cwd=this.externalWorkspace(run).runPath;await mkdir(cwd,{recursive:true});this.runDirectories.set(run.id,cwd)
      const result=await runAcp({profile,cwd,privateHome:join(this.dataPath,'external-runtime',run.id),signal,prompt:`员工工作规则：\n${agent.instructions}\n\n本次明确任务：\n${trigger.content}`,approve:description=>this.requestApproval(run,controller,description,cwd,true),onTool:async event=>{if(signal.aborted||terminal.has(run.status))return;const index=run.toolEvents.findIndex(t=>t.id===event.id);if(index<0)run.toolEvents.push(event);else run.toolEvents[index]=event;await this.store.write([record('runs',run)]);this.changed(run.conversationId)}})
      await this.serialize(async()=>{signal.throwIfAborted();if(terminal.has(run.status)||this.closing)fail('任务已结束');run.backend!.sessionId=result.sessionId;const message=this.nextMessage(run.conversationId,{id:run.messageId,senderType:'agent',senderId:agent.id,senderName:agent.name+' · 外部运行报告',content:result.text,status:'completed',runId:run.id});this.messages.set(message.id,message);run.status='completed';run.finishedAt=now();await this.store.write([record('runs',run),record('messages',message)]);this.emit({type:'message',message});this.changed(run.conversationId)})
    }catch(error){const message=this.errorMessage(error);run.failureKind=error instanceof RequestError&&error.code===RequestError.authRequired().code?'auth_required':message.includes('UNSUPPORTED')?'unsupported':message.includes('refusal')?'input_required':/max_tokens|max_turn|超过/.test(message)?'budget_exhausted':'transport';if(!terminal.has(run.status))await this.finishRun(run,signal.aborted?(this.closing?'interrupted':'cancelled'):'failed',run.failureKind==='auth_required'?'外部程序需要登录，请在程序自身完成认证后重新测试。':message)}
    finally{clearTimeout(deadline);await this.clearApprovals(run.id);this.runControllers.delete(run.id)}
  }

  private authorizedResources(agent: DigitalAgent, conversation: Conversation): Resource[] {
    return authorizedResources(agent, conversation, this.resources.values())
  }
  private contextMessages(conversation: Conversation, triggerMessageId: string, throughSequence = Infinity): Message[] {
    const triggerSequence = this.messages.get(triggerMessageId)?.sequence ?? fail('触发消息不存在')
    const messages = this.conversationMessages(conversation.id).filter(message => {
      if (message.status !== 'completed' || message.sequence > throughSequence) return false
      if (!message.runId) return message.sequence <= triggerSequence
      const originatingTrigger = this.runs.get(message.runId)?.triggerMessageId
      if (!originatingTrigger || (this.messages.get(originatingTrigger)?.sequence ?? Infinity) > triggerSequence) return false
      const snapshot = this.snapshots.get(message.runId)
      if (!snapshot || snapshot.invalidated) return false
      const owner = this.employees.find(snapshot.agent.id)
      if (!owner || !owner.active || !conversation.agentIds.includes(owner.id)) return false
      const allowed = new Set(this.authorizedResources(owner, conversation).map(resource => resource.id))
      return snapshot.resources.every(resource => allowed.has(resource.id))
    })
    return clone([...new Map(messages.map(message => [message.id, message])).values()])
  }
  private async engineContext(run: AgentRun, turn: DiscussionTurn, signal: AbortSignal, throughSequence = Infinity): Promise<EngineContext> {
    return this.serialize(async () => {
    signal.throwIfAborted()
    const conversation = this.getConversation(run.conversationId)
    const origin=this.messages.get(turn.triggerMessageId)?.origin
    if(origin&&this.automationFingerprint(conversation.id)!==origin.authorizedFingerprint)fail('自动化授权的员工或会话配置已变更')
    const previousVersion = this.getAgent(run.agentId).configVersion
    const agent = await this.employees.reconcile(run.agentId)
    if (agent.configVersion !== previousVersion) {
      // A phase boundary may discover an external source edit while another group is still running.
      const staleTurns = new Set([...this.runs.values()].filter(candidate => candidate.agentId === agent.id && candidate.turnId && (this.snapshots.get(candidate.id)?.agent.configVersion ?? agent.configVersion) < agent.configVersion && !['completed', 'cancelled', 'failed', 'interrupted', 'budget_exhausted', 'waiting_user'].includes(this.scheduler.turns.get(candidate.turnId)?.status ?? 'completed')).map(candidate => candidate.turnId!))
      await this.cancelWhere(candidate => !!candidate.turnId && staleTurns.has(candidate.turnId), '员工系统文件已在外部更新，旧版本运行已停止')
      for (const staleTurnId of staleTurns) { const staleTurn = this.scheduler.turns.get(staleTurnId); if (staleTurn) await this.scheduler.cancel(staleTurn.conversationId, '员工系统文件已在外部更新') }
      signal.throwIfAborted()
    }
    if(agent.executionBackend?.kind==='acp-local')fail('UNSUPPORTED：外部任务后端不支持聊天、决策或记忆阶段')
    if (!agent.active || !conversation.agentIds.includes(agent.id)) fail('员工已停用或移出会话')
    const connection = this.getConnection(agent.connectionId), apiKey = await this.apiKey(connection)
    signal.throwIfAborted()
    const memory = await this.memory.get({ agentId: agent.id, scope: 'conversation', conversationId: conversation.id })
    const profile = await this.memory.get({ agentId: agent.id, scope: 'profile' })
    const allowedResources = new Set(this.authorizedResources(agent, conversation).map(resource => resource.id))
    const messages = this.contextMessages(conversation, turn.triggerMessageId, throughSequence), visibleMessageIds = new Set(messages.map(message => message.id))
    const combined = { ...memory, entries: [...profile.entries, ...memory.entries].filter(entry => entry.sourceResourceIds.every(id => allowedResources.has(id)) && entry.sourceMessageIds.every(id => { const runId = this.messages.get(id)?.runId; return (entry.scope === 'profile' || visibleMessageIds.has(id)) && (!runId || !this.snapshots.get(runId)?.invalidated) })) }
    const loaded = await this.homes.load(agent, conversation, combined, run.id)
    signal.throwIfAborted()
    const snapshot: RunSnapshot = clone({ id: run.id, agent, connection, conversation, resources: this.authorizedResources(agent, conversation), memoryEntryIds: combined.entries.map(entry => entry.id) })
    this.snapshots.set(run.id, snapshot); run.bootstrap = loaded.bootstrap; this.runDirectories.set(run.id, loaded.workspace.runPath)
    await this.store.write([record('snapshots', snapshot), record('runs', run)])
    return { agent: clone(agent), connection: clone(connection), apiKey, conversation: clone(conversation), messages, resources: clone(snapshot.resources), runId: run.id, signal, ...loaded, memory: combined, members: conversation.agentIds.map(id => clone(this.getAgent(id))), contributions: [...this.scheduler.contributions.values()].filter(item => item.turnId === turn.id).map(clone), triggerMessageId: turn.triggerMessageId, turnId: turn.id, onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
      onAdditionalModelCall: async () => {
        signal.throwIfAborted()
        if (terminal.has(run.status) || this.closing) fail('任务已结束，不能继续请求模型')
        await this.scheduler.reserveAdditionalCall(turn.id, run.phase === 'decision' ? 'decision' : run.phase === 'memory' ? 'memory' : 'execution')
        if (run.workId) await this.works.reserveCall(run.id)
        signal.throwIfAborted()
      },
      onUsage: async usage => {
        if (signal.aborted || terminal.has(run.status) || this.closing) return
        const clean = z.object({ inputTokens: z.number().nonnegative().optional(), outputTokens: z.number().nonnegative().optional(), totalTokens: z.number().nonnegative().optional() }).strict().parse(usage)
        const delta = clean.outputTokens === undefined ? undefined : clean.outputTokens - (run.usage?.outputTokens ?? 0)
        run.usage = { ...run.usage, ...clean }; await this.store.write([record('runs', run)])
        if (run.workId) await this.works.usage(run.id, clean)
        if (delta !== undefined) await this.scheduler.recordOutputUsage(turn.id, delta)
      },
    }
    })
  }
  private async executeDecision(turn: DiscussionTurn, event: ConversationEvent, delivery: AgentDelivery, signal: AbortSignal) {
    const run = this.newRun(this.getConversation(turn.conversationId), delivery.agentId, turn.triggerMessageId, turn.id, 'decision')
    run.status = 'running'; this.runs.set(run.id, run); await this.store.write([record('runs', run)]); this.changed(run.conversationId)
    const controller = new AbortController(), effective = AbortSignal.any([controller.signal, signal]); this.runControllers.set(run.id, controller)
    let key = ''
    try {
      const context = await this.engineContext(run, turn, effective, delivery.observedThroughSequence); key = context.apiKey
      const visible = new Set(context.messages.map(message => message.id))
      context.workItems = (await this.works.view(turn.conversationId)).workItems.filter(work => visible.has(work.sourceMessageId) && work.resultMessageIds.every(id => visible.has(id)))
      context.participation = { isFirstDecision: ![...this.scheduler.deliveries.values()].some(item => item.turnId === turn.id && item.agentId === delivery.agentId && item.id !== delivery.id && !['pending', 'evaluating'].includes(item.status)), hasRespondedInTurn: [...this.messages.values()].some(message => message.turnId === turn.id && message.senderId === delivery.agentId && message.status === 'completed'), triggerEventType: event.type, eventMessageId: event.messageId, observedThroughSequence: delivery.observedThroughSequence, sourceEventIds: delivery.eventIds ?? [event.id] }
      if (!this.options.engine.decide) fail('模型引擎尚未支持成员独立参与判断')
      const decision = await this.invokeModel(run, context, ctx => this.options.engine.decide!(ctx), 15_000)
      effective.throwIfAborted()
      await this.finishRun(run, 'completed'); return decision
    } catch (error) {
      if (!terminal.has(run.status)) await this.finishRun(run, effective.aborted ? (this.closing ? 'interrupted' : 'cancelled') : 'failed', this.redact(this.errorMessage(error), key))
      throw new Error(this.redact(this.errorMessage(error), key))
    } finally { this.runControllers.delete(run.id) }
  }
  private async executeResponse(turn: DiscussionTurn, event: ConversationEvent, decision: DecisionRecord, signal: AbortSignal, publish: PublishReply): Promise<void | 'deferred'> {
    const conversation = this.getConversation(turn.conversationId), run = this.newRun(conversation, decision.agentId, turn.triggerMessageId, turn.id)
    run.responseKind = decision.responseKind === 'task' && decision.action === 'reply' ? 'task' : 'chat'
    run.status = 'running'; this.runs.set(run.id, run)
    const controller = new AbortController(), effective = AbortSignal.any([controller.signal, signal]); this.runControllers.set(run.id, controller)
    const abort = () => controller.abort(signal.reason); signal.addEventListener('abort', abort, { once: true })
    let key = ''
    let outcome: WorkOutcome = { disposition: 'no_progress', summary: '运行结束，但员工未提交可检查的业务结果声明' }
    let outcomeReported = false
    let workDeadline: ReturnType<typeof setTimeout> | undefined
    let releaseTask: (() => void) | undefined
    try {
      await this.store.write([record('runs', run)])
      if (run.responseKind === 'task') {
        const queuedAt = Date.now()
        try { releaseTask = await this.taskAdmission.acquire(this.getAgent(run.agentId).allowCommands, effective, `${conversation.id}:${run.agentId}`) }
        finally { run.taskQueueMs = Date.now() - queuedAt }
      }
      if (turn.wakeId) await this.serialize(async () => {
        effective.throwIfAborted()
        const messages = this.conversationMessages(conversation.id).filter(message => message.status === 'completed')
        const latestUser = [...messages].reverse().find(message => message.senderType === 'user')!
        turn.triggerMessageId = latestUser.id; run.triggerMessageId = latestUser.id
        decision = { ...decision, observedThroughSequence: messages.at(-1)!.sequence, replyToMessageId: latestUser.id }
        await this.store.write([record('turns', turn), record('runs', run), record('decisions', decision)])
      })
      const context = await this.engineContext(run, turn, effective, decision.observedThroughSequence); key = context.apiKey
      if (run.responseKind === 'task') {
        try {
          context.work = await this.serialize(async () => {
            effective.throwIfAborted()
            if (!this.scheduler.canStartWork(turn.id)) throw new WorkUnavailableError('已有用户新消息，本轮不再开始新工作')
            let intent = decision.work ?? { key: 'main', scope: this.messages.get(turn.triggerMessageId)!.content, deliverable: decision.purpose ?? '完成用户原始请求中的交付目标' }
            if (turn.workId) {
              const retryWork = (await this.works.view(conversation.id)).workItems.find(work => work.id === turn.workId) ?? fail('重试的原工作不存在')
              intent = { key: retryWork.key, scope: retryWork.scope, deliverable: retryWork.deliverable, workId: retryWork.id, expectedVersion: retryWork.version }
            }
            if (intent.workId) {
              const visible = new Set(context.messages.map(message => message.id))
              const existing = (await this.works.view(conversation.id)).workItems.find(work => work.id === intent.workId)
              if (!existing || !visible.has(existing.sourceMessageId) || !existing.resultMessageIds.every(id => visible.has(id))) fail('当前授权上下文不能引用该工作')
            }
            return this.works.claim({ conversationId: conversation.id, sourceMessageId: turn.triggerMessageId, agentId: run.agentId, runId: run.id, intent, wakeId: turn.wakeId })
          })
        } catch (error) {
          if (!(error instanceof WorkUnavailableError)) throw error
          await this.finishRun(run, 'cancelled', error.message)
          return 'deferred'
        }
        run.workId = context.work.id; run.workVersion = context.work.version
        const budget = (await this.works.view(conversation.id)).workBudgets.find(budget => budget.id === context.work!.budgetId)!
        workDeadline = setTimeout(() => { void this.serialize(async () => { controller.abort(new Error('达到原始工作的时间上限')) }) }, Math.max(0, Date.parse(budget.deadlineAt) - Date.now()))
        workDeadline.unref()
        context.workItems = (await this.works.view(conversation.id)).workItems.filter(work => {
          const visible = new Set(context.messages.map(message => message.id))
          return visible.has(work.sourceMessageId) && work.resultMessageIds.every(id => visible.has(id))
        })
        context.completedWorkTools = [...this.runs.values()].filter(previous => {
          const snapshot = this.snapshots.get(previous.id)
          const authorized = new Set(context.resources.map(resource => resource.id))
          return previous.id !== run.id && previous.workId === run.workId && previous.agentId === run.agentId && snapshot && !snapshot.invalidated && snapshot.resources.every(resource => authorized.has(resource.id))
        }).map(previous => ({ runId: previous.id, tools: previous.toolEvents.filter(tool => tool.status === 'completed' && ['write_file', 'publish_artifact', 'execute_command'].includes(tool.name)) }))
        const validateDependencies = async (dependencies: { workId: string }[]) => {
          const visible = new Set(this.contextMessages(this.getConversation(conversation.id), turn.triggerMessageId).map(message => message.id))
          const items = (await this.works.view(conversation.id)).workItems
          for (const dependency of dependencies) {
            const work = items.find(item => item.id === dependency.workId)
            if (!work || !visible.has(work.sourceMessageId) || !work.resultMessageIds.every(id => visible.has(id))) fail('当前授权上下文不能引用该依赖')
          }
        }
        context.beforeEffect = async () => { effective.throwIfAborted(); await this.works.markEffect(run.id) }
        context.afterEffect = async () => { effective.throwIfAborted(); await this.works.confirmEffect(run.id) }
        context.delegateWork = input => this.serialize(async () => {
          effective.throwIfAborted()
          const proposal = workDelegationSchema.parse(input), owner = this.getAgent(proposal.ownerAgentId)
          if (!owner.active || !this.getConversation(conversation.id).agentIds.includes(owner.id) || owner.executionBackend?.kind === 'acp-local') fail('委派对象不是当前有效的内置成员')
          await validateDependencies(proposal.dependencies ?? [])
          const child = await this.works.delegate(run.id, proposal)
          this.changed(conversation.id); return child
        })
        context.waitForWork = input => this.serialize(async () => {
          effective.throwIfAborted(); const wait = workWaitSchema.parse(input)
          await validateDependencies(wait.dependencies); await this.works.waitFor(run.id, wait)
          context.pendingWorkWait = wait
          outcome = { disposition: 'waiting', summary: wait.nextStep }; outcomeReported = true
          this.changed(conversation.id)
        })
        context.onWorkOutcome = async value => { effective.throwIfAborted(); outcome = workOutcomeSchema.parse(value); outcomeReported = true }
      }
      const initialMessage = { id: run.messageId, senderType: 'agent' as const, senderId: run.agentId, senderName: run.agentName, content: '', status: 'streaming' as const, runId: run.id }
      const message: Message = run.responseKind === 'task' ? { ...initialMessage, conversationId: conversation.id, sequence: 0, createdAt: now() } : this.nextMessage(conversation.id, initialMessage)
      message.turnId = turn.id; message.replyToMessageId = decision.replyToMessageId ?? event.messageId; message.mentionIds = decision.recipientAgentIds ?? []
      if (run.responseKind === 'chat') this.messages.set(message.id, message)
      await this.store.write([record('runs', run), ...(run.responseKind === 'chat' ? [record('messages', message)] : [])])
      if (run.responseKind === 'chat') this.emit({ type: 'message', message })
      this.changed(conversation.id)
      const alive = () => !effective.aborted && !this.closing && !terminal.has(run.status)
      context.responseKind = run.responseKind; context.decision = decision
      if (run.responseKind === 'chat') context.resources = []
      else {
        context.environment = await this.homes.prepareEnvironment(context)
        effective.throwIfAborted()
        run.environment = context.environment.summary
        await this.store.write([record('runs', run)])
      }
      context.onDelta = async delta => {
        if (!alive()) return
        message.content += delta
        if (run.responseKind === 'chat') { await this.store.write([record('messages', message)]); if (alive()) this.emit({ type: 'message', message }) }
        else {
          run.draft = { text: message.content, observedThroughSequence: decision.observedThroughSequence, revisions: 0, status: 'private' }
          await this.store.write([record('runs', run)])
        }
      }
      context.onTool = async event => {
        if (!alive()) return
        const index = run.toolEvents.findIndex(tool => tool.id === event.id), safe = { ...event, detail: this.redact(event.detail, key) }
        if (index < 0) run.toolEvents.push(safe); else run.toolEvents[index] = safe
        await this.store.write([record('runs', run)]); if (alive()) this.changed(conversation.id)
      }
      context.approveCommand = (command, cwd) => this.requestApproval(run, controller, command, cwd, context.agent.allowCommands && !this.messages.get(turn.triggerMessageId)?.origin)
      context.onArtifact = artifact => this.serialize(async () => {
        if (!alive()) throw new Error('任务已停止，不能发布产物')
        if (!isWithin(conversation.workspacePath, artifact.path)) fail('发布产物不在本群共享目录内')
        const saved = { ...artifact, id: artifact.id ?? randomUUID(), conversationId: conversation.id, ownerAgentId: run.agentId, runId: run.id, publishedAt: now() }
        await this.store.write([record('artifacts', saved)]); this.artifacts.set(saved.id, saved); this.changed(conversation.id)
      })
      await this.invokeModel(run, context, async ctx => {
        if (run.responseKind === 'task' && !this.scheduler.canStartWork(turn.id)) throw new WorkUnavailableError('已有用户新消息，尚未启动的旧任务已暂缓')
        this.scheduler.executionStarted(turn.id, run.agentId)
        // Keep the resource lease until the adapter itself settles, even if the host has cancelled.
        const release = releaseTask; releaseTask = undefined
        try { await this.options.engine.run(ctx) } finally { release?.() }
      })
      effective.throwIfAborted()
      if (!alive()) throw new Error('任务已停止')
      if (!message.content.trim()) throw new Error('模型没有返回可发布的正文')
      const produced = [...this.artifacts.values()].filter(artifact => artifact.runId === run.id)
      if (!outcomeReported && produced.length) outcome = { disposition: 'progress', summary: '已登记产物，尚未声明原始目标已经交付', evidence: produced.map(artifact => ({ kind: 'artifact', reference: artifact.id })) }
      const commit = async () => {
        effective.throwIfAborted()
        const current = this.getConversation(conversation.id), snapshot = this.snapshots.get(run.id)!
        if (!alive() || !current.agentIds.includes(run.agentId) || snapshot.invalidated || this.getAgent(run.agentId).configVersion !== snapshot.agent.configVersion || (current.configVersion ?? 0) !== (snapshot.conversation.configVersion ?? 0)) fail('当前运行已失去发布权限')
        const completedMessage = run.responseKind === 'task'
          ? { ...message, ...this.nextMessage(conversation.id, { id: message.id, runId: run.id, senderType: 'agent', senderId: run.agentId, senderName: run.agentName, content: run.draft!.text, status: 'completed' }) }
          : { ...message, status: 'completed' as const }
        const completedRun = { ...run, status: 'completed' as const, finishedAt: now(), ...(run.workId ? { disposition: outcome.disposition } : {}), ...(run.draft ? { draft: { ...run.draft, status: 'published' as const } } : {}) }
        const artifacts = [...this.artifacts.values()].filter(artifact => artifact.runId === run.id)
        const records = [record('runs', completedRun), record('messages', completedMessage), ...artifacts.map(artifact => record('artifacts', artifact))]
        await publish(completedMessage, records, run.workId ? async records => {
          await this.works.settle(run.id, outcome, { messageId: message.id, content: completedMessage.content, artifactIds: artifacts.map(artifact => artifact.id) }, records)
        } : undefined)
        Object.assign(run, completedRun); Object.assign(message, completedMessage); this.messages.set(message.id, message)
      }
      if (run.responseKind === 'task') {
        run.draft = { text: message.content, observedThroughSequence: decision.observedThroughSequence, revisions: 0, status: 'private' }
        await this.store.write([record('runs', run)])
        const withhold = (reason: string) => this.serialize(async () => {
          effective.throwIfAborted()
          const saved = { ...run, status: 'completed' as const, finishedAt: now(), disposition: 'blocked' as const, draft: { ...run.draft!, status: 'withheld' as const, reason } }
          await this.works.withhold(run.id, reason, [record('runs', saved)])
          Object.assign(run, saved); this.changed(conversation.id)
        })
        for (;;) {
          const stale = await this.serialize(async () => {
            effective.throwIfAborted()
            const current = this.conversationMessages(conversation.id).filter(message => message.status === 'completed')
            const latest = current.at(-1)?.sequence ?? 0
            const evidenceError = workEvidenceError(outcome, { content: run.draft!.text, artifactIds: [...this.artifacts.values()].filter(artifact => artifact.runId === run.id).map(artifact => artifact.id) }, !!context.pendingWorkWait)
            if (latest <= run.draft!.observedThroughSequence && !evidenceError) { await commit(); return undefined }
            if (evidenceError) { run.draft!.reason = evidenceError; await this.store.write([record('runs', run)]) }
            const latestUser = [...current].reverse().find(message => message.senderType === 'user')!
            return { sequence: latest, triggerMessageId: latestUser.id, turnId: latestUser.turnId, messages: this.contextMessages(this.getConversation(conversation.id), latestUser.id, latest), evidenceError }
          })
          if (!stale) break
          if (run.draft.revisions >= 2 || !this.options.engine.report) {
            await withhold(stale.evidenceError ? `${stale.evidenceError}；${run.draft.revisions >= 2 ? '达到本次重新汇报上限' : '当前引擎不支持只更新汇报'}，已保存结果且未重放操作` : run.draft.revisions >= 2 ? '新消息持续到达，达到本次重新汇报上限；已执行操作保留，未重放' : '任务结果基于旧输入，当前引擎不支持只更新汇报；已保存草稿待核对')
            return 'deferred'
          }
          await this.works.reserveReport(run.id)
          await context.onAdditionalModelCall!()
          const baseline = { ...run.usage }
          const reportContext: EngineContext = { ...context, ...stale, resources: [], responseKind: 'chat',
            workspace: undefined, environment: undefined, onArtifact: undefined, onWorkOutcome: undefined, beforeEffect: undefined, afterEffect: undefined, delegateWork: undefined, waitForWork: undefined,
            work: { ...context.work!, outcome, artifactIds: [...this.artifacts.values()].filter(artifact => artifact.runId === run.id).map(artifact => artifact.id) },
            onDelta: async () => {}, onTool: async () => { throw new Error('重新汇报不允许执行工具') }, approveCommand: async () => false,
            onUsage: async usage => {
              const cumulative = { ...baseline }
              for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[field] !== undefined) cumulative[field] = (baseline[field] ?? 0) + usage[field]!
              await context.onUsage?.(cumulative)
            },
          }
          const report = await this.invokeModel(run, reportContext, ctx => this.options.engine.report!(ctx, run.draft!), 30_000)
          effective.throwIfAborted(); run.draft.revisions++
          if (report.action === 'discard') { await withhold('员工根据新信息决定暂不公开旧任务结果；已执行操作不会重放'); return 'deferred' }
          if (!report.text?.trim()) throw new Error('重新汇报没有返回可发布正文')
          run.draft.text = report.text; run.draft.observedThroughSequence = stale.sequence
          if (report.outcome) outcome = workOutcomeSchema.parse(report.outcome)
          if (!workEvidenceError(outcome, { content: report.text, artifactIds: reportContext.work!.artifactIds }, !!context.pendingWorkWait)) delete run.draft.reason
          await this.store.write([record('runs', run)])
        }
      } else await this.serialize(commit)
      this.emit({ type: 'message', message }); this.changed(conversation.id)
    } catch (error) {
      if (!terminal.has(run.status)) await this.finishRun(run, effective.aborted ? (this.closing ? 'interrupted' : 'cancelled') : error instanceof WorkUnavailableError ? 'cancelled' : 'failed', this.redact(this.errorMessage(error), key))
      if (error instanceof WorkUnavailableError || (run.workId && controller.signal.aborted && !signal.aborted)) return 'deferred'
      throw new Error(this.redact(this.errorMessage(error), key))
    } finally { releaseTask?.(); if (workDeadline) clearTimeout(workDeadline); signal.removeEventListener('abort', abort); this.runControllers.delete(run.id); await this.clearApprovals(run.id) }
  }
  private async updateMemories(turn: DiscussionTurn, participants: string[], signal: AbortSignal) {
    if (!this.options.engine.extractMemory || this.closing) return
    for (const agentId of participants) {
      if (this.closing || signal.aborted) return
      if (!this.getConversation(turn.conversationId).agentIds.includes(agentId)) continue
      if (!await this.scheduler.reserveMaintenance(turn.id)) return
      const run = this.newRun(this.getConversation(turn.conversationId), agentId, turn.triggerMessageId, turn.id, 'memory')
      run.status = 'running'; this.runs.set(run.id, run)
      const controller = new AbortController(), effective = AbortSignal.any([signal, controller.signal]); this.runControllers.set(run.id, controller)
      let key = ''
      try {
        const context = await this.engineContext(run, turn, effective); key = context.apiKey
        const query: MemoryQuery = { agentId, conversationId: turn.conversationId, scope: 'conversation' }
        const candidates = await this.invokeModel(run, context, ctx => this.options.engine.extractMemory!(ctx), 30_000)
        await this.serialize(async () => {
          effective.throwIfAborted()
          const current = this.getConversation(turn.conversationId), currentAgent = this.getAgent(agentId)
          if (!current.agentIds.includes(agentId)) fail('员工已移出本会话')
          const withProvenance = candidates.map(candidate => ({ ...candidate, sourceResourceIds: this.inheritedResources(candidate.sourceMessageIds, candidate.sourceResourceIds ?? []) }))
          const result = await this.memory.extract(query, withProvenance, context.memory!.epoch, this.contextMessages(current, turn.triggerMessageId).map(message => message.id), this.authorizedResources(currentAgent, current).map(resource => resource.id))
          await this.homes.regenerate(currentAgent, result, turn.conversationId)
        })
        await this.finishRun(run, 'completed')
      } catch (error) { if (!terminal.has(run.status)) await this.finishRun(run, effective.aborted ? (this.closing ? 'interrupted' : 'cancelled') : 'failed', this.redact(this.errorMessage(error), key)) }
      finally { this.runControllers.delete(run.id) }
    }
  }

  private invokeModel<T>(run: AgentRun, context: EngineContext, operation: (context: EngineContext) => Promise<T>, timeoutMs?: number): Promise<T> {
    const readOnly = run.phase === 'decision' || run.phase === 'memory'
    const previousTiming = run.timing
    const earlierAttempts: ModelUsage = {}
    let attemptUsage: ModelUsage = {}, started = false
    const deadline = new AbortController(), signal = AbortSignal.any([context.signal, deadline.signal])
    return withAbort(this.modelCapacity.run(context.connection.id, signal, async () => {
      if (started) for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (attemptUsage[field] !== undefined) earlierAttempts[field] = (earlierAttempts[field] ?? 0) + attemptUsage[field]!
      started = true; attemptUsage = {}
      // Queueing is governed by turn cancellation; the phase deadline starts after admission.
      const timer = timeoutMs ? setTimeout(() => deadline.abort(new DOMException('模型阶段超时', 'TimeoutError')), timeoutMs) : undefined
      timer?.unref()
      signal.throwIfAborted()
      // The caller can cancel immediately, but the permit belongs to the actual adapter lifetime.
      this.activeAdapters.add(run.id)
      try { return await operation({ ...context, signal, onUsage: context.onUsage ? async usage => {
        attemptUsage = usage
        const cumulative = { ...earlierAttempts }
        for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) if (usage[field] !== undefined) cumulative[field] = (earlierAttempts[field] ?? 0) + usage[field]!
        await context.onUsage!(cumulative)
      } : undefined }) } finally { this.activeAdapters.delete(run.id); if (timer) clearTimeout(timer) }
    }, {
      retryRateLimit: readOnly,
      reserveRetry: context.onAdditionalModelCall,
      timing: async timing => {
        if (this.closing || terminal.has(run.status)) return
        run.timing = { queueMs: (previousTiming?.queueMs ?? 0) + timing.queueMs, executionMs: (previousTiming?.executionMs ?? 0) + timing.executionMs, backoffMs: (previousTiming?.backoffMs ?? 0) + timing.backoffMs, rateLimitRetries: (previousTiming?.rateLimitRetries ?? 0) + timing.rateLimitRetries }
        await this.store.write([record('runs', run)])
      },
    }), signal)
  }

  private async finishRun(run: AgentRun, status: 'completed' | 'failed' | 'cancelled' | 'interrupted', error?: string) {
    if (run.workId && status !== 'completed') await this.works.release(run.id, status)
    run.status = status; run.finishedAt = now(); if (error) run.error = error
    if (run.draft && status !== 'completed') { run.draft.status = 'withheld'; run.draft.reason = error ?? '运行已停止，草稿未发布' }
    const message = this.messages.get(run.messageId)
    if (message) message.status = status
    await this.store.write([record('runs', run), ...(message ? [record('messages', message)] : [])])
    if (message) this.emit({ type: 'message', message }); this.changed(run.conversationId)
  }
  private async requestApproval(run: AgentRun, controller: AbortController, command: string, cwd: string, commandsAllowed: boolean): Promise<boolean> {
    if (!commandsAllowed) fail('该员工未启用命令执行')
    if (controller.signal.aborted || terminal.has(run.status)) return false
    const expected = this.runDirectories.get(run.id) ?? fail('任务工作目录不存在')
    if (!isAbsolute(cwd) || !isWithin(expected, cwd)) fail('命令只能在本次任务目录内执行')
    if (!command.trim() || command.length > 20000) fail('命令为空或过长')
    const approval: Approval = { id: randomUUID(), runId: run.id, conversationId: run.conversationId, agentName: run.agentName, command, cwd }
    run.status = 'waiting_approval'; this.approvals.set(approval.id, approval)
    let settle!: (approved: boolean) => void
    const result = new Promise<boolean>(resolve => { settle = resolve })
    const abort = () => settle(false)
    controller.signal.addEventListener('abort', abort, { once: true })
    this.pendingApprovals.set(approval.id, settle)
    try {
      await this.store.write([record('runs', run), record('approvals', approval)])
      if (controller.signal.aborted) settle(false)
      this.changed(run.conversationId)
      return await result
    } finally {
      controller.signal.removeEventListener('abort', abort)
      this.pendingApprovals.delete(approval.id); this.approvals.delete(approval.id)
      if (!controller.signal.aborted && run.status === 'waiting_approval') run.status = 'running'
      await this.store.write([record('runs', run)], [{ collection: 'approvals', id: approval.id }])
      this.changed(run.conversationId)
    }
  }
  private async resolveApproval(id: string, approved: boolean) {
    const approval = this.approvals.get(id) ?? fail('审批已失效')
    const resolver = this.pendingApprovals.get(id) ?? fail('审批对应任务已经结束')
    if (this.runs.get(approval.runId)?.status !== 'waiting_approval') fail('审批对应任务已停止')
    await this.store.write([], [{ collection: 'approvals', id }])
    this.approvals.delete(id); this.pendingApprovals.delete(id); resolver(approved); this.changed(approval.conversationId)
  }
  private async clearApprovals(runId: string) {
    const approvals = [...this.approvals.values()].filter(approval => approval.runId === runId)
    for (const approval of approvals) { this.pendingApprovals.get(approval.id)?.(false); this.pendingApprovals.delete(approval.id); this.approvals.delete(approval.id) }
    await this.store.write([], approvals.map(approval => ({ collection: 'approvals', id: approval.id })))
  }
  private async cancelWhere(matches: (run: AgentRun) => boolean, reason?: string) {
    const affected = new Set<string>()
    for (const run of this.runs.values()) if (!terminal.has(run.status) && matches(run)) {
      this.runControllers.get(run.id)?.abort(new Error(reason ?? '任务已停止')); affected.add(run.conversationId)
      await this.finishRun(run, this.closing ? 'interrupted' : 'cancelled', reason)
      await this.clearApprovals(run.id)
    }
    for (const conversationId of affected) await this.scheduler.cancel(conversationId, reason, this.closing)
  }
  private async cancelEmployee(agentId: string, reason: string, conversationId?: string) {
    await this.cancelWhere(run => run.agentId === agentId && (!conversationId || run.conversationId === conversationId), reason)
    for (const conversation of this.conversations.values()) if (!conversationId || conversation.id === conversationId) {
      for (const work of (await this.works.view(conversation.id)).workItems.filter(work => work.ownerAgentId === agentId)) await this.works.cancelTree(work.id, reason)
    }
    // A completed decision may still hold a speaking candidate after its Run ended.
    for (const conversation of this.conversations.values()) if (conversation.agentIds.includes(agentId) && (!conversationId || conversation.id === conversationId)) await this.scheduler.cancel(conversation.id, reason, this.closing)
  }
  private scheduleWork(conversationId: string) {
    if (this.closing || !this.initialized) return
    void this.serialize(async () => {
      if (this.closing || this.backingUp || this.clearingConversations.has(conversationId)) return
      const timer = this.workTimers.get(conversationId)
      if (timer) clearTimeout(timer)
      this.workTimers.delete(conversationId)
      await this.works.expire(conversationId)
      const view = await this.works.view(conversationId)
      for (const wake of view.workWakes) if (wake.status === 'scheduled' && wake.turnId) {
        const turn = this.scheduler.turns.get(wake.turnId)
        if (turn?.status === 'completed') await this.works.deferWake(wake.id, turn.id)
        else if (turn && ['cancelled', 'interrupted', 'failed', 'budget_exhausted'].includes(turn.status)) await this.works.cancelTree(wake.workId, turn.reason ?? '接续未执行，等待明确的新请求')
      }
      const current = await this.works.view(conversationId), conversation = this.getConversation(conversationId)
      for (const wake of current.workWakes.filter(wake => wake.status === 'pending' && wake.kind !== 'blocked')) {
        const work = current.workItems.find(work => work.id === wake.workId)!
        const owner = this.employees.find(work.ownerAgentId)
        const latest = this.conversationMessages(conversationId).filter(message => message.status === 'completed')
        const trigger = [...latest].reverse().find(message => message.senderType === 'user')
        const visible = trigger && new Set(this.contextMessages(conversation, trigger.id).map(message => message.id))
        if (!owner?.active || !conversation.agentIds.includes(owner.id) || !trigger || !visible?.has(work.sourceMessageId) || !work.resultMessageIds.every(id => visible.has(id))) {
          await this.works.cancelTree(work.id, '接续的负责人或原始上下文权限已失效'); continue
        }
        const prepared = this.scheduler.prepareWork(conversation, trigger, work, wake.id, latest.at(-1)!.sequence)
        if (await this.works.scheduleWake(wake.id, prepared.turn.id, prepared.records)) this.scheduler.accept(prepared)
      }
      const final = await this.works.view(conversationId)
      const budgetIds = new Set(final.workItems.filter(work => ['ready', 'waiting'].includes(work.status)).map(work => work.budgetId))
      const deadlines = final.workBudgets.filter(budget => budgetIds.has(budget.id)).map(budget => Date.parse(budget.deadlineAt))
      if (deadlines.length) {
        const deadline = setTimeout(() => this.scheduleWork(conversationId), Math.max(1, Math.min(...deadlines) - Date.now()))
        deadline.unref(); this.workTimers.set(conversationId, deadline)
      }
      this.changed(conversationId)
    }).catch(error => this.emit({ type: 'runtime-error', error: this.errorMessage(error) }))
  }
  private async cancelWork(conversationId: string, workId: string) {
    const work = (await this.works.view(conversationId)).workItems.find(work => work.id === workId) ?? fail('工作不属于当前会话')
    const ids = new Set(await this.works.cancelTree(work.id, '用户停止此工作及其子工作'))
    for (const run of this.runs.values()) if (run.workId && ids.has(run.workId) && !terminal.has(run.status)) {
      this.runControllers.get(run.id)?.abort(new Error('用户停止此工作'))
      await this.finishRun(run, 'cancelled', '用户停止此工作'); await this.clearApprovals(run.id)
    }
    await this.scheduler.cancelWorks(ids)
    this.changed(conversationId)
  }
  private async cancelConversation(conversationId: string) {
    if (!this.closing) for (const work of (await this.works.view(conversationId)).workItems.filter(work => !work.parentWorkId)) await this.works.cancelTree(work.id, '用户停止本轮讨论')
    await this.scheduler.cancel(conversationId, '用户停止本轮讨论', this.closing)
    await this.cancelWhere(run => run.conversationId === conversationId)
    this.changed(conversationId)
  }

  private async removeResource(id: string) {
    const resource = this.resources.get(id) ?? fail('资源不存在')
    for (const agent of this.employees.values()) if ([...agent.skillIds, ...agent.knowledgeIds].includes(id)) await this.cancelEmployee(agent.id, '绑定资源已撤销')
    await this.cancelWhere(run => run.phase === 'coordination' || this.snapshots.get(run.id)?.resources.some(resource => resource.id === id) === true || [...(this.employees.find(run.agentId)?.skillIds ?? []), ...(this.employees.find(run.agentId)?.knowledgeIds ?? [])].includes(id), '绑定资源已撤销')
    const updates: StoredRecord[] = []
    for (const agent of this.employees.values()) if (agent.skillIds.includes(id) || agent.knowledgeIds.includes(id)) { agent.skillIds = agent.skillIds.filter(value => value !== id); agent.knowledgeIds = agent.knowledgeIds.filter(value => value !== id); agent.configVersion++; updates.push(record('agents', agent)) }
    for (const conversation of this.conversations.values()) if (conversation.sharedKnowledgeIds.includes(id)) { conversation.sharedKnowledgeIds = conversation.sharedKnowledgeIds.filter(value => value !== id); updates.push(record('conversations', conversation)) }
    await this.store.write(updates, [{ collection: 'resources', id }]); for (const update of updates) if (update.collection === 'agents') this.employees.install(update.id, update.value as DigitalAgent); this.resources.delete(id)
    await this.memory.invalidateResources([id])
    const root = resource.ownerAgentId ? resource.path : join(this.dataPath, resource.kind === 'skill' ? 'skills' : 'knowledge', id)
    if (isWithin(this.dataPath, root)) await rm(root, { recursive: true, force: true })
    this.changed()
  }
  private async retry(id: string, requestId: string) {
    const fingerprint = JSON.stringify({ kind: 'retry', id })
    const previous = this.requests.get(requestId)
    if (previous) { if (previous.fingerprint !== fingerprint) fail('requestId 已用于不同请求'); return }
    const original = this.runs.get(id) ?? fail('任务不存在')
    if(original.backend)fail('外部任务不能自动重放，请在单聊中明确发起新任务。')
    if (original.phase === 'memory') fail('记忆整理不支持此重试操作，以免重新执行原用户任务。')
    if (!['failed', 'cancelled', 'interrupted'].includes(original.status)) fail('只能重试失败、停止或中断的任务')
    const conversation = this.getConversation(original.conversationId)
    if (!conversation.agentIds.includes(original.agentId) || !this.getAgent(original.agentId).active) fail('原员工已不在会话中')
    const originalMessage = this.messages.get(original.triggerMessageId) ?? fail('原用户消息不存在')
    const prepared = this.scheduler.prepare({ ...conversation, agentIds: [original.agentId] }, { ...originalMessage, mentionIds: [original.agentId] })
    if (original.workId) prepared.turn.workId = original.workId
    const request: RequestRecord = { id: requestId, fingerprint }
    const records = [...prepared.records, record('requests', request)]
    if (original.workId) await this.works.authorizeRetry(original.workId, original.agentId, records)
    else await this.store.write(records)
    this.requests.set(request.id, request); this.changed(conversation.id); this.scheduler.accept(prepared)
  }
  private redact(value: string, key?: string) { return key ? value.split(key).join('[已隐藏凭据]') : value }
  private errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }

  async backup(destination: string): Promise<void> {
    if (!isAbsolute(destination)) fail('备份目录必须为绝对路径')
    if (isWithin(this.dataPath, destination) || isWithin(destination, this.dataPath)) fail('备份目录不能与应用数据目录相互包含')
    if (this.closing || this.backingUp) fail('服务正在退出或备份')
    this.backingUp = true
    try {
      await this.mutations
      await this.automations.beforeBackup()
      if (this.scheduler.busy || this.runControllers.size || this.externalTests.size) fail('有任务正在执行或等待审批，请先停止任务后备份')
      await mkdir(destination, { recursive: true })
      if ((await readdir(destination)).length) fail('请选择空目录保存备份')
      await this.store.backup(join(destination, 'boai.sqlite'))
      await this.automations.backup(destination)
      const backupClient=createClient({url:pathToFileURL(join(destination,'boai.sqlite')).href});try{await backupClient.execute({sql:'INSERT INTO records(collection,id,value) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value',args:['automationRuntime','installation',JSON.stringify({id:'installation',root:this.dataPath,restorePending:true})]})}finally{backupClient.close()}
      for (const folder of ['skills', 'knowledge', 'workspaces', 'agents', 'external-workspaces']) await cp(join(this.dataPath, folder), join(destination, folder), { recursive: true, dereference: false })
      await writeFile(join(destination, 'backup.json'), JSON.stringify({ format: 'boai-agent-local-backup', version: 2, createdAt: now(), sourceDataPath: this.dataPath, credentialsIncluded: false }, null, 2))
      await writeFile(join(destination, 'data-version.json'), JSON.stringify({ schemaVersion: 2, restoredBackup: true, createdAt: now() }, null, 2))
      await writeFile(join(destination, 'RESTORE.txt'), '退出 BoAI Agent 后，先备份目标应用现有数据，再将 boai.sqlite、data-version.json、skills、knowledge、workspaces、agents、external-workspaces、appearance 和 automation-mastra.sqlite（如存在）复制到目标应用 userData/v2 目录；不要与现有数据库混用。保留 v2 中的 data-version.json 版本标记后再启动新版应用。启动时会自动重定位受管资源、员工目录与产物路径。恢复后定时任务默认暂停，请检查配置后启用。旧备份没有 appearance 时，请先移走目标目录旧 appearance，避免混入旧外观。API Key 与外部登录态未包含在备份中，需重新配置。\n')
    } finally {
      try { await this.automations.afterBackup() } finally { this.backingUp = false; for (const id of this.conversations.keys()) this.scheduleWork(id) }
      // A send acknowledged just before backup acquired the gate may have queued a job.
    }
  }
  async close() {
    if (this.closing) return
    this.closing = true
    for (const timer of this.workTimers.values()) clearTimeout(timer)
    this.workTimers.clear()
    await this.mutations
    await this.automations.close()
    for(const controller of this.externalTests)controller.abort()
    for (const conversationId of this.conversations.keys()) await this.cancelConversation(conversationId)
    // Abort-aware SDK engines settle promptly. Do not hang shutdown on a broken adapter.
    await this.scheduler.close()
    await Promise.allSettled([...this.externalTasks])
    await this.store.close()
  }
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('任务已停止'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
