/*
 * [OUTPUT]: Startup abort stops waiting before business submission, preserves child/log identity and never kills an unconfirmed owner.
 * [OUTPUT]: Explicit local serve module and safe per-child log lifecycle; failed/background/unknown logs remain, successful cleanup checks original file identity.
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: reuse existing owner, Node IPC readiness, private discovery and conditional drain/handoff.
 * [INPUT]: Craft apps/cli/src/server-spawner.ts @ 22c9f0414ab63e0a22814c9a2ada740206e09091 and explicit local profile.
 * [OUTPUT]: Authenticated existing or spawned service; only own idle service may be stopped.
 * [POS]: CLI process lifecycle, no database access, business retry or forced child termination.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { spawn } from 'node:child_process'
import { lstat, open, readFile, realpath, stat, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import type { CliDiagnostic } from './presentation'
import { randomBytes, randomUUID } from 'node:crypto'
import { CliRpcClient } from '@boai/transport/client'
import { prepareLocalDirectory, readLocalConnection, type LocalConnection } from '@boai/transport/discovery'
import { CliError } from '@boai/shared/cli/protocol'

export interface RunServer {
  client: CliRpcClient
  connection: LocalConnection
  started: boolean
  finish(preserve: boolean, keepDiagnostics?: boolean): Promise<{ state: 'reused' | 'stopped' | 'background'; serverId: string; url: string; pid: number; logPath?: string }>
}
interface Options { signal?: AbortSignal; dataPath: string; serverEntry?: string; diagnostic?(event: CliDiagnostic): void; timeout?: number; ca?: Buffer; workspaceId?: string }
export async function connectRunServer(options: Options): Promise<RunServer> {
  const timeout = options.timeout ?? 30_000
  let starting: { pid?: number; logPath: string } | undefined
  const aborted = () => new CliError('CLIENT_DISCONNECTED', starting ? `启动等待已中断，未提交业务请求；保留进程 ${starting.pid}，配置 ${options.dataPath}，日志 ${starting.logPath}` : '连接已中断，未提交业务请求')
  const checkAbort = () => { if (options.signal?.aborted) throw aborted() }
  checkAbort()
  const connect = async (metadata: LocalConnection) => {
    const client = new CliRpcClient(metadata.url, { ...metadata, workspaceId: options.workspaceId ?? metadata.workspaceId, ca: options.ca, connectTimeout: Math.min(timeout, 3000), requestTimeout: 10_000 })
    const interrupt = () => client.destroy()
    try { checkAbort(); options.signal?.addEventListener('abort', interrupt, { once: true }); await client.connect(); checkAbort(); return client }
    catch (error) { client.destroy(); checkAbort(); throw error }
    finally { options.signal?.removeEventListener('abort', interrupt) }
  }
  const existing = async (): Promise<RunServer | undefined> => {
    checkAbort()
    let connection: LocalConnection
    try { connection = await readLocalConnection(options.dataPath) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    let client: CliRpcClient
    try { client = await connect(connection) }
    catch (error) { if (error instanceof CliError && ['CLIENT_DISCONNECTED', 'REQUEST_TIMEOUT'].includes(error.code)) return; throw error }
    options.diagnostic?.({ event: 'service_reused', serverId: connection.serverId, pid: connection.pid })
    return { client, connection, started: false, async finish() { return { state: 'reused', serverId: connection.serverId, url: connection.url, pid: connection.pid } } }
  }
  const reused = await existing()
  if (reused) return reused
  checkAbort()
  const entry = await realpath(options.serverEntry ? resolve(options.serverEntry) : fileURLToPath(new URL('../runtime/serve.mjs', import.meta.url))).catch(() => { throw new CliError('CAPABILITY_UNAVAILABLE', '自动启动需要有效的BOAI服务模块，请使用完整安装或核对--server-entry') })
  if (!(await stat(entry)).isFile()) throw new CliError('INVALID_REQUEST', '--server-entry必须是本机服务模块文件')
  checkAbort()
  const directory = await prepareLocalDirectory(options.dataPath)
  const logPath = join(directory, `service-${randomUUID()}.log`), log = await open(logPath, 'wx', 0o600)
  const env: NodeJS.ProcessEnv = { ...process.env, BOAI_SERVER_TOKEN: randomBytes(32).toString('base64url'), BOAI_RPC_HOST: '127.0.0.1', BOAI_RPC_PORT: '0' }
  for (const key of ['BOAI_SERVER_URL', 'BOAI_RPC_TLS_CERT', 'BOAI_RPC_TLS_KEY', 'BOAI_RPC_TLS_CA', 'BOAI_TLS_CA']) delete env[key]
  // No pipe to the terminal: handoff must survive terminal exit without EPIPE or an inherited owner token.
  const identity = await log.stat()
  const bootstrap = `import { pathToFileURL } from 'node:url';try { const entry = await import(pathToFileURL(process.argv[1]).href); if (typeof entry.serve !== 'function') throw new Error('missing serve'); await entry.serve({ dataPath: process.argv[2], host: '127.0.0.1', port: '0' }); } catch (error) { process.stderr.write(JSON.stringify({ code: error?.code === 'SERVER_BUSY' ? 'SERVER_BUSY' : 'CAPABILITY_UNAVAILABLE', message: '服务启动或退出失败，请核对服务模块' })+String.fromCharCode(10)); process.exitCode = 1; }`
  const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap, entry, options.dataPath], { env, detached: true, stdio: ['ignore', log.fd, log.fd, 'ipc'] })
  let exited = false, exitCode: number | null | undefined
  const retainedLog = async (keep: boolean) => {
    if (keep || exitCode !== 0) return { logPath }
    try {
      const current = await lstat(logPath)
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== identity.uid) return { logPath }
      await unlink(logPath); return {}
    } catch { return { logPath } }
  }
  const exit = new Promise<number | null>(resolve => { child.once('exit', code => { exited = true; exitCode = code; resolve(code) }); child.once('error', () => { exited = true; resolve(null) }) })
  await log.close()
  starting = { pid: child.pid, logPath }
  options.diagnostic?.({ event: 'service_start', pid: child.pid, logPath })
  const detach = () => { if (child.connected) child.disconnect(); child.unref() }
  let timer: ReturnType<typeof setTimeout> | undefined, interrupt: (() => void) | undefined
  try {
    const ready = await new Promise<{ serverId: string; url: string }>((resolve, reject) => {
      interrupt = () => reject(aborted())
      options.signal?.addEventListener('abort', interrupt, { once: true })
      if (options.signal?.aborted) { interrupt(); return }
      child.on('message', message => { const value = message as { type?: string; serverId: string; url: string }; if (value?.type === 'ready') resolve(value) })
      child.once('error', () => reject(new CliError('CAPABILITY_UNAVAILABLE', '独立服务进程未启动')))
      void exit.then(() => reject(new CliError('CAPABILITY_UNAVAILABLE', `独立服务未就绪，请核对服务模块与启动日志 ${logPath}`)))
      timer = setTimeout(() => reject(new CliError('REQUEST_TIMEOUT', `服务尚未确认就绪；保留进程 ${child.pid}，配置 ${options.dataPath}，日志 ${logPath}`)), timeout)
    }).finally(() => { if (timer) clearTimeout(timer); if (interrupt) options.signal?.removeEventListener('abort', interrupt) })
    const connection = await readLocalConnection(options.dataPath)
    if (connection.serverId !== ready.serverId || connection.url !== ready.url || connection.pid !== child.pid) throw new CliError('PROFILE_MISMATCH', '启动的服务与发现身份不同，未提交消息')
    const client = await connect(connection)
    options.diagnostic?.({ event: 'service_ready', serverId: connection.serverId, pid: connection.pid })
    return { client, connection, started: true, async finish(preserve, keepDiagnostics = false) {
      try {
        if (exited) { options.diagnostic?.({ event: 'service_exit', serverId: connection.serverId, pid: connection.pid }); return { state: 'stopped', serverId: connection.serverId, url: connection.url, pid: connection.pid, ...await retainedLog(keepDiagnostics) } }
        if (!preserve && client.isConnected) {
          const result = await client.invoke('server:release', { serverId: connection.serverId }) as { accepted: boolean }
          if (result.accepted) {
            let stopTimer: ReturnType<typeof setTimeout> | undefined
            const stopped = await Promise.race([exit.then(() => true), new Promise<false>(resolve => { stopTimer = setTimeout(() => resolve(false), 10_000) })]).finally(() => { if (stopTimer) clearTimeout(stopTimer) })
            if (stopped) { options.diagnostic?.({ event: 'service_exit', serverId: connection.serverId, pid: connection.pid }); return { state: 'stopped', serverId: connection.serverId, url: connection.url, pid: connection.pid, ...await retainedLog(keepDiagnostics) } }
          }
        }
        options.diagnostic?.({ event: 'service_background', serverId: connection.serverId, pid: connection.pid, logPath })
        return { state: 'background', serverId: connection.serverId, url: connection.url, pid: connection.pid, logPath }
      } finally { detach() }
    } }
  } catch (error) {
    // A competing startup may win the kernel owner. Only reuse its authenticated discovery; never spawn again.
    if (!options.signal?.aborted && exited && (await readFile(logPath, 'utf8')).includes('"code":"SERVER_BUSY"')) {
      const deadline = Date.now() + timeout
      do {
        const winner = await existing()
        if (winner) { detach(); return winner }
        await new Promise(resolve => setTimeout(resolve, 100))
      } while (Date.now() < deadline)
    }
    options.diagnostic?.({ event: 'service_failed', pid: child.pid, logPath, code: error instanceof CliError ? error.code : 'CAPABILITY_UNAVAILABLE' })
    detach(); throw error
  }
}
