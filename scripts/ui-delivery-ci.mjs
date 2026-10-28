/*
 * [INPUT]: PR context, official capture and unchanged readonly shard evidence.
 * [OUTPUT]: Pending visual review or failure; success only after ci-result gate-shards.
 * [POS]: UI workflow phase/check controller, not a baseline acceptance authority.
 * [PROTOCOL]: Update workflow, tests and scripts/.folder.md together.
 */
import { execFileSync } from 'node:child_process'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASELINE_PREFIX, UI_REPOSITORY, baselineOnlyCommit, deliveryOutcome } from './ui-delivery-protocol.mjs'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const api = (path, body, method = 'POST') => JSON.parse(execFileSync('gh', ['api', `repos/${UI_REPOSITORY}/${path}`, '--method', method, '--input', '-'], { input: JSON.stringify(body), encoding: 'utf8' }))
const output = async (key, value) => { if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); console.log(`${key}=${value}`) }
export function comparePng(actual, expected, options) {
  // Use exactly the comparator installed by the lockfile, including YIQ and AA.
  const require = createRequire(import.meta.url)
  const playwright = createRequire(createRequire(require.resolve('@playwright/test')).resolve('playwright'))
  return playwright('playwright-core/lib/coreBundle').utils.getComparator('image/png')(actual, expected, options)
}
export async function classifyCandidate(root, directory) {
  const { verifyBaselineReview } = await import('./ui-baseline-review.mjs')
  const { readUiBaseline, CI_PROFILE } = await import('./ui-profiles.mjs')
  const { validateReport, baselineContractHash } = await import('./ui-regression.mjs')
  const candidate = await json(join(directory, 'candidate.json')), contract = await json(join(root, 'tests/e2e/baselines/contract.json'))
  const ids = contract.cases.map(row => row.id), baseline = join(root, BASELINE_PREFIX)
  if (JSON.stringify(ids) !== JSON.stringify(candidate.selected) || Object.keys(candidate.cases).sort().join() !== [...ids].sort().join() || validateReport(await json(join(directory, 'capture/playwright.json')), ids).status !== 'passed' || (await json(join(directory, 'capture/summary.json'))).status !== 'passed') throw new Error('候选缺少全部场景一次成功的原件')
  await verifyBaselineReview(directory, ids, baseline, candidate)
  const previous = await json(join(baseline, 'manifest.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const environmentChanged = JSON.stringify(previous?.environment) !== JSON.stringify(candidate.environment)
  const changed = []
  for (const row of contract.cases) {
    if (candidate.cases[row.id].contract !== baselineContractHash(contract, row.id)) throw new Error('候选合同不匹配')
    if (environmentChanged || !previous?.cases?.[row.id] || previous.cases[row.id].contract !== candidate.cases[row.id].contract) { changed.push(row.id); continue }
    const old = await readUiBaseline({ id: CI_PROFILE, directory: baseline }, candidate.environment, row.id, candidate.cases[row.id].contract)
    const next = await readFile(join(directory, 'snapshots', `${row.id}.png`))
    if (comparePng(next, old, { threshold: row.threshold ?? contract.threshold, maxDiffPixels: contract.maxDiffPixels })) changed.push(row.id)
  }
  return { version: 1, source: candidate.source, review: changed.length ? 'required' : 'none', changed, environmentChanged }
}
export function checkPayload(outcome, sha, runId, attempt) {
  const review = outcome === 'review', success = outcome === 'passed'
  return {
    name: 'Required checks', head_sha: sha, external_id: `ui-delivery-${runId}-${attempt}`,
    status: review || outcome === 'started' ? 'in_progress' : 'completed',
    ...(!review && outcome !== 'started' ? { conclusion: success ? 'success' : 'failure' } : {}),
    details_url: `https://github.com/${UI_REPOSITORY}/actions/runs/${runId}`,
    output: { title: review ? 'UI 变化待 Agent 审阅' : success ? '全部 UI 只读复验通过' : outcome === 'started' ? 'UI 交付检查中' : 'UI 执行或证据校验失败', summary: review ? '行为/布局采集成功。Agent 执行 pnpm ui:deliver，审阅官方 old/new/diff 后提交受影响基准；本状态阻止合并，不占用 runner。' : success ? '原 ci-result gate-shards 已独立复核全部场景、当前 SHA 和原件。' : '查看本次 workflow 原件；不接受失败截图、不重试或降低断言。' }
  }
}
async function main() {
  const [command, directory] = process.argv.slice(2), env = process.env
  if (command === 'classify') {
    const result = await classifyCandidate(process.cwd(), resolve(directory))
    await writeFile(join(directory, 'delivery.json'), JSON.stringify(result, null, 2) + '\n')
    await output('review', result.review); await output('changed', result.changed.join(',')); return
  }
  if (env.GITHUB_REPOSITORY !== UI_REPOSITORY || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') || !/^\d+$/.test(env.GITHUB_RUN_ID ?? '')) throw new Error('无效的官方检查上下文')
  if (command === 'plan') {
    let mode = 'verify'
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const event = await json(env.GITHUB_EVENT_PATH), pr = event.pull_request
      if (pr.head.repo.full_name !== UI_REPOSITORY || pr.base.repo.full_name !== UI_REPOSITORY || git('rev-parse', 'HEAD') !== pr.head.sha) throw new Error('只接受同仓库当前 PR head')
      const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')
      const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n')
      const manifest = await json(BASELINE_PREFIX + 'manifest.json')
      mode = parents.length === 2 && baselineOnlyCommit(files, manifest, parents[1]) ? 'verify' : 'capture'
    }
    // Create a new pending check at this run's exact merge SHA, never reuse old green.
    const check = api('check-runs', checkPayload('started', env.GITHUB_SHA, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT))
    await output('check', check.id); await output('mode', mode); return
  }
  if (command !== 'finish') throw new Error('用法：ui-delivery-ci.mjs plan | classify 目录 | finish')
  const needs = JSON.parse(env.CI_JOB_RESULTS), state = deliveryOutcome(needs)
  let outcome = state
  if (state === 'verify') {
    try { execFileSync(process.execPath, ['scripts/ci-result.mjs', 'gate-shards'], { stdio: 'inherit' }); outcome = 'passed' } catch { outcome = 'failed' }
  }
  const payload = checkPayload(outcome, env.GITHUB_SHA, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT)
  const id = needs.plan?.outputs?.check
  if (id) { delete payload.head_sha; api(`check-runs/${id}`, payload, 'PATCH') }
  else api('check-runs', payload)
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${payload.output.title}\n\n${payload.output.summary}\n`)
  if (outcome === 'failed') process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1 })
