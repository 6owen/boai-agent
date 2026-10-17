/*
 * [OUTPUT]: Magpie网关协议/认证及revision进入模型来源指纹，旧直连hash语义保持。
 * [OUTPUT]: 团队允许插件原生默认模型，成员仍按独立员工身份和配置创建。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 严格草稿输入、公开模型配置和 ProductStore 事务。
 * [OUTPUT]: 用户可读校验错误、可编辑方案与不可覆写的能力事实；单未结束草稿、版本比较、宿主 hash、只读恢复与取消墓碑。
 * [POS]: 团队创建 SQLite 权威状态；不在事务内调用模型或文件系统。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Connection } from '../../../shared/domain'
import { teamCapabilityNotes, teamEditableSchema, teamId, type TeamDraft, type TeamDraftView, type TeamCreationOperation, type TeamGeneration } from '../../../shared/domain/team-creation'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'

export const teamHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const teamNow = () => new Date().toISOString()
export const teamError = (code: string, message: string): never => { throw new Error(`${code}: ${message}`) }
export const teamRecord = (collection: string, value: { id: string }) => ({ collection, id: value.id, value })
export const teamVersionSchema = z.object({ draftId: teamId, expectedVersion: z.number().int().positive() }).strict()
export const teamSaveSchema = teamVersionSchema.extend({ editableFields: teamEditableSchema }).strict()
export function resolveTeamModel(connection: Connection | undefined, selectedModelId: string) {
  if (!connection) return teamError('MODEL_UNAVAILABLE', '请选择已有模型连接')
  const modelId = selectedModelId || connection.defaultModel.trim()
  if (!modelId) return teamError('MODEL_UNAVAILABLE', '请先配置有效模型')
  return { modelId, fingerprint: teamHash({ id: connection.id, provider: connection.provider, baseUrl: connection.baseUrl, api: connection.api ?? 'chat', ...(connection.gateway ? { gateway: connection.gateway, revision: connection.revision } : {}), defaultModel: connection.defaultModel, modelId }) }
}
export const teamInputHash = (draft: TeamDraft) => teamHash({ ...(draft.executionBackend ? { executionBackend: draft.executionBackend } : {}), prompt: draft.prompt, connectionId: draft.selectedConnectionId, modelId: draft.resolvedModelId, fingerprint: draft.connectionFingerprint })
export function validateTeamDraft(draft: TeamDraft) {
  draft.validationErrors = []
  if (!draft.prompt) draft.validationErrors.push('请描述团队需求')
  if (!draft.resolvedModelId && !(['codex-local','claude-local','runtime-plugin'].includes(draft.executionBackend?.kind ?? '') && draft.connectionFingerprint)) draft.validationErrors.push('请选择有效模型连接')
  if (!draft.plan) draft.validationErrors.push('请先生成方案')
  if (draft.plan && draft.planInputHash !== teamInputHash(draft)) draft.validationErrors.push('需求或模型已变化，请重新生成方案')
  if (draft.createGroup && draft.plan && !draft.groupTitle) draft.validationErrors.push('请填写群名称')
  draft.planHash = draft.plan && !draft.validationErrors.length ? teamHash({ ...(draft.executionBackend ? { executionBackend: draft.executionBackend } : {}), plan: draft.plan, connectionId: draft.selectedConnectionId, modelId: draft.resolvedModelId, fingerprint: draft.connectionFingerprint, createGroup: draft.createGroup, groupTitle: draft.createGroup ? draft.groupTitle : '' }) : undefined
}
export async function readTeamDraft(tx: RecordTransaction, id: string) {
  return await tx.get<TeamDraft>('teamDrafts', id) ?? teamError('VALIDATION', '团队草稿不存在')
}
export function editableTeamDraft(draft: TeamDraft, version: number) {
  if (draft.version !== version) teamError('DRAFT_CONFLICT', '草稿已在其他窗口更新；请保留本地修改并重新读取')
  if (draft.status !== 'open' || draft.creationOperationId) teamError('DRAFT_CONFLICT', '草稿已结束或已受理创建，不能再修改')
}

export class TeamRepository {
  constructor(readonly store: ProductStore) {}
  async open(input: unknown) {
    const value = z.object({ draftId: teamId.optional() }).strict().optional().parse(input)
    return this.store.transaction(async tx => {
      if (value?.draftId) return readTeamDraft(tx, value.draftId)
      const drafts = await tx.list<TeamDraft>('teamDrafts'), existing = drafts.find(draft => draft.status === 'open')
      if (existing) return existing
      const draft: TeamDraft = { id: randomUUID(), schemaVersion: 1, version: 1, createdAt: teamNow(), updatedAt: teamNow(), status: 'open', prompt: '', selectedConnectionId: '', selectedModelId: '', createGroup: true, groupTitle: '', generationStatus: 'idle', manuallyEdited: false, validationErrors: [] }
      const connections = await tx.list<Connection>('connections')
      if (connections.length === 1) draft.selectedConnectionId = connections[0].id
      validateTeamDraft(draft)
      await tx.put(teamRecord('teamDrafts', draft)); return draft
    })
  }
  async save(input: unknown) {
    const parsed = teamSaveSchema.safeParse(input)
    if (!parsed.success) teamError('VALIDATION', parsed.error.issues.map(issue => issue.message).join('；'))
    const value = parsed.data!
    return this.store.transaction(async tx => {
      const draft = await readTeamDraft(tx, value.draftId); editableTeamDraft(draft, value.expectedVersion)
      if (draft.generationStatus === 'running') teamError('DRAFT_CONFLICT', '请先停止生成，再编辑草稿')
      if (value.editableFields.plan && (!draft.plan || value.editableFields.plan.plannerVersion !== draft.plan.plannerVersion || value.editableFields.plan.generationId !== draft.plan.generationId || value.editableFields.plan.members.some(member => member.memberKey && !draft.plan!.members.some(old => old.memberKey === member.memberKey)))) teamError('VALIDATION', '方案或成员身份不属于本草稿')
      const previous = draft.plan
      Object.assign(draft, value.editableFields)
      if (value.editableFields.plan) {
        draft.plan = { ...value.editableFields.plan, capabilityNotes: teamCapabilityNotes(value.editableFields.plan.scenarioKind), members: value.editableFields.plan.members.map(member => ({ ...member, memberKey: member.memberKey ?? randomUUID() })) }
        if (new Set(draft.plan.members.map(member => member.memberKey)).size !== draft.plan.members.length) teamError('VALIDATION', '成员身份不能重复')
      }
      if (draft.selectedConnectionId) {
        const connection = await tx.get<Connection>('connections', draft.selectedConnectionId)
        if (connection) { const resolved = resolveTeamModel(connection, draft.selectedModelId); draft.resolvedModelId = resolved.modelId; draft.connectionFingerprint = resolved.fingerprint }
        else { draft.resolvedModelId = undefined; draft.connectionFingerprint = undefined }
      } else { draft.resolvedModelId = undefined; draft.connectionFingerprint = undefined }
      if (draft.plan && teamHash(previous) !== teamHash(draft.plan)) draft.manuallyEdited = true
      draft.version++; draft.updatedAt = teamNow(); validateTeamDraft(draft)
      await tx.put(teamRecord('teamDrafts', draft)); return draft
    })
  }
  async get(input: unknown): Promise<TeamDraftView> {
    const { draftId } = z.object({ draftId: teamId }).strict().parse(input)
    return this.store.transaction(async tx => {
      const draft = await readTeamDraft(tx, draftId)
      return { draft, generation: draft.generationId ? await tx.get<TeamGeneration>('teamGenerations', draft.generationId) : undefined, operation: draft.creationOperationId ? await tx.get<TeamCreationOperation>('teamCreations', draft.creationOperationId) : undefined }
    })
  }
  async recovery() {
    return this.store.transaction(async tx => ({ drafts: (await tx.list<TeamDraft>('teamDrafts')).filter(d => d.status !== 'cancelled'), operations: (await tx.list<TeamCreationOperation>('teamCreations')).filter(o => o.status !== 'cancelled') }))
  }
  async abandon(input: unknown) {
    const value = teamVersionSchema.parse(input)
    return this.store.transaction(async tx => {
      const draft = await readTeamDraft(tx, value.draftId); editableTeamDraft(draft, value.expectedVersion)
      if (draft.generationStatus === 'running') teamError('DRAFT_CONFLICT', '请先停止生成')
      for (const generation of await tx.list<TeamGeneration>('teamGenerations')) if (generation.draftId === draft.id) {
        delete generation.adjustment; delete generation.error; await tx.put(teamRecord('teamGenerations', generation))
      }
      const tombstone: TeamDraft = { id: draft.id, schemaVersion: 1, version: draft.version + 1, createdAt: draft.createdAt, updatedAt: teamNow(), status: 'cancelled', prompt: '', selectedConnectionId: '', selectedModelId: '', createGroup: true, groupTitle: '', generationStatus: 'cancelled', manuallyEdited: false, validationErrors: [] }
      await tx.put(teamRecord('teamDrafts', tombstone)); return tombstone
    })
  }
  async recover() {
    await this.store.transaction(async tx => {
      for (const generation of await tx.list<TeamGeneration>('teamGenerations')) if (generation.status === 'running') {
        generation.status = 'interrupted'; generation.finishedAt = teamNow(); generation.error = '生成已中断，请明确重新生成'
        for (const attempt of generation.attempts) if (attempt.status === 'running') { attempt.status = 'interrupted'; attempt.usage = 'unknown' }
        await tx.put(teamRecord('teamGenerations', generation))
        const draft = await readTeamDraft(tx, generation.draftId)
        if (draft.generationId === generation.id) { draft.generationStatus = 'interrupted'; draft.version++; await tx.put(teamRecord('teamDrafts', draft)) }
      }
    })
  }
}
