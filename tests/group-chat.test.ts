/*
 * [INPUT]: 群聊展示投影与消息、工作、产物合同。
 * [OUTPUT]: 即时宿主证据优先且 false 不回退陈旧正文、不覆盖人工待审；普通回复去除重复触发引用而保留明确引用/原数据、连续发言不得跨边界、歧义文件不得错挂、审批不得错归属、无证据不得显示已交付。
 * [POS]: Vitest 群聊展示不变量回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { approvalsByMessage, artifactsByMessage, continuesMessage, groupMessages, workDisplayState } from '../src/renderer/pages/conversations/group-chat'
import type { ConversationDetail, Message, WorkItem } from '../src/shared/domain'

const message: Message = { id: 'm', conversationId: 'c', senderType: 'agent', senderId: 'writer', senderName: '写手', content: '报告已完成', status: 'completed', sequence: 1, turnId: 't', runId: 'r', createdAt: '2026-09-29T10:00:00Z' }
const work: WorkItem = { schemaVersion: 2, id: 'w', conversationId: 'c', sourceMessageId: 'u', key: 'report', scope: '报告', deliverable: '报告', ownerAgentId: 'writer', version: 1, status: 'delivered', budgetId: 'b', rootWorkId: 'w', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: ['m'], artifactIds: ['a'], resultVersion: 1, requiresReview: false, outcome: { disposition: 'delivered', summary: '完成', evidence: [{ kind: 'answer', reference: '报告已完成' }] }, createdAt: message.createdAt, updatedAt: message.createdAt }
const detail: ConversationDetail = { conversation: { id: 'c', kind: 'group', title: '报告', agentIds: ['writer'], mode: 'natural', sharedKnowledgeIds: [], workspacePath: '/fixture', createdAt: message.createdAt, updatedAt: message.createdAt }, messages: [message], runs: [{ id: 'r', conversationId: 'c', agentId: 'writer', agentName: '写手', triggerMessageId: 'u', messageId: 'm', status: 'completed', createdAt: message.createdAt, toolEvents: [] }], artifacts: [{ id: 'a', ownerAgentId: 'writer', runId: 'r', name: '报告.md', path: '/fixture/报告.md', size: 12 }], workItems: [work] }

describe('group messages preserve origin and result boundaries', () => {
  const user: Message = { ...message, id: 'u', senderType: 'user', senderId: 'user', senderName: '你', content: '大家好', runId: undefined }
  it('omits a current-request quote during streaming and after completion without changing stored context', () => {
    for (const status of ['streaming', 'completed'] as const) {
      const reply = { ...message, status, replyToMessageId: user.id }
      const projected = groupMessages({ ...detail, messages: [user, reply] })
      expect(projected[1].replyToMessageId).toBeUndefined()
      expect(projected[1].content).toBe(reply.content)
      expect(reply.replyToMessageId).toBe(user.id)
    }
  })
  it('preserves human quotes, peer replies, replies to older user messages and missing targets', () => {
    const older = { ...user, id: 'older' }, peer = { ...message, id: 'peer', senderId: 'researcher' }
    for (const reply of [{ ...user, id: 'manual', replyToMessageId: user.id }, ...[older.id, peer.id, 'missing'].map(replyToMessageId => ({ ...message, replyToMessageId }))]) {
      expect(groupMessages({ ...detail, messages: [user, older, peer, reply] }).at(-1)).toBe(reply)
    }
  })
  it('uses persisted turn identity when available and never guesses an unknown trigger from text', () => {
    const reply = { ...message, replyToMessageId: user.id }
    const history = { ...detail, runs: [], messages: [user, reply] }
    expect(groupMessages(history)[1]).toBe(reply)
    const turn = { id: 't', conversationId: 'c', triggerMessageId: user.id, status: 'completed' as const, generation: 1, createdAt: message.createdAt, modelCalls: 2, publicMessages: 1 }
    expect(groupMessages({ ...history, turns: [turn] })[1].replyToMessageId).toBeUndefined()
    expect(groupMessages({ ...history, turns: [{ ...turn, conversationId: 'other' }] })[1]).toBe(reply)
    expect(groupMessages({ ...history, runs: [{ ...detail.runs[0], messageId: 'other' }] })[1]).toBe(reply)
    const next = { ...reply, id: 'next', runId: 'next-run', sequence: 3 }
    const projected = groupMessages({ ...history, turns: [turn], messages: [user, reply, next] })
    expect(continuesMessage(projected[1], projected[2])).toBe(true)
  })
  it('groups only completed same-turn utterances within three minutes', () => {
    const next = { ...message, id: 'm2', sequence: 2, createdAt: '2026-09-29T10:01:00Z' }
    expect(continuesMessage(message, next)).toBe(true)
    for (const patch of [{ senderId: 'other' }, { turnId: 'other' }, { turnId: undefined }, { conversationId: 'other' }, { replyToMessageId: 'u' }, { status: 'streaming' as const }, { createdAt: '2026-09-29T10:04:00Z' }, { createdAt: 'invalid' }]) expect(continuesMessage(message, { ...next, ...patch })).toBe(false)
    expect(continuesMessage(message, next, true)).toBe(false)
    const origin = { kind: 'automation' as const, automationId: 'auto', occurrenceId: 'first', name: '日报', authorizedFingerprint: 'f' }
    expect(continuesMessage({ ...message, origin }, next)).toBe(false)
    expect(continuesMessage({ ...message, origin }, { ...next, origin: { ...origin, occurrenceId: 'second' } })).toBe(false)
  })
  it('keeps ambiguous, foreign-owned and unpublished files in the global list', () => {
    expect(artifactsByMessage(detail).get('m')).toEqual(detail.artifacts)
    expect(artifactsByMessage({ ...detail, workItems: [{ ...work, resultMessageIds: ['m', 'm2'] }] }).size).toBe(0)
    expect(artifactsByMessage({ ...detail, artifacts: [{ ...detail.artifacts[0], ownerAgentId: 'other' }] }).size).toBe(0)
    expect(artifactsByMessage({ ...detail, messages: [{ ...message, status: 'streaming' }] }).size).toBe(0)
    expect(artifactsByMessage({ ...detail, artifacts: [{ ...detail.artifacts[0], runId: 'other-run' }] }).size).toBe(0)
    expect(artifactsByMessage({ ...detail, workItems: [] }).get('m')).toEqual(detail.artifacts)
    expect(artifactsByMessage({ ...detail, workItems: [], messages: [message, { ...message, id: 'second' }] }).size).toBe(0)
  })
  it('shows a private-draft approval without guessing a preceding message', () => {
    const approval = { id: 'approval', runId: 'r', conversationId: 'c', agentName: '写手', command: 'pwd', cwd: '/fixture' }
    expect(approvalsByMessage(detail, [approval]).byMessage.get('m')).toEqual([approval])
    expect(approvalsByMessage({ ...detail, runs: [] }, [approval])).toEqual({ byMessage: new Map(), pending: [approval] })
    expect(approvalsByMessage(detail, [{ ...approval, conversationId: 'other' }]).pending).toEqual([])
  })
  it('does not equate a completed run or missing evidence with delivery', () => {
    expect(workDisplayState(work, detail, []).label).toBe('已交付')
    expect(workDisplayState(work, { ...detail, messages: [] }, []).label).toBe('交付待核对')
    expect(workDisplayState(work, { ...detail, messages: [{ ...message, senderId: 'other' }] }, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, requiresReview: true }, detail, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, outcome: { disposition: 'delivered', summary: '完成' } }, detail, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, status: 'blocked' }, detail, []).label).toBe('需要处理')
    const approval = { id: 'approval', runId: 'r', conversationId: 'c', agentName: '写手', command: 'pwd', cwd: '/fixture' }
    expect(workDisplayState({ ...work, status: 'running', activeRunId: 'r' }, detail, [approval]).label).toBe('待确认')
    expect(workDisplayState({ ...work, status: 'running', activeRunId: 'other' }, detail, [approval]).label).toBe('正在处理')
  })
  it('uses current host evidence checks without loading historical bodies or overriding review', () => {
    const metadata = { ...detail, messages: [], workEvidenceVerified: { w: true } }
    expect(workDisplayState(work, metadata, []).label).toBe('已交付')
    expect(workDisplayState(work, { ...detail, workEvidenceVerified: { w: false } }, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, requiresReview: true }, metadata, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, outcome: { disposition: 'delivered', summary: '无证据' } }, metadata, []).label).toBe('交付待核对')
    expect(workDisplayState({ ...work, status: 'blocked' }, metadata, []).label).toBe('需要处理')
  })
})
