/*
 * [INPUT]: 宿主材料回执与当前会话中的未发送材料状态。
 * [OUTPUT]: 草稿条目、仅供准备期占位的图片提示、未知准备回执/局部忙碌合同和文本/图片/文件格式、名称、错误的安全展示；去除Electron错误包装以和持久材料错误去重，原原因及路径脱敏保持；只接受宿主核对的静态图片data URI，不保存文件路径或固定员工名单。
 * [POS]: 会话材料列表与可信原文预览共用的无副作用展示辅助。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ConversationMaterial, MaterialPreview } from '@shared/domain/materials'

export interface MaterialDraftItem {
  id: string
  name: string
  selectionId?: string
  image?: boolean
  requestId: string
  status: 'preparing' | 'ready' | 'failed' | 'unavailable'
  error?: string
  material?: ConversationMaterial
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
  return format === 'markdown' ? 'Markdown' : format === 'txt' ? 'TXT' : format === 'image' ? '图片' : format === 'file' ? '文件' : '类型待确认'
}

export function materialImageUrl(preview?: MaterialPreview): string | undefined {
  const url = preview?.imageUrl
  return preview?.material.status === 'ready' && preview.material.format === 'image' && url && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(url) ? url : undefined
}

export function materialErrorText(error?: string): string {
  return error?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    .replace(/file:\/\/[^\s"'<>，。；]+/g, '[本机路径]')
    .replace(/(^|[\s("'（=:])(?:[A-Za-z]:[\\/]|\/)[^\s"'<>，。；]+/g, '$1[本机路径]').trim() || '材料暂不可用。'
}
