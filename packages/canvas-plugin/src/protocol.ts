/*
 * [INPUT]: Authenticated employee/work scope, bounded document changes and explicit editor operations.
 * [OUTPUT]: Shared canvas contracts with bounded embedded raster signatures and persisted operation receipts.
 * [POS]: Platform-neutral canvas protocol; document data never becomes executable code.
 * [PROTOCOL]: Update Header and src/.folder.md when this interface changes.
 */
import { z } from 'zod'

export const CANVAS_PLUGIN_ID = 'boai.canvas.tldraw'
export const CANVAS_SDK_VERSION = '5.6.0'
export const CANVAS_LIMITS = Object.freeze({
  records: 10_000, assets: 64, operations: 100, changedRecords: 2_000,
  assetBytes: 8 * 1024 * 1024, totalAssetBytes: 16 * 1024 * 1024,
  documentBytes: 24 * 1024 * 1024, readBytes: 256 * 1024,
  exportBytes: 32 * 1024 * 1024, imageDimension: 16_384, imagePixels: 64 * 1024 * 1024,
  receipts: 10_000, boards: 1_000, readRecords: 200,
})

const identity = z.string().min(1).max(256).refine(value => !value.includes('\0'))
export const canvasScopeSchema = z.object({ employeeId: identity, conversationId: identity.optional() }).strict()
export type CanvasScope = z.infer<typeof canvasScopeSchema>
export const canvasBoardIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,100}$/)
export const canvasRecordIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_:-]+$/)
export const canvasOperationIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const finiteCoordinate = z.number().finite().min(-1_000_000).max(1_000_000)

export type CanvasRecord = { id: string; typeName: 'document' | 'page' | 'shape' | 'binding' | 'asset' | 'user'; [key: string]: unknown }
export interface CanvasDocument { store: Record<string, CanvasRecord>; schema: Record<string, unknown> }
export interface CanvasChanges {
  added: Record<string, CanvasRecord>
  updated: Record<string, [CanvasRecord, CanvasRecord]>
  removed: Record<string, CanvasRecord>
}
const recordSchema = z.object({ id: canvasRecordIdSchema, typeName: z.enum(['document', 'page', 'shape', 'binding', 'asset', 'user']) }).catchall(z.unknown())
export const canvasDocumentSchema = z.object({ store: z.record(z.string(), recordSchema), schema: z.record(z.string(), z.unknown()) }).strict()
export const canvasChangesSchema = z.object({
  added: z.record(z.string(), recordSchema),
  updated: z.record(z.string(), z.tuple([recordSchema, recordSchema])),
  removed: z.record(z.string(), recordSchema),
}).strict()
const shapeTypes = z.enum(['geo', 'text', 'arrow', 'image', 'note', 'frame', 'line'])
const shapeCreate = z.object({
  id: canvasRecordIdSchema, type: shapeTypes, x: finiteCoordinate.optional(), y: finiteCoordinate.optional(),
  rotation: z.number().finite().optional(), parentId: canvasRecordIdSchema.optional(),
  props: z.record(z.string(), z.unknown()).optional(),
}).strict()
const shapeUpdate = shapeCreate.partial().extend({ id: canvasRecordIdSchema }).strict()
const shapeIds = z.array(canvasRecordIdSchema).min(1).max(200)
export const canvasOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), shapes: z.array(shapeCreate).min(1).max(200) }).strict(),
  z.object({ type: z.literal('update'), shapes: z.array(shapeUpdate).min(1).max(200) }).strict(),
  z.object({ type: z.literal('delete'), shapeIds }).strict(),
  z.object({ type: z.literal('connect'), arrowId: canvasRecordIdSchema, fromShapeId: canvasRecordIdSchema, toShapeId: canvasRecordIdSchema }).strict(),
  z.object({ type: z.literal('group'), shapeIds, groupId: canvasRecordIdSchema }).strict(),
  z.object({ type: z.literal('ungroup'), shapeIds }).strict(),
  z.object({ type: z.literal('image'), id: canvasRecordIdSchema, assetId: canvasRecordIdSchema, src: z.string().max(Math.ceil(CANVAS_LIMITS.assetBytes * 4 / 3) + 100), width: z.number().positive().max(CANVAS_LIMITS.imageDimension), height: z.number().positive().max(CANVAS_LIMITS.imageDimension), x: finiteCoordinate.optional(), y: finiteCoordinate.optional() }).strict(),
])
export type CanvasOperation = z.infer<typeof canvasOperationSchema>

export const canvasRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('create'), operationId: canvasOperationIdSchema, title: z.string().trim().min(1).max(160).default('画板') }).strict(),
  z.object({ action: z.literal('open'), boardId: canvasBoardIdSchema }).strict(),
  z.object({ action: z.literal('read'), boardId: canvasBoardIdSchema, pageId: canvasRecordIdSchema.optional(), shapeIds: shapeIds.optional(), offset: z.number().int().nonnegative().max(CANVAS_LIMITS.records).default(0), limit: z.number().int().positive().max(CANVAS_LIMITS.readRecords).default(100) }).strict(),
  z.object({ action: z.literal('commit'), boardId: canvasBoardIdSchema, expectedRevision: revision, operationId: canvasOperationIdSchema, changes: canvasChangesSchema }).strict(),
  z.object({ action: z.literal('edit'), boardId: canvasBoardIdSchema, expectedRevision: revision, operationId: canvasOperationIdSchema, operations: z.array(canvasOperationSchema).min(1).max(CANVAS_LIMITS.operations) }).strict(),
  z.object({ action: z.literal('export'), boardId: canvasBoardIdSchema, revision, format: z.enum(['png', 'svg', 'tldr']), pageId: canvasRecordIdSchema.optional(), shapeIds: shapeIds.optional() }).strict(),
  z.object({ action: z.literal('import'), operationId: canvasOperationIdSchema, title: z.string().trim().min(1).max(160).default('导入的画板'), file: z.string().min(1).max(CANVAS_LIMITS.documentBytes) }).strict(),
  z.object({ action: z.literal('receipt'), boardId: canvasBoardIdSchema, operationId: canvasOperationIdSchema }).strict(),
])
export type CanvasRequest = z.infer<typeof canvasRequestSchema>
export type CanvasRequestInput = z.input<typeof canvasRequestSchema>

export interface CanvasReceipt {
  operationId: string
  boardId: string
  previousRevision: number | null
  revision: number
  documentHash: string
  changedRecordIds: string[]
  committedAt: string
}
export interface CanvasBoardSummary {
  boardId: string
  owner: CanvasScope
  title: string
  revision: number
  documentHash: string
  createdAt: string
  updatedAt: string
}
export interface CanvasBoard extends CanvasBoardSummary { document: CanvasDocument }
export interface CanvasReadResult extends CanvasBoardSummary {
  records: CanvasRecord[]
  total: number
  truncated: boolean
  nextOffset?: number
}
export interface CanvasMutationResult { board: CanvasBoard; receipt: CanvasReceipt; replayed: boolean }
export interface CanvasDiscardResult {
  deletedBoards: { scope: CanvasScope; boardId: string }[]
  /** Relative managed paths left untouched because identity, schema or hashes could not be verified. */
  preserved: string[]
}
export interface CanvasExportResult {
  boardId: string; revision: number; documentHash: string
  format: 'png' | 'svg' | 'tldr'; mimeType: 'image/png' | 'image/svg+xml' | 'application/vnd.tldraw+json'
  filename: string; base64: string; bytes: number; sha256: string
  /** Managed export copy; callers publish bytes through the original artifact workflow. */
  path: string
}
export interface CanvasResponseMap {
  list: CanvasBoardSummary[]
  create: CanvasMutationResult
  open: CanvasBoard
  read: CanvasReadResult
  commit: CanvasMutationResult
  edit: CanvasMutationResult
  export: CanvasExportResult
  import: CanvasMutationResult
  receipt: CanvasReceipt | null
}
export type CanvasResponse = CanvasResponseMap[keyof CanvasResponseMap]

export type CanvasExecution =
  | { action: 'init' }
  | { action: 'validate'; document: CanvasDocument }
  | { action: 'edit'; document: CanvasDocument; operations: CanvasOperation[] }
  | { action: 'import'; file: string }
  | { action: 'export'; document: CanvasDocument; format: 'png' | 'svg' | 'tldr'; pageId?: string; shapeIds?: string[] }
export type CanvasExecutionResult =
  | { document: CanvasDocument }
  | { format: 'png' | 'svg' | 'tldr'; base64: string }
export type CanvasExecutor = (request: CanvasExecution, signal: AbortSignal) => Promise<CanvasExecutionResult>

export type CanvasErrorCode = 'DISABLED' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'OPERATION_CONFLICT' | 'INVALID_DOCUMENT' | 'LIMIT_EXCEEDED' | 'CANCELLED' | 'IO_ERROR' | 'EXTERNAL_CHANGE' | 'RENDER_FAILED'
export class CanvasError extends Error {
  constructor(readonly code: CanvasErrorCode, message: string) { super(message); this.name = 'CanvasError' }
}

/** Validate data without invoking getters, downloading URLs or executing imported content. */
export function validateCanvasJson(value: unknown, maxBytes = CANVAS_LIMITS.documentBytes): void {
  let nodes = 0
  const seen = new Set<object>()
  const visit = (item: unknown, depth: number) => {
    if (++nodes > 200_000 || depth > 40) throw new CanvasError('LIMIT_EXCEEDED', '画板数据层级或记录数量超过限制')
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (!item || typeof item !== 'object') throw new CanvasError('INVALID_DOCUMENT', '画板只接受 JSON 数据')
    if (seen.has(item)) throw new CanvasError('INVALID_DOCUMENT', '画板数据不能包含循环引用')
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new CanvasError('INVALID_DOCUMENT', '画板只接受普通数据对象')
    seen.add(item)
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor' || !('value' in descriptor)) throw new CanvasError('INVALID_DOCUMENT', '画板包含不支持的数据属性')
      if (key !== 'length' || !Array.isArray(item)) visit(descriptor.value, depth + 1)
    }
    seen.delete(item)
  }
  visit(value, 0)
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) throw new CanvasError('LIMIT_EXCEEDED', '画板内容超过大小限制')
}

/** Only durable, bounded local raster assets are supported; remote/blob URLs never persist. */
export function validateCanvasAssetSource(src: unknown): { mimeType: string; bytes: number } {
  if (typeof src !== 'string') throw new CanvasError('INVALID_DOCUMENT', '图片缺少持久资源')
  if (src.length > Math.ceil(CANVAS_LIMITS.assetBytes * 4 / 3) + 100) throw new CanvasError('LIMIT_EXCEEDED', '单张画板图片不能超过 8 MiB')
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(src)
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new CanvasError('INVALID_DOCUMENT', '画板图片仅支持嵌入的 PNG、JPEG、WebP 或 GIF；不自动下载远端资源')
  const bytes = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)
  if (bytes > CANVAS_LIMITS.assetBytes) throw new CanvasError('LIMIT_EXCEEDED', '单张画板图片不能超过 8 MiB')
  // Read at most 18 decoded bytes here. The renderer still decodes the complete
  // image and checks dimensions; a browser's MIME sniffing cannot override the
  // persisted asset's declared format.
  const prefix = atob(match[2].slice(0, 24))
  const startsWithBytes = (signature: number[]) => signature.every((byte, index) => prefix.charCodeAt(index) === byte)
  const validSignature = match[1] === 'image/png' ? startsWithBytes([137, 80, 78, 71, 13, 10, 26, 10])
    : match[1] === 'image/jpeg' ? startsWithBytes([255, 216, 255])
      : match[1] === 'image/gif' ? prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')
        : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
  if (!validSignature) throw new CanvasError('INVALID_DOCUMENT', '图片实际文件类型与资源声明不一致')
  return { mimeType: match[1]!, bytes }
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  validateCanvasJson(value)
  const parsed = canvasDocumentSchema.safeParse(value)
  if (!parsed.success) throw new CanvasError('INVALID_DOCUMENT', '画板文档格式无效或包含视图状态')
  const document = parsed.data
  const records = Object.entries(document.store)
  if (records.length > CANVAS_LIMITS.records) throw new CanvasError('LIMIT_EXCEEDED', '画板记录数超过 10,000')
  let assets = 0, assetBytes = 0
  for (const [id, record] of records) {
    if (id !== record.id) throw new CanvasError('INVALID_DOCUMENT', '画板记录身份与索引不符')
    if (record.typeName === 'user' && record.imageUrl !== '') throw new CanvasError('INVALID_DOCUMENT', '画板用户记录不加载外部头像')
    if (record.typeName !== 'asset') continue
    if (++assets > CANVAS_LIMITS.assets || record.type !== 'image') throw new CanvasError('INVALID_DOCUMENT', '画板仅支持最多 64 个图片资源')
    const props = record.props as Record<string, unknown> | undefined
    const asset = validateCanvasAssetSource(props?.src)
    assetBytes += asset.bytes
    if (assetBytes > CANVAS_LIMITS.totalAssetBytes) throw new CanvasError('LIMIT_EXCEEDED', '画板图片总大小不能超过 16 MiB')
    const width = props?.w, height = props?.h
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0 || width > CANVAS_LIMITS.imageDimension || height > CANVAS_LIMITS.imageDimension || width * height > CANVAS_LIMITS.imagePixels) throw new CanvasError('LIMIT_EXCEEDED', '画板图片尺寸超过限制')
    if (props?.mimeType !== asset.mimeType) throw new CanvasError('INVALID_DOCUMENT', '图片类型与资源内容声明不符')
  }
  for (const record of Object.values(document.store)) {
    if (record.typeName === 'shape' && record.type === 'image') {
      const props = record.props as Record<string, unknown> | undefined
      if (typeof props?.assetId !== 'string' || document.store[props.assetId]?.typeName !== 'asset') throw new CanvasError('INVALID_DOCUMENT', '画板图片引用的资源不存在')
    }
    if (record.typeName === 'shape' && ['video', 'embed', 'bookmark'].includes(String(record.type))) throw new CanvasError('INVALID_DOCUMENT', '此画板不支持远程媒体或嵌入网页')
  }
  return document
}

/** Trusted source lifecycle filters never come from employee tool input. */
export const canvasScopeFilterSchema = z.object({ employeeId: identity.optional(), conversationId: identity.optional() }).strict()
  .refine(value => !!value.employeeId || !!value.conversationId, 'Canvas cleanup requires an employee or conversation')
export type CanvasScopeFilter = z.infer<typeof canvasScopeFilterSchema>

/** Same-profile runtime bridge. Cancellation and durable source cleanup retain their original identity. */
export const canvasHostEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('call'), executionId: canvasOperationIdSchema, scope: canvasScopeSchema, command: canvasRequestSchema }).strict(),
  z.object({ type: z.literal('cancel'), executionId: canvasOperationIdSchema, scope: canvasScopeSchema }).strict(),
  z.object({ type: z.literal('discard'), filter: canvasScopeFilterSchema, cleanupId: canvasOperationIdSchema }).strict(),
])
export type CanvasHostEnvelope = z.infer<typeof canvasHostEnvelopeSchema>
export type CanvasHostResponse = CanvasResponse | CanvasDiscardResult | { cancelled: true }
