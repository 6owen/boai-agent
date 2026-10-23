/*
 * [INPUT]: 开发画板路径边界、实际宿主HTML生成器与MCP资源适配。
 * [OUTPUT]: 路径/HTML和Agent通用提示；真实初始化失败保留PID，在途调用/最终写队列排空才解锁。
 * [POS]: 第22组开发侧回归；实际插件/编辑器通过另行记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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
it('设计内容不能结束注入脚本；引用由开发Agent显式读取', () => {
  const html = panelHTML('<html><script>nativeBoot()</script></html>', '/session/test', { toolOutput: { title: '</script><script>untrusted()</script>' } })
  expect(html).not.toContain('<script>untrusted()')
  expect(html).toContain('\\u003c/script>')
  const message = '已加入对话输入框，可继续输入修改要求。'
  const escaped = [...message].map(character => '\\u' + character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')
  const resource = adaptResource({ contents: [{ uri: 'ui://excalidraw/assets/bundle-6.txt', text: escaped + ' Added to the chat input. Describe your changes there.' }, { uri: 'excalidraw://document/example', text: message }] })
  expect(resource.contents[0].text).not.toContain(escaped)
  expect(resource.contents[0].text).toContain('Ask your development agent to read the selection.')
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
        pid: child.pid, drainPersistence: async () => {}, removeInfo: async () => {},
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
    await expect(closeDesignResources({ events: [], sessions: [], http, drainPersistence: async () => {}, removeInfo: async () => { removed = true }, release: () => { released = true } })).rejects.toMatchObject({ resourcesStopped: false })
    expect(http.listening).toBe(true)
    expect(released).toBe(false)
    expect(removed).toBe(false)
  } finally {
    http.closeAllConnections = closeConnections; closeConnections()
    await new Promise<void>(resolve => http.close(() => resolve()))
  }
})

it('原生MCP初始化失败清空SDK的PID后，仍等待原子进程实际退出再解锁', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  // @ts-expect-error Developer-only Node ESM tool has no declaration file.
  const { closeDesignResources, DesignStdioTransport } = await import('../scripts/design/lifecycle.mjs')
  const root = await mkdtemp(join(tmpdir(), 'boai-design-initialize-'))
  const marker = join(root, 'exited.txt')
  const source = `
    const fs=require('node:fs'); let input=''; setInterval(()=>{},1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk=>{ input+=chunk; let end;
      while((end=input.indexOf('\\n'))>=0){const line=input.slice(0,end);input=input.slice(end+1);
        const request=JSON.parse(line);
        if(request.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'initialize-proof'}})+'\\n');
      }
    });
    process.stdin.on('end',()=>setTimeout(()=>{fs.writeFileSync(process.argv[1],'exited');process.exit(0)},150));
  `
  const transport = new DesignStdioTransport({ command: process.execPath, args: ['-e', source, marker], stderr: 'pipe' })
  const client = new Client({ name: 'initialize-failure-proof', version: '1' })
  try {
    await expect(client.connect(transport)).rejects.toThrow('initialize-proof')
    expect(transport.pid).toBeNull()
    expect(transport.startedPid).toBeGreaterThan(0)
    expect(() => process.kill(transport.startedPid, 0)).not.toThrow()
    let released = false
    await closeDesignResources({ events: [], sessions: [], client, transport, pid: transport.startedPid, drainPersistence: async () => {}, removeInfo: async () => {}, release: async () => {
      expect(await readFile(marker, 'utf8')).toBe('exited')
      expect(() => process.kill(transport.startedPid, 0)).toThrow()
      released = true
    } })
    expect(released).toBe(true)
  } finally {
    await client.close(); await transport.close()
    try { process.kill(transport.startedPid, 'SIGKILL') } catch { /* already exited */ }
    await rm(root, { recursive: true, force: true })
  }
})

it('关闭与延迟导出交错时拒绝迟到写入，已排队文件落盘完成前不解锁', async () => {
  // @ts-expect-error Developer-only Node ESM tool has no declaration file.
  const { closeDesignResources, createDesignActivity } = await import('../scripts/design/lifecycle.mjs')
  const root = await mkdtemp(join(tmpdir(), 'boai-design-drain-'))
  const activity = createDesignActivity()
  let finishExport!: () => void, finishWrite!: () => void
  const nativeOutput = new Promise<void>(resolve => { finishExport = resolve })
  const diskReady = new Promise<void>(resolve => { finishWrite = resolve })
  let writeFinished = false, released = false, operationFinished = false
  const persistQueue = diskReady.then(async () => { await writeFile(join(root, 'accepted.json'), 'accepted'); writeFinished = true })
  const operation = activity.run(async () => {
    await nativeOutput
    // 同实际宿主一样：原生结果/文件读取返回后，状态更新和落盘之前再次核对。
    activity.assertOpen()
    await writeFile(join(root, 'late.json'), 'must-not-exist')
  }).finally(() => { operationFinished = true })
  const rejected = expect(operation).rejects.toThrow('开发宿主正在关闭')
  // 确认操作已进入原生等待，随后关闭协议才使其返回。
  await Promise.resolve()
  activity.stop()
  const close = closeDesignResources({ events: [], sessions: [], client: { close: async () => { finishExport() } },
    drainOperations: activity.drain, drainPersistence: () => persistQueue,
    removeInfo: async () => {}, release: async () => {
      expect(operationFinished).toBe(true); expect(writeFinished).toBe(true)
      expect(await readFile(join(root, 'accepted.json'), 'utf8')).toBe('accepted')
      await expect(readFile(join(root, 'late.json'))).rejects.toMatchObject({ code: 'ENOENT' })
      released = true
    },
  })
  try {
    await rejected
    expect(released).toBe(false)
    await expect(activity.run(async () => {})).rejects.toThrow('开发宿主正在关闭')
    finishWrite(); await close
    expect(released).toBe(true)
  } finally { finishExport(); finishWrite(); await close; await rm(root, { recursive: true, force: true }) }
})
