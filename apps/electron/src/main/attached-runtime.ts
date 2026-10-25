/*
 * [OUTPUT]: 2026-10-19应用业务协议：同配置目录桌面附着支持私有application-host请求回执。
 * [OUTPUT]: Bounded discovery after an observed ownership loss authenticates the winning service; quit/version/auth failures never retry business.
 * [INPUT]: Private same-profile desktop discovery and a ready, independently owned BOAI service.
 * [OUTPUT]: Original worker-shaped requests/events and reverse calls; trusted desktop PID enables identity-bound exit observation.
 * [POS]: Electron host adapter with no Electron import; unknown requests are never resent.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { EventEmitter } from 'node:events'
import { CliRpcClient } from '@boai/transport/client'
import { readLocalConnection } from '@boai/transport/discovery'
import { CliError, MAX_DESKTOP_MESSAGE_BYTES } from '@boai/shared/cli/protocol'

export class AttachedRuntime extends EventEmitter {
  readonly stderr = undefined
  readonly stdout = undefined
  private ended = false
  constructor(private client: CliRpcClient, private hostId: string, readonly serverId: string) {
    super()
    client.on('app', event => this.emit('message', { type: 'event', event }))
    client.on('host', message => this.emit('message', message))
    client.onDisconnect(() => { if (!this.ended) { this.ended = true; this.emit('exit', '独立服务连接断开，原请求结果请核对') } })
  }
  async start() {
    try { await this.client.invoke('host:attach', { hostId: this.hostId, pid: process.pid, drained: true }); this.emit('message', { type: 'ready' }) }
    catch (error) { this.emit('message', { type: 'attach-error', error: error instanceof Error ? error.message : '桌面附着失败' }); this.client.destroy() }
  }
  postMessage(message: unknown) {
    const value = message as { type: string; id: string; result?: unknown; value?: unknown; error?: string; waitForCompletion?: boolean; request: { id: string; method: string; input?: unknown } }
    if (value.type === 'application-host-result' || value.type === 'browser-host-result' || value.type === 'secret-result') {
      void this.client.invoke('host:result', { id: value.id, ...(value.error ? { error: value.error } : { result: value.type === 'secret-result' ? value.value : value.result }) }).catch(() => {})
    } else if (value.type === 'request') {
      const { id, method, input } = value.request
      const invoke = value.waitForCompletion ? this.client.invokeUntimed.bind(this.client) : this.client.invoke.bind(this.client)
      void invoke('runtime:request', { method, input }).then(result => this.emit('message', { type: 'response', response: { id, result } }), error => this.emit('message', { type: 'response', response: { id, error: error instanceof Error ? error.message : '请求结果未知，请核对原回执' } }))
    } else throw new Error('附着服务不接受进程控制消息')
  }
  async detach() { if (this.client.isConnected) await this.client.invokeUntimed('host:detach'); this.client.destroy() }
  kill() { this.client.destroy(); return true }
}

export async function findAttachedRuntime(dataPath: string, version: string, hostId: string): Promise<AttachedRuntime | null> {
  let connection
  try { connection = await readLocalConnection(dataPath, 'desktop.json') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  const client = new CliRpcClient(connection.url, { ...connection, maxMessageBytes: MAX_DESKTOP_MESSAGE_BYTES, connectTimeout: 3000, requestTimeout: 120_000 })
  try { await client.connect() }
  catch (error) {
    client.destroy()
    if (error instanceof CliError && ['CLIENT_DISCONNECTED', 'REQUEST_TIMEOUT'].includes(error.code)) return null
    throw error
  }
  // Stale discovery from a dead older service must not block original owner recovery.
  // A reachable service must still match both recorded and actual versions.
  if (connection.version !== version || client.handshake?.serverVersion !== version) { client.destroy(); throw new CliError('PROTOCOL_VERSION_UNSUPPORTED', '实际服务与桌面版本不同') }
  return new AttachedRuntime(client, hostId, connection.serverId)
}


/** Called only after the losing worker has actually exited; never starts another writer. */
export async function waitForAttachedRuntime(dataPath: string, version: string, hostId: string, options: { stopping?: () => boolean; timeoutMs?: number } = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 10000)
  while (true) {
    if (options.stopping?.()) throw new CliError('SERVER_BUSY', '应用正在退出，不再连接运行服务')
    const attached = await findAttachedRuntime(dataPath, version, hostId)
    if (attached) {
      if (options.stopping?.()) { attached.kill(); throw new CliError('SERVER_BUSY', '应用正在退出，不再连接运行服务') }
      return attached
    }
    if (Date.now() >= deadline) throw new CliError('SERVER_BUSY', '已有运行服务，但桌面连接尚未就绪，请稍后重试')
    await new Promise(resolve => setTimeout(resolve, Math.min(50, deadline - Date.now())))
  }
}
