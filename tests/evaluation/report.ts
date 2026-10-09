/*
 * [INPUT]: 版本化样本评分和可选基线，同批原始结果索引。
 * [OUTPUT]: 原服务评分及桌面证据报告、统一尝试投影与严格完整配对；未知用量/待评审保持，不自动选优。
 * [POS]: tests/evaluation/report.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { EvaluationRecord, EvaluationScore } from './schema'
import { DATASET_VERSION, SCORER_VERSION } from './schema'
import { experimentReport, serviceTrial, compareTrials, type EvaluationTrial } from './experiment'
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
  return compareTrials(current.map(serviceTrial), baseline.map(serviceTrial)).pairs
}
function renderExperiment(experiment: ReturnType<typeof experimentReport>) {
  return `<section><h2>实验比较</h2><p>技术通过、目标通过与人工待评分别显示。调用口径不跨入口混算；当前只提供描述性配对，不自动选优，不宣称统计显著或人工认可。</p><pre>${escape(JSON.stringify({ version: experiment.version, summary: experiment.summary, comparison: experiment.comparison }, null, 2))}</pre></section>`
}

export async function writeDesktopReport(output: string, trials: EvaluationTrial[], baseline: EvaluationTrial[] = []) {
  const experiment = experimentReport(trials, baseline)
  const summary = { source: 'desktop-evidence-v1', started: experiment.summary.attempted, passed: experiment.summary.passed, failed: experiment.summary.failed,
    incomplete: experiment.summary.incomplete, reviewNeeded: experiment.summary.reviewNeeded, experiment }
  await writeFile(join(output, 'scores.json'), JSON.stringify(summary, null, 2))
  const table = trials.map(trial => `<tr><td>${escape(trial.caseId)}<br>sample ${trial.sample ?? '未知'} / retry ${trial.retry}</td><td>${escape(trial.modelMode)}</td><td>${trial.technical}</td><td>${trial.verdict}</td><td>${trial.requests ?? '未知'} / ${trial.totalTokens ?? '未知'}<br>已知token ${trial.knownTokens ?? '未知'}</td><td><details><summary>原始证据与缺口</summary><pre>${escape(JSON.stringify({ sampleHash: trial.sampleHash, evidence: trial.evidence, issues: trial.issues }, null, 2))}</pre></details></td></tr>`).join('')
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoAI 桌面评估</title><style>body{font:15px system-ui;margin:32px;color:#202532}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:12px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto}</style><h1>BoAI 桌面证据评估</h1><p>已列出 ${trials.length} 次尝试，技术通过 ${experiment.summary.technicalPassed}，完整通过 ${summary.passed}，失败 ${summary.failed}，不完整 ${summary.incomplete}，待评审 ${summary.reviewNeeded}。</p><p>本页离线核对已有BDD最终结果与清单内原件；没有重新运行模型，没有重新判定内容质量。原场景成功仍待独立语义评审，原失败保持。证据路径相对各自输入批次；用量不完整不按零处理。</p><table><thead><tr><th>题目与尝试</th><th>运行来源</th><th>技术结果</th><th>评估结果</th><th>调用 / 完整token</th><th>证据</th></tr></thead><tbody>${table}</tbody></table>${renderExperiment(experiment)}</html>`)
  return summary
}
export async function writeReport(output: string, rows: { record: EvaluationRecord; score: EvaluationScore }[], baseline: { record: EvaluationRecord; score: EvaluationScore }[] = []) {
  await mkdir(output, { recursive: true })
  const experiment = experimentReport(rows.map(serviceTrial), baseline.map(serviceTrial))
  const summary = { datasetVersion: DATASET_VERSION, scorerVersion: SCORER_VERSION, deliveryVersions: [...new Set(rows.flatMap(({ record }) => record.delivery ? [record.delivery.version] : []))], ...summarize(rows.map(row => row.score)), scores: rows.map(row => row.score), comparison: baseline.length ? compareResults(rows, baseline) : [], experiment }
  await writeFile(join(output, 'scores.json'), JSON.stringify(summary, null, 2))
  const templates = rows.filter(({ score }) => score.judgeStatus === 'pending').map(({ record, score }) => ({ caseId: record.caseId, sampleHash: score.sampleHash, scorerVersion: SCORER_VERSION, source: 'human', reviewer: '', criteria: (record.scenario?.semantic ?? []).map(criterion => ({ criterion, score: null, evidence: [], reason: '' })) }))
  await writeFile(join(output, 'review-template.json'), JSON.stringify(templates, null, 2))
  const table = rows.map(({ record, score }) => `<tr data-status="${score.verdict}" data-category="${escape(score.category)}"><td>${escape(score.caseId)}<small>${escape(score.split)} · ${escape(score.cluster)}</small>${record.delivery ? `<small>${escape(record.delivery.version)} · 脚本采用仅技术留证，人工质量见独立评审</small>` : ''}</td><td>${score.verdict}<small>执行 ${score.executionStatus} / 目标 ${score.goalVerdict} / 评审 ${score.judgeStatus}</small></td><td>${score.runtimeErrors.length}</td><td>${score.firstReplyMs ?? '未知'} / ${score.lastReplyMs ?? '未知'} / ${score.turnCompletedMs ?? '未知'} / ${score.totalMs}</td><td>${score.providerRequests} / ${score.totalTokens ?? '未知'}</td><td><details><summary>查看检查与证据</summary><pre>${escape(JSON.stringify({ checks: score.hardChecks, errors: score.runtimeErrors, metadata: record.metadata, events: record.events, phases: record.phases, detail: record.detail, artifacts: record.artifacts, delivery: record.delivery }, null, 2))}</pre></details></td></tr>`).join('')
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoAI 协作评估</title><style>body{font:15px system-ui;margin:32px;color:#202532;background:#f7f8fa}h1{font-size:26px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}small{display:block;color:#666;margin-top:6px}pre{white-space:pre-wrap;max-width:650px;max-height:450px;overflow:auto}select{padding:8px;margin:12px}tr[data-status=failed]{background:#fff0f0}tr[data-status=incomplete],tr[data-status=review-needed]{background:#fff9e8}</style><h1>BoAI 多 Agent 协作评估</h1><p>${escape(DATASET_VERSION)} · ${escape(SCORER_VERSION)}</p><p>已启动 ${summary.started}，通过 ${summary.passed}，失败 ${summary.failed}，证据不完整 ${summary.incomplete}，待评审 ${summary.reviewNeeded}。无运行错误 ${summary.healthy}。完整用量 ${summary.usageKnownSamples}/${summary.started}。</p><p>时间列依次为首条完成回复 / 最后完成回复 / 轮次结束 / 全阶段，单位毫秒。包含失败样本；没有人工标签时不宣称人工通过。连接检查与全局预算另见运行目录的 summary.json 和预算账本。</p><label>状态<select id="status"><option value="">全部</option>${['passed','failed','incomplete','review-needed'].map(status => `<option>${status}</option>`).join('')}</select></label><label>分类<select id="category"><option value="">全部</option>${Object.keys(summary.categories).map(category => `<option>${escape(category)}</option>`).join('')}</select></label><table><thead><tr><th>场景</th><th>结论</th><th>运行错误</th><th>阶段耗时</th><th>请求 / token</th><th>原始证据</th></tr></thead><tbody>${table}</tbody></table><h2>版本比较</h2><pre>${escape(JSON.stringify(summary.comparison,null,2))}</pre>${renderExperiment(experiment)}<script>const controls=[document.getElementById('status'),document.getElementById('category')];for(const control of controls)control.onchange=()=>{for(const row of document.querySelectorAll('tbody tr'))row.hidden=!!((controls[0].value&&row.dataset.status!==controls[0].value)||(controls[1].value&&row.dataset.category!==controls[1].value))}</script></html>`)
  return summary
}
