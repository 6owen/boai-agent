/*
 * [INPUT]: Stable source creation request, original application receipt and typed DesktopApi.
 * [OUTPUT]: Receipt-first creation recovery; an unknown result is never retried with another request ID.
 * [POS]: Resource-library creation helper; stores no payload or secret.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import type { ApplicationRequest, ApplicationResult } from '@boai/shared/domain/application-protocol'
import type { DesktopApi } from '@boai/shared/ipc'

export async function recoverSourceCreation(api: DesktopApi, requestId: string, request?: ApplicationRequest): Promise<ApplicationResult> {
  const previous = await api.request('getApplicationReceipt', { requestId })
  if (previous) return previous
  if (!request || request.requestId !== requestId || request.operation !== 'sources.create') throw new Error('原连接创建结果尚未确认，请核对原请求；不会重复创建连接。')
  try { return await api.request('executeApplicationOperation', request) }
  catch (failure) {
    const result = await api.request('getApplicationReceipt', { requestId })
    if (result) return result
    throw failure
  }
}
export const PENDING_SOURCE_CREATION_KEY = 'boai.library.pending-source-creation'
