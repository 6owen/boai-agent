/*
 * [INPUT]: 已核验原件的纯字节/名称及预览独立容量合同。
 * [OUTPUT]: 源码只按惰性文本分类、原文/BOM/换行保留、未知扩展回退及原型名称/二进制/编码/字节/字符/行数边界回归。
 * [POS]: tests/file-preview.test.ts；确定性模块测试，不读任意文件或执行代码。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { FILE_PREVIEW_LIMITS, previewFile } from '../src/shared/domain/file-preview'

describe('bounded inert file previews', () => {
  it.each([
    ['readme.md', 'markdown', undefined], ['code.ts', 'code', 'typescript'], ['code.tsx', 'code', 'tsx'],
    ['code.js', 'code', 'javascript'], ['code.py', 'code', 'python'], ['code.css', 'code', 'css'],
    ['code.html', 'code', 'html'], ['code.svg', 'code', 'xml'], ['data.json', 'code', 'json'],
    ['Dockerfile', 'code', 'dockerfile'], ['.env.local', 'code', 'dotenv'], ['notes.unknown', 'text', undefined],
    ['toString', 'text', undefined], ['__proto__', 'text', undefined],
  ])('keeps %s inert and preserves the exact source bytes after UTF-8 decoding', (name, kind, language) => {
    const text = '\ufeff<script>globalThis.unsafe=true</script>\r\n中文\n'
    expect(previewFile(name, Buffer.from(text))).toEqual({ kind, text, ...(language ? { language } : {}) })
  })

  it.each([
    ['report.pdf', Buffer.from('%PDF fixture'), '格式'],
    ['unknown.file', Buffer.from('%PDF-1.7\ntext object'), '二进制'],
    ['unknown.file', Buffer.from('GIF89a'), '二进制'],
    ['unknown.file', Buffer.from([0xff, 0xfe, 0x61]), 'UTF-8'],
    ['code.js', Buffer.from([0, 1, 2]), '二进制'],
    ['big.txt', Buffer.alloc(FILE_PREVIEW_LIMITS.bytes + 1, 65), '1 MiB'],
    ['many.txt', Buffer.from('字'.repeat(FILE_PREVIEW_LIMITS.characters + 1)), '200000'],
  ])('returns metadata with no guessed body for unsupported %s bytes', (name, bytes, reason) => {
    expect(previewFile(name, bytes)).toEqual({ kind: 'unsupported', text: '', reason: expect.stringContaining(reason) })
  })

  it('represents empty source files as empty text instead of a fabricated body', () => {
    expect(previewFile('empty.ts', Buffer.alloc(0))).toEqual({ kind: 'code', text: '', language: 'typescript' })
  })

  it.each(['\n', '\r\n', '\r'])('bounds tiny lines before renderer markup or Markdown parsing with %j separators', newline => {
    const text = Array.from({ length: FILE_PREVIEW_LIMITS.lines }, () => 'x').join(newline)
    expect(previewFile('bounded.md', Buffer.from(text))).toEqual({ kind: 'markdown', text })
    expect(previewFile('bounded.md', Buffer.from(text + newline))).toEqual({ kind: 'unsupported', text: '', reason: expect.stringContaining('10000 行') })
  })
})
