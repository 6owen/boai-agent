/*
 * [INPUT]: 本轮实际读取的 UTF-8 文件、分页范围、内容 hash 与明确替换文本。
 * [OUTPUT]: 可续读页面、完整阅读基线和精确修改；拒绝局部阅读整份覆盖、过期或歧义修改。
 * [POS]: BOAI 文件工具策略；移植 Hermes 的完整阅读/过期检查与精确匹配语义，来源见 hermes/source-manifest.json。
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

interface ReadBaseline { hash: string; total: number; ranges: [number, number][] }
/** Per execution; only successful full reads or this execution's own writes authorize a whole-file overwrite. */
export class FileReadBaselines {
  private readonly files = new Map<string, ReadBaseline>()

  read(target: string, page: ReturnType<typeof readFilePage>) {
    let baseline = this.files.get(target)
    if (!baseline || baseline.hash !== page.contentHash) baseline = { hash: page.contentHash, total: page.totalCharacters, ranges: [] }
    const ranges = [...baseline.ranges, [page.offset, page.nextOffset ?? page.totalCharacters] as [number, number]].sort((a, b) => a[0] - b[0])
    baseline.ranges = []
    for (const range of ranges) {
      const last = baseline.ranges.at(-1)
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else baseline.ranges.push([...range])
    }
    this.files.set(target, baseline)
  }

  wrote(target: string, content: string, complete = true) {
    const total = Array.from(content).length
    this.files.set(target, { hash: fileContentHash(content), total, ranges: complete ? [[0, total]] : [] })
  }

  hasFullRead(target: string) {
    const baseline = this.files.get(target)
    return !!baseline && baseline.ranges.length === 1 && baseline.ranges[0][0] === 0 && baseline.ranges[0][1] === baseline.total
  }

  assertCurrent(target: string, current: string, wholeFile: boolean) {
    const baseline = this.files.get(target)
    if (!baseline) throw new Error('Existing file has not been read in this execution. Use read_file before modifying it.')
    if (baseline.hash !== fileContentHash(current)) throw new Error('File changed since it was read. Re-read the current file and merge the changes; the file was not modified.')
    if (wholeFile && !this.hasFullRead(target)) throw new Error('Only part of this file was read. Follow read_file nextOffset to read every page before write_file, or use edit_file for a targeted change.')
  }
}

/** Hermes exact non-overlapping replacement semantics; ambiguous matches require an explicit replaceAll. */
export function replaceFileText(content: string, oldText: string, newText: string, replaceAll = false) {
  if (!oldText) throw new Error('oldText must not be empty')
  if (oldText === newText) throw new Error('oldText and newText are identical; no modification was made')
  let matches = 0
  for (let index = content.indexOf(oldText); index !== -1; index = content.indexOf(oldText, index + oldText.length)) matches++
  if (!matches) throw new Error('oldText was not found exactly. Read the current text and include its exact whitespace and line endings.')
  if (matches > 1 && !replaceAll) throw new Error(`oldText matches ${matches} locations. Include more surrounding text, or explicitly set replaceAll:true.`)
  return { content: content.split(oldText).join(newText), replacements: matches }
}
