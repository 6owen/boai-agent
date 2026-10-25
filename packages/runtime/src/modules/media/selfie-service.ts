/*
 * [INPUT]: Original employee/conversation/message identity, approved raster bytes and selected image provider.
 * [OUTPUT]: Durable private per-employee selfie references, explicit save/delete/export and fresh reference-based portraits.
 * [POS]: Host-owned album; image bytes stay out of model metadata and application receipts.
 * [PROTOCOL]: Update Header and media/.folder.md on change.
 */
import { createHash, randomInt } from 'node:crypto'
import { realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Conversation, DigitalAgent, Message } from '@boai/shared/domain'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import { materialImageMimeType, readMaterialSource } from '@boai/shared/node/material-files'
import { workspaceTarget, writeWorkspaceFile } from '../workspaces/file-access'
import type { ImageBytes, ImageRequest, ImageResult, ImageService } from './image-service'

const photos = 'selfiePhotos', versions = 'selfieAlbumVersions'
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
const photoId = z.string().regex(/^[a-f0-9]{64}$/)
export const selfieRemoveSchema = z.object({ id: photoId, expectedRevision: z.number().int().nonnegative() }).strict()
export const selfieRequestSchema = z.object({ prompt: z.string().trim().min(1).max(16000), appearance: z.string().trim().min(1).max(8000).optional(), style: z.string().trim().min(1).max(2000).optional(), referenceId: photoId.optional(), size: z.string().regex(/^(auto|[1-9]\d{1,3}x[1-9]\d{1,3})$/).optional() }).strict()
export type SelfieRequest = z.infer<typeof selfieRequestSchema>
export interface SelfiePhoto { id: string; agentId: string; label: string; contentHash: string; mimeType: string; sizeBytes: number; createdAt: string; approvalMessageId: string; deletedAt?: string; cleanedAt?: string }
type PhotoView = Pick<SelfiePhoto, 'id' | 'label' | 'contentHash' | 'mimeType' | 'sizeBytes' | 'createdAt'>
export interface SelfieAlbum { revision: number; count: number; latestId: string | null; photos: PhotoView[] }
export interface SelfieGeneration extends ImageResult { referenceUsed: boolean; verify(): Promise<void> }
export interface SelfieCapability {
  list(): Promise<SelfieAlbum>
  save(image: ImageBytes, label: string): Promise<{ saved: PhotoView; albumRevision: number; alreadySaved: boolean }>
  remove(input: z.infer<typeof selfieRemoveSchema>): Promise<{ deleted: true; albumRevision: number; cleanup: 'completed' | 'pending' }>
  export(id: string): Promise<ImageBytes & { contentHash: string; verify(): Promise<void> }>
  generate(input: SelfieRequest, outputFormat?: ImageRequest['outputFormat']): Promise<SelfieGeneration>
}
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const view = ({ id, label, contentHash, mimeType, sizeBytes, createdAt }: SelfiePhoto): PhotoView => ({ id, label, contentHash, mimeType, sizeBytes, createdAt })
const denied = (): never => { throw new ApplicationValidationError('INVALID_INPUT', '相册原图和管理只开放给本人在该员工的私聊；群聊或渠道只能请求生成新肖像') }

export class SelfieService {
  constructor(private store: ProductStore, private dataPath: string, private images: ImageService, private host: { critical<T>(action: () => Promise<T>): Promise<T>; changed(): void }) {}
  private relative(photo: SelfiePhoto) { return join('agents', id.parse(photo.agentId), 'state', 'selfies', `${photoId.parse(photo.id)}.${photo.mimeType === 'image/jpeg' ? 'jpg' : photo.mimeType.split('/')[1]}`) }
  private async scope(tx: RecordTransaction, agentId: string, actor: ApplicationActor, privateOnly: boolean) {
    id.parse(agentId)
    const agent = await tx.get<DigitalAgent>('agents', agentId)
    if (!agent?.active || actor.kind === 'behavior') return denied()
    if (actor.kind === 'owner') return
    const room = await tx.get<Conversation>('conversations', actor.conversationId)
    if (actor.employeeId !== agentId || !room?.agentIds.includes(agentId) || room.list?.hidden || room.mergedInto || await tx.get('conversationCleanup', room.id)) return denied()
    if (!privateOnly) return
    const message = await tx.get<Message>('messages', actor.messageId)
    if (room.kind !== 'direct' || room.channel || !message || message.conversationId !== room.id || message.senderType !== 'user' || message.senderId !== 'user' || message.status !== 'completed' || message.channel || message.origin) return denied()
  }
  private async revision(tx: RecordTransaction, agentId: string) { return (await tx.get<{ revision: number }>(versions, agentId))?.revision ?? 0 }
  private async advance(tx: RecordTransaction, agentId: string) { const revision = await this.revision(tx, agentId) + 1; await tx.put({ collection: versions, id: agentId, value: { id: agentId, agentId, revision } }); return revision }
  private async active(tx: RecordTransaction, agentId: string) { return (await tx.list<SelfiePhoto>(photos)).filter(photo => photo.agentId === agentId && !photo.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) }
  private async get(agentId: string, value: string, actor: ApplicationActor, privateOnly: boolean) {
    return this.store.transaction(async tx => {
      await this.scope(tx, agentId, actor, privateOnly)
      const photo = await tx.get<SelfiePhoto>(photos, photoId.parse(value))
      if (!photo || photo.agentId !== agentId || photo.deletedAt) throw new ApplicationValidationError('NOT_FOUND', '形象参考不存在或已删除')
      return photo
    })
  }
  async list(agentId: string, actor: ApplicationActor): Promise<SelfieAlbum> {
    return this.store.transaction(async tx => { await this.scope(tx, agentId, actor, true); const items = await this.active(tx, agentId); return { revision: await this.revision(tx, agentId), count: items.length, latestId: items[0]?.id ?? null, photos: items.map(view) } })
  }
  private async bytes(photo: SelfiePhoto, signal: AbortSignal = new AbortController().signal): Promise<ImageBytes> {
    const file = await workspaceTarget(await realpath(this.dataPath), this.relative(photo))
    const actual = await readMaterialSource(file, signal, `selfie-${photo.id}`)
    const bytes = Buffer.from(actual.bytes)
    if (actual.contentHash !== photo.contentHash || bytes.length !== photo.sizeBytes || materialImageMimeType(bytes) !== photo.mimeType) throw new Error('形象参考文件已改变，不能借用旧记录')
    return { bytes, mimeType: photo.mimeType }
  }
  async save(agentId: string, actor: ApplicationActor, image: ImageBytes, rawLabel: string, signal: AbortSignal, validate: () => Promise<void>) {
    const label = z.string().trim().max(100).parse(rawLabel), bytes = Buffer.from(image.bytes), contentHash = createHash('sha256').update(bytes).digest('hex')
    if (!bytes.length || bytes.length > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || materialImageMimeType(bytes) !== image.mimeType) throw new Error('相册只接收最多 8 MiB 的实际 PNG/JPEG/WebP 图片')
    if (actor.kind !== 'employee') return denied() // Actual approving owner message, never a model-supplied identity.
    await validate()
    return this.host.critical(async () => {
      signal.throwIfAborted()
      await validate()
      await this.store.transaction(tx => this.scope(tx, agentId, actor, true))
      const photo: SelfiePhoto = { id: digest([agentId, actor.messageId, contentHash]), agentId, label, contentHash, mimeType: image.mimeType, sizeBytes: bytes.length, createdAt: new Date().toISOString(), approvalMessageId: actor.messageId }
      const prior = await this.store.get<SelfiePhoto>(photos, photo.id)
      if (prior?.deletedAt) throw new Error('该次保存已被删除，不能通过重复原调用复活；需要用户新的保存请求')
      const existing = (await this.store.transaction(tx => this.active(tx, agentId))).find(item => item.contentHash === contentHash)
      if (existing) { await this.bytes(existing, signal); return { saved: view(existing), albumRevision: await this.store.transaction(tx => this.revision(tx, agentId)), alreadySaved: true } }
      const relative = this.relative(photo)
      try { await writeWorkspaceFile(this.dataPath, relative, bytes, null, signal) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        // A previous local write may have completed before its metadata commit; never overwrite it.
        await this.bytes(photo, signal)
      }
      signal.throwIfAborted()
      await validate()
      const albumRevision = await this.store.transaction(async tx => { await this.scope(tx, agentId, actor, true); await tx.put({ collection: photos, id: photo.id, value: photo }); return this.advance(tx, agentId) })
      this.host.changed(); return { saved: view(photo), albumRevision, alreadySaved: false }
    })
  }
  private async cleanup(photo: SelfiePhoto) {
    if (!photo.deletedAt || photo.cleanedAt) return true
    try {
      try { await this.bytes(photo); await rm(await workspaceTarget(this.dataPath, this.relative(photo))) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await this.store.transaction(async tx => { const current = await tx.get<SelfiePhoto>(photos, photo.id); if (current?.deletedAt) await tx.put({ collection: photos, id: photo.id, value: { ...current, cleanedAt: new Date().toISOString() } }) })
      return true
    } catch { return false } // Changed files are not silently deleted; tombstone denies further use.
  }
  async recover() { for (const photo of await this.store.load<SelfiePhoto>(photos)) if (photo.deletedAt && !photo.cleanedAt) await this.cleanup(photo) }
  async remove(agentId: string, actor: ApplicationActor, input: z.infer<typeof selfieRemoveSchema>, validate?: () => Promise<void>) {
    const query = selfieRemoveSchema.parse(input)
    return this.host.critical(async () => {
      await validate?.()
      const result = await this.store.transaction(async tx => {
        await this.scope(tx, agentId, actor, true)
        const photo = await tx.get<SelfiePhoto>(photos, query.id)
        if (!photo || photo.agentId !== agentId) throw new ApplicationValidationError('NOT_FOUND', '形象参考不存在')
        const revision = await this.revision(tx, agentId)
        if (photo.deletedAt) return { photo, revision }
        if (revision !== query.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '相册已改变，请先读取当前版本')
        const next = { ...photo, deletedAt: new Date().toISOString() }
        await tx.put({ collection: photos, id: next.id, value: next }); return { photo: next, revision: await this.advance(tx, agentId) }
      })
      const cleaned = await this.cleanup(result.photo); this.host.changed()
      return { deleted: true as const, albumRevision: result.revision, cleanup: cleaned ? 'completed' as const : 'pending' as const }
    })
  }
  async export(agentId: string, actor: ApplicationActor, value: string, signal: AbortSignal, validate: () => Promise<void>) {
    signal.throwIfAborted(); await validate()
    const photo = await this.get(agentId, value, actor, true), image = await this.bytes(photo, signal)
    const verify = async () => { signal.throwIfAborted(); await validate(); await this.get(agentId, value, actor, true) }
    await verify(); return { ...image, contentHash: photo.contentHash, verify }
  }
  async generate(agentId: string, actor: ApplicationActor, raw: SelfieRequest, outputFormat: ImageRequest['outputFormat'], signal: AbortSignal, validate: () => Promise<void>): Promise<SelfieGeneration> {
    const input = selfieRequestSchema.parse(raw); signal.throwIfAborted(); await validate()
    const items = await this.store.transaction(async tx => { await this.scope(tx, agentId, actor, false); return this.active(tx, agentId) })
    const selected = input.referenceId ? items.find(item => item.id === input.referenceId) : items.length ? items[randomInt(items.length)] : undefined
    if (input.referenceId && !selected) throw new Error('指定的形象参考不存在或已删除')
    if (!selected && !input.appearance) throw new Error('没有已保存形象或外貌描述；请先与用户确定外貌，不能编造既定外貌')
    const reference = selected ? await this.bytes(selected, signal) : undefined
    const prompt = [input.style ?? 'Photorealistic portrait, natural lighting and realistic texture.', input.appearance ? `Established appearance (preserve these details):\n${input.appearance}` : '', reference ? 'Preserve the identity and appearance of the provided reference. Create a fresh composition with the requested pose/angle; do not reproduce the original picture.' : '', `Requested scene, pose and expression:\n${input.prompt}`, 'This is a generated portrait of a digital character, not evidence of a real-world event.'].filter(Boolean).join('\n\n')
    const verifyReference = async () => { signal.throwIfAborted(); await validate(); if (selected) await this.get(agentId, selected.id, actor, false); else await this.store.transaction(tx => this.scope(tx, agentId, actor, false)) }
    const result = await this.images.generate({ prompt, ...(input.size ? { size: input.size } : {}), ...(outputFormat ? { outputFormat } : {}) }, reference ? [reference] : [], signal, verifyReference)
    // Public fresh portraits may use a private face reference, but cannot export its identical bytes.
    if (items.some(item => result.contentHash === item.contentHash)) await this.store.transaction(tx => this.scope(tx, agentId, actor, true))
    const verify = async () => { await verifyReference(); await this.images.verify(result.source) }
    await verify(); return { ...result, referenceUsed: !!selected, verify }
  }
  operations(): ApplicationOperation[] {
    const resolveAgent = (input: { agentId?: string }, actor: ApplicationActor) => input.agentId ?? (actor.kind === 'owner' ? (() => { throw new ApplicationValidationError('INVALID_INPUT', '本人入口需要明确 agentId') })() : actor.employeeId)
    return [
      { name: 'selfies.list', description: '读取员工私人形象相册的数量/最新ID/元信息，不返回原图路径或字节；仅本人入口或员工的本人私聊。', effect: 'read', input: z.object({ agentId: id.optional() }).strict(), resultType: 'SelfieAlbum', execute: (input, _, actor) => this.list(resolveAgent(input, actor), actor) },
      { name: 'selfies.remove', description: '按相册revision删除一张形象参考；先撤下使用资格，再核验原字节清理文件。不会删除已发布的聊天成果。', effect: 'write', input: selfieRemoveSchema.extend({ agentId: id.optional() }).strict(), resultType: '{ deleted: true; albumRevision: number; cleanup: string }', execute: (input, _, actor) => this.remove(resolveAgent(input, actor), actor, { id: input.id, expectedRevision: input.expectedRevision }) },
    ]
  }
}

export async function clearSelfieAlbums(tx: RecordTransaction, agentIds: Set<string>) {
  for (const photo of await tx.list<SelfiePhoto>(photos)) if (agentIds.has(photo.agentId)) await tx.remove(photos, photo.id)
  for (const agentId of agentIds) await tx.remove(versions, agentId)
  // Original employee deletion owns removal of agents/<id>/, including the private album files.
}
