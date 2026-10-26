/*
 * [INPUT]: 固定商店 API 地址、可注入 HTTP 请求与外层取消信号。
 * [OUTPUT]: 覆盖响应体的超时/体积限制、无重定向请求和运行时响应校验。
 * [POS]: 商店网络边界；不发送模型凭据，不执行远程内容。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'

const TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const hosts = new Set(['skills.sh', 'clawhub.ai', 'api.skillhub.cn'])
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === null ? undefined : value, schema.optional())
const text = optional(z.string().max(100000)), number = optional(z.number().finite().nonnegative()), flag = optional(z.boolean())
const owner = z.object({ handle: text, displayName: text, image: text })
const stats = z.object({ downloads: number, installs: number, stars: number })
const version = z.object({ version: text })
const rawSkill = z.object({
  id: text, skillId: text, slug: text, name: text, source: text, installs: number, installUrl: text, url: text, isOfficial: flag,
  ownerHandle: text, displayName: text, summary: text, summary_zh: text, description: text, description_zh: text, icon: text,
  stats: optional(stats), latestVersion: optional(version), updatedAt: optional(z.union([z.number().finite(), z.string()])), isSuspicious: flag,
  ownerName: text, owner_name: text, namespace: optional(z.object({ canonicalName: text, displayName: text, handle: text })),
  homepage: text, sourceUrl: text, iconUrl: text, icon_url: text, version: text, downloads: number, stars: number, updated_at: optional(z.union([z.number().finite(), z.string()])), verified: flag,
})
const searchSkill = rawSkill.extend({ owner: optional(owner), metrics: optional(z.object({ updatedAt: number })), native: optional(z.object({ skill: optional(rawSkill), owner: optional(owner) })), official: flag })
const skills = z.array(rawSkill).max(2000), results = z.array(searchSkill).max(2000)
const detail = z.object({ skill: rawSkill, owner: optional(owner), latestVersion: optional(version), namespace: optional(z.object({ canonicalName: text, displayName: text })), moderation: optional(z.object({ verdict: text })), securityReports: optional(z.record(z.string(), z.object({ status: text, statusText: text, reportUrl: text }))) })

function responseSchema(url: URL) {
  if (url.hostname === 'skills.sh') return z.object({ skills, count: number, total: number, hasMore: flag, page: number })
  if (url.pathname.endsWith('/search')) return z.object({ results })
  if (url.hostname === 'clawhub.ai' && url.pathname === '/api/v1/skills') return z.object({ items: skills, nextCursor: text })
  if (url.hostname === 'api.skillhub.cn' && url.pathname === '/api/skills') return z.object({ data: z.object({ skills, total: number }) })
  return detail
}

export async function fetchResponse(fetchImpl: typeof fetch, address: string): Promise<Response> {
  const url = new URL(address)
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('商店地址不受支持')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('商店请求超时')), TIMEOUT_MS)
  let response: Response | undefined
  try {
    response = await fetchImpl(url.href, { headers: { Accept: 'application/json, text/markdown;q=0.9' }, redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`商店请求失败（HTTP ${response.status}）`)
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new Error('商店响应超过大小限制')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('商店未返回内容')
    const parts: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        controller.signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_RESPONSE_BYTES) throw new Error('商店响应超过大小限制')
        parts.push(value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    return new Response(Buffer.concat(parts), { status: 200, headers: response.headers })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('商店请求超时，请重试')
    throw error
  } finally { clearTimeout(timer); if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {}) }
}

export async function fetchJson<T>(fetchImpl: typeof fetch, address: string): Promise<T> {
  const response = await fetchResponse(fetchImpl, address)
  let value: unknown
  try { value = await response.json() } catch { throw new Error('商店响应不是有效 JSON') }
  const parsed = responseSchema(new URL(address)).safeParse(value)
  if (!parsed.success) throw new Error('商店响应格式已变化，暂时无法读取')
  return parsed.data as T
}
