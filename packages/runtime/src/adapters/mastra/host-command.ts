/*
 * [OUTPUT]: macOS 在终止期间返回 EPERM 时再次核对整组消失，仍存活则上报权限错误。
 * [OUTPUT]: 本机协议与宿主命令复用进程组实际退出屏障，独立原生传输可单独装载。
 * [OUTPUT]: 2026-11-24 第三阶段：官方 Durable Agent/Session.steer、Workspace 文件工具、LocalSandbox 进程和原生 Trace；授权及发布保留业务适配。
 * [OUTPUT]: 宿主命令仅在批准后到实际进程组退出期间互斥；排队支持取消，启动前重核副作用授权。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: 员工目录策略启用时通过macOS Seatbelt限制命令及继承后代的实际读写；原取消/进程组退出保持，旧配置和完全访问沿原宿主执行。
 * [OUTPUT]: Mastra LocalSandbox/ProcessManager执行；默认无墙钟上限，输出按SDK保留窗口裁剪而不终止进程。
 * [OUTPUT]: stdout/stderr 解码及保留窗口归 SDK；启动失败同样释放 Sandbox，宿主保留实际退出屏障。
 * [INPUT]: 宿主逐次批准的命令、受管工作目录和取消信号。
 * [OUTPUT]: 有界命令结果与可复用POSIX进程组退出核对；取消/超时期间保留执行占用，Windows等待taskkill回执。
 * [POS]: API与本机员工共用的宿主命令执行器；可选员工目录隔离，其他宿主能力仍沿原授权。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { waitForProcessGroupExit } from '../native-process-supervisor'
import { LocalSandbox } from '@mastra/core/workspace'
import { directoryCommandBoundary, type CommandDirectoryScope } from '../../modules/workspaces/directory-command'
import { employeeEnvironment } from '@boai/shared/cli/employee-environment'
import type { RunCliEnvironment } from '@boai/shared/cli/run-access'
import { TaskAdmission } from '../../modules/collaboration/task-admission'
const hostCommands = new TaskAdmission()
export async function withHostCommandAdmission<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  const release = await hostCommands.acquire(true, signal)
  try { signal.throwIfAborted(); return await operation() } finally { release() }
}
const check = (signal: AbortSignal) => signal.throwIfAborted()

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  check(signal)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('Cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Optional employee filesystem policy; lifetime, output and process-group ownership stay shared. */
async function stopRemainingProcessGroup(pid: number) {
  try { process.kill(-pid, 'SIGKILL') }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return
    if (code !== 'EPERM') throw error
    // Darwin may deny another kill while the SDK's terminated group is being reaped.
    // Recover only on confirmed disappearance. A surviving group retains the permission failure.
    await waitForProcessGroupExit(pid, AbortSignal.timeout(1000)).catch(() => { throw error })
    return
  }
  await waitForProcessGroupExit(pid)
}

export async function executeCommand(command: string, cwd: string, signal: AbortSignal, timeoutMs = 0, directories?: CommandDirectoryScope, cli?: RunCliEnvironment, beforeStart?: () => Promise<void>) {
  return withHostCommandAdmission(signal, async () => {
    await beforeStart?.(); check(signal)
    return executeAdmittedCommand(command, cwd, signal, timeoutMs, directories, cli)
  })
}
async function executeAdmittedCommand(command: string, cwd: string, signal: AbortSignal, timeoutMs: number, directories?: CommandDirectoryScope, cli?: RunCliEnvironment) {
  check(signal)
  const boundary = directories ? await directoryCommandBoundary(command, directories) : undefined
  check(signal)
  const env: NodeJS.ProcessEnv = employeeEnvironment({}, cli)
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG', 'LC_ALL']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  env.BOAI_RUN_DIR = cwd
  if (directories) env.TMPDIR = env.TMP = env.TEMP = cwd
  const sandbox = new LocalSandbox({ workingDirectory: cwd, env, timeout: timeoutMs })
  // BOAI only adapts the approved OS policy; Mastra owns spawning, decoding,
  // bounded output, cancellation and timeout. Zero means no default deadline.
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  const script = boundary ? [boundary.command, ...boundary.args].map(quote).join(' ') : command
  try {
    await sandbox.start()
    const handle = await sandbox.processes.spawn(script, { timeout: timeoutMs, abortSignal: signal, stdinMode: 'ignore' })
    try {
      const result = await handle.wait({ abortSignal: signal })
      check(signal)
      if (result.timedOut) throw new Error('Command timed out')
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, truncated: !!(result.stdoutTruncated || result.stderrTruncated) }
    } finally {
      await handle.kill()
      // LocalSandbox 1.71 only kills live handles. Keep the product's exit
      // barrier for pipe-free descendants after the parent has already exited.
      const pid = Number(handle.pid)
      if (process.platform !== 'win32' && Number.isSafeInteger(pid) && pid > 0) {
        await stopRemainingProcessGroup(pid)
      }
    }
  } finally { await sandbox.destroy() }
}
