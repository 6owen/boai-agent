/*
 * [OUTPUT]: 2026-10-11 第13组员工执行来源/本机登录和运行选项沿原产品身份接线；持续原生合同见13组10/11，实际成绩唯一归06 §122。
 * [OUTPUT]: Claude核心与组织/具名团队沿已核对程序及明确API来源接线；新员工保留原运行绑定，发布前重核指纹，自动化门禁暂保留。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 原 Work 持有者、真实用户消息、冻结员工方案、既有 TeamFiles 与 SQLite 发布钩子。
 * [OUTPUT]: 复用联系人/仅缺员准备默认浏览器可用的 Mastra 员工、原请求幂等、员工/独立群/真实 bobo 公告/共享预算启动意图同事务发布；实际退出、保守清理和只读恢复。
 * [POS]: bobo 发起群协作的组织模块；不调用成员模型、不复制私人聊天或材料、不负责群执行调度。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import type { Conversation, DigitalAgent, Message, WorkBudget, WorkItem } from '../../../shared/domain'
import { avatarPresets } from '../../../shared/domain/avatars'
import { boboCollaborationPlanSchema, employeeCandidateQuerySchema, type BoboCollaborationOperation, type BoboCollaborationReceipt, type BoboCollaborationSource, type BoboOrganizationAuthority } from '../../../shared/domain/bobo-collaboration'
import { emptyContactList, type ContactListPreferences } from '../../../shared/domain/contact-list'
import { isCoreAgent, isCoreConversation } from '../../../shared/domain/core-agent'
import { teamColors } from '../../../shared/domain/team-creation'
import type { CollaborationStartIntent } from '../../../shared/domain/work'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import { agentSchema } from '../employees/employee-service'
import { TeamFiles, teamFileLog, type TeamFileCheckpoint, type TeamFileOperation } from '../teams/team-files'
import { resolveEmployeeRuntime } from '../backends/runtime-config'
import { WorkspaceService } from '../workspaces/workspace-service'
import { collaborationReceipt } from './receipt'

const collection = 'boboCollaborations'
const now = () => new Date().toISOString()
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sourceHash = (message: Message) => createHash('sha256').update(message.content).digest('hex')
const opId = (requestId: string) => `bobo-collaboration-${hash(requestId)}`
const record = (value: BoboCollaborationOperation) => ({ collection, id: value.id, value })
const fail = (code: string, message: string): never => { throw new Error(`${code}: ${message}`) }
const identifier = z.string().trim().min(1).max(200)
const operationSchema = z.object({ operationId: identifier }).strict()
const versionSchema = operationSchema.extend({ expectedVersion: z.number().int().positive() }).strict()
const ended = (op: BoboCollaborationOperation) => op.status === 'committed' || op.status === 'cancelled'
type FileView = BoboCollaborationOperation & TeamFileOperation
export interface BoboCollaborationHooks {
  critical<T>(action: () => Promise<T>): Promise<T>
  install(agents: DigitalAgent[], conversation?: Conversation, announcement?: Message): void
  reload(): Promise<void>
  changed(): void
  assertOrganizationHolder(tx: RecordTransaction, authority: BoboOrganizationAuthority): Promise<{ work: WorkItem; budget: WorkBudget }>
  /** The host validates the original model's still-authorized input sources in the publication transaction. */
  validateSource?(tx: RecordTransaction, operation: BoboCollaborationOperation): Promise<void>
  bindGroupStart(tx: RecordTransaction, operation: BoboCollaborationOperation, announcement?: Message): Promise<{ groupRootWorkId: string; startIntentId: string; budgetId: string } | null>
  commitReading(tx: RecordTransaction, announcement: Message): Promise<void>
  checkpoint?: TeamFileCheckpoint<FileView>
}

export class BoboCollaborationService {
  private running = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private readonly files: TeamFiles<FileView>
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly homes: WorkspaceService, private readonly hooks: BoboCollaborationHooks) { this.files = new TeamFiles<FileView>(dataPath, homes, hooks.checkpoint) }
  findEmployees(input: unknown) { return this.store.findBoboEmployeeCandidates(employeeCandidateQuerySchema.parse(input)) }
  private view(operation: BoboCollaborationOperation): FileView { return { ...operation, conversationId: operation.groupConversationId } }
  private async read(tx: RecordTransaction, id: string) { return await tx.get<BoboCollaborationOperation>(collection, id) ?? fail('NOT_FOUND', '组织记录不存在') }
  private async receipt(tx: RecordTransaction, op: BoboCollaborationOperation): Promise<BoboCollaborationReceipt> {
    const receipt = collaborationReceipt(op)
    if (op.startIntentId) receipt.startStatus = (await tx.get<CollaborationStartIntent>('collaborationStarts', op.startIntentId))?.status
    return receipt
  }
  get(input: unknown) { const { operationId } = operationSchema.parse(input); return this.store.transaction(async tx => this.receipt(tx, await this.read(tx, operationId))) }
  lookup(input: unknown) {
    const value = z.object({ requestId: identifier, payloadHash: z.string().length(64).optional() }).strict().parse(input)
    return this.store.transaction(async tx => {
      const op = await tx.get<BoboCollaborationOperation>(collection, opId(value.requestId))
      if (!op) return null
      if (value.payloadHash && value.payloadHash !== op.payloadHash) fail('REQUEST_CONFLICT', '原请求已用于不同组织方案')
      return this.receipt(tx, op)
    })
  }
  list(input: unknown) { const { conversationId } = z.object({ conversationId: identifier }).strict().parse(input); return this.store.listBoboOperations(conversationId) }
  private async validMember(tx: RecordTransaction, id: string, configVersion: number) {
    const agent = await tx.get<DigitalAgent>('agents', id)
    if (!agent || isCoreAgent(agent) || agent.systemRole === 'core' || !agent.active || agent.configVersion !== configVersion || agent.executionBackend?.kind === 'acp-local') return fail('CONFIG_CHANGED', '员工已变化、停用或不能参与群协作，请重新查找')
    const cleanup = await tx.list<{ agentIds: string[] }>('contactDeletions')
    if (cleanup.some(item => item.agentIds.includes(id))) fail('CONFIG_CHANGED', '员工正在清理')
    await resolveEmployeeRuntime(tx, agent)
    return agent
  }
  private async authorize(tx: RecordTransaction, operation: BoboCollaborationOperation, authority = operation.authority) {
    if (operation.sourceCleared || operation.cancelRequested) fail('SOURCE_CHANGED', '原讨论已清理或组织操作已放弃')
    const owner = await this.hooks.assertOrganizationHolder(tx, authority)
    if (authority.workId !== operation.organizationWorkId || authority.sourceConversationId !== operation.sourceConversationId || authority.sourceMessageId !== operation.sourceMessageId || owner.work.organization?.requestId !== operation.requestId || owner.work.organization.mode !== operation.mode || owner.work.organization.goal !== operation.goal || owner.budget.id !== operation.budgetId) fail('SOURCE_CHANGED', '原请求、工作持有者、目标或预算已变化')
    const message = await tx.get<Message>('messages', operation.sourceMessageId)
    if (!message || sourceHash(message) !== operation.sourceMessageHash) fail('SOURCE_CHANGED', '原用户请求已变化')
    const contacts = await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
    if (contacts.revision !== operation.contactRevision) fail('CONFIG_CHANGED', '通讯录已变化，请核对原方案')
    for (const member of operation.existingMembers) {
      const agent = await this.validMember(tx, member.agentId, member.configVersion)
      const fingerprint = operation.existingConnectionFingerprints.find(item => item.agentId === agent.id)?.fingerprint
      if (!fingerprint || (await resolveEmployeeRuntime(tx, agent)).fingerprint !== fingerprint) fail('CONFIG_CHANGED', '既有员工的模型连接已变化')
    }
    const core = await tx.get<DigitalAgent>('agents', 'bobo')
    if (!core || !isCoreAgent(core) || core.configVersion !== authority.agentConfigVersion) fail('CONFIG_CHANGED', 'bobo 的原运行配置已变化')
    const runtime = await resolveEmployeeRuntime(tx, core!)
    if (runtime.connectionId !== operation.connectionId || runtime.modelId !== operation.modelId || runtime.fingerprint !== operation.connectionFingerprint) fail('CONFIG_CHANGED', '原运行配置已变化')
    await this.hooks.validateSource?.(tx, operation)
  }
  async organize(input: unknown, authority: BoboOrganizationAuthority, provenance: { modelCallId?: string; toolCallId: string }, signal?: AbortSignal): Promise<BoboCollaborationReceipt> {
    signal?.throwIfAborted()
    const plan = boboCollaborationPlanSchema.parse(input)
    identifier.parse(provenance.toolCallId)
    if (provenance.modelCallId) identifier.parse(provenance.modelCallId)
    const result = await this.hooks.critical(() => this.store.transaction(async tx => {
      const owner = await this.hooks.assertOrganizationHolder(tx, authority), organization = owner.work.organization ?? fail('UNAUTHORIZED', '没有原组织请求')
      if (organization.requestId !== `bobo-collaboration:${authority.sourceMessageId}`) fail('UNAUTHORIZED', '组织身份必须来自真实原用户消息')
      if (organization.mode === 'employee_creation') {
        if (!plan.newEmployees.length || plan.existingMembers.length || plan.groupTitle || plan.announcement) fail('VALIDATION', '仅创建员工不允许群、已有成员或开场消息')
      } else if (!plan.groupTitle || !plan.announcement) fail('VALIDATION', '群协作须有群名和 bobo 的真实目标/分工说明')
      const payloadHash = hash({ mode: organization.mode, goal: organization.goal, plan }), id = opId(organization.requestId)
      const old = await tx.get<BoboCollaborationOperation>(collection, id)
      if (old) {
        if (old.payloadHash !== payloadHash) fail('REQUEST_CONFLICT', '原请求已用于不同组织方案，不能重复创建')
        if (old.sourceCleared || old.status === 'cancelled') fail('SOURCE_CHANGED', '原请求已清理或放弃，不能重新执行')
        return { operation: old, start: false }
      }
      const source = await tx.get<Message>('messages', authority.sourceMessageId), sourceConversation = await tx.get<Conversation>('conversations', authority.sourceConversationId), core = await tx.get<DigitalAgent>('agents', 'bobo')
      if (!source || source.senderType !== 'user' || source.senderId !== 'user' || source.origin || source.status !== 'completed' || source.conversationId !== authority.sourceConversationId || !sourceConversation || !isCoreConversation(sourceConversation) || !core || !isCoreAgent(core)) fail('UNAUTHORIZED', '缺少本人在原 bobo 讨论中的真实请求')
      const model = await resolveEmployeeRuntime(tx, core!), createdAt = now()
      const existingMembers = [] as BoboCollaborationOperation['existingMembers'], existingConnectionFingerprints: BoboCollaborationOperation['existingConnectionFingerprints'] = []
      for (const member of plan.existingMembers) {
        const agent = await this.validMember(tx, member.agentId, member.configVersion)
        existingMembers.push({ ...member, name: agent.name, role: agent.role.slice(0, 1000) })
        existingConnectionFingerprints.push({ agentId: agent.id, fingerprint: (await resolveEmployeeRuntime(tx, agent)).fingerprint })
      }
      const creationSource: BoboCollaborationSource = { kind: 'bobo-collaboration', operationId: id, requestId: organization.requestId }
      const agents: DigitalAgent[] = plan.newEmployees.map((member, index) => {
        const agentId = randomUUID(), definition = agentSchema.parse({ ...member, color: member.color ?? teamColors[index % teamColors.length], avatar: { kind: 'preset', id: avatarPresets[index % avatarPresets.length].id }, executionBackend: model.executionBackend, nativeOptions: model.nativeOptions, connectionId: model.connectionId, modelId: model.modelId, skillIds: [], knowledgeIds: [], allowBrowser: model.executionBackend.kind === 'mastra-model', allowCommands: false, active: true })
        return { ...definition, id: agentId, configVersion: 1, workspaceRef: `agents/${agentId}/workspace`, memoryNamespace: `employee:${agentId}`, policyVersion: 2, creationSource }
      })
      const groupConversationId = organization.mode === 'employee_creation' ? undefined : randomUUID()
      const conversation: Conversation | undefined = groupConversationId ? { id: groupConversationId, kind: 'group', title: plan.groupTitle!, agentIds: ['bobo', ...existingMembers.map(member => member.agentId), ...agents.map(agent => agent.id)], mode: 'natural', workspacePath: join(this.dataPath, 'workspaces', groupConversationId), sharedKnowledgeIds: [], configVersion: 1, createdAt, updatedAt: createdAt, creationSource, teamSetup: { purpose: organization.goal.slice(0, 1000), collaborationGuide: plan.announcement!.slice(0, 2000), scenarioKind: 'work' } } : undefined
      const announcement: Message | undefined = groupConversationId ? { id: randomUUID(), conversationId: groupConversationId, senderType: 'agent', senderId: 'bobo', senderName: core!.name, content: plan.announcement!, status: 'completed', sequence: 1, createdAt, collaborationRequestId: organization.requestId, collaborationSource: { operationId: id, sourceRunId: authority.runId, modelCallId: provenance.modelCallId, toolCallId: provenance.toolCallId } } : undefined
      if (conversation && announcement) { conversation.lastMessageAt = createdAt; conversation.lastMessagePreview = announcement.content.slice(0, 120) }
      const contacts = await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
      const operation: BoboCollaborationOperation = { id, schemaVersion: 1, requestId: organization.requestId, payloadHash, version: 1, organizationWorkId: authority.workId, sourceConversationId: authority.sourceConversationId, sourceMessageId: authority.sourceMessageId, sourceMessageHash: sourceHash(source!), mode: organization.mode, goal: organization.goal, budgetId: owner.budget.id, contactRevision: contacts.revision, authority: { ...authority }, existingMembers, existingConnectionFingerprints, agents, ...(model.executionBackend.kind !== 'mastra-model' ? { executionBackend: model.executionBackend } : {}), connectionId: model.connectionId, modelId: model.modelId, connectionFingerprint: model.fingerprint, groupConversationId, conversation, announcement, announcementSource: { ...provenance, runId: authority.runId }, status: 'accepted', createdAt, files: [], directories: [] }
      Object.assign(operation, teamFileLog(this.view(operation), this.homes))
      await this.authorize(tx, operation); signal?.throwIfAborted(); await tx.put(record(operation))
      return { operation, start: true }
    }))
    if (result.start) this.start(result.operation.id, result.operation.version)
    this.hooks.changed()
    return this.waitForCompletion(result.operation.id, signal)
  }
  private start(id: string, version: number) {
    if (this.running.has(id)) return
    const controller = new AbortController()
    const task = Promise.resolve().then(() => this.execute(id, version, controller.signal)).catch(error => this.fail(id, undefined, error)).finally(() => { this.running.delete(id); this.hooks.changed() })
    this.running.set(id, { controller, task })
  }
  async waitForCompletion(id: string, signal?: AbortSignal) {
    identifier.parse(id)
    let cancellation: Promise<unknown> | undefined, cancellationError: unknown
    const cancel = () => { cancellation ??= this.cancelCurrent(id).catch(error => { cancellationError = error }) }
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel()
    try { await this.running.get(id)?.task; await cancellation; if (cancellationError) throw cancellationError; return await this.get({ operationId: id }) }
    finally { signal?.removeEventListener('abort', cancel) }
  }
  private async claim(id: string, version: number) {
    return this.store.transaction(async tx => {
      const op = await this.read(tx, id)
      if (op.version !== version || ended(op) || op.cancelRequested) fail('VERSION_CONFLICT', '原组织操作已变化或结束')
      await this.authorize(tx, op)
      op.status = 'preparing'; op.attemptId = randomUUID(); op.version++; delete op.error
      await tx.put(record(op)); return op
    })
  }
  private persist(operation: BoboCollaborationOperation) {
    return this.store.transaction(async tx => {
      const current = await this.read(tx, operation.id)
      if (current.attemptId !== operation.attemptId || current.cancelRequested || ended(current)) fail('CANCELLED', '组织操作已停止或执行权已变化')
      operation.version = current.version + 1; await tx.put(record(operation))
    })
  }
  private async execute(id: string, version: number, signal: AbortSignal) {
    const op = await this.hooks.critical(() => this.claim(id, version)), view = this.view(op)
    try {
      await this.files.prepare(view, signal, () => this.persist(op))
      op.status = 'ready_to_commit'; await this.persist(op)
      await this.hooks.checkpoint?.('before-commit', this.view(op)); signal.throwIfAborted()
      await this.hooks.critical(async () => {
        signal.throwIfAborted(); await this.files.inspect(this.view(op), true)
        const committed = await this.store.transaction(async tx => {
          const current = await this.read(tx, id)
          if (current.attemptId !== op.attemptId || current.cancelRequested || current.status !== 'ready_to_commit') fail('CANCELLED', '组织操作不能发布')
          await this.authorize(tx, current); signal.throwIfAborted()
          for (const agent of current.agents) { if (await tx.get('agents', agent.id)) fail('FILES_CONFLICT', '新员工身份已占用'); await tx.put({ collection: 'agents', id: agent.id, value: agent }) }
          if (current.conversation) { if (await tx.get('conversations', current.conversation.id)) fail('FILES_CONFLICT', '新群身份已占用'); await tx.put({ collection: 'conversations', id: current.conversation.id, value: current.conversation }) }
          if (current.announcement) { if (await tx.get('messages', current.announcement.id)) fail('FILES_CONFLICT', '公告身份已占用'); await tx.put({ collection: 'messages', id: current.announcement.id, value: current.announcement }) }
          const binding = await this.hooks.bindGroupStart(tx, current, current.announcement)
          if (current.mode === 'organize_and_execute' && (!binding || binding.budgetId !== current.budgetId)) fail('BUDGET_CHANGED', '群任务没有绑定原始预算')
          if (current.mode !== 'organize_and_execute' && binding) fail('UNAUTHORIZED', '当前请求没有授权启动群任务')
          if (binding) { current.groupRootWorkId = binding.groupRootWorkId; current.startIntentId = binding.startIntentId }
          const contacts = await tx.get<ContactListPreferences>('contactList', 'contacts') ?? emptyContactList()
          contacts.agentOrder.push(...current.agents.map(agent => agent.id)); if (current.groupConversationId) contacts.groupOrder.push(current.groupConversationId)
          contacts.revision++; await tx.put({ collection: 'contactList', id: 'contacts', value: contacts })
          current.status = 'committed'; current.committedAt = now(); current.version++; await tx.put(record(current))
          if (current.announcement) await this.hooks.commitReading(tx, current.announcement)
          signal.throwIfAborted(); return current
        })
        try { await this.hooks.checkpoint?.('after-commit', this.view(committed)); this.hooks.install(committed.agents, committed.conversation, committed.announcement) } catch { await this.hooks.reload() }
      })
    } catch (error) { await this.fail(id, op.attemptId, error) }
  }
  private async fail(id: string, attemptId: string | undefined, error: unknown) {
    await this.store.transaction(async tx => {
      const op = await this.read(tx, id)
      if (ended(op) || op.cancelRequested || (attemptId && op.attemptId !== attemptId)) return
      op.status = 'needs_attention'; op.error = (error instanceof Error ? error.message : 'INITIALIZATION_FAILED: 文件准备失败').slice(0, 1000); op.version++
      await tx.put(record(op))
    })
  }
  /** Internal, read-only file audit for the host's explicit recovery holder transaction. Never an IPC response. */
  async auditOperation(input: unknown): Promise<BoboCollaborationOperation> {
    const value = versionSchema.parse(input), op = await this.store.transaction(tx => this.read(tx, value.operationId))
    if (ended(op) || op.sourceCleared) fail('SOURCE_CHANGED', '原组织操作已结束或来源已清理')
    if (this.running.has(op.id) || op.version !== value.expectedVersion || op.cancelRequested) fail('VERSION_CONFLICT', '请读取最新状态；正在退出或已放弃的操作不能继续')
    await this.files.inspect(this.view(op))
    return op
  }
  async resume(input: unknown, authority?: BoboOrganizationAuthority, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const value = versionSchema.parse(input)
    const receipt = await this.get({ operationId: value.operationId })
    if (receipt.status === 'committed' || receipt.status === 'cancelled') return receipt
    const op = await this.auditOperation(value)
    const holder = authority ?? fail('ACTIVE_HOLDER_REQUIRED', '原操作仅完成文件核对；继续发布需要原工作新的有效执行权，不会自动调用模型')
    await this.store.transaction(async tx => {
      const current = await this.read(tx, op.id)
      if (current.version !== value.expectedVersion) fail('VERSION_CONFLICT', '原操作版本已变化')
      await this.authorize(tx, current, holder)
      signal?.throwIfAborted()
      current.authority = { ...holder }
      current.version++; await tx.put(record(current)); op.version = current.version
    })
    this.start(op.id, op.version); this.hooks.changed(); return this.waitForCompletion(op.id, signal)
  }
  private async cancelCurrent(id: string, criticalHeld = false) {
    const op = await this.store.transaction(async tx => {
      const current = await this.read(tx, id)
      if (!ended(current)) { current.cancelRequested = true; current.version++; await tx.put(record(current)) }
      return current
    })
    return this.abandon({ operationId: id, expectedVersion: op.version }, criticalHeld)
  }
  async abandon(input: unknown, criticalHeld = false) {
    const value = versionSchema.parse(input)
    const accepted = await this.store.transaction(async tx => {
      const op = await this.read(tx, value.operationId)
      if (ended(op)) return op
      if (op.version !== value.expectedVersion) fail('VERSION_CONFLICT', '组织操作已变化，请重新读取')
      op.cancelRequested = true; op.version++; await tx.put(record(op)); return op
    })
    if (ended(accepted)) return this.get({ operationId: accepted.id })
    const running = this.running.get(accepted.id); running?.controller.abort(); await running?.task
    const cleanup = async () => {
      const op = await this.store.transaction(tx => this.read(tx, accepted.id))
      try {
        await this.store.transaction(async tx => {
          for (const agent of op.agents) if (await tx.get('agents', agent.id)) fail('FILES_CONFLICT', '新员工目录已有已发布引用')
          if (op.groupConversationId && await tx.get('conversations', op.groupConversationId)) fail('FILES_CONFLICT', '新群目录已有已发布引用')
        })
        await this.files.cleanup(this.view(op))
        await this.store.transaction(async tx => {
          const current = await this.read(tx, op.id)
          if (!current.cancelRequested || current.status === 'committed') fail('VERSION_CONFLICT', '操作不能清理')
          current.status = 'cancelled'; current.goal = ''; current.agents = []; current.existingMembers = []; current.existingConnectionFingerprints = []; current.files = []; current.directories = []; current.sourceMessageHash = ''; delete current.conversation; delete current.announcement; delete current.error; current.version++
          await tx.put(record(current))
        })
      } catch (error) {
        await this.store.transaction(async tx => { const current = await this.read(tx, op.id); current.status = 'needs_attention'; current.error = `CLEANUP_REQUIRED: ${error instanceof Error ? error.message : '清理未完成'}`.slice(0, 1000); current.version++; await tx.put(record(current)) }); throw error
      } finally { this.hooks.changed() }
    }
    if (criticalHeld) await cleanup(); else await this.hooks.critical(cleanup)
    return this.get({ operationId: accepted.id })
  }
  async recover() {
    for (const op of await this.store.load<BoboCollaborationOperation>(collection)) {
      if (ended(op)) continue
      let error: string | undefined
      try { await this.files.inspect(this.view(op)) } catch (e) { error = e instanceof Error ? e.message : 'FILES_CONFLICT' }
      await this.store.transaction(async tx => { const current = await this.read(tx, op.id); if (ended(current)) return; current.status = error || current.cancelRequested ? 'needs_attention' : 'interrupted'; current.error = error ?? (current.cancelRequested ? 'CLEANUP_REQUIRED: 等待明确完成清理' : '组织准备已中断；不会自动发布或执行'); delete current.attemptId; current.version++; await tx.put(record(current)) })
    }
  }
  async assertBackup() { if ((await this.store.load<BoboCollaborationOperation>(collection)).some(op => !ended(op))) fail('CLEANUP_REQUIRED', '请先完成或放弃未结束的协作组织，再备份') }
  async clearSource(conversationId: string, options: { criticalHeld?: boolean } = {}) {
    const operations = (await this.store.load<BoboCollaborationOperation>(collection)).filter(op => op.sourceConversationId === conversationId && !op.sourceCleared)
    if (options.criticalHeld && operations.some(op => this.running.has(op.id))) fail('ACTUAL_EXIT_REQUIRED', '组织文件准备仍在执行或退出，请先停止并等待实际结束')
    for (const op of operations) if (!ended(op)) await this.cancelCurrent(op.id, options.criticalHeld)
    await this.store.transaction(async tx => {
      for (const old of operations) {
        const op = await this.read(tx, old.id)
        if (!ended(op)) fail('CLEANUP_REQUIRED', '原讨论仍有未结束的文件准备')
        op.sourceCleared = true; op.goal = ''; op.sourceMessageHash = ''; op.files = []; op.directories = []; op.existingMembers = []; op.existingConnectionFingerprints = []; op.agents = op.agents.map(agent => ({ ...agent, instructions: '', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], workspaceRef: undefined })); delete op.error; op.version++; await tx.put(record(op))
      }
    })
  }
  async clearGroup(conversationId: string, options: { criticalHeld?: boolean } = {}) {
    const operations = (await this.store.load<BoboCollaborationOperation>(collection)).filter(op => op.groupConversationId === conversationId)
    if (options.criticalHeld && operations.some(op => this.running.has(op.id))) fail('ACTUAL_EXIT_REQUIRED', '组织文件准备仍在执行或退出，请先等待实际结束')
    for (const op of operations) if (!ended(op)) await this.cancelCurrent(op.id, options.criticalHeld)
    await this.store.transaction(async tx => { for (const op of await tx.list<BoboCollaborationOperation>(collection)) if (op.groupConversationId === conversationId && !op.groupCleared) { op.groupCleared = true; delete op.conversation; if (op.announcement) op.announcement.content = ''; op.version++; await tx.put(record(op)) } })
  }
  async close() { for (const running of this.running.values()) running.controller.abort(); await Promise.allSettled([...this.running.values()].map(item => item.task)) }
}
