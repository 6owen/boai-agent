/*
 * [INPUT]: Real local OAuth/loopback HTTP endpoints, MCP SDK 1.30.1 and isolated in-memory SecretStore.
 * [OUTPUT]: PKCE exchange, callback/source isolation, cancellation/shutdown, refresh and credential redaction contracts.
 * [POS]: Source OAuth integration tests; no browser, external account or model calls.
 * [PROTOCOL]: Changes must update this Header and tests/.folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { SourceOAuth, type SourceOAuthIdentity } from '../packages/runtime/src/modules/sources/source-oauth'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(options: { timeoutMs?: number } = {}) {
  const vault = new Map<string, string>(), requests: { path: string; params?: URLSearchParams; authorization?: string }[] = []
  let origin = '', rejectRefresh = false, held: (() => void) | undefined, holdExchange = false
  const server = createServer((request, response) => {
    const path = new URL(request.url!, origin).pathname, chunks: Buffer[] = []
    request.on('data', value => chunks.push(value))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString(), params = new URLSearchParams(body)
      requests.push({ path, ...(request.method === 'POST' ? { params } : {}), authorization: request.headers.authorization })
      const json = (value: unknown, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value)) }
      if (path.startsWith('/.well-known/oauth-protected-resource')) return json({ resource: `${origin}/mcp`, authorization_servers: [origin] })
      if (path === '/.well-known/oauth-authorization-server') return json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] })
      if (path === '/register') return json({ ...JSON.parse(body), client_id: 'fixture-client' }, 201)
      if (path === '/token') {
        const answer = () => params.get('grant_type') === 'refresh_token'
          ? rejectRefresh ? json({ error: 'invalid_grant', error_description: 'private-upstream-details' }, 400) : json({ access_token: 'refreshed-access-secret', token_type: 'Bearer', expires_in: 3600 })
          : json({ access_token: 'access-secret', refresh_token: 'refresh-secret', token_type: 'Bearer', expires_in: 0 })
        if (holdExchange) { held = answer; return }
        return answer()
      }
      json({ ok: true })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const source: SourceOAuthIdentity = { sourceId: 'source-a', revision: 1, url: `${origin}/mcp` }
  const revisions = new Map([['source-a', 1], ['source-b', 1]])
  const optionsForOAuth = { secrets: { get: async (id: string) => vault.get(id), set: async (id: string, value: string) => { vault.set(id, value) }, delete: async (id: string) => { vault.delete(id) } }, validateSource: async (id: string, revision: number, url: string) => { if (revisions.get(id) !== revision || url !== source.url) throw new Error('source-changed') }, timeoutMs: options.timeoutMs ?? 5000 }
  const oauth = new SourceOAuth(optionsForOAuth)
  cleanup.push(() => oauth.close())
  const begin = async (input: Partial<SourceOAuthIdentity> & { requestId?: string } = {}) => {
    const started = await oauth.start({ ...source, requestId: 'request-a', ...input })
    expect(started.status, started.error).toBe('authorizing')
    const url = new URL(started.url!)
    return { started, url, callback: new URL(url.searchParams.get('redirect_uri')!), state: url.searchParams.get('state')! }
  }
  const finish = async (input: Awaited<ReturnType<typeof begin>>) => {
    input.callback.searchParams.set('state', input.state); input.callback.searchParams.set('code', 'authorization-code-secret')
    return fetch(input.callback)
  }
  return { oauth, vault, requests, source, revisions, optionsForOAuth, begin, finish, origin, rejectRefresh: () => { rejectRefresh = true }, holdExchange: () => { holdExchange = true }, release: () => { held?.() } }
}

it('uses SDK PKCE with an actual loopback callback and keeps secrets out of DTOs', async () => {
  const f = await fixture(), pending = await f.begin()
  const original = f.requests.length
  expect(await f.oauth.start({ ...f.source, requestId: 'request-a' })).toEqual(pending.started)
  expect(f.requests.length).toBe(original)
  expect(pending.callback.hostname).toBe('127.0.0.1')
  expect(pending.callback.pathname).toMatch(/^\/oauth\/callback\/[a-f0-9]+$/)
  expect(pending.url.searchParams.get('code_challenge_method')).toBe('S256')
  expect((await f.finish(pending)).status).toBe(200)
  const exchange = f.requests.find(request => request.path === '/token')!.params!
  expect(createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url')).toBe(pending.url.searchParams.get('code_challenge'))
  expect(exchange.get('redirect_uri')).toBe(pending.url.searchParams.get('redirect_uri'))
  expect(await f.oauth.status(pending.started.authorizationId)).toMatchObject({ status: 'authorized' })
  expect(JSON.stringify(await f.oauth.status(pending.started.authorizationId))).not.toMatch(/access-secret|refresh-secret|authorization-code-secret|code_verifier|state|client_id/)
  expect(await f.oauth.hasCredential(f.source)).toBe(true)
  expect([...f.vault.values()].filter(value => JSON.parse(value).authorizationId).every(value => !/access-secret|refresh-secret|verifier|authorizationUrl/.test(value))).toBe(true)
})

it('rejects another consent state without consuming either request', async () => {
  const f = await fixture(), a = await f.begin(), b = await f.begin({ sourceId: 'source-b', requestId: 'request-b' })
  a.callback.searchParams.set('state', b.state); a.callback.searchParams.set('code', 'code')
  expect((await fetch(a.callback)).status).toBe(400)
  expect((await f.oauth.status(a.started.authorizationId)).status).toBe('authorizing')
  expect(f.requests.filter(request => request.path === '/token')).toHaveLength(0)
  expect((await f.finish(b)).status).toBe(200)
  expect(await f.oauth.hasCredential(f.source)).toBe(false)
  expect(await f.oauth.hasCredential({ ...f.source, sourceId: 'source-b' })).toBe(true)
})

it('cancels a consent and rejects late callbacks and same request replay', async () => {
  const f = await fixture(), a = await f.begin()
  expect((await f.oauth.cancel(a.started.authorizationId)).status).toBe('cancelled')
  await expect(f.oauth.complete(a.started.authorizationId, { state: a.state, code: 'late' })).rejects.toThrow('失效')
  expect((await f.oauth.start({ ...f.source, requestId: 'request-a' })).status).toBe('cancelled')
  expect(await f.oauth.hasCredential(f.source)).toBe(false)
  expect([...f.vault.values()].every(value => !JSON.parse(value).state && !JSON.parse(value).verifier)).toBe(true)
})

it('rejects changed source revisions before exchanging an authorization code', async () => {
  const f = await fixture(), a = await f.begin()
  f.revisions.set(f.source.sourceId, 2)
  expect((await f.finish(a)).status).toBe(400)
  expect((await f.oauth.status(a.started.authorizationId)).status).toBe('failed')
  expect(f.requests.filter(request => request.path === '/token')).toHaveLength(0)
  expect(await f.oauth.hasCredential({ ...f.source, revision: 2 })).toBe(false)
})

it('expires a pending consent and refuses process-restart replay', async () => {
  const f = await fixture({ timeoutMs: 100 }), a = await f.begin()
  await new Promise(resolve => setTimeout(resolve, 150))
  expect((await f.oauth.status(a.started.authorizationId)).status).toBe('expired')
  const restarted = new SourceOAuth(f.optionsForOAuth); cleanup.push(() => restarted.close())
  expect((await restarted.start({ ...f.source, requestId: 'request-a' })).status).toBe('expired')
})

it('refreshes expired tokens without consent and keeps the original refresh token', async () => {
  const f = await fixture(), a = await f.begin()
  await f.finish(a)
  const count = f.requests.filter(request => request.path === '/register').length
  const provider = await f.oauth.authProvider(f.source)
  expect(await provider.tokens()).toMatchObject({ access_token: 'refreshed-access-secret', refresh_token: 'refresh-secret' })
  expect(f.requests.filter(request => request.path === '/register')).toHaveLength(count)
  await expect(provider.redirectToAuthorization(new URL(`${f.origin}/authorize`))).rejects.toThrow('AUTHORIZATION_REQUIRED')
})

it('invalid refresh requires explicit consent and never exposes upstream details', async () => {
  const f = await fixture(), a = await f.begin()
  await f.finish(a); f.rejectRefresh()
  await expect(f.oauth.authProvider(f.source)).rejects.toThrow('AUTHORIZATION_REQUIRED')
  expect(await f.oauth.hasCredential(f.source)).toBe(false)
  expect(f.requests.filter(request => request.path === '/register')).toHaveLength(1)
})

it('ordinary use cannot initiate consent and cross-origin bearer requests are refused', async () => {
  const f = await fixture()
  await expect(f.oauth.authProvider(f.source)).rejects.toThrow('AUTHORIZATION_REQUIRED')
  expect(f.requests).toHaveLength(0)
  const a = await f.begin(); await f.finish(a)
  await expect(f.oauth.transportFetch(f.source)('https://elsewhere.example/token', { headers: { authorization: 'Bearer access-secret' } })).rejects.toThrow()
  await f.oauth.disconnect(f.source)
  expect(await f.oauth.hasCredential(f.source)).toBe(false)
  await expect(f.oauth.authProvider(f.source)).rejects.toThrow('AUTHORIZATION_REQUIRED')
})

it('requires a real Vercel client identity before any request and never borrows another client', async () => {
  let calls = 0
  const f = await fixture()
  const oauth = new SourceOAuth({ ...f.optionsForOAuth, validateSource: async () => {}, fetch: async () => { calls++; throw new Error('unexpected') } })
  cleanup.push(() => oauth.close())
  await expect(oauth.start({ sourceId: 'vercel', revision: 1, requestId: 'vercel-request', url: 'https://mcp.vercel.com' })).rejects.toThrow('CLIENT_REGISTRATION_REQUIRED')
  expect(calls).toBe(0)
})

it('does not save a late token response after cancellation during the exchange', async () => {
  const f = await fixture(), a = await f.begin()
  f.holdExchange()
  const completing = f.oauth.complete(a.started.authorizationId, { state: a.state, code: 'code' })
  await expect.poll(() => f.requests.filter(request => request.path === '/token').length).toBe(1)
  await f.oauth.cancel(a.started.authorizationId); f.release()
  expect((await completing).status).toBe('cancelled')
  expect(await f.oauth.hasCredential(f.source)).toBe(false)
  expect([...f.vault.values()].join('\n')).not.toMatch(/access-secret|refresh-secret|code_verifier/)
})

it('coalesces simultaneous proactive refresh for the same expired grant', async () => {
  const f = await fixture(), a = await f.begin()
  await f.finish(a)
  const [first, second] = await Promise.all([f.oauth.authProvider(f.source), f.oauth.authProvider(f.source)])
  expect(await first.tokens()).toEqual(await second.tokens())
  expect(f.requests.filter(request => request.params?.get('grant_type') === 'refresh_token')).toHaveLength(1)
})

it('a new runtime expires an abandoned authorization instead of reviving its callback', async () => {
  const f = await fixture(), a = await f.begin()
  const restarted = new SourceOAuth(f.optionsForOAuth); cleanup.push(() => restarted.close())
  expect((await restarted.start({ ...f.source, requestId: 'request-a' })).status).toBe('expired')
  await expect(f.oauth.complete(a.started.authorizationId, { state: a.state, code: 'late' })).rejects.toThrow('失效')
  expect(await restarted.hasCredential(f.source)).toBe(false)
})

it('supports explicit CIMD and only allows the discovered cross-origin token endpoint', async () => {
  const values = new Map<string, string>(), calls: { url: string; authorization: string | null }[] = []
  const identity = { sourceId: 'cross-origin', revision: 1, url: 'https://resource.example/mcp' }
  const oauth = new SourceOAuth({
    secrets: { get: async key => values.get(key), set: async (key, value) => { values.set(key, value) }, delete: async key => { values.delete(key) } },
    validateSource: async () => {},
    fetch: async (input, init) => {
      const url = String(input); calls.push({ url, authorization: new Headers(init?.headers).get('authorization') })
      if (url.includes('/.well-known/oauth-protected-resource')) return Response.json({ resource: identity.url, authorization_servers: ['https://auth.example'] })
      if (url === 'https://auth.example/.well-known/oauth-authorization-server') return Response.json({ issuer: 'https://auth.example', authorization_endpoint: 'https://auth.example/authorize', token_endpoint: 'https://auth.example/token', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: true, token_endpoint_auth_methods_supported: ['none'] })
      if (url === 'https://auth.example/token') return Response.json({ access_token: 'cross-access-secret', token_type: 'Bearer', expires_in: 3600 })
      throw new Error('unexpected destination')
    },
  })
  cleanup.push(() => oauth.close())
  const start = await oauth.start({ ...identity, requestId: 'cimd', clientMetadataUrl: 'https://client.example/boai.json' })
  expect(start.status, start.error).toBe('authorizing')
  const authorization = new URL(start.url!)
  expect(authorization.searchParams.get('client_id')).toBe('https://client.example/boai.json')
  expect((await oauth.complete(start.authorizationId, { code: 'code', state: authorization.searchParams.get('state')! })).status).toBe('authorized')
  expect(calls.some(call => call.url === 'https://auth.example/token')).toBe(true)
  const transportFetch = oauth.transportFetch(identity)
  await expect(transportFetch('https://auth.example/token', { method: 'POST', headers: { authorization: 'Bearer cross-access-secret' } })).rejects.toThrow('另一地址')
  await expect(transportFetch('https://auth.example/other', { method: 'POST' })).rejects.toThrow('不属于')
  expect(calls.every(call => !call.authorization)).toBe(true)
})

it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'http://external.example/authorize', 'https://user:password@auth.example/authorize', 'file:///tmp/authorize'])('rejects unsafe authorization redirect metadata: %s', async endpoint => {
  const vault = new Map<string, string>()
  const oauth = new SourceOAuth({
    secrets: { get: async key => vault.get(key), set: async (key, value) => { vault.set(key, value) }, delete: async key => { vault.delete(key) } },
    validateSource: async () => {}, clientInformation: { client_id: 'boai-controlled-client' },
    fetch: async input => String(input).includes('oauth-protected-resource')
      ? Response.json({ resource: 'https://resource.example/mcp', authorization_servers: ['https://auth.example'] })
      : Response.json({ issuer: 'https://auth.example', authorization_endpoint: endpoint, token_endpoint: 'https://auth.example/token', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] }),
  })
  cleanup.push(() => oauth.close())
  const result = await oauth.start({ sourceId: 'unsafe-url', revision: 1, url: 'https://resource.example/mcp', requestId: 'redirect' })
  expect(result.status).toBe('failed')
  expect(result.url).toBeUndefined()
  expect(JSON.stringify(result)).not.toContain(endpoint)
})

it('versioned disconnect rejects stale authority while post-commit host cleanup forgets only that source', async () => {
  const f = await fixture(), a = await f.begin(), b = await f.begin({ sourceId: 'source-b', requestId: 'b' })
  await f.finish(a); await f.finish(b)
  f.revisions.set('source-a', 2)
  await expect(f.oauth.disconnect(f.source)).rejects.toThrow('source-changed')
  expect([...f.vault.values()].map(value => JSON.parse(value)).some(value => value.sourceId === 'source-a' && value.tokens)).toBe(true)
  await f.oauth.forgetSource('source-a')
  expect([...f.vault.values()].map(value => JSON.parse(value)).some(value => value.sourceId === 'source-a' && value.tokens)).toBe(false)
  expect(await f.oauth.hasCredential({ ...f.source, sourceId: 'source-b' })).toBe(true)
})

it('shutdown refuses a queued consent before it opens a listener or contacts the provider', async () => {
  const f = await fixture()
  const starting = f.oauth.start({ ...f.source, requestId: 'start-during-close' })
  const rejected = expect(starting).rejects.toThrow('退出')
  await f.oauth.close()
  await rejected
  expect(f.requests).toHaveLength(0)
  expect(f.vault.size).toBe(0)
})
