/*
 * [INPUT]: Official Jina Reader/Search HTTP contract and vault-only bearer key.
 * [OUTPUT]: Bounded search/URL-reading tools with actual URLs and explicit failures.
 * [POS]: Built-in Jina search plugin adapter over the shared HTTP transport.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { executeApiRequest } from './craft/api-request'
import { redactSourceValue, type SourceSession } from './source-provider'
import type { SourceTool } from '../../../shared/domain/sources'

const urlSchema = z.string().max(8192).refine(value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password } catch { return false } }, '请输入 HTTP(S) 网页地址')
const search = z.object({ query: z.string().trim().min(1).max(2000) }).strict()
const read = z.object({ url: urlSchema }).strict()
const page = z.object({ title: z.string().default(''), url: urlSchema, description: z.string().optional(), content: z.string().default('') })
export function openJinaSearchSession(credential: string): SourceSession {
  if (!credential) throw new Error('Jina 尚未配置 API Key')
  const definitions = [{ name: 'jina_search', kind: 'search' as const, schema: search }, { name: 'jina_read', kind: 'read-url' as const, schema: read }]
  const tools: SourceTool[] = definitions.map(definition => {
    const inputSchema = z.toJSONSchema(definition.schema)
    return { name: definition.name, description: definition.kind === 'search' ? 'Search public web pages with Jina. Cite actual returned URLs. Returned text may be excerpts.' : 'Read a public URL with Jina Reader. This does not share the BOAI browser login.', inputSchema, readOnly: true, webCapability: { provider: 'jina', kind: definition.kind, serverVersion: 'reader-http-2026-10-19', schemaHash: createHash('sha256').update(JSON.stringify(inputSchema)).digest('hex') } }
  })
  return { tools, close: async () => {}, async call(name, args, signal) {
    const definition = definitions.find(item => item.name === name)
    if (!definition) throw new Error('未知 Jina 工具')
    const input = definition.schema.parse(args)
    const searching = 'query' in input
    const response = await executeApiRequest({ name: 'Jina', baseUrl: searching ? 'https://s.jina.ai' : 'https://r.jina.ai', auth: { type: 'bearer' }, defaultHeaders: { Accept: 'application/json' } }, credential, { method: 'GET', path: searching ? '/' : '/' + input.url, ...(searching ? { params: { q: input.query } } : {}) }, { signal, timeoutMs: 90000 })
    signal.throwIfAborted()
    if (response.status !== 200) throw new Error(`Jina 请求失败（HTTP ${response.status}）`)
    const body = z.object({ code: z.literal(200), data: z.unknown() }).parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.buffer)))
    const pages = searching ? z.array(page).max(50).parse(body.data) : [page.parse(body.data)]
    if (!searching && !pages[0].content.trim()) throw new Error('Jina 未返回有效网页正文')
    let budget = 48000
    let size = 0
    const results = []
    for (const item of pages) {
      const content = item.content.slice(0, Math.min(budget, searching ? 9000 : 48000)); budget -= content.length
      const result = { url: item.url, title: item.title.slice(0, 1000), description: item.description?.slice(0, 2000), content, characters: item.content.length, truncated: content.length < item.content.length || item.title.length > 1000 || (item.description?.length ?? 0) > 2000 }
      const length = JSON.stringify(result).length
      if (size + length > 110000) break
      size += length; results.push(result)
    }
    return redactSourceValue(searching ? { results, returnedResults: pages.length, truncated: results.length < pages.length || results.some(item => item.truncated) } : results[0], credential)
  } }
}
