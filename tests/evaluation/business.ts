/*
 * [INPUT]: 固定业务任务的开发/验证分组、重复执行结果、质量和请求成本约束。
 * [OUTPUT]: 按任务簇等权的业务评分、重复波动和有界差值区间；验证不改善/缺评审不能提升候选。
 * [POS]: tests/evaluation/business.ts，真实服务实验的业务选优合同，不运行开发测试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { compareTrials, type EvaluationTrial } from './experiment'

export interface BusinessPlan {
  cases: string[]; validationCases?: string[]; samples: number; maxRounds: number; minimumGain: number; maxCallRatio: number
  tasks: { id: string; cluster: string }[]
}
function weighted(rows: EvaluationTrial[]) {
  const clusters = new Set(rows.map(row => row.cluster))
  return rows.map(row => {
    const cluster = rows.filter(value => value.cluster === row.cluster)
    const tasks = new Set(cluster.map(value => value.caseId))
    return { row, weight: 1 / clusters.size / tasks.size / cluster.filter(value => value.caseId === row.caseId).length }
  })
}
export function businessDiagnostics(rows: EvaluationTrial[]) {
  const resolved = rows.length > 0 && rows.every(row => ['passed', 'failed'].includes(row.verdict))
  const values = weighted(rows), rate = resolved ? Math.min(1, Math.max(0, values.reduce((sum, value) => sum + value.weight * Number(value.row.verdict === 'passed'), 0))) : null
  const samples = [...new Set(rows.map(row => row.sample))]
  const repeatRates = resolved ? samples.map(sample => weighted(rows.filter(row => row.sample === sample)).reduce((sum, value) => sum + value.weight * Number(value.row.verdict === 'passed'), 0)) : []
  return { tasks: new Set(rows.map(row => row.caseId)).size, clusters: new Set(rows.map(row => row.cluster)).size,
    samples: rows.length, repeats: samples.length, passed: rows.filter(row => row.verdict === 'passed').length,
    failed: rows.filter(row => row.verdict === 'failed').length, pending: rows.filter(row => !['passed', 'failed'].includes(row.verdict)).length,
    rate, observedNoise: repeatRates.length > 1 ? Math.max(...repeatRates) - Math.min(...repeatRates) : null,
    saturated: rate !== null && rate >= 0.95,
    requests: rows.every(row => row.requests !== null) ? rows.reduce((sum, row) => sum + row.requests!, 0) : null,
    tokens: rows.every(row => row.totalTokens !== null) ? rows.reduce((sum, row) => sum + row.totalTokens!, 0) : null,
  }
}
/** Hoeffding bound for a fixed suite, conditional on independent bounded trial pairs.
 * Cluster/task weights prevent variants from receiving extra weight. Repeats are NOT new business tasks.
 * Bonferroni covers the predeclared rounds and two partitions; it does not certify adaptive population generalization.
 */
export function businessDifference(current: EvaluationTrial[], baseline: EvaluationTrial[], maxRounds: number) {
  const paired = compareTrials(current, baseline), values = weighted(current)
  if (paired.issues.length) return { delta: null, interval: null, issues: paired.issues }
  const before = new Map(baseline.map(row => [`${row.caseId}:${row.sample}`, row]))
  const delta = Math.max(-1, Math.min(1, values.reduce((sum, { row, weight }) => sum + weight * (Number(row.verdict === 'passed') - Number(before.get(`${row.caseId}:${row.sample}`)!.verdict === 'passed')), 0)))
  const alpha = 0.05 / (2 * maxRounds)
  const radius = Math.sqrt(2 * values.reduce((sum, value) => sum + value.weight ** 2, 0) * Math.log(2 / alpha))
  return { delta, interval: [Math.max(-1, delta - radius), Math.min(1, delta + radius)], issues: [] as string[] }
}
export function businessComparison(plan: BusinessPlan, current: EvaluationTrial[], baseline?: EvaluationTrial[]) {
  const group = (ids: string[]) => {
    const after = current.filter(row => ids.includes(row.caseId)), before = baseline?.filter(row => ids.includes(row.caseId))
    return { current: businessDiagnostics(after), baseline: before ? businessDiagnostics(before) : undefined,
      difference: before ? businessDifference(after, before, plan.maxRounds) : undefined }
  }
  return { development: group(plan.cases), validation: group(plan.validationCases ?? []),
    scope: 'fixed-business-suite' as const, confidence: 0.95,
    assumptions: '固定候选/独立trial-pair假设下的名义诊断界，按簇/题目等权并按登记轮数和两组校正。复用基线和自适应生成/选优不获得无条件95%覆盖保证；验证集不是最终未见题。' }
}
export function businessDecision(plan: BusinessPlan, current: EvaluationTrial[], baseline: EvaluationTrial[], calls: { current: number; baseline: number }) {
  const comparison = businessComparison(plan, current, baseline), reasons: string[] = []
  for (const [name, group] of Object.entries({ development: comparison.development, validation: comparison.validation })) {
    if (group.current.clusters < 2 || plan.samples < 3) reasons.push(`${name}至少需要两个任务簇、每题三次；探路不能选优`)
    if ((group.baseline?.observedNoise ?? Infinity) >= plan.minimumGain) reasons.push(`${name}基线重复波动不小于最小收益，应重新设计或登记更多采样`)
  }
  if (reasons.length) return { status: 'blocked' as const, reasons, business: comparison }
  if (calls.current > calls.baseline * plan.maxCallRatio) return { status: 'regressed' as const, reasons: ['包含探针和失败的实际请求成本超过登记比例'], business: comparison }
  const regressedTasks = plan.tasks.filter(task => {
    const rate = (rows: EvaluationTrial[]) => { const selected = rows.filter(row => row.caseId === task.id); return selected.filter(row => row.verdict === 'passed').length / selected.length }
    return rate(current) < rate(baseline)
  })
  if (regressedTasks.length) return { status: 'regressed' as const, reasons: ['至少一个业务任务的重复成功率退化，不能由平均收益抵消'], business: comparison }
  if ([comparison.development, comparison.validation].some(group => (group.difference?.delta ?? -1) < 0)) return { status: 'regressed' as const, reasons: ['开发或独立验证任务质量退化'], business: comparison }
  if ((comparison.development.difference?.delta ?? 0) >= plan.minimumGain && (comparison.validation.difference?.delta ?? 0) < plan.minimumGain) return { status: 'no-improvement' as const, reasons: ['开发集改善而独立验证未达门槛，拒绝候选并保留过拟合线索'], business: comparison }
  if ([comparison.development, comparison.validation].some(group => !group.difference?.interval || group.difference.delta! < plan.minimumGain || group.difference.interval[0] <= 0)) return { status: 'no-improvement' as const, reasons: ['收益未超过登记门槛或差值区间包含零；证据不足，保留原版本'], business: comparison }
  return { status: 'promising' as const, reasons: ['真实开发与独立验证均改善且超过区间门槛；仅固定业务集候选，不是发布/最终留出认证'], business: comparison }
}
