import { createAnthropic } from '@ai-sdk/anthropic'
import type { Connection } from '../../../shared/domain'

export function modelConfig(connection: Connection, apiKey: string, override?: string) {
  const modelId = (override || connection.defaultModel).trim()
  if (!modelId) throw new Error('请先配置模型 ID')
  if (connection.provider !== 'openai-compatible' && !apiKey.trim()) throw new Error('请先保存模型连接的 API Key')
  if (connection.provider === 'openai-compatible' && !connection.baseUrl.trim()) throw new Error('请配置兼容模型服务的 API 地址')
  const baseUrl = connection.baseUrl.trim().replace(/\/+$/, '') || (connection.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须是 HTTP(S) URL，不能在地址中携带凭据')
  if (connection.provider === 'anthropic') return createAnthropic({ apiKey, baseURL: baseUrl })(modelId)
  // Explicit URL selects Mastra's OpenAI-compatible chat adapter, including localhost gateways.
  return { id: `openai/${modelId}` as const, url: baseUrl, apiKey, api: 'chat' as const }
}

