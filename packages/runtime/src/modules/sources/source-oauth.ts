/*
 * [INPUT]: Explicit source/revision authorization intents, the original SecretStore and MCP SDK OAuth 1.30.1.
 * [OUTPUT]: Source-scoped PKCE/loopback consent, encrypted credentials, noninteractive refresh, post-commit cleanup and queue-safe shutdown; no browser launch or account import.
 * [POS]: Source OAuth adapter; SourceService owns source configuration and actual tool authorization.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthTokensSchema, type OAuthClientInformationMixed, type OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { SecretStore } from '../../contracts'
import type { SourceOAuthState, SourceOAuthStatus } from '@boai/shared/domain/sources'
export type { SourceOAuthState, SourceOAuthStatus } from '@boai/shared/domain/sources'

export interface SourceOAuthIdentity { sourceId: string; revision: number; url: string }
export interface SourceOAuthStart extends SourceOAuthIdentity { requestId: string; clientMetadataUrl?: string }
interface Credentials extends SourceOAuthIdentity {
  generation: string; redirectUrl: string; clientMetadataUrl?: string; client?: OAuthClientInformationMixed
  discovery?: OAuthDiscoveryState; tokens?: OAuthTokens; expiresAt?: number
}
interface Authorization extends Credentials {
  requestId: string; fingerprint: string; authorizationId: string; status: SourceOAuthState; deadline: number
  state?: string; verifier?: string; authorizationUrl?: string; error?: string
}
interface Pending { identity: SourceOAuthIdentity; server: Server; controller: AbortController; timer: ReturnType<typeof setTimeout>; completing?: Promise<SourceOAuthStatus> }
export interface SourceOAuthOptions {
  secrets: SecretStore
  validateSource(sourceId: string, revision: number, url: string): Promise<void>
  fetch?: typeof fetch
  timeoutMs?: number
  clientMetadataUrl?: string
  clientInformation?: OAuthClientInformationMixed
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const credentialKey = (sourceId: string) => `source-oauth:credential:${digest(sourceId)}`
const requestKey = (id: string) => `source-oauth:request:${id}`
const activeState = (state: SourceOAuthState) => state === 'pending' || state === 'authorizing'
const required = () => new Error('AUTHORIZATION_REQUIRED: 请在数据源中重新授权')
const safeUrl = (raw: string) => {
  const url = new URL(raw)
  if (url.username || url.password || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('OAuth 地址必须使用 HTTPS；仅本机回环服务可使用 HTTP')
  return url
}
const sameIdentity = (a: SourceOAuthIdentity, b: SourceOAuthIdentity) => a.sourceId === b.sourceId && a.revision === b.revision && a.url === b.url
const safeState = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right) }

/** All secret values stay in SecretStore. Public methods return only consent progress, never tokens or verifiers. */
export class SourceOAuth {
  private pending = new Map<string, Pending>()
  private queues = new Map<string, Promise<unknown>>()
  private closing = false
  constructor(private readonly options: SourceOAuthOptions) {}
  private async read<T>(key: string): Promise<T | undefined> { const raw = await this.options.secrets.get(key); return raw ? JSON.parse(raw) as T : undefined }
  private write(key: string, value: unknown) { return this.options.secrets.set(key, JSON.stringify(value)) }
  private serial<T>(sourceId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sourceId) ?? Promise.resolve()
    const result = previous.then(action, action)
    const tail = result.catch(() => {})
    this.queues.set(sourceId, tail)
    void tail.finally(() => { if (this.queues.get(sourceId) === tail) this.queues.delete(sourceId) })
    return result
  }
  private async validate(identity: SourceOAuthIdentity, signal?: AbortSignal) {
    if (this.closing) throw new Error('OAuth 服务正在退出')
    signal?.throwIfAborted()
    await this.options.validateSource(identity.sourceId, identity.revision, identity.url)
    signal?.throwIfAborted()
  }
  private view(value: Authorization): SourceOAuthStatus {
    return { authorizationId: value.authorizationId, sourceId: value.sourceId, revision: value.revision, status: value.status, expiresAt: new Date(value.deadline).toISOString(), ...(activeState(value.status) && value.authorizationUrl ? { url: safeUrl(value.authorizationUrl).href } : {}), ...(value.error ? { error: value.error } : {}) }
  }
  private async current(id: string) {
    const value = await this.read<Authorization>(requestKey(id))
    if (!value) throw new Error('授权请求不存在')
    return value
  }
  private async credentials(identity: SourceOAuthIdentity, generation?: string) {
    await this.validate(identity)
    const value = await this.read<Credentials>(credentialKey(identity.sourceId))
    if (!value || !sameIdentity(value, identity) || generation && value.generation !== generation) throw required()
    return value
  }
  async hasCredential(identity: SourceOAuthIdentity) {
    try { const value = await this.credentials(identity); return !!value.tokens && (!value.expiresAt || value.expiresAt > Date.now() || !!value.tokens.refresh_token) } catch { return false }
  }
  async start(input: SourceOAuthStart): Promise<SourceOAuthStatus> {
    if (!input.sourceId || input.sourceId.length > 200 || !input.requestId || input.requestId.length > 200 || !Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error('授权来源或请求身份无效')
    if (input.url.length > 8000) throw new Error('OAuth 地址过长')
    safeUrl(input.url)
    const clientMetadataUrl = input.clientMetadataUrl ?? this.options.clientMetadataUrl
    if (clientMetadataUrl && (safeUrl(clientMetadataUrl).protocol !== 'https:' || new URL(clientMetadataUrl).pathname === '/')) throw new Error('客户端元数据必须是公开 HTTPS 文档地址')
    if (new URL(input.url).hostname === 'mcp.vercel.com' && !clientMetadataUrl && !this.options.clientInformation) throw new Error('CLIENT_REGISTRATION_REQUIRED: Vercel 需要 BOAI 的 HTTPS 客户端元数据地址或已审核客户端身份')
    const authorizationId = digest([input.sourceId, input.requestId]), fingerprint = digest([input.sourceId, input.revision, input.url, clientMetadataUrl])
    return this.serial(input.sourceId, async () => {
      await this.validate(input)
      const prior = await this.read<Authorization>(requestKey(authorizationId))
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Error('授权 requestId 已用于不同配置')
        if (activeState(prior.status) && !this.pending.has(authorizationId)) return this.finish(authorizationId, 'expired', '原授权进程已退出，请发起新的授权请求')
        return this.view(prior)
      }
      // A new explicit consent replaces an unfinished consent only; old working credentials survive until success.
      for (const [id, pending] of this.pending) if (pending.identity.sourceId === input.sourceId) await this.finish(id, 'cancelled')
      if (this.pending.size >= 32) throw new Error('同时进行的 OAuth 授权过多，请先完成或取消已有请求')
      const state = randomBytes(32).toString('base64url'), path = `/oauth/callback/${randomBytes(24).toString('hex')}`
      const controller = new AbortController()
      const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer')
        const callback = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (request.method !== 'GET' || callback.pathname !== path || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.getAll('code').length > 1 || callback.searchParams.getAll('error').length > 1) { response.writeHead(400).end('授权回调无效'); return }
        void this.complete(authorizationId, { state: callback.searchParams.get('state') ?? '', code: callback.searchParams.get('code') ?? undefined, error: callback.searchParams.has('error') }).then(result => {
          response.writeHead(result.status === 'authorized' ? 200 : 400).end(result.status === 'authorized' ? '授权已保存，可以关闭此页面。' : '授权未完成，请返回 BOAI。')
        }, () => { response.writeHead(400).end('授权回调无效或已失效'); })
      })
      server.requestTimeout = 5000; server.headersTimeout = 5000
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
      const redirectUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}${path}`
      const deadline = Date.now() + (this.options.timeoutMs ?? 5 * 60_000)
      const timer = setTimeout(() => { controller.abort(); void this.finish(authorizationId, 'expired', '授权已超时，请重新发起').catch(() => {}) }, Math.max(1, deadline - Date.now())); timer.unref()
      this.pending.set(authorizationId, { identity: input, server, controller, timer })
      const value: Authorization = { sourceId: input.sourceId, revision: input.revision, url: input.url, generation: authorizationId, redirectUrl, ...(clientMetadataUrl ? { clientMetadataUrl } : {}), ...(this.options.clientInformation ? { client: this.options.clientInformation } : {}), requestId: input.requestId, fingerprint, authorizationId, status: 'pending', deadline, state }
      try {
        await this.write(requestKey(authorizationId), value)
        const provider = this.pendingProvider(authorizationId, controller.signal)
        await auth(provider, { serverUrl: input.url, fetchFn: this.oauthFetch(input, controller.signal, () => this.current(authorizationId), true) })
        return this.view(await this.current(authorizationId))
      } catch {
        try { return await this.finish(authorizationId, controller.signal.aborted ? 'cancelled' : 'failed', 'OAuth 授权准备失败，请检查服务和客户端身份后重试') }
        finally { this.stopPending(authorizationId) }
      }
    })
  }
  async status(authorizationId: string): Promise<SourceOAuthStatus> {
    const value = await this.current(authorizationId)
    if (activeState(value.status) && (!this.pending.has(authorizationId) || value.deadline <= Date.now())) return this.finish(authorizationId, 'expired', '授权已失效，请重新发起')
    return this.view(value)
  }
  async complete(authorizationId: string, callback: { state: string; code?: string; error?: boolean }): Promise<SourceOAuthStatus> {
    const value = await this.current(authorizationId), pending = this.pending.get(authorizationId)
    if (!pending || !activeState(value.status) || !value.state || !safeState(value.state, callback.state) || value.deadline <= Date.now() || !callback.error && (!callback.code || callback.code.length > 8192)) throw new Error('授权回调来源不匹配或已失效')
    if (pending.completing) throw new Error('授权回调已经受理')
    if (callback.error) return this.finish(authorizationId, 'failed', '服务未授予访问权限，请重新授权')
    const operation = (async () => {
      try {
        await this.validate(value, pending.controller.signal)
        await auth(this.pendingProvider(authorizationId, pending.controller.signal), { serverUrl: value.url, authorizationCode: callback.code!, fetchFn: this.oauthFetch(value, pending.controller.signal, () => this.current(authorizationId), true) })
        return await this.serial(value.sourceId, async () => {
          await this.validate(value, pending.controller.signal)
          const current = await this.current(authorizationId)
          if (!activeState(current.status) || !current.tokens) throw required()
          const credentials: Credentials = { sourceId: current.sourceId, revision: current.revision, url: current.url, generation: current.generation, redirectUrl: current.redirectUrl, clientMetadataUrl: current.clientMetadataUrl, client: current.client, discovery: current.discovery, tokens: current.tokens, expiresAt: current.expiresAt }
          const previous = await this.read<Credentials>(credentialKey(value.sourceId))
          await this.write(credentialKey(value.sourceId), credentials)
          // Preserve a previously working grant if a cancelled replacement loses its commit race.
          try { await this.validate(value, pending.controller.signal) } catch {
            if (previous) await this.write(credentialKey(value.sourceId), previous)
            else await this.options.secrets.delete(credentialKey(value.sourceId))
            throw required()
          }
          const result = await this.finish(authorizationId, 'authorized')
          if (result.status !== 'authorized') {
            if (previous) await this.write(credentialKey(value.sourceId), previous)
            else await this.options.secrets.delete(credentialKey(value.sourceId))
          }
          return result
        })
      } catch { return this.finish(authorizationId, pending.controller.signal.aborted ? 'cancelled' : 'failed', 'OAuth 授权未完成或来源已变化，请重新授权') }
    })()
    pending.completing = operation
    return operation
  }
  private async updatePending(id: string, signal: AbortSignal, update: (value: Authorization) => void) {
    signal.throwIfAborted()
    await this.serial(`authorization:${id}`, async () => {
      const current = await this.current(id)
      if (!activeState(current.status)) throw required()
      await this.validate(current, signal); update(current)
      await this.write(requestKey(id), current)
      signal.throwIfAborted()
    })
  }
  private pendingProvider(id: string, signal: AbortSignal): OAuthClientProvider {
    const manager = this
    // SDK reads these synchronously; the listener is already allocated before provider creation.
    const pending = this.pending.get(id)!
    const redirect = `http://127.0.0.1:${(pending.server.address() as { port: number }).port}`
    let loaded: Authorization | undefined
    const read = async () => loaded = await manager.current(id)
    return {
      get redirectUrl() { return loaded?.redirectUrl ?? redirect },
      get clientMetadataUrl() { return loaded?.clientMetadataUrl ?? manager.options.clientMetadataUrl },
      get clientMetadata() { return { client_name: 'BOAI', redirect_uris: [loaded?.redirectUrl ?? redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } },
      state: async () => (await read()).state!,
      clientInformation: async () => (await read()).client,
      saveClientInformation: client => manager.updatePending(id, signal, value => { value.client = client }),
      tokens: async () => (await read()).tokens,
      saveTokens: tokens => manager.updatePending(id, signal, value => { value.tokens = OAuthTokensSchema.parse(tokens); value.expiresAt = tokens.expires_in === undefined ? undefined : Date.now() + tokens.expires_in * 1000 }),
      saveCodeVerifier: verifier => manager.updatePending(id, signal, value => { value.verifier = verifier }),
      codeVerifier: async () => { const verifier = (await read()).verifier; if (!verifier) throw required(); return verifier },
      redirectToAuthorization: url => manager.updatePending(id, signal, value => { safeUrl(url.href); value.authorizationUrl = url.href; value.status = 'authorizing' }),
      discoveryState: async () => (await read()).discovery,
      saveDiscoveryState: discovery => manager.updatePending(id, signal, value => { value.discovery = discovery }),
      invalidateCredentials: scope => manager.updatePending(id, signal, value => { if (scope === 'all' || scope === 'tokens') { delete value.tokens; delete value.expiresAt } if (scope === 'all' || scope === 'client') delete value.client; if (scope === 'all' || scope === 'verifier') delete value.verifier; if (scope === 'all' || scope === 'discovery') delete value.discovery }),
    }
  }
  private finish(id: string, state: SourceOAuthState, error?: string): Promise<SourceOAuthStatus> {
    return this.serial(`authorization:${id}`, async () => {
    const value = await this.current(id)
    // Terminal outcomes win over timeout/cancel/error races.
    if (!activeState(value.status)) { this.stopPending(id); return this.view(value) }
    value.status = state; value.error = error
    delete value.state; delete value.verifier; delete value.tokens; delete value.client; delete value.discovery; delete value.authorizationUrl
    await this.write(requestKey(id), value)
    this.stopPending(id)
    return this.view(value)
    })
  }
  private stopPending(id: string) {
    const pending = this.pending.get(id)
    if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending.server.close(); pending.server.closeIdleConnections(); this.pending.delete(id) }
  }
  async cancel(id: string) { this.pending.get(id)?.controller.abort(); return this.finish(id, 'cancelled') }
  async cancelSource(sourceId: string) { for (const [id, pending] of this.pending) if (pending.identity.sourceId === sourceId) await this.cancel(id) }
  async disconnect(identity: SourceOAuthIdentity) {
    await this.validate(identity)
    await this.forgetSource(identity.sourceId)
  }
  /** Host-only cleanup AFTER its source mutation commits; never expose as an unversioned user operation. */
  async forgetSource(sourceId: string) {
    await this.cancelSource(sourceId)
    await this.serial(sourceId, async () => {
      // A queued explicit start may have allocated its listener while cleanup waited for the source lock.
      await this.cancelSource(sourceId)
      await this.options.secrets.delete(credentialKey(sourceId))
    })
  }
  private async updateCredentials(identity: SourceOAuthIdentity, generation: string, signal: AbortSignal | undefined, update: (value: Credentials) => void) {
    await this.serial(identity.sourceId, async () => {
      await this.validate(identity, signal)
      const value = await this.credentials(identity, generation); update(value)
      await this.write(credentialKey(identity.sourceId), value)
      await this.validate(identity, signal)
    })
  }
  /** Does not open consent, register a client or create PKCE. The caller may only refresh the already authorized connection. */
  async authProvider(identity: SourceOAuthIdentity, signal?: AbortSignal): Promise<OAuthClientProvider> {
    const initial = await this.credentials(identity), manager = this
    if (!initial.tokens) throw required()
    const provider: OAuthClientProvider = {
      redirectUrl: initial.redirectUrl, clientMetadataUrl: initial.clientMetadataUrl,
      clientMetadata: { client_name: 'BOAI', redirect_uris: [initial.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
      clientInformation: async () => (await manager.credentials(identity, initial.generation)).client ?? (() => { throw required() })(),
      tokens: async () => { await manager.validate(identity, signal); return (await manager.credentials(identity, initial.generation)).tokens },
      saveTokens: tokens => manager.updateCredentials(identity, initial.generation, signal, value => { value.tokens = OAuthTokensSchema.parse(tokens); value.expiresAt = tokens.expires_in === undefined ? undefined : Date.now() + tokens.expires_in * 1000 }),
      redirectToAuthorization: async () => { throw required() }, state: async () => { throw required() }, saveCodeVerifier: async () => { throw required() }, codeVerifier: async () => { throw required() },
      discoveryState: async () => (await manager.credentials(identity, initial.generation)).discovery,
      saveDiscoveryState: discovery => manager.updateCredentials(identity, initial.generation, signal, value => { value.discovery = discovery }),
      invalidateCredentials: scope => manager.updateCredentials(identity, initial.generation, signal, value => { if (scope === 'all' || scope === 'tokens') { delete value.tokens; delete value.expiresAt } if (scope === 'all' || scope === 'client') delete value.client; if (scope === 'all' || scope === 'discovery') delete value.discovery }),
    }
    if (initial.expiresAt && initial.expiresAt <= Date.now()) {
      await this.serial(`refresh:${identity.sourceId}`, async () => {
        const current = await this.credentials(identity, initial.generation)
        if (!current.expiresAt || current.expiresAt > Date.now()) return
        try {
          if (!current.tokens?.refresh_token) throw required()
          await auth(provider, { serverUrl: identity.url, fetchFn: this.transportFetch(identity, signal) })
        } catch { throw required() }
      })
    }
    return provider
  }
  transportFetch(identity: SourceOAuthIdentity, signal?: AbortSignal): typeof fetch {
    return this.oauthFetch(identity, signal, () => this.credentials(identity), false)
  }
  private oauthFetch(identity: SourceOAuthIdentity, signal: AbortSignal | undefined, record: () => Promise<Credentials>, discovery: boolean): typeof fetch {
    return async (input, init) => {
      await this.validate(identity, signal)
      const url = safeUrl(input instanceof Request ? input.url : String(input)), headers = new Headers(input instanceof Request ? input.headers : undefined)
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const value = await record(), metadata = value.discovery?.authorizationServerMetadata
      const oauthEndpoint = url.href === metadata?.token_endpoint || discovery && url.href === metadata?.registration_endpoint
      const sourceOrigin = url.origin === new URL(identity.url).origin
      if (!sourceOrigin && !(oauthEndpoint || discovery && method === 'GET' && !headers.has('authorization') && !headers.has('cookie'))) throw new Error('OAuth 请求地址不属于此连接')
      if (!sourceOrigin && (headers.has('cookie') || /^Bearer\s/i.test(headers.get('authorization') ?? ''))) throw new Error('禁止将数据源令牌发送到另一地址')
      if (discovery && method !== 'GET' && !oauthEndpoint) throw new Error('OAuth 写请求必须匹配已发现的授权端点')
      const effective = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : []), ...(init?.signal ? [init.signal] : [])])
      const response = await (this.options.fetch ?? fetch)(input, { ...init, headers, redirect: 'error', signal: effective })
      await this.validate(identity, signal)
      return response
    }
  }
  async close() {
    this.closing = true
    for (const id of [...this.pending.keys()]) await this.cancel(id)
    await Promise.allSettled([...this.queues.values()])
    // A start already awaiting listener setup must not leave a loopback server after shutdown.
    for (const id of [...this.pending.keys()]) await this.cancel(id)
  }
}
