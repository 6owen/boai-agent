/*
 * [OUTPUT]: 桌面编辑器可按固定ID/版本读取已保存凭据，公共目录及员工工具仍不携带密钥。
 * [OUTPUT]: 普通会话修改/删除/绑定在提交前核验当前授权；测试接入来源取消并再次核验。
 * [OUTPUT]: 会话创建与sourceCreations回执同事务；同消息/稳定键重复核对原源，配置变化或原源删除不重新创建。
 * [INPUT]: ProductStore, encrypted SecretStore, employee registry and explicit versioned requests.
 * [OUTPUT]: Source configuration/bindings, real connection tests and scoped runtime sessions; no startup calls.
 * [POS]: Sole data-source lifecycle authority; saved credentials never enter public DTOs or execution tools; creation accepts only user-supplied credentials.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DigitalAgent } from '../../../shared/domain'
import { dataSourceConfigSchema, saveDataSourceSchema, dataSourceIdentitySchema, dataSourceBindingsSchema, supportsDataSources, type DataSource, type DataSourceCreationSource, type SourceCall, type SourceSummary, type SourceTool } from '../../../shared/domain/sources'
import type { SecretStore } from '../../contracts'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import { openSourceSession, recoverSourceProcesses, sourceFolder, redactSourceValue, SOURCE_TIMEOUT, type SourceSession } from './source-provider'

type StoredSource = DataSource extends infer T ? T extends DataSource ? Omit<T, 'hasCredential'> & { credentialId?: string } : never : never
type Lease = { sourceId: string; runId: string; revision: number; controller: AbortController; session: Promise<SourceSession>; active: Set<Promise<unknown>>; detach(): void }
interface Hooks {
  critical<T>(action: () => Promise<T>): Promise<T>
  install(agents: DigitalAgent[]): void
  changed(sourceId: string, agents: DigitalAgent[]): Promise<void>
}
export class SourceService {
  private sources = new Map<string, StoredSource>()
  private leases = new Map<string, Lease>()
  private tail: Promise<unknown> = Promise.resolve()
  private closing = false
  private pendingMutations = 0
  get busy() { return this.pendingMutations > 0 || this.leases.size > 0 }
  private blocked = new Set<string>()
  constructor(private store: ProductStore, private secrets: SecretStore, private dataPath: string, private hooks: Hooks) {}
  async init() {
    await recoverSourceProcesses(this.dataPath)
    for (const source of await this.store.load<StoredSource>('dataSources')) {
      dataSourceConfigSchema.parse(this.config(source)); this.sources.set(source.id, source)
    }
  }
  private config(source: StoredSource) {
    const { id: _id, revision: _rev, createdAt: _created, updatedAt: _updated, test: _test, creationSource: _creation, credentialId: _credential, ...config } = source
    return config
  }
  private public(source: StoredSource): DataSource {
    const { credentialId, ...value } = source
    return structuredClone({ ...value, hasCredential: !!credentialId })
  }
  list() { return [...this.sources.values()].map(source => this.public(source)).sort((a, b) => a.name.localeCompare(b.name)) }
  get(id: string) { return this.public(this.stored(id)) }
  getCredential(input: unknown) {
    const value = dataSourceIdentitySchema.parse(input)
    return this.enqueue(async () => {
      const source = this.checkRevision(value.id, value.expectedRevision)!
      if (!source.credentialId) return ''
      const credential = await this.secrets.get(source.credentialId)
      this.checkRevision(value.id, value.expectedRevision)
      if (credential === undefined) throw new Error('无法读取已保存的数据源凭据，请稍后重试')
      return credential
    })
  }
  private stored(id: string) { const source = this.sources.get(id); if (!source) throw new Error('数据源不存在'); return source }
  summaries(ids: string[] = []): SourceSummary[] { return ids.flatMap(id => { const source = this.sources.get(id); return source?.enabled ? [{ id, revision: source.revision, name: source.name, description: source.description, type: source.type }] : [] }) }
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
  private async changedAgents(tx: RecordTransaction, sourceId: string, selected?: Set<string>) {
    const agents: DigitalAgent[] = []
    for (const agent of await tx.list<DigitalAgent>('agents')) {
      const bound = (agent.sourceIds ?? []).includes(sourceId), shouldBind = selected ? selected.has(agent.id) : bound
      if (!bound && !shouldBind) continue
      const updated = { ...agent, sourceIds: [...(agent.sourceIds ?? []).filter(id => id !== sourceId), ...(shouldBind ? [sourceId] : [])], configVersion: agent.configVersion + 1 }
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
    this.blocked.add(id)
    try { await this.drain(lease => lease.sourceId === id); return await action() }
    finally { this.blocked.delete(id) }
  }
  save(input: unknown, creation?: { requestId: string; fingerprint: string; source: DataSourceCreationSource; validate(): Promise<void> }, validate = creation?.validate) {
    const value = saveDataSourceSchema.parse(input)
    return this.enqueue(() => this.mutation(value.id, async () => {
      await validate?.()
      if (creation) {
        await creation.validate()
        const receipt = await this.store.get<{ sourceId: string; fingerprint: string }>('sourceCreations', creation.requestId)
        if (receipt) {
          if (receipt.fingerprint !== creation.fingerprint) throw new Error('创建请求已用于不同的数据源配置')
          return this.get(receipt.sourceId)
        }
      }
      const previous = this.checkRevision(value.id, value.expectedRevision)
      const config = value.config.type === 'local' ? { ...value.config, local: { ...value.config.local, path: await sourceFolder(value.config.local.path) } } : value.config
      if (previous && previous.type !== config.type) throw new Error('请新建另一类型的数据源')
      if (value.credential) {
        try {
          if (config.type === 'mcp' && config.mcp.transport === 'stdio') z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).parse(JSON.parse(value.credential))
          if (config.type === 'api' && config.api.authType === 'basic') z.object({ username: z.string().min(1), password: z.string().min(1) }).strict().parse(JSON.parse(value.credential))
        } catch { throw new Error('凭据格式无效，请核对 JSON 对象和字段') }
      }
      const credentialId = value.credential === undefined ? previous?.credentialId : value.credential ? `source:${value.id}:${randomUUID()}` : undefined
      if (credentialId && credentialId !== previous?.credentialId) await this.secrets.set(credentialId, value.credential!)
      const timestamp = new Date().toISOString()
      const source: StoredSource = { ...config, id: value.id, revision: value.expectedRevision + 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, credentialId, ...((creation?.source ?? previous?.creationSource) ? { creationSource: creation?.source ?? previous?.creationSource } : {}) }
      let agents: DigitalAgent[] = []
      try {
        await this.hooks.critical(async () => {
          await validate?.()
          this.checkRevision(value.id, value.expectedRevision)
          agents = await this.store.transaction(async tx => { if (creation) await tx.put({ collection: 'sourceCreations', id: creation.requestId, value: { sourceId: source.id, fingerprint: creation.fingerprint, ...creation.source } }); await tx.put({ collection: 'dataSources', id: source.id, value: source }); return this.changedAgents(tx, source.id) })
          this.sources.set(source.id, source); this.hooks.install(agents)
        })
      } catch (error) {
        // Only remove an unreferenced newly staged credential after a reliable read.
        const committed = await this.store.get<StoredSource>('dataSources', source.id)
        if (credentialId && credentialId !== previous?.credentialId && committed?.credentialId !== credentialId) await this.secrets.delete(credentialId)
        throw error
      }
      if (previous?.credentialId && previous.credentialId !== credentialId) await this.secrets.delete(previous.credentialId)
      await this.hooks.changed(source.id, agents)
      return this.public(source)
    }))
  }
  bind(input: unknown, validate?: () => Promise<void>) {
    const value = dataSourceBindingsSchema.parse(input)
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
          await tx.put({ collection: 'dataSources', id: next.id, value: next })
          return this.changedAgents(tx, next.id, new Set(value.agents.map(agent => agent.id)))
        })
        this.sources.set(next.id, next); this.hooks.install(agents); return next
      })
      await this.hooks.changed(source.id, agents); return this.public(source)
    }))
  }
  remove(input: unknown, validate?: () => Promise<void>) {
    const value = dataSourceIdentitySchema.parse(input)
    return this.enqueue(() => this.mutation(value.id, async () => {
      const previous = this.checkRevision(value.id, value.expectedRevision)!
      let agents: DigitalAgent[] = []
      await this.hooks.critical(async () => {
        await validate?.()
        agents = await this.store.transaction(async tx => { await tx.remove('dataSources', value.id); return this.changedAgents(tx, value.id, new Set()) })
        this.sources.delete(value.id); this.hooks.install(agents)
      })
      if (previous.credentialId) await this.secrets.delete(previous.credentialId)
      await this.hooks.changed(value.id, agents)
    }))
  }
  private async lease(ref: SourceSummary, runId: string, signal: AbortSignal) {
    signal.throwIfAborted(); if (this.closing) throw new Error('数据源服务正在退出')
    this.assertCurrent([ref])
    const key = `${runId}:${ref.id}`
    let lease = this.leases.get(key)
    if (!lease) {
      const controller = new AbortController(), abort = () => controller.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      const source = this.stored(ref.id)
      const session = (async () => {
        const credential = source.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
        return openSourceSession(this.public(source), credential, this.dataPath, controller.signal)
      })()
      lease = { sourceId: ref.id, runId, revision: ref.revision, controller, session, active: new Set(), detach: () => signal.removeEventListener('abort', abort) }
      this.leases.set(key, lease)
    }
    if (lease.revision !== ref.revision) throw new Error('数据源会话版本已变化')
    return lease
  }
  async use(ref: SourceSummary, runId: string, signal: AbortSignal, request?: SourceCall, beforeCall?: (mutating: boolean) => Promise<void>) {
    const lease = await this.lease(ref, runId, signal)
    const operation = (async () => {
      const session = await lease.session
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref])
      if (!request) return { source: ref, guide: this.stored(ref.id).guide, tools: session.tools }
      const tool = session.tools.find(tool => tool.name === request.tool)
      if (!tool) throw new Error('数据源不提供此工具，请先读取工具目录')
      const source = this.stored(ref.id)
      const mutating = source.type === 'api' ? request.arguments.method !== undefined && request.arguments.method !== 'GET' : source.type === 'local' ? request.arguments.operation === 'write' : !tool.readOnly
      await beforeCall?.(mutating)
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref])
      const result = await session.call(request.tool, request.arguments, AbortSignal.any([signal, lease.controller.signal]))
      signal.throwIfAborted(); lease.controller.signal.throwIfAborted(); this.assertCurrent([ref]); return result
    })()
    lease.active.add(operation)
    try { return await operation } catch (error) {
      const source = this.sources.get(ref.id)
      const credential = source?.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
      throw new Error(String(redactSourceValue(error instanceof Error ? error.message : '数据源调用失败', credential)))
    } finally { lease.active.delete(operation) }
  }
  async test(input: unknown, authority?: { validate(): Promise<void>; signal: AbortSignal }) {
    await authority?.validate()
    const value = dataSourceIdentitySchema.parse(input), source = this.checkRevision(value.id, value.expectedRevision)!
    if (!source.enabled) throw new Error('请先启用数据源')
    const ref = this.summaries([source.id])[0], runId = `test:${randomUUID()}`
    let result: NonNullable<DataSource['test']>
    try {
      const output = await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(SOURCE_TIMEOUT), ...(authority ? [authority.signal] : [])])) as { tools: SourceTool[] }
      if (source.type === 'api') await this.use(ref, runId, AbortSignal.any([AbortSignal.timeout(SOURCE_TIMEOUT), ...(authority ? [authority.signal] : [])]), { sourceId: source.id, tool: 'request', arguments: { path: source.api.testPath, method: 'GET' } })
      result = { status: 'success', checkedAt: new Date().toISOString(), message: source.type === 'mcp' ? `已读取 ${output.tools.length} 个工具` : source.type === 'local' ? '文件夹可以访问' : '测试端点请求成功', tools: output.tools.map(({ name, description }) => ({ name, description })) }
    } catch (error) {
      const credential = source.credentialId ? await this.secrets.get(source.credentialId) ?? '' : ''
      result = { status: 'failed', checkedAt: new Date().toISOString(), message: String(redactSourceValue(error instanceof Error ? error.message : '连接失败', credential)).slice(0, 1000) }
    } finally { await this.closeRun(runId) }
    return this.hooks.critical(async () => {
      await authority?.validate()
      const latest = this.checkRevision(source.id, source.revision)!
      const next = { ...latest, test: result }
      await this.store.write([{ collection: 'dataSources', id: next.id, value: next }]); this.sources.set(next.id, next)
      return this.public(next)
    })
  }
  private async drain(matches: (lease: Lease) => boolean) {
    const selected = [...this.leases.entries()].filter(([, lease]) => matches(lease))
    for (const [, lease] of selected) lease.controller.abort(new Error('数据源调用已停止'))
    for (const [key, lease] of selected) {
      await Promise.allSettled([...lease.active])
      const session = await lease.session.catch(() => undefined)
      await session?.close(); lease.detach(); this.leases.delete(key)
    }
  }
  closeRun(runId: string) { return this.drain(lease => lease.runId === runId) }
  async close() { this.closing = true; await this.tail; await this.drain(() => true) }
}
