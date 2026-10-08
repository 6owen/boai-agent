/*
 * [INPUT]: 普通IM/ACP已尝试提交的冻结输入、稳定请求身份与旧外部任务记录。
 * [OUTPUT]: 白名单持久化原消息和材料版本引用；重启一律unknown，只读核对，不导入材料正文/路径或后续草稿；新记录损坏显式拒绝覆盖。
 * [POS]: 会话发送请求的纯持久边界；沿用旧存储key以保留ACP未决身份，不调用模型或IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { MATERIAL_LIMITS } from '@shared/domain/materials'
import type { ChatDraft } from './presentation'

// Keep the original key: changing it would strand existing ACP requests after upgrade.
export const MESSAGE_SEND_PENDING_KEY = 'boai:external-tasks:pending'
type Submission = NonNullable<ChatDraft['submission']>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
const invalid = () => new Error('未决消息记录不完整或版本不支持，请保留本地存储并核对原请求。')

export function draftFingerprint(draft: ChatDraft) {
  return JSON.stringify({ text: draft.text, mentionIds: draft.mentionIds, mentions: draft.mentions, replyId: draft.replyId, questionReply: draft.questionReply, artifactRevision: draft.artifactRevision, materials: draft.materials?.map(item => [item.material?.id, item.material?.revision]) })
}

function messageInput(value: unknown): Submission['input'] {
  if (!object(value) || typeof value.content !== 'string' || value.content.length > 100_000 || !Array.isArray(value.mentionIds) || value.mentionIds.length > 100 || !value.mentionIds.every(identity) || new Set(value.mentionIds).size !== value.mentionIds.length) throw invalid()
  const input: Submission['input'] = { content: value.content, mentionIds: [...value.mentionIds] }
  if (value.materialSelections !== undefined) {
    if (!Array.isArray(value.materialSelections) || value.materialSelections.length > MATERIAL_LIMITS.perMessage) throw invalid()
    input.materialSelections = value.materialSelections.map(item => {
      if (!object(item) || !identity(item.id) || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1) throw invalid()
      return { id: item.id, revision: Number(item.revision) }
    })
    if (new Set(input.materialSelections.map(item => item.id)).size !== input.materialSelections.length) throw invalid()
  }
  if (!input.content.trim() && !input.materialSelections?.length) throw invalid()
  if (value.replyToMessageId !== undefined) { if (!identity(value.replyToMessageId)) throw invalid(); input.replyToMessageId = value.replyToMessageId }
  if (value.stopPrevious !== undefined) { if (typeof value.stopPrevious !== 'boolean') throw invalid(); input.stopPrevious = value.stopPrevious }
  return input
}

export function pendingMessageRequests(drafts: Map<string, ChatDraft>) {
  return Object.fromEntries([...drafts].flatMap(([id, draft]) => {
    const request = draft.submission
    if (!request) return []
    if (!identity(id) || !identity(request.requestId)) throw invalid()
    return [[id, { schemaVersion: 2, kind: request.kind === 'external' ? 'external' : 'message', requestId: request.requestId, input: messageInput(request.input) }]]
  }))
}

export function restorePendingMessageDrafts(value: unknown): Map<string, ChatDraft> {
  if (!object(value)) throw invalid()
  const drafts = new Map<string, ChatDraft>()
  for (const [id, item] of Object.entries(value)) {
    let kind: Submission['kind'], input: Submission['input']
    if (object(item) && item.schemaVersion === undefined && !('input' in item) && !('kind' in item)) {
      // Legacy ACP records contain only the request identity and its original text.
      if (!identity(id) || !identity(item.requestId) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 100_000) continue
      kind = 'external'; input = { content: item.content, mentionIds: [] }
    } else {
      if (!identity(id) || !object(item) || !identity(item.requestId) || item.schemaVersion !== 2 || !['message', 'external'].includes(String(item.kind))) throw invalid()
      kind = item.kind === 'external' ? 'external' : undefined
      input = messageInput(item.input)
      if (kind === 'external' && (!input.content.trim() || input.mentionIds.length || input.materialSelections?.length || input.replyToMessageId || input.stopPrevious)) throw invalid()
    }
    const draft: ChatDraft = { text: input.content, mentionIds: [...input.mentionIds], ...(input.replyToMessageId ? { replyId: input.replyToMessageId } : {}) }
    draft.submission = { ...(kind ? { kind } : {}), requestId: item.requestId as string, status: 'unknown', fingerprint: draftFingerprint(draft), input }
    drafts.set(id, draft)
  }
  return drafts
}
