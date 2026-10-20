/*
 * [INPUT]: 真实隔离Git仓库、固定进程检查及明确标为协议fixture的开发/审查回执。
 * [OUTPUT]: 互斥/返工/PR及文件/回执锚定窗口真实SIGKILL；重命名源路径与回执/历史/预算/索引外改拒绝。
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

it.each(['worktree', 'checks', 'develop', 'review'].flatMap(kind => ['anchor', 'receipt'].map(point => ({ kind, point }))))('$kind的$point保存后中断，显式接续不重复已完成模型或检查', async interruption => {
  const input = task('checkpoint-fixture'), calls: string[] = []
  input.checks[0].args = ['-e', "const fs=require('node:fs');fs.mkdirSync('test-results',{recursive:true});fs.appendFileSync('test-results/count','check\\n');if(fs.readFileSync('answer.txt','utf8')!=='fixed')process.exit(1)"]
  const agent = async (kind: 'develop' | 'review') => {
    calls.push(kind)
    return { value: kind === 'develop' ? { summary: 'known patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] } : { approved: true, findings: [], summary: 'known review' }, usage: { totalTokens: 10 } }
  }
  let interrupted = false
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => {
    if (!interrupted && kind === interruption.kind && point === interruption.point) { interrupted = true; throw new Error('模拟owner在回执保存窗口退出') }
  } })
  expect(first.state.phase).toBe('needs-reconciliation')
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase, result.state.reason).toBe('reviewed')
  expect(calls).toEqual(['develop', 'review'])
  expect(result.state.codexCalls).toBe(2); expect(result.state.knownTokens).toBe(20)
  expect(await readFile(join(result.state.worktree, 'test-results/count'), 'utf8')).toBe('check\ncheck\n')
  expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe('old')
})
it.each(['file', 'commit'] as const)('补丁在%s后中断，核对现有字节/提交再继续，不重复模型或已提交修改', async point => {
  const input = task('partial-patch-fixture'), calls: string[] = []
  const agent = async (kind: 'develop' | 'review') => {
    calls.push(kind)
    return { value: kind === 'develop' ? { summary: 'two files', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'feature.txt', beforeSha256: null, content: 'new feature' }] } : { approved: true, findings: [], summary: 'review' }, usage: { totalTokens: 10 } }
  }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, current) => { if (kind === 'apply' && current === point) throw new Error('模拟应用中断') } })
  expect(first.state.phase).toBe('needs-reconciliation')
  expect(calls).toEqual(['develop'])
  expect(await readFile(join(first.state.worktree, 'answer.txt'), 'utf8')).toBe('fixed')
  if (point === 'file') await expect(readFile(join(first.state.worktree, 'feature.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  const previousHead = git(first.state.worktree, 'rev-parse', 'HEAD')
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase, result.state.reason).toBe('reviewed')
  expect(calls).toEqual(['develop', 'review'])
  expect(await readFile(join(result.state.worktree, 'feature.txt'), 'utf8')).toBe('new feature')
  expect(git(result.state.worktree, 'rev-list', '--count', `${base}..HEAD`)).toBe('1')
  if (point === 'commit') expect(result.state.head).toBe(previousHead)
})
it('恢复发现第三种文件内容时不覆盖外改，也不重新请求模型', async () => {
  const input = task('changed-partial-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'feature.txt', beforeSha256: null, content: 'new feature' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (_kind, point) => { if (point === 'file') throw new Error('interrupted') } })
  await writeFile(join(first.state.worktree, 'feature.txt'), 'external edit')
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('未知文件内容')
  expect(await readFile(join(first.state.worktree, 'feature.txt'), 'utf8')).toBe('external edit')
  expect(calls).toBe(1)
})
it('检查点原始回执被改写后拒绝接续，不把旧通过结论用于新内容', async () => {
  const input = task('changed-receipt-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => { if (kind === 'develop' && point === 'receipt') throw new Error('interrupted after receipt') } })
  await writeFile(join(first.state.pending!.directory, 'result.json'), '{}')
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('原始文件/日志已变化'); expect(calls).toBe(1)
})
it('缺少完整模型回执时显式resume仍然不重放，恢复也不能续期', async () => {
  const input = task('unknown-resume-fixture'); let calls = 0
  const agent = async () => { calls++; throw new Error('unknown model result') }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent })
  const deadline = first.state.deadline
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('不重放未知模型')
  expect(calls).toBe(1); expect(result.state.deadline).toBe(deadline); expect(result.state.usageComplete).toBe(false)
})

it.each(['file', 'anchor'] as const)('真实owner在apply的%s窗口被SIGKILL后接续，模型回执和唯一候选提交保持', async point => {
  const { build } = await import('esbuild')
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const local = resolve('.local'); await mkdir(local, { recursive: true })
  const tools = await mkdtemp(join(local, 'development-kill-proof-'))
  const config = join(root, 'task.json'), calls = join(root, 'calls.txt'), marker = join(root, 'killed.txt')
  const input = task('actual-kill-fixture')
  await writeFile(config, JSON.stringify(input))
  const entry = join(tools, 'owner.mjs')
  const code = `
    import { readFile, appendFile, writeFile } from 'node:fs/promises';
    import { runDevelopmentTask } from './scripts/development/controller.ts';
    import { digest } from './scripts/development/task.ts';
    const [repository, config, guard, calls, marker] = process.argv.slice(2);
    const task = JSON.parse(await readFile(config, 'utf8'));
    await runDevelopmentTask(repository, task, undefined, { guard,
      agent: async kind => { await appendFile(calls, kind+'\\n'); return {value:kind==='develop'?{summary:'kill proof',edits:[{path:'answer.txt',beforeSha256:digest('old'),content:'fixed'},{path:'feature.txt',beforeSha256:null,content:'new feature'}]}:{approved:true,findings:[],summary:'review'},usage:{totalTokens:10}} },
      checkpointFault: async (kind, point) => { if(kind==='apply'&&point===${JSON.stringify(point)}){await writeFile(marker,point);process.kill(process.pid,'SIGKILL')} }
    });
  `
  try {
    await build({ stdin: { contents: code, resolveDir: process.cwd() }, outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' })
    const child = spawn(process.execPath, [entry, repository, config, guard, calls, marker], { stdio: 'ignore' })
    const [exitCode, signal] = await once(child, 'exit')
    expect(exitCode).toBeNull(); expect(signal).toBe('SIGKILL')
    expect(await readFile(marker, 'utf8')).toBe(point)
    const state = taskStatus(repository, input.taskId).state as { worktree: string }
    expect(await readFile(join(state.worktree, 'answer.txt'), 'utf8')).toBe('fixed')
    if (point === 'file') await expect(readFile(join(state.worktree, 'feature.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    else {
      expect(await readFile(join(state.worktree, 'feature.txt'), 'utf8')).toBe('new feature')
      expect(git(state.worktree, 'rev-parse', 'HEAD')).not.toBe(base)
      const pending = (taskStatus(repository, input.taskId).state as { pending: { directory: string } }).pending
      await expect(readFile(join(pending.directory, 'checkpoint.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    const result = await runDevelopmentTask(repository, input, undefined, { guard, resume: true, agent: async kind => {
      const { appendFile } = await import('node:fs/promises'); await appendFile(calls, kind + '\n')
      return { value: { approved: true, findings: [], summary: 'fresh fixture reviewer' }, usage: { totalTokens: 10 } }
    } })
    expect(result.state.phase, result.state.reason).toBe('reviewed')
    expect(await readFile(calls, 'utf8')).toBe('develop\nreview\n')
    expect(git(result.state.worktree, 'rev-list', '--count', `${base}..HEAD`)).toBe('1')
    expect(await readFile(join(repository, 'answer.txt'), 'utf8')).toBe('old')
  } finally { await rm(tools, { recursive: true, force: true }) }
})
it('范围外文件重命名为允许新增的文件也不能随恢复提交，保留原索引和HEAD', async () => {
  const { applyJournal } = await import('../scripts/development/recovery')
  git(repository, 'mv', 'answer.txt', 'feature.txt')
  const index = git(repository, 'ls-files', '--stage')
  expect(git(repository, 'diff', '--cached', '--name-only', base)).toBe('feature.txt')
  await expect(applyJournal(repository, base, [{ path: 'feature.txt', before: null, after: Buffer.from('old').toString('base64'), executable: false }], new AbortController().signal)).rejects.toThrow('范围外修改或暂存改动')
  expect(git(repository, 'ls-files', '--stage')).toBe(index)
  expect(git(repository, 'rev-parse', 'HEAD')).toBe(base)
  expect(await readFile(join(repository, 'feature.txt'), 'utf8')).toBe('old')
  await expect(readFile(join(repository, 'answer.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['bytes', 'deadline'])('完成标记缺失时，锚定回执的%s被改写仍不能补写或继续', async field => {
  const input = task('anchor-corruption-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => { if (kind === 'develop' && point === 'anchor') throw new Error('anchored before completion marker') } })
  const claim = claimTask(repository, input)
  try {
    if (field === 'bytes') claim.state.pending!.checkpointBytes += 'changed bytes'
    else claim.state.deadline! += 100000
    claim.save()
  } finally { claim.release() }
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toMatch(/检查点自身hash不匹配|期限、预算或资格已变化/)
  expect(calls).toBe(1); expect(git(first.state.worktree, 'rev-parse', 'HEAD')).toBe(base)
  await expect(readFile(join(first.state.pending!.directory, 'checkpoint.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('兼容控制器迁移必须明确原hash并核对原字节，保留迁移记录', async () => {
  const { acceptController, WORKFLOW_VERSION } = await import('../scripts/development/recovery')
  const claim = claimTask(repository, task('controller-migration-fixture'))
  const first = join(root, 'old-controller.mjs'), second = join(root, 'new-controller.mjs')
  await writeFile(first, 'original controller'); await writeFile(second, 'compatible controller')
  const before = digest(await readFile(first)), after = digest(await readFile(second))
  claim.state.workflowVersion = WORKFLOW_VERSION
  try {
    await acceptController(claim, before, first)
    await expect(acceptController(claim, after, second)).rejects.toThrow('明确原hash')
    await expect(acceptController(claim, after, second, 'f'.repeat(64))).rejects.toThrow('明确原hash')
    await acceptController(claim, after, second, before)
    expect(claim.state.controllerHash).toBe(after)
    expect(claim.state.controllerHistory).toEqual([{ from: before, to: after, at: expect.any(String) }])
    expect(await readFile(join(claim.directory, `controller-${before}.mjs`), 'utf8')).toBe('original controller')
    await writeFile(claim.state.controllerArtifact!, 'tampered old artifact')
    await expect(acceptController(claim, before, first, after)).rejects.toThrow('完整原件')
    expect(claim.state.controllerHistory).toHaveLength(1)
  } finally { claim.release() }
})
it('补丁中断后执行位外改不能随恢复提交', async () => {
  const { chmod } = await import('node:fs/promises')
  const input = task('mode-change-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'feature.txt', beforeSha256: null, content: 'new feature' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (_kind, point) => { if (point === 'file') throw new Error('interrupted') } })
  await chmod(join(first.state.worktree, 'answer.txt'), 0o755)
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('未知执行权限'); expect(calls).toBe(1)
  expect(git(first.state.worktree, 'rev-parse', 'HEAD')).toBe(base)
})
it('完整回执可只读恢复，但已过最初绝对期限不能继续请求或提交', async () => {
  const { vi } = await import('vitest')
  const input = task('deadline-resume-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => { if (kind === 'develop' && point === 'receipt') throw new Error('receipt completed') } })
  const deadline = first.state.deadline!
  const now = vi.spyOn(Date, 'now').mockReturnValue(deadline + 1)
  try {
    const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
    expect(result.state.phase).toBe('stopped'); expect(result.state.reason).toContain('绝对总期限')
    expect(result.state.deadline).toBe(deadline); expect(calls).toBe(1)
    expect(await readFile(join(first.state.worktree, 'answer.txt'), 'utf8')).toBe('old')
    expect(git(first.state.worktree, 'rev-parse', 'HEAD')).toBe(base)
  } finally { now.mockRestore() }
})
it.each(['next', 'stateHash'])('完成检查点自身的%s被改写不能取得新资格', async field => {
  const input = task('checkpoint-bytes-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => { if (kind === 'develop' && point === 'receipt') throw new Error('receipt saved') } })
  const path = join(first.state.pending!.directory, 'checkpoint.json'), receipt = JSON.parse(await readFile(path, 'utf8'))
  receipt[field] = field === 'next' ? 'done' : 'f'.repeat(64); await writeFile(path, JSON.stringify(receipt))
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('检查点自身hash不匹配'); expect(calls).toBe(1)
  expect(result.state.deadline).toBe(first.state.deadline); expect(result.state.codexCalls).toBe(1); expect(result.state.knownTokens).toBe(10)
})
it.each(['deadline', 'codexCalls', 'knownTokens', 'checks', 'review'])('恢复原状态的%s与完成回执不一致时拒绝继续', async field => {
  const input = task('checkpoint-state-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] }, usage: { totalTokens: 10 } } }
  await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (kind, point) => { if (kind === 'develop' && point === 'receipt') throw new Error('receipt saved') } })
  const claim = claimTask(repository, input)
  try {
    if (field === 'deadline') claim.state.deadline! += 100000
    else if (field === 'codexCalls') claim.state.codexCalls = 0
    else if (field === 'knownTokens') claim.state.knownTokens = 0
    else if (field === 'checks') claim.state.checks = { passed: true, head: claim.state.head }
    else claim.state.review = { approved: true, head: claim.state.head }
    claim.save()
  } finally { claim.release() }
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toContain('期限、预算或资格已变化'); expect(calls).toBe(1)
})
it.each(['inside', 'outside'])('恢复拒绝%s的纯暂存外改，工作树还原不能掩盖或清掉索引', async scope => {
  const input = task('index-edit-fixture'); let calls = 0
  const agent = async () => { calls++; return { value: { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }, { path: 'feature.txt', beforeSha256: null, content: 'new feature' }] }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent, checkpointFault: async (_kind, point) => { if (point === 'file') throw new Error('partial patch') } })
  const path = scope === 'inside' ? 'answer.txt' : '.gitignore', original = await readFile(join(first.state.worktree, path))
  await writeFile(join(first.state.worktree, path), 'staged external edit'); git(first.state.worktree, 'add', '--', path)
  await writeFile(join(first.state.worktree, path), original)
  const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
  expect(result.state.phase).toBe('needs-reconciliation'); expect(result.state.reason).toMatch(/未知暂存内容|范围外修改或暂存改动/)
  expect(git(first.state.worktree, 'show', `:${path}`)).toBe('staged external edit'); expect(calls).toBe(1)
  await expect(readFile(join(first.state.worktree, 'feature.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['resume', 'deliver'])('已完成检查的原始日志被改写后%s不能继续使用旧通过', async operation => {
  const input = task('historical-evidence-fixture'); let calls = 0
  const agent = async (kind: 'develop' | 'review') => { calls++; return { value: kind === 'develop' ? { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] } : { approved: true, findings: [], summary: 'review' }, usage: { totalTokens: 10 } } }
  const first = await runDevelopmentTask(repository, input, undefined, { guard, agent })
  expect(first.state.phase).toBe('reviewed')
  await writeFile(join(first.directory, 'attempt-1-checks/actual-value.stdout.log'), 'changed original log')
  if (operation === 'resume') {
    const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
    expect(result.state.phase).toBe('stopped'); expect(result.state.reason).toContain('原始文件/日志已变化')
  } else {
    let remoteCalls = 0
    const result = await deliverDevelopmentTask(repository, input, async () => { remoteCalls++; return '' })
    expect(result.state.phase).toBe('reviewed'); expect(result.state.reason).toContain('原始文件/日志已变化'); expect(remoteCalls).toBe(0)
  }
  expect(calls).toBe(2)
})
it.each(['resume', 'deliver'])('不兼容旧恢复格式不能通过%s沿用旧资格或发起新请求', async operation => {
  const { WORKFLOW_VERSION } = await import('../scripts/development/recovery')
  const input = task('incompatible-workflow-fixture'); let calls = 0
  const agent = async (kind: 'develop' | 'review') => { calls++; return { value: kind === 'develop' ? { summary: 'patch', edits: [{ path: 'answer.txt', beforeSha256: digest('old'), content: 'fixed' }] } : { approved: true, findings: [], summary: 'review' }, usage: { totalTokens: 10 } } }
  await runDevelopmentTask(repository, input, undefined, { guard, agent })
  const claim = claimTask(repository, input)
  try { claim.state.workflowVersion = WORKFLOW_VERSION - 1; claim.save() } finally { claim.release() }
  if (operation === 'resume') {
    const result = await runDevelopmentTask(repository, input, undefined, { guard, agent, resume: true })
    expect(result.state.phase).toBe('stopped'); expect(result.state.reason).toContain('没有兼容恢复检查点')
  } else {
    let remoteCalls = 0
    const result = await deliverDevelopmentTask(repository, input, async () => { remoteCalls++; return '' })
    expect(result.state.reason).toContain('旧恢复流程格式不兼容'); expect(remoteCalls).toBe(0)
  }
  expect(calls).toBe(2)
})
