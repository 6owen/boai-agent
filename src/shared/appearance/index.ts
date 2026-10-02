/*
 * [INPUT]: Base46 色板、显示模式与外观偏好。
 * [OUTPUT]: 外观偏好合同与语义 token；状态背景复用12%颜色混合为不透明表面，供提示卡片/堆叠/关闭按钮共用；Soft 主操作跟随强调色并选择可读前景。
 * [POS]: shared/appearance，主进程与 Renderer 共用的外观真源。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import palettes from './base46.json'
export type ColorMode = 'light' | 'dark'
export type InterfaceFont = 'system' | 'geist'
export interface ThemeOverrides { accent: string | null; background: string | null; foreground: string | null }
export const zoomFactors = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const
export const interfaceFonts: Record<InterfaceFont, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  geist: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
}
export interface AppearancePreferences { schemaVersion: 1; mode: ColorMode | 'system'; themeIds: { light: string; dark: string }; background: { assetId: string | null; imageOpacity: number }; fontFamily: InterfaceFont; zoomFactor: number; customColors: Record<ColorMode, ThemeOverrides> }
export interface AppearanceSnapshot { preferences: AppearancePreferences; revision: number; sequence: number; resolvedMode: ColorMode; resolvedThemeId: string; diagnostic?: string; readOnly?: boolean }
export interface AppearancePatch { mode?: AppearancePreferences['mode']; themeIds?: Partial<AppearancePreferences['themeIds']>; background?: { imageOpacity: number }; fontFamily?: InterfaceFont; zoomFactor?: number; customColors?: Partial<Record<ColorMode, Partial<ThemeOverrides>>> }
export const appearanceDefaults: AppearancePreferences = { schemaVersion: 1, mode: 'system', themeIds: { light: 'boai-light', dark: 'boai-dark' }, background: { assetId: null, imageOpacity: 0.2 }, fontFamily: 'geist', zoomFactor: 1, customColors: { light: { accent: null, background: null, foreground: null }, dark: { accent: null, background: null, foreground: null } } }
export interface Theme { id: string; name: string; mode: ColorMode; background: string; surface: string; foreground: string; muted: string; border: string; accent: string }
export const themes: Theme[] = [
  { id: 'boai-light', name: 'BoAI 明亮', mode: 'light', background: '#f6f6f6', surface: '#ffffff', foreground: '#0d0d0d', muted: '#5d5d5d', border: '#e5e5e5', accent: '#2563eb' },
  { id: 'boai-dark', name: 'BoAI 深色', mode: 'dark', background: '#171717', surface: '#212121', foreground: '#ffffff', muted: '#cdcdcd', border: '#3d3d3d', accent: '#93b8ff' },
  { id: 'vscode-plus-light', name: 'VS Code Plus', mode: 'light', background: '#f6f6f6', surface: '#ffffff', foreground: '#000000', muted: '#606060', border: '#eaeaea', accent: '#007acc' },
  { id: 'vscode-plus-dark', name: 'VS Code Plus', mode: 'dark', background: '#181818', surface: '#1e1e1e', foreground: '#cccccc', muted: '#b0b0b0', border: '#3c3c3c', accent: '#4daafc' },
  ...palettes.map(p => ({ id: p.id, name: p.id === 'nord' ? 'Nord' : p.mode === 'light' ? 'Catppuccin Latte' : 'Catppuccin Mocha', mode: p.mode as ColorMode, background: p.base_16.base00, surface: p.base_16.base01, foreground: p.base_16.base05, muted: p.base_16.base05, border: p.base_16.base03, accent: p.base_16.base0D })),
]
export function resolveTheme(mode: ColorMode, id: string) { return themes.find(t => t.mode === mode && t.id === id) ?? themes.find(t => t.id === `boai-${mode}`)! }
function contrast(a:string,b:string){const luminance=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
function blend(foreground: string, background: string, amount: number) {
  return '#' + [1, 3, 5].map(offset => {
    const front = parseInt(foreground.slice(offset, offset + 2), 16)
    const back = parseInt(background.slice(offset, offset + 2), 16)
    return Math.round(back + (front - back) * amount).toString(16).padStart(2, '0')
  }).join('')
}
export function mergeAppearancePatch(a: AppearancePatch, b: AppearancePatch): AppearancePatch {
  return { ...a, ...b,
    ...(a.themeIds || b.themeIds ? { themeIds: { ...a.themeIds, ...b.themeIds } } : {}),
    ...(a.background || b.background ? { background: { ...a.background, ...b.background } as AppearancePatch['background'] } : {}),
    ...(a.customColors || b.customColors ? { customColors: {
      light: { ...a.customColors?.light, ...b.customColors?.light },
      dark: { ...a.customColors?.dark, ...b.customColors?.dark },
    } } : {}),
  }
}
export function applyAppearancePatch(p: AppearancePreferences, patch: AppearancePatch): AppearancePreferences {
  return { ...p, ...patch,
    themeIds: { ...p.themeIds, ...patch.themeIds },
    background: { ...p.background, ...patch.background },
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
export function themeTokens(theme: Theme): Record<string,string> {
  const { mode, background: bg, surface, foreground: fg, muted, border, accent } = theme
  const dark = mode === 'dark'
  const hover = blend(fg, surface, dark ? 0.07 : 0.04)
  const selected = blend(fg, surface, dark ? 0.12 : 0.092)
  const destructive = dark ? '#ffb4ac' : '#a52826', success = dark ? '#b0dba2' : '#326a2b', warning = dark ? '#efce8b' : '#805817'
  const statusBackgroundOpacity = 0.12
  return {
    background: bg, foreground: fg,
    card: surface, 'card-foreground': fg, popover: surface, 'popover-foreground': fg,
    primary: accent, 'primary-foreground': contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#ffffff' : '#111111',
    secondary: hover, 'secondary-foreground': fg,
    muted: hover, 'muted-foreground': muted,
    accent: hover, 'accent-foreground': fg, border, input: border, ring: accent,
    destructive, 'destructive-foreground': dark ? '#111111' : '#ffffff', success, warning,
    'destructive-background': blend(destructive, surface, statusBackgroundOpacity),
    'success-background': blend(success, surface, statusBackgroundOpacity),
    'warning-background': blend(warning, surface, statusBackgroundOpacity),
    'info-background': blend(accent, surface, statusBackgroundOpacity),
    'status-background': blend(accent, surface, 0.08),
    'surface-app': bg, 'surface-list': dark ? bg : blend(fg, surface, 0.016), 'surface-content': surface, 'surface-detail': surface,
    'surface-composer': dark ? hover : surface, 'surface-user-message': hover,
    'frame-border': dark ? border : blend(fg, surface, 0.07), 'sidebar-label': blend(fg, surface, dark ? 0.62 : 0.38), 'rail-foreground': blend(fg, bg, dark ? 0.65 : 0.5),
    sidebar: bg, 'sidebar-foreground': fg, 'sidebar-accent': selected,
    'sidebar-border': border, 'sidebar-ring': accent,
    'code-background': hover, 'code-foreground': fg, selection: selected,
    link: Math.min(contrast(accent, surface), contrast(accent, bg)) >= 4.5 ? accent : fg,
    shadow: dark ? '#00000033' : '#0000000a',
  }
}
