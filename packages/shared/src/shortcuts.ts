/*
 * [INPUT]: 平台、物理键码和 Main 持久快捷键快照。
 * [OUTPUT]: 五项动作（含默认关闭语音输入）、规范化绑定、展示/执行一致的匹配与冲突校验。
 * [POS]: Main 与 Renderer 共用快捷键合同，不注册系统热键。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { z } from 'zod'

export const shortcutIds = ['search', 'sidebar', 'back', 'forward', 'voiceInput'] as const
export type ShortcutId = typeof shortcutIds[number]
export type ShortcutPlatform = 'mac' | 'other'
export const shortcutLabels: Record<ShortcutId, string> = { search: 'Open Search / 全局搜索', sidebar: '切换侧边栏', back: '后退', forward: '前进', voiceInput: '语音输入' }
const codeSchema = z.string().regex(/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Minus|Equal|Enter|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/)
export const shortcutBindingSchema = z.object({ code: codeSchema, shift: z.boolean(), alt: z.boolean() }).strict()
export type ShortcutBinding = z.infer<typeof shortcutBindingSchema>
export const shortcutEntrySchema = z.object({ enabled: z.boolean(), binding: shortcutBindingSchema.nullable() }).strict()
export type ShortcutEntry = z.infer<typeof shortcutEntrySchema>
export type ShortcutPreferences = Record<ShortcutId, ShortcutEntry>
export const shortcutPatchSchema = z.object({ search: shortcutEntrySchema.optional(), sidebar: shortcutEntrySchema.optional(), back: shortcutEntrySchema.optional(), forward: shortcutEntrySchema.optional(), voiceInput: shortcutEntrySchema.optional() }).strict().refine(value => Object.keys(value).length > 0)
export const shortcutUpdateSchema = z.object({ patch: shortcutPatchSchema, expectedRevision: z.number().int().nonnegative().safe(), requestId: z.string().uuid() }).strict()
export type ShortcutUpdate = z.infer<typeof shortcutUpdateSchema>
export type ReservedShortcut = { binding: ShortcutBinding; label: string }
export type ShortcutSnapshot = { schemaVersion: 1; revision: number; platform: ShortcutPlatform; preferences: ShortcutPreferences; reserved: ReservedShortcut[]; error?: string }
export type ShortcutReceipt = { state: 'committed' | 'absent' | 'unknown'; snapshot: ShortcutSnapshot }

export function shortcutDefaults(): ShortcutPreferences {
  const entry = (code: string): ShortcutEntry => ({ enabled: true, binding: { code, shift: false, alt: false } })
  return { search: entry('KeyK'), sidebar: entry('KeyB'), back: entry('BracketLeft'), forward: entry('BracketRight'), voiceInput: { enabled: false, binding: null } }
}
export function bindingKey(binding: ShortcutBinding | null) { return binding ? `${binding.code}:${Number(binding.shift)}:${Number(binding.alt)}` : '' }
export function sameShortcut(a: ShortcutEntry, b: ShortcutEntry) { return a.enabled === b.enabled && bindingKey(a.binding) === bindingKey(b.binding) }

const keyNames: Record<string, string> = { BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' }
export function shortcutText(binding: ShortcutBinding | null, platform: ShortcutPlatform): string {
  if (!binding) return '无'
  return [platform === 'mac' ? '⌘' : 'Ctrl', binding.alt ? (platform === 'mac' ? '⌥' : 'Alt') : '', binding.shift ? (platform === 'mac' ? '⇧' : 'Shift') : '', keyNames[binding.code] ?? binding.code.replace(/^(Key|Digit)/, '')].filter(Boolean).join(' ')
}
type KeyInput = { code: string; key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; repeat: boolean }
export function bindingFromKey(event: KeyInput, platform: ShortcutPlatform): ShortcutBinding | undefined {
  if (event.isComposing || event.repeat || ['Dead', 'Process', 'Unidentified'].includes(event.key)) return
  if (platform === 'mac' ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return
  const code = codeSchema.safeParse(event.code)
  if (!code.success) return
  return { code: code.data, shift: event.shiftKey, alt: event.altKey }
}
export function matchShortcut(event: KeyInput, snapshot: ShortcutSnapshot): ShortcutId | undefined {
  const binding = bindingFromKey(event, snapshot.platform)
  if (!binding) return
  return shortcutIds.find(id => snapshot.preferences[id].enabled && snapshot.preferences[id].binding && bindingKey(snapshot.preferences[id].binding) === bindingKey(binding))
}
export function validateShortcuts(preferences: ShortcutPreferences, reserved: ReservedShortcut[]): void {
  const occupied = new Map<string, ShortcutId>()
  for (const id of shortcutIds) {
    const entry = shortcutEntrySchema.parse(preferences[id])
    if (!entry.binding) continue
    const key = bindingKey(entry.binding), unavailable = reserved.find(value => bindingKey(value.binding) === key)
    if (unavailable) throw new Error(`此组合键由“${unavailable.label}”占用，请更换组合键。`)
    if (!entry.enabled) continue
    const other = occupied.get(key)
    if (other) throw new Error(`此组合键已用于“${shortcutLabels[other]}”，请更换组合键。`)
    occupied.set(key, id)
  }
}

/** Explicit editing/system reservations supplement the installed menu inventory. */
export function reservedShortcuts(platform: ShortcutPlatform, development: boolean): ReservedShortcut[] {
  const out: ReservedShortcut[] = []
  const add = (code: string, label: string, shift = false, alt = false) => out.push({ binding: { code, shift, alt }, label })
  for (const [code, label] of [['KeyA', '全选'], ['KeyC', '复制'], ['KeyX', '剪切'], ['KeyV', '粘贴'], ['KeyZ', '撤销']] as const) add(code, label)
  add('KeyZ', '重做', true); add('KeyV', '粘贴并匹配样式', true, platform === 'mac')
  if (platform === 'other') add('KeyY', '重做')
  if (platform === 'mac') { add('KeyQ', '退出'); add('KeyH', '隐藏'); add('KeyH', '隐藏其他应用', false, true); add('KeyM', '最小化'); add('Comma', '设置') }
  add('KeyW', '关闭窗口'); add('Digit0', '实际大小'); add('Equal', '放大'); add('Equal', '放大', true); add('Minus', '缩小')
  if (development) { add('KeyR', '重新加载'); add('KeyR', '强制重新加载', true); add('KeyI', '开发者工具', platform !== 'mac', platform === 'mac') }
  return out
}

/** Menu accelerators use logical keys; normalize the supported physical US key positions. */
export function acceleratorBinding(accelerator: string, platform: ShortcutPlatform): ShortcutBinding | undefined {
  const parts = accelerator.toLowerCase().split('+'), key = parts.pop()!
  const command = parts.some(part => ['cmd', 'command', 'super', 'meta'].includes(part))
  const control = parts.some(part => ['ctrl', 'control'].includes(part))
  const primary = parts.some(part => ['cmdorctrl', 'commandorcontrol'].includes(part))
  if (platform === 'mac' ? (!command && !primary) || control : (!control && !primary) || command) return
  const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : /^f\d+$/.test(key) ? key.toUpperCase() : Object.keys(keyNames).find(code => keyNames[code].toLowerCase() === key) ?? ({ plus: 'Equal', minus: 'Minus', return: 'Enter' } as Record<string,string>)[key]
  if (!code || !codeSchema.safeParse(code).success) return
  return { code, shift: parts.includes('shift') || key === 'plus', alt: parts.includes('alt') || parts.includes('option') }
}
