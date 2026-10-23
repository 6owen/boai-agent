/*
 * [OUTPUT]: DeepSeek固定POST原JSON协议供同一宿主三权限矩阵使用；仅受控HTTP、外部请求0。
 * [INPUT]: Captured official Tavily/Exa tool catalogs and explicitly controlled MCP responses.
 * [OUTPUT]: Isolated multi-session selected-provider MCP with observed calls and broadcast catalog changes; separate employees/turns retain distinct SDK sessions, zero external requests.
 * [POS]: Shared search protocol fixture for source and host integration tests.
 * [PROTOCOL]: 变化同步 Header 与 tests/fixtures/.folder.md。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export const webSourceConfig = { name: 'Search fixture', description: '', guide: '', enabled: true, type: 'mcp' as const, mcp: { transport: 'http' as const, url: 'https://mcp.tavily.com/mcp/', authType: 'none' as const } }
export const resultUrl = 'https://docs.example.test/orion'
export const pageText = 'Controlled fixture: Orion launches Friday.'
export function webResult(name: string): CallToolResult {
  const structuredContent = { results: [{ url: resultUrl, ...(name === 'tavily_search' ? { title: 'Orion', content: 'Orion launch schedule' } : { raw_content: pageText }) }] }
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: false }
}

export async function webSearchServer(respond: (name: string, args: Record<string, unknown>) => Promise<CallToolResult> = async name => webResult(name), provider: 'tavily' | 'exa' = 'tavily') {
  const catalog = JSON.parse(await readFile(new URL(provider === 'exa' ? './exa-catalog.json' : './tavily-catalog.json', import.meta.url), 'utf8'))
  const calls: { name: string; arguments: Record<string, unknown> }[] = []
  let inspections = 0
  const sessions = new Map<string, StreamableHTTPServerTransport>(), servers = new Set<Server>()
  const create = async () => {
    const server = new Server(catalog.serverInfo, { capabilities: { tools: { listChanged: true } } }); servers.add(server)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: id => { sessions.set(id, transport) }, onsessionclosed: id => { sessions.delete(id); servers.delete(server) } })
    server.setRequestHandler(ListToolsRequestSchema, async () => { inspections++; return catalog.catalog })
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const call = { name: request.params.name, arguments: request.params.arguments ?? {} }
      calls.push(call)
      return respond(call.name, call.arguments)
    })
    await server.connect(transport); return transport
  }
  const http = createServer((req, res) => { void (async () => {
    const id = req.headers['mcp-session-id'], transport = typeof id === 'string' ? sessions.get(id) : req.method === 'POST' ? await create() : undefined
    if (!transport) { res.writeHead(404); res.end('Unknown fixture session'); return }
    await transport.handleRequest(req, res)
  })().catch(error => { if (!res.headersSent) res.writeHead(500); res.end(String(error)) }) })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const local = `http://127.0.0.1:${(http.address() as { port: number }).port}`
  const original = globalThis.fetch
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin === (provider === 'exa' ? 'https://mcp.exa.ai' : 'https://mcp.tavily.com')) {
      const target = local + url.pathname
      return original(input instanceof Request ? new Request(target, input) : target, init)
    }
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Unexpected external test request')
    return original(input, init)
  })
  let closed = false
  return {
    calls, catalog, get inspections() { return inspections }, get activeSessions() { return sessions.size },
    changed: () => Promise.all([...servers].map(server => server.notification({ method: 'notifications/tools/list_changed' }))),
    async close() {
      if (closed) return; closed = true
      try { await Promise.all([...servers].map(server => server.close())); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) }
      finally { fetch.mockRestore() }
    },
  }
}

export const deepSeekSourceConfig = { name: 'DeepSeek fixture', description: '', guide: '', enabled: true, type: 'api' as const, api: { baseUrl: 'https://api.deepseek.com', authType: 'bearer' as const, testPath: '/' } }
/** Same real host integration boundary as MCP, with the selected provider's raw JSON protocol. */
export async function deepSeekSearchServer() {
  const calls: { name: string; arguments: Record<string, unknown>; authenticated: boolean }[] = []
  const http = createServer((req, res) => { void (async () => {
    let body = ''; for await (const part of req) body += part.toString()
    if (req.method !== 'POST' || !['/v1/tools/search', '/v1/tools/fetch'].includes(req.url!)) throw new Error('Unexpected endpoint')
    const name = req.url!.endsWith('/search') ? 'deepseek_search' : 'deepseek_fetch'
    calls.push({ name, arguments: JSON.parse(body), authenticated: req.headers.authorization === 'Bearer fixture-search-secret' })
    const result = name === 'deepseek_search' ? { results: [{ rerank_score: 2, title: 'Orion', url: resultUrl, snippet: pageText, summary: pageText, content: '', site_name: null, site_icon: null, date: null, authority: 3 }] } : { title: 'Orion', content: pageText }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result))
  })().catch(() => { res.writeHead(500); res.end('{}') }) })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const local = `http://127.0.0.1:${(http.address() as { port: number }).port}`, original = globalThis.fetch
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input)); if (url.origin !== 'https://api.deepseek.com') throw new Error('Unexpected external test request')
    return original(local + url.pathname, init)
  })
  return { calls, async close() { try { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) } finally { fetch.mockRestore() } } }
}
