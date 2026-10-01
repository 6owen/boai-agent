/*
 * [INPUT]: 用户选择的本地/远程来源、受管资源、SQLite 与宿主短临界区。
 * [OUTPUT]: 已保存员工的本机单技能来源/hash/版本冻结，副本、安装来源、员工授权与回执同事务；未知先只读核对，失败/重启 hash 安全清理。
 * [OUTPUT]: 本地文件发布后立即使目录缓存失效； 本地目标写入 ~/.agents/skills 并保存 local 身份/来源/收藏，不创建员工资源；兼容旧受管安装，保留预览复核、幂等操作与重启中断恢复。
 * [POS]: resources 的技能管理与显式员工绑定用例；不执行技能脚本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, mkdir, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { DigitalAgent, Resource } from '../../../shared/domain'
import type { BindLocalSkillInput, InstallSkillsInput, LocalSkill, PrepareLocalSkillBindingInput, SkillBindingPlan, SkillBindingReceipt, SkillCandidate, SkillDetail, SkillFileContent, SkillInstallation, SkillOperation, SkillScan, ScanSkillSourceInput, SkillSource } from '../../../shared/domain/skills'
import { SkillSources, type PreparedSkillSource } from '../../adapters/skills/source'
import { prepareSkillLibrary } from '../../adapters/skills/library-format'
export { scanSkillSchema } from '../../adapters/skills/source'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { boundedRead, restrictedPath, workspaceRelative } from '../workspaces/file-access'
import { importLocalResource, inspectResourceTree, parseSkillDocument, RESOURCE_LIMITS } from './local-resources'
import { mergeSkillCollection, readSkillCollections, writeSkillCollections } from './skill-collections'
import { LocalSkillInstallTarget } from './local-skill-install'
import { SkillBindingFiles, type BindingFiles } from './skill-binding-files'

const PLAN_TTL_MS = 15 * 60 * 1000
const MAX_PLANS = 20
const id = z.string().min(1).max(200)
export const installSkillsSchema = z.object({ requestId: id, scanId: id, candidateIds: z.array(id).min(1).max(2000).refine(ids => new Set(ids).size === ids.length), addToFavorites: z.boolean(), restoreCollections: z.boolean().optional() }).strict()
export const prepareLocalSkillBindingSchema = z.object({ localSkillId: id.regex(/^local:[a-f0-9]{64}$/), agentId: id, expectedConfigVersion: z.number().int().positive() }).strict()
export const bindLocalSkillSchema = prepareLocalSkillBindingSchema.extend({ requestId: id, planId: id, contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
type PreparedCandidate = { path: string; source: SkillSource; candidate: SkillCandidate; targetFingerprint: string; collection?: { favorite: boolean; group?: string } }
type Plan = { view: SkillScan; entries: Map<string, PreparedCandidate>; temporary?: string; submitted?: boolean; binding?: SkillBindingPlan; bindingInstallationFingerprint?: string }
type StoredOperation = SkillOperation & { fingerprint: string; plannedIds: Record<string, string>; target?: 'local'; localMoves?: Record<string, { name: string; hash: string; resourceId: string }>; ownerAgentId?: string; ownerMoves?: Record<string, { name: string; hash: string }>; binding?: { receipt: SkillBindingReceipt; files?: BindingFiles; localInstallationFingerprint?: string }; cleared?: boolean }
type Hooks = {
  resources: () => Resource[]
  owner: (id: string) => void
  critical: <T>(operation: () => Promise<T>) => Promise<T>
  committed: (resource: Resource) => void
  changed: () => void
  localChanged?: () => void
  failed: (error: string) => void
  bindingEmployee?: (agentId: string, expectedConfigVersion: number) => DigitalAgent
  bindEmployee?: (tx: RecordTransaction, agentId: string, expectedConfigVersion: number, resource: Resource) => Promise<DigitalAgent>
  bindingCommitted?: (agent: DigitalAgent) => Promise<void>
  localSource?: (id: string) => Promise<string>
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const installationFingerprint = (value?: SkillInstallation) => hash(JSON.stringify(value ? [value.revision, value.source, value.contentHash] : null))

export class SkillManagement {
  private plans = new Map<string, Plan>()
  private tasks = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private preparations = new Map<string, { controller: AbortController; task: Promise<SkillScan> }>()
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly hooks: Hooks, private readonly sources: SkillSources, private readonly localTarget = new LocalSkillInstallTarget()) {}
  get busy() { return this.tasks.size > 0 }
  async init() {
    await this.sources.clearStaging()
    for (const operation of await this.store.load<StoredOperation>('skillOperations')) {
      if (operation.kind === 'binding') {
        if (operation.binding?.receipt.status === 'running') {
          operation.status = 'interrupted'; operation.binding.receipt.status = 'interrupted'
          operation.binding.receipt.error = '应用退出时绑定未提交；请核对原回执后重新准备'
          operation.items[0].status = 'skipped'; operation.items[0].error = operation.binding.receipt.error
          await this.saveOperation(operation)
        }
        if (operation.binding && operation.binding.receipt.status !== 'completed') await this.cleanupBinding(operation)
        continue
      }
      if (operation.kind === 'update' || operation.kind === 'library-export') continue
      if (operation.status !== 'running') continue
      if (operation.target === 'local') {
        for (const item of operation.items) {
          if (item.status === 'pending') {
            item.status = 'skipped'
            item.error = operation.localMoves?.[item.candidateId] ? '应用退出时安装结果未确认；本地文件已保留，请重新扫描' : '应用退出时安装未完成，请重新扫描'
          }
          await this.localTarget.discard(operation.plannedIds[item.candidateId])
        }
        operation.status = 'interrupted'
        await this.saveOperation(operation)
        continue
      }
      for (const item of operation.items) {
        if (item.status !== 'pending') continue
        const resourceId = operation.plannedIds[item.candidateId]
        const resource = this.hooks.resources().find(resource => resource.id === resourceId)
        if (resource) { item.resourceId = resource.id; item.status = 'installed' }
        else {
          const move = operation.ownerMoves?.[item.candidateId]
          if (move && operation.ownerAgentId && /^[a-z0-9][a-z0-9-]{0,63}$/.test(move.name) && !operation.ownerAgentId.includes('/') && !operation.ownerAgentId.includes('\\')) {
            const path = join(this.dataPath, 'agents', operation.ownerAgentId, 'workspace', 'skills', move.name)
            try {
              await restrictedPath([this.dataPath], path)
              if ((await inspectResourceTree(path)).hash !== move.hash) throw new Error('中断的专属技能已发生外部修改，请先核对文件：' + path)
              await rm(path, { recursive: true })
            } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
          }
          item.status = 'skipped'; item.error = '应用退出时安装未提交，请重新扫描'; await this.cleanup(resourceId)
        }
      }
      operation.status = 'interrupted'
      await this.saveOperation(operation)
    }
  }
  private resource(id: string) {
    const resource = this.hooks.resources().find(resource => resource.id === id && resource.kind === 'skill')
    if (!resource) throw new Error('技能不存在')
    return resource
  }
  private targetFingerprint(name: string, ownerAgentId?: string, ownIds: string[] = []) {
    return hash(JSON.stringify(this.hooks.resources().filter(resource => resource.kind === 'skill' && resource.name === name && resource.ownerAgentId === ownerAgentId && !ownIds.includes(resource.id)).map(resource => [resource.id, resource.path]).sort()))
  }
  async detail(resourceId: string): Promise<SkillDetail> {
    const resource = structuredClone(this.resource(resourceId))
    const tree = await inspectResourceTree(resource.path)
    const content = await boundedRead(await restrictedPath([resource.path], join(resource.path, 'SKILL.md')))
    const metadata = parseSkillDocument(content)
    const installed = (await this.store.load<SkillInstallation & { bindingCopy?: BindingFiles }>('skillInstallations')).find(value => value.resourceId === resourceId)
    const installation = installed ? (({ bindingCopy: _, ...value }) => value)(installed) : undefined
    this.resource(resourceId)
    return { resource, installation, content, contentHash: tree.hash, files: tree.files, warnings: metadata.warnings }
  }
  async readFile(resourceId: string, name: string): Promise<SkillFileContent> {
    const resource = this.resource(resourceId)
    const result = await this.readFileAt(resource.path, name)
    this.resource(resourceId)
    return result
  }
  private async readFileAt(root: string, name: string): Promise<SkillFileContent> {
    if (/^[a-z]:/i.test(name) || name.startsWith('\\')) throw new Error('Use a relative path inside the skill')
    const path = await restrictedPath([root], join(root, workspaceRelative(name)))
    const stat = await lstat(path)
    if (!stat.isFile() || stat.nlink > 1) throw new Error('只能读取技能中的普通文件')
    const content = await boundedRead(path)
    const binary = /[\x00\x01\x02\x03\x04\x05\x06\x07\x08]/.test(content) || content.includes('\uFFFD')
    return { path: name, size: stat.size, binary, ...(binary ? {} : { content }) }
  }
  private scanEntry(scanId: string, candidateId: string) {
    const plan = this.plans.get(scanId)
    if (!plan || plan.submitted || Date.parse(plan.view.expiresAt) <= Date.now()) throw new Error('技能预览已过期或已提交，请重新扫描')
    const entry = plan.entries.get(candidateId)
    if (!entry || entry.candidate.error) throw new Error('技能候选不存在或无效')
    return entry
  }
  canPreview(scanId: string) {
    const plan = this.plans.get(scanId)
    return !!plan && !plan.submitted && Date.parse(plan.view.expiresAt) > Date.now()
  }
  acquireCandidate(scanId: string, candidateId: string) {
    const entry = this.scanEntry(scanId, candidateId)
    this.plans.get(scanId)!.submitted = true
    return structuredClone(entry)
  }
  async releaseCandidate(scanId: string) {
    const plan = this.plans.get(scanId)
    if (plan) plan.submitted = false
    await this.discardScan(scanId)
  }
  async preview(scanId: string, candidateId: string) {
    const entry = this.scanEntry(scanId, candidateId), tree = await inspectResourceTree(entry.path)
    if (tree.hash !== entry.candidate.contentHash) throw new Error('源内容已变更，请重新扫描')
    const content = await boundedRead(await restrictedPath([entry.path], join(entry.path, 'SKILL.md')))
    if ((await inspectResourceTree(entry.path)).hash !== tree.hash) throw new Error('源内容已变更，请重新扫描')
    return { content, files: tree.files }
  }
  async readPreviewFile(scanId: string, candidateId: string, path: string) { return this.readFileAt(this.scanEntry(scanId, candidateId).path, path) }
  async scan(input: ScanSkillSourceInput): Promise<SkillScan> {
    if (input.target === 'local' && input.ownerAgentId) throw new Error('本地技能安装不指定员工')
    if (input.ownerAgentId) this.hooks.owner(input.ownerAgentId)
    const requestId = input.requestId ?? randomUUID()
    if (this.preparations.has(requestId)) throw new Error('此预览请求正在进行')
    const controller = new AbortController()
    const task = this.prepareScan(input, controller.signal)
    this.preparations.set(requestId, { controller, task })
    try { return await task } finally { this.preparations.delete(requestId) }
  }
  async cancelScan(requestId: string) {
    const pending = this.preparations.get(requestId)
    if (pending) { pending.controller.abort(new Error('技能预览已取消')); await pending.task.catch(() => {}) }
  }
  async discardScan(scanId: string) {
    const plan = this.plans.get(scanId)
    if (!plan || plan.submitted) return
    this.plans.delete(scanId)
    if (plan.temporary) await rm(plan.temporary, { recursive: true, force: true })
  }
  private async prepareScan(input: ScanSkillSourceInput, signal: AbortSignal) {
    const source = await this.sources.prepare(input, signal)
    try { return await this.scanPrepared(!input.kind || input.kind === 'folder' || input.kind === 'zip' ? await prepareSkillLibrary(source, signal) : source, input.ownerAgentId, signal, input.target) }
    catch (error) { if (source.temporary) await rm(source.temporary, { recursive: true, force: true }); throw error }
  }
  private async scanPrepared(prepared: PreparedSkillSource, ownerAgentId: string | undefined, signal: AbortSignal, target?: 'local'): Promise<SkillScan> {
    if (ownerAgentId) this.hooks.owner(ownerAgentId)
    const root = prepared.root
    if (!(await lstat(root)).isDirectory()) throw new Error('请选择包含 SKILL.md 的目录')
    const entries = new Map<string, PreparedCandidate>()
    const installations = await this.store.load<SkillInstallation>('skillInstallations')
    let count = 0, bytes = 0
    const visit = async (path: string, depth: number): Promise<void> => {
      signal.throwIfAborted()
      if (++count > RESOURCE_LIMITS.entries || depth > RESOURCE_LIMITS.depth) throw new Error('扫描目录超出数量或深度上限，请选择更小的目录')
      await restrictedPath([root], path)
      const info = await lstat(path)
      if (!info.isDirectory()) { bytes += info.size; if (bytes > RESOURCE_LIMITS.bytes) throw new Error('扫描目录不能超过 100 MB'); return }
      const names = (await readdir(path)).sort()
      if (names.includes('SKILL.md')) {
        const candidate: SkillCandidate = { id: randomUUID(), relativePath: relative(root, path).split(sep).join('/') || '.', name: relative(root, path) || 'Skill', description: '', bytes: 0, fileCount: 0, warnings: [] }
        try {
          const tree = await inspectResourceTree(path, signal)
          const metadata = parseSkillDocument(await boundedRead(join(path, 'SKILL.md')))
          Object.assign(candidate, metadata, { bytes: tree.bytes, fileCount: tree.files.length, contentHash: tree.hash })
          const hints = prepared.hints?.(path)
          if (hints) { candidate.warnings.push(...hints.warnings); if (hints.error) candidate.error = hints.error; if (hints.hash !== tree.hash) throw new Error('技能库内容已变更，请重新扫描') }
          count += tree.entries - 1; bytes += tree.bytes
          if (target === 'local') {
            const existing = await this.localTarget.inspect(candidate.name, signal)
            if (existing?.hash === tree.hash) candidate.existingResourceId = existing.id
            else if (existing) candidate.conflict = '本地已存在同名但内容不同的技能，不会覆盖'
          } else {
            const matching = this.hooks.resources().filter(resource => resource.kind === 'skill' && resource.name === candidate.name && resource.ownerAgentId === ownerAgentId)
            for (const resource of matching) {
              const installation = installations.find(value => value.resourceId === resource.id)
              if (installation?.source.identity === prepared.source(path).identity && (await inspectResourceTree(resource.path, signal)).hash === tree.hash) { candidate.existingResourceId = resource.id; break }
            }
            if (ownerAgentId && matching.length && !candidate.existingResourceId) candidate.conflict = '员工专属目录已存在同名技能，请先处理现有版本'
            else if (prepared.library && matching.length && !candidate.existingResourceId) candidate.conflict = '已存在同名但来源或内容不同的技能；默认跳过，请先处理现有版本'
          }
        } catch (error) { candidate.error = errorText(error) }
        candidate.source = prepared.source(path)
        entries.set(candidate.id, { path, source: candidate.source, candidate, targetFingerprint: this.targetFingerprint(candidate.name, ownerAgentId), collection: prepared.hints?.(path).collection })
        if (count > RESOURCE_LIMITS.entries || bytes > RESOURCE_LIMITS.bytes) throw new Error('扫描目录超出 2000 项或 100 MB 上限')
      } else for (const name of names) await visit(join(path, name), depth + 1)
    }
    await visit(root, 0)
    signal.throwIfAborted()
    if (prepared.expectedName) {
      if (!(prepared.singleCandidateAllowed && entries.size === 1)) for (const [id, entry] of entries) if (entry.candidate.name !== prepared.expectedName && entry.candidate.relativePath.split('/').at(-1) !== prepared.expectedName) entries.delete(id)
      if (entries.size !== 1) throw new Error('下载包中未找到唯一的所选技能，请核对商店来源：' + prepared.expectedName)
    }
    if (!entries.size) throw new Error('没有找到 SKILL.md，请选择技能目录或包含多个技能的文件夹')
    for (const [id, plan] of this.plans) if (Date.parse(plan.view.expiresAt) <= Date.now()) await this.discardScan(id)
    if (this.plans.size >= MAX_PLANS) {
      const oldest = [...this.plans].find(([, plan]) => !plan.submitted)
      if (!oldest) throw new Error('安装操作过多，请稍后重试')
      await this.discardScan(oldest[0])
    }
    const view: SkillScan = { id: randomUUID(), target, ownerAgentId, expiresAt: new Date(Date.now() + PLAN_TTL_MS).toISOString(), candidates: [...entries.values()].map(entry => entry.candidate), warnings: prepared.warnings, library: prepared.library }
    this.plans.set(view.id, { view, entries, temporary: prepared.temporary })
    return structuredClone(view)
  }
  private view(operation: StoredOperation): SkillOperation {
    return structuredClone({ id: operation.id, kind: operation.kind, outputName: operation.outputName, scanId: operation.scanId, status: operation.status, items: operation.items, createdAt: operation.createdAt })
  }
  async listOperations() { return (await this.store.load<StoredOperation>('skillOperations')).filter(operation => !operation.cleared).slice(-100).reverse().map(operation => this.view(operation)) }
  async listInstallations() { return (await this.store.load<SkillInstallation & { bindingCopy?: BindingFiles }>('skillInstallations')).map(({ bindingCopy: _, ...value }) => value) }
  async getOperation(id: string) {
    const value = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', id))
    if (!value) throw new Error('安装记录不存在')
    return this.view(value)
  }
  async prepareLocalBinding(input: PrepareLocalSkillBindingInput, localSkill: LocalSkill, path: string): Promise<SkillBindingPlan> {
    if (!this.hooks.bindingEmployee || !this.hooks.localSource) throw new Error('员工技能绑定服务不可用')
    this.hooks.bindingEmployee(input.agentId, input.expectedConfigVersion)
    const scan = await this.scan({ source: path, kind: 'folder', ownerAgentId: input.agentId })
    try {
      if (scan.candidates.length !== 1 || scan.candidates[0].relativePath !== '.') throw new Error('请选择一个包含 SKILL.md 的本机技能')
      const plan = this.plans.get(scan.id)!, entry = [...plan.entries.values()][0]
      if (entry.candidate.error || !entry.candidate.contentHash) throw new Error(entry.candidate.error ?? '技能内容无效')
      if (await this.hooks.localSource(input.localSkillId) !== path) throw new Error('本机来源身份已变更，请重新扫描')
      this.hooks.bindingEmployee(input.agentId, input.expectedConfigVersion)
      const installations = await this.store.load<SkillInstallation>('skillInstallations')
      const localInstallation = installations.find(value => value.resourceId === input.localSkillId)
      const source: SkillSource = localInstallation?.source ?? { kind: 'local', identity: hash(input.localSkillId), reason: '已发现的本机技能；未记录远程来源' }
      const warnings = [...entry.candidate.warnings]
      if (localInstallation && localInstallation.contentHash !== entry.candidate.contentHash) warnings.push('本机内容与已记录安装版本不同；绑定当前实际内容，不自动更新已有员工副本。')
      delete entry.candidate.existingResourceId; delete entry.candidate.conflict
      const matching = this.hooks.resources().filter(resource => resource.kind === 'skill' && resource.name === entry.candidate.name && resource.ownerAgentId === input.agentId)
      for (const resource of matching) {
        const installation = installations.find(value => value.resourceId === resource.id)
        if (installation?.localSkillId === input.localSkillId && installation.contentHash === entry.candidate.contentHash && installation.source.identity === source.identity && (await inspectResourceTree(resource.path)).hash === entry.candidate.contentHash) {
          entry.candidate.existingResourceId = resource.id; break
        }
      }
      if (matching.length && !entry.candidate.existingResourceId) throw new Error('员工已存在同名但来源或内容不同的技能，请先处理现有绑定')
      entry.source = structuredClone(source); entry.candidate.source = structuredClone(source)
      const view: SkillBindingPlan = { ...input, id: scan.id, candidateId: entry.candidate.id, localSkill: structuredClone(localSkill), expiresAt: scan.expiresAt, source: structuredClone(source), contentHash: entry.candidate.contentHash, warnings, existingResourceId: entry.candidate.existingResourceId }
      plan.binding = view
      plan.bindingInstallationFingerprint = installationFingerprint(localInstallation)
      return structuredClone(view)
    } catch (error) { await this.discardScan(scan.id); throw error }
  }
  async getBindingReceipt(requestId: string): Promise<SkillBindingReceipt | null> {
    const operation = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', requestId))
    if (!operation) return null
    if (operation.cleared) throw new Error('技能绑定记录已清理，原请求不能再次提交')
    if (operation.kind !== 'binding' || !operation.binding) throw new Error('requestId 已用于其他技能操作')
    return this.bindingReceiptView(operation.binding.receipt)
  }
  private bindingReceiptView(receipt: SkillBindingReceipt): SkillBindingReceipt {
    const view = structuredClone(receipt)
    // A portable backup relocates the managed file; the original commit identity/hash stay unchanged.
    if (view.status === 'completed' && view.resource) view.resource.path = this.resource(view.resource.id).path
    return view
  }
  async bindLocal(input: BindLocalSkillInput): Promise<SkillBindingReceipt> {
    const fingerprint = hash(JSON.stringify([input.planId, input.localSkillId, input.agentId, input.expectedConfigVersion, input.contentHash]))
    const admitted = await this.hooks.critical(async () => {
      const previous = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', input.requestId))
      if (previous) {
        if (previous.cleared) throw new Error('技能绑定记录已清理，原请求不能再次提交')
        if (previous.kind !== 'binding' || !previous.binding || previous.fingerprint !== fingerprint) throw new Error('requestId 已用于不同技能绑定请求')
        return { receipt: this.bindingReceiptView(previous.binding.receipt) }
      }
      if (!this.hooks.bindingEmployee || !this.hooks.bindEmployee || !this.hooks.bindingCommitted || !this.hooks.localSource) throw new Error('员工技能绑定服务不可用')
      const plan = this.plans.get(input.planId), view = plan?.binding
      if (!plan || !view || plan.submitted || Date.parse(view.expiresAt) <= Date.now()) throw new Error('绑定预览已过期或已提交，请重新准备')
      if (view.localSkillId !== input.localSkillId || view.agentId !== input.agentId || view.expectedConfigVersion !== input.expectedConfigVersion || view.contentHash !== input.contentHash) throw new Error('绑定请求与所见预览不一致，请重新准备')
      this.hooks.bindingEmployee(input.agentId, input.expectedConfigVersion)
      const entry = [...plan.entries.values()][0], resourceId = randomUUID()
      const tree = await inspectResourceTree(entry.path)
      if (tree.hash !== input.contentHash || await this.hooks.localSource(input.localSkillId) !== entry.path) throw new Error('源内容或身份已变更，请重新准备')
      const receipt: SkillBindingReceipt = { ...input, id: input.requestId, source: structuredClone(view.source), status: 'running', createdAt: new Date().toISOString() }
      const operation: StoredOperation = { id: input.requestId, kind: 'binding', scanId: input.planId, fingerprint, status: 'running', createdAt: receipt.createdAt, ownerAgentId: input.agentId, plannedIds: { [entry.candidate.id]: resourceId }, items: [{ candidateId: entry.candidate.id, name: entry.candidate.name, status: 'pending' }], binding: { receipt, localInstallationFingerprint: plan.bindingInstallationFingerprint, ...(view.existingResourceId ? {} : { files: { resourceId, name: entry.candidate.name, contentHash: input.contentHash, files: tree.files, ownership: randomUUID() } }) } }
      // An admission race across SQLite connections cannot overwrite an already accepted request.
      const saved = await this.store.transaction(async tx => {
        const concurrent = await tx.get<StoredOperation>('skillOperations', input.requestId)
        if (concurrent) {
          if (concurrent.cleared) throw new Error('技能绑定记录已清理，原请求不能再次提交')
          if (concurrent.kind !== 'binding' || !concurrent.binding || concurrent.fingerprint !== fingerprint) throw new Error('requestId 已用于不同技能绑定请求')
          return concurrent.binding.receipt
        }
        if (installationFingerprint(await tx.get<SkillInstallation>('skillInstallations', input.localSkillId)) !== operation.binding!.localInstallationFingerprint) throw new Error('本机技能来源记录已变更，请重新准备')
        await tx.put({ collection: 'skillOperations', id: operation.id, value: operation })
      })
      if (saved) return { receipt: this.bindingReceiptView(saved) }
      plan.submitted = true
      const controller = new AbortController()
      const task = Promise.resolve().then(() => this.performBinding(operation, entry, controller.signal)).finally(async () => { plan.submitted = false; await this.discardScan(plan.view.id) }).finally(() => this.tasks.delete(operation.id))
      // Observe errors even when the requesting renderer disappears.
      void task.catch(error => this.hooks.failed('技能绑定结果未知，请按原请求核对：' + errorText(error)))
      this.tasks.set(operation.id, { controller, task })
      return { task }
    })
    if (admitted.task) await admitted.task
    return admitted.receipt ?? await this.getBindingReceipt(input.requestId) ?? (() => { throw new Error('绑定回执未能读取，请按原请求核对') })()
  }
  private async cleanupBinding(operation: StoredOperation) {
    if (!operation.binding?.files) return
    try {
      await new SkillBindingFiles(this.dataPath).cleanup(operation.binding.files)
      delete operation.binding.receipt.cleanupError
    } catch (error) { operation.binding.receipt.cleanupError = errorText(error); this.hooks.failed(errorText(error)) }
    await this.saveOperation(operation)
  }
  private async performBinding(operation: StoredOperation, entry: PreparedCandidate, signal: AbortSignal) {
    const binding = operation.binding!, receipt = binding.receipt
    let copied: Resource | undefined
    try {
      signal.throwIfAborted()
      if (await this.hooks.localSource!(receipt.localSkillId) !== entry.path) throw new Error('本机来源身份已变更，请重新扫描')
      if (binding.files) copied = { ...await new SkillBindingFiles(this.dataPath).prepare(entry.path, binding.files, entry.candidate.description, signal), ownerAgentId: receipt.agentId }
      await this.hooks.critical(async () => {
        signal.throwIfAborted()
        if (await this.hooks.localSource!(receipt.localSkillId) !== entry.path || (await inspectResourceTree(entry.path, signal)).hash !== receipt.contentHash) throw new Error('源内容或身份已变更，请重新准备')
        if (this.targetFingerprint(entry.candidate.name, receipt.agentId, Object.values(operation.plannedIds)) !== entry.targetFingerprint) throw new Error('目标技能已变化，请重新准备')
        const resource = copied ?? this.resource(entry.candidate.existingResourceId!)
        if ((await inspectResourceTree(resource.path, signal)).hash !== receipt.contentHash) throw new Error('受管副本已变更，请重新准备')
        signal.throwIfAborted()
        const completed = await this.store.transaction(async tx => {
          const accepted = await tx.get<StoredOperation>('skillOperations', operation.id)
          if (!accepted?.binding || accepted.fingerprint !== operation.fingerprint || accepted.binding.receipt.status !== 'running') throw new Error('此绑定请求已结束，请核对原回执')
          if (binding.localInstallationFingerprint && installationFingerprint(await tx.get<SkillInstallation>('skillInstallations', receipt.localSkillId)) !== binding.localInstallationFingerprint) throw new Error('本机技能来源记录已变更，请重新准备')
          if (copied) {
            await tx.put({ collection: 'resources', id: resource.id, value: resource })
            await tx.put({ collection: 'skillInstallations', id: resource.id, value: { resourceId: resource.id, revision: 1, source: receipt.source, localSkillId: receipt.localSkillId, contentHash: receipt.contentHash, installedAt: new Date().toISOString(), bindingCopy: binding.files } satisfies SkillInstallation & { bindingCopy?: BindingFiles } })
          } else {
            const current = await tx.get<Resource>('resources', resource.id), installation = await tx.get<SkillInstallation>('skillInstallations', resource.id)
            if (!current || current.ownerAgentId !== receipt.agentId || installation?.localSkillId !== receipt.localSkillId || installation.contentHash !== receipt.contentHash || installation.source.identity !== receipt.source.identity) throw new Error('受管副本来源已变化，请重新准备')
          }
          const agent = await this.hooks.bindEmployee!(tx, receipt.agentId, receipt.expectedConfigVersion, resource)
          const done: StoredOperation = structuredClone(operation)
          done.status = 'completed'; done.items[0].status = copied ? 'installed' : 'reused'; done.items[0].resourceId = resource.id
          done.binding!.receipt = { ...receipt, status: 'completed', resource, agent }
          await tx.put({ collection: 'skillOperations', id: done.id, value: done })
          return done
        })
        Object.assign(operation, completed)
        await this.finishBinding(operation)
      })
    } catch (error) {
      // Commit acknowledgement can be lost. Unknown database state never authorizes cleanup or replay.
      const current = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', operation.id))
      if (current?.binding?.receipt.status === 'completed') {
        Object.assign(operation, current)
        await this.hooks.critical(() => this.finishBinding(operation))
        return
      }
      if (!current?.binding || current.fingerprint !== operation.fingerprint) throw new Error('技能绑定结果未知；请按原请求核对，未清理副本')
      Object.assign(operation, current)
      operation.status = signal.aborted ? 'interrupted' : 'completed'
      operation.items[0].status = signal.aborted ? 'skipped' : 'failed'; operation.items[0].error = errorText(error)
      operation.binding!.receipt.status = signal.aborted ? 'interrupted' : 'failed'; operation.binding!.receipt.error = errorText(error)
      // Persist revocation before touching files; a crash cannot turn a failed copy into an accepted binding.
      await this.saveOperation(operation)
      await this.cleanupBinding(operation)
      this.hooks.changed()
    }
  }
  private async finishBinding(operation: StoredOperation) {
    const receipt = operation.binding!.receipt
    this.hooks.committed(receipt.resource!)
    try {
      await this.hooks.bindingCommitted!(receipt.agent!)
    } catch (error) {
      receipt.synchronizationError = '绑定已提交，但工作区同步失败；请重启核对：' + errorText(error)
      await this.saveOperation(operation); this.hooks.failed(receipt.synchronizationError)
    }
    this.hooks.changed()
  }
  async cancel(id: string) {
    await this.getOperation(id)
    this.tasks.get(id)?.controller.abort(new Error('用户取消安装'))
  }
  async install(input: InstallSkillsInput): Promise<SkillOperation> {
    const fingerprint = hash(JSON.stringify([input.scanId, [...input.candidateIds].sort(), input.addToFavorites, ...(input.restoreCollections ? [true] : [])]))
    return this.hooks.critical(async () => {
      const previous = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', input.requestId))
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('requestId 已用于不同安装请求')
        return this.view(previous)
      }
      const plan = this.plans.get(input.scanId)
      if (!plan || Date.parse(plan.view.expiresAt) <= Date.now()) throw new Error('导入预览已过期，请重新扫描')
      if (plan.submitted) throw new Error('此预览已经提交，请查看安装记录或重新扫描')
      const selected = input.candidateIds.map(id => {
        const entry = plan.entries.get(id)
        if (!entry) throw new Error('所选技能不属于此次扫描')
        return entry
      })
      const operation: StoredOperation = { id: input.requestId, kind: plan.view.library ? 'library-import' : 'install', scanId: input.scanId, createdAt: new Date().toISOString(), fingerprint, target: plan.view.target, ownerAgentId: plan.view.ownerAgentId, status: 'running', plannedIds: Object.fromEntries(selected.map(entry => [entry.candidate.id, randomUUID()])), items: selected.map(entry => ({ candidateId: entry.candidate.id, name: entry.candidate.name, status: 'pending' })) }
      await this.saveOperation(operation)
      plan.submitted = true
      const controller = new AbortController()
      // Start after admission returns; commits re-enter the host's short critical section.
      const task = Promise.resolve().then(() => this.perform(operation, selected, input.addToFavorites, input.restoreCollections ?? false, plan.view.library?.groups ?? [], controller.signal)).finally(async () => { plan.submitted = false; await this.discardScan(plan.view.id) }).catch(error => this.hooks.failed('技能安装保存或临时文件清理失败：' + errorText(error))).finally(() => this.tasks.delete(operation.id))
      this.tasks.set(operation.id, { controller, task })
      return this.view(operation)
    })
  }
  private async saveOperation(operation: StoredOperation) {
    await this.store.write([{ collection: 'skillOperations', id: operation.id, value: operation }])
  }
  private async favorite(tx: RecordTransaction, id: string) {
    const collection = await readSkillCollections(tx)
    if (!collection.favoriteResourceIds.includes(id)) { collection.favoriteResourceIds.push(id); await writeSkillCollections(tx, collection) }
  }
  private async cleanup(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return
    await rm(join(this.dataPath, 'skills', id), { recursive: true, force: true })
    await rm(join(this.dataPath, 'skills', `.import-${id}`), { recursive: true, force: true })
  }
  private async installLocal(operation: StoredOperation, entry: PreparedCandidate, item: SkillOperation['items'][number], favorite: boolean, restoreCollections: boolean, groupOrder: string[], signal: AbortSignal) {
    const candidate = entry.candidate, plannedId = operation.plannedIds[candidate.id]
    let published = false
    try {
      const staged = candidate.existingResourceId ? undefined : await this.localTarget.prepare(entry.path, candidate.name, plannedId, candidate.contentHash!, signal)
      await this.hooks.critical(async () => {
        signal.throwIfAborted()
        const existing = await this.localTarget.inspect(candidate.name, signal)
        if (candidate.existingResourceId) {
          if (!existing || existing.id !== candidate.existingResourceId || existing.hash !== candidate.contentHash) throw new Error('本地技能已变化，请重新扫描')
          item.resourceId = existing.id; item.status = 'reused'
        } else {
          if (existing) throw new Error('本地已存在同名技能，请重新扫描')
          operation.localMoves ??= {}
          operation.localMoves[candidate.id] = { name: candidate.name, hash: candidate.contentHash!, resourceId: staged!.id }
          await this.saveOperation(operation)
          await this.localTarget.publish(candidate.name, plannedId, candidate.contentHash!, signal)
          this.hooks.localChanged?.()
          published = true
          item.resourceId = staged!.id; item.status = 'installed'
        }
        await this.store.transaction(async tx => {
          const previous = await tx.get<SkillInstallation>('skillInstallations', item.resourceId!)
          // Reusing identical files must not replace a known remote origin with a folder import.
          if (!previous || item.status === 'installed' || previous.contentHash !== candidate.contentHash || (['local', 'snapshot'].includes(previous.source.kind) && !['local', 'snapshot'].includes(entry.source.kind))) await tx.put({ collection: 'skillInstallations', id: item.resourceId!, value: { resourceId: item.resourceId!, revision: (previous?.revision ?? 0) + 1, contentHash: candidate.contentHash!, source: entry.source, installedAt: new Date().toISOString() } satisfies SkillInstallation })
          if (restoreCollections && entry.collection?.favorite) await mergeSkillCollection(tx, item.resourceId!, entry.collection.group, groupOrder)
          else if (favorite) await this.favorite(tx, item.resourceId!)
          await tx.put({ collection: 'skillOperations', id: operation.id, value: operation })
        })
        this.hooks.changed()
      })
    } catch (error) {
      throw new Error(errorText(error) + (published ? '；文件已保存到本地，请重新扫描核对，未自动删除' : ''))
    } finally { await this.localTarget.discard(plannedId) }
  }
  private async perform(operation: StoredOperation, entries: PreparedCandidate[], favorite: boolean, restoreCollections: boolean, groupOrder: string[], signal: AbortSignal) {
    try {
      for (const [index, entry] of entries.entries()) {
        const item = operation.items[index], candidate = entry.candidate, plannedId = operation.plannedIds[candidate.id]
        let copied: Resource | undefined
        try {
          signal.throwIfAborted()
          if (candidate.error || candidate.conflict) { item.status = 'skipped'; item.error = candidate.error ?? candidate.conflict; continue }
          if ((await inspectResourceTree(entry.path, signal)).hash !== candidate.contentHash) throw new Error('源内容已变更，请重新扫描')
          if (operation.target === 'local') { await this.installLocal(operation, entry, item, favorite, restoreCollections, groupOrder, signal); continue }
          if (!candidate.existingResourceId) {
            copied = await importLocalResource(this.dataPath, 'skill', entry.path, plannedId)
            if ((await inspectResourceTree(copied.path, signal)).hash !== candidate.contentHash) throw new Error('复制期间源内容已变更，请重新扫描')
          }
          await this.hooks.critical(async () => {
            signal.throwIfAborted()
            if (operation.ownerAgentId) this.hooks.owner(operation.ownerAgentId)
            if (this.targetFingerprint(candidate.name, operation.ownerAgentId, Object.values(operation.plannedIds)) !== entry.targetFingerprint) throw new Error('目标资源已变化，请重新扫描')
            if (candidate.existingResourceId) {
              const existing = this.resource(candidate.existingResourceId)
              if ((await inspectResourceTree(existing.path, signal)).hash !== candidate.contentHash) throw new Error('已安装内容已变化，请重新扫描')
              item.resourceId = existing.id; item.status = 'reused'
            } else {
              if (operation.ownerAgentId) {
                const parent = join(this.dataPath, 'agents', operation.ownerAgentId, 'workspace', 'skills')
                await mkdir(parent, { recursive: true })
                await restrictedPath([this.dataPath], parent)
                const destination = join(parent, copied!.name)
                try { await lstat(destination); throw new Error('员工专属目录已存在同名技能') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
                operation.ownerMoves ??= {}
                operation.ownerMoves[candidate.id] = { name: copied!.name, hash: candidate.contentHash! }
                await this.saveOperation(operation)
                await rename(copied!.path, destination)
                copied!.path = destination; copied!.ownerAgentId = operation.ownerAgentId
              }
              item.resourceId = copied!.id; item.status = 'installed'
            }
            const installation: SkillInstallation = { resourceId: item.resourceId!, revision: 1, contentHash: candidate.contentHash!, source: entry.source, installedAt: new Date().toISOString() }
            try {
              await this.store.transaction(async tx => {
                if (copied) {
                  await tx.put({ collection: 'resources', id: copied.id, value: copied })
                  await tx.put({ collection: 'skillInstallations', id: copied.id, value: installation })
                }
                if (restoreCollections && entry.collection?.favorite) await mergeSkillCollection(tx, item.resourceId!, entry.collection.group, groupOrder)
                else if (favorite) await this.favorite(tx, item.resourceId!)
                await tx.put({ collection: 'skillOperations', id: operation.id, value: operation })
              })
            } catch (error) {
              if (copied?.ownerAgentId) await rm(copied.path, { recursive: true, force: true })
              throw error
            }
            if (copied) this.hooks.committed(copied)
            this.hooks.changed()
          })
        } catch (error) {
          item.status = signal.aborted ? 'skipped' : 'failed'; item.error = errorText(error); delete item.resourceId
        } finally {
          if (operation.target !== 'local' && (item.status !== 'installed' || copied?.ownerAgentId)) await this.cleanup(plannedId)
          await this.saveOperation(operation)
        }
      }
      operation.status = signal.aborted ? 'cancelled' : 'completed'
    } catch (error) {
      operation.status = 'interrupted'
      for (const item of operation.items) if (item.status === 'pending') { item.status = 'failed'; item.error = errorText(error) }
    } finally { await this.saveOperation(operation); this.hooks.changed() }
  }
  async close() {
    for (const scan of this.preparations.values()) scan.controller.abort(new Error('应用退出，预览中断'))
    for (const task of this.tasks.values()) task.controller.abort(new Error('应用退出，安装中断'))
    await Promise.allSettled([...this.preparations.values()].map(value => value.task))
    await Promise.allSettled([...this.tasks.values()].map(value => value.task))
    for (const id of this.plans.keys()) await this.discardScan(id)
  }
}
