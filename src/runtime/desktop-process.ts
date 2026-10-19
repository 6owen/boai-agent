/*
 * [INPUT]: Trusted same-machine desktop PID and the existing identity-bound native process guard.
 * [OUTPUT]: Ready observation and actual root/descendant exit proof; stopping observation never kills a live desktop.
 * [POS]: Resource lifetime only, with no permission, business replay or service ownership authority.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { spawn } from 'node:child_process'
import { assertNativeProcessGuard } from './adapters/native-process-guard'
import { CliError } from '../shared/cli/protocol'

export interface DesktopProcessWatch { readonly active: boolean; finished: Promise<{ exited: boolean; error?: string }>; stop(): Promise<void> }
export async function watchDesktopProcess(pid: number): Promise<DesktopProcessWatch> {
  if (!['darwin', 'linux'].includes(process.platform)) throw new CliError('CAPABILITY_UNAVAILABLE', '当前平台尚无桌面进程实际退出核验')
  const child = spawn(await assertNativeProcessGuard(), ['--watch-desktop', String(pid)], { stdio: ['pipe', 'pipe', 'pipe'], env: {} })
  let buffer = '', errors = '', ready = false, ended = false, stopped = false, confirmed = false
  let fail!: (error: Error) => void, accept!: () => void
  const started = new Promise<void>((resolve, reject) => { accept = resolve; fail = reject })
  const deadline = setTimeout(() => { fail(new Error('桌面进程身份核验超时')); child.stdin.end() }, 5000)
  child.stdout.on('data', chunk => {
    buffer += String(chunk)
    if (buffer.length > 65536) { fail(new Error('桌面进程核验协议超限')); child.stdin.end(); return }
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
      try {
        const event = JSON.parse(line)
        if (event.pid !== pid) throw new Error('桌面进程身份不匹配')
        if (event.type === 'ready' && !ready) { ready = true; clearTimeout(deadline); accept() }
        else if (event.type === 'exited' && ready) confirmed = true
        else throw new Error('桌面进程核验协议无效')
      } catch (error) { errors = error instanceof Error ? error.message : '桌面进程核验失败'; fail(new Error(errors)); child.stdin.end() }
    }
  })
  child.stderr.on('data', chunk => { errors = (errors + String(chunk)).slice(-4000) })
  child.stdin.on('error', () => {})
  const finished = new Promise<{ exited: boolean; error?: string }>(resolve => {
    child.once('error', error => { errors = error.message; fail(error) })
    child.once('close', code => {
      ended = true; clearTimeout(deadline)
      if (!ready) fail(new Error(errors || '桌面进程核验未就绪'))
      const exited = confirmed && code === 0 && !errors
      resolve({ exited, ...(!exited && !stopped ? { error: errors || '桌面进程核验中断，不能认定旧宿主已退出' } : {}) })
    })
  })
  try { await started } catch (error) { stopped = true; child.stdin.end(); await finished; throw error }
  return { get active() { return !ended && !stopped }, finished, async stop() { stopped = true; child.stdin.end(); await finished } }
}
