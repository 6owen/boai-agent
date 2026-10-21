/*
 * [INPUT]: 明确同仓库分支、干净提交与完整本地CI核验；当前本人gh授权。
 * [OUTPUT]: 当前Mac独占回传，终态闭包同步消费且持锁到最终完成；并发/旧调用拒绝，未知写入待核对。
 * [POS]: 本地CI可选GitHub状态回传；不启动Actions、不发评论或合并PR。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, userInfo } from 'node:os'
import { acquireResourceLock } from './resource-lock.mjs'

export const localCiRepository = '6owen/boai-agent'
export const localCiContext = 'BOAI local CI'
const api = (path, input) => JSON.parse(execFileSync('gh', ['api', `repos/${localCiRepository}/${path}`, ...(input ? ['--method', 'POST', '--input', '-'] : [])], { input: input ? JSON.stringify(input) : undefined, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }))
export function assertLocalCiAttempt({ sha, remoteSha, creator, status, pendingId, pendingDescription }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || remoteSha !== sha) throw new Error('远程分支已变化，不回传旧提交资格')
  if (!Number.isSafeInteger(creator) || status?.id !== pendingId || status.creator?.id !== creator || status.context !== localCiContext || status.state !== 'pending' || status.description !== pendingDescription) throw new Error('远程状态不是本次待完成尝试，不覆盖更新状态')
}
export async function beginLocalCiPublication({ branch, sha, runId, journal }) {
  if (!branch || branch.startsWith('-') || branch.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(branch) || !/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-f0-9-]{36}$/.test(runId)) throw new Error('回传须为明确分支/完整SHA/运行ID')
  // All supported publishers run on this one Mac. Ownership covers the entire
  // pending -> final interval, including the last read/POST window.
  const release = acquireResourceLock(join(tmpdir(), `boai-ci-publish-${userInfo().uid}.sqlite`))
  let owned = true, finishing = false
  const close = () => { if (owned) { owned = false; release() } }
  try {
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
    if (!owned) throw new Error('本次回传所有权已结束，旧闭包不能发布')
    if (finishing) throw new Error('本次终态回传已在执行，不能并发调用')
    // Consume synchronously, before any await. A rejected duplicate must never
    // enter finally and release the lock owned by the in-flight call.
    finishing = true
    try {
    if (passed && !/^[a-f0-9]{64}$/.test(manifestSha256 ?? '')) throw new Error('成功状态缺少已核验原件hash')
    const combined = api(`commits/${sha}/status?per_page=100`)
    if (combined.sha !== sha) throw new Error('GitHub提交状态身份不匹配')
    // Combined status uses the compact schema; creator comes from the full status list.
    const status = api(`commits/${sha}/statuses?per_page=100`).find(status => status.context === localCiContext)
    if (combined.statuses?.find(item => item.context === localCiContext)?.id !== status?.id) throw new Error('状态查询期间尝试变化，不写最终状态')
    assertLocalCiAttempt({ sha, remoteSha: api(ref).object?.sha, creator: pending.creator?.id, status, pendingId: pending.id, pendingDescription })
    return await post('final', { state: passed ? 'success' : 'failure', context: localCiContext, description: passed ? `local-ci ${runId} ${manifestSha256}` : `local-ci ${runId} failed` })
    } finally { close() }
  }
  } catch (error) { close(); throw error }
}
