/*
 * [OUTPUT]: 2026-10-19 支持独立连接集合，检索实例不修改业务源员工绑定；Jina 测试一次实际查询。
 * [OUTPUT]: 员工目录上下文传给本地源/MCP；stdio许可改变先排空旧进程再为新调用建会话，不重放旧工具。
 * [OUTPUT]: DeepSeek自定义GET测试端点保持原语义；默认测试才执行一次明确查询。
 * [OUTPUT]: DeepSeek核准POST走只读搜索授权；明确测试执行一次真实查询，不以静态目录宣称连接成功。
 * [OUTPUT]: 搜索候选与web-read准入共用Tavily/Exa识别，仍只执行实际核准工具和原员工权限。
 * [OUTPUT]: 首选来源按员工授权保存；主动解绑重置自动，全局删除保留失效首选；工具前回调携带实际分类。
 * [OUTPUT]: 普通问答web-read仅连接已识别搜索候选并返回核准只读工具；其余来源/工具在调用前拒绝，不启动本地进程。
 * [OUTPUT]: 桌面编辑器可按固定ID/版本读取已保存凭据，公共目录及员工工具仍不携带密钥。
 * [OUTPUT]: 普通会话修改/删除/绑定在提交前核验当前授权；测试接入来源取消并再次核验。
 * [OUTPUT]: 会话创建与sourceCreations回执同事务；同消息/稳定键重复核对原源，配置变化或原源删除不重新创建。
 * [OUTPUT]: 包贡献以宿主来源标记和统一授权门禁发现/调用，应用目录来源沿原Source保存。
 * [OUTPUT]: 暂存新凭据先登记清理身份，配置提交同事务切换待办；旧凭据删除失败沿原回执/包恢复/启动重试；OAuth管理在实际操作前复核捕获的运行授权。
 * [INPUT]: ProductStore, encrypted SecretStore, employee registry and explicit versioned requests.
 * [OUTPUT]: Connection-only source configuration, legacy access-flag migration, employee bindings and scoped sessions; no startup calls.
 * [POS]: Sole data-source lifecycle authority; saved credentials never enter public DTOs or execution tools; creation accepts only user-supplied credentials.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { SourceOAuth } from './source-oauth'
import type { SourceOAuthStatus } from '@boai/shared/domain/sources'
import { applicationPreset } from '@boai/shared/domain/resource-catalog'
import type { SourcePackageOrigin } from '@boai/shared/domain/sources'
import type { DigitalAgent } from '@boai/shared/domain'
import { dataSourceConfigSchema, saveDataSourceSchema, dataSourceIdentitySchema, dataSourceBindingsSchema, supportsDataSources, webSearchProvider, type DataSource, type DataSourceCreationSource, type SourceCall, type SourceSummary, type SourceTool } from '@boai/shared/domain/sources'
import type { SecretStore } from '../../contracts'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import { openSourceSession, recoverSourceProcesses, sourceFolder, redactSourceValue, SOURCE_TIMEOUT, type SourceSession } from './source-provider'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import type { WebSearchPreference } from '@boai/shared/domain/sources'
import type { RunDirectoryAccess } from '../workspaces/directory-run'

type StoredSource = DataSource extends infer T ? T extends DataSource ? Omit<T, 'hasCredential'> & { credentialId?: string; oauthRevision?: number } : never : never
type SourceSecretCleanup = { id: string; sourceCollection: string; sourceId: string; credentialId?: string; oauth: boolean; packageOrigin?: SourcePackageOrigin }
const sourceSecretCleanupCollection = 'sourceSecretCleanup'
type Lease = { sourceId: string; runId: string; revision: number; directoryKey?: string; controller: AbortController; session: Promise<SourceSession>; active: Set<Promise<unknown>>; employeeId?: string; releaseCapability?: () => void; detach(): void }
interface Hooks {
  authority?(): { validate(): Promise<void>; signal: AbortSignal } | undefined
  critical<T>(action: () => Promise<T>): Promise<T>
  install(agents: DigitalAgent[]): void
  changed(sourceId: string, agents: DigitalAgent[]): Promise<void>
}
export interface SourceCapabilityGate {
  canUse(origin: SourcePackageOrigin, employeeId: string): boolean
  ready?(origin: SourcePackageOrigin): Promise<void>
  acquire(origin: SourcePackageOrigin, employeeId: string, controller: AbortController): () => void
}
export class SourceService {
  readonly oauth: SourceOAuth
  private oauthCredentials = new Set<string>()
  private secretCleanupPending = new Set<string>()
  private capabilityGate?: SourceCapabilityGate
  setCapabilityGate(gate: SourceCapabilityGate) { this.capabilityGate = gate }
  private packageAllowed(source: StoredSource, employeeId?: string) {
    return !source.capabilityPackage || !!employeeId && !!this.capabilityGate?.canUse(source.capabilityPackage, employeeId)
  }
  private assertPackage(ref: SourceSummary, employeeId?: string) {
    if (!this.packageAllowed(this.stored(ref.id), employeeId)) throw new Error('能力包未启用、未绑定当前员工或版本已变化')
  }

  private sources = new Map<string, StoredSource>()
  private leases = new Map<string, Lease>()
  private tail: Promise<unknown> = Promise.resolve()
  private closing = false
  private pendingMutations = 0
  get busy() { return this.pendingMutations > 0 || this.leases.size > 0 }
  private blocked = new Set<string>()
  constructor(private store: ProductStore, private secrets: SecretStore, private dataPath: string, private hooks: Hooks, private collection = 'dataSources') {
    this.oauth = new SourceOAuth({ secrets, validateSource: async (id, revision, url) => {
      const source = this.stored(id)
      if ((source.oauthRevision ?? source.revision) !== revision || source.type !== 'mcp' || source.mcp.transport === 'stdio' || source.mcp.authType !== 'oauth' || source.mcp.url !== url) throw new Error('OAuth 来源配置已变化或已停用')
    } })
  }
  oauthIdentity(id: string, expectedRevision: number) {
    const source = this.checkRevision(id, expectedRevision)!
    if (source.type !== 'mcp' || source.mcp.transport === 'stdio' || source.mcp.authType !== 'oauth') throw new Error('此数据源不使用OAuth')
    return { sourceId: id, revision: source.oauthRevision ?? source.revision, url: source.mcp.url }
  }
  async oauthStatus(authorizationId: string): Promise<SourceOAuthStatus> {
    const status = await this.oauth.status(authorizationId)
    if (status.status === 'authorized') {
      const source = this.sources.get(status.sourceId)
      if (source && (source.oauthRevision ?? source.revision) === status.revision && await this.oauth.hasCredential(this.oauthIdentity(source.id, source.revision))) {
        this.oauthCredentials.add(source.id); await this.hooks.changed(source.id, [])
      } else { this.oauthCredentials.delete(status.sourceId); await this.hooks.changed(status.sourceId, []) }
    }
    return status
  }
  async startOAuth(id: string, expectedRevision: number, requestId: string, clientMetadataUrl?: string) {
    const authority = this.hooks.authority?.()
    const validate = async () => { authority?.signal.throwIfAborted(); await authority?.validate(); authority?.signal.throwIfAborted() }
    return this.enqueue(async () => {
      await this.hooks.critical(validate)
      await this.hooks.critical(async () => { await validate(); await this.reconcileSecretCleanup(value => value.sourceId === id) })
      const launched = await this.hooks.critical(async () => {
        await validate()
        const identity = this.oauthIdentity(id, expectedRevision)
        if (!this.stored(id).enabled) throw new Error('请先启用数据源')
        // The user may finish browser consent after the employee run ends; keep its long-lived state independent.
        return { pending: this.oauth.start({ ...identity, requestId, clientMetadataUrl }) }
      })
      return launched.pending
    })
  }
  async disconnectOAuth(id: string, expectedRevision: number) {
    const authority = this.hooks.authority?.()
    const validate = async () => { authority?.signal.throwIfAborted(); await authority?.validate(); authority?.signal.throwIfAborted() }
    return this.enqueue(async () => {
      await this.hooks.critical(validate)
      return this.mutation(id, async () => {
        await this.hooks.critical(async () => {
          await validate()
          const identity = this.oauthIdentity(id, expectedRevision)
          await this.oauth.disconnect(identity)
          this.oauthCredentials.delete(id)
        })
        await this.hooks.changed(id, [])
        return this.get(id)
      })
    })
  }
  async init() {
    if (this.collection === 'dataSources') await recoverSourceProcesses(this.dataPath)
    await this.reconcileSecretCleanup(() => true, true)
    for (const source of await this.store.load<StoredSource>(this.collection)) {
      // Old releases stored employee access policy on the shared connection.
      // Remove only those retired keys; keep identity, revisions, secrets and receipts.
      const connection = source.type === 'api' ? source.api : source.type === 'local' ? source.local : undefined
      if (connection && ('allowWrites' in connection || 'accessMode' in connection)) {
        Reflect.deleteProperty(connection, 'allowWrites'); Reflect.deleteProperty(connection, 'accessMode')
        dataSourceConfigSchema.parse(this.config(source))
        await this.store.write([{ collection: this.collection, id: source.id, value: source }])
      }
      dataSourceConfigSchema.parse(this.config(source)); this.sources.set(source.id, source)
      if (source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth' && await this.oauth.hasCredential(this.oauthIdentity(source.id, source.revision))) this.oauthCredentials.add(source.id)
    }
  }
  private config(source: StoredSource) {
    const { id: _id, revision: _rev, createdAt: _created, updatedAt: _updated, test: _test, creationSource: _creation, applicationOrigin: _application, capabilityPackage: _package, oauthRevision: _oauthRevision, credentialId: _credential, ...config } = source
    return config
  }
  private secretCleanup(source: StoredSource, nextCredentialId?: string): SourceSecretCleanup | undefined {
    const credentialId = source.credentialId !== nextCredentialId ? source.credentialId : undefined
    const oauth = source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth'
    return credentialId || oauth ? { id: randomUUID(), sourceCollection: this.collection, sourceId: source.id, credentialId, oauth, ...(source.capabilityPackage ? { packageOrigin: source.capabilityPackage } : {}) } : undefined
  }
  private async reconcileSecretCleanup(matches: (value: SourceSecretCleanup) => boolean = () => true, tolerateFailure = false) {
    const pending = (await this.store.load<SourceSecretCleanup>(sourceSecretCleanupCollection)).filter(value => value.sourceCollection === this.collection)
    this.secretCleanupPending = new Set(pending.map(value => value.sourceId))
    const completed = new Set<string>()
    for (const value of pending.filter(matches)) {
      try {
        // Cleanup is idempotent, and must never delete a credential still referenced by the committed source.
        if (value.credentialId) {
          const current = await this.store.get<StoredSource>(this.collection, value.sourceId)
          if (current?.credentialId === value.credentialId) throw new Error('凭据仍被当前数据源引用')
          await this.secrets.delete(value.credentialId)
        }
        // New consent starts only after this source's old journal has been reconciled.
        if (value.oauth) { await this.oauth.forgetSource(value.sourceId); this.oauthCredentials.delete(value.sourceId) }
        await this.store.transaction(tx => tx.remove(sourceSecretCleanupCollection, value.id))
        completed.add(value.id)
        if (!pending.some(other => other.sourceId === value.sourceId && !completed.has(other.id))) this.secretCleanupPending.delete(value.sourceId)
      } catch { if (!tolerateFailure) throw new Error('数据源旧凭据清理尚未完成，请核对原操作后重试') }
    }
  }
  /** Host-only recovery of committed package cleanup, including sources already removed from the catalog. */
  reconcileManagedCleanup(origin: SourcePackageOrigin): Promise<void> {
    return this.enqueue(() => this.reconcileSecretCleanup(value => value.packageOrigin?.installationId === origin.installationId && value.packageOrigin.contributionId === origin.contributionId && value.packageOrigin.version === origin.version))
  }
  private public(source: StoredSource): DataSource {
    const { credentialId, oauthRevision: _oauthRevision, ...value } = source
    return structuredClone({ ...value, hasCredential: !this.secretCleanupPending.has(source.id) && (source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth' ? this.oauthCredentials.has(source.id) : !!credentialId) })
  }
  list() { return [...this.sources.values()].map(source => this.public(source)).sort((a, b) => a.name.localeCompare(b.name)) }
  get(id: string) { return this.public(this.stored(id)) }
  getCredential(input: unknown) {
    const value = dataSourceIdentitySchema.parse(input)
    return this.enqueue(async () => {
      const source = this.checkRevision(value.id, value.expectedRevision)!
      if (source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth') throw new Error('OAuth凭据不能在编辑器读取')
      if (!source.credentialId) return ''
      const credential = await this.secrets.get(source.credentialId)
      this.checkRevision(value.id, value.expectedRevision)
      if (credential === undefined) throw new Error('无法读取已保存的数据源凭据，请稍后重试')
      return credential
    })
  }
  private stored(id: string) { const source = this.sources.get(id); if (!source) throw new Error('数据源不存在'); return source }
  summaries(ids: string[] = [], employeeId?: string): SourceSummary[] { return ids.flatMap(id => { const source = this.sources.get(id); return source?.enabled && this.packageAllowed(source, employeeId) ? [{ id, revision: source.revision, name: source.name, description: source.description, type: source.type, ...(webSearchProvider(this.public(source)) ? { webSearchProvider: webSearchProvider(this.public(source)) } : {}) }] : [] }) }
  allSummaries(employeeId?: string) { return this.summaries([...this.sources.keys()], employeeId) }
  validateBindings(ids: string[], backend?: string) {
    if (ids.length && !supportsDataSources(backend)) throw new Error('此运行方式尚不支持数据源')
    for (const id of ids) this.stored(id)
  }
  assertCurrent(refs: SourceSummary[]) { for (const ref of refs) { const current = this.sources.get(ref.id); if (!current?.enabled || current.revision !== ref.revision || this.blocked.has(ref.id)) throw new Error('数据源配置或授权已变化，请重新执行') } }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('数据源服务正在退出'))
    this.pendingMutations++
    const next = this.tail.then(action).finally(() => { this.pendingMutations-- }); this.tail = next.catch(() => {}); return next
  }
  normalizeSearchPreference(input: WebSearchPreference | undefined, previous: DigitalAgent | undefined, sourceIds: string[]): WebSearchPreference | undefined {
    const preference = input ?? previous?.webSearch
    if (!preference) return undefined
    if (preference.mode !== 'source') return preference
    const unchanged = previous?.webSearch?.mode === 'source' && previous.webSearch.sourceId === preference.sourceId
    if (unchanged && !isCoreAgent(previous) && previous.sourceIds?.includes(preference.sourceId) && !sourceIds.includes(preference.sourceId)) return { mode: 'auto' }
    // Preserve an unavailable saved preference for unrelated edits; never silently substitute it in configuration.
    if (unchanged) return preference
    const source = this.sources.get(preference.sourceId)
    if (!source?.enabled || !webSearchProvider(this.public(source)) || !isCoreAgent(previous) && !sourceIds.includes(preference.sourceId)) throw new Error('首选检索来源必须是当前员工可用的搜索数据源')
    return preference
  }
  private async changedAgents(tx: RecordTransaction, sourceId: string, selected?: Set<string>, resetPreference = false) {
    const agents: DigitalAgent[] = []
    if (this.collection !== 'dataSources') return agents
    for (const agent of await tx.list<DigitalAgent>('agents')) {
      const bound = (agent.sourceIds ?? []).includes(sourceId), shouldBind = selected ? selected.has(agent.id) : bound
      if (!bound && !shouldBind) continue
      const updated = { ...agent, ...(resetPreference && bound && !shouldBind && agent.webSearch?.mode === 'source' && agent.webSearch.sourceId === sourceId ? { webSearch: { mode: 'auto' as const } } : {}), sourceIds: [...(agent.sourceIds ?? []).filter(id => id !== sourceId), ...(shouldBind ? [sourceId] : [])], configVersion: agent.configVersion + 1 }
      await tx.put({ collection: 'agents', id: agent.id, value: updated }); agents.push(updated)
    }
    return agents
  }
  private checkRevision(id: string, revision: number) {
    const previous = this.sources.get(id)
    if ((previous?.revision ?? 0) !== revision) throw new Error('数据源已变化，请刷新后操作')
    return previous
  }
  private async mutation<T>(id: string, action: () => Promise<T>): Promise<T> {
    await this.oauth.cancelSource(id)
    this.blocked.add(id)
    try { await this.drain(lease => lease.sourceId === id); return await action() }
    finally { this.blocked.delete(id) }
  }
  saveManaged(input: unknown, origin: SourcePackageOrigin, requestId?: string, validate?: () => Promise<void>) {
    const creation = requestId ? { requestId: `capability:${requestId}`, fingerprint: createHash('sha256').update(JSON.stringify([input, origin])).digest('hex'), validate: validate ?? (async () => {}) } : undefined
    return this.save(input, creation, validate, origin)
  }
  async managedSaveReceipt(requestId: string) {
    return this.enqueue(async () => {
      const receipt = await this.store.get<{ sourceId: string; result?: DataSource }>('sourceCreations', `capability:${requestId}`)
      if (receipt) await this.reconcileSecretCleanup(value => value.sourceId === receipt.sourceId)
      return receipt?.result
    })
  }
  save(input: unknown, creation?: { requestId: string; fingerprint: string; source?: DataSourceCreationSource; validate(): Promise<void> }, validate = creation?.validate, packageOrigin?: SourcePackageOrigin) {
    const value = saveDataSourceSchema.parse(input)
    return this.enqueue(async () => {
      if (validate) await this.hooks.critical(validate)
      return this.mutation(value.id, async () => {
      await this.reconcileSecretCleanup(pending => pending.sourceId === value.id)
      if (creation) {
        await creation.validate()
        const receipt = await this.store.get<{ sourceId: string; fingerprint: string; result?: DataSource }>('sourceCreations', creation.requestId)
        if (receipt) {
          if (receipt.fingerprint !== creation.fingerprint) throw new Error('创建请求已用于不同的数据源配置')
          this.stored(receipt.sourceId)
          return receipt.result ?? this.get(receipt.sourceId)
        }
      }
      const previous = this.checkRevision(value.id, value.expectedRevision)
      if (previous?.capabilityPackage && (!packageOrigin || JSON.stringify(previous.capabilityPackage) !== JSON.stringify(packageOrigin))) throw new Error('此数据源由能力包管理，请通过原包配置或更新')
      if (packageOrigin && previous && !previous.capabilityPackage) throw new Error('不能将已有普通数据源认领为包所有')
      if (value.applicationOrigin && !applicationPreset(value.applicationOrigin.applicationId, value.applicationOrigin.version)) throw new Error('应用预设不存在或版本已变化')
      if (previous?.applicationOrigin && value.applicationOrigin && JSON.stringify(previous.applicationOrigin) !== JSON.stringify(value.applicationOrigin)) throw new Error('不能更改已有连接的应用来源')
      const config = value.config.type === 'local' ? { ...value.config, local: { ...value.config.local, path: await sourceFolder(value.config.local.path) } } : value.config
      if (previous && previous.type !== config.type) throw new Error('请新建另一类型的数据源')
      if (config.type === 'mcp' && config.mcp.transport !== 'stdio' && config.mcp.authType === 'oauth' && value.credential !== undefined) throw new Error('OAuth连接必须通过授权入口配置')
      if (value.credential) {
        try {
          if (config.type === 'mcp' && config.mcp.transport === 'stdio') z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).parse(JSON.parse(value.credential))
          if (config.type === 'api' && config.api.authType === 'basic') z.object({ username: z.string().min(1), password: z.string().min(1) }).strict().parse(JSON.parse(value.credential))
        } catch { throw new Error('凭据格式无效，请核对 JSON 对象和字段') }
      }
      const credentialId = value.credential === undefined ? previous?.credentialId : value.credential ? `source:${value.id}:${randomUUID()}` : undefined
      const staged: SourceSecretCleanup | undefined = credentialId && credentialId !== previous?.credentialId ? { id: randomUUID(), sourceCollection: this.collection, sourceId: value.id, credentialId, oauth: false, ...(packageOrigin ? { packageOrigin } : {}) } : undefined
      const timestamp = new Date().toISOString()
      const source: StoredSource = { ...config, id: value.id, revision: value.expectedRevision + 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, credentialId, ...(config.type === 'mcp' && config.mcp.transport !== 'stdio' && config.mcp.authType === 'oauth' ? { oauthRevision: value.expectedRevision + 1 } : {}), ...((value.applicationOrigin ?? previous?.applicationOrigin) ? { applicationOrigin: value.applicationOrigin ?? previous?.applicationOrigin } : {}), ...(packageOrigin ? { capabilityPackage: packageOrigin } : {}), ...((creation?.source ?? previous?.creationSource) ? { creationSource: creation?.source ?? previous?.creationSource } : {}) }
      const cleanup = previous ? this.secretCleanup(previous, credentialId) : undefined
      let agents: DigitalAgent[] = []
      try {
        if (staged) {
          // Write the key identity before SecretStore: a crash or a failed set response cannot strand an unreferenced secret.
          await this.store.write([{ collection: sourceSecretCleanupCollection, id: staged.id, value: staged }])
          this.secretCleanupPending.add(source.id)
          try { await this.secrets.set(staged.credentialId!, value.credential!) } catch { throw new Error('数据源凭据保存未确认完成，请核对原操作') }
        }
        await this.hooks.critical(async () => {
          await validate?.()
          this.checkRevision(value.id, value.expectedRevision)
          agents = await this.store.transaction(async tx => { if (creation) await tx.put({ collection: 'sourceCreations', id: creation.requestId, value: { sourceId: source.id, fingerprint: creation.fingerprint, result: { ...this.public(source), hasCredential: source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth' ? false : !!credentialId }, ...creation.source } }); await tx.put({ collection: this.collection, id: source.id, value: source }); if (staged) await tx.remove(sourceSecretCleanupCollection, staged.id); if (cleanup) await tx.put({ collection: sourceSecretCleanupCollection, id: cleanup.id, value: cleanup }); return this.changedAgents(tx, source.id) })
          this.sources.set(source.id, source); this.oauthCredentials.delete(source.id); if (cleanup) this.secretCleanupPending.add(source.id); this.hooks.install(agents)
        })
      } catch (error) {
        // The persisted intent proves which staged key is unreferenced; never compensate an unknown commit blindly.
        const committed = await this.store.get<StoredSource>(this.collection, source.id)
        if (cleanup && committed?.revision === source.revision) this.secretCleanupPending.add(source.id)
        if (staged && committed?.credentialId !== credentialId) await this.reconcileSecretCleanup(pending => pending.id === staged.id)
        throw error
      }
      await this.reconcileSecretCleanup(pending => pending.sourceId === source.id)
      await this.hooks.changed(source.id, agents)
      return this.public(source)
      })
    })
  }
  bind(input: unknown, validate?: () => Promise<void>) {
    const value = dataSourceBindingsSchema.parse(input)
    if (this.stored(value.id).capabilityPackage) throw new Error('能力包数据源请通过包绑定员工')
    if (new Set(value.agents.map(agent => agent.id)).size !== value.agents.length) throw new Error('不能重复绑定同一员工')
    return this.enqueue(() => this.mutation(value.id, async () => {
      let agents: DigitalAgent[] = []
      const source = await this.hooks.critical(async () => {
        await validate?.()
        const previous = this.checkRevision(value.id, value.expectedRevision)!
        const next = { ...previous, revision: previous.revision + 1, updatedAt: new Date().toISOString() }
        agents = await this.store.transaction(async tx => {
          const bound = (await tx.list<DigitalAgent>('agents')).filter(agent => agent.sourceIds?.includes(value.id))
          if (bound.length !== value.expectedBindings.length || bound.some(agent => !value.expectedBindings.some(binding => binding.id === agent.id && binding.expectedConfigVersion === agent.configVersion))) throw new Error('员工绑定已变化，请重新打开绑定列表')
          for (const binding of value.agents) {
            const agent = await tx.get<DigitalAgent>('agents', binding.id)
            if (!agent || agent.configVersion !== binding.expectedConfigVersion) throw new Error('员工配置已变化，请刷新后绑定')
            this.validateBindings([value.id], agent.executionBackend?.kind)
          }
          await tx.put({ collection: this.collection, id: next.id, value: next })
          return this.changedAgents(tx, next.id, new Set(value.agents.map(agent => agent.id)), true)
        })
        this.sources.set(next.id, next); this.hooks.install(agents); return next
      })
      await this.hooks.changed(source.id, agents); return this.public(source)
    }))
  }
  removeManaged(input: unknown, origin: SourcePackageOrigin) { return this.remove(input, undefined, origin) }
  remove(input: unknown, validate?: () => Promise<void>, packageOrigin?: SourcePackageOrigin) {
    const value = dataSourceIdentitySchema.parse(input)
    return this.enqueue(async () => {
      return this.mutation(value.id, async () => {
      await this.reconcileSecretCleanup(pending => pending.sourceId === value.id)
      const previous = this.checkRevision(value.id, value.expectedRevision)!
      if (previous.capabilityPackage && (!packageOrigin || JSON.stringify(packageOrigin) !== JSON.stringify(previous.capabilityPackage))) throw new Error('能力包数据源请通过原包卸载')
      let agents: DigitalAgent[] = []
      const cleanup = this.secretCleanup(previous)
      await this.hooks.critical(async () => {
        await validate?.()
        agents = await this.store.transaction(async tx => { await tx.remove(this.collection, value.id); if (cleanup) await tx.put({ collection: sourceSecretCleanupCollection, id: cleanup.id, value: cleanup }); return this.changedAgents(tx, value.id, new Set()) })
        this.sources.delete(value.id); this.oauthCredentials.delete(value.id); if (cleanup) this.secretCleanupPending.add(value.id); this.hooks.install(agents)
      })
      await this.reconcileSecretCleanup(pending => pending.sourceId === previous.id)
      await this.hooks.changed(value.id, agents)
      })
    })
  }
  private async lease(ref: SourceSummary, runId: string, signal: AbortSignal, directories?: RunDirectoryAccess, employeeId?: string): Promise<Lease> {
    signal.throwIfAborted(); if (this.closing) throw new Error('数据源服务正在退出')
    if (this.secretCleanupPending.has(ref.id)) await this.enqueue(() => this.reconcileSecretCleanup(value => value.sourceId === ref.id))
    this.assertCurrent([ref]); this.assertPackage(ref, employeeId)
    const origin = this.stored(ref.id).capabilityPackage
    if (origin) await this.capabilityGate!.ready?.(origin)
    signal.throwIfAborted(); this.assertCurrent([ref]); this.assertPackage(ref, employeeId)
    const key = `${runId}:${ref.id}`
    const source = this.stored(ref.id)
    const directoryKey = directories && source.type === 'mcp' && source.mcp.transport === 'stdio'
      ? JSON.stringify([directories.agent.executionPermission, directories.agent.directoryGrants, directories.temporaryGrants]) : undefined
    let lease = this.leases.get(key)
    if (lease && (lease.directoryKey !== directoryKey || lease.employeeId !== employeeId)) {
      await this.drain(current => current === lease)
      return this.lease(ref, runId, signal, directories, employeeId)
    }
    if (!lease) {
      const controller = new AbortController(), abort = () => controller.abort(signal.reason)
      const releaseCapability = source.capabilityPackage ? this.capabilityGate!.acquire(source.capabilityPackage, employeeId!, controller) : undefined
      signal.addEventListener('abort', abort, { once: true })
      const session = (async () => {
        const credential = source.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
        this.assertPackage(ref, employeeId); controller.signal.throwIfAborted()
        const oauth = source.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth' ? { authProvider: await this.oauth.authProvider(this.oauthIdentity(source.id, source.revision), controller.signal), fetch: this.oauth.transportFetch(this.oauthIdentity(source.id, source.revision), controller.signal) } : undefined
        return openSourceSession(this.public(source), credential, this.dataPath, controller.signal, directories, oauth)
      })()
      lease = { sourceId: ref.id, runId, revision: ref.revision, directoryKey, employeeId, releaseCapability, controller, session, active: new Set(), detach: () => signal.removeEventListener('abort', abort) }
      this.leases.set(key, lease)
    }
    if (lease.revision !== ref.revision) throw new Error('数据源会话版本已变化')
    return lease
  }
  async use(ref: SourceSummary, runId: string, signal: AbortSignal, request?: SourceCall, beforeCall?: (mutating: boolean, tool: SourceTool) => Promise<void>, mode: 'all' | 'web-read' = 'all', directories?: RunDirectoryAccess, employeeId?: string) {
    if (mode === 'web-read' && !webSearchProvider(this.public(this.stored(ref.id)))) throw new Error('普通问答仅可使用已核准的搜索或网页正文工具')
    const lease = await this.lease(ref, runId, signal, directories, employeeId)
    const operation = (async () => {
      const session = await lease.session
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref]); this.assertPackage(ref, employeeId)
      if (!request) {
        const tools = mode === 'web-read' ? session.tools.filter(tool => tool.readOnly && tool.webCapability) : session.tools
        if (mode === 'web-read' && !tools.length) throw new Error('搜索工具的当前服务版本或格式尚未核准，请核对数据源')
        return { source: ref, guide: this.stored(ref.id).guide, tools }
      }
      const tool = session.tools.find(tool => tool.name === request.tool)
      if (!tool) throw new Error('数据源不提供此工具，请先读取工具目录')
      if (mode === 'web-read' && (!tool.readOnly || !tool.webCapability)) throw new Error('普通问答不能调用未核准的搜索工具或写入操作')
      const source = this.stored(ref.id)
      const mutating = tool.readOnly && tool.webCapability ? false : source.type === 'api' ? request.arguments.method !== undefined && request.arguments.method !== 'GET' : source.type === 'local' ? request.arguments.operation === 'write' : !tool.readOnly
      await beforeCall?.(mutating, tool)
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref]); this.assertPackage(ref, employeeId)
      const result = await session.call(request.tool, request.arguments, AbortSignal.any([signal, lease.controller.signal]))
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref]); this.assertPackage(ref, employeeId); return result
    })()
    lease.active.add(operation)
    try { return await operation } catch (error) {
      const source = this.sources.get(ref.id)
      if (source?.type === 'mcp' && source.mcp.transport !== 'stdio' && source.mcp.authType === 'oauth') {
        if (!await this.oauth.hasCredential(this.oauthIdentity(source.id, source.revision))) this.oauthCredentials.delete(source.id)
        throw new Error('OAuth 数据源连接或调用失败，请核对授权')
      }
      const credential = source?.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
      throw new Error(String(redactSourceValue(error instanceof Error ? error.message : '数据源调用失败', credential)))
    } finally { lease.active.delete(operation) }
  }
  async test(input: unknown, authority?: { validate(): Promise<void>; signal: AbortSignal; directories?: RunDirectoryAccess; employeeId?: string }) {
    await authority?.validate()
    const value = dataSourceIdentitySchema.parse(input), source = this.checkRevision(value.id, value.expectedRevision)!
    if (!source.enabled) throw new Error('请先启用数据源')
    const ref = this.summaries([source.id], authority?.employeeId)[0]; if (!ref) throw new Error('测试能力包连接需要明确绑定员工'); const runId = `test:${randomUUID()}`
    let result: NonNullable<DataSource['test']>
    try {
      const output = await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(SOURCE_TIMEOUT), ...(authority ? [authority.signal] : [])]), undefined, undefined, 'all', authority?.directories, authority?.employeeId) as { tools: SourceTool[] }
      const deepseek = source.type === 'api' && source.api.testPath === '/' && webSearchProvider(this.public(source)) === 'deepseek'
      const jina = webSearchProvider(this.public(source)) === 'jina'
      if (jina) await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(90000), ...(authority ? [authority.signal] : [])]), { sourceId: source.id, tool: 'jina_search', arguments: { query: 'Jina AI' } })
      else if (deepseek) await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(SOURCE_TIMEOUT), ...(authority ? [authority.signal] : [])]), { sourceId: source.id, tool: 'deepseek_search', arguments: { query: 'DeepSeek', count: 1 } })
      else if (source.type === 'api') await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(SOURCE_TIMEOUT), ...(authority ? [authority.signal] : [])]), { sourceId: source.id, tool: 'request', arguments: { path: source.api.testPath, method: 'GET' } })
      result = { status: 'success', checkedAt: new Date().toISOString(), message: jina ? 'Jina 搜索请求成功（已执行一次测试查询）' : deepseek ? 'DeepSeek 搜索请求成功（已执行一次测试查询）' : source.type === 'mcp' ? `已读取 ${output.tools.length} 个工具` : source.type === 'local' ? '文件夹可以访问' : '测试端点请求成功', tools: output.tools.map(({ name, description }) => ({ name, description })) }
    } catch (error) {
      const credential = source.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
      result = { status: 'failed', checkedAt: new Date().toISOString(), message: String(redactSourceValue(error instanceof Error ? error.message : '连接失败', credential)).slice(0, 1000) }
    } finally { await this.closeRun(runId) }
    return this.hooks.critical(async () => {
      await authority?.validate()
      const latest = this.checkRevision(source.id, source.revision)!
      const next = { ...latest, test: result }
      await this.store.write([{ collection: this.collection, id: next.id, value: next }]); this.sources.set(next.id, next)
      return this.public(next)
    })
  }
  private async drain(matches: (lease: Lease) => boolean) {
    const selected = [...this.leases.entries()].filter(([, lease]) => matches(lease))
    for (const [, lease] of selected) lease.controller.abort(new Error('数据源调用已停止'))
    for (const [key, lease] of selected) {
      await Promise.allSettled([...lease.active])
      const session = await lease.session.catch(() => undefined)
      await session?.close(); lease.detach(); lease.releaseCapability?.(); if (this.leases.get(key) === lease) this.leases.delete(key)
    }
  }
  closeSource(sourceId: string, employeeId?: string) { return this.drain(lease => lease.sourceId === sourceId && (!employeeId || lease.employeeId === employeeId)) }
  closeRun(runId: string) { return this.drain(lease => lease.runId === runId) }
  async close() { this.closing = true; await this.oauth.close(); await this.tail; await this.drain(() => true) }
}
