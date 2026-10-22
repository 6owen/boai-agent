/*
 * [OUTPUT]: 统一导出TrayIconStatus与逐目标AppIconStatus，不新增托盘偏好。
 * [OUTPUT]: 保底配色与纯颜色解析迁入@boai/tokens；插件/偏好/资产协议仍归宿主。
 * [OUTPUT]: 2026-10-20全局字体与应用图标设置接入原外观持久化和宿主协议。
 * [INPUT]: 内置主题插件贡献、显示模式、启停快照与外观偏好。
 * [OUTPUT]: BoAI保底主题始终存在，停用插件只影响有效配色、不覆盖原选择。
 * [OUTPUT]: 图片玻璃跟随明暗模式；玻璃/遮罩/模糊独立配置，blurRadius默认8px并允许0关闭；旧配置默认和imageOpacity兼容保持。
 * [OUTPUT]: 外观偏好合同与语义 token；状态背景复用12%颜色混合为不透明表面，供提示卡片/堆叠/关闭按钮共用；Soft 主操作跟随强调色并选择可读前景。
 * [POS]: shared/appearance，主进程与 Renderer 共用的外观真源。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { baseThemes, blend, type ThemePalette } from '@boai/tokens'
export { themeTokens } from '@boai/tokens'
import { applicationPlugins } from '../plugins/catalog'
import { APPLICATION_PLUGIN_API } from '../plugins/types'
import { typographyDefaults, type InterfaceFont, type TypographyPreferences } from './typography'
import { defaultAppIconId, type AppIconId } from './app-icons'
export { typographyControls, typographyDefaults, typographyFamilies, typographyRoles, typographyLineHeights, resolveTypography } from './typography'
export type { InterfaceFont, ContentFont, CodeFont, TypographyPreferences, TypographyGroup } from './typography'
export { appIconPresets, defaultAppIconId, isAppIconId } from './app-icons'
export type { AppIconId, AppIconStatus, TrayIconStatus } from './app-icons'
export type ColorMode = 'light' | 'dark'
export interface ThemeOverrides { accent: string | null; background: string | null; foreground: string | null }
export const zoomFactors = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const
export interface AppearancePreferences { schemaVersion: 2; mode: ColorMode | 'system'; themeIds: { light: string; dark: string }; background: { assetId: string | null; imageOpacity: number; glassOpacity: number | null; overlayOpacity: number; blurRadius: number }; typography: TypographyPreferences; appIconId: AppIconId; zoomFactor: number; customColors: Record<ColorMode, ThemeOverrides> }
export interface AppearanceSnapshot { preferences: AppearancePreferences; revision: number; sequence: number; resolvedMode: ColorMode; resolvedThemeId: string; diagnostic?: string; readOnly?: boolean }
export interface AppearancePatch { mode?: AppearancePreferences['mode']; themeIds?: Partial<AppearancePreferences['themeIds']>; background?: { imageOpacity?: number; glassOpacity?: number | null; overlayOpacity?: number; blurRadius?: number }; typography?: { [G in keyof TypographyPreferences]?: Partial<TypographyPreferences[G]> }; fontFamily?: InterfaceFont; appIconId?: AppIconId; zoomFactor?: number; customColors?: Partial<Record<ColorMode, Partial<ThemeOverrides>>> }
export const appearanceDefaults: AppearancePreferences = { schemaVersion: 2, mode: 'system', themeIds: { light: 'boai-light', dark: 'boai-dark' }, background: { assetId: null, imageOpacity: 1, glassOpacity: null, overlayOpacity: 0.4, blurRadius: 8 }, typography: typographyDefaults, appIconId: defaultAppIconId, zoomFactor: 1, customColors: { light: { accent: null, background: null, foreground: null }, dark: { accent: null, background: null, foreground: null } } }
export const defaultGlassOpacity = { light: 0.72, dark: 0.55, card: 0.72 } as const
export const maxBackgroundBlur = 32
export interface Theme extends ThemePalette { id: string; name: string }
const coreThemes: Theme[] = [
  { ...baseThemes.light, id: 'boai-light', name: 'BoAI 明亮' },
  { ...baseThemes.dark, id: 'boai-dark', name: 'BoAI 深色' },
]
export function availableThemes(disabledIds: readonly string[] = []): Theme[] {
  return [...coreThemes, ...applicationPlugins.filter(plugin => plugin.apiVersion === APPLICATION_PLUGIN_API && !disabledIds.includes(plugin.id)).flatMap(plugin => plugin.contributions.flatMap(item => item.type === 'theme' ? item.themes : []))]
}
export const themes = availableThemes()
export function resolveTheme(mode: ColorMode, id: string, disabledIds: readonly string[] = []) { return availableThemes(disabledIds).find(t => t.mode === mode && t.id === id) ?? coreThemes.find(t => t.id === `boai-${mode}`)! }
export function mergeAppearancePatch(a: AppearancePatch, b: AppearancePatch): AppearancePatch {
  return { ...a, ...b,
    ...(a.themeIds || b.themeIds ? { themeIds: { ...a.themeIds, ...b.themeIds } } : {}),
    ...(a.background || b.background ? { background: { ...a.background, ...b.background } as AppearancePatch['background'] } : {}),
    ...(a.typography || b.typography ? { typography: {
      ui: { ...a.typography?.ui, ...b.typography?.ui },
      content: { ...a.typography?.content, ...b.typography?.content },
      code: { ...a.typography?.code, ...b.typography?.code },
    } } : {}),
    ...(a.customColors || b.customColors ? { customColors: {
      light: { ...a.customColors?.light, ...b.customColors?.light },
      dark: { ...a.customColors?.dark, ...b.customColors?.dark },
    } } : {}),
  }
}
export function applyAppearancePatch(p: AppearancePreferences, patch: AppearancePatch): AppearancePreferences {
  const { fontFamily, ...rest } = patch
  return { ...p, ...rest,
    themeIds: { ...p.themeIds, ...patch.themeIds },
    background: { ...p.background, ...patch.background },
    typography: {
      ui: { ...p.typography.ui, ...patch.typography?.ui, ...(fontFamily ? { family: fontFamily } : {}) },
      content: { ...p.typography.content, ...patch.typography?.content },
      code: { ...p.typography.code, ...patch.typography?.code },
    },
    customColors: {
      light: { ...p.customColors.light, ...patch.customColors?.light },
      dark: { ...p.customColors.dark, ...patch.customColors?.dark },
    },
  }
}
export function customizeTheme(theme: Theme, overrides: ThemeOverrides): Theme {
  const foreground = overrides.foreground ?? theme.foreground, surface = overrides.background ?? theme.surface
  const changed = Boolean(overrides.foreground || overrides.background)
  return { ...theme, foreground, surface, accent: overrides.accent ?? theme.accent,
    background: overrides.background ? blend('#000000', surface, theme.mode === 'dark' ? 0.22 : 0.035) : theme.background,
    muted: changed ? blend(foreground, surface, 0.68) : theme.muted,
    border: changed ? blend(foreground, surface, theme.mode === 'dark' ? 0.16 : 0.1) : theme.border,
  }
}
/** Background images do not override the selected light/dark/system mode. */
export function resolveAppearanceMode(preferences: AppearancePreferences, systemMode: ColorMode): ColorMode {
  return preferences.mode === 'system' ? systemMode : preferences.mode
}
export function resolveAppearanceTheme(preferences: AppearancePreferences, mode: ColorMode, disabledIds: readonly string[] = []): Theme {
  const overrides = preferences.customColors[mode]
  // Scenic owns the glass and foreground; retain custom solid colors for removal.
  return customizeTheme(resolveTheme(mode, preferences.themeIds[mode], disabledIds), preferences.background.assetId
    ? { accent: overrides.accent, background: null, foreground: null }
    : overrides)
}
