/*
 * [INPUT]: 宿主已经核对来源的提示词和临时图片data URL。
 * [OUTPUT]: 有界text或stream-json输入；严格base64/实际MIME/单件及总量核对，不降级丢弃图片或读取外部路径。
 * [POS]: Claude输入传输边界；原件授权、版本和持久记录仍归材料宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { MATERIAL_LIMITS } from '@boai/shared/domain/materials'
import { materialImageMimeType } from '@boai/shared/node/material-files'
import { CLAUDE_IMAGE_BYTES_LIMIT, CLAUDE_INPUT_LIMIT, CLAUDE_TEXT_INPUT_LIMIT } from './policy'

export function claudeInput(prompt: string, images: string[] = []) {
  if (Buffer.byteLength(prompt) > CLAUDE_TEXT_INPUT_LIMIT) throw new Error('Claude文字输入超过2MiB限制')
  if (!images.length) return { format: 'text', stdin: prompt }
  let bytes = 0, encodedBytes = Buffer.byteLength(prompt)
  const blocks = images.map(url => {
    const separator = url.indexOf(',')
    const mime = /^data:(image\/(?:png|jpeg|gif|webp));base64$/.exec(url.slice(0, separator))?.[1]
    if (!mime) throw new Error('Claude图片输入当前仅支持PNG、JPEG、GIF或WebP原件')
    const data = url.slice(separator + 1)
    if (data.length > Math.ceil(MATERIAL_LIMITS.attachmentBytes / 3) * 4) throw new Error('Claude单张图片超过20MiB限制')
    encodedBytes += data.length + 256
    if (encodedBytes > CLAUDE_INPUT_LIMIT) throw new Error('Claude本次图片输入总量过大，请减少本次上下文中的图片')
    const original = Buffer.from(data, 'base64')
    if (!data.length || original.toString('base64') !== data || materialImageMimeType(original) !== mime) throw new Error('Claude图片编码或原件格式不一致')
    if (original.length > MATERIAL_LIMITS.attachmentBytes) throw new Error('Claude单张图片超过20MiB限制')
    bytes += original.length
    if (bytes > CLAUDE_IMAGE_BYTES_LIMIT) throw new Error('Claude本次图片原件总量超过60MiB，请减少本次上下文中的图片')
    return { type: 'image', source: { type: 'base64', media_type: mime, data } }
  })
  const stdin = JSON.stringify({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: prompt }, ...blocks] } }) + '\n'
  if (Buffer.byteLength(stdin) > CLAUDE_INPUT_LIMIT) throw new Error('Claude本次图片输入总量过大，请减少本次上下文中的图片')
  return { format: 'stream-json', stdin }
}
