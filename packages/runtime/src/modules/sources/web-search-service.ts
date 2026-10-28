/*
 * [OUTPUT]: 插件配置共用v1/v2解析；DeepSeek草稿测试有界、脱敏并复核插件状态，不写连接或密钥。
 * [INPUT]: ProductStore, vault, application plugin settings and explicit search settings.
 * [OUTPUT]: Independent search connections/default, atomic legacy migration and verified read-only calls.
 * [POS]: Search capability authority; reuses transport lifecycle without employee sourceIds.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { DigitalAgent } from '@boai/shared/domain'
import { webSearchProvider, type DataSource, type SourceCall, type SourceSummary } from '@boai/shared/domain/sources'
import { saveWebSearchServiceSchema, saveWebSearchDefaultSchema, webSearchDefaultSchema, testWebSearchDraftSchema, searchConnection, searchPluginId, searchProviders, type WebSearchServiceConfig, type WebSearchSettings, type WebSearchPreference } from '@boai/shared/domain/web-search'
import { readPluginSettingsSchema } from '@boai/shared/plugins/types'
import type { SecretStore } from '../../contracts'
import type { ProductStore } from '../../adapters/storage/product-store'
import { SourceService } from './source-service'
import { openDeepSeekSearchSession } from './deepseek-search'
import { redactSourceValue, SOURCE_TIMEOUT } from './source-provider'

const collection = 'webSearchServices'
type Defaults = Pick<WebSearchSettings, 'revision' | 'default'>
export class WebSearchService {
  readonly connections: SourceService
  private defaults: Defaults = { revision: 0, default: { mode: 'browser' } }
  constructor(private store: ProductStore, secrets: SecretStore, private dataPath: string, private hooks: {
    critical<T>(action: () => Promise<T>): Promise<T>
    changed(id?: string, defaultsChanged?: boolean): Promise<void>
  }) {
    this.connections = new SourceService(store, secrets, dataPath, { critical: action => hooks.critical(action), install: () => {}, changed: id => hooks.changed(id) }, collection)
  }
  async init() {
    // Move identities and vault references in one transaction. No key copying or remote calls.
    await this.store.transaction(async tx => {
      if (await tx.get('migrations', 'independent-web-search-v1')) return
      const old = (await tx.list<DataSource>('dataSources')).filter(source => !!webSearchProvider(source))
      const ids = new Set(old.map(source => source.id))
      for (const source of old) {
        if (await tx.get(collection, source.id)) throw new Error('网页检索迁移遇到重复身份，请核对配置')
        await tx.put({ collection, id: source.id, value: source })
        await tx.remove('dataSources', source.id)
      }
      const migrateAgent = (agent: DigitalAgent): DigitalAgent => {
        const preference = agent.webSearch
        const bound = (agent.sourceIds ?? []).filter(id => ids.has(id))
        if (!bound.length && preference?.mode !== 'source') return agent
        const webSearch: WebSearchPreference = preference?.mode === 'source'
          ? { mode: 'service', serviceId: preference.sourceId }
          : preference ?? (bound.length === 1 ? { mode: 'service', serviceId: bound[0] } : { mode: 'auto' })
        return { ...agent, sourceIds: (agent.sourceIds ?? []).filter(id => !ids.has(id)), webSearch: bound.length && agent.id !== 'bobo' ? { ...webSearch, allowedServiceIds: bound } : webSearch }
      }
      for (const agent of await tx.list<DigitalAgent>('agents')) {
        const migrated = migrateAgent(agent)
        if (migrated !== agent) await tx.put({ collection: 'agents', id: agent.id, value: { ...migrated, configVersion: agent.configVersion + 1 } })
      }
      // Published history keeps its original provenance after moving the connection record.
      for (const snapshot of await tx.list<{ id: string; agent: DigitalAgent; dataSourceRefs?: SourceSummary[]; webSearchRefs?: SourceSummary[] }>('snapshots')) {
        const moved = snapshot.dataSourceRefs?.filter(ref => ids.has(ref.id)) ?? []
        const agent = migrateAgent(snapshot.agent)
        if (moved.length || agent !== snapshot.agent) await tx.put({ collection: 'snapshots', id: snapshot.id, value: { ...snapshot, agent, dataSourceRefs: snapshot.dataSourceRefs?.filter(ref => !ids.has(ref.id)), webSearchRefs: [...(snapshot.webSearchRefs ?? []), ...moved] } })
      }
      await tx.put({ collection: 'migrations', id: 'independent-web-search-v1', value: { completed: true } })
    })
    this.defaults = z.object({ revision: z.number().int().nonnegative(), default: webSearchDefaultSchema }).parse(await this.store.get<Defaults>('webSearchSettings', 'default') ?? this.defaults)
    await this.connections.init()
  }
  private async disabledPlugins() {
    try {
      const content = await readFile(join(dirname(this.dataPath), 'application-plugins.json'), 'utf8')
      if (content.length > 32768) throw new Error('插件配置过大')
      return new Set(readPluginSettingsSchema.parse(JSON.parse(content)).disabledIds)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set<string>()
      // Match PluginSettingsStore's fail-closed behavior without blocking unrelated employee chats.
      return new Set(searchProviders.map(provider => searchPluginId(provider.id)))
    }
  }
  private view(source: DataSource, disabled: Set<string>): WebSearchServiceConfig {
    const provider = webSearchProvider(source)
    if (!provider) throw new Error('未知网页检索提供方')
    return { id: source.id, revision: source.revision, provider, name: source.name, enabled: source.enabled, pluginEnabled: !disabled.has(searchPluginId(provider)), hasCredential: source.hasCredential, ...(source.test ? { test: source.test } : {}) }
  }
  async settings(): Promise<WebSearchSettings> {
    const disabled = await this.disabledPlugins()
    return { ...structuredClone(this.defaults), services: this.connections.list().map(source => this.view(source, disabled)) }
  }
  async save(input: unknown) {
    const value = saveWebSearchServiceSchema.parse(input)
    if (value.expectedRevision && webSearchProvider(this.connections.get(value.id)) !== value.provider) throw new Error('请新建另一提供方的检索服务')
    const saved = await this.connections.save({ id: value.id, expectedRevision: value.expectedRevision, config: searchConnection(value.provider, value.name, value.enabled), ...(value.credential !== undefined ? { credential: value.credential } : {}) })
    return this.view(saved, await this.disabledPlugins())
  }
  async saveDefault(input: unknown) {
    const value = saveWebSearchDefaultSchema.parse(input)
    await this.hooks.critical(async () => {
      if (this.defaults.revision !== value.expectedRevision) throw new Error('网页检索设置已变化，请刷新后重试')
      if (value.default.mode === 'service') await this.assertAvailable(value.default.serviceId)
      const next = { revision: this.defaults.revision + 1, default: value.default }
      await this.store.write([{ collection: 'webSearchSettings', id: 'default', value: next }]); this.defaults = next
    })
    await this.hooks.changed(undefined, true)
    return this.settings()
  }
  normalizePreference(input: WebSearchPreference | undefined, previous?: DigitalAgent) {
    const preference = input ?? previous?.webSearch
    if (!preference) return undefined
    if (preference.mode === 'source') throw new Error('请在独立的网页检索配置中重新选择服务')
    if (preference.mode === 'service') {
      const unchanged = previous?.webSearch?.mode === 'service' && previous.webSearch.serviceId === preference.serviceId
      if (!unchanged && !this.connections.get(preference.serviceId).enabled) throw new Error('请先启用此网页检索服务')
      if (preference.allowedServiceIds && !preference.allowedServiceIds.includes(preference.serviceId)) throw new Error('首选检索服务必须在员工可用范围内')
    }
    for (const id of preference.allowedServiceIds ?? []) if (!(previous?.webSearch && 'allowedServiceIds' in previous.webSearch && previous.webSearch.allowedServiceIds?.includes(id))) this.connections.get(id)
    return preference
  }
  effectivePreference(agent: DigitalAgent): WebSearchPreference {
    if (agent.webSearch && agent.webSearch.mode !== 'auto') return agent.webSearch
    return { ...this.defaults.default, ...(agent.webSearch?.mode === 'auto' && agent.webSearch.allowedServiceIds ? { allowedServiceIds: agent.webSearch.allowedServiceIds } : {}) }
  }
  authorized(agent: DigitalAgent, id: string) {
    const preference = agent.webSearch
    return preference?.mode !== 'disabled' && !(preference && 'allowedServiceIds' in preference && preference.allowedServiceIds && !preference.allowedServiceIds.includes(id))
  }
  async summaries(agent: DigitalAgent) {
    const disabled = await this.disabledPlugins()
    return this.connections.allSummaries().filter(source => this.authorized(agent, source.id) && !disabled.has(searchPluginId(source.webSearchProvider!)))
  }
  private async assertAvailable(id: string) {
    const source = this.connections.get(id), provider = webSearchProvider(source)
    if (!source.enabled || !provider || (await this.disabledPlugins()).has(searchPluginId(provider))) throw new Error('网页检索服务或插件已停用')
  }
  async use(ref: SourceSummary, runId: string, signal: AbortSignal, request?: SourceCall, validate?: () => Promise<void>) {
    await this.assertAvailable(ref.id)
    const result = await this.connections.use(ref, runId, signal, request, async () => { await this.assertAvailable(ref.id); await validate?.() }, 'web-read')
    await this.assertAvailable(ref.id); await validate?.()
    return result
  }
  async test(input: unknown) {
    const id = z.object({ id: z.string().uuid() }).parse(input).id
    await this.assertAvailable(id)
    const result = await this.connections.test(input)
    await this.hooks.changed()
    return this.view(result, await this.disabledPlugins())
  }
  async testDraft(input: unknown, signal: AbortSignal): Promise<NonNullable<DataSource['test']>> {
    const value = testWebSearchDraftSchema.parse(input)
    const validate = async () => {
      signal.throwIfAborted()
      if ((await this.disabledPlugins()).has(searchPluginId(value.provider))) throw new Error('网页检索插件已停用，请先在插件管理中启用')
      signal.throwIfAborted()
    }
    await validate()
    const session = openDeepSeekSearchSession(value.credential)
    try {
      await session.call('deepseek_search', { query: 'DeepSeek', count: 1 }, AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TIMEOUT)]))
      await validate()
      return { status: 'success', checkedAt: new Date().toISOString(), message: 'DeepSeek 搜索请求成功（已执行一次测试查询）' }
    } catch (error) {
      throw new Error(String(redactSourceValue(error instanceof Error ? error.message : '连接失败', value.credential)))
    } finally { await session.close() }
  }
}
