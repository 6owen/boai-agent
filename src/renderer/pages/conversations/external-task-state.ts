/*
 * [INPUT]: ACP 已尝试提交的冻结草稿、稳定请求身份与本地未决记录。
 * [OUTPUT]: 仅持久化未决外部请求的白名单载荷；重启一律 unknown，只读核对原回执，不恢复普通未发送草稿。
 * [POS]: ACP 发送状态的纯持久化边界；不调用外部程序或 IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ChatDraft } from './presentation'
export const EXTERNAL_TASK_PENDING_KEY = 'boai:external-tasks:pending'
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
export function externalTaskRequests(drafts: Map<string, ChatDraft>) {
  return Object.fromEntries([...drafts].flatMap(([id, draft]) => draft.submission?.kind === 'external' ? [[id, { requestId: draft.submission.requestId, content: draft.submission.input.content }]] : []))
}
export function restoreExternalTaskDrafts(value: unknown): Map<string, ChatDraft> {
  const drafts = new Map<string, ChatDraft>()
  if (!object(value)) return drafts
  for (const [id, item] of Object.entries(value)) {
    if (!identity(id) || !object(item) || !identity(item.requestId) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 100_000) continue
    const draft: ChatDraft = { text: item.content, mentionIds: [] }
    draft.submission = { kind: 'external', requestId: item.requestId, status: 'unknown', fingerprint: JSON.stringify({ text: draft.text, mentionIds: [] }), input: { content: item.content, mentionIds: [] } }
    drafts.set(id, draft)
  }
  return drafts
}
