/*
 * [INPUT]: 版本化样本评分和可选基线，同批原始结果索引。
 * [OUTPUT]: 按类别分母/错误/未知用量/阶段耗时的 JSON 与可筛选 HTML；不把 pending 当通过。
 * [POS]: tests/evaluation/report.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EvaluationRecord, EvaluationScore } from './schema'
import { DATASET_VERSION, SCORER_VERSION } from './schema'
const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
export function summarize(scores: EvaluationScore[]) {
  const groups: Record<string, EvaluationScore[]> = {}
  for (const score of scores) (groups[score.category] ??= []).push(score)
  return { started: scores.length, passed: scores.filter(score => score.verdict === 'passed').length, failed: scores.filter(score => score.verdict === 'failed').length, incomplete: scores.filter(score => score.verdict === 'incomplete').length, reviewNeeded: scores.filter(score => score.verdict === 'review-needed').length,
    healthy: scores.filter(score => !score.runtimeErrors.length).length, providerRequests: scores.reduce((sum, score) => sum + score.providerRequests, 0),
    usageKnownSamples: scores.filter(score => score.totalTokens !== null).length,
    totalTokens: scores.every(score => score.totalTokens !== null) ? scores.reduce((sum, score) => sum + score.totalTokens!, 0) : null,
    categories: Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, { passed: rows!.filter(score => score.verdict === 'passed').length, started: rows!.length, distinctClusters: new Set(rows!.map(score => score.cluster)).size }])) }
}
export function compareResults(current: { record: EvaluationRecord; score: EvaluationScore }[], baseline: { record: EvaluationRecord; score: EvaluationScore }[]) {
  return current.map(candidate => {
    const previous = baseline.find(item => item.record.caseId === candidate.record.caseId)
    const comparable = previous && previous.record.metadata.datasetHash && previous.record.metadata.datasetHash === candidate.record.metadata.datasetHash && previous.record.metadata.model === candidate.record.metadata.model && previous.record.metadata.modelSignature === candidate.record.metadata.modelSignature && previous.record.metadata.requestLimit === candidate.record.metadata.requestLimit && previous.score.scorerVersion === candidate.score.scorerVersion
    return { caseId: candidate.record.caseId, comparable: !!comparable, comparison: previous?.record.metadata.team !== candidate.record.metadata.team ? 'single-vs-multi' : 'code-or-prompt', reason: comparable ? '同任务、数据合同、模型、总请求上限与评分版本；配置差异见逐样本证据，小样本不代表统计显著' : '缺少同题基线或数据/模型/预算/评分版本不一致', ...(comparable ? { previous: previous.score.verdict, current: candidate.score.verdict, lastReplyDeltaMs: previous.score.lastReplyMs !== null && candidate.score.lastReplyMs !== null ? candidate.score.lastReplyMs - previous.score.lastReplyMs : null, requestsDelta: candidate.score.providerRequests - previous.score.providerRequests } : {}) }
  })
}
export async function writeReport(output: string, rows: { record: EvaluationRecord; score: EvaluationScore }[], baseline: { record: EvaluationRecord; score: EvaluationScore }[] = []) {
  await mkdir(output, { recursive: true })
  const summary = { datasetVersion: DATASET_VERSION, scorerVersion: SCORER_VERSION, ...summarize(rows.map(row => row.score)), scores: rows.map(row => row.score), comparison: compareResults(rows, baseline) }
  await writeFile(join(output, 'scores.json'), JSON.stringify(summary, null, 2))
  const templates = rows.filter(({ score }) => score.judgeStatus === 'pending').map(({ record, score }) => ({ caseId: record.caseId, sampleHash: score.sampleHash, scorerVersion: SCORER_VERSION, source: 'human', reviewer: '', criteria: (record.scenario?.semantic ?? []).map(criterion => ({ criterion, score: null, evidence: [], reason: '' })) }))
  await writeFile(join(output, 'review-template.json'), JSON.stringify(templates, null, 2))
  const table = rows.map(({ record, score }) => `<tr data-status="${score.verdict}" data-category="${escape(score.category)}"><td>${escape(score.caseId)}<small>${escape(score.split)} · ${escape(score.cluster)}</small></td><td>${score.verdict}<small>执行 ${score.executionStatus} / 目标 ${score.goalVerdict} / 评审 ${score.judgeStatus}</small></td><td>${score.runtimeErrors.length}</td><td>${score.firstReplyMs ?? '未知'} / ${score.lastReplyMs ?? '未知'} / ${score.turnCompletedMs ?? '未知'} / ${score.totalMs}</td><td>${score.providerRequests} / ${score.totalTokens ?? '未知'}</td><td><details><summary>查看检查与证据</summary><pre>${escape(JSON.stringify({ checks: score.hardChecks, errors: score.runtimeErrors, metadata: record.metadata, events: record.events, phases: record.phases, detail: record.detail, artifacts: record.artifacts }, null, 2))}</pre></details></td></tr>`).join('')
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoAI 协作评估</title><style>body{font:15px system-ui;margin:32px;color:#202532;background:#f7f8fa}h1{font-size:26px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}small{display:block;color:#666;margin-top:6px}pre{white-space:pre-wrap;max-width:650px;max-height:450px;overflow:auto}select{padding:8px;margin:12px}tr[data-status=failed]{background:#fff0f0}tr[data-status=incomplete],tr[data-status=review-needed]{background:#fff9e8}</style><h1>BoAI 多 Agent 协作评估</h1><p>${escape(DATASET_VERSION)} · ${escape(SCORER_VERSION)}</p><p>已启动 ${summary.started}，通过 ${summary.passed}，失败 ${summary.failed}，证据不完整 ${summary.incomplete}，待评审 ${summary.reviewNeeded}。无运行错误 ${summary.healthy}。完整用量 ${summary.usageKnownSamples}/${summary.started}。</p><p>时间列依次为首条完成回复 / 最后完成回复 / 轮次结束 / 全阶段，单位毫秒。包含失败样本；没有人工标签时不宣称人工通过。连接检查与全局预算另见运行目录的 summary.json 和预算账本。</p><label>状态<select id="status"><option value="">全部</option>${['passed','failed','incomplete','review-needed'].map(status => `<option>${status}</option>`).join('')}</select></label><label>分类<select id="category"><option value="">全部</option>${Object.keys(summary.categories).map(category => `<option>${escape(category)}</option>`).join('')}</select></label><table><thead><tr><th>场景</th><th>结论</th><th>运行错误</th><th>阶段耗时</th><th>请求 / token</th><th>原始证据</th></tr></thead><tbody>${table}</tbody></table><h2>版本比较</h2><pre>${escape(JSON.stringify(summary.comparison,null,2))}</pre><script>const controls=[document.getElementById('status'),document.getElementById('category')];for(const control of controls)control.onchange=()=>{for(const row of document.querySelectorAll('tbody tr'))row.hidden=!!((controls[0].value&&row.dataset.status!==controls[0].value)||(controls[1].value&&row.dataset.category!==controls[1].value))}</script></html>`)
  return summary
}
