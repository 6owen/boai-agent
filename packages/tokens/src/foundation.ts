/*
 * [INPUT]: 共享主题、Soft常量及排版注册表。
 * [OUTPUT]: 无DOM的完整默认变量和确定性CSS生成，支持嵌套明暗主题。
 * [POS]: @boai/tokens基础输出；构建产物不是另一份手写定义。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { baseThemes, themeTokens, type ColorMode } from './theme'
import { softTokens, darkSoftTokens } from './surfaces'
import { resolveTypography, typographyDefaults, type TypographyPreferences } from './typography'

export function typographyVariables(preferences: TypographyPreferences = typographyDefaults): Record<string, string> {
  const { families, sizes, lineHeights } = resolveTypography(preferences)
  return {
    '--font-ui-family': families.ui,
    '--font-content-family': families.content,
    '--font-code-family': families.code,
    '--font-mono': families.code,
    ...sizes,
    ...lineHeights,
  }
}

export function foundationVariables(mode: ColorMode = 'light'): Record<string, string> {
  const values = { ...themeTokens(baseThemes[mode]), ...softTokens, ...(mode === 'dark' ? darkSoftTokens : {}) }
  return { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key}`, value])), ...typographyVariables() }
}

export function foundationCss(): string {
  const declarations = (mode: ColorMode) => Object.entries(foundationVariables(mode))
    .map(([key, value]) => `  ${key}: ${value};`).join('\n')
  return `/* Generated from @boai/tokens. Edit src definitions, then rebuild. */\n:root, .light, [data-boai-theme="light"] {\n${declarations('light')}\n}\n.dark, [data-boai-theme="dark"] {\n${declarations('dark')}\n}\n`
}
