/*
 * [INPUT]: Runtime API v2 private source and a fresh per-run provider identity.
 * [OUTPUT]: Native Pi provider extension/OpenCode inline model configuration; secret only in child env.
 * [POS]: First-party model-source projection, never a persisted plugin config or business tool.
 * [PROTOCOL]: Update Header and plugins/.folder.md when changing native source rules.
 */
import { randomUUID } from 'node:crypto'
import type { RuntimeModelSource } from '../../../shared/plugins/runtime-api'
export function piGatewaySource(source: RuntimeModelSource) {
  const providerId = `boai_gateway_${randomUUID().replaceAll('-', '')}`, keyName = 'BOAI_PI_GATEWAY_API_KEY'
  const api = source.protocol === 'chat' ? 'openai-completions' : source.protocol === 'responses' ? 'openai-responses' : 'anthropic-messages'
  const model = { id: source.modelId, name: source.model?.name ?? source.modelId, input: source.model?.input?.includes('image') ? ['text', 'image'] : ['text'], reasoning: source.model?.reasoning ?? false,
    // Pi 1.3.0 treats contextWindow=0 as unknown (no guessed context clamp/compaction).
    // Required output fallback follows Pi custom-model default; neither value is a BOAI budget or capacity claim.
    contextWindow: source.model?.contextWindow ?? 0, maxTokens: source.model?.maxOutputTokens ?? 16384, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
  // Pi uses the Anthropic SDK, which appends /v1/messages itself.
  const baseUrl = source.protocol === 'messages' ? source.baseUrl.replace(/\/v1\/?$/, '') : source.baseUrl
  const configuration = { api, baseUrl, apiKey: `$${keyName}`, models: [model] }
  return { providerId, baseUrl, extension: `pi.registerProvider(${JSON.stringify(providerId)}, ${JSON.stringify(configuration)});`, env: { ...process.env, [keyName]: source.apiKey } }
}
export function opencodeGatewaySource(source: RuntimeModelSource) {
  const providerId = `boai_gateway_${randomUUID().replaceAll('-', '')}`, keyName = 'BOAI_OPENCODE_GATEWAY_API_KEY'
  let inherited: Record<string, unknown> = {}
  if (process.env.OPENCODE_CONFIG_CONTENT) {
    const value = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OpenCode内联配置不是对象')
    inherited = value
  }
  const modelId = `${providerId}/${source.modelId}`
  const npm = source.protocol === 'chat' ? '@ai-sdk/openai-compatible' : source.protocol === 'responses' ? '@ai-sdk/openai' : '@ai-sdk/anthropic'
  const provider = { npm, name: 'BOAI model gateway', options: { baseURL: source.baseUrl, apiKey: `{env:${keyName}}` }, models: { [source.modelId]: { name: source.model?.name ?? source.modelId,
    ...(source.model?.contextWindow && source.model.maxOutputTokens ? { limit: { context: source.model.contextWindow, output: source.model.maxOutputTokens } } : {}),
    ...(source.model?.input ? { modalities: { input: source.model.input, output: ['text'] } } : {}) } } }
  return { modelId, env: { ...process.env, [keyName]: source.apiKey, OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...inherited, model: modelId, small_model: modelId, provider: { ...(inherited.provider as object ?? {}), [providerId]: provider } }) } }
}
