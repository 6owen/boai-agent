/*
 * [INPUT]: 用户明确交给当前聊天的 TXT/Markdown 文件与宿主校验结果。
 * [OUTPUT]: 有界材料、授权、解析版本、消息关联及不可混淆的内容引用合同。
 * [POS]: shared/domain 的聊天材料合同；不授予任意宿主路径或外部 ACP 访问。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
export const MATERIAL_LIMITS = { bytes: 128 * 1024, characters: 16_000, perMessage: 3, messageCharacters: 32_000, messageTextCharacters: 12_000, contextCharacters: 48_000, preparationMs: 5_000 } as const
export const MATERIAL_PARSE_VERSION = 'text-v1' as const

export interface ConversationMaterial {
  id: string
  conversationId: string
  name: string
  format: 'txt' | 'markdown'
  size: number
  status: 'preparing' | 'ready' | 'failed' | 'unavailable' | 'removed'
  error?: string
  authorizedAgentIds: string[]
  revision: number
  contentHash?: string
  parseVersion: typeof MATERIAL_PARSE_VERSION
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
  parseVersion: typeof MATERIAL_PARSE_VERSION
  conversationId: string
}
export interface MaterialPreview { material: ConversationMaterial; text: string }
