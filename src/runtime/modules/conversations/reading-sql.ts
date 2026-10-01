/*
 * [INPUT]: records 中真实会话、消息、已发送材料、登记成果及本周期完成身份；类型化筛选与游标。
 * [OUTPUT]: LIMIT 前名称/正文多词 AND、确定性字段相关性与分数/时间/身份游标；只关联相同来源版本的正文索引，隐藏/清理门禁与点击保留；内部明确历史窗口和完成 ordinal/epoch 查询独立。
 * [POS]: D6 宿主固定只读 SQL；不接受外部查询片段，不推断目标，不创建阅读或业务状态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { READING_LIMITS, type ConversationMessagePageQuery, type ConversationSearchKind, type ConversationSearchQuery } from '../../../shared/domain/reading'
import { searchRankingSql } from './search-matching'

export interface ConversationSearchSqlRow { id: string; kind: string; time: string; conversation: string; source: string; completion: string | null; body?: string | null; score?: number }
export interface ConversationMessageSqlRow { source: string; completion: string | null }
export interface ConversationSearchSqlTarget { kind: ConversationSearchKind; id: string; conversationId: string; includeHidden?: boolean }
export interface FirstUnreadCompletionSqlQuery { conversationId: string; epoch: number; boundary: number; sparseSeen: number[] }

export const conversationSearchSourcesSql = `
SELECT s.id,'message' AS kind,json_extract(s.value,'$.conversationId') AS conversationId,json_extract(s.value,'$.createdAt') AS time,s.value AS source,json_extract(s.value,'$.content') AS text,s.id AS messageId FROM records s WHERE s.collection='messages' AND json_extract(s.value,'$.id')=s.id
UNION ALL
SELECT s.id,'material' AS kind,json_extract(s.value,'$.conversationId'),json_extract(s.value,'$.createdAt'),s.value,json_extract(s.value,'$.name'),NULL FROM records s WHERE s.collection='materials' AND json_extract(s.value,'$.id')=s.id AND COALESCE(json_extract(s.value,'$.messageId'),'')<>''
UNION ALL
SELECT s.id,'artifact' AS kind,json_extract(s.value,'$.conversationId'),COALESCE(json_extract(s.value,'$.publishedAt'),''),s.value,json_extract(s.value,'$.name'),NULL FROM records s WHERE s.collection='artifacts' AND json_extract(s.value,'$.id')=s.id AND COALESCE(json_extract(s.value,'$.registrationSource'),'')<>''
UNION ALL
SELECT s.id,'conversation' AS kind,s.id,COALESCE(NULLIF(json_extract(s.value,'$.lastMessageAt'),''),json_extract(s.value,'$.createdAt')),s.value,json_extract(s.value,'$.title'),NULL FROM records s WHERE s.collection='conversations' AND json_extract(s.value,'$.id')=s.id`
const availableConversation = "NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=i.conversationId)"
export const searchableConversationSql = `${availableConversation} AND COALESCE(json_extract(c.value,'$.list.hidden'),0)=0`
const completionJoin = `LEFT JOIN records clock ON clock.collection='conversationCompletionClocks' AND clock.id=i.conversationId LEFT JOIN records completion ON completion.collection='conversationCompletions' AND completion.id=i.messageId AND json_extract(completion.value,'$.messageId')=i.messageId AND json_extract(completion.value,'$.conversationId')=i.conversationId AND json_extract(completion.value,'$.epoch')=json_extract(clock.value,'$.epoch')`
const searchSelect = (score = '0') => `WITH originals AS (${conversationSearchSourcesSql}), sources AS (SELECT original.*,CASE WHEN json_extract(body.value,'$.status')='indexed' AND json_extract(body.value,'$.formatVersion')=1 AND json_extract(body.value,'$.sourceValue')=original.source THEN json_extract(body.value,'$.text') ELSE NULL END AS body FROM originals original LEFT JOIN records body ON body.collection='conversationSearchBodies' AND body.id=original.kind||':'||original.id) SELECT i.id,i.kind,i.time,c.value AS conversation,i.source,i.body,${score} AS score,completion.value AS completion FROM sources i JOIN records c ON c.collection='conversations' AND c.id=i.conversationId ${completionJoin}`

/** Fixed branches and operators; all keyword, filter and cursor values remain bound data. */
export function conversationSearchSql(query: ConversationSearchQuery & { limit: number }) {
  const ranking = searchRankingSql(query.keyword), predicates = [searchableConversationSql, "(i.kind<>'message' OR json_extract(i.source,'$.status')='completed')"], args: (string | number)[] = [...ranking.args]
  for (const term of ranking.terms) { predicates.push("(instr(lower(COALESCE(i.text,'')),?)>0 OR instr(lower(COALESCE(i.body,'')),?)>0)"); args.push(term, term) }
  if (query.scope === 'current' || query.conversationId) { predicates.push('i.conversationId=?'); args.push(query.conversationId ?? '') }
  if (query.agentId) {
    predicates.push("((i.kind='conversation' AND EXISTS(SELECT 1 FROM json_each(json_extract(i.source,'$.agentIds')) member WHERE member.value=?)) OR (i.kind='message' AND json_extract(i.source,'$.senderType')='agent' AND json_extract(i.source,'$.senderId')=?) OR (i.kind='material' AND EXISTS(SELECT 1 FROM json_each(json_extract(i.source,'$.authorizedAgentIds')) member WHERE member.value=?)) OR (i.kind='artifact' AND json_extract(i.source,'$.ownerAgentId')=?))")
    args.push(query.agentId, query.agentId, query.agentId, query.agentId)
  }
  if (query.from) { predicates.push('i.time>=?'); args.push(query.from) }
  if (query.to) { predicates.push('i.time<=?'); args.push(query.to) }
  if (query.kinds) {
    predicates.push(query.kinds.length ? `i.kind IN (${query.kinds.map(() => '?').join(',')})` : '0')
    args.push(...query.kinds)
  }
  if (query.before?.score !== undefined) { predicates.push('(score,i.time,i.id,i.kind)<(?,?,?,?)'); args.push(query.before.score, query.before.time, query.before.id, query.before.kind) }
  else if (query.before) { predicates.push('(i.time,i.id,i.kind)<(?,?,?)'); args.push(query.before.time, query.before.id, query.before.kind) }
  args.push(query.limit)
  return { sql: `${searchSelect(ranking.sql)} WHERE ${predicates.join(' AND ')} ORDER BY score DESC,i.time DESC,i.id DESC,i.kind DESC LIMIT ?`, args }
}

/** Public search clicks require visible scope; only internal authorized history reads may include a hidden chat. */
export function conversationSearchTargetSql(target: ConversationSearchSqlTarget) {
  return { sql: `${searchSelect()} WHERE ${target.includeHidden ? availableConversation : searchableConversationSql} AND i.kind=? AND i.id=? AND i.conversationId=? LIMIT 1`, args: [target.kind, target.id, target.conversationId] }
}

/** Before/default traverse newest first; after traverses oldest first to avoid skipping nearby rows. */
export function conversationMessagesSql(query: Pick<ConversationMessagePageQuery, 'conversationId' | 'before' | 'after'> & { limit: number }) {
  const predicates = ["m.collection='messages'", "json_extract(m.value,'$.id')=m.id", "json_extract(m.value,'$.conversationId')=?", "NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=c.id)"], args: (string | number)[] = [query.conversationId]
  if (query.before) { predicates.push("(json_extract(m.value,'$.sequence'),m.id)<(?,?)"); args.push(query.before.sequence, query.before.id) }
  if (query.after) { predicates.push("(json_extract(m.value,'$.sequence'),m.id)>(?,?)"); args.push(query.after.sequence, query.after.id) }
  args.push(query.limit)
  const direction = query.after ? 'ASC' : 'DESC'
  return { sql: `SELECT m.value AS source,completion.value AS completion FROM records m JOIN records c ON c.collection='conversations' AND c.id=json_extract(m.value,'$.conversationId') LEFT JOIN records clock ON clock.collection='conversationCompletionClocks' AND clock.id=c.id LEFT JOIN records completion ON completion.collection='conversationCompletions' AND completion.id=m.id AND json_extract(completion.value,'$.messageId')=m.id AND json_extract(completion.value,'$.conversationId')=c.id AND json_extract(completion.value,'$.epoch')=json_extract(clock.value,'$.epoch') WHERE ${predicates.join(' AND ')} ORDER BY json_extract(m.value,'$.sequence') ${direction},m.id ${direction} LIMIT ?`, args }
}

/** Called inside the read-state transaction; message start order never decides which completion is unread. */
export function firstUnreadCompletionSql(query: FirstUnreadCompletionSqlQuery) {
  if (!Number.isSafeInteger(query.epoch) || query.epoch < 1 || !Number.isSafeInteger(query.boundary) || query.boundary < 0 || !Array.isArray(query.sparseSeen) || query.sparseSeen.length > READING_LIMITS.sparseSeen || query.sparseSeen.some(ordinal => !Number.isSafeInteger(ordinal) || ordinal < 1)) throw new Error('未读边界和缺口须为当前周期的有界完成序号')
  const unseen = query.sparseSeen.length ? ` AND json_extract(completion.value,'$.ordinal') NOT IN (${query.sparseSeen.map(() => '?').join(',')})` : ''
  return { sql: `SELECT completion.value AS completion FROM records completion JOIN records c ON c.collection='conversations' AND c.id=json_extract(completion.value,'$.conversationId') JOIN records clock ON clock.collection='conversationCompletionClocks' AND clock.id=c.id AND json_extract(clock.value,'$.epoch')=json_extract(completion.value,'$.epoch') JOIN records m ON m.collection='messages' AND m.id=completion.id AND json_extract(m.value,'$.id')=m.id AND json_extract(completion.value,'$.messageId')=m.id AND json_extract(m.value,'$.conversationId')=c.id AND json_extract(m.value,'$.senderType')='agent' AND json_extract(m.value,'$.status')='completed' WHERE completion.collection='conversationCompletions' AND c.id=? AND json_extract(completion.value,'$.epoch')=? AND json_extract(completion.value,'$.ordinal')>?${unseen} AND NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=c.id) ORDER BY json_extract(completion.value,'$.ordinal') ASC,completion.id ASC LIMIT 1`, args: [query.conversationId, query.epoch, query.boundary, ...query.sparseSeen] }
}
