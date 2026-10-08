/*
 * [INPUT]: 宿主独占IPC、已核验程序/参数/输入与继承的明确环境。
 * [OUTPUT]: 同一POSIX进程组运行CLI；宿主IPC消失立即终止整组，CLI退出只报告实际退出码，由宿主等整组退出。
 * [POS]: Claude传输内部的固定Node启动代码，随worker编译；不解释模型协议、保存请求或重试。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
// A fixed script avoids a second executable resource path in source and packaged builds.
// The private request travels over inherited IPC, never through the supervisor command line.
export const CLAUDE_SUPERVISOR = String.raw`
const { spawn } = require('node:child_process')
const stop = () => { try { process.kill(-process.pid, 'SIGKILL') } finally { process.exit(1) } }
process.on('disconnect', stop)
process.on('uncaughtException', stop)
process.on('unhandledRejection', stop)
let started = false
process.on('message', request => {
  if (started || !request || typeof request.command !== 'string' || !Array.isArray(request.args) || !request.args.every(v => typeof v === 'string') || typeof request.stdin !== 'string' || typeof request.node !== 'boolean') return stop()
  started = true
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_CHANNEL_FD
  delete env.NODE_CHANNEL_SERIALIZATION_MODE
  if (request.node) env.ELECTRON_RUN_AS_NODE = '1'
  const child = spawn(request.command, request.args, { env, shell: false, detached: false, stdio: ['pipe', 'inherit', 'inherit'] })
  child.once('error', () => { if (process.connected) process.send({ type: 'spawn-error' }, error => { if (error) stop() }); else stop() })
  child.stdin.on('error', () => { if (process.connected) process.send({ type: 'stdin-error' }, error => { if (error) stop() }); else stop() })
  child.once('close', code => { if (process.connected) process.send({ type: 'exit', code }, error => { if (error) stop() }); else stop() })
  child.stdin.end(request.stdin)
})
if (!process.connected) stop()
`
