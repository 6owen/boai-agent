/*
 * [INPUT]: 已独立审查的固定候选、真实远程base/head及GitHub PR查询回执。
 * [OUTPUT]: 同一分支的可审查draft PR；未知写入先查找，不自动合并或覆盖远程变更。
 * [POS]: 开发侧PR适配；与执行不可信任务代码的检查进程分开。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claimTask, git } from './task'

type Command = (command: string, args: string[], cwd: string) => Promise<string>
const execute: Command = async (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }).trim()
interface PullRequest { number: number; url: string; headRefOid: string; baseRefName: string; state: string }
export async function deliverDevelopmentTask(repository: string, raw: unknown, command: Command = execute) {
  const claim = claimTask(repository, raw), { task, state, directory } = claim
  try {
    if (!['reviewed', 'pr-pending', 'delivered'].includes(state.phase) || state.pending) throw new Error('任务尚未完成实际检查/独立审查，不能交付')
    const checks = state.checks as { passed?: boolean; head?: string }, review = state.review as { approved?: boolean; head?: string; base?: string }
    if (!state.head || !checks?.passed || checks.head !== state.head || !review?.approved || review.head !== state.head || review.base !== task.base || !state.usageComplete) throw new Error('检查/审查/用量未绑定同一完整候选')
    if (git(state.worktree, 'rev-parse', 'HEAD') !== state.head || git(state.worktree, 'status', '--porcelain')) throw new Error('候选提交/工作树变化，必须重新检查/审查')
    const remoteBase = (await command('git', ['ls-remote', 'origin', `refs/heads/${task.targetBranch}`], state.worktree)).split(/\s/)[0]
    if (remoteBase !== task.base) throw new Error('远程base已变化，禁止用旧集成结果交付')
    const lookup = async () => JSON.parse(await command('gh', ['pr', 'list', '--state', 'all', '--head', state.branch, '--json', 'number,url,headRefOid,baseRefName,state'], state.worktree)) as PullRequest[]
    let matches = await lookup()
    if (matches.length > 1 || matches.some(pr => pr.baseRefName !== task.targetBranch || pr.state !== 'OPEN')) throw new Error('已有PR状态/目标不匹配，需明确核对；不另建重复PR')
    state.phase = 'pr-pending'; state.delivery = { head: state.head, base: task.base }; claim.save()
    const existingHead = (await command('git', ['ls-remote', 'origin', `refs/heads/${state.branch}`], state.worktree)).split(/\s/)[0]
    if (existingHead !== state.head) await command('git', ['push', '--set-upstream', 'origin', state.branch], state.worktree)
    const remoteHead = (await command('git', ['ls-remote', 'origin', `refs/heads/${state.branch}`], state.worktree)).split(/\s/)[0]
    if (remoteHead !== state.head) throw new Error('推送后远程head不匹配')
    if (!matches.length) {
      const body = join(directory, 'pr-body.md')
      await writeFile(body, `目标：${task.goal}\n\n${task.acceptance.map(item => `- ${item}`).join('\n')}\n\n任务：${task.taskId}\nBase：${task.base}\nHead：${state.head}\n\n控制器已运行冻结检查，并由独立Codex会话审查。原始失败、逐轮结果和审查目录：${directory}。远程Required checks及人工评价分别核对；不自动合并。\n`)
      await command('gh', ['pr', 'create', '--draft', '--head', state.branch, '--base', task.targetBranch, '--title', task.goal.slice(0, 100), '--body-file', body], state.worktree)
    }
    matches = await lookup()
    if (matches.length !== 1 || matches[0].headRefOid !== state.head || matches[0].baseRefName !== task.targetBranch || matches[0].state !== 'OPEN') throw new Error('PR写入后身份/状态未确认，保留待核对')
    state.delivery = { head: state.head, base: task.base, url: matches[0].url, number: matches[0].number }; state.phase = 'delivered'; delete state.reason; claim.save()
  } catch (error) { if (state.phase === 'delivered') state.phase = 'needs-revalidation'; state.reason = String(error); claim.save() }
  finally { claim.release() }
  return { directory, state }
}
