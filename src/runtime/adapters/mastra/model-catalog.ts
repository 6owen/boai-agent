/*
 * [OUTPUT]: 原生插件缺少当前目录时可做取消绑定的有界只读读取，目录失败不冒充推理失败。
 * [OUTPUT]: 模型ID共用1000字符/无控制符边界，完整供应商前缀及原生模型名不截断。
 * [INPUT]: 兼容接口 API 根地址、运行进程解析的凭据与标准 models 响应。
 * [OUTPUT]: 有超时/体积/重定向限制的结构化模型目录及旧ID投影；Magpie只读识别不触发模型推理。
 * [POS]: Mastra 模型连接的目录 HTTP 适配；不保存连接或凭据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { MODEL_ID_MAX_LENGTH, validModelId } from '../../../shared/domain/model-id'
import { z } from 'zod'
import { gatewayEndpoint, gatewayRoot, type GatewayIdentity, type ModelCatalog, type ModelCatalogEntry } from '../../../shared/domain/model-gateway'

const MODEL_CATALOG_TIMEOUT_MS = 15_000
const modelListSchema = z.object({ data: z.array(z.unknown()).max(5000) })
const label = z.string().min(1).max(1000)
const modelSchema = z.object({ id: z.string().max(MODEL_ID_MAX_LENGTH).refine(value => validModelId(value) && value === value.trim()), display_name: label.optional().catch(undefined), owned_by: label.optional().catch(undefined), reasoning: z.boolean().optional().catch(undefined),
  supported_reasoning_levels: z.array(z.object({ effort: z.string().regex(/^[a-z0-9_-]{1,40}$/) })).max(40).optional().catch(undefined),
  context_window: z.number().int().positive().optional().catch(undefined), max_output_tokens: z.number().int().positive().optional().catch(undefined),
  modalities: z.object({ input: z.array(label).max(20).optional(), output: z.array(label).max(20).optional() }).optional().catch(undefined),
  native_endpoints: z.array(label).max(20).optional().catch(undefined),
})

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('模型服务未返回有效内容')
  const chunks: Uint8Array[] = []; let length = 0
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      length += part.value.byteLength
      if (length > 2 * 1024 * 1024) throw new Error('模型服务响应超过大小限制')
      chunks.push(part.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function probeMagpie(baseUrl: string): Promise<GatewayIdentity> {
  const root = gatewayRoot(baseUrl), signal = AbortSignal.timeout(5000)
  try {
    const response = await fetch(gatewayEndpoint(root.href, 'api/hello'), { redirect: 'error', signal, headers: { Accept: 'application/json' } })
    if (!response.ok) { await response.body?.cancel(); throw new Error('unavailable') }
    const identity = z.object({ name: z.literal('magpie'), version: z.string().min(1).max(100) }).parse(await boundedJson(response))
    return { ...identity, baseUrl: root.href.replace(/\/$/, '') }
  } catch { throw new Error(signal.aborted ? '检测 Magpie 超时，请确认软件正在运行' : '此地址未识别为 Magpie，请确认地址和运行状态') }
}

export function modelCatalogUrl(baseUrl: string): string {
  let url: URL
  try { url = new URL(baseUrl.trim()) } catch { throw new Error('请填写有效的 API 根地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址必须为不含凭据的 HTTP 或 HTTPS URL')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`
  url.hash = ''
  return url.href
}

export async function listModelCatalog(baseUrl: string, apiKey: string, parentSignal?: AbortSignal): Promise<ModelCatalog> {
  const url = modelCatalogUrl(baseUrl)
  const timeout = AbortSignal.timeout(MODEL_CATALOG_TIMEOUT_MS)
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout
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
  try { body = await boundedJson(response) } catch { throw new Error(signal.aborted ? '获取模型列表超时，请重试或手动填写模型 ID' : '模型列表格式无效或超出大小限制，请手动填写模型 ID') }
  const parsed = modelListSchema.safeParse(body)
  if (!parsed.success) throw new Error('模型列表格式无效，请手动填写模型 ID')
  const models = new Map<string, ModelCatalogEntry>()
  for (const item of parsed.data.data) {
    const model = modelSchema.safeParse(item)
    if (!model.success || models.has(model.data.id) || apiKey && JSON.stringify(model.data).includes(apiKey)) continue
    const m = model.data
    models.set(m.id, { id: m.id, ...(m.display_name ? { name: m.display_name } : {}), ...(m.owned_by ? { provider: m.owned_by } : {}),
      ...(m.reasoning !== undefined ? { reasoning: m.reasoning } : {}), ...(m.supported_reasoning_levels ? { reasoningLevels: [...new Set(m.supported_reasoning_levels.map(value => value.effort))] } : {}),
      ...(m.context_window ? { contextWindow: m.context_window } : {}), ...(m.max_output_tokens ? { maxOutputTokens: m.max_output_tokens } : {}),
      ...(m.modalities ? { modalities: m.modalities } : {}), ...(m.native_endpoints ? { nativeEndpoints: m.native_endpoints } : {}) })
  }
  return { models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)), fetchedAt: new Date().toISOString(), source: 'service-declared' }
}

export async function listCompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return (await listModelCatalog(baseUrl, apiKey)).models.map(model => model.id)
}
