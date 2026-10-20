/*
 * [INPUT]: 真实隔离Git仓库、固定进程检查及明确标为协议fixture的开发/审查回执。
 * [OUTPUT]: 同任务互斥、路径别名拒绝、新增文件、真实旧失败/新通过及未知操作不重放。
 * [POS]: 控制器确定性验收；真实Codex、PR与产品功能另行验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { claimTask, digest, git, taskStatus } from '../scripts/development/task'
import { applyDevelopmentEdits, runDevelopmentTask, validateRequiredTests } from '../scripts/development/controller'
import { deliverDevelopmentTask } from '../scripts/development/pull-request'

let root: string, repository: string, base: string
const guard = resolve('dist/native/boai-process-guard')
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'boai-development-test-')); repository = join(root, 'source'); await mkdir(repository)
  git(repository, 'init', '-qb', 'main'); git(repository, 'config', 'user.name', 'Fixture'); git(repository, 'config', 'user.email', 'fixture@example.invalid')
  await writeFile(join(repository, 'answer.txt'), 'old')
  await writeFile(join(repository, '.gitignore'), 'test-results/\n')
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
  expect(first.state.usageComplete).toBe(false)
  await runDevelopmentTask(repository, task(), undefined, { guard, agent }); expect(calls).toBe(1)
})
it.each(['develop', 'review'] as const)('%s回执返回时已取消，不再应用补丁或签发可交付状态', async cancelledKind => {
  const controller = new AbortController(), calls: string[] = []
  const agent = async (kind: 'develop' | 'review') => {
    calls.push(kind)
    if (kind === cancelledKind) controller.abort()
    return { value: kind === 'develop' ? { summary: 'fixture', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] } : { approved: true, findings: [], summary: 'fixture review' }, usage: { totalTokens: 10 } }
  }
  const result = await runDevelopmentTask(repository, task(), controller.signal, { guard, agent })
  expect(result.state.phase).toBe('cancelled'); expect(result.state.usageComplete).toBe(true)
  expect(calls).toEqual(cancelledKind === 'develop' ? ['develop'] : ['develop', 'review'])
  if (cancelledKind === 'develop') {
    expect(git(result.state.worktree, 'rev-parse', 'HEAD')).toBe(base)
    expect(await readFile(join(result.state.worktree, 'answer.txt'), 'utf8')).toBe('old')
  }
  let remoteCalls = 0
  await deliverDevelopmentTask(repository, task(), async () => { remoteCalls++; return '' })
  expect(remoteCalls).toBe(0)
  const count = calls.length; await runDevelopmentTask(repository, task(), undefined, { guard, agent }); expect(calls).toHaveLength(count)
})
it('修改输入不能复用同一taskId，且领取锁会释放', () => {
  const claim = claimTask(repository, task()); claim.release()
  expect(() => claimTask(repository, { ...task(), goal: '任务输入被偷偷修改，必须拒绝。' })).toThrow(/冻结输入/)
  claimTask(repository, task()).release()
})
it('任务文件已写但状态尚未写的中断可以查询并补登记，不重新执行', async () => {
  const first = claimTask(repository, task()); first.release(); await rm(join(first.directory, 'state.json'))
  expect(taskStatus(repository, task().taskId).state.phase).toBe('registration-interrupted')
  const recovered = claimTask(repository, task())
  try { expect(recovered.state.phase).toBe('registered'); expect(recovered.state.codexCalls).toBe(0) } finally { recovered.release() }
})
it('失败和成功的原始测试JSON分别保存在各轮目录，后轮不能覆盖基线原件', async () => {
  const code = "const fs=require('node:fs'),ok=fs.readFileSync('answer.txt','utf8')==='fixed';fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/report.json',JSON.stringify({testResults:[{assertionResults:[{fullName:'required',status:ok?'passed':'failed'}]}]}));process.exit(ok?0:1)"
  const input = { ...task(), checks: [{ id: 'actual-value', command: process.execPath, args: ['-e', code], timeoutMs: 5000, report: { path: 'test-results/report.json', requiredTests: ['required'] } }] }
  const agent = async (kind: 'develop' | 'review') => ({ value: kind === 'develop' ? { summary: 'fixture', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] } : { approved: true, findings: [], summary: 'fixture review' }, usage: { totalTokens: 10 } })
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent })
  expect(result.state.phase, result.state.reason).toBe('reviewed')
  const before = await readFile(join(result.directory, 'baseline/actual-value.report.json'), 'utf8'), after = await readFile(join(result.directory, 'attempt-1-checks/actual-value.report.json'), 'utf8')
  expect(before).toContain('failed'); expect(after).toContain('passed')
  expect((result.state.review as { checksHash: string }).checksHash).toBe(digest(JSON.stringify(result.state.checks)))
})
it('发现后一个文件过期时，第一个文件也不被局部改写', async () => {
  await expect(applyDevelopmentEdits(repository, { paths: ['answer.txt', 'other.txt'] }, { summary: 'fixture', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'other.txt', beforeSha256: digest('missing'), content: 'new' }] })).rejects.toThrow(/过期/)
  expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe('old')
})
it('大文件使用小型精确替换，替换正文的美元字符保持原样', async () => {
  const original = '保留的正文。'.repeat(30_000) + 'unique old tail'
  await writeFile(join(repository, 'answer.txt'), original)
  const proposal = { summary: '局部修改', edits: [{ path: 'answer.txt', beforeSha256: digest(original), content: null, replacements: [{ oldText: 'unique old tail', newText: 'literal $& and $$' }] }] }
  expect(JSON.stringify(proposal).length).toBeLessThan(1000)
  await applyDevelopmentEdits(repository, { paths: ['answer.txt'] }, proposal)
  expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe(original.replace('unique old tail', () => 'literal $& and $$'))
})
it('循环禁止修改UI基线及通过符号链接越界', async () => {
  await expect(applyDevelopmentEdits(repository, { paths: ['tests/'] }, { summary: 'fixture', edits: [{ path: 'tests/e2e/baselines/chat.png', beforeSha256: null, content: 'fake' }] })).rejects.toThrow(/UI期望基线/)
  await symlink(root, join(repository, 'outside'))
  await expect(applyDevelopmentEdits(repository, { paths: ['outside/'] }, { summary: 'fixture', edits: [{ path: 'outside/new.txt', beforeSha256: null, content: 'write' }] })).rejects.toThrow(/符号链接/)
})
it('重复分隔符和大小写别名不能改写受保护基线，非规范任务范围拒绝登记', async () => {
  const directory = join(repository, 'tests/e2e/baselines'); await mkdir(directory, { recursive: true })
  const file = join(directory, 'chat.png'); await writeFile(file, 'accepted baseline')
  for (const path of ['tests//e2e/baselines/chat.png', 'tests/e2e//baselines/chat.png', 'tests/e2e/BASELINES/chat.png', 'tests/e2e/baselines/chat.png/']) {
    await expect(applyDevelopmentEdits(repository, { paths: ['tests/'] }, { summary: '别名绕过负例', edits: [{ path, beforeSha256: digest('accepted baseline'), content: 'overwritten' }] })).rejects.toThrow(/规范明确路径|UI期望基线/)
    expect(await readFile(file, 'utf8')).toBe('accepted baseline')
  }
  for (const path of ['tests//', '.GIT/config', '.LOCAL/data', '/absolute', 'tests/../answer.txt', 'tests/./answer.txt']) expect(() => claimTask(repository, { ...task(), paths: [path] })).toThrow(/规范明确路径/)
})
async function reviewedTask() {
  const claim = claimTask(repository, task()), worktree = join(root, 'candidate')
  git(repository, 'worktree', 'add', '-b', claim.state.branch, worktree, base)
  await writeFile(join(worktree, 'answer.txt'), 'fixed'); git(worktree, 'commit', '-am', 'candidate')
  Object.assign(claim.state, { phase: 'reviewed', worktree, head: git(worktree, 'rev-parse', 'HEAD') })
  claim.state.checks = { passed: true, head: claim.state.head }; claim.state.review = { approved: true, head: claim.state.head, base, checksHash: digest(JSON.stringify(claim.state.checks)) }
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
it('用户在远程查询期间取消，后续不得推送或创建PR', async () => {
  await reviewedTask(); const controller = new AbortController(); let calls = 0
  const result = await deliverDevelopmentTask(repository, task(), async () => { calls++; controller.abort(); return base }, controller.signal)
  expect(result.state.phase).not.toBe('delivered'); expect(calls).toBe(1)
})
it('worktree已detach且同名分支外移时，仍只推送获审查的冻结SHA', async () => {
  const state = await reviewedTask(); git(state.worktree, 'checkout', '--detach', state.head!); git(repository, 'branch', '-f', state.branch, base)
  let head = '', refspec = '', created = false
  const result = await deliverDevelopmentTask(repository, task(), async (program, args) => {
    if (program === 'git' && args[0] === 'ls-remote') return `${args[2] === 'refs/heads/main' ? base : head}\t${args[2]}`
    if (program === 'git') { refspec = args[2]; head = state.head!; return '' }
    if (args[1] === 'create') { created = true; return '' }
    return JSON.stringify(created ? [{ number: 1, url: 'https://github.com/fixture/repo/pull/1', headRefOid: state.head, baseRefName: 'main', state: 'OPEN' }] : [])
  })
  expect(result.state.phase).toBe('delivered'); expect(refspec).toBe(`${state.head}:refs/heads/${state.branch}`)
})
it('PR创建期间base推进后保持待核对，不能签发交付成功', async () => {
  const state = await reviewedTask(); let reads = 0, head = '', created = false
  const result = await deliverDevelopmentTask(repository, task(), async (program, args) => {
    if (program === 'git' && args[0] === 'ls-remote') return args[2] === 'refs/heads/main' ? (++reads === 1 ? base : 'f'.repeat(40)) : head
    if (program === 'git') { head = state.head!; return '' }
    if (args[1] === 'create') { created = true; return '' }
    return JSON.stringify(created ? [{ number: 1, url: 'https://github.com/fixture/repo/pull/1', headRefOid: state.head, baseRefName: 'main', state: 'OPEN' }] : [])
  })
  expect(result.state.phase).toBe('pr-pending'); expect(result.state.reason).toContain('交付期间base已变化')
})
