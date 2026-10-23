/*
 * [INPUT]: 保存的评估目录、可选独立评审/基线/校准标签。
 * [OUTPUT]: 服务重评分与显式桌面证据导入、统一实验报告；无供应商请求，失败/缺证据/待校准保持。
 * [POS]: tests/evaluation/rescore.ts，离线命令入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { cases } from './cases'
import { scoreRecord } from './checks'
import { writeReport, writeDesktopReport } from './report'
import { loadDesktopTrials } from './desktop'
import { calibrate, type CalibrationPair } from './calibration'
import type { EvaluationCase, EvaluationRecord, ExternalReview } from './schema'
export async function loadRecords(input: string, reviews: ExternalReview[] = [], calibratedReviewer?: string) {
  const rows = []
  for (const name of (await readdir(input)).filter(name => /-\d+\.json$/.test(name)).sort()) {
    const caseId = name.slice(0, -5), registered = cases.find(item => caseId.startsWith(`${item.id}-`))
    let record: EvaluationRecord
    try {
      record = JSON.parse(await readFile(join(input, name), 'utf8'))
      if (record.caseId !== caseId || !Array.isArray(record.requests) || !Array.isArray(record.artifacts) || !Array.isArray(record.runtimeErrors) || !record.metadata?.members) throw new Error('样本结构不完整')
    } catch (error) {
      record = { caseId, prompt: '', startedAt: 0, sentAt: 0, elapsedMs: 0, metadata: { label: input, revision: 'unknown', model: 'unknown', provider: 'unknown', members: [], sourceHashes: {} }, requests: [], artifacts: [], runtimeErrors: [String(error)], error: '原始样本损坏或缺失字段，未丢弃' }
    }
    const scenario: EvaluationCase = record.scenario ?? registered ?? { id: caseId, matrixId: '?', members: 0, prompt: record.prompt, criterion: '未知题目不可判通过', split: 'regression', category: '?', cluster: caseId, checks: [], semantic: ['缺少已注册评分合同'] }
    record.scenario = scenario
    const review = reviews.find(review => review.caseId === caseId)
    try { rows.push({ record, score: scoreRecord(record, scenario, review, !!calibratedReviewer && review?.reviewer === calibratedReviewer) }) }
    catch (error) { record = { ...record, detail: undefined, error: `评分记录不兼容：${String(error)}` }; rows.push({ record, score: scoreRecord(record, scenario) }) }
  }
  if (!rows.length) throw new Error('输入目录没有可重评分样本（caseId-编号.json）；未生成空的通过报告')
  return rows
}
export async function rescore(input: string, output: string, options: { baseline?: string; reviews?: ExternalReview[]; calibration?: CalibrationPair[] } = {}) {
  await mkdir(output, { recursive: false })
  const calibrated = options.calibration && calibrate(options.calibration).status === 'passed' ? options.calibration[0].modelReviewer : undefined
  const rows = await loadRecords(input, options.reviews, calibrated), baseline = options.baseline ? await loadRecords(options.baseline, options.reviews, calibrated) : []
  const summary = await writeReport(output, rows, baseline)
  if (options.calibration) await writeFile(join(output, 'calibration.json'), JSON.stringify(calibrate(options.calibration), null, 2))
  return summary
}

export async function rescoreDesktop(input: string, output: string, options: { baseline?: string } = {}) {
  const current = await loadDesktopTrials(input)
  const baseline = options.baseline ? await loadDesktopTrials(options.baseline) : undefined
  await mkdir(output, { recursive: false })
  const summary = await writeDesktopReport(output, current.trials, baseline?.trials)
  await writeFile(join(output, 'sources.json'), JSON.stringify({ current: current.input, baseline: baseline?.input,
    currentIssues: current.issues, baselineIssues: baseline?.issues ?? [], modelCalls: 0 }, null, 2))
  return summary
}
