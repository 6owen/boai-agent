/*
 * [INPUT]: 已选择的本机/受管 Skills、版本化来源/收藏、宿主授予的 ZIP 保存位置与 ProductStore。
 * [OUTPUT]: 原版 BoAI 仓库 ZIP（meta/lock/脚本/完整 skills）与 JSON 收藏附录；从冻结 ZIP 内容生成实际文件目录/大小预览、可取消异步 ZIP、禁止覆盖的原子发布及持久结果；不改变资源或授权。
 * [POS]: resources 的便携技能库导出用例；库格式读取由 adapters/skills/library-format 负责。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, open, realpath, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { zip } from 'fflate'
import { z } from 'zod'
import type { Resource } from '../../../shared/domain'
import type { ExportSkillLibraryInput, PlanSkillLibraryExportInput, SkillInstallation, SkillLibraryExportPlan, SkillOperation } from '../../../shared/domain/skills'
import type { ProductStore } from '../../adapters/storage/product-store'
import { renderLibraryRepository } from '../../adapters/skills/library-repository'
import { archivePath } from '../../adapters/skills/archive'
import { legacyLibraryChecksum, portableLibrarySource, readLibraryBytes, type PortableSkillSource } from '../../adapters/skills/library-format'
import { inspectResourceTree, isWithin, RESOURCE_LIMITS } from './local-resources'
import { readSkillCollections } from './skill-collections'

const id = z.string().min(1).max(200)
export const planSkillLibraryExportSchema = z.object({ resourceIds: z.array(id).min(1).max(2000).refine(ids => ids.length === new Set(ids).size), name: z.string().trim().min(1).max(100) }).strict()
export const exportSkillLibrarySchema = z.object({ planId: id, requestId: id }).strict()
type FrozenPlan = { view: SkillLibraryExportPlan; files: Record<string, Uint8Array> }
type ExportOperation = SkillOperation & { fingerprint: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const localFile = (path: string) => path.split('/').some(part => /^(?:\.git|\.ssh|\.aws|\.codex|\.claude|\.agents|\.netrc|\.npmrc|\.pypirc|credentials(?:\.[^.]+)?|auth\.json|boai\.sqlite(?:-.+)?|id_(?:rsa|ed25519)|config\.local\.[^.]+)$/i.test(part) || /^\.env(?:\..+)?$/i.test(part) || /\.(?:key|p12|pfx)$/i.test(part))

export class SkillLibraryExport {
  private plans = new Map<string, FrozenPlan>()
  private preparation?: { controller: AbortController; task: Promise<SkillLibraryExportPlan> }
  private jobs = new Map<string, { controller: AbortController; task: Promise<void> }>()
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly hooks: {
    resource: (id: string) => Pick<Resource, 'id' | 'name' | 'path'> | Promise<Pick<Resource, 'id' | 'name' | 'path'>>
    critical: <T>(action: () => Promise<T>) => Promise<T>
    changed: () => void
    failed: (error: string) => void
  }) {}
  get busy() { return !!this.preparation || this.jobs.size > 0 }
  operationStatus(value: SkillOperation) { return this.jobs.has(value.id) ? { ...value, status: 'running' as const } : value }
  async init() {
    for (const operation of await this.store.load<ExportOperation>('skillOperations')) {
      if (operation.kind !== 'library-export' || operation.status !== 'running') continue
      operation.status = 'interrupted'
      for (const item of operation.items) if (item.status === 'pending') { item.status = 'failed'; item.error = '导出在退出时中断；请检查保存位置，应用不会自动重写 ZIP。' }
      await this.save(operation)
    }
  }
  async plan(input: PlanSkillLibraryExportInput) {
    if (this.preparation) throw new Error('另一个技能库正在准备导出，请稍后重试')
    for (const [id, plan] of this.plans) if (Date.parse(plan.view.expiresAt) <= Date.now()) this.plans.delete(id)
    if (this.plans.size >= 2) this.plans.delete(this.plans.keys().next().value!)
    const controller = new AbortController(), task = this.prepare(input, controller.signal)
    this.preparation = { controller, task }
    try { return await task } finally { this.preparation = undefined }
  }
  discard(id: string) { this.plans.delete(id) }
  async cancelPreparation() { this.preparation?.controller.abort(new Error('导出预览已取消')); await this.preparation?.task.catch(() => {}) }
  private async prepare(input: PlanSkillLibraryExportInput, signal: AbortSignal) {
    const captured = await this.hooks.critical(async () => this.store.transaction(async tx => ({
      resources: await Promise.all(input.resourceIds.map(async id => structuredClone(await this.hooks.resource(id)))),
      installations: await Promise.all(input.resourceIds.map(id => tx.get<SkillInstallation>('skillInstallations', id))),
      collections: await readSkillCollections(tx),
    })))
    const view: SkillLibraryExportPlan = { id: randomUUID(), name: input.name, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), warnings: ['导出所选技能的完整可携带文件，并保存来源、收藏和分组；不包含员工绑定。', '已知凭据和本机配置文件会排除；无法自动识别任意文件正文中的秘密，请在分享前检查内容。'], files: [], items: [] }
    const files: Record<string, Uint8Array> = Object.create(null), paths = new Map<string, string>()
    const sources: Record<string, { contentHash: string; source: PortableSkillSource }> = Object.create(null)
    const lock: Record<string, { kind: 'vendor'; checksum: string; snapshot?: true }> = Object.create(null)
    const collections: { schemaVersion: 1; groups: { key: string; name: string }[]; entries: Record<string, { favorite: boolean; group?: string }> } = { schemaVersion: 1, groups: [], entries: Object.create(null) }
    let totalBytes = 0
    const add = (name: string, bytes: Uint8Array) => {
      const portable = archivePath(name), parts = portable.split('/')
      if (Object.hasOwn(files, name)) throw new Error('技能库出现重复文件名')
      for (let index = 1; index <= parts.length; index++) {
        const path = parts.slice(0, index).join('/'), key = path.normalize('NFC').toLowerCase(), previous = paths.get(key)
        if (previous && previous !== path) throw new Error('文件路径在不同系统上存在大小写或 Unicode 冲突')
        paths.set(key, path)
      }
      totalBytes += bytes.byteLength
      if (paths.size + 1 > RESOURCE_LIMITS.entries || totalBytes > RESOURCE_LIMITS.bytes) throw new Error('技能库超过 2000 项或 100 MB，请分批导出')
      files[name] = bytes
    }
    for (const [index, resource] of captured.resources.entries()) {
      signal.throwIfAborted()
      const item: SkillLibraryExportPlan['items'][number] = { resourceId: resource.id, name: resource.name, fileCount: 0, bytes: 0, excluded: [], warnings: [] }
      view.items.push(item)
      if (!/^[a-z0-9][a-z0-9._-]{0,199}$/i.test(resource.name)) { item.error = '技能目录名不符合原版库格式，请先使用英文、数字、点、下划线或连字符命名'; continue }
      if (captured.resources.filter(value => value.name.toLowerCase() === resource.name.toLowerCase()).length !== 1) { item.error = '多个来源使用相同技能名，请只选择一个，或分别导出'; continue }
      const tree = await inspectResourceTree(resource.path, signal), kept = tree.files.filter(file => !localFile(file.path))
      item.excluded = tree.files.filter(file => localFile(file.path)).map(file => file.path)
      const contentHash = hash(JSON.stringify(kept)), installation = captured.installations[index]
      let source: PortableSkillSource = { kind: 'snapshot' }
      if (installation?.contentHash === tree.hash && !item.excluded.length) {
        try { source = portableLibrarySource(installation.source, contentHash) }
        catch { item.warnings.push('来源含不可携带的信息，导出为离线快照。') }
      } else if (installation) item.warnings.push('本地内容已修改或排除了配置文件，保留实际内容并导出为快照。')
      if (source.kind === 'snapshot') item.warnings.push('导出内容快照，原始来源不可自动更新。')
      const content = []
      for (const file of kept) {
        const bytes = await readLibraryBytes(resource.path, file, signal)
        add(`skills/${resource.name}/${file.path}`, bytes)
        content.push({ path: file.path, bytes })
      }
      if ((await inspectResourceTree(resource.path, signal)).hash !== tree.hash) throw new Error('技能内容在预览期间变化，请重新导出')
      sources[`skills/${resource.name}`] = { contentHash, source }
      lock[`global:${resource.name}`] = { kind: 'vendor', checksum: legacyLibraryChecksum(content), ...(source.kind === 'snapshot' ? { snapshot: true } : {}) }
      const favorite = captured.collections.favoriteResourceIds.includes(resource.id)
      const group = favorite ? captured.collections.groups.find(group => group.id === captured.collections.groupByResourceId[resource.id]) : undefined
      const key = group ? `group-${hash(group.name.toLowerCase()).slice(0, 20)}` : undefined
      collections.entries[`skills/${resource.name}`] = { favorite, ...(key ? { group: key } : {}) }
      item.fileCount = kept.length; item.bytes = kept.reduce((sum, file) => sum + file.size, 0)
    }
    // Preserve order, only including groups referenced by the selected skills; no local UUID is exported.
    for (const group of captured.collections.groups) {
      const key = `group-${hash(group.name.toLowerCase()).slice(0, 20)}`
      if (Object.values(collections.entries).some(entry => entry.group === key)) collections.groups.push({ key, name: group.name })
    }
    const repository = renderLibraryRepository(input.name, sources)
    for (const [slug, hint] of Object.entries(repository.lockHints)) Object.assign(lock[`global:${slug}`], hint)
    const exportedAt = Date.now(), json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n')
    add('boai.json', json({ schemaVersion: 1, kind: 'boai-skill-library', name: input.name, exportedAt, skillsPath: 'skills', vendorPath: 'vendor', sourcesPath: 'sources' }))
    add('boai.lock.json', json({ schemaVersion: 1, exportedAt, skills: lock }))
    add('boai-agent.sources.json', json({ schemaVersion: 1, entries: sources }))
    add('boai-agent.collections.json', json(collections))
    add('vendor/', new Uint8Array()); add('sources/', new Uint8Array())
    for (const [path, bytes] of Object.entries(repository.files)) add(path, bytes)
    await this.hooks.critical(async () => this.store.transaction(async tx => {
      if ((await readSkillCollections(tx)).revision !== captured.collections.revision) throw new Error('收藏在预览期间变化，请重新导出')
      for (const [index, resource] of captured.resources.entries()) {
        if (JSON.stringify(await this.hooks.resource(resource.id)) !== JSON.stringify(resource) || JSON.stringify(await tx.get<SkillInstallation>('skillInstallations', resource.id)) !== JSON.stringify(captured.installations[index])) throw new Error('技能在预览期间变化，请重新导出')
      }
    }))
    signal.throwIfAborted()
    view.files = Object.entries(files).map(([path, bytes]) => ({ path, kind: path.endsWith('/') ? 'directory' as const : 'file' as const, size: bytes.byteLength })).sort((a, b) => a.path.localeCompare(b.path))
    this.plans.set(view.id, { view, files })
    return structuredClone(view)
  }
  async export(input: ExportSkillLibraryInput, destination: string): Promise<SkillOperation> {
    if (!isAbsolute(destination) || !destination.toLowerCase().endsWith('.zip')) throw new Error('请选择 ZIP 保存位置')
    const parent = await realpath(dirname(destination)), target = join(parent, basename(destination))
    if (isWithin(await realpath(this.dataPath), target)) throw new Error('请在应用数据目录之外保存技能库')
    const fingerprint = hash(JSON.stringify([input.planId, target]))
    return this.hooks.critical(async () => {
      const previous = await this.store.transaction(tx => tx.get<ExportOperation>('skillOperations', input.requestId))
      if (previous) { if (previous.fingerprint !== fingerprint || previous.kind !== 'library-export') throw new Error('requestId 已用于其他操作'); return this.operationStatus(this.view(previous)) }
      const plan = this.plans.get(input.planId)
      if (!plan || Date.parse(plan.view.expiresAt) <= Date.now()) throw new Error('导出预览已过期，请重新预览')
      if (plan.view.items.some(item => item.error)) throw new Error('请先解决导出预览中的同名冲突')
      try { await lstat(target); throw new Error('保存位置已有同名文件，请选择其他名称') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const operation: ExportOperation = { id: input.requestId, kind: 'library-export', scanId: input.planId, outputName: basename(target), status: 'running', fingerprint, createdAt: new Date().toISOString(), items: plan.view.items.map(item => ({ candidateId: item.resourceId, resourceId: item.resourceId, name: item.name, status: 'pending' })) }
      await this.save(operation); this.plans.delete(input.planId)
      const controller = new AbortController()
      const task = this.perform(operation, plan, target, controller.signal).catch(error => this.hooks.failed('技能库导出结果保存失败：' + errorText(error))).finally(() => this.jobs.delete(operation.id))
      this.jobs.set(operation.id, { controller, task })
      return this.view(operation)
    })
  }
  private view(operation: SkillOperation): SkillOperation { const { id, kind, scanId, outputName, status, createdAt, items } = operation; return structuredClone({ id, kind, scanId, outputName, status, createdAt, items }) }
  private save(operation: ExportOperation) { return this.store.write([{ collection: 'skillOperations', id: operation.id, value: operation }]) }
  cancel(id: string) { this.jobs.get(id)?.controller.abort(new Error('技能库导出已取消')) }
  private async perform(operation: ExportOperation, plan: FrozenPlan, target: string, signal: AbortSignal) {
    const temporary = join(dirname(target), `.boai-skills-${randomUUID()}.tmp`)
    let published = false, created = false
    try {
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        signal.throwIfAborted()
        const cancel = zip(plan.files, { level: 6 }, (error, data) => { signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(data) })
        const abort = () => { cancel(); reject(signal.reason) }
        signal.addEventListener('abort', abort, { once: true })
      })
      signal.throwIfAborted()
      if (bytes.byteLength > RESOURCE_LIMITS.bytes) throw new Error('压缩包超过 100 MB，请分批导出')
      const handle = await open(temporary, 'wx', 0o600); created = true
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      signal.throwIfAborted()
      // A link publishes the complete file atomically and fails if the destination appeared meanwhile.
      await link(temporary, target); published = true
      await unlink(temporary); created = false
      operation.items.forEach(item => { item.status = 'exported' }); operation.status = 'completed'
      await this.save(operation)
    } catch (error) {
      operation.status = published ? 'interrupted' : signal.aborted ? 'cancelled' : 'completed'
      for (const item of operation.items) { item.status = 'failed'; item.error = (published ? 'ZIP 已写出，但清理或结果登记失败；请检查保存位置。' : '') + errorText(error) }
      await this.save(operation)
    } finally {
      if (created) try { await unlink(temporary) } catch (error) { this.hooks.failed('技能库临时文件清理失败：' + errorText(error)) }
      this.hooks.changed()
    }
  }
  async close() {
    this.preparation?.controller.abort(new Error('应用退出，导出预览中断'))
    for (const job of this.jobs.values()) job.controller.abort(new Error('应用退出，技能库导出中断'))
    await this.preparation?.task.catch(() => {})
    await Promise.allSettled([...this.jobs.values()].map(value => value.task)); this.plans.clear()
  }
}
