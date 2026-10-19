/*
 * [INPUT]: Explicit local attachment paths, owner RPC and stable message request identity.
 * [OUTPUT]: First employee/core messages submit stable descriptors without creating an empty room. Read errors are explicit before upload. True byte uploads followed by original material selections and reusable preparation receipts.
 * [POS]: CLI attachment input; no server path authority or model text substitution.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import type { CliRpcClient } from './client'
import { CliError } from '../shared/cli/protocol'
import type { Message } from '../shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial, type MaterialSelection } from '../shared/domain/materials'
import { MATERIAL_CHUNK_BYTES, type MaterialUploadReceipt, type SubmittedMaterial } from '../shared/domain/material-upload'
import { readMaterialSource } from '../runtime/modules/materials/material-files'

export async function selectAttachments(client: CliRpcClient, files: string[] | undefined, conversationId: string, requestId: string): Promise<MaterialSelection[] | undefined> {
  if (!files?.length) return undefined
  const prior = await client.invoke('getMessageReceipt', { requestId }) as Message | null
  if (prior && prior.conversationId !== conversationId) throw new CliError('INVALID_REQUEST', '原请求不属于指定聊天')
  const sources = await readAttachments(files, requestId)
  const selected: MaterialSelection[] = []
  for (const [index, source] of sources.entries()) {
    const preparationId = 'cli-material-' + createHash('sha256').update(JSON.stringify([requestId, conversationId, index, source.name, source.contentHash])).digest('hex')
    let material = await client.invoke('getMaterialPreparation', { requestId: preparationId }) as ConversationMaterial | null
    if (prior && (!material || prior.materialIds?.[index] !== material.id || prior.materialIds.length !== files.length)) throw new CliError('INVALID_REQUEST', '原请求已使用不同附件，请使用新request-id；核对原结果可用receipt')
    if (!material) {
      const uploadId = randomUUID()
      try {
        const uploaded = await uploadFile(client, source, uploadId)
        material = await client.invoke('prepareMaterial', { conversationId, selectionId: uploaded.selectionId, requestId: preparationId }) as ConversationMaterial
      } catch (error) {
        // A lost prepare response is reconciled from the original receipt; never re-upload automatically.
        material = await client.invoke('getMaterialPreparation', { requestId: preparationId }).catch(() => null) as ConversationMaterial | null
        if (!material) throw new CliError(error instanceof CliError ? error.code : 'HANDLER_ERROR', `附件准备未能确认，核对getMaterialPreparation请求 ${preparationId}；消息尚未发送`)
      } finally { await client.invoke('transferMaterial', { action: 'abort', uploadId }).catch(() => undefined) }
    }
    if (material.status !== 'ready') throw new CliError('INVALID_REQUEST', `附件${material.name}未就绪：${material.error ?? material.status}；原准备请求${preparationId}`)
    selected.push({ id: material.id, revision: material.revision })
  }
  return selected
}


async function readAttachments(files: string[], requestId: string) {
  if (files.length > MATERIAL_LIMITS.perMessage || new Set(files.map(file => resolve(file))).size !== files.length) throw new CliError('INVALID_REQUEST', '每条消息最多三份且不能重复附件')
  // Validate every local file before accepting any upload; never send local paths to the server.
  const sources = []
  for (const file of files) {
    try { sources.push({ name: basename(file), ...await readMaterialSource(resolve(file), AbortSignal.timeout(MATERIAL_LIMITS.preparationMs), requestId) }) }
    catch (error) {
      const reason = error instanceof Error && !('code' in error) ? error.message : '文件不存在、不可读或读取已超时'
      throw new CliError('INVALID_REQUEST', `无法读取所选附件：${reason}；消息尚未发送`)
    }
  }
  return sources
}

async function uploadFile(client: CliRpcClient, source: Awaited<ReturnType<typeof readAttachments>>[number], uploadId: string) {
  await client.invoke('transferMaterial', { action: 'begin', uploadId, name: source.name, size: source.size, contentHash: source.contentHash })
  for (let offset = 0; offset < source.bytes.length; offset += MATERIAL_CHUNK_BYTES) await client.invoke('transferMaterial', { action: 'chunk', uploadId, offset, base64: source.bytes.subarray(offset, offset + MATERIAL_CHUNK_BYTES).toString('base64') })
  return await client.invoke('transferMaterial', { action: 'finish', uploadId }) as MaterialUploadReceipt
}

/** Employee submission chooses/creates its original room in the service after upload. */
export async function uploadEmployeeAttachments(client: CliRpcClient, files: string[], requestId: string) {
  const prior = await client.invoke('getMessageReceipt', { requestId }) as Message | null
  // Older CLI requests used prepared material IDs in their fingerprint. Keep that
  // original form when reconciling them instead of converting to a new identity.
  if (prior && !prior.attachmentInputs) return { materialSelections: await selectAttachments(client, files, prior.conversationId, requestId), materialUploads: undefined, dispose: async () => {} }
  const sources = await readAttachments(files, requestId), uploadIds: string[] = []
  if (prior?.attachmentInputs && JSON.stringify(prior.attachmentInputs) !== JSON.stringify(sources.map(({ name, size, contentHash }) => ({ name, size, contentHash })))) throw new CliError('INVALID_REQUEST', '原请求已使用不同附件，请使用新request-id；核对原结果可用receipt')
  const dispose = async () => { for (const uploadId of uploadIds) await client.invoke('transferMaterial', { action: 'abort', uploadId }).catch(() => undefined) }
  try {
    const materialUploads: SubmittedMaterial[] = []
    for (const source of sources) {
      const descriptor = { name: source.name, size: source.size, contentHash: source.contentHash }
      if (prior) { materialUploads.push(descriptor); continue }
      const uploadId = randomUUID(); uploadIds.push(uploadId)
      const uploaded = await uploadFile(client, source, uploadId)
      materialUploads.push({ ...descriptor, selectionId: uploaded.selectionId })
    }
    return { materialUploads, materialSelections: undefined, dispose }
  } catch (error) { await dispose(); throw error }
}
