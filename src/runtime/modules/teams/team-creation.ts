/*
 * [INPUT]: 已验证兼容方案或核心 Agent 的严格团队方案、文件准备器、SQLite、通讯录分类事务与宿主生命周期/批量安装回调。
 * [OUTPUT]: 核心 Agent 按稳定请求身份独立受理、默认命名建群；认领和最终发布进入宿主临界区、文件准备允许及时持久停止；原子冻结 ID，员工/群/同名分类和回执同事务发布；实际退出等待、明确恢复/取消、文件冲突和备份门禁。
 * [POS]: 团队原子发布用例；内部准备记录不承载产品草稿，不调用成员模型、不发送消息或创建 Work。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import type { Connection, Conversation, DigitalAgent } from '../../../shared/domain'
import { avatarPresets } from '../../../shared/domain/avatars'
import { TEAM_PLANNER_VERSION, teamCapabilityNotes, teamColors, teamId, teamModelPlanSchema, teamPlanSchema, type TeamCreationOperation, type TeamDraft, type TeamGeneration } from '../../../shared/domain/team-creation'
import { agentSchema } from '../employees/employee-service'
import { createTeamContactCategory } from '../employees/contact-list'
import { WorkspaceService } from '../workspaces/workspace-service'
import { TeamFiles, teamFileLog, type TeamFileCheckpoint } from './team-files'
import { TeamRepository, editableTeamDraft, readTeamDraft, resolveTeamModel, teamError, teamHash, teamInputHash, teamNow, teamRecord, teamVersionSchema, validateTeamDraft } from './team-repository'
import type { RecordTransaction } from '../../adapters/storage/product-store'

const acceptSchema = teamVersionSchema.extend({ planHash: z.string().length(64), requestId: teamId }).strict()
const agentPlanSchema = z.object({ plan: teamModelPlanSchema, connectionId: teamId, modelId: z.string().trim().max(300), requestId: teamId }).strict()
const operationSchema = z.object({ operationId: teamId }).strict()
export class TeamCreationService {
  private running = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private readonly files: TeamFiles
  constructor(private readonly repo: TeamRepository, private readonly dataPath: string, private readonly homes: WorkspaceService, private readonly hooks: {
    critical<T>(action: () => Promise<T>): Promise<T>
    install(agents: DigitalAgent[], conversation?: Conversation): void
    reload(): Promise<void>
    changed(): void
    checkpoint?: TeamFileCheckpoint
  }) { this.files = new TeamFiles(dataPath, homes, hooks.checkpoint) }
  async get(input: unknown) {
    const { operationId } = operationSchema.parse(input)
    return this.repo.store.transaction(tx => this.read(tx, operationId))
  }
  private async read(tx: RecordTransaction, id: string) { return await tx.get<TeamCreationOperation>('teamCreations', id) ?? teamError('VALIDATION', '创建记录不存在') }
  private async config(tx: RecordTransaction, operation: Pick<TeamCreationOperation, 'connectionId' | 'modelId' | 'connectionFingerprint'>) {
    const connection = await tx.get<Connection>('connections', operation.connectionId)
    const resolved = resolveTeamModel(connection, operation.modelId)
    if (resolved.fingerprint !== operation.connectionFingerprint) teamError('CONFIG_CHANGED', '模型配置已变化，请恢复原配置后继续，或放弃并重新生成')
  }
  async accept(input: unknown) {
    const request = acceptSchema.parse(input), requestHash = teamHash(request)
    const result = await this.repo.store.transaction(async tx => {
      const old = (await tx.list<TeamCreationOperation>('teamCreations')).find(value => value.requestId === request.requestId)
      if (old) { if (old.requestHash !== requestHash) teamError('REQUEST_CONFLICT', '请求身份已用于不同版本或内容'); return { operation: old, start: false } }
      const draft = await readTeamDraft(tx, request.draftId)
      editableTeamDraft(draft, request.expectedVersion)
      if (draft.generationStatus === 'running') teamError('DRAFT_CONFLICT', '请等待方案生成结束')
      validateTeamDraft(draft)
      if (!draft.planHash || draft.planHash !== request.planHash) teamError('DRAFT_CONFLICT', '方案未通过校验或已变化，请保存后确认')
      return { operation: await this.freeze(tx, draft, request.requestId, requestHash), start: true }
    })
    if (result.start) this.start(result.operation.id, result.operation.version)
    this.hooks.changed(); return result.operation
  }
  async acceptAgentPlan(input: unknown) {
    const request = agentPlanSchema.parse(input), requestHash = teamHash({ source: 'core-agent', ...request })
    const result = await this.repo.store.transaction(async tx => {
      const old = (await tx.list<TeamCreationOperation>('teamCreations')).find(value => value.requestId === request.requestId)
      if (old) { if (old.requestHash !== requestHash) teamError('REQUEST_CONFLICT', '请求身份已用于不同团队方案'); return { operation: old, start: false } }
      const connection = await tx.get<Connection>('connections', request.connectionId), model = resolveTeamModel(connection, request.modelId)
      const now = teamNow(), generationId = randomUUID()
      const draft: TeamDraft = {
        id: randomUUID(), schemaVersion: 1, version: 1, createdAt: now, updatedAt: now, status: 'open',
        prompt: request.plan.purpose, selectedConnectionId: request.connectionId, selectedModelId: request.modelId,
        resolvedModelId: model.modelId, connectionFingerprint: model.fingerprint, createGroup: true, groupTitle: request.plan.name,
        generationId, generationStatus: 'succeeded', manuallyEdited: false, validationErrors: [],
        plan: { ...request.plan, capabilityNotes: teamCapabilityNotes(request.plan.scenarioKind), plannerVersion: TEAM_PLANNER_VERSION, generationId,
          members: request.plan.members.map((member, index) => ({ ...member, memberKey: randomUUID(), avatarId: avatarPresets[index % avatarPresets.length].id, color: teamColors[index % teamColors.length] })) },
      }
      draft.planInputHash = teamInputHash(draft); validateTeamDraft(draft)
      return { operation: await this.freeze(tx, draft, request.requestId, requestHash), start: true }
    })
    if (result.start) this.start(result.operation.id, result.operation.version)
    this.hooks.changed(); return result.operation
  }
  private async freeze(tx: RecordTransaction, draft: TeamDraft, requestId: string, requestHash: string) {
    const plan = teamPlanSchema.parse(draft.plan), id = randomUUID(), createdAt = teamNow()
    const memberIds = plan.members.map(member => ({ memberKey: member.memberKey, agentId: randomUUID() }))
    const agents: DigitalAgent[] = plan.members.map((member, index) => {
      const agentId = memberIds[index].agentId
      const definition = agentSchema.parse({ name: member.name, role: member.role, instructions: member.instructions, color: member.color, avatar: { kind: 'preset', id: member.avatarId }, executionBackend: { kind: 'mastra-model' }, connectionId: draft.selectedConnectionId, modelId: draft.resolvedModelId!, skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
      return { ...definition, id: agentId, configVersion: 1, workspaceRef: `agents/${agentId}/workspace`, memoryNamespace: `employee:${agentId}`, policyVersion: 2, creationSource: { kind: 'team-planner', operationId: id, memberKey: member.memberKey, plannerVersion: plan.plannerVersion } }
    })
    const conversationId = draft.createGroup ? randomUUID() : undefined
    const conversation: Conversation | undefined = conversationId ? { id: conversationId, kind: 'group', title: draft.groupTitle, agentIds: agents.map(agent => agent.id), mode: 'natural', workspacePath: join(this.dataPath, 'workspaces', conversationId), sharedKnowledgeIds: [], configVersion: 1, createdAt, updatedAt: createdAt, creationSource: { kind: 'team-planner', operationId: id, plannerVersion: plan.plannerVersion }, teamSetup: { purpose: plan.purpose, collaborationGuide: plan.collaborationGuide, scenarioKind: plan.scenarioKind } } : undefined
    const operation: TeamCreationOperation = { id, requestId, requestHash, draftId: draft.id, acceptedDraftVersion: draft.version, payloadHash: draft.planHash!, version: 1, status: 'accepted', createdAt, connectionId: draft.selectedConnectionId, modelId: draft.resolvedModelId!, connectionFingerprint: draft.connectionFingerprint!, agents, conversation, memberIds, conversationId, files: [], directories: [] }
    await this.config(tx, operation)
    Object.assign(operation, teamFileLog(operation, this.homes))
    draft.creationOperationId = operation.id; draft.version++; draft.updatedAt = teamNow()
    await tx.put(teamRecord('teamCreations', operation)); await tx.put(teamRecord('teamDrafts', draft)); return operation
  }
  async waitForCompletion(operationId: string, signal?: AbortSignal) {
    const id = teamId.parse(operationId)
    const running = this.running.get(id)
    let cancellation: Promise<void> | undefined, cancellationError: unknown
    const cancel = () => {
      if (cancellation) return
      running?.controller.abort()
      cancellation = (async () => {
        const operation = await this.get({ operationId: id })
        if (['committed', 'cancelled'].includes(operation.status)) return
        const { draft } = await this.repo.get({ draftId: operation.draftId })
        await this.abandon({ draftId: draft.id, expectedVersion: draft.version })
      })().catch(error => { cancellationError = error })
    }
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    try {
      await running?.task
      const completed = await this.get({ operationId: id })
      signal?.removeEventListener('abort', cancel)
      await cancellation
      if (cancellationError) throw cancellationError
      return cancellation ? await this.get({ operationId: id }) : completed
    } finally { signal?.removeEventListener('abort', cancel) }
  }
  private start(id: string, version: number) {
    const controller = new AbortController()
    const task = Promise.resolve().then(() => this.execute(id, version, controller.signal))
      .catch(async error => { await this.fail(id, undefined, error, version) })
      .finally(() => { this.running.delete(id); this.hooks.changed() })
    this.running.set(id, { controller, task })
  }
  private async claim(id: string, version: number) {
    return this.repo.store.transaction(async tx => {
      const operation = await this.read(tx, id)
      if (operation.version !== version || operation.cancelRequested || !['accepted', 'interrupted', 'needs_attention'].includes(operation.status)) teamError('DRAFT_CONFLICT', '操作状态已变化，请重新读取')
      await this.config(tx, operation)
      operation.attemptId = randomUUID(); operation.status = 'preparing'; operation.error = undefined; operation.version++
      await tx.put(teamRecord('teamCreations', operation)); return operation
    })
  }
  private async persist(operation: TeamCreationOperation) {
    await this.repo.store.transaction(async tx => {
      const current = await this.read(tx, operation.id)
      if (current.attemptId !== operation.attemptId || current.cancelRequested || !['preparing', 'ready_to_commit'].includes(current.status)) teamError('DRAFT_CONFLICT', '创建执行权已失效')
      operation.version = current.version + 1; await tx.put(teamRecord('teamCreations', operation))
    })
  }
  private async execute(id: string, version: number, signal: AbortSignal) {
    const operation = await this.hooks.critical(() => this.claim(id, version))
    try {
      await this.files.prepare(operation, signal, () => this.persist(operation))
      operation.status = 'ready_to_commit'; await this.persist(operation)
      await this.hooks.checkpoint?.('before-commit', operation); signal.throwIfAborted()
      await this.hooks.critical(async () => {
        signal.throwIfAborted()
        await this.files.inspect(operation, true)
        await this.repo.store.transaction(async tx => {
          signal.throwIfAborted()
          const current = await this.read(tx, id)
          if (current.attemptId !== operation.attemptId || current.cancelRequested || current.status !== 'ready_to_commit') teamError('DRAFT_CONFLICT', '创建已停止或执行权已变化')
          await this.config(tx, current)
          for (const agent of current.agents) { if (await tx.get('agents', agent.id)) teamError('FILES_CONFLICT', '员工身份已被占用'); await tx.put(teamRecord('agents', agent)) }
          if (current.conversation) { if (await tx.get('conversations', current.conversation.id)) teamError('FILES_CONFLICT', '群聊身份已被占用'); await tx.put(teamRecord('conversations', current.conversation)) }
          current.status = 'committed'; current.committedAt = teamNow(); current.version++
          const draft = await readTeamDraft(tx, current.draftId)
          await createTeamContactCategory(tx, current.id, draft.plan!.name, current.memberIds.map(member => member.agentId))
          draft.status = 'committed'; draft.version++; draft.updatedAt = teamNow()
          await tx.put(teamRecord('teamDrafts', draft)); await tx.put(teamRecord('teamCreations', current))
          signal.throwIfAborted()
        })
        try { await this.hooks.checkpoint?.('after-commit', operation); this.hooks.install(operation.agents, operation.conversation) }
        catch { await this.hooks.reload() }
      })
    } catch (error) { await this.fail(id, operation.attemptId, error) }
  }
  private async fail(id: string, attemptId: string | undefined, error: unknown, expectedVersion?: number) {
    await this.repo.store.transaction(async tx => {
      const operation = await this.read(tx, id)
      if (expectedVersion !== undefined && operation.version !== expectedVersion) return
      if (['committed', 'cancelled'].includes(operation.status) || (attemptId && operation.attemptId !== attemptId) || operation.cancelRequested) return
      operation.status = 'needs_attention'; operation.error = error instanceof Error ? error.message : 'INITIALIZATION_FAILED: 文件准备失败'; operation.version++
      await tx.put(teamRecord('teamCreations', operation))
    })
  }
  async resume(input: unknown) {
    const value = operationSchema.extend({ expectedVersion: z.number().int().positive() }).strict().parse(input), operation = await this.get({ operationId: value.operationId })
    if (operation.status === 'committed') return operation
    if (this.running.has(operation.id)) teamError('DRAFT_CONFLICT', '创建仍在执行或退出')
    if (operation.version !== value.expectedVersion || operation.cancelRequested) teamError('DRAFT_CONFLICT', '请读取最新状态，已放弃的操作只能继续清理')
    this.start(operation.id, value.expectedVersion); return operation
  }
  async abandon(input: unknown) {
    const value = teamVersionSchema.parse(input)
    const accepted = await this.repo.store.transaction(async tx => {
      const draft = await readTeamDraft(tx, value.draftId)
      if (!draft.creationOperationId) return undefined
      const operation = await this.read(tx, draft.creationOperationId)
      if (operation.status === 'committed' || operation.status === 'cancelled') return { draft, operation }
      if (draft.version !== value.expectedVersion) teamError('DRAFT_CONFLICT', '草稿版本已变化')
      operation.cancelRequested = true; operation.version++
      await tx.put(teamRecord('teamCreations', operation)); return { draft, operation }
    })
    if (!accepted) return this.repo.abandon(input)
    if (accepted.operation.status === 'committed' || accepted.operation.status === 'cancelled') return accepted.draft
    const running = this.running.get(accepted.operation.id); running?.controller.abort(); await running?.task
    return this.hooks.critical(async () => {
      const operation = await this.get({ operationId: accepted.operation.id })
      try {
        for (const id of operation.memberIds.map(value => value.agentId)) if (await this.repo.store.transaction(tx => tx.get('agents', id))) teamError('FILES_CONFLICT', '目录仍被已发布员工引用')
        if (operation.conversationId && await this.repo.store.transaction(tx => tx.get('conversations', operation.conversationId!))) teamError('FILES_CONFLICT', '目录仍被群聊引用')
        await this.files.cleanup(operation)
        await this.repo.store.transaction(async tx => {
          const current = await this.read(tx, operation.id)
          if (current.status === 'committed' || !current.cancelRequested) teamError('DRAFT_CONFLICT', '操作不能清理')
          current.status = 'cancelled'; current.agents = []; delete current.conversation; current.files = []; current.directories = []; delete current.error; current.version++
          await tx.put(teamRecord('teamCreations', current))
          const draft = await readTeamDraft(tx, current.draftId)
          Object.assign(draft, { prompt: '', selectedConnectionId: '', selectedModelId: '', groupTitle: '', status: 'cancelled', generationStatus: 'cancelled', validationErrors: [], version: draft.version + 1 })
          delete draft.plan; delete draft.planHash; delete draft.planInputHash
          await tx.put(teamRecord('teamDrafts', draft))
          for (const generation of await tx.list<TeamGeneration>('teamGenerations')) if (generation.draftId === draft.id) { delete generation.adjustment; delete generation.error; await tx.put(teamRecord('teamGenerations', generation)) }
        })
      } catch (error) {
        await this.repo.store.transaction(async tx => { const current = await this.read(tx, operation.id); current.status = 'needs_attention'; current.error = `CLEANUP_REQUIRED: ${error instanceof Error ? error.message : '清理未完成'}`; current.version++; await tx.put(teamRecord('teamCreations', current)) })
        throw error
      } finally { this.hooks.changed() }
      return (await this.repo.get({ draftId: value.draftId })).draft
    })
  }
  async recover() {
    for (const operation of await this.repo.store.load<TeamCreationOperation>('teamCreations')) {
      if (['committed', 'cancelled'].includes(operation.status)) continue
      let error: string | undefined
      try { await this.files.inspect(operation) } catch (e) { error = e instanceof Error ? e.message : 'FILES_CONFLICT' }
      await this.repo.store.transaction(async tx => {
        const current = await this.read(tx, operation.id)
        current.status = error || current.cancelRequested ? 'needs_attention' : 'interrupted'; current.error = error ?? (current.cancelRequested ? 'CLEANUP_REQUIRED: 放弃后清理未完成' : '创建中断，尚未发布；请明确继续或放弃')
        current.attemptId = undefined; current.version++; await tx.put(teamRecord('teamCreations', current))
      })
    }
  }
  async assertBackup() {
    if ((await this.repo.store.load<TeamCreationOperation>('teamCreations')).some(value => !['committed', 'cancelled'].includes(value.status))) teamError('CLEANUP_REQUIRED', '请先完成或放弃未结束的团队创建，再备份')
  }
  async close() { for (const value of this.running.values()) value.controller.abort(); await Promise.allSettled([...this.running.values()].map(value => value.task)) }
}
