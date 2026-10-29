/*
 * [OUTPUT]: 独立AgentBrowser/BrowserViewer插件接入；上游工具、启停与运行回收保持独立。
 * [OUTPUT]: 2026-10-29 新增file-explorer贡献和boai.file-explorer内置清单。
 * [OUTPUT]: 插件配置v1/v2共用严格读取与v2保存schema，供主进程和检索后台核对同一状态。
 * [OUTPUT]: 2026-10-27 语音插件与显式执行额度的公共合同；不依赖可执行插件。
 * [OUTPUT]: 2026-10-19 原应用贡献联合增加 web-search，复用插件兼容和启停合同。
 * [OUTPUT]: v1预览/主题兼容v2运行时清单；独立API候选、配置schema和声明式发现。
 * [INPUT]: 内置预览和数据型主题声明、主进程启停配置。
 * [OUTPUT]: v1预览/主题与v2运行时贡献兼容；清单不授予业务或凭据访问权。
 * [POS]: 内置插件平台的跨进程Interface；非第三方SDK。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { z } from 'zod'
import type { RuntimeContribution } from './runtime-catalog'
import type { Theme } from '../appearance/index'
import type { BinaryFilePreview, FilePreview } from '../domain/file-preview'

export const APPLICATION_PLUGIN_API = 1
export const pluginIdSchema = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9.-]*$/)
const legacyPluginSettingsSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), disabledIds: z.array(pluginIdSchema).max(256) }).strict()
export const savedPluginSettingsSchema = legacyPluginSettingsSchema.extend({ schemaVersion: z.literal(2), enabledIds: z.array(pluginIdSchema).max(256) }).strict()
export const readPluginSettingsSchema = z.union([savedPluginSettingsSchema, legacyPluginSettingsSchema.transform(value => ({ ...value, schemaVersion: 2 as const, enabledIds: [] as string[] }))])
export type PreviewKind = Exclude<FilePreview['kind'], 'unsupported'> | BinaryFilePreview['kind'] | 'image'
export type PluginContribution =
  | { readonly type: 'browser-tools'; readonly provider: import('./browser-tools').BrowserPluginProvider }
  | { readonly type: 'file-explorer' }
  | { readonly type: 'voice-input' }
  | { readonly type: 'web-search'; readonly provider: import('../domain/web-search').SearchProviderId }
  | RuntimeContribution
  | { readonly type: 'preview'; readonly kinds: readonly PreviewKind[]; readonly extensions?: readonly string[] }
  | { readonly type: 'theme'; readonly themes: readonly Readonly<Theme>[] }
export interface ApplicationPluginManifest {
  readonly id: string
  readonly version: string
  readonly apiVersion: number
  readonly name: string
  readonly description: string
  readonly defaultEnabled?: boolean
  readonly contributions: readonly PluginContribution[]
}
export interface PluginSettingsSnapshot {
  readonly revision: number
  readonly disabledIds: readonly string[]
  readonly enabledIds?: readonly string[]
  readonly readOnly?: boolean
  readonly diagnostic?: string
}
export interface PluginEnableInput { id: string; enabled: boolean; expectedRevision: number }
export type PluginAvailability = 'enabled' | 'disabled' | 'incompatible'
export function pluginAvailability(plugin: ApplicationPluginManifest, settings: PluginSettingsSnapshot): PluginAvailability {
  if (![APPLICATION_PLUGIN_API, 2].includes(plugin.apiVersion)) return 'incompatible'
  return settings.disabledIds.includes(plugin.id) || plugin.defaultEnabled === false && !settings.enabledIds?.includes(plugin.id) ? 'disabled' : 'enabled'
}
