/*
 * [INPUT]: 原用户消息、确切会话/轮次身份与有界正文窗口。
 * [OUTPUT]: 零运行中断可见，已完成/活动/取消不误报；原历史不被其他消息、群回复或缺失身份替换，不改变交付及存储事实。
 * [POS]: 会话中断说明的纯投影不变量；桌面入口及真实故障另由BDD验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { describe, expect, it } from 'vitest'
import { interruptedTriggerTurn } from '../apps/electron/src/renderer/pages/conversations/activity'
import type { ConversationDetail, DiscussionTurn, Message } from '../packages/shared/src/domain'

const message: Message = { id: 'request', conversationId: 'chat', turnId: 'turn', senderType: 'user', senderId: 'user', senderName: '我', content: '请交付报告', status: 'completed', sequence: 1, createdAt: '2026-10-06T00:00:00Z' }
const turn: DiscussionTurn = { id: 'turn', conversationId: 'chat', triggerMessageId: 'request', status: 'interrupted', generation: 0, createdAt: message.createdAt, modelCalls: 0, publicMessages: 0 }
const detail: Pick<ConversationDetail, 'conversation' | 'turns'> = { conversation: { id: 'chat', kind: 'direct', title: '同事', agentIds: ['employee'], mode: 'natural', sharedKnowledgeIds: [], workspacePath: '/fixture', createdAt: message.createdAt, updatedAt: message.createdAt }, turns: [turn] }

describe('interruption belongs to the original accepted message', () => {
  it('projects an interrupted admitted turn without inventing a run, response or work', () => {
    const before = structuredClone({ detail, message })
    expect(interruptedTriggerTurn(detail, message)).toBe(turn)
    expect({ detail, message }).toEqual(before)
  })
  it.each(['queued', 'evaluating', 'responding', 'executing', 'waiting_user', 'completed', 'cancelled', 'failed', 'budget_exhausted'] as const)('does not label %s as an interruption', status => {
    expect(interruptedTriggerTurn({ ...detail, turns: [{ ...turn, status }] }, message)).toBeUndefined()
  })
  it('keeps a historical interrupted round even if another request or reply has completed', () => {
    const next = { ...turn, id: 'next', triggerMessageId: 'next-request', status: 'completed' as const, publicMessages: 1 }
    expect(interruptedTriggerTurn({ ...detail, turns: [next, { ...turn, publicMessages: 1 }] }, message)?.id).toBe(turn.id)
    expect(interruptedTriggerTurn(detail, { ...message, id: 'reply', senderType: 'agent', senderId: 'employee' })).toBeUndefined()
  })
  it('never borrows a foreign, mismatched or missing turn despite matching text', () => {
    expect(interruptedTriggerTurn(detail, { ...message, conversationId: 'foreign' })).toBeUndefined()
    expect(interruptedTriggerTurn(detail, { ...message, turnId: 'missing' })).toBeUndefined()
    for (const patch of [{ conversationId: 'foreign' }, { triggerMessageId: 'other-request' }]) expect(interruptedTriggerTurn({ ...detail, turns: [{ ...turn, ...patch }] }, message)).toBeUndefined()
    expect(interruptedTriggerTurn({ ...detail, turns: [] }, message)).toBeUndefined()
  })
  it('uses explicit chronology only for legacy messages without a turn identity', () => {
    const next = { ...turn, id: 'next', status: 'completed' as const, createdAt: '2026-10-06T01:00:00Z' }, legacy = { ...message, turnId: undefined }
    for (const turns of [[turn, next], [next, turn]]) expect(interruptedTriggerTurn({ ...detail, turns }, legacy)).toBeUndefined()
    expect(interruptedTriggerTurn(detail, legacy)).toBe(turn)
  })
})
