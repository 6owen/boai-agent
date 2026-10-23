/*
 * [OUTPUT]: 普通问答仅核准搜索/正文，拒绝本地/未知工具；目录变化阻止旧工具及迟到响应。
 * [OUTPUT]: 未核准MCP提示不放宽权限；实际HTTP协议重放官方额度响应，核准搜索按只读门禁且业务失败不冒充成功。
 * [OUTPUT]: 验证退休权限字段迁移保留身份/版本/凭据，API与本地授权读写及目录/hash边界。
 * [OUTPUT]: 新增会话三种配置、凭据隔离、提交后未知重试/重启/删除不复活/撤权拒绝。
 * [INPUT]: Real SQLite/vault fixtures, HTTP server, local files and supervised MCP processes.
 * [OUTPUT]: Credential isolation, contained reads/writes, revisions, persistence and actual shutdown checks.
 * [POS]: Source module protocol tests; no external account or model certification.
 * [PROTOCOL]: 变化同步 Header 与 tests/.folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, realpath, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { sourceCreationCommands } from '../src/runtime/modules/sources/source-commands'
import { SourceService } from '../src/runtime/modules/sources/source-service'
import { openSourceSession, redactSourceValue } from '../src/runtime/modules/sources/source-provider'
import { type DataSource, type DataSourceConfig } from '../src/shared/domain/sources'
import type { DigitalAgent } from '../src/shared/domain'
import { webSearchServer, webSourceConfig, webResult, pageText, resultUrl } from './fixtures/web-search-server'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const base = { name: 'fixture', description: 'test source', guide: 'Use actual tools.', enabled: true }
const signal = () => AbortSignal.timeout(15000)
async function folder() { const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-source-'))); cleanups.push(() => rm(root, { recursive: true, force: true })); return root }
async function http(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
function dto(config: DataSourceConfig): DataSource { return { ...config, id: randomUUID(), revision: 1, createdAt: '', updatedAt: '', hasCredential: false } }

it('migrates legacy source read-only flags without changing connection identity or contacting the service', async () => {
  const f = await fixture()
  const local = { ...dto({ ...base, type: 'local', local: { path: f.root } }), local: { path: f.root, accessMode: 'read' }, credentialId: undefined }
  const api = { ...dto({ ...base, type: 'api', api: { baseUrl: 'http://127.0.0.1:9', authType: 'bearer', testPath: '/' } }), api: { baseUrl: 'http://127.0.0.1:9', authType: 'bearer', testPath: '/', allowWrites: false }, credentialId: 'legacy-secret' }
  await f.store.write([local, api].map(({ hasCredential: _hasCredential, ...source }) => ({ collection: 'dataSources', id: source.id, value: source })))
  f.vault.set('legacy-secret', 'saved-secret')
  await f.service.close()
  const restored = new SourceService(f.store, f.secrets, f.root, f.hooks); cleanups.push(() => restored.close()); await restored.init()
  expect(restored.get(local.id)).toMatchObject({ id: local.id, revision: local.revision, local: { path: f.root } })
  expect(restored.get(local.id)).not.toHaveProperty('local.accessMode')
  expect(restored.get(api.id)).not.toHaveProperty('api.allowWrites')
  expect(restored.get(api.id).hasCredential).toBe(true)
  expect(await restored.getCredential({ id: api.id, expectedRevision: api.revision })).toBe('saved-secret')
  expect(JSON.stringify(await f.store.load('dataSources'))).not.toMatch(/accessMode|allowWrites/)
  expect(f.hooks.changed).not.toHaveBeenCalled()
  await restored.use(restored.summaries([local.id])[0], 'migrated', signal(), { sourceId: local.id, tool: 'files', arguments: { operation: 'write', path: 'after-migration.md', content: 'written', expectedHash: null } })
  expect(await readFile(join(f.root, 'after-migration.md'), 'utf8')).toBe('written')
})
async function fixture() {
  const root = await folder(), store = new ProductStore(join(root, 'data.sqlite')); await store.init(); cleanups.push(() => store.close())
  const vault = new Map<string, string>(), secrets = { get: async (id: string) => vault.get(id), set: async (id: string, value: string) => { vault.set(id, value) }, delete: async (id: string) => { vault.delete(id) } }
  const changed = vi.fn(async () => {}), install = vi.fn(), hooks = { critical: <T,>(action: () => Promise<T>) => action(), changed, install }
  const service = new SourceService(store, secrets, root, hooks); await service.init(); cleanups.push(() => service.close())
  const save = (config: DataSourceConfig, credential?: string) => service.save({ id: randomUUID(), expectedRevision: 0, config, credential })
  return { root, store, vault, secrets, hooks, service, save }
}
const agent = (id: string): DigitalAgent => ({ id, name: id, role: '', instructions: '', color: '#888888', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })

describe('data sources', () => {
  it.each(['bearer', 'header', 'query', 'basic'] as const)('retains Craft %s authentication and redacts credentials from results', async authType => {
    const calls: { auth?: string; key?: string; url?: string }[] = []
    const baseUrl = await http((req, res) => { calls.push({ auth: req.headers.authorization, key: req.headers['x-api-key'] as string, url: req.url }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ auth: req.headers.authorization, key: req.headers['x-api-key'], url: req.url })) })
    const credential = authType === 'basic' ? JSON.stringify({ username: 'fixture-user', password: 'private-password' }) : 'private-token-value'
    const source = dto({ ...base, type: 'api', api: { baseUrl: baseUrl + '/v1', authType, headerName: 'X-API-Key', queryParam: 'token', testPath: '/health' } })
    const session = await openSourceSession(source, credential, await folder(), signal())
    const result = JSON.stringify(await session.call('request', { path: '/health', params: { name: 'hello' } }, signal()))
    expect(calls).toHaveLength(1); expect(calls[0].url).toContain('/v1/health')
    if (authType === 'basic') expect(calls[0].auth).toBe('Basic ' + Buffer.from('fixture-user:private-password').toString('base64'))
    if (authType === 'bearer') expect(calls[0].auth).toBe('Bearer private-token-value')
    if (authType === 'header') expect(calls[0].key).toBe('private-token-value')
    if (authType === 'query') expect(calls[0].url).toContain('token=private-token-value')
    expect(result).not.toContain('private-token-value'); expect(result).not.toContain('private-password'); expect(result).not.toContain(Buffer.from('fixture-user:private-password').toString('base64'))
    expect(result).toContain('[redacted]'); await session.close()
  })
  it('allows API write methods while rejecting escaped endpoints, redirects and oversized bodies', async () => {
    const paths: string[] = []
    const url = await http((req, res) => { paths.push(req.url!); if (req.url === '/v1/redirect') { res.writeHead(302, { Location: '/outside' }); res.end() } else if (req.url === '/v1/edit') res.end('saved'); else res.end('x'.repeat(4 * 1024 * 1024 + 1)) })
    const session = await openSourceSession(dto({ ...base, type: 'api', api: { baseUrl: url + '/v1', authType: 'none', testPath: '/' } }), '', await folder(), signal())
    for (const path of ['../escape', '%2e%2e/escape', 'http://evil.test', '//evil.test', '/..\\escape']) await expect(session.call('request', { path }, signal())).rejects.toThrow()
    expect(paths).toEqual([])
    expect(await session.call('request', { path: '/edit', method: 'POST' }, signal())).toMatchObject({ status: 200, content: 'saved' })
    await expect(session.call('request', { path: '/redirect' }, signal())).rejects.toThrow()
    await expect(session.call('request', { path: '/large' }, signal())).rejects.toThrow()
    expect(paths).toEqual(['/v1/edit', '/v1/redirect', '/v1/large'])
  })
  it('reads local pages and requires current hashes for writes, rejecting traversal and symbolic links', async () => {
    const root = await folder(), outside = await folder(); await writeFile(join(root, 'readme.md'), 'source text'); await writeFile(join(outside, 'private.md'), 'private'); await symlink(join(outside, 'private.md'), join(root, 'link.md'))
    const source = dto({ ...base, type: 'local', local: { path: root } })
    const read = await openSourceSession(source, '', root, signal())
    expect(await read.call('files', { operation: 'read', path: 'readme.md', limit: 6 }, signal())).toMatchObject({ content: 'source', truncated: true })
    for (const path of ['../private.md', 'link.md', join(outside, 'private.md')]) await expect(read.call('files', { operation: 'read', path }, signal())).rejects.toThrow()
    const write = await openSourceSession({ ...source, type: 'local', local: { path: root } }, '', root, signal())
    const content = await write.call('files', { operation: 'read', path: 'readme.md' }, signal()) as { contentHash: string }
    await writeFile(join(root, 'readme.md'), 'external change')
    await expect(write.call('files', { operation: 'write', path: 'readme.md', content: 'overwrite', expectedHash: content.contentHash }, signal())).rejects.toThrow()
    await write.call('files', { operation: 'write', path: 'new.md', content: 'new', expectedHash: null }, signal())
    expect(await readFile(join(root, 'new.md'), 'utf8')).toBe('new')
    await expect(write.call('files', { operation: 'write', path: 'new.md', content: 'again', expectedHash: null }, signal())).rejects.toThrow()
  })
  it('persists definitions and grants atomically; preserves secrets and rejects stale employee removal', async () => {
    const f = await fixture(); await f.store.write(['one', 'two'].map(id => ({ collection: 'agents', id, value: agent(id) })))
    let source = await f.save({ ...base, type: 'api', api: { baseUrl: 'http://localhost:9999/v1', authType: 'bearer', testPath: '/' } }, 'vault-only-secret')
    expect(JSON.stringify(source)).not.toContain('vault-only-secret'); expect(source.hasCredential).toBe(true)
    expect(JSON.stringify(await f.store.load('dataSources'))).not.toContain('vault-only-secret')
    source = await f.service.bind({ id: source.id, expectedRevision: source.revision, agents: [{ id: 'one', expectedConfigVersion: 1 }], expectedBindings: [] })
    expect(await f.store.get('agents', 'one')).toMatchObject({ sourceIds: [source.id], configVersion: 2 })
    await f.store.write([{ collection: 'agents', id: 'two', value: { ...agent('two'), sourceIds: [source.id], configVersion: 2 } }])
    await expect(f.service.bind({ id: source.id, expectedRevision: source.revision, agents: [], expectedBindings: [{ id: 'one', expectedConfigVersion: 2 }] })).rejects.toThrow('绑定已变化')
    await expect(f.service.save({ id: source.id, expectedRevision: 0, config: { ...base, type: 'local', local: { path: f.root } } })).rejects.toThrow('已变化')
    await f.service.close()
    const reopened = new SourceService(f.store, f.secrets, f.root, f.hooks); await reopened.init(); cleanups.push(() => reopened.close())
    expect(reopened.list()).toEqual([source]); expect(f.vault.size).toBe(1)
    await reopened.remove({ id: source.id, expectedRevision: source.revision }); expect(f.vault.size).toBe(0)
    expect(await f.store.get('agents', 'one')).toMatchObject({ sourceIds: [] }); expect(await f.store.get('agents', 'two')).toMatchObject({ sourceIds: [] })
  })
  it('aborts an actual pending request before revoking and disallows the stale session', async () => {
    let started = false, closed = false
    const url = await http((req, _res) => { started = true; req.on('close', () => { closed = true }) })
    const f = await fixture(), source = await f.save({ ...base, type: 'api', api: { baseUrl: url, authType: 'none', testPath: '/' } })
    const ref = f.service.summaries([source.id])[0]
    const running = f.service.use(ref, 'run', signal(), { sourceId: source.id, tool: 'request', arguments: { path: '/pending' } }).catch(error => error)
    await vi.waitFor(() => expect(started).toBe(true))
    await f.service.remove({ id: source.id, expectedRevision: source.revision })
    expect(await running).toBeInstanceOf(Error); await vi.waitFor(() => expect(closed).toBe(true)); expect(f.service.busy).toBe(false)
    await expect(f.service.use(ref, 'run', signal())).rejects.toThrow('已变化')
  })
  it('redacts structured basic auth as well as encoded tokens', () => {
    expect(redactSourceValue({ token: 'a%2Bb%2Fc', basic: Buffer.from('name:secret').toString('base64') }, JSON.stringify({ username: 'name', password: 'secret' }))).toEqual({ token: 'a%2Bb%2Fc', basic: '[redacted]' })
    expect(redactSourceValue('a%2Bb%2Fc', 'a+b/c')).toBe('[redacted]')
  })
  it.skipIf(process.platform !== 'darwin')('uses actual MCP stdio tools, hides environment secrets and drains detached descendants', async () => {
    const f = await fixture(), pidFile = join(f.root, 'child.pid')
    const source = await f.save({ ...base, type: 'mcp', mcp: { transport: 'stdio', command: process.execPath, args: [resolve('tests/fixtures/source-mcp.mjs')] } }, JSON.stringify({ SOURCE_TOKEN: 'private-mcp-token', SOURCE_PID_FILE: pidFile }))
    const ref = f.service.summaries([source.id])[0], mutating: boolean[] = []
    const catalog = await f.service.use(ref, 'mcp-run', signal()) as { tools: unknown[] }
    expect(catalog.tools).toHaveLength(2)
    const result = await f.service.use(ref, 'mcp-run', signal(), { sourceId: source.id, tool: 'echo', arguments: { value: 'hello' } }, async value => { mutating.push(value) })
    expect(JSON.stringify(result)).toContain('hello'); expect(JSON.stringify(result)).not.toContain('private-mcp-token')
    await f.service.use(ref, 'mcp-run', signal(), { sourceId: source.id, tool: 'write', arguments: {} }, async value => { mutating.push(value) })
    expect(mutating).toEqual([true, true]); const child = Number(await readFile(pidFile, 'utf8'))
    await new Promise(resolve => setTimeout(resolve, 300))
    await f.service.closeRun('mcp-run')
    await vi.waitFor(() => expect(() => process.kill(child, 0)).toThrow(), { timeout: 5000 })
    expect(f.service.busy).toBe(false)
  }, 20000)
})

it.each(['http', 'sse'] as const)('connects to real local MCP %s transport with bearer auth and no credential in tool results', async transport => {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
  const servers: InstanceType<typeof Server>[] = []
  const freshServer = () => {
    const server = new Server({ name: 'source-http-fixture', version: '1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'read', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] }))
    server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'MCP_HTTP_RESULT private-network-token' }] }))
    servers.push(server); return server
  }
  let connected: import('@modelcontextprotocol/sdk/server/sse.js').SSEServerTransport | undefined
  let stream: import('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport | undefined
  let denied = 0
  const url = await http((req, res) => {
    if (req.headers.authorization !== 'Bearer private-network-token') { denied++; res.writeHead(401); res.end(); return }
    void (async () => {
      if (transport === 'http') { if (!req.headers['mcp-session-id']) { stream = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() }); await freshServer().connect(stream) }; await stream!.handleRequest(req, res) }
      else if (req.method === 'GET' && req.url === '/mcp') { connected = new SSEServerTransport('/messages', res); await freshServer().connect(connected) }
      else if (req.method === 'POST' && connected) await connected.handlePostMessage(req, res)
      else { res.writeHead(404); res.end() }
    })().catch(error => { res.writeHead(500); res.end(error.message) })
  })
  cleanups.push(async () => { await Promise.all(servers.map(server => server.close())) })
  const f = await fixture(), source = await f.save({ ...base, type: 'mcp', mcp: { transport, url: url + '/mcp', authType: 'bearer' } }, 'private-network-token')
  const tested = await f.service.test({ id: source.id, expectedRevision: source.revision })
  expect(tested.test?.status).toBe('success'); expect(denied).toBe(0)
  const ref = f.service.summaries([source.id])[0]
  const result = await f.service.use(ref, 'network', signal(), { sourceId: source.id, tool: 'read', arguments: {} })
  expect(JSON.stringify(result)).toContain('MCP_HTTP_RESULT'); expect(JSON.stringify(result)).not.toContain('private-network-token')
  await f.service.closeRun('network')
})

it('classifies official search through the real source service but rejects a quota response marked isError=false', async () => {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
  const catalog = JSON.parse(await readFile(new URL('./fixtures/tavily-catalog.json', import.meta.url), 'utf8'))
  const quota = JSON.parse(await readFile(new URL('./fixtures/tavily-keyless-quota.json', import.meta.url), 'utf8'))
  const server = new Server(catalog.serverInfo, { capabilities: { tools: {} } })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  let calls = 0
  const modes: (string | string[] | undefined)[] = []
  server.setRequestHandler(ListToolsRequestSchema, async () => catalog.catalog)
  server.setRequestHandler(CallToolRequestSchema, async request => { expect(request.params.name).toBe('tavily_search'); calls++; return quota })
  await server.connect(transport)
  const local = await http((req, res) => {
    modes.push(req.headers['x-tavily-access-mode'])
    void transport.handleRequest(req, res).catch(error => { res.writeHead(500); res.end(String(error)) })
  })
  cleanups.push(() => server.close())
  const original = globalThis.fetch
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== 'https://mcp.tavily.com') throw new Error('Unexpected fixture destination')
    const target = local + url.pathname
    return original(input instanceof Request ? new Request(target, input) : target, init)
  })
  cleanups.push(async () => { fetch.mockRestore() })
  const f = await fixture()
  const source = await f.save({ ...base, type: 'mcp', mcp: { transport: 'http', url: 'https://mcp.tavily.com/mcp/', authType: 'none' } })
  const ref = f.service.summaries([source.id])[0], mutating: boolean[] = []
  await expect(f.service.use(ref, 'quota', signal(), { sourceId: source.id, tool: 'tavily_search', arguments: { query: 'public documentation' } }, async value => { mutating.push(value) })).rejects.toThrow('monthly_cap_reached_bonus_eligible')
  expect(calls).toBe(1); expect(mutating).toEqual([false]); expect(modes.every(mode => mode === 'keyless')).toBe(true)
  await f.service.closeRun('quota'); expect(f.service.busy).toBe(false)
})


it('allows verified search and extraction in web chat without exposing crawl, local files or stdio', async () => {
  const server = await webSearchServer(); cleanups.push(() => server.close())
  const f = await fixture(), source = await f.save(webSourceConfig), ref = f.service.summaries([source.id])[0]
  expect(ref.webSearchProvider).toBe('tavily')
  const inspect = await f.service.use(ref, 'web-chat', signal(), undefined, undefined, 'web-read') as { tools: { name: string }[] }
  expect(inspect.tools.map(tool => tool.name).sort()).toEqual(['tavily_extract', 'tavily_search'])
  const before = vi.fn(async (_mutating: boolean) => {})
  for (const tool of ['tavily_crawl', 'tavily_research', 'unknown']) await expect(f.service.use(ref, 'web-chat', signal(), { sourceId: source.id, tool, arguments: {} }, before, 'web-read')).rejects.toThrow()
  expect(before).not.toHaveBeenCalled(); expect(server.calls).toEqual([])
  for (const tool of ['tavily_search', 'tavily_extract']) {
    const result = await f.service.use(ref, 'web-chat', signal(), { sourceId: source.id, tool, arguments: tool === 'tavily_search' ? { query: 'Orion' } : { urls: [resultUrl] } }, before, 'web-read')
    expect(JSON.stringify(result)).toContain(tool === 'tavily_search' ? resultUrl : pageText)
  }
  expect(before.mock.calls.map(([mutating]) => mutating)).toEqual([false, false])
  for (const config of [
    { ...base, type: 'local' as const, local: { path: f.root } },
    { ...base, type: 'mcp' as const, mcp: { transport: 'stdio' as const, command: '/nonexistent-must-not-start', args: [] } },
    { ...base, type: 'api' as const, api: { baseUrl: 'http://127.0.0.1:1', authType: 'none' as const, testPath: '/' } },
  ]) {
    const other = await f.save(config)
    await expect(f.service.use(f.service.summaries([other.id])[0], 'web-chat', signal(), undefined, undefined, 'web-read')).rejects.toThrow('普通问答仅可')
  }
  expect(server.inspections).toBe(1); expect(server.calls).toHaveLength(2)
  await f.service.closeRun('web-chat'); expect(f.service.busy).toBe(false)
})

it('invalidates the inspected catalog and an in-flight result after an actual MCP change notification', async () => {
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  const server = await webSearchServer(async name => { await pending; return webResult(name) }); cleanups.push(() => server.close())
  const session = await openSourceSession(dto(webSourceConfig), '', await folder(), signal()); cleanups.push(() => session.close())
  const result = session.call('tavily_search', { query: 'Orion' }, signal()).catch(error => error)
  await vi.waitFor(() => expect(server.calls).toHaveLength(1))
  await server.changed()
  try { await vi.waitFor(() => expect(() => session.tools).toThrow('目录已变化')) }
  finally { finish() }
  expect(await result).toMatchObject({ message: 'MCP 工具目录已变化，请重新发起查询' })
  await expect(session.call('tavily_search', {}, signal())).rejects.toThrow('目录已变化')
  expect(server.calls).toHaveLength(1); expect(server.inspections).toBe(1)
})

it('rejects duplicate MCP tool identities before any tool call', async () => {
  const server = await webSearchServer(); cleanups.push(() => server.close())
  server.catalog.catalog.tools.push(server.catalog.catalog.tools[0])
  await expect(openSourceSession(dto(webSourceConfig), '', await folder(), signal())).rejects.toThrow('重复名称')
  expect(server.calls).toEqual([])
})

it('creates all source kinds with durable receipts, preserving credentials and rejecting changed, removed or revoked requests', async () => {
  const f = await fixture(), origin = { conversationId: 'source-chat', messageId: 'source-message', agentId: 'bobo' }
  let allowed = true
  const validate = async () => { if (!allowed) throw new Error('source revoked') }
  const create = sourceCreationCommands(f.service, { source: origin, validate })
  const command = { key: 'api', config: { ...base, type: 'api' as const, api: { baseUrl: 'http://127.0.0.1:9/v1', authType: 'bearer' as const, testPath: '/' } }, credential: 'CREATION_SECRET' }
  f.hooks.changed.mockRejectedValueOnce(new Error('lost creation response'))
  await expect(create(command)).rejects.toThrow('lost creation response')
  const saved = await create(command)
  expect(saved).toMatchObject({ creationSource: origin, revision: 1, hasCredential: true })
  expect(f.service.list()).toHaveLength(1)
  expect(JSON.stringify(saved)).not.toContain('CREATION_SECRET')
  expect([...f.vault.values()]).toEqual(['CREATION_SECRET'])
  await expect(create({ ...command, config: { ...command.config, name: 'different' } })).rejects.toThrow('不同')
  const mcp = await create({ key: 'mcp', config: { ...base, type: 'mcp', mcp: { transport: 'stdio', command: 'not-executed', args: ['--example'] } }, credential: '{"TOKEN":"MCP_SECRET"}' })
  const local = await create({ key: 'local', config: { ...base, type: 'local', local: { path: f.root } } })
  expect([saved.type, mcp.type, local.type]).toEqual(['api', 'mcp', 'local'])
  expect(f.service.list().every(source => !source.test)).toBe(true)
  await f.service.close()
  const restored = new SourceService(f.store, f.secrets, f.root, f.hooks); await restored.init(); cleanups.push(() => restored.close())
  const resume = sourceCreationCommands(restored, { source: origin, validate })
  expect((await resume(command)).id).toBe(saved.id)
  expect(restored.list()).toHaveLength(3)
  allowed = false
  await expect(resume(command)).rejects.toThrow('revoked')
  allowed = true
  await restored.remove({ id: saved.id, expectedRevision: saved.revision })
  await expect(resume(command)).rejects.toThrow('不存在')
  expect(restored.list()).toHaveLength(2)
})
