/*
 * [INPUT]: Trusted desktop/runtime canvas calls, plugin availability and managed storage root.
 * [OUTPUT]: One document host plus bounded hidden renderers, UI flush barriers and cancellation fences.
 * [POS]: Electron canvas adapter; never shows/focuses a window or evaluates caller code.
 * [PROTOCOL]: Update Header and main/.folder.md when this file changes.
 */
import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { CanvasHost } from '@boai/canvas-plugin/host'
import { CANVAS_LIMITS, CanvasError, canvasHostEnvelopeSchema, canvasRequestSchema, canvasScopeSchema, validateCanvasJson, type CanvasExecution, type CanvasExecutionResult, type CanvasHostEnvelope, type CanvasHostResponse, type CanvasRequest, type CanvasScope, type CanvasScopeFilter } from '@boai/canvas-plugin/protocol'

export interface ElectronCanvasHostOptions {
  rootDirectory: string
  preloadPath: string
  rendererFile: string
  rendererUrl?: string
  enabled(): boolean
  authorize(scope: CanvasScope): Promise<void>
  mainWindow(): BrowserWindow | null | undefined
}
const sameScope = (a: CanvasScope, b: CanvasScope) => a.employeeId === b.employeeId && a.conversationId === b.conversationId
const READY = 'boai:canvas-renderer-ready', RESULT = 'boai:canvas-renderer-result'

export class ElectronCanvasHost {
  private host: CanvasHost
  private closed = false
  private backingUp = false
  private backupRequested = false
  private calls = new Map<string, { scope: CanvasScope; controller: AbortController; done: Promise<CanvasHostResponse> }>()
  private discards = new Set<Promise<CanvasHostResponse>>()
  private renders = new Map<number, { window: BrowserWindow; request: CanvasExecution; resolve(result: CanvasExecutionResult): void; reject(error: Error): void; sent: boolean }>()
  private flushes = new Map<string, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private options: ElectronCanvasHostOptions) {
    this.host = new CanvasHost({ rootDirectory: options.rootDirectory, enabled: () => !this.closed && options.enabled(), authorize: options.authorize, execute: (request, signal) => this.execute(request, signal) })
    ipcMain.handle(READY, event => {
      const owned = this.renders.get(event.sender.id)
      if (!owned || event.senderFrame !== event.sender.mainFrame || owned.sent) throw new Error('Unknown canvas renderer')
      owned.sent = true
      return owned.request
    })
    ipcMain.on(RESULT, this.onResult)
  }
  private onResult = (event: Electron.IpcMainEvent, value: unknown) => {
    const owned = this.renders.get(event.sender.id)
    if (!owned || !owned.sent || event.senderFrame !== event.sender.mainFrame) return
    try {
      validateCanvasJson(value, CANVAS_LIMITS.exportBytes * 2)
      const message = value as { result?: CanvasExecutionResult; error?: string }
      if (message.error) owned.reject(new CanvasError('RENDER_FAILED', message.error.slice(0, 4000)))
      else if (message.result) owned.resolve(message.result)
      else owned.reject(new CanvasError('RENDER_FAILED', '画板执行器没有返回结果'))
    } catch (error) { owned.reject(error instanceof Error ? error : new Error(String(error))) }
  }
  async request(raw: { scope: CanvasScope; command: CanvasRequest }) {
    const scope = canvasScopeSchema.parse(raw.scope), command = canvasRequestSchema.parse(raw.command)
    const readOnly = ['list', 'open', 'read', 'receipt'].includes(command.action)
    if (!readOnly && (this.backingUp || this.backupRequested && command.action !== 'commit')) throw new CanvasError('CONFLICT', '画板正在备份，请稍后保存')
    return this.host.handle(scope, command)
  }
  async call(raw: CanvasHostEnvelope): Promise<CanvasHostResponse> {
    const input = canvasHostEnvelopeSchema.parse(raw)
    if (input.type === 'discard') {
      if (this.backupRequested || this.backingUp || this.closed) throw new CanvasError('CONFLICT', '画板宿主正在退出或备份，来源清理稍后恢复')
      const done = (async () => { await this.closeScope(input.filter); return this.host.discardScope(input.filter, input.cleanupId) })()
      this.discards.add(done)
      try { return await done } finally { this.discards.delete(done) }
    }
    if (input.type === 'cancel') {
      const entry = this.calls.get(input.executionId)
      if (entry && !sameScope(entry.scope, input.scope)) throw new CanvasError('FORBIDDEN', '画板调用来源不匹配')
      if (entry) { entry.controller.abort(); await entry.done.catch(() => undefined) }
      return { cancelled: true }
    }
    if (this.backupRequested || this.backingUp) throw new CanvasError('CONFLICT', '画板正在备份')
    if (this.closed || !this.options.enabled()) throw new CanvasError('DISABLED', '画板插件已停用')
    if (this.calls.has(input.executionId)) throw new CanvasError('OPERATION_CONFLICT', '画板执行编号已存在，请核对原回执')
    const controller = new AbortController()
    const entry = { scope: input.scope, controller, done: Promise.resolve<CanvasHostResponse>({ cancelled: true }) }
    const done = (async () => {
      await this.options.authorize(input.scope)
      controller.signal.throwIfAborted()
      if (!['receipt', 'list', 'create'].includes(input.command.action)) await this.flushViews(input.scope, 'boardId' in input.command ? input.command.boardId : undefined, controller.signal)
      return this.host.handle(input.scope, input.command, controller.signal)
    })()
    entry.done = done
    this.calls.set(input.executionId, entry)
    try { return await done } finally { this.calls.delete(input.executionId) }
  }
  flushed(input: { id: string; error?: string }) {
    const pending = this.flushes.get(input.id)
    if (!pending) return
    if (input.error) pending.reject(new CanvasError('CONFLICT', `人工修改尚未保存：${input.error.slice(0, 1000)}`))
    else pending.resolve()
  }
  private flushViews(scope: CanvasScope | undefined, boardId: string | undefined, signal: AbortSignal, hold = false, id = randomUUID()) {
    const window = this.options.mainWindow()
    if (!window || window.isDestroyed()) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => { const pending = this.flushes.get(id); if (pending) clearTimeout(pending.timer); this.flushes.delete(id); signal.removeEventListener('abort', abort); window.removeListener('closed', abort) }
      const done = () => { cleanup(); resolve() }
      const fail = (error: Error) => { cleanup(); reject(error) }
      const abort = () => fail(new CanvasError('CANCELLED', '画板保存核对已取消'))
      const timer = setTimeout(() => fail(new CanvasError('CONFLICT', '无法核对人工画板修改，请保存后重试')), 8000)
      this.flushes.set(id, { resolve: done, reject: fail, timer })
      signal.addEventListener('abort', abort, { once: true })
      window.once('closed', abort)
      if (signal.aborted) abort()
      else window.webContents.send('boai:event', { type: 'canvas:flush', id, scope, boardId, hold })
    })
  }
  private async execute(request: CanvasExecution, signal: AbortSignal): Promise<CanvasExecutionResult> {
    signal.throwIfAborted()
    if (this.closed) throw new CanvasError('DISABLED', '画板宿主已关闭')
    const window = new BrowserWindow({ show: false, focusable: false, width: 1600, height: 1200, skipTaskbar: true,
      webPreferences: { preload: this.options.preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: 'boai-canvas-renderer' } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    // Only self-hosted assets/data images are needed. Deny arbitrary document-origin network access.
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      let allowed = details.url.startsWith('file:') || details.url.startsWith('data:') || details.url.startsWith('blob:')
      if (this.options.rendererUrl) try { allowed ||= new URL(details.url).origin === new URL(this.options.rendererUrl).origin } catch { /* invalid URL is denied */ }
      callback({ cancel: !allowed })
    })
    const closed = new Promise<void>(resolve => window.once('closed', resolve))
    const id = window.webContents.id
    let onAbort: () => void = () => {}
    const result = new Promise<CanvasExecutionResult>((resolve, reject) => {
      this.renders.set(id, { window, request, resolve, reject, sent: false })
      onAbort = () => reject(new CanvasError('CANCELLED', '画板渲染已取消'))
      signal.addEventListener('abort', onAbort, { once: true })
      window.webContents.once('render-process-gone', () => reject(new CanvasError('RENDER_FAILED', '画板渲染进程已退出')))
      window.once('closed', () => reject(new CanvasError('RENDER_FAILED', '画板渲染窗口已关闭')))
      if (signal.aborted) onAbort()
    })
    try {
      const load = this.options.rendererUrl ? window.loadURL(new URL('/canvas-renderer.html', this.options.rendererUrl).href) : window.loadFile(this.options.rendererFile)
      void load.catch(error => this.renders.get(id)?.reject(error))
      return await result
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.renders.delete(id)
      if (!window.isDestroyed()) window.destroy()
      await closed
    }
  }
  async refresh() {
    if (!this.options.enabled()) for (const entry of this.calls.values()) entry.controller.abort()
    await this.host.refresh()
    if (!this.options.enabled()) await Promise.allSettled([...this.calls.values()].map(entry => entry.done))
  }
  async closeScope(scope: CanvasScopeFilter) {
    const entries = [...this.calls.values()].filter(entry => (!scope.employeeId || entry.scope.employeeId === scope.employeeId) && (!scope.conversationId || entry.scope.conversationId === scope.conversationId))
    for (const entry of entries) entry.controller.abort()
    await this.host.closeScope(scope)
    await Promise.allSettled(entries.map(entry => entry.done))
  }
  async coordinatedBackup<T>(action: () => Promise<T>): Promise<T> {
    if (this.backupRequested || this.closed) throw new CanvasError('CONFLICT', '画板宿主正在退出或备份')
    const id = randomUUID()
    this.backupRequested = true
    try {
      await this.flushViews(undefined, undefined, AbortSignal.timeout(10_000), true, id)
      this.backingUp = true
      await Promise.allSettled([...this.discards])
      await this.host.drain()
      await Promise.allSettled([...this.calls.values()].map(entry => entry.done))
      return await action()
    } finally {
      this.backingUp = false; this.backupRequested = false
      const window = this.options.mainWindow()
      if (window && !window.isDestroyed()) window.webContents.send('boai:event', { type: 'canvas:resume', id })
    }
  }
  async close() {
    this.closed = true
    for (const entry of this.calls.values()) entry.controller.abort()
    for (const pending of [...this.flushes.values()]) pending.reject(new CanvasError('CANCELLED', '画板宿主正在关闭'))
    await Promise.allSettled([...this.discards])
    await this.host.close()
    await Promise.allSettled([...this.calls.values()].map(entry => entry.done))
    ipcMain.removeHandler(READY)
    ipcMain.removeListener(RESULT, this.onResult)
  }
  get busy() { return this.host.busy || this.calls.size > 0 || this.discards.size > 0 }
}
