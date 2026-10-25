/*
 * [INPUT]: Original SQLite store, saved connection/vault callbacks and authorized task image bytes.
 * [OUTPUT]: Explicit revisioned image model selection, bounded single-request generation/editing; no fallback or URL fetch.
 * [POS]: Host media capability. Task runtime owns source access, file writes and publication.
 * [PROTOCOL]: Update Header and media/.folder.md on change.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Connection } from '@boai/shared/domain'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import { materialImageMimeType } from '@boai/shared/node/material-files'

const size = z.string().regex(/^(auto|[1-9]\d{1,3}x[1-9]\d{1,3})$/)
const id = z.string().trim().min(1).max(200)
const selection = z.object({ connectionId: id, connectionRevision: z.number().int().positive(), model: z.string().trim().min(1).max(1000).regex(/^[^\x00-\x1f\x7f]+$/), protocol: z.literal('openai-images'), defaultSize: size.optional(), responseFormat: z.enum(['native', 'b64_json']).default('native') }).strict()
const update = z.object({ expectedRevision: z.number().int().nonnegative(), selection: selection.nullable() }).strict()
export interface ImageSettings { revision: number; selection: z.infer<typeof selection> | null }
export const imageRequestSchema = z.object({ prompt: z.string().trim().min(1).max(32000), size: size.optional(), background: z.enum(['auto', 'transparent', 'opaque']).optional(), quality: z.enum(['auto', 'low', 'medium', 'high']).optional(), outputFormat: z.enum(['jpeg', 'webp']).optional() }).strict()
export const imageToolRequestSchema = imageRequestSchema.omit({ outputFormat: true }).extend({ path: z.string().min(1), references: z.array(z.string().min(1)).max(4).default([]) }).strict()
export type ImageRequest = z.infer<typeof imageRequestSchema>
export interface ImageBytes { bytes: Uint8Array; mimeType: string }
export interface ImageResult { bytes: Uint8Array; mimeType: string; contentHash: string; source: { connectionId: string; connectionRevision: number; settingsRevision: number; model: string }; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }
export interface ImageCapability {
  settings(): Promise<ImageSettings & { ready: boolean; reason?: string }>
  generate(input: ImageRequest, references: ImageBytes[]): Promise<ImageResult>
  verify(source: ImageResult['source']): Promise<void>
}
const collection = 'imageSettings', key = 'default', MAX_INPUT = 8 * 1024 * 1024, MAX_OUTPUT = 20 * 1024 * 1024
const invalid = (message: string): never => { throw new ApplicationValidationError('INVALID_INPUT', message) }
export function imageEndpoint(connection: Connection, edit: boolean) {
  if (connection.provider === 'anthropic' || connection.gateway?.protocol === 'messages') return invalid('此连接不提供 OpenAI Images 协议')
  const url = new URL(connection.baseUrl || (connection.provider === 'openai' ? 'https://api.openai.com/v1' : ''))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return invalid('生图连接地址必须是无凭据、查询或片段的 HTTP(S) API 根地址')
  // Never reinterpret a chat/completions/Responses endpoint as an image endpoint.
  if (/\/(chat\/completions|responses|messages|images(?:\/[^/]+)?)\/?$/.test(url.pathname)) return invalid('请为生图连接填写 API 根地址，而不是聊天或图片方法地址')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/images/${edit ? 'edits' : 'generations'}`
  return url.href
}
export class ImageService {
  private pending = new Map<AbortController, string>()
  constructor(private store: ProductStore, private host: {
    connection(id: string): Promise<Connection | undefined>
    credential(connection: Connection): Promise<string>
    critical<T>(action: () => Promise<T>): Promise<T>
    changed(): void
    fetch?: typeof fetch
  }) {}
  private async read(): Promise<ImageSettings> { return await this.store.get<ImageSettings>(collection, key) ?? { revision: 0, selection: null } }
  private async source(settings: ImageSettings) {
    const selected = settings.selection
    if (!selected) return invalid('尚未选择生图模型；请先配置 images.configure，聊天模型不会自动用于生图')
    const connection = await this.host.connection(selected.connectionId)
    if (!connection || (connection.revision ?? 1) !== selected.connectionRevision) return invalid('生图连接已删除或改变，请重新选择并确认当前连接版本')
    imageEndpoint(connection, false)
    return connection
  }
  async settings(): Promise<ImageSettings & { ready: boolean; reason?: string }> {
    const settings = await this.read()
    try { await this.source(settings); return { ...settings, ready: true } }
    catch (error) { return { ...settings, ready: false, reason: error instanceof ApplicationValidationError ? error.message : '生图连接不可用，请检查设置' } }
  }
  cancelConnection(id: string) { for (const [controller, connectionId] of this.pending) if (connectionId === id) controller.abort(new Error('生图连接已改变')) }
  async verify(source: ImageResult['source']) {
    const settings = await this.read()
    if (settings.revision !== source.settingsRevision || settings.selection?.connectionId !== source.connectionId || settings.selection.connectionRevision !== source.connectionRevision || settings.selection.model !== source.model) throw new Error('生图来源已改变，不能保存旧请求结果')
    await this.source(settings)
  }
  operations(): ApplicationOperation[] {
    return [
      { name: 'images.settings', description: '读取独立生图模型选择和 revision；ready 只说明配置可用，不是远程生成验证。没有默认提供方，不回退聊天模型。', effect: 'read', input: z.object({}).strict(), resultType: 'ImageSettings & { ready: boolean; reason?: string }', execute: () => this.settings() },
      { name: 'images.configure', description: '按 revision 保存用户明确选择的生图连接、连接版本和模型。selection:null 清除选择；不生成图片、不修改聊天模型。', effect: 'write', input: update, resultType: 'ImageSettings', execute: input => this.host.critical(async () => {
        const value = update.parse(input), current = await this.read()
        if (current.revision !== value.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '生图设置已改变，请先读取当前版本')
        const next: ImageSettings = { revision: current.revision + 1, selection: value.selection }
        if (next.selection) await this.source(next)
        await this.store.write([{ collection, id: key, value: next }])
        for (const controller of this.pending.keys()) controller.abort(new Error('生图设置已改变'))
        this.host.changed(); return next
      }) },
    ]
  }
  async generate(raw: ImageRequest, references: ImageBytes[], signal: AbortSignal, validate: () => Promise<void>): Promise<ImageResult> {
    const input = imageRequestSchema.parse(raw)
    signal.throwIfAborted(); await validate()
    if (references.length > 4 || references.reduce((n, value) => n + value.bytes.byteLength, 0) > MAX_INPUT) return invalid('编辑参考图最多 4 张，合计最多 8 MiB')
    for (const image of references) if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || materialImageMimeType(Buffer.from(image.bytes)) !== image.mimeType) return invalid('参考图必须是实际 PNG、JPEG 或 WebP 字节')
    const settings = await this.read(), connection = await this.source(settings), selected = settings.selection!
    const credential = await this.host.credential(connection), controller = new AbortController()
    this.pending.set(controller, connection.id)
    const effective = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(180_000)])
    const current = async () => {
      effective.throwIfAborted(); await validate()
      if ((await this.read()).revision !== settings.revision) throw new Error('生图设置已改变')
      await this.source(settings)
    }
    try {
      await current()
      const fields = { model: selected.model, prompt: input.prompt, n: 1, ...(input.size ?? selected.defaultSize ? { size: input.size ?? selected.defaultSize } : {}), ...(input.background ? { background: input.background } : {}), ...(input.quality ? { quality: input.quality } : {}), ...(input.outputFormat ? { output_format: input.outputFormat } : {}), ...(selected.responseFormat === 'b64_json' ? { response_format: 'b64_json' } : {}) }
      let body: string | FormData
      if (references.length) {
        body = new FormData()
        for (const [name, value] of Object.entries(fields)) body.append(name, String(value))
        references.forEach((image, index) => (body as FormData).append('image[]', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `reference-${index}.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1]}`))
      } else body = JSON.stringify(fields)
      let response: Response
      try { response = await (this.host.fetch ?? fetch)(imageEndpoint(connection, !!references.length), { method: 'POST', redirect: 'error', signal: effective, headers: { Accept: 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, body }) }
      catch { throw new Error(effective.aborted ? '图片请求已停止；远端结果未知，未重试' : '图片提供方连接未完成；结果未知，未重试') }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`图片提供方返回 HTTP ${response.status}；未重试或切换模型`) }
      if (!response.body) throw new Error('图片提供方没有返回正文')
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > Math.ceil(MAX_OUTPUT * 4 / 3) + 65536) throw new Error('图片返回超过 20 MiB 上限'); chunks.push(part.value) }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      let result: { data?: { b64_json?: string }[]; usage?: ImageResult['usage'] }
      try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('图片提供方返回格式无效') }
      const encoded = result.data?.length === 1 ? result.data[0]?.b64_json : undefined
      if (typeof encoded !== 'string' || !encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('图片提供方未返回单张 base64 图片；不抓取任意返回 URL')
      const bytes = Buffer.from(encoded, 'base64'), mimeType = materialImageMimeType(bytes)
      if (!bytes.length || bytes.length > MAX_OUTPUT || !mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('图片提供方没有返回支持的栅格文件')
      await current()
      const usage = Object.fromEntries(Object.entries(result.usage ?? {}).filter(([key, value]) => ['input_tokens', 'output_tokens', 'total_tokens'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0))
      return { bytes, mimeType, contentHash: createHash('sha256').update(bytes).digest('hex'), source: { connectionId: connection.id, connectionRevision: connection.revision ?? 1, settingsRevision: settings.revision, model: selected.model }, ...(Object.keys(usage).length ? { usage } : {}) }
    } finally { this.pending.delete(controller) }
  }
}
