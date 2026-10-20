/*
 * [INPUT]: 开发画板路径边界、实际宿主HTML生成器与MCP资源适配。
 * [OUTPUT]: 路径/HTML边界及准确提示；关闭失败仍收尾真实HTTP/子进程，退出未确认不解锁。
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

it('一个会话关闭失败也收尾真实HTTP和插件子进程，等待退出后才释放锁', async () => {
  const { createServer } = await import('node:http')
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  // @ts-expect-error Developer-only Node ESM tool has no declaration file.
  const { closeDesignResources } = await import('../scripts/design/lifecycle.mjs')
  const http = createServer((_request, response) => response.end('ready'))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000);process.stdout.write("ready")'], { stdio: ['ignore', 'pipe', 'ignore'] })
  await once(child.stdout!, 'data')
  const exited = once(child, 'exit')
  let released = false, pluginCloseAttempted = false
  try {
    let failure: (AggregateError & { resourcesStopped?: boolean }) | undefined
    try {
      await closeDesignResources({
        events: [], sessions: [{ close: async () => { throw new Error('session-close-proof') } }], http,
        client: { close: async () => { throw new Error('client-close-proof') } },
        transport: { close: async () => { pluginCloseAttempted = true; child.kill('SIGTERM') } },
        pid: child.pid, persist: Promise.resolve(), removeInfo: async () => {},
        release: () => { expect(child.exitCode !== null || child.signalCode !== null).toBe(true); released = true },
      })
    } catch (error) { failure = error as AggregateError & { resourcesStopped?: boolean } }
    expect(failure?.errors.map((error: Error) => error.message)).toEqual(expect.arrayContaining(['session-close-proof', 'client-close-proof']))
    expect(failure?.resourcesStopped).toBe(true)
    expect(pluginCloseAttempted).toBe(true)
    expect(released).toBe(true)
    expect(http.listening).toBe(false)
    await exited
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    if (http.listening) { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) }
  }
})
it('HTTP仍存活时不释放原锁或删除定位记录', async () => {
  const { createServer } = await import('node:http')
  // @ts-expect-error Developer-only Node ESM tool has no declaration file.
  const { closeDesignResources } = await import('../scripts/design/lifecycle.mjs')
  const http = createServer((_request, response) => response.end('ready'))
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const closeConnections = http.closeAllConnections.bind(http)
  http.closeAllConnections = () => { throw new Error('http-close-proof') }
  let released = false, removed = false
  try {
    await expect(closeDesignResources({ events: [], sessions: [], http, persist: Promise.resolve(), removeInfo: async () => { removed = true }, release: () => { released = true } })).rejects.toMatchObject({ resourcesStopped: false })
    expect(http.listening).toBe(true)
    expect(released).toBe(false)
    expect(removed).toBe(false)
  } finally {
    http.closeAllConnections = closeConnections; closeConnections()
    await new Promise<void>(resolve => http.close(() => resolve()))
  }
})
