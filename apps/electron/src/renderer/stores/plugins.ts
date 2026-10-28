/*
 * [OUTPUT]: 2026-10-29 plugins导出文件浏览器启用状态，沿主进程快照与CAS。
 * [INPUT]: 主进程插件配置快照/事件、明确启停与实际视图生命周期。
 * [OUTPUT]: 单一配置订阅、单次CAS写入及失联只读复核；激活状态独立于启用配置。
 * [POS]: renderer插件状态；正文不进入store，恢复不执行插件业务。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { create } from 'zustand'
import { applicationPlugins, FILE_EXPLORER_PLUGIN_ID } from '@boai/shared/plugins/catalog'
import { PluginUsage } from '@boai/shared/plugins/usage'
import { pluginAvailability, type PluginSettingsSnapshot } from '@boai/shared/plugins/types'
import { getDesktopClient } from '@/services/request/desktop-client'

export const pluginUsage = new PluginUsage(applicationPlugins.map(plugin => plugin.id))
export const usePlugins = create<{ settings: PluginSettingsSnapshot; ready: boolean; busy?: string; error: string }>(() => ({ settings: { revision: 0, disabledIds: [] }, ready: false, error: '' }))
let unsubscribe: (() => void) | undefined
function accept(settings: PluginSettingsSnapshot) {
  if (settings.revision < usePlugins.getState().settings.revision) return
  usePlugins.setState({ settings, ready: true })
}
export function initializePlugins() {
  if (unsubscribe) return
  const api = getDesktopClient()
  if (!api) return
  // Before the first authoritative snapshot no plugin may activate just because its default is enabled.
  usePlugins.setState({ settings: { revision: 0, disabledIds: applicationPlugins.map(plugin => plugin.id) }, ready: false })
  if (api.initialPlugins) accept(api.initialPlugins)
  unsubscribe = api.subscribe(event => { if (event.type === 'plugins:changed') accept(event.settings) })
  void api.request('getPluginSettings', undefined).then(accept).catch(error => usePlugins.setState({ error: String(error) }))
}
export async function setPluginEnabled(id: string, enabled: boolean) {
  const api = getDesktopClient(), state = usePlugins.getState()
  if (!api || !state.ready || state.busy || state.settings.readOnly) return
  usePlugins.setState({ busy: id, error: '' })
  try {
    accept(await api.request('setPluginEnabled', { id, enabled, expectedRevision: state.settings.revision }))
    if (enabled) pluginUsage.clearFailure(id)
  } catch (error) {
    usePlugins.setState({ error: error instanceof Error ? error.message : String(error) })
    // A lost response is not permission to repeat the write; inspect the saved configuration instead.
    try { accept(await api.request('getPluginSettings', undefined)) } catch { /* Keep the last confirmed snapshot. */ }
  } finally { usePlugins.setState({ busy: undefined }) }
}

export function useFileExplorerEnabled() {
  return usePlugins(state => state.ready && pluginAvailability(applicationPlugins.find(plugin => plugin.id === FILE_EXPLORER_PLUGIN_ID)!, state.settings) === 'enabled')
}
