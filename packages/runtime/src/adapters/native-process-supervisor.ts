/*
 * [OUTPUT]: 退出观察支持调用方在权限错误仍持续时恢复原错误。
 * [OUTPUT]: 本机协议与宿主命令复用进程组实际退出屏障，独立原生传输可单独装载。
 * [OUTPUT]: 原生运行由Rovai身份绑定进程树监督；守护确认后代退出后才退出，旧阶段仍兼容进程组。
 * [INPUT]: 宿主独占IPC、已核验程序/参数/输入与继承的明确环境。
 * [OUTPUT]: 同一POSIX进程组运行CLI；宿主IPC消失立即终止整组，CLI退出只报告实际退出码，由宿主等整组退出。
 * [POS]: 原生CLI传输共用的固定Node启动代码，随worker编译；不解释模型协议、保存请求或重试。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
// A fixed script avoids a second executable resource path in source and packaged builds.
// The private request travels over inherited IPC, never through the supervisor command line.
export const NATIVE_PROCESS_SUPERVISOR = `
const { spawn } = require('node:child_process')
let guarded = false, stopping = false, childExited = false
const finish = () => { try { process.kill(-process.pid, 'SIGKILL') } finally { process.exit(1) } }
const stop = () => {
  if (guarded && child && !childExited) { if (!stopping) { stopping = true; child.kill('SIGTERM') } return }
  finish()
}
process.on('disconnect', stop)
process.on('uncaughtException', stop)
process.on('unhandledRejection', stop)
let started = false, child
process.on('message', request => {
  if (started && request?.type === 'stop') return stop()
  if (started && request?.type === 'write' && typeof request.value === 'string') { child.stdin.write(request.value); return }
  if (started && request?.type === 'end') { child.stdin.end(); return }
  if (started || !request || typeof request.command !== 'string' || !Array.isArray(request.args) || !request.args.every(v => typeof v === 'string') || typeof request.stdin !== 'string' || typeof request.node !== 'boolean') return stop()
  started = true
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_CHANNEL_FD
  delete env.NODE_CHANNEL_SERIALIZATION_MODE
  if (request.node) env.ELECTRON_RUN_AS_NODE = '1'
  guarded = typeof request.guard === 'string' && typeof request.ledger === 'string'
  child = spawn(guarded ? request.guard : request.command, guarded ? ['--ledger', request.ledger, request.command, ...request.args] : request.args, { env, shell: false, detached: false, stdio: ['pipe', 'inherit', 'inherit'] })
  child.once('error', () => { if (process.connected) process.send({ type: 'spawn-error' }, error => { if (error) stop() }); else stop() })
  child.stdin.on('error', () => { if (process.connected) process.send({ type: 'stdin-error' }, error => { if (error) stop() }); else stop() })
  child.once('close', code => { childExited = true; if (process.connected) process.send({ type: 'exit', code }, error => { if (error || guarded) finish() }); else finish() })
  if (request.interactive) child.stdin.write(request.stdin)
  else child.stdin.end(request.stdin)
})
if (!process.connected) stop()
`

const EXIT_CHECK_INTERVAL_MS = 10

export async function waitForProcessGroupExit(pid: number, signal?: AbortSignal) {
  for (;;) {
    try { process.kill(-pid, 0) }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ESRCH') return
      if (code !== 'EPERM') throw error
    }
    signal?.throwIfAborted()
    // A delivered signal or the shell's close event is not an exit receipt for
    // descendants which closed their output pipes. Keep the caller's lease.
    await new Promise(resolve => setTimeout(resolve, EXIT_CHECK_INTERVAL_MS))
  }
}
