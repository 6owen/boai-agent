/*
 * [INPUT]: BOAI代码字号/行高/详情表面与终端OSC颜色指令。
 * [OUTPUT]: 明暗ANSI色板、选择/光标对比与保留程序覆写的主题更新/重置；查询由宿主唯一回答。
 * [POS]: 工作区终端外观适配，不修改用户shell主题。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import type { ITheme, Terminal } from '@xterm/xterm'

const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const
const darkPalette = ['#25272d', '#ed8796', '#a6da95', '#eed49f', '#8aadf4', '#c6a0f6', '#8bd5ca', '#cad3f5', '#6e738d', '#f5a0ad', '#b7e5a7', '#f5dfb2', '#a2bbf7', '#d4b7fa', '#a5e1d8', '#f4f5f8']
const lightPalette = ['#323640', '#b42336', '#2b6a35', '#896000', '#245db7', '#8150a6', '#186c76', '#6c7080', '#575d6b', '#c52f41', '#357b40', '#986c0b', '#316bc4', '#955bb9', '#247c88', '#e6e9ef']

/** Resolve CSS variables through the browser, including color-mix/oklch tokens. */
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
  const lineHeight = Number.parseFloat(style.lineHeight)
  return {
    theme: { ...Object.fromEntries(names.map((name, index) => [name, (dark ? darkPalette : lightPalette)[index]])), foreground, background, cursor: foreground, cursorAccent: background, selectionBackground: selection, selectionInactiveBackground: selection, selectionForeground: foreground },
    fontFamily: style.fontFamily || 'monospace', fontSize,
    lineHeight: Number.isFinite(lineHeight) ? Math.max(1, lineHeight / fontSize) : 1.5,
  }
}

/** xterm's OSC syntax uses X11 channel widths, rather than CSS short hashes. */
export function parseTerminalColor(value: string): string | undefined {
  const scaled = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/iu.exec(value)
  let channels: string[]
  if (scaled) channels = scaled.slice(1)
  else {
    if (!/^#(?:[\da-f]{3}){1,4}$/iu.test(value)) return
    const width = (value.length - 1) / 3
    channels = Array.from({ length: 3 }, (_, index) => value.slice(1 + index * width, 1 + (index + 1) * width))
  }
  return '#' + channels.map(channel => {
    const number = scaled ? Math.round(parseInt(channel, 16) * 255 / (16 ** channel.length - 1)) : parseInt(channel.padEnd(2, '0').slice(0, 2), 16)
    return number.toString(16).padStart(2, '0')
  }).join('')
}

const specialColors = ['foreground', 'background', 'cursor'] as const
export class WorkspaceTerminalTheme {
  private defaults: ITheme = {}
  private overrides = new Map<number | (typeof specialColors)[number], string>()
  private handlers: Array<{ dispose(): void }> = []
  constructor(private readonly terminal: Pick<Terminal, 'options' | 'parser'>) {
    const register = (code: number, handle: (value: string) => void) => {
      this.handlers.push(terminal.parser.registerOscHandler(code, data => {
        handle(data)
        this.apply()
        // The host headless terminal answers queries once. Consuming renderer
        // OSC also prevents a replayed snapshot from injecting a second reply.
        return true
      }))
    }
    register(4, value => {
      const parts = value.split(';')
      for (let index = 0; index + 1 < parts.length; index += 2) {
        const entry = this.paletteIndex(parts[index]!)
        const color = parseTerminalColor(parts[index + 1]!)
        if (entry !== undefined && color) this.overrides.set(entry, color)
      }
    })
    register(104, value => {
      if (!value) { for (const key of this.overrides.keys()) if (typeof key === 'number') this.overrides.delete(key) }
      else for (const part of value.split(';')) {
        const entry = this.paletteIndex(part)
        if (entry !== undefined) this.overrides.delete(entry)
      }
    })
    specialColors.forEach((key, offset) => {
      register(10 + offset, value => {
        value.split(';').forEach((part, index) => {
          const target = specialColors[offset + index], color = parseTerminalColor(part)
          if (target && color) this.overrides.set(target, color)
        })
      })
      register(110 + offset, () => this.overrides.delete(key))
    })
    this.handlers.push(terminal.parser.registerEscHandler({ final: 'c' }, () => { this.overrides.clear(); this.apply(); return false }))
  }
  update(theme: ITheme): void {
    if (Object.keys(theme).length === Object.keys(this.defaults).length && Object.entries(theme).every(([key, value]) => this.defaults[key as keyof ITheme] === value)) return
    this.defaults = theme
    this.apply()
  }
  dispose(): void { this.handlers.forEach(handler => handler.dispose()) }
  private paletteIndex(value: string): number | undefined { return /^\d{1,3}$/u.test(value) && Number(value) < 256 ? Number(value) : undefined }
  private apply(): void {
    const theme: ITheme = { ...this.defaults }
    for (const [key, color] of this.overrides) {
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
