/*
 * [INPUT]: Headless terminal parser callbacks for OSC colors and full terminal reset.
 * [OUTPUT]: Bounded program color overrides serialized with screen snapshots after history loss/reconnect.
 * [POS]: Terminal snapshot companion; application theme defaults remain renderer-owned.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { Terminal } from '@xterm/headless'

const paletteIndex = (value: string) => /^\d{1,3}$/u.test(value) && Number(value) < 256 ? Number(value) : undefined
const color = (value: string) => /^(?:rgb:[\da-f]{1,4}\/[\da-f]{1,4}\/[\da-f]{1,4}|#(?:[\da-f]{3}){1,4})$/iu.test(value)
const osc = (code: number, value = '') => `\x1b]${code};${value}\x07`

/** SerializeAddon stores cell attributes, but does not serialize mutable OSC colors. */
export class TerminalPalette {
  private readonly colors = new Map<number, string>()
  private readonly handlers: Array<{ dispose(): void }> = []

  constructor(terminal: Terminal) {
    const register = (code: number, handle: (value: string) => void) => {
      this.handlers.push(terminal.parser.registerOscHandler(code, value => {
        handle(value)
        // Preserve the headless terminal's normal handling and unique protocol replies.
        return false
      }))
    }
    register(4, value => {
      const parts = value.split(';')
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const index = paletteIndex(parts[i]!), value = parts[i + 1]!
        if (index !== undefined && color(value)) this.colors.set(index, value)
      }
    })
    register(104, value => {
      if (!value) { for (const key of this.colors.keys()) if (key < 256) this.colors.delete(key) }
      else for (const part of value.split(';')) {
        const index = paletteIndex(part)
        if (index !== undefined) this.colors.delete(index)
      }
    })
    for (let offset = 0; offset < 3; offset += 1) {
      register(10 + offset, value => {
        value.split(';').forEach((part, index) => {
          if (offset + index < 3 && color(part)) this.colors.set(256 + offset + index, part)
        })
      })
      register(110 + offset, () => { this.colors.delete(256 + offset) })
    }
    this.handlers.push(terminal.parser.registerEscHandler({ final: 'c' }, () => { this.colors.clear(); return false }))
  }

  serialize() {
    // Remove stale renderer overrides first, including resets that fell out of history.
    let result = osc(104) + osc(110) + osc(111) + osc(112)
    const indexed: string[] = []
    for (const [key, value] of this.colors) {
      if (key < 256) indexed.push(String(key), value)
      else result += osc(10 + key - 256, value)
    }
    // One palette update avoids 256 separate renderer theme invalidations on reconnect.
    if (indexed.length) result += osc(4, indexed.join(';'))
    return result
  }
  dispose() { for (const handler of this.handlers) handler.dispose(); this.colors.clear() }
}
