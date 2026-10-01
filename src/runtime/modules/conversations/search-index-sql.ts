/*
 * [INPUT]: SQLite 权威已发送材料/已登记成果、可见会话、固定筛选及派生正文状态。
 * [OUTPUT]: 稳定有界待核读队列、限定同一来源快照的覆盖/失败统计；所有资格在 LIMIT 前检查，未发草稿与隐藏/清理内容不入队。
 * [POS]: R1 正文索引固定 SQL；队列只指向权威对象，不扫描目录或读取任意路径。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { SEARCH_INDEX_LIMITS, type ConversationSearchQuery } from '../../../shared/domain/reading'
import { conversationSearchSourcesSql, searchableConversationSql } from './reading-sql'

export interface SearchBodyCandidate { id: string; kind: 'material' | 'artifact'; conversationId: string; source: string; conversation: string }
export interface SearchBodyRecord { id: string; sourceId: string; kind: 'material' | 'artifact'; conversationId: string; sourceValue: string; formatVersion: number; status: 'pending' | 'indexed' | 'failed' | 'skipped'; text?: string; reason?: string; checkedAt: string }
export const SEARCH_INDEX_COLLECTION = 'conversationSearchBodies'
export const SEARCH_INDEX_CLOCK_COLLECTION = 'conversationSearchIndexClocks'
export const SEARCH_INDEX_CLOCK_ID = 'personal'

function sources(query: Pick<ConversationSearchQuery, 'scope' | 'conversationId' | 'agentId' | 'from' | 'to' | 'kinds'>) {
  const where = [searchableConversationSql, "i.kind IN ('material','artifact')"], args: (string | number)[] = []
  if (query.scope === 'current' || query.conversationId) { where.push('i.conversationId=?'); args.push(query.conversationId ?? '') }
  if (query.agentId) { where.push("((i.kind='material' AND EXISTS(SELECT 1 FROM json_each(json_extract(i.source,'$.authorizedAgentIds')) member WHERE member.value=?)) OR (i.kind='artifact' AND json_extract(i.source,'$.ownerAgentId')=?))"); args.push(query.agentId, query.agentId) }
  if (query.from) { where.push('i.time>=?'); args.push(query.from) }
  if (query.to) { where.push('i.time<=?'); args.push(query.to) }
  if (query.kinds) { const kinds = query.kinds.filter(kind => kind === 'material' || kind === 'artifact'); where.push(kinds.length ? `i.kind IN (${kinds.map(() => '?').join(',')})` : '0'); args.push(...kinds) }
  return { sql: `WITH sources AS (${conversationSearchSourcesSql}), qualified AS (SELECT i.*,c.value AS conversation,b.value AS bodyRecord,CASE WHEN json_extract(b.value,'$.sourceValue')=i.source AND json_extract(b.value,'$.formatVersion')=${SEARCH_INDEX_LIMITS.formatVersion} THEN json_extract(b.value,'$.status') ELSE 'pending' END AS indexStatus FROM sources i JOIN records c ON c.collection='conversations' AND c.id=i.conversationId LEFT JOIN records b ON b.collection='${SEARCH_INDEX_COLLECTION}' AND b.id=i.kind||':'||i.id WHERE ${where.join(' AND ')})`, args }
}

export function searchBodyCandidatesSql(query: ConversationSearchQuery, limit: number) {
  const qualified = sources(query)
  return { sql: `${qualified.sql} SELECT id,kind,conversationId,source,conversation FROM qualified WHERE indexStatus='pending' ORDER BY kind,id LIMIT ?`, args: [...qualified.args, limit] }
}
export function searchBodyCoverageSql(query: ConversationSearchQuery) {
  const qualified = sources(query)
  return { sql: `${qualified.sql} SELECT COUNT(*) AS total,COALESCE(SUM(indexStatus='indexed'),0) AS indexed,COALESCE(SUM(indexStatus='pending'),0) AS pending,COALESCE(SUM(indexStatus='failed'),0) AS failed,COALESCE(SUM(indexStatus='skipped'),0) AS skipped,(SELECT COALESCE(json_extract(value,'$.revision'),0) FROM records WHERE collection='${SEARCH_INDEX_CLOCK_COLLECTION}' AND id='${SEARCH_INDEX_CLOCK_ID}') AS revision FROM qualified`, args: qualified.args }
}
export function searchBodyFailuresSql(query: ConversationSearchQuery) {
  const qualified = sources(query)
  return { sql: `${qualified.sql} SELECT id,kind,json_extract(source,'$.name') AS name,json_extract(bodyRecord,'$.reason') AS reason FROM qualified WHERE indexStatus IN ('failed','skipped') ORDER BY kind,id LIMIT ?`, args: [...qualified.args, SEARCH_INDEX_LIMITS.failures] }
}
