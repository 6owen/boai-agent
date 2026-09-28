/*
 * [INPUT]: 模型连接、API Key、可选模型覆盖、OpenAI 接口协议与员工思考强度。
 * [OUTPUT]: Anthropic 或 OpenAI Chat/Responses 的真实 SDK 配置；旧连接默认使用 Chat；已验证 DeepSeek 模型的自动/关闭/低/高/最高思考参数。
 * [POS]: runtime/adapters/mastra 的统一模型配置适配器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Connection } from '../../../shared/domain'
import { supportsThinkingControl, type ThinkingLevel } from '../../../shared/domain/model-preferences'

export function thinkingProviderOptions(connection: Connection, override: string | undefined, level: ThinkingLevel | undefined, phase: 'chat' | 'task' | 'decision' | 'memory' | 'report' | 'test') {
  if (!supportsThinkingControl(connection, override)) return undefined
  // Automatic mode lightens the serial pre-reply stages while preserving task/report defaults.
  const automatic = !level || level === 'auto'
  if (automatic && (phase === 'task' || phase === 'report')) return undefined
  // The explicit-URL Mastra router uses the "openai" compatibility namespace:
  // reasoningEffort maps to reasoning_effort; thinking is passed into the request body.
  if (level === 'off') return { openai: { thinking: { type: 'disabled' } } }
  return { openai: { thinking: { type: 'enabled' }, reasoningEffort: automatic ? 'low' as const : level } }
}

export function modelConfig(connection: Connection, apiKey: string, override?: string) {
  const modelId = (override || connection.defaultModel).trim()
  if (!modelId) throw new Error('请先配置模型 ID')
  if (connection.provider !== 'openai-compatible' && !apiKey.trim()) throw new Error('请先保存模型连接的 API Key')
  if (connection.provider === 'openai-compatible' && !connection.baseUrl.trim()) throw new Error('请配置兼容模型服务的 API 地址')
  const baseUrl = connection.baseUrl.trim().replace(/\/+$/, '') || (connection.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须是 HTTP(S) URL，不能在地址中携带凭据')
  if (connection.provider === 'anthropic') return createAnthropic({ apiKey, baseURL: baseUrl })(modelId)
  // Explicit URL selects Mastra's OpenAI-compatible adapter, including localhost gateways.
  return { id: `openai/${modelId}` as const, url: baseUrl, apiKey, api: connection.api ?? 'chat' }
}
