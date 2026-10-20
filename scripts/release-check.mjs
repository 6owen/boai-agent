/*
 * [INPUT]: 明确稳定版本/提交、当前干净源码及同仓库main推送的完整必需检查。
 * [OUTPUT]: 只读发布前检；版本/buildVersion/主分支/SHA/最新测试尝试任一不符即拒绝，不创建Tag或资产。
 * [POS]: 第22组个人发布身份门槛；不执行安装、签名或替换应用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const releaseRepository = '6owen/boai-agent'
export function verifyReleaseIdentity({ version, sha, current, metadata, mainSha, run, jobs }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') || !version.split('.').every(part => Number.isSafeInteger(Number(part))) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('版本须为稳定X.Y.Z，提交须为完整SHA')
  if (current?.sha !== sha || current.dirty !== false || mainSha !== sha) throw new Error('发布必须是当前干净源码及远程main的同一提交')
  if (metadata?.version !== version || metadata?.build?.buildVersion !== version || metadata?.build?.appId !== 'com.boai.agent' || metadata?.build?.productName !== 'BoAI Agent') throw new Error('package版本/buildVersion或应用身份不匹配')
  if (run?.repository?.full_name !== releaseRepository || run?.head_repository?.full_name !== releaseRepository || run?.event !== 'push' || run?.head_branch !== 'main' || run?.path !== '.github/workflows/tests.yml' || run?.head_sha !== sha || run?.status !== 'completed' || run?.conclusion !== 'success' || !Number.isSafeInteger(run?.id) || run.id < 1 || !Number.isSafeInteger(run?.run_attempt) || run.run_attempt < 1) throw new Error('没有同SHA的main完整成功验证，候选工作流或PR结果不提供发布资格')
  const required = jobs.filter(job => job.name === 'Required checks')
  if (required.length !== 1 || !Number.isSafeInteger(required[0].id) || required[0].id < 1 || required[0].status !== 'completed' || required[0].conclusion !== 'success' || !required[0].completed_at) throw new Error('必需汇总缺失、重复或未通过')
  return { version, tag: `v${version}`, sha, appId: metadata.build.appId, buildVersion: metadata.build.buildVersion, validation: { runId: run.id, attempt: run.run_attempt, requiredJobId: required[0].id } }
}

async function main() {
  const args = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--version', '--sha'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('用法：release-check.mjs --version X.Y.Z --sha 完整提交')
    options[args[i]] = args[i + 1]
  }
  const version = options['--version'], sha = options['--sha']
  if (!version || !sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('必须明确版本与完整提交，不推断最新版本')
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const api = path => JSON.parse(execFileSync('gh', ['api', `repos/${releaseRepository}/${path}`], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }))
  const bytes = await readFile(join(root, 'package.json')), metadata = JSON.parse(bytes)
  const current = { sha: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')) }
  // Reject local/version mismatches before any remote request.
  if (current.sha !== sha || current.dirty || metadata.version !== version || metadata.build?.buildVersion !== version) throw new Error('源码不干净、SHA或版本/buildVersion不符；没有执行远程发布操作')
  const mainSha = api('git/ref/heads/main').object.sha
  const runs = api(`actions/workflows/tests.yml/runs?event=push&branch=main&head_sha=${sha}&per_page=100`).workflow_runs
  // Never choose an older green run to conceal the latest failed/pending run.
  const latest = [...runs].filter(run => run.head_sha === sha).sort((a, b) => b.id - a.id)[0]
  if (!latest) throw new Error('该main提交没有完整验证记录')
  const run = api(`actions/runs/${latest.id}`)
  const jobs = api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  if (jobs.total_count > jobs.jobs.length) throw new Error('必需任务列表不完整，不能发布')
  const identity = verifyReleaseIdentity({ version, sha, current, metadata, mainSha, run, jobs: jobs.jobs })
  // Re-read main and latest attempt after the remote calls; the release caller must
  // repeat this check immediately before a later write, not treat this as a lease.
  const finalRun = api(`actions/runs/${run.id}`)
  const finalLatest = api(`actions/workflows/tests.yml/runs?event=push&branch=main&head_sha=${sha}&per_page=100`).workflow_runs.filter(value => value.head_sha === sha).sort((a, b) => b.id - a.id)[0]
  if (api('git/ref/heads/main').object.sha !== sha || finalLatest?.id !== run.id || finalRun.run_attempt !== run.run_attempt || finalRun.status !== 'completed' || finalRun.conclusion !== 'success' || git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain') || !bytes.equals(await readFile(join(root, 'package.json')))) throw new Error('前检期间版本、main或测试尝试已变化，请重新核对')
  const directory = join(root, '.local/release-checks', randomUUID()); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'identity.json'), JSON.stringify({ ...identity, repository: releaseRepository, packageSha256: createHash('sha256').update(bytes).digest('hex'), checkedAt: new Date().toISOString(), authority: 'read-only check; no tag, build, publish or install qualification by itself' }, null, 2) + '\n', { flag: 'wx' })
  console.log(`只读发布前检通过：${identity.tag} / ${sha}；原件 ${directory}。尚未创建Tag、构建或发布。`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
