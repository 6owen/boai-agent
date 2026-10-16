/*
 * [OUTPUT]: v1预览/主题兼容v2运行时清单；独立API候选、配置schema和声明式发现。
 * [INPUT]: 内置预览和数据型主题声明、主进程启停配置。
 * [OUTPUT]: v1预览/主题与v2运行时贡献兼容；清单不授予业务或凭据访问权。
 * [POS]: 内置插件平台的跨进程Interface；非第三方SDK。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { RuntimeContribution } from './runtime-catalog'
import type { Theme } from '../appearance'
import type { BinaryFilePreview, FilePreview } from '../domain/file-preview'

export const APPLICATION_PLUGIN_API = 1
export type PreviewKind = Exclude<FilePreview['kind'], 'unsupported'> | BinaryFilePreview['kind'] | 'image'
export type PluginContribution =
  | RuntimeContribution
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
  if (![APPLICATION_PLUGIN_API, 2].includes(plugin.apiVersion)) return 'incompatible'
  return settings.disabledIds.includes(plugin.id) ? 'disabled' : 'enabled'
}
