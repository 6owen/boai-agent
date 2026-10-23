/*
 * [INPUT]: 已评分的服务记录或已核验的桌面尝试；相同合同的基线与候选。
 * [OUTPUT]: 保留来源/重复/未知的统一实验投影、完整配对与按任务簇的描述性比较；不自动调参或宣称显著性。
 * [POS]: tests/evaluation/experiment.ts，两个现有入口共用的离线比较层。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import type { EvaluationRecord, EvaluationScore } from './schema'

export const EXPERIMENT_VERSION = 'boai-experiment-v1'
export interface EvaluationTrial {
  id: string; caseId: string; sample: number | null; retry: number; cluster: string; split: string
  source: 'service' | 'desktop'; modelMode: string; attempted: boolean
  technical: 'passed' | 'failed' | 'incomplete'; verdict: EvaluationScore['verdict']
  contractHash?: string; modelSignature?: string; budgetSignature?: string; sourceHash?: string; team?: string
  scorerVersion: string; sampleHash: string
  judgeStatus?: EvaluationScore['judgeStatus']
  requests: number | null; requestMetric: 'provider-attempts' | 'profile-calls' | 'unknown'
  totalTokens: number | null; knownTokens: number | null; durationMs: number | null
  evidence: string[]; issues: string[]
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function serviceTrial({ record, score }: { record: EvaluationRecord; score: EvaluationScore }): EvaluationTrial {
  const match = /^(.*)-(\d+)$/.exec(record.caseId)
  const sourceEntries = Object.entries(record.metadata.sourceHashes ?? {}).filter(([key]) => !key.startsWith('evaluation:')).sort(([a], [b]) => a.localeCompare(b))
  return {
    id: record.caseId, caseId: record.scenario?.id ?? match?.[1] ?? record.caseId,
    sample: match && Number(match[2]) > 0 ? Number(match[2]) : null, retry: 0,
    cluster: score.cluster, split: score.split, source: 'service', modelMode: 'service-adapter', attempted: record.sentAt > 0,
    technical: score.executionStatus === 'failed' || score.hardChecks.some(check => check.status === 'failed') ? 'failed'
      : score.executionStatus === 'incomplete' || score.hardChecks.some(check => check.status === 'incomplete') ? 'incomplete' : 'passed',
    verdict: score.verdict,
    contractHash: record.metadata.datasetHash ? digest({ dataset: record.metadata.datasetHash, scenario: record.scenario, deliveryVersion: record.delivery?.version }) : undefined,
    modelSignature: record.metadata.modelSignature ? digest({ signature: record.metadata.modelSignature, model: record.metadata.model, provider: record.metadata.provider }) : undefined,
    budgetSignature: finite(record.metadata.requestLimit) ? digest({ experimentRequests: record.metadata.requestLimit, caseRequests: record.scenario?.maxRequests, timeout: record.scenario?.timeoutMs }) : undefined,
    sourceHash: sourceEntries.length ? digest(sourceEntries) : undefined, team: record.metadata.team,
    scorerVersion: score.scorerVersion, sampleHash: score.sampleHash, judgeStatus: score.judgeStatus, requests: score.providerRequests, requestMetric: 'provider-attempts',
    totalTokens: score.totalTokens, knownTokens: score.totalTokens, durationMs: finite(score.totalMs) ? score.totalMs : null,
    evidence: [record.caseId + '.json'], issues: score.hardChecks.filter(check => check.status === 'incomplete').map(check => check.reason),
  }
}

export function summarizeTrials(trials: EvaluationTrial[]) {
  const count = (verdict: EvaluationTrial['verdict']) => trials.filter(trial => trial.verdict === verdict).length
  const groups = new Map<string, EvaluationTrial[]>()
  for (const trial of trials) {
    const key = `${trial.source}/${trial.modelMode}`
    groups.set(key, [...(groups.get(key) ?? []), trial])
  }
  return {
    listed: trials.length, attempted: trials.filter(trial => trial.attempted).length,
    passed: count('passed'), failed: count('failed'), incomplete: count('incomplete'), reviewNeeded: count('review-needed'),
    technicalPassed: trials.filter(trial => trial.technical === 'passed').length,
    cases: new Set(trials.map(trial => `${trial.source}:${trial.caseId}`)).size,
    clusters: new Set(trials.map(trial => `${trial.source}:${trial.cluster}`)).size,
    groups: [...groups].map(([source, rows]) => ({
      source, listed: rows.length, passed: rows.filter(row => row.verdict === 'passed').length,
      requestMetric: [...new Set(rows.map(row => row.requestMetric))],
      requests: rows.every(row => row.requests !== null) ? rows.reduce((sum, row) => sum + row.requests!, 0) : null,
      knownTokens: rows.some(row => row.knownTokens !== null) ? rows.reduce((sum, row) => sum + (row.knownTokens ?? 0), 0) : null,
      totalTokens: rows.every(row => row.totalTokens !== null) ? rows.reduce((sum, row) => sum + row.totalTokens!, 0) : null,
      usageKnownSamples: rows.filter(row => row.totalTokens !== null).length,
    })),
  }
}

const pairKey = (trial: EvaluationTrial) => JSON.stringify([trial.caseId, trial.sample, trial.retry])
export function compareTrials(current: EvaluationTrial[], baseline: EvaluationTrial[]) {
  const pairs = [...new Set([...baseline, ...current].map(pairKey))].sort().map(key => {
    const before = baseline.filter(row => pairKey(row) === key), after = current.filter(row => pairKey(row) === key)
    const previous = before[0], candidate = after[0], reasons: string[] = []
    if (before.length !== 1 || after.length !== 1) reasons.push('基线/候选缺少唯一同题同编号尝试；未匹配或重复记录不能被省略')
    if (previous && candidate) {
      if (previous.sample === null || candidate.sample === null) reasons.push('缺少独立采样编号')
      for (const field of ['source', 'modelMode', 'contractHash', 'modelSignature', 'budgetSignature', 'scorerVersion', 'team', 'cluster', 'split', 'requestMetric'] as const) {
        if (!previous[field] || !candidate[field] || previous[field] !== candidate[field]) reasons.push(`${field}缺失或不一致`)
      }
      if (!previous.sourceHash || !candidate.sourceHash) reasons.push('缺少代码输入版本，无法核对实验配置')
      if (previous.issues.length || candidate.issues.length) reasons.push('存在证据或运行登记缺口')
      if (previous.modelMode.includes('unknown') || previous.requestMetric === 'unknown') reasons.push('来源或调用口径未知')
    }
    const comparable = reasons.length === 0
    const resolved = comparable && previous && candidate && [previous.verdict, candidate.verdict].every(value => value === 'passed' || value === 'failed')
    return { key, caseId: candidate?.caseId ?? previous!.caseId, sample: candidate?.sample ?? previous?.sample, retry: candidate?.retry ?? previous?.retry,
      comparable, reasons, previous: previous?.verdict, current: candidate?.verdict,
      cluster: candidate?.cluster ?? previous!.cluster,
      delta: resolved ? Number(candidate!.verdict === 'passed') - Number(previous!.verdict === 'passed') : null,
      requestsDelta: comparable && previous!.requests !== null && candidate!.requests !== null ? candidate!.requests! - previous!.requests! : null,
    }
  })
  const issues: string[] = []
  for (const [name, rows] of [['baseline', baseline], ['candidate', current]] as const) {
    if (!rows.length) issues.push(`${name}为空`)
    if (new Set(rows.map(row => row.sourceHash)).size > 1) issues.push(`${name}混有多个代码输入版本`)
    if (rows.some(row => row.retry !== 0)) issues.push(`${name}包含失败重试，不能将最后成功当作独立首次尝试`)
  }
  if (pairs.some(pair => !pair.comparable)) issues.push('配对不完整或配置不可比')
  if (pairs.some(pair => pair.delta === null)) issues.push('存在待评审、不完整或不可比样本，不计算质量提升')
  const clusters = [...new Set(pairs.map(pair => pair.cluster))].map(cluster => {
    const rows = pairs.filter(pair => pair.cluster === cluster)
    return { cluster, pairs: rows.length, delta: rows.every(row => row.delta !== null) ? rows.reduce((sum, row) => sum + row.delta!, 0) / rows.length : null }
  })
  return { status: issues.length ? 'insufficient-evidence' as const : 'descriptive-only' as const, issues, pairs, clusters,
    clusterMeanDelta: !issues.length && clusters.length ? clusters.reduce((sum, row) => sum + row.delta!, 0) / clusters.length : null,
    decision: 'not-assessed' as const,
    note: '仅描述已保存样本；未登记抽样计划、统计区间或最终留出验收，不据此自动接受补丁。各入口独立比较，未匹配基线和失败均保留。',
  }
}

export function experimentReport(trials: EvaluationTrial[], baseline: EvaluationTrial[] = []) {
  return { version: EXPERIMENT_VERSION, summary: summarizeTrials(trials), trials,
    baseline: baseline.length ? summarizeTrials(baseline) : undefined,
    comparison: baseline.length ? compareTrials(trials, baseline) : undefined }
}
