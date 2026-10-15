/*
 * [INPUT]: 受审内置清单与两类类型化贡献。
 * [OUTPUT]: 冻结且校验唯一身份/有限格式/颜色的目录；主进程与renderer共享真源。
 * [POS]: 应用插件装配目录；不发现外部包，权限不由清单自报。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { z } from 'zod'
import { APPLICATION_PLUGIN_API, type ApplicationPluginManifest } from './types'
import { themePluginContributions } from './theme-contributions'

const id = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9.-]*$/)
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const theme = z.object({ id, name: z.string().min(1).max(100), mode: z.enum(['light', 'dark']), background: color, surface: color, foreground: color, muted: color, border: color, accent: color }).strict()
const contribution = z.discriminatedUnion('type', [
  z.object({ type: z.literal('preview'), kinds: z.array(z.enum(['text', 'markdown', 'code', 'image', 'pdf', 'docx', 'xlsx', 'pptx'])).min(1).max(8), extensions: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)).min(1).max(100).optional() }).strict(),
  z.object({ type: z.literal('theme'), themes: z.array(theme).min(1).max(100) }).strict(),
])
const manifest = z.object({ id, name: z.string().min(1).max(100), description: z.string().max(500), version: z.string().regex(/^\d+\.\d+\.\d+$/), apiVersion: z.number().int().positive(), contributions: z.array(contribution).min(1).max(2) }).strict()

export function definePluginCatalog(input: readonly ApplicationPluginManifest[]): readonly ApplicationPluginManifest[] {
  const plugins = z.array(manifest).max(100).parse(input)
  const ids = new Set<string>(), themeIds = new Set(['boai-light', 'boai-dark'])
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`)
    ids.add(plugin.id)
    const types = new Set<string>()
    for (const item of plugin.contributions) {
      if (types.has(item.type)) throw new Error(`Duplicate contribution type: ${plugin.id}/${item.type}`)
      types.add(item.type)
      if (item.type === 'theme') for (const value of item.themes) {
        if (themeIds.has(value.id)) throw new Error(`Duplicate theme id: ${value.id}`)
        themeIds.add(value.id); Object.freeze(value)
      }
      if (item.type === 'theme') Object.freeze(item.themes)
      else { Object.freeze(item.kinds); if (item.extensions) Object.freeze(item.extensions) }
      Object.freeze(item)
    }
    Object.freeze(plugin.contributions); Object.freeze(plugin)
  }
  return Object.freeze(plugins)
}

export const applicationPlugins = definePluginCatalog([
  { id: 'boai.preview.text', name: '文本预览', description: 'Markdown、代码和纯文本，支持选区修改。', version: '1.0.0', apiVersion: APPLICATION_PLUGIN_API, contributions: [{ type: 'preview', kinds: ['markdown', 'code', 'text'] }] },
  { id: 'boai.preview.image', name: '图片预览', description: '查看已核验的聊天图片。', version: '1.0.0', apiVersion: APPLICATION_PLUGIN_API, contributions: [{ type: 'preview', kinds: ['image'] }] },
  { id: 'boai.preview.pdf', name: 'PDF 预览', description: 'PDF 文档阅读、搜索和页面导航。', version: '1.0.0', apiVersion: APPLICATION_PLUGIN_API, contributions: [{ type: 'preview', kinds: ['pdf'] }] },
  { id: 'boai.preview.office', name: 'Office 预览', description: 'Word、Excel 和 PowerPoint 文档阅读。', version: '1.0.0', apiVersion: APPLICATION_PLUGIN_API, contributions: [{ type: 'preview', kinds: ['docx', 'xlsx', 'pptx'] }] },
  ...themePluginContributions,
])

export function previewManifest(id: string) {
  const plugin = applicationPlugins.find(value => value.id === id)
  const item = plugin?.contributions.find(value => value.type === 'preview')
  if (!plugin || !item || item.type !== 'preview') throw new Error(`Unknown preview contribution: ${id}`)
  return Object.freeze({ id: plugin.id, version: plugin.version, apiVersion: plugin.apiVersion, kinds: item.kinds, extensions: item.extensions })
}

export function themePluginId(themeId: string): string | undefined {
  return applicationPlugins.find(plugin => plugin.contributions.some(item => item.type === 'theme' && item.themes.some(theme => theme.id === themeId)))?.id
}
