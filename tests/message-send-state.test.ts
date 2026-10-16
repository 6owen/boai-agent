/*
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 技能/文件引用随原请求恢复，不能伪造本机路径或在重启后重绑来源。
 * [INPUT]: 普通/ACP原请求、材料版本引用与跨重启快照。
 * [OUTPUT]: 原请求独立于后续草稿，重启unknown且同指纹可清除；仅保存引用，不泄露媒体/路径；保留旧ACP并拒绝损坏新版。
 * [POS]: 消息发送持久边界回归；不把恢复解释为发送授权。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { describe, expect, it } from 'vitest'
import { draftFingerprint, pendingMessageRequests, restorePendingMessageDrafts } from '../src/renderer/pages/conversations/message-send-state'
import type { ChatDraft } from '../src/renderer/pages/conversations/presentation'

describe('pending message identity', () => {
  it.each([undefined, 'external'] as const)('keeps the original %s request rather than later edits or unsent drafts', kind => {
    const drafts = new Map<string, ChatDraft>([['chat', { text: '后来的编辑', mentionIds: [], submission: { kind, requestId: 'original', status: 'pending', fingerprint: 'frozen', input: { content: '原任务', mentionIds: [] } } }], ['unsent', { text: '未发送普通草稿', mentionIds: [] }]])
    const restored = restorePendingMessageDrafts(JSON.parse(JSON.stringify(pendingMessageRequests(drafts))))
    expect([...restored.keys()]).toEqual(['chat'])
    const draft = restored.get('chat')!
    expect(draft).toMatchObject({ text: '原任务', submission: { requestId: 'original', status: 'unknown', input: { content: '原任务' } } })
    expect(draft.submission!.kind).toBe(kind)
    expect(draft.submission!.fingerprint).toBe(draftFingerprint(draft))
    expect(pendingMessageRequests(new Map())).toEqual({})
  })

  it('preserves exact mention, reply and attachment versions without serializing material bytes or paths', () => {
    const input = { content: '正文', mentionIds: ['member'], replyToMessageId: 'message', stopPrevious: false, materialSelections: [{ id: 'material', revision: 4, path: '/private', body: 'PRIVATE_BYTES' }] }
    const draft: ChatDraft = { text: 'NEW_DRAFT', mentionIds: [], submission: { requestId: 'request', status: 'not_accepted', fingerprint: 'old', input } }
    const saved = JSON.stringify(pendingMessageRequests(new Map([['chat', draft]])))
    expect(saved).not.toMatch(/private|PRIVATE_BYTES|NEW_DRAFT|fingerprint|status/)
    const restored = restorePendingMessageDrafts(JSON.parse(saved)).get('chat')!
    expect(restored.submission!.input).toEqual({ content: '正文', mentionIds: ['member'], replyToMessageId: 'message', stopPrevious: false, materialSelections: [{ id: 'material', revision: 4 }] })
    expect(restored).toMatchObject({ replyId: 'message', mentionIds: ['member'], submission: { status: 'unknown' } })
    expect(restored.materials).toBeUndefined()
    expect(restored.submission!.fingerprint).toBe(draftFingerprint(restored))
    restored.text = '保留后续编辑'
    expect(draftFingerprint(restored)).not.toBe(restored.submission!.fingerprint)
  })

  it('restores a material-only request for reconciliation without inventing an attachment preview', () => {
    const restored = restorePendingMessageDrafts({ chat: { schemaVersion: 2, kind: 'message', requestId: 'r', input: { content: '', mentionIds: [], materialSelections: [{ id: 'image', revision: 1 }] } } }).get('chat')!
    expect(restored.text).toBe('')
    expect(restored.submission!.input.materialSelections).toEqual([{ id: 'image', revision: 1 }])
    expect(restored.materials).toBeUndefined()
  })

  it('keeps legacy ACP identities and ignores their untrusted extra fields', () => {
    expect([...restorePendingMessageDrafts({ broken: { requestId: 'r', content: '' }, good: { requestId: 'r', content: '确认任务', path: '/private', status: 'not_accepted' } }).values()]).toEqual([expect.objectContaining({ submission: expect.objectContaining({ kind: 'external', status: 'unknown', input: { content: '确认任务', mentionIds: [] } }) })])
  })

  it.each([
    { schemaVersion: 3, kind: 'message', input: { content: 'x', mentionIds: [] } },
    { kind: 'message', input: { content: 'x', mentionIds: [] } },
    { schemaVersion: 2, kind: 'message', input: { content: '', mentionIds: [] } },
    { schemaVersion: 2, kind: 'message', input: { content: 'x', mentionIds: ['same', 'same'] } },
    { schemaVersion: 2, kind: 'message', input: { content: 'x', mentionIds: [], materialSelections: [{ id: 'm', revision: 0 }] } },
    { schemaVersion: 2, kind: 'message', input: { content: 'x', mentionIds: [], stopPrevious: 'true' } },
    { schemaVersion: 2, kind: 'external', input: { content: 'x', mentionIds: [], materialSelections: [{ id: 'm', revision: 1 }] } },
  ])('fails loudly rather than dropping an unreadable pending request: %j', entry => {
    expect(() => restorePendingMessageDrafts({ chat: { requestId: 'r', ...entry } })).toThrow('未决消息记录')
  })
})


it('preserves a fixed original reference across unknown-send restart without persisting arbitrary paths', () => {
  const ref = { id: 'm', conversationId: 'chat', revision: 2, contentHash: 'a'.repeat(64), parseVersion: 'text-v1' as const }
  const restored = restorePendingMessageDrafts({ chat: { schemaVersion: 2, kind: 'message', requestId: 'edit', input: { content: '修改第二段', mentionIds: ['writer'], materialReference: { ...ref, path: '/private/secret' } } } }).get('chat')!
  expect(restored.submission?.status).toBe('unknown')
  expect(restored.submission?.input.materialReference).toEqual(ref)
  expect(pendingMessageRequests(new Map([['chat', restored]]))).toMatchObject({ chat: { input: { materialReference: ref } } })
  expect(() => restorePendingMessageDrafts({ chat: { schemaVersion: 2, kind: 'message', requestId: 'edit', input: { content: '修改第二段', mentionIds: ['writer'], materialReference: { ...ref, contentHash: 'changed' } } } })).toThrow()
})


it('freezes composer resource identity across unknown-send recovery', () => {
  const composerReferences = [{ kind: 'material' as const, id: 'm', name: 'brief.md', conversationId: 'chat', agentId: 'writer', revision: 2, contentHash: 'a'.repeat(64) }]
  const entry = { schemaVersion: 2, kind: 'message', requestId: 'resource-request', input: { content: '@brief.md 请阅读', mentionIds: [], composerReferences } }
  const restored = restorePendingMessageDrafts({ chat: entry })
  expect(restored.get('chat')?.submission).toMatchObject({ status: 'unknown', input: { composerReferences } })
  expect(pendingMessageRequests(restored)).toEqual({ chat: entry })
  expect(() => restorePendingMessageDrafts({ chat: { ...entry, input: { ...entry.input, composerReferences: [{ ...composerReferences[0], path: '/secret' }] } } })).toThrow()
})
