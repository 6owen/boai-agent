#!/usr/bin/env node
/*
 * [INPUT]: Explicit git cpf invocation, staged changes, origin and an authenticated GitHub administrator.
 * [OUTPUT]: Commit/push/PR merge without waiting for CI; restore only the temporarily changed enforce_admins flag.
 * [POS]: Opt-in repository command; never force-pushes main or stages files automatically.
 * [PROTOCOL]: Update scripts/.folder.md, UI_TEST_CI.md and the shared development skill when changed.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, rename, rm, access, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const alias = '!node "$(git rev-parse --git-common-dir)/boai/git-cpf.mjs"'
const help = `git cpf "提交说明"  提交已暂存文件，推送并立即合并到 main（不等待 CI）
git cpf             推送并合并当前分支已经提交的内容
git cpf --restore-protection  恢复上次中断后尚未恢复的管理员保护
node scripts/git-cpf.mjs --install  安装/更新当前仓库的 git cpf

先用 git add -- <文件> 选择提交范围。需要 GitHub 管理员权限和 gh 登录。
本命令会短暂关闭 classic branch protection 的 enforce_admins，并在结束时恢复。
不会关闭 Actions、伪造检查结果或创建发布；合并不等于部署。`

async function exists(path) {
  try { await access(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

export async function runCpf(args, { cwd = process.cwd(), exec = execute, log = console.log, signal } = {}) {
  if (args[0] === '--help' || args[0] === '-h') { log(help); return }
  if (args.length > 1 || (args[0]?.startsWith('-') && !['--install', '--restore-protection'].includes(args[0]))) throw new Error(help)
  const run = async (program, parameters, restoring = false) => {
    const result = await exec(program, parameters, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: restoring ? 30_000 : 300_000, ...(restoring ? {} : { signal }) })
    return result.stdout.trim()
  }
  const git = (...parameters) => run('git', parameters)
  const gh = (...parameters) => run('gh', parameters)
  const api = async (path, restoring = false) => JSON.parse(await run('gh', ['api', path], restoring))
  cwd = await git('rev-parse', '--show-toplevel')
  const common = resolve(cwd, await git('rev-parse', '--git-common-dir'))
  const stateDirectory = join(common, 'boai')
  const recovery = join(stateDirectory, 'cpf-protection.json')
  await mkdir(stateDirectory, { recursive: true })

  if (args[0] === '--install') {
    let existing = ''
    try { existing = await git('config', '--local', '--get', 'alias.cpf') } catch (error) { if (error.code !== 1) throw error }
    if (existing && existing !== alias) throw new Error('当前仓库已有另一个 alias.cpf，请先处理原配置。')
    const destination = join(stateDirectory, 'git-cpf.mjs')
    await writeFile(`${destination}.tmp`, await readFile(fileURLToPath(import.meta.url)), { mode: 0o600 })
    await rename(`${destination}.tmp`, destination)
    await git('config', '--local', 'alias.cpf', alias)
    log('已安装当前仓库的 git cpf。用 git cpf -h 查看用法。')
    return
  }

  const remote = await git('remote', 'get-url', 'origin')
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/)
  if (!match) throw new Error('git cpf 当前只支持 origin 指向 github.com 的仓库。')
  const repo = match[1]
  const protection = `repos/${repo}/branches/main/protection`

  async function restore() {
    const receipt = JSON.parse(await readFile(recovery, 'utf8'))
    if (receipt.repo !== repo || receipt.branch !== 'main' || receipt.enforceAdmins !== true) throw new Error(`恢复记录与当前仓库不符：${recovery}`)
    if (receipt.pid && receipt.pid !== process.pid) {
      try { process.kill(receipt.pid, 0) }
      catch (error) { if (error.code !== 'ESRCH') throw error; receipt.pid = undefined }
      if (receipt.pid) throw new Error('原 git cpf 进程仍在运行，请等待其恢复保护。')
    }
    let last
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await run('gh', ['api', '--method', 'POST', `${protection}/enforce_admins`], true)
        if ((await api(`${protection}/enforce_admins`, true)).enabled !== true) throw new Error('管理员保护读回未启用')
        await rm(recovery)
        log('管理员保护已恢复并核对。')
        return
      } catch (error) { last = error }
    }
    throw new Error(`管理员保护恢复失败；记录保留在 ${recovery}。请执行 git cpf --restore-protection。${last?.message ?? ''}`)
  }

  if (args[0] === '--restore-protection') {
    if (await exists(recovery)) await restore()
    else log('没有待恢复的保护设置。')
    return
  }
  if (await exists(recovery)) throw new Error('上次操作有待恢复的保护设置，请先执行 git cpf --restore-protection。')
  const metadata = await api(`repos/${repo}`)
  if (!metadata.permissions?.admin) throw new Error('当前 gh 账号没有此仓库的管理员权限，不能使用 git cpf。')
  const branch = await git('branch', '--show-current')
  if (!branch) throw new Error('请先切换到一个本地分支。')
  for (const operation of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (await exists(resolve(cwd, await git('rev-parse', '--git-path', operation)))) throw new Error('请先完成或取消当前 merge/rebase/cherry-pick 操作。')
  }
  if (await git('diff', '--name-only', '--diff-filter=U')) throw new Error('存在未解决的冲突。')
  const staged = await git('diff', '--cached', '--name-only')
  if (staged && !args[0]?.trim()) throw new Error('已有暂存改动，请提供提交说明：git cpf "提交说明"。')
  await git('fetch', 'origin', 'main')
  if (staged) {
    await git('diff', '--cached', '--check')
    log(await git('commit', '-m', args[0]))
  }
  const head = await git('rev-parse', 'HEAD')
  if (Number(await git('rev-list', '--count', 'origin/main..HEAD')) === 0) throw new Error('没有尚未进入 origin/main 的提交。')
  const remoteBranch = branch === 'main' ? `cpf/${head.slice(0, 12)}` : branch
  log(`推送 ${head.slice(0, 8)} 到 ${remoteBranch}；不等待 CI。`)
  await git('push', 'origin', `${head}:refs/heads/${remoteBranch}`)
  const list = JSON.parse(await gh('pr', 'list', '--repo', repo, '--head', remoteBranch, '--base', 'main', '--state', 'open', '--json', 'number'))
  let number = list[0]?.number
  if (!number) {
    const temporary = await mkdtemp(join(tmpdir(), 'boai-cpf-'))
    try {
      const body = join(temporary, 'body.md')
      await writeFile(body, `提交 ${head}。\n\n由用户显式执行 git cpf 提交并直接合并；不等待 CI，不将合并表述为检查通过或已部署。\n`)
      const url = await gh('pr', 'create', '--repo', repo, '--base', 'main', '--head', remoteBranch, '--title', await git('log', '-1', '--format=%s'), '--body-file', body)
      number = Number(url.match(/\/pull\/(\d+)$/)?.[1])
      if (!number) throw new Error(`无法识别新 PR：${url}`)
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  const view = async (restoring = false) => JSON.parse(await run('gh', ['pr', 'view', String(number), '--repo', repo, '--json', 'state,headRefOid,baseRefName,isDraft,mergeable,mergedAt,mergeCommit,url'], restoring))
  let pr = await view()
  if (pr.headRefOid !== head || pr.baseRefName !== 'main' || pr.state !== 'OPEN') throw new Error('PR 已变化，停止合并。')
  if (pr.mergeable === 'CONFLICTING') throw new Error('PR 存在合并冲突，请先解决冲突。')
  if (pr.isDraft) await gh('pr', 'ready', String(number), '--repo', repo)
  const merge = () => gh('pr', 'merge', String(number), '--repo', repo, '--merge', '--admin', '--match-head-commit', head)
  try {
    await merge()
  } catch (firstError) {
    // Resolve an unknown merge response before attempting the explicitly authorized bypass.
    pr = await view()
    if (pr.state !== 'MERGED') {
      if (pr.headRefOid !== head || pr.state !== 'OPEN') throw firstError
      const before = await api(protection)
      if (!before.enforce_admins?.enabled) throw firstError
      await writeFile(recovery, JSON.stringify({ repo, branch: 'main', enforceAdmins: true, head, pr: number, pid: process.pid, before }, null, 2), { flag: 'wx', mode: 0o600 })
      try {
        log('临时解除管理员强制检查，立即合并后恢复。')
        await gh('api', '--method', 'DELETE', `${protection}/enforce_admins`)
        await merge()
      } finally { await restore() }
    }
  }
  pr = await view(true)
  if (pr.state !== 'MERGED' || !pr.mergedAt || pr.headRefOid !== head) throw new Error('尚未确认 PR 实际合并，不能报告成功。')
  log(`已合并：${pr.url}\n合并提交：${pr.mergeCommit.oid}`)
  if (branch === 'main' && !signal?.aborted && await git('rev-parse', 'HEAD') === head && !(await git('diff', '--name-only')) && !(await git('diff', '--cached', '--name-only'))) {
    try {
      await git('fetch', 'origin', 'main')
      await git('merge', '--ff-only', 'origin/main')
      log('本地 main 已快进同步。')
    } catch (error) { log(`PR 已合并，本地 main 未同步：${error.message}`) }
  }
  return pr
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  try { await runCpf(process.argv.slice(2), { signal: controller.signal }) }
  catch (error) { console.error(error.message); process.exitCode = controller.signal.aborted ? 130 : 1 }
  finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt) }
}
