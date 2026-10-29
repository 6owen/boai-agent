/*
 * [INPUT]: Clean stable application version/SHA and latest main push of the current GitHub Test workflow.
 * [OUTPUT]: Read-only release identity; PR, old success, pending and changed attempts cannot qualify.
 * [POS]: Shared local-build identity and publication check; no local-CI dependency.
 * [PROTOCOL]: Update Header and scripts/.folder.md when changed.
 */
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const releaseRepository = '6owen/boai-agent'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
export function verifyReleaseSource({ version, sha, current, metadata }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') || !version.split('.').every(part => Number.isSafeInteger(Number(part))) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('版本须为稳定X.Y.Z，提交须为完整SHA')
  if (current?.sha !== sha || current.dirty !== false) throw new Error('必须是当前干净源码的同一提交')
  if (metadata?.version !== version || metadata?.build?.buildVersion !== version || metadata?.build?.appId !== 'com.boai.agent' || metadata?.build?.productName !== 'BoAI Agent') throw new Error('package版本/buildVersion或应用身份不匹配')
  return { version, tag: `v${version}`, sha, appId: metadata.build.appId, buildVersion: metadata.build.buildVersion }
}
export function verifyReleaseIdentity({ version, sha, current, metadata, mainSha, run }) {
  const identity = verifyReleaseSource({ version, sha, current, metadata })
  if (mainSha !== sha) throw Error('发布必须来自远程main当前提交')
  if (run?.repository?.full_name !== releaseRepository || run.path !== '.github/workflows/test.yml' || run.head_branch !== 'main' || run.event !== 'push' || run.head_sha !== sha || !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.status !== 'completed' || run.conclusion !== 'success') throw Error('当前main同SHA的最新Test尚未成功')
  return { ...identity, validation: { source: 'github-actions', runId: run.id, attempt: run.run_attempt } }
}
export async function checkRelease(version, sha, { directory = root, api, git } = {}) {
  git ??= (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  api ??= path => JSON.parse(execFileSync('gh', ['api', `repos/${releaseRepository}/${path}`], { cwd: directory, encoding: 'utf8', timeout: 30_000 }))
  const readSource = async () => ({ current: { sha: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain') }, metadata: JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) })
  const source = await readSource()
  verifyReleaseSource({ version, sha, ...source })
  const readRemote = () => {
    const mainSha = api('git/ref/heads/main').object?.sha
    const rows = api(`actions/workflows/test.yml/runs?branch=main&event=push&head_sha=${sha}&per_page=100`).workflow_runs ?? []
    const latest = rows.sort((a, b) => b.run_number - a.run_number || b.id - a.id)[0]
    const run = latest ? api(`actions/runs/${latest.id}`) : null
    return { mainSha, run }
  }
  const first = readRemote(), identity = verifyReleaseIdentity({ version, sha, ...source, ...first })
  const final = readRemote(), finalSource = await readSource()
  const rechecked = verifyReleaseIdentity({ version, sha, ...finalSource, ...final })
  if (JSON.stringify(identity) !== JSON.stringify(rechecked) || JSON.stringify(source) !== JSON.stringify(finalSource)) throw Error('发布前检期间源码或Test尝试发生变化')
  return identity
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 4 || args[0] !== '--version' || args[2] !== '--sha') throw Error('用法：release:check --version X.Y.Z --sha 完整提交')
    const identity = await checkRelease(args[1], args[3]), directory = join(root, '.local/release-checks', randomUUID())
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'identity.json'), JSON.stringify(identity, null, 2) + '\n')
    console.log(`发布前检通过：${identity.tag} / ${identity.sha}；尚未发布。`)
  } catch (error) { console.error(String(error)); process.exitCode = 1 }
}
