/*
 * [INPUT]: Explicit public channel registry, owner token and optional runtime-verified run credentials.
 * [OUTPUT]: Principal-specific dispatch/catalog, owner-only events, bounded frames and live-session checks.
 * [POS]: Transport only. Does not construct AppService, read SQLite or start a scheduler.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer, type ServerOptions } from 'node:https'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { CliError, MAX_MESSAGE_BYTES, MAX_PENDING_REQUESTS, PROTOCOL_VERSION, type MessageEnvelope, type WireError } from '../shared/cli/protocol'
import { deserializeEnvelope, serializeEnvelope } from '../shared/cli/codec'
import type { RpcPrincipal, RunCliPrincipal } from '../shared/cli/run-access'

export interface RpcSession { clientId: string; principal: RpcPrincipal; connected: boolean; subscriptions: Map<string, { conversationId?: string }> }
export interface RpcChannel { input: z.ZodType; effect: 'read' | 'write'; access?: 'owner' | 'run'; handle(input: unknown, session: RpcSession): unknown | Promise<unknown> }
export interface RpcServerOptions {
  token: string; workspaceId: string; serverId?: string; version: string
  channels: ReadonlyMap<string, RpcChannel>
  host?: string; port?: number; tls?: ServerOptions; handshakeTimeout?: number
  accepting?: () => boolean
  sessionClosed?: (session: RpcSession) => void
  maxMessageBytes?: number
  authenticateRun?: (token: string) => Promise<RunCliPrincipal>
}

export async function startRpcServer(options: RpcServerOptions) {
  if (options.token.length < 32 || options.token.length > 4096) throw new CliError('AUTH_FAILED', 'CLI 服务需要独立随机凭据')
  const host = options.host ?? '127.0.0.1'
  const maxMessageBytes = options.maxMessageBytes ?? MAX_MESSAGE_BYTES
  if (!options.tls && !['127.0.0.1', '::1'].includes(host)) throw new CliError('INVALID_REQUEST', '非回环 CLI 服务必须配置 TLS')
  const serverId = options.serverId ?? randomUUID()
  const authenticated = new Map<WebSocket, RpcSession>()
  const digest = (value: string) => createHash('sha256').update(value).digest()
  const expectedToken = digest(options.token)
  const http = options.tls ? createHttpsServer(options.tls) : createHttpServer()
  http.on('request', (_request, response) => { response.writeHead(404); response.end() })
  const wss = new WebSocketServer({ server: http, maxPayload: maxMessageBytes, perMessageDeflate: false,
    verifyClient: (info: { origin: string }) => !info.origin && wss.clients.size < 64 })
  let closing = false
  let pendingRequests = 0
  let closePromise: Promise<void> | undefined
  function send(ws: WebSocket, envelope: MessageEnvelope) {
    if (ws.readyState !== WebSocket.OPEN) return
    let data = serializeEnvelope({ ...envelope, serverId })
    if (Buffer.byteLength(data) > maxMessageBytes) data = serializeEnvelope({ id: envelope.id, type: envelope.type === 'response' ? 'response' : 'error', channel: envelope.channel, serverId, error: { code: 'MESSAGE_TOO_LARGE', message: 'CLI 结果超过单条消息上限，请使用分页读取' } })
    if (ws.bufferedAmount > maxMessageBytes * 2) { ws.terminate(); return }
    ws.send(data, error => { if (error) ws.terminate() })
  }
  const errorFor = (error: unknown, credential: string): WireError => ({ code: error instanceof CliError ? error.code : 'HANDLER_ERROR', message: (error instanceof Error ? error.message : '业务请求失败').replaceAll(options.token, '[redacted]').replaceAll(credential, '[redacted]') })
  wss.on('connection', ws => {
    const timer = setTimeout(() => ws.terminate(), options.handshakeTimeout ?? 5_000)
    const seen = new Set<string>()
    let pending = 0
    let authenticating = false, credential = options.token
    const rejectHandshake = (id: string, code: WireError['code'], message: string) => {
      clearTimeout(timer); send(ws, { id, type: 'error', error: { code, message } }); ws.close(1008)
    }
    ws.on('error', () => { ws.terminate() })
    ws.on('close', () => { clearTimeout(timer); const session = authenticated.get(ws); authenticated.delete(ws); if (session) { session.connected = false; options.sessionClosed?.(session) } })
    ws.on('message', (data, binary) => {
      if (closing) { ws.close(1001); return }
      let envelope: MessageEnvelope
      try { if (binary) throw new Error(); envelope = deserializeEnvelope(data.toString()); if (envelope.id.length > 200) throw new Error() }
      catch { ws.close(1008); return }
      const session = authenticated.get(ws)
      if (!session) {
        if (options.accepting && !options.accepting()) { rejectHandshake(envelope.id, 'SERVER_BUSY', '服务正在退出'); return }
        if (authenticating || envelope.type !== 'handshake' || typeof envelope.token !== 'string' || !envelope.token || envelope.token.length > 4096) { rejectHandshake(envelope.id, 'AUTH_FAILED', 'CLI 身份验证失败'); return }
        if (envelope.protocolVersion !== PROTOCOL_VERSION) { rejectHandshake(envelope.id, 'PROTOCOL_VERSION_UNSUPPORTED', 'CLI 与服务协议版本不兼容'); return }
        if (envelope.workspaceId && envelope.workspaceId !== options.workspaceId) { rejectHandshake(envelope.id, 'PROFILE_MISMATCH', 'CLI 连接的配置身份不匹配'); return }
        credential = envelope.token; authenticating = true
        const owner = timingSafeEqual(digest(credential), expectedToken)
        void (owner ? Promise.resolve<RpcPrincipal>({ kind: 'owner' }) : options.authenticateRun ? options.authenticateRun(credential) : Promise.reject(new Error('invalid credential'))).then(principal => {
          if (closing || ws.readyState !== WebSocket.OPEN || (options.accepting && !options.accepting())) { ws.close(1001); return }
          const clientId = randomUUID(); authenticated.set(ws, { clientId, principal, connected: true, subscriptions: new Map() }); clearTimeout(timer)
          send(ws, { id: envelope.id, type: 'handshake_ack', protocolVersion: PROTOCOL_VERSION, clientId, workspaceId: options.workspaceId, serverVersion: options.version, maxMessageBytes, registeredChannels: [...options.channels].filter(([, channel]) => (channel.access ?? 'owner') === principal.kind).map(([name]) => name) })
        }, () => rejectHandshake(envelope.id, 'AUTH_FAILED', 'CLI 身份验证失败'))
        return
      }
      if (envelope.type !== 'request' || typeof envelope.channel !== 'string' || !Array.isArray(envelope.args) || envelope.args.length > 1) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'INVALID_REQUEST', message: 'CLI 方法接受一个结构化参数' } }); return }
      if (seen.has(envelope.id)) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'DUPLICATE_REQUEST', message: '重复传输请求，业务结果请查询原回执' } }); return }
      if (seen.size >= 4096) { ws.close(1008); return }
      seen.add(envelope.id)
      if (pending >= MAX_PENDING_REQUESTS) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'SERVER_BUSY', message: 'CLI 待决请求过多' } }); return }
      const channel = options.channels.get(envelope.channel)
      if (!channel) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'CHANNEL_NOT_FOUND', message: '该 CLI 方法未公开' } }); return }
      if ((channel.access ?? 'owner') !== session.principal.kind) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'AUTH_FAILED', message: '当前CLI身份无权调用此方法' } }); return }
      const parsed = channel.input.safeParse(envelope.args[0])
      if (!parsed.success) { send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: { code: 'INVALID_REQUEST', message: 'CLI 请求参数无效' } }); return }
      pending++
      pendingRequests++
      void Promise.resolve().then(() => {
        // A connection disappearing before dispatch must not start a new mutation.
        if (closing || !authenticated.has(ws)) throw new CliError('CLIENT_DISCONNECTED', 'CLI 请求尚未受理，连接已退出')
        return channel.handle(parsed.data, session)
      }).then(result => send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, result }), error => send(ws, { id: envelope.id, type: 'response', channel: envelope.channel, error: errorFor(error, credential) })).finally(() => { pending--; pendingRequests-- })
    })
  })
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port ?? 0, host, () => { http.off('error', reject); resolve() })
  }).catch(error => { wss.close(); throw error })
  const address = http.address()
  if (!address || typeof address === 'string') throw new Error('CLI 服务监听失败')
  return {
    serverId, workspaceId: options.workspaceId, url: `${options.tls ? 'wss' : 'ws'}://${host.includes(':') ? `[${host}]` : host}:${address.port}`,
    get clients() { return authenticated.size },
    get pendingRequests() { return pendingRequests },
    disconnect(clientId: string) { for (const [ws, session] of authenticated) if (session.clientId === clientId) ws.terminate() },
    publish(channel: string, value: unknown, conversationId?: string) {
      if (closing) return
      for (const [ws, session] of authenticated) {
        if (session.principal.kind !== 'owner') continue
        const filter = session.subscriptions.get(channel)
        if (filter && (!filter.conversationId || filter.conversationId === conversationId)) send(ws, { id: randomUUID(), type: 'event', channel, args: [value] })
      }
    },
    close() {
      return closePromise ??= new Promise<void>((resolve, reject) => {
        closing = true
        for (const ws of wss.clients) ws.terminate()
        wss.close(() => http.close(error => { if (error) reject(error); else resolve() }))
      })
    },
  }
}
