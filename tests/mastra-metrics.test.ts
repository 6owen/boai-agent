/*
 * [INPUT]: Official metric records and historical activity receipts.
 * [OUTPUT]: Cache/reasoning cost deduplication, provider totals, unknown/partial pricing and legacy/native isolation.
 * [POS]: Metrics-to-product projection acceptance; does not duplicate Mastra pricing formulas.
 * [PROTOCOL]: Update Header and tests/.folder.md on changes.
 */
import { expect, it } from 'vitest'
import type { MetricRecord } from '@mastra/core/storage'
import type { AgentRun } from '../packages/shared/src/domain'
import { projectModelMetrics } from '../packages/runtime/src/adapters/mastra/metrics'
import { aggregateActivity, type ActivityEvidence } from '../packages/runtime/src/modules/profile/profile-activity'
const metric = (name: string, value: number, extra: Partial<MetricRecord> = {}): MetricRecord => ({ metricId: name, timestamp: new Date('2026-11-24T00:00:00Z'), name: `mastra_model_${name}`, value, labels: {}, runId: 'run', traceId: 'trace', spanId: 'span', threadId: 'chat', ...extra })

it('adds official input/output totals once without adding cache/reasoning detail prices again', () => {
  const rows = [metric('duration_ms', 1000), metric('total_input_tokens', 100, { provider: 'provider', model: 'model', estimatedCost: 0.1, costUnit: 'USD' }), metric('input_cache_read_tokens', 80, { estimatedCost: 0.04, costUnit: 'USD' }), metric('total_output_tokens', 20, { estimatedCost: 0.2, costUnit: 'USD' }), metric('output_reasoning_tokens', 10, { estimatedCost: 0.1, costUnit: 'USD' })]
  const [call] = projectModelMetrics([...rows, ...rows])
  expect(call).toMatchObject({ provider: 'provider', model: 'model', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, cacheReadTokens: 80, reasoningTokens: 10, costComplete: true, startedAt: '2026-11-23T23:59:59.000Z' })
  expect(call.costs).toHaveLength(1)
  expect(call.costs[0].amount).toBeCloseTo(0.3)
})

it('uses the native query-total cost carrier and preserves missing/partial prices', () => {
  expect(projectModelMetrics([metric('total_input_tokens', 100, { estimatedCost: 0.12, costUnit: 'USD', costMetadata: { allocation: 'query_total', source: 'provider_reported' } }), metric('total_output_tokens', 20)])[0]).toMatchObject({ costs: [{ currency: 'USD', amount: 0.12 }], costComplete: true })
  expect(projectModelMetrics([metric('duration_ms', 20)])[0]).toMatchObject({ usage: {}, costs: [], costComplete: false })
  expect(projectModelMetrics([metric('total_input_tokens', 100, { estimatedCost: 0.1, costUnit: 'USD', costMetadata: { error: 'partial_cost' } }), metric('total_output_tokens', 20)])[0]).toMatchObject({ costs: [{ currency: 'USD', amount: 0.1 }], costComplete: false })
})

it('replaces legacy receipts only for native-metric runs and keeps native agent usage excluded', () => {
  const run = (id: string, backend?: AgentRun['backend']) => ({ id, backend, conversationId: 'chat', status: 'completed', createdAt: '2026-11-24T00:00:00Z' }) as AgentRun
  const calls = ['run', 'old', 'native'].map(runId => ({ id: runId, runId, conversationId: 'chat', phase: 'chat', startedAt: '2026-11-24T00:00:00Z', budgetOwned: false, ...(runId === 'native' ? { callUnit: 'external-turn' as const } : {}), usage: { totalTokens: 999 } }))
  const metrics = projectModelMetrics([metric('total_input_tokens', 100), metric('total_output_tokens', 20)])
  const evidence: ActivityEvidence = { calls, metrics: [...metrics, { ...metrics[0], id: 'native-metric', runId: 'native' }, { ...metrics[0], id: 'deleted', runId: 'deleted' }, { ...metrics[0], id: 'utility', runId: 'utility', scope: 'utility' }], budgets: [], runs: [run('run'), run('old'), run('native')], messages: [], works: [], intervals: [], skills: [], resources: [] }
  const result = aggregateActivity(evidence, { from: '2026-11-01', to: '2026-11-30', timezone: 'UTC' }, '2026-11-24T02:00:00Z')
  expect(result.totalTokens).toBe(999 + 120 + 120)
  expect(result.days.find(day => day.date === '2026-11-24')?.calls).toBe(3)
  expect(result.unpricedCalls).toBe(3)
})

it('reads every official metrics page and deletes only the requested conversation', async () => {
  const { MastraMetrics } = await import('../packages/runtime/src/adapters/mastra/metrics')
  const metrics = new MastraMetrics()
  try {
    const domain = await (await metrics.storage()).getStore('observability')
    await domain!.batchCreateMetrics({ metrics: Array.from({ length: 151 }, (_, index) => metric('total_input_tokens', 10, { metricId: `metric-${index}`, traceId: `trace-${index}`, spanId: `span-${index}`, threadId: index ? 'keep' : 'delete' })) })
    expect(await metrics.calls()).toHaveLength(151)
    await metrics.forgetConversation('delete')
    expect(await metrics.calls()).toHaveLength(150)
    expect((await metrics.calls()).every(call => call.conversationId === 'keep')).toBe(true)
  } finally { await metrics.close() }
})

it('expires an exact-call approval receipt before detached work can reuse it', async () => {
  const { withToolAuthorization, hasToolAuthorization } = await import('../packages/runtime/src/modules/employees/tool-authorization')
  let release!: () => void, late!: Promise<boolean>
  const pending = new Promise<void>(resolve => { release = resolve })
  await withToolAuthorization({ runId: 'run', toolCallId: 'tool-1', kind: 'file' }, async () => {
    expect(hasToolAuthorization('run', 'file')).toBe(true)
    expect(hasToolAuthorization('other-run', 'file')).toBe(false)
    expect(hasToolAuthorization('run', 'command')).toBe(false)
    late = pending.then(() => hasToolAuthorization('run', 'file'))
  })
  release()
  expect(await late).toBe(false)
})
