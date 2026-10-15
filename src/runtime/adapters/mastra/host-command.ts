/*
 * [OUTPUT]: stdout/stderr 分别增量解码 UTF-8，管道拆包不会损坏中文/emoji；原字节上限和实际退出保持。
 * [INPUT]: 宿主逐次批准的命令、受管工作目录和取消信号。
 * [OUTPUT]: 有界命令结果与可复用POSIX进程组退出核对；取消/超时期间保留执行占用，Windows等待taskkill回执。
 * [POS]: API与本机员工共用的宿主命令执行器；不是外部程序安全沙箱。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
const MAX_TOOL_OUTPUT = 48_000
const EXIT_CHECK_INTERVAL_MS = 10
const check = (signal: AbortSignal) => signal.throwIfAborted()

export async function waitForProcessGroupExit(pid: number) {
  for (;;) {
    try { process.kill(-pid, 0) }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ESRCH') return
      if (code !== 'EPERM') throw error
    }
    // A delivered signal or the shell's close event is not an exit receipt for
    // descendants which closed their output pipes. Keep the caller's lease.
    await new Promise(resolve => setTimeout(resolve, EXIT_CHECK_INTERVAL_MS))
  }
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  check(signal)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('Cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Approved host command, not a security sandbox. Limits lifetime, output and inherited secrets. */
export async function executeCommand(command: string, cwd: string, signal: AbortSignal, timeoutMs: number) {
  check(signal)
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG', 'LC_ALL']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  env.BOAI_RUN_DIR = cwd
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string; truncated: boolean }>((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', command], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn('/bin/sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', size = 0, truncated = false, failure: Error | undefined
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
    const killers = new Set<Promise<void>>()
    const kill = () => {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          const completion = new Promise<void>(resolve => {
            killer.once('error', error => { failure ??= error; child.kill('SIGKILL') })
            killer.once('close', () => resolve())
          })
          killers.add(completion); void completion.finally(() => killers.delete(completion))
        }
        else process.kill(-child.pid, 'SIGKILL')
      } catch { child.kill('SIGKILL') }
    }
    const stop = (error: Error) => { failure ??= error; kill() }
    const onAbort = () => stop(signal.reason instanceof Error ? signal.reason : new Error('Command cancelled'))
    const timer = setTimeout(() => stop(new Error('Command timed out')), timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    const append = (data: Buffer, target: 'stdout' | 'stderr') => {
      const remaining = Math.max(0, MAX_TOOL_OUTPUT - size)
      const value = decoders[target].write(data.subarray(0, remaining))
      if (target === 'stdout') stdout += value; else stderr += value
      size += Math.min(data.length, remaining)
      if (data.length > remaining) { truncated = true; stop(new Error('Command output exceeded 48 KB; process stopped')) }
    }
    child.stdout?.on('data', (data: Buffer) => append(data, 'stdout'))
    child.stderr?.on('data', (data: Buffer) => append(data, 'stderr'))
    const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
    child.once('error', error => { failure ??= error; kill() })
    child.once('close', async exitCode => {
      stdout += decoders.stdout.end(); stderr += decoders.stderr.end()
      // Reap detached descendants, including a background process that inherited no output pipes.
      kill()
      try {
        if (child.pid && process.platform !== 'win32') await waitForProcessGroupExit(child.pid)
        else await Promise.all(killers)
        if (failure) reject(failure)
        else resolve({ exitCode, stdout, stderr, truncated })
      } catch (error) { reject(error) }
      finally { clean() }
    })
  })
}
