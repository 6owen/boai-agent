/*
 * [INPUT]: 前端裁剪后的有界 PNG data URL。
 * [OUTPUT]: 宿主独立验证 PNG 块、CRC、256px 尺寸和可解码像素行。
 * [POS]: 个人资料图片的持久化入口；不读取任意文件或远程 URL。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { inflateSync } from 'node:zlib'
import { AVATAR_IMAGE_MAX_LENGTH } from '../../../shared/domain/avatars'

export function validateAvatarImage(dataUrl: string) {
  const invalid = () => { throw new Error('头像图片损坏，请重新选择并裁剪为 256 × 256 PNG。') }
  if (dataUrl.length > AVATAR_IMAGE_MAX_LENGTH || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) invalid()
  const bytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalid()
  let offset = 8, channels = 0, ended = false, sawData = false, closedData = false
  const parts: Buffer[] = []
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 8 + size
    if (end + 4 > bytes.length) invalid()
    const type = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, end)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(offset + 4, end)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end)) invalid()
    if (offset === 8 && type !== 'IHDR') invalid()
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13 || data.readUInt32BE(0) !== 256 || data.readUInt32BE(4) !== 256 || data[8] !== 8 || ![2, 6].includes(data[9]!) || data[10] || data[11] || data[12]) invalid()
      channels = data[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') { if (closedData) invalid(); sawData = true; parts.push(data) }
    else if (type === 'IEND') { if (size || !sawData) invalid(); ended = true; offset = end + 4; break }
    else { if (sawData) closedData = true; if (type[0] === type[0]?.toUpperCase() && type !== 'PLTE') invalid() }
    offset = end + 4
  }
  if (!ended || offset !== bytes.length || !channels) invalid()
  const stride = 256 * channels + 1
  let pixels: Buffer
  try { pixels = inflateSync(Buffer.concat(parts), { maxOutputLength: stride * 256 }) } catch { return invalid() }
  if (pixels.length !== stride * 256) invalid()
  for (let row = 0; row < 256; row++) if (pixels[row * stride]! > 4) invalid()
}
