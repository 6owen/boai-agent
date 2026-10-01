/*
 * [INPUT]: 宿主材料回执与当前会话中的未发送材料状态。
 * [OUTPUT]: 草稿条目、未知准备回执/局部忙碌合同和材料状态/格式/名称/错误的安全展示；不保存文件路径或更改授权。
 * [POS]: 会话材料列表与可信原文预览共用的无副作用展示辅助。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ConversationMaterial } from '@shared/domain/materials'

export interface MaterialDraftItem {
  id: string
  name: string
  selectionId?: string
  requestId: string
  status: 'preparing' | 'ready' | 'failed' | 'unavailable'
  error?: string
  material?: ConversationMaterial
  authorizedAgentIds: string[]
  preparationState?: 'unknown' | 'not_accepted'
  busy?: boolean
}

export const materialStatusLabels: Record<ConversationMaterial['status'], string> = {
  preparing: '导入中', ready: '就绪', failed: '导入失败', unavailable: '不可用', removed: '已移除',
}

export function materialDisplayName(name: string): string {
  return name.split(/[\\/]/).at(-1)?.replace(/\0/g, '').trim() || '未命名材料'
}

export function materialFormatLabel(format?: ConversationMaterial['format']): string {
  return format === 'markdown' ? 'Markdown' : format === 'txt' ? 'TXT' : '类型待确认'
}

export function materialErrorText(error?: string): string {
  return error?.replace(/file:\/\/[^\s"'<>，。；]+/g, '[本机路径]')
    .replace(/(^|[\s("'（=:])(?:[A-Za-z]:[\\/]|\/)[^\s"'<>，。；]+/g, '$1[本机路径]').trim() || '材料暂不可用。'
}
