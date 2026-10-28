/*
 * [INPUT]: Clean pushed feature worktree, current PR and an explicit Agent review.
 * [OUTPUT]: Resumable official evidence import, online baseline update and PR verification.
 * [POS]: Development delivery CLI; never auto-accepts pixels, pushes source or merges forcibly.
 * [PROTOCOL]: Keep shared Skill, workflow and scripts/.folder.md synchronized.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UI_REPOSITORY, BASELINE_PREFIX, candidateWorkflow, baselineOnlyCommit } from './ui-delivery-protocol.mjs'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }).trim()
const api = path => JSON.parse(gh('api', `repos/${UI_REPOSITORY}/${path}`))
const json = async path => JSON.parse(await readFile(path, 'utf8'))
export function currentPrRun(runs, pr) {
  return runs.filter(run => run.path === '.github/workflows/tests.yml' && run.event === 'pull_request' && run.head_sha === pr.head.sha && run.head_branch === pr.head.ref && run.repository?.full_name === UI_REPOSITORY && run.head_repository?.full_name === UI_REPOSITORY && run.pull_requests?.some(item => item.number === pr.number)).sort((a, b) => b.id - a.id)[0]
}
export function assertReview(state, head, run, selected, reason) {
  if (state.head !== head || String(state.run) !== String(run.id) || state.attempt !== run.run_attempt || run.status !== 'completed' || run.conclusion !== 'success' || !candidateWorkflow(run)) throw new Error('审阅已过期，先重新运行 pnpm ui:deliver 取得当前候选')
  if (!reason?.trim() || !selected.length || new Set(selected).size !== selected.length || [...selected].sort().join() !== [...state.changed].sort().join()) throw new Error('必须逐项审阅全部实际变化；cases需与当前变化范围完全一致，不能接受无关场景')
}
export function assertBaselineAdvance({ state, head, parent, files, manifest }) {
  if (!state?.submission || state.head !== parent || !/^[a-f0-9]{40}$/.test(head ?? '') || !baselineOnlyCommit(files, manifest, parent)) throw new Error('远端存在新的源码或未登记提交；请正常同步并重新审阅，脚本不覆盖本地')
  const allowed = new Set([`${BASELINE_PREFIX}manifest.json`, ...state.submission.cases.map(id => `${BASELINE_PREFIX}${id}.png`)])
  if (files.some(path => !allowed.has(path)) || state.submission.cases.some(id => manifest.cases?.[id]?.provenance?.runId !== String(state.run) || manifest.cases[id].provenance.attempt !== state.attempt || manifest.cases[id].source?.commit !== parent || manifest.cases[id].reason !== state.submission.reason)) throw new Error('基准提交与本批已审阅run/cases/reason不匹配')
}
async function main() {
  const [command = 'resume', ...args] = process.argv.slice(2), options = {}
  if (!['start', 'resume', 'review', 'status'].includes(command)) throw new Error('用法：pnpm ui:deliver [start|resume|status|review --cases id,id --reason 原因] [--no-auto-merge]')
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (!['--cases', '--reason', '--title', '--body-file', '--no-auto-merge'].includes(key) || options[key]) throw new Error(`未知或重复参数：${key}`)
    options[key] = key === '--no-auto-merge' ? true : args[++i]
    if (!options[key]) throw new Error(`缺少参数：${key}`)
  }
  if (process.env.CI) throw new Error('交付入口由开发Agent在worktree运行，不在CI里执行')
  const root = git('rev-parse', '--show-toplevel'), branch = git('branch', '--show-current')
  process.chdir(root)
  if (!branch || branch === 'main' || git('status', '--porcelain')) throw new Error('需要干净的独立功能分支；先按本次范围提交和推送')
  if (JSON.parse(gh('repo', 'view', '--json', 'nameWithOwner')).nameWithOwner !== UI_REPOSITORY) throw new Error('仓库不匹配')
  const local = join(root, '.local/ui-delivery'), statePath = join(local, 'state.json')
  await mkdir(local, { recursive: true })
  const lock = join(local, 'lock'); await mkdir(lock).catch(() => { throw new Error('交付入口已在运行；若进程已退出，检查后移除 .local/ui-delivery/lock') })
  try {
    let state = await json(statePath).catch(error => { if (error.code === 'ENOENT') return {}; throw error })
    const save = async () => { await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2) + '\n'); await rename(`${statePath}.tmp`, statePath) }
    let prs = api(`pulls?state=open&base=main&head=6owen:${encodeURIComponent(branch)}`)
    if (!prs.length && command === 'start') {
      const remote = api(`git/ref/heads/${branch}`).object.sha
      if (remote !== git('rev-parse', 'HEAD')) throw new Error('先推送当前源码；入口不会替你暂存/推送')
      const body = options['--body-file'] ?? join(local, 'pr.md')
      if (!options['--body-file']) await writeFile(body, 'UI 交付由自动采集、Agent 差异审阅和最新提交只读复验推进。\n\n正式资格以 Required checks 为准。\n')
      gh('pr', 'create', '--repo', UI_REPOSITORY, '--base', 'main', '--head', branch, '--draft', '--title', options['--title'] ?? git('log', '-1', '--pretty=%s'), '--body-file', body)
      prs = api(`pulls?state=open&base=main&head=6owen:${encodeURIComponent(branch)}`)
    }
    if (prs.length !== 1) throw new Error('需要唯一的当前分支PR；首次交付使用 pnpm ui:deliver start')
    const pr = prs[0]
    if (pr.head.repo.full_name !== UI_REPOSITORY || pr.base.repo.full_name !== UI_REPOSITORY) throw new Error('拒绝跨仓库PR')
    if (state.branch && state.branch !== branch) throw new Error('交付记录属于其他分支')
    if (git('rev-parse', 'HEAD') !== pr.head.sha) {
      if (command === 'status') { console.log(`远端head=${pr.head.sha}；本地需同步。`); return }
      if (git('rev-parse', 'HEAD') !== state.head) throw new Error('本地和远端源码不同，先正常同步后再继续')
      git('fetch', 'origin', pr.head.ref)
      if (git('rev-parse', 'FETCH_HEAD') !== pr.head.sha) throw new Error('查询后远端head变化，重新接续')
      const parents = git('rev-list', '--parents', '-n', '1', pr.head.sha).split(' ')
      if (parents.length !== 2) throw new Error('不是单父基准提交')
      const files = git('diff', '--name-only', state.head, pr.head.sha).split('\n')
      assertBaselineAdvance({ state, head: pr.head.sha, parent: parents[1], files, manifest: JSON.parse(git('show', `${pr.head.sha}:${BASELINE_PREFIX}manifest.json`)) })
      git('merge', '--ff-only', pr.head.sha)
      state = { branch, head: pr.head.sha, baselineFrom: state.run, noAutoMerge: state.noAutoMerge }; await save()
    }
    if (state.head !== pr.head.sha) { state = { branch, head: pr.head.sha, noAutoMerge: options['--no-auto-merge'] === true }; await save() }
    if (options['--no-auto-merge']) { state.noAutoMerge = true; await save() }
    if (state.submission && command !== 'status') {
      const updates = api('actions/workflows/ui-baseline-update.yml/runs?event=workflow_dispatch&per_page=100').workflow_runs
      const matches = updates.filter(item => item.display_title === `UI baseline ${state.run} ${state.head}` && new Date(item.created_at).getTime() >= new Date(state.submission.at).getTime() - 2000)
      if (matches.length > 1) throw new Error('同一审阅出现多个更新运行，先核查远端，不自动重复写入')
      if (!matches.length) { console.log('已记录基准更新请求，但运行尚不可见；保留记录，不重复派发。'); return }
      const update = matches[0]
      console.log(`基准更新：${update.html_url} (${update.status}/${update.conclusion ?? ''})`)
      if (update.status !== 'completed') return
      if (update.conclusion !== 'success') throw new Error('基准更新失败，原失败保留；先修复更新原因。确认未写入后可归档state.json再重新审阅，不自动重试。')
      console.log('基准更新已成功，等待PR head同步；再次接续即可。'); return
    }
    const runs = api(`actions/workflows/tests.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`).workflow_runs
    const run = currentPrRun(runs, pr)
    if (!run) { console.log('当前head的PR检查尚未出现；接续同一命令，不派发替代检查。'); return }
    console.log(`${pr.html_url}\n${run.html_url}\nhead=${pr.head.sha}`)
    if (command === 'status') { console.log(JSON.stringify({ status: run.status, conclusion: run.conclusion, review: state.changed, submission: state.submission }, null, 2)); return }
    if (run.status === 'action_required' || run.conclusion === 'action_required') {
      gh('api', '--method', 'POST', `repos/${UI_REPOSITORY}/actions/runs/${run.id}/approve`)
      console.log('已批准当前PR、当前head的运行；继续接续原PR检查。'); return
    }
    if (run.status !== 'completed') { console.log('当前PR检查运行中；完成后接续 pnpm ui:deliver。'); return }
    if (run.conclusion !== 'success') throw new Error('功能执行/构建/证据失败；查看原件修复。不能通过换基准解决。')
    const artifacts = api(`actions/runs/${run.id}/artifacts?per_page=100`).artifacts
    const hasCandidate = artifacts.some(item => item.name === 'ui-candidate-github-macos15-arm64')
    if (hasCandidate) {
      const { downloadCiCandidate } = await import('./ui-ci-baseline.mjs')
      const { classifyCandidate } = await import('./ui-delivery-ci.mjs')
      if (state.run !== run.id || state.attempt !== run.run_attempt || !state.evidence) {
        const evidence = join(local, `run-${run.id}-${run.run_attempt}-${Date.now()}`)
        await downloadCiCandidate(root, run.id, evidence)
        const result = await classifyCandidate(root, evidence)
        state = { branch, head: pr.head.sha, run: run.id, attempt: run.run_attempt, evidence, changed: result.changed, noAutoMerge: state.noAutoMerge }; await save()
      }
      if (state.changed.length) {
        if (command !== 'review') {
          console.log(`待Agent查看官方old/new/diff：${join(state.evidence, 'review')}\n变化范围：${state.changed.join(',')}\n审阅符合需求后：pnpm ui:deliver review --cases <上述ID> --reason <逐项需求和审阅结论>`)
          if (state.submission) console.log(`基准更新已请求（${state.submission.status}）；检查 UI baseline update，不重复派发。`)
          return
        }
        const selected = (options['--cases'] ?? '').split(',').filter(Boolean)
        assertReview(state, pr.head.sha, run, selected, options['--reason'])
        if (state.submission) throw new Error('已记录更新请求；先接续/核查现有UI baseline update，禁止重复派发')
        const current = api(`pulls/${pr.number}`)
        if (current.head.sha !== state.head) throw new Error('审阅期间源码变化，旧审阅失效')
        state.submission = { status: 'dispatching', cases: selected, reason: options['--reason'], at: new Date().toISOString() }; await save()
        // Persist before dispatch: if the network receipt is lost, never repeat blindly.
        gh('workflow', 'run', 'ui-baseline-update.yml', '--repo', UI_REPOSITORY, '--ref', 'main', '-f', `candidate_run=${run.id}`, '-f', `approved_head=${state.head}`, '-f', `cases=${selected.join(',')}`, '-f', `reason=${options['--reason']}`)
        state.submission.status = 'submitted'; await save()
        console.log('已请求main受信工作流更新本批基准。完成后 pnpm ui:deliver 将同步提交并批准当前PR复验。'); return
      }
    }
    if (command === 'review') throw new Error('当前没有待接受的视觉差异')
    const checks = api(`commits/${pr.merge_commit_sha}/check-runs?per_page=100`).check_runs
    const check = checks.find(item => item.name === 'Required checks' && item.external_id === `ui-delivery-${run.id}-${run.run_attempt}`)
    if (check?.status !== 'completed' || check.conclusion !== 'success') throw new Error('缺少当前PR merge SHA的Required checks成功回执；候选成功不能替代')
    if (state.noAutoMerge) { console.log('最新提交只读复验通过；按 --no-auto-merge 保留PR，未设置自动合并。'); return }
    if (pr.draft) gh('pr', 'ready', String(pr.number), '--repo', UI_REPOSITORY)
    gh('pr', 'merge', String(pr.number), '--repo', UI_REPOSITORY, '--auto', '--merge', '--match-head-commit', pr.head.sha)
    console.log(gh('pr', 'view', String(pr.number), '--repo', UI_REPOSITORY, '--json', 'state,headRefOid,autoMergeRequest,mergedAt,mergeCommit'))
  } finally { await rm(lock, { recursive: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
