/*
 * [INPUT]: 明确同仓库分支、干净提交与完整本地CI核验；当前本人gh授权。
 * [OUTPUT]: 仅向该SHA登记pending/成功或失败；新提交/更新尝试不覆盖，未知写入留待核对。
 * [POS]: 本地CI可选GitHub状态回传；不启动Actions、不发评论或合并PR。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const localCiRepository = '6owen/boai-agent'
export const localCiContext = 'BOAI local CI'
const api = (path, input) => JSON.parse(execFileSync('gh', ['api', `repos/${localCiRepository}/${path}`, ...(input ? ['--method', 'POST', '--input', '-'] : [])], { input: input ? JSON.stringify(input) : undefined, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }))
export function assertLocalCiAttempt({ sha, remoteSha, creator, status, pendingId, pendingDescription }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || remoteSha !== sha) throw new Error('远程分支已变化，不回传旧提交资格')
  if (!Number.isSafeInteger(creator) || status?.id !== pendingId || status.creator?.id !== creator || status.context !== localCiContext || status.state !== 'pending' || status.description !== pendingDescription) throw new Error('远程状态不是本次待完成尝试，不覆盖更新状态')
}
export async function beginLocalCiPublication({ branch, sha, runId, journal }) {
  if (!branch || branch.startsWith('-') || branch.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(branch) || !/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-f0-9-]{36}$/.test(runId)) throw new Error('回传须为明确分支/完整SHA/运行ID')
  const ref = `git/ref/heads/${branch}`, remote = api(ref)
  if (remote.ref !== `refs/heads/${branch}` || remote.object?.sha !== sha) throw new Error('本地CI提交尚未位于指定远程分支')
  await mkdir(journal, { recursive: true })
  const pendingDescription = `local-ci ${runId} pending`
  const post = async (phase, body) => {
    await writeFile(join(journal, `${phase}.intent.json`), JSON.stringify({ sha, branch, body }, null, 2), { flag: 'wx' })
    // A timeout may already have committed remotely. No automatic replay.
    const status = api(`statuses/${sha}`, body)
    await writeFile(join(journal, `${phase}.receipt.json`), JSON.stringify(status, null, 2), { flag: 'wx' })
    if (!Number.isSafeInteger(status.id) || status.id < 1 || status.context !== localCiContext || status.state !== body.state || status.description !== body.description) throw new Error('GitHub状态回执不对应，保留意图待核对')
    const combined = api(`commits/${sha}/status?per_page=100`)
    if (combined.sha !== sha || combined.statuses?.find(item => item.context === localCiContext)?.id !== status.id) throw new Error('GitHub最新状态不对应本次写入，保留原回执待核对')
    return status
  }
  const pending = await post('pending', { state: 'pending', context: localCiContext, description: pendingDescription })
  return async ({ passed, manifestSha256 }) => {
    if (passed && !/^[a-f0-9]{64}$/.test(manifestSha256 ?? '')) throw new Error('成功状态缺少已核验原件hash')
    const combined = api(`commits/${sha}/status?per_page=100`)
    if (combined.sha !== sha) throw new Error('GitHub提交状态身份不匹配')
    // Combined status uses the compact schema; creator comes from the full status list.
    const status = api(`commits/${sha}/statuses?per_page=100`).find(status => status.context === localCiContext)
    if (combined.statuses?.find(item => item.context === localCiContext)?.id !== status?.id) throw new Error('状态查询期间尝试变化，不写最终状态')
    assertLocalCiAttempt({ sha, remoteSha: api(ref).object?.sha, creator: pending.creator?.id, status, pendingId: pending.id, pendingDescription })
    return post('final', { state: passed ? 'success' : 'failure', context: localCiContext, description: passed ? `local-ci ${runId} ${manifestSha256}` : `local-ci ${runId} failed` })
  }
}
