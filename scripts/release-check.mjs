/*
 * [INPUT]: 明确版本/SHA/本地原件，当前干净源码及main触发的完整本地CI。
 * [OUTPUT]: 原件重核和最新GitHub状态双读；旧绿/新pending/分支或hash变化拒绝，不创建Tag。
 * [POS]: 第22组个人发布身份门槛；不执行安装、签名或替换应用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyLocalCi } from './local-ci.mjs'
import { localCiContext, localCiRepository } from './local-ci-github.mjs'

export const releaseRepository = localCiRepository
export function verifyReleaseIdentity({ version, sha, current, metadata, mainSha, qualification, status }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') || !version.split('.').every(part => Number.isSafeInteger(Number(part))) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('版本须为稳定X.Y.Z，提交须为完整SHA')
  if (current?.sha !== sha || current.dirty !== false || mainSha !== sha) throw new Error('发布必须是当前干净源码及远程main的同一提交')
  if (metadata?.version !== version || metadata?.build?.buildVersion !== version || metadata?.build?.appId !== 'com.boai.agent' || metadata?.build?.productName !== 'BoAI Agent') throw new Error('package版本/buildVersion或应用身份不匹配')
  const trigger = qualification?.trigger
  if (qualification?.sha !== sha || !/^[a-f0-9]{64}$/.test(qualification?.manifestSha256 ?? '') || !/^[a-f0-9]{64}$/.test(qualification?.sourceHash ?? '') || !Number.isSafeInteger(qualification?.t1) || qualification.t1 < 1 || !Number.isSafeInteger(qualification?.ui) || qualification.ui < 1 || trigger?.repository !== releaseRepository || trigger?.branch !== 'main' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(trigger?.runId ?? '')) throw new Error('没有同SHA的main完整本地原件；PR、旧档案或缺触发身份不能用于发布')
  if (status?.context !== localCiContext || status?.state !== 'success' || !Number.isSafeInteger(status?.id) || status.id < 1 || !Number.isSafeInteger(status?.creator?.id) || status.creator.id < 1 || status.creator.login !== '6owen' || status.description !== `local-ci ${trigger.runId} ${qualification.manifestSha256}`) throw new Error('最新本地CI状态不是该main原件的成功回传，不能用旧绿发布')
  return { version, tag: `v${version}`, sha, appId: metadata.build.appId, buildVersion: metadata.build.buildVersion, validation: { source: 'local-ci', runId: trigger.runId, statusId: status.id, manifestSha256: qualification.manifestSha256, t1: qualification.t1, ui: qualification.ui } }
}

async function main() {
  const args = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--version', '--sha', '--local-ci'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('用法：release-check.mjs --version X.Y.Z --sha 完整提交 --local-ci 原件目录')
    options[args[i]] = args[i + 1]
  }
  const version = options['--version'], sha = options['--sha']
  if (!version || !sha || !/^[a-f0-9]{40}$/.test(sha) || !options['--local-ci']) throw new Error('必须明确版本、完整提交与本地CI原件，不推断最新版本')
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const api = path => JSON.parse(execFileSync('gh', ['api', `repos/${releaseRepository}/${path}`], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }))
  const bytes = await readFile(join(root, 'package.json')), metadata = JSON.parse(bytes)
  const current = { sha: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')) }
  // Reject local/version mismatches before any remote request.
  if (current.sha !== sha || current.dirty || metadata.version !== version || metadata.build?.buildVersion !== version) throw new Error('源码不干净、SHA或版本/buildVersion不符；没有执行远程发布操作')
  const evidence = resolve(options['--local-ci']), qualification = await verifyLocalCi(evidence)
  const mainSha = api('git/ref/heads/main').object?.sha
  const latestStatus = () => {
    const combined = api(`commits/${sha}/status?per_page=100`), full = api(`commits/${sha}/statuses?per_page=100`)
    const rows = combined.statuses?.filter(row => row.context === localCiContext), latest = full.find(row => row.context === localCiContext)
    if (combined.sha !== sha || rows?.length !== 1 || !latest || rows[0].id !== latest.id) throw new Error('最新提交状态身份不匹配或查询期间变化')
    return latest // full list is newest-first; never search for an older success.
  }
  const status = latestStatus(), identity = verifyReleaseIdentity({ version, sha, current, metadata, mainSha, qualification, status })
  const finalQualification = await verifyLocalCi(evidence), finalStatus = latestStatus()
  // This is a read-only snapshot, not a lease. A later writer must recheck it.
  if (JSON.stringify(finalQualification) !== JSON.stringify(qualification) || finalStatus.id !== status.id || finalStatus.state !== 'success' || finalStatus.description !== status.description || finalStatus.creator?.id !== status.creator.id || api('git/ref/heads/main').object?.sha !== sha || git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain') || !bytes.equals(await readFile(join(root, 'package.json')))) throw new Error('前检期间版本、main、本地原件或测试尝试已变化，请重新核对')
  const directory = join(root, '.local/release-checks', randomUUID()); await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'identity.json'), JSON.stringify({ ...identity, repository: releaseRepository, packageSha256: createHash('sha256').update(bytes).digest('hex'), checkedAt: new Date().toISOString(), authority: 'read-only check; no tag, build, publish or install qualification by itself' }, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(directory, 'verification.json'), JSON.stringify({ evidence, qualification, status, finalStatus, mainSha }, null, 2) + '\n', { flag: 'wx' })
  console.log(`只读发布前检通过：${identity.tag} / ${sha}；原件 ${directory}。尚未创建Tag、构建或发布。`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
