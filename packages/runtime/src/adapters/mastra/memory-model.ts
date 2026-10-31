/*
 * [INPUT]: The employee's resolved Mastra model and original run accounting/cancellation.
 * [OUTPUT]: Every OM model attempt uses the selected connection, reserves a call and reports actual usage.
 * [POS]: Thin model transport boundary; observation, reflection and retries remain Mastra-owned.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changed.
 */
import { Agent } from '@mastra/core/agent'
import type { EngineContext } from '../../contracts'
import type { ModelUsage } from '@boai/shared/domain'
import { modelConfig, responseOutputTokens, thinkingProviderOptions } from './model-config'
import { gatewayRouteObserver } from './gateway-route'

function safeError(error: unknown, key: string) {
  const clean = new Error((error instanceof Error ? error.message : String(error)).split(key || '\u0000').join('[redacted]'))
  // Preserve retry classification without carrying credential-bearing request/response bodies.
  if (error && typeof error === 'object') for (const field of ['name', 'code', 'statusCode', 'isRetryable'] as const) {
    const value = (error as Record<string, unknown>)[field]
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)) Object.assign(clean, { [field]: value })
  }
  return clean
}
function completed(reason: unknown) {
  const value = reason && typeof reason === 'object' ? (reason as { unified?: string }).unified : reason
  if (value !== 'stop') throw new Error('Mastra 记忆观察未完整结束，候选未保存')
}

function usageOf(value: Record<string, unknown>): ModelUsage {
  const usage: ModelUsage = {}
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    const raw = value[key], amount = typeof raw === 'object' && raw ? (raw as { total?: unknown }).total : raw
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) usage[key] = amount
  }
  if (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === 0) delete usage.totalTokens
  return usage
}

export async function memoryModel(context: EngineContext) {
  if (!context.connection) throw new Error('Mastra Memory 需要 API 模型连接')
  const model = await new Agent({ id: `${context.agent.id}-memory-model`, name: 'Memory transport', instructions: '', model: modelConfig(context.connection, context.apiKey, context.agent.modelId), maxRetries: 0 }).getModel()
  return new Proxy(model, { get(target, key) {
    const value = Reflect.get(target, key, target)
    if (key !== 'doStream' && key !== 'doGenerate') return typeof value === 'function' ? value.bind(target) : value
    return async (options: Record<string, unknown>) => {
      context.signal.throwIfAborted()
      const callId = await context.onAdditionalModelCall?.()
      if (!callId) throw new Error('Mastra OM 未取得原运行的模型调用预算')
      await context.onModelCallStarted?.(callId, 'memory')
      context.signal.throwIfAborted()
      const abortSignal = options.abortSignal instanceof AbortSignal ? AbortSignal.any([context.signal, options.abortSignal]) : context.signal
      const selected = thinkingProviderOptions(context.connection!, context.agent.modelId, context.agent.thinkingLevel, 'memory', context.modelCatalog)
      const maxOutputTokens = Math.min(typeof options.maxOutputTokens === 'number' ? options.maxOutputTokens : 4000, responseOutputTokens(context, true), 4000)
      const result = await Promise.resolve(Reflect.apply(value, target, [{ ...options, maxOutputTokens, providerOptions: { ...selected, ...options.providerOptions as object }, abortSignal }])).catch(error => { throw safeError(error, context.apiKey) }) as { response?: import('./gateway-route').GatewayResponse; usage?: Record<string, unknown>; finishReason?: unknown; stream: ReadableStream<{ type: string; usage?: Record<string, unknown>; finishReason?: unknown; error?: unknown }> }
      const report = async (raw: Record<string, unknown>) => {
        const usage = usageOf(raw)
        await context.onModelCallUsage?.(callId, usage)
        await context.onSupplementalUsage?.(callId, usage)
      }
      await gatewayRouteObserver(context, () => callId)({ response: result.response ?? {} })
      if (key === 'doGenerate') { if (result.usage) await report(result.usage); context.signal.throwIfAborted(); completed(result.finishReason); return result }
      let finished = false
      return { ...result, stream: result.stream.pipeThrough(new TransformStream({ async transform(chunk, controller) {
        if (chunk.type === 'finish' && chunk.usage) await report(chunk.usage)
        context.signal.throwIfAborted()
        if (chunk.type === 'error') throw safeError(chunk.error, context.apiKey)
        if (chunk.type === 'finish') { completed(chunk.finishReason); finished = true }
        controller.enqueue(chunk)
      }, flush() { if (!finished) throw new Error('Mastra 记忆观察流未完整结束') } })) }
    }
  } })
}

/** The official embedding router uses an explicitly selected connection; no env/default chat-model fallback. */
export async function memoryEmbedder(context: EngineContext, selection: { connection: import('@boai/shared/domain').Connection; apiKey: string; modelId: string }) {
  const { ModelRouterEmbeddingModel } = await import('@mastra/core/llm')
  if (selection.connection.provider === 'anthropic') throw new Error('当前连接不支持 embeddings 接口')
  const config = modelConfig(selection.connection, selection.apiKey, selection.modelId)
  if (!('id' in config)) throw new Error('当前连接不支持 embeddings 接口')
  const model = new ModelRouterEmbeddingModel(config)
  return new Proxy(model, { get(target, key) {
    const value = Reflect.get(target, key, target)
    if (key !== 'doEmbed') return typeof value === 'function' ? value.bind(target) : value
    return async (options: Parameters<typeof model.doEmbed>[0]) => {
      context.signal.throwIfAborted()
      const callId = await context.onAdditionalModelCall?.()
      if (!callId) throw new Error('语义检索未取得原运行的调用预算')
      await context.onModelCallStarted?.(callId, 'memory', undefined, { connectionId: selection.connection.id, modelId: selection.modelId })
      const abortSignal = options.abortSignal ? AbortSignal.any([context.signal, options.abortSignal]) : context.signal
      const result = await target.doEmbed({ ...options, abortSignal }).catch(error => { throw safeError(error, selection.apiKey) })
      const usage = result.usage ? { inputTokens: result.usage.tokens, totalTokens: result.usage.tokens } : {}
      await context.onModelCallUsage?.(callId, usage)
      await context.onSupplementalUsage?.(callId, usage)
      context.signal.throwIfAborted()
      return result
    }
  } })
}
