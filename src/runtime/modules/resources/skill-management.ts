/*
 * [INPUT]: 用户选择的本地/远程来源、受管资源、SQLite 与宿主短临界区。
 * [OUTPUT]: 本地文件发布后立即使目录缓存失效； 本地目标写入 ~/.agents/skills 并保存 local 身份/来源/收藏，不创建员工资源；兼容旧受管安装，保留预览复核、幂等操作与重启中断恢复。
 * [POS]: resources 的技能管理用例；不绑定员工、不执行技能脚本。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, mkdir, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { Resource } from '../../../shared/domain'
import type { InstallSkillsInput, SkillCandidate, SkillDetail, SkillFileContent, SkillInstallation, SkillOperation, SkillScan, ScanSkillSourceInput, SkillSource } from '../../../shared/domain/skills'
import { SkillSources, type PreparedSkillSource } from '../../adapters/skills/source'
import { prepareSkillLibrary } from '../../adapters/skills/library-format'
export { scanSkillSchema } from '../../adapters/skills/source'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { boundedRead, restrictedPath, workspaceRelative } from '../workspaces/file-access'
import { importLocalResource, inspectResourceTree, parseSkillDocument, RESOURCE_LIMITS } from './local-resources'
import { mergeSkillCollection, readSkillCollections, writeSkillCollections } from './skill-collections'
import { LocalSkillInstallTarget } from './local-skill-install'

const PLAN_TTL_MS = 15 * 60 * 1000
const MAX_PLANS = 20
const id = z.string().min(1).max(200)
export const installSkillsSchema = z.object({ requestId: id, scanId: id, candidateIds: z.array(id).min(1).max(2000).refine(ids => new Set(ids).size === ids.length), addToFavorites: z.boolean(), restoreCollections: z.boolean().optional() }).strict()
type PreparedCandidate = { path: string; source: SkillSource; candidate: SkillCandidate; targetFingerprint: string; collection?: { favorite: boolean; group?: string } }
type Plan = { view: SkillScan; entries: Map<string, PreparedCandidate>; temporary?: string; submitted?: boolean }
type StoredOperation = SkillOperation & { fingerprint: string; plannedIds: Record<string, string>; target?: 'local'; localMoves?: Record<string, { name: string; hash: string; resourceId: string }>; ownerAgentId?: string; ownerMoves?: Record<string, { name: string; hash: string }> }
type Hooks = {
  resources: () => Resource[]
  owner: (id: string) => void
  critical: <T>(operation: () => Promise<T>) => Promise<T>
  committed: (resource: Resource) => void
  changed: () => void
  localChanged?: () => void
  failed: (error: string) => void
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

export class SkillManagement {
  private plans = new Map<string, Plan>()
  private tasks = new Map<string, { controller: AbortController; task: Promise<void> }>()
  private preparations = new Map<string, { controller: AbortController; task: Promise<SkillScan> }>()
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly hooks: Hooks, private readonly sources: SkillSources, private readonly localTarget = new LocalSkillInstallTarget()) {}
  get busy() { return this.tasks.size > 0 }
  async init() {
    await this.sources.clearStaging()
    for (const operation of await this.store.load<StoredOperation>('skillOperations')) {
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
    const installation = (await this.store.load<SkillInstallation>('skillInstallations')).find(value => value.resourceId === resourceId)
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
    return { content: await boundedRead(await restrictedPath([entry.path], join(entry.path, 'SKILL.md'))), files: tree.files }
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
  async listOperations() { return (await this.store.load<StoredOperation>('skillOperations')).slice(-100).reverse().map(operation => this.view(operation)) }
  async listInstallations() { return this.store.load<SkillInstallation>('skillInstallations') }
  async getOperation(id: string) {
    const value = await this.store.transaction(tx => tx.get<StoredOperation>('skillOperations', id))
    if (!value) throw new Error('安装记录不存在')
    return this.view(value)
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
