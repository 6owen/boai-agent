/*
 * [OUTPUT]: 图标清单读取shared包真源，PNG/SVG输出目录保持resources。
 * [INPUT]: 应用图标manifest与手工绘制的22点SVG模板；既有canvas依赖。
 * [OUTPUT]: 离线生成22/44像素模板和可选审阅图，不修改Dock PNG或默认icns。
 * [POS]: 托盘资源生成入口；构建只复制已登记产物。
 * [PROTOCOL]: 修改同步Header和scripts/.folder.md。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
const args = Object.fromEntries(process.argv.slice(2).map(value => { const [key, ...rest] = value.replace(/^--/, '').split('='); return [key, rest.join('=')] }))
// Optional existing dependency root supports a docs worktree without installing or modifying another checkout.
const require = createRequire(args.dependencies ? resolve(args.dependencies) : import.meta.url)
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const root = resolve(import.meta.dirname, '..'), directory = join(root, 'resources/app-icons')
const manifest = JSON.parse(await readFile(join(root, 'packages/shared/src/appearance/app-icon-manifest.json'), 'utf8'))
const selected = args.only ? new Set(args.only.split(',')) : undefined
const icons = manifest.icons.filter(icon => !selected || selected.has(icon.id))
if (!icons.length || (selected && icons.length !== selected.size)) throw new Error('Unknown tray icon selection')
for (const icon of icons) {
  if (!icon.tray || !/^tray\/avatar-[a-z-]+\.svg$/.test(icon.tray.source)) throw new Error(`Missing tray source: ${icon.id}`)
  const svg = await readFile(join(directory, icon.tray.source), 'utf8')
  if (!svg.includes('viewBox="0 0 22 22"') || /<(script|image|foreignObject)\b/i.test(svg)) throw new Error(`Unsafe or invalid SVG: ${icon.id}`)
  for (const [size, name] of [[22, icon.tray.oneX], [44, icon.tray.twoX]]) {
    if (!/^tray\/avatar-[a-z-]+Template(?:@2x)?\.png$/.test(name)) throw new Error('Invalid output path')
    const canvas = createCanvas(size, size), context = canvas.getContext('2d')
    const image = await loadImage(Buffer.from(svg.replace('width="22" height="22"', `width="${size}" height="${size}"`)))
    context.drawImage(image, 0, 0, size, size)
    // Preserve antialias alpha; normalize all RGB channels to black for template rendering.
    const pixels = context.getImageData(0, 0, size, size)
    for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0
    context.putImageData(pixels, 0, 0)
    await writeFile(join(directory, name), canvas.toBuffer('image/png'))
  }
}
if (args.review) {
  const width = 840, height = 100 + icons.length * 86, canvas = createCanvas(width, height), context = canvas.getContext('2d')
  context.fillStyle = '#f4f4f5'; context.fillRect(0, 0, width, height)
  context.fillStyle = '#202024'; context.font = '16px sans-serif'; context.fillText('Tray templates: 22px / 44px / 3x inspection (not OS screenshots)', 24, 32)
  for (const [index, icon] of icons.entries()) {
    const y = 66 + index * 86
    context.fillStyle = '#202024'; context.font = '13px sans-serif'; context.fillText(icon.id, 24, y + 25)
    const image = await loadImage(join(directory, icon.tray.oneX)), retina = await loadImage(join(directory, icon.tray.twoX))
    context.drawImage(image, 240, y + 10); context.drawImage(retina, 300, y)
    context.drawImage(retina, 410, y, 66, 66)
    const dark = createCanvas(44, 44), dc = dark.getContext('2d'); dc.drawImage(retina, 0, 0); dc.globalCompositeOperation = 'source-in'; dc.fillStyle = '#fff'; dc.fillRect(0, 0, 44, 44)
    context.fillStyle = '#202024'; context.fillRect(520, y - 4, 70, 70); context.drawImage(dark, 533, y + 9)
  }
  await mkdir(resolve(args.review, '..'), { recursive: true }); await writeFile(args.review, canvas.toBuffer('image/png'))
}
console.log(`Generated ${icons.length} tray templates at 22px and 44px; Dock assets unchanged.`)
