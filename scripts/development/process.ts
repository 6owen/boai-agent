/*
 * [INPUT]: 开发任务或候选构建的程序/参数、隔离目录、超时/取消及实时日志。
 * [OUTPUT]: 有界进程监督与原始日志回执；不包含模型评估或测试修复逻辑。
 * [POS]: scripts/development/process.ts，开发自动化与候选构建共用；不接产品本机员工运行时。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { closeSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { waitForProcessGroupExit } from '../../src/runtime/adapters/mastra/host-command'

export interface ProcessReceipt { exitCode: number | null; stdout: string; stderr: string; failure?: string; elapsedMs: number }
export async function repairProcess(input: { command: string; args: string[]; cwd: string; timeoutMs: number; signal: AbortSignal; stdin?: string; codex?: boolean; managed?: { guard: string; ledger: string }; capture?: { directory: string; prefix: string } }): Promise<ProcessReceipt> {
  input.signal.throwIfAborted()
  if (process.platform === 'win32') throw new Error('开发迭代的进程组收尾目前仅支持macOS/Linux')
  if (input.timeoutMs <= 0) throw new Error('迭代总期限已到')
  const env: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1' }
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', ...(input.codex ? ['CODEX_HOME', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'] : [])]) if (process.env[name]) env[name] = process.env[name]
  const files: number[] = []
  try { if (input.capture) for (const stream of ['stdout', 'stderr']) files.push(openSync(join(input.capture.directory, `${input.capture.prefix}.${stream}.log`), 'wx', 0o600)) }
  catch (error) { for (const file of files) closeSync(file); throw error }
  const start = Date.now(), child = spawn(input.managed?.guard ?? input.command, input.managed ? ['--ledger', input.managed.ledger, input.command, ...input.args] : input.args, { cwd: input.cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let size = 0, failure: string | undefined
  const stdout: Buffer[] = [], stderr: Buffer[] = []
  const kill = () => { if (child.pid) { if (input.managed) { child.kill('SIGTERM'); return }; try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL') } } }
  const stop = (reason: string) => { failure ??= reason; kill() }
  const consume = (list: Buffer[], file?: number) => (chunk: Buffer) => { size += chunk.length; if (size <= REPAIR_LIMITS.logBytes) { list.push(chunk); if (file !== undefined) try { writeSync(file, chunk) } catch { stop('原始日志写入失败，不能接受候选') } } else stop('输出超过8MiB；日志不完整，不能接受候选') }
  child.stdout.on('data', consume(stdout, files[0])); child.stderr.on('data', consume(stderr, files[1]))
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
  } finally { clearTimeout(timer); input.signal.removeEventListener('abort', cancel); for (const file of files) closeSync(file) }
}
export async function saveProcess(directory: string, prefix: string, receipt: ProcessReceipt) {
  for (const [stream, value] of [['stdout', receipt.stdout], ['stderr', receipt.stderr]]) {
    const file = join(directory, `${prefix}.${stream}.log`)
    try { if (!(await readFile(file)).equals(Buffer.from(value))) throw new Error('实时原件与退出回执不一致，拒绝覆盖') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(file, value, { flag: 'wx' }) }
  }
  await writeFile(join(directory, `${prefix}.process.json`), JSON.stringify({ ...receipt, stdout: undefined, stderr: undefined }, null, 2), { flag: 'wx' })
}
