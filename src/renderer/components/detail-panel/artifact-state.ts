/*
 * [OUTPUT]: 通用运行时插件参与成果修订候选与真实执行停止，原来源核验保持。
 * [OUTPUT]: 文件修改允许纯本机Claude；显式Claude API沿共享协议/凭据/模型校验，缺失profile和混合Codex/API绑定不作为可选员工。
 * [OUTPUT]: 本机Codex可在原聊天被明确选为修订员工，宿主受理时核对连接与原版；旧ACP不开放。
 * [INPUT]: 成果修订/采用/显式待验收 DTO、实际员工/连接、详情页面与逻辑家族身份、持久未决请求和只读回执结果。
 * [OUTPUT]: 明确修订员工可执行状态与核心空配置默认连接；修订回执严格绑定原请求/本人/正文与指定员工；按主页面隔离的稳定未决身份与白名单恢复，重启统一 unknown；聊天可核对旧待处理页的原未决请求，不覆盖同成果的另一请求；待验收冻结明确版本/hash，未知只能核对，确认未提交后才原载荷重试或放弃。
 * [POS]: 聊天成果与只读详情共用的纯请求状态；不存正文预览、不读文件、不提交 IPC 或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { ARTIFACT_LIMITS, type ArtifactAcceptanceInput, type ArtifactAcceptanceReceipt, type ArtifactAdoptionInput, type ArtifactAdoptionReceipt, type ArtifactRevisionInput } from '@shared/domain/artifacts'
import type { Connection, DigitalAgent, Message } from '@shared/domain'
import { isCoreAgent } from '@shared/domain/core-agent'
import { isNativeBackend } from '@shared/domain/backends'
import { claudeProvider } from '@shared/domain/claude-provider'

export type ArtifactRequest<T> = { input: T; status: 'pending' | 'unknown' | 'not_accepted' }
export interface ArtifactPending {
  scope: string
  conversationId: string
  logicalArtifactId: string
  revision?: ArtifactRequest<ArtifactRevisionInput>
  adoption?: ArtifactRequest<ArtifactAdoptionInput>
  acceptance?: ArtifactRequest<ArtifactAcceptanceInput>
}
export type ArtifactPendingMap = Record<string, ArtifactPending>
export const ARTIFACT_PENDING_KEY = 'boai:artifacts:pending-requests'
export function artifactPendingKey(scope: string, conversationId: string, logicalArtifactId: string) { return JSON.stringify([scope, conversationId, logicalArtifactId]) }
/** Retired-page requests keep their original identity and become reachable from the source chat. */
export function artifactPendingScope(values: ArtifactPendingMap, scope: string, conversationId: string, logicalArtifactId: string) {
  if (scope === 'conversations' && !values[artifactPendingKey(scope, conversationId, logicalArtifactId)] && values[artifactPendingKey('inbox', conversationId, logicalArtifactId)]) return 'inbox'
  return scope
}
export function updateArtifactPending(previous: ArtifactPendingMap, key: string, value?: ArtifactPending): ArtifactPendingMap {
  const next = { ...previous }; if (value?.revision || value?.adoption || value?.acceptance) next[key] = value; else delete next[key]
  return next
}
export function artifactRevisionTarget(agent: DigitalAgent | undefined, connections: Connection[]): { connection: Connection; modelId: string } | { backend: 'codex-local' | 'claude-local' | 'runtime-plugin' } | undefined {
  if (!agent?.active || agent.executionBackend?.kind === 'acp-local') return
  if (isNativeBackend(agent.executionBackend)) {
    if (!agent.executionBackend.profileId.trim()) return
    if (agent.connectionId) {
      if (agent.executionBackend.kind !== 'claude-local') return
      try { claudeProvider(connections.find(value => value.id === agent.connectionId), agent.modelId) } catch { return }
    }
    return { backend: agent.executionBackend.kind }
  }
  const ready = (connection: Connection, modelId: string) => Boolean(modelId.trim() && (connection.provider === 'openai-compatible' ? connection.baseUrl.trim() : connection.hasApiKey))
  const connection = agent.connectionId ? connections.find(value => value.id === agent.connectionId) : isCoreAgent(agent) ? connections.find(value => ready(value, value.defaultModel)) : undefined
  const modelId = connection && (agent.modelId || connection.defaultModel)
  return connection && modelId && ready(connection, modelId) ? { connection, modelId } : undefined
}
export function artifactRequestAction(request?: Pick<ArtifactRequest<unknown>, 'status'>): 'new' | 'wait' | 'lookup' | 'submit' {
  return !request ? 'new' : request.status === 'pending' ? 'wait' : request.status === 'unknown' ? 'lookup' : 'submit'
}
export function artifactReceiptResult<T>(request: ArtifactRequest<T>, found: boolean): ArtifactRequest<T> | undefined {
  return found ? undefined : { ...request, status: 'not_accepted' }
}
export function artifactAdoptionReceiptMatches(input: ArtifactAdoptionInput, receipt: ArtifactAdoptionReceipt, conversationId: string, logicalArtifactId: string) {
  return receipt.id === input.requestId && receipt.conversationId === conversationId && receipt.logicalArtifactId === logicalArtifactId && receipt.artifactId === input.artifactId && receipt.contentHash === input.contentHash && receipt.userId === 'user' && receipt.adoptionRevision === input.expectedAdoptionRevision + 1
}
export function artifactRevisionReceiptMatches(input: ArtifactRevisionInput, receipt: Message) {
  return receipt.conversationId === input.conversationId && receipt.artifactRevisionRequestId === input.requestId && receipt.senderType === 'user' && receipt.senderId === 'user' && !receipt.origin && receipt.status === 'completed' && receipt.content === input.content && receipt.mentionIds?.length === 1 && receipt.mentionIds[0] === input.targetAgentId
}
export function artifactAcceptanceReceiptMatches(input: ArtifactAcceptanceInput, receipt: ArtifactAcceptanceReceipt, conversationId: string) {
  const acceptance = receipt.acceptance
  return receipt.id === input.requestId && receipt.conversationId === conversationId && receipt.acceptanceId === input.artifactId && acceptance.id === input.artifactId && acceptance.conversationId === conversationId && acceptance.artifactId === input.artifactId && acceptance.logicalArtifactId === input.logicalArtifactId && acceptance.contentVersion === input.contentVersion && acceptance.contentHash === input.contentHash && acceptance.userId === 'user'
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function restoredRequest<T>(value: unknown, input: (value: unknown) => T | undefined): ArtifactRequest<T> | undefined {
  if (!object(value) || !['pending', 'unknown', 'not_accepted'].includes(String(value.status))) return
  const restored = input(value.input)
  return restored ? { input: restored, status: 'unknown' } : undefined
}
export function restoreArtifactPending(value: unknown): ArtifactPendingMap {
  if (!object(value)) return {}
  const result: ArtifactPendingMap = {}
  for (const [key, saved] of Object.entries(value)) {
    if (!object(saved) || !identity(saved.scope) || !identity(saved.conversationId) || !identity(saved.logicalArtifactId) || key !== artifactPendingKey(saved.scope, saved.conversationId, saved.logicalArtifactId)) continue
    const conversationId = saved.conversationId, logicalArtifactId = saved.logicalArtifactId
    const revision = restoredRequest(saved.revision, input => {
      if (!object(input) || input.conversationId !== conversationId || !identity(input.artifactId) || !hash(input.contentHash) || !identity(input.targetAgentId) || !identity(input.requestId) || typeof input.content !== 'string' || !input.content.trim() || input.content.length > ARTIFACT_LIMITS.revisionCharacters) return
      return { conversationId, artifactId: input.artifactId, contentHash: input.contentHash, targetAgentId: input.targetAgentId, content: input.content, requestId: input.requestId }
    })
    const adoption = restoredRequest(saved.adoption, input => {
      if (!object(input) || !identity(input.artifactId) || !hash(input.contentHash) || !identity(input.requestId) || !Number.isSafeInteger(input.expectedAdoptionRevision) || Number(input.expectedAdoptionRevision) < 0) return
      return { artifactId: input.artifactId, contentHash: input.contentHash, expectedAdoptionRevision: Number(input.expectedAdoptionRevision), requestId: input.requestId }
    })
    const acceptance = restoredRequest(saved.acceptance, input => {
      if (!object(input) || !identity(input.artifactId) || input.logicalArtifactId !== logicalArtifactId || !hash(input.contentHash) || !identity(input.requestId) || !Number.isSafeInteger(input.contentVersion) || Number(input.contentVersion) < 1 || !Number.isSafeInteger(input.expectedAcceptanceRevision) || Number(input.expectedAcceptanceRevision) < 0) return
      return { artifactId: input.artifactId, logicalArtifactId, contentVersion: Number(input.contentVersion), contentHash: input.contentHash, expectedAcceptanceRevision: Number(input.expectedAcceptanceRevision), requestId: input.requestId }
    })
    if (revision || adoption || acceptance) result[key] = { scope: saved.scope, conversationId, logicalArtifactId: saved.logicalArtifactId, revision, adoption, acceptance }
  }
  return result
}
