/*
 * [INPUT]: Rovai执行窗口请求与BOAI typed IPC。
 * [OUTPUT]: 只读请求名/身份字段映射，不改变分页/变化语义。
 * [POS]: 迁入hook的传输接线。
 * [PROTOCOL]: 变化同步Header和.folder.md。
 */
import type { DesktopApi } from '@boai/shared/ipc'
const clients = new WeakMap<DesktopApi, ReturnType<typeof createClient>>()
export function executionWindowClient(api: DesktopApi) {
  let client = clients.get(api)
  if (!client) { client = createClient(api); clients.set(api, client) }
  return client
}
function createClient(api: DesktopApi) {
  return { request: async <T>(method: string, params: { threadId: string; agentRunId: string; beforeSequence?: number | null; afterSequence?: number; afterChangeSequence?: number; limit: number; projection?: string; refreshEvidenceIds?: string[] }): Promise<T> => {
    const { threadId, agentRunId, projection: _, refreshEvidenceIds: __, ...query } = params
    return await api.request('listExecutionWindow', { ...query, conversationId: threadId, runId: agentRunId }) as T
  } }
}
export type ExecutionWindowClient = ReturnType<typeof createClient>
