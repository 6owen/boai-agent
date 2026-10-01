/*
 * [INPUT]: 当前 SQLite 问题/消息/轮次/员工与原 Work 仓库。
 * [OUTPUT]: 原问题权威关系、版本和授权复核；回答原关系同事务提交且不创建预算或独立待办。
 * [POS]: D5 普通问题补充的宿主事务边界。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Conversation, DecisionRecord, DigitalAgent, DiscussionTurn, Message, PublishedUserQuestion, WorkItem } from '../../../shared/domain'
import type { RecordTransaction } from '../../adapters/storage/product-store'
import { WorkRepository, WorkUnavailableError } from '../collaboration/work-repository'

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
