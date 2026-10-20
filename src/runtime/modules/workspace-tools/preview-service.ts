/*
 * [INPUT]: Authorized workspace directory, terminal owner and explicit preview command.
 * [OUTPUT]: Real loopback static/development servers, readiness and lifecycle.
 * [POS]: Sidebar preview service; no remote URL proxy or automatic package installation.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createServer, get, type Server } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PreviewInfo, TerminalScope } from '../../../shared/domain/workspace-tools'
import type { TerminalService } from './terminal-service'

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
const listen = (server: Server, port = 0) => new Promise<number>((done, reject) => {
  const error = (e: Error) => reject(e)
  server.once('error', error)
  server.listen(port, '127.0.0.1', () => { server.off('error', error); done((server.address() as { port: number }).port) })
})
const close = (server: Server) => new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections() })
const reachable = (url: string) => new Promise<boolean>(done => {
  const request = get(url, { timeout: 700 }, response => { response.resume(); done((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 400) })
  request.on('error', () => done(false)); request.on('timeout', () => { request.destroy(); done(false) })
})
export class PreviewService {
  private previews = new Map<string, { info: PreviewInfo; server?: Server }>()
  private closing = false
  private pending = new Set<Promise<PreviewInfo>>()
  private stopped = new Set<string>()
  constructor(private terminals: TerminalService) {}
  async detect(directory: string) {
    const root = await realpath(directory)
    let scripts: Record<string, string> = {}
    try { const info = await stat(join(root, 'package.json')); if (info.size < 512000) scripts = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).scripts ?? {} } catch { /* Static directories need no package manifest. */ }
    let staticIndex = false
    try { staticIndex = (await stat(join(root, 'index.html'))).isFile() } catch { /* No static entry. */ }
    return { directory: root, staticIndex, scripts: Object.entries(scripts).filter(([name, command]) => ['dev', 'start', 'preview'].includes(name) && typeof command === 'string').map(([name, command]) => ({ name, command })) }
  }
  list(scope: TerminalScope) { return [...this.previews.values()].filter(p => p.info.employeeId === scope.employeeId && p.info.conversationId === scope.conversationId).map(p => this.status(p.info.id)) }
  status(id: string) {
    const item = this.previews.get(id)
    if (!item) throw new Error('预览不存在或服务已重启')
    if (item.info.terminalId && this.terminals.info(item.info.terminalId).status === 'exited' && item.info.status !== 'stopped') item.info.status = 'failed'
    return { ...item.info }
  }
  start(scope: TerminalScope, directory: string, command?: string) {
    const task = this.startServer(scope, directory, command)
    this.pending.add(task); void task.finally(() => this.pending.delete(task)).catch(() => {})
    return task
  }
  private async startServer(scope: TerminalScope, directory: string, command?: string) {
    if (this.closing) throw new Error('预览服务正在退出')
    const root = await realpath(directory)
    if (this.closing) throw new Error('预览服务正在退出')
    if (this.list(scope).some(p => p.status === 'starting' || p.status === 'ready')) throw new Error('该会话已有预览，请先停止后再启动')
    const info: PreviewInfo = { ...scope, id: randomUUID(), directory: root, url: '', kind: command ? 'command' : 'static', status: 'starting' }
    const item: { info: PreviewInfo; server?: Server } = { info }; this.previews.set(info.id, item)
    try {
      if (!command) {
        if (!(await stat(join(root, 'index.html'))).isFile()) throw new Error('静态预览目录中没有 index.html')
        const server = createServer((request, response) => {
          void (async () => {
            if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405).end(); return }
            const parts = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).split('/')
            if (parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes('\0'))) { response.writeHead(403).end(); return }
            let path = resolve(root, `.${parts.join('/')}`)
            if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
            path = await realpath(path)
            const rel = relative(root, path), size = (await stat(path)).size
            if (rel.startsWith('..') || size > 64 * 1024 * 1024) { response.writeHead(403).end(); return }
            response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
            if (request.method === 'HEAD') response.end()
            else { const stream = createReadStream(path); stream.on('error', () => response.destroy()); stream.pipe(response) }
          })().catch(() => { if (!response.headersSent) response.writeHead(404); response.end('Not found') })
        })
        item.server = server
        info.url = `http://127.0.0.1:${await listen(server)}/`; info.status = 'ready'
      } else {
        const reservation = createServer(), port = await listen(reservation)
        await close(reservation)
        const terminal = await this.terminals.create(scope, root, '预览服务'); info.terminalId = terminal.id; info.url = `http://127.0.0.1:${port}/`
        const expanded = command.replaceAll('{{port}}', String(port))
        // The caller chooses the command; PORT/HOST are explicit and visible in the terminal.
        await this.terminals.write(terminal.id, `export PORT=${port} HOST=127.0.0.1\n${expanded}\n`)
        const deadline = Date.now() + 20000
        while (!this.closing && info.status === 'starting' && Date.now() < deadline && this.terminals.info(terminal.id).status === 'running') {
          if (await reachable(info.url)) { info.status = 'ready'; break }
          await new Promise(done => setTimeout(done, 150))
        }
        if (info.status !== 'ready') throw new Error('预览服务没有就绪；请检查终端输出和监听端口，命令可使用 {{port}}')
      }
    } catch (error) {
      info.status = 'failed'; info.error = error instanceof Error ? error.message : String(error)
      if (info.terminalId) await this.terminals.kill(info.terminalId)
      if (item.server?.listening) await close(item.server)
    }
    if (this.closing || this.stopped.has(info.id)) await this.stop(info.id)
    return { ...info }
  }
  async stop(id: string) {
    const item = this.previews.get(id); if (!item) throw new Error('预览不存在')
    this.stopped.add(id)
    if (item.info.terminalId) await this.terminals.kill(item.info.terminalId)
    if (item.server?.listening) await close(item.server)
    item.info.status = 'stopped'; return { ...item.info }
  }
  async clearConversation(id: string) {
    const keys = [...this.previews].filter(([, p]) => p.info.conversationId === id).map(([key]) => key)
    await Promise.all(keys.map(key => this.stop(key)))
    await Promise.allSettled([...this.pending])
    for (const key of keys) { await this.stop(key); this.previews.delete(key); this.stopped.delete(key) }
  }
  async close() { this.closing = true; await Promise.all([...this.previews.keys()].map(id => this.stop(id))); await Promise.allSettled([...this.pending]) }
}
