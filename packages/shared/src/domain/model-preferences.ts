/*
 * [INPUT]: 模型连接的服务、协议、地址及实际模型 ID。
 * [OUTPUT]: 保留网关原始推理档位并核对目录/协议；直连 DeepSeek 沿原固定合同。
 * [POS]: shared/domain 的模型响应偏好与能力边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Connection } from './index'
import type { ModelCatalog } from './model-gateway'

export const thinkingLevels = ['auto', 'off', 'low', 'high', 'max'] as const
export type ThinkingLevel = string
export const thinkingLevelPattern = /^[a-z0-9_-]{1,40}$/

/** Only offer settings the selected wire adapter can preserve; unknown catalog values remain in the catalog. */
export function gatewayEffortLevels(connection: Connection, levels: string[] | undefined): string[] {
  if (!connection.gateway) return []
  return [...new Set(levels ?? [])].filter(level => thinkingLevelPattern.test(level) && level !== 'auto' &&
    (level !== 'off' || connection.gateway!.protocol === 'messages'))
}

export function assertThinkingPreference(connection: Connection, override: string | undefined, level: ThinkingLevel | undefined, catalog?: ModelCatalog): void {
  if (!level || level === 'auto') return
  if (!thinkingLevelPattern.test(level)) throw new Error('无效的推理档位')
  if (!connection.gateway) {
    if (!(thinkingLevels as readonly string[]).includes(level)) throw new Error('当前直连不支持该推理档位')
    return
  }
  const model = catalog?.models.find(item => item.id === (override || connection.defaultModel).trim())
  if (!model?.reasoningLevels) throw new Error('尚无当前模型的推理目录，请刷新模型后重新选择')
  if (!model.reasoningLevels.includes(level)) throw new Error('当前模型目录未声明该推理档位，请重新选择')
  if (!gatewayEffortLevels(connection, model.reasoningLevels).includes(level)) throw new Error('当前协议不能保真发送该推理档位，请选择其他档位或协议')
}

function isDeepSeekChatConnection(connection: Pick<Connection, 'provider' | 'api' | 'baseUrl'>) {
  if (connection.provider === 'anthropic' || connection.api === 'responses') return false
  try {
    const url = new URL(connection.baseUrl.trim())
    return url.hostname === 'api.deepseek.com' && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function supportsThinkingControl(connection: Pick<Connection, 'provider' | 'api' | 'baseUrl' | 'defaultModel' | 'gateway'>, override?: string) {
  // V3/reasoner and third-party gateways do not share this verified effort contract.
  return !connection.gateway && isDeepSeekChatConnection(connection) && /^deepseek-(?:v4-(?:pro|flash)(?:-\d{4})?|pro|flash)$/.test((override || connection.defaultModel).trim())
}
