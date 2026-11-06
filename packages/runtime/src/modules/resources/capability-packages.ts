/*
 * [INPUT]: Original ProductStore, explicit versioned requests, verified local packages and existing capability services.
 * [OUTPUT]: Versioned grants and durable receipts separate committed state from finished cleanup; recovery attempts never replay unknown work.
 * [POS]: Sole capability package lifecycle; employees keep native loops and Source/Skill services retain execution authority.
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { bindCapabilityPackageSchema, capabilityPackageIdentitySchema, installCapabilityPackageSchema, setCapabilityPackageEnabledSchema, unbindCapabilityPackageSchema, updateCapabilityPackageSchema, type CapabilityBinding, type CapabilityGrant, type CapabilityInspection, type CapabilityInstallation, type CapabilityOperation } from '@boai/shared/domain/capability-packages'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import type { CapabilityAuthority, CapabilityPackageHost } from './capability-package-host'
import { CapabilityPackageFiles } from './capability-package-files'
import { inspectCapabilityPackage } from './capability-package-inspection'

const installationsCollection = 'capabilityPackages', bindingsCollection = 'capabilityBindings', operationsCollection = 'capabilityOperations'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex')
const now = () => new Date().toISOString()
const bindingId = (installationId: string, employeeId: string) => digest([installationId, employeeId])
type Journal = CapabilityOperation & { draft?: CapabilityInstallation; previous?: CapabilityInstallation; originalRequestId?: string; recoveryResult?: CapabilityOperation }
const publicOperation = ({ draft: _draft, previous: _previous, originalRequestId: _original, recoveryResult: _recovery, ...value }: Journal): CapabilityOperation => structuredClone(value)
type Lease = CapabilityGrant & { controller?: AbortController }
export class CapabilityPackages {
  private installations = new Map<string, CapabilityInstallation>()
  private bindings = new Map<string, CapabilityBinding>()
  private blocked = new Set<string>()
  private leases = new Set<Lease>()
  private tail: Promise<unknown> = Promise.resolve()
  private pendingMutations = 0
  private authority = new AsyncLocalStorage<CapabilityAuthority | undefined>()
  private closing = false
  private closeTask?: Promise<void>
  private files: CapabilityPackageFiles
  constructor(private store: ProductStore, dataPath: string, private host: CapabilityPackageHost) { this.files = new CapabilityPackageFiles(dataPath) }
  async init() {
    this.installations = new Map((await this.store.load<CapabilityInstallation>(installationsCollection)).map(value => [value.id, value]))
    this.bindings = new Map((await this.store.load<CapabilityBinding>(bindingsCollection)).map(value => [value.id, value]))
    for (const value of this.installations.values()) if (value.status === 'draining') this.blocked.add(value.id)
    for (const value of this.bindings.values()) if (value.status === 'draining') this.blocked.add(value.id)
    // Restart never resumes a copy or a tool. Mark the interrupted intent; explicit recovery can clean only owned prepared objects.
    for (const operation of await this.store.load<Journal>(operationsCollection)) if (operation.status === 'preparing') {
      operation.status = 'interrupted'; operation.phase = 'recovery-required'
      await this.store.write([{ collection: operationsCollection, id: operation.requestId, value: operation }])
    }
  }
  inspect(path: string) { return inspectCapabilityPackage(path) }
  list() { return structuredClone([...this.installations.values()].filter(value => value.status !== 'uninstalled')) }
  get(id: string) { const value = this.installations.get(id); if (!value) throw new Error('能力包不存在'); return structuredClone(value) }
  listBindings(installationId: string) { this.get(installationId); return structuredClone([...this.bindings.values()].filter(value => value.installationId === installationId)) }
  async getOperation(requestId: string): Promise<CapabilityOperation | undefined> {
    const value = await this.store.get<Journal>(operationsCollection, requestId)
    if (!value) return undefined
    return publicOperation(value)
  }
  async recoveryReceipt(attemptRequestId: string): Promise<CapabilityOperation | undefined> {
    const attempt = await this.store.get<Journal>(operationsCollection, attemptRequestId)
    if (attempt?.action !== 'recover') return undefined
    if (attempt.status === 'completed' && attempt.recoveryResult) return structuredClone(attempt.recoveryResult)
    // The attempt ended, not necessarily the original cleanup. A new user action may create a new attempt.
    if (attempt.status === 'interrupted') return publicOperation(attempt)
    return undefined
  }
  canUse(grant: CapabilityGrant) { try { this.authorize(grant); return true } catch { return false } }
  authorize(grant: CapabilityGrant) {
    if (this.closing) throw new Error('能力包服务正在退出')
    const installation = this.installations.get(grant.installationId)
    const binding = this.bindings.get(bindingId(grant.installationId, grant.employeeId))
    if (!installation || !installation.enabled || installation.status !== 'installed' || this.blocked.has(grant.installationId) || this.blocked.has(bindingId(grant.installationId, grant.employeeId))) throw new Error('能力包未启用或正在退出')
    if (binding?.status === 'draining' || installation.contentHash !== grant.version || binding?.version !== grant.version || !binding.contributionIds.includes(grant.contributionId)) throw new Error('当前员工未获准使用此版本的包贡献')
    const contribution = installation.contributions.find(value => value.id === grant.contributionId && value.version === grant.version)
    if (!contribution) throw new Error('能力包贡献已变化')
    return structuredClone(contribution)
  }
  acquire(grant: CapabilityGrant, controller?: AbortController) {
    this.authorize(grant)
    const lease = { ...grant, controller }; this.leases.add(lease)
    let released = false
    return () => { if (!released) { released = true; this.leases.delete(lease) } }
  }
  get busy() { return this.pendingMutations > 0 || this.leases.size > 0 }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closing = true
    for (const value of this.installations.values()) this.blocked.add(value.id)
    for (const lease of this.leases) lease.controller?.abort(new Error('能力包服务正在退出'))
    this.closeTask = this.tail.then(async () => { for (const value of this.installations.values()) await this.drain(value.id) })
    return this.closeTask
  }
  private enqueue<T>(action: () => Promise<T>) {
    if (this.closing) return Promise.reject(new Error('能力包服务正在退出'))
    const authority = this.host.authority?.()
    this.pendingMutations++
    const next = this.tail.then(() => this.authority.run(authority, async () => { await this.commit(async () => {}); return action() })).finally(() => { this.pendingMutations-- }); this.tail = next.catch(() => {}); return next
  }
  private async commit<T>(action: () => Promise<T>) {
    const authority = this.authority.getStore()
    if (this.host.commit) return this.host.commit(action, authority)
    authority?.signal.throwIfAborted(); await authority?.validate(); authority?.signal.throwIfAborted()
    return action()
  }
  private transaction<T>(action: (tx: RecordTransaction) => Promise<T>) { return this.commit(() => this.store.transaction(action)) }
  private check(id: string, revision: number) {
    const value = this.get(id)
    if (value.status === 'uninstalled' || value.revision !== revision) throw new Error('能力包版本已变化，请刷新后操作')
    return value
  }
  private async checkTx(tx: RecordTransaction, id: string, revision: number) {
    const value = await tx.get<CapabilityInstallation>(installationsCollection, id)
    if (!value || value.status === 'uninstalled' || value.revision !== revision) throw new Error('能力包版本已变化，请刷新后操作')
    return value
  }
  private async existing(requestId: string, action: string, input: unknown) {
    const existing = await this.store.get<Journal>(operationsCollection, requestId)
    if (!existing) return undefined
    if (existing.fingerprint !== digest({ action, input })) throw new Error('请求标识已用于另一项能力包操作')
    return (await this.getOperation(requestId))!
  }
  private journal(requestId: string, action: string, input: unknown, installationId: string): Journal {
    return { requestId, action, installationId, fingerprint: digest({ action, input }), status: 'preparing', phase: 'prepared' }
  }
  private async record(operation: Journal) { await this.store.write([{ collection: operationsCollection, id: operation.requestId, value: operation }]) }
  private async recorded<T>(operation: Journal, action: () => Promise<T>): Promise<T> {
    await this.record(operation)
    try { return await action() }
    catch (error) {
      const observed = await this.store.get<Journal>(operationsCollection, operation.requestId)
      if (observed?.status !== 'completed') await this.record({ ...operation, status: 'interrupted', phase: 'recovery-required', error: '操作未确认完成，请读取当前安装、绑定和原回执' })
      throw error
    }
  }
  private validateInspection(inspection: CapabilityInspection, contentHash: string, allowPartial: boolean) {
    if (inspection.contentHash !== contentHash) throw new Error('能力包内容已变化，请重新预检')
    if (inspection.unsupported.some(value => ['unsupported-or-embedded-header', 'unsupported-or-embedded-env', 'embedded-url-configuration', 'embedded-command-credential', 'embedded-credential'].includes(value.code))) throw new Error('包内包含不能自动迁入的固定连接配置或秘密值')
    if (!inspection.definitions.length) throw new Error('能力包没有可导入的贡献')
    if (inspection.unsupported.length && (!allowPartial || !inspection.partialAllowed)) throw new Error('能力包包含不支持或无法证明独立的组件；不能激活')
  }
  private installation(inspection: CapabilityInspection, id: string = randomUUID()): CapabilityInstallation {
    const time = now()
    return { id, packageId: inspection.packageId, name: inspection.name, version: inspection.version, contentHash: inspection.contentHash, revision: 1, enabled: false, status: 'installed', format: inspection.format, specVersion: inspection.specVersion, source: inspection.source, partial: inspection.unsupported.length > 0, unsupported: inspection.unsupported, definitions: inspection.definitions, files: inspection.files, contributions: inspection.definitions.map(value => ({ id: randomUUID(), key: value.key, kind: value.kind, objectId: randomUUID(), ownership: 'owned', version: inspection.contentHash })), createdAt: time, updatedAt: time }
  }
  private async committed(operation: Journal, result: CapabilityInstallation | CapabilityBinding, tx: RecordTransaction) {
    await tx.put({ collection: operationsCollection, id: operation.requestId, value: { ...operation, status: 'completed', phase: 'committed', result } satisfies Journal })
  }
  private async cleanupOwned(target: CapabilityInstallation) {
    let retained: string[]
    try { retained = await this.host.retire(target, target.contributions) } catch { retained = [`contributions:${target.id}:${target.contentHash}`] }
    if (!retained.length) retained.push(...await this.files.cleanup(target))
    return retained
  }
  private async recordCommittedCleanup(operation: Journal, result: CapabilityInstallation, retained: string[]) {
    const cleaned = { ...result }
    if (retained.length) cleaned.retained = retained
    else delete cleaned.retained
    const current = await this.store.get<CapabilityInstallation>(installationsCollection, result.id)
    const matches = current?.revision === result.revision && current.contentHash === result.contentHash && current.status === result.status
    const completed: Journal = { ...operation, status: 'completed', phase: retained.length ? 'committed-cleanup-required' : 'committed-cleaned', result: cleaned, retained }
    // Keep the cleanup result and its installation projection together; never overwrite a later package revision during recovery.
    await this.store.write([
      ...(matches ? [{ collection: installationsCollection, id: cleaned.id, value: cleaned }] : []),
      { collection: operationsCollection, id: operation.requestId, value: completed },
    ])
    if (matches) this.installations.set(cleaned.id, cleaned)
  }
  private async rollback(operation: Journal, _error: unknown) {
    // A lost commit response is reconciled by its original request, never compensated blindly.
    const observed = await this.store.get<Journal>(operationsCollection, operation.requestId)
    if (observed?.status === 'completed') {
      const current = await this.store.get<CapabilityInstallation>(installationsCollection, operation.installationId)
      if (current) this.installations.set(current.id, current)
      for (const binding of await this.store.load<CapabilityBinding>(bindingsCollection)) if (binding.installationId === operation.installationId) this.bindings.set(binding.id, binding)
      return this.getOperation(operation.requestId)
    }
    const retained: string[] = []
    if (operation.draft) {
      try { retained.push(...await this.host.retire(operation.draft, operation.draft.contributions)) } catch { retained.push(`contributions:${operation.draft.id}:${operation.draft.contentHash}`) }
      if (!retained.length) retained.push(...await this.files.cleanup(operation.draft))
    }
    await this.record({ ...operation, status: retained.length ? 'interrupted' : 'failed', phase: retained.length ? 'cleanup-required' : 'rolled-back', error: '能力包准备失败，请核对原操作与贡献清理记录', retained })
    return this.getOperation(operation.requestId)
  }
  install(raw: unknown) {
    const input = installCapabilityPackageSchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'install', input); if (existing) return existing
      const inspected = await this.inspect(input.path); this.validateInspection(inspected, input.contentHash, input.allowPartial)
      if ([...this.installations.values()].some(value => value.packageId === inspected.packageId && value.status !== 'uninstalled')) throw new Error('此来源的能力包已安装，请使用更新入口')
      const installation = this.installation(inspected), operation = { ...this.journal(input.requestId, 'install', input, installation.id), draft: installation }
      await this.record(operation)
      try {
        const directory = await this.files.prepare(installation)
        operation.phase = 'materializing'; await this.record(operation)
        await this.host.materialize(installation, directory)
        await this.transaction(async tx => {
          if ((await tx.list<CapabilityInstallation>(installationsCollection)).some(value => value.packageId === inspected.packageId && value.status !== 'uninstalled')) throw new Error('此来源的能力包已安装')
          await tx.put({ collection: installationsCollection, id: installation.id, value: installation }); await this.committed(operation, installation, tx)
        })
        this.installations.set(installation.id, installation)
        await this.host.changed(installation.id)
        return this.getOperation(input.requestId)
      } catch (error) { return this.rollback(operation, error) }
    })
  }
  bind(raw: unknown) {
    const input = bindCapabilityPackageSchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'bind', input); if (existing) return existing
      const installation = this.check(input.installationId, input.expectedRevision)
      if (installation.status !== 'installed' || this.blocked.has(installation.id)) throw new Error('能力包正在退出')
      if (new Set(input.contributionIds).size !== input.contributionIds.length || input.contributionIds.some(id => !installation.contributions.some(value => value.id === id))) throw new Error('所选包贡献不存在或重复')
      await this.host.assertOwnership(installation, input.employeeId)
      await this.host.assertReady?.(installation, input.contributionIds)
      const id = bindingId(installation.id, input.employeeId), previous = this.bindings.get(id)
      if ((previous?.revision ?? 0) !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
      const next: CapabilityBinding = { id, installationId: installation.id, employeeId: input.employeeId, revision: (previous?.revision ?? 0) + 1, version: installation.contentHash, contributionIds: input.contributionIds, status: 'active' }
      const operation = this.journal(input.requestId, 'bind', input, installation.id)
      return this.recorded(operation, async () => {
        if (previous?.contributionIds.length) {
          this.blocked.add(id)
          await this.transaction(async tx => {
            if ((await tx.get<CapabilityBinding>(bindingsCollection, id))?.revision !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
            await tx.put({ collection: bindingsCollection, id, value: { ...previous, status: 'draining' } })
          })
          this.bindings.set(id, { ...previous, status: 'draining' })
          await this.drain(installation.id, input.employeeId)
        }
        await this.host.prepareBinding?.(installation, input.employeeId, input.expectedConfigVersion)
        await this.transaction(async tx => {
          await this.checkTx(tx, installation.id, installation.revision)
          if (((await tx.get<CapabilityBinding>(bindingsCollection, id))?.revision ?? 0) !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
          await this.host.applyBinding(tx, installation, previous, next, input.expectedConfigVersion)
          await tx.put({ collection: bindingsCollection, id, value: next }); await this.committed(operation, next, tx)
        })
        this.bindings.set(id, next); this.blocked.delete(id); await this.host.changed(installation.id)
        return this.getOperation(input.requestId)
      })
    })
  }
  private async drain(installationId: string, employeeId?: string) {
    for (const lease of this.leases) if (lease.installationId === installationId && (!employeeId || lease.employeeId === employeeId)) lease.controller?.abort(new Error('能力包授权已撤回'))
    await this.host.drain(installationId, employeeId)
    if ([...this.leases].some(value => value.installationId === installationId && (!employeeId || value.employeeId === employeeId))) throw new Error('能力包仍有活动操作，资源尚未退出')
  }
  unbind(raw: unknown) {
    const input = unbindCapabilityPackageSchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'unbind', input); if (existing) return existing
      const installation = this.check(input.installationId, input.expectedRevision), id = bindingId(installation.id, input.employeeId), previous = this.bindings.get(id)
      if (!previous || previous.revision !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
      const operation = this.journal(input.requestId, 'unbind', input, installation.id)
      return this.recorded(operation, async () => {
        this.blocked.add(id)
        await this.transaction(async tx => {
          await this.checkTx(tx, installation.id, installation.revision)
          if ((await tx.get<CapabilityBinding>(bindingsCollection, id))?.revision !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
          await tx.put({ collection: bindingsCollection, id, value: { ...previous, status: 'draining' } })
        })
        this.bindings.set(id, { ...previous, status: 'draining' })
        await this.drain(installation.id, input.employeeId)
        const next = { ...previous, contributionIds: [], revision: previous.revision + 1, status: 'active' as const }
        await this.transaction(async tx => {
          await this.checkTx(tx, installation.id, installation.revision)
          if ((await tx.get<CapabilityBinding>(bindingsCollection, id))?.revision !== input.expectedBindingRevision) throw new Error('员工包绑定已变化')
          await this.host.applyBinding(tx, installation, previous, undefined, input.expectedConfigVersion)
          // Retain the binding revision tombstone so old grants cannot be replayed after unbinding.
          await tx.put({ collection: bindingsCollection, id, value: next }); await this.committed(operation, next, tx)
        })
        this.bindings.set(id, next); this.blocked.delete(id); await this.host.changed(installation.id)
        return this.getOperation(input.requestId)
      })
    })
  }
  setEnabled(raw: unknown) {
    const input = setCapabilityPackageEnabledSchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'setEnabled', input); if (existing) return existing
      const previous = this.check(input.installationId, input.expectedRevision)
      if (input.enabled && previous.status === 'draining') throw new Error('能力包退出尚未完成，请先停用核对')
      const operation = this.journal(input.requestId, 'setEnabled', input, previous.id)
      return this.recorded(operation, async () => {
        if (input.enabled) await this.host.assertReady?.(previous, [...new Set(this.listBindings(previous.id).flatMap(value => value.contributionIds))])
        else {
          this.blocked.add(previous.id)
          const draining = { ...previous, status: 'draining' as const, enabled: false }
          await this.transaction(async tx => { await this.checkTx(tx, previous.id, previous.revision); await tx.put({ collection: installationsCollection, id: previous.id, value: draining }) })
          this.installations.set(previous.id, draining)
          await this.drain(previous.id)
        }
        const next = { ...previous, revision: previous.revision + 1, enabled: input.enabled, status: 'installed' as const, updatedAt: now() }
        await this.transaction(async tx => { await this.checkTx(tx, previous.id, previous.revision); await tx.put({ collection: installationsCollection, id: next.id, value: next }); await this.committed(operation, next, tx) })
        this.installations.set(next.id, next); this.blocked.delete(next.id); await this.host.changed(next.id)
        return this.getOperation(input.requestId)
      })
    })
  }
  update(raw: unknown) {
    const input = updateCapabilityPackageSchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'update', input); if (existing) return existing
      const previous = this.check(input.installationId, input.expectedRevision)
      if (previous.status !== 'installed' || this.blocked.has(previous.id) || [...this.leases].some(value => value.installationId === previous.id)) throw new Error('能力包仍在使用或退出中，不能切换版本')
      await this.host.assertIdle?.(previous.id)
      const inspected = await this.inspect(input.path); this.validateInspection(inspected, input.contentHash, input.allowPartial)
      if (inspected.packageId !== previous.packageId) throw new Error('更新包来源身份不一致')
      if (inspected.contentHash === previous.contentHash) throw new Error('能力包内容未变化')
      for (const definition of inspected.definitions) if (digest(definition) !== digest(previous.definitions.find(value => value.key === definition.key)) && !input.approvedContributionKeys.includes(definition.key)) throw new Error('新增或变化的能力尚未明确授权')
      const next = { ...this.installation(inspected, previous.id), revision: previous.revision + 1, createdAt: previous.createdAt, enabled: previous.enabled }
      for (const binding of this.listBindings(previous.id)) if (binding.contributionIds.length) await this.host.assertOwnership(previous, binding.employeeId)
      const bindings = this.listBindings(previous.id).map(binding => ({ previous: binding, next: { ...binding, revision: binding.revision + 1, version: next.contentHash, contributionIds: next.contributions.filter(contribution => binding.contributionIds.some(id => previous.contributions.some(old => old.id === id && old.key === contribution.key))).map(value => value.id) } }))
      const operation: Journal = { ...this.journal(input.requestId, 'update', input, next.id), draft: next, previous }
      this.blocked.add(previous.id); await this.record(operation)
      try {
        // Inspection awaits filesystem I/O. Recheck after blocking new grants to close that admission window.
        if ([...this.leases].some(value => value.installationId === previous.id)) throw new Error('能力包仍有活动操作，不能切换版本')
        await this.host.assertIdle?.(previous.id)
        const directory = await this.files.prepare(next); operation.phase = 'materializing'; await this.record(operation)
        await this.host.materialize(next, directory)
        if (next.enabled) await this.host.assertReady?.(next, [...new Set(bindings.flatMap(value => value.next.contributionIds))])
        await this.transaction(async tx => {
          await this.checkTx(tx, previous.id, previous.revision)
          for (const binding of bindings) {
            if ((await tx.get<CapabilityBinding>(bindingsCollection, binding.previous.id))?.revision !== binding.previous.revision) throw new Error('员工包绑定已变化')
            await this.host.applyBinding(tx, next, binding.previous, binding.next)
            await tx.put({ collection: bindingsCollection, id: binding.next.id, value: binding.next })
          }
          await tx.put({ collection: installationsCollection, id: next.id, value: next }); await this.committed(operation, next, tx)
        })
        this.installations.set(next.id, next); for (const binding of bindings) this.bindings.set(binding.next.id, binding.next)
        // Old versions are no longer executable; cleanup errors preserve their ownership journal for explicit recovery.
        const retained = await this.cleanupOwned(previous)
        await this.recordCommittedCleanup(operation, next, retained)
        this.blocked.delete(next.id); await this.host.changed(next.id)
        return this.getOperation(input.requestId)
      } catch (error) {
        const result = await this.rollback(operation, error)
        this.blocked.delete(previous.id)
        if (result?.status === 'completed') { const current = await this.store.get<CapabilityInstallation>(installationsCollection, previous.id); if (current) this.installations.set(current.id, current) }
        if (result?.status === 'completed' && result.phase === 'committed') throw error
        return result
      }
    })
  }
  uninstall(raw: unknown) {
    const input = capabilityPackageIdentitySchema.parse(raw)
    return this.enqueue(async () => {
      const existing = await this.existing(input.requestId, 'uninstall', input); if (existing) return existing
      const previous = this.check(input.installationId, input.expectedRevision)
      const operation: Journal = { ...this.journal(input.requestId, 'uninstall', input, previous.id), previous }
      return this.recorded(operation, async () => {
        this.blocked.add(previous.id)
        const draining = { ...previous, status: 'draining' as const, enabled: false }
        await this.transaction(async tx => { await this.checkTx(tx, previous.id, previous.revision); await tx.put({ collection: installationsCollection, id: previous.id, value: draining }) })
        this.installations.set(previous.id, draining); await this.drain(previous.id)
        const bindings = this.listBindings(previous.id), next = { ...draining, status: 'uninstalled' as const, revision: previous.revision + 1, updatedAt: now() }
        await this.transaction(async tx => {
          await this.checkTx(tx, previous.id, previous.revision)
          for (const binding of bindings) {
            if ((await tx.get<CapabilityBinding>(bindingsCollection, binding.id))?.revision !== binding.revision) throw new Error('员工包绑定已变化')
            await this.host.applyBinding(tx, previous, binding, undefined)
            await tx.put({ collection: bindingsCollection, id: binding.id, value: { ...binding, revision: binding.revision + 1, contributionIds: [] } })
          }
          await tx.put({ collection: installationsCollection, id: next.id, value: next }); await this.committed(operation, next, tx)
        })
        this.installations.set(next.id, next); for (const binding of bindings) this.bindings.set(binding.id, { ...binding, revision: binding.revision + 1, contributionIds: [] })
        const retained = await this.cleanupOwned(previous)
        await this.recordCommittedCleanup(operation, next, retained)
        this.blocked.delete(next.id); await this.host.changed(next.id)
        return this.getOperation(input.requestId)
      })
    })
  }
  /** Explicit local reconciliation; never replays materialize, bindings or MCP calls. */
  recover(requestId: string, attemptRequestId?: string) {
    return this.enqueue(async () => {
      z.string().min(1).max(200).parse(requestId)
      if (attemptRequestId !== undefined) z.string().min(1).max(200).parse(attemptRequestId)
      if (attemptRequestId === requestId) throw new Error('恢复尝试必须使用独立请求标识')
      const input = { originalRequestId: requestId }
      if (attemptRequestId) {
        const previous = await this.existing(attemptRequestId, 'recover', input)
        if (previous) {
          const receipt = await this.recoveryReceipt(attemptRequestId)
          if (receipt) return receipt
          throw new Error('原恢复尝试仍未留下确定结果；不会自动重复清理')
        }
      }
      const operation = await this.store.get<Journal>(operationsCollection, requestId)
      if (!operation) throw new Error('能力包操作不存在')
      const pendingCleanup = operation.status === 'completed' && !!operation.previous && operation.phase === 'committed'
      const target = operation.status === 'completed' ? (operation.retained?.length || pendingCleanup ? operation.previous : undefined) : operation.draft
      if (target) {
        const current = this.installations.get(target.id)
        if (current?.status === 'installed' && current.contentHash === target.contentHash) throw new Error('活动版本不能作为中断准备清理')
      }
      const attempt: Journal | undefined = attemptRequestId ? { ...this.journal(attemptRequestId, 'recover', input, operation.installationId), originalRequestId: requestId, phase: 'cleanup-preparing' } : undefined
      if (attempt) await this.record(attempt)
      let retained: string[] | undefined
      try {
        if (target) {
          retained = await this.cleanupOwned(target)
          if (operation.status === 'completed') await this.recordCommittedCleanup(operation, operation.result as CapabilityInstallation, retained)
          else await this.record({ ...operation, status: retained.length ? 'interrupted' : 'failed', phase: retained.length ? 'cleanup-required' : 'reconciled', retained })
        }
        const result = (await this.getOperation(requestId))!
        if (attempt) await this.record({ ...attempt, status: 'completed', phase: 'recovery-completed', recoveryResult: result })
        return result
      } catch (error) {
        if (attempt) {
          // A missing final attempt receipt is never permission to repeat filesystem effects.
          const observed = await this.store.get<Journal>(operationsCollection, attempt.requestId)
          if (observed?.status !== 'completed') await this.record({ ...attempt, status: 'interrupted', phase: 'recovery-required', ...(retained ? { retained } : {}), error: '恢复尝试未确认完成，请核对原操作；不会自动重放清理' })
        }
        throw error
      }
    })
  }
}
