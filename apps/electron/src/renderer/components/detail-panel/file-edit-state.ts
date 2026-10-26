/*
 * [OUTPUT]: 选区结果恢复和交付切换共用精确原件身份比较，防止跨文件/hash/材料代际串入结果。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道文件固定来源不变，执行会话独立；结果按真实执行会话/请求读取。
 * [OUTPUT]: 精确固定来源关联交付入口；本次请求真实执行完成后才允许自动查看单一修订产物。
 * [INPUT]: 固定成果/附件身份、文件内明确修改要求及宿主原消息回执。
 * [OUTPUT]: 文件独立请求白名单、严格回执匹配和重启unknown；不保存文件正文或修改聊天草稿。
 * [POS]: 文件侧边编辑的纯请求合同。
 * [PROTOCOL]: 修改时同步Header和所属.folder.md。
 */
import { z } from 'zod'
import type { Artifact, ConversationDetail, Message } from '@boai/shared/domain'
import type { ArtifactVersion } from '@boai/shared/domain/artifacts'
import type { ConversationMaterial } from '@boai/shared/domain/materials'
import { artifactRevisionReceiptMatches } from './artifact-state'

const id = z.string().min(1).max(256), hash = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artifact'), id, conversationId: id, logicalArtifactId: id, contentHash: hash, contentVersion: z.number().int().positive(), name: z.string().min(1).max(500), ownerAgentId: id.optional() }).strict(),
  z.object({ kind: z.literal('material'), id, conversationId: id, revision: z.number().int().positive(), contentHash: hash, parseVersion: z.enum(['text-v1', 'binary-v1']), name: z.string().min(1).max(500) }).strict(),
])
const requestSchema = z.object({ id, executionConversationId: id.optional(), source: sourceSchema, agentId: id, content: z.string().min(1).max(12_000), createdAt: z.string().datetime(), status: z.enum(['pending', 'unknown', 'not_accepted', 'accepted']), messageId: id.optional() }).strict()
export type FileEditSource = z.infer<typeof sourceSchema>
export type FileEditRequest = z.infer<typeof requestSchema>
export const FILE_EDIT_STORAGE = 'boai:file-edit-requests:v1:'
export const fileEditKey = (source: FileEditSource) => JSON.stringify([source.conversationId, source.kind, source.kind === 'artifact' ? source.logicalArtifactId : source.id])
export const artifactEditSource = (artifact: ArtifactVersion): FileEditSource => ({ kind: 'artifact', id: artifact.id, conversationId: artifact.conversationId, logicalArtifactId: artifact.logicalArtifactId, contentHash: artifact.contentHash, contentVersion: artifact.contentVersion, name: artifact.name, ...(artifact.ownerAgentId ? { ownerAgentId: artifact.ownerAgentId } : {}) })
export const materialEditSource = (material: ConversationMaterial): FileEditSource | undefined => material.contentHash && material.messageId ? { kind: 'material', id: material.id, conversationId: material.conversationId, revision: material.revision, contentHash: material.contentHash, parseVersion: material.parseVersion, name: material.name } : undefined
export function restoreFileEdits(value: unknown, key: string): FileEditRequest[] {
  const parsed = z.object({ version: z.literal(1), requests: z.array(requestSchema).max(100) }).strict().parse(value)
  if (new Set(parsed.requests.map(request => request.id)).size !== parsed.requests.length || parsed.requests.some(request => fileEditKey(request.source) !== key || request.status === 'accepted' && !request.messageId)) throw new Error('文件修改记录身份不一致，请保留记录并核对。')
  return parsed.requests.map(request => request.status === 'accepted' ? request : { ...request, status: 'unknown' })
}
export function revisionInput(request: FileEditRequest) {
  return { conversationId: request.executionConversationId ?? request.source.conversationId, artifactId: request.source.id, contentHash: request.source.contentHash, targetAgentId: request.agentId, content: request.content, requestId: request.id }
}
export function materialEditInput(request: FileEditRequest) {
  if (request.source.kind !== 'material') throw new Error('原请求不是附件修改')
  const { id, conversationId, revision, contentHash, parseVersion } = request.source
  return { conversationId: request.executionConversationId ?? conversationId, requestId: request.id, content: request.content, mentionIds: [request.agentId], materialReference: { id, conversationId, revision, contentHash, parseVersion } }
}
export function fileEditReceiptMatches(request: FileEditRequest, receipt: Message) {
  if (request.source.kind === 'artifact') return artifactRevisionReceiptMatches(revisionInput(request), receipt)
  const ref = materialEditInput(request).materialReference, actual = receipt.materialReference
  return receipt.conversationId === (request.executionConversationId ?? ref.conversationId) && receipt.senderId === 'user' && receipt.senderType === 'user' && receipt.status === 'completed' && !receipt.origin && !receipt.channel && !receipt.artifactRevisionRequestId && receipt.content === request.content && receipt.mentionIds?.length === 1 && receipt.mentionIds[0] === request.agentId && actual?.id === ref.id && actual.conversationId === ref.conversationId && actual.revision === ref.revision && actual.contentHash === ref.contentHash && actual.parseVersion === ref.parseVersion
}
/** Join real results by request message/work/run identity; never by filename, employee, or time. */
export function fileEditResults(detail: ConversationDetail, requests: FileEditRequest[]) {
  return requests.filter(request => request.messageId && (request.executionConversationId ?? request.source.conversationId) === detail.conversation.id).map(request => {
    const works = (detail.workItems ?? []).filter(work => work.sourceMessageId === request.messageId)
    const workIds = new Set(works.map(work => work.id))
    const runs = detail.runs.filter(run => run.triggerMessageId === request.messageId || run.workId && workIds.has(run.workId))
    const runIds = new Set(runs.map(run => run.id))
    // Private decisions/memory and unpublished task drafts have no public message.
    const publicRuns = runs.filter(run => (!run.phase || run.phase === 'execution') && (run.status === 'completed' || run.responseKind === 'chat' && !run.backend))
    const messageIds = [...new Set([...publicRuns.map(run => run.messageId), ...works.flatMap(work => work.resultMessageIds)])]
    const artifacts: Artifact[] = detail.artifacts.filter(artifact => artifact.revisionRequestId === request.id || artifact.sourceWorkId && workIds.has(artifact.sourceWorkId) || artifact.runId && runIds.has(artifact.runId))
    return { request, works, runs, messageIds, artifacts }
  })
}

/** Published output from this exact source; closing the selection toolbar does not hide delivery. */
export function latestFileEditArtifact(results: ReturnType<typeof fileEditResults>, source?: FileEditSource): Artifact | undefined {
  if (!source) return
  for (const result of [...results].reverse()) {
    if (!sameFileEditSource(result.request.source, source) || result.request.status !== 'accepted') continue
    const artifact = [...result.artifacts].reverse().find(artifact => artifact.id !== source.id && artifact.contentHash && artifact.logicalArtifactId && artifact.contentVersion && ['ready', 'unsupported'].includes(artifact.contentStatus ?? ''))
    if (artifact) return artifact
  }
}

export function sameFileEditSource(first: FileEditSource, second: FileEditSource) {
  return first.kind === second.kind && first.id === second.id && first.conversationId === second.conversationId && first.contentHash === second.contentHash && (first.kind === 'artifact' && second.kind === 'artifact' ? first.logicalArtifactId === second.logicalArtifactId && first.contentVersion === second.contentVersion : first.kind === 'material' && second.kind === 'material' && first.revision === second.revision && first.parseVersion === second.parseVersion)
}

/** Completion follows the explicit request, never unrelated deliveries or restored history. */
export function completedFileEditArtifact(results: ReturnType<typeof fileEditResults>, source: FileEditSource | undefined, requestId: string | undefined): Artifact | undefined {
  if (!source || !requestId) return
  const result = results.find(result => result.request.id === requestId && result.request.status === 'accepted' && sameFileEditSource(result.request.source, source))
  if (!result) return
  const execution = result.runs.filter(run => run.phase !== 'memory')
  if ((!result.works.length && !execution.length) || result.works.some(work => work.status !== 'delivered') || execution.some(run => run.status !== 'completed')) return
  const artifacts = result.artifacts.filter(artifact => artifact.id !== source.id && artifact.contentHash && artifact.logicalArtifactId && artifact.contentVersion && ['ready', 'unsupported'].includes(artifact.contentStatus ?? ''))
  // Multiple unrelated outputs need an explicit choice. A revision family has an unambiguous latest version.
  if (source.kind === 'artifact') {
    const revisions = artifacts.filter(artifact => artifact.logicalArtifactId === source.logicalArtifactId && artifact.contentVersion! > source.contentVersion)
    if (revisions.length) return revisions.sort((first, second) => second.contentVersion! - first.contentVersion!)[0]
  }
  return artifacts.length === 1 ? artifacts[0] : undefined
}
