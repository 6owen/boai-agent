/*
 * [INPUT]: 主进程确认的插件启停快照与内置预览Adapter。
 * [OUTPUT]: 当前配置唯一注册快照，实际视图引用/错误归应用插件宿主；旧视图保留原provider。
 * [POS]: 应用插件配置到只读预览扩展点的装配Seam。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { PluginSettingsSnapshot } from '@shared/plugins/types'
import { pluginUsage, usePlugins } from '@/stores/plugins'
import { builtinPreviewPlugins } from './builtins'
import { createPreviewRegistry, type PreviewRegistry } from './registry'

let cached: { settings: PluginSettingsSnapshot; registry: PreviewRegistry } | undefined
const observer = { open: (id: string) => pluginUsage.acquire(id), error: (id: string) => pluginUsage.fail(id) }
export function usePreviewRegistry() {
  const settings = usePlugins(state => state.settings)
  if (cached?.settings !== settings) cached = { settings, registry: createPreviewRegistry(builtinPreviewPlugins, new Set(settings.disabledIds), observer) }
  return cached.registry
}
