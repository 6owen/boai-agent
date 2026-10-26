/*
 * [INPUT]: 固定 records 表、类型化筛选/游标与明确来源关系。
 * [OUTPUT]: 四类当前事项在 LIMIT 前过滤、原成果真实文件名/作者搜索、稳定时间/ID 排序及清理/材料同授权时代读取版本门禁；只生成宿主固定 SELECT。
 * [OUTPUT]: 自动化汇总只选实际未答Work/Decision问题或缺记录的旧chat；已知task交付/已答问题不占据同轮最后消息位置，最终来源仍复核。
 * [POS]: D5 SQL 投影；不接受外部 SQL、不制造工作或终态。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { InboxQuery } from '@boai/shared/domain/inbox'

export interface InboxSqlRow { id: string; kind: string; sourceCollection: string; sourceId: string; time: string; conversation: string; agent: string | null; message: string | null; artifact: string | null; source: string }
const value = (path: string) => `json_extract(s.value, '$.${path}')`
function branch(collection: string, kind: string, predicate: string, fields: { id?: string; conversation?: string; agent?: string; message?: string; time?: string; summary?: string }) {
  return `SELECT '${kind}' AS kind, '${collection}' AS sourceCollection, s.id AS sourceId, ${fields.id ?? `'${kind}:${collection}:' || s.id`} AS id, ${fields.conversation ?? value('conversationId')} AS conversationId, ${fields.agent ?? 'NULL'} AS agentId, ${fields.message ?? 'NULL'} AS messageId, ${fields.time ?? value('createdAt')} AS time, ${fields.summary ?? value('reason')} AS summary, s.value AS source FROM records s WHERE s.collection='${collection}' AND (${predicate})`
}
const unanswered = `${value('userQuestion.id')} IS NOT NULL AND ${value('userQuestion.answeredMessageId')} IS NULL`
// A waiting turn can contain another employee's later delivery. Latest reply is not question identity.
const automationQuestionMessage = `(SELECT m.id FROM records m WHERE m.collection='messages'
  AND json_extract(m.value,'$.conversationId')=${value('conversationId')}
  AND json_extract(m.value,'$.status')='completed' AND json_extract(m.value,'$.senderType')='agent'
  AND json_extract(m.value,'$.turnId') IN (SELECT value FROM json_each(${value('waitingTurnIds')}))
  AND (EXISTS(SELECT 1 FROM records q WHERE json_extract(q.value,'$.userQuestion.messageId')=m.id
    AND json_extract(q.value,'$.userQuestion.id') IS NOT NULL AND json_extract(q.value,'$.userQuestion.answeredMessageId') IS NULL
    AND ((q.collection='workItems' AND json_extract(q.value,'$.ownerAgentId')=json_extract(m.value,'$.senderId') AND json_extract(q.value,'$.conversationId')=${value('conversationId')} AND json_extract(q.value,'$.origin.occurrenceId')=s.id)
      OR (q.collection='decisions' AND json_extract(q.value,'$.agentId')=json_extract(m.value,'$.senderId') AND json_extract(q.value,'$.turnId')=json_extract(m.value,'$.turnId') AND json_extract(q.value,'$.action')='ask' AND COALESCE(json_extract(q.value,'$.responseKind'),'chat')='chat')))
    OR (NOT EXISTS(SELECT 1 FROM records r WHERE r.collection='runs' AND r.id=json_extract(m.value,'$.runId') AND (json_extract(r.value,'$.responseKind')='task' OR json_extract(r.value,'$.workId') IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM records d WHERE d.collection='decisions' AND json_extract(d.value,'$.agentId')=json_extract(m.value,'$.senderId') AND json_extract(d.value,'$.turnId')=json_extract(m.value,'$.turnId') AND (json_extract(d.value,'$.action')<>'ask' OR json_extract(d.value,'$.responseKind')='task' OR json_extract(d.value,'$.userQuestion') IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM records w WHERE w.collection='workItems' AND json_extract(w.value,'$.conversationId')=${value('conversationId')} AND (json_extract(w.value,'$.userQuestion.messageId')=m.id OR EXISTS(SELECT 1 FROM json_each(json_extract(w.value,'$.resultMessageIds')) WHERE value=m.id)))
      AND NOT EXISTS(SELECT 1 FROM records a WHERE a.collection='messages' AND json_extract(a.value,'$.conversationId')=${value('conversationId')} AND json_extract(a.value,'$.status')='completed' AND json_extract(a.value,'$.senderType')='user' AND json_extract(a.value,'$.senderId')='user' AND json_extract(a.value,'$.origin.occurrenceId')=s.id AND json_extract(a.value,'$.inboxReply.questionMessageId')=m.id)))
  ORDER BY json_extract(m.value,'$.sequence') DESC,m.id DESC LIMIT 1)`
const sources = [
  branch('decisions', 'question', `${unanswered} AND ${value('action')}='ask' AND COALESCE(${value('responseKind')}, 'chat')='chat'`, { id: `'question:' || ${value('userQuestion.id')}`, conversation: `(SELECT json_extract(t.value,'$.conversationId') FROM records t WHERE t.collection='turns' AND t.id=${value('turnId')} AND json_extract(t.value,'$.origin') IS NULL)`, agent: value('agentId'), message: value('userQuestion.messageId'), summary: value('userQuestion.content') }),
  branch('workItems', 'question', `${unanswered} AND ${value('origin')} IS NULL`, { id: `'question:' || ${value('userQuestion.id')}`, agent: value('ownerAgentId'), message: value('userQuestion.messageId'), summary: value('userQuestion.content') }),
  branch('automationOccurrences', 'question', `${value('status')}='waiting_user' AND ${value('waitingTurnIds')} IS NOT NULL`, { id: `'question:occurrence:' || s.id`, time: value('startedAt'), message: automationQuestionMessage, summary: value('name') }),
  branch('approvals', 'approval', `EXISTS(SELECT 1 FROM records r WHERE r.collection='runs' AND r.id=${value('runId')} AND json_extract(r.value,'$.status')='waiting_approval')`, { id: `'approval:' || s.id`, agent: `(SELECT json_extract(r.value,'$.agentId') FROM records r WHERE r.collection='runs' AND r.id=${value('runId')})`, time: `(SELECT json_extract(r.value,'$.createdAt') FROM records r WHERE r.collection='runs' AND r.id=${value('runId')})`, summary: value('command') }),
  branch('workItems', 'failure', `${value('origin')} IS NULL AND ${value('status')} IN ('failed','interrupted','blocked')`, { id: `'failure:work:' || s.id`, agent: value('ownerAgentId'), message: value('sourceMessageId'), time: value('updatedAt'), summary: `COALESCE(${value('outcome.summary')},${value('deliverable')})` }),
  branch('turns', 'failure', `${value('origin')} IS NULL AND ${value('status')} IN ('failed','interrupted','budget_exhausted') AND NOT EXISTS(SELECT 1 FROM records w WHERE w.collection='workItems' AND json_extract(w.value,'$.conversationId')=${value('conversationId')} AND json_extract(w.value,'$.status') IN ('failed','interrupted','blocked') AND (w.id=${value('workId')} OR EXISTS(SELECT 1 FROM records r WHERE r.collection='runs' AND json_extract(r.value,'$.turnId')=s.id AND json_extract(r.value,'$.workId')=w.id)))`, { id: `'failure:turn:' || s.id`, message: value('triggerMessageId'), summary: `COALESCE(${value('reason')},'轮次中断，需核对原执行记录')` }),
  branch('automationOccurrences', 'failure', `${value('status')} IN ('failed','interrupted','needs_review') OR ${value('attentionReason')}='authorization' OR (${value('status')}='cancelled' AND ${value('cancellationCause')}='budget') OR (${value('status')}='completed' AND ${value('deliveryStatus')} IN ('blocked','partial'))`, { id: `'failure:occurrence:' || s.id`, time: value('startedAt'), message: value('messageId'), summary: `COALESCE(${value('reason')},${value('name')})` }),
  branch('artifactAcceptances', 'acceptance', `${value('status')} IN ('pending','unavailable')`, { id: `'acceptance:' || s.id`, agent: `(SELECT json_extract(a.value,'$.ownerAgentId') FROM records a WHERE a.collection='artifacts' AND a.id=${value('artifactId')})`, message: `(SELECT json_extract(a.value,'$.sourceMessageId') FROM records a WHERE a.collection='artifacts' AND a.id=${value('artifactId')})`, summary: `(SELECT json_extract(a.value,'$.name') FROM records a WHERE a.collection='artifacts' AND a.id=${value('artifactId')})` }),
].join('\nUNION ALL\n')
function validRefs(expression: string) {
  const expected = "json_extract(ref.value,'$.revision')", current = "json_extract(material.value,'$.revision')"
  // Match isMaterialReadRevisionValid before LIMIT; authorization changes reset the lower bound.
  const revision = `typeof(${expected}) IN ('integer','real') AND ${expected}=CAST(${expected} AS INTEGER) AND ${expected} BETWEEN ${-Number.MAX_SAFE_INTEGER} AND ${Number.MAX_SAFE_INTEGER} AND ${expected} BETWEEN COALESCE(json_extract(material.value,'$.readableRevisionFrom'),${current}) AND ${current}`
  return `NOT EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(${expression},'$.materialSources'),'[]')) ref WHERE NOT EXISTS(SELECT 1 FROM records material WHERE material.collection='materials' AND material.id=json_extract(ref.value,'$.id') AND json_extract(material.value,'$.conversationId')=json_extract(ref.value,'$.conversationId') AND json_extract(material.value,'$.status')='ready' AND json_extract(material.value,'$.messageId') IS NOT NULL AND ${revision} AND json_extract(material.value,'$.contentHash')=json_extract(ref.value,'$.contentHash') AND json_extract(material.value,'$.parseVersion')=json_extract(ref.value,'$.parseVersion')))`
}
/** All text and cursor values are bound parameters; callers cannot supply a query fragment. */
export function inboxSql(query: InboxQuery & { limit: number; id?: string }) {
  const predicates = ["NOT EXISTS(SELECT 1 FROM records cleanup WHERE cleanup.collection='conversationCleanup' AND cleanup.id=i.conversationId)", `(i.kind <> 'question' OR (m.id IS NOT NULL AND json_extract(m.value,'$.status')='completed'))`, `(i.kind='acceptance' OR (${validRefs('i.source')} AND (m.id IS NULL OR ${validRefs('m.value')})))`]
  const args: (string | number)[] = []
  if (query.id) { predicates.push('i.id=?'); args.push(query.id) }
  if (query.kind) { predicates.push('i.kind=?'); args.push(query.kind) }
  if (query.search?.trim()) { predicates.push("instr(lower(COALESCE(i.summary,'') || ' ' || json_extract(c.value,'$.title') || ' ' || COALESCE(json_extract(a.value,'$.name'),'')),lower(?))>0"); args.push(query.search.trim()) }
  if (query.before) { predicates.push('(i.time,i.id)<(?,?)'); args.push(query.before.time, query.before.id) }
  args.push(query.limit)
  return { sql: `WITH sources AS (${sources}) SELECT i.id,i.kind,i.sourceCollection,i.sourceId,i.time,c.value AS conversation,a.value AS agent,m.value AS message,f.value AS artifact,i.source FROM sources i JOIN records c ON c.collection='conversations' AND c.id=i.conversationId LEFT JOIN records a ON a.collection='agents' AND a.id=i.agentId LEFT JOIN records m ON m.collection='messages' AND m.id=i.messageId LEFT JOIN records f ON i.kind='acceptance' AND f.collection='artifacts' AND f.id=json_extract(i.source,'$.artifactId') WHERE ${predicates.join(' AND ')} ORDER BY i.time DESC,i.id DESC LIMIT ?`, args }
}
