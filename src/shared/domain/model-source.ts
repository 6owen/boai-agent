/*
 * [INPUT]: Explicit per-message API overrides and existing connection metadata.
 * [OUTPUT]: Shared input validation and credential-free frozen request source.
 * [POS]: Model selection never changes employee identity or execution permissions.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { z } from 'zod'
import type { Connection } from './index'
import { MODEL_ID_MAX_LENGTH, validModelId } from './model-id'

export const apiModelOverrideSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'openai-compatible']).optional(),
  model: z.string().trim().min(1).max(MODEL_ID_MAX_LENGTH).refine(validModelId, '无效的模型 ID').optional(),
  baseUrl: z.string().trim().max(2000).optional(),
  apiKey: z.string().max(12000).optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), '请提供本轮模型参数')
export type ApiModelOverride = z.infer<typeof apiModelOverrideSchema>
export interface RequestModelSource {
  employeeId: string
  employeeConfigVersion: number
  connection: Connection
  inheritedConnection?: { id: string; revision: number }
}

export function assertModelEndpoint(provider: Connection['provider'], baseUrl: string) {
  if (baseUrl) {
    let url: URL
    try { url = new URL(baseUrl) } catch { throw new Error('模型地址不是有效 URL') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须为不含凭据的 HTTP 或 HTTPS URL')
  }
  if (provider === 'openai-compatible' && !baseUrl) throw new Error('兼容模型需要填写 API 地址')
}
