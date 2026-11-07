/*
 * [INPUT]: Original SourceService, SkillBindingFiles, employee records and host cache/lifecycle callbacks.
 * [OUTPUT]: Package contributions use existing resources, per-employee skill copies and one source execution gate.
 * [OUTPUT]: Native bindings require a fresh complete inventory before each input; package identity scopes sessions and managed copy paths survive restart/relocation.
 * [POS]: WT2 domain adapter; AppService registration remains owned by WT3.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header并上浮检查所属目录.folder.md。
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DigitalAgent, Resource } from '@boai/shared/domain'
import type { CapabilityBinding, CapabilityContribution, CapabilityInstallation } from '@boai/shared/domain/capability-packages'
import type { SourcePackageOrigin } from '@boai/shared/domain/sources'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { SourceService } from '../sources/source-service'
import { SkillBindingFiles, type BindingFiles } from './skill-binding-files'
import { inspectResourceTree } from './local-resources'
import { CapabilityPackages } from './capability-packages'
import type { CapabilityAuthority, CapabilityPackageHost } from './capability-package-host'
import { assertNativeCapabilityOwnership, type NativeCapabilityInventory } from './capability-native-ownership'

type OwnedSkill = { id: string; origin: SourcePackageOrigin; employeeId?: string; resource: Resource; files: BindingFiles; released?: true }
const copiesCollection = 'capabilitySkillCopies'
const originOf = (installation: CapabilityInstallation, contribution: CapabilityContribution): SourcePackageOrigin => ({ installationId: installation.id, contributionId: contribution.id, version: contribution.version })
const stableId = (value: string) => { const hash = createHash('sha256').update(value).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}` }

export interface CapabilityServicesPort {
  store: ProductStore; dataPath: string; sources: SourceService
  authority?(): CapabilityAuthority | undefined
  critical?<T>(action: () => Promise<T>): Promise<T>
  /** Refresh original EmployeeRegistry/resources from the committed store and notify original views. */
  changed(): Promise<void>
  /** Interrupt and await actual affected employee executions, including native sessions holding skill files. */
  drainEmployees(employeeIds: string[]): Promise<void>
  assertEmployeesIdle(employeeIds: string[]): Promise<void>
  /** Admit only backends with a mandatory before-input ownership guard; this is not runtime proof. */
  assertNativeOwnership(installation: CapabilityInstallation, employee: DigitalAgent): Promise<void>
}

export class CapabilityPackageServices implements CapabilityPackageHost {
  readonly packages: CapabilityPackages
  private files: SkillBindingFiles
  private copies = new Map<string, OwnedSkill>()
  constructor(private port: CapabilityServicesPort) {
    this.files = new SkillBindingFiles(port.dataPath)
    this.packages = new CapabilityPackages(port.store, port.dataPath, this)
    port.sources.setCapabilityGate({
      ready: origin => this.assertReady(this.packages.get(origin.installationId), [origin.contributionId]),
      canUse: (origin, employeeId) => this.packages.canUse({ ...origin, employeeId }),
      acquire: (origin, employeeId, controller) => this.packages.acquire({ ...origin, employeeId }, controller),
    })
  }
  async init() {
    const copies = await this.port.store.load<OwnedSkill>(copiesCollection)
    for (const copy of copies) {
      const ownership = `capability:${copy.origin?.installationId}:${copy.origin?.contributionId}`
      const owners = [`${ownership}:${copy.employeeId ?? 'catalog'}`, ...(copy.employeeId ? [`${ownership}:catalog:${copy.employeeId}`] : [])]
      const valid = /^[a-f0-9-]{36}$/.test(copy.id) && copy.id === copy.resource?.id && copy.files?.resourceId === copy.id
        && copy.resource.kind === 'skill' && copy.files.name === copy.resource.name && /^[a-z0-9][a-z0-9-]{0,63}$/.test(copy.files.name)
        && copy.employeeId === copy.resource.ownerAgentId && owners.includes(copy.files.ownership)
        && !!copy.origin?.installationId && !!copy.origin.contributionId && /^[a-f0-9]{64}$/.test(copy.origin.version)
      if (!valid) throw new Error('能力包技能副本身份不一致，请核对数据')
      copy.resource = { ...copy.resource, path: join(this.port.dataPath, 'skills', copy.id, copy.files.name) }
    }
    if (copies.length) await this.port.store.write(copies.map(value => ({ collection: copiesCollection, id: value.id, value })))
    this.copies = new Map(copies.map(value => [value.id, value]))
    await this.packages.init()
  }
  managedResourcePath(resource: Resource): string | undefined {
    const copy = this.copies.get(resource.id)
    if (!copy) return undefined
    if (resource.kind !== 'skill' || copy.resource.name !== resource.name || copy.employeeId !== resource.ownerAgentId) throw new Error('能力包技能副本身份不一致，请核对数据')
    return copy.resource.path
  }
  authority() { return this.port.authority?.() }
  commit<T>(action: () => Promise<T>, authority?: CapabilityAuthority) {
    const commit = async () => { authority?.signal.throwIfAborted(); await authority?.validate(); authority?.signal.throwIfAborted(); return action() }
    return this.port.critical ? this.port.critical(commit) : commit()
  }
  async configure(input: { installationId: string; expectedRevision: number; contributionId: string; expectedSourceRevision: number; credential: string }, requestId: string) {
    const authority = this.port.authority?.()
    const validate = async () => {
      authority?.signal.throwIfAborted(); await authority?.validate(); authority?.signal.throwIfAborted()
      const current = this.packages.get(input.installationId)
      if (current.revision !== input.expectedRevision || current.status !== 'installed') throw new Error('能力包版本已变化')
    }
    const installation = this.packages.get(input.installationId)
    if (installation.revision !== input.expectedRevision || installation.status !== 'installed') throw new Error('能力包版本已变化')
    const contribution = installation.contributions.find(value => value.id === input.contributionId && value.kind === 'source')
    if (!contribution) throw new Error('能力包数据源贡献不存在')
    const source = this.port.sources.get(contribution.objectId)
    const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, hasCredential: _hasCredential, test: _test, capabilityPackage: _package, applicationOrigin: _app, creationSource: _creation, ...config } = source
    return this.port.sources.saveManaged({ id: source.id, expectedRevision: input.expectedSourceRevision, config, credential: input.credential }, originOf(installation, contribution), requestId, validate)
  }
  configureReceipt(requestId: string) { return this.port.sources.managedSaveReceipt(requestId) }
  canUseResource(resourceId: string, employeeId: string) {
    const copy = this.copies.get(resourceId)
    return !copy || copy.released === true || copy.employeeId === employeeId && this.packages.canUse({ ...copy.origin, employeeId })
  }
  assertResourceAccess(resourceIds: string[], employeeId: string) {
    if (resourceIds.some(id => !this.canUseResource(id, employeeId))) throw new Error('能力包技能未启用、未绑定当前员工或版本已变化')
  }
  hasBindings(employeeId: string) {
    return this.packages.list().some(value => this.packages.listBindings(value.id).some(binding => binding.employeeId === employeeId && binding.contributionIds.length))
  }
  private nativeSelection(employee: DigitalAgent) {
    if ((employee.executionBackend?.kind ?? 'mastra-model') === 'mastra-model') return []
    return this.packages.list().flatMap(installation => {
      const binding = this.packages.listBindings(installation.id).find(value => value.employeeId === employee.id)
      return installation.enabled && installation.status === 'installed' && binding?.contributionIds.length
        ? [{ installation, binding }] : []
    })
  }
  nativeFingerprint(employee: DigitalAgent): string | undefined {
    const selected = this.nativeSelection(employee).map(({ installation, binding }) => ({ id: installation.id, version: installation.contentHash, bindingId: binding.id, employeeId: binding.employeeId, contributions: [...binding.contributionIds].sort() })).sort((a, b) => a.id.localeCompare(b.id))
    // No package preserves the existing native session fingerprint byte for byte.
    // Administrative revisions alone do not change which capabilities are loaded.
    return selected.length ? createHash('sha256').update(JSON.stringify(selected)).digest('hex') : undefined
  }
  nativeGuard(employee: DigitalAgent, validate: () => Promise<void>): ((inventory: NativeCapabilityInventory) => Promise<void>) | undefined {
    const selected = this.nativeSelection(employee)
    if (!selected.length) return undefined
    return async inventory => {
      await validate()
      for (const { installation, binding } of selected) {
        const current = this.packages.get(installation.id)
        const currentBinding = this.packages.listBindings(installation.id).find(value => value.employeeId === employee.id)
        if (current.revision !== installation.revision || current.contentHash !== installation.contentHash || JSON.stringify(currentBinding) !== JSON.stringify(binding)) throw new Error('能力包或绑定已变化，未发送本轮原生输入')
        for (const contributionId of binding.contributionIds) this.packages.authorize({ installationId: installation.id, employeeId: employee.id, contributionId, version: binding.version })
        assertNativeCapabilityOwnership({ owner: employee.executionBackend!.kind, installation, selectedContributionIds: binding.contributionIds, inventory })
      }
      await validate()
    }
  }
  private async prepareSkills(installation: CapabilityInstallation, directory: string, employeeId?: string) {
    for (const contribution of installation.contributions.filter(value => value.kind === 'skill')) {
      const definition = installation.definitions.find(value => value.key === contribution.key)
      if (definition?.kind !== 'skill') throw new Error('能力包技能定义不存在')
      const id = employeeId ? stableId(`${contribution.objectId}:${employeeId}`) : contribution.objectId
      const previous = this.copies.get(id)
      if (previous) {
        if (previous.origin.version !== installation.contentHash || (await inspectResourceTree(previous.resource.path)).hash !== previous.files.contentHash) throw new Error('包技能副本已修改，请保留定制并重新选择')
        continue
      }
      const source = join(directory, definition.path), tree = await inspectResourceTree(source)
      if (tree.hash !== definition.contentHash) throw new Error('能力包技能内容已变化，不能采用修改后的基线')
      const files: BindingFiles = { resourceId: id, name: definition.name, contentHash: tree.hash, files: tree.files, ownership: `capability:${installation.id}:${contribution.id}:${employeeId ?? 'catalog'}` }
      const origin = originOf(installation, contribution)
      // Persist ownership before touching disk, so interrupted preparation can be reconciled.
      const resource: Resource = { id, kind: 'skill', name: definition.name, description: definition.description, path: join(this.port.dataPath, 'skills', id, definition.name), createdAt: new Date().toISOString(), ...(employeeId ? { ownerAgentId: employeeId } : {}) }
      const record: OwnedSkill = { id, origin, employeeId, resource, files }
      await this.port.store.write([{ collection: copiesCollection, id, value: record }]); this.copies.set(id, record)
      await this.files.prepare(source, files, definition.description, new AbortController().signal)
      // Only an employee copy enters the original resource library, atomically with its binding below.
    }
  }
  async materialize(installation: CapabilityInstallation, directory: string) {
    for (const contribution of installation.contributions.filter(value => value.kind === 'source')) {
      const definition = installation.definitions.find(value => value.key === contribution.key)
      if (definition?.kind !== 'source') throw new Error('能力包数据源定义不存在')
      const existing = this.port.sources.list().find(source => source.id === contribution.objectId)
      if (existing) {
        if (JSON.stringify(existing.capabilityPackage) !== JSON.stringify(originOf(installation, contribution))) throw new Error('数据源身份已被其他对象占用')
        continue
      }
      const old = this.port.sources.list().find(source => source.capabilityPackage?.installationId === installation.id && source.capabilityPackage.version !== installation.contentHash && this.packages.get(installation.id).contributions.some(value => value.objectId === source.id && value.key === contribution.key))
      const sameTarget = old?.type === 'mcp' && (old.mcp.transport === 'stdio' || old.mcp.authType !== 'oauth') && definition.config.type === 'mcp' && JSON.stringify(old.mcp) === JSON.stringify(definition.config.mcp)
      let credential = sameTarget && old?.hasCredential ? await this.port.sources.getCredential({ id: old.id, expectedRevision: old.revision }) : undefined
      if (credential && definition.config.type === 'mcp' && definition.config.mcp.transport === 'stdio') { const env = JSON.parse(credential); credential = JSON.stringify(Object.fromEntries(definition.requiredSecrets.filter(name => typeof env[name] === 'string').map(name => [name, env[name]]))) }
      await this.port.sources.saveManaged({ id: contribution.objectId, expectedRevision: 0, config: { ...definition.config, enabled: true }, credential }, originOf(installation, contribution))
    }
    await this.prepareSkills(installation, directory)
    // Existing bindings receive independent next-version copies before the commit transaction.
    let bindings: CapabilityBinding[] = []
    try { bindings = this.packages.listBindings(installation.id) } catch { /* First installation has no bindings. */ }
    for (const binding of bindings.filter(value => value.contributionIds.length)) await this.prepareSkills(installation, directory, binding.employeeId)
  }
  async assertOwnership(installation: CapabilityInstallation, employeeId: string) {
    const employee = await this.port.store.get<DigitalAgent>('agents', employeeId)
    if (!employee) throw new Error('员工不存在')
    if (employee.executionBackend && employee.executionBackend.kind !== 'mastra-model') await this.port.assertNativeOwnership(installation, employee)
  }
  async prepareBinding(installation: CapabilityInstallation, employeeId: string, expectedConfigVersion?: number) {
    const employee = await this.port.store.get<DigitalAgent>('agents', employeeId)
    if (!employee || expectedConfigVersion !== undefined && employee.configVersion !== expectedConfigVersion) throw new Error('员工配置已变化')
    const skill = [...this.copies.values()].find(value => value.origin.installationId === installation.id && value.origin.version === installation.contentHash && !value.employeeId)
    if (skill) {
      // Package snapshots are immutable; use the already verified catalog copy for each skill.
      for (const contribution of installation.contributions.filter(value => value.kind === 'skill')) {
        const catalog = this.copies.get(contribution.objectId)
        if (!catalog) throw new Error('能力包技能尚未准备')
        const id = stableId(`${contribution.objectId}:${employeeId}`)
        if (this.copies.has(id)) { const current = this.copies.get(id)!; if ((await inspectResourceTree(current.resource.path)).hash !== current.files.contentHash) throw new Error('员工包技能副本已修改，请先保留定制'); continue }
        const files = { ...catalog.files, resourceId: id, ownership: `${catalog.files.ownership}:${employeeId}` }
        const resource = { ...catalog.resource, id, path: join(this.port.dataPath, 'skills', id, files.name), ownerAgentId: employeeId }
        const copy = { id, origin: catalog.origin, employeeId, resource, files }
        await this.port.store.write([{ collection: copiesCollection, id, value: copy }]); this.copies.set(id, copy)
        await this.files.prepare(catalog.resource.path, files, resource.description, new AbortController().signal)
      }
    }
  }
  async assertReady(installation: CapabilityInstallation, ids: string[]) {
    for (const contribution of installation.contributions.filter(value => ids.includes(value.id) && value.kind === 'source')) {
      const source = this.port.sources.get(contribution.objectId)
      const definition = installation.definitions.find(value => value.key === contribution.key)
      if (!source.enabled) throw new Error('包数据源已停用')
      if (definition?.kind === 'source' && definition.requiredSecrets.length && !source.hasCredential) throw new Error('能力包缺少凭据，请先配置')
      if (source.type === 'mcp' && source.mcp.transport === 'stdio' && definition?.kind === 'source' && definition.requiredSecrets.length) {
        const env = JSON.parse(await this.port.sources.getCredential({ id: source.id, expectedRevision: source.revision })) as Record<string, string>
        if (definition.requiredSecrets.some(name => !env[name])) throw new Error('能力包所需环境凭据不完整')
      }
    }
  }
  async applyBinding(tx: RecordTransaction, installation: CapabilityInstallation, previous: CapabilityBinding | undefined, next: CapabilityBinding | undefined, expectedConfigVersion?: number) {
    const employeeId = next?.employeeId ?? previous?.employeeId
    if (!employeeId) throw new Error('缺少员工绑定身份')
    const agent = await tx.get<DigitalAgent>('agents', employeeId)
    if (!agent || expectedConfigVersion !== undefined && agent.configVersion !== expectedConfigVersion) throw new Error('员工配置已变化')
    const copies = await tx.list<OwnedSkill>(copiesCollection)
    const oldSkills = copies.filter(value => value.origin.installationId === installation.id && value.employeeId === employeeId).map(value => value.id)
    const oldSources = (await tx.list<{ id: string; capabilityPackage?: SourcePackageOrigin }>('dataSources')).filter(value => value.capabilityPackage?.installationId === installation.id).map(value => value.id)
    const skillIds = agent.skillIds.filter(id => !oldSkills.includes(id)), sourceIds = (agent.sourceIds ?? []).filter(id => !oldSources.includes(id))
    for (const contribution of installation.contributions.filter(value => next?.contributionIds.includes(value.id))) {
      if (contribution.kind === 'source') sourceIds.push(contribution.objectId)
      else {
        const copy = copies.find(value => value.origin.contributionId === contribution.id && value.employeeId === employeeId && value.origin.version === installation.contentHash)
        if (!copy) throw new Error('员工技能副本尚未准备')
        for (const id of skillIds) if ((await tx.get<Resource>('resources', id))?.name === copy.resource.name) throw new Error('员工已有同名技能，请明确处理来源冲突')
        await tx.put({ collection: 'resources', id: copy.id, value: copy.resource }); skillIds.push(copy.id)
      }
    }
    if (skillIds.length > 100 || sourceIds.length > 100) throw new Error('员工绑定资源超过上限')
    await tx.put({ collection: 'agents', id: agent.id, value: { ...agent, skillIds, sourceIds, configVersion: agent.configVersion + 1 } })
  }
  async assertIdle(installationId: string) {
    await this.port.assertEmployeesIdle(this.packages.listBindings(installationId).filter(value => value.contributionIds.length).map(value => value.employeeId))
  }
  async drain(installationId: string, employeeId?: string) {
    const employeeIds = this.packages.listBindings(installationId).filter(value => !employeeId || value.employeeId === employeeId).map(value => value.employeeId)
    await this.port.drainEmployees(employeeIds)
    for (const source of this.port.sources.list().filter(value => value.capabilityPackage?.installationId === installationId)) await this.port.sources.closeSource(source.id, employeeId)
  }
  changed(_installationId: string) { return this.port.changed() }
  async retire(installation: CapabilityInstallation, contributions: CapabilityContribution[]) {
    const retained: string[] = [], ids = new Set(contributions.filter(value => value.ownership === 'owned').map(value => value.id))
    for (const copy of this.copies.values()) if (copy.released && copy.origin.installationId === installation.id && copy.origin.version === installation.contentHash && ids.has(copy.origin.contributionId)) retained.push(copy.resource.path)
    // Deleted Source rows can still own a durable secret-cleanup intent; do not rely only on the live source list.
    for (const contribution of contributions.filter(value => value.kind === 'source' && ids.has(value.id))) await this.port.sources.reconcileManagedCleanup(originOf(installation, contribution))
    for (const source of this.port.sources.list().filter(value => value.capabilityPackage?.installationId === installation.id && value.capabilityPackage.version === installation.contentHash && ids.has(value.capabilityPackage.contributionId))) {
      await this.port.sources.removeManaged({ id: source.id, expectedRevision: source.revision }, source.capabilityPackage!)
    }
    for (const copy of [...this.copies.values()].filter(value => !value.released && value.origin.installationId === installation.id && value.origin.version === installation.contentHash && ids.has(value.origin.contributionId))) {
      let preserve = (await this.port.store.load<DigitalAgent>('agents')).some(agent => agent.skillIds.includes(copy.id))
      if (!preserve) { try { await this.files.cleanup(copy.files) } catch { preserve = true } }
      if (preserve) retained.push(copy.resource.path)
      await this.port.store.transaction(async tx => {
        if (!preserve) { await tx.remove('resources', copy.id); await tx.remove('skillInstallations', copy.id) }
        else if (!await tx.get('resources', copy.id)) await tx.put({ collection: 'resources', id: copy.id, value: copy.resource })
        if (preserve) await tx.put({ collection: copiesCollection, id: copy.id, value: { ...copy, released: true } })
        else await tx.remove(copiesCollection, copy.id)
      })
      if (preserve) this.copies.set(copy.id, { ...copy, released: true })
      else this.copies.delete(copy.id)
    }
    return retained
  }
}
