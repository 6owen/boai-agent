/*
 * [INPUT]: 员工明确选择的既有模型连接及模型覆盖。
 * [OUTPUT]: Anthropic协议来源/模型；DeepSeek仅映射已知官方端点，其他OpenAI协议不推断兼容。
 * [POS]: Claude模型来源校验，不读取密钥、不调用模型、不回退Mastra。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { Connection } from '../../../shared/domain'

export function claudeProvider(connection: Connection | undefined, modelOverride: string) {
  if (!connection?.hasApiKey) throw new Error('Claude员工需要明确的API连接和凭据')
  const model = (modelOverride || connection.defaultModel).trim()
  if (!model || model.length > 200) throw new Error('请选择Claude员工使用的模型')
  const baseUrl = connection.baseUrl.trim() || (connection.provider === 'anthropic' ? 'https://api.anthropic.com' : '')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('Claude模型来源地址无效') }
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Claude模型来源必须是HTTPS或明确本机端点')
  if (connection.provider === 'anthropic') return { baseUrl: url.href.replace(/\/$/, ''), model }
  if (connection.provider === 'openai-compatible' && url.origin === 'https://api.deepseek.com' && ['/', '/v1', '/v1/', '/anthropic', '/anthropic/'].includes(url.pathname)) return { baseUrl: 'https://api.deepseek.com/anthropic', model }
  throw new Error('此连接尚未验证为Claude可用的Anthropic协议来源，请明确配置兼容连接')
}
