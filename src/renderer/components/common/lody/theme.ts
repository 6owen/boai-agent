/*
 * [INPUT]: BOAI唯一外观store与真实桌面bridge。
 * [OUTPUT]: 迁入viewer跟随当前明暗模式；Diff使用上游默认主题，Electron保持桌面布局。
 * [POS]: Lody主题/桌面能力的宿主适配。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useAppearance } from '@/stores/appearance'
export const useResolvedTheme = () => useAppearance(state => state.preview.resolvedMode)
export const DEFAULT_VSCODE_DIFF_THEME_FALLBACK = { dark: 'github-dark-default', light: 'pierre-light' } as const
export const useActiveVSCodeDiffThemeName = () => DEFAULT_VSCODE_DIFF_THEME_FALLBACK[useResolvedTheme()]
export const useIsMobile = () => !window.boai && window.matchMedia('(max-width: 767px)').matches
