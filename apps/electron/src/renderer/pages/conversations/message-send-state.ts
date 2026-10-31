/*
 * [OUTPUT]: 冻结和恢复employee-task消息类型，未知回执不自动重发。
 * [OUTPUT]: 补充目标随未决请求持久冻结，重启只核对原回执。
 * [OUTPUT]: 未决消息冻结资源引用并严格恢复，未知不重放。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 渠道引用随原请求持久冻结/严格还原，不在重启后改指另一消息。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 当前网页引用附于原消息草稿；固定实例/页面版本随发送回执持久，标题URL只展示宿主核验来源，原附件工具栏保持。
 * [INPUT]: 普通IM/ACP已尝试提交的冻结输入、稳定请求身份与旧外部任务记录。
 * [OUTPUT]: 白名单持久化原消息和材料版本引用；重启一律unknown，只读核对，不导入材料正文/路径或后续草稿；新记录损坏显式拒绝覆盖。
 * [POS]: 会话发送请求的纯持久边界；沿用旧存储key以保留ACP未决身份，不调用模型或IPC。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { composerReferencesSchema } from '@boai/shared/domain/composer-references'
import { MATERIAL_LIMITS } from '@boai/shared/domain/materials'
import type { ChatDraft } from './presentation'

// Keep the original key: changing it would strand existing ACP requests after upgrade.
export const MESSAGE_SEND_PENDING_KEY = 'boai:external-tasks:pending'
type Submission = NonNullable<ChatDraft['submission']>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
const invalid = () => new Error('未决消息记录不完整或版本不支持，请保留本地存储并核对原请求。')

export function draftFingerprint(draft: ChatDraft) {
  return JSON.stringify({ channelReference: draft.channelReference, materialEdit: draft.materialEdit, browserReference: draft.browserReference ? {instanceId:draft.browserReference.instanceId,pageVersion:draft.browserReference.pageVersion}:undefined, text: draft.text, mentionIds: draft.mentionIds, mentions: draft.mentions, replyId: draft.replyId, questionReply: draft.questionReply, artifactRevision: draft.artifactRevision, materials: draft.materials?.map(item => [item.material?.id, item.material?.revision]) })
}

function messageInput(value: unknown): Submission['input'] {
  if (!object(value) || typeof value.content !== 'string' || value.content.length > 100_000 || !Array.isArray(value.mentionIds) || value.mentionIds.length > 100 || !value.mentionIds.every(identity) || new Set(value.mentionIds).size !== value.mentionIds.length) throw invalid()
  const input: Submission['input'] = { content: value.content, mentionIds: [...value.mentionIds] }
  if (value.steer !== undefined) {
    if (!object(value.steer) || !identity(value.steer.runId) || !identity(value.steer.turnId)) throw invalid()
    input.steer = { runId: value.steer.runId, turnId: value.steer.turnId }
  }
  if (value.composerReferences !== undefined) input.composerReferences = composerReferencesSchema.parse(value.composerReferences)
  if (value.channelReference !== undefined) {
    const ref = value.channelReference
    if (!object(ref) || !identity(ref.conversationId) || !identity(ref.messageId) || typeof ref.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(ref.contentHash)) throw invalid()
    input.channelReference = { conversationId: ref.conversationId, messageId: ref.messageId, contentHash: ref.contentHash }
  }
  if (value.materialReference !== undefined) {
    const ref = value.materialReference
    if (!object(ref) || !identity(ref.id) || !identity(ref.conversationId) || !Number.isSafeInteger(ref.revision) || Number(ref.revision) < 1 || typeof ref.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(ref.contentHash) || !['text-v1', 'binary-v1'].includes(String(ref.parseVersion)) || input.mentionIds.length !== 1) throw invalid()
    input.materialReference = { id: ref.id, conversationId: ref.conversationId, revision: Number(ref.revision), contentHash: ref.contentHash, parseVersion: ref.parseVersion as 'text-v1' | 'binary-v1' }
  }
  if (value.browserReference !== undefined) {
    if(!object(value.browserReference) || !identity(value.browserReference.instanceId) || !identity(value.browserReference.pageVersion)) throw invalid()
    input.browserReference={instanceId:value.browserReference.instanceId,pageVersion:value.browserReference.pageVersion}
  }
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
  if (input.steer && (input.composerReferences?.length || input.channelReference || input.materialReference || input.browserReference || input.materialSelections?.length || input.replyToMessageId || value.stopPrevious)) throw invalid()
  if (value.stopPrevious !== undefined) { if (typeof value.stopPrevious !== 'boolean') throw invalid(); input.stopPrevious = value.stopPrevious }
  return input
}

export function pendingMessageRequests(drafts: Map<string, ChatDraft>) {
  return Object.fromEntries([...drafts].flatMap(([id, draft]) => {
    const request = draft.submission
    if (!request) return []
    if (!identity(id) || !identity(request.requestId)) throw invalid()
    return [[id, { schemaVersion: 2, kind: request.kind ?? 'message', requestId: request.requestId, input: messageInput(request.input) }]]
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
      if (!identity(id) || !object(item) || !identity(item.requestId) || item.schemaVersion !== 2 || !['message', 'external', 'employee-task'].includes(String(item.kind))) throw invalid()
      kind = item.kind === 'external' || item.kind === 'employee-task' ? item.kind : undefined
      input = messageInput(item.input)
      if (kind === 'external' && (input.steer || !input.content.trim() || input.mentionIds.length || input.materialSelections?.length || input.replyToMessageId || input.stopPrevious || input.materialReference || input.channelReference || input.composerReferences?.length)) throw invalid()
    }
    const draft: ChatDraft = { text: input.content, mentionIds: [...input.mentionIds], ...(input.channelReference ? { channelReference: input.channelReference } : {}), ...(input.replyToMessageId ? { replyId: input.replyToMessageId } : {}) }
    draft.submission = { ...(kind ? { kind } : {}), requestId: item.requestId as string, status: 'unknown', fingerprint: draftFingerprint(draft), input }
    drafts.set(id, draft)
  }
  return drafts
}
