/*
 * [OUTPUT]: Fetch独立90秒上限且不自动重试；maxCharacters仅限制宿主返回摘录，不传入上游API。
 * [INPUT]: Official DeepSeek Search/Fetch contracts checked 2026-10-18 and vault-only Bearer credential.
 * [OUTPUT]: Fixed read-only POST tools, validated sources and bounded structured text; empty search differs from failed fetch.
 * [POS]: API source adapter using the existing Craft request transport and SourceService authorization/lifecycle.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SourceTool } from '@boai/shared/domain/sources'
import { executeApiRequest } from './craft/api-request'
import { redactSourceValue, SOURCE_TIMEOUT, type SourceSession } from './source-provider'

const question = z.string().min(1).max(256).refine(value => value.trim().length > 0 && [...value].length <= 128, '请输入 1–128 个 Unicode 字符')
const webUrl = z.string().min(1).max(8192).refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password } catch { return false }
}, '网页地址必须是不含账号密码的 HTTP(S) URL')
const searchInput = z.object({ query: question, count: z.number().int().min(1).max(50).optional(), ori_question: question.nullable().optional(), localization: z.string().max(128).optional(), need_content: z.boolean().optional() }).strict()
const fetchInput = z.object({ url: webUrl, maxCharacters: z.number().int().min(1).max(48000).optional().describe('BOAI output excerpt limit, default 48000 characters; not sent to DeepSeek.') }).strict()
const searchOutput = z.object({ results: z.array(z.object({
  rerank_score: z.number().min(0).max(3), title: z.string(), url: webUrl,
  snippet: z.string(), summary: z.string(), content: z.string(), site_name: z.string().nullable(), site_icon: z.string().nullable(), date: z.string().nullable(), authority: z.number().int().min(-1).max(4),
})).max(50) })
const fetchOutput = z.object({ title: z.string(), content: z.string().refine(value => !!value.trim()) })
const definitions = [
  { name: 'deepseek_search', kind: 'search', schema: searchInput, description: 'Search public web pages with DeepSeek. Query is 1–128 Unicode characters; count 1–50 (default 10). Results include source URLs and summaries, not proof of reading a complete page. need_content optionally requests page text. Empty results mean no matches. Do not repeat a failed request automatically.' },
  { name: 'deepseek_fetch', kind: 'read-url', schema: fetchInput, description: 'Read one public HTTP(S) page with DeepSeek and return its source URL, title and bounded Markdown text. A truncated result is an excerpt, not the entire page. This does not use the BOAI browser login or access local files. Do not repeat a failed request automatically.' },
] as const
function tools(): SourceTool[] {
  return definitions.map(definition => {
    const inputSchema = z.toJSONSchema(definition.schema, { io: 'input' })
    if (definition.kind === 'search') {
      // JSON Schema counts Unicode code points, while Zod's string.max uses UTF-16 units.
      const properties = inputSchema.properties as Record<string, { maxLength?: number; anyOf?: { maxLength?: number; type?: string }[] }>
      properties.query.maxLength = 128
      for (const value of properties.ori_question.anyOf ?? []) if (value.type === 'string') value.maxLength = 128
    }
    return { name: definition.name, description: definition.description, inputSchema, readOnly: true, webCapability: { provider: 'deepseek', kind: definition.kind, serverVersion: 'http-v1-docs-2026-10-18', schemaHash: createHash('sha256').update(JSON.stringify(inputSchema)).digest('hex') } }
  })
}
function providerError(status: number) {
  const reasons: Record<number, string> = { 400: '请求参数无效', 401: 'API Key 缺失或无效', 402: '账号余额不足', 403: '网页读取被服务安全策略拒绝', 404: '未取得可用网页正文', 408: '请求超时', 413: '请求过大', 429: '服务限流', 500: '服务内部错误', 504: '下游请求超时' }
  return new Error(`DeepSeek 请求失败（HTTP ${status}：${reasons[status] ?? '服务未返回成功结果'}），未取得可用结果`)
}
export function openDeepSeekSearchSession(credential: string): SourceSession {
  if (!credential) throw new Error('DeepSeek 数据源尚未配置 API Key')
  return { tools: tools(), close: async () => {}, async call(name, args, signal) {
    signal.throwIfAborted()
    const definition = definitions.find(tool => tool.name === name)
    if (!definition) throw new Error('未知 DeepSeek 搜索工具')
    const params = definition.schema.parse(args)
    const requestParams = definition.kind === 'read-url' ? { url: (params as z.infer<typeof fetchInput>).url } : params
    const result = await executeApiRequest({ name: 'DeepSeek Search/Fetch', baseUrl: 'https://api.deepseek.com/v1/tools', auth: { type: 'bearer' } }, credential, { path: definition.kind === 'search' ? '/search' : '/fetch', method: 'POST', params: requestParams }, { signal, timeoutMs: definition.kind === 'read-url' ? 90000 : SOURCE_TIMEOUT })
    signal.throwIfAborted()
    if (result.status !== 200) throw providerError(result.status)
    let body: unknown
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.buffer)) } catch { throw new Error('DeepSeek 返回格式无法核对，未取得可用结果') }
    if (definition.kind === 'read-url') {
      const parsed = fetchOutput.safeParse(body)
      if (!parsed.success) throw new Error('DeepSeek 未返回有效网页正文')
      const { title, content } = parsed.data
      const limit = (params as z.infer<typeof fetchInput>).maxCharacters ?? 48000
      return redactSourceValue({ url: (params as z.infer<typeof fetchInput>).url, title: title.slice(0, 1000), content: content.slice(0, limit), characters: content.length, truncated: content.length > limit || title.length > 1000 }, credential)
    }
    const parsed = searchOutput.safeParse(body)
    if (!parsed.success) throw new Error('DeepSeek 搜索结果缺少可核对的来源或格式无效')
    const results = []; let size = 0, truncated = false
    for (const page of parsed.data.results) {
      const bounded = { ...page, title: page.title.slice(0, 1000), snippet: page.snippet.slice(0, 1000), summary: page.summary.slice(0, 4000), content: page.content.slice(0, 12000), site_name: page.site_name?.slice(0, 1000) ?? null, site_icon: page.site_icon?.slice(0, 8192) ?? null, date: page.date?.slice(0, 100) ?? null, contentCharacters: page.content.length, truncated: page.content.length > 12000 || page.summary.length > 4000 || page.snippet.length > 1000 || page.title.length > 1000 }
      const length = JSON.stringify(bounded).length
      if (size + length > 110000) { truncated = true; break }
      size += length; results.push(bounded); truncated ||= bounded.truncated
    }
    return redactSourceValue({ results, returnedResults: parsed.data.results.length, truncated }, credential)
  } }
}
