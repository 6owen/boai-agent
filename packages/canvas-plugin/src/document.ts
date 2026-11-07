/*
 * [INPUT]: Scoped canvas intents, SDK documents and conditional local record changes.
 * [OUTPUT]: Atomic document/receipt commits and frozen source cleanup with retryable preserved-file checks.
 * [POS]: Node canvas repository; neither renderer state nor remote resources are authoritative.
 * [PROTOCOL]: Update Header and src/.folder.md when this interface changes.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { createTLSchema, type TLRecord } from '@tldraw/tlschema'
import type { SerializedSchema, SerializedStore } from 'tldraw'
import {
  CANVAS_LIMITS, CANVAS_SDK_VERSION, CanvasError, canvasBoardIdSchema, canvasChangesSchema,
  canvasOperationIdSchema, canvasScopeSchema, canvasScopeFilterSchema, validateCanvasDocument, validateCanvasJson,
  type CanvasBoard, type CanvasBoardSummary, type CanvasChanges, type CanvasDocument,
  type CanvasDiscardResult, type CanvasMutationResult, type CanvasReadResult, type CanvasReceipt, type CanvasRecord, type CanvasScope, type CanvasScopeFilter,
} from './protocol'

const MAX_FILE_BYTES = 40 * 1024 * 1024
const schema = createTLSchema()
interface StoredReceipt { fingerprint: string; receipt: CanvasReceipt }
interface StoredBoard { schemaVersion: 1; sdkVersion: string; board: CanvasBoard; receipts: StoredReceipt[]; integrity?: string }
interface CanvasTombstone { schemaVersion: 1; kind: 'deleted'; boardId: string; owner: CanvasScope; deletedAt: string; cleanupId: string; integrity?: string }
interface CanvasCleanupPlan {
  schemaVersion: 1; kind: 'cleanup'; cleanupId: string; filter: CanvasScopeFilter
  targets: { scope: CanvasScope; boardId: string; fileHash: string }[]
  preserved: string[]; integrity?: string
}
interface LoadedBoard { value: StoredBoard; fileHash: string }
export interface CanvasRepositoryOptions {
  beforeCommit?: (scope: CanvasScope) => Promise<void>
  /** Test/fault injection boundary before rename; never runs after a durable commit. */
  beforeRename?: (path: string) => Promise<void>
}
export interface CanvasCreateIntent {
  operationId: string; title: string; intent: unknown
  initialize: () => Promise<CanvasDocument>
}
export interface CanvasMutationIntent {
  boardId: string; expectedRevision: number; operationId: string; intent: unknown
  mutate: (document: CanvasDocument) => Promise<CanvasDocument> | CanvasDocument
}

export function canvasCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canvasCanonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canvasCanonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function canvasHash(value: unknown): string { return createHash('sha256').update(canvasCanonicalJson(value)).digest('hex') }
export function canvasBytesHash(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex') }
export function canvasScopeKey(scope: CanvasScope): string {
  const value = canvasScopeSchema.parse(scope)
  return canvasHash({ employeeId: value.employeeId, ...(value.conversationId ? { conversationId: value.conversationId } : {}) })
}
export function canvasCreationId(scope: CanvasScope, operationId: string): string {
  return `board-${canvasHash({ scope: canvasScopeKey(scope), operationId: canvasOperationIdSchema.parse(operationId) }).slice(0, 32)}`
}
export function canvasSummary(board: CanvasBoard): CanvasBoardSummary {
  const { document: _document, ...summary } = board
  return structuredClone(summary)
}
function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new CanvasError('CANCELLED', '画板操作已取消，已提交结果可通过原操作编号核对')
}
function sameScope(left: CanvasScope, right: CanvasScope) { return left.employeeId === right.employeeId && left.conversationId === right.conversationId }

/** Validate with the pinned SDK in Node; no Editor, DOM or renderer is needed for hand gestures. */
export function validateCanvasSdkDocument(input: unknown): CanvasDocument {
  const document = validateCanvasDocument(input)
  try {
    const migrated = schema.migrateStoreSnapshot({ schema: document.schema as unknown as SerializedSchema, store: document.store as unknown as SerializedStore<TLRecord> })
    if (migrated.type !== 'success') throw new Error('schema migration failed')
    for (const record of Object.values(migrated.value)) {
      const recordType = schema.types[record.typeName]
      if (!recordType || recordType.scope !== 'document') throw new Error('non-document record')
      recordType.validate(record)
    }
    const normalized: CanvasDocument = { store: migrated.value as unknown as Record<string, CanvasRecord>, schema: schema.serialize() as unknown as Record<string, unknown> }
    validateCanvasDocument(normalized)
    validateRelations(normalized)
    return normalized
  } catch (error) {
    if (error instanceof CanvasError) throw error
    throw new CanvasError('INVALID_DOCUMENT', '画板未通过当前 tldraw 版本校验；原文件保持不变')
  }
}

function validateRelations(document: CanvasDocument) {
  const records = Object.values(document.store)
  if (records.filter(record => record.typeName === 'document').length !== 1 || document.store['document:document']?.typeName !== 'document') throw new CanvasError('INVALID_DOCUMENT', '画板必须有一个文档记录')
  if (!records.some(record => record.typeName === 'page')) throw new CanvasError('INVALID_DOCUMENT', '画板至少保留一个页面')
  for (const record of records) {
    if (record.typeName === 'shape') {
      const visited = new Set<string>([record.id])
      let parent = document.store[String(record.parentId)]
      while (parent?.typeName === 'shape') {
        if (visited.has(parent.id)) throw new CanvasError('INVALID_DOCUMENT', '画板形状不能循环分组')
        visited.add(parent.id)
        if (!['group', 'frame'].includes(String(parent.type))) throw new CanvasError('INVALID_DOCUMENT', '画板形状父级必须是页面、分组或框架')
        parent = document.store[String(parent.parentId)]
      }
      if (parent?.typeName !== 'page') throw new CanvasError('INVALID_DOCUMENT', '画板形状缺少所属页面')
    }
    if (record.typeName === 'binding' && (document.store[String(record.fromId)]?.typeName !== 'shape' || document.store[String(record.toId)]?.typeName !== 'shape')) throw new CanvasError('INVALID_DOCUMENT', '画板连接引用了不存在的形状')
  }
}

export function applyCanvasChanges(document: CanvasDocument, input: CanvasChanges): CanvasDocument {
  validateCanvasJson(input)
  const changes = canvasChangesSchema.parse(input)
  const ids = [...Object.keys(changes.added), ...Object.keys(changes.updated), ...Object.keys(changes.removed)]
  if (ids.length > CANVAS_LIMITS.changedRecords) throw new CanvasError('LIMIT_EXCEEDED', '单次画板修改记录过多')
  if (new Set(ids).size !== ids.length) throw new CanvasError('INVALID_DOCUMENT', '同一批修改不能重复指定同一记录')
  const next = structuredClone(document)
  for (const [id, record] of Object.entries(changes.added)) {
    if (record.id !== id || Object.hasOwn(next.store, id)) throw new CanvasError('CONFLICT', '新建的画板记录已存在，请重新读取画板')
    next.store[id] = record
  }
  for (const [id, [before, after]] of Object.entries(changes.updated)) {
    if (before.id !== id || after.id !== id || !Object.hasOwn(next.store, id) || canvasCanonicalJson(next.store[id]) !== canvasCanonicalJson(before)) throw new CanvasError('CONFLICT', '画板记录已变化，未覆盖后来修改')
    next.store[id] = after
  }
  for (const [id, before] of Object.entries(changes.removed)) {
    if (before.id !== id || !Object.hasOwn(next.store, id) || canvasCanonicalJson(next.store[id]) !== canvasCanonicalJson(before)) throw new CanvasError('CONFLICT', '待删除的画板记录已变化，请重新读取')
    delete next.store[id]
  }
  return next
}

/** One instance belongs to one application host; queues only retain work while it is in flight. */
export class CanvasDocumentRepository {
  private root?: Promise<string>
  private readonly queues = new Map<string, Promise<unknown>>()
  constructor(readonly rootDirectory: string, private readonly options: CanvasRepositoryOptions = {}) {
    if (!isAbsolute(rootDirectory)) throw new Error('Canvas storage requires an absolute managed directory')
  }
  get busy() { return this.queues.size > 0 }
  async drain() { await Promise.allSettled([...this.queues.values()]) }

  private async rootPath() {
    const assertRoot = async () => {
      try {
        const info = await lstat(this.rootDirectory)
        if (info.isSymbolicLink() || !info.isDirectory()) throw new CanvasError('FORBIDDEN', '画板受管根目录不能使用符号链接')
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    this.root ??= (async () => {
      await assertRoot()
      await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 })
      await assertRoot()
      return realpath(this.rootDirectory)
    })()
    const root = await this.root
    await assertRoot()
    if (await realpath(this.rootDirectory) !== root) throw new CanvasError('FORBIDDEN', '画板受管根目录已被替换')
    return root
  }
  private async assertSafe(path: string) {
    const root = await this.rootPath(), tail = relative(root, path)
    if (tail === '..' || tail.startsWith(`..${sep}`) || isAbsolute(tail)) throw new CanvasError('FORBIDDEN', '画板路径超出受管目录')
    let current = root
    for (const part of ['', ...tail.split(sep).filter(Boolean)]) {
      if (part) current = join(current, part)
      try { if ((await lstat(current)).isSymbolicLink()) throw new CanvasError('FORBIDDEN', '画板受管目录不能包含符号链接') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  }
  async scopeDirectory(scope: CanvasScope) {
    const root = await this.rootPath(), key = canvasScopeKey(scope), path = join(root, key)
    return this.serial(`scope-dir:${key}`, async () => {
      await this.assertSafe(path)
      await mkdir(path, { recursive: true, mode: 0o700 })
      await this.assertSafe(path)
      const metadataPath = join(path, 'scope.meta')
      const metadata = await this.readBytes(metadataPath)
      if (metadata) {
        let saved: { schemaVersion: number; owner: CanvasScope }
        try { saved = JSON.parse(metadata.toString()) as typeof saved }
        catch { throw new CanvasError('INVALID_DOCUMENT', '画板工作范围信息损坏') }
        if (saved.schemaVersion !== 1 || !sameScope(canvasScopeSchema.parse(saved.owner), scope)) throw new CanvasError('FORBIDDEN', '画板目录归属不匹配')
      } else {
        const handle = await open(metadataPath, 'wx', 0o600)
        try { await handle.writeFile(JSON.stringify({ schemaVersion: 1, owner: canvasScopeSchema.parse(scope) })); await handle.sync() }
        finally { await handle.close() }
      }
      return path
    })
  }
  private async boardPath(scope: CanvasScope, boardId: string) { return join(await this.scopeDirectory(scope), `${canvasBoardIdSchema.parse(boardId)}.json`) }
  private async serial<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(run)
    this.queues.set(key, current)
    try { return await current } finally { if (this.queues.get(key) === current) this.queues.delete(key) }
  }
  private async readBytes(path: string): Promise<Buffer | null> {
    await this.assertSafe(path)
    let handle
    try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.size > MAX_FILE_BYTES) throw new CanvasError('LIMIT_EXCEEDED', '画板存储文件无效或超过大小限制')
      const buffer = Buffer.alloc(before.size + 1), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const after = await handle.stat(), current = await lstat(path)
      if (bytesRead !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== current.ino || before.dev !== current.dev || before.mtimeMs !== current.mtimeMs || before.ctimeMs !== current.ctimeMs) throw new CanvasError('EXTERNAL_CHANGE', '画板存储文件已被外部修改，请重新打开')
      return buffer.subarray(0, bytesRead)
    } finally { await handle.close() }
  }
  private async load(scope: CanvasScope, boardId: string): Promise<LoadedBoard | null> {
    const bytes = await this.readBytes(await this.boardPath(scope, boardId))
    if (!bytes) return null
    let stored: StoredBoard
    try {
      stored = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as StoredBoard
      this.assertIntegrity(stored)
      if ('kind' in stored && stored.kind === 'deleted') throw new CanvasError('NOT_FOUND', '画板来源已清理，原操作编号不能重建此画板')
      if (stored.schemaVersion !== 1 || !stored.board || !Array.isArray(stored.receipts) || stored.receipts.length > CANVAS_LIMITS.receipts) throw new Error('invalid envelope')
      if (stored.board.boardId !== boardId || !sameScope(canvasScopeSchema.parse(stored.board.owner), scope)) throw new CanvasError('FORBIDDEN', '画板不属于当前工作范围')
      if (!Number.isSafeInteger(stored.board.revision) || stored.board.revision < 0 || typeof stored.board.title !== 'string' || typeof stored.board.createdAt !== 'string' || typeof stored.board.updatedAt !== 'string') throw new Error('invalid identity')
      if (canvasHash(stored.board.document) !== stored.board.documentHash) throw new CanvasError('EXTERNAL_CHANGE', '画板文档校验值不符；原文件保持不变')
      const document = validateCanvasSdkDocument(stored.board.document)
      if (canvasHash(document) !== stored.board.documentHash) throw new CanvasError('INVALID_DOCUMENT', '画板需要显式导入迁移；不会原位覆盖旧版本')
      if (stored.receipts.length !== stored.board.revision + 1) throw new Error('incomplete receipts')
      const operations = new Set<string>()
      for (const [index, saved] of stored.receipts.entries()) {
        const receipt = saved.receipt
        if (!receipt || !/^[a-f0-9]{64}$/.test(saved.fingerprint) || !canvasOperationIdSchema.safeParse(receipt.operationId).success || operations.has(receipt.operationId) || receipt.boardId !== boardId || receipt.revision !== index || receipt.previousRevision !== (index ? index - 1 : null) || !/^[a-f0-9]{64}$/.test(receipt.documentHash) || !Array.isArray(receipt.changedRecordIds) || receipt.changedRecordIds.length > CANVAS_LIMITS.records || receipt.changedRecordIds.some(id => typeof id !== 'string' || id.length > 256) || typeof receipt.committedAt !== 'string') throw new Error('invalid receipt')
        operations.add(receipt.operationId)
      }
      if (stored.receipts.at(-1)!.receipt.documentHash !== stored.board.documentHash) throw new Error('receipt hash mismatch')
    } catch (error) {
      if (error instanceof CanvasError) throw error
      throw new CanvasError('INVALID_DOCUMENT', '画板存储格式损坏；原文件保持不变')
    }
    return { value: stored, fileHash: canvasBytesHash(bytes) }
  }

  private assertIntegrity(value: { integrity?: string }) {
    const { integrity, ...payload } = value
    if (typeof integrity !== 'string' || canvasHash(payload) !== integrity) throw new CanvasError('EXTERNAL_CHANGE', '画板存储校验值不符；原文件保持不变')
  }
  private async save(scope: CanvasScope, stored: StoredBoard, previousHash: string | null, signal?: AbortSignal) {
    return this.writeStored(scope, stored.board.boardId, stored, previousHash, signal)
  }
  private async writeStored(scope: CanvasScope, boardId: string, stored: StoredBoard | CanvasTombstone, previousHash: string | null, signal?: AbortSignal, cleanup = false) {
    const path = await this.boardPath(scope, boardId), temporary = `${path}.${randomUUID()}.tmp`
    const { integrity: _integrity, ...payload } = stored
    const bytes = Buffer.from(JSON.stringify({ ...payload, integrity: canvasHash(payload) }))
    if (bytes.length > MAX_FILE_BYTES) throw new CanvasError('LIMIT_EXCEEDED', '画板与持久操作回执达到大小上限，请创建新画板')
    assertNotAborted(signal)
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      if (!cleanup) await this.options.beforeCommit?.(scope)
      await this.options.beforeRename?.(path)
      assertNotAborted(signal)
      const current = await this.readBytes(path)
      if ((current ? canvasBytesHash(current) : null) !== previousHash) throw new CanvasError('EXTERNAL_CHANGE', '画板存储文件在保存前已变化，未覆盖原文件')
      await this.assertSafe(path)
      assertNotAborted(signal)
      await rename(temporary, path)
      // The rename is the commit point. A later cancellation cannot make this receipt uncommitted.
    } catch (error) {
      if (error instanceof CanvasError) throw error
      throw new CanvasError('IO_ERROR', '画板未能完成原子保存；请用原操作编号核对结果')
    } finally { await rm(temporary, { force: true }) }
  }

  private checkReplay(stored: StoredBoard, operationId: string, fingerprint: string): CanvasMutationResult | undefined {
    const saved = stored.receipts.find(value => value.receipt.operationId === operationId)
    if (!saved) return undefined
    if (saved.fingerprint !== fingerprint) throw new CanvasError('OPERATION_CONFLICT', '同一画板操作编号不能用于不同修改')
    return { board: structuredClone(stored.board), receipt: structuredClone(saved.receipt), replayed: true }
  }

  async create(scopeInput: CanvasScope, input: CanvasCreateIntent, signal?: AbortSignal): Promise<CanvasMutationResult> {
    const scope = canvasScopeSchema.parse(scopeInput), boardId = canvasCreationId(scope, input.operationId)
    validateCanvasJson(input.intent)
    const fingerprint = canvasHash({ title: input.title, intent: input.intent })
    return this.serial(`${canvasScopeKey(scope)}:${boardId}`, async () => {
      assertNotAborted(signal)
      const existing = await this.load(scope, boardId)
      if (existing) {
        const replayed = this.checkReplay(existing.value, input.operationId, fingerprint)
        if (replayed) return replayed
        throw new CanvasError('OPERATION_CONFLICT', '画板创建身份已被另一操作占用')
      }
      if ((await readdir(await this.scopeDirectory(scope))).filter(name => name.endsWith('.json')).length >= CANVAS_LIMITS.boards) throw new CanvasError('LIMIT_EXCEEDED', '当前工作范围画板数已达到上限')
      const document = validateCanvasSdkDocument(await input.initialize()), now = new Date().toISOString()
      const board: CanvasBoard = { boardId, owner: scope, title: input.title, revision: 0, documentHash: canvasHash(document), createdAt: now, updatedAt: now, document }
      const receipt: CanvasReceipt = { operationId: input.operationId, boardId, previousRevision: null, revision: 0, documentHash: board.documentHash, changedRecordIds: Object.keys(document.store), committedAt: now }
      await this.save(scope, { schemaVersion: 1, sdkVersion: CANVAS_SDK_VERSION, board, receipts: [{ fingerprint, receipt }] }, null, signal)
      return { board: structuredClone(board), receipt, replayed: false }
    })
  }

  async mutate(scopeInput: CanvasScope, input: CanvasMutationIntent, signal?: AbortSignal): Promise<CanvasMutationResult> {
    const scope = canvasScopeSchema.parse(scopeInput)
    canvasBoardIdSchema.parse(input.boardId); canvasOperationIdSchema.parse(input.operationId)
    validateCanvasJson(input.intent)
    const fingerprint = canvasHash({ expectedRevision: input.expectedRevision, intent: input.intent })
    return this.serial(`${canvasScopeKey(scope)}:${input.boardId}`, async () => {
      assertNotAborted(signal)
      const loaded = await this.load(scope, input.boardId)
      if (!loaded) throw new CanvasError('NOT_FOUND', '画板不存在或不属于当前工作范围')
      const replayed = this.checkReplay(loaded.value, input.operationId, fingerprint)
      if (replayed) return replayed
      const current = loaded.value.board
      if (current.revision !== input.expectedRevision) throw new CanvasError('CONFLICT', `画板已更新至 revision ${current.revision}，请重新读取后修改`)
      if (loaded.value.receipts.length >= CANVAS_LIMITS.receipts || current.revision === Number.MAX_SAFE_INTEGER) throw new CanvasError('LIMIT_EXCEEDED', '画板操作回执达到上限，请创建新画板')
      const document = validateCanvasSdkDocument(await input.mutate(structuredClone(current.document)))
      const changedRecordIds = [...new Set([...Object.keys(current.document.store), ...Object.keys(document.store)])].filter(id => canvasCanonicalJson(current.document.store[id] ?? null) !== canvasCanonicalJson(document.store[id] ?? null))
      const now = new Date().toISOString()
      const board: CanvasBoard = { ...current, revision: current.revision + 1, updatedAt: now, documentHash: canvasHash(document), document }
      const receipt: CanvasReceipt = { operationId: input.operationId, boardId: input.boardId, previousRevision: current.revision, revision: board.revision, documentHash: board.documentHash, changedRecordIds, committedAt: now }
      await this.save(scope, { ...loaded.value, board, receipts: [...loaded.value.receipts, { fingerprint, receipt }] }, loaded.fileHash, signal)
      return { board: structuredClone(board), receipt, replayed: false }
    })
  }

  async commit(scope: CanvasScope, input: { boardId: string; expectedRevision: number; operationId: string; changes: CanvasChanges }, signal?: AbortSignal) {
    return this.mutate(scope, { ...input, intent: { action: 'commit', changes: input.changes }, mutate: document => applyCanvasChanges(document, input.changes) }, signal)
  }
  async open(scopeInput: CanvasScope, boardId: string): Promise<CanvasBoard> {
    const scope = canvasScopeSchema.parse(scopeInput)
    return this.serial(`${canvasScopeKey(scope)}:${boardId}`, async () => {
      const loaded = await this.load(scope, boardId)
      if (!loaded) throw new CanvasError('NOT_FOUND', '画板不存在或不属于当前工作范围')
      return structuredClone(loaded.value.board)
    })
  }
  async receipt(scopeInput: CanvasScope, boardId: string, operationId: string): Promise<CanvasReceipt | null> {
    const scope = canvasScopeSchema.parse(scopeInput)
    return this.serial(`${canvasScopeKey(scope)}:${boardId}`, async () => {
      const loaded = await this.load(scope, boardId)
      if (!loaded) throw new CanvasError('NOT_FOUND', '画板不存在或不属于当前工作范围')
      return structuredClone(loaded.value.receipts.find(value => value.receipt.operationId === operationId)?.receipt ?? null)
    })
  }
  async list(scope: CanvasScope): Promise<CanvasBoardSummary[]> {
    const names = (await readdir(await this.scopeDirectory(scope))).filter(name => name.endsWith('.json'))
    if (names.length > CANVAS_LIMITS.boards) throw new CanvasError('LIMIT_EXCEEDED', '当前工作范围画板数超过上限')
    const summaries: CanvasBoardSummary[] = []
    for (const name of names.sort()) {
      try { summaries.push(canvasSummary(await this.open(scope, name.slice(0, -5)))) }
      catch (error) { if (!(error instanceof CanvasError) || error.code !== 'NOT_FOUND') throw error }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.boardId.localeCompare(b.boardId))
  }
  async read(scope: CanvasScope, input: { boardId: string; pageId?: string; shapeIds?: string[]; offset: number; limit: number }): Promise<CanvasReadResult> {
    const board = await this.open(scope, input.boardId)
    if (input.pageId && board.document.store[input.pageId]?.typeName !== 'page') throw new CanvasError('NOT_FOUND', '画板页面不存在')
    const selection = input.shapeIds && new Set(input.shapeIds)
    if (selection && [...selection].some(id => board.document.store[id]?.typeName !== 'shape')) throw new CanvasError('NOT_FOUND', '选定的画板形状不存在')
    const onPage = (record: CanvasRecord): boolean => {
      if (!input.pageId || record.typeName !== 'shape') return true
      let current = record
      while (current.typeName === 'shape') current = board.document.store[String(current.parentId)]!
      return current.id === input.pageId
    }
    const candidates = Object.values(board.document.store).filter(record => record.typeName !== 'user' && (!selection || selection.has(record.id)) && onPage(record)).sort((a, b) => a.id.localeCompare(b.id))
    const records: CanvasRecord[] = []
    let bytes = 0
    for (const record of candidates.slice(input.offset, input.offset + input.limit)) {
      const safe = structuredClone(record)
      if (safe.typeName === 'asset' && safe.props && typeof safe.props === 'object') {
        const props = safe.props as Record<string, unknown>
        props.src = '[embedded image]'
      }
      const size = Buffer.byteLength(JSON.stringify(safe))
      if (size > CANVAS_LIMITS.readBytes && !records.length) throw new CanvasError('LIMIT_EXCEEDED', '单条画板记录超过读取上限，请缩小内容后重试')
      if (bytes + size > CANVAS_LIMITS.readBytes) break
      records.push(safe); bytes += size
    }
    const end = input.offset + records.length, truncated = end < candidates.length
    return { ...canvasSummary(board), records, total: candidates.length, truncated, ...(truncated ? { nextOffset: end } : {}) }
  }

  /** Resolve owned scopes without creating new storage; only explicit source cleanup uses this. */
  async scopesFor(scopeInput: CanvasScopeFilter): Promise<{ scopes: CanvasScope[]; preserved: string[] }> {
    const scope = canvasScopeFilterSchema.parse(scopeInput), root = await this.rootPath(), result: CanvasScope[] = [], preserved: string[] = []
    const names = scope.employeeId && scope.conversationId ? [canvasScopeKey({ employeeId: scope.employeeId, conversationId: scope.conversationId })] : (await readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name))
    for (const name of names) {
      const directory = join(root, name)
      try {
        await this.assertSafe(directory)
        const info = await lstat(directory)
        if (!info.isDirectory()) { preserved.push(name); continue }
        const metadata = await this.readBytes(join(directory, 'scope.meta'))
        if (!metadata) { preserved.push(name); continue }
        const value = JSON.parse(metadata.toString()) as { schemaVersion: number; owner: CanvasScope }
        const owner = canvasScopeSchema.parse(value.owner)
        if (value.schemaVersion !== 1 || canvasScopeKey(owner) !== name) { preserved.push(name); continue }
        if ((!scope.employeeId || owner.employeeId === scope.employeeId) && (!scope.conversationId || owner.conversationId === scope.conversationId)) result.push(owner)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') preserved.push(name) }
    }
    return { scopes: result, preserved }
  }

  private async cleanupPlan(filter: CanvasScopeFilter, cleanupId: string): Promise<CanvasCleanupPlan> {
    const root = await this.rootPath(), path = join(root, `cleanup-${canvasHash(cleanupId)}.json`)
    const saved = await this.readBytes(path)
    if (saved) {
      let plan: CanvasCleanupPlan
      try { plan = JSON.parse(saved.toString()) as CanvasCleanupPlan; this.assertIntegrity(plan) }
      catch { throw new CanvasError('EXTERNAL_CHANGE', '画板清理清单已变化，未继续删除') }
      if (plan.schemaVersion !== 1 || plan.kind !== 'cleanup' || plan.cleanupId !== cleanupId || canvasHash(plan.filter) !== canvasHash(filter)) throw new CanvasError('OPERATION_CONFLICT', '同一清理编号不能用于不同画板来源')
      if (!Array.isArray(plan.targets) || plan.targets.length > CANVAS_LIMITS.records || !Array.isArray(plan.preserved) || plan.preserved.length > CANVAS_LIMITS.records) throw new CanvasError('INVALID_DOCUMENT', '画板清理清单无效')
      for (const preserved of plan.preserved) {
        if (typeof preserved !== 'string') throw new CanvasError('INVALID_DOCUMENT', '画板保留路径无效')
        const parts = preserved.split('/')
        if (!/^[a-f0-9]{64}$/.test(parts[0]!) || parts.length > 2 || parts[1] !== undefined && (!parts[1] || ['.', '..'].includes(parts[1]) || parts[1].includes(sep) || parts[1].includes('\0'))) throw new CanvasError('INVALID_DOCUMENT', '画板保留路径无效')
      }
      for (const target of plan.targets) {
        canvasScopeSchema.parse(target.scope); canvasBoardIdSchema.parse(target.boardId)
        if (!/^[a-f0-9]{64}$/.test(target.fileHash) || filter.employeeId && target.scope.employeeId !== filter.employeeId || filter.conversationId && target.scope.conversationId !== filter.conversationId) throw new CanvasError('INVALID_DOCUMENT', '画板清理目标归属不匹配')
      }
      return plan
    }
    const matched = await this.scopesFor(filter)
    const plan: CanvasCleanupPlan = { schemaVersion: 1, kind: 'cleanup', cleanupId, filter, targets: [], preserved: [...matched.preserved] }
    for (const owner of matched.scopes) {
      const directory = await this.scopeDirectory(owner), key = canvasScopeKey(owner)
      const names = await readdir(directory)
      for (const name of names.filter(file => file !== 'scope.meta' && file !== 'exports' && !file.endsWith('.json'))) plan.preserved.push(`${key}/${name}`)
      for (const name of names.filter(file => file.endsWith('.json'))) {
        try {
          const boardId = canvasBoardIdSchema.parse(name.slice(0, -5)), bytes = await this.readBytes(join(directory, name))
          if (bytes) plan.targets.push({ scope: owner, boardId, fileHash: canvasBytesHash(bytes) })
        } catch { plan.preserved.push(`${key}/${name}`) }
      }
    }
    if (plan.targets.length > CANVAS_LIMITS.records || plan.preserved.length > CANVAS_LIMITS.records) throw new CanvasError('LIMIT_EXCEEDED', '单次来源清理超过画板数量上限')
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify({ ...plan, integrity: canvasHash(plan) })); await handle.sync() } finally { await handle.close() }
      await this.assertSafe(path)
      try { await link(temporary, path) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; return this.cleanupPlan(filter, cleanupId) }
    } finally { await rm(temporary, { force: true }) }
    return plan
  }

  /** Freeze targets once per cleanup id; retries cannot remove boards created after the original clear. */
  async discardScope(scopeInput: CanvasScopeFilter, cleanupIdInput: string): Promise<CanvasDiscardResult> {
    const value = canvasScopeFilterSchema.parse(scopeInput), cleanupId = canvasOperationIdSchema.parse(cleanupIdInput)
    const filter: CanvasScopeFilter = { ...(value.employeeId ? { employeeId: value.employeeId } : {}), ...(value.conversationId ? { conversationId: value.conversationId } : {}) }
    return this.serial(`cleanup:${canvasHash(cleanupId)}`, async () => {
      const plan = await this.cleanupPlan(filter, cleanupId)
      const result: CanvasDiscardResult = { deletedBoards: [], preserved: [] }
      const root = await this.rootPath()
      // Preserve the original plan. A user may move a conflicting original away;
      // acknowledge only that recorded path's absence, without discovering or
      // deleting any files/boards that appeared after the first cleanup attempt.
      for (const preserved of plan.preserved) {
        try {
          const path = join(root, preserved)
          await this.assertSafe(path)
          await lstat(path)
          result.preserved.push(preserved)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') result.preserved.push(preserved)
        }
      }
      for (const target of plan.targets) {
        const owner = target.scope, boardId = target.boardId, key = canvasScopeKey(owner), relativePath = `${key}/${boardId}.json`
        await this.serial(`${key}:${boardId}`, async () => {
          try {
            const bytes = await this.readBytes(await this.boardPath(owner, boardId))
            if (!bytes) return
            const value = JSON.parse(bytes.toString()) as StoredBoard | CanvasTombstone
            this.assertIntegrity(value)
            if ('kind' in value && value.kind === 'deleted') {
              if (value.schemaVersion !== 1 || value.boardId !== boardId || !sameScope(value.owner, owner) || value.cleanupId !== cleanupId && canvasBytesHash(bytes) !== target.fileHash) throw new Error('invalid tombstone')
              result.deletedBoards.push({ scope: owner, boardId })
              return
            }
            if (canvasBytesHash(bytes) !== target.fileHash) throw new Error('document changed after cleanup snapshot')
            const loaded = await this.load(owner, boardId)
            if (!loaded) return
            if (loaded.fileHash !== target.fileHash) throw new Error('document changed after cleanup snapshot')
            await this.writeStored(owner, boardId, { schemaVersion: 1, kind: 'deleted', boardId, owner, deletedAt: new Date().toISOString(), cleanupId }, loaded.fileHash, undefined, true)
            result.deletedBoards.push({ scope: owner, boardId })
          } catch { result.preserved.push(relativePath) }
        })
      }
      return result
    })
  }
}
