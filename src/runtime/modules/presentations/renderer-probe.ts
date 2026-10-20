/*
 * [INPUT]: Explicit host-selected renderer executable and cancellation signal.
 * [OUTPUT]: Actual LibreOffice version check with bounded output and confirmed child exit.
 * [POS]: Detects stale launchers before the rendering worker; not model-selected executable discovery.
 * [PROTOCOL]: Update Header and presentations/.folder.md when changed.
 */
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

export async function probePresentationRenderer(executable: string, signal?: AbortSignal, timeoutMs = 5000) {
  signal?.throwIfAborted()
  if (!isAbsolute(executable)) throw new Error('Presentation renderer must be a host-selected absolute path')
  return new Promise<{ path: string; version: string }>((resolve, reject) => {
    const child = spawn(executable, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = '', failure: Error | undefined
    const stop = (error: Error) => { failure ??= error; child.kill('SIGKILL') }
    const abort = () => stop(new Error('Presentation renderer probe cancelled'))
    const timer = setTimeout(() => stop(new Error('Presentation renderer version probe timed out')), timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', bytes => { stdout = (stdout + bytes.toString()).slice(0, 2048) })
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(0, 2048) })
    child.once('error', error => { failure = error })
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (code !== 0 || !/^LibreOffice\s+\d+\.\d+/m.test(stdout)) reject(new Error(`Presentation renderer is unavailable (${code}): ${(stderr || stdout).trim()}`))
      else resolve({ path: executable, version: stdout.trim() })
    })
    if (signal?.aborted) abort()
  })
}
