/*
 * [INPUT]: 模型连接的服务、协议、地址及实际模型 ID。
 * [OUTPUT]: 员工思考强度选项与已验证的 DeepSeek 官方 Chat 模型边界，供 composer 和执行适配器共用。
 * [POS]: shared/domain 的模型响应偏好与能力边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection } from './index'

export const thinkingLevels = ['auto', 'off', 'low', 'high', 'max'] as const
export type ThinkingLevel = typeof thinkingLevels[number]

function isDeepSeekChatConnection(connection: Pick<Connection, 'provider' | 'api' | 'baseUrl'>) {
  if (connection.provider === 'anthropic' || connection.api === 'responses') return false
  try {
    const url = new URL(connection.baseUrl.trim())
    return url.hostname === 'api.deepseek.com' && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function supportsThinkingControl(connection: Pick<Connection, 'provider' | 'api' | 'baseUrl' | 'defaultModel'>, override?: string) {
  // V3/reasoner and third-party gateways do not share this verified effort contract.
  return isDeepSeekChatConnection(connection) && /^deepseek-(?:v4-(?:pro|flash)(?:-\d{4})?|pro|flash)$/.test((override || connection.defaultModel).trim())
}
