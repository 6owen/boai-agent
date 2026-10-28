/*
 * [OUTPUT]: 持久化格式与检索后台复用shared的v1/v2严格schema，避免有效v2配置被误拒。
 * [OUTPUT]: 2026-10-27 默认关闭语音插件接线、可信主窗口与原草稿/生命周期边界。
 * [OUTPUT]: 插件目录安装经原生选择与私有runtime通道；运行时列表/启停/卸载IPC及动态发现。
 * [INPUT]: 固定本机配置路径、已校验内置清单与明确启停/CAS请求。
 * [OUTPUT]: 串行原子持久化；坏文件/未来版本只读保留、未知id偏好保留，失败不发布状态。
 * [POS]: 内置插件配置真源；不加载插件代码、不属于业务备份。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import { APPLICATION_PLUGIN_API, pluginAvailability, pluginIdSchema, readPluginSettingsSchema, savedPluginSettingsSchema, type ApplicationPluginManifest, type PluginEnableInput, type PluginSettingsSnapshot } from '@boai/shared/plugins/types'

const updateSchema = z.object({ id: pluginIdSchema, enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() }).strict()

export class PluginSettingsStore {
  private value = { schemaVersion: 2 as const, revision: 0, disabledIds: [] as string[], enabledIds: [] as string[] }
  private diagnostic?: string
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string, private readonly changed: (value: PluginSettingsSnapshot) => void,
    private readonly catalog: readonly ApplicationPluginManifest[] = applicationPlugins) {}
  async init() {
    try {
      if ((await stat(this.path)).size > 32_768) throw new Error('Plugin settings too large')
      const bytes = await readFile(this.path)
      if (bytes.length > 32_768) throw new Error('Plugin settings too large')
      this.value = readPluginSettingsSchema.parse(JSON.parse(bytes.toString('utf8')))
      this.value.disabledIds = [...new Set(this.value.disabledIds)].sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.diagnostic = '插件配置无法读取或来自更新版本，原文件已保留；请修复配置后重启。'
        this.value.disabledIds = this.catalog.map(plugin => plugin.id)
      }
    }
  }
  snapshot(): PluginSettingsSnapshot {
    return { revision: this.value.revision, disabledIds: [...this.value.disabledIds], enabledIds: [...this.value.enabledIds], ...(this.diagnostic ? { readOnly: true, diagnostic: this.diagnostic } : {}) }
  }
  update(input: PluginEnableInput): Promise<PluginSettingsSnapshot> {
    const work = this.queue.then(async () => {
      if (this.diagnostic) throw new Error(this.diagnostic)
      const value = updateSchema.parse(input), plugin = this.catalog.find(plugin => plugin.id === value.id)
      if (!plugin) throw new Error('找不到此内置插件。')
      if (value.enabled && ![APPLICATION_PLUGIN_API, 2].includes(plugin.apiVersion)) throw new Error('此插件与当前应用版本不兼容。')
      if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision !== this.value.revision) throw new Error('插件设置已变化，请刷新后重试。')
      const disabled = new Set(this.value.disabledIds), enabled = new Set(this.value.enabledIds)
      if (value.enabled === (pluginAvailability(plugin, this.snapshot()) === 'enabled')) return this.snapshot()
      if (value.enabled) { disabled.delete(value.id); enabled.add(value.id) } else { disabled.add(value.id); enabled.delete(value.id) }
      const next = savedPluginSettingsSchema.parse({ schemaVersion: 2, revision: this.value.revision + 1, disabledIds: [...disabled].sort(), enabledIds: [...enabled].sort() })
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
