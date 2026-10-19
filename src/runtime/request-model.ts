/*
 * [INPUT]: Authenticated message overrides, original employee/connection and secret provider.
 * [OUTPUT]: Frozen public source plus service-lifetime credentials; no default edits or cross-endpoint key inheritance.
 * [POS]: Request-scoped model selection and private credential adapter for original service execution.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Connection, DigitalAgent } from '../shared/domain'
import { apiModelOverrideSchema, assertModelEndpoint, type ApiModelOverride, type RequestModelSource } from '../shared/domain/model-source'
import { gatewayApiKey } from '../shared/domain/model-gateway'

export function modelRequestIdentity<T extends { apiModel?: ApiModelOverride }>(input: T): T {
  if (input.apiModel?.apiKey === undefined) return input
  return { ...input, apiModel: { ...input.apiModel, apiKey: 'sha256:' + createHash('sha256').update(input.apiModel.apiKey).digest('hex') } }
}

export async function prepareRequestModel(raw: ApiModelOverride, agent: DigitalAgent, base: Connection | undefined, readKey: (connection: Connection) => Promise<string>) {
  if (agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') throw new Error('本机员工不接受本轮API模型覆盖，请使用其原生运行配置')
  const input = apiModelOverrideSchema.parse(raw), provider = input.provider ?? base?.provider
  if (!provider) throw new Error('本轮API模型需要明确provider或已有模型连接')
  const model = input.model ?? (agent.modelId || base?.defaultModel)
  if (!model) throw new Error('本轮API模型需要明确model')
  const baseUrl = input.baseUrl ?? (provider === base?.provider ? base.baseUrl : '')
  assertModelEndpoint(provider, baseUrl)
  if (baseUrl && (new URL(baseUrl).search || new URL(baseUrl).hash)) throw new Error('本轮模型地址不能包含查询参数或片段，请通过apiKey提供凭据')
  const sameEndpoint = !!base && provider === base.provider && baseUrl.replace(/\/$/, '') === base.baseUrl.replace(/\/$/, '')
  if (!sameEndpoint && input.apiKey === undefined && base?.hasApiKey) throw new Error('接口地址或服务已变更，请重新输入本轮API Key')
  const suppliedKey = input.apiKey !== undefined ? input.apiKey.trim() : sameEndpoint ? await readKey(base!) : ''
  const apiKey = sameEndpoint ? gatewayApiKey(base!, suppliedKey) : suppliedKey
  if (!apiKey && provider !== 'openai-compatible') throw new Error('本轮模型来源尚未设置API Key')
  const connection: Connection = { id: 'request-model:' + randomUUID(), revision: 1, name: '本轮 API 模型', provider, baseUrl, defaultModel: model, hasApiKey: !!apiKey && !(sameEndpoint && base?.gateway?.auth === 'local'), ...(sameEndpoint && base?.api ? { api: base.api } : {}), ...(sameEndpoint && base?.gateway ? { gateway: structuredClone(base.gateway) } : {}) }
  const inherited = base && (input.provider === undefined || input.model === undefined || input.baseUrl === undefined || input.apiKey === undefined || sameEndpoint && !!base.gateway)
  const source: RequestModelSource = { employeeId: agent.id, employeeConfigVersion: agent.configVersion, connection, ...(inherited ? { inheritedConnection: { id: base.id, revision: base.revision ?? 1 } } : {}) }
  return { source, apiKey }
}

export class RequestModelSecrets {
  private readonly values = new Map<string, string>()
  install(prepared: Awaited<ReturnType<typeof prepareRequestModel>>) { if (prepared.source.connection.hasApiKey) this.values.set(prepared.source.connection.id, prepared.apiKey) }
  forget(source?: RequestModelSource) { if (source) this.values.delete(source.connection.id) }
  clear() { this.values.clear() }
  resolve(source: RequestModelSource, agent: DigitalAgent, connections: ReadonlyMap<string, Connection>) {
    if (source.employeeId !== agent.id || source.employeeConfigVersion !== agent.configVersion || !agent.active || agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') throw new Error('本轮模型所属员工配置已变化，请发起新请求')
    if (source.inheritedConnection && (connections.get(source.inheritedConnection.id)?.revision ?? (connections.has(source.inheritedConnection.id) ? 1 : undefined)) !== source.inheritedConnection.revision) throw new Error('本轮模型继承的原连接已变化或删除，请发起新请求')
    const apiKey = this.values.get(source.connection.id) ?? ''
    if (source.connection.hasApiKey && !apiKey) throw new Error('本轮临时模型凭据已失效，请明确提供模型参数发起新请求；原任务不会自动重发')
    return { connection: structuredClone(source.connection), apiKey: gatewayApiKey(source.connection, apiKey), agent: { ...agent, connectionId: source.connection.id, modelId: source.connection.defaultModel } }
  }
}
