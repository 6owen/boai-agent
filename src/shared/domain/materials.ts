/*
 * [OUTPUT]: 材料预览DTO可含非持久PDF/Office核源字节；原解析版本、当前成员和旧授权不改变。
 * [INPUT]: 用户明确交给当前聊天的文本、图片/任意文件与宿主原件校验结果。
 * [OUTPUT]: 独立非持久文件预览不扩展模型文本解析；分离文本/附件容量、当前成员/旧显式授权、解析版本与原件引用；同hash显式恢复保留未撤权的读取版本范围，授权变化截断旧引用。
 * [POS]: shared/domain 的聊天材料合同；不授予任意宿主路径或外部 ACP 访问。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Conversation } from './index'
import type { BinaryFilePreview, FilePreview } from './file-preview'

export const MATERIAL_LIMITS = { bytes: 128 * 1024, attachmentBytes: 20 * 1024 * 1024, characters: 16_000, perMessage: 3, messageCharacters: 32_000, messageTextCharacters: 12_000, contextCharacters: 48_000, preparationMs: 5_000 } as const
export const MATERIAL_PARSE_VERSION = 'text-v1' as const
export const BINARY_MATERIAL_PARSE_VERSION = 'binary-v1' as const

export interface ConversationMaterial {
  id: string
  conversationId: string
  name: string
  format: 'txt' | 'markdown' | 'image' | 'file'
  mimeType?: string
  size: number
  status: 'preparing' | 'ready' | 'failed' | 'unavailable' | 'removed'
  error?: string
  deliveryScope?: 'conversation'
  authorizedAgentIds: string[]
  revision: number
  /** Inclusive prior revision floor after a same-hash availability repair; reset on authorization changes. */
  readableRevisionFrom?: number
  contentHash?: string
  parseVersion: typeof MATERIAL_PARSE_VERSION | typeof BINARY_MATERIAL_PARSE_VERSION
  characterCount?: number
  lineCount?: number
  createdAt: string
  messageId?: string
}
export interface MaterialSelection { id: string; revision: number }
export interface MaterialReadRef {
  id: string
  revision: number
  contentHash: string
  parseVersion: typeof MATERIAL_PARSE_VERSION | typeof BINARY_MATERIAL_PARSE_VERSION
  conversationId: string
}
export interface MaterialPreview { material: ConversationMaterial; text: string; imageUrl?: string; filePreview?: FilePreview; binaryPreview?: BinaryFilePreview }

/** Availability repair preserves identical bytes only within the unchanged authorization era. */
export function isMaterialReadRevisionValid(material: Pick<ConversationMaterial, 'revision' | 'readableRevisionFrom'>, expected: number): boolean {
  return Number.isSafeInteger(expected) && expected >= (material.readableRevisionFrom ?? material.revision) && expected <= material.revision
}

/** Callers supply the current authoritative conversation; legacy grants never expand implicitly. */
export function isConversationMaterialVisible(material: Pick<ConversationMaterial, 'conversationId' | 'deliveryScope' | 'authorizedAgentIds'>, conversation: Pick<Conversation, 'id' | 'agentIds'>, agentId: string): boolean {
  return material.conversationId === conversation.id && conversation.agentIds.includes(agentId) && (material.deliveryScope === 'conversation' || (material.deliveryScope === undefined && material.authorizedAgentIds.includes(agentId)))
}
