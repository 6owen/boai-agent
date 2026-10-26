/*
 * [INPUT]: Catalog-resolved macOS .app bundle path, never a renderer-supplied target.
 * [OUTPUT]: Declared bundle ICNS converted to a bounded 64px PNG; missing/malformed icons stay optional and temporary files are removed.
 * [POS]: Workspace open-with icon reader; avoids Electron's generic .app file-type icon.
 * [PROTOCOL]: Update Header and main/.folder.md when changed.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
export async function readMacApplicationIcon(bundle: string): Promise<string | undefined> {
  let temporary: string | undefined
  try {
    const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')], { timeout: 3000, maxBuffer: 4096 })
    const declared = stdout.trim()
    if (!declared || declared !== basename(declared) || declared.includes('\\')) return
    const source = join(bundle, 'Contents', 'Resources', declared.endsWith('.icns') ? declared : `${declared}.icns`)
    const info = await stat(source)
    if (!info.isFile() || info.size > 16 * 1024 * 1024) return
    temporary = await mkdtemp(join(tmpdir(), 'boai-workspace-icon-'))
    const output = join(temporary, 'icon.png')
    await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', source, '--out', output], { timeout: 5000, maxBuffer: 4096 })
    const rendered = await stat(output)
    if (rendered.size > 96 * 1024) return
    const png = await readFile(output)
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return
    return `data:image/png;base64,${png.toString('base64')}`
  } catch { return undefined }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }) }
}
