/*
 * [OUTPUT]: 宿主 Trace、官方存储 Trace 与执行事件通过统一的结构化观测序列化保留 JSON 字段类型。
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Durable Agent/Session.steer、Workspace 文件工具、LocalSandbox 进程和原生 Trace；授权及发布保留业务适配。
 * [INPUT]: Mastra's native metric events and BOAI run/conversation identities.
 * [OUTPUT]: Official metric storage/query, provider cost estimates and product-facing projections.
 * [POS]: Local observability adapter; never prices tokens or enforces implicit budgets.
 * [PROTOCOL]: Changes update this Header and mastra/.folder.md.
 */
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { InMemoryStore, MastraCompositeStore, type MetricRecord, type MetricsFilter } from '@mastra/core/storage'
import { MastraStorageExporter } from '@mastra/observability'
import type { ObservabilityExporter } from '@mastra/core/observability'
import type { EngineContext } from '../../contracts'
import { persistentObservation } from '../../modules/conversations/observation-payload'
import type { StoredTraceSpan } from '@boai/shared/domain/traces'
import type { ModelMetricCall } from '@boai/shared/domain/profile'

const owner = Symbol('boai-mastra-metrics')
export type MetricContext = Pick<EngineContext, 'runId' | 'apiKey' | 'onTrace' | 'onTraceError'> & { conversation: { id: string }; agent: { id: string }; metricScope?: 'utility'; turnId?: string }
type BoundContext = MetricContext & { [owner]?: MastraMetrics }
export function bindMetrics<T extends MetricContext>(context: T, metrics: MastraMetrics): T { return { ...context, [owner]: metrics } }
export function contextMetrics(context: MetricContext) { return (context as BoundContext)[owner] }

export class MastraMetrics {
  private readonly exporters = new Set<MastraStorageExporter>()
  private pending?: Promise<MastraCompositeStore>
  private closeStore?: () => Promise<void>
  constructor(private path = ':memory:') {}
  async storage(fallback?: MastraCompositeStore) {
    this.pending ??= (async () => {
      if (this.path === ':memory:') return new InMemoryStore({ id: 'boai-metrics' })
      await mkdir(dirname(this.path), { recursive: true })
      const { DuckDBStore } = await import('@mastra/duckdb')
      const store = new DuckDBStore({ id: 'boai-metrics', path: this.path })
      this.closeStore = () => store.close()
      await store.init()
      return store
    })()
    const store = await this.pending
    return fallback ? new MastraCompositeStore({ id: 'boai-runtime-storage', default: fallback, domains: { observability: await store.getStore('observability') } }) : store
  }
  exporter(context: MetricContext, phase: string): ObservabilityExporter {
    const native = new MastraStorageExporter()
    this.exporters.add(native)
    return {
      name: 'boai-native-metrics',
      init: options => native.init(options),
      exportTracingEvent: async event => {
        const span = event.exportedSpan
        const clean = persistentObservation({
          input: span.input, output: span.output, attributes: span.attributes,
          metadata: span.metadata, errorInfo: span.errorInfo, requestContext: span.requestContext,
        }, context.apiKey)
        await native.exportTracingEvent({ ...event, exportedSpan: { ...span, ...clean,
          metadata: { ...clean.metadata, phase, runId: context.runId, threadId: context.conversation.id, resourceId: context.agent.id, boaiTurnId: context.turnId },
        } })
      },
      onMetricEvent: event => native.onMetricEvent({ ...event, metric: { ...event.metric,
        correlationContext: { ...event.metric.correlationContext, runId: context.runId, threadId: context.conversation.id, resourceId: context.agent.id },
        metadata: { ...event.metric.metadata, phase, metricScope: context.metricScope },
        labels: { ...event.metric.labels, boaiScope: context.metricScope ?? 'run' },
      } }),
      flush: () => native.flush(),
      shutdown: async () => { try { await native.shutdown() } finally { this.exporters.delete(native) } },
    }
  }
  async calls(runIds?: string[]): Promise<ModelMetricCall[]> {
    const store = await (await this.storage()).getStore('observability')
    const rows: MetricRecord[] = []
    const filters: MetricsFilter[] = runIds ? [...new Set(runIds)].map(runId => ({ runId })) : [{}]
    if (runIds) filters.push({ threadId: '' })
    for (const filter of filters) {
    for (let page = 0; ; page++) {
      const result = await store!.listMetrics({ filters: { ...filter, name: ['mastra_model_duration_ms', 'mastra_model_total_input_tokens', 'mastra_model_total_output_tokens', 'mastra_model_input_cache_read_tokens', 'mastra_model_input_cache_write_tokens', 'mastra_model_output_reasoning_tokens'] }, pagination: { page, perPage: 100 }, orderBy: { field: 'timestamp', direction: 'ASC' } })
      rows.push(...result.metrics)
      if (!result.pagination?.hasMore) break
    }
    }
    const retained = runIds && new Set(runIds)
    return projectModelMetrics(rows).filter(call => !retained || call.scope === 'utility' || retained.has(call.runId))
  }
  async traces(conversationId: string, runIds: string[]): Promise<StoredTraceSpan[]> {
    await Promise.all([...this.exporters].map(exporter => exporter.flush()))
    const store = await (await this.storage()).getStore('observability')
    const spans: StoredTraceSpan[] = []
    for (const runId of new Set(runIds)) for (let page = 0; ; page++) {
      const result = await store!.listTraces({ filters: { runId, threadId: conversationId }, pagination: { page, perPage: 100 } })
      for (const root of result.spans) {
        const trace = await store!.getTrace({ traceId: root.traceId })
        for (const span of trace?.spans ?? []) {
          if (span.runId !== runId || span.threadId !== conversationId) continue
          spans.push({ id: `${span.traceId}:${span.spanId}`, traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId ?? undefined,
            name: span.name, spanType: span.spanType, startedAt: span.startedAt.toISOString(), endedAt: span.endedAt?.toISOString(),
            input: span.input, output: span.output, attributes: span.attributes, metadata: span.metadata, error: span.error,
            runId, conversationId, agentId: span.resourceId ?? '', turnId: typeof span.metadata?.boaiTurnId === 'string' ? span.metadata.boaiTurnId : undefined,
          })
        }
      }
      if (!result.pagination?.hasMore) break
    }
    return [...new Map(spans.map(span => [span.id, span])).values()]
  }
  async forgetConversation(threadId: string) {
    const store = await (await this.storage()).getStore('observability')
    const traces = new Set<string>()
    for (let page = 0; ; page++) {
      const result = await store!.listTraces({ filters: { threadId }, pagination: { page, perPage: 100 } })
      for (const span of result.spans) traces.add(span.traceId)
      if (!result.pagination?.hasMore) break
    }
    for (let page = 0; ; page++) {
      const result = await store!.listMetrics({ filters: { threadId }, pagination: { page, perPage: 100 } })
      for (const metric of result.metrics) if (metric.traceId) traces.add(metric.traceId)
      if (!result.pagination?.hasMore) break
    }
    const ids = [...traces]
    for (let index = 0; index < ids.length; index += 1000) await store!.batchDeleteTraces({ traceIds: ids.slice(index, index + 1000) })
  }
  async close() { if (this.pending) await this.pending; await this.closeStore?.(); this.pending = undefined; this.closeStore = undefined }
}

/** Native total-token prices already include cache/media/reasoning prices.
 * Only the two totals (or the provider's query-total carrier) are additive. */
export function projectModelMetrics(rows: MetricRecord[]): ModelMetricCall[] {
    const calls = new Map<string, ModelMetricCall>()
    const priced = new Map<string, Set<string>>()
    const seen = new Set<string>()
    for (const row of rows) {
      if (!row.runId || !row.spanId || !row.name.startsWith('mastra_model_')) continue
      const key = `${row.traceId}:${row.spanId}`, unique = `${key}:${row.name}`
      if (seen.has(unique)) continue
      seen.add(unique)
      const call = calls.get(key) ?? { id: key, runId: row.runId, conversationId: row.threadId ?? '', startedAt: row.timestamp.toISOString(), phase: String(row.metadata?.phase ?? 'model'), ...(row.metadata?.metricScope === 'utility' ? { scope: 'utility' as const } : {}), usage: {}, costs: [], provider: row.provider ?? undefined, model: row.model ?? undefined }
      calls.set(key, call)
      call.provider ??= row.provider ?? undefined
      call.model ??= row.model ?? undefined
      if (row.name === 'mastra_model_duration_ms') call.startedAt = new Date(row.timestamp.getTime() - row.value).toISOString()
      if (row.name === 'mastra_model_total_input_tokens') call.usage.inputTokens = row.value
      if (row.name === 'mastra_model_total_output_tokens') call.usage.outputTokens = row.value
      if (row.name === 'mastra_model_input_cache_read_tokens') call.cacheReadTokens = row.value
      if (row.name === 'mastra_model_input_cache_write_tokens') call.cacheWriteTokens = row.value
      if (row.name === 'mastra_model_output_reasoning_tokens') call.reasoningTokens = row.value
      const total = row.name === 'mastra_model_total_input_tokens' || row.name === 'mastra_model_total_output_tokens'
      if (total && row.estimatedCost != null && Number.isFinite(row.estimatedCost) && row.costUnit) {
        const cost = call.costs.find(item => item.currency === row.costUnit)
        if (cost) cost.amount += row.estimatedCost
        else call.costs.push({ currency: row.costUnit, amount: row.estimatedCost })
        if (!row.costMetadata?.error) {
          const fields = priced.get(key) ?? new Set<string>()
          fields.add(row.costMetadata?.allocation === 'query_total' ? 'query' : row.name)
          priced.set(key, fields)
        }
      }
    }
    for (const [key, call] of calls) {
      if (call.usage.inputTokens !== undefined && call.usage.outputTokens !== undefined) call.usage.totalTokens = call.usage.inputTokens + call.usage.outputTokens
      const fields = priced.get(key)
      call.costComplete = !!(fields?.has('query') || fields?.has('mastra_model_total_input_tokens') && fields.has('mastra_model_total_output_tokens'))
    }
    return [...calls.values()]
}
