/*
 * [INPUT]: Checked-in transparent avatar WebP files and resources/app-icons/manifest.json.
 * [OUTPUT]: 21 PNG app icons with a centered mascot on a full-size rounded color tile and the matching default macOS .icns.
 * [POS]: Explicit offline asset generation; build copies the generated results.
 * [PROTOCOL]: Update this Header and scripts/.folder.md when this file changes.
 */
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createCanvas, loadImage } from '@napi-rs/canvas'

if (process.platform !== 'darwin') throw new Error('macOS sips/iconutil is required to regenerate the icon assets.')
const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const target = join(root, 'resources/app-icons')
const source = join(root, 'src/renderer/assets/avatars')
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'))
const { canvasSize, artworkMaxSize, tileSize, tileCornerRadius } = manifest
if (canvasSize !== 1024 || !Number.isInteger(artworkMaxSize) || artworkMaxSize < 512 || artworkMaxSize > 900 ||
  !Number.isInteger(tileSize) || tileSize <= artworkMaxSize || tileSize > canvasSize ||
  !Number.isInteger(tileCornerRadius) || tileCornerRadius < 0 || tileCornerRadius > tileSize / 2) {
  throw new Error('Icon manifest needs a 1024px canvas, bounded mascot, and valid background tile.')
}

function visibleBounds(image) {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height).data
  let left = image.width, top = image.height, right = -1, bottom = -1
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (pixels[(y * image.width + x) * 4 + 3] < 16) continue
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) throw new Error('Icon source has no visible artwork.')
  // Keep the low-alpha fur and antialiased outline beyond the measured silhouette.
  const inset = 4
  left = Math.max(0, left - inset); top = Math.max(0, top - inset)
  right = Math.min(image.width - 1, right + inset); bottom = Math.min(image.height - 1, bottom + inset)
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function roundedTile(context, x, y, size, radius) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + size - radius, y)
  context.quadraticCurveTo(x + size, y, x + size, y + radius)
  context.lineTo(x + size, y + size - radius)
  context.quadraticCurveTo(x + size, y + size, x + size - radius, y + size)
  context.lineTo(x + radius, y + size)
  context.quadraticCurveTo(x, y + size, x, y + size - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

function renderIcon(image, bounds, pixels, background) {
  const canvas = createCanvas(pixels, pixels)
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const tile = pixels * tileSize / canvasSize
  const inset = (pixels - tile) / 2
  const radius = pixels * tileCornerRadius / canvasSize
  context.save()
  roundedTile(context, inset, inset, tile, radius)
  context.shadowColor = 'rgba(20, 25, 40, 0.18)'
  context.shadowBlur = pixels * 0.018
  context.shadowOffsetY = pixels * 0.012
  context.fillStyle = background
  context.fill()
  context.restore()
  roundedTile(context, inset, inset, tile, radius)
  const light = context.createLinearGradient(0, inset, 0, inset + tile)
  light.addColorStop(0, 'rgba(255, 255, 255, 0.24)')
  light.addColorStop(0.58, 'rgba(255, 255, 255, 0)')
  light.addColorStop(1, 'rgba(20, 25, 40, 0.05)')
  context.fillStyle = light
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  context.lineWidth = Math.max(1, pixels / 512)
  context.stroke()
  const maximum = pixels * artworkMaxSize / canvasSize
  const scale = Math.min(maximum / bounds.width, maximum / bounds.height)
  const width = bounds.width * scale, height = bounds.height * scale
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
    (pixels - width) / 2, (pixels - height) / 2, width, height)
  return canvas.toBuffer('image/png')
}

const temporary = await mkdtemp(join(tmpdir(), 'boai-icons-'))
try {
  await mkdir(target, { recursive: true })
  const ids = new Set()
  let defaultMaster
  for (const icon of manifest.icons) {
    if (!/^avatar-[a-z-]+$/.test(icon.id) || !/^[a-z-]+\.webp$/.test(icon.file) ||
      !/^#[0-9A-Fa-f]{6}$/.test(icon.background) || ids.has(icon.id)) throw new Error(`Invalid icon entry: ${icon.id}`)
    ids.add(icon.id)
    const input = join(source, icon.file)
    const output = join(target, `${icon.id}.png`)
    const image = await loadImage(input)
    const bounds = visibleBounds(image)
    await writeFile(output, renderIcon(image, bounds, 512, icon.background))
    if (icon.id === manifest.defaultId) defaultMaster = renderIcon(image, bounds, canvasSize, icon.background)
  }
  if (ids.size !== 21 || !ids.has(manifest.defaultId)) throw new Error('Icon manifest must contain all 21 avatar choices and its default.')
  const iconset = join(temporary, 'default.iconset')
  await mkdir(iconset)
  const master = join(temporary, 'default-1024.png')
  await writeFile(master, defaultMaster)
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
