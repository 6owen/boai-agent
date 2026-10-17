/*
 * [OUTPUT]: 无Run的连接测试/团队规划/自动化草稿沿原操作身份保存逐请求网关路由；不制造Work或更改原预算。
 * [INPUT]: Explicit gateway root, protocol and authentication mode; ordinary provider connections retain their API-root convention.
 * [OUTPUT]: Shared gateway/catalog contracts and per-request route evidence; credential readiness and deterministic endpoint/authentication resolution.
 * [POS]: Model-source contract shared by settings, API and native adapters; no credentials are persisted here.
 * [PROTOCOL]: Update Header and domain/.folder.md when changing this contract.
 */
export type ModelProtocol = 'chat' | 'responses' | 'messages'
export interface ModelGateway { kind: 'magpie'; protocol: ModelProtocol; auth: 'local' | 'key' }
export interface ModelCatalogEntry {
  id: string
  name?: string
  provider?: string
  reasoning?: boolean
  reasoningLevels?: string[]
  contextWindow?: number
  maxOutputTokens?: number
  modalities?: { input?: string[]; output?: string[] }
  nativeEndpoints?: string[]
}
export interface ModelCatalog { models: ModelCatalogEntry[]; fetchedAt: string; source: 'service-declared' }
export interface GatewayIdentity { name: 'magpie'; version: string; baseUrl: string }
export interface GatewayRouteEvidence {
  routeSource: 'response-headers' | 'unknown'
  actualModelId?: string
  actualProvider?: string
  reportedModelId?: string
  responseId?: string
  observedAt: string
}
export interface GatewayModelCall {
  callId: string
  connectionId: string
  connectionRevision: number
  phase: 'chat' | 'task' | 'decision' | 'memory' | 'report' | 'connection-test' | 'team-plan' | 'automation-draft'
  protocol: ModelProtocol
  selectedModelId: string
  startedAt: string
  route?: GatewayRouteEvidence
}

export const MAGPIE_DEFAULT_URL = 'http://127.0.0.1:3425'
export const MAGPIE_APP_KEY = 'magpie-boai'

export function gatewayRoot(baseUrl: string): URL {
  let url: URL
  try { url = new URL(baseUrl.trim()) } catch { throw new Error('请填写有效的网关根地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('网关地址必须为不含凭据、查询参数或片段的 HTTP(S) 根地址')
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url
}
export function isLoopbackGateway(baseUrl: string): boolean {
  return ['127.0.0.1', '[::1]', 'localhost'].includes(gatewayRoot(baseUrl).hostname)
}
export function gatewayCredentialsReady(connection: { baseUrl: string; gateway?: ModelGateway; hasApiKey: boolean }): boolean {
  if (!connection.gateway) return false
  try {
    gatewayRoot(connection.baseUrl)
    return connection.gateway.auth === 'local' ? isLoopbackGateway(connection.baseUrl) : connection.hasApiKey
  } catch { return false }
}
export function gatewayEndpoint(baseUrl: string, path: string): string {
  const url = gatewayRoot(baseUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  return url.href
}
export function gatewayApiKey(source: { baseUrl: string; gateway?: ModelGateway }, key: string): string {
  if (!source.gateway) return key
  if (source.gateway.auth === 'local') {
    if (!isLoopbackGateway(source.baseUrl)) throw new Error('公开应用标识只可用于本机 Magpie；远程网关请选择密钥认证')
    return MAGPIE_APP_KEY
  }
  if (!key.trim() || key.trim() === MAGPIE_APP_KEY) throw new Error('请配置真实网关密钥；应用标识不能用作远程认证')
  return key.trim()
}
