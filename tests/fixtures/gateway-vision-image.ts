/*
 * [INPUT]: Deterministic colored geometry; no text, metadata hints or remote assets.
 * [OUTPUT]: A valid RGB PNG whose left/right visual answer is known independently of model output.
 * [POS]: Gateway image-transport and actual vision acceptance fixture.
 * [PROTOCOL]: Update Header and fixtures/.folder.md when changing this oracle.
 */
import { deflateSync } from 'node:zlib'

export function gatewayVisionImage() {
  const width = 320, height = 160, pixels = Buffer.alloc(height * (1 + width * 3), 255)
  for (let y = 0; y < height; y++) {
    pixels[y * (1 + width * 3)] = 0
    for (let x = 0; x < width; x++) {
      const circle = (x - 80) ** 2 + (y - 80) ** 2 < 45 ** 2
      const square = x >= 195 && x < 285 && y >= 35 && y < 125
      if (circle || square) {
        const start = y * (1 + width * 3) + 1 + x * 3
        pixels.set(circle ? [0, 70, 240] : [235, 25, 30], start)
      }
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    let value = 0xffffffff
    for (const byte of body) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0) }
    crc.writeUInt32BE((value ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}
