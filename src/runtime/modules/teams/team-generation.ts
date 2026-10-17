/*
 * [OUTPUT]: 活动团队生成按connectionId取消并等待实际planner退出，连接换源/删除不采用迟到方案。
 * [OUTPUT]: 无Run的连接测试/团队规划/自动化草稿沿原操作身份保存逐请求网关路由；不制造Work或更改原预算。
 * [INPUT]: 团队草稿事务、同连接容量、一次模型适配器与密钥读取。
 * [OUTPUT]: 宿主填充权威能力说明；幂等生成、两次调用上限/绝对期限、逐调用用量、取消/迟到/重启隔离。
 * [POS]: 内置助手用例；不创建员工、会话或 Work。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Connection } from '../../../shared/domain'
import { avatarPresets } from '../../../shared/domain/avatars'
import { TEAM_LIMITS, TEAM_PLANNER_VERSION, teamCapabilityNotes, teamColors, teamId, teamPlannerOutputSchema, type TeamDraft, type TeamGeneration } from '../../../shared/domain/team-creation'
import { TeamPlanFormatError, type TeamPlanner, type TeamUsage } from '../../adapters/mastra/team-planner'
import { gatewayModelCall } from '../../adapters/mastra/gateway-route'
import type { GatewayRouteEvidence } from '../../../shared/domain/model-gateway'
import { ModelCapacity } from '../collaboration/model-capacity'
import { TeamRepository, editableTeamDraft, readTeamDraft, resolveTeamModel, teamError, teamHash, teamInputHash, teamNow, teamRecord, teamVersionSchema, validateTeamDraft } from './team-repository'

const requestSchema = teamVersionSchema.extend({ requestId: teamId }).strict()
export class TeamGenerationService {
  private running = new Map<string, { connectionId: string; controller: AbortController; task: Promise<void> }>()
  constructor(private readonly repo: TeamRepository, private readonly capacity: ModelCapacity, private readonly planner: TeamPlanner, private readonly hooks: { key(id: string): Promise<string | undefined>; changed(): void }) {}
  async generate(input: unknown) {
    const request = requestSchema.parse(input), requestHash = teamHash(request)
    const accepted = await this.repo.store.transaction(async tx => {
      const existing = (await tx.list<TeamGeneration>('teamGenerations')).find(value => value.requestId === request.requestId)
      if (existing) { if (existing.requestHash !== requestHash) teamError('REQUEST_CONFLICT', '请求身份已用于另一份输入'); return { generation: existing } }
      const draft = await readTeamDraft(tx, request.draftId); editableTeamDraft(draft, request.expectedVersion)
      if (draft.generationStatus === 'running' || [...this.running.values()].some(value => !value.controller.signal.aborted) && this.running.has(draft.generationId ?? '')) teamError('DRAFT_CONFLICT', '方案正在生成')
      if (draft.generationId && this.running.has(draft.generationId)) teamError('DRAFT_CONFLICT', '上次生成仍在退出，请稍后重试')
      if (!draft.prompt) teamError('VALIDATION', '请先填写团队需求')
      const connection = await tx.get<Connection>('connections', draft.selectedConnectionId), model = resolveTeamModel(connection, draft.selectedModelId)
      draft.resolvedModelId = model.modelId; draft.connectionFingerprint = model.fingerprint
      draft.version++; draft.generationId = randomUUID(); draft.generationStatus = 'running'; draft.updatedAt = teamNow()
      const generation: TeamGeneration = { id: draft.generationId, requestId: request.requestId, requestHash, draftId: draft.id, draftVersion: draft.version, inputHash: teamInputHash(draft), plannerVersion: TEAM_PLANNER_VERSION, schemaVersion: 1, connectionId: draft.selectedConnectionId, modelId: model.modelId, connectionFingerprint: model.fingerprint, status: 'running', deadline: new Date(Date.now() + TEAM_LIMITS.deadlineMs).toISOString(), startedAt: teamNow(), attempts: [] }
      await tx.put(teamRecord('teamDrafts', draft)); await tx.put(teamRecord('teamGenerations', generation)); return { generation, draft, connection: connection! }
    })
    if (accepted.draft && accepted.connection) {
      const controller = new AbortController()
      const task = Promise.resolve().then(() => this.execute(accepted.generation, accepted.draft!, accepted.connection!, controller)).finally(() => { this.running.delete(accepted.generation.id); this.hooks.changed() })
      this.running.set(accepted.generation.id, { connectionId: accepted.connection.id, controller, task })
    }
    this.hooks.changed(); return accepted.generation
  }
  private async attempt(id: string, phase: 'initial' | 'repair', connection: Connection) {
    return this.repo.store.transaction(async tx => {
      const value = (await tx.get<TeamGeneration>('teamGenerations', id))!
      if (value.status !== 'running' || Date.now() >= Date.parse(value.deadline) || value.attempts.length >= TEAM_LIMITS.attempts) teamError('GENERATION_FAILED', '生成已停止或预算已用尽')
      const callId = randomUUID(), modelCall = gatewayModelCall(connection, callId, 'team-plan', value.modelId)
      value.attempts.push({ callId, phase, status: 'running', usage: 'unknown', ...(modelCall ? { modelCall } : {}) }); await tx.put(teamRecord('teamGenerations', value)); return callId
    })
  }
  private async route(id: string, callId: string, evidence: GatewayRouteEvidence) {
    await this.repo.store.transaction(async tx => {
      const value = await tx.get<TeamGeneration>('teamGenerations', id), attempt = value?.attempts.find(item => item.callId === callId)
      if (value?.status !== 'running' || attempt?.status !== 'running' || !attempt.modelCall || attempt.modelCall.route) return
      attempt.modelCall.route = structuredClone(evidence); await tx.put(teamRecord('teamGenerations', value))
    })
  }
  private async settle(id: string, callId: string, usage?: TeamUsage, status?: 'succeeded' | 'failed') {
    await this.repo.store.transaction(async tx => {
      const value = (await tx.get<TeamGeneration>('teamGenerations', id))!, attempt = value.attempts.find(item => item.callId === callId)!
      if (usage !== undefined) attempt.usage = usage
      if (status) attempt.status = status
      await tx.put(teamRecord('teamGenerations', value))
    })
  }
  private async finish(generation: TeamGeneration, status: TeamGeneration['status'], output?: unknown, error?: string) {
    await this.repo.store.transaction(async tx => {
      const value = (await tx.get<TeamGeneration>('teamGenerations', generation.id))!
      if (value.status !== 'running') return
      const draft = await readTeamDraft(tx, generation.draftId)
      if (draft.version !== generation.draftVersion || draft.generationId !== generation.id || teamInputHash(draft) !== generation.inputHash) { value.status = 'interrupted'; value.error = '草稿已变化，过期结果未采用' }
      else {
        value.status = status; value.error = error; draft.generationStatus = status
        if (output) {
          const result = teamPlannerOutputSchema.parse(output)
          if (result.kind === 'needs_adjustment') value.adjustment = { reason: result.reason, suggestedPrompt: result.suggestedPrompt }
          else {
            draft.plan = { ...result, capabilityNotes: teamCapabilityNotes(result.scenarioKind), plannerVersion: TEAM_PLANNER_VERSION, generationId: generation.id, members: result.members.map((member, index) => ({ ...member, memberKey: randomUUID(), avatarId: avatarPresets[index % avatarPresets.length].id, color: teamColors[index % teamColors.length] })) }
            draft.planInputHash = generation.inputHash; draft.manuallyEdited = false
            if (!draft.groupTitle) draft.groupTitle = result.name
          }
        }
        draft.version++; draft.updatedAt = teamNow(); validateTeamDraft(draft); await tx.put(teamRecord('teamDrafts', draft))
      }
      value.finishedAt = teamNow(); await tx.put(teamRecord('teamGenerations', value))
    })
    this.hooks.changed()
  }
  private async execute(generation: TeamGeneration, draft: TeamDraft, connection: Connection, controller: AbortController) {
    const timer = setTimeout(() => { controller.abort(); void this.finish(generation, 'failed', undefined, '生成超时，请明确重试') }, Math.max(0, Date.parse(generation.deadline) - Date.now()))
    try {
      let repair: string | undefined
      for (let index = 0; index < TEAM_LIMITS.attempts; index++) {
        controller.signal.throwIfAborted()
        try {
          const result = await this.capacity.run(connection.id, controller.signal, async () => {
            const callId = await this.attempt(generation.id, index ? 'repair' : 'initial', connection)
            try {
              const output = await this.planner({ connection, modelId: generation.modelId, apiKey: await this.hooks.key(connection.id) ?? '', prompt: draft.prompt, repair, signal: controller.signal, modelCallId: callId, onModelCallRoute: (id, evidence) => this.route(generation.id, id, evidence), usage: usage => this.settle(generation.id, callId, usage) })
              const parsed = teamPlannerOutputSchema.safeParse(output)
              if (!parsed.success) throw new TeamPlanFormatError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 1000))
              await this.settle(generation.id, callId, undefined, 'succeeded'); return parsed.data
            } catch (error) { await this.settle(generation.id, callId, undefined, 'failed'); throw error }
          })
          controller.signal.throwIfAborted()
          await this.finish(generation, result.kind === 'plan' ? 'succeeded' : 'needs_adjustment', result); return
        } catch (error) {
          if (!(error instanceof TeamPlanFormatError) || index + 1 >= TEAM_LIMITS.attempts) throw error
          repair = error.message
        }
      }
    } catch { await this.finish(generation, 'failed', undefined, controller.signal.aborted ? '生成已停止或超时' : '生成失败，请检查模型连接或重新生成方案') }
    finally { clearTimeout(timer) }
  }
  async cancel(input: unknown, status: 'cancelled' | 'interrupted' = 'cancelled') {
    const { generationId } = z.object({ generationId: teamId }).strict().parse(input)
    const generation = (await this.repo.store.load<TeamGeneration>('teamGenerations')).find(item => item.id === generationId) ?? teamError('VALIDATION', '生成记录不存在')
    await this.finish(generation, status, undefined, status === 'cancelled' ? '已停止生成' : '应用退出，生成已中断')
    this.running.get(generationId)?.controller.abort()
  }
  async abandon(input: unknown) {
    const value = teamVersionSchema.parse(input), view = await this.repo.get({ draftId: value.draftId })
    editableTeamDraft(view.draft, value.expectedVersion)
    const running = view.draft.generationId ? this.running.get(view.draft.generationId) : undefined
    if (view.draft.generationStatus === 'running') {
      await this.cancel({ generationId: view.draft.generationId! })
      // The cancel transaction advances the version once; unrelated edits remain conflicts.
      value.expectedVersion++
    }
    await running?.task
    return this.repo.abandon(value)
  }
  get busy() { return this.running.size > 0 }
  async cancelConnection(connectionId: string) {
    const pending = [...this.running].filter(([, value]) => value.connectionId === connectionId)
    for (const [generationId] of pending) await this.cancel({ generationId })
    await Promise.allSettled(pending.map(([, value]) => value.task))
  }
  async close() {
    for (const id of this.running.keys()) await this.cancel({ generationId: id }, 'interrupted')
    await Promise.allSettled([...this.running.values()].map(value => value.task))
  }
}
