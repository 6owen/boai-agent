/*
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: 2026-10-11 持续原生Claude生产驱动支持本机登录/显式API、原生工具与公开过程；旧私有阶段仅作兼容回归。
 * [OUTPUT]: 原生会话支持双向stdio交互、按选择的原生权限批准；不以累计输出大小或隐式期限截断长任务。
 * [OUTPUT]: 每次传输独立记录实际stdout/stderr Buffer字节数（不含stdin），超限及退出后的已收数据仍在原finally回执保留；旧回执缺省未知，原合计门禁不变。
 * [OUTPUT]: 原生路径使用Rovai身份绑定进程树，确认已捕获后代退出后结束监督进程；旧阶段保留进程组方式。
 * [OUTPUT]: 原始行收取/完成数与停止时回调/积压状态仅保留数字；原失败原因和实际进程组退出边界不变。
 * [INPUT]: 已核对程序、显式环境/参数、受管目录、取消信号和有界逐行接收器。
 * [OUTPUT]: Claude CLI独立进程组、媒体输入总量门禁与原有输出界限、串行事件及实际退出；不输出stderr/环境，不自动重启。
 * [POS]: Claude专用传输；调用者解释协议并持有业务执行许可。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { assertNativeProcessGuard } from '../native-process-guard'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { waitForProcessGroupExit } from '../mastra/host-command'
import { CLAUDE_INPUT_LIMIT } from './policy'
import { CLAUDE_SUPERVISOR } from './supervisor'
import { employeeEnvironment } from '@boai/shared/cli/employee-environment'
import type { RunCliEnvironment } from '@boai/shared/cli/run-access'

const OUTPUT_LIMIT = 8 * 1024 * 1024
const LINE_LIMIT = 2 * 1024 * 1024
const NATIVE_LINE_LIMIT = 64 * 1024 * 1024
type StopReason = 'cancelled' | 'timeout' | 'spawn' | 'stdin' | 'stdout' | 'output-limit' | 'line-limit' | 'callback' | 'process-exit'
export interface ClaudeProcessReceipt {
  receivedLines: number; handledLines: number; processGroupExited: boolean; exitCode: number | null
  stdoutBytes?: number; stderrBytes?: number
  stoppedBecause?: StopReason; callbackActiveAtStop?: boolean; pendingAtStop?: number
}

export async function runClaudeProcess(input: {
  executable: string; runtime?: 'node'; args: string[]; env: NodeJS.ProcessEnv; cwd: string
  signal: AbortSignal; privateHome?: string; timeoutMs?: number; stdin?: string; native?: boolean;
  cliEnvironment?: RunCliEnvironment
  onReady?(write: (line: string) => void, end: () => void): void; onLine(line: string): Promise<void> | void
  onReceipt?(value: ClaudeProcessReceipt): void
}) {
  input.signal.throwIfAborted()
  if (process.platform === 'win32') throw new Error('Claude进程树退出尚未在Windows验证')
  const guard = input.native ? await assertNativeProcessGuard() : undefined
  const lineLimit = input.native ? NATIVE_LINE_LIMIT : LINE_LIMIT
  if (input.timeoutMs !== undefined && (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0)) throw new Error('Claude缺少有效执行期限')
  if (Buffer.byteLength(input.stdin ?? '') > CLAUDE_INPUT_LIMIT) throw new Error('Claude输入超过受管传输限制')
  const child = spawn(process.execPath, ['--input-type=commonjs', '-e', CLAUDE_SUPERVISOR],
    { cwd: input.cwd, env: { ...employeeEnvironment(input.env, input.cliEnvironment), ELECTRON_RUN_AS_NODE: '1' },
      shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
  let cliExitReceived = false
  let fault: Error | undefined, bytes = 0, buffer = '', callbacks = Promise.resolve()
  let stdoutBytes = 0, stderrBytes = 0
  let receivedLines = 0, handledLines = 0, callbackActive = false, processGroupExited = false, exitCode: number | null = null
  let stoppedAt: Pick<ClaudeProcessReceipt, 'stoppedBecause' | 'callbackActiveAtStop' | 'pendingAtStop'> | undefined
  const decoder = new StringDecoder('utf8')
  const kill = () => {
    if (input.native) { if (child.connected) child.send({ type: 'stop' }, () => {}); return }
    try { if (child.pid) process.kill(-child.pid, 'SIGKILL') }
    catch { child.kill('SIGKILL') }
  }
  const fail = (error: Error, reason: StopReason) => {
    if (!fault) { fault = error; stoppedAt = { stoppedBecause: reason, callbackActiveAtStop: callbackActive, pendingAtStop: receivedLines - handledLines } }
    kill()
  }
  const abort = () => fail(input.signal.reason instanceof Error ? input.signal.reason : new Error('Claude执行已取消'), 'cancelled')
  const enqueue = (line: string) => {
    if (Buffer.byteLength(line) > lineLimit) { fail(new Error(`Claude事件超过${lineLimit / 1024 / 1024}MiB限制`), 'line-limit'); return }
    if (!line.trim()) return
    receivedLines++
    callbacks = callbacks.then(async () => {
      if (fault) return
      callbackActive = true
      try { await input.onLine(line); handledLines++ }
      catch (error) { fail(error instanceof Error ? error : new Error('Claude事件处理失败'), 'callback') }
      finally { callbackActive = false }
    })
  }
  const read = (chunk: Buffer) => {
    stdoutBytes = Math.min(Number.MAX_SAFE_INTEGER, stdoutBytes + chunk.length)
    bytes += chunk.length
    if (!input.native && bytes > OUTPUT_LIMIT) { fail(new Error('Claude输出超过8MiB限制'), 'output-limit'); return }
    if (fault) return
    buffer += decoder.write(chunk)
    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      enqueue(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1)
    }
    if (Buffer.byteLength(buffer) > lineLimit) fail(new Error(`Claude事件超过${lineLimit / 1024 / 1024}MiB限制`), 'line-limit')
  }
  const stopped = new Promise<number | null>(resolve => {
    child.once('error', () => fail(new Error('无法启动本机Claude程序'), 'spawn'))
    child.once('close', code => resolve(code))
  })
  child.on('message', receipt => {
    if (fault) return
    const value = receipt as { type?: unknown; code?: unknown } | null
    if (value?.type === 'spawn-error') { fail(new Error('无法启动本机Claude程序'), 'spawn'); return }
    if (value?.type === 'stdin-error') { fail(new Error('Claude输入连接断开，原请求需要核对'), 'stdin'); return }
    if (cliExitReceived || value?.type !== 'exit' || !(value.code === null || Number.isInteger(value.code) && Number(value.code) >= 0 && Number(value.code) <= 255)) {
      fail(new Error('Claude退出回执无效，原请求需要核对'), 'process-exit'); return
    }
    cliExitReceived = true; exitCode = value.code as number | null
    // CLI success does not prove descendants exited. The supervisor stays alive
    // until this whole-group stop, and guards the same group if the host crashes.
    kill()
  })
  child.stdout!.on('data', read)
  child.stdout!.on('error', () => fail(new Error('Claude事件流读取失败'), 'stdout'))
  child.stderr!.on('data', (chunk: Buffer) => {
    stderrBytes = Math.min(Number.MAX_SAFE_INTEGER, stderrBytes + chunk.length)
    bytes += chunk.length
    if (!input.native && bytes > OUTPUT_LIMIT) fail(new Error('Claude输出超过8MiB限制'), 'output-limit')
  })
  child.stdin!.on('error', () => fail(new Error('Claude输入连接断开，原请求需要核对'), 'stdin'))
  const timer = input.timeoutMs === undefined ? undefined : setTimeout(() => fail(new Error('Claude执行超时，原请求需要核对'), 'timeout'), input.timeoutMs)
  timer?.unref()
  input.signal.addEventListener('abort', abort, { once: true })
  if (input.signal.aborted) abort()
  else {
    child.stdin!.end()
    child.send({ command: input.runtime === 'node' ? process.execPath : input.executable,
      args: [...(input.runtime === 'node' ? [input.executable] : []), ...input.args], stdin: input.stdin ?? '', node: input.runtime === 'node', interactive: !!input.onReady, ...(guard ? { guard, ledger: join(input.privateHome ?? input.cwd,'owned-processes') } : {}) },
    error => {
      if (error) fail(new Error('Claude输入连接断开，原请求需要核对'), 'stdin')
      else input.onReady?.(line => { input.signal.throwIfAborted(); child.send({ type: 'write', value: line }, error => { if (error) fail(error, 'stdin') }) }, () => { if (child.connected) child.send({ type: 'end' }) })
    })
  }
  try {
    await stopped
    buffer += decoder.end()
    if (buffer) enqueue(buffer)
    await callbacks
    // The parent closing its pipes is not an exit receipt for descendants.
    kill()
    if (child.pid) await waitForProcessGroupExit(child.pid)
    processGroupExited = true
    if (fault) throw fault
    if (!cliExitReceived || exitCode !== 0) { fail(new Error('Claude进程未正常结束，原请求需要核对'), 'process-exit'); throw fault }
    return { exitCode, bytesReceived: bytes }
  } finally {
    if (timer) clearTimeout(timer); input.signal.removeEventListener('abort', abort)
    try { input.onReceipt?.({ receivedLines, handledLines, processGroupExited, exitCode, stdoutBytes, stderrBytes, ...stoppedAt }) } catch { /* Observation never changes process ownership or the original error. */ }
  }
}
