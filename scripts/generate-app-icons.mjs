/*
 * [INPUT]: Checked-in transparent avatar WebP files and resources/app-icons/manifest.json.
 * [OUTPUT]: 21 transparent PNG app icons and the default macOS .icns.
 * [POS]: Explicit offline asset generation; build copies the generated results.
 * [PROTOCOL]: Update this Header and scripts/.folder.md when this file changes.
 */
import { readFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

if (process.platform !== 'darwin') throw new Error('macOS sips/iconutil is required to regenerate the icon assets.')
const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const target = join(root, 'resources/app-icons')
const source = join(root, 'src/renderer/assets/avatars')
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'))
const temporary = await mkdtemp(join(tmpdir(), 'boai-icons-'))
try {
  await mkdir(target, { recursive: true })
  const ids = new Set()
  for (const icon of manifest.icons) {
    if (!/^avatar-[a-z-]+$/.test(icon.id) || !/^[a-z-]+\.webp$/.test(icon.file) || ids.has(icon.id)) throw new Error(`Invalid icon entry: ${icon.id}`)
    ids.add(icon.id)
    const input = join(source, icon.file)
    const output = join(target, `${icon.id}.png`)
    await run('/usr/bin/sips', ['-s', 'format', 'png', '--resampleHeightWidth', '512', '512', input, '--out', output])
  }
  if (ids.size !== 21 || !ids.has(manifest.defaultId)) throw new Error('Icon manifest must contain all 21 avatar choices and its default.')
  const iconset = join(temporary, 'default.iconset')
  await mkdir(iconset)
  const master = join(temporary, 'default-1024.png')
  const defaultIcon = manifest.icons.find(icon => icon.id === manifest.defaultId)
  await run('/usr/bin/sips', ['-s', 'format', 'png', '--resampleHeightWidth', '1024', '1024', join(source, defaultIcon.file), '--out', master])
  for (const point of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = point * scale
      const name = `icon_${point}x${point}${scale === 2 ? '@2x' : ''}.png`
      if (pixels === 1024) await copyFile(master, join(iconset, name))
      else await run('/usr/bin/sips', ['--resampleHeightWidth', String(pixels), String(pixels), master, '--out', join(iconset, name)])
    }
  }
  await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(target, 'default.icns')])
  process.stdout.write(`Generated ${ids.size} PNG icons and default.icns\n`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
