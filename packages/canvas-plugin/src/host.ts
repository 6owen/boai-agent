/*
 * [INPUT]: Current plugin availability, authenticated scope and a fixed renderer executor.
 * [OUTPUT]: Managed canvas CRUD and durable revision-bound exports; .tldr always represents the whole board.
 * [POS]: Canvas application host; visible containers and employees share this single writer.
 * [PROTOCOL]: Update Header and src/.folder.md when this interface changes.
 */
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CANVAS_LIMITS, CanvasError, canvasRequestSchema, canvasScopeSchema, canvasScopeFilterSchema, validateCanvasJson,
  type CanvasDiscardResult, type CanvasDocument, type CanvasExecution, type CanvasExecutor, type CanvasExportResult,
  type CanvasRequest, type CanvasRequestInput, type CanvasResponse, type CanvasResponseMap, type CanvasScope, type CanvasScopeFilter,
} from './protocol'
import { CanvasDocumentRepository, applyCanvasChanges, canvasBytesHash, canvasHash, canvasScopeKey, type CanvasRepositoryOptions } from './document'

export interface CanvasHostOptions extends CanvasRepositoryOptions {
  rootDirectory: string
  authorize: (scope: CanvasScope) => Promise<void>
  enabled: () => boolean
  execute: CanvasExecutor
  executionTimeoutMs?: number
}
type ExportReceipt = Omit<CanvasExportResult, 'base64' | 'path'>
interface StoredExportReceipt { schemaVersion: 1; receipt: ExportReceipt; integrity: string }
const MIME_TYPES = { png: 'image/png', svg: 'image/svg+xml', tldr: 'application/vnd.tldraw+json' } as const
const MAX_QUEUED_EXECUTIONS = 16

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new CanvasError('CANCELLED', '画板操作已取消，已提交结果可通过原操作编号核对')
}
async function regularBytes(path: string, limit: number): Promise<Buffer | null> {
  let handle
  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > limit) throw new CanvasError('LIMIT_EXCEEDED', '画板导出文件无效或超过大小限制')
    const bytes = Buffer.alloc(before.size + 1), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    const after = await handle.stat(), current = await lstat(path)
    if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || current.ino !== before.ino || current.dev !== before.dev || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) throw new CanvasError('EXTERNAL_CHANGE', '画板导出文件已被外部修改')
    return bytes.subarray(0, bytesRead)
  } finally { await handle.close() }
}
async function safeDirectory(path: string) {
  try {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new CanvasError('FORBIDDEN', '画板导出目录无效')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await mkdir(path, { mode: 0o700 }) }
}
async function durableFile(path: string, bytes: Uint8Array | string) {
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}

export class CanvasHost {
  readonly documents: CanvasDocumentRepository
  private closed = false
  private executionTail: Promise<unknown> = Promise.resolve()
  private queuedExecutions = 0
  private readonly active = new Set<{ scope: CanvasScope; abort: AbortController; done: Promise<unknown> }>()
  private readonly exports = new Map<string, Promise<CanvasExportResult>>()
  private readonly discardingEmployees = new Set<string>()
  private readonly discardingConversations = new Set<string>()
  private readonly discardingScopes = new Set<string>()

  constructor(private readonly options: CanvasHostOptions) {
    this.documents = new CanvasDocumentRepository(options.rootDirectory, {
      beforeCommit: async scope => { this.assertEnabled(); this.assertScopeOpen(scope); await options.authorize(scope); await options.beforeCommit?.(scope); this.assertEnabled(); this.assertScopeOpen(scope) },
      beforeRename: options.beforeRename,
    })
  }
  get busy() { return this.active.size > 0 || this.documents.busy }
  private assertEnabled() { if (this.closed || !this.options.enabled()) throw new CanvasError('DISABLED', '画板插件已停用') }
  private assertScopeOpen(scope: CanvasScope) {
    if (this.discardingEmployees.has(scope.employeeId) || scope.conversationId && this.discardingConversations.has(scope.conversationId) || this.discardingScopes.has(canvasScopeKey(scope))) throw new CanvasError('FORBIDDEN', '画板来源正在清理')
  }

  async handle<T extends CanvasRequestInput>(scopeInput: CanvasScope, input: T, signal?: AbortSignal): Promise<CanvasResponseMap[T['action']]> {
    this.assertEnabled()
    const scope = canvasScopeSchema.parse(scopeInput)
    this.assertScopeOpen(scope)
    validateCanvasJson(input)
    const command = canvasRequestSchema.parse(input)
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    const entry = { scope, abort: controller, done: Promise.resolve<unknown>(undefined) }
    const done = (async () => {
      aborted(controller.signal)
      await this.options.authorize(scope)
      this.assertEnabled(); this.assertScopeOpen(scope); aborted(controller.signal)
      const result = await this.dispatch(scope, command, controller.signal)
      // A persisted mutation/export receipt remains truthful if cancellation arrived after commit.
      if (['list', 'open', 'read', 'receipt'].includes(command.action)) {
        await this.options.authorize(scope); this.assertEnabled(); aborted(controller.signal)
      }
      return result
    })()
    entry.done = done
    this.active.add(entry)
    try { return await done as CanvasResponseMap[T['action']] }
    finally { this.active.delete(entry); signal?.removeEventListener('abort', onAbort) }
  }

  private async execute(request: CanvasExecution, signal: AbortSignal) {
    if (this.queuedExecutions >= MAX_QUEUED_EXECUTIONS) throw new CanvasError('LIMIT_EXCEEDED', '画板渲染队列已满，请稍后重试')
    this.queuedExecutions++
    const previous = this.executionTail
    const done = previous.catch(() => undefined).then(async () => {
      this.assertEnabled(); aborted(signal)
      const timeout = new AbortController()
      const combined = AbortSignal.any([signal, timeout.signal])
      const timer = setTimeout(() => timeout.abort(new CanvasError('RENDER_FAILED', '画板渲染超时')), this.options.executionTimeoutMs ?? 30_000)
      try {
        // The injected executor must settle only after its renderer exits on cancellation.
        const result = await this.options.execute(request, combined)
        aborted(combined)
        validateCanvasJson(result, CANVAS_LIMITS.exportBytes * 2)
        return result
      } finally { clearTimeout(timer) }
    })
    // Keep only the sequencing barrier, not the last 32 MiB export/document result.
    this.executionTail = done.then(() => undefined, () => undefined)
    try { return await done } finally { this.queuedExecutions-- }
  }
  private async executeDocument(request: CanvasExecution, signal: AbortSignal): Promise<CanvasDocument> {
    const result = await this.execute(request, signal)
    if (!('document' in result)) throw new CanvasError('RENDER_FAILED', '画板编辑器未返回文档')
    return result.document
  }
  private async dispatch(scope: CanvasScope, command: CanvasRequest, signal: AbortSignal): Promise<CanvasResponse> {
    switch (command.action) {
      case 'list': return this.documents.list(scope)
      case 'open': return this.documents.open(scope, command.boardId)
      case 'read': return this.documents.read(scope, command)
      case 'receipt': return this.documents.receipt(scope, command.boardId, command.operationId)
      case 'create': return this.documents.create(scope, { operationId: command.operationId, title: command.title, intent: command, initialize: () => this.executeDocument({ action: 'init' }, signal) }, signal)
      case 'import': return this.documents.create(scope, { operationId: command.operationId, title: command.title, intent: command, initialize: () => this.executeDocument({ action: 'import', file: command.file }, signal) }, signal)
      case 'commit': {
        const assetsChanged = Object.values(command.changes.added).some(record => record.typeName === 'asset') || Object.values(command.changes.updated).some(([before, after]) => before.typeName === 'asset' || after.typeName === 'asset')
        return this.documents.mutate(scope, {
          ...command, intent: { action: 'commit', changes: command.changes },
          mutate: document => {
            const next = applyCanvasChanges(document, command.changes)
            return assetsChanged ? this.executeDocument({ action: 'validate', document: next }, signal) : next
          },
        }, signal)
      }
      case 'edit': return this.documents.mutate(scope, { ...command, intent: command, mutate: document => this.executeDocument({ action: 'edit', document, operations: command.operations }, signal) }, signal)
      case 'export': return this.export(scope, command, signal)
    }
  }

  private async export(scope: CanvasScope, command: Extract<CanvasRequest, { action: 'export' }>, signal: AbortSignal): Promise<CanvasExportResult> {
    if (command.format === 'tldr' && (command.pageId !== undefined || command.shapeIds !== undefined)) throw new CanvasError('INVALID_DOCUMENT', '.tldr 仅支持导出整份画板；页面或选区导出请使用 PNG/SVG')
    const key = canvasHash({ scope: canvasScopeKey(scope), command })
    const preceding = this.exports.get(key)
    if (preceding) {
      await preceding.catch(() => undefined)
      aborted(signal); this.assertEnabled()
    }
    const pending = this.exportOnce(scope, command, key, signal)
    this.exports.set(key, pending)
    try { return await pending } finally { if (this.exports.get(key) === pending) this.exports.delete(key) }
  }
  private async exportOnce(scope: CanvasScope, command: Extract<CanvasRequest, { action: 'export' }>, key: string, signal: AbortSignal): Promise<CanvasExportResult> {
    const current = await this.documents.open(scope, command.boardId)
    const directory = join(await this.documents.scopeDirectory(scope), 'exports')
    await safeDirectory(directory)
    const target = join(directory, key), filename = `${command.boardId}-r${command.revision}.${command.format}`
    const readSaved = async (): Promise<CanvasExportResult | null> => {
      try { const info = await lstat(target); if (!info.isDirectory() || info.isSymbolicLink()) throw new CanvasError('FORBIDDEN', '画板导出目录无效') }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
      const metadata = await regularBytes(join(target, 'receipt.json'), 16_384)
      if (!metadata) throw new CanvasError('INVALID_DOCUMENT', '画板导出回执缺失；不会覆盖已有文件')
      let envelope: StoredExportReceipt
      try { envelope = JSON.parse(metadata.toString('utf8')) as StoredExportReceipt }
      catch { throw new CanvasError('INVALID_DOCUMENT', '画板导出回执无效') }
      if (envelope.schemaVersion !== 1 || !envelope.receipt || canvasHash(envelope.receipt) !== envelope.integrity) throw new CanvasError('EXTERNAL_CHANGE', '画板导出回执校验失败；原文件保持不变')
      const receipt = envelope.receipt
      if (receipt.boardId !== command.boardId || receipt.revision !== command.revision || receipt.format !== command.format || receipt.filename !== filename || receipt.mimeType !== MIME_TYPES[command.format] || !/^[a-f0-9]{64}$/.test(receipt.documentHash) || !/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new CanvasError('INVALID_DOCUMENT', '画板导出来源不匹配')
      const path = join(target, filename), bytes = await regularBytes(path, CANVAS_LIMITS.exportBytes)
      if (!bytes || bytes.length !== receipt.bytes || canvasBytesHash(bytes) !== receipt.sha256) throw new CanvasError('EXTERNAL_CHANGE', '画板导出文件校验失败；原文件保持不变')
      await this.options.authorize(scope); this.assertEnabled(); aborted(signal)
      return { ...receipt, path, base64: bytes.toString('base64') }
    }
    const saved = await readSaved()
    if (saved) return saved
    if (current.revision !== command.revision) throw new CanvasError('CONFLICT', `画板已更新至 revision ${current.revision}，请使用当前版本导出`)
    if (command.pageId && current.document.store[command.pageId]?.typeName !== 'page') throw new CanvasError('NOT_FOUND', '导出的画板页面不存在')
    if (command.shapeIds?.some(id => current.document.store[id]?.typeName !== 'shape')) throw new CanvasError('NOT_FOUND', '导出的画板形状不存在')
    const result = await this.execute({ action: 'export', document: current.document, format: command.format, ...(command.pageId ? { pageId: command.pageId } : {}), ...(command.shapeIds ? { shapeIds: command.shapeIds } : {}) }, signal)
    if (!('base64' in result) || result.format !== command.format || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.base64) || result.base64.length % 4 !== 0) throw new CanvasError('RENDER_FAILED', '画板导出结果格式无效')
    const bytes = Buffer.from(result.base64, 'base64')
    if (!bytes.length || bytes.length > CANVAS_LIMITS.exportBytes) throw new CanvasError('LIMIT_EXCEEDED', '画板导出内容为空或超过 32 MiB')
    if (command.format === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new CanvasError('RENDER_FAILED', '画板编辑器未返回 PNG 图片')
    if (command.format === 'svg' && !/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/.test(bytes.toString('utf8').trimStart())) throw new CanvasError('RENDER_FAILED', '画板编辑器未返回 SVG 图片')
    if (command.format === 'tldr') {
      let file: { tldrawFileFormatVersion?: unknown; records?: unknown }
      try { file = JSON.parse(bytes.toString('utf8')) as typeof file }
      catch { throw new CanvasError('RENDER_FAILED', '画板编辑器未返回可编辑文件') }
      if (typeof file.tldrawFileFormatVersion !== 'number' || !Array.isArray(file.records)) throw new CanvasError('RENDER_FAILED', '导出不是 tldraw 文件格式')
    }
    const receipt: ExportReceipt = { boardId: command.boardId, revision: command.revision, documentHash: current.documentHash, format: command.format, mimeType: MIME_TYPES[command.format], filename, bytes: bytes.length, sha256: canvasBytesHash(bytes) }
    const staging = join(directory, `.pending-${randomUUID()}`)
    try {
      await mkdir(staging, { mode: 0o700 })
      await durableFile(join(staging, filename), bytes)
      await durableFile(join(staging, 'receipt.json'), JSON.stringify({ schemaVersion: 1, receipt, integrity: canvasHash(receipt) } satisfies StoredExportReceipt))
      await this.options.authorize(scope); this.assertEnabled(); this.assertScopeOpen(scope); aborted(signal)
      await safeDirectory(directory)
      await rename(staging, target)
      return { ...receipt, path: join(target, filename), base64: bytes.toString('base64') }
    } catch (error) {
      if (error instanceof CanvasError) throw error
      throw new CanvasError('IO_ERROR', '画板导出未能完成保存；请核对原版本结果')
    } finally { await rm(staging, { recursive: true, force: true }) }
  }

  async refresh() { if (!this.options.enabled()) { for (const entry of this.active) entry.abort.abort(); await this.drain() } }
  async closeScope(scopeInput: CanvasScopeFilter) {
    const scope = canvasScopeFilterSchema.parse(scopeInput)
    const matches = [...this.active].filter(entry => (!scope.employeeId || entry.scope.employeeId === scope.employeeId) && (!scope.conversationId || entry.scope.conversationId === scope.conversationId))
    for (const entry of matches) entry.abort.abort()
    await Promise.allSettled(matches.map(entry => entry.done))
  }
  /** Called only by the existing explicit source-deletion path, never by view close or plugin disable. */
  async discardScope(scopeInput: CanvasScopeFilter, cleanupId: string): Promise<CanvasDiscardResult> {
    const scope = canvasScopeFilterSchema.parse(scopeInput)
    const exact = scope.employeeId && scope.conversationId ? { employeeId: scope.employeeId, conversationId: scope.conversationId } : undefined
    const key = exact ? canvasScopeKey(exact) : (scope.employeeId ?? scope.conversationId)!
    const closing = exact ? this.discardingScopes : scope.employeeId ? this.discardingEmployees : this.discardingConversations
    if (closing.has(key)) throw new CanvasError('FORBIDDEN', '此画板来源已在清理')
    closing.add(key)
    try {
      await this.closeScope(scope)
      const result = await this.documents.discardScope(scope, cleanupId)
      const owners = new Map(result.deletedBoards.map(item => [canvasScopeKey(item.scope), item.scope]))
      for (const owner of owners.values()) {
        const ownedBoards = new Set(result.deletedBoards.filter(item => canvasScopeKey(item.scope) === canvasScopeKey(owner)).map(item => item.boardId))
        await this.discardExports(owner, ownedBoards, result.preserved)
      }
      result.preserved = [...new Set(result.preserved)]
      return result
    } finally { closing.delete(key) }
  }
  private async discardExports(scope: CanvasScope, deletedBoards: Set<string>, preserved: string[]) {
    const scopeKey = canvasScopeKey(scope), directory = join(await this.documents.scopeDirectory(scope), 'exports')
    try {
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) { preserved.push(`${scopeKey}/exports`); return }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') preserved.push(`${scopeKey}/exports`); return }
    for (const name of await readdir(directory)) {
      const relativePath = `${scopeKey}/exports/${name}`, target = join(directory, name)
      try {
        const info = await lstat(target)
        if (!/^[a-f0-9]{64}$/.test(name) || !info.isDirectory() || info.isSymbolicLink()) throw new Error('unknown export')
        const metadata = await regularBytes(join(target, 'receipt.json'), 16_384)
        if (!metadata) throw new Error('missing receipt')
        const envelope = JSON.parse(metadata.toString()) as StoredExportReceipt, receipt = envelope.receipt
        if (envelope.schemaVersion !== 1 || !receipt || canvasHash(receipt) !== envelope.integrity || !Number.isSafeInteger(receipt.revision) || receipt.revision < 0 || !Object.hasOwn(MIME_TYPES, receipt.format) || receipt.filename !== `${receipt.boardId}-r${receipt.revision}.${receipt.format}` || receipt.mimeType !== MIME_TYPES[receipt.format] || !/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new Error('invalid export ownership')
        if (!deletedBoards.has(receipt.boardId)) continue
        const names = await readdir(target)
        if (names.length !== 2 || !names.includes('receipt.json') || !names.includes(receipt.filename)) throw new Error('customized export directory')
        const path = join(target, receipt.filename), bytes = await regularBytes(path, CANVAS_LIMITS.exportBytes)
        if (!bytes || bytes.length !== receipt.bytes || canvasBytesHash(bytes) !== receipt.sha256) throw new Error('changed export')
        // Each target is an immutable host-created export directory; customized contents stay intact.
        await rm(path)
        await rm(join(target, 'receipt.json'))
        await rmdir(target)
      } catch { preserved.push(relativePath) }
    }
  }
  async drain() { await Promise.allSettled([...this.active].map(entry => entry.done)); await this.documents.drain() }
  async close() { this.closed = true; for (const entry of this.active) entry.abort.abort(); await this.drain() }
}
