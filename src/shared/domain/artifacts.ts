/*
 * [INPUT]: 宿主复制时 hash 的真实成果发布、明确用户修订来源与固定本人采用/待验收请求。
 * [OUTPUT]: 成果可携带真实浏览器 URL/title/time/pageVersion 有界来源；与 Work.resultVersion 独立的成果内容身份/版本链、严格 Markdown/代码/纯文本预览、用户修订与幂等采用 DTO；固定版本的显式待验收资格及只读回执，资格不表示质量批准。
 * [POS]: shared/domain 的成果扩展合同；不导入领域 index，不以文件名推断版本或继承审核/采用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { MaterialReadRef } from './materials'
import type { FilePreview } from './file-preview'

export const ARTIFACT_LIMITS = { publicationBytes: 20 * 1024 * 1024, previewBytes: 1024 * 1024, previewCharacters: 200_000, revisionCharacters: 12_000 } as const
export type ArtifactContentStatus = 'ready' | 'unsupported' | 'unavailable' | 'removed'

/** Optional extension permits old Artifact records to remain readable until controlled verification. */
export interface ArtifactExtension {
  logicalArtifactId?: string
  contentVersion?: number
  contentHash?: string
  contentStatus?: ArtifactContentStatus
  contentError?: string
  managedRelativePath?: string
  previousArtifactId?: string
  revisionRequestId?: string
  sourceWorkId?: string
  sourceMessageId?: string
  registrationSource?: 'publication' | 'legacy_verified'
}
export interface BrowserArtifactSource { url:string; title:string; obtainedAt:string; pageVersion:string }
export interface ArtifactPublication {
  /** Actual bounded browser receipts for this publication run, never model claimed sources. */
  browserSources?: BrowserArtifactSource[]
  id?: string
  conversationId?: string
  /** Host hashes copied publication bytes before the registration callback; legacy rows may lack it. */
  contentHash?: string
  name: string
  path: string
  size: number
  ownerAgentId?: string
  runId?: string
  sourcePath?: string
  publishedAt?: string
  materialSources?: MaterialReadRef[]
}
export interface ArtifactVersion extends ArtifactPublication, ArtifactExtension {
  id: string
  conversationId: string
  logicalArtifactId: string
  contentVersion: number
  contentHash: string
  contentStatus: ArtifactContentStatus
  managedRelativePath: string
  registrationSource: 'publication' | 'legacy_verified'
}
export interface ArtifactRegistration {
  conversationId: string
  revisionRequestId: string | null
  sourceWorkId: string | null
  sourceMessageId: string | null
}
export interface ArtifactPreview { artifact: ArtifactVersion; text: string; filePreview?: FilePreview; versions: ArtifactVersion[]; adoption: ArtifactAdoptionState; acceptance?: ArtifactAcceptance | null }

export interface ArtifactRevisionInput {
  conversationId: string
  artifactId: string
  contentHash: string
  targetAgentId: string
  content: string
  requestId: string
}
export interface ArtifactRevisionRequest {
  id: string
  fingerprint: string
  conversationId: string
  artifactId: string
  contentHash: string
  logicalArtifactId: string
  targetAgentId: string
  content: string
  messageId: string
  createdAt: string
  rootWorkId?: string
}
export interface ArtifactRevisionPrepared { input: ArtifactRevisionInput; artifact: ArtifactVersion; request?: ArtifactRevisionRequest }
export interface ArtifactRevisionSource extends ArtifactPreview { request: ArtifactRevisionRequest }

export interface ArtifactAdoptionInput {
  artifactId: string
  contentHash: string
  expectedAdoptionRevision: number
  requestId: string
}
export interface ArtifactAdoptionEvent {
  id: string
  conversationId: string
  logicalArtifactId: string
  artifactId: string
  contentHash: string
  contentVersion: number
  userId: 'user'
  requestId: string
  adoptionRevision: number
  adoptedAt: string
}
export interface ArtifactAdoptionCurrent extends ArtifactAdoptionEvent { eventId: string }
export interface ArtifactAdoptionReceipt {
  id: string
  fingerprint: string
  conversationId: string
  logicalArtifactId: string
  artifactId: string
  contentHash: string
  eventId: string
  adoptionRevision: number
  adoptedAt: string
  userId: 'user'
}
export interface ArtifactAdoptionState { logicalArtifactId: string; revision: number; current: ArtifactAdoptionCurrent | null; events: ArtifactAdoptionEvent[] }

/** Only an explicit user request creates this qualification; viewing or delivering never does. */
export interface ArtifactAcceptanceInput {
  artifactId: string
  logicalArtifactId: string
  contentVersion: number
  contentHash: string
  expectedAcceptanceRevision: number
  requestId: string
}
export type ArtifactAcceptanceStatus = 'pending' | 'adopted' | 'revision_requested' | 'superseded' | 'unavailable'
export interface ArtifactAcceptance {
  id: string
  conversationId: string
  artifactId: string
  logicalArtifactId: string
  contentVersion: number
  contentHash: string
  userId: 'user'
  requestId: string
  revision: number
  status: ArtifactAcceptanceStatus
  createdAt: string
  updatedAt: string
  reason?: string
}
export interface ArtifactAcceptanceReceipt {
  id: string
  fingerprint: string
  conversationId: string
  acceptanceId: string
  acceptanceRevision: number
  acceptedAt: string
  /** Current qualification is rechecked on reads; receipt identity never reopens it. */
  acceptance: ArtifactAcceptance
}
