/*
 * [INPUT]: Validated owner byte chunks and original host MaterialSources.
 * [OUTPUT]: Size/hash-verified private selections; retirement rejects new use immediately and holds capacity/bytes until active preparation and cleanup finish.
 * [POS]: Transport staging only; material authorization and preparation stay in MaterialRepository.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { createHash } from 'node:crypto'
import { MaterialSources } from '@boai/shared/node/material-sources'
import { MATERIAL_LIMITS } from '@boai/shared/domain/materials'
import { MATERIAL_CHUNK_BYTES, materialUploadSchema, type MaterialUploadReceipt, type SubmittedMaterial } from '@boai/shared/domain/material-upload'

const UPLOAD_LIFETIME_MS = 10 * 60_000
type Upload = { name: string; size: number; hash: string; bytes: Buffer; offset: number; timer: ReturnType<typeof setTimeout>; finish?: Promise<MaterialUploadReceipt>; selectionId?: string; preparing: Set<Promise<unknown>>; releasing?: Promise<void> }
export class MaterialUploads {
  private readonly uploads = new Map<string, Upload>()
  private readonly sources: MaterialSources
  private closing = false
  constructor(directory: string, private readonly cleanupError: (error: unknown) => void) { this.sources = new MaterialSources(directory, cleanupError) }
  init() { return this.sources.recover() }
  get busy() { return this.uploads.size > 0 }
  async transfer(raw: unknown): Promise<MaterialUploadReceipt> {
    if (this.closing) throw new Error('附件上传服务正在退出')
    const input = materialUploadSchema.parse(raw)
    let upload = this.uploads.get(input.uploadId)
    if (input.action === 'abort') { await this.release(input.uploadId); return { uploadId: input.uploadId, offset: 0 } }
    if (upload?.releasing) throw new Error('附件上传正在清理，请等待原准备结束')
    if (input.action === 'begin') {
      if (upload && (upload.name !== input.name || upload.size !== input.size || upload.hash !== input.contentHash)) throw new Error('上传ID已用于不同文件')
      if (!upload) {
        if (this.uploads.size >= MATERIAL_LIMITS.perMessage) throw new Error('同时最多上传三份附件，请完成或取消已有上传')
        const timer = setTimeout(() => { void this.release(input.uploadId).catch(this.cleanupError) }, UPLOAD_LIFETIME_MS); timer.unref()
        upload = { name: input.name, size: input.size, hash: input.contentHash, bytes: Buffer.alloc(input.size), offset: 0, timer, preparing: new Set() }
        this.uploads.set(input.uploadId, upload)
      }
      return { uploadId: input.uploadId, offset: upload.offset, ...(upload.selectionId ? { selectionId: upload.selectionId } : {}) }
    }
    if (!upload) throw new Error('附件上传已失效，请核对原材料准备回执')
    if (input.action === 'chunk') {
      if (upload.finish) throw new Error('附件已结束上传')
      const bytes = Buffer.from(input.base64, 'base64')
      if (bytes.length > MATERIAL_CHUNK_BYTES || bytes.toString('base64') !== input.base64 || input.offset + bytes.length > upload.size) throw new Error('附件分块大小或编码无效')
      if (input.offset < upload.offset && input.offset + bytes.length <= upload.offset && upload.bytes.subarray(input.offset, input.offset + bytes.length).equals(bytes)) return { uploadId: input.uploadId, offset: upload.offset }
      if (input.offset !== upload.offset) throw new Error('附件分块位置或重复内容不一致')
      bytes.copy(upload.bytes, upload.offset); upload.offset += bytes.length
      return { uploadId: input.uploadId, offset: upload.offset }
    }
    if (upload.finish) return upload.finish
    if (upload.offset !== upload.size || createHash('sha256').update(upload.bytes).digest('hex') !== upload.hash) throw new Error('附件字节尚不完整或内容校验不一致')
    const current = upload
    return current.finish = this.sources.selectBytes(current.name, current.bytes).then(source => {
      current.selectionId = source.id; current.bytes = Buffer.alloc(0)
      return { uploadId: input.uploadId, offset: current.offset, selectionId: source.id }
    })
  }
  async prepare<T>(selectionId: string, run: (source: { path: string; name?: string }) => Promise<T>) {
    const entry = [...this.uploads].find(([, upload]) => upload.selectionId === selectionId)
    if (!entry) throw new Error('附件选择已失效，请核对原材料准备回执')
    if (this.closing || entry[1].releasing) throw new Error('附件上传正在清理，请等待原准备结束')
    const pending = this.sources.prepare(selectionId, run)
    entry[1].preparing.add(pending)
    try { return await pending }
    finally { entry[1].preparing.delete(pending); await this.release(entry[0]) }
  }
  has(selectionId: string) { return !this.closing && [...this.uploads.values()].some(upload => upload.selectionId === selectionId && !upload.releasing) && this.sources.has(selectionId) }
  prepareSubmitted<T>(file: SubmittedMaterial, run: (source: { path: string; name?: string }) => Promise<T>) {
    const upload = [...this.uploads.values()].find(value => value.selectionId === file.selectionId)
    if (!file.selectionId || !upload || upload.name !== file.name || upload.size !== file.size || upload.hash !== file.contentHash) throw new Error('附件上传来源已失效或名称/字节摘要不一致，请核对原消息回执')
    return this.prepare(file.selectionId, run)
  }
  private release(id: string): Promise<void> {
    const upload = this.uploads.get(id)
    if (!upload) return Promise.resolve()
    if (upload.releasing) return upload.releasing
    clearTimeout(upload.timer)
    // All retirements share one drain. Already admitted importers keep their
    // original bytes; new chunks, preparation and reuse are rejected meanwhile.
    return upload.releasing = (async () => {
      await upload.finish?.catch(() => undefined)
      await Promise.allSettled([...upload.preparing])
      if (upload.selectionId && this.sources.has(upload.selectionId)) await this.sources.prepare(upload.selectionId, async () => undefined)
      upload.bytes = Buffer.alloc(0)
      if (this.uploads.get(id) === upload) this.uploads.delete(id)
    })()
  }
  async close() {
    this.closing = true
    await Promise.allSettled([...this.uploads.keys()].map(id => this.release(id)))
    await this.sources.close()
  }
}
