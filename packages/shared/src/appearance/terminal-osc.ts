/*
 * [INPUT]: xterm parser registrations for indexed and special OSC colors and terminal reset.
 * [OUTPUT]: Bounded program palette with original wire spellings and normalized display colors.
 * [POS]: Shared protocol for the desktop terminal host and renderer. Only the host answers OSC queries.
 * [PROTOCOL]: Update this header and the appearance folder map when changing the wire contract.
 */
type Handler = { dispose(): void }
type Parser = {
  registerOscHandler(code: number, handle: (data: string) => boolean): Handler
  registerEscHandler(identifier: { final: string }, handle: () => boolean): Handler
}
const specialColors = ['foreground', 'background', 'cursor'] as const
type ColorIndex = number | typeof specialColors[number]
type Color = { readonly original: string; readonly css: string }

function paletteIndex(value: string) {
  return /^\d{1,3}$/u.test(value) && Number(value) < 256 ? Number(value) : undefined
}
const osc = (code: number, value = '') => `\x1b]${code};${value}\x07`

/** xterm's OSC syntax uses X11 channel widths. */
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

export class TerminalProgramColors {
  private readonly colors = new Map<ColorIndex, Color>()
  private readonly handlers: Handler[] = []

  constructor(parser: Parser, options: { consumeOsc: boolean; changed?(): void }) {
    const register = (code: number, handle: (value: string) => void) => {
      this.handlers.push(parser.registerOscHandler(code, value => {
        handle(value)
        options.changed?.()
        return options.consumeOsc
      }))
    }
    register(4, value => {
      const parts = value.split(';')
      for (let i = 0; i + 1 < parts.length; i += 2) this.set(paletteIndex(parts[i]!), parts[i + 1]!)
    })
    register(104, value => {
      if (!value) {
        for (const key of this.colors.keys()) if (typeof key === 'number') this.colors.delete(key)
      } else {
        for (const part of value.split(';')) {
          const index = paletteIndex(part)
          if (index !== undefined) this.colors.delete(index)
        }
      }
    })
    specialColors.forEach((key, offset) => {
      register(10 + offset, value => {
        value.split(';').forEach((part, index) => this.set(specialColors[offset + index], part))
      })
      register(110 + offset, () => { this.colors.delete(key) })
    })
    this.handlers.push(parser.registerEscHandler({ final: 'c' }, () => {
      this.colors.clear()
      options.changed?.()
      return false
    }))
  }

  private set(index: ColorIndex | undefined, original: string) {
    if (index === undefined) return
    const css = parseTerminalColor(original)
    if (css) this.colors.set(index, { original, css })
  }

  entries() { return this.colors.entries() }

  /** SerializeAddon omits mutable OSC colors. Clear stale overrides before replaying the current ones. */
  serialize(): string {
    let result = osc(104) + osc(110) + osc(111) + osc(112)
    const indexed: string[] = []
    for (const [key, color] of this.colors) {
      if (typeof key === 'number') indexed.push(String(key), color.original)
      else result += osc(10 + specialColors.indexOf(key), color.original)
    }
    if (indexed.length) result += osc(4, indexed.join(';'))
    return result
  }

  dispose() {
    for (const handler of this.handlers) handler.dispose()
    this.colors.clear()
  }
}
