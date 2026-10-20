/*
 * [OUTPUT]: 2026-10-19应用业务协议：私有同机宿主端口显式转发外观/插件操作，沿原连接生命周期。
 * [OUTPUT]: Completed explicit detach clears host identity/subscriptions before acknowledgement; shutdown cannot drain a closed socket or deliver new calls to an old host.
 * [INPUT]: A private same-profile desktop credential, explicit runtime dispatcher and original browser/secret contracts.
 * [OUTPUT]: Same-machine host calls; old browser leases resolve only after original host drain or identity-bound process-tree exit.
 * [POS]: Separate loopback host transport; not part of the public CLI method registry or owner token.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { startRpcServer, type RpcChannel, type RpcSession } from '../cli/server'
import { profileIdentity, publishLocalConnection } from '../cli/discovery'
import { CliError, MAX_DESKTOP_MESSAGE_BYTES, PROTOCOL_VERSION } from '../shared/cli/protocol'
import type { BrowserHostBridge, BrowserHostMethods } from '../shared/ipc/browser'
import type { AppEvent } from '../shared/ipc'
import { watchDesktopProcess, type DesktopProcessWatch } from './desktop-process'

type Pending = { type: 'browser-host' | 'secret' | 'application-host'; method: string; input: unknown; critical: boolean; resolve(value: unknown): void; reject(error: Error): void }
const critical = new Set(['acquire', 'executeSingle', 'drain', 'clearScope', 'disconnect'])
type Host = { hostId: string; clientId: string; pid: number; watch: DesktopProcessWatch; drained: boolean }
export class DesktopHostBridge implements BrowserHostBridge {
  private server?: Awaited<ReturnType<typeof startRpcServer>>
  private remove?: () => Promise<void>
  private attached?: Host
  private lostHost?: Host
  private attachQueue: Promise<unknown> = Promise.resolve()
  private lossCleanup: Promise<void> = Promise.resolve()
  private closing = false
  private detaching = false
  private pending = new Map<string, Pending>()
  private leases = new Set<string>()
  constructor(private hooks: { request(method: string, input: unknown): Promise<unknown>; detach(): Promise<void>; lost(): void | Promise<void> }) {}
  get available() { return !!this.attached?.watch.active && !this.detaching && !this.lostHost && !this.closing }
  get connected() { return !!this.attached }
  private authorized(session: RpcSession) { if (this.attached?.clientId !== session.clientId) throw new CliError('AUTH_FAILED', '桌面宿主身份未附着或已替换') }
  private async settleLost(host: Host) {
    if (this.lostHost !== host) return
    this.lostHost = undefined
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      if (pending.method === 'drain') pending.resolve({ drained: true })
      else if (pending.method === 'disconnect') pending.resolve(undefined)
      else pending.reject(new CliError('CLIENT_DISCONNECTED', '旧浏览器调用结果未知，原宿主已确认退出，未重放动作'))
    }
    this.leases.clear()
    await this.lossCleanup
    await host.watch.stop()
  }
  private lose(host: Host) {
    if (this.attached !== host) return
    this.attached = undefined
    if (!host.drained) this.lostHost = host
    for (const [id, pending] of this.pending) if (!pending.critical) { this.pending.delete(id); pending.reject(new CliError('CLIENT_DISCONNECTED', '原桌面宿主已断开，结果未确认且不会重放')) }
    this.lossCleanup = host.drained ? Promise.resolve() : Promise.resolve().then(() => this.hooks.lost())
    void this.lossCleanup.catch(error => this.publish({ type: 'runtime-error', error: error instanceof Error ? error.message : '旧浏览器排空未确认' }))
  }
  private async attach(input: { hostId: string; pid: number }, session: RpcSession) {
    if (this.closing || !session.connected) throw new CliError('CLIENT_DISCONNECTED', '桌面宿主连接已结束')
    if (this.attached) {
      if (this.attached.clientId === session.clientId && this.attached.hostId === input.hostId && this.attached.pid === input.pid) return
      throw new CliError('SERVER_BUSY', '此服务已有桌面宿主')
    }
    if (this.lostHost) {
      if (this.lostHost.hostId !== input.hostId || this.lostHost.pid !== input.pid) throw new CliError('CAPABILITY_UNAVAILABLE', '旧浏览器宿主的真实退出尚未确认，不能授予新的宿主租约')
      // The same desktop reconnects only after its original BrowserService confirmed disconnectAll.
      await this.settleLost(this.lostHost)
    }
    await this.lossCleanup
    const watch = await watchDesktopProcess(input.pid)
    if (this.closing || !session.connected || !watch.active) { await watch.stop(); throw new CliError('CLIENT_DISCONNECTED', '桌面宿主在核验期间退出') }
    const host: Host = { ...input, clientId: session.clientId, watch, drained: false }
    this.attached = host; this.detaching = false
    session.subscriptions.set('host', {}); session.subscriptions.set('app', {})
    void watch.finished.then(async result => {
      if (result.exited) {
        this.lose(host)
        await this.settleLost(host)
      } else if (result.error && !this.closing) {
        this.server?.disconnect(host.clientId)
        this.publish({ type: 'runtime-error', error: result.error })
      }
    }).catch(error => this.publish({ type: 'runtime-error', error: error instanceof Error ? error.message : '旧浏览器退出核验失败' }))
  }
  async open(dataPath: string, serverId: string, version: string) {
    const workspaceId = await profileIdentity(dataPath), token = randomBytes(32).toString('base64url')
    const channels = new Map<string, RpcChannel>()
    channels.set('host:attach', { input: z.object({ hostId: z.string().uuid(), pid: z.number().int().min(2).max(2147483647), drained: z.literal(true) }).strict(), effect: 'write', handle: (input, session) => {
      const operation = this.attachQueue.then(() => this.attach(input as { hostId: string; pid: number }, session))
      this.attachQueue = operation.catch(() => {})
      return operation.then(() => ({ serverId, workspaceId, attached: true }))
    } })
    channels.set('runtime:request', { input: z.object({ method: z.string().min(1).max(200), input: z.unknown().optional() }).strict(), effect: 'write', handle: (input, session) => {
      this.authorized(session)
      const value = input as { method: string; input?: unknown }
      if (this.detaching && value.method !== '__startBrowserAction') throw new CliError('SERVER_BUSY', '桌面宿主正在排空')
      return this.hooks.request(value.method, value.input)
    } })
    channels.set('host:result', { input: z.object({ id: z.string().uuid(), result: z.unknown().optional(), error: z.string().max(4000).optional() }).strict(), effect: 'write', handle: (input, session) => {
      this.authorized(session)
      const value = input as { id: string; result?: unknown; error?: string }, pending = this.pending.get(value.id)
      if (!pending) return { accepted: false }
      this.pending.delete(value.id)
      if (value.error) pending.reject(new Error(value.error))
      else {
        const generation = (pending.input as { generation?: string })?.generation
        if (pending.method === 'acquire' && generation) this.leases.add(generation)
        if (pending.method === 'drain' && generation) this.leases.delete(generation)
        if (pending.method === 'disconnect') this.leases.clear()
        pending.resolve(value.result)
      }
      return { accepted: true }
    } })
    channels.set('host:detach', { input: z.undefined(), effect: 'write', handle: async (_input, session) => {
      this.authorized(session); this.detaching = true
      const host = this.attached!
      await this.hooks.detach()
      host.drained = true
      await host.watch.stop()
      session.subscriptions.delete('host'); session.subscriptions.delete('app')
      this.lose(host)
      await this.settleLost(host)
      return { detached: true }
    } })
    this.server = await startRpcServer({ token, serverId, workspaceId, version, channels, maxMessageBytes: MAX_DESKTOP_MESSAGE_BYTES, sessionClosed: session => {
      if (this.attached?.clientId !== session.clientId) return
      this.lose(this.attached)
    } })
    try { this.remove = await publishLocalConnection(dataPath, { protocolVersion: PROTOCOL_VERSION, workspaceId, serverId, url: this.server.url, token, pid: process.pid, version }, 'desktop.json') }
    catch (error) { await this.server.close(); throw error }
  }
  private call(type: Pending['type'], method: string, input: unknown): Promise<unknown> {
    const needsDrain = type === 'browser-host' && ['drain', 'disconnect'].includes(method)
    if (!this.attached) {
      if (needsDrain && !this.lostHost) return Promise.resolve(method === 'drain' ? { drained: true } : undefined)
      if (!(needsDrain && this.lostHost)) return Promise.reject(new CliError('CAPABILITY_UNAVAILABLE', '同机桌面宿主未连接'))
    }
    if (type === 'browser-host' && ['acquire', 'executeSingle', 'manualOpen'].includes(method) && (!this.attached?.watch.active || this.detaching || this.closing)) return Promise.reject(new CliError('CAPABILITY_UNAVAILABLE', '桌面宿主正在退出或进程核验不可用，不再开始浏览器动作'))
    if (this.pending.size >= 128) return Promise.reject(new CliError('SERVER_BUSY', '桌面宿主待决操作过多'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(id, { type, method, input, critical: type === 'browser-host' && critical.has(method), resolve, reject })
      if (this.attached) this.server!.publish('host', { type, id, ...(type === 'secret' ? { operation: method, ...(input as object) } : { method, input }) })
    })
  }
  request<K extends keyof BrowserHostMethods>(method: K, input: BrowserHostMethods[K]['input']): Promise<BrowserHostMethods[K]['output']> { return this.call('browser-host', method, input) as Promise<BrowserHostMethods[K]['output']> }
  application(method: import('../shared/ipc/application-host').ApplicationHostMethod, input: unknown) { return this.call('application-host', method, input) }
  secret(operation: 'get' | 'has' | 'set' | 'delete', key: string, value?: string) { return this.call('secret', operation, { key, ...(value === undefined ? {} : { value }) }) }
  publish(event: AppEvent) { this.server?.publish('app', event) }
  async close() {
    this.closing = true
    await this.attachQueue
    if (this.attached) { const host = this.attached; await this.hooks.detach(); host.drained = true; await host.watch.stop() }
    await this.lossCleanup
    await this.server?.close(); await this.remove?.()
  }
}
