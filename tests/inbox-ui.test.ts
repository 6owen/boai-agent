/*
 * [INPUT]: 待处理真实纯分页与页面隔离导航状态。
 * [OUTPUT]: 分页覆盖/原身份去重、查询切换与隐藏停读、异常游标显性失败、原补充回执关系和显式待验收版本/页面隔离的意图验证。
 * [POS]: D5 Renderer 状态测试；不执行审批、补充、采用或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { inboxQueryKey, readInboxPages } from '../src/renderer/pages/inbox/state'
import { inboxQuestionReceiptMatches, restoreInboxQuestionRequests, updateInboxQuestionRequests, type InboxQuestionRequest } from '../src/renderer/pages/inbox/question-state'
import { artifactAcceptanceReceiptMatches, artifactPendingKey, restoreArtifactPending, updateArtifactPending } from '../src/renderer/components/detail-panel/artifact-state'
import { detailWorkspacesReducer, type DetailTarget } from '../src/renderer/components/detail-panel/tabs-state'
import type { ArtifactAcceptanceInput, ArtifactAcceptanceReceipt } from '../src/shared/domain/artifacts'
import type { Message } from '../src/shared/domain'

describe('inbox source projection reading', () => {
  it('gives type and search their own query identity without merging equal-looking sources', () => {
    expect(inboxQueryKey(undefined, '  同名工作 ')).toBe(inboxQueryKey(undefined, '同名工作'))
    expect(inboxQueryKey('question', '同名工作')).not.toBe(inboxQueryKey('approval', '同名工作'))
  })
  it('covers requested source pages with the actual returned cursor and renders each original identity once', async () => {
    const cursors: unknown[] = [], cursor = { time: '2026-10-01T00:00:00Z', id: 'question:a' }
    const result = await readInboxPages(async before => {
      cursors.push(before)
      return before ? { items: [{ id: 'question:a', revision: 2 }, { id: 'approval:a', revision: 1 }], total: 2 } : { items: [{ id: 'question:a', revision: 1 }], total: 2, nextCursor: cursor }
    }, 3, () => true)
    expect(cursors).toEqual([undefined, cursor])
    expect(result).toEqual({ items: [{ id: 'question:a', revision: 2 }, { id: 'approval:a', revision: 1 }], nextCursor: undefined })
  })
  it('drops a late result and stops further page reads after the page is hidden or the query changes', async () => {
    let active = true, calls = 0
    const result = await readInboxPages(async () => { calls++; active = false; return { items: [{ id: 'question:a' }], total: 1, nextCursor: { time: 'now', id: 'question:a' } } }, 4, () => active)
    expect(calls).toBe(1); expect(result).toBeUndefined()
    await readInboxPages(async () => { calls++; return { items: [], total: 0 } }, 1, () => false)
    expect(calls).toBe(1)
  })
  it('reports a cursor that does not advance instead of silently returning an incomplete empty list', async () => {
    await expect(readInboxPages(async () => ({ items: [], total: 9, nextCursor: { time: 'same', id: 'same' } }), 3, () => true)).rejects.toThrow('游标未前进')
  })
})

describe('inbox question reply request identity', () => {
  const request: InboxQuestionRequest = { itemId: 'question:original', conversationId: 'conversation', questionMessageId: 'problem-message', workId: 'original-work', status: 'pending', input: { questionId: 'original', expectedRevision: 2, content: '本人明确补充', requestId: 'reply' } }
  it('restores the frozen original target and request as lookup-only, without cached source or path fields', () => {
    const restored = restoreInboxQuestionRequests({ [request.itemId]: { ...request, input: { ...request.input, path: '/private' }, problem: 'old question body' } })
    expect(restored[request.itemId]).toEqual({ ...request, status: 'unknown' })
    expect(JSON.stringify(restored)).not.toMatch(/private|old question body/)
    expect(restoreInboxQuestionRequests({ 'question:different': request })).toEqual({})
  })
  it('never replaces frozen content, revision, work or request key while the result is unknown', () => {
    const pending = { [request.itemId]: request }
    for (const next of [{ ...request, workId: 'other' }, { ...request, input: { ...request.input, content: '新内容' } }, { ...request, input: { ...request.input, expectedRevision: 3 } }, { ...request, input: { ...request.input, requestId: 'new' } }]) expect(updateInboxQuestionRequests(pending, request.itemId, next, request.input.requestId)).toBeUndefined()
    expect(updateInboxQuestionRequests(pending, request.itemId, { ...request, status: 'not_accepted' }, request.input.requestId)?.[request.itemId].status).toBe('not_accepted')
  })
  it('does not let a late old response erase a new explicit request for the source', () => {
    const pending = { [request.itemId]: { ...request, input: { ...request.input, requestId: 'new' } } }
    expect(updateInboxQuestionRequests(pending, request.itemId, undefined, request.input.requestId)).toBeUndefined()
    expect(updateInboxQuestionRequests(pending, request.itemId, undefined, 'new')).toEqual({})
  })
  it('accepts only the actual user message committed for the original question, revision and work', () => {
    const message: Message = { id: 'reply-message', conversationId: request.conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: request.input.content, status: 'completed', sequence: 10, createdAt: '2026-10-01', inboxReply: { questionId: request.input.questionId, questionRevision: request.input.expectedRevision, questionMessageId: request.questionMessageId, workId: request.workId } }
    expect(inboxQuestionReceiptMatches(request, message)).toBe(true)
    for (const patch of [{ conversationId: 'other' }, { senderId: 'automation' }, { senderType: 'agent' as const }, { content: 'another reply' }, { inboxReply: undefined }, { inboxReply: { ...message.inboxReply!, questionRevision: 3 } }, { inboxReply: { ...message.inboxReply!, questionMessageId: 'different' } }, { inboxReply: { ...message.inboxReply!, workId: 'different' } }]) expect(inboxQuestionReceiptMatches(request, { ...message, ...patch })).toBe(false)
  })
})

describe('inbox exact source and explicit acceptance', () => {
  const input: ArtifactAcceptanceInput = { artifactId: 'version-one', logicalArtifactId: 'report', contentVersion: 1, contentHash: 'a'.repeat(64), expectedAcceptanceRevision: 0, requestId: 'defer-one' }
  it('restores only the explicit frozen qualification request and never treats a previous null as restart authority', () => {
    const key = artifactPendingKey('inbox', 'conversation', 'report')
    for (const status of ['pending', 'unknown', 'not_accepted']) {
      const restored = restoreArtifactPending({ [key]: { scope: 'inbox', conversationId: 'conversation', logicalArtifactId: 'report', acceptance: { status, input: { ...input, path: '/private/file', previewText: 'old body' } } } })
      expect(restored[key].acceptance).toEqual({ status: 'unknown', input })
      expect(JSON.stringify(restored)).not.toMatch(/private|old body/)
      expect(updateArtifactPending(restored, key, restored[key])[key].acceptance?.input.artifactId).toBe('version-one')
    }
    expect(restoreArtifactPending({ [key]: { scope: 'inbox', conversationId: 'conversation', logicalArtifactId: 'report', acceptance: { status: 'pending', input: { ...input, logicalArtifactId: 'another' } } } })).toEqual({})
  })
  it('checks the actual qualification receipt without accepting another version, content or source', () => {
    const receipt: ArtifactAcceptanceReceipt = { id: input.requestId, fingerprint: 'fingerprint', conversationId: 'conversation', acceptanceId: input.artifactId, acceptanceRevision: 1, acceptedAt: '2026-10-01', acceptance: { ...input, id: input.artifactId, conversationId: 'conversation', userId: 'user', revision: 1, status: 'pending', createdAt: '2026-10-01', updatedAt: '2026-10-01' } }
    expect(artifactAcceptanceReceiptMatches(input, receipt, 'conversation')).toBe(true)
    for (const patch of [{ id: 'other-key' }, { conversationId: 'other' }, { acceptanceId: 'different' }, { acceptance: { ...receipt.acceptance, contentVersion: 2 } }, { acceptance: { ...receipt.acceptance, contentHash: 'b'.repeat(64) } }, { acceptance: { ...receipt.acceptance, logicalArtifactId: 'different' } }]) expect(artifactAcceptanceReceiptMatches(input, { ...receipt, ...patch }, 'conversation')).toBe(false)
  })
  it('keeps inbox tabs apart from conversation tabs and preserves the clicked old version and exact work', () => {
    const old: DetailTarget = { type: 'artifact', id: input.artifactId, logicalArtifactId: input.logicalArtifactId, conversationId: 'conversation', name: '报告', contentHash: input.contentHash, contentVersion: input.contentVersion, requestId: 'open-old' }
    const inbox = detailWorkspacesReducer({}, { scope: 'inbox', action: { type: 'open', target: old } })
    const both = detailWorkspacesReducer(inbox, { scope: 'conversations', action: { type: 'open', target: { ...old, id: 'version-two', contentVersion: 2, contentHash: 'b'.repeat(64), requestId: 'open-new' } } })
    expect(both.inbox.tabs[0].target).toEqual(old)
    expect(both.conversations.tabs[0].key).not.toBe(both.inbox.tabs[0].key)
    const work = detailWorkspacesReducer(both, { scope: 'inbox', action: { type: 'open', target: { type: 'activity', id: 'conversation', workId: 'original-work', requestId: 'focus-one' } } })
    const focused = detailWorkspacesReducer(work, { scope: 'inbox', action: { type: 'open', target: { type: 'activity', id: 'conversation', workId: 'another-work', requestId: 'focus-two' } } })
    expect(focused.inbox.tabs).toHaveLength(2); expect(focused.inbox.tabs[1].target).toMatchObject({ workId: 'another-work', requestId: 'focus-two' })
    expect(focused.conversations).toBe(both.conversations)
  })
})
