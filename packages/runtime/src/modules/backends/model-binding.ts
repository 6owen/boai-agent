/*
 * [INPUT]: The employee’s selected API connection and explicit or default model.
 * [OUTPUT]: The effective model and the original persisted configuration fingerprint.
 * [POS]: Shared model-binding policy for employee execution and team drafts.
 * [PROTOCOL]: Update this header and backends/.folder.md on change.
 */
import type { Connection } from '@boai/shared/domain'
import { jsonSha256 } from '../../json-digest'

export function rejectModelBinding(code: 'MODEL_UNAVAILABLE' | 'CONFIG_CHANGED', message: string): never {
  throw new Error(`${code}: ${message}`)
}

export function resolveConnectionModel(connection: Connection | undefined, selectedModelId: string) {
  if (!connection) return rejectModelBinding('MODEL_UNAVAILABLE', '请选择已有模型连接')
  const modelId = selectedModelId || connection.defaultModel.trim()
  if (!modelId) return rejectModelBinding('MODEL_UNAVAILABLE', '请先配置有效模型')
  const fingerprint = jsonSha256({
    id: connection.id,
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    api: connection.api ?? 'chat',
    ...(connection.gateway ? { gateway: connection.gateway, revision: connection.revision } : {}),
    defaultModel: connection.defaultModel,
    modelId,
  })
  return { modelId, fingerprint }
}
