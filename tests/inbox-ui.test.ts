/*
 * [INPUT]: 聊天原问题冻结请求、实际补充回执、明确成果版本与旧待处理页未决请求。
 * [OUTPUT]: 原问题/工作/预算关联不漂移、自动化同轮次多个原问题独立投影及精确Work回执；旧完成/同伴失败轮次只凭真实Run/Work/原公开问题补原卡，不误开放无Work正文/取消/中断；新旧混合问题精确原消息核读及只答一个/错误来源拒绝、重启只核对、显式待验收版本/hash与旧页原请求在聊天恢复且不覆盖当前请求的意图验证。
 * [POS]: D5 聊天 Renderer 状态测试；保留底层待处理 DTO，不执行审批、补充、采用或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { chatQuestions, inboxQuestionReceiptMatches, restoreInboxQuestionRequests, updateInboxQuestionRequests, type InboxQuestionRequest } from '../apps/electron/src/renderer/pages/conversations/question-state'
import { artifactAcceptanceReceiptMatches, artifactPendingKey, artifactPendingScope, restoreArtifactPending, updateArtifactPending } from '../apps/electron/src/renderer/components/detail-panel/artifact-state'
import { detailWorkspacesReducer, type DetailTarget } from '../apps/electron/src/renderer/components/detail-panel/tabs-state'
import type { ArtifactAcceptanceInput, ArtifactAcceptanceReceipt } from '../packages/shared/src/domain/artifacts'
import type { AgentRun, ConversationDetail, Message, WorkItem } from '../packages/shared/src/domain'

describe('chat questions require the actual published message and original owner', () => {
  const question = { id: 'original-question', messageId: 'problem-message', content: '请明确交付对象？', revision: 2 }
  const message: Message = { id: question.messageId, conversationId: 'conversation', senderType: 'agent', senderId: 'employee', senderName: '员工', content: question.content, status: 'completed', sequence: 2, createdAt: '2026-10-01' }
  const work: WorkItem = { id: 'original-work', schemaVersion: 2, conversationId: 'conversation', sourceMessageId: 'request', key: 'file-task', scope: '发布报告', deliverable: '报告', ownerAgentId: 'employee', version: 1, status: 'waiting', budgetId: 'original-budget', rootWorkId: 'original-work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 1, resultMessageIds: [message.id], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: '2026-10-01', updatedAt: '2026-10-01', userQuestion: question }
  const view = (messages: Message[] = [message], works: WorkItem[] = [work]): ConversationDetail => ({ conversation: { id: 'conversation', kind: 'group', title: '原聊天', agentIds: ['employee'], mode: 'natural', workspacePath: '/private/conversation', sharedKnowledgeIds: [], createdAt: '2026-10-01', updatedAt: '2026-10-01' }, messages, workItems: works, runs: [], artifacts: [] })
  it('projects the question with its exact message, revision and original work instead of a separate task', () => {
    expect(chatQuestions(view())).toEqual([{ itemId: `question:${question.id}`, conversationId: 'conversation', questionMessageId: message.id, questionId: question.id, revision: 2, workId: work.id, content: question.content, answeredMessageId: undefined }])
    const another = { ...work, id: 'another-work', userQuestion: { ...question, id: 'another-question', messageId: 'another-message' } }
    expect(chatQuestions(view([message, { ...message, id: 'another-message' }], [work, another])).map(value => [value.questionId, value.workId])).toEqual([[question.id, work.id], ['another-question', 'another-work']])
  })
  it('does not expose cached questions when the actual source is missing, unpublished, another user or another chat', () => {
    expect(chatQuestions(view([]))).toEqual([])
    for (const patch of [{ status: 'streaming' as const }, { status: 'failed' as const }, { senderType: 'user' as const }, { conversationId: 'other-chat' }, { content: '旧问题正文已失效' }]) expect(chatQuestions(view([{ ...message, ...patch }]))).toEqual([])
  })
  it('keeps plain chat questions without creating work and never promotes an unowned task question', () => {
    const detail = view([message], [])
    detail.decisions = [{ id: 'decision', turnId: 'turn', agentId: 'employee', deliveryId: 'delivery', createdAt: '2026-10-01', action: 'ask', responseKind: 'chat', userQuestion: question, observedThroughSequence: message.sequence }]
    expect(chatQuestions(detail)[0]).toMatchObject({ questionId: question.id, questionMessageId: message.id })
    expect(chatQuestions(detail)[0].workId).toBeUndefined()
    detail.decisions![0].responseKind = 'task'
    expect(chatQuestions(detail)).toEqual([])
  })
  it('keeps the committed answer identity and does not reinterpret an automated work as an ordinary question', () => {
    expect(chatQuestions(view([message], [{ ...work, userQuestion: { ...question, answeredMessageId: 'original-answer' } }]))[0]).toMatchObject({ questionId: question.id, answeredMessageId: 'original-answer', workId: work.id })
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    expect(chatQuestions(view([message], [{ ...work, origin }]))).toEqual([])
    expect(chatQuestions(view([{ ...message, origin }]))).toEqual([])
  })
  it('uses only the latest published message belonging to the exact waiting automation turn', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const automatic = { ...message, origin, turnId: 'waiting-turn' }, latest = { ...automatic, id: 'latest-question', sequence: 3, content: '最新的明确问题' }
    const detail = view([automatic, latest, { ...latest, id: 'ordinary', origin: undefined, turnId: 'ordinary-turn', sequence: 4 }, { ...latest, id: 'wrong-occurrence', origin: { ...origin, occurrenceId: 'another-occurrence' }, sequence: 5 }, { ...latest, id: 'streaming', status: 'streaming', sequence: 6 }], [])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 1, publicMessages: 1, origin }]
    expect(chatQuestions(detail)).toEqual([{ itemId: 'question:occurrence:original-occurrence', conversationId: 'conversation', questionMessageId: latest.id, questionId: 'occurrence:original-occurrence', revision: 0, content: latest.content, occurrenceId: origin.occurrenceId, automationId: origin.automationId }])
    detail.turns[0].status = 'completed'
    expect(chatQuestions(detail)).toEqual([])
  })
  it('reads a recorded legacy automation chat question through its real turn without rewriting origin or binding an ordinary Work', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const legacy = { ...message, turnId: 'waiting-turn' }, detail = view([legacy])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 1, publicMessages: 1, origin }]
    detail.decisions = [{ id: 'legacy-decision', turnId: 'waiting-turn', agentId: 'employee', deliveryId: 'delivery', createdAt: '2026-10-01', action: 'ask', responseKind: 'chat', userQuestion: question, observedThroughSequence: message.sequence }]
    expect(chatQuestions(detail)).toEqual([{ itemId: `question:occurrence:original-occurrence:message:${message.id}`, conversationId: 'conversation', questionMessageId: message.id, questionId: 'occurrence:original-occurrence', revision: 0, content: question.content, occurrenceId: origin.occurrenceId, automationId: origin.automationId }])
    expect(legacy.origin).toBeUndefined(); expect(detail.messages[0].origin).toBeUndefined()
  })
  it('reads an explicit automation reply turn as the committed answer even when that answer is outside the message window', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }, automated = { ...message, origin, turnId: 'waiting-turn' }
    const waiting = { id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user' as const, generation: 1, createdAt: '2026-10-01', modelCalls: 1, publicMessages: 1, origin }
    const reply = { ...waiting, id: 'reply-turn', triggerMessageId: 'accepted-answer', status: 'completed' as const, replyToTurnIds: ['waiting-turn'] }
    const detail = view([automated], [])
    detail.turns = [waiting, { ...reply, origin: { ...origin, occurrenceId: 'another-occurrence' } }]
    expect(chatQuestions(detail)[0].answeredMessageId).toBeUndefined()
    detail.turns = [waiting, reply]
    expect(chatQuestions(detail)[0]).toMatchObject({ questionMessageId: message.id, answeredMessageId: 'accepted-answer', occurrenceId: origin.occurrenceId })
    expect(detail.messages.some(value => value.id === 'accepted-answer')).toBe(false)
  })
  it('keeps two employees’ same-turn automation Work questions independent after only the first one is answered', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const firstMessage = { ...message, origin, turnId: 'waiting-turn' }, secondQuestion = { ...question, id: 'second-question', messageId: 'second-message', content: '第二位员工需要哪个输出格式？' }, secondMessage = { ...firstMessage, id: secondQuestion.messageId, senderId: 'another-employee', content: secondQuestion.content, sequence: 3 }
    const firstWork = { ...work, origin }, secondWork = { ...work, id: 'second-work', ownerAgentId: secondMessage.senderId, rootWorkId: 'second-work', origin, userQuestion: secondQuestion, resultMessageIds: [secondMessage.id] }
    const detail = view([firstMessage, secondMessage], [firstWork, secondWork])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 2, publicMessages: 2, origin }]
    const targets = chatQuestions(detail)
    expect(targets.map(value => [value.itemId, value.questionMessageId, value.workId, value.questionId, value.revision])).toEqual([
      [`question:occurrence:${origin.occurrenceId}:message:${firstMessage.id}`, firstMessage.id, firstWork.id, `occurrence:${origin.occurrenceId}`, 0],
      [`question:occurrence:${origin.occurrenceId}:message:${secondMessage.id}`, secondMessage.id, secondWork.id, `occurrence:${origin.occurrenceId}`, 0],
    ])
    firstWork.userQuestion = { ...question, answeredMessageId: 'outside-window-answer' }
    detail.turns.push({ ...detail.turns[0], id: 'reply-turn', triggerMessageId: 'outside-window-answer', status: 'completed', replyToTurnIds: ['waiting-turn'] })
    expect(chatQuestions(detail).map(value => [value.workId, value.answeredMessageId])).toEqual([[firstWork.id, 'outside-window-answer'], [secondWork.id, undefined]])
    expect(chatQuestions(detail).filter(value => !value.answeredMessageId).map(value => value.questionMessageId)).toEqual([secondMessage.id])
    expect(detail.messages.some(value => value.id === 'outside-window-answer')).toBe(false)
  })
  it.each(['completed', 'failed'] as const)('retains only exact published Work questions in an old %s turn and never opens a peer through its answer', status => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const firstQuestion = { ...question, id: `work:${work.id}:1` }, firstMessage = { ...message, origin, turnId: 'old-turn', runId: 'first-run' }, firstWork: WorkItem = { ...work, origin, version: question.revision, resultVersion: 1, userQuestion: firstQuestion }
    const secondMessage = { ...firstMessage, id: 'second-message', senderId: 'another-employee', runId: 'second-run', sequence: 3 }, secondWork = { ...firstWork, id: 'second-work', ownerAgentId: secondMessage.senderId, rootWorkId: 'second-work', resultMessageIds: [secondMessage.id], userQuestion: { ...firstQuestion, id: 'work:second-work:1', messageId: secondMessage.id } }
    const run: AgentRun = { id: firstMessage.runId, conversationId: firstMessage.conversationId, turnId: firstMessage.turnId, agentId: firstMessage.senderId, agentName: '员工', triggerMessageId: 'request', messageId: firstMessage.id, status: 'completed', responseKind: 'task', workId: firstWork.id, createdAt: firstMessage.createdAt, toolEvents: [], origin }
    const detail = view([firstMessage, secondMessage], [firstWork, secondWork])
    detail.turns = [{ id: 'old-turn', conversationId: 'conversation', triggerMessageId: 'request', status, generation: 1, createdAt: '2026-10-01', modelCalls: 2, publicMessages: 2, origin }]
    detail.runs = [run, { ...run, id: secondMessage.runId, agentId: secondMessage.senderId, messageId: secondMessage.id, workId: secondWork.id }]
    expect(chatQuestions(detail).map(value => [value.questionMessageId, value.workId, value.answeredMessageId])).toEqual([[firstMessage.id, firstWork.id, undefined], [secondMessage.id, secondWork.id, undefined]])
    firstWork.userQuestion = { ...firstQuestion, answeredMessageId: 'only-first-answer' }
    expect(chatQuestions(detail).map(value => [value.workId, value.answeredMessageId])).toEqual([[firstWork.id, 'only-first-answer'], [secondWork.id, undefined]])
    for (const state of ['cancelled', 'interrupted'] as const) {
      detail.turns[0].status = state
      expect(chatQuestions(detail).filter(value => !value.answeredMessageId)).toEqual([])
    }
    detail.turns[0].status = status
    for (const patch of [{ workId: undefined }, { status: 'failed' as const }, { messageId: firstMessage.id }, { agentId: firstMessage.senderId }, { origin: { ...origin, authorizedFingerprint: 'different-permission' } }]) {
      detail.runs[1] = { ...run, id: secondMessage.runId, agentId: secondMessage.senderId, messageId: secondMessage.id, workId: secondWork.id, ...patch }
      expect(chatQuestions(detail).filter(value => !value.answeredMessageId)).toEqual([])
    }
    detail.workItems = []; detail.runs = []
    expect(chatQuestions(detail)).toEqual([])
  })
  it('uses only a fixed original message and Work receipt to mark a recorded automation question answered', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }, automated = { ...message, origin, turnId: 'waiting-turn' }
    const answer: Message = { ...message, id: 'accepted-answer', origin, turnId: 'reply-turn', senderType: 'user', senderId: 'user', content: '明确补充', sequence: 3, inboxReply: { questionId: `occurrence:${origin.occurrenceId}`, questionRevision: 8, questionMessageId: automated.id, workId: work.id } }
    const detail = view([automated, answer], [{ ...work, origin }])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 1, publicMessages: 1, origin }]
    expect(chatQuestions(detail)[0]).toMatchObject({ workId: work.id, answeredMessageId: answer.id })
    for (const patch of [{ workId: 'another-work' }, { questionMessageId: 'another-message' }, { questionId: 'occurrence:another-occurrence' }]) {
      detail.messages[1] = { ...answer, inboxReply: { ...answer.inboxReply!, ...patch } }
      expect(chatQuestions(detail)[0].answeredMessageId).toBeUndefined()
    }
    detail.messages[1] = { ...answer, origin: { ...origin, authorizedFingerprint: 'changed-source' } }
    expect(chatQuestions(detail)[0].answeredMessageId).toBeUndefined()
  })
  it('never converts a recorded task’s invalid owner, source or question content into the old latest-message fallback', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }, automated = { ...message, origin, turnId: 'waiting-turn' }
    const detail = view([automated], [{ ...work, origin }])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 1, publicMessages: 1, origin }]
    for (const patch of [{ ownerAgentId: 'another-employee' }, { origin: undefined }, { origin: { ...origin, authorizedFingerprint: 'changed-source' } }, { userQuestion: { ...question, content: '原文中没有的问题' } }]) {
      detail.workItems = [{ ...work, origin, ...patch }]
      expect(chatQuestions(detail)).toEqual([])
    }
    detail.workItems = [{ ...work, origin, userQuestion: undefined }]
    expect(chatQuestions(detail)).toEqual([])
  })
  it('projects every recorded automation chat decision without promoting a task decision into a no-Work question', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }, automated = { ...message, origin, turnId: 'waiting-turn' }, secondQuestion = { ...question, id: 'another-question', messageId: 'another-message' }, another = { ...automated, id: secondQuestion.messageId, senderId: 'another-employee', sequence: 3 }
    const detail = view([automated, another], [])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 2, publicMessages: 2, origin }]
    detail.decisions = [question, secondQuestion].map((value, index) => ({ id: `decision-${index}`, turnId: 'waiting-turn', agentId: index ? another.senderId : automated.senderId, deliveryId: `delivery-${index}`, createdAt: '2026-10-01', action: 'ask', responseKind: 'chat', userQuestion: value, observedThroughSequence: 3 }))
    expect(chatQuestions(detail).map(value => [value.questionMessageId, value.workId])).toEqual([[automated.id, undefined], [another.id, undefined]])
    detail.decisions[1].responseKind = 'task'
    expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id])
  })
  it('keeps a legacy employee question alongside a recorded Work question and never answers both through a shared turn reply', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const automated = { ...message, origin, turnId: 'waiting-turn' }, legacy = { ...automated, id: 'legacy-question', senderId: 'legacy-employee', origin: undefined, content: '旧员工仍需确认哪个格式？', sequence: 3 }
    const answer: Message = { ...message, id: 'work-answer', origin, senderType: 'user', senderId: 'user', turnId: 'reply-turn', sequence: 4, inboxReply: { questionId: `occurrence:${origin.occurrenceId}`, questionRevision: 8, questionMessageId: automated.id, workId: work.id } }
    const detail = view([automated, legacy, answer], [{ ...work, origin }])
    const waiting = { id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user' as const, generation: 1, createdAt: '2026-10-01', modelCalls: 2, publicMessages: 2, origin }
    detail.turns = [waiting, { ...waiting, id: 'reply-turn', triggerMessageId: answer.id, status: 'completed', replyToTurnIds: [waiting.id] }]
    detail.decisions = [{ id: 'legacy-decision', turnId: waiting.id, agentId: legacy.senderId, deliveryId: 'legacy-delivery', createdAt: '2026-10-01', action: 'ask', responseKind: 'chat', observedThroughSequence: 3 }]
    expect(chatQuestions(detail).map(value => [value.itemId, value.workId, value.answeredMessageId])).toEqual([
      [`question:occurrence:${origin.occurrenceId}:message:${automated.id}`, work.id, answer.id],
      [`question:occurrence:${origin.occurrenceId}:message:${legacy.id}`, undefined, undefined],
    ])
    const legacyAnswer: Message = { ...answer, id: 'legacy-answer', inboxReply: { ...answer.inboxReply!, questionMessageId: legacy.id, workId: undefined }, sequence: 5 }
    detail.messages.push(legacyAnswer)
    expect(chatQuestions(detail).map(value => [value.questionMessageId, value.answeredMessageId])).toEqual([[automated.id, answer.id], [legacy.id, legacyAnswer.id]])
    for (const patch of [{ inboxReply: { ...legacyAnswer.inboxReply!, workId: work.id } }, { inboxReply: { ...legacyAnswer.inboxReply!, questionMessageId: automated.id } }, { origin: { ...origin, authorizedFingerprint: 'different-authorization' } }, { status: 'streaming' as const }, { senderType: 'agent' as const }]) {
      detail.messages[3] = { ...legacyAnswer, ...patch }
      expect(chatQuestions(detail).find(value => value.questionMessageId === legacy.id)?.answeredMessageId).toBeUndefined()
      expect(chatQuestions(detail).find(value => value.questionMessageId === automated.id)?.answeredMessageId).toBe(answer.id)
    }
    expect(legacy.origin).toBeUndefined()
  })
  it('keeps mixed legacy compatibility conservative about known task, non-ask and invalid origin messages', () => {
    const origin = { kind: 'automation' as const, automationId: 'schedule', occurrenceId: 'original-occurrence', name: '计划', authorizedFingerprint: 'fingerprint' }
    const automated = { ...message, origin, turnId: 'waiting-turn' }, legacy = { ...automated, id: 'legacy-question', senderId: 'legacy-employee', content: '旧员工的明确问题', sequence: 3 }
    const detail = view([automated, legacy], [{ ...work, origin }])
    detail.turns = [{ id: 'waiting-turn', conversationId: 'conversation', triggerMessageId: 'request', status: 'waiting_user', generation: 1, createdAt: '2026-10-01', modelCalls: 2, publicMessages: 2, origin }]
    expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id, legacy.id])
    detail.decisions = [{ id: 'known-decision', turnId: 'waiting-turn', agentId: legacy.senderId, deliveryId: 'legacy-delivery', createdAt: '2026-10-01', action: 'ask', responseKind: 'task', observedThroughSequence: 3 }]
    expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id])
    detail.decisions[0] = { ...detail.decisions[0], action: 'reply', responseKind: 'chat' }
    expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id])
    detail.decisions = []
    detail.workItems!.push({ ...work, id: 'known-task', ownerAgentId: legacy.senderId, resultMessageIds: [legacy.id], userQuestion: undefined })
    expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id])
    detail.workItems = [{ ...work, origin }]
    for (const patch of [{ origin: { ...origin, authorizedFingerprint: 'wrong-source' } }, { origin: { ...origin, occurrenceId: 'another-occurrence' } }, { conversationId: 'another-chat' }, { status: 'failed' as const }]) {
      detail.messages[1] = { ...legacy, ...patch }
      expect(chatQuestions(detail).map(value => value.questionMessageId)).toEqual([automated.id])
    }
  })
})

describe('chat question reply request identity', () => {
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
  it('freezes an explicit automation occurrence separately from ordinary chat or another waiting occurrence', () => {
    const automatic: InboxQuestionRequest = { ...request, itemId: 'question:occurrence:original-occurrence', input: { ...request.input, questionId: 'occurrence:original-occurrence' }, workId: undefined, occurrenceId: 'original-occurrence', automationId: 'schedule' }
    const origin = { kind: 'automation' as const, occurrenceId: automatic.occurrenceId!, automationId: automatic.automationId!, name: '计划', authorizedFingerprint: 'fingerprint' }
    const message: Message = { id: 'reply-message', conversationId: automatic.conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: automatic.input.content, status: 'completed', sequence: 10, createdAt: '2026-10-01', origin, inboxReply: { questionId: automatic.input.questionId, questionRevision: automatic.input.expectedRevision, questionMessageId: automatic.questionMessageId, workId: automatic.workId } }
    expect(inboxQuestionReceiptMatches(automatic, message)).toBe(true)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, origin: undefined })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, origin: { ...origin, occurrenceId: 'another-occurrence' } })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, origin: { ...origin, automationId: 'another-schedule' } })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, inboxReply: undefined })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, inboxReply: { ...message.inboxReply!, questionRevision: 3 } })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, inboxReply: { ...message.inboxReply!, questionMessageId: 'another-question' } })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, inboxReply: { ...message.inboxReply!, workId: request.workId } })).toBe(false)
    expect(inboxQuestionReceiptMatches(automatic, { ...message, senderType: 'agent' })).toBe(false)
    expect(updateInboxQuestionRequests({ [automatic.itemId]: automatic }, automatic.itemId, { ...automatic, occurrenceId: 'another-occurrence' }, automatic.input.requestId)).toBeUndefined()
    expect(restoreInboxQuestionRequests({ [automatic.itemId]: { ...automatic, automationId: undefined } })).toEqual({})
  })
  it('accepts an automation continuation only when the receipt keeps the viewed original Work, while legacy no-Work requests remain separate', () => {
    const automatic: InboxQuestionRequest = { ...request, itemId: 'question:occurrence:original-occurrence:message:problem-message', input: { ...request.input, questionId: 'occurrence:original-occurrence' }, occurrenceId: 'original-occurrence', automationId: 'schedule' }
    const origin = { kind: 'automation' as const, occurrenceId: automatic.occurrenceId!, automationId: automatic.automationId!, name: '计划', authorizedFingerprint: 'fingerprint' }
    const message: Message = { id: 'reply-message', conversationId: automatic.conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: automatic.input.content, status: 'completed', sequence: 10, createdAt: '2026-10-01', origin, inboxReply: { questionId: automatic.input.questionId, questionRevision: automatic.input.expectedRevision, questionMessageId: automatic.questionMessageId, workId: automatic.workId } }
    expect(inboxQuestionReceiptMatches(automatic, message)).toBe(true)
    for (const workId of [undefined, 'another-work']) expect(inboxQuestionReceiptMatches(automatic, { ...message, inboxReply: { ...message.inboxReply!, workId } })).toBe(false)
    const legacy = { ...automatic, workId: undefined }
    expect(inboxQuestionReceiptMatches(legacy, message)).toBe(false)
    expect(inboxQuestionReceiptMatches(legacy, { ...message, inboxReply: { ...message.inboxReply!, workId: undefined } })).toBe(true)
    expect(restoreInboxQuestionRequests({ [automatic.itemId]: automatic })[automatic.itemId]).toEqual({ ...automatic, status: 'unknown' })
    expect(updateInboxQuestionRequests({ [automatic.itemId]: automatic }, automatic.itemId, { ...automatic, workId: 'another-work' }, automatic.input.requestId)).toBeUndefined()
  })
})

describe('chat exact source and explicit acceptance', () => {
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
  it('recovers a retired-page request from the chat without rebinding its original key or explicit version', () => {
    const key = artifactPendingKey('inbox', 'conversation', 'report')
    const restored = restoreArtifactPending({ [key]: { scope: 'inbox', conversationId: 'conversation', logicalArtifactId: 'report', acceptance: { status: 'pending', input } } })
    expect(artifactPendingScope(restored, 'conversations', 'conversation', 'report')).toBe('inbox')
    expect(restored[key].acceptance).toEqual({ status: 'unknown', input })
    expect(artifactPendingScope(restored, 'conversations', 'other-chat', 'report')).toBe('conversations')
    expect(artifactPendingScope(restored, 'conversations', 'conversation', 'another-artifact')).toBe('conversations')
  })
  it('reconciles the current chat request before a separate older page request without overwriting either', () => {
    const legacyKey = artifactPendingKey('inbox', 'conversation', 'report'), chatKey = artifactPendingKey('conversations', 'conversation', 'report')
    const current = { ...input, artifactId: 'version-two', contentVersion: 2, contentHash: 'b'.repeat(64), requestId: 'defer-two' }
    const restored = restoreArtifactPending({ [legacyKey]: { scope: 'inbox', conversationId: 'conversation', logicalArtifactId: 'report', acceptance: { status: 'pending', input } }, [chatKey]: { scope: 'conversations', conversationId: 'conversation', logicalArtifactId: 'report', acceptance: { status: 'pending', input: current } } })
    expect(artifactPendingScope(restored, 'conversations', 'conversation', 'report')).toBe('conversations')
    expect(restored[legacyKey].acceptance?.input).toEqual(input)
    expect(restored[chatKey].acceptance?.input).toEqual(current)
    const reconciled = updateArtifactPending(restored, chatKey)
    expect(artifactPendingScope(reconciled, 'conversations', 'conversation', 'report')).toBe('inbox')
    expect(reconciled[legacyKey]).toEqual(restored[legacyKey])
  })
  it('keeps source chat details apart from contact details and preserves the clicked old version and exact work', () => {
    const old: DetailTarget = { type: 'artifact', id: input.artifactId, logicalArtifactId: input.logicalArtifactId, conversationId: 'conversation', name: '报告', contentHash: input.contentHash, contentVersion: input.contentVersion, requestId: 'open-old' }
    const chat = detailWorkspacesReducer({}, { scope: 'conversations', action: { type: 'open', target: old } })
    const both = detailWorkspacesReducer(chat, { scope: 'contacts', action: { type: 'open', target: { type: 'agent', id: 'employee' } } })
    expect(both.conversations.tabs[0].target).toEqual(old)
    const work = detailWorkspacesReducer(both, { scope: 'conversations', action: { type: 'open', target: { type: 'activity', id: 'conversation', workId: 'original-work', requestId: 'focus-one' } } })
    const focused = detailWorkspacesReducer(work, { scope: 'conversations', action: { type: 'open', target: { type: 'activity', id: 'conversation', workId: 'another-work', requestId: 'focus-two' } } })
    expect(focused.conversations.tabs).toHaveLength(2); expect(focused.conversations.tabs[1].target).toMatchObject({ workId: 'another-work', requestId: 'focus-two' })
    expect(focused.contacts).toBe(both.contacts)
  })
})
