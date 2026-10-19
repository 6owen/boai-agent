/*
 * Copyright 2026 Craft Docs Ltd. Licensed under Apache-2.0; see ../shared/cli/LICENSE.txt and NOTICE.txt.
 * Modified for BOAI: Node ws/TLS CA, identity validation, bounded requests and complete error cleanup.
 * [INPUT]: Craft apps/cli/src/client.ts at 22c9f0414ab63e0a22814c9a2ada740206e09091, explicit endpoint/token.
 * [OUTPUT]: Correlated RPC/events, bounded desktop frames and explicitly untimed host operations; no replay.
 * [POS]: CLI client shared by commands, discovery and protocol tests.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { CliError, MAX_MESSAGE_BYTES, MAX_PENDING_REQUESTS, PROTOCOL_VERSION, type MessageEnvelope } from '../shared/cli/protocol'
import { deserializeEnvelope, serializeEnvelope } from '../shared/cli/codec'

export interface CliClientOptions {
  token: string
  workspaceId?: string
  serverId?: string
  requestTimeout?: number
  connectTimeout?: number
  ca?: string | Buffer
  maxMessageBytes?: number
}
interface PendingRequest { channel: string; resolve(value: unknown): void; reject(error: Error): void; timeout?: ReturnType<typeof setTimeout> }

export class CliRpcClient {
  private ws?: WebSocket
  private pending = new Map<string, PendingRequest>()
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  private disconnectListeners = new Set<(error: Error) => void>()
  private connected = false
  private destroyed = false
  private connecting = false
  private rejectConnect?: (error: Error) => void
  private ack?: MessageEnvelope
  constructor(private readonly url: string, private readonly options: CliClientOptions) {
    const endpoint = new URL(url)
    if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new CliError('INVALID_REQUEST', 'CLI 地址必须是无凭据和查询参数的 ws/wss 地址')
    if (endpoint.protocol === 'ws:' && !['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname)) throw new CliError('INVALID_REQUEST', '远端 CLI 连接必须使用 WSS')
    if (!options.token || options.token.length > 4096) throw new CliError('AUTH_FAILED', '缺少有效 CLI 连接凭据')
    for (const timeout of [options.requestTimeout, options.connectTimeout]) if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647)) throw new CliError('INVALID_REQUEST', 'RPC 等待期限无效')
  }
  get isConnected() { return this.connected }
  get handshake() { return this.ack }

  async connect(): Promise<string> {
    if (this.destroyed || this.connecting || this.ws) throw new CliError('CLIENT_DISCONNECTED', '此客户端已经连接或关闭')
    this.connecting = true
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const fail = (error: Error) => {
        if (!this.connecting) return
        this.connecting = false; clearTimeout(timer); this.rejectConnect = undefined
        reject(error); this.ws?.terminate()
      }
      const timer = setTimeout(() => fail(new CliError('REQUEST_TIMEOUT', 'CLI 握手等待超时')), this.options.connectTimeout ?? 10_000)
      this.rejectConnect = fail
      const ws = this.ws = new WebSocket(this.url, { ca: this.options.ca, rejectUnauthorized: true, followRedirects: false, maxPayload: this.options.maxMessageBytes ?? MAX_MESSAGE_BYTES, perMessageDeflate: false })
      ws.on('open', () => ws.send(serializeEnvelope({ id, type: 'handshake', protocolVersion: PROTOCOL_VERSION, workspaceId: this.options.workspaceId, token: this.options.token })))
      ws.on('message', (raw, binary) => {
        let envelope: MessageEnvelope
        try { if (binary) throw new Error(); envelope = deserializeEnvelope(raw.toString()) }
        catch { const error = new CliError('INVALID_REQUEST', '服务返回无效的 CLI 消息'); if (this.connecting) fail(error); else this.disconnect(error); return }
        if (this.connecting) {
          if (envelope.id !== id) { fail(new CliError('INVALID_REQUEST', 'CLI 握手身份不匹配')); return }
          if (envelope.type === 'error') { fail(new CliError(envelope.error!.code, envelope.error!.message)); return }
          if (envelope.type !== 'handshake_ack' || envelope.protocolVersion !== PROTOCOL_VERSION || !envelope.serverId || !envelope.workspaceId || !Array.isArray(envelope.registeredChannels) || !envelope.registeredChannels.every(channel => typeof channel === 'string')) { fail(new CliError('PROTOCOL_VERSION_UNSUPPORTED', 'CLI 服务协议或能力无效')); return }
          if ((this.options.workspaceId && envelope.workspaceId !== this.options.workspaceId) || (this.options.serverId && envelope.serverId !== this.options.serverId)) { fail(new CliError('PROFILE_MISMATCH', 'CLI 服务实例或配置身份不匹配')); return }
          if (!Number.isSafeInteger(envelope.maxMessageBytes) || envelope.maxMessageBytes! <= 0 || envelope.maxMessageBytes! > (this.options.maxMessageBytes ?? MAX_MESSAGE_BYTES)) { fail(new CliError('INVALID_REQUEST', '服务消息上限无效')); return }
          clearTimeout(timer); this.rejectConnect = undefined; this.connecting = false; this.connected = true; this.ack = envelope
          resolve(envelope.clientId!); return
        }
        this.onMessage(envelope)
      })
      ws.on('error', () => { const error = new CliError('CLIENT_DISCONNECTED', 'CLI 连接失败，请核对地址、证书及服务状态'); if (this.connecting) fail(error); else this.disconnect(error) })
      ws.on('close', () => { const error = new CliError('CLIENT_DISCONNECTED', 'CLI 连接已断开，未确认请求须查询原回执'); if (this.connecting) fail(error); else this.disconnect(error) })
    })
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return this.dispatch(channel, args, this.options.requestTimeout ?? 10_000)
  }
  async invokeUntimed(channel: string, ...args: unknown[]): Promise<unknown> { return this.dispatch(channel, args) }
  private async dispatch(channel: string, args: unknown[], deadline?: number): Promise<unknown> {
    if (!this.connected || !this.ws) throw new CliError('CLIENT_DISCONNECTED', 'CLI 尚未连接')
    if (!this.ack!.registeredChannels!.includes(channel)) throw new CliError('CHANNEL_NOT_FOUND', '该 CLI 方法未公开')
    if (this.pending.size >= MAX_PENDING_REQUESTS) throw new CliError('SERVER_BUSY', 'CLI 待决请求过多')
    const id = randomUUID(), data = serializeEnvelope({ id, type: 'request', channel, args })
    if (Buffer.byteLength(data) > this.ack!.maxMessageBytes!) throw new CliError('MESSAGE_TOO_LARGE', 'CLI 请求超过服务消息上限')
    return new Promise((resolve, reject) => {
      const timeout = deadline === undefined ? undefined : setTimeout(() => { this.pending.delete(id); reject(new CliError('REQUEST_TIMEOUT', 'CLI 请求等待超时，业务结果须查询原回执')) }, deadline)
      this.pending.set(id, { channel, resolve, reject, timeout })
      this.ws!.send(data, error => { if (error) { const request = this.pending.get(id); if (request) { clearTimeout(request.timeout); this.pending.delete(id); request.reject(new CliError('CLIENT_DISCONNECTED', 'CLI 请求发送未确认，请查询原回执')) } } })
    })
  }
  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    const set = this.listeners.get(channel) ?? new Set(); set.add(callback); this.listeners.set(channel, set)
    return () => { set.delete(callback); if (!set.size) this.listeners.delete(channel) }
  }
  onDisconnect(callback: (error: Error) => void) { this.disconnectListeners.add(callback); return () => { this.disconnectListeners.delete(callback) } }
  destroy() {
    this.destroyed = true
    this.rejectConnect?.(new CliError('CLIENT_DISCONNECTED', 'CLI 客户端已关闭'))
    this.disconnect(new CliError('CLIENT_DISCONNECTED', 'CLI 客户端已关闭，已受理业务继续由服务管理'))
    this.listeners.clear(); this.disconnectListeners.clear()
  }
  private disconnect(error: Error) {
    const wasConnected = this.connected
    this.connected = false
    for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(error) }
    this.pending.clear(); this.ws?.terminate()
    if (wasConnected) for (const callback of this.disconnectListeners) { try { callback(error) } catch { /* Consumer cleanup is isolated. */ } }
  }
  private onMessage(envelope: MessageEnvelope) {
    if (envelope.serverId !== this.ack!.serverId) { this.disconnect(new CliError('PROFILE_MISMATCH', 'CLI 消息来源实例不匹配')); return }
    if (envelope.type === 'response') {
      const request = this.pending.get(envelope.id)
      if (!request) return
      clearTimeout(request.timeout); this.pending.delete(envelope.id)
      if (envelope.channel !== request.channel) request.reject(new CliError('INVALID_REQUEST', 'CLI 回应方法不匹配'))
      else if (envelope.error) request.reject(new CliError(envelope.error.code, envelope.error.message))
      else request.resolve(envelope.result)
    } else if (envelope.type === 'event' && envelope.channel) {
      for (const callback of this.listeners.get(envelope.channel) ?? []) { try { callback(...(envelope.args ?? [])) } catch { /* Consumer errors must not break transport. */ } }
    }
  }
}
