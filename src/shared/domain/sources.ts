/*
 * [OUTPUT]: 2026-10-19 检索偏好合同转至独立领域并保留历史读取；提供方识别增加官方 Jina。
 * [OUTPUT]: 官方DeepSeek API Bearer配置可发现搜索/读取候选；固定POST工具由宿主独立核准。
 * [OUTPUT]: Tavily/Exa官方固定端点可作为搜索候选，真实工具身份仍由宿主版本/schema核准。
 * [OUTPUT]: 员工检索偏好为自动/浏览器/固定源；候选端点识别共用纯函数，不宣称连接成功。
 * [OUTPUT]: SourceSummary标识搜索候选提供方，仅用于按需发现，不宣称实际目录或业务已验证。
 * [OUTPUT]: SourceTool携带宿主核准的搜索/正文能力及实际schema/server版本；目录提示本身不授予只读权限。
 * [OUTPUT]: 公共数据源携带固定会话/消息/员工创建来源，配置只描述连接；目录DTO不带密钥，桌面编辑器沿专用版本化IPC回填。
 * [INPUT]: Connection-only API/MCP/local configuration; access authority belongs to the employee.
 * [OUTPUT]: Public source configuration, revision checks and bounded tool requests; catalog DTOs exclude credentials; explicit desktop editing uses a separate credential read.
 * [POS]: Shared data-source contract; separate from model connections and Skills.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
const httpUrl = text(4000).refine(value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash } catch { return false } }, '请输入不包含账号密码的 HTTP(S) 地址')
const base = { name: text(100), description: z.string().max(1000), guide: z.string().max(40000), enabled: z.boolean() }
export const dataSourceConfigSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('api'), api: z.object({ baseUrl: httpUrl, authType: z.enum(['none', 'bearer', 'header', 'query', 'basic']), headerName: text(100).optional(), queryParam: text(100).optional(), authScheme: z.string().max(100).optional(), testPath: text(2000).default('/') }).strict() }).strict(),
  z.object({ ...base, type: z.literal('mcp'), mcp: z.discriminatedUnion('transport', [
    z.object({ transport: z.enum(['http', 'sse']), url: httpUrl, authType: z.enum(['none', 'bearer']) }).strict(),
    z.object({ transport: z.literal('stdio'), command: text(2000), args: z.array(z.string().max(4000)).max(100) }).strict(),
  ]) }).strict(),
  z.object({ ...base, type: z.literal('local'), local: z.object({ path: text(8000) }).strict() }).strict(),
])
export type DataSourceConfig = z.infer<typeof dataSourceConfigSchema>
export type DataSourceCreationSource = { conversationId: string; messageId: string; agentId: string }
export type DataSource = DataSourceConfig & { id: string; revision: number; createdAt: string; updatedAt: string; hasCredential: boolean; creationSource?: DataSourceCreationSource; test?: { status: 'success' | 'failed'; checkedAt: string; message: string; tools?: { name: string; description?: string }[] } }
export const saveDataSourceSchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), config: dataSourceConfigSchema, credential: z.string().max(32000).optional() }).strict()
export type SaveDataSourceInput = z.input<typeof saveDataSourceSchema>
export const dataSourceIdentitySchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict()
export type DataSourceIdentity = z.infer<typeof dataSourceIdentitySchema>
const agentVersion = z.object({ id: text(200), expectedConfigVersion: z.number().int().positive() }).strict()
export const dataSourceBindingsSchema = dataSourceIdentitySchema.extend({ agents: z.array(agentVersion).max(100), expectedBindings: z.array(agentVersion).max(100) }).strict()
export type DataSourceBindingsInput = z.infer<typeof dataSourceBindingsSchema>
export const sourceCallSchema = z.object({ sourceId: z.string().uuid(), tool: text(200), arguments: z.record(z.string(), z.unknown()).default({}) }).strict()
export type SourceCall = z.infer<typeof sourceCallSchema>
export type SourceSummary = Pick<DataSource, 'id' | 'name' | 'description' | 'type' | 'revision'> & { webSearchProvider?: 'tavily' | 'exa' | 'deepseek' | 'jina' }
export { webSearchPreferenceSchema } from './web-search'
export type { WebSearchPreference } from './web-search'
import type { WebSearchPreference } from './web-search'
export function webSearchProvider(source: DataSourceConfig): SourceSummary['webSearchProvider'] {
  if (source.type === 'api') {
    try {
      const url = new URL(source.api.baseUrl)
      if (url.origin === 'https://s.jina.ai' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password && source.api.authType === 'bearer') return 'jina'
      if (url.origin === 'https://api.deepseek.com' && ['/', '/v1', '/v1/', '/v1/tools', '/v1/tools/'].includes(url.pathname) && !url.search && !url.hash && !url.username && !url.password && source.api.authType === 'bearer' && (!source.api.authScheme || source.api.authScheme === 'Bearer')) return 'deepseek'
    } catch { /* Invalid legacy configuration is not a candidate. */ }
    return undefined
  }
  if (source.type !== 'mcp' || source.mcp.transport !== 'http') return undefined
  try {
    const url = new URL(source.mcp.url)
    if (!['/mcp', '/mcp/'].includes(url.pathname) || url.search || url.hash || url.username || url.password) return undefined
    if (url.origin === 'https://mcp.tavily.com') return 'tavily'
    if (url.origin === 'https://mcp.exa.ai') return 'exa'
  } catch { /* Invalid legacy configuration is not a candidate. */ }
}
export function webSearchPreferenceLabel(preference: WebSearchPreference | undefined, sources: DataSource[]) {
  if (!preference || preference.mode === 'auto') return '自动'
  if (preference.mode === 'browser') return 'BOAI 浏览器'
  if (preference.mode === 'disabled') return '关闭网页检索'
  const source = sources.find(source => source.id === (preference.mode === 'service' ? preference.serviceId : preference.sourceId))
  return source ? `${source.name}${!source.enabled ? '（已停用）' : !webSearchProvider(source) ? '（搜索不可用）' : ''}` : '原搜索源已不可用'
}
export type SourceTool = { name: string; description?: string; inputSchema: Record<string, unknown>; readOnly?: boolean; webCapability?: { provider: NonNullable<SourceSummary['webSearchProvider']>; kind: 'search' | 'read-url'; serverVersion: string; schemaHash: string } }
export const apiSourceRequestSchema = z.object({ path: z.string().max(4000), method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'), params: z.record(z.string(), z.unknown()).optional() }).strict()
export const localSourceRequestSchema = z.object({ operation: z.enum(['list', 'read', 'write']), path: z.string().max(8000).default('.'), content: z.string().max(1024 * 1024).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(48000).default(48000), expectedHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional() }).strict()
export const DATA_SOURCE_LABELS = { api: 'API', mcp: 'MCP', local: '本地文件夹' } as const
export function supportsDataSources(kind?: string) { return !kind || ['mastra-model', 'codex-local', 'claude-local', 'runtime-plugin'].includes(kind) }
