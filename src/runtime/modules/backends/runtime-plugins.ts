/*
 * [INPUT]: Trusted prebuilt local packages, explicit CAS changes and runtime leases.
 * [OUTPUT]: Atomic content-addressed installs, immutable active versions, fail-closed corruption and draining disable.
 * [POS]: Runtime plugin package owner; never runs install scripts or copies CLI credentials.
 * [PROTOCOL]: Update Header and backends/.folder.md when changing package lifecycle.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { applicationPlugins } from '../../../shared/plugins/catalog'
import { bundledRuntimePlugins, runtimeContribution, runtimeManifestSchema, validateRuntimeConfig, type RuntimeManifest, type RuntimePluginCatalog } from '../../../shared/plugins/runtime-catalog'
import type { RuntimePluginRef } from '../../../shared/plugins/runtime-api'
const saved = z.object({ revision: z.number().int().nonnegative(), packages: z.record(z.string(), z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), enabled: z.boolean() }).strict()).refine(value => Object.keys(value).length <= 100), disabled: z.array(z.string()).max(100) }).strict()
export const runtimeBundleRoot = () => resolve(process.env.BOAI_RUNTIME_PLUGIN_BUNDLE ?? 'dist/runtime/plugins')
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
async function files(root: string) {
  const result: { name: string; bytes: Buffer }[] = []; let size = 0, nodes = 0
  async function visit(path: string) {
    if (++nodes > 256 || relative(root,path).split(/[\\/]/).length > 8) throw new Error('插件包目录超出限制')
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error('插件包不能包含符号链接')
    if (info.isDirectory()) { for (const name of (await readdir(path)).sort()) await visit(join(path, name)); return }
    if (!info.isFile() || result.length >= 128 || info.size > 16 * 1024 * 1024) throw new Error('插件包超出文件限制')
    const bytes = await readFile(path); size += bytes.length
    if (size > 32 * 1024 * 1024) throw new Error('插件包超过32MiB')
    result.push({ name: relative(root, path).split('\\').join('/'), bytes })
  }
  await visit(root); return result
}
export class RuntimePlugins {
  private state: z.infer<typeof saved> = { revision: 0, packages: {}, disabled: [] }
  private diagnostic?: string
  private packages = new Map<string, { manifest: RuntimeManifest; hash: string; root: string; bundled: boolean }>()
  private bundled = new Map<string, { manifest: RuntimeManifest; hash: string; root: string; bundled: boolean }>()
  private leases = new Map<string, number>()
  private changing = new Set<string>()
  constructor(private readonly root: string, private readonly bundle = runtimeBundleRoot()) {}
  async init() {
    try { const bytes = await readFile(join(this.root, 'registry.json')); if (bytes.length > 65536) throw new Error('Registry too large'); this.state = saved.parse(JSON.parse(bytes.toString())) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.diagnostic = '运行时插件配置损坏或不兼容，原文件已保留；修复后重启。' }
    for (const manifest of bundledRuntimePlugins) {
      // Build output is hashed too: an app upgrade invalidates stale profile verification.
      const contribution = runtimeContribution(manifest)
      let bytes: Buffer
      try { bytes = await readFile(join(this.bundle, contribution.driver.kind === 'module' ? contribution.driver.entry : 'acp.mjs')) }
      catch { continue }
      const packageHash = hash(Buffer.concat([Buffer.from(JSON.stringify(manifest)), bytes]))
      this.packages.set(manifest.id, { manifest, hash: packageHash, root: this.bundle, bundled: true })
      this.bundled.set(manifest.id, this.packages.get(manifest.id)!)
    }
    for (const [id, value] of Object.entries(this.state.packages)) {
      try { const item = await this.readPackage(join(this.root, 'packages', value.hash)); if (item.hash !== value.hash || item.manifest.id !== id) throw new Error('Package identity mismatch'); this.packages.set(id, item) }
      catch { this.diagnostic = '已登记的运行时插件缺失或已被修改，管理已只读；请恢复原登记的包文件后重启。' }
    }
  }
  snapshot(): RuntimePluginCatalog {
    return { revision: this.state.revision, plugins: [...this.packages.values()].map(item => ({ manifest: structuredClone(item.manifest), packageHash: item.hash, bundled: item.bundled, enabled: !this.diagnostic && this.enabled(item.manifest.id), inUse: this.leases.get(item.manifest.id) ?? 0 })), ...(this.diagnostic ? { readOnly: true, diagnostic: this.diagnostic } : {}) }
  }
  private enabled(id: string) { return this.state.packages[id]?.enabled ?? !this.state.disabled.includes(id) }
  resolve(ref: Pick<RuntimePluginRef, 'pluginId' | 'providerId'> & Partial<RuntimePluginRef>, allowDisabled = false) {
    if (this.diagnostic) throw new Error(this.diagnostic)
    if (this.changing.has(ref.pluginId)) throw new Error('运行时插件正在更新，请稍后核对连接')
    const item = this.packages.get(ref.pluginId)
    if (!item || !allowDisabled && !this.enabled(ref.pluginId)) throw new Error('运行时插件未安装或已停用，请在设置的插件中核对')
    const contribution = runtimeContribution(item.manifest, ref)
    if (ref.packageHash && ref.packageHash !== item.hash) throw new Error('运行时插件版本已变化，请重新测试并保存连接')
    return { ...item, contribution, config: validateRuntimeConfig(contribution, ref.config) }
  }
  async acquire(ref: RuntimePluginRef) {
    const item = this.resolve(ref)
    const current = item.bundled ? hash(Buffer.concat([Buffer.from(JSON.stringify(item.manifest)), await readFile(join(item.root, item.contribution.driver.kind === 'module' ? item.contribution.driver.entry : 'acp.mjs'))])) : (await this.readPackage(item.root)).hash
    if (current !== item.hash) throw new Error('运行时插件文件已变化，请重新安装核对')
    this.resolve(ref)
    this.leases.set(ref.pluginId, (this.leases.get(ref.pluginId) ?? 0) + 1)
    let released = false
    return { ...item, entry: item.contribution.driver.kind === 'builtin' ? join(this.bundle, 'acp.mjs') : join(item.root, item.contribution.driver.entry), release: () => { if (!released) { released = true; const count = (this.leases.get(ref.pluginId) ?? 1) - 1; if (count) this.leases.set(ref.pluginId, count); else this.leases.delete(ref.pluginId) } } }
  }
  private async readPackage(root: string) {
    const entries = await files(root), source = entries.find(value => value.name === 'manifest.json')
    if (!source || source.bytes.length > 32768) throw new Error('插件包缺少有效manifest.json')
    const manifest = runtimeManifestSchema.parse(JSON.parse(source.bytes.toString())), contribution = runtimeContribution(manifest)
    if (applicationPlugins.some(plugin => plugin.id === manifest.id)) throw new Error('插件ID与内置预览或主题冲突')
    const driver = contribution.driver
    if (driver.kind === 'module' && !entries.some(value => value.name === driver.entry)) throw new Error('插件入口不在包内')
    if (!entries.some(value => /^LICENSE(?:\.txt|\.md)?$/i.test(value.name))) throw new Error('插件包需要LICENSE文件')
    const digest = createHash('sha256'); for (const entry of entries) digest.update(entry.name).update('\0').update(hash(entry.bytes)).update('\0')
    return { manifest, root, hash: digest.digest('hex'), bundled: false, entries }
  }
  private check(revision: number) { if (this.diagnostic) throw new Error(this.diagnostic); if (revision !== this.state.revision) throw new Error('插件列表已变化，请刷新后重试') }
  private async persist(state: z.infer<typeof saved>) {
    saved.parse(state)
    await mkdir(this.root, { recursive: true }); const temporary = join(this.root, `${randomUUID()}.tmp`)
    try { await writeFile(temporary, JSON.stringify(state), { mode: 0o600 }); await rename(temporary, join(this.root, 'registry.json')); this.state = state }
    finally { await rm(temporary, { force: true }) }
  }
  async install(directory: string, expectedRevision: number) {
    this.check(expectedRevision)
    const item = await this.readPackage(resolve(directory)), current = this.packages.get(item.manifest.id)
    if (current?.hash === item.hash) return this.snapshot()
    if (this.leases.has(item.manifest.id)) throw new Error('此插件仍在执行，请等实际退出后更新')
    if (this.changing.has(item.manifest.id)) throw new Error('此插件正在更新')
    this.changing.add(item.manifest.id)
    const target = join(this.root, 'packages', item.hash), staging = join(this.root, `staging-${randomUUID()}`)
    try {
      await mkdir(staging, { recursive: true })
      for (const entry of item.entries) { const path = join(staging, entry.name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, entry.bytes, { mode: 0o600 }) }
      await mkdir(dirname(target), { recursive: true })
      try { await rename(staging, target) } catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; if ((await this.readPackage(target)).hash !== item.hash) throw new Error('已存在的插件版本内容不符') }
      this.check(expectedRevision)
      await this.persist({ ...this.state, revision: this.state.revision + 1, packages: { ...this.state.packages, [item.manifest.id]: { hash: item.hash, enabled: current ? this.enabled(item.manifest.id) : true } } })
      this.packages.set(item.manifest.id, { ...item, root: target }); return this.snapshot()
    } finally { this.changing.delete(item.manifest.id); await rm(staging, { recursive: true, force: true }) }
  }
  async setEnabled(id: string, enabled: boolean, expectedRevision: number) {
    this.check(expectedRevision); if (!this.packages.has(id)) throw new Error('插件不存在')
    const packages = { ...this.state.packages }, disabled = new Set(this.state.disabled)
    if (packages[id]) packages[id] = { ...packages[id], enabled }
    if (enabled) disabled.delete(id); else disabled.add(id)
    await this.persist({ revision: this.state.revision + 1, packages, disabled: [...disabled] }); return this.snapshot()
  }
  async uninstall(id: string, expectedRevision: number) {
    this.check(expectedRevision); const item = this.packages.get(id)
    if (!item || item.bundled) throw new Error('内置插件可以停用，不能卸载')
    if (this.leases.has(id)) throw new Error('此插件仍在执行，请等实际退出后卸载')
    if (this.changing.has(id)) throw new Error('此插件正在更新')
    this.changing.add(id)
    try {
    const packages = { ...this.state.packages }; delete packages[id]
    await this.persist({ ...this.state, revision: this.state.revision + 1, packages, disabled: [...new Set([...this.state.disabled, id])] })
    this.packages.delete(id)
    const bundled = this.bundled.get(id); if (bundled) this.packages.set(id, bundled)
    // Package code only. Profiles, history, native login and sessions stay untouched.
    await rm(item.root, { recursive: true, force: true }); return this.snapshot()
    } finally { this.changing.delete(id) }
  }
}
