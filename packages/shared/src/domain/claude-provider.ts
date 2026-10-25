/*
 * [OUTPUT]: Claude明确Magpie来源固定Messages及原连接revision，默认模型实际传CLI；进程级host-managed覆盖竞争来源，2.1.302起版本门槛，原生能力保持。
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [INPUT]: 员工明确选择的既有模型连接及模型覆盖。
 * [OUTPUT]: Anthropic协议来源/模型；DeepSeek仅映射已知官方端点，其他OpenAI协议不推断兼容。
 * [POS]: 前端与运行时共用的Claude来源校验；只读取连接元数据，不接收密钥或调用模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { validModelId } from './model-id'
import type { Connection } from './index'
import { gatewayCredentialsReady, gatewayRoot } from './model-gateway'

/** Host-managed provider settings are verified starting with Claude Code 2.1.302. */
export function assertClaudeGatewayVersion(connection: Connection | undefined, version: string | undefined) {
  if (!connection?.gateway) return
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '')?.slice(1).map(Number)
  if (!parts || parts[0] !== 2 || parts[1] < 1 || parts[1] === 1 && parts[2] < 302) throw new Error('Magpie明确来源需要Claude Code 2.1.302或更新的2.x版本，请先核对程序')
}

export function claudeProvider(connection: Connection | undefined, modelOverride: string) {
  if (!connection || (connection.gateway ? !gatewayCredentialsReady(connection) : !connection.hasApiKey)) throw new Error('Claude员工需要明确的API连接和凭据')
  const model = (modelOverride || connection.defaultModel).trim()
  if (!validModelId(model)) throw new Error('请选择Claude员工使用的模型')
  // The saved protocol selects the API path. Native Claude always uses Messages
  // against the same gateway root, without rewriting the shared connection.
  if (connection.gateway) return { baseUrl: gatewayRoot(connection.baseUrl).href.replace(/\/$/, ''), model }
  const baseUrl = connection.baseUrl.trim() || (connection.provider === 'anthropic' ? 'https://api.anthropic.com' : '')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('Claude模型来源地址无效') }
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Claude模型来源必须是HTTPS或明确本机端点')
  if (connection.provider === 'anthropic') return { baseUrl: url.href.replace(/\/$/, ''), model }
  if (connection.provider === 'openai-compatible' && url.origin === 'https://api.deepseek.com' && ['/', '/v1', '/v1/', '/anthropic', '/anthropic/'].includes(url.pathname)) return { baseUrl: 'https://api.deepseek.com/anthropic', model }
  throw new Error('此连接尚未验证为Claude可用的Anthropic协议来源，请明确配置兼容连接')
}
