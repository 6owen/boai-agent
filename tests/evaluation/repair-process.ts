/*
 * [INPUT]: 固定程序/参数、隔离目录、超时/取消和有界stdin；本机Codex登录。
 * [OUTPUT]: 开发修复/业务hillclimb共用的有界进程与Codex结构化补丁；模型建议不承担业务评分。
 * [POS]: tests/evaluation/repair-process.ts，开发自动化专用；不接产品本机员工运行时。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { waitForProcessGroupExit } from '../../src/runtime/adapters/mastra/host-command'
import { proposalJsonSchema, proposalSchema, REPAIR_LIMITS, type RepairConfig, type RepairProposal } from './repair-contract'

export interface ProcessReceipt { exitCode: number | null; stdout: string; stderr: string; failure?: string; elapsedMs: number }
export async function repairProcess(input: { command: string; args: string[]; cwd: string; timeoutMs: number; signal: AbortSignal; stdin?: string; codex?: boolean }): Promise<ProcessReceipt> {
  input.signal.throwIfAborted()
  if (process.platform === 'win32') throw new Error('开发迭代的进程组收尾目前仅支持macOS/Linux')
  if (input.timeoutMs <= 0) throw new Error('迭代总期限已到')
  const env: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1' }
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', ...(input.codex ? ['CODEX_HOME', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'] : [])]) if (process.env[name]) env[name] = process.env[name]
  const start = Date.now(), child = spawn(input.command, input.args, { cwd: input.cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let size = 0, failure: string | undefined
  const stdout: Buffer[] = [], stderr: Buffer[] = []
  const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL') } } }
  const stop = (reason: string) => { failure ??= reason; kill() }
  const consume = (list: Buffer[]) => (chunk: Buffer) => { size += chunk.length; if (size <= REPAIR_LIMITS.logBytes) list.push(chunk); else stop('输出超过8MiB；日志不完整，不能接受候选') }
  child.stdout.on('data', consume(stdout)); child.stderr.on('data', consume(stderr))
  child.stdin.on('error', () => stop('子进程输入中断'))
  const timer = setTimeout(() => stop('执行超过登记期限'), input.timeoutMs)
  const cancel = () => stop('用户取消；不自动重放')
  input.signal.addEventListener('abort', cancel, { once: true })
  const ended = new Promise<number | null>(done => {
    child.once('error', error => { failure ??= error.message })
    child.once('exit', () => kill()) // also stop descendants that outlive the direct child
    child.once('close', done)
  })
  if (input.signal.aborted) cancel()
  child.stdin.end(input.stdin ?? '')
  try {
    const exitCode = await ended
    kill()
    if (child.pid) await waitForProcessGroupExit(child.pid)
    return { exitCode, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), failure, elapsedMs: Date.now() - start }
  } finally { clearTimeout(timer); input.signal.removeEventListener('abort', cancel) }
}
export async function saveProcess(directory: string, prefix: string, receipt: ProcessReceipt) {
  await writeFile(join(directory, `${prefix}.stdout.log`), receipt.stdout, { flag: 'wx' })
  await writeFile(join(directory, `${prefix}.stderr.log`), receipt.stderr, { flag: 'wx' })
  await writeFile(join(directory, `${prefix}.process.json`), JSON.stringify({ ...receipt, stdout: undefined, stderr: undefined }, null, 2), { flag: 'wx' })
}
export interface RepairAgentRequest { config: Pick<RepairConfig, 'model'>; context: string; output: string; prompt: string; timeoutMs: number; signal: AbortSignal }
export interface RepairAgentResult { proposal?: RepairProposal; receipt: Omit<ProcessReceipt, 'stdout' | 'stderr'>; usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | null }
export async function requestCodexRepair(input: RepairAgentRequest): Promise<RepairAgentResult> {
  const schema = join(input.output, 'proposal-schema.json'), answer = join(input.output, 'proposal.json')
  await writeFile(schema, JSON.stringify(proposalJsonSchema), { flag: 'wx' })
  await writeFile(join(input.output, 'prompt.txt'), input.prompt, { flag: 'wx' })
  // Auth is reused, while user plugins/MCP configuration and project config are not part of this controlled repair session.
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '--json', '--color', 'never', '--skip-git-repo-check', '--cd', input.context, '--output-schema', schema, '--output-last-message', answer]
  if (input.config.model) args.push('--model', input.config.model)
  args.push('-')
  const receipt = await repairProcess({ command: 'codex', args, cwd: input.context, timeoutMs: input.timeoutMs, signal: input.signal, stdin: input.prompt, codex: true })
  await saveProcess(input.output, 'codex', receipt)
  let usage: RepairAgentResult['usage'] = null, proposal: RepairProposal | undefined
  const completed = receipt.stdout.split('\n').flatMap(line => { try { const row = JSON.parse(line); return row.type === 'turn.completed' ? [row] : [] } catch { return [] } })
  if (completed.length === 1) {
    const value = completed[0].usage
    if (value && ['input_tokens', 'output_tokens', 'cached_input_tokens'].every(key => Number.isInteger(value[key]) && value[key] >= 0)) usage = { inputTokens: value.input_tokens, outputTokens: value.output_tokens, cachedInputTokens: value.cached_input_tokens }
  }
  if (!receipt.failure && receipt.exitCode === 0) {
    try {
      const bytes = await readFile(answer)
      if (bytes.length > REPAIR_LIMITS.proposalBytes) throw new Error('建议超过256KiB')
      proposal = proposalSchema.parse(JSON.parse(bytes.toString('utf8')))
    } catch (error) { receipt.failure = `Codex结果不可用：${error instanceof Error ? error.message : String(error)}` }
  }
  return { proposal, receipt: { exitCode: receipt.exitCode, failure: receipt.failure, elapsedMs: receipt.elapsedMs }, usage }
}
