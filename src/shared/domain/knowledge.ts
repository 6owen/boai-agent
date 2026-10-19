/*
 * [OUTPUT]: 知识引用只沿实际读取记录及当前授权/内容身份预览；旧版本、伪造路径和未读行不扩权。
 * [OUTPUT]: 旧知识文件/目录提供核验清单；revision=0更新按清单hash核对并只替换当前员工引用。
 * [INPUT]: 用户明确选择的员工、会话文件或宿主文件选择身份。
 * [OUTPUT]: 知识资料保留/替换/员工解绑的幂等回执；内部版本核对，不提供历史版本UI。
 * [POS]: 现有knowledge资源的文件管理增量，运行授权仍沿员工绑定及会话共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import type { Resource } from './index'
import type { FilePreview, BinaryFilePreview } from './file-preview'
import type { MaterialReadRef } from './materials'
import { z } from 'zod'

export type KnowledgeConversationSource = z.infer<typeof knowledgeSourceSchema>
export type KnowledgeSource = { kind: 'file'; name: string } | (KnowledgeConversationSource & { messageId: string })
export interface KnowledgeReadRef {
  resourceId: string
  resourceHash: string
  revision: number
  copyId?: string
  fileKey: string
  contentHash: string
  /** Citation matching only. Never open this model-visible path directly. */
  path: string
  name: string
  firstLine: number
  lastLine: number
}
export interface KnowledgeCitationInput { messageId: string; referenceIndex: number; line: number }
/** Match only an actual read interval. Markdown labels and arbitrary paths grant nothing. */
export function matchKnowledgeCitation(refs: KnowledgeReadRef[] | undefined, href: string | undefined) {
  if (!href) return undefined
  let decoded = href
  try { decoded = decodeURIComponent(href) } catch { /* malformed links remain plain text */ }
  for (const candidate of new Set([href, decoded])) {
    const match = /^(.*):([1-9]\d*)$/.exec(candidate)
    if (!match) continue
    const line = Number(match[2])
    const referenceIndex = refs?.findIndex(ref => ref.path === match[1] && Number.isSafeInteger(line) && ref.firstLine <= line && line <= ref.lastLine) ?? -1
    if (referenceIndex >= 0) return { referenceIndex, line, reference: refs![referenceIndex] }
  }
  return undefined
}
export interface KnowledgeContent {
  revision: number
  copyId: string
  fileName: string
  contentHash: string
  size: number
  source: KnowledgeSource
  materialSources?: MaterialReadRef[]
  revoked?: { materialId: string; at: string; reason: string }
  retainedAt: string
  retainedBy: 'user'
}
export interface SaveEmployeeKnowledgeInput {
  requestId: string
  agentId: string
  expectedConfigVersion: number
  replace?: { resourceId: string; revision: number; contentHash: string }
  source: { kind: 'file'; selectionId: string } | KnowledgeConversationSource
}
export type SaveEmployeeKnowledgeRuntimeInput = Omit<SaveEmployeeKnowledgeInput, 'source'> & { source: { kind: 'file'; path: string; name?: string } | KnowledgeConversationSource }
export interface KnowledgeReceipt {
  action?: 'remove'
  requestId: string
  agentId: string
  status: 'preparing' | 'completed' | 'failed' | 'interrupted' | 'cleared'
  resourceId?: string
  configVersion?: number
  error?: string
  cleanupError?: string
  conversationId?: string
  conversationVersion?: number
}
export interface KnowledgeSharingInput { requestId: string; agentId: string; resourceId: string; conversationId: string; expectedConfigVersion: number; shared: boolean }
export interface RemoveEmployeeKnowledgeInput { requestId: string; agentId: string; resourceId: string; expectedConfigVersion: number }
export interface KnowledgeFilesView {
  resource: Resource
  revision: number
  contentHash: string
  files: { key: string; name: string; contentHash: string; size: number }[]
}
export interface KnowledgePreview {
  fileName?: string
  resource: Resource
  contentHash: string
  size: number
  filePreview: FilePreview
  binaryPreview?: BinaryFilePreview
}
const id = z.string().min(1).max(200), contentHash = z.string().regex(/^[a-f0-9]{64}$/)
export const removeEmployeeKnowledgeSchema = z.object({ requestId: id, agentId: id, resourceId: id, expectedConfigVersion: z.number().int().positive() }).strict()
export const knowledgeSharingSchema = z.object({ requestId: id, agentId: id, resourceId: id, conversationId: id, expectedConfigVersion: z.number().int().positive(), shared: z.boolean() }).strict()
export const knowledgeSourceSchema = z.union([
  z.object({ kind: z.literal('material'), conversationId: id, id, contentHash, revision: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('artifact'), conversationId: id, id, contentHash, revision: z.number().int().positive().optional() }).strict(),
])
export const saveEmployeeKnowledgeSchema = z.object({ requestId: id, agentId: id, expectedConfigVersion: z.number().int().positive(), replace: z.object({ resourceId: id, revision: z.number().int().nonnegative(), contentHash }).strict().optional(), source: z.union([knowledgeSourceSchema, z.object({ kind: z.literal('file'), selectionId: z.string().uuid() }).strict()]) }).strict()
