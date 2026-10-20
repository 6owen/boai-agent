/*
 * [INPUT]: Actions实际步骤结果、确切提交和UI原始汇总。
 * [OUTPUT]: 固定必需门槛；失败、取消、缺文件/步骤或错误SHA均非通过。
 * [POS]: 离线CI证据汇总，发布也必须使用同一提交结论。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const selected = ['install', 'types', 'lint', 'unit', 'dataset', 'bdd']
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === b.length && b.every(value => a.includes(value))
export function validateGate(jobs, engineering, ui, caseIds, sha) {
  if (typeof sha !== 'string' || !sha.trim() || !caseIds.length || new Set(caseIds).size !== caseIds.length) throw new Error('缺少确切提交或完整场景合同')
  if (!['desktop', 'ui'].every(id => jobs[id]?.result === 'success')) throw new Error('必需任务失败、取消或未运行')
  if (engineering.status !== 'passed' || engineering.sha !== sha || !sameSet(engineering.selected, selected) || !selected.every(id => engineering.outcomes?.[id] === 'success')) throw new Error('工程报告缺失、不完整或提交不匹配')
  if (ui.status !== 'passed' || ui.source?.commit !== sha || ui.source?.dirty !== false || !sameSet(ui.cases, caseIds) || !Array.isArray(ui.errors) || ui.errors.length) throw new Error('UI报告缺失、不完整或提交不匹配')
}

const read = async file => JSON.parse(await readFile(file, 'utf8'))
async function main() {
  const [command, output] = process.argv.slice(2)
  if (command === 'record') {
    const steps = JSON.parse(process.env.CI_STEP_RESULTS ?? '{}')
    const failures = selected.filter(id => steps[id]?.outcome !== 'success')
    const result = { sha: process.env.GITHUB_SHA, head: process.env.CI_PR_HEAD || null, base: process.env.CI_PR_BASE || null, runId: process.env.GITHUB_RUN_ID, selected, outcomes: Object.fromEntries(selected.map(id => [id, steps[id]?.outcome ?? 'missing'])), status: failures.length ? 'failed' : 'passed' }
    await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2))
  } else if (command === 'gate') {
    const jobs = JSON.parse(process.env.CI_JOB_RESULTS ?? '{}')
    const engineering = await read('.local/ci-artifacts/engineering/engineering.json')
    const ui = await read('.local/ci-artifacts/ui/summary.json')
    const contract = await read('tests/e2e/baselines/contract.json')
    validateGate(jobs, engineering, ui, contract.cases.map(item => item.id), process.env.GITHUB_SHA)
    console.log(`Required checks passed: ${process.env.GITHUB_SHA}`)
  } else throw new Error('用法：ci-result.mjs record FILE | gate')
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
