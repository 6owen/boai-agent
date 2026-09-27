import { spawn } from 'node:child_process'
const MAX_TOOL_OUTPUT = 48_000
const check = (signal: AbortSignal) => signal.throwIfAborted()

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
    const kill = () => {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref()
        else process.kill(-child.pid, 'SIGKILL')
      } catch { child.kill('SIGKILL') }
    }
    const stop = (error: Error) => { failure = error; kill() }
    const onAbort = () => stop(new Error('Command cancelled'))
    const timer = setTimeout(() => stop(new Error('Command timed out')), timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    const append = (data: Buffer, target: 'stdout' | 'stderr') => {
      const remaining = Math.max(0, MAX_TOOL_OUTPUT - size)
      const value = data.subarray(0, remaining).toString('utf8')
      if (target === 'stdout') stdout += value; else stderr += value
      size += Math.min(data.length, remaining)
      if (data.length > remaining) { truncated = true; stop(new Error('Command output exceeded 48 KB; process stopped')) }
    }
    child.stdout?.on('data', (data: Buffer) => append(data, 'stdout'))
    child.stderr?.on('data', (data: Buffer) => append(data, 'stderr'))
    const clean = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
    child.once('error', error => { clean(); kill(); reject(error) })
    child.once('close', exitCode => {
      clean()
      // Reap detached descendants, including a background process that inherited no output pipes.
      kill()
      if (failure) reject(failure)
      else resolve({ exitCode, stdout, stderr, truncated })
    })
  })
}

