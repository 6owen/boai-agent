/*
 * [INPUT]: 固定本机配置路径、已校验内置清单与明确启停/CAS请求。
 * [OUTPUT]: 串行原子持久化；坏文件/未来版本只读保留、未知id偏好保留，失败不发布状态。
 * [POS]: 内置插件配置真源；不加载插件代码、不属于业务备份。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { applicationPlugins } from '../shared/plugins/catalog'
import { APPLICATION_PLUGIN_API, type ApplicationPluginManifest, type PluginEnableInput, type PluginSettingsSnapshot } from '../shared/plugins/types'

const pluginId = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9.-]*$/)
const savedSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), disabledIds: z.array(pluginId).max(256) }).strict()
const updateSchema = z.object({ id: pluginId, enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() }).strict()

export class PluginSettingsStore {
  private value = { schemaVersion: 1 as const, revision: 0, disabledIds: [] as string[] }
  private diagnostic?: string
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string, private readonly changed: (value: PluginSettingsSnapshot) => void,
    private readonly catalog: readonly ApplicationPluginManifest[] = applicationPlugins) {}
  async init() {
    try {
      if ((await stat(this.path)).size > 32_768) throw new Error('Plugin settings too large')
      const bytes = await readFile(this.path)
      if (bytes.length > 32_768) throw new Error('Plugin settings too large')
      this.value = savedSchema.parse(JSON.parse(bytes.toString('utf8')))
      this.value.disabledIds = [...new Set(this.value.disabledIds)].sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.diagnostic = '插件配置无法读取或来自更新版本，原文件已保留；请修复配置后重启。'
        this.value.disabledIds = this.catalog.map(plugin => plugin.id)
      }
    }
  }
  snapshot(): PluginSettingsSnapshot {
    return { revision: this.value.revision, disabledIds: [...this.value.disabledIds], ...(this.diagnostic ? { readOnly: true, diagnostic: this.diagnostic } : {}) }
  }
  update(input: PluginEnableInput): Promise<PluginSettingsSnapshot> {
    const work = this.queue.then(async () => {
      if (this.diagnostic) throw new Error(this.diagnostic)
      const value = updateSchema.parse(input), plugin = this.catalog.find(plugin => plugin.id === value.id)
      if (!plugin) throw new Error('找不到此内置插件。')
      if (value.enabled && plugin.apiVersion !== APPLICATION_PLUGIN_API) throw new Error('此插件与当前应用版本不兼容。')
      if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision !== this.value.revision) throw new Error('插件设置已变化，请刷新后重试。')
      const disabled = new Set(this.value.disabledIds)
      if (value.enabled === !disabled.has(value.id)) return this.snapshot()
      if (value.enabled) disabled.delete(value.id); else disabled.add(value.id)
      const next = savedSchema.parse({ schemaVersion: 1, revision: this.value.revision + 1, disabledIds: [...disabled].sort() })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      await mkdir(dirname(this.path), { recursive: true })
      try { await writeFile(temporary, JSON.stringify(next), { mode: 0o600 }); await rename(temporary, this.path) }
      finally { await rm(temporary, { force: true }) }
      this.value = next
      this.changed(this.snapshot())
      return this.snapshot()
    })
    this.queue = work.catch(() => {})
    return work
  }
  async flush() { await this.queue }
}
