/*
 * [INPUT]: Official Tavily tools/list capture and adversarial endpoint/schema variations.
 * [OUTPUT]: Exact service/schema classification and quota/empty-body failures; the real quota payload must fail even with isError=false.
 * [POS]: Provider classification regression; no external requests or model claims.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DataSource } from '../src/shared/domain/sources'
import { assertWebSearchResult, isTavilySearchEndpoint, verifiedWebCapability } from '../src/runtime/modules/sources/web-search-profile'

const observed = JSON.parse(readFileSync(new URL('./fixtures/tavily-catalog.json', import.meta.url), 'utf8'))
const source = { id: 'source', revision: 1, name: 'Tavily', type: 'mcp', mcp: { transport: 'http', url: 'https://mcp.tavily.com/mcp/', authType: 'none' } } as DataSource
const search = observed.catalog.tools.find((tool: { name: string }) => tool.name === 'tavily_search')
describe('verified web search capabilities', () => {
  it('classifies the actual search and extract catalog, leaving the other tools under normal employee authorization', () => {
    expect(observed.catalog.tools.map((tool: typeof search) => verifiedWebCapability(source, observed.serverInfo, tool)?.kind)).toEqual(['search', 'read-url', undefined, undefined, undefined])
  })
  it.each(['http://mcp.tavily.com/mcp/', 'https://mcp.tavily.com.evil.test/mcp/', 'https://mcp.tavily.com/other', 'https://mcp.tavily.com/mcp/?tavilyApiKey=secret', 'https://user@mcp.tavily.com/mcp/', 'https://mcp.tavily.com:444/mcp/', 'https://mcp.tavily.com/mcp/#other'])('does not grant known-provider authority to %s', url => {
    const changed = { ...source, mcp: { transport: 'http', url, authType: 'none' } } as DataSource
    expect(isTavilySearchEndpoint(changed)).toBe(false); expect(verifiedWebCapability(changed, observed.serverInfo, search)).toBeUndefined()
  })
  it('does not trust local processes, changed server versions, names or schemas even with readOnlyHint', () => {
    expect(verifiedWebCapability({ ...source, mcp: { transport: 'stdio', command: 'tavily', args: [] } } as DataSource, observed.serverInfo, search)).toBeUndefined()
    expect(verifiedWebCapability(source, { name: 'other', version: '4.1.0' }, search)).toBeUndefined()
    expect(verifiedWebCapability(source, { name: 'tavily-mcp', version: '4.1.1' }, search)).toBeUndefined()
    expect(verifiedWebCapability(source, observed.serverInfo, { ...search, inputSchema: { ...search.inputSchema, properties: { ...search.inputSchema.properties, delete_files: { type: 'boolean' } } } })).toBeUndefined()
    expect(verifiedWebCapability(source, observed.serverInfo, { ...search, name: 'search' })).toBeUndefined()
  })
  it('ignores object key order while retaining the exact schema contract', () => {
    const reordered = { ...search, inputSchema: Object.fromEntries(Object.entries(search.inputSchema).reverse()) }
    expect(verifiedWebCapability(source, observed.serverInfo, reordered)).toEqual(verifiedWebCapability(source, observed.serverInfo, search))
  })
  it('rejects the real keyless quota response despite its false MCP error flag', () => {
    const response = JSON.parse(readFileSync(new URL('./fixtures/tavily-keyless-quota.json', import.meta.url), 'utf8'))
    expect(response.isError).toBe(false)
    expect(() => assertWebSearchResult(verifiedWebCapability(source, observed.serverInfo, search), response)).toThrow('monthly_cap_reached_bonus_eligible')
  })
  it('distinguishes no search matches from missing extracted body and checks actual source URLs', () => {
    const searchCapability = verifiedWebCapability(source, observed.serverInfo, search)!
    const readCapability = { ...searchCapability, kind: 'read-url' as const }
    expect(() => assertWebSearchResult(searchCapability, { structuredContent: { results: [] } })).not.toThrow()
    expect(() => assertWebSearchResult(readCapability, { structuredContent: { results: [], failed_results: [{ url: 'https://example.com', error: 'login required' }] } })).toThrow('未提取到')
    expect(() => assertWebSearchResult(readCapability, { structuredContent: { results: [{ url: 'https://example.com', raw_content: '' }] } })).toThrow('缺少')
    expect(() => assertWebSearchResult(searchCapability, { structuredContent: { results: [{ url: 'javascript:bad' }] } })).toThrow('缺少')
    expect(() => assertWebSearchResult(readCapability, { content: [{ type: 'text', text: JSON.stringify({ results: [{ url: 'https://example.com', raw_content: 'Actual public page' }] }) }] })).not.toThrow()
  })
  it('does not treat an MCP error or unstructured page as verified search data', () => {
    const capability = verifiedWebCapability(source, observed.serverInfo, search)
    expect(() => assertWebSearchResult(capability, { isError: true, structuredContent: { results: [] } })).toThrow('工具错误')
    expect(() => assertWebSearchResult(capability, { content: [{ type: 'text', text: '<html>Sign in</html>' }] })).toThrow('格式无法核对')
    expect(() => assertWebSearchResult(undefined, { content: [{ type: 'text', text: 'Other MCP output' }] })).not.toThrow()
  })
})
