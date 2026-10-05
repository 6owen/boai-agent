/*
 * [INPUT]: 当前 SQLite 问题/消息/轮次/运行/员工、自动化等待与原 Work 仓库。
 * [OUTPUT]: 普通/自动化原问题的版本、来源与独立负责人复核；task只沿公开消息的原运行/Work，旧完成/同伴失败轮次仅凭确切已提交任务问题只读兼容，chat保守兼容旧缺记录；回答归原事务。
 * [POS]: D5 原问题补充的宿主事务边界，来源核对只读且不创建预算或独立待办。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentRun, AutomationOccurrence, AutomationOrigin, Conversation, DecisionRecord, DigitalAgent, DiscussionTurn, Message, PublishedUserQuestion, WorkItem } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { WorkRepository, WorkUnavailableError } from '../collaboration/work-repository'
import { publishedWorkQuestionMatches } from '../../../shared/domain/inbox'

export interface QuestionSource { question: PublishedUserQuestion; message: Message; turn: DiscussionTurn; agentId: string; conversation: Conversation; decision?: DecisionRecord; work?: WorkItem }
export async function questionSource(tx: RecordTransaction, questionId: string): Promise<QuestionSource> {
  const match = /^(decision):(.+)$|^(work):([^:]+):(\d+)$/.exec(questionId)
  if (!match) throw new WorkUnavailableError('此问题须从原自动化入口补充或已不存在')
  const decision = match[1] ? await tx.get<DecisionRecord>('decisions', match[2]) : undefined
  const work = match[3] ? await tx.get<WorkItem>('workItems', match[4]) : undefined
  const question = (decision ?? work)?.userQuestion
  if (!question || question.id !== questionId || question.answeredMessageId) throw new WorkUnavailableError('问题已回答、变化或清理，请刷新')
  const message = await tx.get<Message>('messages', question.messageId)
  const turn = message?.turnId && await tx.get<DiscussionTurn>('turns', message.turnId)
  const conversation = message && await tx.get<Conversation>('conversations', message.conversationId)
  const agentId = decision?.agentId ?? work?.ownerAgentId
  const agent = agentId ? await tx.get<DigitalAgent>('agents', agentId) : undefined
  if (!message || message.status !== 'completed' || message.senderType !== 'agent' || !message.content.includes(question.content) || !turn || !conversation || turn.origin || message.origin || work?.origin || await tx.get('conversationCleanup', conversation.id)) throw new WorkUnavailableError('原问题缺少可读的已公开消息或明确普通聊天来源')
  if (!agentId || message.senderId !== agentId || !agent?.active || agent.executionBackend?.kind === 'acp-local' || !conversation.agentIds.includes(agentId)) throw new WorkUnavailableError('原负责人已停用或移出会话，不能自动改派')
  if (decision && (decision.action !== 'ask' || decision.turnId !== turn.id || decision.responseKind === 'task')) throw new WorkUnavailableError('原问题判断关系已失效')
  if (work && (work.conversationId !== conversation.id || !work.resultMessageIds.includes(message.id))) throw new WorkUnavailableError('问题不属于原工作已提交结果')
  return { question, message, turn, agentId, conversation, ...(decision ? { decision } : {}), ...(work ? { work } : {}) }
}

/** Reused before preparation and inside the final message transaction; no waiting state is changed here. */
export async function automationQuestionSource(tx: RecordTransaction, occurrence: AutomationOccurrence, questionMessageId: string): Promise<QuestionSource> {
  const current = await tx.get<AutomationOccurrence>('automationOccurrences', occurrence.id)
  if (!current || current.stateVersion !== occurrence.stateVersion || current.automationId !== occurrence.automationId || current.conversationId !== occurrence.conversationId || current.status !== 'waiting_user' || current.cancellationRequestedAt) throw new WorkUnavailableError('原问题版本已变化或本次运行已停止，请重新核对')
  const original = current.messageId ? await tx.get<Message>('messages', current.messageId) : undefined
  const origin = original?.origin
  const sameOrigin = (value: AutomationOrigin | undefined) => Boolean(value && origin && value.kind === 'automation' && value.automationId === current.automationId && value.occurrenceId === current.id && value.authorizedFingerprint === origin.authorizedFingerprint)
  if (!original || original.conversationId !== current.conversationId || original.status !== 'completed' || !origin?.authorizedFingerprint || !sameOrigin(origin)) throw new WorkUnavailableError('本次运行缺少可信原始来源')
  const message = await tx.get<Message>('messages', questionMessageId)
  const turn = message?.turnId ? await tx.get<DiscussionTurn>('turns', message.turnId) : undefined
  const conversation = await tx.get<Conversation>('conversations', current.conversationId)
  if (!message || message.status !== 'completed' || message.senderType !== 'agent' || !message.content.trim() || message.conversationId !== current.conversationId || !turn || turn.conversationId !== current.conversationId || !['waiting_user', 'completed', 'failed'].includes(turn.status) || !current.waitingTurnIds?.includes(turn.id) || !sameOrigin(turn.origin) || !sameOrigin(message.origin ?? turn.origin) || !conversation || await tx.get('conversationCleanup', conversation.id)) throw new WorkUnavailableError('原问题消息已变化或不属于本次等待，请重新核对')
  const agentId = message.senderId, agent = await tx.get<DigitalAgent>('agents', agentId)
  if (!agent?.active || agent.executionBackend?.kind === 'acp-local' || !conversation.agentIds.includes(agentId)) throw new WorkUnavailableError('原负责人已停用或移出会话，不能自动改派')
  const run = message.runId ? await tx.get<AgentRun>('runs', message.runId) : undefined
  if (message.runId && (!run || run.status !== 'completed' || run.conversationId !== conversation.id || run.turnId !== turn.id || run.agentId !== agentId || run.messageId !== message.id || !sameOrigin(run.origin ?? turn.origin))) throw new WorkUnavailableError('原问题缺少同负责人已提交的运行关系')
  const decisions = (await tx.list<DecisionRecord>('decisions')).filter(value => value.turnId === turn.id && value.agentId === agentId)
  if (run?.responseKind === 'task' || run?.workId) {
    const work = run?.workId ? await tx.get<WorkItem>('workItems', run.workId) : undefined
    const question = work?.userQuestion
    if (!work || !question || !sameOrigin(work.origin) || !publishedWorkQuestionMatches(work, run, message)) throw new WorkUnavailableError('原工作问题已回答、变化或不属于原负责人')
    return { question, message, turn, agentId, conversation, work }
  }
  if (turn.status !== 'waiting_user') throw new WorkUnavailableError('原聊天问题不属于本次等待，请重新核对')
  const matches = decisions.filter(value => value.userQuestion?.messageId === message.id)
  if (matches.length > 1) throw new WorkUnavailableError('原问题判断关系不唯一，请重新核对')
  const decision = matches[0], question = decision?.userQuestion
  if (decision) {
    if (decision.action !== 'ask' || decision.responseKind === 'task' || !question || question.id !== `decision:${decision.id}` || !Number.isInteger(question.revision) || question.revision < 1 || question.answeredMessageId || !question.content.trim() || !message.content.includes(question.content)) throw new WorkUnavailableError('原问题已经回答或判断关系已变化')
    return { question, message, turn, agentId, conversation, decision }
  }
  // Historical chat questions may lack PublishedUserQuestion. Known task/non-question records never use this fallback.
  if (decisions.some(value => value.action !== 'ask' || value.responseKind === 'task' || value.userQuestion) || (await tx.list<WorkItem>('workItems')).some(work => work.conversationId === conversation.id && (work.resultMessageIds.includes(message.id) || work.userQuestion?.messageId === message.id))) throw new WorkUnavailableError('原问题缺少可信判断或工作关系，不能作为旧聊天问题兼容')
  const answered = (await tx.list<Message>('messages')).some(value => value.conversationId === conversation.id && value.status === 'completed' && value.senderType === 'user' && value.senderId === 'user' && sameOrigin(value.origin) && value.inboxReply?.questionMessageId === message.id)
  if (answered) throw new WorkUnavailableError('原问题已经回答，请重新核对当前问题')
  return { question: { id: `occurrence:${current.id}`, messageId: message.id, content: message.content, revision: current.stateVersion }, message, turn, agentId, conversation }
}
export async function validateQuestionReply(tx: RecordTransaction, source: QuestionSource, revision: number, works: WorkRepository) {
  if (source.question.revision !== revision) throw new WorkUnavailableError('原问题版本已变化，请刷新')
  if (!['waiting_user', 'failed', 'completed'].includes(source.turn.status)) throw new WorkUnavailableError('原轮次仍执行、已停止或中断，不能补充接续')
  if (source.work) await works.questionContinuation(tx, source.work.id, source.question.id, revision)
}
export async function answerQuestion(tx: RecordTransaction, source: QuestionSource, revision: number, message: Message, works: WorkRepository) {
  await validateQuestionReply(tx, source, revision, works)
  if (source.work) await works.answerQuestion(tx, source.work.id, source.question.id, revision, message)
  else {
    source.decision!.userQuestion!.answeredMessageId = message.id
    await tx.put({ collection: 'decisions', id: source.decision!.id, value: source.decision })
  }
  // A group may have more than one explicit question; answer only this relation.
  const stillWaiting = (await tx.list<DecisionRecord>('decisions')).some(decision => decision.turnId === source.turn.id && decision.userQuestion && !decision.userQuestion.answeredMessageId && decision.id !== source.decision?.id)
  if (source.turn.status === 'waiting_user' && !stillWaiting) {
    source.turn.status = 'completed'
    await tx.put({ collection: 'turns', id: source.turn.id, value: source.turn })
  }
}
