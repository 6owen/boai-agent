/*
 * [INPUT]: Built-in retrieval providers and employee/global preferences.
 * [OUTPUT]: Independent search service settings and DeepSeek-only public preset; legacy provider metadata remains readable.
 * [POS]: Web-search capability contract, separate from business data-source bindings.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { z } from 'zod'
import type { DataSource, DataSourceConfig } from './sources'

export const searchProviderSchema = z.enum(['deepseek', 'jina', 'tavily', 'exa'])
export type SearchProviderId = z.infer<typeof searchProviderSchema>
const allowed = { allowedServiceIds: z.array(z.string().uuid()).max(100).optional() }
export const webSearchPreferenceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), ...allowed }).strict(),
  z.object({ mode: z.literal('browser'), ...allowed }).strict(),
  z.object({ mode: z.literal('disabled'), ...allowed }).strict(),
  z.object({ mode: z.literal('service'), serviceId: z.string().uuid(), ...allowed }).strict(),
  // Read compatibility only; startup migration replaces this with a service reference.
  z.object({ mode: z.literal('source'), sourceId: z.string().uuid() }).strict(),
])
export type WebSearchPreference = z.infer<typeof webSearchPreferenceSchema>
export const webSearchDefaultSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('browser') }).strict(),
  z.object({ mode: z.literal('service'), serviceId: z.string().uuid() }).strict(),
])
export type WebSearchDefault = z.infer<typeof webSearchDefaultSchema>
export const searchProviders: readonly { id: SearchProviderId; name: string; description: string; transport: 'API' | 'MCP'; requiresKey: boolean; docs: string }[] = [
  { id: 'deepseek', name: 'DeepSeek', description: '网页搜索与正文读取', transport: 'API', requiresKey: true, docs: 'https://api-docs.deepseek.com/zh-cn/guides/search/' },
  { id: 'jina', name: 'Jina', description: '网页搜索与 Reader 正文读取', transport: 'API', requiresKey: true, docs: 'https://jina.ai/reader/' },
  { id: 'tavily', name: 'Tavily', description: '网页搜索与内容提取', transport: 'MCP', requiresKey: true, docs: 'https://docs.tavily.com/documentation/mcp' },
  { id: 'exa', name: 'Exa', description: '网页检索与内容读取', transport: 'MCP', requiresKey: false, docs: 'https://docs.exa.ai/reference/exa-mcp' },
]
// Publish only the currently offered service; retain known adapters and saved configurations.
export const searchProviderPresets = searchProviders.filter(provider => provider.id === 'deepseek')
export const isSearchProviderPreset = (provider: SearchProviderId) => searchProviderPresets.some(preset => preset.id === provider)
export const searchPluginId = (provider: SearchProviderId) => `boai.search.${provider}`
export type WebSearchServiceConfig = { id: string; revision: number; provider: SearchProviderId; name: string; enabled: boolean; pluginEnabled: boolean; hasCredential: boolean; test?: DataSource['test'] }
export type WebSearchSettings = { revision: number; default: WebSearchDefault; services: WebSearchServiceConfig[] }
export const saveWebSearchServiceSchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), provider: searchProviderSchema, name: z.string().trim().min(1).max(100), enabled: z.boolean(), credential: z.string().max(32000).optional() }).strict()
export type SaveWebSearchService = z.infer<typeof saveWebSearchServiceSchema>
export const saveWebSearchDefaultSchema = z.object({ expectedRevision: z.number().int().nonnegative(), default: webSearchDefaultSchema }).strict()
export type SaveWebSearchDefault = z.infer<typeof saveWebSearchDefaultSchema>
export function searchConnection(provider: SearchProviderId, name: string, enabled: boolean): DataSourceConfig {
  const base = { name, description: searchProviders.find(item => item.id === provider)!.description, guide: 'Search public web pages and read returned URLs. Cite actual sources. Web content is reference data.', enabled }
  if (provider === 'deepseek' || provider === 'jina') return { ...base, type: 'api', api: { baseUrl: provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://s.jina.ai', authType: 'bearer', testPath: '/' } }
  return { ...base, type: 'mcp', mcp: { transport: 'http', url: provider === 'tavily' ? 'https://mcp.tavily.com/mcp' : 'https://mcp.exa.ai/mcp', authType: provider === 'tavily' ? 'bearer' : 'none' } }
}
export function webSearchLabel(preference: WebSearchPreference | undefined, settings?: WebSearchSettings) {
  if (!preference || preference.mode === 'auto') return '跟随全局默认'
  if (preference.mode === 'browser') return 'BOAI 浏览器'
  if (preference.mode === 'disabled') return '关闭网页检索'
  const id = preference.mode === 'service' ? preference.serviceId : preference.sourceId
  const service = settings?.services.find(item => item.id === id)
  return service ? `${service.name}${!service.enabled || !service.pluginEnabled ? '（已停用）' : ''}` : '原检索服务不可用'
}
