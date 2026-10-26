/*
 * [INPUT]: The user's bobo CSS color snapshots and existing BOAI color utilities.
 * [OUTPUT]: Theme contributions and ANSI colors from one shared palette; opaque borders and contrast-adjusted text.
 * [POS]: Pure adapter for imported appearance data; no settings, DOM or source-project dependency.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { blend, contrast, type ThemePalette } from '@boai/tokens'
import snapshots from './imported-palettes.json' with { type: 'json' }

function readableText(color: string, backgrounds: string[], mode: string): string {
  const target = mode === 'dark' ? '#ffffff' : '#000000'
  for (let amount = 0; amount <= 100; amount++) {
    const adjusted = blend(target, color, amount / 100)
    if (backgrounds.every(background => contrast(adjusted, background) >= 4.5)) return adjusted
  }
  return target
}

export const importedThemes = snapshots.map(palette => {
  const c = palette.colors
  const backgrounds = [c.background, c.card]
  return {
    id: palette.id, name: palette.name, mode: palette.mode as ThemePalette['mode'],
    background: c.background, surface: c.card,
    foreground: readableText(c.foreground, backgrounds, palette.mode),
    muted: readableText(c['muted-foreground'], backgrounds, palette.mode),
    border: c.border.length === 9 ? blend(c.border.slice(0, 7), c.card, parseInt(c.border.slice(7), 16) / 255) : c.border,
    accent: c.primary,
  }
})

/** These CSS themes do not contain a native Base16 palette; reuse their color roles. */
export function importedTerminalColors(id: string | undefined, mode: ThemePalette['mode']): string[] | undefined {
  const palette = snapshots.find(value => value.id === id && value.mode === mode)
  if (!palette?.terminalColorKeys) return
  const c = palette.colors, colors: Record<string, string> = c
  const chromatic = palette.terminalColorKeys.map(key => colors[key]!)
  return [c['background-subtle'], ...chromatic, c.foreground, c['muted-foreground'], ...chromatic, c.foreground]
}
