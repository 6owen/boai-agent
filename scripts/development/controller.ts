/*
 * [INPUT]: 冻结开发任务、独立Git worktree、原进程工具和Codex结构化建议/审查。
 * [OUTPUT]: 固定检查/独立审查/返工；回执原字节锚定与中断补写、历史/索引核验，不续期或重放未知操作。
 * [POS]: 开发侧控制器；原产品员工/会话/模型运行逻辑保持。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rm, lstat, readdir, rmdir, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { repairProcess, saveProcess, type ProcessReceipt } from '../../tests/evaluation/repair-process'
import { claimTask, digest, git, relativePath, type Task, type TaskState } from './task'
import { acceptController, applyJournal, checkpoint, drainPendingProcesses, recoverCheckpoint, verifyCheckpointReceipts, WORKFLOW_VERSION, writeEvidence, type Cursor, type FileChange } from './recovery'

export const editsSchema = z.object({ summary: z.string().min(1), edits: z.array(z.object({ path: relativePath, beforeSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), content: z.string().max(512_000).nullable(), replacements: z.array(z.object({ oldText: z.string().min(1), newText: z.string().max(256_000) }).strict()).min(1).max(30).nullable().default(null) }).strict()).min(1).max(40) }).strict()
export const reviewSchema = z.object({ approved: z.boolean(), findings: z.array(z.string().min(1)), summary: z.string().min(1) }).strict().refine(value => !value.approved || !value.findings.length, '有待处理问题不能批准')
type AgentOutput = { value: unknown; usage: { totalTokens: number } | null }
interface Dependencies {
  agent?(kind: 'develop' | 'review', input: { task: Task; state: TaskState; directory: string; prompt: string; signal: AbortSignal; timeoutMs: number }): Promise<AgentOutput>;
  guard?: string;
  resume?: boolean;
  previousController?: string;
  checkpointFault?(kind: string, point: 'anchor' | 'receipt' | 'file' | 'commit'): Promise<void>;
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
async function prepareDevelopmentEdits(worktree: string, task: Pick<Task, 'paths'>, raw: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const proposal = editsSchema.parse(raw), paths = new Set<string>()
  const prepared = new Map<string, string | null>()
  const before = new Map<string, string | null>()
  const executable = new Map<string, boolean>()
  for (const edit of proposal.edits) {
    if (paths.has(edit.path) || !allowedPath(task, edit.path)) throw new Error(`越出冻结范围、重复路径或修改UI期望基线：${edit.path}`)
    paths.add(edit.path)
    const parts = edit.path.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const path = join(worktree, ...parts.slice(0, index)), entry = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (entry?.isSymbolicLink()) throw new Error(`拒绝经符号链接改写：${edit.path}`)
    }
    const bytes = await optional(join(worktree, edit.path))
    before.set(edit.path, bytes?.toString('base64') ?? null)
    executable.set(edit.path, bytes ? Boolean((await lstat(join(worktree, edit.path))).mode & 0o111) : false)
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
  const changes = [...prepared].map(([path, content]) => ({ path, before: before.get(path)!, after: content === null ? null : Buffer.from(content).toString('base64'), executable: executable.get(path)! }))
  return { proposal, changes }
}
export async function applyDevelopmentEdits(worktree: string, task: Pick<Task, 'paths'>, raw: unknown, signal = new AbortController().signal) {
  const { proposal, changes } = await prepareDevelopmentEdits(worktree, task, raw, signal)
  // 独立文件补丁工具不操作Git索引；受控任务的应用/提交才走完整日记及索引核验。
  for (const change of changes) {
    signal.throwIfAborted()
    const path = join(worktree, change.path)
    if (change.after === null) await rm(path)
    else { await mkdir(dirname(path), { recursive: true }); signal.throwIfAborted(); await writeFile(path, Buffer.from(change.after, 'base64')) }
  }
  return proposal
}

export async function runDevelopmentTask(repository: string, raw: unknown, signal = new AbortController().signal, dependencies: Dependencies = {}) {
  repository = await realpath(resolve(repository))
  const claim = claimTask(repository, raw), { task, state, directory } = claim
  const guard = dependencies.guard ?? join(repository, 'dist/native/boai-process-guard')
  const remaining = () => { signal.throwIfAborted(); const ms = (state.deadline ?? 0) - Date.now(); if (ms <= 0) throw new Error('登记的绝对总期限已到，恢复不延长期限'); return ms }
  const update = (phase: string, reason?: string) => { state.phase = phase; state.reason = reason; claim.save() }
  const begin = async (kind: string, name: string) => {
    const output = join(directory, name)
    state.pending = { id: name, kind, directory: output, started: false }; claim.save()
    await mkdir(output); return output
  }
  const finish = (next: Cursor) => checkpoint(claim, next, () => dependencies.checkpointFault?.(state.pending!.kind, 'receipt') ?? Promise.resolve(), () => dependencies.checkpointFault?.(state.pending!.kind, 'anchor') ?? Promise.resolve())
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
    await save(join(output, 'result.json'), result); return result
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
    if (!dependencies.resume && (state.pending || state.phase !== 'registered')) {
      if (state.pending) update('needs-reconciliation', `上次${state.pending.kind}结果待核对；使用显式resume，不自动重放`)
      return { directory, state }
    }
    if (state.workflowVersion === undefined && state.phase === 'registered' && !state.pending) {
      state.workflowVersion = WORKFLOW_VERSION; state.cursor = 'prepare'; state.deadline = Date.now() + task.timeoutMs; claim.save()
    }
    if (state.workflowVersion !== WORKFLOW_VERSION || !state.cursor || !state.deadline) throw new Error('旧任务没有兼容恢复检查点；保留原件并建立明确任务修订')
    await acceptController(claim, process.env.BOAI_DEV_CONTROLLER_HASH, process.env.BOAI_DEV_CONTROLLER_FILE, dependencies.resume ? dependencies.previousController : undefined)
    if (dependencies.resume) await verifyCheckpointReceipts(claim)
    state.environment ??= { node: process.version, platform: process.platform, arch: process.arch }; claim.save()
    git(repository, 'check-ref-format', '--branch', task.targetBranch)
    if (git(repository, 'rev-parse', `${task.base}^{commit}`) !== task.base || git(repository, 'rev-parse', task.targetBranch) !== task.base) throw new Error('目标基础分支已变化，请建立任务修订；不能沿用旧检查')
    if (dependencies.resume && state.pending) {
      if (!/^[a-z0-9-]+$/.test(state.pending.id) || join(directory, state.pending.id) !== state.pending.directory) throw new Error('待恢复步骤目录与原任务不匹配')
      if (!state.pending.started && !state.pending.journalHash) {
        if (!state.usageComplete) throw new Error('模型调用已预留但未获完整回执；不重新请求')
        const files = await readdir(state.pending.directory).catch(error => { if (error.code === 'ENOENT') return null; throw error })
        if (files?.length) throw new Error('未启动步骤含未知原件，保留现场')
        if (files) await rmdir(state.pending.directory)
        delete state.pending; claim.save()
      }
    }
    if (dependencies.resume && state.pending) {
      await drainPendingProcesses(state.pending.directory, guard)
      if (!(await recoverCheckpoint(claim))) {
        if (!['worktree', 'apply'].includes(state.pending.kind)) throw new Error(`上次${state.pending.kind}缺少完整恢复回执；不重放未知模型或检查`)
      }
    }
    if (!dependencies.agent) {
      if (!task.model) throw new Error('实际Codex任务必须明确冻结model，不能依赖变化的CLI默认值')
      state.environment!.codex = execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim(); claim.save()
    }
    const worktree = join(dirname(repository), 'boai-tasks', task.taskId)
    if (state.cursor !== 'prepare') {
      if (state.worktree !== worktree || git(worktree, 'rev-parse', '--show-toplevel') !== worktree || git(worktree, 'rev-parse', '--git-common-dir') !== git(repository, 'rev-parse', '--path-format=absolute', '--git-common-dir')) throw new Error('任务工作树身份不匹配')
      if (state.pending?.kind !== 'apply' && (git(worktree, 'rev-parse', 'HEAD') !== state.head || git(worktree, 'status', '--porcelain'))) throw new Error('恢复时工作树或HEAD已变化，不能沿用旧结论')
    }
    while (state.cursor !== 'done') {
      remaining()
      switch (state.cursor) {
        case 'prepare': {
          await mkdir(dirname(worktree), { recursive: true })
          if (!state.pending) await begin('worktree', 'prepare')
          state.pending!.started = true; claim.save()
          const exists = await lstat(worktree).catch(error => { if (error.code === 'ENOENT') return null; throw error })
          if (!exists) git(repository, 'worktree', 'add', '-b', state.branch, worktree, task.base)
          if (exists?.isSymbolicLink() || git(worktree, 'rev-parse', 'HEAD') !== task.base || git(worktree, 'status', '--porcelain') || git(worktree, 'branch', '--show-current') !== state.branch || git(worktree, 'rev-parse', '--git-common-dir') !== git(repository, 'rev-parse', '--path-format=absolute', '--git-common-dir')) throw new Error('准备恢复发现未知worktree、分支或文件')
          state.worktree = worktree; state.head = task.base; await finish('setup'); break
        }
        case 'setup': {
          if (task.setup.length) {
            const result = await executeChecks('setup', task.setup)
            if (!result.passed) throw new Error('冻结环境准备失败，未调用模型')
            await finish('baseline')
          } else { state.cursor = 'baseline'; claim.save() }
          break
        }
        case 'baseline': {
          update('baseline'); state.baseline = await executeChecks('baseline'); state.attempt = 1; await finish('develop'); break
        }
        case 'develop': {
          update('developing')
          const output = await begin('develop', `attempt-${state.attempt}-develop`)
          const prompt = `你是BOAI开发者。在当前专属worktree只读核对代码，返回小而精确的结构化补丁。现有文件优先content=null及replacements中的唯一oldText/newText，避免输出整个大文件；新文件使用content与replacements=null，删除使用二者null。beforeSha256是当前原字节hash，新文件为null。可新增/删除范围内文件，不得提交、写文件或改验收/基线。遵守AGENTS及目录地图。不要分派子代理或自行执行独立审查，控制器会另开独立审查会话。\n冻结任务：${JSON.stringify(task)}\n上轮真实结果：${JSON.stringify({ baseline: state.baseline, checks: state.checks, review: state.review })}\n完整检查原件在${directory}，自行读取，不仅依赖摘要。`
          await agent('develop', output, prompt)
          remaining()
          if (git(worktree, 'rev-parse', 'HEAD') !== state.head || git(worktree, 'status', '--porcelain')) throw new Error('开发会话改写了受控worktree，需核对')
          const path = join(output, 'result.json'); state.proposal = { path, sha256: digest(await readFile(path)) }
          await finish('apply'); break
        }
        case 'apply': {
          if (!state.proposal || state.proposal.path !== join(directory, `attempt-${state.attempt}-develop`, 'result.json') || digest(await readFile(state.proposal.path)) !== state.proposal.sha256) throw new Error('开发补丁原件缺失或已变化')
          const output = state.pending?.directory ?? await begin('apply', `attempt-${state.attempt}-apply`)
          const journalPath = join(output, 'journal.json')
          let journal: { beforeHead: string; changes: FileChange[] }
          if (state.pending!.journalHash) {
            const bytes = await readFile(journalPath)
            if (digest(bytes) !== state.pending!.journalHash) throw new Error('补丁恢复日记已变化')
            journal = JSON.parse(bytes.toString('utf8'))
          } else {
            if (git(worktree, 'rev-parse', 'HEAD') !== state.head || git(worktree, 'status', '--porcelain')) throw new Error('应用补丁前工作树或HEAD变化')
            const { changes } = await prepareDevelopmentEdits(worktree, task, (await json(state.proposal.path)).value, signal)
            journal = { beforeHead: state.head!, changes }; await writeEvidence(journalPath, journal)
            state.pending!.journalHash = digest(await readFile(journalPath)); claim.save()
          }
          if (journal.beforeHead !== state.head || !journal.changes.length || journal.changes.some(change => !allowedPath(task, change.path))) throw new Error('补丁恢复日记不属于本步骤')
          state.pending!.started = true; claim.save()
          const head = await applyJournal(worktree, journal.beforeHead, journal.changes, signal, () => dependencies.checkpointFault?.('apply', 'file') ?? Promise.resolve())
          remaining()
          if (head === journal.beforeHead) {
            if (!git(worktree, 'status', '--porcelain')) throw new Error('开发未产生实际修改')
            git(worktree, 'add', '--all'); remaining(); git(worktree, 'commit', '-m', `${task.taskId}: attempt ${state.attempt}`)
            await dependencies.checkpointFault?.('apply', 'commit')
          } else if (git(worktree, 'status', '--porcelain') || git(worktree, 'log', '-1', '--format=%s') !== `${task.taskId}: attempt ${state.attempt}`) throw new Error('补丁恢复发现未知提交或未提交内容')
          state.head = git(worktree, 'rev-parse', 'HEAD'); await finish('checks'); break
        }
        case 'checks': {
          const dependencyChanges = git(worktree, 'diff', task.base, state.head!, '--name-only', '--', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
          if (dependencyChanges) {
            if (!task.setup.length) throw new Error('依赖输入变化后没有冻结环境准备')
            const result = await executeChecks(`attempt-${state.attempt}-setup`, task.setup)
            if (!result.passed) throw new Error('依赖输入变化后环境准备失败')
            await finish('candidate-checks')
          } else { state.cursor = 'candidate-checks'; claim.save() }
          break
        }
        case 'candidate-checks': {
          update('checking'); state.checks = await executeChecks(`attempt-${state.attempt}-checks`); await finish((state.checks as { passed: boolean }).passed ? 'review' : 'decide'); break
        }
        case 'review': {
          update('reviewing')
          const output = await begin('review', `attempt-${state.attempt}-review`), reviewedHead = state.head!
          const review = await agent('review', output, `你是独立审查者，新的无历史会话。读取完整diff、源码、任务和实际检查原件；按仓库标准/需求给出是否批准及可定位问题，不因开发者摘要批准。禁止改写任何文件或执行合并。\n任务：${JSON.stringify(task)}\n固定base ${task.base}，head ${reviewedHead}；完整原件${directory}。\n必须实际读取git diff ${task.base}...${reviewedHead}，检查变更范围、测试强度、目录地图及UI基线保护。`)
          remaining()
          state.review = { ...reviewSchema.parse(review.value), head: reviewedHead, base: task.base, directory: output, model: task.model ?? 'protocol-fixture', checksHash: digest(JSON.stringify(state.checks)) }
          if (git(worktree, 'rev-parse', 'HEAD') !== reviewedHead || git(worktree, 'status', '--porcelain')) throw new Error('审查期间提交或文件变化，结论失效')
          await finish('decide'); break
        }
        case 'decide': {
          await verifyCheckpointReceipts(claim)
          if (git(repository, 'rev-parse', task.targetBranch) !== task.base) throw new Error('目标基础分支已变化，旧检查和审查不能交付')
          const checks = state.checks as { passed: boolean; head: string }, review = state.review as { approved: boolean; head: string; checksHash: string } | undefined
          if (checks.passed && review?.approved && review.head === state.head && review.checksHash === digest(JSON.stringify(state.checks)) && state.usageComplete && state.knownTokens <= task.maxTokens) {
            remaining(); state.cursor = 'done'; update('reviewed'); break
          }
          if (state.attempt >= task.maxAttempts) { state.cursor = 'done'; update('stopped', '尝试到限；保留原失败、提交与worktree'); break }
          state.attempt++; state.cursor = 'develop'; claim.save(); break
        }
        default: throw new Error('未知恢复步骤，拒绝执行')
      }
    }
  } catch (error) {
    let reason = String(error)
    if (state.pending && !state.pending.started && !state.pending.journalHash) {
      try { if (!(await readdir(state.pending.directory)).length) { await rmdir(state.pending.directory); delete state.pending } }
      catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code === 'ENOENT') delete state.pending; else reason += `；未启动步骤保留待核对：${cleanup}` }
    }
    update(signal.aborted ? 'cancelled' : state.pending ? 'needs-reconciliation' : 'stopped', reason)
  }
  finally { claim.release() }
  return { directory, state }
}
