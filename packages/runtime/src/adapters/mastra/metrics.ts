/*
 * [INPUT]: Mastra's native metric events and BOAI run/conversation identities.
 * [OUTPUT]: Official metric storage/query, provider cost estimates and product-facing projections.
 * [POS]: Local observability adapter; never prices tokens or enforces implicit budgets.
 * [PROTOCOL]: Changes update this Header and mastra/.folder.md.
 */
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { InMemoryStore, MastraCompositeStore, type MetricRecord } from '@mastra/core/storage'
import { MastraStorageExporter } from '@mastra/observability'
import type { ObservabilityExporter } from '@mastra/core/observability'
import type { EngineContext } from '../../contracts'
import type { ModelMetricCall } from '@boai/shared/domain/profile'

const owner = Symbol('boai-mastra-metrics')
export type MetricContext = Pick<EngineContext, 'runId' | 'apiKey' | 'onTrace' | 'onTraceError'> & { conversation: { id: string }; agent: { id: string }; metricScope?: 'utility' }
type BoundContext = MetricContext & { [owner]?: MastraMetrics }
export function bindMetrics<T extends MetricContext>(context: T, metrics: MastraMetrics): T { return { ...context, [owner]: metrics } }
export function contextMetrics(context: MetricContext) { return (context as BoundContext)[owner] }

export class MastraMetrics {
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
    return {
      name: 'boai-native-metrics',
      init: options => native.init(options),
      // Product trace storage already owns redacted inputs/outputs. Persist
      // native metrics here without duplicating private prompts in a second DB.
      exportTracingEvent: async () => {},
      onMetricEvent: event => native.onMetricEvent({ ...event, metric: { ...event.metric,
        correlationContext: { ...event.metric.correlationContext, runId: context.runId, threadId: context.conversation.id, resourceId: context.agent.id },
        metadata: { ...event.metric.metadata, phase, metricScope: context.metricScope },
      } }),
      flush: () => native.flush(),
      shutdown: () => native.shutdown(),
    }
  }
  async calls(runIds?: string[]): Promise<ModelMetricCall[]> {
    const store = await (await this.storage()).getStore('observability')
    const rows: MetricRecord[] = []
    for (let page = 0; ; page++) {
      const result = await store!.listMetrics({ filters: { name: ['mastra_model_duration_ms', 'mastra_model_total_input_tokens', 'mastra_model_total_output_tokens', 'mastra_model_input_cache_read_tokens', 'mastra_model_input_cache_write_tokens', 'mastra_model_output_reasoning_tokens'] }, pagination: { page, perPage: 100 }, orderBy: { field: 'timestamp', direction: 'ASC' } })
      rows.push(...result.metrics)
      if (!result.pagination?.hasMore) break
    }
    const retained = runIds && new Set(runIds)
    return projectModelMetrics(rows).filter(call => !retained || call.scope === 'utility' || retained.has(call.runId))
  }
  async forgetConversation(threadId: string) {
    const store = await (await this.storage()).getStore('observability')
    const traces = new Set<string>()
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
