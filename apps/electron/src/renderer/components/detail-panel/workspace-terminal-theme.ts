/*
 * [OUTPUT]: OSC 程序色解析及重置沿共享协议，渲染端负责应用默认主题及消费查询。
 * [INPUT]: BOAI当前应用主题/代码字号/行高/详情表面与终端OSC颜色指令。
 * [OUTPUT]: 应用主题/全局代码字号与字体，xterm原生1倍单元行高避免光标拉长；ANSI和程序OSC覆写保持。
 * [POS]: 工作区终端外观适配，不修改用户shell主题。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { ITheme, Terminal } from '@xterm/xterm'
import { TerminalProgramColors } from '@boai/shared/appearance/terminal-osc'

import { terminalAnsiNames as names, terminalAnsiPalette } from '@boai/shared/appearance'

/** Resolve the actual application colors, including custom colors and Scenic tokens. */
function resolvedColor(element: HTMLElement, variable: string, fallback: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${variable}, ${fallback})`
  element.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color || fallback
}

export function terminalAppearance(element: HTMLElement): { theme: ITheme; fontFamily: string; fontSize: number; lineHeight: number } {
  const style = getComputedStyle(element)
  const foreground = style.color || '#323640'
  const background = resolvedColor(element, '--surface-detail', '#ffffff')
  const selection = resolvedColor(element, '--selection', '#c8d8f4')
  const dark = document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'
  const fontSize = Number.parseFloat(style.fontSize) || 12
  return {
    theme: { ...terminalAnsiPalette(document.documentElement.dataset.themeId, dark ? 'dark' : 'light'), foreground, background, cursor: foreground, cursorAccent: background, selectionBackground: selection, selectionInactiveBackground: selection, selectionForeground: foreground },
    fontFamily: style.fontFamily || 'monospace', fontSize,
    // xterm multiplies the measured glyph cell, not the CSS font size. Applying
    // the prose line-height here stretches both terminal rows and the cursor.
    lineHeight: 1,
  }
}

export class WorkspaceTerminalTheme {
  private defaults: ITheme = {}
  private readonly colors: TerminalProgramColors

  constructor(private readonly terminal: Pick<Terminal, 'options' | 'parser'>) {
    // The headless host answers queries. A snapshot replay must not send a second reply.
    this.colors = new TerminalProgramColors(terminal.parser, { consumeOsc: true, changed: () => this.apply() })
  }
  update(theme: ITheme): void {
    if (Object.keys(theme).length === Object.keys(this.defaults).length && Object.entries(theme).every(([key, value]) => this.defaults[key as keyof ITheme] === value)) return
    this.defaults = theme
    this.apply()
  }
  dispose(): void { this.colors.dispose() }
  private apply(): void {
    const theme: ITheme = { ...this.defaults }
    for (const [key, { css: color }] of this.colors.entries()) {
      if (typeof key === 'string') theme[key] = color
      else if (key < 16) theme[names[key]!] = color
      else {
        theme.extendedAnsi ??= Array.from({ length: 240 }, (_, index) => {
          const n = index + 16
          const rgb = n >= 232 ? Array(3).fill(8 + (n - 232) * 10) as number[] : [Math.floor(index / 36), Math.floor(index / 6) % 6, index % 6].map(channel => channel === 0 ? 0 : 55 + channel * 40)
          return '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')
        })
        theme.extendedAnsi[key - 16] = color
      }
    }
    theme.cursorAccent = theme.background
    this.terminal.options.theme = theme
  }
}
