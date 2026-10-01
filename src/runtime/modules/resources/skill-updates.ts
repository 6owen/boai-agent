/*
 * [INPUT]: 已安装来源、同一技能扫描管道、SQLite、宿主使用状态与受管目录。
 * [OUTPUT]: 显式更新 D4 新副本时仅在原最终事务同步其 hash/文件清单，UUID/所有权不变，失败保留旧清理证据。
 * [OUTPUT]: 本机技能和受管副本共用检查/更新；读取旧 CLI 来源、未知安装基线须确认替换、本地同盘恢复且不创建员工资源； 只读单项/批量检查、文件差异/本地修改确认、固定预览提交及保留真实旧内容的交换/回滚/恢复。
 * [POS]: Skills 更新用例；下载和 hash 不占宿主锁，文件切换前独占资源，不取消员工任务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { Resource } from '../../../shared/domain'
import type { ScanSkillSourceInput, SkillInstallation, SkillOperation, SkillUpdateCheck, UpdateSkillInput, SkillUpdateBatch } from '../../../shared/domain/skills'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { restrictedPath } from '../workspaces/file-access'
import { inspectResourceTree } from './local-resources'
import type { SkillManagement } from './skill-management'
import type { LocalSkillUpdateTargets } from './local-skill-updates'
import type { BindingFiles } from './skill-binding-files'

const id = z.string().min(1).max(200), digest = z.string().regex(/^[a-f0-9]{64}$/)
export const updateSkillSchema = z.object({ requestId: id, planId: id, expectedRevision: z.number().int().positive(), expectedHash: digest, replaceLocalChanges: z.boolean().optional() }).strict()
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const time = () => new Date().toISOString()
type UpdateTarget = Pick<Resource, 'id' | 'name' | 'description' | 'path' | 'ownerAgentId'> & { managed?: Resource }
type Journal = { localName?: string; directory: string; target: string; oldHash: string; installedHash?: string; newHash: string; oldRevision: number; phase: 'prepared' | 'files-swapped' | 'committed' | 'cleaned' | 'rolled-back' | 'repair-required'; error?: string }
type UpdateOperation = SkillOperation & { kind: 'update'; resourceId: string; fingerprint: string; journal: Journal }
type Plan = { check: SkillUpdateCheck; sourceIdentity: string; installedHash: string }
type Hooks = {
  resource: (id: string) => Resource
  critical: <T>(action: () => Promise<T>) => Promise<T>
  unused: (resourceId: string) => Promise<void>
  invalidateMemory: (resourceId: string) => Promise<void>
  affectedEmployees: (resourceId: string) => { id: string; name: string }[]
  commit: (tx: RecordTransaction, resource: Resource) => Promise<() => Promise<void>>
  changed: () => void
  failed: (error: string) => void
}

export class SkillUpdates {
  private plans = new Map<string, Plan>()
  private locks = new Set<string>()
  private repairs = new Map<string, string>()
  private tasks = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  private checking = new Map<string, Promise<SkillUpdateCheck>>()
  private scanRequests = new Set<string>()
  private batch?: { value: SkillUpdateBatch; controller: AbortController; promise: Promise<void> }
  private closing = false
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly skills: SkillManagement, private readonly hooks: Hooks, private readonly local?: LocalSkillUpdateTargets) {}
  get busy() { return this.tasks.size > 0 || this.repairs.size > 0 }
  operationStatus(operation: SkillOperation): SkillOperation { return this.tasks.has(operation.id) ? { ...operation, status: 'running' } : operation }
  assertAvailable(resourceId: string) {
    if (this.repairs.has(resourceId)) throw new Error('技能文件需要修复，已暂停使用：' + this.repairs.get(resourceId))
    if (this.locks.has(resourceId)) throw new Error('此技能正在更新，请等待更新结束')
  }
  private async installation(resourceId: string) {
    const installation = await this.store.transaction(tx => tx.get<SkillInstallation>('skillInstallations', resourceId))
    if (!installation) throw new Error('此本地副本没有可更新来源，请重新导入')
    return installation
  }
  private async target(id: string): Promise<UpdateTarget> {
    if (id.startsWith('local:')) {
      if (!this.local) throw new Error('本地技能更新未启用')
      return this.local.target(id)
    }
    const managed = this.hooks.resource(id)
    return { ...managed, managed }
  }
  private async findInstallation(resource: UpdateTarget) {
    const previous = await this.store.transaction(tx => tx.get<SkillInstallation>('skillInstallations', resource.id))
    if (resource.managed || (previous && !['local', 'snapshot'].includes(previous.source.kind))) return previous
    const source = (await this.local?.sources())?.get(resource.id)
    if (!source) return previous
    const current = await inspectResourceTree(resource.path)
    return this.store.transaction(async tx => {
      const existing = await tx.get<SkillInstallation>('skillInstallations', resource.id)
      if (existing?.revision !== previous?.revision) return existing
      // CLI tree hashes use a different format. Never claim the observed files are an original install baseline.
      const value: SkillInstallation = { resourceId: resource.id, source, contentHash: current.hash, baselineUnknown: true, revision: (existing?.revision ?? 0) + 1, installedAt: existing?.installedAt ?? time() }
      await tx.put({ collection: 'skillInstallations', id: resource.id, value })
      return value
    })
  }
  async checks() {
    // Scan plans are process-local and expire independently of the durable check result.
    return (await this.store.load<SkillUpdateCheck>('skillUpdateChecks')).map(value => {
      if (value.planId && (!this.plans.has(value.planId) || !this.skills.canPreview(value.planId))) return { ...value, planId: undefined, candidateId: undefined }
      return value
    })
  }
  async latestBatch() {
    if (this.batch) return { ...structuredClone(this.batch.value), status: 'running' as const }
    return (await this.store.load<SkillUpdateBatch>('skillUpdateBatches')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  }
  checkAll(requestId: string, scope?: 'local'): Promise<SkillUpdateBatch> {
    return this.hooks.critical(async () => {
      if (this.closing) throw new Error('服务正在退出')
      const previous = await this.store.transaction(tx => tx.get<SkillUpdateBatch>('skillUpdateBatches', requestId))
      if (previous) return previous
      if (this.batch) return structuredClone(this.batch.value)
      const items: SkillUpdateBatch['items'] = []
      const localNames = new Map((await this.local?.entries() ?? []).map(skill => [skill.id, skill.name]))
      const ids = new Set((await this.store.load<SkillInstallation>('skillInstallations')).filter(installed => !['local', 'snapshot'].includes(installed.source.kind) && (scope !== 'local' || installed.resourceId.startsWith('local:')) && (!installed.resourceId.startsWith('local:') || localNames.has(installed.resourceId))).map(installed => installed.resourceId))
      for (const id of (await this.local?.sources())?.keys() ?? []) ids.add(id)
      for (const id of ids) {
        try { const resource = await this.target(id); items.push({ resourceId: id, name: resource.name, status: 'pending' }) }
        catch (error) { if (localNames.has(id)) items.push({ resourceId: id, name: localNames.get(id)!, status: 'failed', error: message(error) }) }
      }
      const value: SkillUpdateBatch = { id: requestId, createdAt: time(), status: 'running', items }
      await this.saveBatch(value)
      const controller = new AbortController()
      const promise = Promise.resolve().then(async () => {
        try {
          for (const item of value.items) {
            if (controller.signal.aborted || this.closing) break
            if (item.status !== 'pending') continue
            const check = await this.check(item.resourceId)
            item.status = check.status; item.error = check.error; item.localModified = check.localModified
            await this.saveBatch(value); this.hooks.changed()
          }
          value.status = this.closing ? 'interrupted' : controller.signal.aborted ? 'cancelled' : 'completed'
        } catch (error) {
          value.status = 'interrupted'
          this.hooks.failed('批量更新检查中断：' + message(error))
        } finally { await this.saveBatch(value) }
      }).catch(error => this.hooks.failed('批量更新检查结果保存失败：' + message(error))).finally(() => { this.batch = undefined; this.hooks.changed() })
      this.batch = { value, controller, promise }
      return structuredClone(value)
    })
  }
  cancelBatch() { this.batch?.controller.abort() }
  private saveBatch(value: SkillUpdateBatch) { return this.store.write([{ collection: 'skillUpdateBatches', id: value.id, value }]) }
  check(resourceId: string): Promise<SkillUpdateCheck> {
    if (this.closing) return Promise.reject(new Error('服务正在退出'))
    const existing = this.checking.get(resourceId)
    if (existing) return existing.then(value => structuredClone(value))
    const promise = this.performCheck(resourceId).finally(() => this.checking.delete(resourceId))
    this.checking.set(resourceId, promise)
    return promise.then(value => structuredClone(value))
  }
  private async performCheck(resourceId: string): Promise<SkillUpdateCheck> {
    const check: SkillUpdateCheck = { resourceId, checkedAt: time(), status: 'failed' }
    let scanId: string | undefined
    let localExists = false
    try {
      this.assertAvailable(resourceId)
      const resource = await this.target(resourceId)
      localExists = !resource.managed
      const installed = await this.findInstallation(resource), source = installed?.source
      if (!installed || !source || source.kind === 'local' || source.kind === 'snapshot') {
        check.status = 'unsupported'; check.error = source && 'reason' in source ? source.reason ?? '本地来源需重新导入以更新' : '本地来源需重新导入以更新'
      } else {
        const current = await inspectResourceTree(resource.path)
        check.localModified = current.hash !== installed.contentHash
        check.baselineUnknown = installed.baselineUnknown
        const input: ScanSkillSourceInput = source.kind === 'git' ? { kind: 'github', source: source.repository, ref: source.ref, ...(source.skillPath !== '.' ? { subpath: source.skillPath } : {}) } : source.kind === 'url' ? { kind: 'url', source: source.url } : { kind: 'marketplace', source: source.providerItemId, provider: source.provider }
        if (this.closing) throw new Error('应用退出，更新检查中断')
        const requestId = randomUUID(); this.scanRequests.add(requestId)
        const scan = await this.skills.scan({ ...input, requestId, ...(resource.managed ? { ownerAgentId: resource.ownerAgentId } : { target: 'local' as const }) }).finally(() => this.scanRequests.delete(requestId))
        scanId = scan.id
        const candidates = source.kind === 'url' || source.kind === 'marketplace' ? scan.candidates.filter(candidate => candidate.relativePath === source.skillPath) : scan.candidates
        if (candidates.length !== 1 || candidates[0].error) throw new Error(candidates[0]?.error ?? '更新包的技能路径已变化，请重新导入并检查')
        const candidate = candidates[0]
        if (candidate.name !== resource.name) throw new Error('更新包的 name 已变化，不能原位替换，请作为新技能导入')
        if (candidate.source?.identity !== source.identity) throw new Error('更新来源身份已变化，请重新导入并检查')
        const preview = await this.skills.preview(scan.id, candidate.id)
        if ((await this.installation(resourceId)).revision !== installed.revision || (await inspectResourceTree(resource.path)).hash !== current.hash) throw new Error('检查期间本地版本已变化，请重新检查')
        const oldFiles = new Map(current.files.map(file => [file.path, file.hash])), newFiles = new Map(preview.files.map(file => [file.path, file.hash]))
        Object.assign(check, { status: candidate.contentHash === current.hash ? 'current' : 'available', expectedHash: current.hash, expectedRevision: installed.revision, candidateHash: candidate.contentHash, source: candidate.source, currentSource: source, affectedEmployees: resource.managed ? this.hooks.affectedEmployees(resourceId) : [], fileChanges: {
          added: [...newFiles.keys()].filter(path => !oldFiles.has(path)), removed: [...oldFiles.keys()].filter(path => !newFiles.has(path)), modified: [...newFiles].filter(([path, hash]) => oldFiles.has(path) && oldFiles.get(path) !== hash).map(([path]) => path), unchanged: [...newFiles].filter(([path, hash]) => oldFiles.get(path) === hash).length,
        } })
        if (check.status === 'available') {
          check.planId = scan.id; check.candidateId = candidate.id
          for (const [key, old] of this.plans) if (old.check.resourceId === resourceId || !this.skills.canPreview(key)) { this.plans.delete(key); await this.skills.discardScan(key) }
          this.plans.set(scan.id, { check: structuredClone(check), sourceIdentity: source.identity, installedHash: installed.contentHash })
          scanId = undefined
        }
      }
    } catch (error) { check.status = 'failed'; check.error = message(error) }
    finally { if (scanId) await this.skills.discardScan(scanId) }
    await this.store.transaction(async tx => { if (localExists || await tx.get('resources', resourceId)) await tx.put({ collection: 'skillUpdateChecks', id: resourceId, value: check }) })
    this.hooks.changed()
    return check
  }
  async update(input: UpdateSkillInput): Promise<SkillOperation> {
    const fingerprint = createHash('sha256').update(JSON.stringify([input.planId, input.expectedRevision, input.expectedHash, ...(input.replaceLocalChanges ? [true] : [])])).digest('hex')
    return this.hooks.critical(async () => {
      const previous = await this.store.transaction(tx => tx.get<UpdateOperation>('skillOperations', input.requestId))
      if (previous) {
        if (previous.kind !== 'update' || previous.fingerprint !== fingerprint) throw new Error('requestId 已用于不同管理请求')
        return this.operationStatus(await this.skills.getOperation(previous.id))
      }
      const plan = this.plans.get(input.planId)
      if (!plan || plan.check.expectedRevision !== input.expectedRevision || plan.check.expectedHash !== input.expectedHash) throw new Error('更新预览已过期或版本不一致，请重新检查')
      if ((plan.check.localModified || plan.check.baselineUnknown) && !input.replaceLocalChanges) throw new Error('此副本有本地修改，请明确确认替换，或保留当前内容')
      const resource = await this.target(plan.check.resourceId)
      this.assertAvailable(resource.id)
      if (resource.managed) await this.hooks.unused(resource.id)
      const installed = await this.installation(resource.id)
      if (installed.revision !== input.expectedRevision || installed.contentHash !== plan.installedHash || installed.source.identity !== plan.sourceIdentity) throw new Error('已安装版本已变化，请重新检查')
      const candidate = this.skills.acquireCandidate(input.planId, plan.check.candidateId!)
      this.locks.add(resource.id)
      const operation: UpdateOperation = { id: input.requestId, kind: 'update', scanId: input.planId, resourceId: resource.id, fingerprint, status: 'running', createdAt: time(), items: [{ candidateId: candidate.candidate.id, resourceId: resource.id, name: resource.name, status: 'pending' }], journal: { directory: randomUUID(), ...(resource.managed ? { target: relative(this.dataPath, resource.path).split(sep).join('/') } : { localName: basename(resource.path), target: resource.path }), oldHash: input.expectedHash, installedHash: installed.contentHash, newHash: candidate.candidate.contentHash!, oldRevision: installed.revision, phase: 'prepared' } }
      try { await this.save(operation) } catch (error) { this.locks.delete(resource.id); await this.skills.releaseCandidate(input.planId); throw error }
      const controller = new AbortController()
      const promise = this.perform(operation, resource, installed, candidate, controller.signal).catch(error => this.hooks.failed('技能更新恢复失败：' + message(error))).finally(async () => {
        this.plans.delete(input.planId)
        await this.skills.releaseCandidate(input.planId)
      }).catch(error => this.hooks.failed('技能更新临时文件清理失败：' + message(error))).finally(() => { this.locks.delete(resource.id); this.tasks.delete(operation.id); if (!resource.managed) this.local?.changed(); this.hooks.changed() })
      this.tasks.set(operation.id, { controller, promise })
      return this.operationStatus(await this.skills.getOperation(operation.id))
    })
  }
  private async paths(operation: UpdateOperation) {
    if (!/^[a-f0-9-]{36}$/.test(operation.journal.directory) || !digest.safeParse(operation.journal.oldHash).success || !digest.safeParse(operation.journal.newHash).success || (operation.journal.installedHash !== undefined && !digest.safeParse(operation.journal.installedHash).success)) throw new Error('更新恢复日志格式无效')
    if (operation.resourceId.startsWith('local:')) {
      if (!this.local || !operation.journal.localName) throw new Error('本地技能更新恢复记录不完整')
      const paths = await this.local.paths(operation.resourceId, operation.journal.localName, operation.journal.directory)
      if (paths.target !== operation.journal.target) throw new Error('本地技能恢复路径已变化')
      return paths
    }
    const resource = this.hooks.resource(operation.resourceId)
    const target = join(this.dataPath, operation.journal.target)
    if (resolve(target) !== resolve(resource.path) || relative(this.dataPath, target).startsWith('..')) throw new Error('更新恢复路径与受管技能不一致')
    const root = join(this.dataPath, 'skills', `.update-${operation.journal.directory}`)
    return { boundary: this.dataPath, root, target, next: join(root, 'next'), old: join(root, 'old') }
  }
  private save(operation: UpdateOperation) { return this.store.write([{ collection: 'skillOperations', id: operation.id, value: operation }]) }
  private async hash(path: string, boundary: string) {
    try { await lstat(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
    await restrictedPath([boundary], path)
    return (await inspectResourceTree(path)).hash
  }
  private async perform(operation: UpdateOperation, resource: UpdateTarget, installed: SkillInstallation, candidate: ReturnType<SkillManagement['acquireCandidate']>, signal: AbortSignal) {
    try {
      const paths = await this.paths(operation)
      signal.throwIfAborted()
      await mkdir(paths.root)
      await restrictedPath([paths.boundary], paths.root)
      await cp(candidate.path, paths.next, { recursive: true, dereference: false, errorOnExist: true, force: false })
      if (await this.hash(paths.next, paths.boundary) !== operation.journal.newHash || await this.hash(paths.target, paths.boundary) !== operation.journal.oldHash) throw new Error('更新前内容已变化，请重新检查')
      if (resource.managed) await this.hooks.invalidateMemory(resource.id)
      await this.hooks.critical(async () => {
        signal.throwIfAborted()
        if (resource.managed) await this.hooks.unused(resource.id)
        await restrictedPath([paths.boundary], dirname(paths.target))
        await rename(paths.target, paths.old)
        await rename(paths.next, paths.target)
        operation.journal.phase = 'files-swapped'; await this.save(operation)
      })
      // Keep the resource locked while hashing the detached old tree and its replacement.
      if (await this.hash(paths.old, paths.boundary) !== operation.journal.oldHash || await this.hash(paths.target, paths.boundary) !== operation.journal.newHash) throw new Error('文件交换期间内容已变化，更新未提交')
      const currentTree = (installed as SkillInstallation & { bindingCopy?: BindingFiles }).bindingCopy ? await inspectResourceTree(paths.target, signal) : undefined
      if (currentTree && currentTree.hash !== operation.journal.newHash) throw new Error('更新内容已变化，未提交')
      await this.hooks.critical(async () => {
        signal.throwIfAborted()
        let publish!: () => Promise<void>
        await this.store.transaction(async tx => {
          const current = await tx.get<SkillInstallation & { bindingCopy?: BindingFiles }>('skillInstallations', resource.id)
          if (current?.revision !== installed.revision || current.contentHash !== installed.contentHash) throw new Error('提交时技能版本已变化')
          if (current.bindingCopy && !currentTree) throw new Error('技能绑定清理证据已变化，请重新检查')
          if (resource.managed) {
            const updated = { ...resource.managed, description: candidate.candidate.description }
            await tx.put({ collection: 'resources', id: resource.id, value: updated })
            publish = await this.hooks.commit(tx, updated)
          } else publish = async () => { this.local?.changed() }
          await tx.put({ collection: 'skillInstallations', id: resource.id, value: { ...installed, ...(current.bindingCopy && currentTree ? { bindingCopy: { ...current.bindingCopy, contentHash: currentTree.hash, files: currentTree.files } } : {}), baselineUnknown: undefined, source: candidate.source, revision: installed.revision + 1, contentHash: operation.journal.newHash, updatedAt: time() } satisfies SkillInstallation & { bindingCopy?: BindingFiles } })
          operation.journal.phase = 'committed'; operation.items[0].status = 'updated'; operation.items[0].resourceId = resource.id; operation.status = 'completed'
          await tx.put({ collection: 'skillOperations', id: operation.id, value: operation })
          await tx.remove('skillUpdateChecks', resource.id)
        })
        await publish()
      })
      await this.recover(operation)
    } catch (error) {
      // DB truth decides rollback even if the in-memory object reached "committed" before a failed transaction.
      operation.items[0].error = message(error)
      operation.status = signal.aborted ? 'cancelled' : 'interrupted'
      await this.recover(operation)
    }
  }
  private async recover(operation: UpdateOperation) {
    try {
      const paths = await this.paths(operation), installed = await this.installation(operation.resourceId)
      const current = await this.hash(paths.target, paths.boundary), old = await this.hash(paths.old, paths.boundary)
      if (installed.revision === operation.journal.oldRevision + 1 && installed.contentHash === operation.journal.newHash) {
        if (current !== operation.journal.newHash) throw new Error('数据库已提交，但技能文件与新版本不一致；保留文件等待修复')
        if (old !== undefined && old !== operation.journal.oldHash) throw new Error('旧版本备份已变化；保留文件等待修复')
        operation.status = 'completed'; operation.items[0].status = 'updated'; operation.items[0].resourceId = operation.resourceId
        operation.journal.phase = 'committed'; await this.save(operation)
        await rm(paths.root, { recursive: true, force: true })
        operation.journal.phase = 'cleaned'
      } else if (installed.revision === operation.journal.oldRevision && installed.contentHash === (operation.journal.installedHash ?? operation.journal.oldHash)) {
        if (old === operation.journal.oldHash && (current === undefined || current === operation.journal.newHash)) {
          if (current !== undefined) await rm(paths.target, { recursive: true })
          await rename(paths.old, paths.target)
        } else if (!(old === undefined && current !== undefined && (current === operation.journal.oldHash || operation.journal.phase === 'prepared'))) throw new Error('不能确定一致的旧版本；保留文件等待修复')
        if (old !== undefined && await this.hash(paths.target, paths.boundary) !== operation.journal.oldHash) throw new Error('旧版本恢复校验失败')
        await rm(paths.root, { recursive: true, force: true })
        operation.journal.phase = 'rolled-back'; operation.status = operation.status === 'cancelled' ? 'cancelled' : 'interrupted'; operation.items[0].status = 'failed'; delete operation.items[0].resourceId
        operation.items[0].error ??= '更新未提交，已恢复旧版本；请重新检查更新'
      } else throw new Error('更新日志与数据库版本不一致；保留文件等待修复')
      delete operation.journal.error
      this.repairs.delete(operation.resourceId)
    } catch (error) {
      operation.journal.phase = 'repair-required'; operation.journal.error = message(error)
      operation.items[0].error = message(error); operation.status = 'interrupted'; operation.items[0].status = 'failed'
      this.repairs.set(operation.resourceId, message(error))
      this.hooks.failed('技能更新需要修复：' + message(error))
    }
    await this.save(operation)
  }
  async init() {
    for (const operation of await this.store.load<UpdateOperation>('skillOperations')) if (operation.kind === 'update' && !['cleaned', 'rolled-back'].includes(operation.journal.phase)) await this.recover(operation)
    for (const batch of await this.store.load<SkillUpdateBatch>('skillUpdateBatches')) if (batch.status === 'running') { batch.status = 'interrupted'; await this.saveBatch(batch) }
  }
  async cancel(operationId: string) { this.tasks.get(operationId)?.controller.abort(new Error('用户取消更新')) }
  async close() {
    this.closing = true
    this.batch?.controller.abort()
    await Promise.all([...this.scanRequests].map(id => this.skills.cancelScan(id)))
    await Promise.allSettled([...this.checking.values()])
    await this.batch?.promise
    for (const task of this.tasks.values()) task.controller.abort(new Error('应用退出，技能更新中断'))
    await Promise.allSettled([...this.tasks.values()].map(value => value.promise))
  }
}
