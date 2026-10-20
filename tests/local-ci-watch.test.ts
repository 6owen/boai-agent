/*
 * [INPUT]: 明确同仓库/外部PR分页、专用目录所有权及真实native guard进程。
 * [OUTPUT]: 调度身份/去重/未知归属拒绝；父级、T1与UI存活账本均阻止换版。
 * [POS]: 本地轮询边界测试；不访问GitHub、不运行GUI或注册服务。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { drainPendingProcesses } from '../scripts/development/recovery'
// @ts-expect-error Node CLI helper has no declaration file.
import { localCiTargets, assertCiWorkerOwner, drainCiWorker } from '../scripts/local-ci-watch.mjs'
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
