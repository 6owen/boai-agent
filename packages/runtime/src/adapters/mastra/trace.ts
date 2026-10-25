/*
 * [INPUT]: 阶段 Agent、Mastra 原生追踪事件与宿主持久化回调。
 * [OUTPUT]: 媒体只记录 MIME/字节数/hash，不保存截图到模型请求/工具Trace；本地调用树及模型边界输入；逐阶段刷盘、密钥脱敏，观测失败不重放业务。
 * [POS]: Mastra 阶段观测适配器，不改变工具权限或工作交付状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { summarizeMedia } from '../../modules/browser/media'
import { Mastra } from '@mastra/core/mastra'
import type { Agent } from '@mastra/core/agent'
import { SpanType, type ObservabilityExporter } from '@mastra/core/observability'
import { getCurrentSpan } from '@mastra/core/observability/context-storage'
import type { ProcessInputStepArgs } from '@mastra/core/processors'
import { Observability } from '@mastra/observability'
import type { EngineContext } from '../../contracts'
import type { TraceSpan } from '@boai/shared/domain/traces'

const tracedModels = new WeakSet<object>()

/** Observe the actual adapter input without consuming or replacing its stream. */
export function traceModelRequest(model: ProcessInputStepArgs['model']): ProcessInputStepArgs['model'] {
  if (tracedModels.has(model)) return model
  const wrapped = new Proxy(model, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property !== 'doStream' && property !== 'doGenerate') return typeof value === 'function' ? value.bind(target) : value
      return async (options: Record<string, unknown>) => {
        const { abortSignal: _signal, headers: _headers, ...input } = options
        const span = getCurrentSpan()?.createChildSpan({ type: SpanType.GENERIC, name: '模型请求', input: summarizeMedia(input), metadata: { captureStage: String(property), modelId: target.modelId, provider: target.provider } })
        try {
          const result = await Reflect.apply(value, target, [options]) as Awaited<ReturnType<ProcessInputStepArgs['model']['doStream']>>
          span?.end({ output: result.request?.body === undefined ? undefined : { providerRequestBody: summarizeMedia(result.request.body) } })
          return result
        } catch (error) {
          span?.error({ error: error instanceof Error ? error : new Error(String(error)), endSpan: true })
          throw error
        }
      }
    },
  })
  tracedModels.add(wrapped)
  return wrapped
}

export function observeAgent(agent: Agent, context: EngineContext, phase: string) {
  const exporter: ObservabilityExporter = {
    name: 'boai-local-traces',
    async exportTracingEvent({ exportedSpan: span }) {
      try {
        const value: TraceSpan = {
          id: `${span.traceId}:${span.id}`, traceId: span.traceId, spanId: span.id, parentSpanId: span.parentSpanId,
          name: span.name, spanType: span.type, startedAt: span.startTime.toISOString(), endedAt: span.endTime?.toISOString(),
          input: span.input, output: span.output, attributes: span.attributes, metadata: { ...span.metadata, phase }, error: span.errorInfo,
        }
        // The native filter handles named credentials; also redact the configured key
        // when a provider includes it inside an error or serialized request body.
        const serialized = JSON.stringify(summarizeMedia(value))
        const clean = context.apiKey ? serialized.split(JSON.stringify(context.apiKey).slice(1, -1)).join('[redacted]') : serialized
        await context.onTrace?.(JSON.parse(clean))
      } catch (error) { await context.onTraceError?.(error instanceof Error ? error.message : String(error)) }
    },
    async flush() {},
    async shutdown() {},
  }
  const observability = new Observability({ configs: { default: {
    serviceName: 'boai-agent', exporters: [exporter], logging: { enabled: false },
    excludeSpanTypes: [SpanType.MODEL_CHUNK, SpanType.PROCESSOR_RUN],
  } } })
  // A short-lived registration keeps simultaneous stages of the same employee isolated.
  new Mastra({ agents: { employee: agent }, observability, logger: false })
  return async () => {
    try { await observability.shutdown() }
    catch (error) { await context.onTraceError?.(error instanceof Error ? error.message : String(error)) }
  }
}
