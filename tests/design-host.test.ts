/*
 * [INPUT]: 开发画板路径边界、实际宿主HTML生成器与MCP资源适配。
 * [OUTPUT]: 导出不能经别名/符号链接越界；文本不能逃出宿主脚本；原聊天注入承诺被纠正。
 * [POS]: 第22组开发侧回归；实际插件/编辑器通过另行记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error Developer-only Node ESM tool has no declaration file.
import { designPath } from '../scripts/design/server.mjs'
// @ts-expect-error Developer-only Node ESM tool has no declaration file.
import { adaptResource, panelHTML } from '../scripts/design/browser.mjs'

it('仓库导出路径拒绝越界别名及符号链接', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-design-boundary-'))
  try {
    for (const path of ['src/output.excalidraw', 'ai-docs/design/../other.excalidraw', 'ai-docs/design//output.excalidraw', 'ai-docs/design/./output.excalidraw', 'ai-docs/design/a\\b.excalidraw', 'ai-docs/design/x\0.excalidraw']) {
      await expect(designPath(root, path, true)).rejects.toThrow(/规范相对路径/)
    }
    await mkdir(join(root, 'outside'))
    await mkdir(join(root, 'ai-docs/design'), { recursive: true })
    await symlink(join(root, 'outside'), join(root, 'ai-docs/design/linked'))
    await expect(designPath(root, 'ai-docs/design/linked/output.excalidraw', true)).rejects.toThrow(/符号链接/)
    await expect(designPath(root, 'ai-docs/design/feature/output.excalidraw', true)).resolves.toBe(join(root, 'ai-docs/design/feature/output.excalidraw'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('设计内容不能结束注入脚本；不承诺写入Codex输入框', () => {
  const html = panelHTML('<html><script>nativeBoot()</script></html>', '/session/test', { toolOutput: { title: '</script><script>untrusted()</script>' } })
  expect(html).not.toContain('<script>untrusted()')
  expect(html).toContain('\\u003c/script>')
  const message = '已加入对话输入框，可继续输入修改要求。'
  const escaped = [...message].map(character => '\\u' + character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')
  const resource = adaptResource({ contents: [{ uri: 'ui://excalidraw/assets/bundle-6.txt', text: escaped + ' Added to the chat input. Describe your changes there.' }, { uri: 'excalidraw://document/example', text: message }] })
  expect(resource.contents[0].text).not.toContain(escaped)
  expect(resource.contents[0].text).toContain('Ask Codex to read the selection.')
  expect(resource.contents[1].text).toBe(message)
})
