/*
 * [INPUT]: 内置预览和数据型主题声明、主进程启停配置。
 * [OUTPUT]: 应用插件的纯数据合同；无代码入口、路径、凭据或执行权限。
 * [POS]: 内置插件平台的跨进程Interface；非第三方SDK。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { Theme } from '../appearance'
import type { BinaryFilePreview, FilePreview } from '../domain/file-preview'

export const APPLICATION_PLUGIN_API = 1
export type PreviewKind = Exclude<FilePreview['kind'], 'unsupported'> | BinaryFilePreview['kind'] | 'image'
export type PluginContribution =
  | { readonly type: 'preview'; readonly kinds: readonly PreviewKind[]; readonly extensions?: readonly string[] }
  | { readonly type: 'theme'; readonly themes: readonly Readonly<Theme>[] }
export interface ApplicationPluginManifest {
  readonly id: string
  readonly version: string
  readonly apiVersion: number
  readonly name: string
  readonly description: string
  readonly contributions: readonly PluginContribution[]
}
export interface PluginSettingsSnapshot {
  readonly revision: number
  readonly disabledIds: readonly string[]
  readonly readOnly?: boolean
  readonly diagnostic?: string
}
export interface PluginEnableInput { id: string; enabled: boolean; expectedRevision: number }
export type PluginAvailability = 'enabled' | 'disabled' | 'incompatible'
export function pluginAvailability(plugin: ApplicationPluginManifest, settings: PluginSettingsSnapshot): PluginAvailability {
  if (plugin.apiVersion !== APPLICATION_PLUGIN_API) return 'incompatible'
  return settings.disabledIds.includes(plugin.id) ? 'disabled' : 'enabled'
}
