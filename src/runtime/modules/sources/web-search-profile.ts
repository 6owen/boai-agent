/*
 * [OUTPUT]: MCP版本核验仅覆盖实际MCP提供方；DeepSeek固定HTTP工具不套用MCP身份或结果解析。
 * [INPUT]: Configured MCP endpoint, actual server identity and current tool schema.
 * [OUTPUT]: Verified Tavily/Exa search/read capabilities; source/body checks distinguish Exa result headers from Markdown separators inside excerpts.
 * [OUTPUT]: Candidate endpoint detection shares the renderer/host pure contract; actual tool verification remains here.
 * [POS]: Small provider compatibility profile used by the existing source transport, not a second search service.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createHash } from 'node:crypto'
import { webSearchProvider, type DataSource, type SourceTool } from '../../../shared/domain/sources'

// Observed via tools/list on 2026-10-18. See 19/09 §10.1 and the frozen catalog fixture.
const TAVILY_TOOLS = {
  tavily_search: { kind: 'search', hash: 'ade10cd25ff4d2baebc729daeb64ec5c08e95e3cfc22bcb45f33b709c793be93' },
  tavily_extract: { kind: 'read-url', hash: 'cdddb7170ad4bef4f914bc8972836ef887a287f3b699147865fa63250b545e51' },
} as const
// Exa 3.5.0 live tools/list on 2026-10-18; official formatter reference e9c3b0126a3373eb1aeaca162e84d0791ff4c7f7.
const EXA_TOOLS = {
  web_search_exa: { kind: 'search', hash: 'ea70b6dbd4ca5363f0ac82944520016e45d810ecfa332c39aa1c6ece65f2e4df' },
  web_fetch_exa: { kind: 'read-url', hash: 'd72ee7687517df49ee4374713985811b9a87c252590b2ef26c9218786b0f805b' },
} as const

export function isTavilySearchEndpoint(source: DataSource) {
  return webSearchProvider(source) === 'tavily'
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonical(value)]))
  return value
}

export function verifiedWebCapability(source: DataSource, server: { name: string; version: string } | undefined, tool: Pick<SourceTool, 'name' | 'inputSchema'>): SourceTool['webCapability'] {
  const provider = webSearchProvider(source)
  if (!provider || provider === 'deepseek' || !server || (provider === 'tavily' ? server.name !== 'tavily-mcp' || server.version !== '4.1.0' : server.name !== 'exa-search-server' || server.version !== '3.5.0')) return undefined
  const profile = Object.entries(provider === 'tavily' ? TAVILY_TOOLS : EXA_TOOLS).find(([name]) => name === tool.name)?.[1]
  if (!profile) return undefined
  const schemaHash = createHash('sha256').update(JSON.stringify(canonical(tool.inputSchema))).digest('hex')
  if (schemaHash !== profile.hash) return undefined
  return { provider, kind: profile.kind, serverVersion: server.version, schemaHash }
}

const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
function validWebUrl(value: unknown) {
  try { const url = typeof value === 'string' ? new URL(value) : undefined; return !!url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
function assertExaResult(kind: 'search' | 'read-url', envelope: Record<string, unknown> | undefined) {
  const texts = Array.isArray(envelope?.content) ? envelope.content.flatMap(item => object(item)?.type === 'text' && typeof item.text === 'string' ? [item.text as string] : []) : []
  if (kind === 'search' && texts.length === 1 && texts[0] === 'No search results found. Please try a different query.') return
  if (!texts.length) throw new Error('Exa 返回格式无法核对，未取得网页结果')
  for (const text of texts) {
    if (kind === 'search') {
      // Excerpts contain ordinary Markdown rules too. Only a following result
      // header starts another result; its URL is still validated independently.
      for (const page of text.split(/\n\n---\n\n(?=Title: )/)) {
        const header = page.match(/^Title: [^\n]+\nURL: ([^\n]+)\nPublished: [^\n]+\nAuthor: [^\n]+(?:\n|$)/)
        if (!header || !validWebUrl(header[1])) throw new Error('Exa 搜索结果缺少可核对的来源，不能认定已搜索')
      }
    } else {
      // Provider text is not a structured page manifest. Reject explicit partial failures; bounded text still does not prove reading the full original page.
      const headers = [...text.matchAll(/^# [^\n]+\nURL: ([^\n]+)\n(?:Published: [^\n]+\n)?(?:Author: [^\n]+\n)?\n/gm)]
      if (!headers.length || headers[0].index !== 0 || /^Error fetching /m.test(text) || headers.some((header, index) => !validWebUrl(header[1]) || !text.slice(header.index + header[0].length, headers[index + 1]?.index).trim())) throw new Error('Exa 未取得完整请求的可核对正文，请检查原链接和实际结果')
    }
  }
}
export function assertWebSearchResult(capability: SourceTool['webCapability'], result: unknown) {
  if (!capability || capability.provider === 'deepseek') return
  const envelope = object(result)
  if (envelope?.isError === true) throw new Error('搜索服务返回工具错误，未取得可使用的网页结果')
  if (capability.provider === 'exa') return assertExaResult(capability.kind, envelope)
  let body = object(envelope?.structuredContent)
  if (!body && Array.isArray(envelope?.content)) {
    const text = envelope.content.find(item => object(item)?.type === 'text')?.text
    if (typeof text === 'string') { try { body = object(JSON.parse(text)) } catch { /* Unverified text is not a search result. */ } }
  }
  if (typeof body?.code === 'string' && !Array.isArray(body.results)) {
    const code = /^[a-z_\d-]{1,100}$/i.test(body.code) ? body.code : 'provider_error'
    throw new Error(`Tavily 搜索服务未成功（${code}），未取得网页内容`)
  }
  if (!Array.isArray(body?.results)) throw new Error('Tavily 返回格式无法核对，不能认定已经搜索或读取网页')
  if (capability.kind === 'read-url' && body.results.length === 0) throw new Error('Tavily 未提取到网页正文，请核对原始链接及服务状态')
  for (const item of body.results) {
    const page = object(item)
    let validUrl = false
    try { validUrl = typeof page?.url === 'string' && ['https:', 'http:'].includes(new URL(page.url).protocol) } catch { /* Missing or invalid source. */ }
    if (!validUrl || capability.kind === 'read-url' && (typeof page?.raw_content !== 'string' || !page.raw_content.trim())) throw new Error('Tavily 返回结果缺少可核对的来源或正文，不能认定已读取')
  }
}
