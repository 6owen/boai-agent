/*
 * [INPUT]: User typography preferences shared by the desktop host and Renderer.
 * [OUTPUT]: One registry for font choices, size bounds, defaults and semantic sizes.
 * [POS]: Shared appearance typography source of truth.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
export const typographyFamilies = {
  ui: {
    geist: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  content: {
    ui: '',
    geist: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    serif: 'Georgia, "Songti SC", "Noto Serif CJK SC", serif',
  },
  code: {
    system: '"SFMono-Regular", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace',
    menlo: 'Menlo, "SFMono-Regular", Consolas, "Noto Sans Mono CJK SC", monospace',
  },
} as const

export type InterfaceFont = keyof typeof typographyFamilies.ui
export type ContentFont = keyof typeof typographyFamilies.content
export type CodeFont = keyof typeof typographyFamilies.code
export type TypographyGroup = 'ui' | 'content' | 'code'
export interface TypographyPreferences {
  ui: { family: InterfaceFont; sizePx: number }
  content: { family: ContentFont; sizePx: number }
  code: { family: CodeFont; sizePx: number }
}

export const typographyControls = {
  ui: { min: 10, max: 22, step: 1, defaultSize: 13, defaultFamily: 'geist' },
  content: { min: 10, max: 26, step: 1, defaultSize: 13, defaultFamily: 'ui' },
  code: { min: 10, max: 24, step: 1, defaultSize: 13, defaultFamily: 'system' },
} as const

export const typographyDefaults: TypographyPreferences = {
  ui: { family: typographyControls.ui.defaultFamily, sizePx: typographyControls.ui.defaultSize },
  content: { family: typographyControls.content.defaultFamily, sizePx: typographyControls.content.defaultSize },
  code: { family: typographyControls.code.defaultFamily, sizePx: typographyControls.code.defaultSize },
}

// Names describe hierarchy; ratios reproduce the current baseline. All hierarchy changes happen here.
export const typographyRoles = {
  ui: { previewMicro: 7.5 / 13, micro: 9 / 13, tiny: 10 / 13, caption: 11 / 13, secondary: 12 / 13, control: 12.5 / 13,
    body: 1, emphasis: 14 / 13, subheading: 15 / 13, heading: 16 / 13,
    title: 18 / 13, sectionTitle: 20 / 13, pageTitle: 22 / 13,
    displaySmall: 23 / 13, display: 24 / 13, glyph: 25 / 13,
    displayLarge: 26 / 13, hero: 28 / 13 },
  content: { caption: 11 / 13, secondary: 12 / 13, body: 1, lead: 14 / 13,
    heading6: 1, heading5: 14 / 13, heading4: 15 / 13,
    heading3: 16 / 13, heading2: 18 / 13, heading1: 24 / 13 },
  code: { compact: 11 / 13, terminal: 12 / 13, body: 1, heading: 14 / 13 },
} as const

// Unitless line heights grow with their role's font size and prevent large text from clipping.
export const typographyLineHeights = {
  ui: { tight: 1.25, compact: 1.35, body: 1.5, relaxed: 1.65 },
  content: { compact: 1.4, body: 1.65, heading: 1.3 },
  code: { body: 1.5 },
} as const

export function resolveTypography(preferences: TypographyPreferences) {
  const uiFamily = typographyFamilies.ui[preferences.ui.family]
  const families = {
    ui: uiFamily,
    content: preferences.content.family === 'ui' ? uiFamily : typographyFamilies.content[preferences.content.family],
    code: typographyFamilies.code[preferences.code.family],
  }
  const sizes = Object.fromEntries((Object.keys(typographyRoles) as TypographyGroup[]).flatMap(group =>
    Object.entries(typographyRoles[group]).map(([role, ratio]) => [`--text-${group}-${role}`, `${Math.round(preferences[group].sizePx * ratio * 1000) / 1000}px`])
  )) as Record<string, string>
  const lineHeights = Object.fromEntries((Object.keys(typographyLineHeights) as TypographyGroup[]).flatMap(group =>
    Object.entries(typographyLineHeights[group]).map(([role, ratio]) => [`--leading-${group}-${role}`, String(ratio)])
  )) as Record<string, string>
  return { families, sizes, lineHeights, terminalSizePx: preferences.code.sizePx * typographyRoles.code.terminal }
}
