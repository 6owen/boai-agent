/*
 * [INPUT]: Pinned upstream native executables, host-owned state and validated argv.
 * [OUTPUT]: Original CLI envelopes and real screenshot image parts, without a shell or automatic retries.
 * [POS]: Thin agent-desktop process/distribution adapter; OS automation remains upstream.
 * [PROTOCOL]: Update Header and src/.folder.md on change.
 */
import { spawn } from 'node:child_process'
import { access, copyFile, chmod, mkdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

export const DESKTOP_VERSION = '1.1.0'
const require = createRequire(import.meta.url)
const MAX_OUTPUT = 12 * 1024 * 1024
export type DesktopContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export interface DesktopResult { content: DesktopContent[] }
export async function prepareDesktopExecutable(root: string) {
  if (!['darwin', 'win32', 'linux'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) throw new Error('Agent Desktop 不支持当前系统或架构')
  const packageRoot = dirname(require.resolve('agent-desktop/package.json')).replace('app.asar/', 'app.asar.unpacked/')
  const platform = `${process.platform}-${process.arch}`
  const directory = join(root, DESKTOP_VERSION, platform)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const files = [{ source: `agent-desktop-${platform}${process.platform === 'win32' ? '.exe' : ''}`, target: `agent-desktop${process.platform === 'win32' ? '.exe' : ''}` }]
  if (process.platform !== 'win32') {
    const helper = process.platform === 'darwin' ? 'agent-desktop-macos-helper' : 'agent-desktop-linux-clipboard-owner'
    files.push({ source: `${helper}-${platform}`, target: helper })
  }
  for (const file of files) {
    const source = join(packageRoot, 'bin', file.source), target = join(directory, file.target)
    const bytes = await readFile(source)
    let matches = false
    try { matches = createHash('sha256').update(await readFile(target)).digest('hex') === createHash('sha256').update(bytes).digest('hex') } catch { /* First install. */ }
    if (!matches) await copyFile(source, target)
    await chmod(target, 0o755)
    await access(target, constants.X_OK)
  }
  return join(directory, files[0]!.target)
}

/** No retry: cancellation waits for the native process group to exit before releasing desktop admission. */
export async function runDesktopCommand(executable: string, args: string[], stateRoot: string, session: string, signal: AbortSignal) {
  signal.throwIfAborted()
  await mkdir(stateRoot, { recursive: true, mode: 0o700 })
  const env: NodeJS.ProcessEnv = { AGENT_DESKTOP_HOME: stateRoot, AGENT_DESKTOP_SESSION: session }
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS']) if (process.env[key]) env[key] = process.env[key]
  const result = await new Promise<{ output: string; code: number | null }>((resolve, reject) => {
    const child = spawn(executable, args, { env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let bytes = 0, overflow = false
    let timedOut = false
    const killers: Promise<unknown>[] = []
    const kill = () => {
      if (!child.pid) return
      if (process.platform === 'win32') {
        killers.push(new Promise<void>(done => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.once('error', () => { child.kill('SIGKILL'); done() }); killer.once('close', () => done())
        }))
      } else { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
    }
    const abort = () => kill()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) kill()
    const timer = setTimeout(() => { timedOut = true; kill() }, 30000)
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_OUTPUT) { overflow = true; kill() } else chunks.push(chunk) })
    // stderr can contain private app text; it is never copied into errors or persistent logs.
    child.stderr.resume()
    child.once('error', error => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error) })
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      void (async () => {
        await Promise.all(killers)
        if (child.pid && process.platform !== 'win32') {
          for (;;) {
            try { process.kill(-child.pid, 0) }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') break; throw error }
            await new Promise(done => setTimeout(done, 10))
          }
        }
        if (overflow || timedOut) throw new Error('Agent Desktop 返回超限或超时；操作结果未知，请重新读取界面，不要重放动作')
        resolve({ output: Buffer.concat(chunks).toString('utf8'), code })
      })().catch(reject)
    })
  })
  signal.throwIfAborted()
  if (args.includes('--help')) return { content: [{ type: 'text' as const, text: result.output }] }
  let envelope: Record<string, unknown>
  try { envelope = JSON.parse(result.output) } catch { throw new Error('Agent Desktop 未返回完整 JSON，操作结果未知；请读取当前界面，不要重放动作') }
  if (typeof envelope.ok !== 'boolean' || typeof envelope.version !== 'string') throw new Error('Agent Desktop 返回协议不匹配')
  return desktopResult(envelope)
}

export function desktopResult(envelope: Record<string, unknown>): DesktopResult {
  const data = envelope.data as Record<string, unknown> | undefined
  const image = data && (typeof data.data === 'string' ? data.data : typeof data.base64 === 'string' ? data.base64 : typeof data.image === 'string' ? data.image : undefined)
  if (envelope.command === 'screenshot' && envelope.ok && image) {
    if (image.length > 8 * 1024 * 1024) throw new Error('截图超过模型图片上限，请缩小截图范围')
    const safe = { ...data }; delete safe.data; delete safe.base64; delete safe.image
    return { content: [{ type: 'text', text: JSON.stringify({ ...envelope, data: safe }) }, { type: 'image', data: image, mimeType: 'image/png' }] }
  }
  return { content: [{ type: 'text', text: JSON.stringify(envelope) }] }
}
