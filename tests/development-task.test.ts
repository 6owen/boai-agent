/*
 * [INPUT]: 真实隔离Git仓库、固定进程检查及明确标为协议fixture的开发/审查回执。
 * [OUTPUT]: 同任务互斥、新增文件、真实旧失败/新通过、驳回返工及未知操作不重放。
 * [POS]: 控制器确定性验收；真实Codex、PR与产品功能另行验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { claimTask, digest, git } from '../scripts/development/task'
import { applyDevelopmentEdits, runDevelopmentTask, validateRequiredTests } from '../scripts/development/controller'
import { deliverDevelopmentTask } from '../scripts/development/pull-request'

let root: string, repository: string, base: string
const guard = resolve('dist/native/boai-process-guard')
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'boai-development-test-')); repository = join(root, 'source'); await mkdir(repository)
  git(repository, 'init', '-qb', 'main'); git(repository, 'config', 'user.name', 'Fixture'); git(repository, 'config', 'user.email', 'fixture@example.invalid')
  await writeFile(join(repository, 'answer.txt'), 'old')
  git(repository, 'add', '.'); git(repository, 'commit', '-qm', 'old implementation'); base = git(repository, 'rev-parse', 'HEAD')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const task = (id = 'repair-fixture') => ({ version: 1, taskId: id, goal: '修复真实测试中的旧值并保留原仓库。', acceptance: ['读取结果应为fixed，原仓库保持old。'], source: 'deterministic-controller-fixture', base, targetBranch: 'main', paths: ['answer.txt', 'feature.txt'], checks: [{ id: 'actual-value', command: process.execPath, args: ['-e', "if(require('node:fs').readFileSync('answer.txt','utf8')!=='fixed')process.exit(1)"], timeoutMs: 5000 }], maxAttempts: 2, maxCodexCalls: 4, timeoutMs: 30_000 })
it('必需测试必须唯一且实际成功，重复的失败不能被一个成功掩盖', () => {
  expect(validateRequiredTests({ testResults: [{ assertionResults: [{ fullName: 'required', status: 'passed' }, { fullName: 'required', status: 'failed' }] }] }, ['required'])).toBe(false)
  expect(validateRequiredTests({ testResults: [{ assertionResults: [{ fullName: 'required', status: 'skipped' }] }] }, ['required'])).toBe(false)
})
it('两个关联worktree不能同时领取同一个任务，另一任务不共用状态', async () => {
  const alternate = join(root, 'alternate'); git(repository, 'worktree', 'add', '--detach', alternate, base)
  const first = claimTask(repository, task()), other = claimTask(alternate, task('other-fixture'))
  try { expect(() => claimTask(alternate, task())).toThrow(/资源锁/); expect(other.directory).not.toBe(first.directory) }
  finally { other.release(); first.release() }
})
it('真实旧检查失败，新增文件与修复经独立驳回/返工后通过，重复事件不重放', async () => {
  const calls: string[] = []
  const agent = async (kind: 'develop' | 'review', input: { state: { worktree: string; attempt: number } }) => {
    calls.push(kind)
    if (kind === 'review') return { value: { approved: input.state.attempt === 2, findings: input.state.attempt === 1 ? ['需要补充任务要求的新增文件'] : [], summary: '独立协议fixture审查' }, usage: { totalTokens: 20 } }
    const file = input.state.attempt === 1 ? 'answer.txt' : 'feature.txt', bytes = await readFile(join(input.state.worktree, file)).catch(() => null)
    return { value: { summary: '协议fixture补丁', edits: [{ path: file, beforeSha256: bytes ? digest(bytes) : null, content: file === 'answer.txt' ? 'fixed' : 'new feature' }] }, usage: { totalTokens: 30 } }
  }
  const result = await runDevelopmentTask(repository, task(), undefined, { guard, agent })
  expect(result.state.phase, result.state.reason).toBe('reviewed')
  expect((result.state.baseline as { passed: boolean }).passed).toBe(false)
  expect((result.state.checks as { passed: boolean }).passed).toBe(true)
  expect(calls).toEqual(['develop', 'review', 'develop', 'review'])
  expect(await readFile(join(result.state.worktree, 'feature.txt'), 'utf8')).toBe('new feature')
  expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe('old')
  expect(git(repository, 'status', '--porcelain')).toBe('')
  await runDevelopmentTask(repository, task(), undefined, { guard, agent }); expect(calls).toHaveLength(4)
})
it('模型异常后重新运行只核对现场，不重复调用', async () => {
  let calls = 0
  const agent = async () => { calls++; throw new Error('模拟连接断开，结果未知') }
  const first = await runDevelopmentTask(repository, task(), undefined, { guard, agent })
  expect(first.state.phase).toBe('needs-reconciliation')
  await runDevelopmentTask(repository, task(), undefined, { guard, agent }); expect(calls).toBe(1)
})
it('修改输入不能复用同一taskId，且领取锁会释放', () => {
  const claim = claimTask(repository, task()); claim.release()
  expect(() => claimTask(repository, { ...task(), goal: '任务输入被偷偷修改，必须拒绝。' })).toThrow(/冻结输入/)
  claimTask(repository, task()).release()
})
it('发现后一个文件过期时，第一个文件也不被局部改写', async () => {
  await expect(applyDevelopmentEdits(repository, { paths: ['answer.txt', 'other.txt'] }, { summary: 'fixture', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'other.txt', beforeSha256: digest('missing'), content: 'new' }] })).rejects.toThrow(/过期/)
  expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe('old')
})
it('循环禁止修改UI基线及通过符号链接越界', async () => {
  await expect(applyDevelopmentEdits(repository, { paths: ['tests/'] }, { summary: 'fixture', edits: [{ path: 'tests/e2e/baselines/chat.png', beforeSha256: null, content: 'fake' }] })).rejects.toThrow(/UI期望基线/)
  await symlink(root, join(repository, 'outside'))
  await expect(applyDevelopmentEdits(repository, { paths: ['outside/'] }, { summary: 'fixture', edits: [{ path: 'outside/new.txt', beforeSha256: null, content: 'write' }] })).rejects.toThrow(/符号链接/)
})
async function reviewedTask() {
  const claim = claimTask(repository, task()), worktree = join(root, 'candidate')
  git(repository, 'worktree', 'add', '-b', claim.state.branch, worktree, base)
  await writeFile(join(worktree, 'answer.txt'), 'fixed'); git(worktree, 'commit', '-am', 'candidate')
  Object.assign(claim.state, { phase: 'reviewed', worktree, head: git(worktree, 'rev-parse', 'HEAD') })
  claim.state.checks = { passed: true, head: claim.state.head }; claim.state.review = { approved: true, head: claim.state.head, base }
  claim.save(); claim.release(); return claim.state
}
it('PR创建应答丢失后查询同一分支恢复，不重复推送/创建', async () => {
  const state = await reviewedTask(); let head = '', pushes = 0, creates = 0
  let prs: unknown[] = []
  const command = async (program: string, args: string[]) => {
    if (program === 'git' && args[0] === 'ls-remote') return `${args[2] === 'refs/heads/main' ? base : head}\t${args[2]}`
    if (program === 'git' && args[0] === 'push') { pushes++; head = state.head!; return '' }
    if (args[1] === 'list') return JSON.stringify(prs)
    creates++; prs = [{ number: 1, url: 'https://github.com/fixture/repo/pull/1', headRefOid: state.head, baseRefName: 'main', state: 'OPEN' }]
    throw new Error('创建成功但网络应答丢失')
  }
  expect((await deliverDevelopmentTask(repository, task(), command)).state.phase).toBe('pr-pending')
  const result = await deliverDevelopmentTask(repository, task(), command)
  expect(result.state.phase).toBe('delivered'); expect(creates).toBe(1); expect(pushes).toBe(1)
  await deliverDevelopmentTask(repository, task(), command); expect(creates).toBe(1); expect(pushes).toBe(1)
})
it('远程base变化拒绝用旧检查创建PR', async () => {
  await reviewedTask(); let calls = 0
  const result = await deliverDevelopmentTask(repository, task(), async () => { calls++; return 'f'.repeat(40) })
  expect(result.state.phase).not.toBe('delivered'); expect(result.state.reason).toContain('base已变化'); expect(calls).toBe(1)
})
it('候选被外部改写时不进行任何远程写入', async () => {
  const state = await reviewedTask(); await writeFile(join(state.worktree, 'answer.txt'), 'unreviewed')
  let calls = 0
  const result = await deliverDevelopmentTask(repository, task(), async () => { calls++; return '' })
  expect(result.state.reason).toContain('工作树变化'); expect(calls).toBe(0)
})
