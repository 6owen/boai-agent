/*
 * [INPUT]: Explicit manifest paths and bounded 22/44px local PNGs.
 * [OUTPUT]: Decoded 1x/2x macOS template image; missing/invalid assets reject before touching a live Tray.
 * [POS]: Tray asset loader; no preference owner or Tray creation.
 * [PROTOCOL]: Update this Header and apps/electron/src/main/.folder.md when this file changes.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import { appIconTrayAssets, type AppIconId } from '@boai/shared/appearance/app-icons'

function png(root: string, name: string, size: number) {
  if (!/^tray\/avatar-[a-z-]+Template(?:@2x)?\.png$/.test(name)) throw new Error('托盘图标路径无效。')
  const path = join(root, name)
  if (statSync(path).size > 65_536) throw new Error('托盘图标文件过大。')
  const bytes = readFileSync(path)
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error('托盘图标格式或尺寸不正确。')
  const decoded = nativeImage.createFromBuffer(bytes)
  if (decoded.isEmpty() || decoded.getSize().width !== size || decoded.getSize().height !== size) throw new Error('托盘图标无法解码。')
  return bytes
}
export function loadTrayIcon(root: string, id: AppIconId) {
  const paths = appIconTrayAssets(id), one = png(root, paths.oneX, 22), two = png(root, paths.twoX, 44)
  const image = nativeImage.createFromBuffer(one, { scaleFactor: 1 })
  image.addRepresentation({ scaleFactor: 2, dataURL: `data:image/png;base64,${two.toString('base64')}` })
  image.setTemplateImage(true)
  return image
}
