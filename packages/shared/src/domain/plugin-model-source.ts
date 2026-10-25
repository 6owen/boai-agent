/*
 * [INPUT]: Saved employee gateway and the profile's negotiated Runtime API source capability.
 * [OUTPUT]: Explicit protocol/model eligibility without credentials; native-only profiles remain valid without a connection.
 * [POS]: Shared renderer and runtime source contract; package authority is rechecked by the execution host.
 * [PROTOCOL]: Update Header and directory .folder.md when this contract changes.
 */
import type { Connection, LaunchProfile } from './index'
import { gatewayCredentialsReady, gatewayEndpoint } from './model-gateway'
import { validModelId } from './model-id'
export function pluginGatewayProvider(connection: Connection | undefined, selected: string, support: LaunchProfile['verified']) {
  if (!connection?.gateway || !gatewayCredentialsReady(connection)) throw new Error('请选择具有有效凭据的模型网关连接')
  if (!support?.modelSource?.protocols.includes(connection.gateway.protocol)) throw new Error('当前插件连接未验证此网关协议，请重新测试或选择支持的连接')
  const modelId = selected.trim() || connection.defaultModel.trim()
  if (!validModelId(modelId)) throw new Error('请选择有效的网关模型')
  return { protocol: connection.gateway.protocol, baseUrl: gatewayEndpoint(connection.baseUrl, 'v1'), modelId }
}
