/*
 * [INPUT]: Anthropic SDK model and a catalog-validated raw Magpie reasoning preference per request.
 * [OUTPUT]: Exact Messages thinking/effort body; none/off explicitly disable thinking without SDK model-name coercion.
 * [POS]: Gateway-only SDK transport shim; native/direct Anthropic requests remain unchanged.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changing this module.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createAnthropic } from '@ai-sdk/anthropic'
import { thinkingLevelPattern } from '@boai/shared/domain/model-preferences'
type MessagesModel = ReturnType<ReturnType<typeof createAnthropic>>
type MessagesOptions = Parameters<MessagesModel['doStream']>[0]

export function gatewayMessagesModel(baseURL: string, apiKey: string, modelId: string): MessagesModel {
  const request = new AsyncLocalStorage<{ effort: string; body?: unknown }>()
  const model = createAnthropic({ apiKey, baseURL, headers: { 'User-Agent': 'BOAI' }, fetch: async (input, init) => {
    const current = request.getStore()
    if (!current) return fetch(input, init)
    if (typeof init?.body !== 'string') throw new Error('网关 Messages 请求格式无法保留推理设置')
    const body = JSON.parse(init.body)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('网关 Messages 请求格式无效')
    const output = { ...(body.output_config ?? {}) }
    if (current.effort === 'none' || current.effort === 'off') {
      body.thinking = { type: 'disabled' }; delete output.effort
    } else {
      body.thinking = { type: 'adaptive' }; output.effort = current.effort
    }
    if (Object.keys(output).length) body.output_config = output
    else delete body.output_config
    current.body = body
    return fetch(input, { ...init, body: JSON.stringify(body) })
  } })(modelId)
  return new Proxy(model, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (key !== 'doStream' && key !== 'doGenerate') return typeof value === 'function' ? value.bind(target) : value
      return async (options: MessagesOptions) => {
        const effort = options.providerOptions?.magpie?.reasoningEffort
        if (effort === undefined) return Reflect.apply(value, target, [options])
        if (typeof effort !== 'string' || !thinkingLevelPattern.test(effort) || effort === 'auto') throw new Error('无效的网关推理档位')
        const { magpie: _, ...providerOptions } = options.providerOptions ?? {}
        const state: { effort: string; body?: unknown } = { effort }
        return request.run(state, async () => {
          const next = { ...options, providerOptions }
          const result = await (key === 'doStream' ? target.doStream(next) : target.doGenerate(next))
          return state.body === undefined ? result : { ...result, request: { ...result.request, body: state.body } }
        })
      }
    }
  })
}
