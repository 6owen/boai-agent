/*
 * [INPUT]: 冻结开发任务、独立Git worktree、原进程工具和Codex结构化建议/审查。
 * [OUTPUT]: 固定提交检查、独立审查及有界返工；规范路径拒绝基线别名，未知中断不重放。
 * [POS]: 开发侧控制器；原产品员工/会话/模型运行逻辑保持。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { repairProcess, saveProcess, type ProcessReceipt } from '../../tests/evaluation/repair-process'
import { claimTask, digest, git, relativePath, type Task, type TaskState } from './task'

export const editsSchema = z.object({ summary: z.string().min(1), edits: z.array(z.object({ path: relativePath, beforeSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), content: z.string().max(512_000).nullable(), replacements: z.array(z.object({ oldText: z.string().min(1), newText: z.string().max(256_000) }).strict()).min(1).max(30).nullable().default(null) }).strict()).min(1).max(40) }).strict()
export const reviewSchema = z.object({ approved: z.boolean(), findings: z.array(z.string().min(1)), summary: z.string().min(1) }).strict().refine(value => !value.approved || !value.findings.length, '有待处理问题不能批准')
type AgentOutput = { value: unknown; usage: { totalTokens: number } | null }
interface Dependencies {
  agent?(kind: 'develop' | 'review', input: { task: Task; state: TaskState; directory: string; prompt: string; signal: AbortSignal; timeoutMs: number }): Promise<AgentOutput>;
  guard?: string;
}
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const optional = (file: string) => readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
export function validateRequiredTests(report: { testResults: { assertionResults: { fullName: string; status: string }[] }[] }, required: string[]) {
  const tests = report.testResults.flatMap(file => file.assertionResults)
  return required.every(name => { const found = tests.filter(test => test.fullName === name); return found.length === 1 && found[0].status === 'passed' })
}
export function allowedPath(task: Pick<Task, 'paths'>, path: string) {
  const lower = path.toLowerCase()
  return relativePath.safeParse(path).success && !path.endsWith('/') && lower !== 'tests/e2e/baselines' && !lower.startsWith('tests/e2e/baselines/') && task.paths.some(scope => scope.endsWith('/') ? path.startsWith(scope) : path === scope)
}
export async function applyDevelopmentEdits(worktree: string, task: Pick<Task, 'paths'>, raw: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const proposal = editsSchema.parse(raw), paths = new Set<string>()
  const prepared = new Map<string, string | null>()
  for (const edit of proposal.edits) {
    if (paths.has(edit.path) || !allowedPath(task, edit.path)) throw new Error(`越出冻结范围、重复路径或修改UI期望基线：${edit.path}`)
    paths.add(edit.path)
    const parts = edit.path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const path = join(worktree, ...parts.slice(0, index)), entry = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (entry?.isSymbolicLink()) throw new Error(`拒绝经符号链接改写：${edit.path}`)
    }
    const bytes = await optional(join(worktree, edit.path))
    if ((bytes ? digest(bytes) : null) !== edit.beforeSha256) throw new Error(`文件已变化，拒绝过期修改：${edit.path}`)
    if (edit.replacements) {
      if (!bytes || edit.content !== null) throw new Error(`局部替换仅适用于现有文件，content必须为null：${edit.path}`)
      let text = bytes.toString('utf8')
      if (!Buffer.from(text).equals(bytes)) throw new Error(`局部替换只处理UTF-8文本：${edit.path}`)
      for (const replacement of edit.replacements) {
        if (replacement.oldText === replacement.newText || text.indexOf(replacement.oldText) < 0 || text.indexOf(replacement.oldText) !== text.lastIndexOf(replacement.oldText)) throw new Error(`替换必须唯一且有实际变化：${edit.path}`)
        text = text.replace(replacement.oldText, () => replacement.newText)
      }
      prepared.set(edit.path, text)
    } else {
      if (!bytes && edit.content === null) throw new Error(`不能删除不存在的文件：${edit.path}`)
      prepared.set(edit.path, edit.content)
    }
  }
  // All inputs are checked before the first write. A crash partway through an
  // apply remains pending and requires reconciliation; it is never replayed.
  for (const [name, content] of prepared) {
    signal?.throwIfAborted()
    const path = join(worktree, name)
    if (content === null) await rm(path)
    else { await mkdir(dirname(path), { recursive: true }); signal?.throwIfAborted(); await writeFile(path, content) }
  }
  return proposal
}

export async function runDevelopmentTask(repository: string, raw: unknown, signal = new AbortController().signal, dependencies: Dependencies = {}) {
  repository = resolve(repository)
  const claim = claimTask(repository, raw), { task, state, directory } = claim, started = Date.now()
  const guard = dependencies.guard ?? join(repository, 'dist/native/boai-process-guard')
  const remaining = () => { signal.throwIfAborted(); const ms = task.timeoutMs - (Date.now() - started); if (ms <= 0) throw new Error('登记的本轮总期限已到'); return ms }
  const update = (phase: string, reason?: string) => { state.phase = phase; state.reason = reason; claim.save() }
  const begin = async (kind: string, name: string) => {
    const output = join(directory, name); await mkdir(output)
    state.pending = { id: name, kind, directory: output, started: false }; claim.save(); return output
  }
  const finish = () => { delete state.pending; claim.save() }
  const executeChecks = async (name: string, checks = task.checks) => {
    const output = await begin('checks', name), results = []
    const head = git(state.worktree, 'rev-parse', 'HEAD')
    state.pending!.started = true; claim.save()
    for (const check of checks) {
      if (check.report) {
        git(state.worktree, 'check-ignore', check.report.path)
        await rm(join(state.worktree, check.report.path), { force: true })
      }
      const receipt = await repairProcess({ ...check, cwd: state.worktree, signal, timeoutMs: Math.min(check.timeoutMs, remaining()), managed: { guard, ledger: join(output, `${check.id}-processes`) }, capture: { directory: output, prefix: check.id } })
      await saveProcess(output, check.id, receipt)
      let error = receipt.failure ?? (receipt.exitCode === 0 ? undefined : `退出${receipt.exitCode}`)
      let reportEvidence: { file: string; sha256: string } | undefined
      if (check.report) {
        try {
          const bytes = await readFile(join(state.worktree, check.report.path)), file = join(output, `${check.id}.report.json`)
          await writeFile(file, bytes, { flag: 'wx' }); reportEvidence = { file, sha256: digest(bytes) }
          if (!validateRequiredTests(JSON.parse(bytes.toString('utf8')), check.report.requiredTests)) error = [error, '必需测试缺失、跳过、重复或未通过'].filter(Boolean).join('；')
        } catch (failure) { error = [error, `缺少完整原始报告：${failure}`].filter(Boolean).join('；') }
      }
      results.push({ id: check.id, passed: !error, error, exitCode: receipt.exitCode, report: reportEvidence })
    }
    if (git(state.worktree, 'rev-parse', 'HEAD') !== head || git(state.worktree, 'status', '--porcelain')) throw new Error('检查期间提交或源码变化，结论无效')
    const result = { head, passed: results.every(check => check.passed), checks: results }
    await save(join(output, 'result.json'), result); finish(); return result
  }
  const agent = async (kind: 'develop' | 'review', output: string, prompt: string): Promise<AgentOutput> => {
    remaining()
    if (state.codexCalls >= task.maxCodexCalls || state.knownTokens >= task.maxTokens || !state.usageComplete) throw new Error('模型调用/已知token到限或用量未知，停止继续请求')
    const previousUsageComplete = state.usageComplete
    state.codexCalls++; state.usageComplete = false; claim.save() // Reserve before invoking. Failed requests are never refunded.
    state.pending!.started = true; claim.save()
    let result: AgentOutput
    if (dependencies.agent) result = await dependencies.agent(kind, { task, state, directory: output, prompt, signal, timeoutMs: remaining() })
    else {
      const schema = kind === 'develop' ? editsSchema : reviewSchema
      const schemaFile = join(output, 'schema.json'), answer = join(output, 'answer.json')
      await save(schemaFile, z.toJSONSchema(schema)); await writeFile(join(output, 'prompt.txt'), prompt, { flag: 'wx' })
      const args = ['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '--disable', 'multi_agent', '--disable', 'hooks', '--disable', 'plugins', '--disable', 'apps', '--disable', 'memories', '--disable', 'unbounded_connection_retries', '--json', '--color', 'never', '--cd', state.worktree, '--output-schema', schemaFile, '--output-last-message', answer]
      if (task.model) args.push('--model', task.model)
      args.push('-')
      const receipt: ProcessReceipt = await repairProcess({ command: 'codex', args, cwd: state.worktree, codex: true, stdin: prompt, signal, timeoutMs: remaining(), managed: { guard, ledger: join(output, 'processes') }, capture: { directory: output, prefix: 'codex' } })
      await saveProcess(output, 'codex', receipt)
      if (receipt.failure || receipt.exitCode !== 0) throw new Error(`Codex会话失败/未知：${receipt.failure ?? receipt.exitCode}`)
      const turns = receipt.stdout.split('\n').flatMap(line => { try { const value = JSON.parse(line); return value.type === 'turn.completed' ? [value] : [] } catch { return [] } })
      const usage = turns.length === 1 ? turns[0].usage : null
      result = { value: schema.parse(await json(answer)), usage: usage && ['input_tokens', 'output_tokens', 'cached_input_tokens'].every(key => Number.isInteger(usage[key]) && usage[key] >= 0) ? { totalTokens: usage.input_tokens + usage.output_tokens } : null }
    }
    state.usageComplete = previousUsageComplete && result.usage !== null; state.knownTokens += result.usage?.totalTokens ?? 0; claim.save()
    await save(join(output, 'result.json'), result); return result
  }
  try {
    const controllerHash = process.env.BOAI_DEV_CONTROLLER_HASH
    if (state.controllerHash && controllerHash !== state.controllerHash) throw new Error('控制器身份已变化，需要独立核对旧任务')
    if (controllerHash) state.controllerHash = controllerHash
    state.environment ??= { node: process.version, platform: process.platform, arch: process.arch }; claim.save()
    if (process.env.BOAI_DEV_CONTROLLER_FILE && controllerHash) {
      const bytes = await readFile(process.env.BOAI_DEV_CONTROLLER_FILE)
      if (digest(bytes) !== controllerHash) throw new Error('控制器原字节身份不匹配')
      const file = join(directory, `controller-${controllerHash}.mjs`), previous = await optional(file)
      if (previous && digest(previous) !== controllerHash) throw new Error('控制器原件被改写')
      if (!previous) await writeFile(file, bytes, { flag: 'wx' })
      state.controllerArtifact = file; claim.save()
    }
    if (state.pending) { update('needs-reconciliation', `上次${state.pending.kind}结果待核对，不自动重放`); return { directory, state } }
    if (state.phase !== 'registered') return { directory, state }
    if (!dependencies.agent) {
      if (!task.model) throw new Error('实际Codex任务必须明确冻结model，不能依赖变化的CLI默认值')
      state.environment.codex = execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim(); claim.save()
    }
    git(repository, 'check-ref-format', '--branch', task.targetBranch)
    if (git(repository, 'rev-parse', `${task.base}^{commit}`) !== task.base) throw new Error('基础提交不匹配')
    if (git(repository, 'rev-parse', task.targetBranch) !== task.base) throw new Error('目标基础分支已变化，请建立任务修订')
    const worktree = join(dirname(repository), 'boai-tasks', task.taskId)
    await mkdir(dirname(worktree), { recursive: true })
    await begin('worktree', 'prepare')
    state.pending!.started = true; claim.save()
    git(repository, 'worktree', 'add', '-b', state.branch, worktree, task.base)
    state.worktree = worktree; state.head = task.base; finish()
    if (task.setup.length && !(await executeChecks('setup', task.setup)).passed) throw new Error('冻结环境准备失败，未调用模型')
    update('baseline'); state.baseline = await executeChecks('baseline'); claim.save()
    for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
      remaining(); state.attempt = attempt; update('developing')
      const output = await begin('develop', `attempt-${attempt}-develop`)
      const prompt = `你是BOAI开发者。在当前专属worktree只读核对代码，返回小而精确的结构化补丁。现有文件优先content=null及replacements中的唯一oldText/newText，避免输出整个大文件；新文件使用content与replacements=null，删除使用二者null。beforeSha256是当前原字节hash，新文件为null。可新增/删除范围内文件，不得提交、写文件或改验收/基线。遵守AGENTS及目录地图。不要分派子代理或自行执行独立审查，控制器会另开独立审查会话。\n冻结任务：${JSON.stringify(task)}\n上轮真实结果：${JSON.stringify({ baseline: state.baseline, checks: state.checks, review: state.review })}\n完整检查原件在${directory}，自行读取，不仅依赖摘要。`
      const proposal = await agent('develop', output, prompt)
      remaining()
      if (git(state.worktree, 'rev-parse', 'HEAD') !== state.head || git(state.worktree, 'status', '--porcelain')) throw new Error('开发会话改写了受控worktree，需核对')
      await applyDevelopmentEdits(state.worktree, task, proposal.value, signal)
      remaining()
      if (!git(state.worktree, 'status', '--porcelain')) throw new Error('开发未产生实际修改')
      git(state.worktree, 'add', '--all'); git(state.worktree, 'commit', '-m', `${task.taskId}: attempt ${attempt}`)
      state.head = git(state.worktree, 'rev-parse', 'HEAD'); finish()
      const dependencyChanges = git(state.worktree, 'diff', task.base, state.head, '--name-only', '--', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
      if (dependencyChanges && (!task.setup.length || !(await executeChecks(`attempt-${attempt}-setup`, task.setup)).passed)) throw new Error('依赖输入变化后未完成冻结环境准备')
      update('checking'); state.checks = await executeChecks(`attempt-${attempt}-checks`); claim.save()
      if (!(state.checks as { passed: boolean }).passed) continue
      update('reviewing')
      const reviewOutput = await begin('review', `attempt-${attempt}-review`)
      const reviewedHead = state.head
      const review = await agent('review', reviewOutput, `你是独立审查者，新的无历史会话。读取完整diff、源码、任务和实际检查原件；按仓库标准/需求给出是否批准及可定位问题，不因开发者摘要批准。禁止改写任何文件或执行合并。\n任务：${JSON.stringify(task)}\n固定base ${task.base}，head ${reviewedHead}；完整原件${directory}。\n必须实际读取git diff ${task.base}...${reviewedHead}，检查变更范围、测试强度、目录地图及UI基线保护。`)
      remaining()
      state.review = { ...reviewSchema.parse(review.value), head: reviewedHead, base: task.base, directory: reviewOutput, model: task.model ?? 'codex-default', checksHash: digest(JSON.stringify(state.checks)) }
      if (git(state.worktree, 'rev-parse', 'HEAD') !== reviewedHead || git(state.worktree, 'status', '--porcelain')) throw new Error('审查期间提交或文件变化，结论失效')
      finish()
      if (git(repository, 'rev-parse', task.targetBranch) !== task.base) throw new Error('目标基础分支已变化，旧检查和审查不能交付')
      remaining()
      if ((state.review as { approved: boolean }).approved && state.usageComplete && state.knownTokens <= task.maxTokens) { update('reviewed'); return { directory, state } }
    }
    update('stopped', '尝试到限；保留原失败、提交与worktree')
  } catch (error) { if (state.pending && !state.pending.started) delete state.pending; update(signal.aborted ? 'cancelled' : state.pending ? 'needs-reconciliation' : 'stopped', String(error)) }
  finally { claim.release() }
  return { directory, state }
}
