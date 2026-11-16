/*
 * [OUTPUT]: 配置设置分类与本人二级菜单共用名称和语义图标。
 * [INPUT]: Shared offline icons and personal settings destinations.
 * [OUTPUT]: One label/icon mapping for settings navigation and the user dropdown.
 * [POS]: Personal settings shortcut metadata; navigation remains with each caller.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { Palette, Keyboard, Power, Monitor, Sparkles, Search, Mic, Plug, HardDrive } from '@/components/icons/index'
export const personalSettingsShortcuts = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'desktop', label: '运行选项', icon: Power },
  { id: 'desktop-activity', label: '桌面活动与日报', icon: Monitor },
] as const

export const configurationSettingsShortcuts = [
  { id: 'connections', label: '模型连接', icon: Sparkles },
  { id: 'web-search', label: '网页检索', icon: Search },
  { id: 'voice-input', label: '语音输入', icon: Mic },
  { id: 'plugins', label: '插件', icon: Plug },
  { id: 'data', label: '数据与备份', icon: HardDrive },
] as const
