/*
 * [INPUT]: Actions实际步骤结果、确切提交、UI原始报告及逐场景截图/回放。
 * [OUTPUT]: 同SHA工程/T1/全UI原报告和原件独立重核；缺失、跳过、重试、改字节均拒绝。
 * [POS]: 离线CI证据汇总，发布也必须使用同一提交结论。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { desktopPlanIdentity, selectDesktopCases, assertDesktopReport, desktopReportRows } from './desktop-plan.mjs'
import { verifyDesktopEvidence } from './desktop-evidence.mjs'

const selected = ['install', 'types', 'lint', 'build', 'unit', 'dataset', 'bdd']
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === b.length && b.every(value => a.includes(value))
export function validateGate(jobs, engineering, ui, caseIds, sha, evidence) {
  const { summary: desktop, report: desktopReport, identity } = evidence ?? {}
  if (typeof sha !== 'string' || !sha.trim() || !caseIds.length || new Set(caseIds).size !== caseIds.length) throw new Error('缺少确切提交或完整场景合同')
  if (!['desktop', 'ui'].every(id => jobs[id]?.result === 'success')) throw new Error('必需任务失败、取消或未运行')
  if (engineering.status !== 'passed' || engineering.sha !== sha || !sameSet(engineering.selected, selected) || !selected.every(id => engineering.outcomes?.[id] === 'success')) throw new Error('工程报告缺失、不完整或提交不匹配')
  if (ui.status !== 'passed' || ui.source?.commit !== sha || ui.source?.dirty !== false || !sameSet(ui.cases, caseIds) || !Array.isArray(ui.errors) || ui.errors.length) throw new Error('UI报告缺失、不完整或提交不匹配')
  if (!identity?.ids?.length || desktop?.tier !== 't1' || desktop.status !== 'passed' || desktop.source?.commit !== sha || desktop.source?.dirty !== false || desktop.planHash !== identity.hash || !sameSet(desktop.cases, identity.ids) || !Array.isArray(desktop.errors) || desktop.errors.length) throw new Error('T1报告缺失、旧计划、非T1或提交不匹配')
  assertDesktopReport(desktopReport, selectDesktopCases(identity, desktopReport, 't1'))
}

export async function verifyDesktopGate(directory, desktop, desktopReport, identity) {
  if (!desktop?.outputDirectory || !/^[a-f0-9]{64}$/.test(desktop.evidenceSha256 ?? '')) throw new Error('缺少本批原件核验身份')
  const proof = await verifyDesktopEvidence(directory, desktopReport, selectDesktopCases(identity, desktopReport, 't1'), desktop.outputDirectory)
  if (createHash('sha256').update(JSON.stringify(proof)).digest('hex') !== desktop.evidenceSha256) throw new Error('原件集合或登记已变化')
  return proof
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export async function uiEvidence(directory, ids) {
  const summaryBytes = await readFile(join(directory, 'summary.json'))
  const rawBytes = await readFile(join(directory, 'compare/playwright.json'))
  const comparisonBytes = await readFile(join(directory, 'compare/summary.json'))
  const summary = JSON.parse(summaryBytes), report = JSON.parse(rawBytes), comparison = JSON.parse(comparisonBytes)
  if (summary.profile !== 'github-macos15-arm64' || summary.environment?.version !== 3 || summary.status !== 'passed' || summary.source?.dirty !== false || !/^[a-f0-9]{40}$/.test(summary.source?.commit ?? '') || !/^[a-f0-9]{64}$/.test(summary.source?.sourceHash ?? '') || summary.built?.version !== 1 || !['inputHash', 'outputHash'].every(key => /^[a-f0-9]{64}$/.test(summary.built?.[key] ?? '')) || !sameSet(summary.cases, ids) || !Array.isArray(summary.errors) || summary.errors.length || comparison.status !== 'passed' || !sameSet(comparison.cases, ids) || !Array.isArray(comparison.errors) || comparison.errors.length || comparison.exit?.code !== 0 || comparison.exit?.signal !== null) throw new Error('UI原始比较或完整环境身份不合格')
  const rows = desktopReportRows(report)
  const selected = ids.map(id => {
    const matches = rows.filter(row => row.file === 'ui-regression.feature' && row.titles.at(-1) === `已登记界面 ${id} 保持行为布局和视觉基线`)
    if (matches.length !== 1) throw new Error(`UI原始场景缺失或重复：${id}`)
    return { ...matches[0], id }
  })
  assertDesktopReport(report, selected)
  for (const row of selected) {
    const attachments = row.tests[0].results[0].attachments ?? []
    const matches = attachments.filter(item => item.name === 'UI环境与页面' && item.contentType === 'application/json' && typeof item.body === 'string')
    if (matches.length !== 1) throw new Error('UI缺少唯一实际环境附件')
    const value = JSON.parse(Buffer.from(matches[0].body, 'base64').toString('utf8'))
    const displayRows = items => items.map(item => JSON.stringify(Object.entries(item).sort())).sort()
    if (!Array.isArray(value.display?.displays) || JSON.stringify(displayRows(value.display.displays)) !== JSON.stringify(displayRows(summary.environment.displays))) throw new Error('UI实际显示器不对应本批环境')
    if (value.caseId !== row.id || JSON.stringify(value.environment) !== JSON.stringify(summary.environment) || value.actual?.electron !== summary.environment.electron || value.actual?.packaged !== false || value.display?.onPrimary !== true || !Number.isInteger(value.display.windowId) || value.display.windowId < 1 || !Number.isInteger(value.display.webContentsId) || value.display.webContentsId < 1) throw new Error('UI实际环境附件不对应本批场景')
  }
  const configFile = report.config?.configFile
  if (typeof configFile !== 'string' || !configFile.startsWith('/') || !configFile.endsWith('/playwright.config.ts')) throw new Error('UI原报告缺少原执行目录身份')
  const original = resolve(dirname(configFile), '.local/ui-ci/compare')
  if (!report.config.projects?.length || report.config.projects.some(project => project.outputDir !== join(original, 'results') || project.retries !== 0 || project.repeatEach !== 1)) throw new Error('UI原执行目录或重试配置不对应')
  const proof = await verifyDesktopEvidence(join(directory, 'compare'), report, selected, original)
  return { version: 1, summarySha256: sha256(summaryBytes), comparisonSha256: sha256(comparisonBytes), reportSha256: sha256(rawBytes), proof }
}
export async function verifyUiGate(directory, ids) {
  const recorded = await read(join(directory, 'ui-evidence.json'))
  const actual = await uiEvidence(directory, ids)
  if (JSON.stringify(recorded) !== JSON.stringify(actual)) throw new Error('UI原始报告或原件集合已变化')
  return actual
}

const read = async file => JSON.parse(await readFile(file, 'utf8'))
async function main() {
  const [command, output] = process.argv.slice(2)
  if (command === 'record') {
    const steps = JSON.parse(process.env.CI_STEP_RESULTS ?? '{}')
    const failures = selected.filter(id => steps[id]?.outcome !== 'success')
    const result = { sha: process.env.GITHUB_SHA, head: process.env.CI_PR_HEAD || null, base: process.env.CI_PR_BASE || null, runId: process.env.GITHUB_RUN_ID, selected, outcomes: Object.fromEntries(selected.map(id => [id, steps[id]?.outcome ?? 'missing'])), status: failures.length ? 'failed' : 'passed' }
    await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2))
  } else if (command === 'record-ui') {
    const contract = await read('tests/e2e/baselines/contract.json')
    const proof = await uiEvidence(output, contract.cases.map(item => item.id))
    await writeFile(join(output, 'ui-evidence.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
  } else if (command === 'gate') {
    const jobs = JSON.parse(process.env.CI_JOB_RESULTS ?? '{}')
    const engineering = await read('.local/ci-artifacts/engineering/engineering.json')
    const ui = await read('.local/ci-artifacts/ui/summary.json')
    const contract = await read('tests/e2e/baselines/contract.json')
    const identity = desktopPlanIdentity(await readFile('tests/e2e/test-tiers.json'))
    const desktop = await read('.local/ci-artifacts/t1/summary.json')
    const desktopReport = await read('.local/ci-artifacts/t1/playwright.json')
    validateGate(jobs, engineering, ui, contract.cases.map(item => item.id), process.env.GITHUB_SHA, { summary: desktop, report: desktopReport, identity })
    await verifyDesktopGate('.local/ci-artifacts/t1', desktop, desktopReport, identity)
    await verifyUiGate('.local/ci-artifacts/ui', contract.cases.map(item => item.id))
    console.log(`Required checks passed: ${process.env.GITHUB_SHA}`)
  } else throw new Error('用法：ci-result.mjs record FILE | record-ui DIR | gate')
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
