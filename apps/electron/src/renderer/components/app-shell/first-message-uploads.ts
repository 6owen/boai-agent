/*
 * [INPUT]: User-selected browser File objects and the public material transfer API.
 * [OUTPUT]: Temporary upload references for first-message admission, cleaned after the attempt.
 * [POS]: Renderer attachment adapter for chats with no conversation yet.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { MATERIAL_CHUNK_BYTES, type SubmittedMaterial } from '@boai/shared/domain/material-upload'
import type { DesktopApi } from '@boai/shared/ipc'

export async function withFirstMessageUploads<T>(api: DesktopApi, files: readonly File[], send: (materialUploads?: SubmittedMaterial[]) => Promise<T>): Promise<T> {
  if (!files.length) return send()

  const uploadIds: string[] = []
  const materialUploads: SubmittedMaterial[] = []
  try {
    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      const contentHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
      const uploadId = crypto.randomUUID()
      uploadIds.push(uploadId)
      const descriptor = { name: file.name, size: file.size, contentHash }
      await api.request('transferMaterial', { action: 'begin', uploadId, ...descriptor })
      const data = new Uint8Array(bytes)
      for (let offset = 0; offset < data.length; offset += MATERIAL_CHUNK_BYTES) {
        const chunk = data.subarray(offset, offset + MATERIAL_CHUNK_BYTES)
        let binary = ''
        for (let index = 0; index < chunk.length; index += 8192) binary += String.fromCharCode(...chunk.subarray(index, index + 8192))
        await api.request('transferMaterial', { action: 'chunk', uploadId, offset, base64: btoa(binary) })
      }
      const receipt = await api.request('transferMaterial', { action: 'finish', uploadId })
      if (!receipt.selectionId) throw new Error('文件上传未返回可用凭据，请重试发送。')
      materialUploads.push({ ...descriptor, selectionId: receipt.selectionId })
    }
    return await send(materialUploads)
  } finally {
    await Promise.allSettled(uploadIds.map(uploadId => api.request('transferMaterial', { action: 'abort', uploadId })))
  }
}
