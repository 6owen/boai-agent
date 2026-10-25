/*
 * [INPUT]: Owner-selected client bytes, never client-supplied server paths.
 * [OUTPUT]: Bounded chunks, private selection tokens and stable submitted file identity.
 * [POS]: Shared upload contract before the existing material preparation pipeline.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { z } from 'zod'
import { MATERIAL_LIMITS } from './materials'

export const MATERIAL_CHUNK_BYTES = 256 * 1024
const uploadId = z.string().uuid()
export const materialUploadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin'), uploadId, name: z.string().min(1).max(200).refine(name => !/[\/\\\x00-\x1f\x7f]/u.test(name) && !['.', '..'].includes(name)), size: z.number().int().min(0).max(MATERIAL_LIMITS.attachmentBytes), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('chunk'), uploadId, offset: z.number().int().min(0).max(MATERIAL_LIMITS.attachmentBytes), base64: z.string().min(4).max(4 * Math.ceil(MATERIAL_CHUNK_BYTES / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  z.object({ action: z.literal('finish'), uploadId }).strict(),
  z.object({ action: z.literal('abort'), uploadId }).strict(),
])
export type MaterialUploadInput = z.infer<typeof materialUploadSchema>
export interface MaterialUploadReceipt { uploadId: string; offset: number; selectionId?: string }
export const submittedMaterialSchema = z.object({
  selectionId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  size: z.number().int().min(0).max(MATERIAL_LIMITS.attachmentBytes),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const submittedMaterialsSchema = z.array(submittedMaterialSchema).min(1).max(MATERIAL_LIMITS.perMessage)
export type SubmittedMaterial = z.infer<typeof submittedMaterialSchema>
export const prepareUploadedMaterialSchema = z.object({ conversationId: z.string().min(1).max(200), selectionId: z.string().uuid(), requestId: z.string().min(1).max(200) }).strict()
