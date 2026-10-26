/*
 * [INPUT]: Imported bobo CSS palettes, vendored Base46, VS Code ANSI defaults and the effective application theme/mode.
 * [OUTPUT]: Matching imported/Base46/VS Code ANSI colors from the selected application palette, with the original BoAI fallback.
 * [POS]: Shared terminal appearance data; no xterm or shell dependency.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import base46 from './base46.json' with { type: 'json' }
import { importedTerminalColors } from './imported-palettes'

export const terminalAnsiNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const
// https://github.com/NvChad/base46/blob/7df2bd89295db00b649cbc49bdf6fe5a1cc5df3b/lua/base46/term.lua
const ansiKeys = ['base01', 'base08', 'base0B', 'base0A', 'base0D', 'base0E', 'base0C', 'base05', 'base03', 'base08', 'base0B', 'base0A', 'base0D', 'base0E', 'base0C', 'base07'] as const

const fallback = {
  dark: ['#25272d', '#ed8796', '#a6da95', '#eed49f', '#8aadf4', '#c6a0f6', '#8bd5ca', '#cad3f5', '#6e738d', '#f5a0ad', '#b7e5a7', '#f5dfb2', '#a2bbf7', '#d4b7fa', '#a5e1d8', '#f4f5f8'],
  light: ['#323640', '#b42336', '#2b6a35', '#896000', '#245db7', '#8150a6', '#186c76', '#6c7080', '#575d6b', '#c52f41', '#357b40', '#986c0b', '#316bc4', '#955bb9', '#247c88', '#e6e9ef'],
}

// VS Code Plus inherits these terminal defaults from VS Code (MIT).
// https://github.com/microsoft/vscode/blob/af3b54ddd0c4f81765fc218856e2e73491051092/src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts
const vscode = {
  dark: ['#000000', '#cd3131', '#0DBC79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#e5e5e5'],
  light: ['#000000', '#cd3131', '#107C10', '#949800', '#0451a5', '#bc05bc', '#0598bc', '#555555', '#666666', '#f14c4c', '#14CE14', '#b5ba00', '#3b8eea', '#d670d6', '#29b8db', '#a5a5a5'],
}

export function terminalAnsiPalette(id: string | undefined, mode: 'light' | 'dark'): Record<typeof terminalAnsiNames[number], string> {
  const colors = base46.find(palette => palette.id === id && palette.mode === mode)?.base_16
  const imported = importedTerminalColors(id, mode)
  const palette = id === `vscode-plus-${mode}` || id === `vscode-${mode}-modern` ? vscode[mode] : fallback[mode]
  return Object.fromEntries(terminalAnsiNames.map((name, index) => [name, imported?.[index] ?? (colors ? colors[ansiKeys[index]!] : palette[index]!)])) as Record<typeof terminalAnsiNames[number], string>
}
