/*
 * [INPUT]: 同仓库/外部PR分页、真实Git/guard和明确假gh/失败CI协议夹具。
 * [OUTPUT]: 身份/去重/未知归属拒绝，Git向上发现/活跃账本阻止换版；隔离夹具清除云端调度守卫环境，实际CLI取消/死亡后不重放。
 * [POS]: 本地轮询边界测试；不访问GitHub、不运行GUI或注册服务。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, rm, realpath, writeFile, readFile, copyFile, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { drainPendingProcesses } from '../scripts/development/recovery'
// @ts-expect-error Node CLI helper has no declaration file.
import { localCiTargets, assertCiWorkerOwner, assertCiWorkerGit, drainCiWorker } from '../scripts/local-ci-watch.mjs'
const repository = '6owen/boai-agent', sha = 'a'.repeat(40), next = 'b'.repeat(40)
const pr = { number: 2, state: 'open', draft: true, base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'dev/feature', sha: next, repo: { full_name: repository } } }
it('main优先、全部同仓库PR按编号串行，draft也执行；SHA和目标身份明确', () => {
  expect(localCiTargets(sha, [[pr], [{ ...pr, number: 1, head: { ...pr.head, ref: 'dev/other' } }]])).toEqual([
    { kind: 'main', branch: 'main', sha, key: `main-${sha}` },
    { kind: 'pr', number: 1, branch: 'dev/other', sha: next, mainSha: sha, key: `pr1-${next}` },
    { kind: 'pr', number: 2, branch: 'dev/feature', sha: next, mainSha: sha, key: `pr2-${next}` },
  ])
})
it('不执行fork、其他目标分支、已关闭PR或不属于本人仓库的base', () => {
  expect(localCiTargets(sha, [[
    { ...pr, head: { ...pr.head, repo: { full_name: 'fork/boai-agent' } } },
    { ...pr, base: { ...pr.base, ref: 'other' } }, { ...pr, state: 'closed' },
    { ...pr, base: { ...pr.base, repo: { full_name: 'fork/boai-agent' } } },
  ]])).toHaveLength(1)
})
it.each([
  ['short', [[pr]]], [sha, []], [sha, [null]], [sha, [[pr], [pr]]],
  [sha, [[{ ...pr, number: 0 }]]], [sha, [[{ ...pr, head: { ...pr.head, sha: 'short' } }]]],
  [sha, [[{ ...pr, head: { ...pr.head, ref: '--all' } }]]], [sha, [[{ ...pr, head: { ...pr.head, ref: '../main' } }]]],
])('不完整/重复/不明确快照不能启动CI：%j', (main, pages) => expect(() => localCiTargets(main, pages)).toThrow())
it('目录路径、共享Git目录与本人仓库均匹配才接受既有worktree所有权', () => {
  const expected = { worker: '/fixture/worker', common: '/fixture/repo/.git' }, owner = { version: 1, repository, ...expected }
  expect(() => assertCiWorkerOwner(owner, expected)).not.toThrow()
  for (const patch of [{ version: 2 }, { worker: '/other' }, { common: '/other' }, { repository: 'fork/boai-agent' }]) expect(() => assertCiWorkerOwner({ ...owner, ...patch }, expected)).toThrow('所有权')
})
it('worktree删除或.git误指主仓库都不能接管调度器源码', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'boai-ci-worker-git-'))), worker = join(directory, '.local/worker')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '-b', 'fixture-main'); await writeFile(join(directory, '.gitignore'), '.local/\n'); git('add', '.'); git('-c', 'user.name=CI fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
    const head = git('rev-parse', 'HEAD'); git('worktree', 'add', '--detach', worker, head)
    await expect(assertCiWorkerGit(directory, worker)).resolves.toBeUndefined()
    const gitfile = join(worker, '.git'), original = await readFile(gitfile)
    try {
      await writeFile(gitfile, `gitdir: ${join(directory, '.git')}\n`)
      await expect(assertCiWorkerGit(directory, worker)).rejects.toThrow('worktree')
      expect(git('branch', '--show-current')).toBe('fixture-main'); expect(git('rev-parse', 'HEAD')).toBe(head)
    } finally { await writeFile(gitfile, original) }
    git('worktree', 'remove', worker); await mkdir(worker, { recursive: true })
    expect(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: worker, encoding: 'utf8' }).trim()).toBe(directory)
    await expect(assertCiWorkerGit(directory, worker)).rejects.toThrow('worktree')
    expect(git('branch', '--show-current')).toBe('fixture-main'); expect(git('rev-parse', 'HEAD')).toBe(head)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
it.each(['.local/ci-local/one/processes', '.local/ci-local/one/t1/processes', '.local/ui-processes/one'])('真实活跃账本%s阻止重用worktree，退出后才允许', async ledgerPath => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-ci-watch-')), ledger = join(directory, ledgerPath), guard = resolve('dist/native/boai-process-guard')
  await mkdir(ledger, { recursive: true })
  const child = spawn(guard, ['--ledger', ledger, process.execPath, '-e', 'setInterval(()=>{},1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
  const ended = once(child, 'close')
  try {
    await expect.poll(async () => (await readdir(ledger)).filter(name => name.endsWith('.json')).length).toBeGreaterThan(0)
    await expect(drainCiWorker(directory, { drainPendingProcesses }, guard)).rejects.toThrow('未确认退出')
  } finally { child.kill('SIGTERM'); await ended }
  try { await expect(drainCiWorker(directory, { drainPendingProcesses }, guard)).resolves.toBeUndefined() }
  finally { await rm(directory, { recursive: true, force: true }) }
})
async function cliFixture() {
  const source = process.cwd(), root = await realpath(await mkdtemp(join(tmpdir(), 'boai-ci-watch-cli-'))), bin = join(root, '.local/bin')
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), git = (...args: string[]) => execFileSync(realGit, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  await mkdir(bin, { recursive: true }); await mkdir(join(root, 'scripts/development'), { recursive: true }); await mkdir(join(root, 'tests/evaluation'), { recursive: true })
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'))
  await writeFile(join(root, '.gitignore'), '.local/\nnode_modules/\ndist/\n')
  for (const name of ['local-ci-watch.mjs', 'local-ci-github.mjs']) await copyFile(join(source, 'scripts', name), join(root, 'scripts', name))
  // Protocol-only fixture: the real SQLite primitive is retained, with a private
  // lock so this child CLI never competes with the real scheduled CI parent.
  await writeFile(join(root, 'scripts/resource-lock.mjs'), `import {acquireResourceLock as actual} from ${JSON.stringify(join(source, 'scripts/resource-lock.mjs'))};export const acquireResourceLock=()=>actual(${JSON.stringify(join(root, '.local/watch.sqlite'))});\n`)
  await writeFile(join(root, 'scripts/build-process-guard.mjs'), `import{mkdir,copyFile}from'node:fs/promises';export default async()=>{await mkdir('dist/native',{recursive:true});await copyFile(${JSON.stringify(join(source, 'dist/native/boai-process-guard'))},'dist/native/boai-process-guard')};\n`)
  await writeFile(join(root, 'tests/evaluation/repair-process.ts'), `export {repairProcess,saveProcess} from ${JSON.stringify(join(source, 'tests/evaluation/repair-process.ts'))};\n`)
  await writeFile(join(root, 'scripts/development/recovery.ts'), `export {drainPendingProcesses} from ${JSON.stringify(join(source, 'scripts/development/recovery.ts'))};\n`)
  // This stub can only hang or fail, never issue a fake successful qualification.
  await writeFile(join(root, 'scripts/local-ci.mjs'), `import{appendFileSync,readFileSync}from'node:fs';appendFileSync(${JSON.stringify(join(root, '.local/entered'))},'run\\n');if(readFileSync(${JSON.stringify(join(root, '.local/mode'))},'utf8')==='hang')setInterval(()=>{},1000);else process.exitCode=2;\n`)
  git('init', '-b', 'main'); git('add', '.'); git('-c', 'user.name=CI protocol fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'local CI protocol fixture'); git('remote', 'add', 'origin', 'https://github.com/6owen/boai-agent.git')
  await writeFile(join(root, '.local/mode'), 'hang')
  await writeFile(join(bin, 'git'), `#!${process.execPath}\nconst{execFileSync}=require('node:child_process');const a=process.argv.slice(2);if(a[0]==='fetch')a[2]=${JSON.stringify(root)};process.stdout.write(execFileSync(${JSON.stringify(realGit)},a,{cwd:process.cwd(),encoding:'utf8'}));\n`, { mode: 0o700 })
  await writeFile(join(bin, 'gh'), `#!${process.execPath}\nconst{execFileSync}=require('node:child_process'),fs=require('node:fs');const p=process.argv[3];fs.appendFileSync(${JSON.stringify(join(root, '.local/gh-calls'))},p+'\\n');if(p.endsWith('git/ref/heads/main'))process.stdout.write(JSON.stringify({object:{sha:execFileSync(${JSON.stringify(realGit)},['rev-parse','HEAD'],{cwd:${JSON.stringify(root)},encoding:'utf8'}).trim()}}));else if(p.endsWith('pulls?state=open&base=main&per_page=100'))process.stdout.write('[[]]');else process.exit(93);\n`, { mode: 0o700 })
  const start = () => {
    const child = spawn(process.execPath, ['scripts/local-ci-watch.mjs', 'once'], { cwd: root, env: { ...process.env, GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''; child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
    const ended = once(child, 'close').then(([code]) => ({ code, stdout, stderr })).finally(() => clearTimeout(timer))
    return { child, ended }
  }
  return { root, git, start, async runs() { return (await readFile(join(root, '.local/entered'), 'utf8')).trim().split('\n').length } }
}
it.each(['SIGTERM', 'SIGKILL'] as const)('实际调度CLI %s中断后，同SHA下一轮零CI启动', async signal => {
  const f = await cliFixture(), first = f.start()
  try {
    await expect.poll(async () => f.runs(), { timeout: 10_000 }).toBe(1)
    first.child.kill(signal); await first.ended
    const attempt = join(f.root, '.local/ci-watch/attempts', `main-${f.git('rev-parse', 'HEAD')}`)
    await expect.poll(async () => (await readdir(join(attempt, 'processes'))).filter(name => name.endsWith('.json')).length, { timeout: 10_000 }).toBe(0)
    const second = await f.start().ended
    expect(second.code, second.stderr).toBe(0); expect(second.stdout).toContain('没有未处理'); expect(await f.runs()).toBe(1)
    expect((await readdir(join(f.root, '.local/ci-watch'))).filter(name => name.startsWith('tools-'))).toHaveLength(1)
    if (signal === 'SIGTERM') expect(JSON.parse(await readFile(join(attempt, 'completed.json'), 'utf8')).status).toBe('cancelled')
    else await expect(readFile(join(attempt, 'completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { if (first.child.exitCode === null && first.child.signalCode === null) { first.child.kill('SIGKILL'); await first.ended }; await rm(f.root, { recursive: true, force: true }) }
}, 30_000)
it('实际调度CLI遇到存活旧账本时，零远程查询且worker保持原HEAD', async () => {
  const f = await cliFixture(), ledger = join(f.root, '.local/ci-watch/attempts/old/processes'), guard = resolve('dist/native/boai-process-guard')
  await mkdir(ledger, { recursive: true })
  const old = spawn(guard, ['--ledger', ledger, process.execPath, '-e', 'setInterval(()=>{},1000)'], { stdio: ['pipe', 'pipe', 'pipe'] }), ended = once(old, 'close')
  const worker = join(f.root, '.local/ci-worker'), head = f.git('rev-parse', 'HEAD'); f.git('worktree', 'add', '--detach', worker, head)
  try {
    await expect.poll(async () => (await readdir(ledger)).filter(name => name.endsWith('.json')).length).toBeGreaterThan(0)
    const result = await f.start().ended
    expect(result.code).toBe(1); expect(result.stderr).toContain('未确认退出')
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worker, encoding: 'utf8' }).trim()).toBe(head)
    await expect(readFile(join(f.root, '.local/gh-calls'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(f.root, '.local/entered'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { old.kill('SIGTERM'); await ended; await rm(f.root, { recursive: true, force: true }) }
}, 30_000)
