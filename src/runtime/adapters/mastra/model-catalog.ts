/*
 * [INPUT]: 兼容接口 API 根地址、运行进程解析的凭据与标准 models 响应。
 * [OUTPUT]: 有超时、重定向限制和响应校验的模型目录；仅返回去重后的模型 ID。
 * [POS]: Mastra 模型连接的目录 HTTP 适配；不保存连接或凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'

const MODEL_CATALOG_TIMEOUT_MS = 15_000
const modelListSchema = z.object({ data: z.array(z.unknown()) })
const modelSchema = z.object({ id: z.string().trim().min(1).max(300) })

export function modelCatalogUrl(baseUrl: string): string {
  let url: URL
  try { url = new URL(baseUrl.trim()) } catch { throw new Error('请填写有效的 API 根地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须为不含凭据的 HTTP 或 HTTPS URL')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`
  url.hash = ''
  return url.href
}

export async function listCompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = modelCatalogUrl(baseUrl)
  const signal = AbortSignal.timeout(MODEL_CATALOG_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, redirect: 'error', signal })
  } catch {
    throw new Error(signal.aborted ? '获取模型列表超时，请重试或手动填写模型 ID' : '无法获取模型列表，请检查接口地址和网络，或手动填写模型 ID')
  }
  // Provider error bodies may echo credentials; only expose our own status descriptions.
  if (!response.ok) {
    await response.body?.cancel()
    if ([401, 403].includes(response.status)) throw new Error('获取模型列表失败，请检查 API Key 或访问权限')
    if (response.status === 404) throw new Error('该服务未提供模型列表，请检查接口地址或手动填写模型 ID')
    throw new Error(`获取模型列表失败（HTTP ${response.status}），请重试或手动填写模型 ID`)
  }
  let body: unknown
  try { body = await response.json() } catch { throw new Error(signal.aborted ? '获取模型列表超时，请重试或手动填写模型 ID' : '模型列表格式无效，请手动填写模型 ID') }
  const parsed = modelListSchema.safeParse(body)
  if (!parsed.success) throw new Error('模型列表格式无效，请手动填写模型 ID')
  const models = parsed.data.data.flatMap(item => {
    const model = modelSchema.safeParse(item)
    return model.success && (!apiKey || !model.data.id.includes(apiKey)) ? [model.data.id] : []
  })
  return [...new Set(models)].sort((a, b) => a.localeCompare(b))
}
