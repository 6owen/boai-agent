/*
 * [INPUT]: Explicit agent-desktop plugin enablement and upstream CLI arguments.
 * [OUTPUT]: Versioned desktop preferences and bounded calls; lifecycle flags stay host-owned.
 * [POS]: Optional desktop tool contract, independent of the legacy computer-use MCP.
 * [PROTOCOL]: Update Header and plugins/.folder.md on change.
 */
import { z } from 'zod'

export const DESKTOP_PLUGIN_ID = 'boai.desktop.agent-desktop'
export const desktopPluginConfigSchema = z.object({ allowHeaded: z.boolean().default(false) }).strict()
export type DesktopPluginConfig = z.infer<typeof desktopPluginConfigSchema>
export interface DesktopPluginSettings { revision: number; config: DesktopPluginConfig }
export const saveDesktopPluginSettingsSchema = z.object({ expectedRevision: z.number().int().nonnegative(), config: desktopPluginConfigSchema }).strict()
export type SaveDesktopPluginSettings = z.infer<typeof saveDesktopPluginSettingsSchema>
export const desktopPluginCommandSchema = z.enum([
  'status', 'permissions', 'version', 'skills', 'snapshot', 'find', 'get', 'is', 'screenshot', 'list-surfaces',
  'list-apps', 'list-windows', 'list-displays', 'wait', 'clipboard-get',
  'click', 'double-click', 'triple-click', 'right-click', 'type', 'set-value', 'clear', 'focus', 'select', 'toggle',
  'check', 'uncheck', 'expand', 'collapse', 'scroll', 'scroll-to', 'press', 'hover', 'drag',
  'mouse-move', 'mouse-click', 'mouse-wheel', 'launch', 'close-app', 'focus-window', 'resize-window', 'move-window',
  'minimize', 'maximize', 'restore', 'clipboard-set', 'clipboard-clear',
])
export const desktopPluginCallSchema = z.object({
  command: desktopPluginCommandSchema,
  args: z.array(z.string().max(20000).refine(value => !value.includes('\0'))).max(64).default([]),
  headed: z.boolean().default(false),
}).strict()
export type DesktopPluginCall = z.infer<typeof desktopPluginCallSchema>
const observations = new Set<string>(['status', 'permissions', 'version', 'skills', 'snapshot', 'find', 'get', 'is', 'screenshot', 'list-surfaces', 'list-apps', 'list-windows', 'list-displays', 'wait', 'clipboard-get'])
export function desktopPluginWrites(input: DesktopPluginCall) { return input.headed || !observations.has(input.command) }

export function validateDesktopPluginCall(input: DesktopPluginCall, config: DesktopPluginConfig) {
  if (input.headed && !config.allowHeaded) throw new Error('Agent Desktop 尚未允许前台操作，请先在插件配置中开启')
  const reserved = /^(?:--(?:session|agent-id|headed|trace|trace-strict|debug|screenshot|request|guide|out|output)(?:=|$)|-v$)/
  if (input.args.some(arg => reserved.test(arg))) throw new Error('会话、前台模式、权限申请和文件输出由插件管理，不能在 args 中覆盖')
  if (['status', 'permissions', 'version', 'list-apps', 'list-displays', 'clipboard-get', 'clipboard-clear'].includes(input.command) && input.args.length && input.args.join(' ') !== '--help') throw new Error('此命令不接受额外参数；请用 --help 查看用法')
  if (input.command === 'skills' && input.args.length && !(input.args[0] === 'get' && input.args.length >= 2 && input.args.length <= 3 && input.args.slice(1).every(arg => /^[a-z-]+$/.test(arg)))) throw new Error('技能读取仅支持 skills 或 skills get <skill> [reference]')
  if (input.command === 'screenshot') {
    for (let i = 0; i < input.args.length; i++) {
      const arg = input.args[i]!
      if (arg === '--help') continue
      if (!['--app', '--screen', '--window-id'].includes(arg) || !input.args[++i] || input.args[i]!.startsWith('--')) throw new Error('截图只接受 --app、--screen 或 --window-id；图片直接返回模型，不写任意路径')
    }
  }
  for (let i = 0; i < input.args.length; i++) {
    const match = /^--(?:timeout-ms|wait-timeout-ms)(?:=(.*))?$/.exec(input.args[i]!)
    if (match) {
      const value = match[1] ?? input.args[++i]
      if (!value || !/^\d+$/.test(value) || Number(value) > 10000) throw new Error('桌面插件单次等待最多 10000 毫秒，请分步观察')
    }
  }
  if (input.command === 'press' && !config.allowHeaded) throw new Error('快捷键会发送真实键盘输入，请先在插件配置中允许前台操作')
}
