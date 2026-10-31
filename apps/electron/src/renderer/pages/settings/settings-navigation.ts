/*
 * [INPUT]: Shared offline icons and personal settings destinations.
 * [OUTPUT]: One label/icon mapping for settings navigation and the user dropdown.
 * [POS]: Personal settings shortcut metadata; navigation remains with each caller.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { Palette, Keyboard, Power, Monitor } from '@/components/icons/index'
export const personalSettingsShortcuts = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  { id: 'desktop', label: '运行选项', icon: Power },
  { id: 'desktop-activity', label: '桌面活动与日报', icon: Monitor },
] as const
