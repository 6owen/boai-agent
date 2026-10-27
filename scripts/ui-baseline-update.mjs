/*
 * [INPUT]: 用户确认后由Agent提交的候选run、已审阅SHA、明确case及原因。
 * [OUTPUT]: main上的受信代码核验官方原件，通过Git API只提交受影响基准并显式派发只读CI。
 * [POS]: 独立线上更新入口；不执行功能分支代码、不写main、不强推或自动接受普通CI失败。
 * [PROTOCOL]: 修改同步Header、目录地图及共享开发Skill。
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadCiCandidate, prepareCiBaseline } from './ui-ci-baseline.mjs'
import { CI_PROFILE } from './ui-profiles.mjs'

const repository = '6owen/boai-agent'
const prefix = `tests/e2e/baselines/${CI_PROFILE}/`
const api = (path, body) => {
  const output = execFileSync('gh', ['api', `repos/${repository}/${path}`, ...(body ? ['--method', path.startsWith('git/refs/') ? 'PATCH' : 'POST', '--input', '-'] : [])], { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })
  return output.trim() ? JSON.parse(output) : null
}

export function verifyOnlineUpdate(run, branchHead, expectedHead, env = process.env) {
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/ui-baseline-update.yml@refs/heads/main`) throw new Error('只能由main上的独立线上基准更新工作流执行')
  if (!/^[a-f0-9]{40}$/.test(expectedHead ?? '') || run.head_sha !== expectedHead || branchHead !== expectedHead) throw new Error('分支已变化或与已确认SHA不符，请审阅新增变化后重新采集')
  if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository || run.path !== '.github/workflows/ui-baseline-candidate.yml' || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success') throw new Error('需要成功的官方独立候选，执行失败不能更新基准')
  if (!run.head_branch || run.head_branch === 'main' || /[\r\n]/.test(run.head_branch)) throw new Error('只能更新明确功能分支，不能写main')
  return run.head_branch
}

// Only baseline bytes are sent to GitHub. No feature-branch script, hook or
// dependency is executed with the write token. Non-fast-forward updates fail.
export function publishBaselineUpdate({ branch, expectedHead, runId, files }, request = api) {
  if (!branch || branch === 'main' || !/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error('无效的更新目标')
  if (!files.length || !files.some(file => file.path === `${prefix}manifest.json`) || new Set(files.map(file => file.path)).size !== files.length || files.some(file => !file.path.startsWith(prefix) || !/^(manifest\.json|[a-z0-9][a-z0-9_-]*\.png)$/.test(file.path.slice(prefix.length)))) throw new Error('只能提交明确CI档案中的基准文件')
  const ref = `git/ref/heads/${branch}`
  const assertHead = () => { if (request(ref).object.sha !== expectedHead) throw new Error('接受期间远端分支变化，未覆盖新提交') }
  assertHead()
  const parent = request(`git/commits/${expectedHead}`)
  const tree = files.map(file => ({ path: file.path, mode: '100644', type: 'blob', sha: request('git/blobs', { content: file.content.toString('base64'), encoding: 'base64' }).sha }))
  const nextTree = request('git/trees', { base_tree: parent.tree.sha, tree })
  const commit = request('git/commits', { message: `test(ui): accept reviewed CI baselines from run ${runId}`, tree: nextTree.sha, parents: [expectedHead] })
  assertHead()
  request(`git/refs/heads/${branch}`, { sha: commit.sha, force: false })
  // GITHUB_TOKEN pushes are not sufficient to start checks. Dispatch explicitly.
  try { request('actions/workflows/tests.yml/dispatches', { ref: branch }) }
  catch (error) { throw new Error(`基准已提交 ${commit.sha}；只读CI派发失败，需为 ${branch} 补派 tests.yml：${error.message}`, { cause: error }) }
  return commit.sha
}

async function main() {
  const runId = process.env.UI_CANDIDATE_RUN, expectedHead = process.env.UI_APPROVED_HEAD
  if (!/^\d+$/.test(runId ?? '')) throw new Error('缺少候选run')
  const run = api(`actions/runs/${runId}`)
  // Validate the workflow context and candidate before resolving any branch ref.
  verifyOnlineUpdate(run, expectedHead, expectedHead)
  const branch = verifyOnlineUpdate(run, api(`git/ref/heads/${run.head_branch}`).object.sha, expectedHead)
  const root = resolve('.local/ui-update-target'), directory = join(process.env.RUNNER_TEMP, `ui-approved-${randomUUID()}`)
  const result = await downloadCiCandidate(root, runId, directory)
  const selected = (process.env.UI_APPROVED_CASES ?? '').split(',').map(value => value.trim())
  const { manifest } = await prepareCiBaseline(root, directory, result, selected, process.env.UI_APPROVAL_REASON)
  const files = [{ path: `${prefix}manifest.json`, content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') }]
  for (const id of selected) files.push({ path: `${prefix}${id}.png`, content: await readFile(join(directory, 'snapshots', `${id}.png`)) })
  const sha = publishBaselineUpdate({ branch, expectedHead, runId, files })
  const receipt = `Updated ${branch} to ${sha}; cases: ${selected.join(', ')}. Read-only UI tests dispatched; merge still requires Required checks.\n`
  console.log(receipt)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, receipt)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
