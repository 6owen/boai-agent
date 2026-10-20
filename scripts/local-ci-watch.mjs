/*
 * [INPUT]: 本人仓库main/同仓库PR快照、专用worktree与本机登录会话。
 * [OUTPUT]: 每个目标SHA一次受管本地CI；核对Git顶层/登记，旧进程未排空不切源码，失败/未知不自动重试。
 * [POS]: 本地CI轮询及可选LaunchAgent；不启动Actions、不合并或发布。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir, tmpdir, userInfo } from 'node:os'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import buildProcessGuard from './build-process-guard.mjs'
import { acquireResourceLock } from './resource-lock.mjs'
import { localCiRepository } from './local-ci-github.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const state = join(root, '.local/ci-watch'), worker = join(root, '.local/ci-worker')
const label = 'com.boai.agent.local-ci'
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const exists = file => lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }).trim()
const api = (path, paginate = false) => JSON.parse(execFileSync('gh', ['api', `repos/${localCiRepository}/${path}`, ...(paginate ? ['--paginate', '--slurp'] : [])], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }))
const shaPattern = /^[a-f0-9]{40}$/
export function localCiTargets(mainSha, pages) {
  if (!shaPattern.test(mainSha ?? '') || !Array.isArray(pages) || !pages.length || pages.some(page => !Array.isArray(page))) throw new Error('main或PR分页快照不完整')
  const targets = [{ kind: 'main', branch: 'main', sha: mainSha }], seen = new Set()
  for (const pr of pages.flat().sort((a, b) => a.number - b.number)) {
    if (pr.state !== 'open' || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== localCiRepository || pr.head?.repo?.full_name !== localCiRepository) continue
    if (!Number.isSafeInteger(pr.number) || pr.number < 1 || seen.has(pr.number) || !shaPattern.test(pr.head.sha ?? '') || !pr.head.ref || pr.head.ref.startsWith('-') || pr.head.ref.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(pr.head.ref)) throw new Error('PR身份、分支或分页重复，拒绝调度')
    seen.add(pr.number)
    targets.push({ kind: 'pr', number: pr.number, branch: pr.head.ref, sha: pr.head.sha, mainSha })
  }
  return targets.map(target => ({ ...target, key: `${target.kind}${target.number ?? ''}-${target.sha}` }))
}
export function assertCiWorkerOwner(owner, expected) {
  if (owner?.version !== 1 || owner.repository !== localCiRepository || owner.worker !== expected.worker || owner.common !== expected.common) throw new Error('专用worktree所有权不匹配，拒绝使用已有目录')
}
export async function assertCiWorkerGit(source, directory) {
  const common = resolve(source, git(source, 'rev-parse', '--git-common-dir'))
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory || resolve(directory, git(directory, 'rev-parse', '--git-common-dir')) !== common) throw new Error('专用worktree目录或Git归属已变化')
  const entries = git(source, 'worktree', 'list', '--porcelain', '-z').split('\0\0').map(entry => entry.split('\0'))
  const registered = entries.filter(entry => entry[0] === `worktree ${directory}`)
  if (git(directory, 'rev-parse', '--show-toplevel') !== directory || registered.length !== 1 || !registered[0].includes('detached')) throw new Error('专用worktree顶层或登记身份不匹配')
}
async function tools(directory) {
  const output = await build({ stdin: { contents: "export {repairProcess,saveProcess} from './tests/evaluation/repair-process.ts';export {drainPendingProcesses} from './scripts/development/recovery.ts'", resolveDir: root }, write: false, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
  const bytes = Buffer.from(output.outputFiles[0].contents), file = join(directory, `tools-${createHash('sha256').update(bytes).digest('hex')}.mjs`)
  if (await exists(file)) { if (!(await readFile(file)).equals(bytes)) throw new Error('已有调度工具原件hash不匹配') }
  else await writeFile(file, bytes, { flag: 'wx' })
  return import(pathToFileURL(file).href)
}
async function recover(directory, guard, helpers) {
  if (!await exists(directory)) return
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw new Error('进程原件目录不是普通目录')
  await helpers.drainPendingProcesses(directory, guard)
}
async function prepareWorker(target, helpers, guard) {
  const common = resolve(root, git(root, 'rev-parse', '--git-common-dir')), marker = join(state, 'worker.json')
  const owner = { version: 1, repository: localCiRepository, worker, common }
  if (!await exists(marker)) {
    if (await exists(worker)) throw new Error('已有目录没有本调度器所有权，不接管')
    await save(marker, owner)
  }
  assertCiWorkerOwner(JSON.parse(await readFile(marker, 'utf8')), owner)
  git(root, 'fetch', '--no-tags', 'origin', `+refs/heads/${target.branch}:refs/remotes/origin/${target.branch}`)
  if (git(root, 'rev-parse', `refs/remotes/origin/${target.branch}`) !== target.sha) throw new Error('排队后远程分支已更新，本次不运行旧SHA')
  if (!await exists(worker)) git(root, 'worktree', 'add', '--detach', worker, target.sha)
  await assertCiWorkerGit(root, worker)
  await drainCiWorker(worker, helpers, guard)
  if (git(worker, 'status', '--porcelain')) throw new Error('CI专用worktree有未知修改，保留现场，不重置')
  git(worker, 'checkout', '--detach', target.sha)
  if (target.kind === 'pr' && git(worker, 'merge-base', target.sha, target.mainSha) !== target.mainSha) throw new Error('PR尚未包含当前main，请先更新分支；没有运行旧集成版本')
  if (!await exists(join(worker, 'scripts/local-ci.mjs'))) throw new Error('该历史提交尚未接入本地CI入口，不能授予资格')
}
export async function drainCiWorker(directory, helpers, guard) {
  // Recover every known child supervisor before changing files, including nested
  // T1/UI supervisors; a live ledger is a refusal, never permission to checkout.
  const runs = join(directory, '.local/ci-local')
  if (await exists(runs)) for (const entry of await readdir(runs, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('本地CI运行目录异常')
    await recover(join(runs, entry.name), guard, helpers)
    await recover(join(runs, entry.name, 't1'), guard, helpers)
  }
  const ui = join(directory, '.local/ui-processes')
  if (await exists(ui)) for (const entry of await readdir(ui, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('UI进程账本目录异常')
    execFileSync(guard, ['--recover', join(ui, entry.name)], { timeout: 10_000, maxBuffer: 65536 })
    if ((await readdir(join(ui, entry.name))).some(name => name.endsWith('.json'))) throw new Error('旧UI进程未确认退出，不能切换源码')
  }
}
async function once() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.16.0' || process.env.GITHUB_ACTIONS) throw new Error('调度仅支持已登记的本机macOS arm64/Node24.16.0')
  const release = acquireResourceLock(join(tmpdir(), `boai-ci-watch-${userInfo().uid}.sqlite`))
  const controller = new AbortController(), cancel = () => controller.abort()
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
  try {
    if (git(root, 'status', '--porcelain')) throw new Error('调度器源码未提交，本次不运行')
    if (!/^(https:\/\/github\.com\/6owen\/boai-agent(?:\.git)?|git@github\.com:6owen\/boai-agent\.git)$/.test(git(root, 'remote', 'get-url', 'origin'))) throw new Error('origin不是约定本人仓库')
    await mkdir(join(state, 'attempts'), { recursive: true })
    await buildProcessGuard()
    const helpers = await tools(state), guard = join(root, 'dist/native/boai-process-guard')
    for (const entry of await readdir(join(state, 'attempts'), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('调度原件不是普通目录')
      await recover(join(state, 'attempts', entry.name), guard, helpers)
    }
    const mainSha = api('git/ref/heads/main').object?.sha
    const targets = localCiTargets(mainSha, api('pulls?state=open&base=main&per_page=100', true))
    if (api('git/ref/heads/main').object?.sha !== mainSha) throw new Error('读取PR时main变化，下次重新取快照')
    for (const target of targets) {
      const directory = join(state, 'attempts', target.key)
      if (await exists(directory)) continue // failed/unknown attempts need explicit human investigation, not automatic retry.
      await mkdir(directory)
      await save(join(directory, 'intent.json'), { version: 1, target, controllerSha: git(root, 'rev-parse', 'HEAD'), startedAt: new Date().toISOString() })
      let status = 'failed', error
      try {
        controller.signal.throwIfAborted()
        await prepareWorker(target, helpers, guard)
        const receipt = await helpers.repairProcess({ command: process.execPath, args: ['scripts/local-ci.mjs', 'run', '--github-branch', target.branch], cwd: worker, timeoutMs: 125 * 60_000, signal: controller.signal, managed: { guard, ledger: join(directory, 'processes') }, capture: { directory, prefix: 'ci' } })
        await helpers.saveProcess(directory, 'ci', receipt)
        if (receipt.failure || receipt.exitCode !== 0) throw new Error(`本地CI未成功：${receipt.failure ?? receipt.exitCode}`)
        const matches = [...receipt.stdout.matchAll(/^本地CI passed: (.+)$/gm)]
        if (matches.length !== 1 || !resolve(matches[0][1]).startsWith(join(worker, '.local/ci-local') + '/')) throw new Error('缺少本次完整原件路径')
        const checked = await helpers.repairProcess({ command: process.execPath, args: ['scripts/local-ci.mjs', 'verify', matches[0][1]], cwd: worker, timeoutMs: 2 * 60_000, signal: controller.signal, managed: { guard, ledger: join(directory, 'processes') }, capture: { directory, prefix: 'verify' } })
        await helpers.saveProcess(directory, 'verify', checked)
        if (checked.failure || checked.exitCode !== 0 || JSON.parse(checked.stdout).sha !== target.sha) throw new Error('原件独立复核失败')
        await save(join(directory, 'qualification.json'), { target, directory: matches[0][1], ...JSON.parse(checked.stdout) })
        status = 'passed'
      } catch (cause) { error = String(cause); if (controller.signal.aborted) status = 'cancelled' }
      await save(join(directory, 'completed.json'), { status, error, completedAt: new Date().toISOString() })
      console.log(`${target.key}: ${status}${error ? `; ${error}` : ''}`)
      if (status !== 'passed') process.exitCode = 1
      return // At most one target per launch; launchd schedules the next poll.
    }
    console.log('没有未处理的main/同仓库PR提交')
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); release() }
}
const xml = text => text.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character])
async function service(command) {
  if (process.platform !== 'darwin') throw new Error('LaunchAgent仅适用于macOS')
  const path = join(homedir(), 'Library/LaunchAgents', label + '.plist'), domain = `gui/${userInfo().uid}`
  if (command === 'uninstall') {
    const installed = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8', timeout: 10_000 }))
    if (installed.Label !== label || installed.WorkingDirectory !== root || installed.ProgramArguments?.[1] !== fileURLToPath(import.meta.url)) throw new Error('同名服务不属于当前目录，不停止')
    // Persistent disable also prevents RunAtLoad from resuming at next login.
    execFileSync('launchctl', ['disable', `${domain}/${label}`], { timeout: 30_000 })
    execFileSync('launchctl', ['bootout', `${domain}/${label}`], { timeout: 30_000 })
    console.log('本地CI自动轮询已停止；配置、专用worktree及原件保留'); return
  }
  if (git(root, 'status', '--porcelain')) throw new Error('安装自动轮询前须提交源码')
  await mkdir(state, { recursive: true }); await mkdir(join(homedir(), 'Library/LaunchAgents'), { recursive: true })
  const contents = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(fileURLToPath(import.meta.url))}</string><string>once</string></array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? '')}</string></dict><key>LimitLoadToSessionType</key><string>Aqua</string><key>StartInterval</key><integer>60</integer><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${xml(join(state, 'service.stdout.log'))}</string><key>StandardErrorPath</key><string>${xml(join(state, 'service.stderr.log'))}</string></dict></plist>\n`
  if (await exists(path)) {
    if (!(await readFile(path)).equals(Buffer.from(contents))) throw new Error('已有同名LaunchAgent配置不同，不覆盖')
  } else await writeFile(path, contents, { flag: 'wx', mode: 0o600 })
  execFileSync('plutil', ['-lint', path], { timeout: 10_000 })
  execFileSync('launchctl', ['enable', `${domain}/${label}`], { timeout: 30_000 })
  execFileSync('launchctl', ['bootstrap', domain, path], { timeout: 30_000 })
  console.log(`本地CI每60秒轮询已登记；日志 ${state}`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...extra] = process.argv.slice(2)
  Promise.resolve().then(() => {
    if (extra.length) throw new Error('用法：local-ci-watch.mjs once|install|uninstall')
    if (command === 'once') return once()
    if (['install', 'uninstall'].includes(command)) return service(command)
    throw new Error('用法：local-ci-watch.mjs once|install|uninstall')
  }).catch(error => { console.error(String(error)); process.exitCode = 1 })
}
