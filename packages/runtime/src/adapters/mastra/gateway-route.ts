/*
 * [OUTPUT]: 无Run的连接测试/团队规划/自动化草稿沿原操作身份保存逐请求网关路由；不制造Work或更改原预算。
 * [INPUT]: One SDK step's response headers/model metadata, selected gateway and private credential.
 * [OUTPUT]: Bounded per-response route evidence; body model remains separate and missing headers stay unknown.
 * [POS]: Mastra gateway observation; never polls global routing state or retries a request.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changing this module.
 */
import type { Connection } from '@boai/shared/domain'
import type { GatewayModelCall, GatewayRouteEvidence } from '@boai/shared/domain/model-gateway'
import type { EngineContext } from '../../contracts'

export interface GatewayResponse { headers?: Record<string, string>; modelId?: string; id?: string }
function label(value: unknown, key: string, max = 1000): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && (!key || !value.includes(key)) ? value : undefined
}
export function gatewayRouteEvidence(response: GatewayResponse, key: string): GatewayRouteEvidence {
  const headers = new Map(Object.entries(response.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]))
  const actualModelId = label(headers.get('x-magpie-model'), key)
  const actualProvider = label(headers.get('x-magpie-provider'), key)
  const reportedModelId = label(response.modelId, key), responseId = label(response.id, key, 200)
  return { routeSource: actualModelId ? 'response-headers' : 'unknown', ...(actualModelId ? { actualModelId } : {}), ...(actualProvider ? { actualProvider } : {}), ...(reportedModelId ? { reportedModelId } : {}), ...(responseId ? { responseId } : {}), observedAt: new Date().toISOString() }
}
/** Callback failure is observational; it must not abort a stream or repeat a tool. */
export function gatewayRouteObserver(context: Pick<EngineContext, 'connection' | 'apiKey' | 'onModelCallRoute'>, callId: () => string | undefined) {
  return async ({ response }: { response: GatewayResponse }) => {
    const id = callId()
    if (!id || !context.connection?.gateway || !context.onModelCallRoute) return
    try { await context.onModelCallRoute(id, gatewayRouteEvidence(response, context.apiKey)) } catch { /* Business output remains authoritative. */ }
  }
}
export function gatewaySelectedModel(connection: Connection, override?: string) { return (override || connection.defaultModel).trim() }
/** The caller owns this identity; observation never creates a business Run or Work. */
export function gatewayModelCall(connection: Connection, callId: string, phase: GatewayModelCall['phase'], override?: string): GatewayModelCall | undefined {
  return connection.gateway ? { callId, connectionId: connection.id, connectionRevision: connection.revision ?? 1, phase, protocol: connection.gateway.protocol, selectedModelId: gatewaySelectedModel(connection, override), startedAt: new Date().toISOString() } : undefined
}
