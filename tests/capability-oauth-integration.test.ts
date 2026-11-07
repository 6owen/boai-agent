/*
 * [INPUT]: Original SourceService/SourceOAuth, real SQLite and local OAuth plus MCP HTTP endpoints.
 * [OUTPUT]: Source authorization projection, bound-version retention, failure rollback, package call denial and token redaction.
 * [POS]: WT2 source integration checks; no browser, personal profile or external account.
 * [PROTOCOL]: Changes must update this Header and tests/.folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { SourceService } from '../packages/runtime/src/modules/sources/source-service'
import type { DataSource, DataSourceConfig } from '../packages/shared/src/domain/sources'
import type { DigitalAgent } from '../packages/shared/src/domain'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-wt2-oauth-source-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'source.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), calls: string[] = []
  const sessions = new Map<string, StreamableHTTPServerTransport>(), servers = new Set<Server>()
  let origin = '', rejectRefresh = false, tokenLifetime = 3600
  const server = createServer((request, response) => { void (async () => {
    const path = new URL(request.url!, origin).pathname; calls.push(path)
    const json = (value: unknown, code = 200) => response.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (path.startsWith('/.well-known/oauth-protected-resource')) { json({ resource: `${origin}/mcp`, authorization_servers: [origin] }); return }
    if (path === '/.well-known/oauth-authorization-server') { json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] }); return }
    if (path === '/register' || path === '/token') {
      let raw = ''; for await (const chunk of request) raw += chunk.toString()
      if (path === '/register') { json({ ...JSON.parse(raw), client_id: 'boai-source-fixture' }, 201); return }
      const params = new URLSearchParams(raw)
      if (params.get('grant_type') === 'refresh_token' && rejectRefresh) { json({ error: 'invalid_grant', error_description: 'do-not-leak-upstream-body' }, 400); return }
      json({ access_token: 'source-access-secret', refresh_token: 'source-refresh-secret', token_type: 'Bearer', expires_in: tokenLifetime }); return
    }
    if (path !== '/mcp') { json({}, 404); return }
    if (request.headers.authorization !== 'Bearer source-access-secret') { json({ error: 'unauthorized' }, 401); return }
    const session = request.headers['mcp-session-id']
    let transport = typeof session === 'string' ? sessions.get(session) : undefined
    if (!transport && request.method === 'POST') {
      const mcp = new Server({ name: 'boai-controlled-oauth', version: '1.0.0' }, { capabilities: { tools: {} } }); servers.add(mcp)
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: id => { sessions.set(id, transport!) }, onsessionclosed: id => { sessions.delete(id) } })
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'echo', description: 'Controlled echo', inputSchema: { type: 'object' } }] }))
      mcp.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'source-access-secret source-refresh-secret' }] }))
      await mcp.connect(transport)
    }
    if (!transport) { json({}, 404); return }
    await transport.handleRequest(request, response)
  })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end('controlled failure') }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  cleanups.push(async () => { await Promise.all([...servers].map(value => value.close())); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const source = new SourceService(store, { get: async key => vault.get(key), set: async (key, value) => { vault.set(key, value) }, delete: async key => { vault.delete(key) } }, root, { critical: action => action(), install: () => {}, changed: async () => {} })
  await source.init(); cleanups.push(() => source.close())
  const config: DataSourceConfig = { name: 'OAuth fixture', description: '', guide: '', enabled: true, type: 'mcp', mcp: { transport: 'http', url: `${origin}/mcp`, authType: 'oauth' } }
  const authorize = async (value: DataSource) => {
    const start = await source.oauth.start({ ...source.oauthIdentity(value.id, value.revision), requestId: randomUUID() })
    expect(start.status, start.error).toBe('authorizing')
    const consent = new URL(start.url!), callback = new URL(consent.searchParams.get('redirect_uri')!)
    callback.searchParams.set('state', consent.searchParams.get('state')!); callback.searchParams.set('code', 'source-code')
    expect((await fetch(callback)).status).toBe(200)
    expect((await source.oauthStatus(start.authorizationId)).status).toBe('authorized')
    return start.authorizationId
  }
  const save = () => source.save({ id: randomUUID(), expectedRevision: 0, config })
  const employee: DigitalAgent = { id: 'employee', name: 'Employee', role: '', instructions: '', color: '#112233', executionBackend: { kind: 'mastra-model' }, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: false, active: true, configVersion: 1 }
  await store.write([{ collection: 'agents', id: employee.id, value: employee }])
  return { source, store, vault, calls, config, save, authorize, employee, expireTokens: () => { tokenLifetime = 0 }, rejectRefresh: () => { rejectRefresh = true } }
}

it('connects through original SourceService OAuth and redacts tokens echoed by the MCP server', async () => {
  const f = await fixture(), source = await f.save()
  const ref = f.source.summaries([source.id])[0]
  await expect(f.source.use(ref, 'before-consent', AbortSignal.timeout(5000))).rejects.toThrow('OAuth 数据源连接或调用失败，请核对授权')
  await f.source.closeRun('before-consent')
  expect(f.calls).toHaveLength(0)
  await f.authorize(source)
  expect(f.source.get(source.id).hasCredential).toBe(true)
  expect(JSON.stringify(f.source.list())).not.toMatch(/source-access-secret|source-refresh-secret|oauthRevision/)
  const result = await f.source.use(ref, 'authorized', AbortSignal.timeout(5000), { sourceId: source.id, tool: 'echo', arguments: {} })
  expect(JSON.stringify(result)).toContain('[redacted]')
  expect(JSON.stringify(result)).not.toMatch(/source-access-secret|source-refresh-secret/)
  await expect(f.source.getCredential({ id: source.id, expectedRevision: source.revision })).rejects.toThrow('不能')
})

it('retains OAuth authorization when employee bindings advance the Source revision', async () => {
  const f = await fixture(), source = await f.save(); await f.authorize(source)
  const bound = await f.source.bind({ id: source.id, expectedRevision: source.revision, agents: [{ id: f.employee.id, expectedConfigVersion: 1 }], expectedBindings: [] })
  expect(bound.revision).toBe(source.revision + 1)
  expect(bound.hasCredential).toBe(true)
  expect(await f.source.oauth.hasCredential(f.source.oauthIdentity(bound.id, bound.revision))).toBe(true)
  const result = await f.source.use(f.source.summaries([bound.id], f.employee.id)[0], 'bound', AbortSignal.timeout(5000), undefined, undefined, 'all', undefined, f.employee.id)
  expect(result).toHaveProperty('tools')
})

it('failed source mutation preserves its previously authorized grant', async () => {
  const f = await fixture(), source = await f.save(); await f.authorize(source)
  let validations = 0
  await expect(f.source.save({ id: source.id, expectedRevision: source.revision, config: { ...f.config, description: 'uncommitted edit' } }, undefined, async () => { if (++validations === 2) throw new Error('controlled commit rejection') })).rejects.toThrow('controlled commit rejection')
  expect(f.source.get(source.id).revision).toBe(source.revision)
  expect(await f.source.oauth.hasCredential(f.source.oauthIdentity(source.id, source.revision))).toBe(true)
})

it('package OAuth sources reject an unbound bobo before any OAuth or MCP network request', async () => {
  const f = await fixture(), origin = { installationId: 'installation', contributionId: 'source-contribution', version: 'a'.repeat(64) }
  f.source.setCapabilityGate({ canUse: (_origin, employeeId) => employeeId === 'bound', acquire: () => () => {} })
  const source = await f.source.saveManaged({ id: randomUUID(), expectedRevision: 0, config: f.config }, origin)
  expect(f.source.allSummaries('bobo')).toHaveLength(0)
  await expect(f.source.use({ id: source.id, name: source.name, type: source.type, description: source.description, revision: source.revision }, 'unbound', AbortSignal.timeout(5000), undefined, undefined, 'all', undefined, 'bobo')).rejects.toThrow('未绑定')
  expect(f.calls).toHaveLength(0)
  await f.authorize(source)
  expect(f.source.summaries([source.id], 'bound')).toHaveLength(1)
  expect(f.source.summaries([source.id], 'bobo')).toHaveLength(0)
})

it('invalid refresh clears current credential availability without exposing the token error', async () => {
  const f = await fixture(), source = await f.save(); f.expireTokens(); const authorizationId = await f.authorize(source)
  expect(f.source.get(source.id).hasCredential).toBe(true)
  f.rejectRefresh()
  await expect(f.source.use(f.source.summaries([source.id])[0], 'expired', AbortSignal.timeout(5000))).rejects.toThrow('OAuth 数据源连接或调用失败，请核对授权')
  await f.source.closeRun('expired')
  await f.source.oauthStatus(authorizationId)
  expect(f.source.get(source.id).hasCredential).toBe(false)
  expect(JSON.stringify(f.source.list())).not.toContain('do-not-leak-upstream-body')
})
