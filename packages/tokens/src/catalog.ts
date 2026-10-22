/*
 * [INPUT]: 唯一foundation变量、排版及Soft语义定义。
 * [OUTPUT]: 完整Token目录、引用解析、用途分组和同源Markdown/JSON；不另存一份数值。
 * [POS]: @boai/tokens公开目录，Node与浏览器共用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header与所属目录.folder.md。
 */
import { foundationVariables } from './foundation'
import { softTokens, darkSoftTokens } from './surfaces'

export const tokenGroups = {
  color: '颜色与状态', surface: '表面与边缘', typography: '字体与排版',
  radius: '圆角', shadow: '阴影与分割', metric: '尺寸', alias: '兼容与映射',
} as const
export type TokenGroup = keyof typeof tokenGroups
export type TokenKind = 'color' | 'shadow' | 'radius' | 'font' | 'size' | 'number' | 'expression'
export interface TokenRow {
  name: string; group: TokenGroup; type: TokenKind; description: string; source: string
  light: string; dark: string; resolvedLight: string; resolvedDark: string; references: string[]
}
const descriptions: Record<string, string> = {
  background: '应用外层背景', foreground: '主要文字与图标', card: '卡片和控件表面',
  'card-foreground': '卡片上的文字', popover: '浮层表面', 'popover-foreground': '浮层文字',
  primary: '主要操作与强调', 'primary-foreground': '主操作的可读前景',
  secondary: '次级控件底色', 'secondary-foreground': '次级控件文字',
  muted: '弱化区域底色', 'muted-foreground': '说明与次级文字',
  accent: '中性悬停底色，不是品牌强调色', 'accent-foreground': '悬停时的文字',
  border: '普通结构边界', input: '输入边缘的颜色映射', ring: '键盘焦点与强调边缘',
  destructive: '危险操作与失败', 'destructive-foreground': '危险操作前景',
  success: '成功状态', warning: '警示状态', selection: '选中背景', link: '链接文字',
  'surface-app': '应用背景', 'surface-list': '列表区表面', 'surface-content': '阅读内容表面',
  'surface-detail': '详情面板表面', 'surface-composer': '聊天输入表面',
  'surface-user-message': '用户消息表面', 'frame-border': '框架边缘',
  'sidebar-label': '侧栏弱化标签', 'rail-foreground': '导航轨图标',
  'code-background': '代码底色', 'code-foreground': '代码文字', shadow: '通用阴影色',
  'radius-frame': '框架圆角', 'radius-control': '按钮与输入圆角', 'radius-card': '卡片与浮层圆角',
  'radius-composer': '聊天输入容器圆角', 'radius-pill': '明确需要圆形或胶囊的形状',
  'toolbar-height': '桌面工具栏高度', 'rail-width': '导航轨宽度',
  'control-height': '默认控件高度', 'content-width': '阅读内容宽度',
  'shadow-input': '输入内侧细边缘与高光', 'shadow-control': '按钮/Card边缘与轻阴影',
  'shadow-divider': '水平分割细线与高光', 'shadow-divider-vertical': '垂直分割细线与高光',
  'shadow-card': '轻表面阴影；Card组件默认使用shadow-control', 'shadow-popover': '浮层抬升',
  'shadow-small': '轻微外侧阴影', 'shadow-field': '字段表面层次',
  'shadow-emphasis': '强调按钮边缘与高光', 'shadow-composer': '聊天输入边缘',
}
const roleLabels: Record<string, string> = {
  ui: '界面', content: '内容', code: '代码', family: '字体', body: '正文', caption: '注释',
  secondary: '次级文字', control: '控件', heading: '小节标题', title: '标题',
  emphasis: '强调', compact: '紧凑', relaxed: '宽松', tight: '紧密',
  background: '背景', foreground: '文字', highlight: '高光', bottom: '底部', top: '顶部',
  edge: '边缘', hairline: '细边', shade: '阴影', hover: '悬停', tint: '轻着色',
  surface: '表面', outer: '外侧', thumb: '滑块', destructive: '危险', success: '成功',
  warning: '警示', info: '信息', status: '状态', sidebar: '侧栏', primary: '主操作',
  accent: '选中', border: '边界', ring: '焦点', chart: '图表系列',
}
function groupFor(name: string): TokenGroup {
  if (/^(legacy-|app$|list$|content$|hover$|selected$|focus$|radius$|font-mono$|chart-)/.test(name)) return 'alias'
  if (/^(font-|text-|leading-)/.test(name)) return 'typography'
  if (name.startsWith('radius-')) return 'radius'
  if (name.startsWith('shadow-')) return 'shadow'
  if (name.startsWith('soft-') || name.startsWith('surface-')) return 'surface'
  if (['toolbar-height', 'rail-width', 'control-height', 'content-width'].includes(name)) return 'metric'
  return 'color'
}
export function resolveTokenValue(name: string, values: Record<string, string>, seen: readonly string[] = []): string {
  if (seen.includes(name)) throw new Error(`Token引用循环: ${[...seen, name].join(' → ')}`)
  if (!(name in values)) throw new Error(`未定义Token: ${name}`)
  return values[name].replace(/var\((--[\w-]+)\)/g, (_match, reference: string) => resolveTokenValue(reference, values, [...seen, name]))
}
function kindFor(name: string, resolved: string, group: TokenGroup): TokenKind {
  if (group === 'shadow') return 'shadow'
  if (group === 'radius' || name === 'radius') return 'radius'
  if (name.startsWith('font-')) return 'font'
  if (name.startsWith('leading-')) return 'number'
  if (name.startsWith('text-') || group === 'metric') return 'size'
  if (/^#[\da-f]{3,8}$/i.test(resolved)) return 'color'
  return 'expression'
}
export function tokenRows(): TokenRow[] {
  const light = foundationVariables('light'), dark = foundationVariables('dark')
  return Object.keys(light).map(name => {
    if (!(name in dark)) throw new Error(`深色主题缺少Token: ${name}`)
    const key = name.slice(2), group = groupFor(key)
    const resolvedLight = resolveTokenValue(name, light), resolvedDark = resolveTokenValue(name, dark)
    const references = [...new Set([...light[name].matchAll(/var\((--[\w-]+)\)/g), ...dark[name].matchAll(/var\((--[\w-]+)\)/g)].map(match => match[1]))]
    const source = /^(font-|text-|leading-)/.test(key) ? 'typography.ts' : key in softTokens || key in darkSoftTokens ? 'surfaces.ts' : 'theme.ts'
    const description = descriptions[key] ?? (group === 'alias' ? `兼容/用途映射：${references.join('、') || key}` : key.split('-').map(part => roleLabels[part] ?? part).join(' · '))
    return { name, group, type: kindFor(key, resolvedLight, group), description, source, light: light[name], dark: dark[name], resolvedLight, resolvedDark, references }
  })
}
export function tokenDocument(packageVersion: string) {
  return { version: 1, packageVersion, light: foundationVariables('light'), dark: foundationVariables('dark'), tokens: tokenRows() }
}
export function tokenMarkdown(): string {
  const rows = tokenRows()
  return '\n' + Object.entries(tokenGroups).map(([group, title]) => `## ${title}\n\n| 变量 | 用途 | 默认浅色 | 默认深色 | 引用 |\n| --- | --- | --- | --- | --- |\n` + rows.filter(row => row.group === group).map(row => `| \`${row.name}\` | ${row.description} | \`${row.light}\` | \`${row.dark}\` | ${row.references.join(', ') || '直接值'} |`).join('\n')).join('\n\n') + '\n'
}
