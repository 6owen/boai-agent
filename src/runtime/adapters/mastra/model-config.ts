/*
 * [OUTPUT]: Material-backed replies share the existing bounded task output capacity, capped by the selected model's valid catalog ceiling; ordinary chat retains its default.
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [OUTPUT]: Magpie三协议共用根地址和认证解析，SDK保留完整模型ID及已核对目录的推理档位；旧直连路径保持。
 * [INPUT]: 模型连接、API Key、可选模型覆盖、OpenAI 接口协议与员工思考强度。
 * [OUTPUT]: Anthropic 或 OpenAI Chat/Responses 的真实 SDK 配置；旧连接默认使用 Chat；已验证 DeepSeek 模型的自动/关闭/低/高/最高思考参数；官方 DeepSeek Chat 判断阶段的原生 JSON mode。
 * [POS]: runtime/adapters/mastra 的统一模型配置适配器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { validModelId } from '../../../shared/domain/model-id'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Connection } from '../../../shared/domain'
import { gatewayApiKey, gatewayEndpoint, type ModelCatalog } from '../../../shared/domain/model-gateway'
import { assertThinkingPreference, supportsThinkingControl, type ThinkingLevel } from '../../../shared/domain/model-preferences'
import { gatewayMessagesModel } from './gateway-messages-model'
import type { EngineContext } from '../../contracts'

export function responseOutputTokens(context: Pick<EngineContext, 'agent' | 'connection' | 'modelCatalog' | 'materialRefs' | 'materialImages'>, task: boolean): number {
  const desired = task || context.materialRefs?.length || context.materialImages?.length ? 8192 : 2500
  const modelId = (context.agent.modelId || context.connection?.defaultModel || '').trim()
  const maximum = context.modelCatalog?.models.find(model => model.id === modelId)?.maxOutputTokens
  return typeof maximum === 'number' && Number.isSafeInteger(maximum) && maximum > 0 ? Math.min(desired, maximum) : desired
}

type ModelProviderOptions = { openai: { thinking?: { type: 'disabled' | 'enabled' }; reasoningEffort?: string; forceReasoning?: boolean; response_format?: { type: 'json_object' } } }
  | { magpie: { reasoningEffort: string } }

export function thinkingProviderOptions(connection: Connection, override: string | undefined, level: ThinkingLevel | undefined, phase: 'chat' | 'task' | 'decision' | 'memory' | 'report' | 'test', catalog?: ModelCatalog): ModelProviderOptions | undefined {
  assertThinkingPreference(connection, override, level, catalog)
  if (connection.gateway) {
    if (!level || level === 'auto') return undefined
    // The gateway Messages shim preserves raw values and explicit disabled semantics.
    return connection.gateway.protocol === 'messages'
      ? { magpie: { reasoningEffort: level } }
      // Responses otherwise infers capability from an OpenAI model-name prefix and
      // drops effort for opaque gateway IDs. The matched catalog is the authority.
      : { openai: { reasoningEffort: level, ...(connection.gateway.protocol === 'responses' ? { forceReasoning: true } : {}) } }
  }
  if (!supportsThinkingControl(connection, override)) return undefined
  // Automatic mode lightens the serial pre-reply stages while preserving task/report defaults.
  const automatic = !level || level === 'auto'
  if (automatic && (phase === 'task' || phase === 'report')) return undefined
  // The explicit-URL Mastra router uses the "openai" compatibility namespace:
  // reasoningEffort maps to reasoning_effort; thinking is passed into the request body.
  if (level === 'off') return { openai: { thinking: { type: 'disabled' } } }
  return { openai: { thinking: { type: 'enabled' }, reasoningEffort: automatic ? 'low' as const : level } }
}

export function decisionProviderOptions(connection: Connection, override: string | undefined, level: ThinkingLevel | undefined, catalog?: ModelCatalog): ModelProviderOptions | undefined {
  const options = thinkingProviderOptions(connection, override, level, 'decision', catalog)
  // The verified official Chat family supports JSON mode. Explicit-URL compatibility
  // forwards this body parameter in the same request; other providers keep their options.
  if (!supportsThinkingControl(connection, override)) return options
  return { openai: { ...(options && 'openai' in options ? options.openai : {}), response_format: { type: 'json_object' } } }
}

export function modelConfig(connection: Connection, apiKey: string, override?: string) {
  if (connection.gateway) {
    const key = gatewayApiKey(connection, apiKey)
    const modelId = (override || connection.defaultModel).trim()
    if (!validModelId(modelId)) throw new Error('请配置有效的模型 ID')
    const baseURL = gatewayEndpoint(connection.baseUrl, 'v1')
    if (connection.gateway.protocol === 'messages') return gatewayMessagesModel(baseURL, key, modelId)
    return { id: `openai/${modelId}` as const, url: baseURL, apiKey: key, api: connection.gateway.protocol, headers: { 'User-Agent': 'BOAI' } }
  }
  const modelId = (override || connection.defaultModel).trim()
  if (!validModelId(modelId)) throw new Error('请配置有效的模型 ID')
  if (connection.provider !== 'openai-compatible' && !apiKey.trim()) throw new Error('请先保存模型连接的 API Key')
  if (connection.provider === 'openai-compatible' && !connection.baseUrl.trim()) throw new Error('请配置兼容模型服务的 API 地址')
  const baseUrl = connection.baseUrl.trim().replace(/\/+$/, '') || (connection.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须是 HTTP(S) URL，不能在地址中携带凭据')
  if (connection.provider === 'anthropic') return createAnthropic({ apiKey, baseURL: baseUrl })(modelId)
  // Explicit URL selects Mastra's OpenAI-compatible adapter, including localhost gateways.
  return { id: `openai/${modelId}` as const, url: baseUrl, apiKey, api: connection.api ?? 'chat' }
}
