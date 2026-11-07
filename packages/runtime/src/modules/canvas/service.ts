/*
 * [INPUT]: Enabled canvas plugin, a trusted employee execution and the same-profile desktop host bridge.
 * [OUTPUT]: Scope-bound calls, cancellation/draining, original workspace exports and durable source cleanup with offline managed-file fallback.
 * [POS]: Canvas runtime capability; exports use the original file/publication boundary, without a separate agent loop.
 * [PROTOCOL]: Update Header and canvas/.folder.md on change.
 */
import { constants } from 'node:fs'
import { readFile, open } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { CANVAS_PLUGIN_ID, CANVAS_LIMITS, canvasHostEnvelopeSchema, type CanvasExportResult, type CanvasHostEnvelope, type CanvasHostResponse, type CanvasMutationResult, type CanvasScope, type CanvasScopeFilter } from '@boai/canvas-plugin/protocol'
import { CanvasHost } from '@boai/canvas-plugin/host'
import { pluginAvailability, readPluginSettingsSchema } from '@boai/shared/plugins/types'
import { applicationPlugins } from '@boai/shared/plugins/catalog'
import type { EngineContext } from '../../contracts'
import { canvasAgentRequestSchema, type CanvasAgentRequest } from '../../adapters/mastra/canvas-tools'
import { authorizeExecution } from '../employees/execution-permissions'
import { assertTaskPathAccess, initializeWorkspace, workspaceTarget, writeWorkspaceFile } from '../workspaces/file-access'

export type CanvasHostRequest = (input: CanvasHostEnvelope) => Promise<CanvasHostResponse>
export type CanvasAccessCheck = (context: EngineContext) => Promise<void>
const MODEL_IMAGE_BASE64_LIMIT = 8 * 1024 * 1024
const PUBLISHABLE_BYTES = 20 * 1024 * 1024

export class CanvasService {
  private closing = false
  private calls = new Set<{ runId: string; scope: CanvasScope; controller: AbortController; done: Promise<unknown> }>()
  private cleanups = new Set<Promise<void>>()
  private cleanupHost?: CanvasHost
  constructor(private dataPath: string, private requestHost?: CanvasHostRequest, private verify?: CanvasAccessCheck, private hostAvailable: () => boolean = () => !!this.requestHost) {}
  get busy() { return this.calls.size > 0 || this.cleanups.size > 0 }
  async enabled() {
    if (this.closing || !this.requestHost || !this.verify || !this.hostAvailable()) return false
    const plugin = applicationPlugins.find(value => value.id === CANVAS_PLUGIN_ID)
    if (!plugin) return false
    try {
      const text = await readFile(join(dirname(this.dataPath), 'application-plugins.json'), 'utf8')
      if (text.length > 32768) return false
      return pluginAvailability(plugin, readPluginSettingsSchema.parse(JSON.parse(text))) === 'enabled'
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' && pluginAvailability(plugin, { revision: 0, disabledIds: [] }) === 'enabled'
    }
  }
  private async assertEnabled(context: EngineContext) {
    context.signal.throwIfAborted()
    if (!await this.enabled()) throw new Error('画板插件已停用或桌面宿主不可用')
    if (context.work?.organization) throw new Error('组织管理阶段不提供画板操作')
    await this.verify?.(context)
    context.signal.throwIfAborted()
  }
  call(raw: unknown, context: EngineContext) {
    const command = canvasAgentRequestSchema.parse(raw)
    const controller = new AbortController(), signal = AbortSignal.any([context.signal, controller.signal])
    const scoped = { ...context, signal }
    const done = this.execute(command, scoped)
    const entry = { runId: context.runId, scope: { employeeId: context.agent.id, conversationId: context.conversation.id }, controller, done }
    this.calls.add(entry)
    void done.finally(() => this.calls.delete(entry)).catch(() => {})
    return done
  }
  private async execute(command: CanvasAgentRequest, context: EngineContext): Promise<unknown> {
    await this.assertEnabled(context)
    const mutating = ['create', 'edit', 'export'].includes(command.action)
    if (mutating) {
      const operation = { kind: 'source' as const, description: `在当前员工画板执行 ${command.action}` }
      if (!context.agent.executionPermission) {
        if (!context.approveOperation || !await context.approveOperation(operation)) throw new Error('画板修改尚未获批，操作未执行')
      } else await authorizeExecution(context, operation)
      await this.assertEnabled(context)
      await context.beforeEffect?.()
    }
    const scope: CanvasScope = { employeeId: context.agent.id, conversationId: context.conversation.id }
    const executionId = randomUUID()
    let cancel: Promise<unknown> | undefined, dispatched = false
    const abort = () => {
      if (dispatched && !cancel) cancel = this.requestHost!({ type: 'cancel', executionId, scope }).catch(() => undefined)
    }
    context.signal.addEventListener('abort', abort, { once: true })
    try {
      await this.assertEnabled(context)
      dispatched = true
      const result = await this.requestHost!({ type: 'call', executionId, scope, command })
      await cancel
      await this.assertEnabled(context)
      if (result && typeof result === 'object' && 'cancelled' in result) throw new Error('画板操作已取消；请核对原 operationId 回执，不要重放')
      let output: unknown = result
      if (command.action === 'create' || command.action === 'edit') {
        const mutation = result as CanvasMutationResult
        const { document: _document, ...board } = mutation.board
        output = { board, receipt: mutation.receipt, replayed: mutation.replayed }
      } else if (command.action === 'export') {
        const exported = result as CanvasExportResult
        if (exported.boardId !== command.boardId || exported.revision !== command.revision) throw new Error('画板导出回执与请求版本不符')
        output = await this.stageExport(exported, context)
      }
      if (mutating) await context.afterEffect?.()
      return output
    } finally { context.signal.removeEventListener('abort', abort); await cancel }
  }
  private async stageExport(result: CanvasExportResult, context: EngineContext) {
    if (!result || typeof result.base64 !== 'string' || result.base64.length > Math.ceil(PUBLISHABLE_BYTES * 4 / 3) + 4 || !/^[a-f0-9]{64}$/.test(result.sha256) || !Number.isSafeInteger(result.bytes) || result.bytes < 1 || result.bytes > Math.min(CANVAS_LIMITS.exportBytes, PUBLISHABLE_BYTES)) throw new Error('画板导出超过原成果大小限制或回执无效')
    if (!context.workspace) throw new Error('当前执行尚未准备受管工作区，画板已保留，请在原任务会话导出')
    const bytes = Buffer.from(result.base64, 'base64')
    if (!bytes.length || bytes.length !== result.bytes || createHash('sha256').update(bytes).digest('hex') !== result.sha256) throw new Error('画板导出文件与实际字节 hash 不符')
    if (!['png', 'svg', 'tldr'].includes(result.format) || ({ png: 'image/png', svg: 'image/svg+xml', tldr: 'application/vnd.tldraw+json' })[result.format] !== result.mimeType) throw new Error('不支持的画板导出格式')
    const workspace = await initializeWorkspace(context)
    const relative = `runs/${context.runId}/canvas/${result.sha256}.${result.format}`
    const target = resolve(workspace.root, relative)
    const verify = async () => { await this.assertEnabled(context); await assertTaskPathAccess(context, target, 'write') }
    await verify()
    try { await writeWorkspaceFile(workspace.root, relative, bytes, null, context.signal, verify) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // Re-export never overwrites a file. Only the same immutable bytes may reuse it.
      const file = await open(await workspaceTarget(workspace.root, relative), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.nlink !== 1 || stat.size !== bytes.length) throw new Error('画板导出目标已被外部修改，原文件保留')
        const saved = await file.readFile(), after = await file.stat()
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || createHash('sha256').update(saved).digest('hex') !== result.sha256) throw new Error('画板导出目标已被外部修改，原文件保留')
      } finally { await file.close() }
    }
    await verify()
    const { base64, boardId, revision, documentHash, format, mimeType, filename, sha256 } = result
    const metadata = { boardId, revision, documentHash, format, mimeType, filename, sha256, bytes: bytes.length }
    const inlineImage = result.format === 'png' && base64.length <= MODEL_IMAGE_BASE64_LIMIT
    return { ...metadata, logicalPath: `self:/${relative}`, delivery: 'not_published',
      ...(inlineImage ? { content: [{ type: 'image', mimeType: 'image/png', data: base64 }] } : result.format === 'png' ? { imageOmitted: 'model_image_limit' } : {}) }
  }
  /** Called only after the source deletion journal has persisted its cleanup identity. */
  cleanup(filter: CanvasScopeFilter, cleanupId: string): Promise<void> {
    const envelope = canvasHostEnvelopeSchema.parse({ type: 'discard', filter, cleanupId })
    if (envelope.type !== 'discard') throw new Error('无效画板清理请求')
    if (this.closing) return Promise.reject(new Error('画板服务正在退出，原清理将在重启后继续'))
    const done = (async () => {
      await this.stopCalls(undefined, envelope.filter)
      let result: CanvasHostResponse
      if (this.requestHost && this.hostAvailable()) result = await this.requestHost(envelope)
      else {
        // Source deletion must work while the optional plugin or desktop is absent.
        // Never retry a dispatched host request through this fallback: its outcome may be unknown.
        this.cleanupHost ??= new CanvasHost({ rootDirectory: join(this.dataPath, 'canvases'), authorize: async () => {}, enabled: () => false, execute: async () => { throw new Error('离线清理不执行画板命令') } })
        result = await this.cleanupHost.discardScope(envelope.filter, envelope.cleanupId)
      }
      if (!result || typeof result !== 'object' || !('preserved' in result) || !Array.isArray(result.preserved) || !('deletedBoards' in result) || !Array.isArray(result.deletedBoards)) throw new Error('画板清理回执无效，原清理身份已保留')
      if (result.preserved.length) throw new Error(`画板清理未完成，外改或未知文件已保留：${result.preserved.join('；')}`)
    })()
    this.cleanups.add(done)
    void done.finally(() => this.cleanups.delete(done)).catch(() => {})
    return done
  }
  private async stopCalls(runId?: string, filter?: CanvasScopeFilter) {
    const entries = [...this.calls].filter(entry => (runId === undefined || entry.runId === runId) && (!filter?.employeeId || entry.scope.employeeId === filter.employeeId) && (!filter?.conversationId || entry.scope.conversationId === filter.conversationId))
    for (const entry of entries) entry.controller.abort(new Error('画板操作已取消；请核对原请求回执'))
    await Promise.allSettled(entries.map(entry => entry.done))
  }
  async refresh() { if (!await this.enabled()) await this.stopCalls() }
  closeRun(runId: string) { return this.stopCalls(runId) }
  async close() { this.closing = true; await this.stopCalls(); await Promise.allSettled([...this.cleanups]); await this.cleanupHost?.close() }
}
