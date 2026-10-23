/*
 * [INPUT]: 实际21款manifest/PNG/SVG和生产NativeImage装配器。
 * [OUTPUT]: 全映射、两分辨率、黑色/alpha/边缘与孔洞、缺图/损坏及模板scale装配回归。
 * [POS]: 离线图标素材与加载合同；真实菜单栏观感需另行验收。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdtemp, mkdir, copyFile, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import manifest from '../resources/app-icons/manifest.json'
import { appIconPresets } from '../src/shared/appearance/app-icons'
import { loadTrayIcon } from '../src/main/tray-icon'
const fake = vi.hoisted(() => ({ empty: false, representations: [] as Array<{ scaleFactor: number; dataURL: string }>, templates: [] as boolean[] }))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: (bytes: Buffer) => ({ isEmpty: () => fake.empty, getSize: () => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }), addRepresentation(value: { scaleFactor: number; dataURL: string }) { fake.representations.push(value) }, setTemplateImage(value: boolean) { fake.templates.push(value) } }) } }))
const directory = resolve('resources/app-icons'), roots: string[] = []
afterEach(async () => { fake.empty = false; fake.representations.length = 0; fake.templates.length = 0; await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

test('21项实际角色有唯一模板映射，PNG两尺寸有透明留白且仅黑色/alpha', async () => {
  expect(manifest.icons.map(icon => icon.id)).toEqual(appIconPresets.map(icon => icon.id))
  expect(manifest.icons).toHaveLength(21)
  const hashes = new Set<string>()
  for (const icon of manifest.icons) {
    expect(await readFile(join(directory, icon.tray.source), 'utf8')).toContain('viewBox="0 0 22 22"')
    for (const [size, path] of [[22, icon.tray.oneX], [44, icon.tray.twoX]] as const) {
      const bytes = await readFile(join(directory, path)), image = await loadImage(bytes)
      expect([image.width, image.height], icon.id).toEqual([size, size])
      const canvas = createCanvas(size, size), context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, size, size).data
      let ink = 0, clear = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4, alpha = data[index + 3]
        expect(data[index] + data[index + 1] + data[index + 2], `${icon.id} RGB`).toBe(0)
        if (alpha) ink++; else clear++
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) expect(alpha, `${icon.id} inset`).toBe(0)
      }
      expect(ink).toBeGreaterThan(20); expect(clear).toBeGreaterThan(size * size / 3)
      if (size === 22) hashes.add(createHash('sha256').update(bytes).digest('hex'))
      if (icon.id === 'avatar-mint-ring') expect(data[((size === 22 ? 13 : 26) * size + size / 2) * 4 + 3]).toBe(0)
    }
  }
  expect(hashes.size).toBe(21)
})
test('生产加载器按1x/2x显式装配并设置模板模式', () => {
  loadTrayIcon(directory, 'avatar-cat')
  expect(fake.representations).toHaveLength(1); expect(fake.representations[0].scaleFactor).toBe(2)
  const bytes = Buffer.from(fake.representations[0].dataURL.split(',')[1], 'base64')
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([44, 44]); expect(fake.templates).toEqual([true])
})
test('缺图、无效PNG、错误尺寸或解码失败在返回图像前拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-tray-assets-')); roots.push(root); await mkdir(join(root, 'tray'))
  expect(() => loadTrayIcon(root, 'avatar-cat')).toThrow()
  const entry = manifest.icons.find(icon => icon.id === 'avatar-cat')!
  await copyFile(join(directory, entry.tray.oneX), join(root, entry.tray.oneX))
  await writeFile(join(root, entry.tray.twoX), 'not a png'); expect(() => loadTrayIcon(root, 'avatar-cat')).toThrow('格式')
  await copyFile(join(directory, entry.tray.oneX), join(root, entry.tray.twoX)); expect(() => loadTrayIcon(root, 'avatar-cat')).toThrow('尺寸')
  await copyFile(join(directory, entry.tray.twoX), join(root, entry.tray.twoX)); fake.empty = true
  expect(() => loadTrayIcon(root, 'avatar-cat')).toThrow('解码'); expect(fake.templates).toEqual([])
})
