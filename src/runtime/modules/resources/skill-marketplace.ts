/*
 * [INPUT]: Desktop IPC 查询、商店适配器和可注入 HTTP。
 * [OUTPUT]: 经过能力校验的商店列表/详情、五分钟安装前绕过展示缓存重新取源、有界缓存、请求去重与取消。
 * [POS]: 商店只读用例；网络不占用 AppService 的业务写锁。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { z } from 'zod'
import { skillMarketplaces, type SkillMarketplaceProvider, type MarketplaceResult, type SkillMarketplaceItem, type SkillMarketplaceListResult } from '../../../shared/domain/skill-marketplace'
import { getSkillMarketplaceDetail, listSkillMarketplace } from './marketplace-providers'

const TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 100
export const marketplaceProviderSchema = z.enum(['skills-sh', 'clawhub', 'skillhub'])
export const marketplaceListSchema = z.object({ provider: marketplaceProviderSchema, query: z.string().trim().max(300).optional(), sort: z.enum(['all-time', 'recommended', 'downloads', 'trending', 'hot', 'updated']).optional(), limit: z.number().int().min(1).max(50).optional(), page: z.number().int().min(0).max(10000).optional(), cursor: z.string().max(10000).optional() }).strict().superRefine((request, context) => {
  const capability = skillMarketplaces[request.provider]
  if (request.query && request.query.length < capability.minQueryLength) context.addIssue({ code: 'custom', message: `${capability.label} 搜索至少需要 ${capability.minQueryLength} 个字符` })
  if (request.sort && !capability.sorts.some(sort => sort.value === request.sort)) context.addIssue({ code: 'custom', message: '此商店不支持所选排序' })
  if (capability.pagination === 'page' && request.cursor) context.addIssue({ code: 'custom', message: '此商店不支持游标分页' })
  if (capability.pagination === 'cursor' && request.page) context.addIssue({ code: 'custom', message: '此商店需使用游标分页' })
  if (request.query && (request.cursor || request.page)) context.addIssue({ code: 'custom', message: '此商店的搜索不支持翻页' })
})
export const marketplaceDetailSchema = z.object({ provider: marketplaceProviderSchema, id: z.string().trim().min(1).max(1000) }).strict()
type Entry = { value: unknown; fetchedAt: string; expiresAt: number }

export class SkillMarketplace {
  private caches = { list: new Map<string, Entry>(), detail: new Map<string, Entry>() }
  private requests = new Map<string, { provider: SkillMarketplaceProvider; controller: AbortController; promise: Promise<MarketplaceResult<unknown>> }>()
  private generations = new Map<SkillMarketplaceProvider, number>()
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  list(input: unknown): Promise<MarketplaceResult<SkillMarketplaceListResult>> {
    const request = marketplaceListSchema.parse(input)
    const normalized = { ...request, query: request.query ?? '', sort: request.sort ?? skillMarketplaces[request.provider].sorts[0].value, limit: request.limit ?? 30, page: request.page ?? 0, cursor: request.cursor ?? '' }
    return this.load('list', request.provider, JSON.stringify(normalized), async fetchImpl => {
      const result = await listSkillMarketplace(normalized, fetchImpl)
      if (result.nextCursor && result.nextCursor === request.cursor) throw new Error('商店返回了重复游标，请刷新后重试')
      result.items = [...new Map(result.items.filter(item => item.suspicious !== true).map(item => [item.id, item])).values()]
      return result
    })
  }
  detail(input: unknown): Promise<MarketplaceResult<SkillMarketplaceItem>> {
    const request = marketplaceDetailSchema.parse(input)
    return this.load('detail', request.provider, JSON.stringify(request), fetchImpl => getSkillMarketplaceDetail(request, fetchImpl))
  }
  freshDetail(input: unknown, signal: AbortSignal): Promise<SkillMarketplaceItem> {
    const request = marketplaceDetailSchema.parse(input)
    return getSkillMarketplaceDetail(request, (url, options) => this.fetchImpl(url, { ...options, signal: AbortSignal.any([signal, ...(options?.signal ? [options.signal] : [])]) }))
  }
  invalidate(provider: SkillMarketplaceProvider) {
    this.generations.set(provider, (this.generations.get(provider) ?? 0) + 1)
    for (const cache of Object.values(this.caches)) for (const [key, entry] of cache) if (key.startsWith(provider + ':')) entry.expiresAt = 0
    for (const request of this.requests.values()) if (request.provider === provider) request.controller.abort(new Error('商店请求已取消'))
  }
  private load<T>(kind: 'list' | 'detail', provider: SkillMarketplaceProvider, key: string, fetchValue: (fetchImpl: typeof fetch) => Promise<T>): Promise<MarketplaceResult<T>> {
    key = provider + ':' + key
    const cache = this.caches[kind], entry = cache.get(key)
    if (entry && entry.expiresAt > Date.now()) return Promise.resolve(structuredClone({ value: entry.value as T, fetchedAt: entry.fetchedAt, stale: false }))
    const generation = this.generations.get(provider) ?? 0, requestKey = kind + ':' + generation + ':' + key
    const pending = this.requests.get(requestKey)
    if (pending) return pending.promise.then(value => structuredClone(value) as MarketplaceResult<T>)
    const controller = new AbortController()
    const boundedFetch: typeof fetch = (url, options) => this.fetchImpl(url, { ...options, signal: AbortSignal.any([controller.signal, ...(options?.signal ? [options.signal] : [])]) })
    const promise = fetchValue(boundedFetch).then(value => {
      const fetchedAt = new Date().toISOString()
      if (generation === (this.generations.get(provider) ?? 0) && !controller.signal.aborted) {
        cache.delete(key); cache.set(key, { value, fetchedAt, expiresAt: Date.now() + TTL_MS })
        while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
      }
      return { value, fetchedAt, stale: false }
    }).catch(error => {
      if (entry && !controller.signal.aborted) return { value: entry.value as T, fetchedAt: entry.fetchedAt, stale: true, error: error instanceof Error ? error.message : String(error) }
      throw error
    }).finally(() => this.requests.delete(requestKey))
    this.requests.set(requestKey, { provider, controller, promise })
    return promise.then(value => structuredClone(value))
  }
  async close() {
    for (const request of this.requests.values()) request.controller.abort(new Error('应用退出'))
    await Promise.allSettled([...this.requests.values()].map(request => request.promise))
    this.caches.list.clear(); this.caches.detail.clear()
  }
}
