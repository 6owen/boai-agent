/*
 * [INPUT]: Typed desktop application facade and one explicit operation intent.
 * [OUTPUT]: Unwrapped successful payload or an error; unknown writes are never replayed.
 * [POS]: Shared renderer helper for workspace and desktop activity controls.
 * [PROTOCOL]: Update Header and common/.folder.md when changed.
 */
import type { DesktopApi } from '@boai/shared/ipc'
export async function applicationCall<T>(api: DesktopApi, operation: string, input: Record<string, unknown> = {}, write = false): Promise<T> {
  const result = await api.request('executeApplicationOperation', { operation, input, ...(write ? { requestId: crypto.randomUUID() } : {}) })
  if (result.status !== 'succeeded') throw new Error(result.error?.message ?? `操作状态：${result.status}，请刷新核对`)
  return result.data as T
}
