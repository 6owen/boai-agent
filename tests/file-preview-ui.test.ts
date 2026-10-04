/*
 * [INPUT]: 宿主文件预览与共享 Markdown/CodeBlock 的实际 React 渲染和本地 Shiki 引擎。
 * [OUTPUT]: 源码与恶意标签只作为文本、Markdown不加载远程资源、行数过多不制造巨量DOM、常用代码实际双色高亮。
 * [POS]: 文件预览展示边界测试；真实聊天入口、切换与动作由Electron BDD验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { TextFilePreview } from '../src/renderer/components/common/file-preview'
import { CodeBlock } from '../src/renderer/components/ui/code-block'
import { highlightCode } from '../src/renderer/components/ui/shiki-highlighter'
import { FILE_PREVIEW_LIMITS } from '../src/shared/domain/file-preview'

test('HTML source is visible text without executable elements or remote requests', () => {
  const source = '<script>window.previewExecuted=true</script>\n<iframe src="https://example.invalid"></iframe>'
  const html = renderToStaticMarkup(createElement(TextFilePreview, { name: 'page.html', kind: 'code', text: source, language: 'html' }))
  expect(html).toContain('&lt;script&gt;window.previewExecuted=true&lt;/script&gt;')
  expect(html).not.toMatch(/<(script|iframe|img)\b/)
  expect(html).toContain('data-file-line="2"')
})

test('Markdown reading does not activate embedded HTML, external images or links', () => {
  const html = renderToStaticMarkup(createElement(TextFilePreview, { name: 'report.md', kind: 'markdown', text: '# Report\n\n![secret](https://example.invalid/track)\n\n[link](https://example.invalid)\n\n<script>window.previewExecuted=true</script>' }))
  expect(html).toContain('<h1>Report</h1>')
  expect(html).not.toMatch(/<(script|iframe|img|a)\b/)
})

test('oversized line sets retain plain source without creating a control for every line', async () => {
  const code = '\n'.repeat(FILE_PREVIEW_LIMITS.lines + 1)
  const html = renderToStaticMarkup(createElement(CodeBlock, { code, language: 'typescript', lineNumbers: true }))
  expect(html).not.toContain('data-file-line=')
  expect(html).not.toContain('<button')
  expect(await highlightCode(code, 'typescript')).toBeNull()
})

test('source line numbers keep CRLF and legacy CR materials aligned with their citations', () => {
  const html = renderToStaticMarkup(createElement(CodeBlock, { code: 'first\r\nsecond\rthird', lineNumbers: true, selectedLine: 3 }))
  expect(html.match(/data-file-line=/g)).toHaveLength(3)
  expect(html).toContain('data-file-line="3" data-selected="true"')
  expect(html).toContain('class="shiki-line-content">third</span>')
})

test.each([
  ['typescript', 'export const value: number = 7'],
  ['python', 'def answer():\n    return 42'],
  ['xml', '<svg onload="alert(1)"><text>source</text></svg>'],
  ['kotlin', 'val answer: Int = 42'],
  ['dotenv', 'MODE=development'],
])('local Shiki highlights %s while preserving source as token text', async (language, code) => {
  const tokens = await highlightCode(code, language)
  expect(tokens).not.toBeNull()
  expect(tokens!.map(line => line.map(token => token.content).join('')).join('\n')).toBe(code)
  expect(tokens!.flat().some(token => token.variants.light.color && token.variants.dark.color)).toBe(true)
})
