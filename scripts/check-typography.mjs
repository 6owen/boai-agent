/*
 * [INPUT]: BOAI Renderer CSS/TS/TSX and the shared typography resolver.
 * [OUTPUT]: Fails on newly scattered literal font sizes in Renderer source.
 * [POS]: Static guard for the centralized font-size contract.
 * [PROTOCOL]: Update this Header and scripts/.folder.md when this file changes.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = 'src/renderer'
const violations = []
const patterns = [
  /font-size\s*:\s*-?\d+(?:\.\d+)?(?:px|rem|em)\b/gi,
  /line-height\s*:\s*-?\d+(?:\.\d+)?(?:px|rem|em)\b/gi,
  /fontSize\s*[:=]\s*\d+(?:\.\d+)?\b/g,
  /text-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g,
  /leading-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g,
  /--(?:typeset-size|diffs-font-size)\s*:\s*\d+(?:\.\d+)?(?:px|rem|em)\b/g,
]
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) await walk(path)
    else if (/\.(css|ts|tsx)$/.test(item.name)) {
      const lines = (await readFile(path, 'utf8')).split('\n')
      for (let index = 0; index < lines.length; index++) {
        for (const pattern of patterns) {
          pattern.lastIndex = 0
          if (pattern.test(lines[index])) violations.push(`${path}:${index + 1}: ${lines[index].trim().slice(0, 180)}`)
        }
      }
    }
  }
}
await walk(root)
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`)
  process.exitCode = 1
} else process.stdout.write('Renderer font sizes use the shared typography roles.\n')
