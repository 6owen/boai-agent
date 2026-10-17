/*
 * [INPUT]: Explicit employee gateway binding and verified Codex version.
 * [OUTPUT]: Responses source/model resolution independent of the saved API protocol; original native configuration remains selectable.
 * [POS]: Shared Codex gateway eligibility for runtime and renderer.
 * [PROTOCOL]: Update Header and directory .folder.md when changing this contract.
 */
import type { Connection } from './index'
import { gatewayCredentialsReady, gatewayEndpoint } from './model-gateway'
import { validModelId } from './model-id'

export function codexGatewayProvider(connection: Connection | undefined, selected: string) {
  if (!connection?.gateway || !gatewayCredentialsReady(connection)) throw new Error('请选择具有有效凭据的模型网关连接')
  const model = selected.trim() || connection.defaultModel.trim()
  if (!validModelId(model)) throw new Error('请选择有效的网关模型')
  return { baseUrl: gatewayEndpoint(connection.baseUrl, 'v1'), model }
}

export function assertCodexGatewayVersion(version: string | undefined) {
  if (version !== '0.162.1') throw new Error('明确网关来源目前要求已核对的 Codex 0.162.1；请重新测试程序版本')
}
