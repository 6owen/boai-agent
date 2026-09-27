import palettes from './base46.json'
export type ColorMode = 'light' | 'dark'
export interface AppearancePreferences { schemaVersion: 1; mode: ColorMode | 'system'; themeIds: { light: string; dark: string }; background: { assetId: string | null; imageOpacity: number } }
export interface AppearanceSnapshot { preferences: AppearancePreferences; revision: number; sequence: number; resolvedMode: ColorMode; resolvedThemeId: string; diagnostic?: string; readOnly?: boolean }
export interface AppearancePatch { mode?: AppearancePreferences['mode']; themeIds?: Partial<AppearancePreferences['themeIds']>; background?: { imageOpacity: number } }
export const appearanceDefaults: AppearancePreferences = { schemaVersion: 1, mode: 'system', themeIds: { light: 'boai-light', dark: 'boai-dark' }, background: { assetId: null, imageOpacity: 0.2 } }
export interface Theme { id: string; name: string; mode: ColorMode; background: string; surface: string; foreground: string; muted: string; border: string; accent: string }
export const themes: Theme[] = [
  { id: 'boai-light', name: 'BoAI 明亮', mode: 'light', background: '#f4f4f4', surface: '#ffffff', foreground: '#242424', muted: '#656565', border: '#d7d7d7', accent: '#285eb0' },
  { id: 'boai-dark', name: 'BoAI 深色', mode: 'dark', background: '#191b20', surface: '#22252b', foreground: '#edf0f5', muted: '#b9c0cb', border: '#474e59', accent: '#a9caff' },
  ...palettes.map(p => ({ id: p.id, name: p.id === 'nord' ? 'Nord' : p.mode === 'light' ? 'Catppuccin Latte' : 'Catppuccin Mocha', mode: p.mode as ColorMode, background: p.base_16.base00, surface: p.base_16.base01, foreground: p.base_16.base05, muted: p.base_16.base05, border: p.base_16.base03, accent: p.base_16.base0D })),
]
export function resolveTheme(mode: ColorMode, id: string) { return themes.find(t => t.mode === mode && t.id === id) ?? themes.find(t => t.id === `boai-${mode}`)! }
function contrast(a:string,b:string){const luminance=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
export function themeTokens(theme: Theme): Record<string,string> {
 const { mode, background: bg, surface, foreground: fg, muted, border, accent } = theme
 const dark = mode === 'dark'
 return { background: bg, foreground: fg, card: surface, 'card-foreground': fg, popover: surface, 'popover-foreground': fg, primary: fg, 'primary-foreground': bg, secondary: bg, 'secondary-foreground': fg, muted: bg, 'muted-foreground': muted, accent: `color-mix(in srgb, ${accent} 15%, ${surface})`, 'accent-foreground': fg, border, input: border, ring: accent, destructive: dark ? '#ffb4ac' : '#a52826', success: dark ? '#b0dba2' : '#326a2b', warning: dark ? '#efce8b' : '#805817', 'status-background': `color-mix(in srgb, ${accent} 8%, ${surface})`, 'surface-app': bg, 'surface-list': surface, 'surface-content': surface, 'surface-detail': surface, sidebar: bg, 'sidebar-foreground': fg, 'sidebar-accent': surface, 'sidebar-border': border, 'sidebar-ring': accent, 'code-background': bg, 'code-foreground': fg, selection: `color-mix(in srgb, ${accent} 22%, ${surface})`, link: Math.min(contrast(accent,surface),contrast(accent,bg))>=4.5?accent:fg, shadow: '#0003' }
}
