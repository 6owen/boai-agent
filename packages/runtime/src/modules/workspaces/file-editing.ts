/*
 * [OUTPUT]: 2026-11-24 第三阶段：文件读写/搜索/编辑由官方 Workspace 维护；仅保留业务路径、文本测量和发布校验。
 * [INPUT]: 本轮实际读取的 UTF-8 文件、分页范围、内容 hash 与明确替换文本。
 * [OUTPUT]: 本地数据源分页、严格解码和业务原件hash；Workspace编辑与阅读基线归SDK。
 * [POS]: 业务数据源字节兼容；不实现Agent文件编辑策略。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createHash } from 'node:crypto'

export const MAX_FILE_PAGE_CHARACTERS = 48_000
export const fileContentHash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')

/** Strict decoding avoids writing replacement characters back over an original file. Keep BOM/CRLF verbatim. */
export function decodeWorkspaceText(bytes: Uint8Array): string {
  try {
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (content.includes('\0')) throw new Error('binary')
    return content
  } catch { throw new Error('File is not UTF-8 text; use a tool for its actual format. The file was not modified.') }
}

export function readFilePage(content: string, offset = 0, limit = MAX_FILE_PAGE_CHARACTERS) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_FILE_PAGE_CHARACTERS) throw new Error('Invalid file page offset or limit')
  const characters = Array.from(content)
  if (offset > characters.length) throw new Error('File page offset is past the end; re-read from offset 0')
  const end = Math.min(characters.length, offset + limit)
  return { content: characters.slice(offset, end).join(''), offset, nextOffset: end < characters.length ? end : null,
    totalCharacters: characters.length, truncated: offset > 0 || end < characters.length, contentHash: fileContentHash(content) }
}
