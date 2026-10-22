/*
 * [INPUT]: BOAI既有保底主题和颜色运算。
 * [OUTPUT]: 纯语义配色、对比度与混色；不依赖插件或偏好存储。
 * [POS]: @boai/tokens主题定义。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
export type ColorMode = 'light' | 'dark'
export interface ThemePalette { mode: ColorMode; background: string; surface: string; foreground: string; muted: string; border: string; accent: string }
export const baseThemes = {
  light: { mode: 'light', background: '#f6f6f6', surface: '#ffffff', foreground: '#0d0d0d', muted: '#5d5d5d', border: '#e5e5e5', accent: '#2563eb' },
  dark: { mode: 'dark', background: '#171717', surface: '#212121', foreground: '#ffffff', muted: '#cdcdcd', border: '#3d3d3d', accent: '#93b8ff' },
} satisfies Record<ColorMode, ThemePalette>

export function contrast(a:string,b:string){const luminance=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722};const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
export function blend(foreground: string, background: string, amount: number) {
  return '#' + [1, 3, 5].map(offset => {
    const front = parseInt(foreground.slice(offset, offset + 2), 16)
    const back = parseInt(background.slice(offset, offset + 2), 16)
    return Math.round(back + (front - back) * amount).toString(16).padStart(2, '0')
  }).join('')
}
export function themeTokens(theme: ThemePalette): Record<string,string> {
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
